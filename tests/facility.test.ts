import test from "node:test";
import assert from "node:assert/strict";
import { bathroomPriority, bathroomRoute, bathroomScene, emptyFacility, facilityAlertActive, facilityCandidate, facilityTransition } from "../src/facility.ts";
import { assessRouteHazard } from "../src/routeRisk.ts";
import { parseScene } from "../src/scene.ts";

const at = "2026-09-26T14:00:00.000Z";
const load = () => facilityTransition(emptyFacility(), { type: "load", at });

test("facility records start empty and require explicit sample loading", () => {
  const empty = emptyFacility();
  assert.deepEqual(empty, { loaded: false, incident: null, staff: [] });
  assert.equal(facilityAlertActive(empty), false);
  assert.throws(() => facilityTransition(empty, { type: "acknowledge", at }));
  const loaded = facilityTransition(empty, { type: "load", at });
  assert.equal(loaded.staff.length, 3);
  assert.equal(loaded.incident?.events.length, 1);
  assert.equal(facilityTransition(loaded, { type: "load", at }), loaded);
  assert.equal(empty.loaded, false);
});

test("water photo regions validate and only the water creates route concern", () => {
  assert.deepEqual(parseScene(bathroomScene), bathroomScene);
  assert.equal(bathroomPriority, "crossing");
  assert.equal(bathroomScene.observations.filter(o => o.kind !== "object").length, 1);
  bathroomScene.observations.slice(0, 3).forEach(o => assert.equal(assessRouteHazard(o, bathroomRoute).priority, "object"));
  assert.match(bathroomScene.uncertainty, /Human-marked/);
});

test("availability and qualification take priority over sample distance", () => {
  const loaded = load();
  assert.equal(facilityCandidate(loaded)?.id, "sam");
  const samBusy = facilityTransition(loaded, { type: "availability", id: "sam" });
  assert.equal(facilityCandidate(samBusy)?.id, "maya");
  const nobodyAvailable = facilityTransition(samBusy, { type: "availability", id: "maya" });
  assert.equal(facilityCandidate(nobodyAvailable), null);
  assert.throws(() => facilityTransition(nobodyAvailable, { type: "acknowledge", at }));
  assert.equal(facilityCandidate({ ...loaded, staff: loaded.staff.map(p => ({ ...p, qualified: false })) }), null);
});

test("acknowledgment reserves the caregiver without pretending they arrived", () => {
  const loaded = load();
  const accepted = facilityTransition(loaded, { type: "acknowledge", at });
  assert.equal(accepted.incident?.assigned, "Sam");
  assert.equal(accepted.incident?.phase, "acknowledged");
  assert.equal(accepted.staff[0].available, false);
  assert.equal(accepted.staff[0].location, "supervision");
  assert.equal(loaded.staff[0].available, true);
  assert.equal(facilityTransition(accepted, { type: "availability", id: "sam" }), accepted);
  assert.equal(facilityAlertActive(accepted), true);
});

test("arrival and resolution cannot be skipped or repeated", () => {
  const loaded = load();
  assert.throws(() => facilityTransition(loaded, { type: "arrive", at }));
  assert.throws(() => facilityTransition(loaded, { type: "resolve", at, note: "Checked sample floor." }));
  const accepted = facilityTransition(loaded, { type: "acknowledge", at });
  assert.throws(() => facilityTransition(accepted, { type: "acknowledge", at }));
  assert.throws(() => facilityTransition(accepted, { type: "resolve", at, note: "Checked sample floor." }));
  const arrived = facilityTransition(accepted, { type: "arrive", at });
  assert.equal(arrived.staff[0].location, "A101");
  assert.equal(arrived.staff[0].available, false);
  assert.equal(facilityAlertActive(arrived), true);
  assert.throws(() => facilityTransition(arrived, { type: "resolve", at, note: "done" }));
  assert.throws(() => facilityTransition(arrived, { type: "resolve", at, note: "x".repeat(501) }));
});

test("resolution records the note and releases staff but does not teleport them", () => {
  const accepted = facilityTransition(load(), { type: "acknowledge", at });
  const arrived = facilityTransition(accepted, { type: "arrive", at });
  const resolved = facilityTransition(arrived, { type: "resolve", at, note: "  Sample floor checked and dried.  " });
  assert.equal(resolved.incident?.resolution, "Sample floor checked and dried.");
  assert.equal(resolved.incident?.events.length, 4);
  assert.equal(resolved.staff[0].available, true);
  assert.equal(resolved.staff[0].location, "A101");
  assert.equal(facilityAlertActive(resolved), false);
  assert.equal(facilityAlertActive(arrived), true);
  assert.throws(() => facilityTransition(resolved, { type: "arrive", at }));
});

test("reset removes sample records without mutating the previous state", () => {
  const loaded = load();
  assert.deepEqual(facilityTransition(loaded, { type: "reset" }), emptyFacility());
  assert.equal(loaded.staff.length, 3);
  assert.equal(loaded.incident?.phase, "flagged");
});
