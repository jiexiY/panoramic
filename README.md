# Panoramic

[Open Panoramic](https://panoramic-app.vercel.app) · [Caregiver workspace](https://panoramic-app.vercel.app/app) · [GitHub](https://github.com/jiexiY/panoramic)

**Release focus:** Environmental hazard review → supervision → caregiver assignment → acceptance → arrival → recorded outcome. Daily notes and audio capture are deferred and removed. The supervisor-first database upgrade is applied; 118 local tests pass, including upgrade preservation checks. Bathroom playback runs without accounts or provider calls. Live Gemini output and authenticated multi-client behavior remain unverified. See [release checks](docs/prevention-release.md).

## Product entry and home

The application has two main surfaces: the project entrance at `/` and the caregiver home at `/app`. **Open care workspace** enters the product directly. There is no advertising page, sales CTA, founder story, or technology explainer in the running application. The former `/welcome` URL redirects to `/` so old links still work. Care sessions and history remain tabs within the workspace at `/app/session` and `/app/history`; all workspace URLs support direct entry and refresh.

Navigating between the entrance and workspace retains an opened workspace in tab memory. Unsaved local media clears on refresh; shared incidents restore from Supabase after sign-in. The entrance does not mount the workspace or initiate its provider-readiness check. Concise privacy, recording-source, save and connection statuses remain next to the relevant actions. No visitor analytics or tracking were added.

The entrance contains a centered care icon above the bold product name and the workspace button. A fresh workspace has no room images, observations, caregivers, activity, or care sessions. **Add room image** opens the upload controls and privacy confirmation. A coordinator creates an isolated workspace and adds confirmed caregiver accounts with eligibility and response order. **New session** opens a care session with the selected support arrangement. Sign-in alone does not create a record.

The removed marketing page's source and styling are preserved in `docs/archive/` for recovery and excluded from deployment. Project background and technical documentation remain in this repository, outside the product UI.

Release status: the care-session walkthrough and scene-review interface are live. The Gemini integration is implemented and deployed; all three server configuration checks now pass. Two explicitly approved requests used a non-sensitive illustrated screenshot, but no successful model analysis has been received. The diagnostic retry returned Google HTTP 503 `UNAVAILABLE`; billing remains unchanged. This is a provider availability error, not evidence that payment is required. No visual accuracy is claimed. Supabase schema and client wiring are deployed; guest cloud saving and cross-user API tests remain unverified because anonymous sign-in is disabled. Existing email/password sign-in has not been exercised with a real account in this build.

A caregiver-facing prototype for noticing possible environmental hazards, bringing available caregivers the context, and preserving the response in handoff. It includes a staged scene-review workflow and the existing preparation/support care session. Built with React, TypeScript, a server-side Gemini integration, Supabase, and Vercel. This repository is a new implementation, not a renamed copy of the earlier shower simulator.

## The problem

A staffing ratio cannot tell you who is actually free when help is needed. Two people may be on shift while both are assisting one resident. Even one-to-one attention cannot eliminate every hazard. Adequate staffing is necessary; software is not a substitute for it.

My grandmother was active and clear-minded. In her residential eldercare center, she spilled water in her room while her caregiver was away, then slipped and broke her hip. She died two weeks later, on my seventeenth birthday. That loss motivates timely detection, timely information, and available help. It does not establish caregiver fault or prove that this prototype would have prevented her fall.

## Scene review: the Gemini demonstration

1. **Observe:** choose a staged, unoccupied room photo or select a frame from a local MP4/WebM. The browser resizes the frame; nothing is sent to Gemini until an explicit analysis request.
2. **Flag:** the server requests structured observations, labeled bounding boxes, a short brief, and uncertainty. It validates the response. A cup alone must not be treated as evidence of spilled water.
3. **Coordinate:** send the candidate hazard to supervision. A supervisor reviews the evidence, selects an available eligible responder and explicitly confirms the assignment. The responder is reserved, not assumed to have accepted. No available caregiver produces a visible coverage gap.
4. **Respond:** the assigned caregiver accepts, confirms arrival, and records an outcome. They can decline a pending request with a reason so supervision can reassign it. These are server-checked transitions. Deadline escalation runs in the database even when browsers are closed.
5. **Remember:** download a factual handoff generated from the saved observations and event history. No additional AI call is needed.

Unsigned-in analysis remains local. Shared incidents, evidence and response history use Supabase. Phone push, SMS and external emergency notifications are not connected. This is single-frame analysis, not continuous surveillance, trained water detection, or validated fall prevention.

**Route-aware concern levels:** mark a walking route before analyzing the current frame. Possible hazards outside the route are light (L1), near it are medium (L2), and intersecting it are dark (L3). Missing route context stays gray/unassessed. Saved route context is fixed to that observation. This uses caregiver-marked image geometry, not learned movement history, a live camera tracker or clinical fall probabilities.

## Try the workflow

### Bathroom response

Choose **Run bathroom workflow** in Scene review or Supervision. The annotated recording's known water-region event creates a local concern. Assign a caregiver, switch to their playback view, accept, confirm arrival and record an outcome. The response record displays the timeline and provides **Download handoff record**. This playback does not claim a fresh detection or write to the shared team.

Daily notes are not part of this release. The previous implementation remains recoverable in Git history.

### Resident Floor and supervision

Select a suite from the room list or the monitoring selector. Each suite has its own route-concern scale; A101's **Bathroom monitoring** contains **Open bathroom recording**. **Observation: On** (green) identifies active recording playback, with a Playback label; **Off** (red) applies when it is stopped, unavailable or closed. Saved concerns and database connectivity do not turn observation on.

Open [Resident Floor](https://panoramic-app.vercel.app/app/spatial) for four furnished sample suites and a dedicated caregiver/nurse supervision room. Rooms preserve the supplied reference plan's bedroom, kitchenette, closet, bath and entry relationships. The original 3D model supports selection, rotation, zoom, top-down view and room focus.

**Open bathroom recording** plays the supplied image-based OpenCV recording. **Play tracking**, **Show still** and **Download** provide direct media controls. Opening it does not populate the shared alert queue, create staff or invent activity. The spatial map and [supervision desk](https://panoramic-app.vercel.app/app/supervision) instead use the same persisted care-team records.

The recording uses a user-supplied Gemini-edited image, human-marked initial regions and actual OpenCV optical flow on synthetic-motion frames. It does not claim automatic water recognition or send staff notifications. See [GIF method](docs/bathroom-tracking-demo.md).

### Panoramic AI

The spatial and supervision sidebar can answer “Why is this room flagged?”, “Who is available?” and “What happened during this response?” using server-retrieved, facility-scoped records. Answers preserve uncertainty and link to their evidence. Assignment suggestions require separate supervisor confirmation; the model cannot dispatch or change records by itself. Google receives selected record text only after explicit non-sensitive-data confirmation. This is retrieval plus reference rules, not a newly trained water detector. See [data flow and limits](docs/panoramic-ai-workflow.md).

### Care session

1. **Prepare:** select the support arrangement, then review six room checks, required helper presence, backup coverage, and the person's choice. Missing required confirmations block starting the software routine.
2. **Support:** record pause, consent withdrawal, or a help request. Acknowledgment, arrival, and resolution are separate actions. Resolution never automatically resumes the workflow.
3. **Handoff:** a human confirms the supported exit; the app preserves unresolved concerns and exports a factual text record. Closing a handoff is not a safety certification.

Care sessions use neutral role labels and operator-entered confirmations, without invented resident identities. The one-person and two-person options are **not staffing recommendations**; the app does not assess a person's support needs.

## How we built it

| Part | Tool | Specific job |
| --- | --- | --- |
| Caregiver workspace | React + TypeScript + Vite | Responsive, keyboard-operable three-stage interface |
| Spatial overview | Three.js | Original interactive cutaway suites and supervision room, with room-level concern colors |
| Bathroom tracking demonstration | OpenCV | Measure optical flow for human-marked regions on a staged image sequence; generate the downloadable GIF |
| Scene analysis and brief | Gemini API via a private Vercel function | Read one explicitly submitted staged frame; return validated boxes and observations; live verification pending |
| Caregiver assignment | PostgreSQL transactional command | Supervisor-confirmed dispatch; reserve eligible available responders; reject conflicting assignments |
| Panoramic AI | Gemini API + authorized record retrieval | Evidence-linked answers and proposed actions; no model-initiated writes |
| Scene handoff | Deterministic TypeScript | Export saved observations, uncertainty and attributed response events without inventing a summary |
| Workflow | Explicit TypeScript transitions | Enforce preparation, refusal, pause, help sequencing, and supported-exit requirements within the prototype |
| Identity | Supabase Auth | Confirmed email/password accounts for care teams; anonymous identities cannot use shared incidents |
| Persistence | Supabase PostgreSQL + private Storage | Facility-scoped incidents, team membership, response events and private reference frames; older care sessions remain owner-scoped |
| Updates and escalation | Supabase Realtime + pg_cron | Notify open clients of saved changes; check response deadlines every 30 seconds |
| Concurrent editing | PostgreSQL revision trigger + conditional updates | Reject stale-tab overwrites instead of silently losing a newer record |
| Hosting | Vercel | Serve the frontend and server-only Gemini endpoint; care-session data uses authenticated Supabase requests |
| Verification | Node test runner + isolated PGlite PostgreSQL | 118 passing local tests; hosted multi-client and provider checks remain pending |

The Gemini integration is **implemented but not live-verified**. Do not present the annotated recording or mocked tests as model performance. Daily notes and audio capture are deferred. Always-on listening, sensors, continuous camera feeds, automatic water controls, and external emergency notifications remain unimplemented. No other provider is required for the Gemini demonstration.

## Run locally

Use Node 24 LTS (minimum 22.12).

```sh
npm ci
cp .env.example .env.local
# Set your Supabase URL and publishable key in .env.local.
npm run dev
```

The full development server runs at `http://127.0.0.1:5174` and includes `/api/gemini`. `npm run preview` is frontend-only and does not run that API. No new npm dependencies were added for Gemini; the server uses the documented REST API.

For secure free-tier activation, see [Gemini setup](docs/gemini-setup.md). Never paste the provider key into the browser UI or a `VITE_` variable. The UI's workspace access code is a separate credential, not the Google API key.

Local image review and the older care-session walkthrough work without cloud configuration and are not saved across refreshes. For a new backend, review `database/schema.sql`, then the fresh-install `database/incident-workflow.sql`. The hosted project was upgraded with `supabase/migrations/20260926213803_supervision_first_dispatch.sql`; do not rerun fresh-install files against it. The upgrade preserves existing records and grants. Keep RLS enabled. The frontend uses only a publishable key—never a service-role or secret key.

Shared incident access requires confirmed email/password accounts. The development sign-in form includes account creation; email delivery and confirmation redirects still need end-to-end verification. Configure the Supabase Auth URL allowlist for the deployment before onboarding. Guest sign-in remains disabled and is not a substitute for staff membership.

```sh
npm test
npm run build
npm run test:cloud # Requires guest sign-in enabled; creates 2 test identities.
```

The cloud test deletes only its own temporary fictional session, signs out its identities, and leaves the empty Auth identities for an administrator's retention process. It never prints access tokens. The schema limits each identity to 30 sessions and each snapshot to 128 KiB; this is not comprehensive abuse prevention.

## Deploy

Import this repository into Vercel as a Vite project. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the desired environments before building. A publishable key is designed for the frontend; RLS—not keeping that key secret—protects records. If using a different Supabase project, update the `connect-src` CSP in `vercel.json` too.

## Important boundaries

This is a **non-resident-data prototype**, not a real care service, medical device, clinical record system, or validated fall-prevention intervention. Human confirmations are operator-entered, not sensor-verified. Shared incident transitions are server-checked and their event history is append-only to app users, but not immutable against administrators. Older care-session snapshots remain owner-editable. Neither workflow constitutes a certified physical safety control.

Before broader promotion or real-world testing: configure anti-abuse controls/CAPTCHA, a retention policy, verified identities and organizational permissions, accessibility evaluation, clinical review, privacy/security review, and appropriate operational procedures. No actual resident names, photos, diagnoses, or care records belong in this deployment.

See [security and data boundaries](docs/security.md), [verification](docs/verification.md), and [provenance / event eligibility](docs/provenance.md). A fresh repository does not establish hackathon eligibility; organizer clarification is still necessary.

## Third-party components

React and Vite supply the interface runtime/build pipeline; Supabase JS is the database/authentication client; Lucide supplies icons. Versions are pinned in `package.json` and the lockfile. Their upstream licenses continue to apply. The product direction came from earlier founder discussions; that prior work is disclosed rather than erased.
