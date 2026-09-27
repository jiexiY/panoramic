import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveRoute, routeTitle, workspacePaths, suitePath, dashboardSuitePath } from "../src/routes.ts";
import { suiteIds } from "../src/suiteRecords.ts";

test("project opens directly to the entrance, with no advertising surface", () => {
  assert.deepEqual(resolveRoute("/"), { surface: "entry" });
  assert.deepEqual(resolveRoute("/welcome"), { surface: "entry" });
  assert.deepEqual(resolveRoute("/app"), { surface: "workspace", page: "monitor" });
});
test("workspace navigation is bookmarkable and handles trailing slashes", () => {
  for (const [page, path] of Object.entries(workspacePaths)) {
    assert.deepEqual(resolveRoute(path), { surface: "workspace", page });
    assert.deepEqual(resolveRoute(path + "/"), { surface: "workspace", page });
  }
  assert.deepEqual(resolveRoute("/welcome/"), { surface: "entry" });
});
test("unknown and API paths are not silently treated as a workspace", () => {
  for (const path of ["/about", "/app/unknown", "/api/gemini", "/welcome-extra"]) {
    assert.deepEqual(resolveRoute(path), { surface: "not-found" });
  }
});
test("each surface has a useful document title", () => {
  assert.equal(routeTitle(resolveRoute("/app")), "Dashboard — Panoramic");
  assert.equal(routeTitle(resolveRoute("/app/spatial")), "Resident Floor — Panoramic");
  assert.match(routeTitle(resolveRoute("/")), /Open workspace/);
  assert.equal(routeTitle(resolveRoute("/welcome")), routeTitle(resolveRoute("/")));
  assert.match(routeTitle(resolveRoute("/app/session")), /Care session/);
  assert.match(routeTitle(resolveRoute("/app/history")), /Session history/);
});
test("production rewrites cover direct app entry without rewriting the API", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.rewrites.map((item: {source: string}) => item.source), [...Object.values(workspacePaths), "/app/spatial/:suite", "/app/dashboard/:suite"]);
  assert.ok(config.rewrites.every((item: {destination: string}) => item.destination === "/index.html"));
});

test("Dashboard suite links preserve the selected suite without borrowing floor routes", () => {
  for (const suite of suiteIds) {
    for (const suffix of ["", "/"]) assert.deepEqual(resolveRoute(dashboardSuitePath(suite) + suffix), { surface: "workspace", page: "monitor", suite });
    assert.equal(routeTitle(resolveRoute(dashboardSuitePath(suite))), `Suite ${suite} · Dashboard — Panoramic`);
    assert.notEqual(dashboardSuitePath(suite), suitePath(suite));
  }
  for (const path of ["/app/dashboard/A999", "/app/dashboard/a101", "/app/dashboard/A101/other"]) assert.deepEqual(resolveRoute(path), { surface: "not-found" });
});

test("each suite has a distinct bookmarkable page, and unknown suites never fall back to A101", () => {
  for (const suite of suiteIds) {
    for (const suffix of ["", "/"]) assert.deepEqual(resolveRoute(suitePath(suite) + suffix), { surface: "workspace", page: "spatial", suite });
    assert.equal(routeTitle(resolveRoute(suitePath(suite))), `Suite ${suite} · Resident Floor — Panoramic`);
  }
  for (const path of ["/app/spatial/A999", "/app/spatial/a101", "/app/spatial/A101/other"]) assert.deepEqual(resolveRoute(path), { surface: "not-found" });
});

test("legacy welcome, supervision and history links redirect to their current surfaces", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.redirects, [
    { source: "/welcome", destination: "/", permanent: false },
    { source: "/app/supervision", destination: "/app/spatial", permanent: false },
    { source: "/app/history", destination: "/app/session/history", permanent: false },
  ]);
});

test("session history is nested under Care session and retains legacy bookmarks", () => {
  assert.equal(workspacePaths.history, "/app/session/history");
  for (const path of ["/app/history", "/app/history/", "/app/session/history", "/app/session/history/"]) {
    assert.deepEqual(resolveRoute(path), { surface: "workspace", page: "history" });
    assert.equal(routeTitle(resolveRoute(path)), "Care session · Session history — Panoramic");
  }
  const site = readFileSync(new URL("../src/Site.tsx", import.meta.url), "utf8");
  assert.ok(site.includes('"/app/session/history" + window.location.search + window.location.hash'));
});

test("Care session contains current and history views without duplicating navigation or clearing records", () => {
  const workspace = readFileSync(new URL("../src/Workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /const isCareSession = page === "session" \|\| page === "history"/);
  assert.match(workspace, /aria-current=\{isCareSession \? "page" : undefined\}/);
  assert.match(workspace, /<nav className="care-session-tabs" aria-label="Care session views">/);
  assert.match(workspace, /to=\{workspacePaths.session\}[^>]*>Current session<\/SiteLink>/);
  assert.match(workspace, /to=\{workspacePaths.history\}/);
  assert.match(workspace, /Session history <span className="count">\{rows.length\}<\/span>/);
  assert.match(workspace, /setRow\(saved\);\s*setState\(saved.snapshot\);\s*setPage\("session"\)/);
  assert.match(workspace, /const setPage = \(next: WorkspacePage\) => navigate\(workspacePaths\[next\]\)/);
  assert.doesNotMatch(workspace, /Scene review/);
});

test("old supervision routes open Resident Floor and are not separate workspace categories", () => {
  for (const path of ["/app/supervision", "/app/supervision/"]) {
    assert.deepEqual(resolveRoute(path), { surface: "workspace", page: "spatial" });
    assert.equal(routeTitle(resolveRoute(path)), "Resident Floor — Panoramic");
  }
  assert.deepEqual(Object.keys(workspacePaths), ["monitor", "spatial", "session", "history"]);
  const site = readFileSync(new URL("../src/Site.tsx", import.meta.url), "utf8");
  assert.match(site, /window.history.replaceState/);
  assert.ok(site.includes('"/app/spatial" + window.location.search + window.location.hash'));
});

test("runtime entry and workspace no longer contain marketing or marketing links", () => {
  const entry = readFileSync(new URL("../src/Site.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../src/Workspace.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(entry, /Try Panoramic now|Our story|How it works|prototype-details|public-site|function Landing\(/);
  assert.doesNotMatch(workspace, /Product website|prototype-details|Back to website/);
  assert.match(entry, /className="site-button entry-button">Open Workplace<\/SiteLink>/);
  assert.doesNotMatch(entry, /Open care workspace|ArrowRight/);
  assert.match(workspace, /Back to start/);
});

test("entrance places its icon above the product name without restoring surrounding copy", () => {
  const entry = readFileSync(new URL("../src/Site.tsx", import.meta.url), "utf8");
  assert.match(entry, /<h1 aria-label="Panoramic">/);
  assert.match(entry, /<div className="welcome-emblem" aria-hidden="true"><HeartHandshake[^>]+\/><\/div>\s*<h1 aria-label="Panoramic">/);
  assert.equal((entry.match(/<HeartHandshake\b/g) ?? []).length, 1);
  assert.doesNotMatch(entry, /Welcome to|entry-card|welcome-header|welcome-footer|welcome-privacy/);
  const css = readFileSync(new URL("../src/site.css", import.meta.url), "utf8");
  assert.match(css, /\.welcome-main h1\s*\{[^}]*font-weight: 800/);
});

test("entrance uses the selected webcam as the o and a white sage-outline button", () => {
  const entry = readFileSync(new URL("../src/Site.tsx", import.meta.url), "utf8");
  assert.match(entry, /<h1 aria-label="Panoramic"><span className="entry-wordmark" aria-hidden="true">Pan<Webcam[^>]*\/>ramic<\/span><\/h1>/);
  assert.equal((entry.match(/<Webcam\b/g) ?? []).length, 1);
  const css = readFileSync(new URL("../src/site.css", import.meta.url), "utf8");
  assert.match(css, /\.welcome-site \.entry-button, \.welcome-site \.entry-button:hover\s*\{[^}]*background: #fff;[^}]*border-color: #8fa58f;[^}]*color: #3f5e4b;/);
  assert.match(css, /\.entry-wordmark-icon\s*\{[^}]*width: \.68em;[^}]*height: \.68em;/);
});

test("workspace starts empty and does not create a record on an empty account sign-in", () => {
  const workspace = readFileSync(new URL("../src/Workspace.tsx", import.meta.url), "utf8");
  const monitor = readFileSync(new URL("../src/SceneMonitor.tsx", import.meta.url), "utf8");
  assert.match(workspace, /useState<State>\(\(\) => emptyState\(\)\)/);
  assert.match(workspace, /else if \(hasSession\) putRow\(await createSession/);
  assert.match(workspace, /page === "session" && !hasSession/);
  assert.match(monitor, /CareTeamPanel team=\{team\}/);
  assert.doesNotMatch(monitor, /recommendCaregiver|advanceIncident/);
  assert.match(monitor, /const \[setupOpen, setSetupOpen\] = useState\(false\)/);
  assert.match(monitor, /No activity yet/);
  assert.doesNotMatch(workspace, /brand-icon|Prototype · fictional data only|Demo caregiver Alex|<footer>/);
});

test("product title has a finite top-down reveal with a reduced-motion fallback", () => {
  const css = readFileSync(new URL("../src/site.css", import.meta.url), "utf8");
  assert.match(css, /\.welcome-site \.welcome-main h1\s*\{[^}]*animation: panoramic-reveal 1400ms/);
  assert.match(css, /@keyframes panoramic-reveal\s*\{\s*from\s*\{[^}]*opacity: 0;[^}]*translateY\(-18px\)[^}]*mask-position: 0 100%/);
  assert.match(css, /to\s*\{[^}]*opacity: 1;[^}]*transform: none;[^}]*mask-position: 0 0/);
  assert.doesNotMatch(css, /panoramic-reveal[^;]*infinite/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.welcome-site \.welcome-main h1\s*\{[^}]*animation: none;[^}]*mask-image: none/);
});
