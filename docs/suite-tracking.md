# Suite-specific OpenCV tracking

Implemented locally on 2026-09-27. No deployment, external care-team writes, paid video request or new image generation.

## Coverage

| Suite / zone | What is tracked | Local workflow |
|---|---|---|
| A101 bathroom | Existing water-region recording | Existing A101 response remains unchanged |
| A101 bedroom | Bed, chair and wheeled overbed table | Separate bedroom L3 concern on the authored route |
| A102 bedroom | Bed and wheeled basket | L2 candidate hazard beside the authored route, without crossing it |
| A102 bathroom | Toilet, sink and shower fixture | No marked hazard; no incident, not a safety clearance |
| A103 bedroom | Bed, cabinet and curled rug | Separate bedroom L3 concern |
| A103 bathroom | Toilet, sink and floor towel | Separate bathroom L2 concern beside the authored route |
| A104 bedroom | Bed, chair and bedside cabinet | No marked hazard; no incident, not a safety clearance |
| A104 bathroom | Toilet, sink, shower seat and shower fixture in the original dry scene | Progressive dry-fixture loop; no hazard, leak event or safety clearance |

A101's bedroom now uses the same tracking adapter, with the heading “BEDROOM · OVERBED TABLE TRACKING” and a scene-specific description. Its source remains the Google Studio-generated still. The legacy bathroom adapter is scoped by suite, zone, media name and recording provenance, so bedroom startup cannot suppress the water concern and the dry-reference review cannot update the bedroom.

The sample mix contains two L2 concerns (A102 basket and A103 towel) and three L3 concerns (A101 bathroom water, A101 overbed table and A103 rug). A102's authored route passes around the basket's foreground/right edge; A103's bathroom route passes to the left of the towel. Both stay outside the candidate region but within the existing image-space proximity margin. Region boxes and photos are unchanged. L2 settles amber and L3 red. These are authored route examples, not recommended real-world walking paths or measured physical clearances. Per-frame regression checks require the offline labels and app geometry to agree; replay still cannot change existing response records.

## What OpenCV actually does

`scripts/render-suite-tracking.py` reuses the A101 pipeline's `goodFeaturesToTrack`, pyramidal Lucas-Kanade optical flow, forward/backward rejection and RANSAC affine fitting. Seven source stills receive small **synthetic camera motion**. The generation transform is not supplied to the tracker. Region boxes and the route follow the transform measured from pixels. Per-region feature support must be at least three; insufficient tracks or excessive error stop processing. Off-screen tracks are excluded. Persistent region IDs are prefixed with suite and zone, and feature trails contain measured positions only.

The seven runs retain 216–220 features per frame, with maximum median affine residuals of 0.028–0.042 pixels. A101's table has 42 supporting features in the final frame. A104's dry bathroom has 13 toilet, 9 sink, 15 shower-seat and 38 shower-fixture supporting features in the final frame. These tiny residuals reflect this controlled synthetic test and are **not** evidence of production reliability.

Human-authored inputs: object names, initial region rectangles, which regions are candidate hazards, and walking routes. OpenCV does not discover the basket/rug/towel semantically, prove that wheels are unlocked, measure independent object motion, predict falls, or certify safety. It propagates marked regions using measured camera motion. The retired A104 leak pipeline separately measures appearance changes; it is not a water classifier and is no longer mounted or connected to the runtime workflow.

## Files and integration

Each `{suite}-{zone}-tracking` source has a 120-frame GIF at 10 fps (12 seconds), poster, unannotated final reference JPEG, and version-2 JSON containing source SHA-256, OpenCV version, per-frame feature IDs/positions/counts, fit residuals, region boxes/support, transformed route and presentation stages. GIF frame durations and infinite-loop metadata are checked after encoding. The final reference frame and geometry are paired in response reports.

All seven previews now follow the A101 bathroom's progressive presentation: clean frame (0–1s), measured feature points (1–3s), fixture boxes (3–6s), route and candidate-region review (6–9s), then a settled result (9–12s). Camera motion stops for the result hold; the visual then loops back to the clean frame. “Show result” displays the final poster, and “Replay tracking” resumes the loop. A101's original bathroom asset is unchanged.

A104 bathroom also follows this cycle, superseding its earlier still-only presentation without restoring water. Its measurements come exclusively from `a104-bathroom-google.jpg`, never the leak edits. All four labels have `kind: "object"`; the loop cannot open a concern, clear an existing record or restore the retired leak sequence.

`suiteTracking.ts` validates the configured suite/zone, asset paths, frame count, stage order/timing, feature uniqueness/bounds, fit quality, region identities/support and geometry. After measurements and the displayed image load with local demo monitoring enabled, the UI delays revealing the saved result until the first settled phase (9 seconds), or when the user explicitly displays the settled poster. The timer is cancelled on source errors, pause/navigation away, or unmount; the one-time callback and incident deduplication keep later visual cycles from creating records. Results are saved **offline OpenCV output**, not inference running on the browser GIF. GIF playback and browser timers are presentation timing, not a live frame-processing clock.

All suites' source adapters start together after signed-out session restoration. Selecting a suite changes presentation, not monitoring policy. Incident and event identities include both suite and zone. A103's rug and towel never replace each other's evidence. A101's dry-reference callback cannot clear these records. Replay, pause, navigation and repeated callbacks cannot duplicate or close a concern. Each candidate hazard opens a browser-local Panoramic AI report and supervision request; a responder is only proposed, never auto-assigned. Existing physical verification and dual-station sign-off rules remain intact. There is no new cleanup source, so these previews alone cannot resolve a concern.

### Dashboard and Resident Floor

Dashboard (`/app`, or `/app/dashboard/A101` through `A104`) owns the room previews, recording controls and route-concern meter. Bedroom and bathroom appear side by side on wide screens, stacked on narrow screens. The existing manual room-data review remains available in a collapsed section below the monitors.

Resident Floor keeps the floor map, suite selection and suite-scoped Panoramic AI response/activity/report/chat panel. Its progress labels are **Monitor → Detect → Alert → Response**; this wording change does not remove the actual assessment step or supervision approval. Matching-suite links connect both surfaces. One always-mounted Dashboard source owner feeds the same workspace care-team state, even while hidden on Resident Floor or Care session; page navigation neither remounts the sources nor resets their incidents. Signed-in teams still do not automatically receive sample records.

## Reproduce and verify

From the project root, with the existing Python/OpenCV/NumPy/Pillow environment:

```powershell
python scripts/render-suite-tracking.py
# To regenerate only A101 without touching other suite assets:
python scripts/render-suite-tracking.py --suite A101
# Regenerate only the dry A104 bathroom:
python scripts/render-suite-tracking.py --suite A104 --zone bathroom
python scripts/process-leak-sequence.py --frames public/demo/a104-bathroom-google.jpg public/demo/a104-leak-small-google.jpg public/demo/a104-leak-medium-google.jpg public/demo/a104-leak-large-google.jpg --out public/demo
python scripts/test-suite-tracking.py
python scripts/test-leak-sequence.py
npm test
npm run build
```

Native tests measure a known pixel translation, reject featureless input, check route intersections and exercise leak registration/change rejection. App tests verify source hashes, persistent IDs, missing/invalid measurement rejection, negative fixture-only cases, suite/zone isolation, replay deduplication, unchanged A101/A104 evidence, reference-image routing and real-team provenance rejection.

The computer-use skill was used for local browser QA: A102 pause/play, A103 distinct report selection, correct reference images, A104 sequence/tracking, and browser error inspection.
