// The at-bat chapter: the same field, driven by scroll. Each pitch owns a stretch of the scroll; inside it the ball
// flies with the scroll and leaves its flight in red. The camera starts where the hero left it (behind the catcher),
// swings out up the third-base line for the third pitch so the flights can be seen across the full 60 ft 6 in, comes back in
// tight for the two-strike slider, and pulls up and back to show all four flights at once.
import * as THREE from "three";
import { along, ball, buildField, disposeScene, flight, makeRenderer, PER, SEG, spinBall, target, tube, world, type FieldPitch } from "./field";

export type AtBatScene = { set: (p: number) => void; dispose: () => void };

// where the scroll is in the chapter (0..1): which pitch, and how far its flight has got
export const SPAN = { start: 0.06, each: 0.21 };
export function stepAt(p: number) {
  const i = Math.max(0, Math.min(3, Math.floor((p - SPAN.start) / SPAN.each)));
  const u = (p - SPAN.start - i * SPAN.each) / SPAN.each;     // 0..1 through this pitch's stretch
  const fly = Math.max(0, Math.min(1, (u - 0.16) / 0.5));       // the flight runs from 16% to 66% of it
  return { i, u, fly, landed: fly >= 1 && p >= SPAN.start };
}

// camera keys along the chapter: position, where it looks, field of view
// ox/oy shift the picture on wide screens (as fractions of the frame) so the field sits clear of the glass card
type Key = { t: number; pos: [number, number, number]; look: [number, number, number]; fov: number; ox: number; oy: number; fog: [number, number] };
const KEYS: Key[] = [
  { t: 0.0, pos: [0, 4.2, -19], look: [0, 2.5, 0], fov: 26, ox: 0.14, oy: 0.12, fog: [26, 170] },
  { t: 0.24, pos: [0, 4.2, -19], look: [0, 2.5, 0], fov: 26, ox: 0.14, oy: 0.12, fog: [26, 170] },
  { t: 0.33, pos: [3.2, 4.8, -15], look: [0, 2.7, 2], fov: 28, ox: 0.14, oy: 0.1, fog: [26, 170] },
  // up the third-base line, high and behind the plate: the flights fan in toward the zone (right, clear of the glass
  // card) with the mound beyond them
  { t: 0.46, pos: [19, 8, -14], look: [-1, 2.5, 12], fov: 46, ox: 0.06, oy: 0.02, fog: [50, 220] },
  { t: 0.62, pos: [20.5, 8.6, -13], look: [-1, 2.5, 12.5], fov: 46, ox: 0.06, oy: 0.02, fog: [50, 220] },
  { t: 0.7, pos: [0, 3.5, -12.5], look: [0, 2.4, 0], fov: 26, ox: 0.14, oy: 0.1, fog: [26, 170] },
  { t: 0.88, pos: [0, 3.5, -12.5], look: [0, 2.4, 0], fov: 26, ox: 0.14, oy: 0.1, fog: [26, 170] },
  { t: 1.0, pos: [9, 17, -30], look: [0, 2.2, 16], fov: 34, ox: 0.1, oy: 0, fog: [40, 210] },
];
const ease = (x: number) => x * x * (3 - 2 * x);

export function mountAtBat(el: HTMLElement, pitches: FieldPitch[], opts: { accent: string; onLabel?: (xy: { x: number; y: number; show: boolean }) => void; onBall?: (s: { x: number; y: number; show: boolean; text: string }) => void }): AtBatScene | null {
  const renderer = makeRenderer();
  if (!renderer) return null;
  el.appendChild(renderer.domElement);
  const accent = new THREE.Color(opts.accent);
  const scene = new THREE.Scene();
  const field = buildField(scene, { distance: true });
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 600);
  const b = ball(accent);
  b.scale.multiplyScalar(1.6);   // a little larger than life so it reads in the wide shots
  scene.add(b);

  const paths = pitches.map((p) => flight(p, 120));
  // every flight drawn twice: a faint white line for "already thrown", and a red line with a glow for "this pitch"
  const ghosts = paths.map((p) => { const m = tube(p, 0.035, 0xffffff, 0.24); scene.add(m); return m; });
  const reds = paths.map((p) => { const a = tube(p, 0.055, accent, 1), g = tube(p, 0.18, accent, 0.2, true); scene.add(a, g); return [a, g]; });
  const rings = pitches.map((p) => {
    const T = target(p.cell);
    const m = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    m.position.copy(world(T.x, T.y, -0.03));
    scene.add(m);
    return m;
  });

  let want = 0, cur = 0, raf = 0, visible = true, w = 1, h = 1, wide = true;
  const look = new THREE.Vector3(), tmp = new THREE.Vector3(), mid = new THREE.Vector3(6, 0, 9);

  function camAt(p: number) {
    let k = 0;
    while (k < KEYS.length - 2 && p > KEYS[k + 1].t) k++;
    const A = KEYS[k], B = KEYS[k + 1], f = ease(Math.max(0, Math.min(1, (p - A.t) / (B.t - A.t || 1))));
    camera.position.set(...A.pos).lerp(tmp.set(...B.pos), f);
    look.set(...A.look).lerp(tmp.set(...B.look), f);
    if (!wide) look.lerp(tmp.set(0, 2.5, 0), 0.4);   // tall screens: aim nearer the zone so it stays in frame
    camera.fov = (A.fov + (B.fov - A.fov) * f) * (wide ? 1 : 1.35);
    camera.lookAt(look);
    // wide screens keep the glass card on the left, so the field sits right of center; tall ones keep the card at the
    // bottom, so the field sits high
    const ox = A.ox + (B.ox - A.ox) * f, oy = A.oy + (B.oy - A.oy) * f;
    const fog = scene.fog as THREE.Fog;
    fog.near = A.fog[0] + (B.fog[0] - A.fog[0]) * f;
    fog.far = A.fog[1] + (B.fog[1] - A.fog[1]) * f;
    camera.setViewOffset(w, h, wide ? -ox * w : 0, (wide ? oy : 0.16) * h, w, h);
    camera.updateProjectionMatrix();
  }

  function draw(p: number) {
    const { i, fly } = stepAt(p);
    for (let j = 0; j < 4; j++) {
      const thrown = j < i || (j === i && fly > 0);
      const isLive = j === i || (p >= 0.9 && j === 3);
      ghosts[j].visible = j < i && !(p >= 0.9 && j === 3);
      const n = j === i ? Math.max(1, Math.round(fly * SEG)) * PER : SEG * PER;
      for (const m of reds[j]) { m.visible = isLive && thrown; m.geometry.setDrawRange(0, n); }
      rings[j].visible = j < i || (j === i && fly >= 1);
      (rings[j].material as THREE.MeshBasicMaterial).opacity = j === i ? 0.95 : 0.35;
    }
    b.visible = p >= SPAN.start && fly > 0;
    along(paths[i], fly, b.position);
    spinBall(b, pitches[i].kind, fly * 1700);
    camAt(p);
    renderer!.render(scene, camera);
    if (opts.onBall) {
      const v = b.position.clone().project(camera);
      opts.onBall({ x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, show: b.visible && fly > 0.04 && fly < 1, text: `${pitches[i].velo} mph` });
    }
    // the "60 ft 6 in" label rides the measuring line in the side view
    if (opts.onLabel) {
      const v = mid.clone().project(camera);
      opts.onLabel({ x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, show: p > 0.44 && p < 0.64 });
    }
  }

  function size() {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    w = r.width; h = r.height; wide = w / h > 1.1;
    renderer!.setSize(w, h, false);
    camera.aspect = w / h;
    draw(cur);
  }
  const ro = new ResizeObserver(size);
  ro.observe(el);

  // scroll sets where the chapter wants to be; each frame moves part of the way there, so a fast flick still glides
  function frame() {
    raf = 0;
    if (!visible) return;
    cur += (want - cur) * 0.14;
    if (Math.abs(want - cur) < 0.0004) cur = want;
    draw(cur);
    if (cur !== want) raf = requestAnimationFrame(frame);
  }
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); });
  io.observe(el);
  size();

  return {
    set(p: number) { want = Math.max(0, Math.min(1, p)); if (!raf && visible) raf = requestAnimationFrame(frame); },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      disposeScene(scene);
      field.dispose();
      renderer!.dispose();
      renderer!.domElement.remove();
    },
  };
}
