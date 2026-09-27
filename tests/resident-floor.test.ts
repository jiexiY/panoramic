import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");

test("workspace omits the workflow launcher and helper text but retains A101 recording controls", () => {
  assert.doesNotMatch(source("Workspace.tsx"), /playback-start|Run bathroom workflow|Use the recording to walk through a response/);
  assert.doesNotMatch(source("playback.css"), /playback-start/);
  assert.match(source("RoomMonitoring.tsx"), /Play tracking/);
});

test("room sidebar omits the layout card while preserving the floor map and room monitoring", () => {
  const facility = source("FacilityWorkspace.tsx");
  assert.doesNotMatch(facility, /SuitePlan|room-detail|suite-plan-caption|>LAYOUT</);
  assert.match(facility, /<FacilityMap/);
  assert.match(facility, /<RoomMonitoring/);
  assert.match(facility, /className="facility-card room-directory"/);
});

test("sidebar uses text labels and a selected vertical marker without icons or a filled highlight", () => {
  const sidebar = source("Workspace.tsx").match(/<aside className="rail">([\s\S]*?)<\/aside>/)?.[1];
  assert.ok(sidebar);
  assert.doesNotMatch(sidebar, /<(?:Sparkles|Map|Monitor|HandHeart|History|ArrowLeft)\b/);
  for (const label of ["Home", "Resident Floor", "Care session"]) assert.ok(sidebar.includes(label));
  assert.doesNotMatch(sidebar, /Supervision|Scene review|Session history/);
  assert.equal((sidebar.match(/aria-current=/g) ?? []).length, 3);
  const css = source("style.css");
  assert.match(css, /\.rail nav button::before\s*\{[^}]*width: 2px;[^}]*height: 18px;[^}]*opacity: 0;/);
  assert.match(css, /\.rail nav button\[aria-current\]::before\s*\{\s*opacity: 1;/);
  assert.match(css, /\.rail nav button\[aria-current\]\s*\{\s*background: transparent;/);
  assert.match(source("site.css"), /\.app-shell \.rail nav button\s*\{[^}]*flex: 0 0 auto;[^}]*font-size: 12px;/);
});

test("Resident Floor replaces spatial labels without duplicate supervision navigation", () => {
  for (const file of ["Workspace.tsx", "FacilityWorkspace.tsx", "FacilityMap.tsx", "routes.ts"]) {
    assert.doesNotMatch(source(file), /Spatial view/);
    assert.match(source(file), /Resident Floor/);
  }
  const facility = source("FacilityWorkspace.tsx");
  assert.doesNotMatch(facility, /Supervision desk|supervision-row|Caregivers & nurses|onMode/);
  assert.doesNotMatch(source("Workspace.tsx"), /setPage\("supervision"\)|page === "supervision"/);
  assert.match(facility, /<IncidentDesk/);
});

test("recording controls and route concern belong to room monitoring, not the floor header or sidebar", () => {
  const facility = source("FacilityWorkspace.tsx");
  const room = source("RoomMonitoring.tsx");
  assert.doesNotMatch(facility, /Open bathroom recording|Route concern|facility-evidence/);
  assert.match(facility, /<RoomMonitoring key=\{monitoringRoom\}/);
  assert.match(facility, /priority=\{priorities\[monitoringRoom\] \?\? "unassessed"\}/);
  assert.match(room, /room === "A101" \? \(\s*<section className="facility-evidence" aria-label="Bathroom image data">/);
  assert.match(room, /bathroom monitoring\x60\}[\s\S]*Bathroom image data[\s\S]*room-route-concern/);
  assert.doesNotMatch(room, /evidenceOpen|Open bathroom recording|Close recording/);
  assert.match(room, /routeLevels\[priority\]/);
});

test("manual observation controls real playback state and stops it when hidden", () => {
  const room = source("RoomMonitoring.tsx");
  const facility = source("FacilityWorkspace.tsx");
  assert.match(room, /recordingIsOn\(recording, active, room\)/);
  assert.match(room, /active && room === "A101" && workflowScanning/);
  assert.match(facility, /if \(!active\) \{ recordingAction\(\{ type: "pause" \}\); onStopWorkflow\(\)/);
  assert.match(facility, /if \(workflowScanning\) onStopWorkflow\(\)/);
  assert.match(facility, /onToggle=\{toggleObservation\}/);
  assert.match(room, /onError=\{\(\) => onRecordingAction\(\{ type: "failed", version: recording.version \}\)\}/);
  assert.doesNotMatch(source("FacilityWorkspace.tsx"), /No observations|Live updates|Saved observations/);
  const status = source("ObservationStatus.tsx");
  assert.match(status, /Observation:/);
  assert.match(status, /on \? "On" : "Off"/);
  assert.match(status, /\(on \|\| pending\) && playback/);
  assert.match(status, /role="switch" aria-label="Floor observation" aria-checked=\{on \|\| pending\}/);
  assert.match(status, /aria-hidden="true"/);
  const css = source("room-monitoring.css");
  assert.match(css, /is-on i \{ background: #22e65f/);
  assert.match(css, /is-off i \{ background: #ff303b/);
});
