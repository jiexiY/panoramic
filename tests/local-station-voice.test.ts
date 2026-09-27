import test from "node:test";
import assert from "node:assert/strict";
import { createLocalStationVoice } from "../server/localStationVoice.ts";

const localUrl = "http://127.0.0.1:5174/api/elevenlabs";
const announcement = { room: "A103", priority: "near", nonSensitiveConfirmed: true };
const post = (body: unknown = announcement, headers: Record<string, string> = {}) => new Request(localUrl, {
  method: "POST", headers: { "content-type": "application/json", "x-voice-access-code": "test-private-station-code", origin: "http://127.0.0.1:5174", ...headers }, body: JSON.stringify(body),
});

test("local voice status checks production without copying or exposing secrets", async () => {
  const handler = createLocalStationVoice(async (url, options) => {
    assert.equal(String(url), "https://panoramic-app.vercel.app/api/elevenlabs");
    assert.equal(options?.method, "GET");
    assert.equal(new Headers(options?.headers).has("x-voice-access-code"), false);
    return Response.json({ configured: true, irrelevantSecret: "do-not-expose" });
  });
  const result = await handler(new Request(localUrl));
  const status = await result.json();
  assert.equal(status.configured, true);
  assert.equal(status.connection, "production-relay");
  assert.doesNotMatch(JSON.stringify(status), /do-not-expose|played|verified playback/);
  assert.equal(result.headers.get("cache-control"), "no-store");
});

test("local voice rejects unsafe requests before forwarding anything", async () => {
  let calls = 0;
  const handler = createLocalStationVoice(async () => { calls++; return new Response(); });
  assert.equal((await handler(new Request("https://public.example/api/elevenlabs"))).status, 403);
  assert.equal((await handler(new Request(localUrl, { method: "DELETE" }))).status, 405);
  assert.equal((await handler(post(announcement, { origin: "https://unrelated.example" }))).status, 403);
  assert.equal((await handler(post(announcement, { "x-voice-access-code": "" }))).status, 401);
  assert.equal((await handler(post(announcement, { "content-type": "text/plain" }))).status, 415);
  for (const invalid of [null, [], { ...announcement, room: "A999" }, { ...announcement, priority: "safe" },
    { ...announcement, nonSensitiveConfirmed: false }, { ...announcement, text: "private notes" }]) {
    assert.equal((await handler(post(invalid))).status, 400);
  }
  assert.equal((await handler(post({ text: "x".repeat(1025) }))).status, 413);
  assert.equal(calls, 0);
});

test("local voice forwards only the fixed payload and station code and returns playable bytes", async () => {
  let calls = 0;
  const handler = createLocalStationVoice(async (url, options) => {
    calls++;
    assert.equal(String(url), "https://panoramic-app.vercel.app/api/elevenlabs");
    const headers = new Headers(options?.headers);
    assert.deepEqual([...headers.keys()].sort(), ["content-type", "origin", "x-voice-access-code"]);
    assert.equal(headers.get("origin"), "https://panoramic-app.vercel.app");
    assert.equal(headers.get("x-voice-access-code"), "test-private-station-code");
    assert.equal(options?.redirect, "error");
    assert.deepEqual(JSON.parse(String(options?.body)), announcement);
    return new Response(new Uint8Array([73, 68, 51, 1]), { headers: { "content-type": "audio/mpeg" } });
  });
  const result = await handler(post(announcement, { cookie: "private-cookie", authorization: "Bearer unrelated", "xi-api-key": "never-forward" }));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("content-type"), "audio/mpeg");
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal((await result.arrayBuffer()).byteLength, 4);
  assert.equal(calls, 1);
});

test("local voice preserves authentication and quota errors, redacts remote errors, and never retries", async () => {
  for (const status of [401, 429, 503, 504, 500]) {
    let calls = 0;
    const handler = createLocalStationVoice(async () => { calls++; return Response.json({ error: "secret remote error" }, { status }); });
    const result = await handler(post());
    assert.equal(result.status, status === 500 ? 502 : status);
    assert.doesNotMatch(await result.text(), /secret remote error/);
    assert.equal(calls, 1);
  }
  const offline = createLocalStationVoice(async () => { throw new Error("secret failure"); });
  assert.equal((await offline(new Request(localUrl))).status, 502);
  const empty = createLocalStationVoice(async () => new Response(null, { headers: { "content-type": "audio/mpeg" } }));
  assert.equal((await empty(post())).status, 502);
  const unavailable = createLocalStationVoice(async () => Response.json({ configured: false }));
  assert.equal((await (await unavailable(new Request(localUrl))).json()).configured, false);
});
