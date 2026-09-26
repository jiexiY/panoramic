import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

for (const mode of ["fresh", "upgrade"]) test(`isolated PostgreSQL (${mode}): supervision-first response, permissions and escalation`, async t => {
  // No remote connection, environment variables, Auth service or provider requests.
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      grant usage on schema public to authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, email text, is_anonymous boolean default false, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
    `);
    const schema = readFileSync(new URL("../database/incident-workflow.sql", import.meta.url), "utf8");
    // Hosted Cron scheduling and logical replication are integration checks, not emulated here.
    if (mode === "fresh") await db.exec(schema.split("create extension if not exists pg_cron;")[0]);
    else {
      const baseline = readFileSync(new URL("./fixtures/incident-baseline.sql", import.meta.url), "utf8");
      await db.exec(baseline.split("create extension if not exists pg_cron;")[0]);
      const owner=crypto.randomUUID(), center=crypto.randomUUID(), record=crypto.randomUUID();
      await db.query("insert into auth.users values($1,'upgrade@example.invalid',false,now())",[owner]);
      await db.query("insert into public.care_facilities(id,owner_id,name) values($1,$2,'Preserved center')",[center,owner]);
      await db.query("insert into public.care_members(facility_id,user_id,display_name,role) values($1,$2,'Preserved coordinator','coordinator')",[center,owner]);
      await db.query("insert into public.care_incidents(id,facility_id,created_by,room,zone,observation,priority,media_name,phase,resolution) values($1,$2,$3,'A101','Bathroom','{}','unassessed','old-frame.jpg','resolved','Keep this old outcome')",[record,center,owner]);
      await db.query("insert into public.care_incident_events(incident_id,facility_id,actor_id,action,detail,request_id) values($1,$2,$3,'resolved','Keep this old event',gen_random_uuid())",[record,center,owner]);
      const before=(await db.query("select to_jsonb(i) saved from public.care_incidents i where id=$1",[record])).rows;
      const grants=(await db.query("select relacl::text,relrowsecurity from pg_class where oid='public.care_incidents'::regclass")).rows;
      const migration=readFileSync(new URL("../supabase/migrations/20260926213803_supervision_first_dispatch.sql",import.meta.url),"utf8");
      await db.exec("begin;\n"+migration+"\ncommit;");
      assert.deepEqual((await db.query("select to_jsonb(i) saved from public.care_incidents i where id=$1",[record])).rows,before);
      assert.deepEqual((await db.query("select relacl::text,relrowsecurity from pg_class where oid='public.care_incidents'::regclass")).rows,grants);
      assert.equal((await db.query<{detail:string}>("select detail from public.care_incident_events where incident_id=$1",[record])).rows[0].detail,"Keep this old event");
    }
    const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
    for (let n = 0; n < ids.length; n++) await db.query("insert into auth.users values($1,$2,false,now())", [ids[n], `local${n}@example.invalid`]);
    const [coordinator, caregiver, other, outsider, secondCoordinator] = ids;
    const asUser = async (id: string) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec("set role authenticated"); };
    const command = async (action: string, payload: object) => (await db.query<{ result: any }>("select public.care_command($1,$2::jsonb) as result", [action, JSON.stringify(payload)])).rows[0].result;
    await asUser(coordinator);
    const facility = (await command("create_facility", { name: "Isolated Test Center", display_name: "Test Coordinator" })).facility_id;
    for (const n of [1,2]) await command("add_member", { facility_id: facility, email: `local${n}@example.invalid`, display_name: `Test Caregiver ${n}`, qualified: true, response_order: n });
    for (const actor of [caregiver, other]) { await asUser(actor); await command("availability", { facility_id: facility, available: true }); }
    await asUser(coordinator);
    const make = () => ({ facility_id: facility, id: crypto.randomUUID(), room: "A102", zone: "Bathroom", route: null, priority: "unassessed", media_name: "local-test.png", frame_time: null,
      observation: { source: "gemini", model: "contract-fixture-not-provider", analyzedAt: new Date().toISOString(), scene: { observations: [{ label: "Possible spill", evidence: "Liquid-like reflection", kind: "possible_spill", box: [500,400,900,800] }], brief: "Check apparent liquid on floor.", uncertainty: "Could be glare." } } });
    let incident = await command("publish", make());
    const payload = (extra = {}) => ({ facility_id: facility, id: incident.id, version: incident.version, request_id: crypto.randomUUID(), ...extra });
    await t.test("publishing only queues a concern; caregiver cannot self-dispatch", async () => {
      assert.equal(incident.phase, "flagged"); assert.equal(incident.assigned_to, null);
      await asUser(caregiver);
      await assert.rejects(command("acknowledge", payload()), /Only the assigned/);
      await assert.rejects(command("dispatch", payload({ caregiver_id: caregiver })), /Only the coordinator/);
      await assert.rejects(db.query("update public.care_incidents set phase='resolved'"), /permission denied/);
    });
    await t.test("outsider cannot read or write another facility", async () => {
      await asUser(outsider);
      assert.equal((await db.query("select * from public.care_incidents")).rows.length, 0);
      await assert.rejects(command("dispatch", payload({ caregiver_id: caregiver })), /do not have access/);
    });
    await t.test("coordinator assignment reserves caregiver but does not record acceptance", async () => {
      await asUser(coordinator);
      const request = payload({ caregiver_id: caregiver });
      incident = await command("dispatch", request);
      assert.equal(incident.phase, "dispatched"); assert.equal(incident.assigned_to, caregiver);
      assert.equal((await command("dispatch", request)).version, incident.version);
      assert.equal((await db.query("select * from public.care_incident_events where action='dispatch'")).rows.length, 1);
      const available = (await db.query<{ available: boolean }>("select available from public.care_members where user_id=$1", [caregiver])).rows[0].available;
      assert.equal(available, false);
      await asUser(other); await assert.rejects(command("acknowledge", payload()), /Only the assigned/);
    });
    await t.test("reserved caregiver cannot be assigned twice, including across facilities", async () => {
      await asUser(secondCoordinator);
      const second = (await command("create_facility", { name: "Second Local Center", display_name: "Second Coordinator" })).facility_id;
      await command("add_member", { facility_id: second, email: "local1@example.invalid", display_name: "Shared Caregiver", qualified: true });
      await asUser(caregiver);
      await assert.rejects(command("availability", { facility_id: second, available: true }), /already handling/);
      await asUser(coordinator);
      const another = await command("publish", make());
      await assert.rejects(command("dispatch", { facility_id: facility, id: another.id, version: another.version, request_id: crypto.randomUUID(), caregiver_id: caregiver }), /no longer available|already has/);
    });
    await t.test("decline returns concern to supervision and preserves a reason", async () => {
      await asUser(caregiver);
      await assert.rejects(command("decline", payload({ note: "no" })), /with a reason/);
      incident = await command("decline", payload({ note: "Already assisting someone; cannot attend." }));
      assert.equal(incident.phase, "flagged"); assert.equal(incident.assigned_to, null); assert.ok(incident.escalated_at);
    });
    await t.test("fresh assignment, stale-version rejection, acceptance and arrival", async () => {
      await asUser(coordinator);
      const staleVersion = incident.version;
      incident = await command("dispatch", payload({ caregiver_id: other }));
      await asUser(other);
      await assert.rejects(command("arrive", payload()), /Only the assigned caregiver can confirm/);
      await assert.rejects(command("acknowledge", payload({ version: staleVersion })), /changed/);
      incident = await command("acknowledge", payload()); assert.equal(incident.phase, "acknowledged");
      await assert.rejects(command("resolve", payload({ note: "Floor checked and dried." })), /Confirm arrival/);
      incident = await command("arrive", payload()); assert.equal(incident.phase, "arrived");
    });
    await t.test("database escalation is idempotent and resolution remains caregiver-confirmed", async () => {
      await db.exec("reset role");
      await db.query("update public.care_incidents set due_at=now()-interval '1 second' where id=$1", [incident.id]);
      await db.query("select panoramic_private.escalate_due()");
      const once = (await db.query("select * from public.care_incident_events where action='escalated'")).rows.length;
      await db.query("select panoramic_private.escalate_due()");
      assert.equal((await db.query("select * from public.care_incident_events where action='escalated'")).rows.length, once);
      await asUser(other);
      incident = (await db.query<{ i: any }>("select to_jsonb(i) i from public.care_incidents i where id=$1", [incident.id])).rows[0].i;
      incident = await command("resolve", payload({ note: "Inspected the area; reflection was glare. No spill found." }));
      assert.equal(incident.phase, "resolved"); assert.match(incident.resolution, /No spill found/);
      assert.equal(incident.escalated_at, null);
    });
    await t.test("security grants and RLS are enabled on every exposed team table", async () => {
      await db.exec("reset role");
      const tables = (await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname in ('care_facilities','care_members','care_incidents','care_incident_events')")).rows;
      assert.equal(tables.length, 4); assert.ok(tables.every(r => r.relrowsecurity));
      for (const role of ["anon", "authenticated"]) assert.equal((await db.query<{ allowed: boolean }>("select has_table_privilege($1,'public.care_incidents','UPDATE') allowed", [role])).rows[0].allowed, false);
    });
  } finally { await db.close(); }
});
