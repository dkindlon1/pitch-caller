// The at-bat chapter: filmed shots of a ballpark at night (Runway; web/public/media/film/atbat), with the pitch
// tracking drawn over them in 3D the way broadcast graphics are: the strike zone, each flight in its pitch color, the
// ball and where it landed. Each shot has a camera solved from the film (plate corners, batter's boxes, the rubber and
// the bases, fitted to within about 8 px; see the numbers below), so the zone sits on the filmed plate and the
// flights leave the filmed pitcher's hand.
//   catcher: behind the plate, the delivery cut into 73 frames that play with the scroll (pitches 1, 2 and 4)
//   side:    up the third-base line, where the two pitch shapes can be compared (pitch 3)
//   over:    high behind the plate, all four flights at the end
import * as THREE from "three";
import { along, ball, buildOverlay, disposeScene, flight, flightTube, FLIGHT_PER, makeRenderer, PER, PITCH_COLOR, SEG, spinBall, target, tube, world, type FieldPitch } from "./field";

export type AtBatScene = { set: (p: number) => void; dispose: () => void };
// where a hitter has to decide whether to swing: about 24 ft in front of the plate
export const DECIDE_Z = 24;

// where the scroll is in the chapter (0..1): which pitch, and how far its delivery and flight have got. Inside a
// pitch's stretch the pitcher winds up (to 38%), the ball flies (to 78%), then the result shows.
export const SPAN = { start: 0.06, each: 0.21 };
export const FLY = { from: 0.38, to: 0.78 };
export function stepAt(p: number) {
  const i = Math.max(0, Math.min(3, Math.floor((p - SPAN.start) / SPAN.each)));
  const u = (p - SPAN.start - i * SPAN.each) / SPAN.each;
  const fly = Math.max(0, Math.min(1, (u - FLY.from) / (FLY.to - FLY.from)));
  return { i, u, fly, landed: fly >= 1 && p >= SPAN.start };
}

type Shot = {
  key: "catcher" | "side" | "over";
  iw: number; ih: number;
  cam: { fov: number; pos: [number, number, number]; look: [number, number, number]; up: [number, number, number] };
  release: { x: number; y: number; z: number };          // screen terms, as flight() takes it
  // how the frame sits on screen: image point (u, v) lands at screen fraction (sx, sy); zoom over cover on wide
  // screens, or over the screen's width on tall ones
  wide: { u: number; v: number; sx: number; sy: number; zoom: number };
  tall: { u: number; v: number; sx: number; sy: number; zoom: number };
};
// cameras solved with OpenCV solvePnP from points marked on the frames (fit error 8.4, 8.1 and 5.6 px at 2816 x 1584)
const SHOTS: Record<Shot["key"], Shot> = {
  catcher: {
    key: "catcher", iw: 1600, ih: 900,
    cam: { fov: 35.692, pos: [-0.053, 3.405, -12.878], look: [0.341, 2.778, 7.108], up: [-0.0025, 0.9995, 0.0314] },
    release: { x: 0.982, y: 6.725, z: 54.5 },
    wide: { u: 0.514, v: 0.6, sx: 0.6, sy: 0.56, zoom: 1.08 },
    tall: { u: 0.514, v: 0.62, sx: 0.5, sy: 0.3, zoom: 2.3 },
  },
  side: {
    key: "side", iw: 2400, ih: 1350,
    cam: { fov: 46.129, pos: [37.524, 8.498, -12.85], look: [22.249, 7.603, 0.029], up: [-0.0575, 0.9983, 0.0011] },
    release: { x: 4.417, y: 6.208, z: 54.5 },
    wide: { u: 0.5, v: 0.6, sx: 0.5, sy: 0.7, zoom: 1.04 },
    tall: { u: 0.52, v: 0.66, sx: 0.5, sy: 0.3, zoom: 1.35 },
  },
  over: {
    key: "over", iw: 2400, ih: 1350,
    cam: { fov: 46.129, pos: [-0.186, 22.743, -41.57], look: [-0.139, 17.519, -22.264], up: [-0.0009, 0.9653, 0.2612] },
    release: { x: -1.232, y: 6.577, z: 54.5 },
    wide: { u: 0.5, v: 0.58, sx: 0.6, sy: 0.55, zoom: 1.06 },
    tall: { u: 0.5, v: 0.62, sx: 0.5, sy: 0.3, zoom: 1.45 },
  },
};
// which shot is up along the chapter; each change crossfades over FADE
const FADE = 0.035;
const CUTS: { at: number; shot: Shot["key"] }[] = [
  { at: -1, shot: "catcher" }, { at: 0.48, shot: "side" }, { at: 0.69, shot: "catcher" }, { at: 0.9, shot: "over" },
];
// the delivery: frame 0 is the set position, the ball leaves his hand at frame 38 (clip frame 86), the follow-through
// is at 49 when the ball reaches the plate; the clip's own ball is painted out from 39 on, so only the drawn pitch is in the air
// a real pitch takes under half a second, about 11 frames of the clip, so the film only moves that far while the ball
// is in the air; the rest of the follow-through plays after it lands
const FRAMES = 73, RELEASE_FRAME = 38, FOLLOW_END = 49;
const frameUrl = (k: number) => `/media/film/atbat/catcher/${String(k + 1).padStart(4, "0")}.webp`;

export function mountAtBat(el: HTMLElement, pitches: FieldPitch[], opts: { accent: string; onHoop?: (xy: { x: number; y: number; show: boolean }) => void; onLabel?: (xy: { x: number; y: number; show: boolean }) => void; onBall?: (s: { x: number; y: number; show: boolean; text: string }) => void; onReady?: () => void }): AtBatScene | null {
  // the film, on a 2D canvas behind; it draws even where WebGL isn't available
  const bg = document.createElement("canvas");
  bg.setAttribute("aria-hidden", "true");
  bg.className = "mk-ab-film";
  const ctx = bg.getContext("2d");
  el.appendChild(bg);
  const renderer = makeRenderer(true);
  if (renderer) el.appendChild(renderer.domElement);
  const accent = new THREE.Color(opts.accent);
  const scene = new THREE.Scene();
  const { ruler } = buildOverlay(scene);
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 600);
  const b = ball(accent);
  b.scale.multiplyScalar(1.6);
  scene.add(b);

  // per shot, the flights from that shot's pitcher; thrown pitches stay on screen, dimmer
  const paths = {} as Record<Shot["key"], THREE.Vector3[][]>;
  const tubes = {} as Record<Shot["key"], (readonly [THREE.Mesh, THREE.Mesh])[]>;
  for (const s of Object.values(SHOTS)) {
    paths[s.key] = pitches.map((p) => flight(p, 120, s.release));
    tubes[s.key] = paths[s.key].map((pts, j) => {
      const c = PITCH_COLOR[pitches[j].kind];
      const core = flightTube(pts, 0.11, c), halo = tube(pts, 0.24, c, 0.14);
      core.visible = halo.visible = false;
      scene.add(halo, core);
      return [core, halo] as const;
    });
  }
  const rests = pitches.map((p) => {
    const T = target(p.cell), g = new THREE.Group();
    const bb = ball(accent); bb.scale.multiplyScalar(1.2); bb.rotation.set(0.4, 0.8, 0);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.23, 48), new THREE.MeshBasicMaterial({ color: PITCH_COLOR[p.kind], transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
    g.add(bb, ring);
    g.position.copy(world(T.x, T.y, -0.08));
    g.visible = false;
    scene.add(g);
    return g;
  });
  // the decision point, around the side shot's flights
  const hoop = new THREE.Group();
  {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.03, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    hoop.add(ring, disc);
    hoop.position.copy(along(paths.side[0], 1 - DECIDE_Z / 54.5));
    hoop.visible = false;
    scene.add(hoop);
  }

  // the film: the delivery's frames load coarse to fine, so an early scroll still finds a near frame
  const frames: (HTMLImageElement | null)[] = new Array(FRAMES).fill(null);
  const ok: boolean[] = new Array(FRAMES).fill(false);
  const stills: Partial<Record<Shot["key"], HTMLImageElement>> = {};
  let dead = false, readyFired = false;
  const loaded = () => { if (!readyFired && ok[0]) { readyFired = true; opts.onReady?.(); } queue(); };
  {
    const order: number[] = [], seen = new Set<number>();
    for (const step of [16, 8, 4, 2, 1]) for (let i = 0; i < FRAMES; i += step) if (!seen.has(i)) { seen.add(i); order.push(i); }
    let next = 0, active = 0;
    const pump = () => {
      while (!dead && active < 6 && next < order.length) {
        const i = order[next++], im = new Image();
        active++;
        im.decoding = "async";
        im.onload = () => { ok[i] = true; active--; loaded(); pump(); };
        im.onerror = () => { active--; pump(); };
        im.src = frameUrl(i);
        frames[i] = im;
      }
    };
    pump();
    for (const k of ["side", "over"] as const) {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => { stills[k] = im; queue(); };
      im.src = `/media/film/atbat/${k}.webp`;
    }
  }
  const nearest = (i: number) => { for (let d = 0; d < FRAMES; d++) { if (ok[i - d]) return i - d; if (ok[i + d]) return i + d; } return -1; };

  let want = 0, cur = 0, raf = 0, visible = true, w = 1, h = 1, dpr = 1;
  const tmp = new THREE.Vector3(), mid = world(-6, 0, 30);

  // where a shot's frame sits on this screen: its displayed size and top-left corner
  function place(s: Shot) {
    const wideScreen = w / h > 1.1, f = wideScreen ? s.wide : s.tall;
    const DW = wideScreen ? Math.max(w / s.iw, h / s.ih) * s.iw * f.zoom : w * f.zoom, DH = DW * s.ih / s.iw;
    let left = f.sx * w - f.u * DW, top = f.sy * h - f.v * DH;
    left = Math.min(0, Math.max(w - DW, left));
    if (wideScreen) top = Math.min(0, Math.max(h - DH, top));
    return { DW, DH, left, top };
  }
  function frameFor(p: number) {
    const { i, u } = stepAt(p);
    if (p < SPAN.start) return 0;
    if (u < FLY.from) return Math.round((u / FLY.from) * RELEASE_FRAME);
    if (u < FLY.to) return Math.round(RELEASE_FRAME + ((u - FLY.from) / (FLY.to - FLY.from)) * (FOLLOW_END - RELEASE_FRAME));
    void i;
    return Math.round(FOLLOW_END + Math.min(1, (u - FLY.to) / (1 - FLY.to)) * (FRAMES - 1 - FOLLOW_END));
  }
  function paint(s: Shot, p: number, alpha: number) {
    if (!ctx) return;
    let im: HTMLImageElement | undefined;
    if (s.key === "catcher") { const k = nearest(frameFor(p)); if (k >= 0) im = frames[k]!; } else im = stills[s.key];
    if (!im) return;
    const r = place(s);
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, r.left * dpr, r.top * dpr, r.DW * dpr, r.DH * dpr);
    // on tall screens the frame doesn't reach the bottom: fade it into black under the card
    if (r.top + r.DH < h) {
      const y0 = (r.top + r.DH * 0.72) * dpr, y1 = (r.top + r.DH) * dpr, g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = g; ctx.fillRect(0, y0, w * dpr, y1 - y0 + 1);
    }
    ctx.globalAlpha = 1;
  }
  function aim(s: Shot) {
    const r = place(s);
    camera.fov = s.cam.fov;
    camera.aspect = s.iw / s.ih;
    camera.position.set(...s.cam.pos);
    camera.up.set(...s.cam.up);
    camera.lookAt(...s.cam.look);
    camera.setViewOffset(r.DW, r.DH, -r.left, -r.top, w, h);
    camera.updateProjectionMatrix();
  }
  // the shot (or the two being crossfaded) at p
  function shotsAt(p: number) {
    let k = 0;
    while (k < CUTS.length - 1 && p >= CUTS[k + 1].at) k++;
    const into = p - CUTS[k].at;
    if (k > 0 && into < FADE) return { a: SHOTS[CUTS[k - 1].shot], b: SHOTS[CUTS[k].shot], t: into / FADE };
    return { a: SHOTS[CUTS[k].shot], b: null, t: 1 };
  }

  function draw(p: number) {
    const { a, b: nb, t } = shotsAt(p);
    if (ctx) {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, bg.width, bg.height);
      if (nb) { paint(a, p, 1); paint(nb, p, t); } else paint(a, p, 1);
    }
    if (!renderer) return;
    // the graphics fade out on the old shot and back in on the new one
    const s = nb && t >= 0.5 ? nb : a, alpha = nb ? Math.abs(t - 0.5) * 2 : 1;
    renderer.domElement.style.opacity = String(alpha);
    const { i, fly } = stepAt(p), end = p >= 0.9;
    for (const key of Object.keys(tubes) as Shot["key"][]) {
      tubes[key].forEach(([core, halo], j) => {
        const on = key === s.key && (j < i || (j === i && fly > 0) || end);
        core.visible = halo.visible = on;
        if (!on) return;
        const live = j === i && !end, n = live ? Math.max(1, Math.round(fly * SEG)) : SEG;
        core.geometry.setDrawRange(0, n * FLIGHT_PER); halo.geometry.setDrawRange(0, n * PER);
        (core.material as THREE.MeshStandardMaterial).opacity = live || end ? 1 : 0.5;
        (halo.material as THREE.MeshBasicMaterial).opacity = live || end ? 0.16 : 0.06;
      });
    }
    rests.forEach((g, j) => { g.visible = j < i || (j === i && fly >= 1) || end; });
    const side = s.key === "side";
    hoop.visible = side; ruler.visible = side;
    b.visible = p >= SPAN.start && fly > 0 && fly < 1 && !end;
    along(paths[s.key][i], fly, b.position);
    spinBall(b, pitches[i].kind, fly * 1700);
    aim(s);
    renderer.render(scene, camera);
    const proj = (v: THREE.Vector3) => { const q = v.clone().project(camera); return { x: (q.x * 0.5 + 0.5) * w, y: (-q.y * 0.5 + 0.5) * h }; };
    opts.onBall?.({ ...proj(b.position), show: b.visible && fly > 0.04 && fly < 1 && alpha > 0.9, text: `${pitches[i].velo} mph ${({ FB: "fastball", SL: "slider", CH: "changeup", CB: "curveball" } as const)[pitches[i].kind]}` });
    opts.onHoop?.({ ...proj(hoop.position.clone().add(tmp.set(0, -1.6, 0))), show: side && alpha > 0.9 });
    opts.onLabel?.({ ...proj(mid), show: side && alpha > 0.9 });
  }

  function size() {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    w = r.width; h = r.height; dpr = Math.min(1.5, window.devicePixelRatio || 1);
    bg.width = Math.round(w * dpr); bg.height = Math.round(h * dpr);
    renderer?.setSize(w, h, false);
    draw(cur);
  }
  const ro = new ResizeObserver(size);
  ro.observe(el);

  // scroll sets where the chapter wants to be; each frame moves part of the way there, so a fast flick still glides
  function frame() {
    raf = 0;
    if (!visible) return;
    cur += (want - cur) * 0.16;
    if (Math.abs(want - cur) < 0.0004) cur = want;
    draw(cur);
    if (cur !== want) raf = requestAnimationFrame(frame);
  }
  function queue() { if (!raf && visible) raf = requestAnimationFrame(() => { raf = 0; draw(cur); if (cur !== want) frame(); }); }
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) queue(); });
  io.observe(el);
  size();

  return {
    set(p: number) { want = Math.max(0, Math.min(1, p)); if (!raf && visible) raf = requestAnimationFrame(frame); },
    dispose() {
      dead = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      frames.forEach((im) => { if (im) im.src = ""; });
      disposeScene(scene);
      renderer?.dispose();
      renderer?.domElement.remove();
      bg.remove();
    },
  };
}
