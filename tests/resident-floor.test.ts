import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");

test("Resident Floor heading has no facility or floor eyebrow in any mode", () => {
  const facility = source("FacilityWorkspace.tsx");
  assert.match(facility, /<h1>\{suite \? `Suite \$\{suite\}` : "Resident Floor"\}<\/h1>/);
  assert.doesNotMatch(facility, /FLOOR 01|RESIDENTIAL CARE|className="eyebrow"/);
});

test("workspace omits the workflow launcher and helper text but retains A101 recording controls", () => {
  assert.doesNotMatch(source("Workspace.tsx"), /playback-start|Run bathroom workflow|Use the recording to walk through a response/);
  assert.doesNotMatch(source("playback.css"), /playback-start/);
  assert.match(source("RoomMonitoring.tsx"), /Play tracking/);
});

test("Resident Floor keeps the map and suite selection; Dashboard owns monitoring", () => {
  const facility = source("FacilityWorkspace.tsx");
  assert.doesNotMatch(facility, /SuitePlan|room-detail|suite-plan-caption|>LAYOUT</);
  assert.match(facility, /<FacilityMap/);
  assert.doesNotMatch(facility, /<RoomMonitoring|room-monitor-workspace/);
  assert.match(facility, /aria-label="Resident Floor suite selection"/);
  assert.match(source("MonitoringDashboard.tsx"), /<RoomMonitoring/);
  assert.match(source("MonitoringDashboard.tsx"), /aria-label="Dashboard suite selection"/);
});

test("Resident Floor omits duplicate labels and sidebar cards while retaining response controls", () => {
  const facility = source("FacilityWorkspace.tsx");
  assert.doesNotMatch(facility, /Care-center floor|Building2|facility-summary|room-directory|CareTeamPanel|facility-assistant-tabs|setSidebar|setFilter/);
  assert.match(facility, /<MonitorStatus \/>/);
  assert.match(facility, /<aside ref=\{incidentRef\} className="facility-sidebar" aria-label="Panoramic assistant">\s*<SuiteAI/);
  assert.doesNotMatch(facility, /facility-bottom-grid|<IncidentDesk/);
  assert.match(source("SuiteAI.tsx"), /<h3>Active concerns<\/h3>/);
  assert.match(source("SuiteAI.tsx"), /<h3>Activity<\/h3>/);
  assert.match(source("SuiteAI.tsx"), /<IncidentDesk/);
  assert.match(source("FacilityMap.tsx"), /suite labels or room tabs/);
  assert.match(source("SceneMonitor.tsx"), /<CareTeamPanel/);
  assert.doesNotMatch(source("Workspace.tsx"), /Monitoring Resident Floor now/);
  assert.doesNotMatch(source("RoomMonitoring.tsx"), /SourceStatus|Source:/);
});

test("sidebar uses text labels and a selected vertical marker without icons or a filled highlight", () => {
  const sidebar = source("Workspace.tsx").match(/<aside className="rail">([\s\S]*?)<\/aside>/)?.[1];
  assert.ok(sidebar);
  assert.doesNotMatch(sidebar, /<(?:Sparkles|Map|Monitor|HandHeart|History|ArrowLeft)\b/);
  for (const label of ["Dashboard", "Resident Floor", "Care session"]) assert.ok(sidebar.includes(label));
  assert.doesNotMatch(sidebar, /Home|Supervision|Scene review|Session history/);
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
  assert.match(source("SuiteAI.tsx"), /<IncidentDesk/);
});

test("recording controls and route concern belong to room monitoring, not the floor header or sidebar", () => {
  const facility = source("FacilityWorkspace.tsx");
  const room = source("RoomMonitoring.tsx");
  assert.doesNotMatch(facility, /Open bathroom recording|Route concern|facility-evidence/);
  assert.match(source("MonitoringDashboard.tsx"), /<RoomMonitoring room=\{room\}/);
  assert.match(source("MonitoringDashboard.tsx"), /priority=\{priorities\[room\] \?\? "unassessed"\}/);
  assert.match(room, /room === "A101" \? \(\s*<section className="facility-evidence" aria-label="Bathroom image data">/);
  assert.match(room, /bathroom monitoring\x60\}[\s\S]*Bathroom image data[\s\S]*room-route-concern/);
  assert.doesNotMatch(room, /evidenceOpen|Open bathroom recording|Close recording/);
  assert.match(room, /routeLevels\[priority\]/);
});

test("floor monitor is always enabled, has no switch, and is distinct from source availability", () => {
  const room = source("RoomMonitoring.tsx");
  const facility = source("FacilityWorkspace.tsx");
  assert.match(facility, /<MonitorStatus \/>/);
  assert.doesNotMatch(facility, /onStopWorkflow|toggleObservation|onObservationChange/);
  assert.match(room, /onError=\{\(\) => onRecordingAction\(\{ type: "failed", version: recording.version \}\)\}/);
  const status = source("MonitorStatus.tsx");
  assert.match(status, /Monitor:/);
  assert.match(status, /aria-label="Resident Floor monitor: On"/);
  assert.match(status, /Monitoring is enabled across the whole Resident Floor/);
  assert.doesNotMatch(status, /Observation:|Playback|role="switch"|onToggle|<button/);
  assert.match(status, /Source: \{recordingSourceLabel\(recording, room\)\}/);
  assert.match(room, /No monitoring source connected/);
  assert.match(status, /aria-hidden="true"/);
  const css = source("room-monitoring.css");
  assert.match(css, /\.monitor-state i \{[^}]*background: #22e65f/);
});

test("the redundant monitoring banner is removed without disabling the floor monitor", () => {
  const workspace = source("Workspace.tsx");
  assert.doesNotMatch(workspace, /className="playback-bar"|Monitoring Resident Floor now/);
  assert.doesNotMatch(workspace, /floorObserving|monitoring paused|onObservationChange/);
  assert.match(source("RoomMonitoring.tsx"), /not a live cleanup detection/);
});

test("suite navigation keeps each source mounted and does not cancel floor-level processing", () => {
  const facility = source("MonitoringDashboard.tsx");
  assert.match(facility, /suiteIds.map\(room =>/);
  assert.match(facility, /const records = suiteRecords\(room, team.incidents, team.events\)/);
  assert.match(facility, /<div key=\{room\} hidden=\{room !== monitoringRoom\}>/);
  assert.match(facility, /action.type === "loaded" && action.version === recording.version && recording.mode === "loading"\) onMonitorFrame\("hazard"\)/);
  assert.doesNotMatch(facility, /onStopWorkflow|workflowScanning|recordingIsOn/);
  assert.doesNotMatch(facility, /recordingAction\(\{ type: "close" \}\).*monitoringRoom/);
});
