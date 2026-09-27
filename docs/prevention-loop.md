# Prevention loop

## Implemented behavior

1. An annotated A101 playback event, or an explicitly submitted Gemini analysis, identifies a candidate hazard.
2. Route geometry selects L1 / L2 / L3. Unknown routes remain unassessed. The room meter shows the assessed level.
3. A concern and attributed Activity entries appear. Panoramic requests assignment at its built-in supervision station.
4. A supervisor chooses an available, qualified responder and confirms assignment. Acceptance and arrival remain separate caregiver actions.
5. The caregiver records an outcome and requests a safety check. This no longer closes a concern.
6. A no-hazard follow-up frame means only “No hazard visible · check pending.” It does not prove physical safety.
7. Supervision confirms the physical safety check. A separate nursing-station member must then check off the response.
8. The active queue clears only after both checks. The audit history and exported handoff are retained.

New hazards invalidate pending clear evidence and approvals. Failure to load a recording is not treated as a clear scene. Repeated commands are idempotent; stale versions and wrong roles are rejected. Staff remain unavailable after completing a response until explicitly marking themselves available again.

## Sources and system boundary

The supplied GIF has manually marked regions tracked with OpenCV; its event is replayed after the image loads, not inferred from GIF pixels in the browser. The dry reference is the user's original bathroom photo before water editing, not a post-cleanup camera observation. Playback uses isolated in-memory roles and records and clears on refresh. Its response brief is deterministic, not a Gemini answer.

Shared mode uses Supabase records, Realtime, restricted transactional commands and existing deadline escalation. Follow-up observations require a fresh Gemini-shaped result from the same room and area; this is client-submitted provenance, not a cryptographically attested detector feed. A production sensor integration would need server-verified ingestion, continuous source-health checks, retention rules, and real camera/inference validation. Single-frame analysis is not continuous surveillance.

No external nursing-home system has been identified or connected. No SMS, phone push, external dispatch, or model-generated system acknowledgment is claimed. The Gemini assistant may suggest an assignment but cannot make station checks or close an activity. Its source context includes follow-up uncertainty and both sign-off states.

## Verification

- 141 local tests passed, including fresh/upgrade PostgreSQL, facility isolation, direct-command bypass rejection, wrong-role and stale-frame rejection, invalidated approvals, idempotency and dual sign-off.
- Local browser walkthrough verified Play tracking → L3 → Active concerns + Activity → assignment → acceptance → arrival → outcome → dry reference → supervision check → nursing check → zero open concerns.
- Supabase migration preserves prior data and leaves public tables RLS-protected; no existing team members are promoted to nursing roles by the migration.
- No billable provider request or external dispatch was made during verification. Authenticated multi-browser behavior and live Gemini accuracy remain unverified.
