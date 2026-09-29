# Bathroom image and OpenCV demonstration

## Asset status

The user's original source is `C:/Users/jessi/OneDrive/Desktop/retirement home or nursing home.jpg` (761 × 480). The original is unchanged.

On September 26, 2026, the user supplied the finished water edit, `C:/Users/jessi/OneDrive/Desktop/gemini_image_restroom_water_scene.jpg` (1264 × 848), and asked to use it. It is stored at `public/demo/bathroom-water.jpg`. The specific generation model is not independently verified; no additional generation was run for this import. Source-image ownership was not independently established.

The finished `public/demo/bathroom-tracking.gif` is a 12-second, 120-frame OpenCV demonstration based on that wet image. `public/demo/bathroom-tracking-poster.png` is the still preview. The earlier dry preview remains separate under ignored `output/bathroom-demo/` and is not used by the website.

## Google AI Studio edit prompt

Use the attached bathroom photograph as the edit target. Preserve the exact camera position, dimensions, beige wall and floor tiles, grout lines, toilet, shower tray, drain, shower head, folding shower seat, grab bars, lighting, shadows and room geometry. Add only a shallow puddle of clear water on the beige floor tiles in the foreground between the shower-tray edge and the toilet, centered approximately at x=0.55, y=0.90 in normalized image coordinates. Keep it within the visible floor, outside the shower tray. It should have an irregular thin edge, subtle realistic reflections of nearby tiles and fixtures, faint darkening of wet tiles and visible grout beneath the transparent water. The puddle should occupy roughly one fifth of the image width, with a few small separated droplets nearby. Natural indoor photographic realism. No blue tint, foam, flood, running water, new objects, people, labels, arrows or text. Do not crop, restyle or change fixtures. Return the edited image.

Use the actual downloaded AI Studio result, inspect it, and record the selected model and generation date. If generation requires paid usage, get a spending limit before running it. Do not silently substitute another image generator.

## Actual OpenCV work

Script: `scripts/render-bathroom-tracking.py`.

- Names and initial object regions are human-marked. This is not an automatic semantic object detector or trained water classifier.
- The still is converted into test frames with small synthetic camera movement.
- OpenCV finds corner features, measures pyramidal Lucas–Kanade optical flow, checks forward/backward agreement, and uses RANSAC to estimate image motion.
- The boxes follow the **measured** transform, not the known synthetic-animation coordinates. Failed tracking stops the render rather than inventing a result.
- The example route is explicitly authored, not learned from a resident.
- The actual visible puddle region is marked at normalized x1=.339, y1=.805, x2=.790, y2=.997. `clipLine` tests route intersection, then assigns an illustrative concern level. The warning is rendered locally and sends no notification.
- OpenCV draws the entire overlay with `rectangle`, `putText` / `FONT_HERSHEY_SIMPLEX`, `circle` and `polylines`. Pillow only loads/resizes the source and encodes output images.
- The recording uses bright green object boxes, yellow review regions, red route conflicts and a cyan route. Colored feature dots and short trails show measured Lucas–Kanade positions with stable feature IDs. The dashboard's light-to-dark concern scale is unchanged; the video overlay has its own high-contrast palette.
- The full-width frame replaces the earlier branded card layout. Playback and **Show still** use the same OpenCV-rendered assets. Compact status strips show the actual retained track count and playback frame number; there are no invented detection confidence scores.
- Colors are drawn in OpenCV's BGR order and converted to RGB once for encoding. The GIF palette explicitly reserves overlay colors so thin green/red/cyan lines do not become muted during quantization.

OpenCV reference: https://docs.opencv.org/4.x/dc/d6b/group__video__track.html

Overlay references: [OpenCV drawing functions](https://docs.opencv.org/4.x/dc/da5/tutorial_py_drawing_functions.html) and [Lucas–Kanade feature visualization](https://docs.opencv.org/4.x/d4/dee/tutorial_optical_flow.html). OpenCV does not prescribe a single UI theme; this uses its native drawing primitives and conventional saturated overlays.

The output JSON records the algorithm, provenance, annotations and per-frame measured feature/box data. Fit error on this synthetic scene is a rendering QA metric, not real-world monitoring accuracy.

## Render

Use a Python environment with OpenCV, Pillow, and NumPy available.

The script also checks the ignored `output/bathroom-demo/python-packages` directory for local dependencies.

```powershell
python scripts/render-bathroom-tracking.py --source 'C:/Users/jessi/OneDrive/Desktop/retirement home or nursing home.jpg' --wet-image 'public/demo/bathroom-water.jpg' --spill-box 0.339 0.805 0.790 0.997
```

The output JSON at `output/bathroom-demo/panoramic-bathroom-tracking.json` records per-frame tracking evidence. The current 1040-pixel-wide rendering retained 240 features; maximum median affine-fit error was 0.056 pixels. These figures verify the synthetic rendering pipeline only, not water-recognition accuracy. Source aspect ratio is preserved. The script reopens the encoded GIF to verify its frame count, dimensions, and exact saturated overlay colors. Copies of the GIF and poster are served by the app's spatial-view bathroom panel.
