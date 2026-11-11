// The hero: the night field from behind the catcher. The four pitches of a real engine at-bat are thrown one after
// another; the pitch being called leaves its flight in seam red and earlier ones stay as faint white trails. Loaded
// only after first paint and only with WebGL; paused whenever it's off screen or the tab is hidden.
import * as THREE from "three";
import { along, ball, buildField, disposeScene, flight, isSoftware, makeRenderer, PER, SEG, spinBall, target, tube, world, type FieldPitch } from "./field";

export type HeroPitch = FieldPitch;
export type Hero = { dispose: () => void };

const FLY_MS = 1700;     // slowed about 4x so the eye can follow the break
const HOLD_MS = 1500;
const END_MS = 2600;

export function mountHero(el: HTMLElement, pitches: HeroPitch[], opts: { accent: string; still: boolean; onPitch: (i: number) => void; onStill?: () => void; onBall?: (s: { x: number; y: number; show: boolean; text: string }) => void }): Hero | null {
  const renderer = makeRenderer();
  if (!renderer) return null;
  el.appendChild(renderer.domElement);
  const accent = new THREE.Color(opts.accent);
  const scene = new THREE.Scene();
  const field = buildField(scene);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 500);

  const b = ball(accent);
  scene.add(b);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.19, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.visible = false;
  scene.add(ring);

  const paths = pitches.map((p) => flight(p));
  const trails = new THREE.Group();
  scene.add(trails);
  let live: THREE.Mesh[] = [];
  const stage = (i: number) => {
    for (const c of trails.children) { const m = c as THREE.Mesh; m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    trails.clear();
    for (let j = 0; j < i; j++) trails.add(tube(paths[j], 0.03, 0xffffff, 0.2));
    live = [tube(paths[i], 0.035, accent, 1), tube(paths[i], 0.11, accent, 0.22, true)];
    for (const m of live) trails.add(m);
    const T = target(pitches[i].cell);
    ring.position.copy(world(T.x, T.y, -0.03));
  };

  // framing: the camera looks at the zone, then the view shifts so the zone lands where the layout leaves room for
  // it: right of center and a little high on wide screens, centered in the top third on tall ones
  const base = new THREE.Vector3();
  let running = !opts.still;
  // the pointer leans the camera a little, so the field has depth under the glass
  const lean = { x: 0, y: 0, tx: 0, ty: 0 };
  function size() {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer!.setSize(r.width, r.height, false);
    W = r.width; Hh = r.height;
    const wide = r.width / r.height > 1.1;
    // taller wide screens (16:9 and up from 16:10) keep the call card higher up the frame, so the zone sits higher too
    const f = wide ? { fov: 26, y: 4.2, z: -19, px: 0.67, py: r.width / r.height < 1.7 ? 0.27 : 0.3 } : { fov: 34, y: 4.6, z: -22, px: 0.5, py: 0.25 };
    camera.aspect = r.width / r.height;
    camera.fov = f.fov;
    camera.position.set(0, f.y, f.z);
    base.copy(camera.position);
    camera.lookAt(0, 2.5, 0);
    camera.setViewOffset(r.width, r.height, -(f.px - 0.5) * r.width, (0.5 - f.py) * r.height, r.width, r.height);
    camera.updateProjectionMatrix();
    if (!running) renderer!.render(scene, camera);
  }
  const ro = new ResizeObserver(size);
  ro.observe(el);
  const onMove = (e: PointerEvent) => { lean.tx = (e.clientX / window.innerWidth - 0.5) * 2; lean.ty = (e.clientY / window.innerHeight - 0.5) * 2; };
  if (window.matchMedia("(pointer: fine)").matches) window.addEventListener("pointermove", onMove, { passive: true });

  let i = 0, phase: "fly" | "hold" = "fly", t0 = performance.now(), raf = 0, visible = true, frames = 0;
  // frame budget: the first 40 frames are timed; slow ones drop the scene to 15 fps (it's time-based, so the ball still
  // arrives on time), and if even that can't keep up it settles on a still frame like reduced motion
  let landT = 0, W = 1, Hh = 1;
  const proj = new THREE.Vector3();
  let win = 0, winN = 0, step = 0, lastDraw = 0, slowStrikes = 0, prevFrame = 0;
  if (isSoftware(renderer)) step = 66;
  if (opts.still) {
    i = pitches.length - 1;
    stage(i);
    b.position.copy(paths[i][paths[i].length - 1]);
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
    if (step && now - lastDraw < step) { raf = requestAnimationFrame(frame); return; }
    lastDraw = now;
    const c0 = performance.now();
    const el_ = now - t0;
    if (phase === "fly") {
      // the frame's timestamp can be a little before the pitch started; constant speed reads as a thrown ball
      const u = Math.max(0, Math.min(1, el_ / FLY_MS));
      along(paths[i], u, b.position);
      spinBall(b, pitches[i].kind, el_);
      const n = Math.max(1, Math.round(u * SEG)) * PER;
      for (const m of live) m.geometry.setDrawRange(0, n);
      ring.visible = false;
      if (u >= 1) { phase = "hold"; t0 = now; ring.visible = true; landT = now; }
    } else if (el_ >= (i === pitches.length - 1 ? END_MS : HOLD_MS)) {
      i = (i + 1) % pitches.length;
      phase = "fly";
      t0 = now;
      stage(i);
      opts.onPitch(i);
    }
    // the called spot answers the ball's arrival: the ring lands wide and settles onto the spot
    if (phase === "hold") {
      const k = Math.min(1, (now - landT) / 520), e = 1 - Math.pow(1 - k, 3);
      ring.scale.setScalar(1.9 - 0.9 * e);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.95 * e;
    }
    lean.x += (lean.tx - lean.x) * 0.04;
    lean.y += (lean.ty - lean.y) * 0.04;
    camera.position.set(base.x + Math.sin(now / 5200) * 0.25 + lean.x * 0.9, base.y - lean.y * 0.35, base.z);
    camera.lookAt(0, 2.5, 0);
    renderer!.render(scene, camera);
    // the pitch's speed rides beside the ball while it's in the air
    if (opts.onBall) {
      proj.copy(b.position).project(camera);
      opts.onBall({ x: (proj.x * 0.5 + 0.5) * W, y: (-proj.y * 0.5 + 0.5) * Hh, show: phase === "fly" && el_ > 120, text: `${pitches[i].velo} mph` });
    }
    el.dataset.frames = String(++frames);   // for web/tests/site_e2e.js: frames drawn so far
    // judge by the gap between drawn frames, not the draw call: on a software renderer the real cost lands outside it
    const gap = prevFrame ? now - prevFrame : 0, spent = performance.now() - c0;
    prevFrame = now;
    // in windows of 20 drawn frames: slower than 30 fps drops to 15 fps; at 15 fps, slower than about 10 fps holds still
    if (frames > 3) {
      win += Math.max(gap, spent); winN++;
      if (winN === 20) {
        const avg = win / winN;
        win = 0; winN = 0;
        if (!step && avg > 34) step = 66;
        else if (step && avg > 100) { goStill(); return; }
      }
      if (gap > 250 && ++slowStrikes >= 4) { goStill(); return; }
    }
    raf = requestAnimationFrame(frame);
  }
  function goStill() {
    running = false;
    opts.onBall?.({ x: 0, y: 0, show: false, text: "" });
    el.dataset.still = "1";
    opts.onStill?.();
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
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      disposeScene(scene);
      field.dispose();
      renderer!.dispose();
      renderer!.domElement.remove();
    },
  };
}
