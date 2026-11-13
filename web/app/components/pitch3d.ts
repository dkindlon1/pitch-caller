// The hero's 3D pitch: a seamed baseball thrown from a right-hander's release point into the 3x3 zone, seen from behind
// the plate, the way the app draws the zone (screen left is a right-handed hitter's side). Each pitch of the at-bat
// leaves its flight path behind, so the whole sequence shows as ball trails. The path is the flight the engine's own
// movement model gives (app/engine.js SHAPES: fastball ride, slider tight, changeup fade) with gravity, between the
// release point and the called spot. Loaded only after the page is up, and only with WebGL and without reduced motion.
import * as THREE from "three";

export type StagePitch = { kind: "FB" | "SI" | "FC" | "SL" | "CB" | "CH"; velo: number; cell: [number, number] | "chase"; color: string };

const FT = 1;                                    // world units are feet
const PLATE_HALF = 17 / 24;                      // half the plate: 8.5 in
const ZONE = { lo: 1.6, hi: 3.4 };
// Worked out in screen terms (x to the catcher's right) and mirrored into the world at the end, since a camera looking
// toward the mound has world +x on its left. A right-hander's arm is on the catcher's left.
const RELEASE = { x: -1.9, y: 5.8, z: 54 };
const MOVE: Record<StagePitch["kind"], [number, number]> = { FB: [18, 8], SI: [9, 15], FC: [12, -3], SL: [3, -5], CB: [-10, -7], CH: [7, 15] };   // inches: up, arm side
const G = 32.17;
const W = (2 * PLATE_HALF) / 3, H = (ZONE.hi - ZONE.lo) / 3;

// where the called spot is, in screen terms: the cell's center, or off the plate low and away from a right-handed hitter
function target(cell: StagePitch["cell"]): { x: number; y: number } {
  if (cell === "chase") return { x: PLATE_HALF + 0.4, y: ZONE.lo - 0.45 };
  const [c, r] = cell;
  return { x: -PLATE_HALF + (c + 0.5) * W, y: ZONE.hi - (r + 0.5) * H };
}
const world = (x: number, y: number, z: number) => new THREE.Vector3(-x, y, z);

// the flight: a straight line from release to the spot, bent by the pitch's movement and gravity over its flight time
// (with both ends fixed, constant acceleration a gives line + a/2 * (u^2 - u) * t^2). Arm side is to the catcher's left.
function flight(p: StagePitch): THREE.Vector3[] {
  const R = RELEASE, T = target(p.cell), t = 54 / (p.velo * 1.4667) * 1.06;
  const [up, arm] = MOVE[p.kind];
  const ax = (2 * (-arm / 12)) / (t * t), ay = (2 * (up / 12)) / (t * t) - G;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 60; i++) {
    const u = i / 60, k = 0.5 * (u * u - u) * t * t;
    pts.push(world(R.x + (T.x - R.x) * u + ax * k, R.y + (T.y - R.y) * u + ay * k, R.z * (1 - u)));
  }
  return pts;
}

// a baseball's seam: the curve on the sphere that splits it into two figure-eights, with stitches across it
function ball(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.55, metalness: 0 })));
  const k = 0.2, seam = (t: number) => new THREE.Vector3((1 - k) * Math.cos(t) + k * Math.cos(3 * t), (1 - k) * Math.sin(t) - k * Math.sin(3 * t), 2 * Math.sqrt(k - k * k) * Math.sin(2 * t));
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 160 }, (_, i) => seam((i / 160) * Math.PI * 2).multiplyScalar(1.004)), true);
  const red = new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.6 });
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 240, 0.018, 5, true), red));
  const st: number[] = [];
  for (let i = 0; i < 108; i++) {
    const t = (i / 108) * Math.PI * 2, p = seam(t), tan = seam(t + 0.001).sub(p).normalize(), side = new THREE.Vector3().crossVectors(tan, p).normalize();
    for (const s of [1, -1]) {
      const a = p.clone().add(side.clone().multiplyScalar(0.075 * s)).add(tan.clone().multiplyScalar(-0.03)).normalize().multiplyScalar(1.01);
      const b = p.clone().add(tan.clone().multiplyScalar(0.03)).normalize().multiplyScalar(1.01);
      st.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.Float32BufferAttribute(st, 3));
  g.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xd4343c })));
  g.scale.setScalar(0.121 * FT);   // 1.45 in radius
  return g;
}

export type Scene = { play: (pitches: StagePitch[], current: number) => void; dispose: () => void };

export function mount(el: HTMLElement): Scene | null {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); } catch { return null; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  // the catcher's eyes, 8.5 ft behind the front of the plate, looking at the middle of the zone. The canvas is half
  // again as big as the flat zone it replaces (globals.css, .stage-3d) and the field of view puts the 3D zone where the
  // flat one was drawn, at 210 of its 250 units tall, so the swap doesn't jump; the extra room shows a chase pitch.
  const camera = new THREE.PerspectiveCamera((2 * Math.atan(((ZONE.hi - ZONE.lo) * (1.5 * 250 / 210)) / 2 / 8.5) * 180) / Math.PI, 1, 0.1, 200);
  camera.position.set(0, 2.75, -8.5);
  camera.lookAt(0, (ZONE.lo + ZONE.hi) / 2, 0);
  scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x0b0e12, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-4, 10, -6); scene.add(sun);

  // the zone at the plate: its edge and the 3x3 grid, and the plate itself on the ground
  const zl: number[] = [];
  for (let i = 0; i <= 3; i++) { const x = -PLATE_HALF + i * W; zl.push(x, ZONE.lo, 0, x, ZONE.hi, 0); const y = ZONE.lo + i * H; zl.push(-PLATE_HALF, y, 0, PLATE_HALF, y, 0); }
  const zg = new THREE.BufferGeometry(); zg.setAttribute("position", new THREE.Float32BufferAttribute(zl, 3));
  scene.add(new THREE.LineSegments(zg, new THREE.LineBasicMaterial({ color: 0xf3f6f9, transparent: true, opacity: 0.32 })));
  const plate = new THREE.Shape([[-PLATE_HALF, 0], [PLATE_HALF, 0], [PLATE_HALF, 0.71], [0, 1.42], [-PLATE_HALF, 0.71]].map(([x, z]) => new THREE.Vector2(x, z)));
  const pm = new THREE.Mesh(new THREE.ShapeGeometry(plate), new THREE.MeshBasicMaterial({ color: 0x26303b, side: THREE.DoubleSide }));
  pm.rotation.x = Math.PI / 2; pm.position.set(0, 0.01, 0); scene.add(pm);

  const b = ball(); scene.add(b);
  const trails = new THREE.Group(); scene.add(trails);
  // the called spot: a ring in the pitch's color, as the app marks it
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.24, 40), ringMat); scene.add(ring);
  let path: THREE.Vector3[] = [], t0 = 0, kind: StagePitch["kind"] = "FB", raf = 0, visible = true, flying = false, color = "#ff5a4e";
  ring.visible = false;
  const DUR = 1150;
  let frames = 0;

  function size() {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(size); ro.observe(el); size();

  // a pitch's path as a tube (WebGL draws lines one pixel wide), thicker toward the plate by perspective
  const SEG = 60, RAD = 6, PER = RAD * 6;
  function trail(pts: THREE.Vector3[], col: string, opacity: number) {
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), SEG, 0.03, RAD, false);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity, depthWrite: false }));
  }

  function frame(now: number) {
    raf = 0;
    if (!visible) return;
    if (flying) {
      // the frame time can be a little before play() was called
      const u = Math.max(0, Math.min(1, (now - t0) / DUR)), i = u * (path.length - 1), a = Math.floor(i), f = i - a;
      const p = path[Math.min(a, path.length - 1)].clone().lerp(path[Math.min(a + 1, path.length - 1)], f);
      b.position.copy(p);
      // backspin on a fastball, sidespin on a slider, arm-side tilt on a changeup
      const spin = (now - t0) * 0.03;
      if (kind === "FB") b.rotation.set(-spin, 0, 0.2); else if (kind === "SL") b.rotation.set(0, spin, 0.9); else b.rotation.set(-spin * 0.7, 0, -0.6);
      const live = trails.children[trails.children.length - 1] as THREE.Mesh | undefined;
      if (live) live.geometry.setDrawRange(0, Math.max(1, Math.round(u * SEG)) * PER);
      if (u >= 1) flying = false;
    }
    renderer.render(scene, camera);
    el.dataset.frames = String(++frames);   // for the site's end-to-end test: frames drawn so far
    if (flying) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); });
  io.observe(el);
  const onVis = () => { visible = document.visibilityState === "visible"; if (visible) kick(); };
  document.addEventListener("visibilitychange", onVis);

  return {
    play(pitches, current) {
      // the at-bat so far: earlier flights as faint trails, this one drawn as the ball flies
      for (const c of trails.children) { const m = c as THREE.Mesh; m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
      trails.clear();
      pitches.slice(0, current).forEach((p, i) => trails.add(trail(flight(p), p.color, 0.22 + 0.08 * i)));
      const p = pitches[current];
      path = flight(p); kind = p.kind; color = p.color;
      const live = trail(path, color, 0.95); live.geometry.setDrawRange(0, PER); trails.add(live);
      const T = target(p.cell); ring.visible = true; ring.position.copy(world(T.x, T.y, -0.02)); ringMat.color.set(color);
      t0 = performance.now(); flying = true; kick();
    },
    dispose() {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); document.removeEventListener("visibilitychange", onVis);
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else if (mat) mat.dispose(); });
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
