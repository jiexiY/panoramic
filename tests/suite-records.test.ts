import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { suiteRecords } from "../src/suiteRecords.ts";
import type { SharedIncident, IncidentEvent } from "../src/incidents.ts";

const incidents = [
  { id: "one", room: "A101", phase: "flagged" },
  { id: "two", room: "A102", phase: "arrived" },
  { id: "three", room: "A101", phase: "resolved" },
] as SharedIncident[];
const events = [
  { id: "one-event", incident_id: "one", detail: "A101 hazard" },
  { id: "two-event", incident_id: "two", detail: "A102 arrival" },
  { id: "three-event", incident_id: "three", detail: "A101 closed follow-up" },
  { id: "orphan", incident_id: "missing", detail: "Unknown suite" },
] as IncidentEvent[];

test("suite scope isolates concerns, activity, and completed follow-up records", () => {
  const a101 = suiteRecords("A101", incidents, events);
  assert.deepEqual(a101.incidents.map(i => i.id), ["one", "three"]);
  assert.deepEqual(a101.open.map(i => i.id), ["one"]);
  assert.deepEqual(a101.events.map(e => e.id), ["one-event", "three-event"]);
  const a102 = suiteRecords("A102", incidents, events);
  assert.deepEqual(a102.incidents.map(i => i.id), ["two"]);
  assert.deepEqual(a102.events.map(e => e.id), ["two-event"]);
  assert.deepEqual(suiteRecords("A103", incidents, events), { incidents: [], open: [], events: [] });
  assert.deepEqual(suiteRecords("A101", incidents, events), a101); // switching suites does not mutate records
});

test("suite page defaults, record links, and assistant lifecycle cannot fall back to another suite", () => {
  const facility = readFileSync(new URL("../src/FacilityWorkspace.tsx", import.meta.url), "utf8");
  assert.match(facility, /suiteRecords\(monitoringRoom, team.incidents, team.events\)/);
  assert.match(facility, /incidents.find\(\(i\) => i.id === selectedId\) \?\?\s*open\[0\] \?\?\s*incidents\[0\]/);
  assert.match(facility, /if \(room !== monitoringRoom \|\| !incidents.some/);
  assert.match(facility, /key=\{`\$\{team.userId\}:\$\{team.facilityId\}:\$\{monitoringRoom\}`\} room=\{monitoringRoom\}/);
  assert.match(facility, /to=\{suitePath\(id\)\}/);
  assert.doesNotMatch(facility, /team.incidents\[0\]|team.events\s*\.slice/);
  // Dispatch must retain the global team for double-booking checks.
  const suiteAI = readFileSync(new URL("../src/SuiteAI.tsx", import.meta.url), "utf8");
  assert.match(suiteAI, /suiteRecords\(room, team.incidents, team.events\)/);
  assert.match(suiteAI, /<IncidentDesk key=\{current.id\} team=\{team\} incident=\{current\}/);
});
