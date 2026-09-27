# Google Studio suite images and leak sequence

Created on 2026-09-27 in Google AI Studio, model **Nano Banana 2 Lite / gemini-3.1-flash-lite-image**. Settings: 16:9, 1K, Minimal thinking, Images & text, no API key selected. No paid video request was made. No resident data was used.

The active assets are Google-generated JPEGs (1376 × 768). Initial built-in-generator alternatives were superseded at the user's request and moved into ignored `output/superseded-built-in-stills/`; they are not used in the app. A101's older bathroom recording and the user's A102 images are unchanged.

## Google Studio conversations

- [A101 bedroom](https://aistudio.google.com/u/2/prompts/1LZZI1NuUC5RgKIEfnrLRsxv4GR4BZGCU)
- [A103 bedroom and bathroom](https://aistudio.google.com/u/2/prompts/1wzJvo6f-J0P_OLs8qy3ExbKu4V-DDspg)
- [A104 bedroom, bathroom and leak edits](https://aistudio.google.com/u/2/prompts/1GncyI3fCsKmjfr6SFtadbh7RohtNLfAI)

## Image prompt set

Each initial prompt is the common paragraph followed by its room paragraph below, separated by a space.

Generate one photorealistic nursing-home room image for a clearly labelled synthetic monitoring prototype. Landscape 16:9, one coherent room, fixed high corner camera looking diagonally downward, deep focus, lots of visible floor, natural daylight, ordinary realistic textures, plausible accessible care-home furniture. No people, text, logos, timestamps, annotations, bounding boxes, arrows, route overlays or collage.

### a101-bedroom-google.jpg

Saved: [public/demo/a101-bedroom-google.jpg](../public/demo/a101-bedroom-google.jpg)

Suite A101 bedroom: warm cream walls, muted blue bedding, oak bedside cabinet, upholstered chair, wide bathroom doorway. A small wheeled overbed table stands partly across the walking approach from the bed to the bathroom; show the wheels and floor around it. No laundry basket.

### a103-bedroom-google.jpg

Saved: [public/demo/a103-bedroom-google.jpg](../public/demo/a103-bedroom-google.jpg)

Suite A103 bedroom: sage-green wall, cream bedspread on a low adjustable single bed, walnut bedside cabinet, tall narrow window and an en-suite doorway with terracotta bathroom tiles visible. A rectangular woven rug near the foot of the bed has a visibly curled corner intruding on the walking approach. Rest of room orderly. No laundry basket or overbed table. Distinct room layout.

### a103-bathroom-google.jpg

Saved: [public/demo/a103-bathroom-google.jpg](../public/demo/a103-bathroom-google.jpg)

Suite A103 bathroom: white upper walls, terracotta lower wall tiles, matte pale stone floor, wall-mounted sink, accessible toilet with grab rails and a level-entry shower with folding seat. A light blue towel is crumpled on the floor between shower and toilet. The rest of the floor is clear. No spill or other clutter.

### a104-bedroom-google.jpg

Saved: [public/demo/a104-bedroom-google.jpg](../public/demo/a104-bedroom-google.jpg)

Suite A104 bedroom: pale blue-gray walls, light birch adjustable single bed, rust-colored blanket, upholstered chair by a broad window, bedside cabinet and en-suite doorway showing warm ivory tiles. The floor between bed and doorway is visibly uncluttered. No rugs, cables, laundry baskets or objects on the floor. Different furniture arrangement from A101 and A103.

### a104-bathroom-google.jpg

Saved: [public/demo/a104-bathroom-google.jpg](../public/demo/a104-bathroom-google.jpg)

Suite A104 bathroom: warm ivory tiles with a narrow sage mosaic band, matte beige floor, toilet with support rails, rounded wall-mounted sink, level-entry shower with folding wall seat and handheld shower. Broad unobstructed floor between fixtures. No floor towels, puddles, rugs or clutter. Different geometry from the terracotta bathroom.

## Consecutive leak-edit prompts

**Retired from the app on 2026-09-27 at the user's request:** the water animation looked unnatural. A104 bathroom now displays the original `a104-bathroom-google.jpg` reference still. The floor no longer mounts the sequence or exposes its event callback, so it cannot generate new leak concerns. The assets, processor and isolated adapter tests below are retained for reference; this section describes the former demonstration, not current runtime behavior. Existing records are not relabeled as safe merely because the animation was removed.

The subsequent dry-bathroom OpenCV update adds a fixture-tracking overlay derived only from that original still. The latest requested presentation progressively reveals features, fixture boxes and the route before holding the result and looping. It uses manually marked toilet, sink, shower seat and shower-fixture regions, with no water layer or leak animation; see [suite tracking](suite-tracking.md).

The dry A104 bathroom is frame 1. Each following prompt edits the previous generated image in the same Google Studio conversation.

### a104-leak-small-google.jpg

Saved: [public/demo/a104-leak-small-google.jpg](../public/demo/a104-leak-small-google.jpg)

Edit ONLY the most recent Suite A104 bathroom image. Create frame 2 of a fixed-camera synthetic water-leak sequence. Preserve the exact camera, crop, room geometry, fixtures, tile grout lines, lighting and every pixel outside the small edited area. Under the wall-mounted sink, add a small irregular shallow puddle of clear water directly below its exposed drain pipe, with a thin visible trickle from the pipe and subtle wet reflections. Keep the central walking floor and foreground dry. Water is on the floor only, not a blue painted shape. The leak has just started. One 16:9 photorealistic image, no people, no labels, no arrows, no boxes. Do not redesign the room or move any objects.

### a104-leak-medium-google.jpg

Saved: [public/demo/a104-leak-medium-google.jpg](../public/demo/a104-leak-medium-google.jpg)

Continue the same fixed-camera A104 bathroom water-leak sequence. Edit the most recent image ONLY by expanding the existing clear-water puddle under the sink. The leak continues and the puddle now reaches toward the center of the bathroom floor, roughly twice its previous width, with an irregular edge and visible wet reflections. Keep its connection to the leak under the sink. Preserve the exact original camera, crop, all fixtures, tile lines, colors, shadows and lighting; do not change pixels outside the new water region. Keep the front third of the floor dry. No people, labels, overlays, text, arrows, boxes or extra objects. One photorealistic 16:9 image, not a collage.

### a104-leak-large-google.jpg

Saved: [public/demo/a104-leak-large-google.jpg](../public/demo/a104-leak-large-google.jpg)

Create the final frame of the same A104 bathroom water leak. Edit only the water: continue the thin leak from the bottom of the sink and enlarge the same irregular clear-water puddle so it spreads farther from the sink across the center of the bathroom toward the foreground walking approach, stopping short of the bottom image edge. The water should occupy about one third of the visible floor, with realistic darkened wet material, soft reflections and subtle ripples. Keep the exact same camera, crop, wall and floor geometry, toilet, sink, glass screen, shower seat, lighting and colors. No room redesign and no extra objects. No people, labels, boxes, arrows or text. One photorealistic 16:9 image.

## Local GIF and OpenCV processing

- [Unannotated four-step GIF](../public/demo/a104-water-leak.gif), 1040 × 580.
- [OpenCV overlay GIF](../public/demo/a104-water-leak-opencv.gif), 1040 × 664.
- [Measured output and source hashes](../public/demo/a104-leak-analysis.json).
- Four rendered app frames: `public/demo/a104-leak-step-0.jpg` through `a104-leak-step-3.jpg`.
- Durations: 2, 2, 2, 4 seconds (10 seconds total). GIFs loop for viewing, but the app's preview runs once and provides replay without resetting response records.

OpenCV 5.0.0 uses ORB feature matching and RANSAC affine registration, then blurred absolute pixel differences (max-channel threshold 14), morphology and contour extraction inside a human-marked walkable-floor polygon. The shower glass, fixtures and door trim are excluded. Contour-mask overlap with a human-marked route determines the route level; a 4%-of-image-width pixel margin defines "near".

The first threshold (24) missed the subtle small puddle. It was calibrated to 14 from actual pixel differences in this sequence. This is a demonstration-specific threshold, not a validated production detector.

| Step | Changed floor pixels | Route overlap pixels | Measurement |
|---|---:|---:|---|
| Dry baseline | 0 | 0 | No change measured |
| Small leak | 6,427 | 0 | L2, near route |
| Spreading leak | 25,300 | 582 | L3, crossing route |
| Larger leak | 58,906 | 880 | L3, crossing route |

Registration has 250–592 inlier matches; median fitting error is 0.026–0.103 pixels. Geometry drift and excessive background changes fail closed in the processor.

### Reproduce

Run from the project root with Python, NumPy, Pillow and OpenCV available. This checkout's script also loads the existing ignored native dependency directory `output/bathroom-demo/python-packages`.

```powershell
python scripts/process-leak-sequence.py --frames public/demo/a104-bathroom-google.jpg public/demo/a104-leak-small-google.jpg public/demo/a104-leak-medium-google.jpg public/demo/a104-leak-large-google.jpg --out public/demo
python scripts/test-leak-sequence.py
npm test
npm run build
```

### Runtime boundaries

The app reads saved **offline** measurements, synchronized with each successfully loaded frame. It does not run OpenCV in the browser and does not classify water from arbitrary footage. "Possible spill" is the authored synthetic scenario; the computer-vision result is a changing floor region. Generated shadows and reflections can also change pixels.

The leak sequence creates only an A104 bathroom concern, activity history, route-level updates and a supervision assignment proposal. A101 retains its separate recording. A102/A103 now have separate [offline OpenCV tracking adapters](suite-tracking.md), with manually initialized candidate hazards; simply loading their raw stills still does not create detections. Assignment requires supervisor approval; no external nursing-home system is contacted. The dry starting frame is not cleanup evidence, and replay cannot clear or duplicate the concern. This sequence has no verified cleanup or automatic safety sign-off. Signed-in real care-team mode does not publish these demo records.

The A104 overlay also follows stable fixture features using pyramidal Lucas-Kanade optical flow, forward/backward checks and RANSAC. Persistent feature IDs and their measured coordinates are stored in each step's `tracking` field. These are background/fixture tracks, not water-particle tracks; contour-change measurements remain separate.

Everything remains local; no Vercel deployment was performed.
