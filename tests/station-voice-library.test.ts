import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { demoVoiceMessages, validSavedClip } from "../src/stationVoiceLibrary.ts";
import { playbackStart, playbackWater } from "../src/playback.ts";
import { parseTrackingRun, playbackTracking, trackingSources } from "../src/suiteTracking.ts";
import { voiceText, createStationVoicePlayer } from "../src/stationVoicePlayer.ts";

test("demo audio library includes current and historical fixed texts, deduplicated across suites", () => {
  const now = Date.now(); let state = playbackWater(playbackStart(now), now);
  for (const source of trackingSources) {
    const data = JSON.parse(readFileSync(new URL(`../public/demo/${source.stem}.json`, import.meta.url), "utf8"));
    state = playbackTracking(state, parseTrackingRun(data, source), now);
  }
  const messages = demoVoiceMessages(state.incidents, state.events);
  assert.equal(messages.length, 21);
  assert.equal(new Set(messages.map(voiceText)).size, messages.length);
  assert.ok(messages.reduce((sum, m) => sum + voiceText(m).length, 0) < 8000);
  assert.ok(messages.some(m => m.announcement.room === "A104" && m.announcement.update === "monitoring"));
  assert.doesNotMatch(messages.map(voiceText).join("\n"), /Caregiver 01|free-text notes/);
});
test("stored library validates exact approved text and audio; never trusts arbitrary cached text", () => {
  const message = demoVoiceMessages([], [])[0];
  const clip = { text: voiceText(message), announcement: message.announcement, audio: new Blob(["mp3"], { type: "audio/mpeg" }), createdAt: new Date().toISOString() };
  assert.equal(validSavedClip(clip), true);
  assert.equal(validSavedClip({ ...clip, text: "Private resident note" }), false);
  assert.equal(validSavedClip({ ...clip, audio: new Blob(["html"], { type: "text/html" }) }), false);
  const storage = readFileSync(new URL("../src/stationVoiceLibrary.ts", import.meta.url), "utf8");
  assert.doesNotMatch(storage, /localStorage|sessionStorage|accessCode|apiKey|credentials/);
});
test("restored audio plays without credentials, autoplay, or another provider request", async () => {
  const message = demoVoiceMessages([], [])[0]; let calls = 0, plays = 0;
  const player = createStationVoicePlayer({ fetch: async () => { calls++; throw new Error("unexpected paid request"); }, createUrl: () => "blob:saved-audio", revokeUrl: () => {}, createAudio: () => ({ src: "", play: async () => { plays++; }, pause() {}, onended: null, onerror: null }) });
  player.restore(voiceText(message), new Blob(["mp3"], { type: "audio/mpeg" }));
  assert.equal(plays, 0); assert.equal(player.isPrepared(message), true);
  await player.play(message, { code: "", consent: false });
  assert.equal(plays, 1); assert.equal(calls, 0);
  player.stop();
  await player.play({ ...message, announcement: { ...message.announcement, room: "A102" } }, { code: "", consent: false });
  assert.equal(plays, 1); assert.equal(calls, 0);
});
