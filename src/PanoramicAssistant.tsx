import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, FileText, MessageSquare, Settings2, Trash2 } from "lucide-react";
import { cloud } from "./cloud";
import type { CareTeam } from "./useCareTeam";
import type { AssistantResult } from "./copilot";
import DispatchResponse from "./DispatchResponse";
import type { SuiteId } from "./suiteRecords";
import "./assistant.css";

type Turn = { id: string; question: string; result?: AssistantResult; error?: string };
export default function PanoramicAssistant({ team, room, selectedId, onSelect, onSignIn }: {
  team: CareTeam; room?: SuiteId; selectedId: string; onSelect: (id: string, room: string) => void; onSignIn: () => void;
}) {
  const incidents = room ? team.incidents.filter(i => i.room === room) : team.incidents;
  const [question, setQuestion] = useState("");
  const [scopeId, setScopeId] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [settings, setSettings] = useState(false);
  const [ready, setReady] = useState(false);
  const [model, setModel] = useState("Gemini");
  const [status, setStatus] = useState("Checking connection…");
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  useEffect(() => { setScopeId(selectedId && incidents.some(i => i.id === selectedId) ? selectedId : ""); }, [selectedId, team.facilityId, room]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/gemini", { signal: controller.signal }).then(r => r.json()).then(r => {
      setReady(r.configured === true); setModel(r.model || "Gemini");
      setStatus(r.configured ? "Server configured; answer connection not yet verified" : "AI connection is not configured");
    }).catch(() => { if (!controller.signal.aborted) setStatus("AI connection unavailable"); });
    return () => { controller.abort(); abortRef.current?.abort(); };
  }, []);
  useEffect(() => { if (turns.length) endRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); }, [busy, turns]);
  const canAsk = !!team.facility && !team.stale && ready && consent && !!code && !busy;
  const ask = async (text: string) => {
    if (!canAsk || inFlight.current || !text.trim() || !cloud || !team.facilityId) { if (!consent || !code) setSettings(true); return; }
    inFlight.current = true; setBusy(true); setQuestion("");
    const id = crypto.randomUUID();
    const controller = new AbortController(); abortRef.current = controller;
    setTurns(t => [...t.slice(-9), { id, question: text.trim() }]);
    try {
      const session = await cloud.auth.getSession();
      if (!session.data.session) throw new Error("Sign in again to read your care-team records.");
      const response = await fetch("/api/gemini", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-demo-access-code": code, Authorization: `Bearer ${session.data.session.access_token}` },
        body: JSON.stringify({ operation: "assistant", question: text.trim(), facilityId: team.facilityId, room, incidentId: scopeId, nonSensitiveConfirmed: consent }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The request could not be completed.");
      if (!controller.signal.aborted) setTurns(t => t.map(turn => turn.id === id ? { ...turn, result } : turn));
    } catch (e) {
      if (!controller.signal.aborted) setTurns(t => t.map(turn => turn.id === id ? { ...turn, error: e instanceof Error ? e.message : "Request failed. No action was taken." } : turn));
    } finally { if (!controller.signal.aborted) { setBusy(false); inFlight.current = false; } }
  };
  if (team.mode === "playback") return <section className="card"><h2>Response brief{room && ` · ${room}`}</h2>{incidents.length ? incidents.map(i=><div key={i.id}><p>{i.room} · {i.zone}</p><p>{i.observation.scene.brief}</p><p>{i.assigned_to ? `Assigned: ${team.members.find(m=>m.user_id===i.assigned_to)?.display_name}` : "Waiting for supervision to assign a responder."}</p>{i.resolution&&<p>{i.resolution}</p>}<button className="secondary full" onClick={()=>onSelect(i.id,i.room)}>Open response record</button></div>) : <p>{room ? `No response records for Suite ${room}.` : "Waiting for the recorded tracking event."}</p>}<small>Generated from playback records · no model request</small></section>;
  return <section className="panoramic-assistant card" aria-label="Panoramic AI">
    <header className="assistant-heading"><div><MessageSquare size={19} /><h2>Panoramic AI</h2></div>
      <div><button className="text-button" aria-label="AI connection settings" aria-expanded={settings} onClick={() => setSettings(!settings)}><Settings2 size={16} /></button>
        <button className="text-button" aria-label="Clear conversation" disabled={busy || !turns.length} onClick={() => setTurns([])}><Trash2 size={15} /></button></div>
    </header>
    <div className="assistant-scope"><FileText size={14} /><select aria-label="AI record scope" value={scopeId} onChange={e => setScopeId(e.target.value)} disabled={busy}>
      <option value="">{room ? `Suite ${room} · open concerns` : "Open concerns"}</option>{incidents.map(i => <option key={i.id} value={i.id}>{i.room} · {i.zone} · {new Date(i.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</option>)}
    </select><ChevronDown size={12} /></div>
    {settings && <div className="assistant-settings"><label className="team-field">Workspace access code<input type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} /></label>
      <label className="assistant-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>My question and the selected records contain no sensitive resident information. Send their text to Google for this answer.</span></label>
      <small>{model} · {status}</small></div>}
    <div className="assistant-messages" aria-live="polite" aria-busy={busy}>
      {!turns.length && <div className="assistant-empty"><MessageSquare size={25} /><h3>What needs attention?</h3><p>Ask about a concern, available responders, or the response timeline.</p>
        {!team.userId ? <button className="secondary" onClick={onSignIn}>Sign in to your workspace</button> : !team.facility ? <p>Connect a care team to open its records.</p> : <div className="assistant-starters">
          {["Which concerns still need a response?", "Who is available to check this concern?", "Summarize the response so far."].map(text => <button key={text} onClick={() => { setQuestion(text); if (!consent || !code) setSettings(true); }}>{text}<ArrowUp size={13} /></button>)}
        </div>}
      </div>}
      {turns.map(turn => {
        const result = turn.result;
        const target = result && incidents.find(i => i.id === result.action.incidentId);
        const outdated = !!result && Object.entries(result.versions).some(([id, version]) => incidents.find(i => i.id === id)?.version !== version);
        return <div key={turn.id} className="assistant-turn"><p className="assistant-question">{turn.question}</p>
          {turn.error && <p className="form-error" role="alert">{turn.error}</p>}
          {result && <div className="assistant-answer"><small>Panoramic AI · {new Date(result.analyzedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
            {result.paragraphs.map((p, n) => <div key={n}><p>{p.text}</p><div className="assistant-citations">{p.sourceIds.map(id => { const source = result.sources.find(s => s.id === id); if (!source) return null; return <details key={id}><summary>{source.title}</summary><p>{source.text}</p>{source.incidentId && <button className="text-button" onClick={() => { const i = incidents.find(i => i.id === source.incidentId); if (i) onSelect(i.id, i.room); }}>Open response record</button>}{source.url && <a href={source.url} target="_blank" rel="noreferrer">Read source</a>}</details>; })}</div></div>)}
            <details className="assistant-evidence"><summary>Records used</summary><p>{result.scope}</p><p>Retrieved {new Date(result.snapshotAt).toLocaleString()} · {result.model}</p></details>
            {outdated && <p className="assistant-stale">Records have changed since this answer. Ask again for an updated summary.</p>}
            {target && result.action.kind === "review" && <button className="secondary full" onClick={() => onSelect(target.id, target.room)}>Open {target.room} response</button>}
            {target && result.action.kind === "assign" && !outdated && <DispatchResponse team={team} incident={target} preferred={result.action.caregiverId} />}
          </div>}
        </div>;
      })}
      {busy && <p className="assistant-thinking" role="status">Reading your workspace records…</p>}<div ref={endRef} />
    </div>
    <form className="assistant-composer" onSubmit={e => { e.preventDefault(); void ask(question); }}>
      <textarea aria-label="Ask Panoramic AI" value={question} onChange={e => setQuestion(e.target.value)} maxLength={1200} placeholder="Ask about your care workspace…" rows={2} disabled={!team.facility || busy} />
      <button className="primary" type="submit" aria-label="Send question" disabled={!canAsk || !question.trim()}><ArrowUp size={17} /></button>
    </form>
    {team.facility && !canAsk && !busy && <button className="assistant-unlock text-button" onClick={() => setSettings(true)}>{team.stale ? "Reconnect care team to continue" : !ready ? status : "Set up AI access"}</button>}
  </section>;
}
