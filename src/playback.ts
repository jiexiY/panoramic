import { bathroomRoute, bathroomScene } from "./facility.ts";
import { highestRoutePriority } from "./routeRisk.ts";
import { eligibleResponders, noHazardVisible, type SharedIncident, type TeamMember, type IncidentEvent } from "./incidents.ts";
import { type Analysis } from "./scene.ts";

export type PlaybackState = { incidents: SharedIncident[]; members: TeamMember[]; events: IncidentEvent[] };
export const playbackFacility = { id: "recording-playback", name: "Bathroom workflow", owner_id: "supervisor" };
export function playbackStart(now: number): PlaybackState {
  return { incidents: [], events: [], members: [
    { user_id: "supervisor", display_name: "Supervisor", role: "coordinator", qualified: false, available: false, response_order: 1 },
    { user_id: "caregiver-01", display_name: "Caregiver 01", role: "caregiver", qualified: true, available: true, response_order: 1 },
    { user_id: "nurse-01", display_name: "Nursing station", role: "nurse", qualified: true, available: true, response_order: 2 },
  ].map(m => ({...m, role: m.role as TeamMember["role"], facility_id: playbackFacility.id, available_until: new Date(now + 86_400_000).toISOString()})) };
}
export function playbackWater(state: PlaybackState, now: number): PlaybackState {
  if (state.incidents.some(i => i.phase !== "resolved")) return state;
  const at = new Date(now).toISOString(), id = `bathroom-recording-${state.incidents.length + 1}`;
  const incident: SharedIncident = { id, facility_id: playbackFacility.id, created_by: "supervisor", room: "A101", zone: "Bathroom",
    observation: { source: "recording", model: "Annotated OpenCV recording", analyzedAt: at, scene: bathroomScene },
    route: bathroomRoute, priority: highestRoutePriority(bathroomScene.observations, bathroomRoute), media_name: "bathroom-tracking.gif", frame_time: 2.5,
    evidence_path: null, phase: "flagged", suggested_to: "caregiver-01", assigned_to: null, resolution: "", version: 0,
    created_at: at, updated_at: at, due_at: new Date(now + 120000).toISOString(), escalated_at: null };
  return {...state, incidents: [incident, ...state.incidents], events: [...state.events,
    {id: `${id}-water-observed`, incident_id: id, actor_id: null, action: "flagged", detail: "Monitor · recorded water region overlaps the route. L3 concern opened.", created_at: at},
    {id: `${id}-station-request`, incident_id: id, actor_id: null, action: "station_request", detail: "Panoramic → supervision station: A101 bathroom, L3. Check the floor before the resident enters. Review available responders; assignment requested.", created_at: at},
  ]};
}
export function playbackObservation(state: PlaybackState, value: "clear" | "hazard" | "unknown", now: number): PlaybackState {
  const original = state.incidents.find(i => i.phase !== "resolved");
  if (!original) return state;
  const at = new Date(now).toISOString();
  const review: Analysis | null = value === "unknown" ? null : {
    source: "recording", model: "Annotated reference frame", analyzedAt: at,
    scene: value === "hazard" ? bathroomScene : { observations: [], brief: "Dry reference frame: no marked spill or obstruction visible.", uncertainty: "Original dry reference image, not a verified cleanup or a live model result. Physical inspection is required." },
  };
  const i = {...original, review_observation: review, supervision_checked_by: null, nursing_checked_by: null,
    closure_requested: value === "clear" ? original.closure_requested : false, version: original.version + 1, updated_at: at};
  const detail = value === "clear" ? "Monitor · dry reference frame has no marked hazard. Safety check requested; concern stays open."
    : value === "hazard" ? "Monitor · recorded water is visible again. Previous safety sign-offs invalidated."
    : "Monitor · observation unavailable. No safety conclusion; pending sign-offs invalidated.";
  return {...state, incidents: state.incidents.map(row=>row.id===i.id?i:row), events:[...state.events,{id:`${i.id}-observation-${i.version}`,incident_id:i.id,actor_id:null,action:`monitor_${value}`,detail,created_at:at}]};
}
export function playbackCommand(state: PlaybackState, actor: string, action: string, payload: Record<string, unknown>, now: number): PlaybackState {
  const member = state.members.find(m => m.user_id === actor);
  const original = state.incidents.find(i => i.id === payload.id);
  if (!member || !original) throw new Error("Response not found.");
  if (state.events.some(e => e.id === payload.request_id && e.actor_id === actor && e.action === action)) return state;
  if (original.version !== payload.version) throw new Error("This response changed. Review the latest record.");
  const i = {...original}, at = new Date(now).toISOString();
  let members = state.members, detail = "";
  if (action === "supervision_check" || action === "nursing_check") {
    if (i.phase !== "arrived" || !i.closure_requested || !noHazardVisible(i)) throw new Error("A clear follow-up frame and caregiver outcome are required before sign-off.");
    if (action === "supervision_check") {
      if (member.role !== "coordinator" || i.supervision_checked_by) throw new Error("Only supervision can perform this check, once.");
      i.supervision_checked_by = actor;
      detail = "Supervision station confirmed the physical safety check. Nursing sign-off requested.";
    } else {
      if (member.role !== "nurse" || !i.supervision_checked_by || i.supervision_checked_by === actor || i.nursing_checked_by) throw new Error("An independent nursing station must sign off after supervision.");
      i.nursing_checked_by = actor; i.phase = "resolved";
      detail = "Nursing station checked off the response. Both stations confirmed; activity closed.";
    }
  } else if (action === "dispatch") {
    if (member.role !== "coordinator" || !["flagged", "dispatched"].includes(i.phase)) throw new Error("Only supervision can assign a pending response.");
    const target = eligibleResponders(members, state.incidents, now).find(m => m.user_id === payload.caregiver_id);
    if (!target) throw new Error("This caregiver is not available.");
    i.phase = "dispatched"; i.assigned_to = target.user_id;
    members = members.map(m => m.user_id === target.user_id ? {...m, available: false} : m);
    detail = `Supervisor assigned ${target.display_name}. Acceptance pending.`;
    i.due_at = new Date(now + 120000).toISOString();
  } else {
    if (i.assigned_to !== actor) throw new Error("Only the assigned caregiver can record this action.");
    const note = typeof payload.note === "string" ? payload.note.trim() : "";
    if (action === "acknowledge" && i.phase === "dispatched" && member.qualified) {
      i.phase = "acknowledged"; detail = `${member.display_name} accepted. Arrival pending.`; i.due_at = new Date(now + 180000).toISOString();
    } else if (action === "arrive" && i.phase === "acknowledged") {
      i.phase = "arrived"; detail = `${member.display_name} confirmed arrival.`; i.due_at = new Date(now + 600000).toISOString();
    } else if (action === "resolve" && i.phase === "arrived" && note.length >= 8 && note.length <= 1000) {
      i.closure_requested = true; i.resolution = note; i.supervision_checked_by = null; i.nursing_checked_by = null;
      detail = `${member.display_name} recorded: ${note}. Awaiting a clear follow-up frame and both station sign-offs.`;
    } else if (action === "decline" && i.phase === "dispatched" && note.length >= 8 && note.length <= 1000) {
      i.phase = "flagged"; i.assigned_to = null; detail = `${member.display_name} declined: ${note}. Returned to supervision.`;
    } else throw new Error("Complete the previous step and record a specific outcome or reason.");
  }
  i.version++; i.updated_at = at; i.escalated_at = null;
  return {members, incidents: state.incidents.map(row => row.id === i.id ? i : row), events: [...state.events, {id: String(payload.request_id), incident_id: i.id, actor_id: actor, action, detail, created_at: at}]};
}
