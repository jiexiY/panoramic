import type { Detection } from "./scene";
import { highestRoutePriority, routeLevels, type RoutePoint, type WalkingRoute } from "./routeRisk";

export default function RouteOverlay({ route, draft, drawing, observations, onPoint }: {
  route: WalkingRoute | null; draft: RoutePoint[]; drawing: boolean; observations: Detection[]; onPoint: (point: RoutePoint) => void;
}) {
  const points = drawing ? draft : route?.points ?? [];
  return <svg className={`route-overlay ${drawing ? "drawing" : ""}`} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true" onClick={drawing ? event => {
    const rect = event.currentTarget.getBoundingClientRect();
    onPoint({ x: Math.round(Math.max(0, Math.min(1000, (event.clientX - rect.left) / rect.width * 1000))), y: Math.round(Math.max(0, Math.min(1000, (event.clientY - rect.top) / rect.height * 1000))) });
  } : undefined}>
    {!drawing && route && route.points.slice(1).map((point, i) => {
      const segment = { ...route, points: [route.points[i], point] };
      const priority = highestRoutePriority(observations, segment);
      const color = routeLevels[priority].color;
      return <line key={i} x1={route.points[i].x} y1={route.points[i].y} x2={point.x} y2={point.y} stroke={color} strokeWidth={Math.max(24, route.margin * 2)} strokeLinecap="round" opacity={priority === "unassessed" ? .35 : .55} />;
    })}
    {points.length > 1 && <><polyline points={points.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#fffdf8" strokeWidth="13" strokeLinejoin="round" /><polyline points={points.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#294f62" strokeWidth="6" strokeDasharray="13 11" strokeLinejoin="round" /></>}
    {points.map((p, i) => <g key={i}><circle cx={p.x} cy={p.y} r="13" fill="#294f62" stroke="#fff" strokeWidth="4" /><text x={p.x} y={p.y + 5} fill="white" textAnchor="middle" fontSize="15" fontFamily="sans-serif">{i + 1}</text></g>)}
  </svg>;
}
