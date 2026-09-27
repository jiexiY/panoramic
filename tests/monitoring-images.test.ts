import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { monitoringImage, hasMonitoringImages } from "../src/monitoringImages.ts";
import { initialFloorMonitoring, floorMonitoringReducer } from "../src/floorMonitoring.ts";
import type { RecordingAction } from "../src/recordingObservation.ts";
import { trackingSource } from "../src/suiteTracking.ts";

function jpegDimensions(bytes: Buffer) {
  assert.equal(bytes.subarray(0, 2).toString("hex"), "ffd8");
  let offset = 2;
  while (offset < bytes.length) {
    assert.equal(bytes[offset++], 0xff);
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    if (marker === 0xda || marker === 0xd9) break;
    offset += bytes.readUInt16BE(offset);
  }
  throw new Error("JPEG dimensions missing");
}

test("the two imported JPEGs belong only to A102 and to distinct monitoring zones", () => {
  const bedroom = monitoringImage("A102", "bedroom")!;
  const bathroom = monitoringImage("A102", "bathroom")!;
  assert.ok(bedroom && bathroom);
  assert.notEqual(bedroom.src, bathroom.src);
  assert.match(bedroom.alt, /wheeled laundry hamper/);
  assert.match(bathroom.alt, /level-access shower/);
  for (const image of [bedroom, bathroom]) {
    assert.equal(image.origin, "imported");
    const file = readFileSync(new URL(`../public${image.src}`, import.meta.url));
    assert.equal(file.subarray(0, 2).toString("hex"), "ffd8");
    assert.ok(file.length > 100_000);
    assert.ok(image.width > 0 && image.height > 0);
    assert.match(image.details, /not a live camera feed/);
    assert.match(image.details, /not undergone automated hazard assessment/);
  }
  assert.ok(hasMonitoringImages("A102"));
  for (const room of ["A999", "__proto__"]) {
    assert.equal(hasMonitoringImages(room), false);
    assert.equal(monitoringImage(room, "bedroom"), undefined);
    assert.equal(monitoringImage(room, "bathroom"), undefined);
  }
});

test("five unique generated stills fill the other suite zones without replacing the A101 bathroom", () => {
  const seenPaths = new Set<string>();
  const seenContents = new Set<string>();
  for (const [room, zone] of [["A101", "bedroom"], ["A103", "bedroom"], ["A103", "bathroom"], ["A104", "bedroom"], ["A104", "bathroom"]] as const) {
    const image = monitoringImage(room, zone)!;
    assert.ok(image, `${room} ${zone} has a source`);
    assert.ok(hasMonitoringImages(room));
    assert.equal(image.origin, "generated");
    assert.equal(image.src, `/demo/${room.toLowerCase()}-${zone}-google.jpg`);
    assert.ok(image.alt.includes(room));
    assert.match(image.details, /AI-generated demonstration still/);
    assert.match(image.details, /not undergone automated hazard assessment/);
    assert.match(image.details, /not a live camera feed/);
    const bytes = readFileSync(new URL(`../public${image.src}`, import.meta.url));
    assert.deepEqual(jpegDimensions(bytes), { width: image.width, height: image.height });
    seenPaths.add(image.src);
    seenContents.add(createHash("sha256").update(bytes).digest("hex"));
  }
  assert.equal(seenPaths.size, 5);
  assert.equal(seenContents.size, 5);
  assert.equal(monitoringImage("A101", "bathroom"), undefined);
  assert.equal(initialFloorMonitoring().A101.source, "recording");
});

test("other suite adapters never accept the legacy A101 recording callbacks", () => {
  const state = floorMonitoringReducer(initialFloorMonitoring(), { type: "start" });
  const actions: RecordingAction[] = [
    { type: "play" }, { type: "pause" }, { type: "close" },
    { type: "loaded", version: 0 }, { type: "failed", version: 0 },
  ];
  for (const room of ["A102", "A103", "A104"] as const) {
    assert.equal(state[room].enabled, true);
    assert.equal(state[room].source, "tracking");
    assert.equal(state[room].recording.mode, "closed");
    for (const action of actions) {
      assert.equal(floorMonitoringReducer(state, { type: "recording", room, action }), state);
    }
  }
});

test("still image rendering has local load/retry feedback without workflow side effects", () => {
  const component = readFileSync(new URL("../src/ImportedMonitorImage.tsx", import.meta.url), "utf8");
  assert.match(component, /onLoad=\{\(\) => setStatus\("loaded"\)\}/);
  assert.match(component, /onError=\{\(\) => setStatus\("error"\)\}/);
  assert.match(component, /Retry image/);
  assert.match(component, /width=\{image.width\} height=\{image.height\}/);
  assert.match(component, /AI-GENERATED STILL/);
  assert.doesNotMatch(component, /onRecordingAction|onMonitorFrame|onClearFrame|fetch\(/);
});

test("A104 bathroom tracks its original dry still and the retired leak cannot run from the floor", () => {
  const image = monitoringImage("A104", "bathroom")!;
  assert.equal(image.src, "/demo/a104-bathroom-google.jpg");
  assert.equal(trackingSource("A104", "bathroom")?.stem, "a104-bathroom-tracking");
  assert.ok(trackingSource("A104", "bedroom"));
  assert.match(image.details, /does not verify cleanup or clear any concern/);
  for (const name of ["RoomMonitoring.tsx", "MonitoringDashboard.tsx", "FacilityWorkspace.tsx", "Workspace.tsx", "usePlaybackTeam.ts"]) {
    const source = readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /LeakSequenceMonitor|onLeakStep|playbackLeakStep|leakStep/);
  }
  const room = readFileSync(new URL("../src/RoomMonitoring.tsx", import.meta.url), "utf8");
  assert.match(room, /<ImportedMonitorImage key=\{bathroomImage.src\} image=\{bathroomImage\}/);
  const status = readFileSync(new URL("../src/MonitorStatus.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(status, /Synthetic sequence/);
  assert.match(status, /Generated still/);
});
