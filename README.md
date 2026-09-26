# Panoramic

**Care, with someone beside you.**

[Open Panoramic](https://panoramic-app.vercel.app) · [Caregiver workspace](https://panoramic-app.vercel.app/app) · [GitHub](https://github.com/jiexiY/panoramic)

## Product entry and home

The application has two main surfaces: the project entrance at `/` and the caregiver home at `/app`. **Open care workspace** enters the product directly. There is no advertising page, sales CTA, founder story, or technology explainer in the running application. The former `/welcome` URL redirects to `/` so old links still work. Care sessions and history remain tabs within the workspace at `/app/session` and `/app/history`; all workspace URLs support direct entry and refresh.

Navigating between the entrance and workspace retains an opened workspace in tab memory. Refresh still clears local scene media/events; this is not new persistence or authentication. The entrance does not mount the workspace or initiate its provider-readiness check. Necessary privacy, fictional-data, and integration-status notices remain next to the relevant actions. No visitor analytics or tracking were added.

The entrance contains a centered care icon above the bold product name and the workspace button. A fresh workspace has no room images, observations, caregivers, activity, or care sessions. **Add room image** opens the upload controls and privacy confirmation. **Try illustrated rehearsal** explicitly loads sample observations and caregivers; **New demo session** creates a sample care session. Sign-in alone does not create a sample record. Previously saved records are preserved and can still be restored.

The removed marketing page's source and styling are preserved in `docs/archive/` for recovery and excluded from deployment. Project background and technical documentation remain in this repository, outside the product UI.

Release status: the care-session walkthrough and scene-review interface are live. The Gemini integration is implemented and deployed; all three server configuration checks now pass. Two explicitly approved requests used a non-sensitive illustrated screenshot, but no successful model analysis has been received. The diagnostic retry returned Google HTTP 503 `UNAVAILABLE`; billing remains unchanged. This is a provider availability error, not evidence that payment is required. No visual accuracy is claimed. Supabase schema and client wiring are deployed; guest cloud saving and cross-user API tests remain unverified because anonymous sign-in is disabled. Existing email/password sign-in has not been exercised with a real account in this build.

A caregiver-facing prototype for noticing possible environmental hazards, bringing available caregivers the context, and preserving the response in handoff. It includes a staged scene-review workflow and the existing preparation/support care session. Built with React, TypeScript, a server-side Gemini integration, Supabase, and Vercel. This repository is a new implementation, not a renamed copy of the earlier shower simulator.

## The problem

A staffing ratio cannot tell you who is actually free when help is needed. Two people may be on shift while both are assisting one resident. Even one-to-one attention cannot eliminate every hazard. Adequate staffing is necessary; software is not a substitute for it.

My grandmother was active and clear-minded. In her residential eldercare center, she spilled water in her room while her caregiver was away, then slipped and broke her hip. She died two weeks later, on my seventeenth birthday. That loss motivates timely detection, timely information, and available help. It does not establish caregiver fault or prove that this prototype would have prevented her fall.

## Scene review: the Gemini demonstration

1. **Observe:** choose a staged, unoccupied room photo or select a frame from a local MP4/WebM. The browser resizes the frame; nothing is sent to Gemini until an explicit analysis request.
2. **Flag:** the server requests structured observations, labeled bounding boxes, a short brief, and uncertainty. It validates the response. A cup alone must not be treated as evidence of spilled water.
3. **Coordinate:** deterministic app logic excludes busy/unqualified fictional caregivers before sorting by demo proximity. No available caregiver produces a visible coverage gap—not a fictional dispatch.
4. **Respond:** acknowledgment, arrival, and a written operator resolution are separate transitions.
5. **Remember:** export the factual event record. After a completed live-analysis response, optionally request a Gemini draft summary, edit it, and mark it reviewed.

**Try illustrated rehearsal** is explicitly authored illustration and preset observations; it makes **no Gemini calls**. It exists to rehearse the UI without provider access. The scene workflow is held in tab memory, not Supabase; export before refresh. No external notifications are connected. This is single-frame analysis, not continuous surveillance, trained water detection, or validated fall prevention.

**Route-aware concern levels:** mark the resident's usual route on the current frame. Possible hazards outside the route are light (L1), near it are medium (L2), and intersecting it are dark (L3). Boxes, route segments and response priority recalculate immediately when the confirmed route or observations change. Missing route context stays gray/unassessed. This uses caregiver-marked image geometry, not learned movement history, a live camera tracker or clinical fall probabilities. The explicit rehearsal includes three sample routes; changing a route never clears the response. See [route awareness](docs/route-awareness.md).

## Try the workflow

### Spatial view and supervision

Open the [spatial view](https://panoramic-app.vercel.app/app/spatial) for four furnished sample suites and a dedicated caregiver/nurse supervision room. Rooms preserve the supplied reference plan's bedroom, kitchenette, closet, bath and entry relationships. The original 3D model supports selection, rotation, zoom, top-down view and room focus.

**Load bathroom example** connects the supplied water-edited photograph to A101, a route-overlap concern, the downloadable OpenCV tracking GIF, and the [supervision desk](https://panoramic-app.vercel.app/app/supervision). Staff availability, acknowledgment, arrival and documented resolution can be exercised end-to-end. No sample residents, staff or activity load automatically.

This demonstration uses a user-supplied Gemini-edited image, human-marked initial regions, actual OpenCV optical flow on synthetic-motion frames, and a local response state machine. It does not claim automatic water recognition or send staff notifications. See [spatial workflow](docs/spatial-workflow.md) and [GIF method](docs/bathroom-tracking-demo.md).

### Care session

1. **Prepare:** review six room checks, the fictional assessed plan, required helper presence, backup coverage, and the person's choice. Missing required confirmations block starting the software routine.
2. **Support:** record pause, consent withdrawal, or a help request. Acknowledgment, arrival, and resolution are separate actions. Resolution never automatically resumes the workflow.
3. **Handoff:** a human confirms the supported exit; the app preserves unresolved concerns and exports a factual text record. Closing a handoff is not a safety certification.

All on-screen people and care plans are fictional. The one-person and two-person scenarios are **not staffing recommendations**.

## How we built it

| Part | Tool | Specific job |
| --- | --- | --- |
| Caregiver workspace | React + TypeScript + Vite | Responsive, keyboard-operable three-stage interface |
| Spatial overview | Three.js | Original interactive cutaway suites and supervision room, with room-level concern colors |
| Bathroom tracking demonstration | OpenCV | Measure optical flow for human-marked regions on a staged image sequence; generate the downloadable GIF |
| Scene analysis and brief | Gemini API via a private Vercel function | Read one explicitly submitted staged frame; return validated boxes and observations; live verification pending |
| Caregiver suggestion | Deterministic TypeScript | Filter for available and qualified demo staff, then rank fictional proximity |
| Draft scene handoff | Gemini API, separate explicit request | Summarize supplied fictional observations and operator actions for human review |
| Workflow | Explicit TypeScript transitions | Enforce preparation, refusal, pause, help sequencing, and supported-exit requirements within the prototype |
| Identity | Supabase Auth | Existing email/password accounts; optional anonymous guest identities for a frictionless demo |
| Persistence | Supabase PostgreSQL | Store fictional sessions across refreshes, with owner-based row-level security |
| Concurrent editing | PostgreSQL revision trigger + conditional updates | Reject stale-tab overwrites instead of silently losing a newer record |
| Hosting | Vercel | Serve the frontend and server-only Gemini endpoint; care-session data uses authenticated Supabase requests |
| Verification | Node test runner + live API isolation checks | Exercise workflow boundaries and cross-user access denial |

The Gemini integration is **implemented but not live-verified**. Do not present the illustrated rehearsal or mocked tests as model performance. Voice cues, sensors, continuous camera feeds, automatic water controls, and external emergency notifications remain unimplemented. No other provider is required for the Gemini demonstration.

## Run locally

Use Node 24 LTS (minimum 22.12).

```sh
npm ci
cp .env.example .env.local
# Set your Supabase URL and publishable key in .env.local.
npm run dev
```

The full development server runs at `http://127.0.0.1:5174` and includes `/api/gemini`. `npm run preview` is frontend-only and does not run that API. No new npm dependencies were added for Gemini; the server uses the documented REST API.

For secure free-tier activation, see [Gemini setup](docs/gemini-setup.md). Never paste the provider key into the browser UI or a `VITE_` variable. The UI's private demo access code is a separate credential, not the Google API key.

The local walkthrough works without cloud configuration. It is not saved across refreshes. For the backend, apply `database/schema.sql` as a reviewed migration to an empty Supabase project. Do not run it blindly against an existing database. Keep RLS enabled. The frontend uses only a publishable key—never a service-role or secret key.

Guest cloud access requires enabling anonymous sign-ins in Supabase. Each guest is isolated by `auth.uid()`, but does not have a verified staff identity. Clearing browser data, signing out, or moving devices loses access to that anonymous identity. Existing provisioned email/password accounts can use the sign-in form. No public email sign-up or cross-device guest recovery is implemented.

```sh
npm test
npm run build
npm run test:cloud # Requires guest sign-in enabled; creates 2 test identities.
```

The cloud test deletes only its own temporary fictional session, signs out its identities, and leaves the empty Auth identities for an administrator's retention process. It never prints access tokens. The schema limits each identity to 30 sessions and each snapshot to 128 KiB; this is not comprehensive abuse prevention.

## Deploy

Import this repository into Vercel as a Vite project. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the desired environments before building. A publishable key is designed for the frontend; RLS—not keeping that key secret—protects records. If using a different Supabase project, update the `connect-src` CSP in `vercel.json` too.

## Important boundaries

This is a **fictional-data prototype**, not a real care service, medical device, clinical record system, or validated fall-prevention intervention. Human confirmations are operator-entered, not sensor-verified. Snapshots are owner-editable and are not an immutable audit trail. Workflow rules are client-side UX constraints, not certified physical safety controls.

Before broader promotion or real-world testing: configure anti-abuse controls/CAPTCHA, a retention policy, verified identities and organizational permissions, accessibility evaluation, clinical review, privacy/security review, and appropriate operational procedures. No actual resident names, photos, diagnoses, or care records belong in this deployment.

See [security and data boundaries](docs/security.md), [verification](docs/verification.md), and [provenance / event eligibility](docs/provenance.md). A fresh repository does not establish hackathon eligibility; organizer clarification is still necessary.

## Third-party components

React and Vite supply the interface runtime/build pipeline; Supabase JS is the database/authentication client; Lucide supplies icons. Versions are pinned in `package.json` and the lockfile. Their upstream licenses continue to apply. The product direction came from earlier founder discussions; that prior work is disclosed rather than erased.
