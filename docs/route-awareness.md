# Route-aware concern levels

Panoramic compares a possible hazard's bounding box with a resident's caregiver-marked walking route in the same room frame. This is a deterministic prioritization layer, not another model or a clinical fall-risk score.

## Light to dark

| Appearance | Meaning | Rule |
| --- | --- | --- |
| Light peach · L1 | Outside route; check the possible hazard | Box lies outside both the walking line and its configured image margin |
| Terracotta · L2 | Near route; prioritize checking | Box is within the image margin of any route segment |
| Deep red · L3 | Crosses route; urgent caregiver review | Box intersects any segment of the marked walking line |
| Gray · Unassessed | Route context is missing or being edited | No valid confirmed route; this is never an all-clear |
| Neutral · Object | Observed item, not classified as a hazard | Model/rehearsal observation category is object, regardless of intersection |

An off-route hazard is not dismissed. A resident may take a different route. Changing colors does not acknowledge, resolve, or cancel a caregiver request. Operator-recorded resolution does not rewrite what a captured frame showed.

## What works now

- Bounding boxes, affected route segments, per-object explanations and the response-priority badge update immediately on confirmed route or observation changes.
- Explicit sample routes appear only after choosing illustrated rehearsal. A fresh workspace remains empty.
- A caregiver can mark 2–12 waypoints by clicking the image or entering percentages, edit the route, adjust its image margin, undo points, cancel, confirm or clear.
- Starting a new image/video selection or capturing a different video frame clears the previous route. Route coordinates are not reused across unrelated frames.
- The handoff export includes route source, waypoints, margin, current concern levels and recent route changes. These remain local to the tab, like the scene record.
- Ordinary objects do not become hazards solely because a route crosses them. No route, no observations and invalid routes remain unassessed, not low risk.

## What this does not yet do

There is no continuous camera stream, cross-frame object tracking, resident identification, learned walking-history model or live resident position. The default 6.5% image margin is a tunable demonstration parameter, not a clinically validated distance. The geometry uses normalized picture coordinates, not meters; perspective can distort proximity. The UI labels captured stills and illustrated rehearsals accordingly.

For actual tracking, route histories would need consented observations, a calibrated floor plane or map, meaningful confidence/freshness handling, stable track IDs, approved resident association and human confirmation of usual routes. Stale data must become unknown, not remain a live-colored claim. That work should not be represented by animating the current still frame.

## Implementation

- `src/routeRisk.ts`: segment/rectangle intersection and shortest-distance classification; shared colors and visible labels.
- `src/RouteOverlay.tsx`: route line and per-segment intensity on the same normalized scene coordinates.
- `src/RoutePlanner.tsx`: pointer and keyboard-accessible waypoint entry, confirmation and sample route switching.
- `src/SceneMonitor.tsx`: live React derivation, source-bound reset, colored boxes and export context.

No new dependency, billing change or provider request is needed. Gemini still supplies scene observations through the existing explicit analysis flow; TypeScript assigns route priority. Supabase scene persistence is still a separate next integration.

## Verification

Unit tests cover crossing with both endpoints outside, exact near-margin boundaries, multi-segment routes, degenerate/invalid routes, ordinary objects, empty observations, immutable observations, parallel/zero-length segments, all three sample-route levels, monotonically darker colors and label/background contrast of at least 4.5:1.

Browser checks: empty initial state; L3 on the direct sample route; L1 on the edge route while the incident remains pending; gray/unassessed after clearing; two numeric waypoints enable confirmation; a manually marked route produces L2 for the spill and L3 for the box.

Accessibility rationale: visible level numbers and descriptions accompany color, following [W3C guidance on use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html). The levels above are product rules, not a risk model provided or endorsed by W3C or a health authority.
