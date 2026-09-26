import { routeLevels, type RoutePriority } from "./routeRisk.ts";

// Match the exterior wall bounds; the layer sits just 0.01 above the wall top (0.88).
export const suiteOverlaySize = { width: 4.66, depth: 7.46, height: 0.89 };
export const suiteOverlayCenter = { x: 2.25, z: 3.65 };

export function suiteOverlayStyle(priority: RoutePriority | undefined, selected: boolean) {
  const concern = priority && routeLevels[priority].rank > 0 ? routeLevels[priority] : null;
  return {
    color: concern?.color ?? "#9ea7ad",
    opacity: selected ? 0.56 : 0.48,
    border: selected ? "#3b5362" : concern?.border ?? "#7f8a92",
  };
}
