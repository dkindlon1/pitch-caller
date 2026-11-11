// "Inside the call": what the engine does between the coach's tap and the call, drawn in 3D and driven by scroll.
// Every number is real engine output (content/candidates.ts, the same spot as content/mix.ts):
//   1. four reads stream in: the pitcher today, the hitter, the count and game, the umpire
//   2. every call it could make rises as a column on its spot, as tall as it is good (fewer expected runs)
//   3. the calls clearly worse than the best drop away; five are left
//   4. the five wrap into a ring split by their share of the mix, which spins and lands on the drawn call
// The zone lies flat like a map seen from behind the plate: far row is up, near row is down, the right-handed hitter's
// side (in) on the left, away on the right, the chase spot just off the low-away corner.
import * as THREE from "three";
import { CANDIDATES, CAND_PICK } from "@/content/candidates";
import { isSoftware, PITCH_COLOR, type FieldPitch } from "./field";

export type InsideScene = { set: (p: number) => void; dispose: () => void };
export type Anchor = { id: string; x: number; y: number; show: boolean };

const KIND: Record<string, FieldPitch["kind"]> = { Fastball: "FB", Slider: "SL", Changeup: "CH" };
// cell centres on the flat zone (x to the screen's left is +x, since the camera looks along +z)
const QUAD: Record<string, [number, number]> = { "up-in": [1, 1], "up-away": [-1, 1], "down-in": [1, -1], "down-away": [-1, -1], middle: [0, 0], chase: [-2.05, -2.05] };
const SLOT: Record<string, [number, number]> = { Fastball: [0.26, -0.18], Slider: [-0.26, -0.18], Changeup: [0, 0.26] };
// the stages along the scroll (0..1 of this scene's own stretch)
export const ST = { streams: [0.0, 0.22], rise: [0.24, 0.4], drop: [0.42, 0.5], ring: [0.52, 0.6], spin: [0.66, 0.8] };
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const at = (p: number, [a, b]: number[]) => clamp((p - a) / (b - a));
const ease = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function mountInside(el: HTMLElement, opts: { onAnchors?: (a: Anchor[]) => void } = {}): InsideScene | null {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" }); } catch { return null; }
  const soft = isSoftware(renderer);
  renderer.setPixelRatio(soft ? 1 : Math.min(1.75, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050913, 9, 26);
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x0a0f1c, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-4, 9, -6);
  scene.add(key);

  // the floor: a faint grid running off into the dark, and the zone drawn on it
  const grid = new THREE.GridHelper(40, 40, 0x24365a, 0x14203a);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.55;
  grid.position.y = -0.002;
  scene.add(grid);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const zl: number[] = [];
  for (let i = 0; i <= 3; i++) { const v = -1.5 + i; zl.push(v, 0.01, -1.5, v, 0.01, 1.5, -1.5, 0.01, v, 1.5, 0.01, v); }
  const zoneLines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(zl, 3)), lineMat);
  scene.add(zoneLines);
  const tileMat = new THREE.MeshBasicMaterial({ color: 0x9fc2ff, transparent: true, opacity: 0.05, depthWrite: false });
  const tiles = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), tileMat);
  tiles.rotation.x = -Math.PI / 2;
  scene.add(tiles);
  // the chase spot: a dashed square just off the low-away corner
  const cl: number[] = [], [cx, cz] = QUAD.chase;
  for (let i = 0; i < 16; i += 2) {
    const a = (i / 16) * 4, b = ((i + 1) / 16) * 4;
    const pt = (t: number): [number, number] => { const s = Math.floor(t) % 4, f = t - Math.floor(t); const c = [[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]]; const p0 = c[s], p1 = c[(s + 1) % 4]; return [cx + p0[0] + (p1[0] - p0[0]) * f, cz + p0[1] + (p1[1] - p0[1]) * f]; };
    const [x0, z0] = pt(a), [x1, z1] = pt(b); cl.push(x0, 0.01, z0, x1, 0.01, z1);
  }
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(cl, 3)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })));

  // the columns: one per call, as tall as it is good
  const costs = CANDIDATES.map((c) => c.cost), lo = Math.min(...costs), hi = Math.max(...costs);
  const cols = CANDIDATES.map((c) => {
    const col = new THREE.Color(PITCH_COLOR[KIND[c.pitch]]);
    const v = (hi - c.cost) / (hi - lo);
    const h = 0.2 + 1.9 * v;
    const geo = new THREE.CylinderGeometry(0.11, 0.11, 1, 24);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.35, transparent: true, opacity: 1 });
    const m = new THREE.Mesh(geo, mat);
    const [qx, qz] = QUAD[c.quad], [sx, sz] = SLOT[c.pitch];
    m.position.set(qx + sx, 0, qz + sz);
    m.scale.y = 0.001;
    scene.add(m);
    // a soft pool of its colour on the floor
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.26, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(m.position.x, 0.012, m.position.z);
    scene.add(pool);
    return { c, m, pool, h, keep: c.share > 0, delay: (1 - v) * 0.55 };
  });

  // the four reads: streams of light from the dark into a point above the zone
  // four sources around the zone (+x is the screen's left): pitcher up left, hitter up right, game low left, umpire low right
  const FOCUS = new THREE.Vector3(0, 2.1, 0.2);
  const READS = [
    { id: "pitcher", from: new THREE.Vector3(2.1, 3.1, -0.8), col: 0xffffff },
    { id: "hitter", from: new THREE.Vector3(-2.1, 3.1, -0.8), col: 0xffffff },
    { id: "game", from: new THREE.Vector3(2.3, 1.0, -2.0), col: 0xffffff },
    { id: "umpire", from: new THREE.Vector3(-2.3, 1.0, -2.0), col: 0xffffff },
  ];
  const N = soft ? 90 : 200;
  const streams = READS.map((r, k) => {
    const mid = r.from.clone().lerp(FOCUS, 0.5).add(new THREE.Vector3(0, 0.5 + k * 0.05, 0));
    const curve = new THREE.QuadraticBezierCurve3(r.from, mid, FOCUS);
    const pos = new Float32Array(N * 3), seeds = new Float32Array(N);
    for (let i = 0; i < N; i++) seeds[i] = Math.random();
    const g = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: r.col, size: 0.075, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.016, 6, false), new THREE.MeshBasicMaterial({ color: 0xbcd4ff, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(line, pts);
    return { r, curve, pts, line, seeds, pos };
  });
  // each source is a small bright node; the reads meet in the core
  const nodes = READS.map((r) => { const n = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })); n.position.copy(r.from); scene.add(n); return n; });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
  core.position.copy(FOCUS);
  scene.add(core);

  // the ring: the five calls left, split by their share, standing above the zone facing the camera
  const kept = CANDIDATES.filter((c) => c.share > 0);
  const ring = new THREE.Group();
  const RING_Y = 2.6;
  ring.position.set(0, RING_Y, 0.2);
  const arcs: { mesh: THREE.Mesh; mid: number; c: (typeof kept)[number]; base: THREE.Color }[] = [];
  const DIM = new THREE.Color(0x30343c);
  {
    let a0 = 0;
    const gap = 0.035;
    for (const c of kept) {
      const len = c.share * Math.PI * 2;
      const geo = new THREE.RingGeometry(0.8, 1.08, 96, 1, a0 + gap / 2, Math.max(0.01, len - gap));
      const col = new THREE.Color(PITCH_COLOR[KIND[c.pitch]]);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col.clone(), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      ring.add(mesh);
      arcs.push({ mesh, mid: a0 + len / 2, c, base: col });
      a0 += len;
    }
  }
  scene.add(ring);
  const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
  pointer.rotation.z = Math.PI;
  pointer.position.set(0, RING_Y + 1.24, 0.2);
  scene.add(pointer);
  // where the ring stops: the drawn call's arc under the pointer (pointer at +90 degrees), after three full turns
  const pickArc = arcs.find((a) => a.c.pitch === CAND_PICK.pitch && a.c.quad === CAND_PICK.quad) || arcs[0];
  const restAngle = Math.PI / 2 - pickArc.mid + Math.PI * 2 * 3;

  // camera path: wide on the streams, settles behind and above the plate for the columns, lifts to face the ring
  const camKeys = [
    { t: 0.0, pos: [0, 4.2, -10.4], look: [0, 2.0, 0.2] },
    { t: 0.24, pos: [0.4, 5.8, -9.2], look: [-0.4, 0.9, -0.3] },
    { t: 0.5, pos: [-0.6, 5.0, -8.4], look: [-0.5, 0.8, -0.3] },
    { t: 0.62, pos: [0, 3.6, -8.4], look: [0, 2.3, 0.2] },
    { t: 1.0, pos: [0, 3.0, -7.4], look: [0, RING_Y, 0.2] },
  ];
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), look = new THREE.Vector3();
  function camAt(p: number) {
    let k = 0;
    while (k < camKeys.length - 2 && p > camKeys[k + 1].t) k++;
    const A = camKeys[k], B = camKeys[k + 1], f = ease(clamp((p - A.t) / (B.t - A.t)));
    camera.position.copy(tmpA.set(A.pos[0], A.pos[1], A.pos[2]).lerp(tmpB.set(B.pos[0], B.pos[1], B.pos[2]), f));
    look.set(A.look[0], A.look[1], A.look[2]).lerp(tmpB.set(B.look[0], B.look[1], B.look[2]), f);
    // phones: stand further back so the whole zone, chase spot included, fits the narrow frame
    if (tall) camera.position.sub(look).multiplyScalar(1.22).add(look);
    camera.lookAt(look);
  }

  let tall = false;
  let w = 1, h = 1, cur = 0, want = 0, raf = 0, visible = true;
  const proj = (v: THREE.Vector3) => { const q = v.clone().project(camera); return { x: (q.x * 0.5 + 0.5) * w, y: (-q.y * 0.5 + 0.5) * h, front: q.z < 1 }; };

  function draw(p: number) {
    const s = at(p, ST.streams), r = at(p, ST.rise), d = at(p, ST.drop), rg = at(p, ST.ring), sp = at(p, ST.spin);
    // zone fades in with the streams
    lineMat.opacity = 0.2 + 0.7 * ease(s); tileMat.opacity = 0.05 * ease(s);
    // streams: the light runs along each curve, then fades once the columns are up
    const streamFade = 1 - at(p, [0.3, 0.42]);
    streams.forEach((st, k) => {
      const run = clamp(s * 1.25 - k * 0.07);
      (st.line.material as THREE.MeshBasicMaterial).opacity = 0.35 * ease(run) * streamFade;
      for (let i = 0; i < N; i++) {
        const u = ((st.seeds[i] + p * 3.2) % 1) * run;
        const v = st.curve.getPoint(u);
        st.pos[i * 3] = v.x; st.pos[i * 3 + 1] = v.y; st.pos[i * 3 + 2] = v.z;
      }
      st.pts.geometry.attributes.position.needsUpdate = true;
      (st.pts.material as THREE.PointsMaterial).opacity = 0.9 * ease(run) * streamFade;
    });
    nodes.forEach((n, k) => { (n.material as THREE.MeshBasicMaterial).opacity = ease(clamp(s * 1.25 - k * 0.07) * 3) * streamFade; });
    (core.material as THREE.MeshBasicMaterial).opacity = ease(at(p, [0.12, 0.24])) * streamFade;
    core.scale.setScalar(1 + 0.6 * at(p, [0.18, 0.26]));
    // columns rise (best first), the worse ones sink and fade, then the five left fade into the ring
    const toRing = ease(clamp(rg * 2.2));
    for (const k of cols) {
      const grow = easeOut(clamp((r - k.delay * 0.6) / 0.45));
      k.m.visible = grow > 0.01;
      const out = k.keep ? 0 : ease(d);
      k.m.scale.y = Math.max(0.001, k.h * grow * (1 - out));
      const op = (1 - out) * (1 - toRing);
      (k.m.material as THREE.MeshStandardMaterial).opacity = op;
      (k.pool.material as THREE.MeshBasicMaterial).opacity = 0.28 * grow * op;
      (k.m.material as THREE.MeshStandardMaterial).emissiveIntensity = k.keep && d > 0 ? 0.55 + 0.6 * ease(d) : 0.55;
      k.m.visible = k.m.visible && op > 0.01;
    }
    // ring: arcs draw on, then the ring spins and eases to a stop on the drawn call
    arcs.forEach((a, i) => {
      const on = ease(clamp(rg * 1.4 - i * 0.08));
      const isPick = a === pickArc, settle = at(sp, [0.94, 1]) * (isPick ? 0 : 1);
      const mt = a.mesh.material as THREE.MeshBasicMaterial;
      mt.color.copy(a.base).lerp(DIM, settle);
      mt.opacity = on * (1 - 0.35 * settle);
    });
    ring.rotation.z = restAngle * easeOut(sp);
    ring.scale.setScalar(0.85 + 0.15 * toRing + (sp >= 1 ? 0.04 : 0));
    (pointer.material as THREE.MeshBasicMaterial).opacity = ease(rg);
    camAt(p);
    renderer.render(scene, camera);

    if (opts.onAnchors) {
      const A: Anchor[] = [];
      streams.forEach((st, k) => { const q = proj(st.r.from); A.push({ id: st.r.id, x: q.x, y: q.y, show: s > 0.2 + k * 0.07 && p < ST.rise[0] }); });
      // one label, on the best call (the tallest column), while the columns are up
      { const k = cols[0]; const q = proj(new THREE.Vector3(k.m.position.x, k.m.scale.y + 0.12, k.m.position.z));
        A.push({ id: "best", x: q.x, y: q.y, show: r > 0.75 && rg < 0.15 }); }
      arcs.forEach((a) => {
        const ang = a.mid + ring.rotation.z, rad = 1.42 * ring.scale.x;
        const q = proj(new THREE.Vector3(ring.position.x + Math.cos(ang) * rad * -1, ring.position.y + Math.sin(ang) * rad, ring.position.z));
        A.push({ id: `arc:${a.c.pitch}|${a.c.quad}`, x: q.x, y: q.y, show: rg > 0.8 && (sp < 0.02 || sp >= 0.97) && (sp < 0.97 || a === pickArc) });
      });
      opts.onAnchors(A);
    }
  }

  function size() {
    const rr = el.getBoundingClientRect();
    if (!rr.width || !rr.height) return;
    w = rr.width; h = rr.height;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    tall = w / h < 1;
    camera.fov = w / h < 1 ? 60 : 34;
    // keep the action clear of the words: on wide screens it sits right of centre, on tall ones above the middle
    if (w / h > 1.25) camera.setViewOffset(w, h, -w * 0.16, 0, w, h);
    else if (w / h < 1) camera.setViewOffset(w, h, 0, h * 0.13, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    draw(cur);
  }
  const ro = new ResizeObserver(size);
  ro.observe(el);
  function frame() {
    raf = 0;
    if (!visible) return;
    cur += (want - cur) * 0.18;
    if (Math.abs(want - cur) < 0.0005) cur = want;
    draw(cur);
    if (cur !== want) raf = requestAnimationFrame(frame);
  }
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); });
  io.observe(el);
  size();

  return {
    set(p: number) { want = clamp(p); if (!raf && visible) raf = requestAnimationFrame(frame); },
    dispose() {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mt = m.material as THREE.Material | undefined; mt?.dispose?.(); });
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
