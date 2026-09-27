import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { trackingSources, trackingSource, trackingStages, parseTrackingRun, playbackTracking, trackingReference } from "../src/suiteTracking.ts";
import { playbackStart, playbackWater, playbackObservation } from "../src/playback.ts";
import { parseLeakSequence, playbackLeakStep } from "../src/leakSequence.ts";
import { assessRouteHazard, highestRoutePriority } from "../src/routeRisk.ts";
import { suiteRecords } from "../src/suiteRecords.ts";
import { publishPayload } from "../src/incidents.ts";

const file = (path: string) => readFileSync(new URL(`../public${path}`, import.meta.url));
const manifests = trackingSources.map(s => JSON.parse(file(`/demo/${s.stem}.json`).toString()));
const runs = manifests.map((m, n) => parseTrackingRun(m, trackingSources[n]));
const now = Date.parse("2026-09-27T06:00:00Z");

test("seven source-bound OpenCV runs retain measured feature identities and valid media", () => {
  assert.equal(runs.length, 7);
  runs.forEach((run, n) => {
    const m = manifests[n];
    assert.equal(run.frames, 120);
    assert.equal(run.resultDelayMs, 9000);
    assert.deepEqual(m.cycle.stages, trackingStages);
    assert.equal(createHash("sha256").update(file(m.source)).digest("hex"), m.source_sha256);
    assert.match(file(run.gif).subarray(0, 6).toString(), /^GIF8[79]a$/);
    for (const image of [run.poster, run.reference]) assert.equal(file(image).subarray(0, 2).toString("hex"), "ffd8");
    assert.ok(run.minTracks >= 200);
    assert.ok(run.maxError < .1);
    assert.match(run.scene.uncertainty, /human-marked/);
    for (const frame of m.measurements) {
      assert.deepEqual(frame.regions.map((r: any) => r.id), m.measurements[0].regions.map((r: any) => r.id));
      assert.ok(frame.regions.every((r: any) => r.support >= 3));
    }
    const first = m.measurements[0].features.find((p: number[]) => p[0] === 20);
    const later = m.measurements[12].features.find((p: number[]) => p[0] === 20);
    assert.ok(first && later);
    assert.notDeepEqual(first, later, "a stable feature ID has measured displacement");
  });
  assert.deepEqual(runs.map(r => highestRoutePriority(r.scene.observations, r.route)), ["near", "unassessed", "crossing", "near", "unassessed", "crossing", "unassessed"]);
  assert.equal(trackingSource("A999", "bedroom"), undefined);
  assert.equal(trackingSource("A101", "bathroom"), undefined);
});

test("L2 and L3 sample results agree between every OpenCV frame and app geometry", () => {
  const expected: Record<string, string> = {
    "a102-bedroom-tracking": "near", "a103-bathroom-tracking": "near",
    "a101-bedroom-tracking": "crossing", "a103-bedroom-tracking": "crossing",
  };
  for (const m of manifests) {
    for (const frame of m.measurements) {
      const route = { name: "sample", source: "recording" as const, margin: 40, points: frame.route.map(([x,y]: number[]) => ({x,y})) };
      for (const r of frame.regions) {
        if (r.kind === "object") continue;
        const measured = assessRouteHazard({ ...r, evidence: "Human-marked demo" }, route).priority;
        assert.equal(measured, expected[m.gif.split("/").at(-1).replace(".gif", "")]);
        assert.equal(r.priority, measured, `${m.suite} ${m.zone} frame ${frame.frame}`);
      }
    }
  }
  let state = playbackWater(playbackStart(now), now);
  for (const run of runs) state = playbackTracking(state, run, now);
  const basket = state.incidents.find(i => i.room === "A102" && i.zone === "Bedroom")!;
  const towel = state.incidents.find(i => i.room === "A103" && i.zone === "Bathroom")!;
  for (const incident of [basket, towel]) {
    assert.equal(incident.priority, "near");
    assert.match(incident.observation.scene.brief, /near/);
    assert.match(state.events.find(e => e.incident_id === incident.id && e.action === "assessed")!.detail, /L2/);
    assert.match(state.events.find(e => e.incident_id === incident.id && e.action === "station_request")!.detail, /[Ll]evel two/);
  }
  assert.equal(state.incidents.filter(i => i.priority === "crossing").length, 3);
  assert.equal(state.incidents.filter(i => i.priority === "near").length, 2);
});

test("invalid, cross-suite, missing, low-confidence or duplicate tracks are rejected", () => {
  for (const mutate of [
    (m: any) => { m.suite = "A103"; },
    (m: any) => { m.zone = "Bathroom"; },
    (m: any) => { m.gif = "https://other.example/file.gif"; },
    (m: any) => { m.source_sha256 = "missing"; },
    (m: any) => { m.measurements.pop(); },
    (m: any) => { m.measurements[1].feature_count = 2; },
    (m: any) => { m.measurements[1].median_fit_error_px = 5; },
    (m: any) => { m.measurements[1].features[1] = m.measurements[1].features[0]; },
    (m: any) => { m.measurements[1].regions[1].support = 0; },
    (m: any) => { m.measurements[1].regions[1].kind = "object"; },
    (m: any) => { m.measurements[1].regions[1].box = [800, 800, 20, 20]; },
    (m: any) => { m.measurements[1].route = []; },
    (m: any) => { m.version = 1; },
    (m: any) => { m.cycle.loop = false; },
    (m: any) => { m.cycle.result_frame = 0; },
    (m: any) => { m.cycle.stages[0].end = 120; },
    (m: any) => { m.measurements[1].stage = "settled"; },
  ]) { const m = structuredClone(manifests[0]); mutate(m); assert.throws(() => parseTrackingRun(m, trackingSources[0])); }
});

test("table, basket, rug and towel get distinct suite/zone records; fixtures create no incidents", () => {
  let state = playbackStart(now);
  for (const run of runs) state = playbackTracking(state, run, now);
  assert.equal(state.incidents.length, 4);
  assert.equal(state.events.length, 12);
  assert.equal(suiteRecords("A101", state.incidents, state.events).incidents.length, 1);
  assert.equal(suiteRecords("A102", state.incidents, state.events).incidents.length, 1);
  const a103 = suiteRecords("A103", state.incidents, state.events);
  assert.equal(a103.incidents.length, 2);
  assert.equal(a103.events.length, 6);
  assert.deepEqual(a103.incidents.map(i => i.zone).sort(), ["Bathroom", "Bedroom"]);
  assert.equal(suiteRecords("A104", state.incidents, state.events).incidents.length, 0);
  assert.ok(state.incidents.every(i => i.phase === "flagged" && !i.assigned_to && !i.closure_requested && !i.review_observation));
  for (const run of runs) assert.equal(playbackTracking(state, run, now + 60000), state);
  const resolved = { ...state, incidents: state.incidents.map(i => ({ ...i, phase: "resolved" as const })) };
  for (const run of runs) assert.equal(playbackTracking(resolved, run, now + 120000), resolved);
});

test("tracking cannot clear, replace or cross-share A101/A104 evidence", () => {
  const sequence = parseLeakSequence(JSON.parse(file("/demo/a104-leak-analysis.json").toString()));
  let state = playbackLeakStep(playbackWater(playbackStart(now), now), sequence, 2, now);
  const existing = [...state.incidents];
  for (const run of runs) state = playbackTracking(state, run, now);
  assert.equal(state.incidents.length, 6);
  for (const i of existing) assert.equal(state.incidents.find(n => n.id === i.id), i);
  const tracked = state.incidents.filter(i => i.media_name.endsWith("-tracking.gif") && i.media_name !== "bathroom-tracking.gif");
  state = playbackObservation(state, "clear", now + 1000);
  for (const i of tracked) assert.equal(state.incidents.find(n => n.id === i.id), i);
  const i = tracked[0];
  assert.throws(() => publishPayload("real", { id: "test", room: i.room, zone: i.zone, analysis: i.observation, route: i.route, mediaName: i.media_name, frameTime: i.frame_time }), /provenance/);
});

test("report reference frames are scoped to room, zone AND measured media", () => {
  for (const r of runs) {
    assert.equal(trackingReference(r.source.room, r.source.zone, `${r.source.stem}.gif`), r.reference);
    assert.equal(trackingReference("A999", r.source.zone, `${r.source.stem}.gif`), "");
    assert.equal(trackingReference(r.source.room, r.source.zone === "bedroom" ? "Bathroom" : "Bedroom", `${r.source.stem}.gif`), "");
  }
});

test("A101 bedroom cannot suppress the bathroom incident or receive its follow-up evidence", () => {
  const bedroom = runs.find(r => r.source.room === "A101")!;
  let state = playbackTracking(playbackStart(now), bedroom, now);
  const originalBedroom = state.incidents[0];
  // Bedroom-only startup must not receive bathroom clear/hazard/unavailable input.
  for (const value of ["clear", "hazard", "unknown"] as const) assert.equal(playbackObservation(state, value, now), state);
  state = playbackWater(state, now + 2500);
  assert.equal(state.incidents.length, 2);
  assert.deepEqual(state.incidents.map(i => i.zone).sort(), ["Bathroom", "Bedroom"]);
  for (const value of ["clear", "hazard", "unknown"] as const) {
    state = playbackObservation(state, value, now + 3000);
    assert.equal(state.incidents.find(i => i.zone === "Bedroom"), originalBedroom);
    assert.equal(state.incidents.find(i => i.zone === "Bathroom")?.version, {clear:1, hazard:2, unknown:3}[value]);
  }
  assert.equal(playbackWater(state, now + 5000), state);
  assert.equal(trackingReference("A101", "Bedroom", originalBedroom.media_name), "/demo/a101-bedroom-tracking-reference.jpg");
});

test("A101 heading and description identify the table while retaining synthetic provenance", () => {
  const source = trackingSource("A101", "bedroom")!;
  assert.equal(source.heading, "BEDROOM · OVERBED TABLE TRACKING");
  assert.match(source.description!, /wheeled overbed table/);
  assert.match(source.description!, /Google Studio-generated/);
  const component = readFileSync(new URL("../src/SuiteTrackingMonitor.tsx", import.meta.url), "utf8");
  assert.match(component, /source.heading \?\?/);
  assert.match(component, /source.description && <p/);
  const hook = readFileSync(new URL("../src/usePlaybackTeam.ts", import.meta.url), "utf8");
  assert.match(hook, /some\(i=>isBathroomRecording\(i\)/);
});

test("UI only reports loaded measured assets while local monitoring is enabled", () => {
  const source = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
  const component = source("SuiteTrackingMonitor.tsx");
  assert.match(component, /!enabled.*loaded !== media.*error.*reported.current/);
  assert.match(component, /parseTrackingRun\(data, source\)/);
  assert.match(component, /controller.abort\(\)/);
  assert.match(component, /Retry tracking/);
  assert.match(component, /playing \? run.resultDelayMs : 0/);
  assert.match(component, /return \(\) => clearTimeout\(timer\)/);
  assert.match(component, /if \(reported.current\) return/);
  assert.doesNotMatch(component, /onClearFrame|monitorFrame\("clear"\)/);
  assert.match(source("MonitoringDashboard.tsx"), /demoEnabled=\{autoStartRecording\}/);
  assert.match(source("RoomMonitoring.tsx"), /enabled=\{demoEnabled\} onMeasured=\{onTracking\}/);
});

test("A104 dry fixture loop cannot generate a leak or clear existing evidence", () => {
  const run = runs.find(r => r.source.room === "A104" && r.source.zone === "bathroom")!;
  const manifest = manifests[trackingSources.indexOf(run.source)];
  assert.equal(manifest.source, "/demo/a104-bathroom-google.jpg");
  assert.match(run.source.description!, /no water overlay or leak animation/);
  assert.deepEqual(run.scene.observations.map(o => o.label), ["Toilet", "Sink", "Shower seat", "Shower fixture"]);
  assert.ok(run.scene.observations.every(o => o.kind === "object"));
  const empty = playbackStart(now);
  assert.equal(playbackTracking(empty, run, now), empty);
  const legacy = playbackLeakStep(empty, parseLeakSequence(JSON.parse(file("/demo/a104-leak-analysis.json").toString())), 2, now);
  assert.equal(playbackTracking(legacy, run, now + 1000), legacy);
  const component = readFileSync(new URL("../src/SuiteTrackingMonitor.tsx", import.meta.url), "utf8");
  assert.match(component, /playing && enabled \? run.gif : run.poster/);
  assert.match(component, /"Show result" : "Replay tracking"/);
  assert.doesNotMatch(component, /stillOnly/);
});

test("every loop builds in order and holds the same measured result for three seconds", () => {
  for (const m of manifests) {
    for (const stage of trackingStages) {
      assert.ok(m.measurements.slice(stage.start,stage.end).every((f: any) => f.stage === stage.name));
    }
    const settled = m.measurements[90];
    for (const frame of m.measurements.slice(90)) {
      assert.deepEqual(frame.regions, settled.regions);
      assert.deepEqual(frame.route, settled.route);
    }
    assert.equal((m.frames - m.cycle.result_frame) / m.fps, 3);
  }
});
