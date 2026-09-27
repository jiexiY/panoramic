import { eligibleResponders, handoffText, incidentStatus, noHazardVisible, type SharedIncident, type TeamMember, type IncidentEvent } from "./incidents.ts";
import { suiteRecords, type SuiteId } from "./suiteRecords.ts";

export function proposedResponder(incident: SharedIncident, members: TeamMember[], allIncidents: SharedIncident[], now: number) {
  if (incident.phase !== "flagged") return null;
  const available = eligibleResponders(members, allIncidents, now);
  return available.find(m => m.user_id === incident.suggested_to) ?? available[0] ?? null;
}

export function suiteReport(room: SuiteId, allIncidents: SharedIncident[], allEvents: IncidentEvent[], members: TeamMember[]): string {
  const records = suiteRecords(room, allIncidents, allEvents);
  return [`PANORAMIC · SUITE ${room} REPORT`, `${records.open.length} open concern(s); ${records.incidents.length} response record(s).`,
    "Visual observations are not a physical safety certification. Assignments and station sign-offs are recorded separately.",
    ...records.incidents.map(i => handoffText(i, records.events.filter(e => e.incident_id === i.id), members)),
    ...(!records.incidents.length ? ["No response records for this suite. Missing source data does not mean the suite is safe."] : [])].join("\n\n");
}

// Browser-only recorded-demo answers. No model call and no command/write capability.
export function recordedSuiteReply(room: SuiteId, incidents: SharedIncident[], events: IncidentEvent[], members: TeamMember[], now: number, question: string): string {
  const records = suiteRecords(room, incidents, events);
  const current = records.open[0] ?? records.incidents[0];
  if (!current) return `Suite ${room} has no response records. No safety conclusion can be made without a connected source.`;
  if (/who|assign|caregiver|nurse|available/i.test(question)) {
    if (current.assigned_to) return `${members.find(m => m.user_id === current.assigned_to)?.display_name ?? "The recorded responder"} is assigned. Status: ${incidentStatus(current)}. Assignment is not confirmation of arrival.`;
    const person = proposedResponder(current, members, incidents, now);
    return person ? `Proposed responder: ${person.display_name}, based on availability, qualification flag, and response order—not clinical triage or measured distance. Open Station response to review and approve. I have not assigned anyone.` : "No eligible responder is currently available. Supervision must arrange coverage. I have not assigned anyone.";
  }
  if (/safe|clear|close|check/i.test(question)) return current.phase === "resolved"
    ? "This response was closed after the recorded supervision and nursing sign-offs. That record is not a guarantee about the room's current condition."
    : `${noHazardVisible(current) ? "No marked hazard is visible in the follow-up frame." : "A clear follow-up frame is still required."} The response remains open until the caregiver records an outcome and both stations sign off.`;
  return `Suite ${room}: ${records.open.length} open concern(s). ${current.observation.scene.brief} Status: ${incidentStatus(current)}. Latest recorded activity: ${records.events.at(-1)?.detail ?? "None"} This is a recorded-demo summary; I can summarize status, proposed responders, and sign-off requirements, but cannot act through chat.`;
}
