// The uploads section's movement cloud: each pitch of a bullpen file as a point, placed by its horizontal break,
// induced vertical break and velocity. "Break" shows the movement plot as the catcher sees it (a right-hander's arm
// side on the left); "Velocity" turns it to show speed, slower on the left. Drag to turn it. Loaded like the hero's
// pitch: after the page is up, and only with WebGL and without reduced motion.
import * as THREE from "three";
import { RANGE, type MovePoint } from "@/content/movement";

export type View = "break" | "velo";
export type Cloud = { view: (v: View) => void; dispose: () => void };

// world units: 10 in of break is 1 unit, 4 mph is 1 unit. x is negated so arm side lands on the screen's left.
const X = (hb: number) => -hb / 10, Y = (ivb: number) => ivb / 10, Z = (v: number) => (v - 82) / 4;
const BOX = { x: [X(RANGE.hb[1]), X(RANGE.hb[0])], y: [Y(RANGE.ivb[0]), Y(RANGE.ivb[1])], z: [Z(RANGE.velo[0]), Z(RANGE.velo[1])] };
const CENTER = new THREE.Vector3((BOX.x[0] + BOX.x[1]) / 2, (BOX.y[0] + BOX.y[1]) / 2, (BOX.z[0] + BOX.z[1]) / 2);
const ANGLE: Record<View, number> = { break: 0, velo: -Math.PI / 2 };
const DIST = 9.5, TILT = 0.16;

export function mount(el: HTMLElement, points: MovePoint[], colors: Record<MovePoint["kind"], string>): Cloud | null {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); } catch { return null; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2129, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(3, 6, 8); scene.add(sun);

  // two grid walls meeting at a corner: break against vertical break at the slow end, velocity against vertical
  // break on the glove side
  const g: number[] = [];
  for (let hb = RANGE.hb[0]; hb <= RANGE.hb[1]; hb += 6) g.push(X(hb), BOX.y[0], BOX.z[0], X(hb), BOX.y[1], BOX.z[0]);
  for (let ivb = RANGE.ivb[0]; ivb <= RANGE.ivb[1]; ivb += 5) {
    g.push(BOX.x[0], Y(ivb), BOX.z[0], BOX.x[1], Y(ivb), BOX.z[0]);
    g.push(BOX.x[1], Y(ivb), BOX.z[0], BOX.x[1], Y(ivb), BOX.z[1]);
  }
  for (let v = RANGE.velo[0]; v <= RANGE.velo[1]; v += 4) g.push(BOX.x[1], BOX.y[0], Z(v), BOX.x[1], BOX.y[1], Z(v));
  const grid = new THREE.BufferGeometry(); grid.setAttribute("position", new THREE.Float32BufferAttribute(g, 3));
  scene.add(new THREE.LineSegments(grid, new THREE.LineBasicMaterial({ color: 0x2c3744 })));
  // the zero lines, brighter
  const zero = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(0), BOX.y[0], BOX.z[0]), new THREE.Vector3(X(0), BOX.y[1], BOX.z[0]),
    new THREE.Vector3(BOX.x[0], Y(0), BOX.z[0]), new THREE.Vector3(BOX.x[1], Y(0), BOX.z[0])]);
  scene.add(new THREE.LineSegments(zero, new THREE.LineBasicMaterial({ color: 0x5a6878 })));

  const ball = new THREE.SphereGeometry(0.052, 14, 10), m = new THREE.Matrix4();
  for (const kind of ["FB", "SL", "CH"] as const) {
    const ps = points.filter((p) => p.kind === kind);
    const mesh = new THREE.InstancedMesh(ball, new THREE.MeshStandardMaterial({ color: colors[kind], roughness: 0.5 }), ps.length);
    ps.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(X(p.hb), Y(p.ivb), Z(p.velo))));
    scene.add(mesh);
  }

  // tick labels: HTML on top of the canvas, placed by projecting their 3D anchors each frame
  const ticks: { el: HTMLSpanElement; at: THREE.Vector3; axis: "x" | "y" | "z" }[] = [];
  const tick = (text: string, at: THREE.Vector3, axis: "x" | "y" | "z") => {
    const s = document.createElement("span"); s.className = `cloud-tick t-${axis}`; s.textContent = text; s.setAttribute("aria-hidden", "true");
    el.appendChild(s); ticks.push({ el: s, at, axis });
  };
  for (const hb of [-6, 0, 6, 12, 18]) tick(`${hb}`, new THREE.Vector3(X(hb), BOX.y[0] - 0.22, BOX.z[0]), "x");
  for (const ivb of [0, 10, 20]) tick(`${ivb}`, new THREE.Vector3(BOX.x[0] - 0.25, Y(ivb), BOX.z[0]), "y");
  for (const v of [74, 78, 82, 86, 90]) tick(`${v}`, new THREE.Vector3(BOX.x[1], BOX.y[0] - 0.22, Z(v)), "z");

  let angle = ANGLE.break, goal = angle, from = angle, t0 = 0, raf = 0, visible = true, drag: { x: number; a: number } | null = null;
  const TURN = 1100;
  let frames = 0;

  function size() {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    kick();
  }
  const ro = new ResizeObserver(size);

  const v = new THREE.Vector3();
  function frame(now: number) {
    raf = 0;
    if (!visible) return;
    let moving = false;
    if (!drag && angle !== goal) {
      const u = Math.min(1, (now - t0) / TURN), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      angle = from + (goal - from) * e; moving = u < 1;
      if (!moving) angle = goal;
    }
    camera.position.set(CENTER.x + DIST * Math.sin(angle) * Math.cos(TILT), CENTER.y + DIST * Math.sin(TILT), CENTER.z + DIST * Math.cos(angle) * Math.cos(TILT));
    camera.lookAt(CENTER);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
    el.dataset.frames = String(++frames);   // for the site's end-to-end test
    const w = el.clientWidth, h = el.clientHeight, front = Math.abs(Math.cos(angle)), side = Math.abs(Math.sin(angle));
    for (const t of ticks) {
      v.copy(t.at).project(camera);
      const o = t.axis === "x" ? front : t.axis === "z" ? side : 1;
      t.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
      t.el.style.opacity = String(Math.max(0, (o - 0.35) / 0.65));
    }
    if (moving) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); });
  const onVis = () => { visible = document.visibilityState === "visible"; if (visible) kick(); };

  // drag to turn, between the two views and a little past them
  const c = renderer.domElement;
  c.style.touchAction = "pan-y";
  const down = (e: PointerEvent) => { drag = { x: e.clientX, a: angle }; c.setPointerCapture(e.pointerId); };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    angle = Math.max(-Math.PI * 0.62, Math.min(Math.PI * 0.12, drag.a - ((e.clientX - drag.x) / Math.max(1, el.clientWidth)) * Math.PI));
    goal = angle; kick();
  };
  const up = () => { drag = null; };
  c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);

  ro.observe(el); io.observe(el); document.addEventListener("visibilitychange", onVis);
  size();

  return {
    view(next) { from = angle; goal = ANGLE[next]; t0 = performance.now(); kick(); },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", onVis);
      c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointercancel", up);
      scene.traverse((o) => { const x = o as THREE.Mesh; if (x.geometry) x.geometry.dispose(); const mat = x.material as THREE.Material | undefined; if (mat && !Array.isArray(mat)) mat.dispose(); });
      ticks.forEach((t) => t.el.remove());
      renderer.dispose(); c.remove();
    },
  };
}
