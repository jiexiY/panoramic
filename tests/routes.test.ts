import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveRoute, routeTitle, workspacePaths } from "../src/routes.ts";

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
  assert.match(routeTitle(resolveRoute("/")), /Open workspace/);
  assert.equal(routeTitle(resolveRoute("/welcome")), routeTitle(resolveRoute("/")));
  assert.match(routeTitle(resolveRoute("/app/session")), /Care session/);
  assert.match(routeTitle(resolveRoute("/app/history")), /Session history/);
});
test("production rewrites cover direct app entry without rewriting the API", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.rewrites.map((item: {source: string}) => item.source), Object.values(workspacePaths));
  assert.ok(config.rewrites.every((item: {destination: string}) => item.destination === "/index.html"));
});

test("legacy welcome links redirect to the project entrance", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.redirects, [{ source: "/welcome", destination: "/", permanent: false }]);
});

test("runtime entry and workspace no longer contain marketing or marketing links", () => {
  const entry = readFileSync(new URL("../src/Site.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../src/Workspace.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(entry, /Try Panoramic now|Our story|How it works|prototype-details|public-site|function Landing\(/);
  assert.doesNotMatch(workspace, /Product website|prototype-details|Back to website/);
  assert.match(entry, /Open care workspace/);
  assert.match(workspace, /Back to start/);
});

test("entrance contains only the product name and workspace action", () => {
  const entry = readFileSync(new URL("../src/Site.tsx", import.meta.url), "utf8");
  assert.match(entry, /<h1>Panoramic<\/h1>/);
  assert.doesNotMatch(entry, /Welcome to|welcome-emblem|entry-card|welcome-header|welcome-footer|welcome-privacy|HeartHandshake/);
  const css = readFileSync(new URL("../src/site.css", import.meta.url), "utf8");
  assert.match(css, /\.welcome-main h1\s*\{[^}]*font-weight: 800/);
});

test("workspace starts empty and does not create a record on an empty account sign-in", () => {
  const workspace = readFileSync(new URL("../src/Workspace.tsx", import.meta.url), "utf8");
  const monitor = readFileSync(new URL("../src/SceneMonitor.tsx", import.meta.url), "utf8");
  assert.match(workspace, /useState<State>\(\(\) => emptyState\(\)\)/);
  assert.match(workspace, /else if \(hasSession\) putRow\(await createSession/);
  assert.match(workspace, /page === "session" && !hasSession/);
  assert.match(monitor, /useState<Caregiver\[\]>\(\[\]\)/);
  assert.match(monitor, /const \[setupOpen, setSetupOpen\] = useState\(false\)/);
  assert.match(monitor, /No activity yet/);
  assert.doesNotMatch(workspace, /brand-icon|Prototype · fictional data only|Demo caregiver Alex|<footer>/);
});
