import { useEffect, useRef, useState } from "react";
import { Download, Mic, Square, Upload, Headphones, Check } from "lucide-react";
import { rooms, phaseLabels } from "./incidents";
import type { CareTeam } from "./useCareTeam";
import { prepareAudio } from "./audioCapture";
import { audioNote, cueLabels, dailySummary, dayKey, parseAudioCues, type VocalCue } from "./vocalCues";
import "./daily.css";

export default function DailySummary({team,cues,onAdd,onReview,onResponse}:{team:CareTeam;cues:VocalCue[];onAdd:(cues:VocalCue[])=>void;onReview:(id:string,change:Partial<VocalCue>)=>void;onResponse:()=>void}) {
  const [day,setDay] = useState(()=>dayKey(Date.now()));
  const [room,setRoom] = useState("all");
  const [captureRoom,setCaptureRoom] = useState("A101");
  const [consent,setConsent] = useState(false);
  const [code,setCode] = useState("");
  const [configured,setConfigured] = useState(false);
  const [clip,setClip] = useState<Awaited<ReturnType<typeof prepareAudio>>|null>(null);
  const [recording,setRecording] = useState(false);
  const [seconds,setSeconds] = useState(0);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const recorder = useRef<MediaRecorder|null>(null), stream = useRef<MediaStream|null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout>|null>(null), tick = useRef<ReturnType<typeof setInterval>|null>(null);
  const generation = useRef(0), request = useRef<AbortController|null>(null), locked = useRef(false), clipUrl = useRef("");
  const summary = dailySummary(day,room,cues,team.incidents,team.events);
  const stop = () => { if(recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach(t=>t.stop()); if(stopTimer.current) clearTimeout(stopTimer.current); if(tick.current) clearInterval(tick.current); setRecording(false); };
  useEffect(()=>{const abort=new AbortController();void fetch("/api/gemini",{signal:abort.signal}).then(r=>r.json()).then(r=>setConfigured(r.configured===true)).catch(()=>{});
    return ()=>{generation.current++;abort.abort();request.current?.abort();if(recorder.current){recorder.current.onstop=null;if(recorder.current.state==="recording")recorder.current.stop();}stream.current?.getTracks().forEach(t=>t.stop());if(stopTimer.current)clearTimeout(stopTimer.current);if(tick.current)clearInterval(tick.current);if(clipUrl.current)URL.revokeObjectURL(clipUrl.current);};},[]);
  const openClip = async(blob:Blob) => {
    const version=++generation.current; setError(""); setNotice(""); setBusy(true);
    try {const prepared=await prepareAudio(blob);if(version!==generation.current){URL.revokeObjectURL(prepared.url);return;}if(clipUrl.current)URL.revokeObjectURL(clipUrl.current);clipUrl.current=prepared.url;setClip(prepared);}
    catch(e){if(version===generation.current)setError(e instanceof Error?e.message:"Could not decode audio.");}
    finally{if(version===generation.current)setBusy(false);}
  };
  const record = async() => {
    if(!consent || busy || recording || locked.current)return;
    locked.current=true;setError("");const version=++generation.current;
    try {
      if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")throw new Error("Recording is unavailable in this browser. Import a short audio clip instead.");
      const audio=await navigator.mediaDevices.getUserMedia({audio:true});
      if(version!==generation.current){audio.getTracks().forEach(t=>t.stop());return;}
      stream.current=audio;const r=new MediaRecorder(audio);recorder.current=r;const chunks:Blob[]=[];
      r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      r.onstop=()=>{audio.getTracks().forEach(t=>t.stop());if(version===generation.current)void openClip(new Blob(chunks,{type:r.mimeType}));};
      r.onerror=()=>{stop();setError("Recording interrupted. Review the clip before continuing.");};
      r.start();setRecording(true);setSeconds(0);tick.current=setInterval(()=>setSeconds(s=>s+1),1000);stopTimer.current=setTimeout(stop,20000);
    }catch(e){stream.current?.getTracks().forEach(t=>t.stop());setError(e instanceof Error?e.message:"Microphone permission was not granted.");}
    finally{locked.current=false;}
  };
  const analyze = async() => {
    if(!clip || !consent || !code || !configured || locked.current)return;
    locked.current=true;setBusy(true);setError("");setNotice("");const version=generation.current, abort=new AbortController();request.current=abort;
    const timeout=setTimeout(()=>abort.abort(),40000);
    try {
      const response=await fetch("/api/gemini",{method:"POST",signal:abort.signal,headers:{"Content-Type":"application/json","x-demo-access-code":code},body:JSON.stringify({operation:"audio_cues",audio:clip.data,nonSensitiveConfirmed:true})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||"Audio analysis failed.");
      if(result.source!=="gemini" || typeof result.model!=="string")throw new Error("Missing audio analysis provenance.");
      const observations=parseAudioCues(result,clip.duration);if(version!==generation.current)return;
      const at=new Date().toISOString();
      onAdd(observations.map(c=>({...c,id:crypto.randomUUID(),room:captureRoom,recordedAt:at,source:"gemini",model:result.model,review:"noted",interpretation:"",reviewer:"",reviewedAt:null})));
      setNotice(observations.length ? `${observations.length} Panoramic audio notes saved. Staff context is optional.` : "No audible notes returned. No warning was inferred.");
      if(clipUrl.current)URL.revokeObjectURL(clipUrl.current);clipUrl.current="";setClip(null);
    }catch(e){if(version===generation.current)setError(e instanceof Error && e.name!=="AbortError"?e.message:"Audio request stopped. No cue was added.");}
    finally{clearTimeout(timeout);locked.current=false;if(version===generation.current)setBusy(false);}
  };
  const download = () => {const url=URL.createObjectURL(new Blob([summary.text],{type:"text/plain;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`panoramic-daily-${day}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <div className="daily-page">
    <header className="page-heading"><div><p className="eyebrow">LISTEN · NOTE · FOLLOW UP</p><h1>Daily summary</h1><p className="intro">Panoramic's audio notes and environmental concerns, in one handoff.</p></div><button className="secondary" onClick={download}><Download size={16}/> Export summary</button></header>
    <div className="daily-filters"><label>Date<input type="date" value={day} onChange={e=>setDay(e.target.value)}/></label><label>Room<select value={room} onChange={e=>setRoom(e.target.value)}><option value="all">All rooms</option>{rooms.map(r=><option key={r}>{r}</option>)}</select></label><span>Audio notes: this tab · export to keep</span></div>
    <div className="daily-stats"><div><b>{summary.cues.length}</b><span>Audio notes</span></div><div><b>{summary.pending.length}</b><span>Marked for follow-up</span></div><div><b>{summary.concerns.length}</b><span>Environmental concerns</span></div><div><b>{summary.open.length}</b><span>Responses still open</span></div></div>
    <div className="daily-columns"><section className="card listen-card"><div className="card-title"><Headphones size={20}/><h2>Panoramic takes notes</h2></div><p>Panoramic writes down audible words, mumbling and humming from a short recording. Unclear words become [unclear?]; uncertain fragments keep a ?. Staff can add context, but do not need to transcribe.</p>
      <label className="team-field">Room for this recording<select value={captureRoom} onChange={e=>setCaptureRoom(e.target.value)} disabled={recording||busy}>{rooms.map(r=><option key={r}>{r}</option>)}</select></label>
      <label className="listen-consent"><input type="checkbox" checked={consent} onChange={e=>{setConsent(e.target.checked);if(!e.target.checked){generation.current++;stop();}}} disabled={busy}/><span>I have permission to record. This is a non-sensitive test clip; only Create audio notes sends it to Google.</span></label>
      <div className="button-row">{recording?<button className="primary recording" onClick={stop}><Square size={15}/> Stop · {seconds}s / 20s</button>:<button className="primary" disabled={!consent||busy} onClick={()=>void record()}><Mic size={16}/> Start listening</button>}<label className="secondary audio-upload"><Upload size={15}/> Import clip<input type="file" aria-label="Import audio clip" accept="audio/*" disabled={busy||recording} onChange={e=>{const file=e.target.files?.[0];if(file)void openClip(file);e.target.value="";}}/></label></div>
      {clip&&<div className="clip-review"><audio controls src={clip.url} aria-label="Optional audio playback"/><small>{clip.duration.toFixed(1)} seconds · playback is optional</small><label className="team-field">Workspace access code<input type="password" value={code} onChange={e=>setCode(e.target.value)} autoComplete="off"/></label><button className="primary full" disabled={!configured||!consent||!code||busy||recording} onClick={()=>void analyze()}>{busy?"Panoramic is taking notes…":"Create audio notes"}</button>{!configured&&<small>AI connection is not configured on this deployment.</small>}</div>}
      {error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className="cue-notice" role="status">{notice}</p>}
    </section><section className="card daily-response"><h2>Environment & response</h2><p>Visual concerns and response history for this day.</p>{!summary.concerns.length?<div className="daily-empty">No environmental records for this date.</div>:summary.concerns.map(i=><article key={i.id}><div><b>{i.room} · {i.zone}</b><span>{phaseLabels[i.phase]}</span></div><p>{i.observation.scene.brief}</p><small>{i.observation.source==="recording"?"Recording playback":"Image analysis"}</small><ol>{team.events.filter(e=>e.incident_id===i.id&&dayKey(e.created_at)===day).map(e=><li key={e.id}><time>{new Date(e.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</time>{e.detail}</li>)}</ol>{i.resolution&&<p className="recorded-note">{i.resolution}</p>}<button className="text-button" onClick={onResponse}>Open supervision</button></article>)}</section></div>
    <section className="daily-cues"><div className="card-title"><Mic size={19}/><h2>Panoramic audio notes</h2></div>{!summary.cues.length?<div className="card daily-empty">No audio notes for this date. Panoramic adds notes after a recording is analyzed.</div>:summary.cues.map(c=><CueCard key={c.id} cue={c} reviewer={team.mode==="playback"?"Playback caregiver":team.me?.display_name||"Caregiver"} onReview={onReview}/>)}</section>
  </div>;
}
function CueCard({cue,reviewer,onReview}:{cue:VocalCue;reviewer:string;onReview:(id:string,change:Partial<VocalCue>)=>void}) {
  const [note,setNote]=useState(cue.interpretation),[review,setReview]=useState<VocalCue["review"]>(cue.review);
  return <article className="card cue-card"><div className="cue-heading"><div><b>{cue.room} · {cueLabels[cue.kind]}</b><small>Added {new Date(cue.recordedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} · {cue.source==="gemini"?"Noted by Panoramic · Gemini":"Caregiver observation"}</small></div><span className={`cue-state ${cue.review}`}>{cue.review==="noted"?"Noted":cue.review==="pending"?"Review requested":cue.review==="check"?"Check requested":cue.review==="routine"?"Familiar cue":"Follow-up recorded"}</span></div><p className="cue-heard">{audioNote(cue)}</p><small>{cue.start.toFixed(1)}–{cue.end.toFixed(1)}s{cue.repetitions>0?` · ${cue.repetitions} audible repetitions`:""} · {cue.clarity==="clear"?"Model reported clear audio":cue.clarity==="partial"?"Partly heard / uncertain":"Unclear audio"}</small>{cue.uncertainty&&<p className="cue-uncertainty">{cue.uncertainty}</p>}<details className="cue-context"><summary>Staff context & follow-up (optional)</summary><div className="cue-review"><label className="team-field">Context or action<textarea maxLength={700} value={note} onChange={e=>setNote(e.target.value)} placeholder="Add familiar context or what you checked. The original Panoramic note stays unchanged."/></label><label className="team-field">Follow-up<select value={review} onChange={e=>setReview(e.target.value as VocalCue["review"])}><option value="noted">Noted — no review requested</option><option value="pending">Request review</option><option value="routine">Familiar cue — no change noted</option><option value="check">Ask supervision to check</option><option value="handled">Follow-up recorded</option></select></label><button className="secondary" disabled={note.trim().length<4} onClick={()=>onReview(cue.id,{interpretation:note.trim(),review,reviewer,reviewedAt:new Date().toISOString()})}><Check size={15}/> Save context</button></div></details>{cue.reviewedAt&&<small className="cue-reviewed">Context saved by {cue.reviewer} · {new Date(cue.reviewedAt).toLocaleTimeString()}</small>}</article>;
}
