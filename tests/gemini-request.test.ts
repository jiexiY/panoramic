import test from "node:test";
import assert from "node:assert/strict";
import { GeminiRequestError, requestGemini } from "../src/geminiRequest.ts";

test("Gemini client returns JSON and sends credentials only to its same-origin endpoint", async () => {
  const result = await requestGemini(async (url, init) => {
    assert.equal(url, "/api/gemini");
    assert.equal(new Headers(init?.headers).get("x-demo-access-code"), "fixture-private-code");
    assert.ok(init?.signal);
    return Response.json({ verified: true });
  }, { method: "POST", headers: { "x-demo-access-code": "fixture-private-code" } });
  assert.deepEqual(result, { verified: true });
});

test("Gemini client bounds stalled fetches and never retries", async () => {
  let calls = 0;
  const stalled: typeof fetch = async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
  };
  await assert.rejects(requestGemini(stalled, {}, 5), (error: unknown) => error instanceof GeminiRequestError && error.status === 504 && /too long/.test(error.message));
  assert.equal(calls, 1);
});

test("Gemini deadline includes response decoding", async () => {
  const stalledBody: typeof fetch = async (_url, init) => {
    const response = Response.json({});
    response.json = () => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
    return response;
  };
  await assert.rejects(requestGemini(stalledBody, {}, 5), /too long/);
});

test("Gemini client redacts HTML, invalid responses and network details", async () => {
  for (const response of [new Response("<html>private upstream details</html>", { status: 504 }), Response.json(null), Response.json([])]) {
    await assert.rejects(requestGemini(async () => response), error => error instanceof GeminiRequestError && !/private upstream/.test(error.message));
  }
  await assert.rejects(requestGemini(async () => { throw new Error("private network detail"); }), error => error instanceof GeminiRequestError && /Check your connection/.test(error.message) && !/private network/.test(error.message));
});

test("Gemini client preserves actionable auth and quota errors without retrying", async () => {
  for (const status of [401, 429]) {
    let calls = 0;
    await assert.rejects(requestGemini(async () => { calls++; return Response.json({ error: "Reconnect or wait." }, { status }); }), error => error instanceof GeminiRequestError && error.status === status && error.message === "Reconnect or wait.");
    assert.equal(calls, 1);
  }
});

test("component cancellation is not relabeled as a provider timeout", async () => {
  const controller = new AbortController();
  const pending = requestGemini(async (_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true })), { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => error instanceof DOMException && error.name === "AbortError");
});
