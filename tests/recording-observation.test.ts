import test from "node:test";
import assert from "node:assert/strict";
import { initialRecording, recordingIsOn, recordingReducer } from "../src/recordingObservation.ts";
import { suiteOverlaySize, suiteOverlayStyle } from "../src/floorPresentation.ts";
import { readFileSync } from "node:fs";

test("manual On requests playback but is not active until the image loads", () => {
  assert.equal(recordingIsOn(initialRecording, true, "A101"), false);
  const loading = recordingReducer(initialRecording, { type: "play" });
  assert.equal(loading.mode, "loading");
  assert.equal(recordingIsOn(loading, true, "A101"), false);
  const playing = recordingReducer(loading, { type: "loaded", version: loading.version });
  assert.equal(recordingIsOn(playing, true, "A101"), true);
  assert.equal(recordingIsOn(playing, false, "A101"), false);
  assert.equal(recordingIsOn(playing, true, "A102"), false);
});

test("manual Off stops playback and ignores late image loads", () => {
  const loading = recordingReducer(initialRecording, { type: "play" });
  const paused = recordingReducer(loading, { type: "pause" });
  assert.equal(paused.mode, "still");
  assert.equal(recordingIsOn(paused, true, "A101"), false);
  assert.deepEqual(recordingReducer(paused, { type: "loaded", version: loading.version }), paused);
  const closed = recordingReducer(paused, { type: "close" });
  assert.equal(closed.mode, "closed");
  assert.deepEqual(recordingReducer(closed, { type: "loaded", version: closed.version }), closed);
  assert.deepEqual(recordingReducer(initialRecording, { type: "pause" }), initialRecording);
});

test("media failure turns observation off; stale failures cannot stop a new playback", () => {
  const loading = recordingReducer(initialRecording, { type: "play" });
  const failed = recordingReducer(loading, { type: "failed", version: loading.version });
  assert.equal(failed.mode, "error");
  assert.equal(recordingIsOn(failed, true, "A101"), false);
  const retry = recordingReducer(failed, { type: "play" });
  assert.deepEqual(recordingReducer(retry, { type: "failed", version: loading.version }), retry);
  assert.equal(recordingReducer(retry, { type: "loaded", version: retry.version }).mode, "playing");
});

test("all suite overlays are grey and translucent without an assessed concern", () => {
  assert.deepEqual(suiteOverlaySize, { width: 4.5, depth: 7.3, height: 1.18 });
  for (const priority of [undefined, "unassessed", "object"] as const) {
    const style = suiteOverlayStyle(priority, false);
    assert.equal(style.color, "#9ea7ad");
    assert.ok(style.opacity > 0 && style.opacity < 1);
  }
  assert.ok(suiteOverlayStyle(undefined, true).opacity > suiteOverlayStyle(undefined, false).opacity);
  assert.equal(suiteOverlayStyle("crossing", false).color, "#652b26");
});

test("suite labels remain selectable and track camera projection above the overlay", () => {
  const map = readFileSync(new URL("../src/FacilityMap.tsx", import.meta.url), "utf8");
  assert.match(map, /new THREE.PlaneGeometry\(suiteOverlaySize.width, suiteOverlaySize.depth\)/);
  assert.match(map, /depthWrite: false/);
  assert.match(map, /group.localToWorld\(labelAnchor\).project\(camera\)/);
  assert.match(map, /aria-label=\{\x60Select suite \$\{id\}\x60\}/);
  assert.match(map, /onClick=\{\(\) => props.onSelect\(id\)\}/);
});
