"""Measure Google Studio image edits with OpenCV; assemble an honest step GIF.

No water classifier: a human selects the floor ROI and walking route. OpenCV
aligns the images, thresholds appearance changes, extracts contours and measures
their overlap with that route. No motion interpolation or fabricated tracks.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "output/bathroom-demo/python-packages"))
import cv2
import numpy as np
from PIL import Image

WIDTH = 1040
# Walkable floor outside the shower glass, excluding fixtures and the door trim.
FLOOR = [[.335, .58], [.58, .427], [.625, .49], [.595, .625], [.78, .93], [.765, .995], [.21, .995], [.21, .81], [.33, .77]]
ROUTE = [[.66, .96], [.53, .80], [.40, .70], [.33, .71]]
NEAR_MARGIN = .04
CHANGE_THRESHOLD = 14  # Calibrated for these synthetic frames, not validated on real cameras.

spec = importlib.util.spec_from_file_location("bathroom_tracking", ROOT / "scripts/render-bathroom-tracking.py")
flow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flow)


def poly(points, width, height):
    return np.round(np.array(points) * [width, height]).astype(np.int32)


def align(reference, current, floor):
    gray = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
    other = cv2.cvtColor(current, cv2.COLOR_BGR2GRAY)
    stable = cv2.bitwise_not(cv2.dilate(floor, np.ones((21, 21), np.uint8)))
    orb = cv2.ORB_create(nfeatures=3000)
    key0, desc0 = orb.detectAndCompute(gray, stable)
    key1, desc1 = orb.detectAndCompute(other, stable)
    if desc0 is None or desc1 is None:
        raise ValueError("No stable features; refusing to assess a changed scene")
    pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(desc1, desc0, k=2)
    matches = [pair[0] for pair in pairs if len(pair) == 2 and pair[0].distance < .72 * pair[1].distance]
    if len(matches) < 20:
        raise ValueError("Too few stable feature matches")
    source = np.float32([key1[m.queryIdx].pt for m in matches])
    target = np.float32([key0[m.trainIdx].pt for m in matches])
    matrix, inliers = cv2.estimateAffinePartial2D(source, target, method=cv2.RANSAC, ransacReprojThreshold=2)
    if matrix is None or int(inliers.sum()) < 20:
        raise ValueError("Unreliable frame registration")
    keep = inliers.ravel().astype(bool)
    residual = float(np.median(np.linalg.norm(cv2.transform(source[keep, None, :], matrix)[:, 0] - target[keep], axis=1)))
    if residual > 1.5 or np.max(np.abs(matrix[:, 2])) > 20 or not .97 < np.linalg.norm(matrix[0, :2]) < 1.03:
        raise ValueError("Camera or geometry changed too much")
    registered = cv2.warpAffine(current, matrix, (reference.shape[1], reference.shape[0]), borderMode=cv2.BORDER_REFLECT_101)
    return registered, {"inliers": int(inliers.sum()), "median_error_px": round(residual, 3), "matrix": matrix.round(5).tolist()}


def measure(reference, current, floor, route):
    delta = cv2.absdiff(cv2.GaussianBlur(reference, (5, 5), 0), cv2.GaussianBlur(current, (5, 5), 0))
    # Max-channel difference retains reflective/darkened edits without calling them water.
    difference = delta.max(axis=2)
    background = cv2.erode(cv2.bitwise_not(floor), np.ones((31, 31), np.uint8)) > 0
    drift = float(np.mean(difference[background] > 24))
    if drift > .08:
        raise ValueError(f"Background changed ({drift:.1%}); cannot isolate floor change")
    changed = np.uint8((difference > CHANGE_THRESHOLD) & (floor > 0)) * 255
    changed = cv2.morphologyEx(changed, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    changed = cv2.morphologyEx(changed, cv2.MORPH_CLOSE, np.ones((11, 11), np.uint8))
    contours, _ = cv2.findContours(changed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = [c for c in contours if cv2.contourArea(c) >= max(180, cv2.countNonZero(floor) * .003)]
    mask = np.zeros_like(floor)
    cv2.drawContours(mask, contours, -1, 255, -1)
    line = np.zeros_like(floor)
    cv2.polylines(line, [route], False, 255, 3)
    near = cv2.dilate(line, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (round(WIDTH * NEAR_MARGIN) * 2 + 1,) * 2))
    overlap = cv2.countNonZero(cv2.bitwise_and(mask, line))
    priority = "crossing" if overlap else "near" if cv2.countNonZero(cv2.bitwise_and(mask, near)) else "away" if contours else "unassessed"
    height, width = floor.shape
    boxes = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        boxes.append([round(y / height * 1000), round(x / width * 1000), round((y+h) / height * 1000), round((x+w) / width * 1000)])
    return {"priority": priority, "changed_pixels": cv2.countNonZero(mask), "route_overlap_pixels": overlap,
            "background_drift_fraction": round(drift, 5), "boxes": boxes}, contours


def process(paths, out):
    out.mkdir(parents=True, exist_ok=True)
    source = [cv2.imread(str(path)) for path in paths]
    if any(im is None for im in source):
        raise ValueError("Missing or unreadable source image")
    height = round(WIDTH * source[0].shape[0] / source[0].shape[1])
    frames = [cv2.resize(im, (WIDTH, height), interpolation=cv2.INTER_AREA) for im in source]
    reference = frames[0]
    floor = np.zeros((height, WIDTH), np.uint8)
    cv2.fillPoly(floor, [poly(FLOOR, WIDTH, height)], 255)
    route = poly(ROUTE, WIDTH, height)
    reference_gray = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
    stable_mask = cv2.bitwise_not(cv2.dilate(floor, np.ones((21, 21), np.uint8)))
    features = cv2.goodFeaturesToTrack(reference_gray, 180, .012, 7, mask=stable_mask)
    if features is None:
        raise ValueError("No stable fixture features for leak tracking")
    histories = {}
    measurements, raw, annotated = [], [], []
    for index, frame in enumerate(frames):
        registered, fit = (reference.copy(), {"inliers": 0, "median_error_px": 0}) if index == 0 else align(reference, frame, floor)
        result, contours = measure(reference, registered, floor, route)
        result.update({"step": index, "at_ms": index * 2000, "duration_ms": 2000 if index < len(frames)-1 else 4000,
                       "registration": fit, "source_sha256": hashlib.sha256(paths[index].read_bytes()).hexdigest()})
        overlay = registered.copy()
        # Track stable surroundings, not inferred water particles. The floor
        # contours below remain independent appearance-change measurements.
        _, points, feature_ids, count, error = flow.estimate_flow(reference_gray, cv2.cvtColor(registered, cv2.COLOR_BGR2GRAY), features)
        if count < 30 or error > .8:
            raise ValueError("Stable fixture tracking lost; refusing a leak assessment")
        result["tracking"] = {"feature_count": count, "median_fit_error_px": round(error, 5),
                              "features": [[int(fid), round(float(p[0]), 2), round(float(p[1]), 2)] for fid, p in zip(feature_ids, points)]}
        for fid, point in zip(feature_ids, points):
            trail = histories.setdefault(int(fid), [])
            if trail and trail[-1][0] != index - 1:
                trail.clear()
            trail.append((index, tuple(np.round(point).astype(int))))
            color = flow.FEATURE_COLORS[int(fid) % len(flow.FEATURE_COLORS)]
            if len(trail) > 1:
                cv2.polylines(overlay, [np.array([p for _, p in trail], np.int32)], False, color, 1, cv2.LINE_AA)
            cv2.circle(overlay, trail[-1][1], 2, color, -1, cv2.LINE_AA)
            if int(fid) % 20 == 0:
                cv2.putText(overlay, f"F{int(fid):03d}", trail[-1][1], cv2.FONT_HERSHEY_SIMPLEX, .3, color, 1, cv2.LINE_AA)
        cv2.polylines(overlay, [route], False, (230, 210, 0), 3, cv2.LINE_AA)
        color = (55, 65, 220) if result["priority"] == "crossing" else (40, 160, 240)
        cv2.drawContours(overlay, contours, -1, color, 2, cv2.LINE_AA)
        canvas = cv2.copyMakeBorder(overlay, 36, 48, 0, 0, cv2.BORDER_CONSTANT, value=(29, 39, 41))
        label = {"unassessed": "BASELINE / NO CHANGE MEASURED", "away": "L1 / CHANGED AREA OFF ROUTE", "near": "L2 / CHANGED AREA NEAR ROUTE", "crossing": "L3 / CHANGED AREA CROSSES ROUTE"}[result["priority"]]
        cv2.putText(canvas, f"A104 | GOOGLE STUDIO SYNTHETIC STEPS | {index+1}/{len(frames)} | {count} FEATURE TRACKS", (14, 24), cv2.FONT_HERSHEY_SIMPLEX, .53, (245, 245, 245), 1, cv2.LINE_AA)
        cv2.putText(canvas, label, (14, height+57), cv2.FONT_HERSHEY_SIMPLEX, .5, color if contours else (225, 225, 225), 1, cv2.LINE_AA)
        cv2.putText(canvas, f"OpenCV floor change: {result['changed_pixels']} px | Route overlap: {result['route_overlap_pixels']} px | Not a water classifier", (14, height+76), cv2.FONT_HERSHEY_SIMPLEX, .4, (220, 220, 220), 1, cv2.LINE_AA)
        filename = f"a104-leak-step-{index}.jpg"
        cv2.imwrite(str(out / filename), canvas, [cv2.IMWRITE_JPEG_QUALITY, 93])
        result["image"] = f"/demo/{filename}"
        measurements.append(result)
        raw.append(Image.fromarray(cv2.cvtColor(registered, cv2.COLOR_BGR2RGB)))
        annotated.append(Image.fromarray(cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)))
    durations = [m["duration_ms"] for m in measurements]
    for name, images in [("a104-water-leak.gif", raw), ("a104-water-leak-opencv.gif", annotated)]:
        images[0].save(out / name, save_all=True, append_images=images[1:], duration=durations, loop=0, disposal=2)
        with Image.open(out / name) as check:
            assert check.n_frames == len(paths)
    manifest = {"version": 1, "suite": "A104", "zone": "Bathroom", "source": "Google AI Studio generated image sequence",
                "opencv_version": cv2.__version__, "method": "ORB + RANSAC registration; LK stable-feature tracking; absolute pixel difference; morphology; contours; route-mask intersection",
                "warning": "Synthetic steps, not continuous footage or live inference. ROI and route are human-marked. Pixel change does not establish water, safety or clinical risk.",
                "width": WIDTH, "height": height+84, "threshold": CHANGE_THRESHOLD, "floor_roi": FLOOR, "route": ROUTE,
                "near_margin": NEAR_MARGIN, "steps": measurements}
    (out / "a104-leak-analysis.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frames", nargs="+", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if len(args.frames) < 2:
        parser.error("At least a baseline and an edited frame are required")
    process(args.frames, args.out)
