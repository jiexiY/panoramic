import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDemoSnapshot, demoCareContext } from "../src/demoAssistant.ts";
import { playbackStart, playbackWater } from "../src/playback.ts";
import { createGeminiHandler } from "../server/gemini.ts";

const now = Date.parse("2026-09-27T15:00:00Z");
const state = playbackWater(playbackStart(now), now);
const snapshot = () => buildDemoSnapshot("A101", state.incidents, state.events, state.members, now);
const env = { GEMINI_API_KEY: "not-real-key", GEMINI_DEMO_ACCESS_CODE: "private-fixture-code-1234", GEMINI_FREE_TIER_CONFIRMED: "true" };
const body = () => ({ operation: "demo_assistant", question: "What needs attention?", room: "A101", snapshot: snapshot(), nonSensitiveConfirmed: true });
const request = (data: unknown = body(), code = env.GEMINI_DEMO_ACCESS_CODE) => new Request("https://example.test/api/gemini", { method: "POST", headers: { "content-type": "application/json", "x-demo-access-code": code }, body: JSON.stringify(data) });
const answer = () => ({ paragraphs: [{ text: "A possible bathroom hazard needs supervisor review.", sourceIds: [`incident:${state.incidents[0].id}`] }], action: { kind: "none", incidentId: "", caregiverId: "" } });
const provider = (value: unknown) => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] });

test("demo snapshot contains only selected-suite text, without media, auth or private fields", () => {
  const other = { ...state.incidents[0], room: "A103", id: "other", media_name: "SECRET.jpg" };
  const input = [...state.incidents, other];
  const result = buildDemoSnapshot("A101", input, [...state.events, { ...state.events[0], incident_id: "other", detail: "OTHER-SUITE-DETAIL" }], state.members, now);
  assert.equal(result.records.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|OTHER-SUITE|evidence_path|created_by|user_id|facility_id/);
  assert.equal(buildDemoSnapshot("A103", state.incidents, state.events, state.members, now).records.length, 0);
  assert.equal(buildDemoSnapshot("A101", state.incidents, state.events, state.members, now, "absent").records.length, 0);
});

test("server rebuilds citations, preserves uncertainty and never allows demo assignments", () => {
  const context = demoCareContext(snapshot(), "A101", now);
  assert.match(context.scope, /not authenticated care records/);
  assert.deepEqual(context.allowedAssignments, {});
  assert.equal(context.versions[state.incidents[0].id], 0);
  assert.ok(context.sources.some(s => s.id === "workspace:scope"));
  assert.match(context.sources[0].text, /uncertainty/);
});

test("server rejects cross-suite records, mismatched IDs, duplicates and oversized text", () => {
  const changes = [
    { ...snapshot(), room: "A102" },
    { ...snapshot(), records: [{ ...snapshot().records[0], room: "A102" }] },
    { ...snapshot(), records: [{ ...snapshot().records[0], id: "a103-bedroom-tracking-demo" }] },
    { ...snapshot(), records: [snapshot().records[0], snapshot().records[0]] },
    { ...snapshot(), records: [{ ...snapshot().records[0], summary: "x".repeat(6001) }] },
    { ...snapshot(), records: [{ ...snapshot().records[0], version: -1 }] },
    { ...snapshot(), records: [{ ...snapshot().records[0], events: [{ at: "bad-date", detail: "test" }] }] },
    { ...snapshot(), responders: [{ name: "Nurse", available: "yes" }] },
  ];
  for (const value of changes) assert.throws(() => demoCareContext(value, "A101", now));
});

test("Gemini demo route needs consent, code, valid scope and free-tier configuration before any call", async () => {
  let calls = 0;
  const handle = createGeminiHandler({ fetch: async () => { calls++; return provider(answer()); } });
  assert.equal((await handle(request(body(), "wrong"), env)).status, 401);
  assert.equal((await handle(request(), { ...env, GEMINI_FREE_TIER_CONFIRMED: "false" })).status, 503);
  for (const value of [{ ...body(), nonSensitiveConfirmed: false }, { ...body(), room: "A999" }, { ...body(), question: " " }, { ...body(), question: "x".repeat(1201) }, { ...body(), snapshot: { ...snapshot(), room: "A103" } }]) {
    assert.equal((await handle(request(value), env)).status, 400);
  }
  assert.equal(calls, 0);
});

test("Gemini receives cited demo text with a server-only key and never queries Supabase", async () => {
  let calls = 0;
  const handle = createGeminiHandler({ now: () => now, fetch: async (url, init) => {
    calls++;
    assert.equal(new URL(String(url)).hostname, "generativelanguage.googleapis.com");
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), env.GEMINI_API_KEY);
    const data = JSON.parse(String(init?.body));
    assert.match(data.systemInstruction.parts[0].text, /no tools/);
    assert.match(data.systemInstruction.parts[0].text, /synthetic demo/);
    assert.match(data.contents[0].parts[0].text, /Suite A101 only/);
    assert.doesNotMatch(String(init?.body), /not-real-key|private-fixture|inlineData/);
    return provider(answer());
  } });
  const response = await handle(request(), env);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, "gemini");
  assert.equal(result.model, "gemini-3.5-flash-lite");
  assert.equal(result.snapshotAt, new Date(now).toISOString());
  assert.equal(result.action.kind, "none");
  assert.equal(calls, 1);
});

test("demo model action attempts, invented citations and uncited paragraphs are rejected", async () => {
  const bad = [
    { ...answer(), action: { kind: "review", incidentId: state.incidents[0].id, caregiverId: "" } },
    { ...answer(), action: { kind: "assign", incidentId: state.incidents[0].id, caregiverId: "caregiver-01" } },
    { ...answer(), paragraphs: [{ text: "Wrong suite", sourceIds: ["incident:other-suite"] }] },
    { ...answer(), paragraphs: [{ text: "Uncited", sourceIds: [] }] },
  ];
  for (const value of bad) {
    const handle = createGeminiHandler({ fetch: async () => provider(value) });
    assert.equal((await handle(request(), env)).status, 502);
  }
});

test("free quota exhaustion is explicit, never replaced with preset replies or auto-retried", async () => {
  let calls = 0;
  const handle = createGeminiHandler({ fetch: async () => { calls++; return new Response(null, { status: 429 }); } });
  const response = await handle(request(), env);
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /No automatic retry or paid upgrade/);
  assert.equal(calls, 1);
});

test("chat UI calls Gemini in demo mode and does not persist access codes", () => {
  const ui = readFileSync(new URL("../src/PanoramicAssistant.tsx", import.meta.url), "utf8");
  assert.match(ui, /operation: "demo_assistant"/);
  assert.match(ui, /buildDemoSnapshot\(room,/);
  assert.match(ui, /ready && verified && consent && code.trim\(\).length >= 16/);
  assert.doesNotMatch(ui, /recordedSuiteReply|localReply|localStorage|sessionStorage/);
  assert.match(ui, /cloud!.auth.getSession/); // Real records retain their authenticated path.
});

test("all generated suite tracking captions are shortened without dropping provenance details", () => {
  const script = readFileSync(new URL("../scripts/render-suite-tracking.py", import.meta.url), "utf8");
  assert.match(script, /OpenCV LK TRACKING/);
  assert.doesNotMatch(script, /FEATURE TRACKING|Not live detection/);
  assert.match(script, /Synthetic camera motion \| Human-marked labels \+ route/);
  const ui = readFileSync(new URL("../src/SuiteTrackingMonitor.tsx", import.meta.url), "utf8");
  assert.match(ui, /tracking-captions-4/);
  assert.match(ui, /not a live feed/);
});
