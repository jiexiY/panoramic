import type { PlaybackState } from "./playback.ts";
import { eligibleResponders, type SharedIncident, type IncidentEvent } from "./incidents.ts";
import { highestRoutePriority, routeLevels, validRoute, type WalkingRoute } from "./routeRisk.ts";
import { parseScene, type Scene } from "./scene.ts";
import { monitoringImage, type MonitorZone } from "./monitoringImages.ts";
import { stationAnnouncement } from "./stationAnnouncement.ts";

export type TrackingSource = { room: "A101" | "A102" | "A103" | "A104"; zone: MonitorZone; stem: string; heading?: string; description?: string; regions: readonly (readonly [string, "object" | "possible_trip"])[] };
export const trackingSources: readonly TrackingSource[] = [
  { room: "A102", zone: "bedroom", stem: "a102-bedroom-tracking", regions: [["Bed", "object"], ["Wheeled basket", "possible_trip"]] },
  { room: "A102", zone: "bathroom", stem: "a102-bathroom-tracking", regions: [["Toilet", "object"], ["Sink", "object"], ["Shower fixture", "object"]] },
  { room: "A103", zone: "bedroom", stem: "a103-bedroom-tracking", regions: [["Bed", "object"], ["Cabinet", "object"], ["Curled rug", "possible_trip"]] },
  { room: "A103", zone: "bathroom", stem: "a103-bathroom-tracking", regions: [["Toilet", "object"], ["Sink", "object"], ["Floor towel", "possible_trip"]] },
  { room: "A104", zone: "bedroom", stem: "a104-bedroom-tracking", regions: [["Bed", "object"], ["Chair", "object"], ["Bedside cabinet", "object"]] },
  { room: "A101", zone: "bedroom", stem: "a101-bedroom-tracking", heading: "BEDROOM · OVERBED TABLE TRACKING", description: "A101 bedroom: a wheeled overbed table stands beside the bed-to-bathroom approach. OpenCV tracks the manually marked bed, chair and table regions in this Google Studio-generated scene.", regions: [["Bed", "object"], ["Chair", "object"], ["Wheeled overbed table", "possible_trip"]] },
  { room: "A104", zone: "bathroom", stem: "a104-bathroom-tracking", heading: "OPENCV · DRY BATHROOM FIXTURES", description: "A104 bathroom: toilet, sink, shower seat and shower fixture with measured OpenCV feature points and stable region IDs. Tracking builds from the original dry scene; no water overlay or leak animation. Fixture labels are manually marked, not automatically recognized.", regions: [["Toilet", "object"], ["Sink", "object"], ["Shower seat", "object"], ["Shower fixture", "object"]] },
];
export const trackingSource = (room: string, zone: MonitorZone) => trackingSources.find(s => s.room === room && s.zone === zone);
export type TrackingRun = { source: TrackingSource; scene: Scene; route: WalkingRoute; width: number; height: number; frames: number; fps: number; resultDelayMs: number; minTracks: number; maxError: number; regions: { id: string; label: string; support: number }[]; gif: string; poster: string; reference: string };
export const trackingStages = [
  {name:"clean",start:0,end:10}, {name:"features",start:10,end:30},
  {name:"regions",start:30,end:60}, {name:"route",start:60,end:90}, {name:"settled",start:90,end:120},
] as const;

// Only configured, room/zone-bound offline measurements can enter this adapter.
// Missing/invalid tracks mean unknown, never clear or safe.
export function parseTrackingRun(value: unknown, source: TrackingSource): TrackingRun {
  const v = value as Record<string, any>;
  const invalid = () => { throw new Error("Invalid suite tracking measurements."); };
  const image = monitoringImage(source.room, source.zone)!;
  const imageHeight = Math.round(960 * image.height / image.width);
  if (!v || v.version !== 2 || v.suite !== source.room || v.zone !== (source.zone === "bedroom" ? "Bedroom" : "Bathroom") || v.source !== image.src || !/^[a-f0-9]{64}$/.test(v.source_sha256) || v.width !== 960 || v.image_height !== imageHeight || v.height !== imageHeight + 90 || v.frames !== 120 || v.fps !== 10 || !Array.isArray(v.measurements) || v.measurements.length !== v.frames) invalid();
  if (v.cycle?.loop !== true || v.cycle.result_frame !== 90 || !Array.isArray(v.cycle.stages) || v.cycle.stages.length !== trackingStages.length || trackingStages.some((s,n) => !v.cycle.stages[n] || Object.entries(s).some(([key,value]) => v.cycle.stages[n][key] !== value))) invalid();
  for (const [key, suffix] of [["gif", ".gif"], ["poster", "-poster.jpg"], ["reference", "-reference.jpg"]]) if (v[key] !== `/demo/${source.stem}${suffix}`) invalid();
  let scene!: Scene, route!: WalkingRoute;
  const counts: number[] = [], errors: number[] = [];
  for (const [index, frame] of v.measurements.entries()) {
    if (frame?.stage !== trackingStages.find(s => index >= s.start && index < s.end)?.name) invalid();
    if (!frame || frame.frame !== index || !Number.isInteger(frame.feature_count) || frame.feature_count < 30 || frame.feature_count > 220 || !Number.isFinite(frame.median_fit_error_px) || frame.median_fit_error_px < 0 || frame.median_fit_error_px > .8 || !Array.isArray(frame.features) || frame.features.length !== frame.feature_count || !Array.isArray(frame.regions) || frame.regions.length !== source.regions.length || !Array.isArray(frame.route)) invalid();
    const ids = new Set<number>();
    for (const p of frame.features) {
      if (!Array.isArray(p) || p.length !== 3 || !Number.isInteger(p[0]) || p[0] < 0 || p[0] >= 220 || ids.has(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2]) || p[1] < 0 || p[1] > v.width || p[2] < 0 || p[2] > imageHeight) invalid();
      ids.add(p[0]);
    }
    for (const [n, region] of frame.regions.entries()) {
      const [label, kind] = source.regions[n];
      if (!region || region.id !== `${source.stem}-r${n + 1}` || region.label !== label || region.kind !== kind || !Number.isInteger(region.support) || region.support < 3 || region.support > frame.feature_count) invalid();
    }
    scene = parseScene({ observations: frame.regions.map((r: any) => ({ box: r.box, label: r.label, kind: r.kind, evidence: `Human-marked region ${r.id}; ${r.support} measured optical-flow features support its camera transform. Object identity and hazard type are not inferred by OpenCV.` })), brief: v.brief,
      uncertainty: "Offline OpenCV tracking on simulated camera motion from a still. Labels, hazard regions and route are human-marked. No independent object movement, live camera, material classification or safety clearance is established." });
    route = { name: `${source.room} ${source.zone} human-marked demo route`, source: "recording", margin: 40, points: frame.route.map((p: number[]) => ({ x: p?.[0], y: p?.[1] })) };
    if (!validRoute(route)) invalid();
    counts.push(frame.feature_count); errors.push(frame.median_fit_error_px);
  }
  return { source, scene, route, width: v.width, height: v.height, frames: v.frames, fps: v.fps, resultDelayMs: v.cycle.result_frame / v.fps * 1000, minTracks: Math.min(...counts), maxError: Math.max(...errors), regions: v.measurements.at(-1).regions.map((r: any) => ({ id: r.id, label: r.label, support: r.support })), gif: v.gif, poster: v.poster, reference: v.reference };
}

export function playbackTracking(state: PlaybackState, run: TrackingRun, now: number): PlaybackState {
  const priority = highestRoutePriority(run.scene.observations, run.route);
  if (priority === "unassessed" || priority === "object") return state;
  const id = `${run.source.stem}-demo`;
  // One local record per suite AND zone. Replaying/reloading cannot reopen a
  // resolved record, duplicate requests or overwrite another zone's evidence.
  if (state.incidents.some(i => i.id === id)) return state;
  const at = new Date(now).toISOString();
  const suggested = eligibleResponders(state.members, state.incidents, now)[0];
  const incident: SharedIncident = {
    id, facility_id: "recording-playback", created_by: "supervisor", room: run.source.room, zone: run.source.zone === "bedroom" ? "Bedroom" : "Bathroom",
    observation: { source: "recording", model: "OpenCV LK tracking / human-marked synthetic demo", analyzedAt: at, scene: run.scene },
    route: run.route, priority, media_name: `${run.source.stem}.gif`, frame_time: (run.frames - 1) / run.fps, evidence_path: null,
    phase: "flagged", suggested_to: suggested?.user_id ?? null, assigned_to: null, resolution: "", version: 0, created_at: at, updated_at: at,
    due_at: new Date(now + 120000).toISOString(), escalated_at: null,
  };
  const events: IncidentEvent[] = [
    { id: `${id}-tracked`, incident_id: id, actor_id: null, action: "detected", detail: `OpenCV · ${incident.room} ${incident.zone}: ${run.frames} synthetic frames, at least ${run.minTracks} measured feature tracks. Human-marked candidate hazard tracked; no automatic object recognition.`, created_at: at },
    { id: `${id}-assessed`, incident_id: id, actor_id: null, action: "assessed", detail: `Route assessment · ${routeLevels[priority].label}. Based on the tracked region and human-marked route. Staff inspection required.`, created_at: at },
    { id: `${id}-station`, incident_id: id, actor_id: null, action: "station_request", detail: `${incident.zone} · ${stationAnnouncement(run.source.room, priority)}`, created_at: at },
  ];
  return { ...state, incidents: [incident, ...state.incidents], events: [...state.events, ...events] };
}

export function trackingReference(room: string, zone: string, media: string): string {
  const source = trackingSources.find(s => s.room === room && s.zone === zone.toLowerCase() && media === `${s.stem}.gif`);
  return source ? `/demo/${source.stem}-reference.jpg` : "";
}
