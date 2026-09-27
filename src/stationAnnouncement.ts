import { isSuiteId, type SuiteId } from "./suiteRecords.ts";
import type { RoutePriority } from "./routeRisk.ts";
import { noHazardVisible, type SharedIncident, type IncidentEvent } from "./incidents.ts";

export type AnnouncementPriority = Exclude<RoutePriority, "object">;
export function isAnnouncementPriority(value: unknown): value is AnnouncementPriority {
  return typeof value === "string" && ["unassessed", "away", "near", "crossing"].includes(value);
}

export const announcementUpdates = ["monitoring", "alert", "detected", "assessed", "requested", "assigned", "acknowledged", "arrived", "followup_clear", "followup_unknown", "followup_hazard", "closure_requested", "supervision_checked", "closed", "response_recorded", "declined", "escalated", "recorded"] as const;
export type AnnouncementUpdate = typeof announcementUpdates[number];
export type AnnouncementZone = "Bathroom" | "Bedroom" | "Living area";
export type StationAnnouncement = { room: SuiteId; priority: AnnouncementPriority; update?: AnnouncementUpdate; zone?: AnnouncementZone };
export type VoiceMessage = { key: string; announcement: StationAnnouncement };
export function isAnnouncementUpdate(value: unknown): value is AnnouncementUpdate {
  return typeof value === "string" && (announcementUpdates as readonly string[]).includes(value);
}
export function isAnnouncementZone(value: unknown): value is AnnouncementZone {
  return typeof value === "string" && ["Bathroom", "Bedroom", "Living area"].includes(value);
}
// Both the server and local relay use the same strict, backwards-compatible contract.
export function parseAnnouncementRequest(value: unknown): (StationAnnouncement & { nonSensitiveConfirmed: true }) | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.nonSensitiveConfirmed !== true || !isSuiteId(v.room) || !isAnnouncementPriority(v.priority)
    || ("update" in v && !isAnnouncementUpdate(v.update)) || ("zone" in v && !isAnnouncementZone(v.zone))
    || Object.keys(v).some(k => !["room", "priority", "update", "zone", "nonSensitiveConfirmed"].includes(k))) return null;
  return { room: v.room, priority: v.priority, nonSensitiveConfirmed: true,
    ...("update" in v ? { update: v.update as AnnouncementUpdate } : {}), ...("zone" in v ? { zone: v.zone as AnnouncementZone } : {}) };
}

export function incidentVoiceMessage(room: SuiteId, incident: SharedIncident): VoiceMessage | null {
  if (incident.room !== room || !isAnnouncementPriority(incident.priority) || !isAnnouncementZone(incident.zone)) return null;
  const update: AnnouncementUpdate = incident.phase === "resolved"
    ? (incident.supervision_checked_by && incident.nursing_checked_by ? "closed" : "response_recorded")
    : incident.supervision_checked_by ? "supervision_checked"
    : incident.closure_requested ? "closure_requested"
    : noHazardVisible(incident) ? "followup_clear"
    : ({ flagged: "alert", dispatched: "assigned", acknowledged: "acknowledged", arrived: "arrived" } as const)[incident.phase];
  return { key: `current:${incident.id}:${incident.version}`, announcement: { room, zone: incident.zone, priority: incident.priority, update } };
}

export function eventVoiceMessage(room: SuiteId, event: IncidentEvent, incidents: SharedIncident[]): VoiceMessage | null {
  const incident = incidents.find(i => i.id === event.incident_id && i.room === room);
  if (!incident || !isAnnouncementZone(incident.zone)) return null;
  const updates: Record<string, AnnouncementUpdate> = { detected: "detected", assessed: "assessed", flagged: "requested", station_request: "requested",
    dispatch: "assigned", acknowledge: "acknowledged", arrive: "arrived", resolve: "closure_requested", decline: "declined",
    monitor_clear: "followup_clear", monitor_unknown: "followup_unknown", monitor_hazard: "followup_hazard",
    supervision_check: "supervision_checked", nursing_check: "closed", escalate: "escalated" };
  // Historical events do not carry a route-level snapshot. Never borrow today's level or private event detail.
  return { key: `event:${event.id}`, announcement: { room, zone: incident.zone, priority: "unassessed", update: Object.hasOwn(updates, event.action) ? updates[event.action] : "recorded" } };
}

// Fixed templates only. Never send resident names, images, free text, or care notes to TTS.
export function stationAnnouncement(room: SuiteId, priority: AnnouncementPriority, update: AnnouncementUpdate = "alert", zone?: AnnouncementZone): string {
  if (!isSuiteId(room) || !isAnnouncementPriority(priority) || !isAnnouncementUpdate(update) || (zone !== undefined && !isAnnouncementZone(zone))) throw new Error("Invalid station announcement.");
  const level = { unassessed: "Route level has not been assessed.", away: "Level one, outside the marked route.", near: "Level two, near the marked route.", crossing: "Level three, crossing the marked route." }[priority];
  const location = `suite ${room}${zone ? `, ${zone.toLowerCase()}` : ""}`;
  if (update === "alert") return `Panoramic to supervision station. Possible environmental hazard in ${location}. ${level} Please review the suite report and approve a proposed caregiver or nurse assignment. No responder has been assigned automatically.`;
  const messages: Record<Exclude<AnnouncementUpdate, "alert">, string> = {
    monitoring: "Floor monitoring is enabled. No response record is available for this suite. Missing observations do not mean the room is safe; check source availability on the Dashboard.",
    detected: "A candidate hazard observation was recorded. Review the evidence and route assessment; this is not a safety certification.",
    assessed: "A route assessment was recorded. Review the activity details for the measured level and supporting evidence.",
    requested: "A supervision review request was recorded. Check the current response status before approving an assignment.",
    assigned: "Supervision recorded a responder assignment. Acceptance and physical arrival are separate steps.",
    acknowledged: "The assigned responder recorded acceptance. Physical arrival must be confirmed separately.",
    arrived: "The assigned responder recorded arrival. An outcome, follow-up evidence and station sign-offs are still required.",
    followup_clear: "No marked hazard was visible in a follow-up frame. This does not certify safety. Check the response record for physical checks and station sign-offs.",
    followup_unknown: "A monitoring source became unavailable. No safety conclusion can be made; review the response record.",
    followup_hazard: "A candidate hazard was observed again. Previous safety sign-offs require review. Check the current response record.",
    closure_requested: "A responder outcome was recorded and closure was requested. Review follow-up evidence and both station sign-offs before closing the response.",
    supervision_checked: "The supervision safety check was recorded. Review the response record for the independent nursing sign-off.",
    closed: "Both station sign-offs were recorded and this response was closed. Floor monitoring remains enabled. This is not a guarantee of the room's current condition.",
    response_recorded: "A response outcome was recorded. Review the record for the required follow-up evidence and station sign-offs.",
    declined: "A responder declined the assignment. Supervision must review current availability and arrange coverage.",
    escalated: "This response was escalated for supervision attention. Review the current response and arrange support.",
    recorded: "A response update was recorded. Review the written activity details and current status.",
  };
  return `Panoramic to supervision station. Update for ${location}. ${messages[update]}`;
}
