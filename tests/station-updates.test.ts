import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { announcementUpdates, eventVoiceMessage, incidentVoiceMessage, parseAnnouncementRequest, stationAnnouncement } from "../src/stationAnnouncement.ts";
import { playbackStart, playbackWater } from "../src/playback.ts";
import { createElevenLabsHandler } from "../server/elevenlabs.ts";
import { createLocalStationVoice } from "../server/localStationVoice.ts";

const now = Date.parse("2026-09-27T00:00:00Z");
const incident = playbackWater(playbackStart(now), now).incidents[0];
test("every station update uses an allowlisted, zone-specific fixed announcement", () => {
  for (const update of announcementUpdates) {
    const data = { room: "A103", zone: "Bedroom", priority: "near", update, nonSensitiveConfirmed: true };
    assert.deepEqual(parseAnnouncementRequest(data), data);
    assert.match(stationAnnouncement("A103", "near", update, "Bedroom"), /suite A103, bedroom/);
  }
  for (const invalid of [{ update: "read private notes" }, { update: ["alert"] }, { update: null }, { zone: "Resident Jane" }, { zone: ["Bathroom"] }, { text: "medical detail" }, { event: { detail: "medical detail" } }]) {
    assert.equal(parseAnnouncementRequest({ room: "A101", priority: "near", nonSensitiveConfirmed: true, ...invalid }), null);
  }
});
test("current message follows the response lifecycle and does not close on an outcome alone", () => {
  const update = (extra: Partial<typeof incident>) => incidentVoiceMessage("A101", { ...incident, ...extra })!.announcement.update;
  assert.equal(update({}), "alert");
  assert.equal(update({ phase: "dispatched" }), "assigned");
  assert.equal(update({ phase: "acknowledged" }), "acknowledged");
  assert.equal(update({ phase: "arrived" }), "arrived");
  assert.equal(update({ closure_requested: true }), "closure_requested");
  assert.equal(update({ supervision_checked_by: "supervisor" }), "supervision_checked");
  assert.equal(update({ phase: "resolved" }), "response_recorded");
  assert.equal(update({ phase: "resolved", supervision_checked_by: "supervisor", nursing_checked_by: "nurse" }), "closed");
  assert.equal(incidentVoiceMessage("A102", incident), null);
});
test("historical activity never reads free text, another suite, or the current route level", () => {
  const event = { id: "e", incident_id: incident.id, actor_id: "private-name", action: "resolve", detail: "private resident medical note", created_at: "2026-09-27T00:00:00Z" };
  const message = eventVoiceMessage("A101", event, [incident])!;
  assert.equal(message.announcement.update, "closure_requested");
  assert.equal(message.announcement.priority, "unassessed");
  assert.doesNotMatch(JSON.stringify(message), /private|medical|crossing/);
  assert.equal(eventVoiceMessage("A102", event, [incident]), null);
  assert.equal(eventVoiceMessage("A101", { ...event, incident_id: "missing" }, [incident]), null);
  assert.equal(eventVoiceMessage("A101", { ...event, action: "new-unknown-action" }, [incident])!.announcement.update, "recorded");
  assert.equal(eventVoiceMessage("A101", { ...event, action: "__proto__" }, [incident])!.announcement.update, "recorded");
});
test("server and local relay support typed updates without forwarding private text", async () => {
  const data = { room: "A102", zone: "Bathroom", priority: "unassessed", update: "assigned", nonSensitiveConfirmed: true };
  const env = { ELEVENLABS_API_KEY: "test-server-key", ELEVENLABS_VOICE_ID: "test-voice", ELEVENLABS_ACCESS_CODE: "test-long-access-code", ELEVENLABS_USAGE_CONFIRMED: "true" };
  let calls = 0;
  const handler = createElevenLabsHandler({ fetch: async (_url, options) => {
    calls++; assert.equal(JSON.parse(String(options?.body)).text, stationAnnouncement("A102", "unassessed", "assigned", "Bathroom"));
    return new Response(new Uint8Array([73,68,51]), { headers: { "content-type": "audio/mpeg" } });
  } });
  const post = (body: unknown) => new Request("https://app.example/api/elevenlabs", { method: "POST", headers: { "content-type": "application/json", "x-voice-access-code": env.ELEVENLABS_ACCESS_CODE }, body: JSON.stringify(body) });
  assert.equal((await handler(post(data), env)).status, 200);
  assert.equal((await handler(post({ ...data, text: "private" }), env)).status, 400);
  assert.equal(calls, 1);
  assert.equal((await (await handler(new Request("https://app.example/api/elevenlabs"), env)).json()).updatesSupported, true);
  const relay = createLocalStationVoice(async (_url, options) => {
    if (options?.method === "GET") return Response.json({ configured: true, updatesSupported: true });
    assert.deepEqual(JSON.parse(String(options?.body)), data);
    return new Response(new Uint8Array([73,68,51]), { headers: { "content-type": "audio/mpeg" } });
  });
  assert.equal((await relay(new Request("http://127.0.0.1:5174/api/elevenlabs", { method: "POST", headers: { "content-type": "application/json", "x-voice-access-code": env.ELEVENLABS_ACCESS_CODE }, body: JSON.stringify(data) }))).status, 200);
  assert.equal((await (await relay(new Request("http://127.0.0.1:5174/api/elevenlabs"))).json()).updatesSupported, true);
});
test("speaker controls belong to messages and activity, not a separate voice panel", () => {
  const ui = readFileSync(new URL("../src/SuiteAI.tsx", import.meta.url), "utf8");
  const voice = readFileSync(new URL("../src/StationVoice.tsx", import.meta.url), "utf8");
  assert.match(ui, /<StationVoice message=\{voiceMessage\}/);
  assert.match(ui, /<StationVoice message=\{eventVoiceMessage/);
  assert.doesNotMatch(voice, /<details|Automatically announce|localStorage|sessionStorage/);
  assert.match(voice, /aria-label=\{label\}/);
  assert.match(voice, /showModal/);
  assert.match(voice, /state.phase === "error"/); // incorrect access code remains recoverable
});
