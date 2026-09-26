import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseAudioCues,dailySummary,dayKey,type VocalCue} from "../src/vocalCues.ts";
import {playbackStart,playbackWater,playbackCommand} from "../src/playback.ts";
import {publishPayload} from "../src/incidents.ts";
import {validateAudio} from "../server/audio.ts";
import {createGeminiHandler} from "../server/gemini.ts";
const now=Date.parse("2026-09-26T18:00:00Z");
const cue={kind:"humming",clarity:"clear",heard:"Soft wordless humming",repetitions:0,start:0,end:1,uncertainty:"No intelligible words"} as const;
const source=(name:string)=>readFileSync(new URL(`../${name}`,import.meta.url),"utf8");
function wav() {
  const b=Buffer.alloc(32044);b.write("RIFF");b.writeUInt32LE(b.length-8,4);b.write("WAVE",8);b.write("fmt ",12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write("data",36);b.writeUInt32LE(32000,40);return `data:audio/wav;base64,${b.toString("base64")}`;
}
test("playback starts empty and creates exactly one annotated water concern",()=>{
  const empty=playbackStart(now);assert.equal(empty.incidents.length,0);
  const s=playbackWater(empty,now);assert.equal(s.incidents[0].priority,"crossing");assert.equal(s.incidents[0].observation.source,"recording");assert.equal(s.incidents[0].phase,"flagged");assert.equal(playbackWater(s,now+500).incidents.length,1);
  assert.throws(()=>publishPayload("real-facility",{id:"x",room:"A101",zone:"Bathroom",analysis:s.incidents[0].observation,route:s.incidents[0].route,mediaName:"recording",frameTime:2.5}),/provenance/);
});
test("bathroom playback runs supervisor assignment through attributed resolution",()=>{
  let s=playbackWater(playbackStart(now),now);let n=0;
  const act=(actor:string,action:string,note="")=>{s=playbackCommand(s,actor,action,{id:s.incidents[0].id,version:s.incidents[0].version,request_id:`r${++n}`,caregiver_id:"caregiver-01",note},now+n*1000);};
  assert.throws(()=>act("caregiver-01","acknowledge"));assert.throws(()=>act("caregiver-01","dispatch"));
  act("supervisor","dispatch");assert.equal(s.incidents[0].phase,"dispatched");assert.equal(s.members.find(m=>m.user_id==="caregiver-01")?.available,false);
  assert.throws(()=>act("supervisor","acknowledge"));assert.throws(()=>act("caregiver-01","resolve","Too early"));
  act("caregiver-01","acknowledge");act("caregiver-01","arrive");assert.throws(()=>act("caregiver-01","resolve","ok"));
  act("caregiver-01","resolve","Checked the floor and recorded follow-up.");assert.equal(s.incidents[0].phase,"resolved");assert.equal(s.events.length,5);
  const daily=dailySummary(dayKey(now),"all",[],s.incidents,s.events);assert.equal(daily.open.length,0);assert.match(daily.text,/Checked the floor/);assert.match(daily.text,/Recording playback/);
});
test("playback rejects stale and out-of-order actions and returns declined work",()=>{
  let s=playbackWater(playbackStart(now),now);const payload={id:s.incidents[0].id,version:0,request_id:"dispatch",caregiver_id:"caregiver-01"};
  s=playbackCommand(s,"supervisor","dispatch",payload,now);assert.equal(playbackCommand(s,"supervisor","dispatch",payload,now),s);
  assert.throws(()=>playbackCommand(s,"caregiver-01","acknowledge",{...payload,request_id:"stale"},now));
  s=playbackCommand(s,"caregiver-01","decline",{...payload,version:1,request_id:"decline",note:"Helping someone else"},now);assert.equal(s.incidents[0].phase,"flagged");assert.match(s.events.at(-1)!.detail,/Returned to supervision/);
});
test("audio observations preserve humming and reject invented repetition counts",()=>{
  assert.deepEqual(parseAudioCues({cues:[cue]},1),[cue]);assert.deepEqual(parseAudioCues({cues:[]},1),[]);
  for(const change of [{repetitions:4},{start:-1},{end:3},{kind:"diagnosis"},{kind:"repeated_word",repetitions:1},{clarity:undefined},{clarity:"certain"},{kind:"repeated_word",repetitions:2,clarity:"partial"}])assert.throws(()=>parseAudioCues({cues:[{...cue,...change}]},1));
});
test("Panoramic preserves uncertainty in the note and never retains a wholly unclear sentence",()=>{
  const parse=(change:Record<string,unknown>)=>parseAudioCues({cues:[{...cue,...change}]},1)[0];
  assert.equal(parse({kind:"mumbling",clarity:"unclear",heard:"Please bring me water"}).heard,"[unclear?]");
  assert.equal(parse({kind:"speech",clarity:"unclear",heard:"Please bring me water"}).kind,"mumbling");
  assert.equal(parse({clarity:"unclear"}).heard,"[humming?]");
  assert.equal(parse({kind:"other",clarity:"unclear"}).heard,"[unidentified sound?]");
  assert.equal(parse({kind:"speech",clarity:"partial",heard:"water [unclear?]"}).heard,"water [unclear?]");
  assert.equal(parse({kind:"speech",clarity:"partial",heard:"water"}).heard,"water [uncertain?]");
  const long=parse({kind:"speech",clarity:"partial",heard:"a".repeat(400)});assert.ok(long.heard.length<=400);assert.match(long.heard,/\?/);
  assert.deepEqual(parseAudioCues({cues:[long]},1),[long]);
  assert.equal(parse({kind:"repeated_word",repetitions:2,heard:"water, water"}).heard,"water, water");
});
test("daily summary filters by day and room and separates heard words from interpretation",()=>{
  const c:VocalCue={...cue,id:"cue1",room:"A101",recordedAt:new Date(now).toISOString(),source:"caregiver",review:"check",interpretation:"Caregiver requests a check; meaning not confirmed.",reviewer:"Caregiver",reviewedAt:new Date(now).toISOString()};
  const daily=dailySummary(dayKey(now),"A101",[c,{...c,id:"hidden",room:"A102",heard:"DO_NOT_INCLUDE"},{...c,id:"yesterday",recordedAt:new Date(now-86400000).toISOString(),heard:"OLD_CUE"}],[],[]);
  assert.equal(daily.cues.length,1);assert.equal(daily.pending.length,1);assert.match(daily.text,/Note: Soft wordless humming/);assert.match(daily.text,/Review: check/);assert.doesNotMatch(daily.text,/DO_NOT_INCLUDE|OLD_CUE/);assert.doesNotMatch(daily.text,/fall prevented|hazard detected/i);
});
test("automatic notes need no staff transcription or review and export their question marks",()=>{
  const c:VocalCue={...cue,kind:"mumbling",clarity:"unclear",heard:"[unclear?]",id:"automatic-note",room:"A101",recordedAt:new Date(now).toISOString(),source:"gemini",model:"test-model",review:"noted",interpretation:"",reviewer:"",reviewedAt:null};
  const daily=dailySummary(dayKey(now),"all",[c],[],[]);assert.equal(daily.cues.length,1);assert.equal(daily.pending.length,0);assert.match(daily.text,/Note: \[unclear\?\]/);assert.match(daily.text,/Panoramic note/);assert.match(daily.text,/Not added \(optional\)/);
  const component=source("src/DailySummary.tsx");assert.match(component,/review:"noted"/);assert.match(component,/Panoramic takes notes/);assert.match(component,/Staff context & follow-up \(optional\)/);assert.doesNotMatch(component,/What did you hear|Add a caregiver observation|const addManual/);
});
test("normalized WAV is bounded and consent is mandatory",()=>{
  assert.equal(validateAudio({audio:wav(),nonSensitiveConfirmed:true}).duration,1);
  assert.throws(()=>validateAudio({audio:wav(),nonSensitiveConfirmed:false}));
  assert.throws(()=>validateAudio({audio:"data:audio/wav;base64,AAAA",nonSensitiveConfirmed:true}));
});
test("audio endpoint validates structured cues without creating a care incident",async()=>{
  let calls=0,prompt="";
  const fetcher:typeof fetch=async(_url,init)=>{calls++;prompt=JSON.parse(String(init?.body)).systemInstruction.parts[0].text;return Response.json({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify({cues:[cue]})}]}}]});};
  const env={GEMINI_API_KEY:"test-only",GEMINI_FREE_TIER_CONFIRMED:"true",GEMINI_DEMO_ACCESS_CODE:"test-audio-access-12345"};
  const body={operation:"audio_cues",audio:wav(),nonSensitiveConfirmed:true};
  const req=new Request("https://test.example/api/gemini",{method:"POST",headers:{"Content-Type":"application/json","x-demo-access-code":env.GEMINI_DEMO_ACCESS_CODE},body:JSON.stringify(body)});
  const response=await createGeminiHandler({fetch:fetcher,now:()=>now})(req,env);assert.equal(response.status,200);assert.equal(calls,1);const data=await response.json();assert.equal(data.cues[0].kind,"humming");assert.equal(data.cues[0].clarity,"clear");assert.match(prompt,/Never convert humming/);assert.match(prompt,/question mark/);assert.match(prompt,/staff do not need to listen or transcribe/);
});
test("recording requires consent, stops at twenty seconds, and stops tracks on cleanup",()=>{
  const component=source("src/DailySummary.tsx");assert.match(component,/if\(!consent \|\| busy \|\| recording/);assert.match(component,/setTimeout\(stop,20000\)/);assert.match(component,/getTracks\(\).forEach\(t=>t.stop\(\)\)/);assert.match(component,/request.current\?\.abort\(\)/);
  assert.doesNotMatch(component,/localStorage|sessionStorage/);
  const cfg=JSON.parse(source("vercel.json"));assert.match(cfg.headers[0].headers.find((h:{key:string})=>h.key==="Permissions-Policy").value,/microphone=\(self\)/);
});
