export type EvidenceSource = { id: string; title: string; text: string; incidentId?: string; url?: string };
export type AssistantAction = { kind: "none" | "review" | "assign"; incidentId: string; caregiverId: string };
export type AssistantReply = {
  paragraphs: { text: string; sourceIds: string[] }[];
  action: AssistantAction;
};
export type AssistantResult = AssistantReply & {
  source: "gemini"; model: string; analyzedAt: string; sources: EvidenceSource[];
  scope: string; snapshotAt: string; versions: Record<string, number>;
};
export const assistantSchema = {
  type: "object", additionalProperties: false,
  properties: {
    paragraphs: { type: "array", minItems: 1, maxItems: 5, items: { type: "object", additionalProperties: false,
      properties: { text: { type: "string" }, sourceIds: { type: "array", items: { type: "string" }, maxItems: 6 } }, required: ["text", "sourceIds"] } },
    action: { type: "object", additionalProperties: false, properties: {
      kind: { type: "string", enum: ["none", "review", "assign"] }, incidentId: { type: "string" }, caregiverId: { type: "string" },
    }, required: ["kind", "incidentId", "caregiverId"] },
  }, required: ["paragraphs", "action"],
};
export function parseAssistantReply(value: unknown, sources: EvidenceSource[], allowedAssignments: Record<string, string[]>): AssistantReply {
  if (!value || typeof value !== "object") throw new Error("Invalid assistant response.");
  const v = value as Record<string, any>;
  const ids = new Set(sources.map(s => s.id));
  if (!Array.isArray(v.paragraphs) || !v.paragraphs.length || v.paragraphs.length > 5) throw new Error("Invalid answer.");
  const paragraphs = v.paragraphs.map((p: any) => {
    if (typeof p?.text !== "string" || !p.text.trim() || p.text.length > 900 || !Array.isArray(p.sourceIds) || p.sourceIds.length > 6 || p.sourceIds.some((id: unknown) => typeof id !== "string" || !ids.has(id))) throw new Error("Answer contains an unknown evidence reference.");
    return { text: p.text.trim(), sourceIds: [...new Set(p.sourceIds)] as string[] };
  });
  const a = v.action;
  if (!a || !["none", "review", "assign"].includes(a.kind) || typeof a.incidentId !== "string" || typeof a.caregiverId !== "string") throw new Error("Invalid action proposal.");
  if (a.kind === "none" && (a.incidentId || a.caregiverId)) throw new Error("Unexpected action target.");
  if (a.kind !== "none" && !sources.some(s => s.id === `incident:${a.incidentId}`)) throw new Error("Unknown incident.");
  if (a.kind === "review" && a.caregiverId) throw new Error("Unexpected caregiver.");
  if (a.kind === "assign" && !allowedAssignments[a.incidentId]?.includes(a.caregiverId)) throw new Error("Assignment is unavailable. Refresh before trying again.");
  return { paragraphs, action: a as AssistantAction };
}
