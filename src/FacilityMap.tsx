import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Focus, Layers, Minus, Plus, RotateCcw } from "lucide-react";
import { suiteIds, type SpaceId, type SuiteId } from "./facility";
import { routeLevels, type RoutePriority } from './routeRisk';
import { suiteOverlayCenter, suiteOverlaySize, suiteOverlayStyle } from "./floorPresentation";

type Props = { selected: SpaceId | null; alert: boolean; roomPriorities?: Record<string,RoutePriority>; showRoute: boolean; onSelect: (id: SpaceId) => void; active: boolean };
type MapControls = { view: (plan: boolean) => void; zoom: (factor: number) => void; focus: (id: SpaceId | null) => void; reset: () => void; resize: () => void; update: (props: Props) => void };
const positions = [[0, -8.5, 0], [5, -8.5, 0], [4.5, 8.5, Math.PI], [9.5, 8.5, Math.PI]];

export default function FacilityMap(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const suiteLabels = useRef<Partial<Record<SuiteId, HTMLButtonElement>>>({});
  const runtime = useRef<MapControls | null>(null);
  const callback = useRef(props.onSelect); callback.current = props.onSelect;
  const [plan, setPlan] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor("#f6f5f1");
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute("aria-label", "Interactive care-center floor. Select rooms using the room list, or drag to rotate and scroll to zoom.");
    renderer.domElement.setAttribute("role", "img");
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 150);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2.25;
    controls.minDistance = 9; controls.maxDistance = 65;
    controls.enableDamping = false;
    controls.target.set(7, 0, 0);
    camera.position.set(20.44, 22.68, 24.36);
    controls.update();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb4b1a4, 1.8));
    const sun = new THREE.DirectionalLight(0xfffaf0, 2.0);
    sun.position.set(-8, 25, 12); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22 });
    sun.shadow.bias = -0.001;
    scene.add(sun);
    const pickable: THREE.Object3D[] = [];
    const roomGroups = new Map<SpaceId, THREE.Group>();
    const roomFloors = new Map<SpaceId, THREE.MeshStandardMaterial>();
    const roomOverlays = new Map<SuiteId, THREE.MeshBasicMaterial>();
    const outlines = new Map<SpaceId, THREE.LineBasicMaterial>();
    let bathFloor: THREE.MeshStandardMaterial;
    const box = (parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, color: string, room?: SpaceId) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: .87 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
      mesh.castShadow = h > .1; mesh.receiveShadow = true;
      if (room) { mesh.userData.room = room; pickable.push(mesh); }
      parent.add(mesh); return mesh;
    };
    const cylinder = (parent: THREE.Object3D, x: number, y: number, z: number, r: number, h: number, color: string) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), new THREE.MeshStandardMaterial({ color, roughness: .8 }));
      mesh.position.set(x, y + h / 2, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    const label = (parent: THREE.Object3D, text: string, x: number, z: number, width = 1.8, color = "#354744") => {
      const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 96;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "rgba(255,253,248,.96)"; ctx.beginPath(); ctx.roundRect(0, 0, 512, 96, 20); ctx.fill();
      ctx.fillStyle = color; ctx.font = "600 45px Segoe UI, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 256, 50);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
      sprite.position.set(x, 1.02, z); sprite.scale.set(width, width * 96 / 512, 1); sprite.renderOrder = 5;
      parent.add(sprite);
    };
    const plant = (parent: THREE.Object3D, x: number, z: number) => {
      cylinder(parent, x, .03, z, .18, .32, "#9d8670");
      const crown = new THREE.Mesh(new THREE.SphereGeometry(.3, 12, 12), new THREE.MeshStandardMaterial({ color: "#829276" }));
      crown.scale.set(.85, 1.15, .85); crown.position.set(x, .65, z); parent.add(crown);
    };
    box(scene, -.24, -.30, -8.75, 16.55, .26, 17.5, "#dbded5");
    box(scene, 0, -.015, -1.2, 16, .04, 2.4, "#eee7d8");
    // Repeated suites retain the supplied plan's spatial relationships; south suites rotate to meet the corridor.
    suiteIds.forEach((id, index) => {
      const group = new THREE.Group(); const [x, z, yaw] = positions[index];
      group.position.set(x, 0, z); group.rotation.y = yaw; group.userData.room = id;
      scene.add(group); roomGroups.set(id, group);
      const floor = box(group, 0, 0, 0, 4.5, .08, 7.3, "#d1c0a6", id);
      roomFloors.set(id, floor.material);
      box(group, -.08, .06, -.08, 4.66, .82, .14, "#e7e6df", id);
      box(group, -.08, .06, 0, .14, .72, 7.38, "#e7e6df", id);
      box(group, 4.44, .06, 0, .14, .72, 7.38, "#e7e6df", id);
      box(group, 0, .06, 7.22, 1.22, .5, .14, "#e7e6df", id);
      box(group, 2.25, .06, 7.22, 2.25, .5, .14, "#e7e6df", id);
      box(group, .75, .34, -.081, 2.9, .41, .15, "#c8dcdf", id);
      // Bed at the window end, desk and TV left, kitchenette toward entry.
      box(group, 2.38, .08, 1.06, 1.9, .27, 2.43, "#82735e", id);
      box(group, 2.4, .35, 1.12, 1.86, .22, 2.36, "#fbf9f0", id);
      box(group, 2.4, .57, 1.94, 1.86, .05, 1.53, "#bdcab7", id);
      box(group, 2.50, .57, 1.27, .73, .12, .43, "#fffdf8", id);
      box(group, 3.42, .57, 1.27, .73, .12, .43, "#fffdf8", id);
      box(group, 3.83, .08, .30, .50, .49, .55, "#8d7862", id);
      box(group, .18, .08, .53, .68, .52, 1.5, "#927c63", id);
      box(group, .85, .08, 1.02, .50, .38, .62, "#9da79a", id);
      box(group, .20, .08, 2.5, .49, .48, 1.32, "#89715a", id);
      box(group, .24, .56, 2.65, .09, .55, 1.0, "#344b4b", id);
      box(group, .18, .08, 4.1, .70, .69, 1.78, "#ae9a7e", id);
      box(group, .16, .77, 4.08, .76, .07, 1.83, "#f2f0e8", id);
      cylinder(group, .52, .84, 4.66, .2, .025, "#9ba9a5");
      // Closet between bedroom and bathroom; bathroom lower-right, entry lower-middle.
      box(group, 2.47, .08, 4.08, 1.91, .58, .67, "#b9aa95", id);
      box(group, .16, .08, 6.22, .96, .63, .89, "#b9aa95", id);
      const bath = box(group, 2.47, .083, 4.88, 1.9, .025, 2.23, "#bec7c1", id);
      if (id === "A101") bathFloor = bath.material;
      box(group, 2.43, .1, 4.82, 2.02, .50, .1, "#e8e6df", id);
      box(group, 2.43, .1, 4.82, .10, .48, 1.2, "#e8e6df", id);
      box(group, 2.43, .1, 6.86, .10, .48, .33, "#e8e6df", id);
      box(group, 2.61, .11, 4.97, 1.61, .035, .74, "#f7f9f2", id);
      box(group, 2.61, .14, 5.69, 1.61, .22, .03, "#dae6e2", id);
      const toilet = cylinder(group, 3.87, .13, 6.61, .22, .35, "#f7f7ef"); toilet.scale.z = 1.35;
      box(group, 2.69, .12, 6.68, .49, .40, .32, "#f0f1e8", id);
      plant(group, 1.78, .47);
      // Translucent suite-sized layer: keep furniture visible, with a clear room boundary.
      const overlayStyle = suiteOverlayStyle(undefined, false);
      const overlayMaterial = new THREE.MeshBasicMaterial({
        color: overlayStyle.color, transparent: true, opacity: overlayStyle.opacity,
        side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
      });
      const overlay = new THREE.Mesh(new THREE.PlaneGeometry(suiteOverlaySize.width, suiteOverlaySize.depth), overlayMaterial);
      overlay.rotation.x = -Math.PI / 2;
      overlay.position.set(suiteOverlayCenter.x, suiteOverlaySize.height, suiteOverlayCenter.z);
      overlay.renderOrder = 2;
      overlay.userData.room = id;
      group.add(overlay); pickable.push(overlay); roomOverlays.set(id, overlayMaterial);
      const edgeMat = new THREE.LineBasicMaterial({ color: overlayStyle.border, transparent: true, opacity: 0.9 });
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(overlay.geometry), edgeMat);
      edge.position.copy(overlay.position); edge.rotation.copy(overlay.rotation); edge.renderOrder = 3;
      group.add(edge); outlines.set(id, edgeMat);
    });
    // A dedicated staff supervision room, connected to the central corridor.
    const station = new THREE.Group(); station.position.set(10.5, 0, -4); station.userData.room = "supervision";
    roomGroups.set("supervision", station); scene.add(station);
    const staffFloor = box(station, 0, .02, 0, 5.5, .08, 8, "#bdd1d2", "supervision"); roomFloors.set("supervision", staffFloor.material);
    box(station, 0, .10, 0, 5.5, .76, .13, "#dde5e2", "supervision");
    box(station, 5.37, .10, 0, .13, .76, 8, "#dde5e2", "supervision");
    box(station, 0, .10, 7.87, 5.5, .76, .13, "#dde5e2", "supervision");
    box(station, 0, .10, 0, .13, .62, 2.9, "#dde5e2", "supervision");
    box(station, 0, .10, 5.1, .13, .62, 2.9, "#dde5e2", "supervision");
    [1.15, 3.20].forEach(x => {
      box(station, x, .10, 1.35, 1.57, .67, .77, "#e5e2d7", "supervision");
      box(station, x + .32, .77, 1.49, .80, .48, .06, "#344f55", "supervision");
      box(station, x + .38, .79, 1.63, .63, .03, .20, "#748d8e", "supervision");
      cylinder(station, x + .8, .12, 2.56, .30, .43, "#657f7d");
    });
    box(station, 1.25, .10, 5.80, 3.06, .67, .8, "#e5e2d7", "supervision");
    [1.65, 2.8, 3.85].forEach(x => cylinder(station, x, .1, 5.30, .22, .4, "#829995"));
    box(station, 4.7, .12, 3.5, .51, .85, 1.4, "#a6b7b2", "supervision");
    plant(station, .68, .56); plant(station, 4.80, 7.25);
    label(station, "SUPERVISION", 2.76, 4.03, 3.6, "#365c68");
    label(station, "Caregivers + nurses", 2.76, 5.08, 3.1, "#526d74");
    label(scene, "CENTRAL CORRIDOR", 5.8, .03, 3.5, "#7a7467");
    const linePoints = [new THREE.Vector3(1.70, .15, 7.45), new THREE.Vector3(1.70, .15, 6.2), new THREE.Vector3(2.05, .15, 6.2), new THREE.Vector3(3.45, .15, 6.2)];
    const walkingLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePoints), new THREE.LineDashedMaterial({ color: "#652b26", dashSize: .17, gapSize: .12 }));
    walkingLine.computeLineDistances(); roomGroups.get("A101")!.add(walkingLine);
    const hazard = cylinder(roomGroups.get("A101")!, 3.36, .12, 6.15, .48, .024, "#994a38"); hazard.scale.z = .62;
    const labelAnchor = new THREE.Vector3();
    const render = () => {
      renderer.render(scene, camera);
      // Project DOM labels each time the camera moves so numbers stay legible at every zoom.
      const width = container.clientWidth, height = container.clientHeight;
      suiteIds.forEach(id => {
        const element = suiteLabels.current[id], group = roomGroups.get(id);
        if (!element || !group) return;
        labelAnchor.set(suiteOverlayCenter.x, suiteOverlaySize.height + 0.03, suiteOverlayCenter.z);
        group.localToWorld(labelAnchor).project(camera);
        const visible = labelAnchor.z >= -1 && labelAnchor.z <= 1 && Math.abs(labelAnchor.x) < 1 && Math.abs(labelAnchor.y) < 1;
        element.style.visibility = visible ? "visible" : "hidden";
        // Center with layout coordinates, not a transform that button press styles can replace.
        element.style.left = `${(labelAnchor.x + 1) * width / 2 - element.offsetWidth / 2}px`;
        element.style.top = `${(1 - labelAnchor.y) * height / 2 - element.offsetHeight / 2}px`;
      });
    };
    let viewportFit = 1;
    const resize = () => {
      const { width, height } = container.getBoundingClientRect(); if (!width || !height) return;
      renderer.setSize(width, height, false); camera.aspect = width / height;
      const nextFit = Math.max(1, 1.15 / camera.aspect);
      camera.position.sub(controls.target).multiplyScalar(nextFit / viewportFit).add(controls.target);
      viewportFit = nextFit; camera.updateProjectionMatrix(); controls.update(); render();
    };
    const observer = new ResizeObserver(resize); observer.observe(container);
    controls.addEventListener("change", render);
    let down = [0, 0];
    const pointerDown = (event: PointerEvent) => { down = [event.clientX, event.clientY]; };
    const pointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 6) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), camera);
      const hit = ray.intersectObjects(pickable, false)[0];
      if (hit) callback.current(hit.object.userData.room as SpaceId);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    const reset = () => { controls.target.set(7, 0, 0); camera.position.set(20.44, 22.68, 24.36).sub(controls.target).multiplyScalar(viewportFit).add(controls.target); controls.enableRotate = true; controls.update(); render(); };
    runtime.current = {
      view: planView => { controls.target.set(7, 0, 0); camera.position.set(planView ? 7 : 20.44, planView ? 34 : 22.68, planView ? .01 : 24.36).sub(controls.target).multiplyScalar(viewportFit).add(controls.target); controls.enableRotate = !planView; controls.update(); render(); },
      zoom: factor => { camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target); controls.update(); render(); },
      focus: id => { if (!id) return; const g = roomGroups.get(id)!; const center = g.localToWorld(new THREE.Vector3(id === "supervision" ? 2.75 : 2.25, 0, id === "supervision" ? 4 : 3.65)); const offset = camera.position.clone().sub(controls.target).normalize().multiplyScalar(17); controls.target.copy(center); camera.position.copy(center).add(offset); controls.update(); render(); },
      reset,
      resize,
      update: p => {
        roomFloors.forEach((mat, id) => { const priority=p.roomPriorities?.[id]; mat.color.set(id === "supervision" ? "#bdd1d2" : priority ? routeLevels[priority].color : id === "A101" && p.alert ? "#e5c9b5" : "#d1c0a6"); mat.emissive.set(id === p.selected ? "#334636" : "#000000"); mat.emissiveIntensity = .12; });
        roomOverlays.forEach((mat, id) => {
          const style = suiteOverlayStyle(p.roomPriorities?.[id] ?? (id === "A101" && p.alert ? "crossing" : undefined), id === p.selected);
          mat.color.set(style.color); mat.opacity = style.opacity;
          outlines.get(id)?.color.set(style.border);
        });
        bathFloor.color.set(p.alert ? "#994a38" : "#bec7c1"); hazard.visible = p.alert; walkingLine.visible = p.alert && p.showRoute;
        // Selecting a room only updates its styling, never the camera or viewport.
        render();
      },
    };
    runtime.current.update(props); resize();
    return () => {
      runtime.current = null; observer.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown); renderer.domElement.removeEventListener("pointerup", pointerUp);
      scene.traverse(obj => { const object = obj as THREE.Mesh; object.geometry?.dispose(); const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : []; materials.forEach(mat => { const mapped = mat as THREE.MeshStandardMaterial; mapped.map?.dispose(); mat.dispose(); }); });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  useEffect(() => { runtime.current?.update(props); }, [props.selected, props.alert, props.showRoute, props.active, props.roomPriorities]);
  useEffect(() => { if (props.active) runtime.current?.resize(); }, [props.active]);
  return <div className="facility-map-wrap">
    <div ref={host} className="facility-map-canvas" />
    <div className="map-suite-labels" role="group" aria-label="Suite numbers">
      {suiteIds.map(id => <button key={id} ref={element => { if (element) suiteLabels.current[id] = element; else delete suiteLabels.current[id]; }}
        className="map-suite-label" aria-label={`Select suite ${id}`} aria-pressed={props.selected === id}
        onClick={() => props.onSelect(id)}>{id}</button>)}
    </div>
    {failed && <p className="map-fallback" role="status">3D is unavailable in this browser. Select a room from the list to view its monitoring and response details.</p>}
    <div className="map-controls" aria-label="Resident Floor controls">
      <button onClick={() => { setPlan(!plan); runtime.current?.view(!plan); }} aria-pressed={plan}><Layers size={15} />{plan ? "3D view" : "Floor plan"}</button>
      <button aria-label="Zoom in" onClick={() => runtime.current?.zoom(.84)}><Plus size={16} /></button>
      <button aria-label="Zoom out" onClick={() => runtime.current?.zoom(1.18)}><Minus size={16} /></button>
      <button aria-label="Focus selected room" disabled={!props.selected} onClick={() => runtime.current?.focus(props.selected)}><Focus size={16} /></button>
      <button aria-label="Reset map view" onClick={() => { setPlan(false); runtime.current?.reset(); }}><RotateCcw size={16} /></button>
    </div>
    <span className="map-hint">Drag to rotate · scroll to zoom · select a room</span>
  </div>;
}
