# Shared response workflow

## Implementation status — 26 September 2026

The shared workflow is implemented locally. Its additive database schema is installed in the existing Supabase project. The frontend has not yet been released to production pending authenticated verification.

- Build passes; 86 local tests pass. These include API mocks, pure business logic and schema/source contracts, not a successful live Gemini analysis.
- Live read-only REST checks denied anonymous access to all four new tables (HTTP 401).
- Browser checks passed for empty-state navigation, account-form switching and recording access. A clearly labeled local-only UI fixture exercised acceptance, arrival and written resolution, including a 390 px phone layout without horizontal overflow. The fixture uses no database or model and is excluded from the production build.
- Supabase security advisor: no findings. Performance advisor reports only unused indexes on the newly empty tables; retain indexes supporting membership and foreign keys until real workload evidence exists. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- The `panoramic-response-escalation` database job is active every 30 seconds; recent empty-queue executions succeeded.
- Zero accounts, facilities or incidents exist in this project. No resident information was added.
- A rollback-only database behavior test is prepared in `database/verify-incident-workflow.sql`. Its execution was blocked by approval review because it inserts synthetic Auth identities in the live database. Do not run until explicitly approved.
- Authenticated cross-client delivery, claim-race behavior, private-image uploads and real model output remain unverified end to end. Do not present unit tests or the reference GIF as evidence that these have been live-tested.

## One operational record

1. A confirmed account creates an isolated facility workspace. Its coordinator adds already-confirmed caregiver accounts by email and explicitly confirms eligibility. Other facilities cannot read its roster or incidents under the membership RLS policies.
2. A caregiver marks themselves available. A visible screen renews availability every 30 seconds; a lease expires after 90 seconds. Presence does not automatically make someone available. Finishing a response does not mark them available again.
3. In Scene review, choose a room and area, upload an unoccupied non-identifying image or capture one frame from a local video, and optionally mark its walking route **before** analysis.
4. An explicit Gemini request obtains structured observations. If a candidate hazard is returned and a facility is connected, the browser saves a shared incident automatically. No-hazard output creates no incident; it is not an all-clear.
5. The record includes room, area, model output, uncertainty, media name, frame time, route context and timestamp. A private JPEG is attached separately. A failed attachment leaves a visible saved concern and a retry that retains the same incident ID.
6. Supabase Postgres Changes triggers a fresh authorized read on other open clients. Fifteen-second polling and reconnect reads recover missed updates. Stale/offline clients cannot use the response buttons. This is in-app delivery, not phone push, SMS or emergency dispatch.
7. The database suggests an available, eligible team member using coordinator-entered response order. Any available eligible member can accept. The server serializes facility commands and enforces one accepted open response per caregiver; the suggestion is not an arrival or guaranteed dispatch.
8. The assigned caregiver confirms arrival, then records an outcome. Other users cannot confirm these actions on their behalf. Version checks reject stale updates; command IDs make identical retries idempotent. Events are append-only to app users, not tamper-proof against database administrators.
9. A database job escalates an unanswered request after two minutes, an unconfirmed arrival after three minutes, or an open attended response after ten minutes. The next 30-second job run records escalation and brings it to the shared coordinator queue. Thresholds are prototype defaults, not clinical standards. This does not contact someone outside the app.
10. Spatial view and Supervision read that same incident. Refresh restores the shared queue. A factual handoff is generated directly from observations and saved events, with no additional paid AI request.

## Reference recording

Opening the existing OpenCV bathroom GIF no longer creates operational alerts, staff or response history. It is available separately for viewing, pausing and downloading. Its source is still a Gemini-edited image with manually annotated initial regions and optical flow on synthetic motion, not a tested water detector.

## Security and remaining work

- Frontend uses the existing publishable key. No service-role credential was added.
- Exposed tables grant authenticated SELECT only and enable membership-based RLS. Writes go through an invoker RPC wrapper and a narrowly scoped private definer function that checks confirmed identity, membership, role, phase, revision and idempotency.
- A private Storage bucket accepts JPEGs up to 1.5 MB. Uploads must match an incident created by the uploader; reads require access to the linked incident. Raw videos and audio are not uploaded.
- Source labels honestly say model output **saved by a team member**. The save endpoint does not cryptographically attest that a payload originated from Gemini; a trusted team member can submit observations through the RPC. Server-attested provenance is future hardening.
- Four room IDs and the floor layout are still fixed. No resident-specific route learning, audio cue pipeline, continuous video analysis, push notifications, retention/deletion controls, membership revocation UI or clinical validation is implemented.
- Supabase Auth confirmation URL/redirect allowlist and the email confirmation flow need verification before onboarding external users. Use the actual deployment origin; never disable email confirmation to get around setup.

## Verification commands

```sh
npm test
npm run build
node --env-file=.env.local scripts/verify-incident-access.mjs
```

After specific approval, run the rollback SQL test through the authorized database connector. It verifies actual RLS and transitions under separate claims but **does not substitute for two signed-in browser/device tests**. The follow-up browser test must use two individually confirmed accounts, include a third outsider identity for denial, and exercise reconnect, private media, concurrent acceptance and escalation. A new Gemini call requires separately approved quota/cost scope.
