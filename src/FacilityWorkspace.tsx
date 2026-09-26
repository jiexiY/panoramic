import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowRight, Building2, Check, CheckCheck, Download, Eye, Map, Monitor, Play, RotateCcw, Square, Users } from "lucide-react";
import { bathroomPriority, bathroomRoute, bathroomScene, emptyFacility, facilityAlertActive, facilityCandidate, facilityTransition, sampleResidents, suiteIds, type FacilityAction, type SpaceId } from "./facility";
import { routeLevels } from "./routeRisk";
import SuitePlan from "./SuitePlan";
import "./facility.css";

const FacilityMap = lazy(() => import("./FacilityMap"));
const clock = (at: string) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
type Props = { mode: "spatial" | "supervision"; active: boolean; onMode: (mode: "spatial" | "supervision") => void };

export default function FacilityWorkspace({ mode, active, onMode }: Props) {
  const [state, setState] = useState(emptyFacility);
  const [selected, setSelected] = useState<SpaceId | null>(null);
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const [routeShown, setRouteShown] = useState(true);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const evidenceRef = useRef<HTMLElement>(null);
  const alert = facilityAlertActive(state);
  const candidate = facilityCandidate(state);
  const risk = routeLevels[bathroomPriority];
  useEffect(() => { if (mode === "supervision" && active) setSelected("supervision"); }, [mode, active]);
  useEffect(() => { if (!active) setPlaying(false); }, [active]);
  function act(action: FacilityAction) {
    try { setState(facilityTransition(state, action)); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "The response could not be updated."); }
  }
  function load() { act({ type: "load", at: new Date().toISOString() }); setSelected("A101"); setNote(""); }
  function showEvidence() { setSelected("A101"); setEvidenceOpen(true); requestAnimationFrame(() => evidenceRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" })); }
  function downloadRecord() {
    const data = { source: "User-supplied Gemini-edited still; human-marked regions; local sample workflow", room: "A101 bathroom", scene: bathroomScene, route: bathroomRoute, incident: state.incident, staff: state.staff };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "panoramic-a101-sample-response.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const response = <section className="facility-card response-desk" aria-label="Bathroom response">
    <div className="facility-card-heading"><span className="eyebrow">A101 / BATHROOM</span><span className={`facility-chip ${alert ? "alert" : ""}`}>{state.incident?.phase === "resolved" ? "Recorded" : "Sample concern"}</span></div>
    <h2>{state.incident?.phase === "resolved" ? "Response recorded" : "Possible water on the route"}</h2>
    <p>{bathroomScene.brief}</p>
    {alert && <div className="concern-level" style={{ background: risk.color, color: risk.ink }}>{risk.label}</div>}
    {state.incident?.phase === "flagged" && <><p className="response-suggestion">{candidate ? `Suggested caregiver: ${candidate.name}` : "Coverage gap — no available staff"}</p><button className="primary full" disabled={!candidate} onClick={() => act({ type: "acknowledge", at: new Date().toISOString() })}>Acknowledge as {candidate?.name ?? "caregiver"}<ArrowRight size={16} /></button></>}
    {state.incident?.phase === "acknowledged" && <><p className="response-suggestion">{state.incident.assigned} acknowledged · arrival pending</p><button className="primary full" onClick={() => act({ type: "arrive", at: new Date().toISOString() })}>Confirm arrival <Check size={16} /></button></>}
    {state.incident?.phase === "arrived" && <><label className="facility-note">What was checked or done?<textarea value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="Record the floor check and any remaining concern…" /></label><button className="primary full" disabled={note.trim().length < 8} onClick={() => act({ type: "resolve", at: new Date().toISOString(), note })}>Record resolution <CheckCheck size={16} /></button></>}
    {state.incident?.phase === "resolved" && <p className="recorded-note">{state.incident.resolution}</p>}
    <small>Local sample response · no external notification</small>
  </section>;
  const roster = <section className="facility-card"><div className="facility-card-heading"><h2>Care team</h2><Users size={17} /></div>
    {state.staff.length === 0 ? <div className="facility-empty">No staff added</div> : state.staff.map(person => <div className="facility-person" key={person.id}>
      <span className="person-initial">{person.name[0]}</span><div><b>{person.name}</b><small>{person.role}</small><small>{person.location === "supervision" ? "Supervision room" : `Suite ${person.location}`}</small></div>
      <button className={`availability-chip ${person.available ? "available" : ""}`} disabled={!!state.incident && !["flagged", "resolved"].includes(state.incident.phase)} onClick={() => act({ type: "availability", id: person.id })} aria-label={`Mark ${person.name} ${person.available ? "busy" : "available"}`}>{person.available ? "Available" : "Busy"}</button>
    </div>)}
  </section>;
  return <div className="facility-page">
    <section className="page-heading facility-heading"><div><p className="eyebrow">RESIDENTIAL CARE / FLOOR 01</p><h1>{mode === "spatial" ? "Spatial view" : "Supervision"}</h1></div>
      <div className="facility-heading-actions">{!state.loaded ? <button className="primary" onClick={load}><Play size={16} /> Load bathroom example</button> : <><span className="facility-chip">SAMPLE SESSION</span><button className="secondary" onClick={() => { act({ type: "reset" }); setEvidenceOpen(false); setPlaying(false); setSelected(null); setNote(""); }}><RotateCcw size={15} /> Reset example</button></>}</div>
    </section>
    <div className="facility-tabs"><button aria-current={mode === "spatial" ? "page" : undefined} onClick={() => onMode("spatial")}><Map size={16} /> Floor overview</button><button aria-current={mode === "supervision" ? "page" : undefined} onClick={() => onMode("supervision")}><Monitor size={16} /> Supervision desk</button><span>Sample floor · local session</span></div>
    {error && <div className="notice error" role="alert">{error}</div>}
    <div className="facility-grid">
      <div className="facility-main">
        <section className="facility-map-panel"><div className="facility-panel-header"><span><Building2 size={16} /> Care-center floor</span><label><input type="checkbox" checked={routeShown} onChange={e => setRouteShown(e.target.checked)} /> Show sample route</label></div>
          <Suspense fallback={<div className="facility-map-loading">Opening spatial view…</div>}><FacilityMap selected={selected} alert={alert} showRoute={routeShown} onSelect={setSelected} active={active} /></Suspense>
        </section>
        <div className="facility-bottom-grid">
          <section className="facility-card"><div className="facility-card-heading"><h2>Active concerns</h2><span className="small-count">{alert ? 1 : 0}</span></div>
            {alert ? <button className="facility-alert-row" onClick={showEvidence}><span className="alert-rank">L3</span><span><b>A101 · Bathroom</b><small>Possible water overlaps the sample route</small></span><ArrowRight size={17} /></button> : <div className="facility-empty">{state.incident?.phase === "resolved" ? "No open sample concerns" : "No observations yet"}</div>}
          </section>
          <section className="facility-card"><div className="facility-card-heading"><h2>Activity</h2><Eye size={16} /></div>{!state.incident ? <div className="facility-empty">No activity yet</div> : <ol className="facility-activity">{state.incident.events.slice(-3).map((event, i) => <li key={i}><time>{clock(event.at)}</time><span>{event.text}</span></li>)}</ol>}</section>
        </div>
      </div>
      <aside className="facility-sidebar" aria-label="Rooms and care team">
        <section className="facility-card facility-summary"><div><small>Residents</small><b>{state.loaded ? "4" : "0"}<em> / 4</em></b></div><div><small>Available staff</small><b>{state.staff.filter(p => p.available).length}<em> / {state.staff.length}</em></b></div><div><small>Concerns</small><b>{alert ? 1 : 0}</b></div></section>
        <section className="facility-card"><h2>Route concern</h2><div className="facility-scale"><span style={{ background: "#fbe5d5" }} /><span style={{ background: "#b85a36" }} /><span style={{ background: "#652b26" }} /></div><div className="facility-scale-labels"><span>L1 · Off route</span><span>L2 · Near</span><span>L3 · On route</span></div><div className="facility-key"><span><i className="key-unknown" />Not assessed</span><span><i className="key-station" />Supervision</span></div></section>
        {mode === "supervision" ? <>{roster}{state.incident && response}</> : <section className="facility-card room-directory"><div className="facility-card-heading"><h2>Rooms</h2><span className="small-count">4 suites</span></div><div className="room-filters"><button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button><button aria-pressed={filter === "attention"} onClick={() => setFilter("attention")}>Needs review {alert ? "1" : "0"}</button></div>
          {suiteIds.filter(id => filter === "all" || id === "A101" && alert).map(id => <button className={`facility-room-row ${selected === id ? "selected" : ""}`} key={id} onClick={() => setSelected(id)}><span className={`room-dot ${id === "A101" && alert ? "urgent" : ""}`} /><span><b>Suite {id}</b><small>{state.loaded ? sampleResidents[id] : "No resident added"}</small></span><span className="room-state">{id === "A101" && alert ? "L3" : id === "A101" && state.incident?.phase === "resolved" ? "Recorded" : "—"}</span></button>)}
          {filter === "attention" && !alert && <p className="facility-empty">No open concerns</p>}
          <button className={`facility-room-row supervision-row ${selected === "supervision" ? "selected" : ""}`} onClick={() => setSelected("supervision")}><Monitor size={18} /><span><b>Supervision room</b><small>Caregivers & nurses</small></span><ArrowRight size={14} /></button>
        </section>}
        {mode === "spatial" && selected && <section className="facility-card room-detail"><div className="facility-card-heading"><h2>{selected === "supervision" ? "Supervision room" : `Suite ${selected}`}</h2><span className="facility-chip">LAYOUT</span></div>
          {selected === "supervision" ? <><p>Monitoring desks, a shared handoff table, and staff coordination beside the central corridor.</p><button className="secondary full" onClick={() => onMode("supervision")}>Open supervision desk <ArrowRight size={15} /></button></> : <><SuitePlan alert={selected === "A101" && alert} /><div className="suite-plan-caption">Bedroom · kitchenette · closets · accessible bath</div>{selected === "A101" && state.loaded && <button className="primary full" onClick={showEvidence}>View bathroom <ArrowRight size={15} /></button>}</>}
        </section>}
      </aside>
    </div>
    {evidenceOpen && state.loaded && <section ref={evidenceRef} className="facility-evidence" aria-label="Bathroom example monitoring">
      <div className="facility-panel-header"><span>A101 / BATHROOM OBSERVATION</span><div><button className="text-button" onClick={() => setPlaying(!playing)}>{playing ? <Square size={14} /> : <Play size={14} />}{playing ? "Stop GIF" : "Play OpenCV GIF"}</button><a className="text-button" href="/demo/bathroom-tracking.gif" download><Download size={14} /> GIF</a></div></div>
      <div className="facility-evidence-grid"><div>
        {playing ? <img className="bathroom-gif" src="/demo/bathroom-tracking.gif" alt="Staged OpenCV tracking demonstration with human-marked bathroom regions and sample route warning" /> : <div className="bathroom-scene"><img src="/demo/bathroom-water.jpg" alt="User-supplied AI-edited bathroom photograph with visible water across the foreground tiles" />{bathroomScene.observations.map((object, i) => <div key={object.label} className={`bathroom-box ${i === 3 ? "hazard" : ""}`} style={{ left: `${object.box[1] / 10}%`, top: `${object.box[0] / 10}%`, width: `${(object.box[3] - object.box[1]) / 10}%`, height: `${(object.box[2] - object.box[0]) / 10}%` }}><span>{object.label}{i === 3 ? " · L3" : ""}</span></div>)}{routeShown && <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="bathroom-route" aria-hidden="true"><polyline points={bathroomRoute.points.map(p => `${p.x},${p.y}`).join(" ")} /></svg>}</div>}
        <p className="evidence-caption">Supplied Gemini-edited image · human-marked regions · sample route</p>
      </div><div>{response}<button className="secondary full" onClick={downloadRecord}><Download size={15} /> Download response record</button></div></div>
    </section>}
  </div>;
}
