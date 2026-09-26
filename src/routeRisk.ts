import type { Detection } from "./scene.ts";

export type RoutePoint = { x: number; y: number };
export type WalkingRoute = { name: string; points: RoutePoint[]; margin: number; source: "recording" | "caregiver-marked" };
export type RoutePriority = "unassessed" | "object" | "away" | "near" | "crossing";
export const routeLevels = {
  unassessed: { rank: 0, label: "Route not assessed", short: "Unassessed", color: "#dfe3e1", ink: "#35494e", border: "#65767a" },
  object: { rank: 0, label: "Object only", short: "Object", color: "#e9eeeb", ink: "#35494e", border: "#65767a" },
  away: { rank: 1, label: "L1 · Outside route", short: "L1 · Check", color: "#fbe5d5", ink: "#67321e", border: "#a96743" },
  near: { rank: 2, label: "L2 · Near route", short: "L2 · Priority", color: "#b85a36", ink: "#ffffff", border: "#964325" },
  crossing: { rank: 3, label: "L3 · Crosses route", short: "L3 · Urgent review", color: "#652b26", ink: "#ffffff", border: "#652b26" },
} as const;
export type RouteAssessment = { priority: RoutePriority; reason: string };

export function validRoute(route: WalkingRoute | null): route is WalkingRoute {
  return !!route && route.points.length >= 2 && route.points.length <= 12
    && route.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1000 && p.y >= 0 && p.y <= 1000)
    && route.points.some((p, i) => i > 0 && Math.hypot(p.x - route.points[0].x, p.y - route.points[0].y) >= 10)
    && Number.isFinite(route.margin) && route.margin >= 0 && route.margin <= 150;
}

function pointToSegment(p: RoutePoint, a: RoutePoint, b: RoutePoint): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Liang-Barsky clipping detects complete crossings even when both endpoints lie outside.
function segmentIntersectsBox(a: RoutePoint, b: RoutePoint, box: Detection["box"]): boolean {
  const [top, left, bottom, right] = box;
  const dx = b.x - a.x, dy = b.y - a.y;
  let low = 0, high = 1;
  for (const [p, q] of [[-dx, a.x - left], [dx, right - a.x], [-dy, a.y - top], [dy, bottom - a.y]]) {
    if (p === 0) { if (q < 0) return false; }
    else {
      const t = q / p;
      if (p < 0) low = Math.max(low, t); else high = Math.min(high, t);
      if (low > high) return false;
    }
  }
  return true;
}

export function segmentBoxDistance(a: RoutePoint, b: RoutePoint, box: Detection["box"]): number {
  if (segmentIntersectsBox(a, b, box)) return 0;
  const [top, left, bottom, right] = box;
  const pointToBox = (p: RoutePoint) => Math.hypot(Math.max(left - p.x, 0, p.x - right), Math.max(top - p.y, 0, p.y - bottom));
  const corners = [{ x: left, y: top }, { x: right, y: top }, { x: left, y: bottom }, { x: right, y: bottom }];
  return Math.min(pointToBox(a), pointToBox(b), ...corners.map(p => pointToSegment(p, a, b)));
}

export function assessRouteHazard(object: Detection, route: WalkingRoute | null): RouteAssessment {
  if (object.kind === "object") return { priority: "object", reason: "An observed object, not classified as a spill or obstruction." };
  if (!validRoute(route)) return { priority: "unassessed", reason: "Mark and confirm this resident's usual route on this frame. The possible hazard remains flagged." };
  const distance = Math.min(...route.points.slice(1).map((point, i) => segmentBoxDistance(route.points[i], point, object.box)));
  if (distance <= 0.001) return { priority: "crossing", reason: "The possible hazard overlaps the marked walking line. Caregiver review takes priority." };
  if (distance <= route.margin) return { priority: "near", reason: "The possible hazard is within the route's image margin. Check before the resident uses this area." };
  return { priority: "away", reason: "The possible hazard is outside this marked route and margin. It still needs checking; the resident may take another route." };
}

export function highestRoutePriority(objects: Detection[], route: WalkingRoute | null): RoutePriority {
  const hazards = objects.filter(o => o.kind !== "object");
  if (!hazards.length || !validRoute(route)) return "unassessed";
  return hazards.map(o => assessRouteHazard(o, route).priority).reduce((a, b) => routeLevels[a].rank >= routeLevels[b].rank ? a : b);
}
