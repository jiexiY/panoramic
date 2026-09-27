import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, FileText, MessageSquare, Settings2, Trash2 } from "lucide-react";
import { cloud } from "./cloud";
import type { CareTeam } from "./useCareTeam";
import type { AssistantResult } from "./copilot";
import DispatchResponse from "./DispatchResponse";
import type { SuiteId } from "./suiteRecords";
import { buildDemoSnapshot } from "./demoAssistant";
import { useAssistantAccess } from "./AssistantAccessProvider";
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
  const { access, code, consent, ready, verified, verifying, checking, model, status, error: accessError } = useAssistantAccess();
  const [settings, setSettings] = useState(!verified || !consent);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  useEffect(() => { setScopeId(selectedId && incidents.some(i => i.id === selectedId) ? selectedId : ""); }, [selectedId, team.facilityId, room]);
  useEffect(() => () => { abortRef.current?.abort(); }, []);
  useEffect(() => { if (turns.length) endRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); }, [busy, turns]);
  const demo = team.mode === "playback" && !!room;
  const canAsk = !!team.facility && !team.stale && ready && verified && consent && code.trim().length >= 16 && !busy;
  const ask = async (text: string) => {
    if (!canAsk || inFlight.current || !text.trim() || (!demo && !cloud) || !team.facilityId) { if (!consent || !verified) setSettings(true); return; }
    inFlight.current = true; setBusy(true); setQuestion("");
    const id = crypto.randomUUID();
    const controller = new AbortController(); abortRef.current = controller;
    setTurns(t => [...t.slice(-9), { id, question: text.trim() }]);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", "x-demo-access-code": code.trim() };
      let body: Record<string, unknown>;
      if (demo && room) {
        body = { operation: "demo_assistant", question: text.trim(), room, nonSensitiveConfirmed: consent,
          snapshot: buildDemoSnapshot(room, team.incidents, team.events, team.members, team.clock, scopeId) };
      } else {
        const session = await cloud!.auth.getSession();
        if (!session.data.session) throw new Error("Sign in again to read your care-team records.");
        headers.Authorization = `Bearer ${session.data.session.access_token}`;
        body = { operation: "assistant", question: text.trim(), facilityId: team.facilityId, room, incidentId: scopeId, nonSensitiveConfirmed: consent };
      }
      const response = await fetch("/api/gemini", {
        method: "POST", signal: controller.signal,
        headers, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401 && !controller.signal.aborted) { access.invalidate(result.error || "Reconnect workspace access."); setSettings(true); }
        throw new Error(result.error || "The request could not be completed.");
      }
      if (!controller.signal.aborted) { access.answerReceived(); setSettings(false); setTurns(t => t.map(turn => turn.id === id ? { ...turn, result } : turn)); }
    } catch (e) {
      if (!controller.signal.aborted) setTurns(t => t.map(turn => turn.id === id ? { ...turn, error: e instanceof Error ? e.message : "Request failed. No action was taken." } : turn));
    } finally { if (!controller.signal.aborted) { setBusy(false); inFlight.current = false; } }
  };
  return <section className="panoramic-assistant card" aria-label="Panoramic AI">
    <header className="assistant-heading"><div><MessageSquare size={19} /><h2>Panoramic AI</h2></div>
      <div><button className="text-button" aria-label="AI connection settings" aria-expanded={settings} onClick={() => setSettings(!settings)}><Settings2 size={16} /></button>
        <button className="text-button" aria-label="Clear conversation" disabled={busy || !turns.length} onClick={() => setTurns([])}><Trash2 size={15} /></button></div>
    </header>
    <div className="assistant-scope"><FileText size={14} /><select aria-label="AI record scope" value={scopeId} onChange={e => setScopeId(e.target.value)} disabled={busy}>
      <option value="">{room ? `Suite ${room} · ${demo ? "demo records" : "open concerns"}` : "Open concerns"}</option>{incidents.map(i => <option key={i.id} value={i.id}>{i.room} · {i.zone} · {new Date(i.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</option>)}
    </select><ChevronDown size={12} /></div>
    {settings && <div className="assistant-settings"><label className="team-field">Workspace access code<input type="password" autoComplete="off" value={code} onChange={e => access.setCode(e.target.value)} disabled={busy} placeholder="Your private Panoramic code" /></label>
      <small>Not your Google API key. Connect once across suites and tabs; reloading clears access. Credentials are never saved.</small>
      <label className="assistant-consent"><input type="checkbox" checked={consent} onChange={e => access.setConsent(e.target.checked)} disabled={busy} /><span>My questions and selected {demo ? "demo " : ""}records contain no sensitive resident information. Allow their text to be sent to Google when I ask. Free-tier content may be used to improve Google’s products.</span></label>
      {accessError && <p className="form-error" role="alert">{accessError}</p>}
      <div className="button-row"><button type="button" className="primary" disabled={checking || verifying || busy || !ready || !consent || code.trim().length < 16} onClick={() => { void access.verify().then(ok => { if (ok) setSettings(false); }); }}>{verifying ? "Verifying…" : "Verify access"}</button>
        <button type="button" className="text-button" disabled={busy || checking || verifying} onClick={() => { void access.checkConnection(); }}>Check connection</button>
        {verified && <button type="button" className="text-button" disabled={busy} onClick={() => access.forget()}>Forget access</button>}</div>
      <small role="status">{model} · {status}</small></div>}
    <div className="assistant-messages" aria-live="polite" aria-busy={busy}>
      {!turns.length && <div className="assistant-empty"><MessageSquare size={25} /><h3>What needs attention?</h3><p>Ask about a concern, available responders, or the response timeline.</p>
        {!team.userId ? <button className="secondary" onClick={onSignIn}>Sign in to your workspace</button> : !team.facility ? <p>Connect a care team to open its records.</p> : <div className="assistant-starters">
          {["Which concerns still need a response?", "Who is available to check this concern?", "Summarize the response so far."].map(text => <button key={text} onClick={() => { setQuestion(text); if (!consent || !verified) setSettings(true); }}>{text}<ArrowUp size={13} /></button>)}
        </div>}
      </div>}
      {turns.map(turn => {
        const result = turn.result;
        const target = result && incidents.find(i => i.id === result.action.incidentId);
        const outdated = !!result && Object.entries(result.versions).some(([id, version]) => incidents.find(i => i.id === id)?.version !== version);
        return <div key={turn.id} className="assistant-turn"><p className="assistant-question">{turn.question}</p>
          {turn.error && <p className="form-error" role="alert">{turn.error}</p>}
          {result && <div className="assistant-answer"><small>Panoramic AI · Gemini · {new Date(result.analyzedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
            {result.paragraphs.map((p, n) => <div key={n}><p>{p.text}</p><div className="assistant-citations">{p.sourceIds.map(id => { const source = result.sources.find(s => s.id === id); if (!source) return null; return <details key={id}><summary>{source.title}</summary><p>{source.text}</p>{source.incidentId && <button className="text-button" onClick={() => { const i = incidents.find(i => i.id === source.incidentId); if (i) onSelect(i.id, i.room); }}>Open response record</button>}{source.url && <a href={source.url} target="_blank" rel="noreferrer">Read source</a>}</details>; })}</div></div>)}
            <details className="assistant-evidence"><summary>Records used</summary><p>{result.scope}</p><p>Retrieved {new Date(result.snapshotAt).toLocaleString()} · {result.model}</p></details>
            {outdated && <p className="assistant-stale">Records have changed since this answer. Ask again for an updated summary.</p>}
            {target && result.action.kind === "review" && <button className="secondary full" onClick={() => onSelect(target.id, target.room)}>Open {target.room} response</button>}
            {target && result.action.kind === "assign" && !outdated && <DispatchResponse team={team} incident={target} preferred={result.action.caregiverId} />}
          </div>}
        </div>;
      })}
      {busy && <p className="assistant-thinking" role="status">Gemini is reviewing the selected suite…</p>}<div ref={endRef} />
    </div>
    <form className="assistant-composer" onSubmit={e => { e.preventDefault(); void ask(question); }}>
      <textarea aria-label="Ask Panoramic AI" value={question} onChange={e => setQuestion(e.target.value)} maxLength={1200} placeholder="Ask about your care workspace…" rows={2} disabled={!team.facility || busy} />
      <button className="primary" type="submit" aria-label="Send question" disabled={!canAsk || !question.trim()}><ArrowUp size={17} /></button>
    </form>
    {team.facility && !canAsk && !busy && <button className="assistant-unlock text-button" onClick={() => setSettings(true)}>{team.stale ? "Reconnect care team to continue" : !ready ? status : "Set up AI access"}</button>}
  </section>;
}
