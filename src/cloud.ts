import { createClient } from "@supabase/supabase-js";
import type { State } from "./workflow";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const cloud = url && key ? createClient(url, key) : null;
export type Row = {
  id: string;
  owner_id: string;
  revision: number;
  snapshot: State;
  updated_at: string;
  created_at: string;
};
function requireCloud() {
  if (!cloud)
    throw new Error(
      "Supabase is not configured. The local walkthrough is still available.",
    );
  return cloud;
}
export async function connectGuest() {
  const client = requireCloud();
  const existing = await client.auth.getSession();
  if (existing.error) throw existing.error;
  if (existing.data.session) return existing.data.session.user;
  const { data, error } = await client.auth.signInAnonymously();
  if (error)
    throw new Error(
      error.message.includes("disabled")
        ? "Guest cloud access is not enabled yet. Use the local walkthrough or sign in with an existing account."
        : error.message,
    );
  if (!data.user) throw new Error("No authenticated session returned.");
  return data.user;
}
export async function listSessions() {
  const { data, error } = await requireCloud()
    .from("care_sessions")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as Row[];
}
export async function createSession(snapshot: State, owner: string) {
  const { data, error } = await requireCloud()
    .from("care_sessions")
    .insert({ owner_id: owner, snapshot })
    .select()
    .single();
  if (error) throw error;
  return data as Row;
}
export async function saveSession(row: Row, snapshot: State) {
  // Compare-and-swap: a stale tab cannot silently overwrite a newer handoff.
  const { data, error } = await requireCloud()
    .from("care_sessions")
    .update({ snapshot })
    .eq("id", row.id)
    .eq("revision", row.revision)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new Error(
      "This session changed in another tab. Reload the saved session before continuing. Your last action was not applied.",
    );
  return data as Row;
}
