import { createClient } from "@supabase/supabase-js";
import { eligibleResponders, incidentStatus, type SharedIncident, type TeamMember, type IncidentEvent } from "../src/incidents.ts";
import { parseScene } from "../src/scene.ts";
import { hazardGuidance } from "../src/hazardGuidance.ts";
import type { EvidenceSource } from "../src/copilot.ts";

export class ContextError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
export type CareContext = { sources: EvidenceSource[]; allowedAssignments: Record<string, string[]>; versions: Record<string, number>; scope: string; snapshotAt: string };
export function buildCareContext(incidents: SharedIncident[], members: TeamMember[], events: IncidentEvent[], actor: string, now: number, selected: boolean): CareContext {
  const sources: EvidenceSource[] = hazardGuidance.map(g => ({ ...g }));
  const me = members.find(m => m.user_id === actor);
  const candidates = eligibleResponders(members, incidents, now);
  const allowedAssignments: Record<string, string[]> = {};
  const versions: Record<string, number> = {};
  for (const i of incidents) {
    const scene = parseScene(i.observation.scene);
    versions[i.id] = i.version;
    const assignee = members.find(m => m.user_id === i.assigned_to)?.display_name ?? "Nobody assigned";
    sources.push({ id: `incident:${i.id}`, incidentId: i.id, title: `${i.room} · ${i.zone}`, text: JSON.stringify({
      room: i.room, area: i.zone, status: incidentStatus(i), observation: scene.brief, uncertainty: scene.uncertainty,
      followup: i.review_observation?.scene, closureRequested: !!i.closure_requested,
      supervisionSigned: !!i.supervision_checked_by, nursingSigned: !!i.nursing_checked_by,
      objects: scene.observations.map(o => ({ label: o.label, kind: o.kind, evidence: o.evidence })),
      analyzedAt: i.observation.analyzedAt, model: i.observation.model, route: i.route?.name ?? "Not assessed",
      routePriority: i.priority, assignee, escalationAt: i.escalated_at, dueAt: i.due_at, outcome: i.resolution || "Not recorded",
    }) });
    if (me?.role === "coordinator" && ["flagged", "dispatched"].includes(i.phase)) allowedAssignments[i.id] = candidates.map(m => m.user_id);
  }
  for (const m of members) sources.push({ id: `member:${m.user_id}`, title: m.display_name,
    text: JSON.stringify({ role: m.role, eligibleForEnvironmentalCheck: m.qualified, availableAsOfSnapshot: candidates.some(c => c.user_id === m.user_id), availableUntil: m.available_until, responseOrder: m.response_order }) });
  for (const e of events.filter(e => incidents.some(i => i.id === e.incident_id))) sources.push({ id: `event:${e.id}`, incidentId: e.incident_id, title: `${e.action} · ${e.created_at}`, text: e.detail.slice(0, 1200) });
  const scope = selected ? "Selected concern and its recent response events" : "Up to 100 open concerns and 200 latest response events; resolved concerns and full shift history are not included";
  sources.push({ id: "workspace:scope", title: "Workspace snapshot", text: `${scope}. ${incidents.length} concerns loaded. Phone/SMS delivery, resident tracking and live sensors are not connected. Availability is a short-lived indication, not an attendance guarantee.` });
  return { sources, allowedAssignments, versions, scope, snapshotAt: new Date(now).toISOString() };
}
export async function loadCareContext(request: Request, env: Record<string, string | undefined>, facilityId: string, incidentId: string, requestFetch: typeof fetch, now: number): Promise<CareContext> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization) || authorization.length > 10000) throw new ContextError(401, "Sign in to ask about your care-team records.");
  const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ContextError(503, "Care-team connection is not configured on the server.");
  // Public project key + caller JWT only. No service role and no client-supplied facts.
  const client = createClient(url, key, { global: { headers: { Authorization: authorization }, fetch: requestFetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const identity = await client.auth.getUser(authorization.slice(7));
  if (identity.error || !identity.data.user || identity.data.user.is_anonymous || !identity.data.user.email_confirmed_at) throw new ContextError(401, "Sign in with a confirmed care-team account.");
  const roster = await client.from("care_members").select("*").eq("facility_id", facilityId).limit(20);
  if (roster.error) throw new ContextError(503, "Could not read the care-team workspace.");
  const members = roster.data as TeamMember[];
  if (!members.some(m => m.user_id === identity.data.user.id)) throw new ContextError(403, "You do not have access to this workspace.");
  let query = client.from("care_incidents").select("*").eq("facility_id", facilityId);
  query = incidentId ? query.eq("id", incidentId) : query.neq("phase", "resolved");
  const records = await query.order("created_at", { ascending: false }).limit(100);
  if (records.error) throw new ContextError(503, "Could not read current concerns.");
  const incidents = records.data as SharedIncident[];
  if (incidentId && !incidents.length) throw new ContextError(404, "This concern is not available in your workspace.");
  const events = incidents.length ? await client.from("care_incident_events").select("*").eq("facility_id", facilityId).in("incident_id", incidents.map(i => i.id)).order("created_at", { ascending: false }).limit(200) : { data: [], error: null };
  if (events.error) throw new ContextError(503, "Could not read the response timeline.");
  return buildCareContext(incidents, members, events.data as IncidentEvent[], identity.data.user.id, now, !!incidentId);
}
