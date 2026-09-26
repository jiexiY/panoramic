// Test-only authored data. Never imported by the product UI.
import type { Scene } from "../../src/scene.ts";
import type { WalkingRoute } from "../../src/routeRisk.ts";

export const rehearsalScene: Scene = {
  observations: [
    { label: "Cup", box: [465, 418, 655, 510], kind: "object", evidence: "An illustrated cup lies on its side beside the chair." },
    { label: "Possible spill", box: [635, 385, 835, 655], kind: "possible_spill", evidence: "A blue illustrated puddle is on the floor beside the chair." },
    { label: "Box on floor", box: [490, 705, 710, 875], kind: "possible_trip", evidence: "An illustrated cardboard box occupies floor space to the right of the chair." },
  ],
  brief: "Check the possible spill beside the chair and the box on the floor. Review their position against the resident's marked route.",
  uncertainty: "Authored test data, not a model result.",
};
export const sampleRoutes: WalkingRoute[] = [
  { name: "Chair to doorway", points: [{ x: 290, y: 850 }, { x: 525, y: 750 }, { x: 810, y: 620 }, { x: 970, y: 850 }], margin: 65, source: "recording" },
  { name: "Chair along room edge", points: [{ x: 280, y: 860 }, { x: 360, y: 920 }, { x: 870, y: 920 }, { x: 970, y: 850 }], margin: 65, source: "recording" },
  { name: "Chair to window side", points: [{ x: 300, y: 730 }, { x: 380, y: 610 }, { x: 730, y: 600 }, { x: 955, y: 780 }], margin: 65, source: "recording" },
];
