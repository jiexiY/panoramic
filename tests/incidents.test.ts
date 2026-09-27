import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  publishPayload,
  memberAvailable,
  handoffText,
  type PublishInput,
  type TeamMember,
  type SharedIncident,
} from "../src/incidents.ts";
const input: PublishInput = {
  id: "record-1",
  room: "A102",
  zone: "Bathroom",
  analysis: {
    source: "gemini",
    model: "test-fixture",
    analyzedAt: "2026-09-26T16:00:00Z",
    scene: {
      observations: [
        {
          label: "Possible spill",
          kind: "possible_spill",
          box: [600, 400, 900, 800],
          evidence: "Liquid-like reflection on floor.",
        },
      ],
      brief: "Check the floor.",
      uncertainty: "Reflection may be glare.",
    },
  },
  route: null,
  mediaName: "clip.mp4",
  frameTime: 2.5,
};
const member: TeamMember = {
  facility_id: "center",
  user_id: "caregiver",
  display_name: "Caregiver 01",
  role: "caregiver",
  qualified: true,
  available: true,
  available_until: "2026-09-26T16:01:30Z",
  response_order: 1,
};
const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("publish links actual supplied analysis, room and video time without introducing sample data", () => {
  const p = publishPayload("center", input);
  assert.equal(p.room, "A102");
  assert.equal(p.frame_time, 2.5);
  assert.deepEqual(p.observation, input.analysis);
  assert.equal(p.priority, "unassessed");
  assert.equal(p.id, "record-1");
});
test("no route never produces a fabricated L3", () => {
  assert.equal(publishPayload("center", input).priority, "unassessed");
});
test("marked image-space route produces overlap priority", () => {
  assert.equal(
    publishPayload("center", {
      ...input,
      route: {
        name: "Bathroom access",
        source: "caregiver-marked",
        margin: 25,
        points: [
          { x: 500, y: 300 },
          { x: 500, y: 950 },
        ],
      },
    }).priority,
    "crossing",
  );
});
test("no candidate hazard cannot create a response", () => {
  assert.throws(
    () =>
      publishPayload("center", {
        ...input,
        analysis: {
          ...input.analysis,
          scene: { ...input.analysis.scene, observations: [] },
        },
      }),
    /No candidate/,
  );
});
test("reject unknown room, missing provenance, bad boxes and malformed route", () => {
  assert.throws(() => publishPayload("center", { ...input, room: "other" }));
  assert.throws(() =>
    publishPayload("center", {
      ...input,
      analysis: { ...input.analysis, analyzedAt: "invalid" },
    }),
  );
  assert.throws(() =>
    publishPayload("center", {
      ...input,
      analysis: {
        ...input.analysis,
        scene: {
          ...input.analysis.scene,
          observations: [
            { ...input.analysis.scene.observations[0], box: [0, 0, 2000, 20] },
          ],
        },
      },
    }),
  );
  assert.throws(() =>
    publishPayload("center", {
      ...input,
      route: { name: "x", points: [], source: "caregiver-marked", margin: 2 },
    }),
  );
});
test("availability requires qualification, explicit availability and a fresh heartbeat", () => {
  const now = Date.parse("2026-09-26T16:00:30Z");
  assert.equal(memberAvailable(member, now), true);
  for (const change of [
    { qualified: false },
    { available: false },
    { available_until: null },
    { available_until: "2026-09-26T15:59:00Z" },
  ])
    assert.equal(memberAvailable({ ...member, ...change }, now), false);
});
test("handoff preserves uncertainty and only includes the selected incident history", () => {
  const record = {
    ...publishPayload("center", input),
    observation: input.analysis,
    route: null,
    phase: "resolved",
    assigned_to: "caregiver",
    resolution: "Floor inspected and cleared.",
    created_at: "now",
    updated_at: "now",
  } as unknown as SharedIncident;
  const text = handoffText(
    record,
    [
      {
        id: "event",
        incident_id: record.id,
        actor_id: "caregiver",
        action: "resolve",
        detail: "Floor inspected and cleared.",
        created_at: "2026-09-26T16:05:00Z",
      },
      {
        id: "other",
        incident_id: "unrelated",
        actor_id: "caregiver",
        action: "resolve",
        detail: "DO NOT INCLUDE",
        created_at: "2026-09-26T16:05:00Z",
      },
    ],
    [member],
  );
  assert.match(text, /Reflection may be glare/);
  assert.match(text, /Caregiver 01/);
  assert.match(text, /frame 2.5s/);
  assert.doesNotMatch(text, /DO NOT INCLUDE/);
});
test("operational views share one cloud store instead of independent response machines", () => {
  const ws = source("src/Workspace.tsx");
  assert.match(ws, /useCareTeam\(owner\)/);
  assert.match(ws, /MonitoringDashboard[^\n]+team=\{careTeam\}/);
  assert.match(source("src/DashboardActivity.tsx"), /<SceneMonitor[^\n]+scopeRoom=\{room\} team=\{team\}/);
  assert.match(ws, /FacilityWorkspace[^\n]+team=\{careTeam\}/);
  assert.doesNotMatch(
    source("src/FacilityWorkspace.tsx"),
    /facilityTransition|emptyFacility|bathroomScene/,
  );
  assert.doesNotMatch(
    source("src/SceneMonitor.tsx"),
    /advanceIncident|startIncident/,
  );
});
test("database contract has RLS, immutable client audit log, compare-and-swap and claim uniqueness", () => {
  const sql = source("database/incident-workflow.sql");
  for (const table of [
    "care_facilities",
    "care_members",
    "care_incidents",
    "care_incident_events",
  ])
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );
  assert.match(sql, /create unique index care_one_response/);
  assert.match(sql, /is distinct from incident.version/);
  assert.match(sql, /prior.actor_id is distinct from actor/);
  assert.match(sql, /grant select on public.care_facilities/);
  assert.doesNotMatch(
    sql,
    /grant (?:all|update|insert).*care_incidents to authenticated/i,
  );
  assert.match(sql, /request_id uuid not null unique/);
});
test("escalation runs in database, not a setTimeout pretending to notify staff", () => {
  const sql = source("database/incident-workflow.sql");
  assert.match(
    sql,
    /cron.schedule\('panoramic-response-escalation','30 seconds'/,
  );
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /escalated_at is null and due_at<=now\(\)/);
  assert.match(
    sql,
    /revoke all on function panoramic_private.escalate_due\(\) from public,anon,authenticated/,
  );
});
test("private media and database-change websocket are allowed without broad CSP hosts", () => {
  const cfg = JSON.parse(source("vercel.json"));
  const csp = cfg.headers[0].headers.find(
    (h: { key: string }) => h.key === "Content-Security-Policy",
  ).value;
  assert.match(csp, /wss:\/\/kcyfplbnavcdruogkvbr.supabase.co/);
  assert.doesNotMatch(csp, /connect-src[^;]+\*/);
  assert.match(
    source("database/incident-workflow.sql"),
    /'care-evidence','care-evidence',false/,
  );
  assert.match(
    source("src/IncidentDesk.tsx"),
    /storage\s*\.from\("care-evidence"\)\s*\.download/,
  );
});
