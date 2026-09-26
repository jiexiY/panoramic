import test from "node:test";
import assert from "node:assert/strict";
import { advanceIncident, parseScene, recommendCaregiver, startIncident } from "../src/scene.ts";
import { rehearsalScene } from "./fixtures/scenes.ts";
const at = "2026-09-26T07:00:00.000Z";
const sam = { id: "sam", name: "Sam", available: true, qualified: true, distance: 2 };
test("valid observation boxes are normalized [ymin,xmin,ymax,xmax]", () => {
  assert.deepEqual(parseScene(rehearsalScene), rehearsalScene);
});
test("malformed and reversed boxes fail closed", () => {
  for (const box of [[1, 2, 3], [-1, 2, 3, 4], [100, 2, 50, 4], [1, 3, 5, 2], [1, 2, 1001, 999], [1.5, 2, 3, 4]]) {
    assert.throws(() => parseScene({ ...rehearsalScene, observations: [{ ...rehearsalScene.observations[0], box }] }));
  }
});
test("reject invalid scene text, labels, categories and observations", () => {
  for (const value of [null, {}, { ...rehearsalScene, brief: "" }, { ...rehearsalScene, uncertainty: "x".repeat(401) }, { ...rehearsalScene, observations: Array(9).fill(rehearsalScene.observations[0]) }, { ...rehearsalScene, observations: [{ ...rehearsalScene.observations[0], kind: "safe" }] }]) assert.throws(() => parseScene(value));
});
test("a cup alone does not trigger a spill alert", () => {
  assert.equal(startIncident({ ...rehearsalScene, observations: [rehearsalScene.observations[0]] }, at), null);
  assert.equal(startIncident({ ...rehearsalScene, observations: [] }, at), null);
});
test("candidate hazards create an unassigned local request", () => {
  const incident = startIncident(rehearsalScene, at)!;
  assert.equal(incident.phase, "flagged"); assert.equal(incident.assigned, null);
  assert.match(incident.events[0].text, /flagged for review/);
});
test("busy and unqualified staff are excluded before proximity", () => {
  assert.deepEqual(recommendCaregiver([{ ...sam, id: "alex", available: false, distance: 1 }, { ...sam, id: "visitor", qualified: false, distance: 0 }, sam]), sam);
  assert.equal(recommendCaregiver([{ ...sam, available: false }]), null);
});
test("arrival and resolution cannot skip acknowledgment", () => {
  const incident = startIncident(rehearsalScene, at)!;
  assert.throws(() => advanceIncident(incident, "arrive", at));
  assert.throws(() => advanceIncident(incident, "resolve", at, sam, "Floor checked."));
  assert.throws(() => advanceIncident(incident, "acknowledge", at, { ...sam, available: false }));
  assert.throws(() => advanceIncident(incident, "acknowledge", at, { ...sam, qualified: false }));
});
test("complete response preserves distinct operator-entered events and original state", () => {
  const initial = startIncident(rehearsalScene, at)!;
  const accepted = advanceIncident(initial, "acknowledge", at, sam);
  assert.equal(initial.phase, "flagged"); assert.equal(accepted.assigned, "Sam");
  assert.throws(() => advanceIncident(accepted, "acknowledge", at, sam));
  const arrived = advanceIncident(accepted, "arrive", at);
  assert.throws(() => advanceIncident(arrived, "resolve", at, sam, "done"));
  const resolved = advanceIncident(arrived, "resolve", at, sam, "Staged spill removed; floor checked by operator.");
  assert.equal(resolved.events.length, 4); assert.equal(resolved.phase, "resolved");
  assert.throws(() => advanceIncident(resolved, "arrive", at));
});
