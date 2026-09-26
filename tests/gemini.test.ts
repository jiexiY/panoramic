import test from "node:test";
import assert from "node:assert/strict";
import { createGeminiHandler } from "../server/gemini.ts";
import { rehearsalScene } from "../src/scene.ts";
const env = { GEMINI_API_KEY: "test-key-never-real", GEMINI_FREE_TIER_CONFIRMED: "true", GEMINI_DEMO_ACCESS_CODE: "test-private-code-123456" };
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZfoAAAAASUVORK5CYII=";
const body = { operation: "analyze", stagedOnly: true, image };
const request = (payload: unknown = body, headers: Record<string, string> = {}) => new Request("https://panoramic.example/api/gemini", { method: "POST", headers: { "Content-Type": "application/json", "x-demo-access-code": env.GEMINI_DEMO_ACCESS_CODE, ...headers }, body: JSON.stringify(payload) });
const response = (value: unknown = rehearsalScene, finishReason = "STOP") => Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] });
const noFetch: typeof fetch = async () => { throw new Error("Should not call Google."); };
test("status exposes readiness but never secrets and does not call Google", async () => {
  const handle = createGeminiHandler({ fetch: noFetch });
  const result = await handle(new Request("https://panoramic.example/api/gemini"), env);
  const text = await result.text(); assert.match(text, /configured.*true/); assert.doesNotMatch(text, /test-key|test-private/);
});

test("readiness identifies incomplete settings using booleans only", async () => {
  const handle = createGeminiHandler({ fetch: noFetch });
  const result = await handle(new Request("https://panoramic.example/api/gemini"), { ...env, GEMINI_DEMO_ACCESS_CODE: "short-private" });
  const text = await result.text();
  const status = JSON.parse(text);
  assert.equal(status.configured, false);
  assert.deepEqual(status.checks, { apiKeyPresent: true, demoAccessCodeValid: false, freeTierConfirmed: true });
  assert.match(status.message, /at least 16 characters/);
  assert.doesNotMatch(text, /test-key|short-private/);
});
test("missing server key, free-tier confirmation, or strong access code disables requests", async () => {
  for (const values of [{}, { ...env, GEMINI_API_KEY: "" }, { ...env, GEMINI_FREE_TIER_CONFIRMED: "false" }, { ...env, GEMINI_DEMO_ACCESS_CODE: "short" }]) {
    const result = await createGeminiHandler({ fetch: noFetch })(request(), values);
    assert.equal(result.status, 503);
  }
});
test("reject wrong access code, cross-origin, unsupported method and content type", async () => {
  const handle = createGeminiHandler({ fetch: noFetch });
  assert.equal((await handle(request(body, { "x-demo-access-code": "wrong" }), env)).status, 401);
  assert.equal((await handle(request(body, { Origin: "https://another.example" }), env)).status, 403);
  assert.equal((await handle(request(body, { "Content-Type": "text/plain" }), env)).status, 415);
  assert.equal((await handle(new Request("https://panoramic.example/api/gemini", { method: "DELETE" }), env)).status, 405);
});
test("reject non-staged material, arbitrary URLs, invalid formats and oversized bodies", async () => {
  const handle = createGeminiHandler({ fetch: noFetch });
  for (const payload of [{ ...body, stagedOnly: false }, { ...body, image: "https://example.com/file" }, { ...body, image: "data:image/jpeg;base64," + btoa("not-a-real-image") }, { operation: "unknown" }, null]) assert.equal((await handle(request(payload), env)).status, 400);
  assert.equal((await handle(request(body, { "content-length": "2200000" }), env)).status, 413);
  assert.equal((await handle(request({ ...body, image: "x".repeat(2_100_001) }), env)).status, 413);
});
test("send inline image and JSON schema with key in header, returning validated provenance", async () => {
  let calls = 0;
  const fakeFetch: typeof fetch = async (url, options) => {
    calls++; assert.equal(String(url), "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    const headers = new Headers(options?.headers); assert.equal(headers.get("x-goog-api-key"), env.GEMINI_API_KEY);
    const sent = JSON.parse(String(options?.body));
    assert.equal(sent.contents[0].parts[0].inlineData.mimeType, "image/png");
    assert.ok(sent.generationConfig.responseJsonSchema); assert.equal(sent.tools, undefined);
    assert.doesNotMatch(String(options?.body), /test-private-code|test-key/);
    return response();
  };
  const result = await createGeminiHandler({ fetch: fakeFetch })(request(), env);
  assert.equal(result.status, 200); const value = await result.json();
  assert.deepEqual(value.scene, rehearsalScene); assert.equal(value.source, "gemini"); assert.equal(calls, 1);
});
test("quota exhaustion does not retry, upgrade, or fabricate a result", async () => {
  let calls = 0;
  const result = await createGeminiHandler({ fetch: async () => { calls++; return new Response("quota", { status: 429 }); } })(request(), env);
  assert.equal(result.status, 429); assert.equal(calls, 1); assert.equal((await result.json()).scene, undefined);
});
test("upstream errors are redacted; invalid and incomplete outputs fail closed", async () => {
  for (const upstream of [new Response("secret provider detail", { status: 403 }), response({}, "MAX_TOKENS"), response({}), Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not json" }] } }] }), response({ ...rehearsalScene, observations: [{ ...rehearsalScene.observations[0], box: [900, 10, 20, 30] }] })]) {
    const result = await createGeminiHandler({ fetch: async () => upstream })(request(), env);
    assert.equal(result.status, 502); assert.doesNotMatch(await result.text(), /secret provider detail|test-key/);
  }
});

test("provider rejection exposes only allowlisted codes, never raw provider details", async () => {
  const upstream = Response.json({ error: { status: "PERMISSION_DENIED", message: "private-key-identifier", details: [{ reason: "API_KEY_SERVICE_BLOCKED", metadata: { key: "private-key-identifier" } }, { reason: "secret-arbitrary-reason" }] } }, { status: 403 });
  const result = await createGeminiHandler({ fetch: async () => upstream })(request(), env);
  const text = await result.text();
  assert.equal(result.status, 502);
  assert.match(text, /HTTP 403; PERMISSION_DENIED; API_KEY_SERVICE_BLOCKED/);
  assert.doesNotMatch(text, /private-key-identifier|secret-arbitrary-reason|test-key|test-private/);
});

test("service unavailable is distinguished from billing and never retried automatically", async () => {
  let calls = 0;
  const result = await createGeminiHandler({ fetch: async () => { calls++; return Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 }); } })(request(), env);
  const value = await result.json();
  assert.equal(calls, 1); assert.equal(value.scene, undefined);
  assert.match(value.error, /HTTP 503; UNAVAILABLE/);
  assert.match(value.error, /temporarily unavailable/);
  assert.match(value.error, /not a payment-required response/);
});
test("network failure produces an explicit failure, not a fallback analysis", async () => {
  const result = await createGeminiHandler({ fetch: async () => { throw new Error("network internal detail"); } })(request(), env);
  assert.equal(result.status, 504); assert.doesNotMatch(await result.text(), /network internal detail/);
});
test("summary uses only the supplied fictional record and returns a draft", async () => {
  const result = await createGeminiHandler({ fetch: async (_url, options) => {
    const data = JSON.parse(String(options?.body)); assert.match(data.systemInstruction.parts[0].text, /Separate AI observations/);
    assert.deepEqual(JSON.parse(data.contents[0].parts[0].text), { fictionalRecord: "Staged spill. Sam acknowledged. Arrival not recorded." });
    return response({ summary: "Draft: possible spill observed; acknowledgment recorded. Arrival remains unconfirmed." });
  } })(request({ operation: "summary", stagedOnly: true, record: "Staged spill. Sam acknowledged. Arrival not recorded." }), env);
  assert.equal(result.status, 200); assert.match((await result.json()).summary, /unconfirmed/);
});
test("invalid summaries are rejected before or after the provider call", async () => {
  assert.equal((await createGeminiHandler({ fetch: noFetch })(request({ operation: "summary", stagedOnly: false, record: "x" }), env)).status, 400);
  assert.equal((await createGeminiHandler({ fetch: noFetch })(request({ operation: "summary", stagedOnly: true, record: "x".repeat(6001) }), env)).status, 400);
  assert.equal((await createGeminiHandler({ fetch: async () => response({ summary: "" }) })(request({ operation: "summary", stagedOnly: true, record: "Demo" }), env)).status, 502);
});
test("per-instance request limit blocks the fifth request without calling the provider", async () => {
  let calls = 0;
  const handle = createGeminiHandler({ fetch: async () => { calls++; return response(); }, now: () => 100000 });
  for (let i = 0; i < 4; i++) assert.equal((await handle(request(), env)).status, 200);
  assert.equal((await handle(request(), env)).status, 429); assert.equal(calls, 4);
});
