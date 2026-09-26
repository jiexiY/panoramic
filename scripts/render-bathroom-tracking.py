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
from PIL import Image, ImageDraw, ImageFont

W, H = 1040, 648
PX, PY, PW, PH = 24, 92, 761, 480
BG = (247, 246, 240)
INK = (42, 47, 40)
SAGE = (84, 107, 85)
PALE = (251, 229, 213)
TERRA = (184, 90, 54)
DARK = (101, 43, 38)
GRAY = (113, 119, 115)
ROUTE = np.array([[0.60, 0.985], [0.57, 0.92], [0.49, 0.86], [0.37, 0.81]], np.float32)
BASE_REGIONS = [
    ("Shower seat", (0.075, 0.44, 0.218, 0.723)),
    ("Grab rail", (0.598, 0.462, 0.938, 0.606)),
    ("Toilet", (0.621, 0.610, 0.826, 0.842)),
]


def font(size, bold=False):
    path = Path("C:/Windows/Fonts") / ("segoeuib.ttf" if bold else "segoeui.ttf")
    return ImageFont.truetype(str(path), size)


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
    return matrix, new[keep2], len(errors), float(np.median(errors))


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


def draw_label(draw, xy, label, fill):
    f = font(15, True)
    width = draw.textbbox((0, 0), label, font=f)[2] + 16
    x, y = xy
    x = min(max(PX, x), PX + PW - width)
    y = min(max(PY + 2, y), PY + PH - 26)
    draw.rounded_rectangle((x, y, x + width, y + 25), radius=4, fill=fill)
    draw.text((x + 8, y + 2), label, font=f, fill="white")


def draw_wrapped(draw, text, xy, width, fill=INK, size=15, bold=False):
    x, y = xy
    f, line = font(size, bold), ""
    for word in text.split():
        candidate = (line + " " + word).strip()
        if draw.textlength(candidate, font=f) > width and line:
            draw.text((x, y), line, font=f, fill=fill)
            y += size + 6
            line = word
        else:
            line = candidate
    if line:
        draw.text((x, y), line, font=f, fill=fill)
    return y + size + 6


def render(args):
    global PH, H
    source = Path(args.wet_image or args.source)
    original = Image.open(source).convert("RGB")
    PH = round(PW * original.height / original.width)
    H = PY + PH + 76
    rgb = np.asarray(original.resize((PW, PH), Image.Resampling.LANCZOS))
    base_gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
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
    total = int(args.seconds * args.fps)
    for index in range(total):
        t = index / args.fps
        phase = min(3, int(t // (args.seconds / 4)))
        # Synthetic test frames only; this known transform is NOT used for boxes.
        angle = 2 * math.pi * index / max(1, total - 1)
        generated = cv2.getRotationMatrix2D((PW / 2, PH / 2), 0.04 * math.sin(angle), 1.016)
        generated[:, 2] += [2.0 * math.sin(angle), 1.0 * math.cos(angle)]
        camera = cv2.warpAffine(rgb, generated, (PW, PH), borderMode=cv2.BORDER_REFLECT_101)
        gray = cv2.cvtColor(camera, cv2.COLOR_RGB2GRAY)
        estimate, tracked, count, error = estimate_flow(base_gray, gray, features)
        # Per-frame boxes follow the measured optical-flow transform, not animation metadata.
        tracked_boxes = [transform(corners(box_pixels(box)), estimate) for _, box in regions]
        route = transform(ROUTE * [PW, PH], estimate)
        if phase == 0:
            for point in tracked:
                cv2.circle(camera, tuple(np.round(point).astype(int)), 1, SAGE, -1, cv2.LINE_AA)
        shown = 0 if phase == 0 else 3 + int(wet and phase >= 2)
        for n, (name, box) in enumerate(regions[:shown]):
            color = SAGE if n < 3 else (DARK if phase == 3 and level_for(box_pixels(box)) == 3 else TERRA)
            cv2.polylines(camera, [np.round(tracked_boxes[n]).astype(np.int32)], True, color, 2, cv2.LINE_AA)
        if phase >= 2:
            cv2.polylines(camera, [np.round(route).astype(np.int32)], False, (238, 223, 193), 8, cv2.LINE_AA)
            cv2.polylines(camera, [np.round(route).astype(np.int32)], False, SAGE, 2, cv2.LINE_AA)
        image = Image.new("RGB", (W, H), BG)
        image.paste(Image.fromarray(camera), (PX, PY))
        d = ImageDraw.Draw(image)
        d.text((24, 17), "Panoramic", font=font(30, True), fill=INK)
        d.text((202, 31), "Bathroom monitoring", font=font(17), fill=GRAY)
        d.rounded_rectangle((862, 24, 1014, 51), radius=13, fill=(230, 233, 221))
        d.text((880, 28), "PLAYBACK", font=font(14, True), fill=SAGE)
        d.text((24, 68), "BATHROOM 01", font=font(13, True), fill=GRAY)
        d.text((599, 68), "OpenCV feature tracking", font=font(14), fill=GRAY)
        for n, (name, _) in enumerate(regions[:shown]):
            points = tracked_boxes[n]
            color = SAGE if n < 3 else (DARK if phase == 3 else TERRA)
            draw_label(d, (int(points[:, 0].min()) + PX, int(points[:, 1].min()) + PY - 28), name, color)
        sx = 811
        headings = ["Locate features", "Track marked objects", "Compare the route", "Review the warning"]
        d.text((sx, 94), f"0{phase + 1} / 04", font=font(14, True), fill=SAGE)
        y = draw_wrapped(d, headings[phase], (sx, 122), 204, size=23, bold=True)
        d.line((sx, y + 11, 1015, y + 11), fill=(215, 218, 207), width=1)
        text = [
            "Image features tracked across frames.",
            "Named regions are marked at the start. Their boxes follow measured image motion.",
            "Compare the marked area with the walking route.",
            "A route conflict raises a caregiver warning." if wet else "Original photo only. The water edit is pending; no spill alert is claimed.",
        ][phase]
        y = draw_wrapped(d, text, (sx, y + 27), 201, fill=GRAY)
        if wet and phase >= 2:
            level = level_for(box_pixels(args.spill_box))
            label = {1: "L1 / Off route", 2: "L2 / Near route", 3: "L3 / On route"}[level]
            color = {1: TERRA, 2: TERRA, 3: DARK}[level]
            d.rounded_rectangle((sx, y + 17, 1015, y + 57), radius=6, fill=color)
            d.text((sx + 12, y + 26), label, font=font(17, True), fill="white")
            y += 80
            if phase == 3:
                y = draw_wrapped(d, "Caregiver review needed", (sx, y), 200, size=18, bold=True)
                draw_wrapped(d, "Possible water on the marked route. Check the floor before use." if level == 3 else "Check the marked floor area.", (sx, y + 10), 200, fill=GRAY)
        elif not wet and phase >= 2:
            draw_wrapped(d, "Awaiting water edit", (sx, y + 22), 201, fill=TERRA, size=18, bold=True)
        labels = ["Features", "Objects", "Route", "Warning"]
        for n, label in enumerate(labels):
            x = 24 + n * 255
            d.rounded_rectangle((x, PY + PH + 22, x + 234, PY + PH + 26), radius=2, fill=SAGE if n <= phase else (222, 224, 216))
            d.text((x, PY + PH + 34), label, font=font(14, n == phase), fill=INK if n == phase else GRAY)
        d.text((24, PY + PH + 2), "Image-based playback  |  Annotated objects and walking route", font=font(12), fill=GRAY)
        measured.append({"frame": index, "feature_count": count, "median_fit_error_px": error,
            "boxes": {name: points.round(2).tolist() for (name, _), points in zip(regions, tracked_boxes)}})
        frames.append(image)
    stem = "panoramic-bathroom-tracking" if wet else "panoramic-bathroom-preview"
    # One shared palette prevents flicker between photograph frames.
    palette = frames[-1].quantize(colors=192, method=Image.Quantize.MEDIANCUT)
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
        "initial_regions": regions, "sample_route": ROUTE.tolist(), "measurements": measured}
    (out / f"{stem}.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    with Image.open(out / f"{stem}.gif") as check:
        assert check.n_frames == total, (check.n_frames, total)
        assert check.size == (W, H)
    print(json.dumps({"gif": str(out / f"{stem}.gif"), "frames": total,
        "bytes": (out / f"{stem}.gif").stat().st_size,
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
