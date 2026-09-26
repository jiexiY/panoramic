# Daily summary and bathroom workflow

Local implementation, 26 September 2026. Not deployed.

## Run the bathroom workflow

At `/app/supervision`, choose **Run bathroom workflow**. This explicit recording-playback workspace is isolated from Supabase and needs no account or provider request.

1. The annotated OpenCV recording plays. An authored water-region event creates an A101 bathroom concern after 2.5 seconds, with L3 walking-route overlap.
2. Supervision, the room map and response record show the concern. Select an available caregiver, review the assignment and confirm it.
3. Use **View as** to switch to that caregiver. Accept, confirm arrival, then record a specific outcome.
4. **Daily summary** displays this same timeline and exports a factual text handoff.

This is the supplied Gemini-edited photograph with manually annotated regions, not automatic water recognition or a fresh Gemini result. The separate Scene review API remains the real single-frame inference path. Recording provenance cannot pass `publishPayload` into the shared store. Restart/refresh resets playback, never cloud data.

## Vocal cues

`/app/daily` provides room/date filters, cue and follow-up counts, environmental events, and export.

- **Start listening** asks for browser microphone permission only after explicit confirmation and a click. Recording stops after 20 seconds, on Stop, consent withdrawal or page exit. Import accepts locally decodable clips of 0.2–30 seconds, under 8 MB before decoding.
- Audio is normalized locally to mono 16 kHz PCM WAV, capped at 960,044 bytes. Only **Analyze vocal cues** sends audio to Google, requiring the private workspace code and non-sensitive-test confirmation.
- The server validates the WAV format/duration and structured Gemini output: repeated word, mumbling, humming, speech or other sound. Only clearly audible repeated words receive counts. Silence may return no cues. Structural validation is not proof of transcription accuracy.
- The prompt prohibits inferred identity, diagnoses, emotion, intent or environmental hazards. Humming and unclear mumbling must not become invented sentences. A familiar caregiver supplies interpretation and follow-up separately.
- Manual observations are labeled caregiver-entered, never model-transcribed. Pending/check-requested cues appear in supervision **in the same tab**. No automatic caregiver dispatch or cross-device audio notification is implemented.
- The export preserves the heard cue, uncertainty, caregiver interpretation and environmental response separately. Co-occurrence is not treated as prediction or causation.
- Raw clips are temporary object URLs, released on replacement, successful analysis or page exit. Cue text/reviews stay in application memory only, separately scoped by account/facility/playback, capped at 100, and clear on sign-out/refresh. Export to retain. Persistent/cloud daily-cue storage is not implemented.
- Summaries include currently loaded incident records, not a guaranteed complete institutional shift. Always-on listening, learned resident baselines and validated fall prediction are not implemented.

## Verification

113 local tests and the production build pass. Chrome verified the actual product's water-event-to-resolution-to-daily-summary path, manual cue review and the supervision banner. These used explicit playback records, not actual care. The daily page also passed a 390 px phone-width check without horizontal overflow; no browser console errors were observed.

A two-second generated tone imported, decoded and loaded in local audio controls without being sent to Google. Physical microphone capture and live Gemini extraction remain unverified. Automated provider tests are mocks. Approval for one non-sensitive bathroom-image API test is outstanding; no new provider requests, live identities or database writes were made.

Provider reference: [Google audio understanding](https://ai.google.dev/gemini-api/docs/audio). This integration analyzes bounded clips; it does not use the streaming Live API.
