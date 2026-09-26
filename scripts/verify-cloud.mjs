// Creates two temporary guest identities and only fictional test rows.
// Deletes its own test rows afterwards; does not modify any other records.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const url = process.env.VITE_SUPABASE_URL,
  key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key)
  throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const a = createClient(url, key, options),
  b = createClient(url, key, options),
  anon = createClient(url, key, options);
const snapshot = {
  schema: 1,
  scenario: "two",
  phase: "prepare",
  consent: false,
  checks: {
    route: false,
    floor: false,
    equipment: false,
    supports: false,
    water: false,
    privacy: false,
  },
  planReviewed: false,
  caregiver: false,
  helper: false,
  coverage: false,
  shift: "day",
  help: "none",
  paused: false,
  exit: false,
  concern: false,
  events: [
    {
      at: new Date().toISOString(),
      text: "Automated fictional isolation test.",
    },
  ],
};
let row;
try {
  const ar = await a.auth.signInAnonymously();
  if (ar.error) throw ar.error;
  const br = await b.auth.signInAnonymously();
  if (br.error) throw br.error;
  const inserted = await a
    .from("care_sessions")
    .insert({ owner_id: ar.data.user.id, snapshot })
    .select()
    .single();
  if (inserted.error) throw inserted.error;
  row = inserted.data;
  assert.equal(row.revision, 0);
  console.log("PASS authenticated insert");
  const own = await a
    .from("care_sessions")
    .select("*")
    .eq("id", row.id)
    .single();
  assert.equal(own.data.id, row.id);
  console.log("PASS owner read");
  const cross = await b.from("care_sessions").select("*").eq("id", row.id);
  assert.ifError(cross.error);
  assert.deepEqual(cross.data, []);
  console.log("PASS cross-user read denied");
  const crossWrite = await b
    .from("care_sessions")
    .update({ snapshot: { ...snapshot, phase: "complete" } })
    .eq("id", row.id)
    .select();
  assert.ifError(crossWrite.error);
  assert.deepEqual(crossWrite.data, []);
  console.log("PASS cross-user update denied");
  const forge = await b
    .from("care_sessions")
    .insert({ owner_id: ar.data.user.id, snapshot });
  assert.ok(forge.error);
  console.log("PASS forged ownership rejected");
  const publicRead = await anon.from("care_sessions").select("*");
  assert.ok(publicRead.error || publicRead.data.length === 0);
  console.log("PASS unauthenticated read denied");
  const reassign = await a
    .from("care_sessions")
    .update({ owner_id: br.data.user.id })
    .eq("id", row.id);
  assert.ok(reassign.error);
  console.log("PASS owner reassignment denied");
  const saved = await a
    .from("care_sessions")
    .update({ snapshot: { ...snapshot, shift: "night" } })
    .eq("id", row.id)
    .eq("revision", 0)
    .select()
    .single();
  assert.ifError(saved.error);
  assert.equal(saved.data.revision, 1);
  console.log("PASS server revision increment");
  const stale = await a
    .from("care_sessions")
    .update({ snapshot })
    .eq("id", row.id)
    .eq("revision", 0)
    .select();
  assert.ifError(stale.error);
  assert.deepEqual(stale.data, []);
  console.log("PASS stale-tab overwrite prevented");
  const reread = await a
    .from("care_sessions")
    .select("*")
    .eq("id", row.id)
    .single();
  assert.equal(reread.data.snapshot.shift, "night");
  console.log("PASS cloud persistence");
  const crossDelete = await b
    .from("care_sessions")
    .delete()
    .eq("id", row.id)
    .select();
  assert.ifError(crossDelete.error);
  assert.deepEqual(crossDelete.data, []);
  console.log("PASS cross-user delete denied");
} finally {
  if (row) {
    const removed = await a
      .from("care_sessions")
      .delete()
      .eq("id", row.id)
      .select();
    if (removed.error)
      console.error("Test row cleanup failed:", removed.error.message);
    else assert.equal(removed.data.length, 1);
  }
  await a.auth.signOut();
  await b.auth.signOut();
}
