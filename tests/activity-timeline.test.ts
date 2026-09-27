import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activityTime, analysisActivity, appendActivity, dashboardActivity, trackingActivity, type ActivityEntry } from "../src/activityTimeline.ts";
import { playbackStart } from "../src/playback.ts";
import { parseTrackingRun, playbackTracking, trackingSources } from "../src/suiteTracking.ts";
import type { Analysis } from "../src/scene.ts";

const at = "2026-09-27T16:20:30.000Z";
const runs = trackingSources.map(source => parseTrackingRun(JSON.parse(readFileSync(new URL(`../public/demo/${source.stem}.json`, import.meta.url), "utf8")), source));
const source = (name: string) => readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");

test("activity contains only the selected suite's response, L2/L3 concerns and event timestamps", () => {
  let state = playbackStart(Date.parse(at));
  for (const run of runs) state = playbackTracking(state, run, Date.parse(at));
  const local = runs.map(run => trackingActivity(run, at));
  const rows = dashboardActivity("A103", state.incidents, state.events, local);
  assert.ok(rows.length > 5);
  assert.ok(rows.every(row => row.room === "A103" && row.at === at));
  assert.match(rows.map(row => row.text).join(" "), /L2 · Near route/);
  assert.match(rows.map(row => row.text).join(" "), /L3 · Crosses route/);
  assert.match(rows.map(row => row.text).join(" "), /towel/i);
  assert.doesNotMatch(JSON.stringify(rows), /A101|A102|A104/);
  assert.deepEqual(dashboardActivity("A103", state.incidents, state.events, local), rows);
});

test("fixture-only suites report measured results without inventing incidents or safety clearance", () => {
  const local = runs.map(run => trackingActivity(run, at));
  const rows = dashboardActivity("A104", [], [], local);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.text.includes("Fixture tracking only")));
  assert.ok(rows.every(row => row.text.includes("not a safety clearance")));
  assert.deepEqual(dashboardActivity("A101", [], [], []), []);
});

test("response updates use their stored time and retain earlier activity without duplicating the concern", () => {
  const state = playbackTracking(playbackStart(Date.parse(at)), runs[0], Date.parse(at));
  const current = state.incidents.find(i => i.room === "A102")!;
  const later = "2026-09-27T17:05:00.000Z";
  const incident = { ...current, phase: "arrived" as const, updated_at: later };
  const event = { id: "arrival", incident_id: incident.id, actor_id: "caregiver", action: "arrive", detail: "Arrival confirmed by caregiver.", created_at: later };
  const rows = dashboardActivity("A102", [incident], [...state.events, event, { ...event, id: "orphan", incident_id: "other-suite" }], []);
  assert.equal(rows[0].at, later);
  assert.match(rows[0].text, /Caregiver attending/);
  assert.equal(rows.filter(row => row.id.startsWith("response:")).length, 1);
  assert.ok(rows.some(row => row.id === "event:arrival"));
  assert.ok(rows.some(row => row.at === at));
  assert.ok(!rows.some(row => row.id === "event:orphan"));
});

test("replay and rerender do not duplicate settled tracking or change event time", () => {
  const first = trackingActivity(runs[0], at);
  const entries = appendActivity([], first);
  assert.equal(appendActivity(entries, trackingActivity(runs[0], "2026-09-27T17:20:30Z")), entries);
  assert.equal(entries[0].at, at);
  assert.equal(appendActivity(entries, { ...first, id: "invalid", at: "invalid" }), entries);
  assert.equal(activityTime("invalid"), "Time unavailable");
  assert.match(activityTime(at), /^\d{2}:\d{2}:\d{2}$/);
});

test("living-area results use provider analysis timestamps and survive alongside later response updates", () => {
  const analysis: Analysis = { source: "gemini", model: "test-model", analyzedAt: at, scene: { observations: [], brief: "Visible walkway has no identified obstruction.", uncertainty: "One frame only." } };
  const row = analysisActivity("frame-1", "A102", "Living area", analysis);
  assert.equal(row.at, at);
  assert.match(row.text, /One frame only/);
  const later: ActivityEntry = { ...row, id: "later", at: "2026-09-27T17:00:00Z", text: "New result" };
  assert.deepEqual(dashboardActivity("A102", [], [], [row, later, row]).map(e => e.id), ["later", row.id]);
  assert.deepEqual(dashboardActivity("A103", [], [], [row, later]), []);
});

test("dashboard Activity replaces old review cards and keeps explicit suite-bound analysis", () => {
  const activity = source("DashboardActivity.tsx"), scene = source("SceneMonitor.tsx");
  assert.doesNotMatch(source("Workspace.tsx"), /dashboard-review|Review additional room data/);
  assert.doesNotMatch(source("RoomMonitoring.tsx"), /SourceStatus|Source:/);
  assert.match(activity, /role="log"/);
  assert.match(activity, /\[\{activityTime\(row.at\)\}\]/);
  assert.match(activity, /not a live camera/);
  assert.match(activity, /key=\{`\$\{room\}:\$\{team.mode\}`\}/);
  assert.match(activity, /scopeRoom=\{room\}/);
  assert.match(scene, /!activityMode && <aside className="response-column"/);
  assert.match(scene, /team.incidents.filter\(i => i.room === \(scopeRoom \?\? room\)\)/);
  assert.doesNotMatch(scene, /team.incidents.find\(\(i\) => i.phase/);
  assert.match(scene, /disabled=\{!!scopeRoom \|\| locked/);
  assert.match(scene, /activityMode \? "Living area"/);
  assert.match(scene, /onAnalysis\?\.\(recordId, zone, value\)/);
  assert.match(scene, /Analysis sends this frame to Google/);
  assert.match(scene, /!privacyConfirmed/);
  assert.match(source("MonitoringDashboard.tsx"), /key=\{team.facilityId \?\? "local"\}/);
});

test("living-area empty-state prompt disappears after suite Activity results arrive", () => {
  const activity = source("DashboardActivity.tsx");
  assert.match(activity, /\(rows.length === 0 \|\| analysisOpen\) && <div className="activity-living-area"/);
  assert.match(activity, /onAnalysis=\{\(id, zone, analysis\) => \{\s*setAnalyses\([\s\S]*?setAnalysisOpen\(false\);/);
  assert.equal(dashboardActivity("A104", [], [], []).length, 0);
  const entries = runs.map(run => trackingActivity(run, at));
  assert.ok(dashboardActivity("A104", [], [], entries).length > 0);
  assert.equal(dashboardActivity("A104", [], [], entries.filter(row => row.room !== "A104")).length, 0);
});
