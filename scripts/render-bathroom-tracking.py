"""Reproducible OpenCV tracking GIF from a staged still, not a water detector.

Object names/initial ROIs and route are human annotations. OpenCV measures
feature displacement on synthetic camera motion and updates the boxes.
Use --wet-image only after obtaining the actual Google AI Studio edit.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "output/bathroom-demo/python-packages"))
import cv2
import numpy as np
from PIL import Image

W, H = 1040, 770
PX, PY, PW, PH = 0, 42, W, 698
# OpenCV drawing colors are BGR. Convert once to RGB before GIF encoding.
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
GREEN = (0, 255, 0)
YELLOW = (0, 255, 255)
RED = (0, 0, 255)
CYAN = (255, 255, 0)
BG = (20, 20, 20)
FONT = cv2.FONT_HERSHEY_SIMPLEX
FEATURE_COLORS = [GREEN, CYAN, YELLOW, (255, 0, 255), (255, 128, 0)]
ROUTE = np.array([[0.60, 0.985], [0.57, 0.92], [0.49, 0.86], [0.37, 0.81]], np.float32)
BASE_REGIONS = [
    ("Shower seat", (0.075, 0.44, 0.218, 0.723)),
    ("Grab rail", (0.598, 0.462, 0.938, 0.606)),
    ("Toilet", (0.621, 0.610, 0.826, 0.842)),
]


def transform(points, matrix):
    return cv2.transform(np.asarray(points, np.float32).reshape(-1, 1, 2), matrix).reshape(-1, 2)


def corners(box):
    x1, y1, x2, y2 = box
    return np.array([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], np.float32)


def estimate_flow(reference, current, features):
    moved, valid, _ = cv2.calcOpticalFlowPyrLK(reference, current, features, None,
        winSize=(21, 21), maxLevel=3,
        criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
    if moved is None:
        raise RuntimeError("OpenCV produced no feature tracks")
    back, back_valid, _ = cv2.calcOpticalFlowPyrLK(current, reference, moved, None,
        winSize=(21, 21), maxLevel=3)
    if back is None:
        raise RuntimeError("OpenCV reverse-flow check failed")
    keep = (valid.ravel() == 1) & (back_valid.ravel() == 1)
    keep &= np.linalg.norm(features - back, axis=2).ravel() < 0.8
    old, new = features[keep].reshape(-1, 2), moved[keep].reshape(-1, 2)
    if len(old) < 8:
        raise RuntimeError("Too few reliable optical-flow points; refusing fabricated tracks")
    matrix, inliers = cv2.estimateAffinePartial2D(old, new, method=cv2.RANSAC,
        ransacReprojThreshold=1.0)
    if matrix is None:
        raise RuntimeError("Tracking transform could not be estimated")
    keep2 = inliers.ravel() == 1
    errors = np.linalg.norm(transform(old[keep2], matrix) - new[keep2], axis=1)
    return matrix, new[keep2], np.flatnonzero(keep)[keep2], len(errors), float(np.median(errors))


def box_pixels(box):
    return np.asarray(box, np.float32) * [PW, PH, PW, PH]


def route_intersects(box, margin=0):
    x1, y1, x2, y2 = box
    rect = (int(x1 - margin), int(y1 - margin),
        max(1, int(x2 - x1 + 2 * margin)), max(1, int(y2 - y1 + 2 * margin)))
    pts = (ROUTE * [PW, PH]).astype(int)
    return any(cv2.clipLine(rect, tuple(a), tuple(b))[0] for a, b in zip(pts, pts[1:]))


def level_for(box):
    return 3 if route_intersects(box) else 2 if route_intersects(box, 22) else 1


def cv_text(frame, text, xy, color=WHITE, scale=0.52):
    # Status text sits on the dark strip, so it needs no decorative shadow.
    cv2.putText(frame, text, xy, FONT, scale, color, 1, cv2.LINE_AA)


def draw_box(frame, points, label, color):
    lower = np.clip(np.floor(points.min(axis=0)), [0, 0], [PW - 1, PH - 1]).astype(int)
    upper = np.clip(np.ceil(points.max(axis=0)), [0, 0], [PW - 1, PH - 1]).astype(int)
    cv2.rectangle(frame, tuple(lower), tuple(upper), color, 2, cv2.LINE_8)
    (width, height), baseline = cv2.getTextSize(label, FONT, 0.53, 1)
    x = min(max(0, int(lower[0])), PW - width - 9)
    y = max(height + baseline + 7, int(lower[1]))
    cv2.rectangle(frame, (x, y - height - baseline - 7), (x + width + 8, y), color, -1)
    cv2.putText(frame, label, (x + 4, y - baseline - 4), FONT, 0.53, BLACK, 1, cv2.LINE_AA)


def render(args):
    global PH, H
    source = Path(args.wet_image or args.source)
    original = Image.open(source).convert("RGB")
    PH = round(PW * original.height / original.width)
    H = PY + PH + 54
    rgb = np.asarray(original.resize((PW, PH), Image.Resampling.LANCZOS))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    base_gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    features = cv2.goodFeaturesToTrack(base_gray, maxCorners=240, qualityLevel=0.012, minDistance=7)
    if features is None:
        raise RuntimeError("No source image features")
    wet = bool(args.wet_image)
    if wet and not args.spill_box:
        raise ValueError("Mark the actual edited spill with --spill-box x1 y1 x2 y2 (0..1)")
    if args.spill_box and not (0 <= args.spill_box[0] < args.spill_box[2] <= 1 and 0 <= args.spill_box[1] < args.spill_box[3] <= 1):
        raise ValueError("Invalid normalized spill box")
    regions = BASE_REGIONS + ([("Possible water", args.spill_box)] if wet else [])
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    frames, measured = [], []
    histories = {}
    total = int(args.seconds * args.fps)
    if total < 4 or args.fps <= 0 or args.seconds <= 0:
        raise ValueError("Use a positive duration and frame rate with at least four frames")
    for index in range(total):
        t = index / args.fps
        phase = min(3, int(t // (args.seconds / 4)))
        # Synthetic test frames only; this known transform is NOT used for boxes.
        angle = 2 * math.pi * index / max(1, total - 1)
        generated = cv2.getRotationMatrix2D((PW / 2, PH / 2), 0.04 * math.sin(angle), 1.016)
        generated[:, 2] += [2.0 * math.sin(angle), 1.0 * math.cos(angle)]
        camera = cv2.warpAffine(bgr, generated, (PW, PH), borderMode=cv2.BORDER_REFLECT_101)
        gray = cv2.cvtColor(camera, cv2.COLOR_BGR2GRAY)
        estimate, tracked, feature_ids, count, error = estimate_flow(base_gray, gray, features)
        # Per-frame boxes follow the measured optical-flow transform, not animation metadata.
        tracked_boxes = [transform(corners(box_pixels(box)), estimate) for _, box in regions]
        route = transform(ROUTE * [PW, PH], estimate)
        # Keep stable feature identities and draw only measured positions, never
        # fabricated scan lines or random motion. Limit trails to recent frames.
        for point, feature_id in zip(tracked, feature_ids):
            track = histories.setdefault(int(feature_id), [])
            if track and track[-1][0] != index - 1:
                track.clear()
            track.append((index, tuple(np.round(point).astype(int))))
            del track[:-16]
            inside_roi = any(cv2.pointPolygonTest(box.astype(np.float32), tuple(map(float, point)), False) >= 0 for box in tracked_boxes)
            if phase != 0 and not inside_roi:
                continue
            color = FEATURE_COLORS[int(feature_id) % len(FEATURE_COLORS)]
            if len(track) > 1:
                cv2.polylines(camera, [np.array([p for _, p in track], np.int32)], False, color, 1, cv2.LINE_AA)
            cv2.circle(camera, track[-1][1], 2, color, -1, cv2.LINE_AA)
        shown = 0 if phase == 0 else 3 + int(wet and phase >= 2)
        for n, (name, box) in enumerate(regions[:shown]):
            color = GREEN if n < 3 else (RED if phase == 3 and level_for(box_pixels(box)) == 3 else YELLOW)
            draw_box(camera, tracked_boxes[n], f"ID {n + 1:02d}  {name.lower()}", color)
        if phase >= 2:
            route_pixels = np.round(route).astype(np.int32)
            cv2.polylines(camera, [route_pixels], False, BLACK, 4, cv2.LINE_AA)
            cv2.polylines(camera, [route_pixels], False, CYAN, 2, cv2.LINE_AA)
            for waypoint in route_pixels:
                cv2.circle(camera, tuple(waypoint), 4, CYAN, 1, cv2.LINE_AA)
        canvas = np.full((H, W, 3), BG, np.uint8)
        canvas[PY:PY + PH, PX:PX + PW] = camera
        cv_text(canvas, "A101 / BATHROOM", (14, 27), scale=0.61)
        cv_text(canvas, "OpenCV / LK OPTICAL FLOW", (422, 27))
        cv_text(canvas, "PLAYBACK", (925, 27), CYAN)
        phase_label = ["FEATURE TRACKS", "TRACKING REGIONS", "ROUTE OVERLAY", "REVIEW REQUIRED" if wet else "TRACKING REGIONS"][phase]
        if wet and phase == 3:
            phase_label = {1: "L1 / OFF ROUTE", 2: "L2 / NEAR ROUTE", 3: "L3 / ROUTE INTERSECTION"}[level_for(box_pixels(args.spill_box))]
        status_color = RED if wet and phase == 3 else GREEN
        cv_text(canvas, phase_label, (14, PY + PH + 22), status_color)
        cv_text(canvas, f"TRACKS {count:03d}  |  FRAME {index + 1:03d}/{total:03d}", (620, PY + PH + 22))
        cv_text(canvas, "Image-based playback | Annotated regions and route", (14, PY + PH + 43), (185, 185, 185), 0.40)
        image = Image.fromarray(cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB))
        measured.append({"frame": index, "feature_count": count, "median_fit_error_px": error,
            "boxes": {name: points.round(2).tolist() for (name, _), points in zip(regions, tracked_boxes)}})
        frames.append(image)
    stem = "panoramic-bathroom-tracking" if wet else "panoramic-bathroom-preview"
    # Shared photograph palette plus exact overlay RGB colors. Quantizing only
    # the photo otherwise desaturates the thin, bright OpenCV annotations.
    photo_palette = Image.fromarray(rgb).quantize(colors=240, method=Image.Quantize.MEDIANCUT).getpalette()[:720]
    overlay_rgb = [BLACK, WHITE, GREEN, YELLOW, RED, CYAN, BG, *FEATURE_COLORS]
    overlay_palette = [channel for bgr_color in overlay_rgb for channel in reversed(bgr_color)]
    palette = Image.new("P", (1, 1))
    palette.putpalette((photo_palette + overlay_palette + [0] * 768)[:768])
    gifs = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in frames]
    gifs[0].save(out / f"{stem}.gif", save_all=True, append_images=gifs[1:],
        loop=0, duration=round(1000 / args.fps), optimize=True, disposal=1)
    frames[-1].save(out / f"{stem}-poster.png")
    contact = Image.new("RGB", (W * 2, H * 2), BG)
    for n, at in enumerate([0.14, 0.39, 0.64, 0.90]):
        contact.paste(frames[min(total - 1, int(total * at))], ((n % 2) * W, (n // 2) * H))
    contact.save(out / f"{stem}-contact.png")
    manifest = {"source": str(source), "source_kind": "AI Studio edited still" if wet else "original still",
        "opencv_version": cv2.__version__, "fps": args.fps, "frames": total,
        "algorithm": "goodFeaturesToTrack + pyramidal Lucas-Kanade + forward/backward filter + RANSAC affine",
        "semantic_labels": "human initialized, not automatically classified",
        "motion": "synthetic camera motion, not live footage", "warning": "local demonstration only, no caregiver notified",
        "overlay": "OpenCV rectangle, putText FONT_HERSHEY_SIMPLEX, measured feature trails; BGR drawing converted to RGB",
        "overlay_colors_rgb": {"objects": "#00ff00", "review": "#ffff00", "hazard": "#ff0000", "route": "#00ffff"},
        "initial_regions": regions, "sample_route": ROUTE.tolist(), "measurements": measured}
    (out / f"{stem}.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    with Image.open(out / f"{stem}.gif") as check:
        assert check.n_frames == total, (check.n_frames, total)
        assert check.size == (W, H)
        check.seek(total - 1)
        pixels = np.asarray(check.convert("RGB"))
        # Verify the encoded asset, not just the pre-quantized image. The
        # photograph palette must not mute native overlay colors again.
        final_colors = {"green": GREEN}
        if wet:
            final_colors["cyan"] = CYAN
            if level_for(box_pixels(args.spill_box)) == 3:
                final_colors["red"] = RED
            else:
                final_colors["yellow"] = YELLOW
        color_counts = {name: int(np.all(pixels == tuple(reversed(color)), axis=2).sum()) for name, color in final_colors.items()}
        assert all(count > 100 for count in color_counts.values()), color_counts
    print(json.dumps({"gif": str(out / f"{stem}.gif"), "frames": total,
        "bytes": (out / f"{stem}.gif").stat().st_size,
        "verified_overlay_pixels": color_counts,
        "minimum_tracked_features": min(f["feature_count"] for f in measured),
        "maximum_median_fit_error_px": max(f["median_fit_error_px"] for f in measured)}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--wet-image")
    parser.add_argument("--spill-box", type=float, nargs=4)
    parser.add_argument("--out", default=str(ROOT / "output/bathroom-demo"))
    parser.add_argument("--seconds", type=float, default=12)
    parser.add_argument("--fps", type=int, default=10)
    render(parser.parse_args())
