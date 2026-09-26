import { useState } from "react";
import { Route, PencilLine, Check, Undo2 } from "lucide-react";
import type { Detection } from "./scene";
import { highestRoutePriority, routeLevels, sampleRoutes, validRoute, type RoutePoint, type WalkingRoute } from "./routeRisk";

export default function RoutePlanner({ route, draft, drawing, observations, rehearsal, disabled, onRoute, onDraft, onDrawing }: {
  route: WalkingRoute | null; draft: RoutePoint[]; drawing: boolean; observations: Detection[]; rehearsal: boolean; disabled: boolean;
  onRoute: (route: WalkingRoute | null) => void; onDraft: (points: RoutePoint[]) => void; onDrawing: (drawing: boolean) => void;
}) {
  const [name, setName] = useState("Usual walking route");
  const [x, setX] = useState("50");
  const [y, setY] = useState("80");
  const [margin, setMargin] = useState(65);
  const proposed: WalkingRoute = { name: name.trim() || "Usual walking route", points: draft, margin, source: "caregiver-marked" };
  const validPoint = x.trim() !== "" && y.trim() !== "" && [Number(x), Number(y)].every(n => Number.isFinite(n) && n >= 0 && n <= 100);
  const priority = highestRoutePriority(observations, drawing ? null : route);
  const current = routeLevels[priority];
  return <section className="card route-planner" aria-label="Resident walking route">
    <div className="card-title"><Route size={19} /><h2>Resident walking route</h2><span>{rehearsal ? "RESIDENT A · SAMPLE" : "CAREGIVER-MARKED"}</span></div>
    <div className="route-current" aria-live="polite"><div><b>{drawing ? "Marking a new route" : route?.name ?? "No usual route marked"}</b><small>{drawing ? `${draft.length} waypoints · confirm to rate hazards` : route ? `${route.points.length} waypoints · ${route.source === "sample" ? "illustrated sample" : "confirmed by operator"}` : "Choose the resident's usual path on this frame."}</small></div><span className="route-badge" style={{ background: current.color, color: current.ink }}>{current.label}</span></div>
    <ol className="risk-legend" aria-label="Light to dark concern levels">{(["away", "near", "crossing"] as const).map(key => <li key={key}><span style={{ background: routeLevels[key].color, borderColor: routeLevels[key].border }} /><b>{routeLevels[key].label}</b></li>)}</ol>
    <p className="route-helper">Darker means higher route-related concern—not a fall probability. Gray means unassessed; it does not mean safe.</p>
    {rehearsal && !drawing && <div className="route-presets" aria-label="Sample resident routes">{sampleRoutes.map(sample => <button type="button" key={sample.name} className={`secondary ${route?.name === sample.name && route.source === "sample" ? "is-active" : ""}`} disabled={disabled} aria-pressed={route?.name === sample.name && route.source === "sample"} onClick={() => onRoute(structuredClone(sample))}>{sample.name}</button>)}</div>}
    {!drawing ? <div className="button-row"><button className="secondary" disabled={disabled} onClick={() => { setName(route?.name ?? "Usual walking route"); setMargin(route?.margin ?? 65); onDraft(route ? structuredClone(route.points) : []); onDrawing(true); }}><PencilLine size={15} /> {route ? "Edit route" : "Mark usual route"}</button>{route && <button className="text-button" disabled={disabled} onClick={() => onRoute(null)}>Clear route</button>}</div> : <fieldset className="route-editor" disabled={disabled}>
      <legend>Mark the route on this frame</legend>
      <p>Click the room image to add waypoints, or enter their positions below. Use 2–12 points along the floor.</p>
      <label>Route name<input value={name} maxLength={50} onChange={e => setName(e.target.value)} /></label>
      <div className="waypoint-inputs"><label>Horizontal position (%)<input type="number" min="0" max="100" value={x} onChange={e => setX(e.target.value)} /></label><label>Vertical position (%)<input type="number" min="0" max="100" value={y} onChange={e => setY(e.target.value)} /></label><button className="secondary" type="button" disabled={!validPoint || draft.length >= 12} onClick={() => onDraft([...draft, { x: Math.round(Number(x) * 10), y: Math.round(Number(y) * 10) }])}>Add waypoint</button></div>
      <div className="waypoint-list" aria-live="polite">{draft.length ? draft.map((point, i) => <span key={i}>{i + 1}: {(point.x / 10).toFixed(1)}%, {(point.y / 10).toFixed(1)}%</span>) : "No waypoints yet"}</div>
      <label className="route-margin">Near-route margin: {(margin / 10).toFixed(1)}% of normalized image space<input type="range" min="0" max="150" step="5" value={margin} onChange={e => setMargin(Number(e.target.value))} /></label>
      <div className="button-row"><button type="button" className="primary" disabled={!validRoute(proposed)} onClick={() => { onRoute(proposed); onDrawing(false); }}><Check size={15} /> Confirm route</button><button type="button" className="secondary" disabled={!draft.length} onClick={() => onDraft(draft.slice(0, -1))}><Undo2 size={15} /> Undo point</button><button type="button" className="text-button" onClick={() => onDrawing(false)}>Cancel</button></div>
    </fieldset>}
    <p className="route-helper">Colors update when this frame's observations or confirmed route change. The route is not learned automatically; image distance is not a physical distance.</p>
  </section>;
}
