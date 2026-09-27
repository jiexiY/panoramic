import type { IncidentEvent, SharedIncident } from "./incidents";

export const suiteIds = ["A101", "A102", "A103", "A104"] as const;
export type SuiteId = typeof suiteIds[number];
export const isSuiteId = (value: unknown): value is SuiteId => typeof value === "string" && suiteIds.some(id => id === value);

// Scope before selecting a default concern or trimming the activity timeline.
export function suiteRecords(room: SuiteId, incidents: SharedIncident[], events: IncidentEvent[]) {
  const records = incidents.filter(i => i.room === room);
  const ids = new Set(records.map(i => i.id));
  return {
    incidents: records,
    open: records.filter(i => i.phase !== "resolved"),
    events: events.filter(e => ids.has(e.incident_id))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)),
  };
}
