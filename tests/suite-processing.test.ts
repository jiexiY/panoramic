import test from "node:test";
import assert from "node:assert/strict";
import { playbackStart, playbackDetections, playbackWater, playbackCommand } from "../src/playback.ts";
import { bathroomScene, bathroomRoute } from "../src/facility.ts";
import { proposedResponder, recordedSuiteReply, suiteReport } from "../src/suiteReport.ts";
import { stationAnnouncement } from "../src/stationAnnouncement.ts";
import { readFileSync } from "node:fs";
const now = Date.parse("2026-09-27T00:00:00Z");
test("monitor -> candidate hazard -> route assessment -> station request, with no auto-dispatch", () => {
  const empty=playbackStart(now);
  assert.equal(playbackDetections(empty,{...bathroomScene,observations:bathroomScene.observations.filter(o=>o.kind==="object")},bathroomRoute,now),empty);
  const s=playbackWater(empty,now);
  assert.deepEqual(s.events.map(e=>e.action),["detected","assessed","flagged","station_request"]);
  assert.equal(s.incidents[0].priority,"crossing"); assert.equal(s.incidents[0].phase,"flagged"); assert.equal(s.incidents[0].assigned_to,null);
  assert.equal(s.members.find(m=>m.user_id==="caregiver-01")?.available,true);
  assert.equal(playbackDetections(empty,bathroomScene,null,now).incidents[0].priority,"unassessed");
});
test("proposals respect global occupancy, fall back to a nurse and require supervisor approval", () => {
  const s=playbackWater(playbackStart(now),now), i=s.incidents[0];
  assert.equal(proposedResponder(i,s.members,s.incidents,now)?.user_id,"caregiver-01");
  const occupied=[...s.incidents,{...i,id:"other-suite",room:"A102",phase:"dispatched" as const,assigned_to:"caregiver-01"}];
  assert.equal(proposedResponder(i,s.members,occupied,now)?.user_id,"nurse-01");
  const p={id:i.id,version:i.version,request_id:"approval",caregiver_id:"nurse-01"};
  assert.throws(()=>playbackCommand(s,"caregiver-01","dispatch",p,now),/Only supervision/);
  const approved=playbackCommand(s,"supervisor","dispatch",p,now); assert.equal(approved.incidents[0].assigned_to,"nurse-01");
});
test("suite reports and recorded chat never borrow another suite's incident or mutate records", () => {
  const s=playbackWater(playbackStart(now),now), before=structuredClone(s);
  const report=suiteReport("A102",s.incidents,s.events,s.members); assert.doesNotMatch(report,/A101|water|L3/);
  assert.match(report,/No response records/);
  assert.match(recordedSuiteReply("A101",s.incidents,s.events,s.members,now,"Assign caregiver now"),/I have not assigned anyone/);
  assert.doesNotMatch(recordedSuiteReply("A103",s.incidents,s.events,s.members,now,"Who is available?"),/A101|Caregiver 01/);
  assert.deepEqual(s,before);
  assert.match(stationAnnouncement("A104","near"),/Level two/);
  assert.throws(()=>stationAnnouncement("A999" as never,"near"));
});
test("all follow-up UI is housed in the suite AI system and demo chat is clearly labelled", () => {
  const read=(f:string)=>readFileSync(new URL(`../src/${f}`,import.meta.url),"utf8");
  assert.doesNotMatch(read("FacilityWorkspace.tsx"),/facility-bottom-grid|<IncidentDesk|Active concerns/);
  const panel=read("SuiteAI.tsx"); for(const label of ["Active concerns","Activity","Suite report","<IncidentDesk","<PanoramicAssistant","<StationVoice","<DispatchResponse"]) assert.ok(panel.includes(label));
  assert.match(panel, /<header className="suite-ai-heading"><div><h2>Panoramic AI<\/h2><\/div>/);
  assert.doesNotMatch(panel, /Sparkles/);
  assert.doesNotMatch(read("PanoramicAssistant.tsx"),/if \(team.mode === "playback"\) return/);
  assert.doesNotMatch(read("PanoramicAssistant.tsx"),/assistant-demo-note/);
  assert.doesNotMatch(read("PanoramicAssistant.tsx"),/recordedSuiteReply|localReply/);
  assert.match(read("FacilityWorkspace.tsx"), /supervisor=\{team.me\?\.role === "coordinator"\} active=\{!team.stale\} visible=\{active\}/);
  assert.match(read("StationVoice.tsx"), /if \(!active \|\| !visible \|\| !supervisor\) return/);
  assert.doesNotMatch(read("StationVoice.tsx"), /Automatically announce|<details|<audio|enabled && consent/);
});

test("AI sequence uses Alert and Response while assignment still requires supervision", () => {
  const panel = readFileSync(new URL("../src/SuiteAI.tsx", import.meta.url), "utf8");
  const flow = panel.match(/<ol className="suite-ai-flow"[^>]*>([\s\S]*?)<\/ol>/)![1];
  assert.deepEqual([...flow.matchAll(/>([^<]+)<\/li>/g)].map(m => m[1]), ["Monitor", "Detect", "Alert", "Response"]);
  assert.match(flow, /data-complete=\{!!current\?\.assigned_to\}>Response/);
  assert.match(panel, /Waiting for a supervisor to approve/);
  assert.match(panel, /<DispatchResponse/);
});
