import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseLeakSequence, playbackLeakStep, leakReferenceImage } from "../src/leakSequence.ts";
import { playbackStart, playbackWater, playbackObservation } from "../src/playback.ts";
import { suiteRecords } from "../src/suiteRecords.ts";
import { publishPayload } from "../src/incidents.ts";
const manifest = JSON.parse(readFileSync(new URL("../public/demo/a104-leak-analysis.json", import.meta.url), "utf8"));
const sequence = parseLeakSequence(manifest);
const now = Date.parse("2026-09-27T05:00:00Z");

test("OpenCV manifest is tied to four Google source images and real increasing measurements", () => {
  const sources = ["a104-bathroom-google.jpg", "a104-leak-small-google.jpg", "a104-leak-medium-google.jpg", "a104-leak-large-google.jpg"];
  sequence.steps.forEach((step, index) => {
    const bytes = readFileSync(new URL(`../public/demo/${sources[index]}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.steps[index].source_sha256);
    assert.equal(readFileSync(new URL(`../public${step.image}`, import.meta.url)).subarray(0, 2).toString("hex"), "ffd8");
    if (index) {
      assert.ok(step.changed_pixels > sequence.steps[index-1].changed_pixels);
      assert.ok(manifest.steps[index].registration.inliers >= 20);
      assert.ok(manifest.steps[index].registration.median_error_px < 1.5);
    }
  });
  assert.deepEqual(sequence.steps.map(s => s.priority), ["unassessed", "near", "crossing", "crossing"]);
  for (const name of ["a104-water-leak.gif", "a104-water-leak-opencv.gif"]) assert.match(readFileSync(new URL(`../public/demo/${name}`, import.meta.url)).subarray(0,6).toString(), /^GIF8[79]a$/);
});

test("invalid or contradictory sequence metadata cannot create an assessment", () => {
  for (const mutate of [
    (v: any) => { v.suite = "A102"; },
    (v: any) => { v.steps[1].image = "https://other.example/frame.jpg"; },
    (v: any) => { v.steps[1].priority = "crossing"; },
    (v: any) => { v.steps[1].changed_pixels = -1; },
    (v: any) => { v.steps[1].boxes[0] = [800, 800, 100, 100]; },
    (v: any) => { v.route = []; },
  ]) { const v=structuredClone(manifest); mutate(v); assert.throws(() => parseLeakSequence(v)); }
});

test("A104 opens after a measured change, escalates by step, and never auto-assigns or clears", () => {
  let state = playbackStart(now);
  assert.equal(playbackLeakStep(state, sequence, 0, now), state);
  state = playbackLeakStep(state, sequence, 1, now);
  assert.equal(state.incidents[0].room, "A104");
  assert.equal(state.incidents[0].priority, "near");
  assert.equal(state.incidents[0].assigned_to, null);
  assert.equal(state.incidents[0].phase, "flagged");
  assert.equal(playbackLeakStep(state, sequence, 1, now), state);
  state = playbackLeakStep(state, sequence, 2, now+2000);
  assert.equal(state.incidents.length, 1);
  assert.equal(state.incidents[0].priority, "crossing");
  state = playbackLeakStep(state, sequence, 3, now+4000);
  assert.equal(playbackLeakStep(state, sequence, 0, now+6000), state);
  assert.equal(playbackLeakStep(state, sequence, 1, now+8000), state);
  assert.equal(state.incidents[0].review_observation, null);
  assert.equal(state.incidents[0].nursing_checked_by, null);
  assert.equal(state.members[1].available, true);
  assert.equal(suiteRecords("A102", state.incidents, state.events).incidents.length, 0);
  const i = state.incidents[0];
  assert.throws(() => publishPayload("real", {id:"test",room:"A104",zone:"Bathroom",analysis:i.observation,route:i.route,mediaName:i.media_name,frameTime:i.frame_time}), /provenance/);
});

test("A101 recording and A104 sequence never change each other's follow-up evidence", () => {
  let state = playbackLeakStep(playbackStart(now), sequence, 1, now);
  const leak = state.incidents[0];
  state = playbackWater(state, now);
  assert.equal(state.incidents.length, 2);
  state = playbackObservation(state, "clear", now+1000);
  assert.equal(state.incidents.find(i => i.room === "A104"), leak);
  assert.ok(state.incidents.find(i => i.room === "A101")?.review_observation);
  const bathroom = state.incidents.find(i => i.room === "A101");
  state = playbackLeakStep(state, sequence, 2, now+2000);
  assert.equal(state.incidents.find(i => i.room === "A101"), bathroom);
  assert.match(leakReferenceImage(6), /large/);
  assert.match(leakReferenceImage(4), /medium/);
  assert.match(leakReferenceImage(2), /small/);
});

test("sequence waits for loaded frames; GIF loops do not send unmeasured timer hazards", () => {
  const source = readFileSync(new URL("../src/LeakSequenceMonitor.tsx", import.meta.url), "utf8");
  assert.match(source, /loaded !== index \|\| !enabled \|\| error/);
  assert.match(source, /reported.current.has\(index\)/);
  assert.match(source, /parseLeakSequence\(data\)/);
  assert.doesNotMatch(source, /onClearFrame|monitorFrame\("clear"\)/);
});
