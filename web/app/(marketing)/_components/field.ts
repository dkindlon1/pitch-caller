// The field both 3D scenes share: a night ballpark around home plate, a seamed ball, and pitch flights. Units are feet.
// Screen terms (x to the catcher's right) are mirrored into world x, since the cameras mostly look out toward the mound.
// Flights use the app's movement model (fastball ride, slider tight, changeup fade) with gravity, between a
// right-hander's release point and the called spot.
import * as THREE from "three";

export type FieldPitch = { kind: "FB" | "SI" | "FC" | "SL" | "CB" | "CH";   // v1.1: six kinds
  velo: number; cell: [number, number] | "chase" };
// pitch colors, the way broadcasts and pitch-tracking apps color them; the same values are --mk-fb and friends in
// marketing.css, so the 3D flights, the cards and the charts agree
export const PITCH_COLOR: Record<FieldPitch["kind"], string> = { FB: "#F04A3E", SI: "#FF8A5C", FC: "#C98BFF", SL: "#F2B33D", CH: "#3FCB8C", CB: "#4D8DFF" };

export const PLATE_HALF = 17 / 24;
export const ZONE = { lo: 1.6, hi: 3.4 };
export const RELEASE = { x: -1.9, y: 5.8, z: 54 };
const MOVE: Record<FieldPitch["kind"], [number, number]> = { FB: [18, 8], SI: [9, 15], FC: [12, -3], SL: [3, -5], CB: [-10, -7], CH: [7, 15] }; // in: up, arm side
const G = 32.17;
export const CW = (2 * PLATE_HALF) / 3, CH = (ZONE.hi - ZONE.lo) / 3;

export function target(cell: FieldPitch["cell"]) {
  if (cell === "chase") return { x: PLATE_HALF + 0.4, y: ZONE.lo - 0.45 };
  const [c, r] = cell;
  return { x: -PLATE_HALF + (c + 0.5) * CW, y: ZONE.hi - (r + 0.5) * CH };
}
export const world = (x: number, y: number, z: number) => new THREE.Vector3(-x, y, z);

// release is in screen terms (x to the catcher's right), like RELEASE; each filmed shot passes its own pitcher's hand
export function flight(p: FieldPitch, steps = 80, release: { x: number; y: number; z: number } = RELEASE): THREE.Vector3[] {
  const R = release, T = target(p.cell), t = (R.z / (p.velo * 1.4667)) * 1.06;
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

// The ground as one painted map, seen from above: mown grass in a diamond pattern, the clay infield arc, the infield
// grass, the circles around home and the bases, in the colors of the night flyover in the hero. It covers 400 x 400 ft
// from 60 ft behind the plate out past center field. World x is mirrored, but a field is symmetric about that line.
export const MAP = { x0: -200, z0: -60, size: 400 };
function fieldTexture(max: number): THREE.CanvasTexture {
  const N = Math.min(2048, max), c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!, s = N / MAP.size;
  const X = (x: number) => (x - MAP.x0) * s, Y = (z: number) => (z - MAP.z0) * s;
  // grass, then the mowing: bands 12 ft wide along both foul-line directions, lighter and darker, make the diamonds
  g.fillStyle = "#2b4a25"; g.fillRect(0, 0, N, N);
  g.save();
  g.translate(X(0), Y(0)); g.rotate(Math.PI / 4);
  for (const dir of [0, 1]) {
    if (dir) g.rotate(-Math.PI / 2);
    for (let k = -40; k < 40; k++) { g.fillStyle = k % 2 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.05)"; g.fillRect(k * 12 * s, -600 * s, 12 * s, 1200 * s); }
  }
  g.restore();
  const clay = "#5c3620", clayDark = "#4f2e1b";
  // the infield skin: an arc 95 ft from the front of the mound, inside the foul lines (and a little past them)
  g.save();
  g.beginPath(); g.moveTo(X(0), Y(-6)); g.lineTo(X(-140), Y(134)); g.lineTo(X(140), Y(134)); g.closePath(); g.clip();
  g.fillStyle = clay; g.beginPath(); g.arc(X(0), Y(59), 95 * s, 0, Math.PI * 2); g.fill();
  g.restore();
  // base paths along the foul lines, 6 ft wide
  g.strokeStyle = clay; g.lineWidth = 6 * s; g.lineCap = "round";
  g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(63.6), Y(63.6)); g.moveTo(X(0), Y(0)); g.lineTo(X(-63.6), Y(63.6)); g.stroke();
  // the infield grass: the diamond inside the base paths, its far side bowed out toward second
  g.fillStyle = "#2e5028";
  g.beginPath(); g.moveTo(X(0), Y(13)); g.lineTo(X(57), Y(63.6)); g.quadraticCurveTo(X(0), Y(126), X(-57), Y(63.6)); g.closePath(); g.fill();
  g.save(); g.clip();
  g.translate(X(0), Y(0)); g.rotate(Math.PI / 4);
  for (let k = -12; k < 12; k++) { g.fillStyle = k % 2 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"; g.fillRect(k * 9 * s, -200 * s, 9 * s, 400 * s); }
  g.restore();
  // dirt circles: home (13 ft), the bases, the mound (9 ft)
  const disc = (x: number, z: number, r: number, col: string) => { g.fillStyle = col; g.beginPath(); g.arc(X(x), Y(z), r * s, 0, Math.PI * 2); g.fill(); };
  disc(0, 0, 13, clay); disc(63.6, 63.6, 9, clay); disc(-63.6, 63.6, 9, clay); disc(0, 127.3, 9, clay); disc(0, 59, 9.2, clayDark);
  // the dirt around home is worked: darker where it's been watered at the edge, raked in arcs, scuffed in the boxes
  const rg = g.createRadialGradient(X(0), Y(0), 2 * s, X(0), Y(0), 13 * s);
  rg.addColorStop(0, "rgba(255,220,180,0.05)"); rg.addColorStop(0.75, "rgba(0,0,0,0)"); rg.addColorStop(1, "rgba(0,0,0,0.28)");
  g.fillStyle = rg; g.beginPath(); g.arc(X(0), Y(0), 13 * s, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(0,0,0,0.07)"; g.lineWidth = 0.6;
  for (let r = 3; r < 13; r += 0.55) { g.beginPath(); g.arc(X(0), Y(0), r * s, 0, Math.PI * 2); g.stroke(); }
  for (const bx of [-3.2, 3.2]) { g.fillStyle = "rgba(0,0,0,0.12)"; g.beginPath(); g.ellipse(X(bx), Y(0.2), 1.6 * s, 2.6 * s, 0, 0, Math.PI * 2); g.fill(); }
  // grain: a scatter of light and dark specks so the clay and grass aren't flat
  for (let i = 0; i < N * 40; i++) { g.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,0.09)" : "rgba(255,235,210,0.04)"; g.fillRect(Math.random() * N, Math.random() * N, 1.5, 1.5); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// the night sky: a dome from a deep navy glow at the horizon to black overhead
function sky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(450, 32, 16), pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const lo = new THREE.Color(0x13213a), hi = new THREE.Color(0x020306), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { const t = Math.min(1, Math.max(0, pos.getY(i) / 220)); tmp.copy(lo).lerp(hi, Math.pow(t, 0.6)); col.set([tmp.r, tmp.g, tmp.b], i * 3); }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

// lights, ground, chalk, plate, mound, light towers and the zone. Returns what the caller must dispose that the
// scene traversal won't (the glow texture).
export function buildField(scene: THREE.Scene, opts: { distance?: boolean; pitcher?: boolean; onReady?: () => void; maxTexture?: number; anisotropy?: number } = {}) {
  scene.fog = new THREE.Fog(0x070b14, 40, 260);
  scene.background = new THREE.Color(0x020306);
  scene.add(sky());
  scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x1a2414, 0.55));
  const spot = new THREE.SpotLight(0xfff4e6, 2.4, 0, 0.42, 0.9, 0);
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

  const map = fieldTexture(opts.maxTexture ?? 2048);
  map.anisotropy = opts.anisotropy ?? 8;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP.size, MAP.size), new THREE.MeshStandardMaterial({ map, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(MAP.x0 + MAP.size / 2, 0, MAP.z0 + MAP.size / 2);
  scene.add(ground);
  // beyond the map, grass running out into the dark
  const outer = new THREE.Mesh(new THREE.RingGeometry(MAP.size * 0.7, 900, 48), new THREE.MeshStandardMaterial({ color: 0x24401f, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.set(0, -0.02, MAP.z0 + MAP.size / 2);
  scene.add(outer);
  const chalk = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.7 });
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
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 9.5, 0.7, 64), new THREE.MeshStandardMaterial({ color: 0x55321d, roughness: 1 }));
  mound.position.set(0, 0.35, 59);
  scene.add(mound);
  const rubber = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
  rubber.position.set(0, 0.74, 60.5);
  scene.add(rubber);

  const tex = glowTexture();
  const glow = (x: number, y: number, z: number, s: number, o: number) => {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xfff1dc, transparent: true, opacity: o, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
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
  scene.add(new THREE.LineSegments(zg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, fog: false })));
  // the zone's frame as solid bars (WebGL lines are one pixel), so it reads like a broadcast strike zone
  const bar = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false });
  const zw = 2 * PLATE_HALF, zh = ZONE.hi - ZONE.lo, t = 0.035;
  for (const [x, y, bw, bh] of [[0, ZONE.hi, zw + t, t], [0, ZONE.lo, zw + t, t], [-PLATE_HALF, ZONE.lo + zh / 2, t, zh + t], [PLATE_HALF, ZONE.lo + zh / 2, t, zh + t]] as const) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, t), bar);
    m.position.set(x, y, 0);
    scene.add(m);
  }
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(2 * PLATE_HALF, ZONE.hi - ZONE.lo), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
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

  return { dispose: () => { dead = true; tex.dispose(); map.dispose(); ptex?.dispose(); } };
}

// a flight as a tube (WebGL lines are one pixel wide); setDrawRange on it reveals the flight as the ball travels
export const SEG = 80, RAD = 8, PER = RAD * 6;
export function tube(pts: THREE.Vector3[], r: number, color: THREE.ColorRepresentation, opacity: number, additive = false) {
  return new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), SEG, r, RAD, false),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }),
  );
}

// The strike zone and lights alone, for drawing over filmed shots: the film supplies the ballpark. Returns the measuring
// line (60 ft 6 in, along the third-base side) so the caller can show it only in the side shot.
export function buildOverlay(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334433, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(6, 30, -20);
  scene.add(key);
  const zl: number[] = [];
  for (let i = 0; i <= 3; i++) {
    const x = -PLATE_HALF + i * CW, y = ZONE.lo + i * CH;
    zl.push(x, ZONE.lo, 0, x, ZONE.hi, 0, -PLATE_HALF, y, 0, PLATE_HALF, y, 0);
  }
  const zg = new THREE.BufferGeometry();
  zg.setAttribute("position", new THREE.Float32BufferAttribute(zl, 3));
  scene.add(new THREE.LineSegments(zg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })));
  const bar = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
  const zw = 2 * PLATE_HALF, zh = ZONE.hi - ZONE.lo, t = 0.04;
  for (const [x, y, bw, bh] of [[0, ZONE.hi, zw + t, t], [0, ZONE.lo, zw + t, t], [-PLATE_HALF, ZONE.lo + zh / 2, t, zh + t], [PLATE_HALF, ZONE.lo + zh / 2, t, zh + t]] as const) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, t), bar);
    m.position.set(x, y, 0);
    scene.add(m);
  }
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(zw, zh), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  pane.position.set(0, ZONE.lo + zh / 2, 0);
  scene.add(pane);
  // the zone as a box over the plate (its depth is the plate's square part), with faint lines down to the plate's
  // corners, so it reads as standing on the filmed plate rather than floating in front of the mound
  const B = -0.708, box: number[] = [];
  for (const y of [ZONE.lo, ZONE.hi]) box.push(PLATE_HALF, y, B, -PLATE_HALF, y, B, PLATE_HALF, y, 0, PLATE_HALF, y, B, -PLATE_HALF, y, 0, -PLATE_HALF, y, B);
  box.push(PLATE_HALF, ZONE.lo, B, PLATE_HALF, ZONE.hi, B, -PLATE_HALF, ZONE.lo, B, -PLATE_HALF, ZONE.hi, B);
  for (const x of [PLATE_HALF, -PLATE_HALF]) for (const z of [0, B]) box.push(x, 0.02, z, x, ZONE.lo, z);
  const bg = new THREE.BufferGeometry();
  bg.setAttribute("position", new THREE.Float32BufferAttribute(box, 3));
  scene.add(new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })));
  // the 60 ft 6 in from the rubber to the point of the plate, ticked every 10 ft
  const ruler = new THREE.Group();
  const tick = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
  const strip = (x1: number, z1: number, x2: number, z2: number, wd: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wd, Math.hypot(x2 - x1, z2 - z1)), tick);
    m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(x2 - x1, z2 - z1);
    m.position.set((x1 + x2) / 2, 0.05, (z1 + z2) / 2);
    ruler.add(m);
  };
  strip(6, -1.42, 6, 60.5, 0.12);
  for (let z = 0; z <= 60; z += 10) strip(5.2, z - 1.42, 6.8, z - 1.42, 0.12);
  scene.add(ruler);
  return { ruler };
}

// a flight drawn the way broadcast pitch-tracking graphics draw it: a thick, lit tube in the pitch's color that fades
// in from the release point and is solid by the plate. The fade is an alpha map along the tube's length (uv.x).
let fadeMap: THREE.Texture | null = null;
function fadeTexture() {
  if (fadeMap) return fadeMap;
  const c = document.createElement("canvas"); c.width = 256; c.height = 4;
  const g = c.getContext("2d")!, gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, "#000"); gr.addColorStop(0.08, "#333"); gr.addColorStop(0.4, "#fff"); gr.addColorStop(1, "#fff");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 4);
  fadeMap = new THREE.CanvasTexture(c);
  return fadeMap;
}
export function flightTube(pts: THREE.Vector3[], r: number, color: THREE.ColorRepresentation) {
  const col = new THREE.Color(color);
  return new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), SEG, r, 14, false),
    new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.45, roughness: 0.28, metalness: 0.05, transparent: true, alphaMap: fadeTexture(), depthWrite: false, fog: false }),
  );
}
export const FLIGHT_PER = 14 * 6;   // index count per tube segment for flightTube (radial segments x 6)

// a software renderer (no GPU: SwiftShader, llvmpipe, Microsoft Basic Render) can't keep a 3D scene smooth, so the
// scenes drop to 1x pixels on one and watch their own frame cost
export function isSoftware(r: THREE.WebGLRenderer): boolean {
  try {
    const gl = r.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch { return false; }
}

export function makeRenderer(alpha = false): THREE.WebGLRenderer | null {
  let r: THREE.WebGLRenderer;
  try { r = new THREE.WebGLRenderer({ antialias: true, alpha, powerPreference: "high-performance" }); } catch { return null; }
  r.setPixelRatio(isSoftware(r) ? 1 : Math.min(1.75, window.devicePixelRatio || 1));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.setClearColor(0x000000, alpha ? 0 : 1);
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
