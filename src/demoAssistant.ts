import { eligibleResponders, incidentStatus, type SharedIncident, type IncidentEvent, type TeamMember } from "./incidents.ts";
import { isSuiteId, type SuiteId } from "./suiteRecords.ts";
import type { EvidenceSource } from "./copilot.ts";

type DemoRecord = {
  id: string; room: SuiteId; zone: string; version: number; summary: string;
  events: { at: string; detail: string }[];
};
export type DemoSnapshot = {
  room: SuiteId; records: DemoRecord[];
  responders: { name: string; available: boolean }[];
};

// Explicit allowlist: no photos, filenames, user IDs, JWTs, or other-suite records.
export function buildDemoSnapshot(room: SuiteId, incidents: SharedIncident[], events: IncidentEvent[], members: TeamMember[], now: number, selectedId = ""): DemoSnapshot {
  const available = eligibleResponders(members, incidents, now);
  return {
    room,
    records: incidents.filter(i => i.facility_id === "recording-playback" && i.room === room && (!selectedId || i.id === selectedId)).slice(0, 10).map(i => ({
      id: i.id, room, zone: i.zone, version: i.version,
      summary: JSON.stringify({ status: incidentStatus(i), brief: i.observation.scene.brief,
        uncertainty: i.observation.scene.uncertainty, priority: i.priority,
        assignee: members.find(m => m.user_id === i.assigned_to)?.display_name ?? "Nobody assigned",
        outcome: i.resolution || "Not recorded", followup: i.review_observation?.scene.brief ?? "Not recorded",
        supervisionSigned: !!i.supervision_checked_by, nursingSigned: !!i.nursing_checked_by,
      }).slice(0, 6000),
      events: events.filter(e => e.incident_id === i.id).slice(-12).map(e => ({ at: e.created_at, detail: e.detail.slice(0, 1200) })),
    })),
    responders: members.slice(0, 10).map(m => ({ name: m.display_name.slice(0, 80), available: available.some(a => a.user_id === m.user_id) })),
  };
}

export class DemoContextError extends Error { status = 400; }
const invalid = (): never => { throw new DemoContextError("Invalid demo snapshot. Refresh the selected suite and try again."); };
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : invalid();
const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max ? v : invalid();

// This is browser-reported synthetic data, NEVER authenticated care records.
// Validate scope again on the server and rebuild evidence IDs ourselves.
export function demoCareContext(value: unknown, room: SuiteId, now: number) {
  const snapshot = object(value);
  if (!isSuiteId(room) || snapshot.room !== room || !Array.isArray(snapshot.records) || snapshot.records.length > 10 || !Array.isArray(snapshot.responders) || snapshot.responders.length > 10) invalid();
  const sources: EvidenceSource[] = [];
  const versions: Record<string, number> = {};
  for (const raw of snapshot.records as unknown[]) {
    const record = object(raw);
    const id = text(record.id, 100);
    const zone = text(record.zone, 30);
    const allowedId = id === `${room.toLowerCase()}-${zone.toLowerCase()}-tracking-demo` || (room === "A101" && zone === "Bathroom" && /^bathroom-recording-\d+$/.test(id));
    if (record.room !== room || !["Bedroom", "Bathroom"].includes(zone) || !allowedId || Object.hasOwn(versions, id) || !Number.isSafeInteger(record.version) || (record.version as number) < 0) invalid();
    versions[id] = record.version as number;
    sources.push({ id: `incident:${id}`, incidentId: id, title: `${room} · ${zone} · demo snapshot`, text: text(record.summary, 6000) });
    if (!Array.isArray(record.events) || record.events.length > 12) invalid();
    (record.events as unknown[]).forEach((rawEvent, n) => {
      const event = object(rawEvent);
      const at = text(event.at, 40);
      if (!Number.isFinite(Date.parse(at))) invalid();
      sources.push({ id: `event:${id}:${n}`, incidentId: id, title: `${zone} · ${at}`, text: text(event.detail, 1200) });
    });
  }
  (snapshot.responders as unknown[]).forEach((raw, n) => {
    const responder = object(raw);
    if (typeof responder.available !== "boolean") invalid();
    sources.push({ id: `responder:${n}`, title: text(responder.name, 80), text: `Demo roster availability: ${responder.available ? "available" : "unavailable"}. Not a verified attendance or clinical qualification.` });
  });
  const scope = `Suite ${room} only. Browser-reported synthetic demo snapshot; not authenticated care records or a live camera.`;
  sources.push({ id: "workspace:scope", title: "Demo scope", text: `${scope} ${Object.keys(versions).length} concerns included. Missing records do not establish safety. OpenCV tracks manually marked regions in simulated camera motion. Chat cannot assign, notify, change records, or certify safety. Supervisor approval remains separate.` });
  return { sources, versions, allowedAssignments: {} as Record<string, string[]>, scope, snapshotAt: new Date(now).toISOString() };
}
