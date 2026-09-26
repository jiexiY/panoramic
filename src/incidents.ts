import { parseScene, type Analysis } from "./scene.ts";
import {
  highestRoutePriority,
  validRoute,
  type WalkingRoute,
  type RoutePriority,
} from "./routeRisk.ts";

export type Facility = { id: string; name: string; owner_id: string };
export type TeamMember = {
  facility_id: string;
  user_id: string;
  display_name: string;
  role: "coordinator" | "caregiver";
  qualified: boolean;
  available: boolean;
  available_until: string | null;
  response_order: number;
};
export type SharedIncident = {
  id: string;
  facility_id: string;
  created_by: string;
  room: string;
  zone: string;
  observation: Analysis;
  route: WalkingRoute | null;
  priority: RoutePriority;
  media_name: string;
  frame_time: number | null;
  evidence_path: string | null;
  phase: "flagged" | "dispatched" | "acknowledged" | "arrived" | "resolved";
  suggested_to: string | null;
  assigned_to: string | null;
  resolution: string;
  version: number;
  created_at: string;
  updated_at: string;
  due_at: string;
  escalated_at: string | null;
};
export type IncidentEvent = {
  id: string;
  incident_id: string;
  actor_id: string | null;
  action: string;
  detail: string;
  created_at: string;
};
export type PublishInput = {
  id: string;
  room: string;
  zone: string;
  analysis: Analysis;
  route: WalkingRoute | null;
  mediaName: string;
  frameTime: number | null;
};
export const rooms = ["A101", "A102", "A103", "A104"] as const;
export const zones = ["Bathroom", "Bedroom", "Living area"] as const;
export function publishPayload(facility: string, input: PublishInput) {
  const scene = parseScene(input.analysis.scene);
  if (!scene.observations.some((o) => o.kind !== "object"))
    throw new Error("No candidate hazard to send.");
  if (
    !rooms.includes(input.room as (typeof rooms)[number]) ||
    !zones.includes(input.zone as (typeof zones)[number])
  )
    throw new Error("Choose a room and area.");
  if (
    input.analysis.source !== "gemini" ||
    !input.analysis.model ||
    !Number.isFinite(Date.parse(input.analysis.analyzedAt))
  )
    throw new Error("Analysis provenance is missing.");
  if (input.route && !validRoute(input.route))
    throw new Error("Confirm a valid walking route.");
  return {
    facility_id: facility,
    id: input.id,
    room: input.room,
    zone: input.zone,
    observation: { ...input.analysis, scene },
    route: input.route,
    priority: highestRoutePriority(scene.observations, input.route),
    media_name: input.mediaName.slice(0, 150),
    frame_time: input.frameTime,
  };
}
export function memberAvailable(person: TeamMember, now = Date.now()) {
  return (
    person.qualified &&
    person.available &&
    !!person.available_until &&
    Date.parse(person.available_until) > now
  );
}
export function eligibleResponders(members: TeamMember[], incidents: SharedIncident[], now = Date.now()) {
  return members.filter(m => memberAvailable(m, now) && !incidents.some(i =>
    i.assigned_to === m.user_id && ["dispatched", "acknowledged", "arrived"].includes(i.phase)
  )).sort((a,b) => a.response_order - b.response_order || a.user_id.localeCompare(b.user_id));
}
export const phaseLabels: Record<SharedIncident["phase"], string> = {
  flagged: "Awaiting assignment", dispatched: "Awaiting acceptance", acknowledged: "Arrival pending",
  arrived: "Caregiver attending", resolved: "Response recorded",
};
export function handoffText(
  incident: SharedIncident,
  events: IncidentEvent[],
  members: TeamMember[],
) {
  const person = members.find((m) => m.user_id === incident.assigned_to);
  return [
    "PANORAMIC · RESPONSE RECORD",
    `Record: ${incident.id}`,
    `Location: ${incident.room} · ${incident.zone}`,
    `Status: ${incident.phase}`,
    `Source: ${incident.observation.source === "recording" ? "Annotated recording playback, not live model output" : `${incident.observation.model} output saved by a team member`}`,
    `Analyzed: ${incident.observation.analyzedAt}`,
    `Media: ${incident.media_name}${incident.frame_time !== null ? ` · frame ${incident.frame_time.toFixed(1)}s` : ""}`,
    "",
    "OBSERVATIONS",
    incident.observation.scene.brief,
    ...incident.observation.scene.observations.map(
      (o) => `${o.label}: ${o.evidence}`,
    ),
    `Uncertainty: ${incident.observation.scene.uncertainty}`,
    `Route: ${incident.route?.name ?? "Not assessed"} · ${incident.priority}`,
    "",
    "RESPONSE",
    `Assigned: ${person?.display_name ?? "Not assigned"}`,
    ...events
      .filter((e) => e.incident_id === incident.id)
      .map((e) => `${e.created_at} · ${e.detail}`),
    "",
    `Outcome: ${incident.resolution || "Not recorded"}`,
  ].join("\n");
}
