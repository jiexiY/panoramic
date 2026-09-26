export type Detection = {
  label: string;
  box: [number, number, number, number];
  kind: "object" | "possible_spill" | "possible_trip";
  evidence: string;
};
export type Scene = { observations: Detection[]; brief: string; uncertainty: string };
export type Analysis = { scene: Scene; source: "gemini" | "recording"; model: string; analyzedAt: string };
export type Caregiver = { id: string; name: string; available: boolean; qualified: boolean; distance: number };
export type Incident = {
  phase: "flagged" | "acknowledged" | "arrived" | "resolved";
  assigned: string | null;
  events: { at: string; text: string }[];
  resolution: string;
};
export const sceneSchema = {
  type: "object", additionalProperties: false,
  properties: {
    observations: { type: "array", maxItems: 8, items: {
      type: "object", additionalProperties: false,
      properties: {
        label: { type: "string" },
        box: { type: "array", items: { type: "integer", minimum: 0, maximum: 1000 }, minItems: 4, maxItems: 4 },
        kind: { type: "string", enum: ["object", "possible_spill", "possible_trip"] },
        evidence: { type: "string" },
      }, required: ["label", "box", "kind", "evidence"],
    } },
    brief: { type: "string" }, uncertainty: { type: "string" },
  }, required: ["observations", "brief", "uncertainty"],
};
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Invalid analysis text.");
  return value.trim();
}
export function parseScene(value: unknown): Scene {
  if (!value || typeof value !== "object") throw new Error("Invalid scene response.");
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.observations) || v.observations.length > 8) throw new Error("Invalid observation list.");
  return {
    observations: v.observations.map((item) => {
      if (!item || typeof item !== "object") throw new Error("Invalid observation.");
      const { label, box, kind, evidence } = item;
      if (!Array.isArray(box) || box.length !== 4 || box.some(n => !Number.isInteger(n) || n < 0 || n > 1000) || box[0] >= box[2] || box[1] >= box[3]) throw new Error("Invalid bounding box.");
      if (!["object", "possible_spill", "possible_trip"].includes(kind)) throw new Error("Invalid observation category.");
      return { label: text(label, 80), box: box as Detection["box"], kind, evidence: text(evidence, 300) };
    }),
    brief: text(v.brief, 600), uncertainty: text(v.uncertainty, 400),
  };
}
export function startIncident(scene: Scene, at: string): Incident | null {
  return scene.observations.some(o => o.kind !== "object") ? {
    phase: "flagged", assigned: null, resolution: "",
    events: [{ at, text: "Possible environmental hazard flagged for review." }],
  } : null;
}
export function recommendCaregiver(staff: Caregiver[]): Caregiver | null {
  return [...staff].filter(p => p.available && p.qualified).sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))[0] ?? null;
}
export function advanceIncident(current: Incident, action: "acknowledge" | "arrive" | "resolve", at: string, caregiver?: Caregiver | null, note = ""): Incident {
  const next = structuredClone(current);
  if (action === "acknowledge") {
    if (next.phase !== "flagged" || !caregiver?.available || !caregiver.qualified) throw new Error("An available, qualified caregiver must accept the request.");
    next.assigned = caregiver.name;
    next.phase = "acknowledged";
    next.events.push({ at, text: `${caregiver.name} acknowledged the request. Arrival pending.` });
  } else if (action === "arrive") {
    if (next.phase !== "acknowledged") throw new Error("Acknowledge before confirming arrival.");
    next.phase = "arrived";
    next.events.push({ at, text: `${next.assigned}: arrival confirmed by operator.` });
  } else {
    if (next.phase !== "arrived" || note.trim().length < 8 || note.length > 500) throw new Error("Confirm arrival and enter a specific resolution note (8–500 characters).");
    next.phase = "resolved";
    next.resolution = note.trim();
    next.events.push({ at, text: `Operator-recorded resolution: ${next.resolution}` });
  }
  return next;
}
