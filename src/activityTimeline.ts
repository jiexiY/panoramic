import { incidentStatus, type IncidentEvent, type SharedIncident } from "./incidents.ts";
import { routeLevels } from "./routeRisk.ts";
import { suiteRecords, type SuiteId } from "./suiteRecords.ts";
import type { TrackingRun } from "./suiteTracking.ts";
import type { Analysis } from "./scene.ts";

export type ActivityEntry = {
  id: string;
  room: SuiteId;
  zone: string;
  at: string;
  text: string;
  kind: "monitor" | "analysis" | "response";
};

// Timestamps describe real events/result receipt, not the current render time.
// Replay loops cannot fabricate fresh detections or duplicate settled results.
export function appendActivity(entries: ActivityEntry[], entry: ActivityEntry): ActivityEntry[] {
  if (!Number.isFinite(Date.parse(entry.at)) || entries.some(e => e.id === entry.id)) return entries;
  return [...entries, entry].slice(-200);
}

export function trackingActivity(run: TrackingRun, at: string): ActivityEntry {
  const hazards = run.scene.observations.filter(o => o.kind !== "object");
  return {
    id: `tracking:${run.source.stem}`, room: run.source.room,
    zone: run.source.zone === "bedroom" ? "Bedroom" : "Bathroom", at, kind: "monitor",
    text: `OpenCV result ready · ${run.frames} sample frames · ${run.minTracks}+ feature tracks. ${hazards.length ? `Marked regions for review: ${hazards.map(o => o.label).join(", ")}.` : "Fixture tracking only; no marked hazard in this sample. This is not a safety clearance."}`,
  };
}

export function analysisActivity(id: string, room: SuiteId, zone: string, analysis: Analysis): ActivityEntry {
  return {
    id: `analysis:${id}`, room, zone, at: analysis.analyzedAt, kind: "analysis",
    text: `Frame analyzed · ${analysis.scene.brief} ${analysis.scene.uncertainty}`,
  };
}

export function dashboardActivity(room: SuiteId, incidents: SharedIncident[], events: IncidentEvent[], local: ActivityEntry[]): ActivityEntry[] {
  const scoped = suiteRecords(room, incidents, events);
  const byId = new Map(scoped.incidents.map(i => [i.id, i]));
  const rows: ActivityEntry[] = [
    ...local.filter(e => e.room === room),
    ...scoped.incidents.map(i => ({
      id: `response:${i.id}`, room, zone: i.zone, at: i.updated_at, kind: "response" as const,
      text: `${incidentStatus(i)} · ${routeLevels[i.priority].label}. ${i.observation.scene.brief}${i.resolution ? ` Response: ${i.resolution}` : ""}`,
    })),
    ...scoped.events.map(e => ({
      id: `event:${e.id}`, room, zone: byId.get(e.incident_id)!.zone,
      at: e.created_at, text: e.detail.startsWith(`${byId.get(e.incident_id)!.zone} · `) ? e.detail.slice(byId.get(e.incident_id)!.zone.length + 3) : e.detail, kind: "response" as const,
    })),
  ];
  return rows.filter(e => Number.isFinite(Date.parse(e.at)))
    .filter((e, n, all) => all.findIndex(other => other.id === e.id) === n)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)
      || Number(b.id.startsWith("response:")) - Number(a.id.startsWith("response:"))
      || a.id.localeCompare(b.id));
}

export function activityTime(at: string): string {
  return Number.isFinite(Date.parse(at))
    ? new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : "Time unavailable";
}
