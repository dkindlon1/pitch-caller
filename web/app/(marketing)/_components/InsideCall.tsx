"use client";

import { useEffect, useRef, useState } from "react";
import { CANDIDATES, CAND_PICK, CAND_ENGINE } from "@/content/candidates";
import { CLIP, APP, SCREEN } from "@/content/inside-track";
import type { Anchor, InsideScene } from "./insideScene";

// "Inside the call", one pinned shot in four beats:
//   1 the tap   a coach in the dugout holds the iPad with the real app on it (Runway footage, the app tracked onto the
//               screen by scripts/screen-composite.py); he logs the foul and the camera pushes into the screen
//   2 reads     the camera keeps going into the app's own strike zone, which becomes the 3D zone (insideScene.ts); the
//               four reads pour into it
//   3 weigh     every call rises as a pillar of light; the 13 clearly worse burn out
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
const src = (i: number) => i < FRAMES ? `/media/film/inside/push/${String(i + 1).padStart(4, "0")}.webp` : `/media/film/inside/pull/${String(i - FRAMES + 1).padStart(4, "0")}.webp`;

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
// the crisp layers are laid out K times bigger than the screenshot and scaled down, so the browser rasterises them at
// (about) the size they reach at the end of the zoom instead of blowing up a small raster
const K = 3.6, BIG: Pt[] = LAYER.map(([x, y]) => [x * K, y * K]);
// the app was composited onto the footage 2% outside the tracked corners (to reach the glass's very edge); match it
const onGlass = (q: number[][]): Pt[] => { const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4; return q.map(([x, y]) => [cx + (x - cx) * 1.02, cy + (y - cy) * 1.02] as Pt); };

const kept = CANDIDATES.filter((c) => c.share > 0);
const SPOT: Record<string, string> = { "down-away": "down and away", "up-away": "up and away", middle: "middle", "down-in": "down and in", "up-in": "up and in", chase: "chase" };
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
  const stage = useRef<HTMLDivElement>(null);
  const before = useRef<HTMLDivElement>(null), after = useRef<HTMLDivElement>(null);
  const beforeDim = useRef<HTMLDivElement>(null), afterDim = useRef<HTMLDivElement>(null);
  const press = useRef<HTMLDivElement>(null), pressBtn = useRef<HTMLSpanElement>(null);
  const tagsEl = useRef<HTMLDivElement>(null);
  const srcEl = useRef<HTMLParagraphElement>(null);
  const beatEls = useRef<(HTMLDivElement | null)[]>([]);
  const anchorEls = useRef<Record<string, HTMLDivElement | null>>({});
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setStill(true); return; }
    const canvas = film.current, el = run.current;
    if (!canvas || !el) return;
    const ctx = canvas.getContext("2d");
    type ZT = (w: number, h: number) => { cx: number; cy: number; zw: number; zh: number };
    let dead = false, kill = () => {}, scene: InsideScene | null = null, zoneTarget: ZT | null = null;
    // the footage: both strips, coarse to fine
    const imgs: (HTMLImageElement | null)[] = new Array(2 * FRAMES).fill(null), ok: boolean[] = new Array(2 * FRAMES).fill(false);
    let want = 0, raf = 0;
    {
      const order: number[] = [], seen = new Set<number>();
      for (const base of [0, FRAMES]) for (const step of [16, 8, 4, 2, 1]) for (let i = 0; i < FRAMES; i += step) if (!seen.has(base + i)) { seen.add(base + i); order.push(base + i); }
      let next = 0, active = 0;
      const pump = () => {
        while (!dead && active < 6 && next < order.length) {
          const i = order[next++], im = new window.Image();
          active++; im.decoding = "async";
          im.onload = () => { ok[i] = true; active--; queue(); pump(); };
          im.onerror = () => { active--; pump(); };
          im.src = src(i); imgs[i] = im;
        }
      };
      pump();
    }
    const nearest = (i: number) => { const lo = i < FRAMES ? 0 : FRAMES, hi = lo + FRAMES - 1; for (let d = 0; d < FRAMES; d++) { if (i - d >= lo && ok[i - d]) return i - d; if (i + d <= hi && ok[i + d]) return i + d; } return -1; };
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
      ctx.drawImage(imgs[k]!, X, Y, W, H);
      if (Y > 0 || Y + H < canvas!.height) {   // letterboxed on tall screens: fade the frame's top and bottom into black
        const e = Math.min(120 * dpr, H * 0.18);
        for (const [y0, y1] of [[Y, Y + e], [Y + H, Y + H - e]]) {
          const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1), canvas!.width, e);
        }
      }
    }
    // the crisp screenshot's corners at zoom z: from the footage's screen (z = 0) into the app's zone on zoneTarget's box
    // (z = 1). The zoom is geometric (equal scroll, equal ratio) and the perspective flattens out on the way.
    function crispCorners(f: Fit, z: number): Pt[] {
      const start = onGlass(SCREEN[LAST]).map((p) => toScreen(f, p));
      const H0 = homography(LAYER, start);
      const zc: Pt = [(APP.zone.x + APP.zone.w / 2) * APP_W, (APP.zone.y + APP.zone.h / 2) * APP_H];
      const zt = zoneTarget ? zoneTarget(f.cw, f.ch) : { cx: f.cw / 2, cy: f.ch / 2, zw: 100, zh: 125 };
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
      // the crisp screenshots and the cuts
      if (before.current && beforeDim.current) {
        const z = span(p, T.zoomIn);
        const op = p < T.toCrisp[0] ? 0 : Math.min(span(p, T.toCrisp), 1 - span(p, T.crispOut));
        before.current.style.opacity = String(op);
        if (op > 0) before.current.style.transform = css(homography(BIG, crispCorners(f, z)));
        beforeDim.current.style.setProperty("--dim", String(0.98 * inOut(clamp(z * 1.25))));
      }
      if (after.current && afterDim.current) {
        const z = 1 - span(p, T.zoomOut);
        const op = Math.min(span(p, T.sceneOut), 1 - span(p, T.crispGone));
        after.current.style.opacity = String(op);
        if (op > 0) after.current.style.transform = css(homography(BIG, crispCorners(f, z)));
        afterDim.current.style.setProperty("--dim", String(0.98 * inOut(clamp(z * 1.25))));
      }
      if (srcEl.current) srcEl.current.style.opacity = String(Math.max(1 - span(p, [0.18, 0.2]), span(p, [0.322, 0.34])) * Math.max(1 - span(p, [0.78, 0.8]), span(p, [0.93, 0.98])));
      const sOp = Math.min(span(p, T.sceneIn), 1 - span(p, T.sceneOut));
      if (stage.current) stage.current.style.opacity = String(sOp);
      if (tagsEl.current) tagsEl.current.style.opacity = String(sOp);
      scene?.set(span(p, T.scene));
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
      if (!e.isIntersecting) return;
      near.disconnect();
      Promise.all([import("./insideScene"), import("gsap"), import("gsap/ScrollTrigger")]).then(([mod, { gsap }, { ScrollTrigger }]) => {
        if (dead || !stage.current || !run.current) return;
        zoneTarget = mod.zoneTarget;
        scene = mod.mountInside(stage.current, {
          onAnchors: (A: Anchor[]) => {
            const W = stage.current?.clientWidth || window.innerWidth, M = W < 600 ? 14 : 48, narrow = W < 600;
            // place each label (its box sits above its point), inside the edges and below the nav, then push apart any on
            // the same side that would touch
            const boxes = A.map((a) => {
              const n = anchorEls.current[a.id];
              if (!n) return null;
              const bw = n.offsetWidth, bh = n.offsetHeight;
              const side = a.x < W / 2 ? 0 : 1;
              let x = Math.max(bw / 2 + M, Math.min(W - bw / 2 - M, a.x));
              if (narrow && a.id in READ_TEXT) x = side ? Math.max(x, W / 2 + bw / 2 + 6) : Math.min(x, W / 2 - bw / 2 - 6);   // phones: each side keeps to its half
              return { a, n, bw, bh, x, y: Math.max(bh * 1.3 + 110, a.y), side };
            }).filter((b): b is NonNullable<typeof b> => !!b);
            for (const side of [0, 1]) {
              const g = boxes.filter((b) => b.side === side && b.a.show).sort((p, q) => p.y - q.y);
              for (let i = 1; i < g.length; i++) { const need = g[i - 1].y + g[i].bh + 16; if (g[i].y < need) g[i].y = need; }
            }
            for (const b of boxes) {
              b.n.style.transform = `translate3d(${b.x}px, ${b.y}px, 0)`;
              b.n.dataset.show = b.a.show ? "1" : "0";
            }
          },
        });
        gsap.registerPlugin(ScrollTrigger);
        const st = ScrollTrigger.create({ trigger: run.current, start: "top top", end: "bottom bottom", scrub: 0.5, onUpdate: (t) => { want = t.progress; queue(); } });
        want = st.progress; queue();
        kill = () => st.kill();
      });
    }, { rootMargin: "80% 0px" });
    near.observe(el);
    const onResize = () => queue();
    window.addEventListener("resize", onResize);
    return () => { dead = true; near.disconnect(); kill(); scene?.dispose(); cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); imgs.forEach((im) => { if (im) im.src = ""; }); };
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

  // the crisp screenshot, with the zone panel laid over it from its 6x capture so it stays sharp all the way in; everything
  // outside that panel dims (feathered like the 3D copy of the panel, so the two match at the cut)
  const hi = { left: `${APP.zoneHi.x * 100}%`, top: `${APP.zoneHi.y * 100}%`, width: `${APP.zoneHi.w * 100}%`, height: `${APP.zoneHi.h * 100}%` };
  const F = 34 * K;   // the feather, matching the 3D copy's (34 app pixels)
  const dimRect = { left: `calc(${APP.zoneHi.x * 100}% + ${F / 2}px)`, top: `calc(${APP.zoneHi.y * 100}% + ${F / 2}px)`, width: `calc(${APP.zoneHi.w * 100}% - ${F}px)`, height: `calc(${APP.zoneHi.h * 100}% - ${F}px)`, boxShadow: `0 0 ${2 * F}px 99999px rgba(2, 3, 6, var(--dim, 0))`, borderRadius: F };
  const crisp = (ref: React.RefObject<HTMLDivElement | null>, dim: React.RefObject<HTMLDivElement | null>, file: string, zoneFile: string) => (
    <div className="mk-in-app" ref={ref} aria-hidden="true" style={{ width: APP_W * K, height: APP_H * K }}>
      <img src={`/marketing/${file}`} alt="" width={APP_W} height={APP_H} decoding="async" />
      <img className="mk-in-app-zone" src={`/marketing/${zoneFile}`} alt="" style={hi} decoding="async" />
      <div className="mk-in-app-dim" ref={dim} style={dimRect} />
    </div>
  );

  return (
    <section className="mk-in" id="dugout" aria-labelledby="in-h">
      <div className="mk-in-run" ref={run}>
        <div className="mk-in-pin">
          <canvas className="mk-in-film" ref={film} aria-hidden="true" />
          <div className="mk-in-press" ref={press} aria-hidden="true">
            <span ref={pressBtn} style={{ left: `${APP.foul.x * 100}%`, top: `${APP.foul.y * 100}%`, width: `${APP.foul.w * 100}%`, height: `${APP.foul.h * 100}%` }} />
          </div>
          {crisp(before, beforeDim, "app-call-before.png", "app-zone-before.png")}
          {crisp(after, afterDim, "app-call-after.png", "app-zone-after.png")}
          <div className="mk-in-stage" ref={stage} />
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
