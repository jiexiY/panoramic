import type { IncidentEvent, SharedIncident } from "./incidents.ts";
export const cueKinds = ["repeated_word", "mumbling", "humming", "speech", "other"] as const;
export type CueKind = typeof cueKinds[number];
export const audioClarity = ["clear", "partial", "unclear"] as const;
export type AudioObservation = { kind: CueKind; clarity: typeof audioClarity[number]; heard: string; repetitions: number; start: number; end: number; uncertainty: string };
export type VocalCue = AudioObservation & { id: string; room: string; recordedAt: string; source: "gemini" | "caregiver"; model?: string; review: "noted" | "pending" | "routine" | "check" | "handled"; interpretation: string; reviewer: string; reviewedAt: string | null };
export const cueLabels: Record<CueKind, string> = {repeated_word:"Repeated word",mumbling:"Mumbling",humming:"Humming",speech:"Speech",other:"Other sound"};
export const cueSchema = {type:"object",additionalProperties:false,properties:{ cues:{type:"array",maxItems:8,items:{type:"object",additionalProperties:false,properties:{kind:{type:"string",enum:[...cueKinds]},clarity:{type:"string",enum:[...audioClarity]},heard:{type:"string"},repetitions:{type:"integer",minimum:0,maximum:100},start:{type:"number",minimum:0,maximum:30},end:{type:"number",minimum:0,maximum:30},uncertainty:{type:"string"}},required:["kind","clarity","heard","repetitions","start","end","uncertainty"]}}},required:["cues"]};

// Keep uncertainty in the note itself, not only in a separate explanation.
export function audioNote(c: AudioObservation): string {
  if (c.clarity === "unclear") return c.kind === "humming" ? "[humming?]" : c.kind === "other" ? "[unidentified sound?]" : "[unclear?]";
  const text = c.heard.trim();
  return c.clarity === "partial" && !/[?？]/u.test(text) ? `${text.slice(0,386)}${text.length > 386 ? "…" : ""} [uncertain?]` : text;
}
export function parseAudioCues(value: unknown, duration: number): AudioObservation[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as {cues:unknown}).cues)) throw new Error("Invalid audio observations.");
  const cues = (value as {cues:AudioObservation[]}).cues;
  if (cues.length > 8 || !Number.isFinite(duration) || duration <= 0 || duration > 30) throw new Error("Invalid recording duration.");
  return cues.map(c => {
    if (!c || !audioClarity.includes(c.clarity)) throw new Error("Missing or invalid audio clarity.");
    if (!c || !cueKinds.includes(c.kind) || typeof c.heard !== "string" || !c.heard.trim() || c.heard.length > 400 || typeof c.uncertainty !== "string" || c.uncertainty.length > 400 || !Number.isInteger(c.repetitions) || c.repetitions < 0 || c.repetitions > 100 || !Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < 0 || c.end <= c.start || c.end > duration + .1) throw new Error("Invalid audio cue.");
    if (c.kind !== "repeated_word" && c.repetitions !== 0) throw new Error("Repetition count requires an audible repeated word.");
    if (c.kind === "repeated_word" && (c.repetitions < 2 || c.clarity !== "clear")) throw new Error("Repeated words need at least two clear occurrences.");
    const kind = c.clarity === "unclear" && c.kind === "speech" ? "mumbling" : c.kind;
    return {kind,clarity:c.clarity,heard:audioNote(c),repetitions:c.repetitions,start:c.start,end:c.end,uncertainty:c.uncertainty.trim()};
  });
}
export function dayKey(value: string | number): string {
  const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
export function dailySummary(day: string, room: string, cues: VocalCue[], incidents: SharedIncident[], events: IncidentEvent[]) {
  const roomMatch = (r: string) => room === "all" || room === r;
  const selectedCues = cues.filter(c => roomMatch(c.room) && dayKey(c.recordedAt) === day);
  const concernIds = new Set(events.filter(e => dayKey(e.created_at) === day).map(e => e.incident_id));
  const concerns = incidents.filter(i => roomMatch(i.room) && (dayKey(i.created_at) === day || concernIds.has(i.id)));
  const open = concerns.filter(i => i.phase !== "resolved");
  const pending = selectedCues.filter(c => c.review === "pending" || c.review === "check");
  return {cues:selectedCues, concerns, open, pending, text:[
    `PANORAMIC · DAILY SUMMARY · ${day}`, `Scope: ${room === "all" ? "All rooms" : room} · records currently loaded in this workspace`,
    `${selectedCues.length} audio notes; ${pending.length} marked for review or follow-up.`, `${concerns.length} environmental concerns with activity today; ${open.length} currently open.`, "",
    "AUDIO NOTES", ...selectedCues.flatMap(c => [`${c.recordedAt} · ${c.room} · ${cueLabels[c.kind]} · ${c.source === "gemini" ? `Panoramic note · ${c.model}` : "Caregiver observation"}`,`Note: ${audioNote(c)}${c.repetitions ? ` (${c.repetitions} audible repetitions)` : ""}`,`Clarity: ${c.clarity} · Uncertainty: ${c.uncertainty || "None reported by the model"}`,`Review: ${c.review} · Staff context: ${c.interpretation || "Not added (optional)"}${c.reviewer ? ` — ${c.reviewer}` : ""}`,""]),
    "ENVIRONMENT & RESPONSE", ...concerns.flatMap(i => [`${i.room} · ${i.zone} · ${i.phase} · ${i.observation.source === "recording" ? "Recording playback" : "Image analysis"}`,i.observation.scene.brief, ...events.filter(e => e.incident_id === i.id && dayKey(e.created_at) === day).map(e => `${e.created_at} · ${e.detail}`),`Outcome: ${i.resolution || "Not recorded"}`,""]),
    "Missing records or quiet audio are not evidence of a safe room. Audio and environmental events are listed together, not treated as cause and effect."
  ].join("\n")};
}
