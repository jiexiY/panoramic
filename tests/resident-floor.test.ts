import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");

test("Resident Floor replaces spatial labels without duplicate supervision navigation", () => {
  for (const file of ["Workspace.tsx", "FacilityWorkspace.tsx", "FacilityMap.tsx", "routes.ts"]) {
    assert.doesNotMatch(source(file), /Spatial view/);
    assert.match(source(file), /Resident Floor/);
  }
  const facility = source("FacilityWorkspace.tsx");
  assert.doesNotMatch(facility, /Supervision desk|supervision-row|Caregivers & nurses|onMode/);
  assert.match(source("Workspace.tsx"), /setPage\("supervision"\)/);
});

test("recording controls and route concern belong to room monitoring, not the floor header or sidebar", () => {
  const facility = source("FacilityWorkspace.tsx");
  const room = source("RoomMonitoring.tsx");
  assert.doesNotMatch(facility, /Open bathroom recording|Route concern|facility-evidence/);
  assert.match(facility, /<RoomMonitoring key=\{\x60\$\{team.facilityId\}:\$\{monitoringRoom\}\x60\}/);
  assert.match(facility, /priority=\{priorities\[monitoringRoom\] \?\? "unassessed"\}/);
  assert.match(room, /room === "A101" \? \([\s\S]*Open bathroom recording/);
  assert.match(room, /bathroom monitoring\x60\}[\s\S]*Open bathroom recording[\s\S]*room-route-concern/);
  assert.match(room, /routeLevels\[priority\]/);
});

test("observation only turns on for loaded, active playback and resets on hide or unmount", () => {
  const room = source("RoomMonitoring.tsx");
  assert.match(room, /active && room === "A101" && evidenceOpen && playing && mediaReady && !mediaError/);
  assert.match(room, /active && room === "A101" && workflowScanning/);
  assert.match(room, /return \(\) => onObservationChange\(false\)/);
  assert.match(room, /if \(!active\) setPlaying\(false\)/);
  assert.match(room, /onError=\{\(\) => \{ setMediaError\(true\); setMediaReady\(false\); \}\}/);
  assert.doesNotMatch(source("FacilityWorkspace.tsx"), /No observations|Live updates|Saved observations/);
  const status = source("ObservationStatus.tsx");
  assert.match(status, /Observation:/);
  assert.match(status, /on \? "On" : "Off"/);
  assert.match(status, /on && playback/);
  assert.match(status, /aria-hidden="true"/);
  const css = source("room-monitoring.css");
  assert.match(css, /is-on i \{ background: #22e65f/);
  assert.match(css, /is-off i \{ background: #ff303b/);
});
