// Curated reference guidance, not a trained detector or a validated fall-risk score.
const source = "https://alwaysbestcare.com/modesto/resources/recognizing-common-safety-hazards-around-the-home-for-seniors/";
export const hazardGuidance = [
  { id: "rule:spill", title: "Slippery floors", url: source, text: "The guidance identifies slippery floors as a concern. An apparent liquid-like floor region warrants checking; a cup alone does not establish that a spill occurred." },
  { id: "rule:route", title: "Clear walking paths", url: source, text: "The guidance recommends keeping frequently used walking paths clear of clutter and electrical cords. Evaluate an object's location relative to the recorded route, not its name alone." },
  { id: "rule:limits", title: "Visibility and inspection", url: source, text: "The guidance discusses lighting and secure handrails. An image cannot verify floor friction, grab-bar load capacity, or water temperature. Unclear evidence remains unassessed, not safe." },
] as const;
export const hazardPrompt = hazardGuidance.map(g => `${g.title}: ${g.text}`).join("\n");
