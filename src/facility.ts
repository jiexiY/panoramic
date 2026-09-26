import { advanceIncident, startIncident, type Caregiver, type Incident, type Scene } from "./scene.ts";
import { highestRoutePriority, type WalkingRoute } from "./routeRisk.ts";

export const suiteIds = ["A101", "A102", "A103", "A104"] as const;
export type SuiteId = typeof suiteIds[number];
export type SpaceId = SuiteId | "supervision";
export type FacilityStaff = Caregiver & { role: "Caregiver" | "Registered nurse"; location: SpaceId };
export type FacilityState = { loaded: boolean; incident: Incident | null; staff: FacilityStaff[] };
export const emptyFacility = (): FacilityState => ({ loaded: false, incident: null, staff: [] });
export const bathroomRoute: WalkingRoute = { name: "Entry to shower", source: "recording", margin: 40,
  points: [{ x: 600, y: 985 }, { x: 570, y: 920 }, { x: 490, y: 860 }, { x: 370, y: 810 }] };
export const bathroomScene: Scene = {
  observations: [
    { label: "Shower seat", box: [448, 77, 723, 218], kind: "object", evidence: "A wall-mounted folding shower seat." },
    { label: "Grab rail", box: [458, 598, 605, 940], kind: "object", evidence: "A support rail alongside the toilet." },
    { label: "Toilet", box: [597, 619, 842, 827], kind: "object", evidence: "A wall-mounted toilet." },
    { label: "Possible water", box: [805, 339, 997, 790], kind: "possible_spill", evidence: "A reflective liquid-like area crosses the foreground floor in the supplied AI-edited image." },
  ],
  brief: "Check the possible water on the bathroom floor before the resident uses the marked route.",
  uncertainty: "Human-marked demonstration regions on a user-supplied Gemini-edited still. Not an automatic water-detection result.",
};
export const bathroomPriority = highestRoutePriority(bathroomScene.observations, bathroomRoute);
export function facilityAlertActive(state: FacilityState) { return !!state.incident && state.incident.phase !== "resolved"; }
export function facilityCandidate(state: FacilityState): FacilityStaff | null {
  return [...state.staff].filter(p => p.available && p.qualified).sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))[0] ?? null;
}
export type FacilityAction = { type: "load"; at: string } | { type: "reset" }
  | { type: "availability"; id: string }
  | { type: "acknowledge" | "arrive" | "resolve"; at: string; note?: string };
export function facilityTransition(state: FacilityState, action: FacilityAction): FacilityState {
  if (action.type === "reset") return emptyFacility();
  if (action.type === "load") {
    if (state.loaded) return state;
    return { loaded: true, incident: startIncident(bathroomScene, action.at), staff: [
      { id: "sam", name: "Caregiver 01", role: "Caregiver", location: "supervision", available: true, qualified: true, distance: 2 },
      { id: "maya", name: "Nurse 01", role: "Registered nurse", location: "supervision", available: true, qualified: true, distance: 3 },
      { id: "alex", name: "Caregiver 02", role: "Caregiver", location: "A102", available: false, qualified: true, distance: 1 },
    ] };
  }
  if (action.type === "availability") {
    if (state.incident && !["flagged", "resolved"].includes(state.incident.phase)) return state;
    return { ...state, staff: state.staff.map(p => p.id === action.id ? { ...p, available: !p.available } : p) };
  }
  if (!state.incident) throw new Error("Open the bathroom recording first.");
  const candidate = facilityCandidate(state);
  const incident = advanceIncident(state.incident, action.type, action.at, candidate, action.note ?? "");
  return { ...state, incident, staff: state.staff.map(p => p.name !== incident.assigned ? p : {
    ...p, available: action.type === "resolve", location: action.type === "acknowledge" ? p.location : "A101",
  }) };
}
