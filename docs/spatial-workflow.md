# Spatial view and supervision workflow

## Reference and layout

The user supplied a top-down senior-living suite plan as a spatial reference. Each of four sample suites retains its key relationships: bedroom and window at the far end, bed on the right, desk/TV/kitchenette on the left, closets between the living area and bath, bathroom at lower right, and entry at the corridor. South suites rotate to meet that corridor. A dedicated supervision room connects to the same corridor and contains two monitoring desks, a handoff table, storage and seating for caregivers and nurses.

This is a newly authored, editable 3D schematic, not an architectural drawing or an assertion of accessibility-code compliance. No dimensions, facility branding or original floor-plan image are reproduced in the app.

The user requested Haven as a close demonstration reference. Its [published project](https://devpost.com/software/haven-536r1q), [repository](https://github.com/scrappydevs/haven), and spatial-view GIF informed the interaction structure: cutaway floor, colored room concern, room directory, staff station and adjacent details. Haven's live floor-plan page failed to load its configuration during inspection. Panoramic does not reuse its code, assets or branding.

## Demonstration

1. Open `/app/spatial`. The model is visible, but resident records, staff records, activity and concerns start empty.
2. Click **Load bathroom example**. This explicitly loads fictional residents and staff, plus the user-supplied water-edited bathroom photo for A101.
3. Select A101 in the model or room list. The suite plan opens. Click **View bathroom**, or select its active concern, to see the actual water image with named regions and the sample route.
4. Click **Play OpenCV GIF** to watch the tracked regions, route overlap and warning sequence. The GIF can also be downloaded.
5. Open **Supervision desk**. Change staff availability to demonstrate candidate selection and a coverage gap. Availability and qualification are checked before illustrative proximity.
6. **Acknowledge**, **Confirm arrival**, and **Record resolution** are distinct operator actions. The response cannot skip steps; resolution requires a note. Acknowledgment reserves staff but does not pretend they arrived. Arrival updates their listed location. Resolution releases them and closes the sample concern.
7. Download the JSON response record. **Reset example** clears the in-memory demonstration. Reloading the page also clears it.

Map controls support rotation, zoom, top-down view, focusing a selected space, and reset. The room directory remains usable when WebGL is unavailable.

## What runs, and what is staged

- The water photo was supplied by the user as a Gemini-edited asset; no new model generation or analysis request runs when loading this example.
- The OpenCV GIF genuinely measures optical flow across synthetic camera-motion frames. Initial boxes and semantic labels are human-authored. It is not evidence of automatic puddle recognition.
- Route overlap and light-to-dark concern levels are computed from geometry. The route is authored, not learned from a resident. They are illustrative priority levels, not a clinical fall-probability estimate.
- 3D rendering, selection, availability filtering, response transitions and exports work in-browser. Staff proximity values are sample inputs, not real-time indoor positioning or workload optimization.
- This spatial workflow is local to the tab. It does not send notifications, update Supabase, access cameras, or dispatch real staff. Existing scene-review and care-session integrations are separate.

## Files

- `src/FacilityMap.tsx`: original cutaway scene, controls, selection and colors.
- `src/FacilityWorkspace.tsx`: room directory, evidence and supervision interface.
- `src/facility.ts`: fixture data and tested local response transitions.
- `src/SuitePlan.tsx`: original suite schematic.
- `scripts/render-bathroom-tracking.py`: repeatable OpenCV GIF generator.
- `docs/bathroom-tracking-demo.md`: asset provenance and rendering method.
