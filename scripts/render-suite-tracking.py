"""Offline LK tracking of human-marked regions in synthetic camera motion.

Labels, candidate hazards and routes are authored, not inferred by OpenCV.
Box transforms and feature trails come only from measured optical flow.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bathroom_tracking", ROOT / "scripts/render-bathroom-tracking.py")
flow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flow)
cv2, np, Image = flow.cv2, flow.np, flow.Image
WIDTH, FPS, COUNT = 960, 10, 120
AMBER = (0, 165, 255)  # BGR: settled L2 differs from red L3 and yellow review.
RESULT_FRAME = 90
STAGES = [dict(name=name, start=start, end=end) for name,start,end in [
    ("clean",0,10), ("features",10,30), ("regions",30,60),
    ("route",60,90), ("settled",90,120)]]


def stage_at(index):
    return next(s['name'] for s in STAGES if s['start'] <= index < s['end'])


def visible_overlay(index, kinds):
    stage = stage_at(index)
    return dict(features=stage != 'clean', route=stage in ('route','settled'),
        regions=[n for n,kind in enumerate(kinds) if stage in ('route','settled') or (stage == 'regions' and kind == 'object')])
# Normalized x1,y1,x2,y2. Human initialized; no object classifier is used.
SOURCES = [
    dict(suite="A102", zone="Bedroom", source="a102-bedroom.jpg", regions=[
        ("Bed", "object", [.002,.17,.418,.765]),
        ("Wheeled basket", "possible_trip", [.475,.402,.654,.830])],
        route=[[.36,.88],[.50,.89],[.67,.85],[.685,.71],[.74,.68]],
        brief="The wheeled basket is near, but does not cross, the marked bedroom-to-bathroom route. Staff should check clearance and wheel locks and move it farther from the approach if needed. A still cannot establish movement or wheel-lock state."),
    dict(suite="A102", zone="Bathroom", source="a102-bathroom.jpg", regions=[
        ("Toilet", "object", [.084,.50,.194,.943]),
        ("Sink", "object", [.572,.596,.786,.758]),
        ("Shower fixture", "object", [.431,.137,.529,.608])],
        route=[[.47,.99],[.4,.89],[.30,.85],[.23,.83]], brief="Fixture tracking only. No hazard region has been marked; this is not a safety assessment."),
    dict(suite="A103", zone="Bedroom", source="a103-bedroom-google.jpg", regions=[
        ("Bed", "object", [.285,.403,.614,.757]),
        ("Cabinet", "object", [.585,.454,.693,.724]),
        ("Curled rug", "possible_trip", [.365,.655,.652,.892])],
        route=[[.35,.89],[.51,.82],[.69,.77],[.79,.74]],
        brief="Review the curled rug on the bedroom approach. Staff should inspect and flatten or remove the rug before the resident uses this route."),
    dict(suite="A103", zone="Bathroom", source="a103-bathroom-google.jpg", regions=[
        ("Toilet", "object", [.265,.38,.423,.689]),
        ("Sink", "object", [.039,.483,.245,.720]),
        ("Floor towel", "possible_trip", [.462,.632,.578,.746])],
        route=[[.60,.96],[.43,.81],[.43,.70],[.44,.59]],
        brief="The floor towel is near the marked bathroom route, not crossing it. Staff should remove the towel and inspect the nearby floor before the resident uses this area."),
    dict(suite="A104", zone="Bedroom", source="a104-bedroom-google.jpg", regions=[
        ("Bed", "object", [.436,.423,.885,.877]),
        ("Chair", "object", [.669,.299,.799,.477]),
        ("Bedside cabinet", "object", [.768,.591,.999,.974])],
        route=[[.55,.91],[.40,.82],[.23,.72],[.17,.62]], brief="Fixture tracking only. No hazard region has been marked; this is not a safety assessment."),
    dict(suite="A101", zone="Bedroom", source="a101-bedroom-google.jpg", regions=[
        ("Bed", "object", [.202,.404,.579,.837]),
        ("Chair", "object", [.534,.30,.661,.531]),
        ("Wheeled overbed table", "possible_trip", [.55,.495,.651,.869])],
        route=[[.44,.90],[.59,.86],[.66,.77],[.74,.67]],
        brief="Review the wheeled overbed table beside the bed-to-bathroom route. Staff should check clearance and wheel locks. A still image cannot establish whether the table is moving."),
    dict(suite="A104", zone="Bathroom", source="a104-bathroom-google.jpg", regions=[
        ("Toilet", "object", [.137,.363,.312,.789]),
        ("Sink", "object", [.325,.274,.462,.477]),
        ("Shower seat", "object", [.603,.249,.708,.447]),
        ("Shower fixture", "object", [.792,.001,.944,.460])],
        route=[[.50,.97],[.45,.80],[.40,.67],[.39,.56]],
        brief="Dry bathroom fixture tracking only. No water or hazard region has been marked. This is not a safety assessment or cleanup verification."),
]


def fit(reference, current, features):
    if features is None or len(features) < 8:
        raise ValueError("Too few initial features; tracking is unavailable")
    matrix, points, ids, count, error = flow.estimate_flow(reference, current, features)
    # Features can leave the visible image during camera motion; do not report
    # off-screen coordinates as active tracks or give them ROI support credit.
    visible = (points[:, 0] >= 0) & (points[:, 0] <= current.shape[1]-1) & (points[:, 1] >= 0) & (points[:, 1] <= current.shape[0]-1)
    points, ids = points[visible], ids[visible]
    count = len(points)
    if count < 30 or not np.isfinite(error) or error > .8:
        raise ValueError("Unreliable tracking; refusing an assessment")
    return matrix, points, ids, count, error


def level(box, route):
    x1, y1 = box.min(axis=0)
    x2, y2 = box.max(axis=0)
    for margin, priority in [(0, "crossing"), (WIDTH*.04, "near")]:
        rect = (round(x1-margin), round(y1-margin), max(1, round(x2-x1+2*margin)), max(1, round(y2-y1+2*margin)))
        if any(cv2.clipLine(rect, tuple(a), tuple(b))[0] for a,b in zip(route,route[1:])):
            return priority
    return "away"


def render(config, out):
    stem = f"{config['suite'].lower()}-{config['zone'].lower()}-tracking"
    path = ROOT / "public/demo" / config["source"]
    source = cv2.imread(str(path))
    if source is None:
        raise ValueError(f"Missing image: {path.name}")
    height = round(WIDTH * source.shape[0] / source.shape[1])
    base = cv2.resize(source, (WIDTH,height), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY)
    features = cv2.goodFeaturesToTrack(gray, maxCorners=220, qualityLevel=.008, minDistance=6)
    frames, measurements, trails = [], [], {}
    flow.PW, flow.PH = WIDTH,height
    for index in range(COUNT):
        stage = stage_at(index)
        visible = visible_overlay(index, [kind for _,kind,_ in config['regions']])
        # Stop camera motion once the settled result appears; hold it for 3s.
        angle = 2*math.pi*min(index,RESULT_FRAME)/RESULT_FRAME
        # This matrix generates test footage. It is NOT passed to the tracker.
        generated = cv2.getRotationMatrix2D((WIDTH/2,height/2), .12*math.sin(angle), 1.012)
        generated[:,2] += [3*math.sin(angle), 2*math.cos(angle)]
        camera = cv2.warpAffine(base, generated, (WIDTH,height), borderMode=cv2.BORDER_REFLECT_101)
        measured, points, ids, count, error = fit(gray, cv2.cvtColor(camera,cv2.COLOR_BGR2GRAY), features)
        route = flow.transform(np.array(config["route"])*[WIDTH,height],measured)
        regions = []
        polygons = []
        for n,(label,kind,box) in enumerate(config["regions"]):
            polygon = flow.transform(flow.corners(np.array(box)*[WIDTH,height,WIDTH,height]),measured)
            support = sum(cv2.pointPolygonTest(polygon,tuple(map(float,p)),False)>=0 for p in points)
            if support < 3:
                raise ValueError(f"{stem}: insufficient measured features for {label}: {support}")
            lo,hi = polygon.min(axis=0),polygon.max(axis=0)
            normalized = np.clip(np.round(np.array([lo[1]/height,lo[0]/WIDTH,hi[1]/height,hi[0]/WIDTH])*1000),0,1000).astype(int).tolist()
            regions.append(dict(id=f"{stem}-r{n+1}",label=label,kind=kind,box=normalized,support=int(support),priority=level(polygon,np.round(route).astype(int)) if kind!="object" else "unassessed"))
            polygons.append(polygon)
        raw = camera.copy()
        for point, feature_id in zip(points,ids):
            trail = trails.setdefault(int(feature_id),[])
            if trail and trail[-1][0]!=index-1:
                trail.clear()
            trail.append((index,tuple(np.round(point).astype(int))))
            del trail[:-12]
            if not visible['features'] or not any(cv2.pointPolygonTest(p,tuple(map(float,point)),False)>=0 for p in polygons):
                continue
            color = flow.FEATURE_COLORS[int(feature_id)%len(flow.FEATURE_COLORS)]
            if len(trail)>1:
                cv2.polylines(camera,[np.array([p for _,p in trail],np.int32)],False,color,1,cv2.LINE_AA)
            cv2.circle(camera,trail[-1][1],2,color,-1,cv2.LINE_AA)
        if visible['route']:
            cv2.polylines(camera,[np.round(route).astype(np.int32)],False,flow.CYAN,2,cv2.LINE_AA)
        for n,(region,polygon) in enumerate(zip(regions,polygons)):
            if n in visible['regions']:
                color = flow.GREEN if region['kind']=='object' else (flow.RED if region['priority']=='crossing' else AMBER) if stage == 'settled' else flow.YELLOW
                flow.draw_box(camera,polygon,f"ID {n+1:02d}  {region['label'].lower()}",color)
        canvas = cv2.copyMakeBorder(camera,36,54,0,0,cv2.BORDER_CONSTANT,value=flow.BG)
        flow.cv_text(canvas,f"{config['suite']} / {config['zone'].upper()}  |  OpenCV LK FEATURE TRACKING",(12,24),scale=.53)
        hazards = [r for r in regions if r['kind']!='object']
        priority = max(hazards,key=lambda r: {"away":1,"near":2,"crossing":3}[r['priority']])['priority'] if hazards else "unassessed"
        status = {"crossing":"L3 / MARKED REGION CROSSES ROUTE","near":"L2 / MARKED REGION NEAR ROUTE","away":"L1 / MARKED REGION OFF ROUTE","unassessed":"FIXTURE TRACKING / NO HAZARD ANNOTATION"}[priority]
        phase_label = dict(clean="SOURCE FRAME / NO OVERLAYS",features="MEASURING FEATURE TRACKS",regions="TRACKING FIXTURE REGIONS",route="REVIEWING MARKED ROUTE",settled=status)[stage]
        result_color = flow.RED if priority == 'crossing' else AMBER if hazards else flow.GREEN
        flow.cv_text(canvas,phase_label,(12,height+58),result_color if stage == 'settled' else flow.GREEN,.45)
        flow.cv_text(canvas,f"{count} tracks | frame {index+1:02d}/{COUNT} | fit {error:.3f}px",(610,height+58),scale=.42)
        flow.cv_text(canvas,"Synthetic camera motion | Human-marked labels + route | Not live detection",(12,height+78),(210,210,210),.40)
        frames.append(Image.fromarray(cv2.cvtColor(canvas,cv2.COLOR_BGR2RGB)))
        measurements.append(dict(frame=index,stage=stage,feature_count=count,median_fit_error_px=round(error,5),
            regions=regions,route=np.clip(np.round(route/[WIDTH,height]*1000),0,1000).astype(int).tolist(),
            features=[[int(fid),round(float(p[0]),2),round(float(p[1]),2)] for fid,p in zip(ids,points)]))
        if index == COUNT-1:
            cv2.imwrite(str(out/f"{stem}-reference.jpg"),raw,[cv2.IMWRITE_JPEG_QUALITY,94])
    photo = Image.fromarray(cv2.cvtColor(base,cv2.COLOR_BGR2RGB)).quantize(colors=240).getpalette()[:720]
    colors = [flow.BLACK,flow.WHITE,flow.GREEN,flow.YELLOW,flow.RED,flow.CYAN,flow.BG,AMBER,*flow.FEATURE_COLORS]
    palette = Image.new("P",(1,1))
    palette.putpalette((photo+[v for color in colors for v in reversed(color)]+[0]*768)[:768])
    encoded = [frame.quantize(palette=palette,dither=Image.Dither.NONE) for frame in frames]
    encoded[0].save(out/f"{stem}.gif",save_all=True,append_images=encoded[1:],loop=0,duration=1000//FPS,disposal=1,optimize=True)
    frames[-1].save(out/f"{stem}-poster.jpg",quality=94)
    manifest = dict(version=2,suite=config['suite'],zone=config['zone'],source=f"/demo/{path.name}",source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        opencv_version=cv2.__version__,method="goodFeaturesToTrack; pyramidal LK; forward/backward filter; RANSAC affine; propagated human ROIs",
        warning="Synthetic camera motion from one still. Labels and route are human-marked; tracking is measured, not semantic detection or independent object motion.",
        brief=config['brief'],fps=FPS,width=WIDTH,height=height+90,image_height=height,frames=COUNT,
        cycle=dict(loop=True,result_frame=RESULT_FRAME,stages=STAGES),
        gif=f"/demo/{stem}.gif",poster=f"/demo/{stem}-poster.jpg",reference=f"/demo/{stem}-reference.jpg",measurements=measurements)
    (out/f"{stem}.json").write_text(json.dumps(manifest,separators=(',',':')),encoding='utf-8')
    with Image.open(out/f"{stem}.gif") as check:
        assert check.n_frames==COUNT and check.size==(WIDTH,height+90)
        assert check.info['loop'] == 0
        for index in range(COUNT):
            check.seek(index)
            assert check.info['duration']==1000//FPS
        # Verify encoded clean-start and settled-result overlays, not just metadata.
        for index, expected in [(0,False),(RESULT_FRAME,True),(COUNT-1,True)]:
            check.seek(index)
            pixels = np.asarray(check.convert('RGB'))[36:height+36]
            bright_green = int(np.all(pixels == (0,255,0),axis=2).sum())
            assert (bright_green > 200) == expected, (stem,index,bright_green)
    print(json.dumps(dict(source=stem,frames=COUNT,min_tracks=min(m['feature_count'] for m in measurements),max_error=max(m['median_fit_error_px'] for m in measurements),regions=[(r['label'],r['priority'],r['support']) for r in measurements[-1]['regions']])))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,default=ROOT/'public/demo')
    parser.add_argument('--suite',choices=sorted({s['suite'] for s in SOURCES}),help='Render only this suite; leave other assets untouched')
    parser.add_argument('--zone',choices=['bedroom','bathroom'],help='Render only this zone; may be combined with --suite')
    args = parser.parse_args()
    args.out.mkdir(parents=True,exist_ok=True)
    for config in SOURCES:
        if (args.suite is None or config['suite'] == args.suite) and (args.zone is None or config['zone'].lower() == args.zone):
            render(config,args.out)
