import type { PlaybackState } from "./playback.ts";
import { eligibleResponders, type SharedIncident, type IncidentEvent } from "./incidents.ts";
import { routeLevels, type RoutePriority, type WalkingRoute, validRoute } from "./routeRisk.ts";
import { parseScene, type Detection, type Scene } from "./scene.ts";
import { stationAnnouncement } from "./stationAnnouncement.ts";

export type LeakStep = { step: number; at_ms: number; duration_ms: number; image: string; priority: RoutePriority; changed_pixels: number; route_overlap_pixels: number; boxes: Detection["box"][]; tracking: { feature_count: number; median_fit_error_px: number; features: number[][] } };
export type LeakSequence = { suite: "A104"; width: number; height: number; route: WalkingRoute; steps: LeakStep[] };

export function parseLeakSequence(value: unknown): LeakSequence {
  const v = value as Record<string, any>;
  if (!v || v.version !== 1 || v.suite !== "A104" || v.zone !== "Bathroom" || v.width !== 1040 || v.height !== 664 || !Array.isArray(v.steps) || v.steps.length !== 4 || !Array.isArray(v.route)) throw new Error("Invalid leak demo measurements.");
  const route: WalkingRoute = { name: "A104 bathroom approach (human-marked demo route)", source: "recording", margin: 40, points: v.route.map((p: number[]) => ({ x: Math.round(p[0] * 1000), y: Math.round(p[1] * 1000) })) };
  if (!validRoute(route)) throw new Error("Invalid leak demo route.");
  const steps = v.steps.map((s: LeakStep, index: number) => {
    if (s.step !== index || s.at_ms !== index * 2000 || s.duration_ms !== (index === 3 ? 4000 : 2000) || s.image !== `/demo/a104-leak-step-${index}.jpg` || !["unassessed", "away", "near", "crossing"].includes(s.priority) || !Number.isInteger(s.changed_pixels) || s.changed_pixels < 0 || s.changed_pixels > 1040 * 580 || !Number.isInteger(s.route_overlap_pixels) || s.route_overlap_pixels < 0 || s.route_overlap_pixels > s.changed_pixels || !Array.isArray(s.boxes)) throw new Error("Invalid leak demo step.");
    if ((s.priority === "crossing") !== (s.route_overlap_pixels > 0) || (s.priority === "unassessed") !== (s.changed_pixels === 0) || (s.boxes.length === 0) !== (s.changed_pixels === 0)) throw new Error("Inconsistent leak demo evidence.");
    const t = s.tracking;
    if (!t || !Number.isInteger(t.feature_count) || t.feature_count < 30 || t.feature_count > 180 || !Number.isFinite(t.median_fit_error_px) || t.median_fit_error_px < 0 || t.median_fit_error_px > .8 || !Array.isArray(t.features) || t.features.length !== t.feature_count || new Set(t.features.map(p => p[0])).size !== t.feature_count || t.features.some(p => !Array.isArray(p) || p.length !== 3 || !Number.isInteger(p[0]) || p[0] < 0 || p[0] >= 180 || !Number.isFinite(p[1]) || !Number.isFinite(p[2]) || p[1] < 0 || p[1] > 1040 || p[2] < 0 || p[2] > 580)) throw new Error("Invalid leak tracking evidence.");
    const scene = parseScene({ observations: s.boxes.map(box => ({ box, kind: "possible_spill", label: "Changed floor region", evidence: "Measured floor appearance change in a staged leak sequence; material not classified." })), brief: "Synthetic leak sequence.", uncertainty: "Not a live camera feed." });
    return { ...s, boxes: scene.observations.map(o => o.box) };
  });
  return { suite: "A104", width: v.width, height: v.height, route, steps };
}

export function leakScene(step: LeakStep): Scene {
  return parseScene({
    observations: step.boxes.map(box => ({ box, kind: "possible_spill", label: "Changed floor region", evidence: `OpenCV measured ${step.changed_pixels} changed floor pixels and ${step.route_overlap_pixels} route-overlap pixels. The water-leak scenario is authored; material is not classified.` })),
    brief: "Review the changing floor area in the A104 bathroom before the resident uses the marked route. Possible spill in a synthetic Google Studio sequence.",
    uncertainty: "Offline OpenCV appearance-change measurements on four AI-generated stills, not live footage or a water classifier. Floor area and route are human-marked; generated reflections can also trigger change. Physical inspection is required.",
  });
}

// One demo incident per sequence; replay never clears or recreates it. These
// browser-local records cannot be published as real care-team observations.
export function playbackLeakStep(state: PlaybackState, sequence: LeakSequence, index: number, now: number): PlaybackState {
  const step = sequence.steps[index];
  if (!step || step.priority === "unassessed" || !step.boxes.length) return state;
  const id = "a104-leak-demo", eventId = `${id}-step-${index}`;
  const original = state.incidents.find(i => i.id === id);
  if (original?.phase === "resolved" || state.events.some(e => e.id === eventId)) return state;
  if (original && (original.frame_time ?? 0) >= step.at_ms / 1000) return state;
  const at = new Date(now).toISOString();
  const observation = { source: "recording" as const, model: "OpenCV floor-change processing / Google Studio synthetic steps", analyzedAt: at, scene: leakScene(step) };
  const suggested = eligibleResponders(state.members, state.incidents, now)[0];
  const incident: SharedIncident = original ? { ...original, observation, priority: step.priority, frame_time: step.at_ms / 1000, updated_at: at, version: original.version + 1, review_observation: null, supervision_checked_by: null, nursing_checked_by: null, closure_requested: false } : {
    id, facility_id: "recording-playback", created_by: "supervisor", room: "A104", zone: "Bathroom", observation, route: sequence.route, priority: step.priority,
    media_name: "a104-water-leak-opencv.gif", frame_time: step.at_ms / 1000, evidence_path: null, phase: "flagged", suggested_to: suggested?.user_id ?? null, assigned_to: null,
    resolution: "", version: 0, created_at: at, updated_at: at, due_at: new Date(now + 120000).toISOString(), escalated_at: null,
  };
  const events: IncidentEvent[] = [{ id: eventId, incident_id: id, actor_id: null, action: "detected", detail: `OpenCV · A104 synthetic step ${index + 1}: ${step.changed_pixels} changed floor pixels; ${step.route_overlap_pixels} pixels overlap the human-marked route. Offline processing, not live water recognition.`, created_at: at },
    { id: `${eventId}-assessed`, incident_id: id, actor_id: null, action: "assessed", detail: `Route measurement · ${routeLevels[step.priority].label}. No automatic safety clearance.`, created_at: at }];
  if (!original || original.priority !== step.priority) events.push({ id: `${eventId}-station`, incident_id: id, actor_id: null, action: "station_request", detail: stationAnnouncement("A104", step.priority as "away" | "near" | "crossing"), created_at: at });
  return { ...state, incidents: original ? state.incidents.map(i => i.id === id ? incident : i) : [incident, ...state.incidents], events: [...state.events, ...events] };
}

export function leakReferenceImage(frameTime: number | null): string {
  return frameTime !== null && frameTime >= 6 ? "/demo/a104-leak-large-google.jpg" : frameTime !== null && frameTime >= 4 ? "/demo/a104-leak-medium-google.jpg" : "/demo/a104-leak-small-google.jpg";
}
