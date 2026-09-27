import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, HeartHandshake, Webcam } from "lucide-react";
import SiteLink, { type Navigate } from "./SiteLink";
import { resolveRoute, routeTitle, type WorkspacePage } from "./routes";
import type { SuiteId } from "./suiteRecords";

const Workspace = lazy(() => import("./Workspace"));
const locationState = () => ({ pathname: window.location.pathname, hash: window.location.hash });

function ProjectLanding({ navigate }: { navigate: Navigate }) {
  return <div className="welcome-site" data-active-page="true">
    <a className="skip" href="#entry-main">Skip to workspace entry</a>
    <main id="entry-main" className="welcome-main">
      <div className="welcome-emblem" aria-hidden="true"><HeartHandshake size={52} strokeWidth={1.3} /></div>
      <h1 aria-label="Panoramic"><span className="entry-wordmark" aria-hidden="true">Pan<Webcam className="entry-wordmark-icon" strokeWidth={2.5} />ramic</span></h1>
      <SiteLink to="/app" navigate={navigate} className="site-button entry-button">Open Workplace</SiteLink>
    </main>
  </div>;
}

export default function Site() {
  const [location, setLocation] = useState(locationState);
  const route = resolveRoute(location.pathname);
  const [workspaceOpened, setWorkspaceOpened] = useState(route.surface === "workspace");
  const lastPage = useRef<WorkspacePage>(route.surface === "workspace" ? route.page : "monitor");
  const lastSuite = useRef<SuiteId | undefined>(route.surface === "workspace" ? route.suite : undefined);
  const navigate = useCallback<Navigate>((to) => {
    const target = new URL(to, window.location.origin);
    if (target.origin !== window.location.origin) return;
    const href = target.pathname + target.search + target.hash;
    if (href !== window.location.pathname + window.location.search + window.location.hash) window.history.pushState(null, "", href);
    setLocation(locationState());
  }, []);
  useEffect(() => {
    if (location.pathname.replace(/\/+$/, "") === "/app/supervision") {
      window.history.replaceState(null, "", "/app/spatial" + window.location.search + window.location.hash);
      setLocation(locationState());
    }
    if (location.pathname.replace(/\/+$/, "") === "/app/history") {
      window.history.replaceState(null, "", "/app/session/history" + window.location.search + window.location.hash);
      setLocation(locationState());
    }
  }, [location.pathname]);
  useEffect(() => {
    const update = () => setLocation(locationState());
    window.addEventListener("popstate", update);
    window.addEventListener("hashchange", update);
    return () => { window.removeEventListener("popstate", update); window.removeEventListener("hashchange", update); };
  }, []);
  useEffect(() => {
    if (route.surface === "workspace") { setWorkspaceOpened(true); lastPage.current = route.page; lastSuite.current = route.suite; }
    document.title = routeTitle(route);
  }, [location.pathname]);
  useLayoutEffect(() => {
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) { target.scrollIntoView(); return; }
    }
    window.scrollTo(0, 0);
    const heading = [...document.querySelectorAll<HTMLElement>('[data-active-page="true"] h1')].find(item => item.getClientRects().length > 0);
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }, [location]);
  return <>
    {route.surface === "entry" && <ProjectLanding navigate={navigate} />}
    {(workspaceOpened || route.surface === "workspace") && <div hidden={route.surface !== "workspace"} data-active-page={route.surface === "workspace" ? "true" : undefined}><Suspense fallback={<main className="workspace-loading" role="status">Opening care workspace…</main>}><Workspace page={route.surface === "workspace" ? route.page : lastPage.current} suite={route.surface === "workspace" ? route.suite : lastSuite.current} navigate={navigate} /></Suspense></div>}
    {route.surface === "not-found" && <main className="welcome-main" data-active-page="true"><h1>Page not found</h1><SiteLink to="/" navigate={navigate} className="site-button">Back to Panoramic <ArrowLeft size={16} /></SiteLink></main>}
  </>;
}
