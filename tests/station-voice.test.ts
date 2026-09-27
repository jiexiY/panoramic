import test from "node:test";
import assert from "node:assert/strict";
import { createElevenLabsHandler } from "../server/elevenlabs.ts";
import { stationAnnouncement } from "../src/stationAnnouncement.ts";
const env = { ELEVENLABS_API_KEY: "server-only-test-key", ELEVENLABS_VOICE_ID: "voice-test", ELEVENLABS_ACCESS_CODE: "voice-access-code-for-test", ELEVENLABS_USAGE_CONFIRMED: "true" };
const body = { room: "A101", priority: "crossing", nonSensitiveConfirmed: true };
const post = (data: unknown = body, headers: Record<string,string> = {}) => new Request("https://app.example/api/elevenlabs", { method: "POST", headers: { "Content-Type": "application/json", "x-voice-access-code": env.ELEVENLABS_ACCESS_CODE, ...headers }, body: JSON.stringify(data) });

test("ElevenLabs status never exposes credentials and cannot claim verified playback", async () => {
  const handler = createElevenLabsHandler();
  const r = await handler(new Request("https://app.example/api/elevenlabs"), env);
  const value = await r.text(); assert.doesNotMatch(value, /server-only-test-key|voice-access-code-for-test/); assert.match(value, /verified only after/);
  assert.equal((await handler(post(), {})).status, 503);
  assert.equal((await handler(post(), {...env,ELEVENLABS_USAGE_CONFIRMED:"false"})).status,503);
});
test("voice requests require code, same origin, consent, valid scope and a fixed template", async () => {
  let calls = 0;
  const handler = createElevenLabsHandler({ fetch: async () => { calls++; return new Response(); } });
  assert.equal((await handler(post(body, {"x-voice-access-code":"wrong"}), env)).status,401);
  assert.equal((await handler(post(body, {origin:"https://evil.example"}), env)).status,403);
  for (const invalid of [null, [], {...body,nonSensitiveConfirmed:false}, {...body,room:"A999"}, {...body,room:["A101"]}, {...body,priority:"safe"}, {...body,text:"private resident notes"}]) assert.equal((await handler(post(invalid), env)).status,400);
  assert.equal((await handler(post({text:"x".repeat(1025)}),env)).status,413);
  assert.equal(calls,0);
});
test("only the exact approved announcement reaches ElevenLabs and binary audio returns privately", async () => {
  let calls = 0;
  const handler = createElevenLabsHandler({ fetch: async (url, options) => {
    calls++; assert.equal(String(url),"https://api.elevenlabs.io/v1/text-to-speech/voice-test?output_format=mp3_44100_128");
    assert.equal(new Headers(options?.headers).get("xi-api-key"),env.ELEVENLABS_API_KEY);
    assert.deepEqual(JSON.parse(String(options?.body)),{text:stationAnnouncement("A101","crossing"),model_id:"eleven_multilingual_v2"});
    return new Response(new Uint8Array([73,68,51,1]),{headers:{"Content-Type":"audio/mpeg"}});
  }});
  const response = await handler(post(),env); assert.equal(response.status,200);
  assert.equal(response.headers.get("Cache-Control"),"no-store"); assert.equal((await response.arrayBuffer()).byteLength,4); assert.equal(calls,1);
});
test("provider failures are redacted, quota limited, and never auto-retried", async () => {
  let calls = 0;
  const handler = createElevenLabsHandler({fetch:async()=>{calls++;return Response.json({secret:"not-for-client"},{status:500});},now:()=>60000});
  for(let i=0;i<4;i++) { const r=await handler(post(),env); assert.equal(r.status,502); assert.doesNotMatch(await r.text(),/not-for-client/); }
  assert.equal((await handler(post(),env)).status,429); assert.equal(calls,4);
  const quota=createElevenLabsHandler({fetch:async()=>new Response(null,{status:429})});
  assert.equal((await quota(post(),env)).status,429);
});
