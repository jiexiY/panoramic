import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createStationVoiceQueue, voiceAutoLimits } from "../src/stationVoiceQueue.ts";
import { announcementUpdates, stationAnnouncement, type VoiceMessage } from "../src/stationAnnouncement.ts";
const first: VoiceMessage = { key: "v1", announcement: { room: "A101", priority: "crossing", zone: "Bedroom", update: "alert" } };
test("the explicit connection test stays within the approved 150-character maximum", () => {
  assert.ok(stationAnnouncement("A101", "unassessed", "recorded").length <= 150);
});

test("queue deduplicates monitoring loops, skips prepared clips and paces new text", () => {
  const queue = createStationVoiceQueue();
  const second: VoiceMessage = { ...first, key: "a102", announcement: { ...first.announcement, room: "A102" } };
  assert.equal(queue.next([first, second], 0, () => false), first);
  assert.equal(queue.next([first, second], 15_999, () => false), null);
  assert.equal(queue.next([{ ...first, key: "v2" }, second], 16_000, () => false), second);
  assert.equal(queue.next([first, second], 32_000, () => false), null);
  assert.equal(queue.usage().clips, 2);
  const prepared = createStationVoiceQueue();
  assert.equal(prepared.next([first, second], 0, m => m === first), second);
});
test("session preparation is bounded and does not retry failed or canceled text", () => {
  const queue = createStationVoiceQueue();
  const messages = announcementUpdates.map((update, i) => ({ ...first, key: String(i), announcement: { ...first.announcement, update } }));
  for (let i = 0; i < 30; i++) queue.next(messages, i * voiceAutoLimits.intervalMs, () => false);
  assert.ok(queue.usage().clips <= 12); assert.ok(queue.usage().characters <= 4000);
  assert.equal(queue.exhausted(), true);
});
test("automatic preparation is opt-in, floor-scoped and stops on unavailable access", () => {
  const read = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const voice = read("StationVoice.tsx"), floor = read("FacilityWorkspace.tsx");
  assert.match(voice, /\[automatic, setAutomatic\] = useState\(false\)/);
  assert.match(voice, /!automatic \|\| !ready \|\| !consent \|\| code.length < 16 \|\| !active \|\| !supervisor/);
  assert.match(voice, /document.hidden/);
  assert.match(voice, /player.prepare\(message, \{ code, consent \}\)/);
  assert.match(voice, /if \(!prepared\) \{ setAutomatic\(false\)/);
  assert.match(floor, /messages=\{team.incidents.flatMap/);
  assert.match(floor, /StationVoiceProvider key=\{`\$\{team.userId\}:\$\{team.facilityId\}`\}/);
  assert.doesNotMatch(read("SuiteAI.tsx"), /<StationVoiceProvider/);
});
