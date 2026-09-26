import { useEffect, useRef, useState } from "react";
import { ScanLine, Upload, ShieldCheck, ArrowRight, Users, Check, Download, AlertTriangle, Sparkles, LoaderCircle, Image as ImageIcon, X } from "lucide-react";
import { advanceIncident, parseScene, recommendCaregiver, startIncident, type Analysis, type Caregiver, type Incident } from "./scene";
import "./monitor.css";
import RouteOverlay from "./RouteOverlay";
import RoutePlanner from "./RoutePlanner";
import { assessRouteHazard, highestRoutePriority, routeLevels, type RoutePoint, type WalkingRoute } from "./routeRisk";

const stamp = () => new Date().toISOString();
const localTime = (at: string) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });


export default function SceneMonitor() {
  const [status, setStatus] = useState<{ configured: boolean; message: string; model: string } | null>(null);
  const [image, setImage] = useState("");
  const [fileName, setFileName] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [frameTime, setFrameTime] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [staff, setStaff] = useState<Caregiver[]>([]);
  const [staffEditor, setStaffEditor] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [staffDistance, setStaffDistance] = useState(1);
  const [staffQualified, setStaffQualified] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [summary, setSummary] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [walkingRoute, setWalkingRoute] = useState<WalkingRoute | null>(null);
  const [routeDraft, setRouteDraft] = useState<RoutePoint[]>([]);
  const [drawingRoute, setDrawingRoute] = useState(false);
  const [routeEvents, setRouteEvents] = useState<string[]>([]);
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const selectionVersion = useRef(0);
  const responseSection = useRef<HTMLElement>(null);
  const setupHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { if (setupOpen) setupHeading.current?.focus(); }, [setupOpen]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/gemini", { signal: controller.signal }).then(async r => {
      if (!r.ok || !r.headers.get("content-type")?.includes("application/json")) throw new Error();
      const value = await r.json();
      if (typeof value.configured !== "boolean") throw new Error();
      setStatus(value);
    }).catch(() => { if (!controller.signal.aborted) setStatus({ configured: false, model: "", message: "Image analysis is unavailable. Try again later." }); });
    return () => controller.abort();
  }, []);
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  useEffect(() => () => { selectionVersion.current++; }, []);
  const candidate = recommendCaregiver(staff);
  const active = !!incident && incident.phase !== "resolved";
  const locked = !!busy || active;
  const assessedRoute = drawingRoute ? null : walkingRoute;
  const routePriority = highestRoutePriority(analysis?.scene.observations ?? [], assessedRoute);
  const routeStyle = routeLevels[routePriority];
  const record = analysis ? [
    "PANORAMIC · SCENE REVIEW", `Source: Gemini API (${analysis.model})`,
    `Analysis time: ${analysis.analyzedAt}`, `Media: ${fileName}${frameTime !== null ? ` · video frame ${frameTime.toFixed(1)}s` : ""}`,
    "OBSERVATIONS (not independently verified)", ...analysis.scene.observations.map(o => `${o.label}: ${o.evidence}`),
    `Uncertainty: ${analysis.scene.uncertainty}`, `Brief: ${analysis.scene.brief}`,
    `ROUTE CONTEXT: ${walkingRoute ? `${walkingRoute.name} (${walkingRoute.source}); normalized waypoints ${walkingRoute.points.map(p => `${p.x},${p.y}`).join(" → ")}; margin ${walkingRoute.margin}` : "No confirmed route"}`,
    ...analysis.scene.observations.map(o => { const rating = assessRouteHazard(o, assessedRoute); return `${o.label} · ${routeLevels[rating.priority].label}: ${rating.reason}`; }),
    "Route priority: image-space overlap, not a fall probability.",
    ...routeEvents,
    `Request status: ${incident?.phase ?? "No candidate hazard flagged; not an all-clear"}`,
    "OPERATOR-ENTERED EVENTS", ...(incident?.events.map(e => `${e.at} · ${e.text}`) ?? []),
    "Storage: current browser tab. Notifications: not connected.",
  ].join("\n") : "";

  function clearRouteContext() { setWalkingRoute(null); setRouteDraft([]); setDrawingRoute(false); setRouteEvents([]); }
  function updateRoute(route: WalkingRoute | null) {
    setWalkingRoute(route); setSummary(""); setReviewed(false);
    setRouteEvents(events => [...events.slice(-7), `${stamp()} · Route ${route ? `confirmed: ${route.name} (${route.source})` : "cleared; route priority is unassessed"}. Incident response remains unchanged.`]);
  }

  function resetResult() { setAnalysis(null); setIncident(null); setSummary(""); setReviewed(false); setNote(""); setError(""); setSelected(null); }
  function resize(source: CanvasImageSource, width: number, height: number) {
    if (!width || !height) throw new Error("This frame is not ready yet.");
    const scale = Math.min(1, 1280 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", .82);
  }
  async function chooseFile(file?: File) {
    if (!file || locked) return;
    const version = ++selectionVersion.current;
    resetResult(); clearRouteContext(); setImage(""); setVideoUrl(""); setFrameTime(null); setPrivacyConfirmed(false); setFileName("");
    try {
      if (file.type.startsWith("video/") && ["video/mp4", "video/webm"].includes(file.type)) {
        if (file.size > 80_000_000) throw new Error("Use a video under 80 MB.");
        setVideoUrl(URL.createObjectURL(file)); setFileName(file.name); return;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8_000_000) throw new Error("Choose a JPEG, PNG, or WebP under 8 MB, or an MP4/WebM under 80 MB.");
      const bitmap = await createImageBitmap(file);
      try { if (version === selectionVersion.current) { setImage(resize(bitmap, bitmap.width, bitmap.height)); setFileName(file.name); } } finally { bitmap.close(); }
    } catch (e) { if (version === selectionVersion.current) setError(e instanceof Error ? e.message : "Could not load this file."); }
  }
  function captureFrame() {
    if (!video.current || locked) return;
    try { video.current.pause(); const nextImage = resize(video.current, video.current.videoWidth, video.current.videoHeight); resetResult(); clearRouteContext(); setImage(nextImage); setFrameTime(video.current.currentTime); setPrivacyConfirmed(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not capture frame."); }
  }
  async function request(operation: "analyze" | "summary") {
    if (inFlight.current || drawingRoute || !privacyConfirmed || !status?.configured || !accessCode || (operation === "analyze" && (!image || active))) return;
    inFlight.current = true; setBusy(operation); setError("");
    if (operation === "analyze") resetResult();
    try {
      const response = await fetch("/api/gemini", {
        method: "POST", signal: AbortSignal.timeout(40_000),
        headers: { "Content-Type": "application/json", "x-demo-access-code": accessCode },
        body: JSON.stringify({ operation, stagedOnly: privacyConfirmed, ...(operation === "analyze" ? { image } : { record }) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gemini request failed.");
      if (result.source !== "gemini" || typeof result.model !== "string" || typeof result.analyzedAt !== "string" || !Number.isFinite(Date.parse(result.analyzedAt))) throw new Error("Invalid response provenance.");
      if (operation === "analyze") {
        const scene = parseScene(result.scene);
        setAnalysis({ scene, source: "gemini", model: result.model, analyzedAt: result.analyzedAt });
        setIncident(startIncident(scene, stamp()));
      } else {
        if (typeof result.summary !== "string" || !result.summary.trim() || result.summary.length > 1500) throw new Error("Invalid summary response.");
        setSummary(result.summary); setReviewed(false);
      }
    } catch (e) { setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "Request timed out. No automatic retry or substitute result was made."); }
    finally { inFlight.current = false; setBusy(""); }
  }
  function addCaregiver() {
    const label = staffId.trim();
    if (!label || !staffQualified || !Number.isInteger(staffDistance) || staffDistance < 1 || staffDistance > 20 || staff.some(person => person.name === label)) return;
    setStaff([...staff, { id: crypto.randomUUID(), name: label, available: true, qualified: true, distance: staffDistance }]);
    setStaffId(""); setStaffQualified(false); setStaffEditor(false);
  }
  function advance(action: "acknowledge" | "arrive" | "resolve") {
    if (!incident || busy) return;
    try { setIncident(advanceIncident(incident, action, stamp(), candidate, note)); setSummary(""); setReviewed(false); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Action was not applied."); }
  }
  function download() {
    const content = `${record}${summary ? `\n\nGEMINI DRAFT SUMMARY · ${reviewed ? "reviewed" : "not reviewed"}\n${summary}` : ""}`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "panoramic-scene-handoff.txt"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="monitor-page">
    <section className="page-heading">
      <h1>Living area review</h1>
    </section>
    {analysis && <ol className="monitor-steps" aria-label="Scene workflow">{["Review", "Flag", "Assign", "Respond", "Handoff"].map((step, i) => <li key={step} className={i === 0 || (i === 1 && incident) || (i === 2 && incident?.assigned) || (i === 3 && ["arrived", "resolved"].includes(incident?.phase ?? "")) || (i === 4 && incident?.phase === "resolved") ? "reached" : ""}><span>0{i + 1}</span>{step}</li>)}</ol>}
    {error && <div className="notice error" role="alert"><AlertTriangle size={18} /><span>{error}</span></div>}
    <div className="monitor-grid">
      <div className="scene-column">
        <section className="scene-panel" aria-label="Scene review">
          <div className="scene-top"><span>ROOM IMAGES</span>{image && <b>{analysis ? "REVIEWED FRAME" : "SELECTED FRAME"}</b>}</div>
          <div className={`scene-canvas ${!image ? "empty" : ""}`}>
            {image ? <img src={image} alt="Selected room image" /> : <div className="scene-placeholder"><ScanLine size={48} strokeWidth={1.25} /><h2>No room images yet</h2><button className="primary" disabled={locked} onClick={() => setSetupOpen(true)}><Upload size={16} /> Add room image</button></div>}
            {image && <RouteOverlay route={walkingRoute} draft={routeDraft} drawing={drawingRoute} observations={analysis?.scene.observations ?? []} onPoint={point => { if (!busy) setRouteDraft(points => points.length < 12 ? [...points, point] : points); }} />}
            {analysis && image && <div className="detection-layer" aria-hidden="true">{analysis.scene.observations.map((object, i) => {
              const rating = assessRouteHazard(object, assessedRoute);
              const style = routeLevels[rating.priority];
              return <div key={i} className={`detection-box ${object.box[3] > 700 ? "label-right" : ""} ${selected === i ? "selected" : ""}`} style={{ top: `${object.box[0] / 10}%`, left: `${object.box[1] / 10}%`, height: `${(object.box[2] - object.box[0]) / 10}%`, width: `${(object.box[3] - object.box[1]) / 10}%`, borderColor: style.border, background: `${style.color}50` }}>
                <span style={{ background: style.color, color: style.ink, border: `1px solid ${style.border}` }}><span className="detection-full-label">{i + 1}. {object.label} · {style.short}</span><span className="detection-compact-label">{i + 1} · {style.rank ? `L${style.rank}` : rating.priority === "object" ? "Object" : "?"}</span></span>
              </div>;
            })}</div>}
          </div>
          {fileName && <div className="scene-caption"><span>{fileName}{frameTime !== null ? ` · ${frameTime.toFixed(1)}s` : ""}</span>{analysis && <time>{localTime(analysis.analyzedAt)}</time>}</div>}
        </section>
        {image && <RoutePlanner route={walkingRoute} draft={routeDraft} drawing={drawingRoute} observations={analysis?.scene.observations ?? []} disabled={!!busy} onRoute={updateRoute} onDraft={setRouteDraft} onDrawing={setDrawingRoute} />}
        {setupOpen && <section className="card upload-card">
          <div className="card-title"><ImageIcon size={19} /><h2 ref={setupHeading} tabIndex={-1}>Room image & analysis</h2><button className="text-button" aria-label="Close image setup" onClick={() => setSetupOpen(false)}><X size={18} /></button></div>
          <input ref={fileInput} id="room-media" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" disabled={locked} onChange={e => { void chooseFile(e.target.files?.[0]); e.target.value = ""; }} />
          <label className="media-label" htmlFor="room-media">Photo (JPEG / PNG / WebP) or video (MP4 / WebM)</label>
          {videoUrl && <div className="local-video"><video ref={video} src={videoUrl} controls muted playsInline preload="metadata" onError={() => setError("This browser could not decode the video. Export an MP4 or upload a still image.")} /><button className="secondary" onClick={captureFrame} disabled={locked}><ScanLine size={15} /> Capture paused frame</button><p className="fine-print">Play or seek to the spill, pause, then capture. Only the captured image is sent—not the video or audio.</p></div>}
          <label className="check-row privacy-check"><input type="checkbox" checked={privacyConfirmed} disabled={!!busy} onChange={e => setPrivacyConfirmed(e.target.checked)} /><span><b>This room is unoccupied and contains no identifying information.</b><small>Analysis sends this frame to Google. Free-tier submissions may be used to improve its products.</small></span></label>
          {status?.configured && <label className="access-code">Workspace access code<input type="password" autoComplete="off" value={accessCode} disabled={!!busy} onChange={e => setAccessCode(e.target.value)} /></label>}
          <div className="button-row"><button className="primary" disabled={!image || !privacyConfirmed || !status?.configured || !accessCode || locked || drawingRoute} onClick={() => void request("analyze")}>{busy === "analyze" ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />} Analyze frame</button></div>
          {!status?.configured && <p className="setup-note">{status ? "Image analysis is currently unavailable." : "Connecting to image analysis…"}</p>}
          {active && <p className="fine-print">Finish this response before replacing the scene.</p>}
        </section>}
        {image && !setupOpen && <button className="secondary" disabled={locked} onClick={() => setSetupOpen(true)}><Upload size={16} /> {analysis ? "Choose another room image" : "Continue image analysis"}</button>}
        {analysis && <section className="card observations"><div className="card-title"><ScanLine size={19} /><h2>Observations</h2></div>{analysis.scene.observations.length ? analysis.scene.observations.map((object, i) => { const rating = assessRouteHazard(object, assessedRoute); const style = routeLevels[rating.priority]; return <button key={i} className={`observation ${selected === i ? "selected" : ""}`} onClick={() => setSelected(selected === i ? null : i)} aria-pressed={selected === i}><span className="observation-number" style={{ background: style.color, color: style.ink }}>{i + 1}</span><span><b>{object.label}</b><small>{object.evidence}</small><span className="observation-priority">{style.label}</span></span></button>; }) : <p>No candidate hazards identified in this frame.</p>}<details className="uncertainty"><summary>Analysis notes</summary><p>{analysis.scene.uncertainty}</p></details></section>}
      </div>
      <aside className="response-column" aria-label="Caregiver response">
        <section className={`response-card ${incident ? "has-alert" : ""}`} ref={responseSection} aria-live="polite"><span className="eyebrow">RESPONSE STATUS</span><h2>{incident?.phase === "resolved" ? "Response recorded" : incident ? "Possible hazard flagged" : analysis ? "Scene reviewed" : "No observations yet"}</h2>{incident && <span className="route-badge" style={{ background: routeStyle.color, color: routeStyle.ink }}>{routeStyle.label}</span>}{analysis && <p>{analysis.scene.brief}</p>}{incident && <><span className="response-phase">{incident.phase === "flagged" ? "Awaiting acknowledgment" : incident.phase === "acknowledged" ? `${incident.assigned} acknowledged · arrival pending` : incident.phase === "arrived" ? `${incident.assigned} arrived · resolution pending` : "Resolution recorded by operator"}</span><small>Notifications off</small></>}</section>
        <section className="card staff-card"><div className="card-title"><Users size={19} /><h2>Caregiver availability</h2></div>{staff.length === 0 && <div className="quiet-empty"><p>No caregivers added</p></div>}{staff.map(person => <div className="staff-person" key={person.id}><span className={`staff-avatar ${person.available ? "available" : ""}`}>{person.name[0]}</span><div><b>{person.name} <small>Response order {person.distance}</small></b><span>{person.available ? "Available" : "Unavailable"}</span></div><button className="staff-toggle" disabled={!!busy || (!!incident && !["flagged", "resolved"].includes(incident.phase))} onClick={() => setStaff(staff.map(p => p.id === person.id ? { ...p, available: !p.available } : p))} aria-label={`Mark ${person.name} ${person.available ? "busy" : "available"}`}>{person.available ? "Available" : "Busy"}</button></div>)}
          {!staffEditor ? <button className="secondary" onClick={() => setStaffEditor(true)} disabled={!!busy}>Add caregiver</button> : <form className="caregiver-editor" onSubmit={e => { e.preventDefault(); addCaregiver(); }}><label>Caregiver ID<input value={staffId} maxLength={32} onChange={e => setStaffId(e.target.value)} placeholder="CG-01" required /></label><label>Response order<input type="number" min="1" max="20" value={staffDistance} onChange={e => setStaffDistance(Number(e.target.value))} required /></label><label className="check-row"><input type="checkbox" checked={staffQualified} onChange={e => setStaffQualified(e.target.checked)} /><span>Eligible for this task</span></label><div className="button-row"><button className="primary" disabled={!staffId.trim() || !staffQualified || !Number.isInteger(staffDistance) || staffDistance < 1 || staffDistance > 20 || staff.some(p => p.name === staffId.trim())}>Add</button><button type="button" className="text-button" onClick={() => setStaffEditor(false)}>Cancel</button></div></form>}
          {incident?.phase === "flagged" && <div className="assignment"><b>{candidate ? `Suggested: ${candidate.name}` : "Coverage gap: no available caregiver"}</b><p>{candidate ? "Awaiting acceptance." : "Contact the supervisor for coverage."}</p><button className="primary full" disabled={!candidate || !!busy} onClick={() => advance("acknowledge")}>{candidate ? `Acknowledge as ${candidate.name}` : "Awaiting coverage"}<ArrowRight size={16} /></button></div>}
          {incident?.phase === "acknowledged" && <button className="primary full" disabled={!!busy} onClick={() => advance("arrive")}>Confirm {incident.assigned} has arrived <Check size={16} /></button>}
          {incident?.phase === "arrived" && <div className="resolution-form"><label htmlFor="resolution-note">What did the caregiver check or do?</label><textarea id="resolution-note" value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="Record actions and any remaining concern…" /><button className="primary full" disabled={note.trim().length < 8 || !!busy} onClick={() => advance("resolve")}>Record resolution <Check size={16} /></button></div>}
        </section>
        <section className="card scene-timeline"><div className="card-title"><ShieldCheck size={19} /><h2>Activity</h2></div>{incident ? <ol>{incident.events.map((event, i) => <li key={i}><time>{localTime(event.at)}</time><p>{event.text}</p></li>)}</ol> : <div className="quiet-empty"><p>No activity yet</p></div>}</section>
      </aside>
    </div>
    {analysis && <section className="card scene-handoff">
      <div className="card-title"><Sparkles size={20} /><h2>Handoff record</h2></div>
      <div className="button-row">
        <button className="secondary" onClick={download} disabled={!!busy || drawingRoute}><Download size={16} /> Download current record</button>
        <button className="primary" onClick={() => void request("summary")} disabled={incident?.phase !== "resolved" || !privacyConfirmed || !status?.configured || !accessCode || !!busy || drawingRoute}>
          {busy === "summary" ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />} Draft handoff
        </button>
      </div>
      {drawingRoute && <p className="fine-print">Confirm or cancel the route edit before exporting or drafting the handoff.</p>}
      {summary && <div className="summary-review">
        <label htmlFor="gemini-summary">Gemini draft · edit before reviewing</label>
        <textarea id="gemini-summary" value={summary} maxLength={2000} onChange={e => { setSummary(e.target.value); setReviewed(false); }} />
        <label className="check-row"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} /><span>I reviewed this draft against the recorded observations and actions.</span></label>
      </div>}
      <p className="fine-print">Unsaved to cloud · download before closing this tab.</p>
    </section>}
  </div>;
}
