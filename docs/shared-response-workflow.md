# Shared response workflow

## Implementation status — 26 September 2026

The supervisor-first workflow and Panoramic AI are implemented locally, not deployed. The existing Supabase project has the **earlier shared-incident baseline**, which does not support the new `dispatched` phase, supervisor assignment or decline action. Do not publish the new frontend against that baseline. `database/incident-workflow.sql` now describes a fresh installation; it is not an upgrade script.

- Build passes; **105 local tests pass**. These include the actual SQL commands and RLS executed in isolated PGlite PostgreSQL, API mocks, pure business logic and source contracts. They do not include a successful live Gemini analysis.
- Isolated database checks cover membership isolation, coordinator-only dispatch, recipient-only acceptance, double-assignment prevention across facilities, decline/reassignment, stale revisions, idempotency, escalation and written resolution. Auth tables are stubbed locally; hosted Auth, Realtime, Storage transport and true concurrent sessions are not covered by this test.
- Chrome verified the product's empty Panoramic AI panel and care-team toggle. A separately labeled local-only UI fixture exercised review/confirm assignment, acceptance, arrival and written resolution, including a 390 px phone layout without horizontal overflow. It does not create accounts, write cloud records or request model output, and is excluded from the production build.

Earlier hosted-baseline checks, retained as dated observations rather than new verification:
- Live read-only REST checks denied anonymous access to all four new tables (HTTP 401).
- Supabase security advisor: no findings. Performance advisor reports only unused indexes on the newly empty tables; retain indexes supporting membership and foreign keys until real workload evidence exists. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- The `panoramic-response-escalation` database job is active every 30 seconds; recent empty-queue executions succeeded.
- The earlier check found zero accounts, facilities or incidents. No resident information was added during this implementation.
- `database/verify-incident-workflow.sql` is a **legacy baseline** test, now labeled accordingly. Its execution was blocked by approval review because it inserts synthetic Auth identities in the live database. It is not valid for the new dispatch workflow. Use the isolated automated tests; do not run live Auth mutations without specific approval.
- Authenticated cross-client delivery, concurrent dispatch behavior, private-image uploads and real model output remain unverified end to end. Do not present local tests or the reference GIF as evidence that these have been live-tested.

## One operational record

1. A confirmed account creates an isolated facility workspace. Its coordinator adds already-confirmed caregiver accounts by email and explicitly confirms eligibility. Other facilities cannot read its roster or incidents under the membership RLS policies.
2. A caregiver marks themselves available. A visible screen renews availability every 30 seconds; a lease expires after 90 seconds. Presence does not automatically make someone available. Finishing a response does not mark them available again.
3. In Scene review, choose a room and area, upload an unoccupied non-identifying image or capture one frame from a local video, and optionally mark its walking route **before** analysis.
4. An explicit Gemini request obtains structured observations. If a candidate hazard is returned and a facility is connected, the browser saves a shared incident automatically. No-hazard output creates no incident; it is not an all-clear.
5. The record includes room, area, model output, uncertainty, media name, frame time, route context and timestamp. A private JPEG is attached separately. A failed attachment leaves a visible saved concern and a retry that retains the same incident ID.
6. Supabase Postgres Changes triggers a fresh authorized read on other open clients. Fifteen-second polling and reconnect reads recover missed updates. Stale/offline clients cannot use the response buttons. This is in-app delivery, not phone push, SMS or emergency dispatch.
7. The supervision queue receives the concern first. The database can suggest an eligible, available team member using coordinator-entered response order. A coordinator reviews and explicitly confirms an assignment. This reserves the responder and changes the record to **Awaiting acceptance**, not accepted or attending. The server serializes facility commands and enforces one reserved/active response per caregiver across facilities.
8. Only the assigned, eligible caregiver can accept, then confirm arrival and record an outcome. Before acceptance they can decline with a reason, returning the concern to supervision for reassignment. A coordinator can reassign a pending request but cannot move an already accepted response through this control. Nobody is automatically marked available after resolution, decline or reassignment. Version checks reject stale updates; command IDs make identical retries idempotent. Events are append-only to app users, not tamper-proof against database administrators.
9. A database job escalates missing assignment after two minutes, missing acceptance two minutes after dispatch, missing arrival three minutes after acceptance, or an open attended response after ten minutes. The next 30-second job run records escalation and brings it to the shared coordinator queue. Thresholds are prototype defaults, not clinical standards. This does not contact someone outside the app.
10. Spatial view and Supervision read that same incident. Refresh restores the shared queue. A factual handoff is generated directly from observations and saved events, with no additional paid AI request.

## Panoramic AI

The sidebar answers questions about authorized concern records, responder availability and response timelines through server-side Gemini. Evidence references open the underlying record. It can propose an assignment, but the supervisor must separately review and confirm it through the same checked database command. The model has no write tools. See [AI workflow and release checklist](panoramic-ai-workflow.md).

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

Before release, generate a timestamped upgrade migration with the Supabase CLI and review the exact hosted baseline. Test the upgrade separately; preserve existing records and grants. Then verify with two individually confirmed accounts plus an outsider identity: dispatch, delivery, decline, reconnect, private media, conflicting assignments and escalation. Specific approval is still required for synthetic identities in the live project. A new Gemini call requires separately approved quota/cost scope. No hosted database changes or model requests were made for this increment.
