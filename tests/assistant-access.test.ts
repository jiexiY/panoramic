import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAssistantAccess } from "../src/assistantAccess.ts";
import { createGeminiHandler } from "../server/gemini.ts";

const env = { GEMINI_API_KEY: "fixture-not-real", GEMINI_DEMO_ACCESS_CODE: "test-private-code-123456", GEMINI_FREE_TIER_CONFIRMED: "true" };
const request = (body: unknown = { operation: "verify_access" }, code = env.GEMINI_DEMO_ACCESS_CODE, origin = "https://panoramic.test") => new Request("https://panoramic.test/api/gemini", {
  method: "POST", headers: { "Content-Type": "application/json", "x-demo-access-code": code, origin }, body: JSON.stringify(body),
});

test("workspace access verification validates code and origin without provider usage or records", async () => {
  let calls = 0;
  const handler = createGeminiHandler({ fetch: async () => { calls++; throw new Error("No provider call expected"); } });
  assert.equal((await handler(request(undefined, "wrong-code"), env)).status, 401);
  assert.equal((await handler(request(undefined, env.GEMINI_DEMO_ACCESS_CODE, "https://other.test"), env)).status, 403);
  assert.equal((await handler(request({ operation: "verify_access", record: "private" }), env)).status, 400);
  assert.equal((await handler(request(), { ...env, GEMINI_FREE_TIER_CONFIRMED: "false" })).status, 503);
  for (let i = 0; i < 5; i++) {
    const response = await handler(request(), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const text = await response.text(); assert.equal(JSON.parse(text).verified, true);
    assert.doesNotMatch(text, /fixture-not-real|test-private-code/);
  }
  assert.equal(calls, 0);
});

test("workspace-owned access survives consumers and forget or disposal clears secrets", async () => {
  const sent: RequestInit[] = [];
  const access = createAssistantAccess(async (_url, init) => {
    sent.push(init ?? {});
    return Response.json(init?.method === "POST" ? { verified: true } : { configured: true, model: "Gemini" });
  });
  await access.checkConnection();
  access.setCode(env.GEMINI_DEMO_ACCESS_CODE);
  assert.equal(await access.verify(), false); assert.equal(sent.length, 1);
  access.setConsent(true); assert.equal(await access.verify(), true);
  assert.deepEqual(JSON.parse(String(sent[1].body)), { operation: "verify_access" });
  const unsubscribe = access.subscribe(() => {}); unsubscribe();
  assert.equal(access.getSnapshot().verified, true);
  assert.equal(access.getSnapshot().code, env.GEMINI_DEMO_ACCESS_CODE);
  access.forget(); assert.equal(access.getSnapshot().code, ""); assert.equal(access.getSnapshot().consent, false);
  access.setCode(env.GEMINI_DEMO_ACCESS_CODE); access.setConsent(true); await access.verify();
  access.dispose(); assert.equal(access.getSnapshot().code, ""); assert.equal(access.getSnapshot().verified, false);
});

test("wrong codes show errors and late verification cannot unlock changed credentials", async () => {
  let complete!: (response: Response) => void;
  const access = createAssistantAccess(async (_url, init) => init?.method === "POST" ? new Promise(resolve => { complete = resolve; }) : Response.json({ configured: true }));
  await access.checkConnection(); access.setCode(env.GEMINI_DEMO_ACCESS_CODE); access.setConsent(true);
  const first = access.verify(); complete(Response.json({ error: "Enter the workspace access code." }, { status: 401 }));
  assert.equal(await first, false); assert.match(access.getSnapshot().error, /access code/);
  const second = access.verify(); access.setCode("another-long-private-code"); complete(Response.json({ verified: true }));
  assert.equal(await second, false); assert.equal(access.getSnapshot().verified, false);
});

test("all suite chat uses one private workspace setup without the removed banner", () => {
  const read = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  assert.match(read("FacilityWorkspace.tsx"), /<AssistantAccessProvider key=\{`\$\{team.userId\}:\$\{team.facilityId\}:\$\{team.mode\}`\}/);
  assert.match(read("PanoramicAssistant.tsx"), /useAssistantAccess\(\)/);
  assert.doesNotMatch(read("PanoramicAssistant.tsx"), /assistant-demo-note|Gemini · selected suite’s demo records/);
  assert.doesNotMatch(read("assistantAccess.ts"), /localStorage|sessionStorage/);
});
