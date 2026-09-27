import test from "node:test";
import assert from "node:assert/strict";
import { createStationVoicePlayer } from "../src/stationVoicePlayer.ts";
import type { VoiceMessage } from "../src/stationAnnouncement.ts";
const credentials = { code: "test-long-access-code", consent: true };
const message: VoiceMessage = { key: "event-1", announcement: { room: "A101", zone: "Bathroom", priority: "crossing", update: "alert" } };
const mp3 = () => new Response(new Uint8Array([73,68,51,1]), { headers: { "content-type": "audio/mpeg" } });
function setup(fetcher: typeof fetch = async () => mp3(), blocked = false) {
  const sounds: { src: string; paused: boolean; onended: null | (() => void); onerror: null | (() => void); play: () => Promise<void>; pause: () => void }[] = [];
  const revoked: string[] = [], payloads: unknown[] = []; let urls = 0;
  const player = createStationVoicePlayer({ fetch: async (...args) => { payloads.push(JSON.parse(String(args[1]?.body))); return fetcher(...args); },
    createUrl: () => `blob:test-${++urls}`, revokeUrl: url => revoked.push(url),
    createAudio: () => {
      const sound = { src: "", paused: false, onended: null, onerror: null, play: async () => { if (blocked) { blocked = false; throw new Error("blocked"); } }, pause: () => { sound.paused = true; } };
      sounds.push(sound); return sound;
    } });
  return { player, sounds, revoked, payloads };
}
test("speaker generates only after a click with consent, then replays the cached message", async () => {
  const { player, sounds, payloads } = setup();
  assert.equal(payloads.length, 0);
  await player.play(message, { ...credentials, consent: false });
  await player.play(message, { ...credentials, code: "short" });
  assert.equal(payloads.length, 0);
  await player.play(message, credentials);
  assert.equal(player.getSnapshot().phase, "playing");
  assert.deepEqual(payloads[0], { ...message.announcement, nonSensitiveConfirmed: true });
  sounds[0].onended!();
  await player.play(message, credentials);
  assert.equal(payloads.length, 1); assert.equal(sounds.length, 2);
  await player.play(message, credentials); // same active speaker stops
  assert.equal(player.getSnapshot().phase, "idle"); assert.equal(sounds[1].paused, true);
});
test("different updates stop previous speech and revoked setup clears cached audio", async () => {
  const { player, sounds, revoked, payloads } = setup();
  await player.play(message, credentials);
  await player.play({ ...message, key: "event-2", announcement: { ...message.announcement, update: "assigned" } }, credentials);
  assert.equal(sounds[0].paused, true); assert.equal(payloads.length, 2);
  player.reset(); assert.equal(sounds[1].paused, true); assert.equal(revoked.length, 2);
  await player.play(message, credentials); assert.equal(payloads.length, 3);
});
test("navigation or a cancelled request cannot play late audio or allocate stale URLs", async () => {
  let complete!: (response: Response) => void;
  const { player, sounds, revoked } = setup(async () => new Promise(resolve => { complete = resolve; }));
  const pending = player.play(message, credentials);
  player.stop(); complete(mp3()); await pending;
  assert.equal(sounds.length, 0); assert.equal(player.getSnapshot().phase, "idle");
  player.reset(); assert.equal(revoked.length, 0);
});
test("browser autoplay rejection keeps prepared audio for a second click without another paid request", async () => {
  const { player, payloads } = setup(undefined, true);
  await player.play(message, credentials);
  assert.equal(player.getSnapshot().phase, "ready"); assert.match(player.getSnapshot().message, /blocked/);
  await player.play(message, credentials);
  assert.equal(player.getSnapshot().phase, "playing"); assert.equal(payloads.length, 1);
});
test("provider failure is visible, is not retried, and never plays invalid audio", async () => {
  const { player, sounds, payloads } = setup(async () => Response.json({ error: "Enter the private station voice access code." }, { status: 401 }));
  await player.play(message, credentials);
  assert.equal(player.getSnapshot().phase, "error"); assert.match(player.getSnapshot().message, /access code/);
  assert.equal(payloads.length, 1); assert.equal(sounds.length, 0);
  const invalid = setup(async () => new Response("not audio"));
  await invalid.player.play(message, credentials);
  assert.equal(invalid.player.getSnapshot().phase, "error"); assert.equal(invalid.sounds.length, 0);
});
test("replay cache stays bounded and never shares another event's audio", async () => {
  const { player, revoked, payloads } = setup();
  for (let i = 0; i < 14; i++) await player.play({ ...message, key: `event-${i}` }, credentials);
  assert.equal(payloads.length, 14); assert.equal(revoked.length, 2);
  player.reset(); assert.equal(revoked.length, 14);
});
