# Bathroom image and OpenCV demonstration

## Asset status

The user's original source is `C:/Users/jessi/OneDrive/Desktop/retirement home or nursing home.jpg` (761 × 480). The original is unchanged.

On September 26, 2026, the user supplied the finished water edit, `C:/Users/jessi/OneDrive/Desktop/gemini_image_restroom_water_scene.jpg` (1264 × 848), and asked to use it. It is stored at `public/demo/bathroom-water.jpg`. The specific generation model is not independently verified; the assistant did not run or charge for another generation. Source-image ownership was not independently established.

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
- Pillow draws readable text and encodes the GIF. OpenCV performs the motion measurement, image transformation and route-intersection test.

OpenCV reference: https://docs.opencv.org/4.x/dc/d6b/group__video__track.html

The output JSON records the algorithm, provenance, annotations and per-frame measured feature/box data. Fit error on this synthetic scene is a rendering QA metric, not real-world monitoring accuracy.

## Render

Python runtime used: `C:/Users/jessi/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`.

OpenCV is locally installed under the ignored `output/bathroom-demo/python-packages` directory. Pillow and NumPy come from the bundled runtime.

```powershell
& 'C:/Users/jessi/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/render-bathroom-tracking.py --source 'C:/Users/jessi/OneDrive/Desktop/retirement home or nursing home.jpg' --wet-image 'public/demo/bathroom-water.jpg' --spill-box 0.339 0.805 0.790 0.997
```

The output JSON at `output/bathroom-demo/panoramic-bathroom-tracking.json` records per-frame tracking evidence. This run retained at least 235 features; maximum median affine-fit error was 0.064 pixels. These figures verify the synthetic rendering pipeline only, not water-recognition accuracy. Source aspect ratio is preserved. Copies of the GIF and poster are served by the app's spatial-view bathroom panel.
