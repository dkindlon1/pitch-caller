// The field both 3D scenes share: a night ballpark around home plate, a seamed ball, and pitch flights. Units are feet.
// Screen terms (x to the catcher's right) are mirrored into world x, since the cameras mostly look out toward the mound.
// Flights use the app's movement model (fastball ride, slider tight, changeup fade) with gravity, between a
// right-hander's release point and the called spot.
import * as THREE from "three";

export type FieldPitch = { kind: "FB" | "SL" | "CB" | "CH"; velo: number; cell: [number, number] | "chase" };

export const PLATE_HALF = 17 / 24;
export const ZONE = { lo: 1.6, hi: 3.4 };
export const RELEASE = { x: -1.9, y: 5.8, z: 54 };
const MOVE: Record<FieldPitch["kind"], [number, number]> = { FB: [18, 8], SL: [3, -5], CB: [-10, -7], CH: [7, 15] }; // in: up, arm side
const G = 32.17;
export const CW = (2 * PLATE_HALF) / 3, CH = (ZONE.hi - ZONE.lo) / 3;

export function target(cell: FieldPitch["cell"]) {
  if (cell === "chase") return { x: PLATE_HALF + 0.4, y: ZONE.lo - 0.45 };
  const [c, r] = cell;
  return { x: -PLATE_HALF + (c + 0.5) * CW, y: ZONE.hi - (r + 0.5) * CH };
}
export const world = (x: number, y: number, z: number) => new THREE.Vector3(-x, y, z);

export function flight(p: FieldPitch, steps = 80): THREE.Vector3[] {
  const R = RELEASE, T = target(p.cell), t = (54 / (p.velo * 1.4667)) * 1.06;
  const [up, arm] = MOVE[p.kind];
  const ax = (2 * (-arm / 12)) / (t * t), ay = (2 * (up / 12)) / (t * t) - G;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, k = 0.5 * (u * u - u) * t * t;
    pts.push(world(R.x + (T.x - R.x) * u + ax * k, R.y + (T.y - R.y) * u + ay * k, R.z * (1 - u)));
  }
  return pts;
}
// the point a fraction u of the way along a flight
export function along(path: THREE.Vector3[], u: number, out = new THREE.Vector3()) {
  const f = Math.max(0, Math.min(1, u)) * (path.length - 1), a = Math.floor(f), w = f - a;
  return out.copy(path[a]).lerp(path[Math.min(a + 1, path.length - 1)], w);
}

// a baseball: white leather and the red seam that splits it into two figure-eights, with stitches across it
export function ball(accent: THREE.Color): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 })));
  const k = 0.2;
  const seam = (t: number) => new THREE.Vector3((1 - k) * Math.cos(t) + k * Math.cos(3 * t), (1 - k) * Math.sin(t) - k * Math.sin(3 * t), 2 * Math.sqrt(k - k * k) * Math.sin(2 * t));
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 160 }, (_, i) => seam((i / 160) * Math.PI * 2).multiplyScalar(1.004)), true);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 240, 0.02, 6, true), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.55 })));
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
  g.scale.setScalar(0.121);   // 1.45 in radius
  return g;
}
export function spinBall(b: THREE.Object3D, kind: FieldPitch["kind"], ms: number) {
  const s = ms * 0.03;
  if (kind === "FB") b.rotation.set(-s, 0, 0.2);
  else if (kind === "SL") b.rotation.set(0, s, 0.9);
  else b.rotation.set(-s * 0.7, 0, -0.6);
}

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

// lights, ground, chalk, plate, mound, light towers and the zone. Returns what the caller must dispose that the
// scene traversal won't (the glow texture).
export function buildField(scene: THREE.Scene, opts: { distance?: boolean; pitcher?: boolean; onReady?: () => void } = {}) {
  scene.fog = new THREE.Fog(0x000000, 26, 170);
  scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x050505, 0.35));
  const spot = new THREE.SpotLight(0xffffff, 3.2, 0, 0.42, 0.9, 0);
  spot.position.set(14, 42, -18);
  spot.target.position.set(0, 0, 4);
  scene.add(spot, spot.target);
  const far = new THREE.SpotLight(0xffffff, 1.6, 0, 0.3, 1, 0);
  far.position.set(-20, 50, 30);
  far.target.position.set(0, 0, 59);
  scene.add(far, far.target);
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(6, 12, -10);
  scene.add(key);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const chalk = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.24 });
  const strip = (x1: number, z1: number, x2: number, z2: number, w = 0.2, mat: THREE.Material = chalk) => {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -Math.atan2(dx, dz);
    m.position.set((x1 + x2) / 2, 0.012, (z1 + z2) / 2);
    scene.add(m);
  };
  for (const s of [1, -1]) {
    const xi = s * (PLATE_HALF + 0.5), xo = s * (PLATE_HALF + 4.5), zb = -3.7, zf = 2.3;
    strip(xi, zb, xi, zf); strip(xo, zb, xo, zf); strip(xi, zb, xo, zb); strip(xi, zf, xo, zf);
  }
  strip(0, -1.42, 140, 138.6, 0.33);
  strip(0, -1.42, -140, 138.6, 0.33);
  if (opts.distance) {
    // the 60 ft 6 in from the rubber to the point of the plate, ticked every 10 ft, for the side view
    const tick = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });
    strip(6, -1.42, 6, 60.5, 0.08, tick);
    for (let z = 0; z <= 60; z += 10) strip(5.4, z - 1.42, 6.6, z - 1.42, 0.08, tick);
  }
  const plateShape = new THREE.Shape([[-PLATE_HALF, 0], [PLATE_HALF, 0], [PLATE_HALF, -0.71], [0, -1.42], [-PLATE_HALF, -0.71]].map(([x, z]) => new THREE.Vector2(x, -z)));
  const plate = new THREE.Mesh(new THREE.ShapeGeometry(plateShape), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.8 }));
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = 0.015;
  scene.add(plate);
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 9.5, 0.7, 64), new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 1 }));
  mound.position.set(0, 0.35, 59);
  scene.add(mound);
  const rubber = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
  rubber.position.set(0, 0.74, 60.5);
  scene.add(rubber);

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
  glow(0, 9, 2, 26, 0.06);

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

  // the pitcher: a backlit silhouette (a Runway still, cut out, the ball taken out of his hand) standing on the mound
  // as a card that turns to face the camera. His hand sits just behind and above the release point, so each flight
  // comes out of him. Scale: 828 px from cap to the cut-off ankles is about 5.6 ft.
  // Only the at-bat shows him: the hero's framing puts the mound above the top of the screen.
  let ptex: THREE.Texture | null = null, dead = false;
  if (opts.pitcher) new THREE.TextureLoader().load("/media/runway/pitcher-release.webp", (t) => {
    if (dead) { t.dispose(); return; }
    ptex = t;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    const ftPerPx = 5.6 / 828, img = t.image as { width: number; height: number };
    const W = img.width * ftPerPx, H = img.height * ftPerPx;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: true }));
    // the hand (97 px from the card's left edge) lands about 0.15 ft outside the release point
    // facing the camera, the card's local +x is world -x, so the hand (left of center) sits at center + offset
    card.position.set(world(RELEASE.x, 0, 0).x + 0.15 + (97 - img.width / 2) * ftPerPx, 0.45 + H / 2, 56.5);
    card.renderOrder = -1;
    card.onBeforeRender = (_r, _s, cam) => { card.lookAt(cam.position.x, card.position.y, cam.position.z); card.updateMatrixWorld(); };
    scene.add(card);
    opts.onReady?.();
  });

  return { dispose: () => { dead = true; tex.dispose(); ptex?.dispose(); } };
}

// a flight as a tube (WebGL lines are one pixel wide); setDrawRange on it reveals the flight as the ball travels
export const SEG = 80, RAD = 8, PER = RAD * 6;
export function tube(pts: THREE.Vector3[], r: number, color: THREE.ColorRepresentation, opacity: number, additive = false) {
  return new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), SEG, r, RAD, false),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }),
  );
}

// a software renderer (no GPU: SwiftShader, llvmpipe, Microsoft Basic Render) can't keep a 3D scene smooth, so the
// scenes drop to 1x pixels on one and watch their own frame cost
export function isSoftware(r: THREE.WebGLRenderer): boolean {
  try {
    const gl = r.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch { return false; }
}

export function makeRenderer(): THREE.WebGLRenderer | null {
  let r: THREE.WebGLRenderer;
  try { r = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); } catch { return null; }
  r.setPixelRatio(isSoftware(r) ? 1 : Math.min(1.75, window.devicePixelRatio || 1));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.setClearColor(0x000000, 1);
  r.domElement.setAttribute("aria-hidden", "true");
  return r;
}

export function disposeScene(scene: THREE.Scene) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
  });
}
