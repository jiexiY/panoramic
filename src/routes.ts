import { isSuiteId, type SuiteId } from "./suiteRecords.ts";

export type WorkspacePage = "monitor" | "spatial" | "session" | "history";
export type Route =
  | { surface: "entry" }
  | { surface: "workspace"; page: WorkspacePage; suite?: SuiteId }
  | { surface: "not-found" };

export const workspacePaths: Record<WorkspacePage, string> = {
  monitor: "/app",
  spatial: "/app/spatial",
  session: "/app/session",
  history: "/app/session/history",
};

export const suitePath = (suite: SuiteId) => `${workspacePaths.spatial}/${suite}`;
export const dashboardSuitePath = (suite: SuiteId) => `${workspacePaths.monitor}/dashboard/${suite}`;

export function resolveRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/welcome") return { surface: "entry" };
  if (path === "/app/supervision") return { surface: "workspace", page: "spatial" };
  if (path === "/app/history") return { surface: "workspace", page: "history" };
  const monitoredSuite = path.startsWith("/app/dashboard/") ? path.slice("/app/dashboard/".length) : null;
  if (isSuiteId(monitoredSuite)) return { surface: "workspace", page: "monitor", suite: monitoredSuite };
  const suite = path.startsWith(workspacePaths.spatial + "/") ? path.slice(workspacePaths.spatial.length + 1) : null;
  if (isSuiteId(suite)) return { surface: "workspace", page: "spatial", suite };
  for (const [page, url] of Object.entries(workspacePaths)) {
    if (path === url) return { surface: "workspace", page: page as WorkspacePage };
  }
  return { surface: "not-found" };
}

export function routeTitle(route: Route): string {
  if (route.surface === "entry") return "Panoramic — Open workspace";
  if (route.surface === "not-found") return "Page not found — Panoramic";
  const labels = { monitor: "Dashboard", spatial: "Resident Floor", session: "Care session", history: "Care session · Session history" };
  return (route.suite ? `Suite ${route.suite} · ` : "") + labels[route.page] + " — Panoramic";
}
