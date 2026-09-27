# Panoramic station voice and suite processing

The suite panel owns the station request, active concerns, activity, response controls, report export, and chat. Suite records are filtered before display/export; responder occupancy remains facility-wide to prevent double booking.

## Monitoring and approval

All four suite monitors are enabled together. In the signed-out local demo, opening Resident Floor or any suite starts every configured source automatically after session restoration. Sources stay mounted when switching suites; preview controls do not switch off the floor policy. A101 is currently the only suite with recorded media. A102–A104 remain visibly disconnected, with no invented footage, hazards, or safety claims. Signed-in care-team records are not replaced by this automatic demo startup.

The recorded A101 source supplies manually annotated OpenCV regions. Its successful load triggers the recorded hazard event. Ordinary objects do not open concerns. Hazard regions are assessed against the marked route before the concern and station request are created. This is not a live OpenCV camera detector and is not a clinical risk model.

A proposed responder is selected from eligible, available staff in configured response order. A supervisor must review and confirm; nothing is assigned by chat, audio playback, or detection alone. Existing caregiver acceptance, arrival, outcome, clear follow-up frame, supervision check, and independent nursing sign-off remain required. Shared records keep existing Supabase RLS and command validation; this change adds no database permissions.

## ElevenLabs setup

### Local development connection

Set `ELEVENLABS_USE_PRODUCTION_VOICE=true` in the ignored `.env.local` and restart `npm run dev`. This development-only connection sends validated, fixed suite requests to `https://panoramic-app.vercel.app/api/elevenlabs`; the ElevenLabs API key remains in Vercel. It does not download production secrets or change the deployed app. Use the same private station voice access code in the local panel. Manual generation and automatic announcements consume the same production key allowance, so neither is enabled by configuration alone.

The local connection rejects cross-origin requests, unsupported methods, extra fields, unconfirmed sensitive content and oversized bodies before forwarding. It forwards only the private station code and a suite/priority/consent payload, not browser cookies or other authorization headers; redirects and automatic retries are disabled. Production still validates the code, applies its rate limit, and generates the fixed announcement. Internet and the production deployment must be available. `npm run preview` does not run these API handlers; use `npm run dev`.

The previous Dan voice was verified in production on September 27, 2026: one 16-second announcement completed browser playback and the account showed 134 credits used at that time. Later that day, the production voice was changed to Sarah and redeployed as `dpl_J9BZ3Zw7sWry52QVAxB2Mj9n7XoV`. Production and local-relay status checks returned configured successfully. No new paid audio was generated for this change, so Sarah playback has not yet been verified. Previously generated Dan clips remain unchanged; generate a new announcement to hear Sarah.

### Direct server configuration

Selected in the owner's ElevenLabs workspace: **Sarah — Mature, Reassuring, Confident**, with voice ID `EXAVITQu4vr4xnSDxMaL`. The production `ELEVENLABS_VOICE_ID` uses this ID, also identified as Sarah in [ElevenLabs' official voice reference](https://github.com/elevenlabs/plugin/blob/main/skills/general/text-to-speech/SKILL.md#voice-ids). Local production-relay mode uses the same voice. For direct mode, set this ID in the server's `ELEVENLABS_VOICE_ID`; selecting it in the ElevenLabs playground alone does not configure the app server. API credentials, station access code, spending allowance, model, and approval gates were not changed.

Use server environment variables from `.env.example`: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_ACCESS_CODE` (a separate private code of at least 16 characters), and `ELEVENLABS_USAGE_CONFIRMED=true` only after the owner approves credit usage. Never use a `VITE_` prefix or put the API key into the app/chat.

The server uses [ElevenLabs text-to-speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), `eleven_multilingual_v2`, and MP3 output. It accepts only a suite ID, route-level enum, and explicit privacy confirmation. It generates fixed announcement text; no resident names, images, free-text notes, or model output reach ElevenLabs. The private-code gate, body limit, same-origin check, timeout and per-process rate limit are safeguards, not distributed spending limits. Set an appropriate ElevenLabs account/key quota before enabling production traffic.

Each Panoramic station message and Activity update has an icon-only speaker control. The separate **Supervision station voice** card and automatic-announcement checkbox have been removed. On the first click, a dialog shows the exact fixed summary, asks for the private voice access code and non-sensitive-content consent, and explains provider credit use. Setup is held only in memory while this suite panel is mounted; it is not stored in the browser. Subsequent clicks prepare and play that message; clicking its active icon stops it. No new update generates or plays audio automatically.

Alerts, assignment, acceptance, arrival, follow-up, closure requests and station sign-offs have distinct allowlisted summaries, scoped by suite and zone. The server and development relay accept only the typed update, suite, zone, priority and explicit consent; no event detail, person name, resident data or free-text care note reaches ElevenLabs. The current station paragraph matches its spoken summary. Activity icons speak a fixed summary of the historical action, not free-text details or the incident's current route level. Older clients can still send the original suite/priority payload. Status reports `updatesSupported` so a new UI cannot silently fall back to the old alert-only server.

One shared player prevents overlapping speech. Up to 12 prepared clips are retained in memory for replay without another generation request; the cache is cleared on access-code/consent change or unmount. Navigation, inactive/stale views, role changes and current-incident version changes stop old playback and abort pending requests. Late responses cannot play. Provider failures are visible and not automatically retried; click again to reopen setup after an error. If the browser blocks playback, the same icon replays the prepared clip on the next explicit click without spending credits again. This release's player lifecycle and provider integration were tested with mocked audio, not a new paid Sarah generation.

This plays through the current browser's speakers. There is no remote PA/station connector or external nursing-home-system delivery acknowledgement. Audio playback is never recorded as staff approval or response completion. Recorded-demo chat uses labelled local, rules-based summaries; authenticated cloud chat still requires the configured Gemini connection and privacy confirmation.

Verification without credentials covers mocked provider calls, fixed-template validation, missing configuration, invalid scope, privacy/auth failures, quota rejection, audio bytes, suite isolation and approval gates. Live voice quality and station hardware must be verified after credentials and speaker routing are configured.
