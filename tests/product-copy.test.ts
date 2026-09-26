import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { initialState, report } from "../src/workflow.ts";
import { bathroomScene } from "../src/facility.ts";
import { startIncident } from "../src/scene.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("product screens contain no rehearsal flow or competition labels", () => {
  for (const file of ["src/SceneMonitor.tsx", "src/FacilityWorkspace.tsx", "src/Workspace.tsx", "src/RoutePlanner.tsx", "src/SuitePlan.tsx"]) {
    assert.doesNotMatch(source(file), /illustrated rehearsal|STAGED DEMO|SAMPLE SESSION|Sample concern|Show sample route|fictional|New demo session|Load demo caregivers|sales competition/i, file);
  }
  assert.equal(existsSync(new URL("../src/RoomIllustration.tsx", import.meta.url)), false);
  assert.doesNotMatch(source("src/SceneMonitor.tsx"), /RoomIllustration|rehearse|rehearsalScene|demoStaff/);
  assert.doesNotMatch(source("src/scene.ts"), /rehearsalScene/);
});

test("recorded media stays identified and opens from a direct product action", () => {
  const facility = source("src/FacilityWorkspace.tsx");
  assert.match(facility, /Open bathroom recording/);
  assert.match(facility, /RECORDING REVIEW/);
  assert.match(facility, /Recording details/);
  assert.match(facility, /Notifications off/);
  const renderer = source("scripts/render-bathroom-tracking.py");
  assert.doesNotMatch(renderer, /STAGED DEMO|Human-marked objects and sample route/);
  assert.match(renderer, /"PLAYBACK"/);
  assert.match(renderer, /Image-based playback/);
});

test("care records use operational wording without invented resident identities", () => {
  assert.equal(initialState().events[0].text, "Care session created.");
  assert.doesNotMatch(report(initialState()), /fictional|demo|prototype/i);
  assert.doesNotMatch(source("src/Workspace.tsx"), /Evelyn|Jordan|Alex|Sam\b/);
  assert.equal(startIncident(bathroomScene, "2026-09-26T15:00:00Z")?.events[0].text, "Possible environmental hazard flagged for review.");
});

test("copy cleanup retains privacy confirmation and explicit provider requests", () => {
  const monitor = source("src/SceneMonitor.tsx");
  assert.match(monitor, /useState\(false\)/);
  assert.match(monitor, /!privacyConfirmed/);
  assert.match(monitor, /Analysis sends this frame to Google/);
  assert.match(monitor, /stagedOnly: privacyConfirmed/);
  assert.match(monitor, /Add caregiver/);
  assert.match(monitor, /Eligible for this task/);
});

test("bathroom playback and still use native OpenCV overlay styling", () => {
  const renderer = source("scripts/render-bathroom-tracking.py");
  assert.match(renderer, /cv2\.FONT_HERSHEY_SIMPLEX/);
  assert.match(renderer, /cv2\.rectangle\(frame/);
  assert.match(renderer, /cv2\.putText\(frame/);
  assert.match(renderer, /GREEN = \(0, 255, 0\)/);
  assert.match(renderer, /RED = \(0, 0, 255\)/);
  assert.match(renderer, /CYAN = \(255, 255, 0\)/);
  assert.match(renderer, /cv2\.COLOR_BGR2RGB/);
  assert.doesNotMatch(renderer, /ImageDraw|rounded_rectangle|SAGE =|TERRA =/);
  const facility = source("src/FacilityWorkspace.tsx");
  assert.match(facility, /playing \? trackingMedia\.gif : trackingMedia\.still/);
  assert.match(facility, /bathroom-tracking-poster\.png\?v=opencv-2/);
  assert.doesNotMatch(facility, /className="bathroom-scene"/);
});
