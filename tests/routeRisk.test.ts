import test from "node:test";
import assert from "node:assert/strict";
import { assessRouteHazard, highestRoutePriority, segmentBoxDistance, validRoute, routeLevels, type WalkingRoute } from "../src/routeRisk.ts";
import type { Detection } from "../src/scene.ts";
import { rehearsalScene, sampleRoutes } from "./fixtures/scenes.ts";
const hazard: Detection = { label: "Possible spill", kind: "possible_spill", box: [400, 400, 600, 600], evidence: "Staged liquid-like area." };
const route = (y: number, margin = 65): WalkingRoute => ({ name: "Marked route", points: [{ x: 100, y }, { x: 900, y }], margin, source: "caregiver-marked" });

test("hazard directly crosses route even with both route endpoints outside box", () => {
  assert.equal(assessRouteHazard(hazard, route(500)).priority, "crossing");
  assert.equal(segmentBoxDistance({ x: 100, y: 100 }, { x: 900, y: 900 }, hazard.box), 0);
});
test("distance to box edges, not its center, determines near-route classification", () => {
  assert.equal(assessRouteHazard(hazard, route(650)).priority, "near");
  assert.equal(assessRouteHazard(hazard, route(665)).priority, "near");
  assert.equal(assessRouteHazard(hazard, route(666)).priority, "away");
  assert.equal(assessRouteHazard(hazard, route(600, 0)).priority, "crossing");
});
test("missing, malformed and degenerate routes do not assign a low rating", () => {
  for (const value of [null, { ...route(500), points: [] }, { ...route(500), points: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }, { ...route(500), margin: -1 }, { ...route(500), points: [{ x: NaN, y: 0 }, { x: 50, y: 50 }] }, { ...route(500), points: [{ x: 0, y: 0 }, { x: 1001, y: 500 }] }]) {
    assert.equal(validRoute(value), false);
    assert.equal(assessRouteHazard(hazard, value).priority, "unassessed");
  }
});
test("ordinary objects are not promoted to hazards by route intersection", () => {
  assert.equal(assessRouteHazard({ ...hazard, kind: "object", label: "Cup" }, route(500)).priority, "object");
  assert.equal(highestRoutePriority([{ ...hazard, kind: "object" }], route(500)), "unassessed");
  assert.equal(highestRoutePriority([], route(500)), "unassessed");
});
test("polyline checks every segment and ranks the highest concern", () => {
  const bent = { ...route(500), points: [{ x: 0, y: 0 }, { x: 100, y: 500 }, { x: 900, y: 500 }] };
  assert.equal(assessRouteHazard(hazard, bent).priority, "crossing");
  assert.equal(highestRoutePriority(rehearsalScene.observations, sampleRoutes[0]), "crossing");
});
test("route changes recompute ratings without mutating the observations or suppressing hazards", () => {
  const original = JSON.stringify(rehearsalScene);
  const spill = rehearsalScene.observations[1];
  assert.equal(assessRouteHazard(spill, sampleRoutes[0]).priority, "crossing");
  assert.equal(assessRouteHazard(spill, sampleRoutes[1]).priority, "away");
  assert.equal(assessRouteHazard(spill, sampleRoutes[2]).priority, "near");
  assert.equal(assessRouteHazard(rehearsalScene.observations[2], sampleRoutes[2]).priority, "crossing");
  assert.match(assessRouteHazard(spill, sampleRoutes[1]).reason, /still needs checking/);
  assert.equal(JSON.stringify(rehearsalScene), original);
});
test("parallel and zero-length segments have finite correct distances", () => {
  assert.equal(segmentBoxDistance({ x: 100, y: 650 }, { x: 900, y: 650 }, hazard.box), 50);
  assert.equal(segmentBoxDistance({ x: 650, y: 500 }, { x: 650, y: 500 }, hazard.box), 50);
  assert.equal(segmentBoxDistance({ x: 450, y: 450 }, { x: 450, y: 450 }, hazard.box), 0);
});
test("hazard shades darken monotonically and include visible text labels", () => {
  const luminance = (hex: string) => {
    const rgb = hex.match(/[0-9a-f]{2}/gi)!.map(x => parseInt(x, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  };
  assert.ok(luminance(routeLevels.away.color) > luminance(routeLevels.near.color));
  assert.ok(luminance(routeLevels.near.color) > luminance(routeLevels.crossing.color));
  for (const style of Object.values(routeLevels)) {
    const contrast = (Math.max(luminance(style.color), luminance(style.ink)) + .05) / (Math.min(luminance(style.color), luminance(style.ink)) + .05);
    assert.ok(contrast >= 4.5, `${style.label}: contrast ${contrast}`);
    assert.ok(style.label.length > 0);
  }
});
