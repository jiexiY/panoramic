import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { initialState, report } from "../src/workflow.ts";
import { bathroomScene } from "../src/facility.ts";
import { startIncident } from "../src/scene.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("topbar keeps a placeholder outside playback and puts demo-only roles in its profile menu", () => {
  const workspace = source("src/Workspace.tsx");
  const topbar = workspace.match(/<header className="topbar">([\s\S]*?)<\/header>/)?.[1];
  assert.ok(topbar);
  assert.doesNotMatch(topbar, /Sign in|setAuthOpen\(true\)|<LogIn/);
  assert.match(topbar, /!owner && !playback.active && \(\s*<span className="profile-avatar" role="img" aria-label="Placeholder profile"/);
  assert.match(topbar, /!owner && playback.active && <details className="demo-role-menu"/);
  assert.match(topbar, /Local demo roles only; this does not grant care-team permissions/);
  assert.match(topbar, /<UserRound[^>]*aria-hidden="true"/);
  assert.ok(topbar.includes('owner && <button className="text-button" onClick={() => void cloud?.auth.signOut()}>Sign out</button>'));
  assert.match(workspace, /onSignIn=\{\(\) => setAuthOpen\(true\)\}/);
  assert.match(workspace, /setOwner\(session\?\.user.id \?\? null\)/);
  assert.match(source("src/style.css"), /\.profile-avatar\s*\{[^}]*border-radius: 50%;/);
});

test("scene review empty state uses room data labels", () => {
  const monitor = source("src/SceneMonitor.tsx");
  assert.match(monitor, /<span>ROOM DATA<\/span>/);
  assert.match(monitor, /<h2>No room data<\/h2>/);
  assert.match(monitor, /<Upload size=\{16\} \/> Add data/);
  assert.doesNotMatch(monitor, /ROOM IMAGES|No room images yet|Add room image/);
});

test("product screens contain no rehearsal flow or competition labels", () => {
  for (const file of ["src/SceneMonitor.tsx", "src/FacilityWorkspace.tsx", "src/RoomMonitoring.tsx", "src/Workspace.tsx", "src/RoutePlanner.tsx", "src/SuitePlan.tsx"]) {
    assert.doesNotMatch(source(file), /illustrated rehearsal|STAGED DEMO|SAMPLE SESSION|Sample concern|Show sample route|fictional|New demo session|Load demo caregivers|sales competition/i, file);
  }
  assert.equal(existsSync(new URL("../src/RoomIllustration.tsx", import.meta.url)), false);
  assert.doesNotMatch(source("src/SceneMonitor.tsx"), /RoomIllustration|rehearse|rehearsalScene|demoStaff/);
  assert.doesNotMatch(source("src/scene.ts"), /rehearsalScene/);
});

test("bathroom image is inline and recorded playback stays identified", () => {
  const facility = source("src/RoomMonitoring.tsx");
  assert.match(facility, /Play tracking/);
  assert.match(facility, /IMAGE DATA/);
  assert.match(facility, /Image details/);
  assert.match(facility.replace(/\s+/g, ' '), /browser-local response workflow, not the connected care team's records/);
  assert.doesNotMatch(facility, /facilityTransition|startIncident|bathroomScene/);
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
  assert.match(source('src/CareTeamPanel.tsx'), /Add or update caregiver/);
  assert.match(source('src/CareTeamPanel.tsx'), /Eligible to check environmental concerns/);
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
  const facility = source("src/RoomMonitoring.tsx");
  assert.match(facility, /playing \? trackingMedia\.gif : trackingMedia\.still/);
  assert.match(facility, /bathroom-tracking-poster\.png\?v=opencv-2/);
  assert.doesNotMatch(facility, /className="bathroom-scene"/);
});
