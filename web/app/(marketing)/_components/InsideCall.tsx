"use client";

import { useEffect, useRef, useState } from "react";
import { CANDIDATES, CAND_PICK, CAND_ENGINE } from "@/content/candidates";
import { CLIP, APP, SCREEN } from "@/content/inside-track";
import { SCENE, type SceneSet } from "@/content/inside-scene";

// "Inside the call", one pinned shot in four beats:
//   1 the tap   a coach in the dugout holds the iPad with the real app on it (Runway footage, the app tracked onto the
//               screen by scripts/screen-composite.py); he logs the foul and the camera pushes into the screen
//   2 reads     the camera keeps going into the app's own strike zone, which becomes the 3D zone; the four reads pour in
//               (the 3D is rendered offline, frame by frame, by scripts/render-inside.cjs from render/insideScene.ts, and
//               scrubbed here like the footage, one frame set per screen shape)
//   3 weigh     every call rises as a pillar of light; the clearly worse ones burn out
//   4 draw      a light lands on the drawn call; the camera rises back over the zone, which becomes the app's zone again,
//               now showing that call, and pulls back out to the coach
// Both cuts are docks: the crisp app screenshot is lined up exactly on the footage's screen (or on the 3D zone) before
// one gives way to the other. Under reduced motion: the last frame and the beats as a list.
const FRAMES = CLIP.frames, HOLD = CLIP.hold - 1, LAST = FRAMES - 1;
const APP_W = 1180, APP_H = 820;          // the screenshots' layout size (they're 2x)
// along this section's scroll
// (the zoom into the zone finishes before the 3D takes over, and the 3D is back over the zone before the zoom out starts,
// so each cross-fade happens between two pictures that are standing still in the same place)
const T = {
  press: [0.025, 0.065], push: [0.07, 0.245], toCrisp: [0.24, 0.25], zoomIn: [0.25, 0.305], filmOut: [0.255, 0.285],
  sceneIn: [0.306, 0.318], crispOut: [0.31, 0.322], scene: [0.322, 0.78], sceneOut: [0.782, 0.794], zoomOut: [0.796, 0.852],
  filmIn: [0.84, 0.852], crispGone: [0.844, 0.856], pull: [0.856, 0.998],
} as const;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const span = (p: number, [a, b]: readonly number[]) => clamp((p - a) / (b - a));
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const pad = (i: number) => String(i + 1).padStart(4, "0");
// the footage: full 1920x1080 frames, or on phones only the strip around the iPad that a phone ever shows (a tall screen
// fits the iPad to its width, so it sees at most ~0.62 x 1080 px of the frame's width), cut by scripts/film-phone.sh
type Foot = "full" | "phone";
const FOOT_CROP = { x: 627, w: 720 };   // the phone strip, in frame px; must match scripts/film-phone.sh
const footFor = (w: number, h: number): Foot => (w / h < 0.62 ? "phone" : "full");
const src = (kind: Foot) => (i: number) => `/media/film/inside/${i < FRAMES ? "push" : "pull"}${kind === "phone" ? "-phone" : ""}/${pad(i < FRAMES ? i : i - FRAMES)}.webp`;
// which rendered frame set suits this screen
const setFor = (w: number, h: number): keyof typeof SCENE => (w >= h ? "wide" : w >= 600 ? "tablet" : "phone");
type Anchor = { id: string; x: number; y: number; show: boolean };

type Pt = [number, number];
// the projective transform taking four points to four points (row-major 3x3), by solving the eight equations directly
function homography(s: Pt[], d: Pt[]) {
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = s[i], [u, v] = d[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
const mapPt = (H: number[], [x, y]: Pt): Pt => { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; };
const css = (H: number[]) => `matrix3d(${[H[0], H[3], 0, H[6], H[1], H[4], 0, H[7], 0, 0, 1, 0, H[2], H[5], 0, H[8]].map((v) => +v.toFixed(9)).join(",")})`;
const LAYER: Pt[] = [[0, 0], [APP_W, 0], [APP_W, APP_H], [0, APP_H]];
// The crisp layers are kept small, at their images' own pixel sizes: the screenshot (2360 px) is laid out 1180 wide, and
// the app's zone panel (its 6x capture, 1236 px) is its own layer at 618 wide, warped by the same perspective so the two
// stay locked together. (Laying them out bigger only adds raster work the image can't fill: a 3.6x layout here cost
// ~200MB of graphics memory per layer and up-to-1s paints.)
const ZW = 618, ZH = 708, ZLAYER: Pt[] = [[0, 0], [ZW, 0], [ZW, ZH], [0, ZH]];
const ZONE_APP: Pt[] = [[APP.zoneHi.x * APP_W, APP.zoneHi.y * APP_H], [(APP.zoneHi.x + APP.zoneHi.w) * APP_W, APP.zoneHi.y * APP_H], [(APP.zoneHi.x + APP.zoneHi.w) * APP_W, (APP.zoneHi.y + APP.zoneHi.h) * APP_H], [APP.zoneHi.x * APP_W, (APP.zoneHi.y + APP.zoneHi.h) * APP_H]];
// the part of the panel that stays lit: its dashed chase box, the same area the 3D copy keeps (scripts/zone-3d-textures.py
// keeps (132, 124)-(W-122, H-128) of the 6x capture), so the app's neighbouring labels dim away before the cut
const HOLE_APP: Pt[] = (() => { const x0 = APP.zoneHi.x * APP_W + 22, y0 = APP.zoneHi.y * APP_H + 20.7, x1 = (APP.zoneHi.x + APP.zoneHi.w) * APP_W - 20.3, y1 = (APP.zoneHi.y + APP.zoneHi.h) * APP_H - 21.3; return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; })();
const FEATHER = 8;   // app pixels
// the app was composited onto the footage 2% outside the tracked corners (to reach the glass's very edge); match it
const onGlass = (q: number[][]): Pt[] => { const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4; return q.map(([x, y]) => [cx + (x - cx) * 1.02, cy + (y - cy) * 1.02] as Pt); };

const kept = CANDIDATES.filter((c) => c.share > 0);
const SPOT: Record<string, string> = { "down-away": "down and away", "up-away": "up and away", middle: "middle", "down-in": "down and in", "up-in": "up and in", chase: "chase", "down-middle": "keep it down" };
const pick = kept.find((c) => c.pitch === CAND_PICK.pitch && c.quad === CAND_PICK.quad)!;
// what each read says, in full and short (phones)
const READ_TEXT: Record<string, [string, string, string]> = {
  pitcher: ["His stuff today", "Slider is his best pitch, fastball at 86, changeup feel is down", "Slider is his best pitch today"],
  hitter: ["The hitter", "Same side, has seen two fastballs and a slider, last one up and away", "Same side, seen 2 fastballs, 1 slider"],
  game: ["Count and game", "1-2, runner on second, one out, fifth, tied, 61 pitches", "1-2, runner on 2nd, 1 out, tied"],
  umpire: ["The umpire", "Nothing logged yet, so it plays a normal zone", "No reads yet: a normal zone"],
};
const BEATS: { from: number; to: number; t: string; d: string }[] = [
  { from: 0.0, to: 0.25, t: "One tap.", d: "The coach logs the foul. Here's what happens before the next call shows up." },
  { from: 0.27, to: 0.442, t: "It reads the moment.", d: "His stuff today, the hitter, the count and the umpire, all at once." },
  { from: 0.452, to: 0.598, t: "It weighs every call.", d: `All ${CANDIDATES.length} it could make. Taller means fewer runs likely to score. The ${CANDIDATES.length - kept.length} clearly worse drop out.` },
  { from: 0.6, to: 1.01, t: "Then it draws one.", d: `From the ${kept.length} left, weighted toward the best, so the hitter can't sit on a pattern. This time: ${pick.pitch.toLowerCase()}, ${SPOT[pick.quad]}.` },
];

export function InsideCall() {
  const run = useRef<HTMLDivElement>(null);
  const film = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLCanvasElement>(null);
  const before = useRef<HTMLImageElement>(null), after = useRef<HTMLImageElement>(null);
  const beforeZone = useRef<HTMLImageElement>(null), afterZone = useRef<HTMLImageElement>(null), dimEl = useRef<HTMLDivElement>(null);
  const press = useRef<HTMLDivElement>(null), pressBtn = useRef<HTMLSpanElement>(null);
  const tagsEl = useRef<HTMLDivElement>(null);
  const srcEl = useRef<HTMLParagraphElement>(null);
  const beatEls = useRef<(HTMLDivElement | null)[]>([]);
  const anchorEls = useRef<Record<string, HTMLDivElement | null>>({});
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setStill(true); return; }
    const canvas = film.current, el = run.current, sc3 = stage.current;
    if (!canvas || !el || !sc3) return;
    const ctx = canvas.getContext("2d"), sctx = sc3.getContext("2d");
    let dead = false, kill = () => {}, started = false;
    // frames load coarse to fine: every 16th frame of each strip first, then every 8th, and so on
    type Strip = { imgs: (HTMLImageElement | null)[]; ok: boolean[]; url: (i: number) => string; gone?: boolean };
    const strip = (n: number, url: (i: number) => string): Strip => ({ imgs: new Array(n).fill(null), ok: new Array(n).fill(false), url });
    const load = (strips: Strip[]) => {
      const order: [Strip, number][] = [], seen = new Set<string>();
      for (const step of [16, 8, 4, 2, 1]) strips.forEach((s, k) => { for (let i = 0; i < s.imgs.length; i += step) { const key = k + ":" + i; if (!seen.has(key)) { seen.add(key); order.push([s, i]); } } });
      let next = 0, active = 0;
      const pump = () => {
        while (!dead && active < 6 && next < order.length) {
          const [s, i] = order[next++];
          if (s.gone) continue;
          const im = new window.Image();
          active++; im.decoding = "async";
          im.onload = () => { s.ok[i] = true; active--; queue(); pump(); };
          im.onerror = () => { active--; pump(); };
          im.src = s.url(i); s.imgs[i] = im;
        }
      };
      pump();
    };
    const near1 = (s: Strip, i: number, lo = 0, hi = s.imgs.length - 1) => { for (let d = 0; d <= hi - lo; d++) { if (i - d >= lo && s.ok[i - d]) return i - d; if (i + d <= hi && s.ok[i + d]) return i + d; } return -1; };
    // the footage (both strips) and the rendered 3D for this screen shape
    let footKind = footFor(window.innerWidth, window.innerHeight), foot = strip(2 * FRAMES, src(footKind));
    let setName = setFor(window.innerWidth, window.innerHeight), set: SceneSet = SCENE[setName];
    const sceneStrip = (name: keyof typeof SCENE) => strip(SCENE[name].frames, (i) => `/media/film/inside/scene-${name}/${pad(i)}.webp`);
    let shot = sceneStrip(setName);
    const nearest = (i: number) => (i < FRAMES ? near1(foot, i, 0, FRAMES - 1) : near1(foot, i, FRAMES, 2 * FRAMES - 1));
    let want = 0, raf = 0;
    // where the footage sits (CSS px). Wide: cover. Tall: scaled so the iPad keeps inside the width, centred on it.
    type Fit = { sc: number; ox: number; oy: number; cw: number; ch: number };
    // creep: during the hold the camera eases in a few percent around the iPad, so the shot never sits dead still
    let creep = 1;
    function fit(): Fit {
      const cw = canvas!.clientWidth, ch = canvas!.clientHeight, cover = Math.max(cw / CLIP.w, ch / CLIP.h);
      const q = SCREEN[HOLD], xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
      const mx = (Math.max(...xs) + Math.min(...xs)) / 2, my = (Math.max(...ys) + Math.min(...ys)) / 2;
      let sc: number, ox: number, oy: number;
      if (cw >= ch) { sc = cover; ox = (cw - CLIP.w * cover) / 2; oy = (ch - CLIP.h * cover) / 2; }
      else {
        const ipadW = (Math.max(...xs) - Math.min(...xs)) * 1.14;
        sc = Math.min(cover, (0.9 * cw) / ipadW);
        ox = Math.min(0, Math.max(cw - CLIP.w * sc, cw / 2 - mx * sc)); oy = ch * 0.4 - my * sc;
      }
      const px = ox + mx * sc, py = oy + my * sc;
      return { sc: sc * creep, ox: px - (px - ox) * creep, oy: py - (py - oy) * creep, cw, ch };
    }
    const toScreen = (f: Fit, p: Pt): Pt => [f.ox + p[0] * f.sc, f.oy + p[1] * f.sc];
    function paintFilm(idx: number, f: Fit) {
      if (!ctx) return;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      if (canvas!.width !== Math.round(f.cw * dpr) || canvas!.height !== Math.round(f.ch * dpr)) { canvas!.width = Math.round(f.cw * dpr); canvas!.height = Math.round(f.ch * dpr); }
      const k = nearest(Math.round(idx));
      if (k < 0) return;
      const W = CLIP.w * f.sc * dpr, H = CLIP.h * f.sc * dpr, X = f.ox * dpr, Y = f.oy * dpr;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas!.width, canvas!.height);
      if (footKind === "phone") ctx.drawImage(foot.imgs[k]!, X + FOOT_CROP.x * f.sc * dpr, Y, FOOT_CROP.w * f.sc * dpr, H);
      else ctx.drawImage(foot.imgs[k]!, X, Y, W, H);
      if (Y > 0 || Y + H < canvas!.height) {   // letterboxed on tall screens: fade the frame's top and bottom into black
        const e = Math.min(120 * dpr, H * 0.18);
        for (const [y0, y1] of [[Y, Y + e], [Y + H, Y + H - e]]) {
          const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1), canvas!.width, e);
        }
      }
    }
    // the rendered 3D covers the screen; this is where its composed screen lands
    type SFit = { k: number; ox: number; oy: number; cw: number; ch: number };
    function sceneFit(): SFit {
      const cw = sc3!.clientWidth || window.innerWidth, ch = sc3!.clientHeight || window.innerHeight, k = Math.max(cw / set.lw, ch / set.lh);
      return { k, ox: (cw - set.lw * k) / 2, oy: (ch - set.lh * k) / 2, cw, ch };
    }
    // the zone's box when the shot looks straight down, on this screen (what the crisp app docks onto)
    const zoneOn = (s: SFit) => ({ cx: s.ox + set.zone.cx * s.k, cy: s.oy + set.zone.cy * s.k, zw: set.zone.zw * s.k, zh: set.zone.zh * s.k });
    // a fractional frame: the two nearest frames blended, so slow scrolling glides instead of stepping
    function paintScene(u: number, s: SFit) {
      if (!sctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (sc3!.width !== Math.round(s.cw * dpr) || sc3!.height !== Math.round(s.ch * dpr)) { sc3!.width = Math.round(s.cw * dpr); sc3!.height = Math.round(s.ch * dpr); }
      const x = u * (set.frames - 1), a = Math.floor(x), b = Math.min(set.frames - 1, a + 1), f = x - a;
      const ia = near1(shot, a), ib = shot.ok[b] ? b : ia;
      if (ia < 0) return;
      const X = s.ox * dpr, Y = s.oy * dpr, W = set.lw * s.k * dpr, H = set.lh * s.k * dpr;
      sctx.globalAlpha = 1; sctx.drawImage(shot.imgs[ia]!, X, Y, W, H);
      if (ib !== ia && f > 0.01) { sctx.globalAlpha = f; sctx.drawImage(shot.imgs[ib]!, X, Y, W, H); sctx.globalAlpha = 1; }
    }
    // where the labels point at u, on this screen
    // (a hidden label still gets the place it's about to have, so the ones already up can make room before it arrives)
    function anchorsAt(u: number, s: SFit): Anchor[] {
      const i = Math.round(u * (set.frames - 1));
      return Object.entries(set.anchors).map(([id, arr]) => {
        let q = arr[i];
        const show = !!q;
        for (let d = 1; !q && d < 40; d++) q = arr[i + d] || arr[i - d];
        return q ? { id, x: s.ox + q[0] * set.lw * s.k, y: s.oy + q[1] * set.lh * s.k, show } : { id, x: 0, y: 0, show: false };
      });
    }
    // place each label (its box sits above its point), inside the edges and below the nav, then push apart any on the same
    // side that would touch
    function placeLabels(A: Anchor[], W: number) {
      const M = W < 600 ? 14 : 48, narrow = W < 600;
      const boxes = A.map((a) => {
        const n = anchorEls.current[a.id];
        if (!n) return null;
        const bw = n.offsetWidth, bh = n.offsetHeight;
        const side = a.x < W / 2 ? 0 : 1;
        let x = Math.max(bw / 2 + M, Math.min(W - bw / 2 - M, a.x));
        if (narrow && a.id in READ_TEXT) x = side ? Math.max(x, W / 2 + bw / 2 + 6) : Math.min(x, W / 2 - bw / 2 - 6);   // phones: each side keeps to its half
        return { a, n, bw, bh, x, y: Math.max(bh * 1.3 + 110, a.y), side };
      }).filter((b): b is NonNullable<typeof b> => !!b);
      // while any read is up, all four reads keep their slots (shown or about to be), so nothing jumps when one arrives
      const readsUp = boxes.some((b) => b.a.show && b.a.id in READ_TEXT);
      for (const side of [0, 1]) {
        const g = boxes.filter((b) => b.side === side && (b.a.show || (readsUp && b.a.id in READ_TEXT && b.a.x !== 0))).sort((p, q) => p.y - q.y);
        for (let i = 1; i < g.length; i++) { const need = g[i - 1].y + g[i].bh + 16; if (g[i].y < need) g[i].y = need; }
      }
      for (const b of boxes) {
        if (b.a.show || readsUp) b.n.style.transform = `translate3d(${b.x}px, ${b.y}px, 0)`;
        b.n.dataset.show = b.a.show ? "1" : "0";
      }
    }
    // the crisp screenshot's corners at zoom z: from the footage's screen (z = 0) into the app's zone, on the rendered zone's box
    // (z = 1). The zoom is geometric (equal scroll, equal ratio) and the perspective flattens out on the way.
    function crispCorners(f: Fit, z: number): Pt[] {
      const start = onGlass(SCREEN[LAST]).map((p) => toScreen(f, p));
      const H0 = homography(LAYER, start);
      const zc: Pt = [(APP.zone.x + APP.zone.w / 2) * APP_W, (APP.zone.y + APP.zone.h / 2) * APP_H];
      const zt = zoneOn(sceneFit());
      const P0 = mapPt(H0, zc), top = mapPt(H0, [zc[0], APP.zone.y * APP_H]), bot = mapPt(H0, [zc[0], (APP.zone.y + APP.zone.h) * APP_H]);
      const S0 = Math.hypot(bot[0] - top[0], bot[1] - top[1]) / (APP.zone.h * APP_H), S1 = zt.zh / (APP.zone.h * APP_H);
      const e = inOut(z), S = S0 * Math.pow(S1 / S0, e);
      const cx = P0[0] + (zt.cx - P0[0]) * e, cy = P0[1] + (zt.cy - P0[1]) * e;
      return start.map((sp, i) => {
        const a: Pt = [(sp[0] - P0[0]) / S0, (sp[1] - P0[1]) / S0], b: Pt = [LAYER[i][0] - zc[0], LAYER[i][1] - zc[1]];
        return [cx + S * ((1 - e) * a[0] + e * b[0]), cy + S * ((1 - e) * a[1] + e * b[1])] as Pt;
      });
    }
    function applyAt(p: number) {
      creep = 1 + 0.04 * Math.sin((Math.PI / 2) * span(p, [0, T.push[0]]));
      const f = fit();
      // the footage: the hold (with the press), the push, and for the pull-out the "pull" strip backwards
      const idx = p < T.push[0] ? HOLD : p < 0.5 ? HOLD + span(p, T.push) * (LAST - HOLD) : FRAMES + LAST - span(p, T.pull) * (LAST - HOLD);
      paintFilm(idx, f);
      canvas!.style.opacity = String(p < 0.5 ? 1 - span(p, T.filmOut) : span(p, T.filmIn));
      // the press: the app's own Foul button lights up, on the held frame's screen
      if (press.current && pressBtn.current) {
        const k = span(p, T.press);
        press.current.style.transform = css(homography(LAYER, onGlass(SCREEN[HOLD]).map((q) => toScreen(f, q))));
        press.current.style.opacity = k > 0 && k < 1 ? "1" : "0";
        pressBtn.current.style.setProperty("--on", String(Math.sin(Math.PI * Math.min(1, k * 1.35))));
      }
      // the crisp screenshots and the cuts (before and after are never up at the same time, so they share the dim)
      let dimOp = 0;
      const crispAt = (img: HTMLImageElement | null, zone: HTMLImageElement | null, z: number, op: number) => {
        if (!img || !zone) return;
        img.style.opacity = zone.style.opacity = String(op);
        if (op <= 0) return;
        const Happ = homography(LAYER, crispCorners(f, z));
        img.style.transform = css(Happ);
        const q = ZONE_APP.map((c) => mapPt(Happ, c));
        zone.style.transform = css(homography(ZLAYER, q));
        // everything outside the panel dims, feathered: a flat overlay with a soft rectangular hole over the panel
        const d = 0.98 * inOut(clamp(z * 1.25)) * op;
        if (d > dimOp && dimEl.current) {
          dimOp = d;
          const h = HOLE_APP.map((c) => mapPt(Happ, c)), xs = h.map((v) => v[0]), ys = h.map((v) => v[1]);
          const n = dimEl.current.style, fe = FEATHER * (Math.max(...xs) - Math.min(...xs)) / (HOLE_APP[1][0] - HOLE_APP[0][0]);
          n.setProperty("--x1", `${Math.min(...xs)}px`); n.setProperty("--x2", `${Math.max(...xs)}px`);
          n.setProperty("--y1", `${Math.min(...ys)}px`); n.setProperty("--y2", `${Math.max(...ys)}px`);
          n.setProperty("--f", `${fe * 2}px`);
        }
      };
      crispAt(before.current, beforeZone.current, span(p, T.zoomIn), p < T.toCrisp[0] ? 0 : Math.min(span(p, T.toCrisp), 1 - span(p, T.crispOut)));
      crispAt(after.current, afterZone.current, 1 - span(p, T.zoomOut), Math.min(span(p, T.sceneOut), 1 - span(p, T.crispGone)));
      if (dimEl.current) dimEl.current.style.opacity = String(dimOp);
      if (srcEl.current) srcEl.current.style.opacity = String(Math.max(1 - span(p, [0.18, 0.2]), span(p, [0.322, 0.34])) * Math.max(1 - span(p, [0.78, 0.8]), span(p, [0.93, 0.98])));
      const sOp = Math.min(span(p, T.sceneIn), 1 - span(p, T.sceneOut));
      if (stage.current) stage.current.style.opacity = String(sOp);
      if (tagsEl.current) tagsEl.current.style.opacity = String(sOp);
      if (sOp > 0) { const s = sceneFit(), u = span(p, T.scene); paintScene(u, s); placeLabels(anchorsAt(u, s), s.cw); }
      else placeLabels(anchorsAt(0, sceneFit()), sceneFit().cw);
      BEATS.forEach((b, i) => {
        const node = beatEls.current[i];
        if (!node) return;
        const t = (p - b.from) / (b.to - b.from), e = 0.14;
        const o = t < 0 || t > 1 ? 0 : Math.min(1, t / (e * 0.4), (1 - t) / e);
        node.style.opacity = String(o);
        // the headline rises into place inside its mask on the way in (and only fades on the way out)
        node.style.setProperty("--rise", String(1 - inOut(clamp(t / e))));
        node.setAttribute("aria-hidden", o > 0.5 ? "false" : "true");
      });
    }
    const queue = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; applyAt(want); }); };

    const near = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || started) return;
      started = true; near.disconnect();
      load([foot, shot]);
      import("gsap").then(({ gsap }) => import("gsap/ScrollTrigger").then(({ ScrollTrigger }) => {
        if (dead || !run.current) return;
        gsap.registerPlugin(ScrollTrigger);
        const st = ScrollTrigger.create({ trigger: run.current, start: "top top", end: "bottom bottom", scrub: 0.15, onUpdate: (t) => { want = t.progress; queue(); } });
        want = st.progress; queue();
        kill = () => st.kill();
      }));
    }, { rootMargin: "80% 0px" });
    near.observe(el);
    // a different screen shape gets its own frame set
    const onResize = () => {
      const n = setFor(window.innerWidth, window.innerHeight);
      if (n !== setName) { shot.gone = true; setName = n; set = SCENE[n]; shot = sceneStrip(n); if (started) load([shot]); }
      const fk = footFor(window.innerWidth, window.innerHeight);
      if (fk !== footKind) { foot.gone = true; footKind = fk; foot = strip(2 * FRAMES, src(fk)); if (started) load([foot]); }
      queue();
    };
    window.addEventListener("resize", onResize);
    return () => { dead = true; near.disconnect(); kill(); cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); [...foot.imgs, ...shot.imgs].forEach((im) => { if (im) im.src = ""; }); };
  }, []);

  if (still) {
    return (
      <section className="mk-in is-still" id="dugout" aria-labelledby="in-h">
        <div className="mk-wrap">
          <div className="mk-sec-head">
            <h2 id="in-h">Inside the call</h2>
            <p>What happens between the coach&apos;s tap and the next call, in one real spot: a 1-2 count, runner on second, one out, fifth inning, tied.</p>
          </div>
          <img className="mk-in-poster" src="/media/film/inside/pull-poster.jpg" alt="A coach in the dugout at night holding the iPad, which shows the call for this spot: slider, down and away." />
          <ol className="mk-in-steps">
            {BEATS.map((b) => <li key={b.t}><b>{b.t}</b> {b.d}</li>)}
          </ol>
        </div>
        <Facts />
      </section>
    );
  }

  // the crisp screenshot, with the zone panel laid over it from its 6x capture so it stays sharp all the way in
  const crisp = (ref: React.RefObject<HTMLImageElement | null>, zone: React.RefObject<HTMLImageElement | null>, file: string, zoneFile: string) => (
    <>
      <img className="mk-in-app" ref={ref} src={`/marketing/${file}`} alt="" aria-hidden="true" width={APP_W} height={APP_H} decoding="async" />
      <img className="mk-in-app mk-in-app-zone" ref={zone} src={`/marketing/${zoneFile}`} alt="" aria-hidden="true" width={ZW} height={ZH} decoding="async" />
    </>
  );

  return (
    <section className="mk-in" id="dugout" aria-labelledby="in-h">
      <div className="mk-in-run" ref={run}>
        <div className="mk-in-pin">
          <canvas className="mk-in-film" ref={film} aria-hidden="true" />
          <div className="mk-in-press" ref={press} aria-hidden="true">
            <span ref={pressBtn} style={{ left: `${APP.foul.x * 100}%`, top: `${APP.foul.y * 100}%`, width: `${APP.foul.w * 100}%`, height: `${APP.foul.h * 100}%` }} />
          </div>
          {crisp(before, beforeZone, "app-call-before.png", "app-zone-before.png")}
          {crisp(after, afterZone, "app-call-after.png", "app-zone-after.png")}
          <div className="mk-in-dim" ref={dimEl} aria-hidden="true" />
          <canvas className="mk-in-stage" ref={stage} aria-hidden="true" />
          <div className="mk-in-shade" aria-hidden="true" />
          <h2 id="in-h" className="mk-sr">Inside the call</h2>
          <div className="mk-in-tags" ref={tagsEl}>
            {Object.entries(READ_TEXT).map(([id, [t, d, short]]) => (
              <div key={id} className="mk-in-tag mk-in-read" ref={(n) => { anchorEls.current[id] = n; }} aria-hidden="true"><b>{t}</b><span className="mk-in-long">{d}</span><span className="mk-in-short">{short}</span></div>
            ))}
            <div className="mk-in-tag mk-in-pick" ref={(n) => { anchorEls.current.pick = n; }} aria-hidden="true">
              <b>{pick.pitch}, {SPOT[pick.quad]}</b><span>{Math.round(pick.share * 100)}% of the mix in this spot</span>
            </div>
          </div>
          <div className="mk-in-beats">
            {BEATS.map((b, i) => (
              <div key={b.t} className="mk-in-beat" ref={(n) => { beatEls.current[i] = n; }} style={{ opacity: 0 }}>
                <p className="mk-in-t"><span>{b.t}</span></p>
                <p className="mk-in-d">{b.d}</p>
              </div>
            ))}
          </div>
          <p className="mk-in-src" ref={srcEl}>Real engine output (version {CAND_ENGINE}) and the real app, for one spot: 1-2, runner on second, one out, fifth inning, tied.</p>
        </div>
      </div>
      <Facts />
    </section>
  );
}

const FACTS = [
  { t: "One tap a pitch", d: "Ball, called strike, swing and miss, foul, in play or hit by pitch. Each has a key, so a keyboard case works too." },
  { t: "No signal needed", d: "The game runs on the iPad itself. Lose the signal in the dugout and it keeps calling; it syncs when you're back online." },
  { t: "You stay in charge", d: "Tap “He shook it off” or “Call my own” whenever you want, and fix a mis-tap with Undo." },
  { t: "Readable in the sun", d: "Night for the dugout and under the lights. Day for a bright afternoon, with darker lines and solid buttons." },
];
function Facts() {
  return (
    <div className="mk-wrap mk-in-after">
      <div className="mk-sec-head">
        <h3>Built for the dugout</h3>
        <p>The screen a coach actually uses: the call, the reason, the zone and six result buttons, readable at arm&apos;s length.</p>
      </div>
      <dl className="mk-dg-facts">
        {FACTS.map((f) => (
          <div key={f.t}><dt>{f.t}</dt><dd>{f.d}</dd></div>
        ))}
      </dl>
    </div>
  );
}
