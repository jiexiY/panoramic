import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { playbackStart, playbackWater, playbackCommand } from "../src/playback.ts";
import { publishPayload, handoffText } from "../src/incidents.ts";
import { createGeminiHandler } from "../server/gemini.ts";
import { resolveRoute } from "../src/routes.ts";
const now = Date.parse("2026-09-26T18:00:00Z");
test("bathroom playback creates one recording concern and cannot publish it as real inference", () => {
  const empty=playbackStart(now); assert.equal(empty.incidents.length,0);
  const s=playbackWater(empty,now), i=s.incidents[0];
  assert.equal(i.priority,"crossing"); assert.equal(i.phase,"flagged");
  assert.equal(playbackWater(s,now+500).incidents.length,1);
  assert.throws(()=>publishPayload("real-facility",{id:"x",room:"A101",zone:"Bathroom",analysis:i.observation,route:i.route,mediaName:"recording",frameTime:2.5}),/provenance/);
});
test("bathroom workflow requires supervision, assignment, acceptance, arrival and an outcome", () => {
  let s=playbackWater(playbackStart(now),now), n=0;
  const act=(actor:string,action:string,note="")=>{s=playbackCommand(s,actor,action,{id:s.incidents[0].id,version:s.incidents[0].version,request_id:`r${++n}`,caregiver_id:"caregiver-01",note},now+n*1000);};
  assert.throws(()=>act("caregiver-01","acknowledge")); assert.throws(()=>act("caregiver-01","dispatch"));
  act("supervisor","dispatch"); assert.equal(s.incidents[0].phase,"dispatched");
  assert.throws(()=>act("supervisor","acknowledge")); assert.throws(()=>act("caregiver-01","resolve","Too early"));
  act("caregiver-01","acknowledge"); act("caregiver-01","arrive"); assert.throws(()=>act("caregiver-01","resolve","ok"));
  act("caregiver-01","resolve","Checked the floor and recorded follow-up.");
  assert.equal(s.incidents[0].phase,"resolved"); assert.equal(s.events.length,5);
  assert.equal(s.members.find(m=>m.user_id==="caregiver-01")?.available,false);
  const handoff=handoffText(s.incidents[0],s.events,s.members);
  assert.match(handoff,/Checked the floor/); assert.match(handoff,/recording/i);
});
test("playback rejects stale commands and returns declined work to supervision", () => {
  let s=playbackWater(playbackStart(now),now);
  const p={id:s.incidents[0].id,version:0,request_id:"dispatch",caregiver_id:"caregiver-01"};
  s=playbackCommand(s,"supervisor","dispatch",p,now); assert.equal(playbackCommand(s,"supervisor","dispatch",p,now),s);
  assert.throws(()=>playbackCommand(s,"caregiver-01","acknowledge",{...p,request_id:"stale"},now));
  s=playbackCommand(s,"caregiver-01","decline",{...p,version:1,request_id:"decline",note:"Helping someone else"},now);
  assert.equal(s.incidents[0].phase,"flagged"); assert.match(s.events.at(-1)!.detail,/Returned to supervision/);
});
test("daily notes and microphone access are excluded from the prevention release", async () => {
  const workspace=readFileSync(new URL("../src/Workspace.tsx",import.meta.url),"utf8");
  assert.doesNotMatch(workspace,/DailySummary|vocalCues|daily-summary|setPage\("daily"\)/);
  assert.deepEqual(resolveRoute("/app/daily"),{surface:"not-found"});
  const cfg=JSON.parse(readFileSync(new URL("../vercel.json",import.meta.url),"utf8"));
  assert.match(cfg.headers[0].headers.find((h:{key:string})=>h.key==="Permissions-Policy").value,/microphone=\(\)/);
  let calls=0;
  const handler=createGeminiHandler({fetch:async()=>{calls++;return Response.json({});},now:()=>now});
  const response=await handler(new Request("https://test.example/api/gemini",{method:"POST",headers:{"Content-Type":"application/json","x-demo-access-code":"test-access-code-long"},body:JSON.stringify({operation:"audio_cues"})}),{GEMINI_API_KEY:"test-only",GEMINI_FREE_TIER_CONFIRMED:"true",GEMINI_DEMO_ACCESS_CODE:"test-access-code-long"});
  assert.equal(response.status,400); assert.equal(calls,0);
});
