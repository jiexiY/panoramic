import { routeLevels, type RoutePriority } from "./routeRisk.ts";

export const suiteOverlaySize = { width: 4.5, depth: 7.3, height: 1.18 };

export function suiteOverlayStyle(priority: RoutePriority | undefined, selected: boolean) {
  const concern = priority && routeLevels[priority].rank > 0 ? routeLevels[priority] : null;
  return {
    color: concern?.color ?? "#9ea7ad",
    opacity: selected ? 0.56 : 0.48,
    border: selected ? "#3b5362" : concern?.border ?? "#7f8a92",
  };
}
