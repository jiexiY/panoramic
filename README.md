# SteadySide

**Care, with someone beside you.**

[Live prototype](https://steadyside.vercel.app) · [GitHub](https://github.com/jiexiY/steadyside)

Release status: the local walkthrough is live. Supabase schema and client wiring are deployed; anonymous guest sign-in is still disabled pending owner approval, so guest cloud saving and cross-user API tests are not yet verified. Existing provisioned email/password accounts can use the sign-in path; that path has not been exercised with a real account in this build.

A caregiver-facing prototype that makes bathing preparation, available support, and handoff explicit. Built with React, TypeScript, Supabase, and Vercel. This repository is a new implementation, not a renamed copy of the earlier shower simulator.

## The problem

A staffing ratio cannot tell you who is actually free when help is needed. Two people may be on shift while both are assisting one resident. Even one-to-one attention cannot eliminate every hazard. Adequate staffing is necessary; software is not a substitute for it.

The founder lost her grandmother after a bathing fall despite a caregiver being present. That experience motivates the project. It does not prove that this app would have prevented the fall, or establish caregiver fault.

## Try the workflow

1. **Prepare:** review six room checks, the fictional assessed plan, required helper presence, backup coverage, and the person's choice. Missing required confirmations block starting the software routine.
2. **Support:** record pause, consent withdrawal, or a help request. Acknowledgment, arrival, and resolution are separate actions. Resolution never automatically resumes the workflow.
3. **Handoff:** a human confirms the supported exit; the app preserves unresolved concerns and exports a factual text record. Closing a handoff is not a safety certification.

All on-screen people and care plans are fictional. The one-person and two-person scenarios are **not staffing recommendations**.

## How we built it

| Part | Tool | Specific job |
| --- | --- | --- |
| Caregiver workspace | React + TypeScript + Vite | Responsive, keyboard-operable three-stage interface |
| Workflow | Explicit TypeScript transitions | Enforce preparation, refusal, pause, help sequencing, and supported-exit requirements within the prototype |
| Identity | Supabase Auth | Existing email/password accounts; optional anonymous guest identities for a frictionless demo |
| Persistence | Supabase PostgreSQL | Store fictional sessions across refreshes, with owner-based row-level security |
| Concurrent editing | PostgreSQL revision trigger + conditional updates | Reject stale-tab overwrites instead of silently losing a newer record |
| Hosting | Vercel | Serve the frontend; data requests go directly to Supabase with the user's session |
| Verification | Node test runner + live API isolation checks | Exercise workflow boundaries and cross-user access denial |

There is **no live AI integration** in this version. Future empty-room visual review and approved spoken cues are separate proposed features. OpenAI, Gemini, ElevenLabs, and MiniMax are not credited as runtime integrations here. There are no sensors, camera feeds, automatic water controls, or emergency notifications.

## Run locally

Use Node 24 LTS (minimum 22.12).

```sh
npm ci
cp .env.example .env.local
# Set your Supabase URL and publishable key in .env.local.
npm run dev
```

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
