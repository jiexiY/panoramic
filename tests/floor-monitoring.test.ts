import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initialFloorMonitoring, floorMonitoringReducer } from "../src/floorMonitoring.ts";
import { suiteIds } from "../src/suiteRecords.ts";

test("all suites are enabled together, but only a configured source can start", () => {
  const initial = initialFloorMonitoring(), before = structuredClone(initial);
  assert.ok(suiteIds.every(room => initial[room].enabled));
  const running = floorMonitoringReducer(initial, { type: "start" });
  assert.equal(running.A101.recording.mode, "loading");
  for (const room of ["A102", "A103", "A104"] as const) {
    assert.equal(running[room].enabled, true);
    assert.equal(running[room].source, "tracking");
    assert.equal(running[room].recording.mode, "closed");
    assert.equal(floorMonitoringReducer(running, { type: "recording", room, action: { type: "play" } }), running);
  }
  assert.deepEqual(initial, before);
  assert.equal(floorMonitoringReducer(running, { type: "start" }), running);
});

test("floor startup iterates all configured suites instead of using the selected suite", () => {
  const initial = initialFloorMonitoring();
  initial.A103 = { ...initial.A103, source: "recording" }; // future source adapter fixture
  const running = floorMonitoringReducer(initial, { type: "start" });
  assert.equal(running.A101.recording.mode, "loading");
  assert.equal(running.A103.recording.mode, "loading");
  const a101 = floorMonitoringReducer(running, { type: "recording", room: "A101", action: { type: "loaded", version: 1 } });
  assert.equal(a101.A101.recording.mode, "playing");
  assert.equal(a101.A103.recording.mode, "loading");
});

test("preview pause and failure never disable a suite or reset on navigation", () => {
  const running = floorMonitoringReducer(initialFloorMonitoring(), { type: "start" });
  const paused = floorMonitoringReducer(running, { type: "recording", room: "A101", action: { type: "pause" } });
  assert.equal(paused.A101.enabled, true);
  assert.equal(paused.A101.recording.mode, "still");
  assert.equal(floorMonitoringReducer(paused, { type: "start" }), paused);
  assert.equal(floorMonitoringReducer(paused, { type: "recording", room: "A101", action: { type: "loaded", version: 1 } }), paused);
  const failed = floorMonitoringReducer(running, { type: "recording", room: "A101", action: { type: "failed", version: 1 } });
  assert.equal(failed.A101.enabled, true);
  assert.equal(failed.A101.recording.mode, "error");
  assert.equal(floorMonitoringReducer(failed, { type: "start" }), failed);
});

test("local autostart waits for session restoration and keeps the map/AI split layout", () => {
  const source = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  const facility = source("FacilityWorkspace.tsx");
  const dashboard = source("MonitoringDashboard.tsx");
  assert.match(source("Workspace.tsx"), /autoStartRecording=\{!restoring && !owner\}/);
  assert.match(dashboard, /if \(autoStartRecording\) monitorAction\(\{ type: "start" \}\)/);
  assert.match(dashboard, /const recording = monitors\[room\]\.recording/);
  assert.match(facility, /<FacilityMap/);
  assert.match(facility, /<aside[^>]+className="facility-sidebar"[^>]*>\s*<SuiteAI/);
  assert.match(source("RoomMonitoring.tsx"), /Suite \$\{room\} monitor: On/);
  assert.match(source("MonitorStatus.tsx"), /All 4 suites/);
  assert.doesNotMatch(source("SuiteAI.tsx"), /suite-ai-stage|Waiting for a hazard event|<footer/);
  assert.doesNotMatch(source("suite-ai.css"), /suite-ai-stage|suite-ai > footer/);
});

test("Dashboard monitoring and Resident Floor share one persistent workflow owner", () => {
  const source = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  const workspace = source("Workspace.tsx"), dashboard = source("MonitoringDashboard.tsx"), floor = source("FacilityWorkspace.tsx");
  assert.match(workspace, /<div hidden=\{page !== "monitor"\}>\s*<MonitoringDashboard key=\{owner \?\? 'signed-out'\}/);
  assert.match(workspace, /<div hidden=\{page !== "spatial"\}><FacilityWorkspace/);
  assert.match(workspace, /onMonitorFrame=\{playback.monitorFrame\} onTracking=\{playback.tracking\} team=\{careTeam\}/);
  assert.match(workspace, /FacilityWorkspace[^\n]+team=\{careTeam\}/);
  assert.equal((workspace.match(/usePlaybackTeam\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(dashboard, /page ===|active &&|usePlaybackTeam|<SuiteAI|<FacilityMap/);
  assert.doesNotMatch(floor, /useReducer|monitorAction|RoomMonitoring|onMonitorFrame|onTracking/);
  assert.match(dashboard, /to=\{suitePath\(monitoringRoom\)\}/);
  assert.match(floor, /to=\{dashboardSuitePath\(monitoringRoom\)\}/);
  assert.match(workspace, /<details className="dashboard-review"><summary>Review additional room data<\/summary>/);
  assert.match(workspace, /<SceneMonitor embedded/);
});
