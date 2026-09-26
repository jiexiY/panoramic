# Panoramic AI and supervision-first response

Local implementation, 26 September 2026. Not deployed or verified with a live provider.

## One concern, one response record

Scene review → supervision queue → supervisor confirms assignment → caregiver accepts → confirms arrival → records outcome → handoff.

Panoramic AI reads this same record. It does not run a second, disconnected workflow. The chat can explain the observation, list recorded availability, summarize the timeline and propose an assignment. `DispatchResponse` renders the proposed caregiver and requires an explicit confirmation before invoking `care_command`. SQL rechecks role, availability lease, qualification, competing assignments and record version. A model response is never proof of a saved action.

## Data flow

1. Browser submits a question, facility ID, optional selected incident ID, confirmed-account JWT and workspace access code to `/api/gemini` with `operation: assistant`.
2. The server verifies the Supabase identity and facility membership using the public project key plus caller JWT. Row-level security still applies; no service-role key is used.
3. The server retrieves the roster and either one selected incident or up to 100 open incidents, plus up to 200 recent associated events. It does not trust client-supplied observations, roles or sources. Selected-record failure does not silently substitute another room.
4. Google receives those text records, curated hazard guidance and the question. Private image paths, media filenames, account emails and tokens are excluded from model context. User-entered notes can still contain sensitive data: this prototype requires non-sensitive records and explicit confirmation; it has no automatic de-identification guarantee.
5. Structured output is validated for known evidence references and permitted proposal targets. This validates structure and references, not semantic truth. The model can still misunderstand evidence; inspect the linked record.
6. The UI displays answer time, source citations, retrieval scope and model. Incident-version changes invalidate an assignment proposal and mark the answer outdated. Responder eligibility is checked again at confirmation. Chat is tab-memory only and clears on identity/facility changes or refresh.

## Operational boundaries

- Assignment is separate from acceptance. Decline needs a reason and returns the concern to supervision. The coordinator can reassign only before acceptance.
- Availability expires after 90 seconds without renewal. Response order is manually configured, not measured physical distance or automatically assessed clinical skill.
- Updates are in-app Realtime/polling delivery. There is no phone push, call, SMS or emergency service integration.
- Current monitoring is manually submitted images or video frames. The existing OpenCV GIF is a separately viewable annotated recording, not the detector feeding the queue.
- The user-supplied Always Best Care article informs reviewed rules about slippery surfaces, obstructions and visibility. It is not a labeled training dataset, and no new model was trained. The InterNACHI page could not be read; it is not claimed as ingested evidence.
- The chat must not interpret humming or repeated words as diagnoses or intentions. Audio collection and resident-specific cue interpretation are not implemented.
- Empty observations do not certify safety. A recorded resolution is an attributed caregiver note, not sensor verification of the room.

## Verification and release gates

`npm test`: 105 tests pass. Actual SQL runs in isolated PGlite with local identity/storage stubs; hosted Auth, Storage transport, Realtime and separate concurrent database clients remain untested. API tests mock both Supabase and Gemini. Chrome verifies the actual empty product and a clearly labeled, ignored local UI fixture for assignment through outcome; neither is a real care incident.

`npm run build`: passes. Existing Lucide directive and Three.js chunk-size warnings remain non-failing.

Before deployment:

1. Generate a timestamped Supabase upgrade migration from the installed baseline. Change the phase constraint and reservation index; replace command/escalation functions without widening grants or dropping records. Verify migration compatibility in an isolated database.
2. With specific approval, test confirmed coordinator/caregiver accounts plus an outsider in the hosted workspace. Include two-client delivery, reconnect, private evidence, duplicate requests, concurrent assignment, decline and escalation.
3. With approved quota/cost scope, run one non-sensitive Gemini request and inspect a real answer and its citations. No new request was made during this increment. Existing readiness settings alone do not prove the provider works.
4. Deploy the compatible database and frontend in order, then repeat production smoke checks. No push, Vercel deployment, billing change or Devpost submission was made for this increment.
