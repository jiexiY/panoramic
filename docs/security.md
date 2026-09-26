# Data and security boundaries

## Data flow

Browser action → TypeScript transition → authenticated Supabase request → PostgreSQL RLS → saved snapshot and server revision → UI confirmation.

A local walkthrough does not transmit its session to Supabase until the user chooses cloud saving. The Supabase client may contact Auth when restoring an existing browser session. Vercel serves the frontend and receives normal hosting traffic. No AI provider receives images or session records in this version.

## Implemented controls

- `care_sessions` has enabled and forced RLS. Select/insert/update/delete policies bind `owner_id` to the authenticated user's `auth.uid()`.
- Unauthenticated callers have no table privileges. Anonymous *signed-in* guests get distinct Auth identities; they do not share one public demo user.
- The frontend has a publishable key only. No service-role key, password, or database connection string is bundled.
- Update privileges cover `snapshot` only; clients cannot reassign ownership, edit server timestamps, or choose revisions.
- A `SECURITY INVOKER` trigger sets timestamps and increments revisions. It does not bypass RLS. Direct function execution is revoked from public client roles.
- Each update matches both ID and the expected revision. A zero-row update produces a visible conflict and asks the user to reload; it is not silently retried over newer work.
- Snapshots are size-bounded and capped at 500 events. Per-identity inserts are serialized to enforce a 30-session demo cap.
- Cloud failures leave the previous confirmed UI state intact and show an error. There is no silent fallback claiming a cloud save succeeded.
- No HTML from user records is injected. React renders strings as text. CSP restricts connections to the configured Supabase project; camera, microphone, and geolocation are disabled by the hosting policy.

## Not implemented / not claimed

- Verified caregiver identity, facility membership, role-based team access, invitation workflows, cross-device recovery for guests.
- Immutable audit logs, clinical-record integrity, formal health-data compliance, or clinical decision support.
- Server-enforced clinical workflow semantics: the stored record is operator-owned prototype data, and an owner can alter their own snapshots via the API.
- CAPTCHA setup, comprehensive bot protection, an automated retention/cleanup schedule, or a clinical incident escalation service.
- Real alerts to colleagues or emergency services. Buttons record demonstration events only.

Do not load real care data. Enable CAPTCHA/abuse protections before broad public use. Default Supabase sign-up limits and per-identity row caps do not stop a determined actor from creating many identities. Keep the project on its selected plan; no paid upgrade was requested.

Guest access uses browser-local authentication storage. Anyone using the same unlocked browser profile may access that identity's fictional sessions. Clearing that storage loses the guest's recovery path. Auth tokens are not application secrets to publish or log.

## Retention

There is no automated deletion job in this first version. An administrator must review and remove demo data under a deliberate retention process; do not interpret the 30-row cap as an expiry policy. The automated integration test removes only the row it creates and signs out its two test identities. It does not delete unrelated user records or Auth accounts.
