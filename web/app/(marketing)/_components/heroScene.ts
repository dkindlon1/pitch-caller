// The hero: a night field seen from behind the catcher. The four pitches of a real engine at-bat are thrown one after
// another; the pitch being called leaves its flight in seam red and earlier ones stay as faint white trails, so by the
// strikeout the screen shows the sequence. Flight paths use the same movement model as the app (fastball ride, slider
// tight, changeup fade) with gravity, between a right-hander's release point and the called spot.
// Loaded only after first paint, only with WebGL, and paused whenever it's off screen or the tab is hidden.
import * as THREE from "three";

export type HeroPitch = { kind: "FB" | "SL" | "CB" | "CH"; velo: number; cell: [number, number] | "chase" };
export type Hero = { dispose: () => void };

const PLATE_HALF = 17 / 24;                       // feet: half of a 17 in plate
const ZONE = { lo: 1.6, hi: 3.4 };
const RELEASE = { x: -1.9, y: 5.8, z: 54 };       // screen terms: x is the catcher's right
const MOVE: Record<HeroPitch["kind"], [number, number]> = { FB: [18, 8], SL: [3, -5], CB: [-10, -7], CH: [7, 15] }; // in: up, arm side
const G = 32.17;
const CW = (2 * PLATE_HALF) / 3, CH = (ZONE.hi - ZONE.lo) / 3;

const FLY_MS = 1700;     // slowed about 4x so the eye can follow the break
const HOLD_MS = 1500;
const END_MS = 2600;

function target(cell: HeroPitch["cell"]) {
  if (cell === "chase") return { x: PLATE_HALF + 0.4, y: ZONE.lo - 0.45 };
  const [c, r] = cell;
  return { x: -PLATE_HALF + (c + 0.5) * CW, y: ZONE.hi - (r + 0.5) * CH };
}
// the camera looks toward the mound, so world +x is on the viewer's left
const world = (x: number, y: number, z: number) => new THREE.Vector3(-x, y, z);

function flight(p: HeroPitch): THREE.Vector3[] {
  const R = RELEASE, T = target(p.cell), t = (54 / (p.velo * 1.4667)) * 1.06;
  const [up, arm] = MOVE[p.kind];
  const ax = (2 * (-arm / 12)) / (t * t), ay = (2 * (up / 12)) / (t * t) - G;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 80; i++) {
    const u = i / 80, k = 0.5 * (u * u - u) * t * t;
    pts.push(world(R.x + (T.x - R.x) * u + ax * k, R.y + (T.y - R.y) * u + ay * k, R.z * (1 - u)));
  }
  return pts;
}

// a baseball: white leather and the red seam that splits it into two figure-eights, with stitches across it
function ball(accent: THREE.Color): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 })));
  const k = 0.2;
  const seam = (t: number) => new THREE.Vector3((1 - k) * Math.cos(t) + k * Math.cos(3 * t), (1 - k) * Math.sin(t) - k * Math.sin(3 * t), 2 * Math.sqrt(k - k * k) * Math.sin(2 * t));
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 160 }, (_, i) => seam((i / 160) * Math.PI * 2).multiplyScalar(1.004)), true);
  const red = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.55 });
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 240, 0.02, 6, true), red));
  const st: number[] = [];
  for (let i = 0; i < 108; i++) {
    const t = (i / 108) * Math.PI * 2, p = seam(t), tan = seam(t + 0.001).sub(p).normalize(), side = new THREE.Vector3().crossVectors(tan, p).normalize();
    for (const s of [1, -1]) {
      const a = p.clone().add(side.clone().multiplyScalar(0.075 * s)).add(tan.clone().multiplyScalar(-0.03)).normalize().multiplyScalar(1.012);
      const b = p.clone().add(tan.clone().multiplyScalar(0.03)).normalize().multiplyScalar(1.012);
      st.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(st, 3));
  g.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: accent })));
  g.scale.setScalar(0.121);   // 1.45 in radius, in feet
  return g;
}

// a soft round glow for the light towers and the haze over the plate
function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.45)");
  g.addColorStop(0.55, "rgba(255,255,255,0.08)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function mountHero(
  el: HTMLElement,
  pitches: HeroPitch[],
  opts: { accent: string; still: boolean; onPitch: (i: number) => void },
): Hero | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 1);
  renderer.domElement.setAttribute("aria-hidden", "true");
  el.appendChild(renderer.domElement);

  const accent = new THREE.Color(opts.accent);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 26, 150);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);

  // light: one bank of towers up the third-base side throws a pool onto the plate; a little sky fill for the ball
  scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x050505, 0.35));
  const spot = new THREE.SpotLight(0xffffff, 3.2, 0, 0.42, 0.9, 0);
  spot.position.set(14, 42, -18);
  spot.target.position.set(0, 0, 4);
  scene.add(spot, spot.target);
  // a softer light on the mound so the pitcher's end of the field reads in the dark
  const far = new THREE.SpotLight(0xffffff, 1.6, 0, 0.3, 1, 0);
  far.position.set(-20, 50, 30);
  far.target.position.set(0, 0, 59);
  scene.add(far, far.target);
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(6, 12, -10);
  scene.add(key);

  // ground, home plate, chalk
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const chalk = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.24 });
  const strip = (x1: number, z1: number, x2: number, z2: number, w = 0.2) => {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), chalk);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -Math.atan2(dx, dz);
    m.position.set((x1 + x2) / 2, 0.012, (z1 + z2) / 2);
    scene.add(m);
  };
  // batter's boxes: 4 ft by 6 ft, six inches off the plate, centered on it
  for (const s of [1, -1]) {
    const xi = s * (PLATE_HALF + 0.5), xo = s * (PLATE_HALF + 4.5), zb = -3.7, zf = 2.3;
    strip(xi, zb, xi, zf); strip(xo, zb, xo, zf); strip(xi, zb, xo, zb); strip(xi, zf, xo, zf);
  }
  // foul lines from the back point of the plate, out toward first and third
  strip(0, -1.42, 140, 138.6, 0.33);
  strip(0, -1.42, -140, 138.6, 0.33);
  const plateShape = new THREE.Shape([[-PLATE_HALF, 0], [PLATE_HALF, 0], [PLATE_HALF, -0.71], [0, -1.42], [-PLATE_HALF, -0.71]].map(([x, z]) => new THREE.Vector2(x, -z)));
  const plate = new THREE.Mesh(new THREE.ShapeGeometry(plateShape), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.8 }));
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = 0.015;
  scene.add(plate);
  // the mound and the rubber
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 9.5, 0.7, 64), new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 1 }));
  mound.position.set(0, 0.35, 59);
  scene.add(mound);
  const rubber = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
  rubber.position.set(0, 0.74, 60.5);
  scene.add(rubber);

  // the light towers: soft glows high in the dark, which is also what the glass panels have to blur
  const tex = glowTexture();
  const glow = (x: number, y: number, z: number, s: number, o: number) => {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: o, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    scene.add(m);
  };
  for (const [x, y, z] of [[-58, 17, 190], [70, 18, 205], [-130, 15, 150]]) {
    glow(x, y, z, 120, 0.22);
    glow(x, y, z, 26, 0.9);
    for (let i = -2; i <= 2; i++) glow(x + i * 4.5, y + 2, z, 5, 0.9);
  }
  glow(0, 9, 2, 26, 0.06);   // haze in the light over the plate

  // the zone at the front of the plate: a frame, the 3x3 cells, and a faint pane
  const zl: number[] = [];
  for (let i = 0; i <= 3; i++) {
    const x = -PLATE_HALF + i * CW, y = ZONE.lo + i * CH;
    zl.push(x, ZONE.lo, 0, x, ZONE.hi, 0, -PLATE_HALF, y, 0, PLATE_HALF, y, 0);
  }
  const zg = new THREE.BufferGeometry();
  zg.setAttribute("position", new THREE.Float32BufferAttribute(zl, 3));
  scene.add(new THREE.LineSegments(zg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, fog: false })));
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(2 * PLATE_HALF, ZONE.hi - ZONE.lo), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false }));
  pane.position.set(0, (ZONE.lo + ZONE.hi) / 2, 0);
  scene.add(pane);

  const b = ball(accent);
  scene.add(b);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.19, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.visible = false;
  scene.add(ring);

  const paths = pitches.map(flight);
  const trails = new THREE.Group();
  scene.add(trails);
  const SEG = 80, RAD = 8, PER = RAD * 6;
  const tube = (pts: THREE.Vector3[], r: number, color: THREE.ColorRepresentation, opacity: number, additive = false) =>
    new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), SEG, r, RAD, false),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }),
    );
  const clearTrails = () => {
    for (const c of trails.children) { const m = c as THREE.Mesh; m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    trails.clear();
  };
  // draw the at-bat up to pitch i: earlier pitches faint white, pitch i in red with a soft glow around it
  let live: THREE.Mesh[] = [];
  const stage = (i: number) => {
    clearTrails();
    for (let j = 0; j < i; j++) trails.add(tube(paths[j], 0.03, 0xffffff, 0.2));
    live = [tube(paths[i], 0.035, accent, 1), tube(paths[i], 0.11, accent, 0.22, true)];
    for (const m of live) trails.add(m);
    const T = target(pitches[i].cell);
    ring.position.copy(world(T.x, T.y, -0.03));
  };
  const spin = (i: number, ms: number) => {
    const s = ms * 0.03, k = pitches[i].kind;
    if (k === "FB") b.rotation.set(-s, 0, 0.2);
    else if (k === "SL") b.rotation.set(0, s, 0.9);
    else b.rotation.set(-s * 0.7, 0, -0.6);
  };

  // framing: the camera looks at the zone, then the view is shifted so the zone lands where the layout leaves room
  // for it: right of center and a little high on wide screens (the headline has the bottom left, the live call sits
  // under the zone), centered in the top third on tall ones (the text and the call stack below)
  function size() {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    const wide = r.width / r.height > 1.1;
    const f = wide ? { fov: 26, y: 4.2, z: -19, px: 0.67, py: 0.36 } : { fov: 34, y: 4.6, z: -22, px: 0.5, py: 0.25 };
    camera.aspect = r.width / r.height;
    camera.fov = f.fov;
    camera.position.set(0, f.y, f.z);
    camera.lookAt(0, (ZONE.lo + ZONE.hi) / 2, 0);
    camera.setViewOffset(r.width, r.height, -(f.px - 0.5) * r.width, (0.5 - f.py) * r.height, r.width, r.height);
    camera.updateProjectionMatrix();
    base.copy(camera.position);
    if (!running) renderer.render(scene, camera);
  }
  const base = new THREE.Vector3();

  let frames = 0;
  let i = 0, phase: "fly" | "hold" = "fly", t0 = performance.now(), raf = 0, visible = true, running = !opts.still;
  const ro = new ResizeObserver(size);
  ro.observe(el);

  if (opts.still) {
    // reduced motion: the finished at-bat, all four flights, the ball on the last spot
    i = pitches.length - 1;
    stage(i);
    const end = paths[i][paths[i].length - 1];
    b.position.copy(end);
    ring.visible = true;
    opts.onPitch(i);
    size();
    renderer.render(scene, camera);
  } else {
    stage(0);
    opts.onPitch(0);
    size();
  }

  function frame(now: number) {
    raf = 0;
    if (!visible || !running) return;
    const el_ = now - t0;
    if (phase === "fly") {
      // the frame's timestamp can be a little before the pitch started; constant speed reads as a thrown ball
      const u = Math.max(0, Math.min(1, el_ / FLY_MS)), e = u;
      const path = paths[i], f = e * (path.length - 1), a = Math.floor(f), w = f - a;
      b.position.copy(path[a]).lerp(path[Math.min(a + 1, path.length - 1)], w);
      spin(i, el_);
      const n = Math.max(1, Math.round(e * SEG)) * PER;
      for (const m of live) m.geometry.setDrawRange(0, n);
      ring.visible = false;
      if (u >= 1) { phase = "hold"; t0 = now; ring.visible = true; }
    } else if (el_ >= (i === pitches.length - 1 ? END_MS : HOLD_MS)) {
      i = (i + 1) % pitches.length;
      phase = "fly";
      t0 = now;
      stage(i);
      opts.onPitch(i);
    }
    // a slow drift of the camera so the scene breathes between pitches
    camera.position.set(base.x + Math.sin(now / 5200) * 0.25, base.y, base.z);
    renderer.render(scene, camera);
    el.dataset.frames = String(++frames);   // for web/tests/site_e2e.js: frames drawn so far
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && running && visible) raf = requestAnimationFrame(frame); };

  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); });
  io.observe(el);
  const onVis = () => { visible = document.visibilityState === "visible"; if (visible) kick(); };
  document.addEventListener("visibilitychange", onVis);
  kick();

  return {
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
      });
      tex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
