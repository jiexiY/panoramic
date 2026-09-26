# Data and security boundaries

## Data flow

Browser action → TypeScript transition → authenticated Supabase request → PostgreSQL RLS → saved snapshot and server revision → UI confirmation.

A local care walkthrough does not transmit its session to Supabase until the user chooses cloud saving. The Supabase client may contact Auth when restoring an existing browser session. Vercel serves the frontend and receives normal hosting traffic. The optional Gemini scene workflow is separate: an explicitly selected staged frame goes through `/api/gemini` to Google only after staging confirmation, a private demo code, and server configuration. An optional summary sends the fictional scene record on a separate explicit request. Video and audio are not uploaded; only the selected resized frame is sent.

## Gemini demo boundary

- Provider key exists only in server environment variables. Do not use a `VITE_` prefix or pass it to the client. The browser's access code is a separate demo gate; do not reuse the provider key.
- Live requests fail closed unless `GEMINI_API_KEY`, a 16+ character `GEMINI_DEMO_ACCESS_CODE`, and `GEMINI_FREE_TIER_CONFIRMED=true` are configured. The confirmation is an operator attestation, **not an API-level billing check or a spending cap**. Verify the key's project is Free Tier in Google AI Studio before enabling it; never silently attach billing.
- Authentication uses a shared private demo code, not verified staff identity. Share only with intended demo operators. Before opening live analysis broadly, replace this with verified identities and durable, distributed per-user quota controls.
- Per-instance throttling (4 provider requests/minute, 30/day, one in flight) is best effort only: serverless instances and restarts do not share those counters. Google project quotas are separate. No automatic retries, paid model fallback, or billing-upgrade operation is implemented.
- Size and content-type checks bound images and request bodies. The server does not fetch arbitrary client-supplied URLs. It validates model categories, text lengths, and box coordinates, and hides raw upstream error messages.
- Visible image text and supplied records are untrusted data, not instructions. The model receives no tools that can send messages, change staffing, or operate physical equipment. App transitions—not model prose—control the demo response state.
- Free-tier data can be used by Google for improvement and human review. Submit only staged, unoccupied scenes and fictional notes, never real residents or personal care data. Google's data practices apply even though this app does not persist the uploaded image.
- Images, scene results, events, and editable summaries remain in tab memory until exported or refreshed. The app does not log raw media, API keys, access codes, or provider bodies. Hosting/platform retention still needs review before any non-demo use.

## Implemented controls

- `care_sessions` has enabled and forced RLS. Select/insert/update/delete policies bind `owner_id` to the authenticated user's `auth.uid()`.
- Unauthenticated callers have no table privileges. Anonymous *signed-in* guests get distinct Auth identities; they do not share one public demo user.
- The frontend has a publishable key only. No service-role key, password, or database connection string is bundled.
- Update privileges cover `snapshot` only; clients cannot reassign ownership, edit server timestamps, or choose revisions.
- A `SECURITY INVOKER` trigger sets timestamps and increments revisions. It does not bypass RLS. Direct function execution is revoked from public client roles.
- Each update matches both ID and the expected revision. A zero-row update produces a visible conflict and asks the user to reload; it is not silently retried over newer work.
- Snapshots are size-bounded and capped at 500 events. Per-identity inserts are serialized to enforce a 30-session demo cap.
- Cloud failures leave the previous confirmed UI state intact and show an error. There is no silent fallback claiming a cloud save succeeded.
- No HTML from user records is injected. React renders strings as text. CSP restricts connections to the configured Supabase project. Camera, microphone and geolocation are disabled by Permissions-Policy. Audio capture and daily notes are excluded.

## Not implemented / not claimed

- Professional credential verification, invitation/acceptance workflows and cross-device recovery for guests. Confirmed Auth identities, facility membership and coordinator/caregiver roles exist for shared incidents; hosted multi-client verification remains pending.
- Immutable audit logs, clinical-record integrity, formal health-data compliance, or clinical decision support.
- Clinical validation: shared incident transitions are server-checked operational steps, not clinically validated decisions. Older care-session snapshots remain owner-editable prototype data.
- CAPTCHA setup, comprehensive bot protection, an automated retention/cleanup schedule, or a clinical incident escalation service.
- Push, SMS, calls or emergency-service alerts. Shared incidents support in-app updates and database deadline escalation. Playback sends no real notifications.

Do not load real care data. Enable CAPTCHA/abuse protections before broad public use. Default Supabase sign-up limits and per-identity row caps do not stop a determined actor from creating many identities. Keep the project on its selected plan; no paid upgrade was requested.

Guest access uses browser-local authentication storage. Anyone using the same unlocked browser profile may access that identity's fictional sessions. Clearing that storage loses the guest's recovery path. Auth tokens are not application secrets to publish or log.

## Retention

There is no automated deletion job in this first version. An administrator must review and remove demo data under a deliberate retention process; do not interpret the 30-row cap as an expiry policy. The automated integration test removes only the row it creates and signs out its two test identities. It does not delete unrelated user records or Auth accounts.
