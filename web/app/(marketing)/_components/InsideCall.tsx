"use client";

import { useEffect, useRef, useState } from "react";
import { CANDIDATES, CAND_PICK, CAND_ENGINE } from "@/content/candidates";
import type { Anchor, InsideScene } from "./insideScene";

// "Inside the call": a coach in the dugout taps the iPad (Runway footage, web/public/media/film/inside), the camera
// pushes into the screen, and inside it the engine works the call in 3D (insideScene.ts, real engine numbers), then the
// camera pulls back out to the iPad showing the call. Scrolled, pinned. Under reduced motion: the footage's first
// frame and the steps as a list.
// the push-in with the real app on the iPad (scripts/screen-composite.py), cut by scripts/film-frames.sh at 24 a second:
// "push" carries the 1-1 call the coach is about to log, "pull" the engine's 1-2 call; the pull-out plays "pull"
// backwards. Each opens on a locked-off hold; the tap is drawn over the hold as a touch ring on the Foul button.
const FRAMES = 121, HOLD = 24;
const src = (i: number) => i < FRAMES ? `/media/film/inside/push/${String(i + 1).padStart(4, "0")}.webp` : `/media/film/inside/pull/${String(i - FRAMES + 1).padStart(4, "0")}.webp`;
const TOUCH: [number, number] = [0.608, 0.628];
const SHOT_W = 1920, SHOT_H = 1080;
// the iPad on the held frame: centre and width, as fractions of the frame (track.json)
const IPAD = { x: 0.515, y: 0.56, w: 0.29 };
// along this section's scroll: push-in, inside, pull-out
const TAPR: [number, number] = [0.0, 0.07], PUSH: [number, number] = [0.07, 0.2], INSIDE: [number, number] = [0.17, 0.86], PULL: [number, number] = [0.86, 0.98];
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const span = (p: number, [a, b]: [number, number]) => clamp((p - a) / (b - a));

const kept = CANDIDATES.filter((c) => c.share > 0);
const SPOT_SHORT: Record<string, string> = { "down-away": "down and away", "up-away": "up and away", middle: "get it over", "down-in": "down and in", "up-in": "up and in", chase: "chase" };
const pick = kept.find((c) => c.pitch === CAND_PICK.pitch && c.quad === CAND_PICK.quad)!;
const READ_TEXT: Record<string, [string, string]> = {
  pitcher: ["His stuff today", "Slider is his best pitch, fastball at 86, changeup feel is down"],
  hitter: ["The hitter", "Same side, has seen two fastballs and a slider, last one up and away"],
  game: ["Count and game", "1-2, runner on second, one out, fifth, tied, 61 pitches"],
  umpire: ["The umpire", "Nothing logged yet, so it plays a normal zone"],
};
// the words over each stretch
const best = CANDIDATES[0];
const BEATS: { from: number; to: number; t: string; d: string }[] = [
  { from: 0.0, to: 0.17, t: "One tap.", d: "The coach logs the last pitch. The next call starts right away." },
  { from: 0.19, to: 0.34, t: "It reads the moment.", d: "His stuff today, the hitter, the count and game, and the umpire." },
  { from: 0.35, to: 0.46, t: "Then it weighs every call.", d: `All ${CANDIDATES.length} it could make. Taller means fewer runs likely to score.` },
  { from: 0.47, to: 0.55, t: "Clearly worse calls are out.", d: `${CANDIDATES.length - kept.length} dropped. ${kept.length} are left.` },
  { from: 0.555, to: 0.63, t: "The rest share the mix.", d: "The best calls get the biggest share, so the hitter can't sit on a pattern." },
  { from: 0.7, to: 0.86, t: "And it draws one.", d: `${pick.pitch}, ${SPOT_SHORT[pick.quad]}. It comes up ${Math.round(pick.share * 100)}% of the time here.` },
  { from: 0.9, to: 1.01, t: "Back on the iPad, with the reason.", d: "The call, the spot and why, before the catcher looks over." },
];

const FACTS = [
  { t: "One tap a pitch", d: "Ball, called strike, swing and miss, foul, in play or hit by pitch. Each has a key, so a keyboard case works too." },
  { t: "No signal needed", d: "The game runs on the iPad itself. Lose the signal in the dugout and it keeps calling; it syncs when you're back online." },
  { t: "You stay in charge", d: "Tap \u201cHe shook it off\u201d or \u201cCall my own\u201d whenever you want, and fix a mis-tap with Undo." },
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

export function InsideCall() {
  const sec = useRef<HTMLDivElement>(null);
  const film = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const beatEls = useRef<(HTMLDivElement | null)[]>([]);
  const anchorEls = useRef<Record<string, HTMLDivElement | null>>({});
  const touch = useRef<HTMLSpanElement>(null);
  const tagsEl = useRef<HTMLDivElement>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setStill(true); return; }
    const canvas = film.current, el = sec.current;
    if (!canvas || !el) return;
    const ctx = canvas.getContext("2d");
    let dead = false, kill = () => {}, scene: InsideScene | null = null;
    // the footage: frames load coarse to fine
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
          im.src = src(i);
          imgs[i] = im;
        }
      };
      pump();
    }
    // the nearest loaded frame within the same strip
    const nearest = (i: number) => { const lo = i < FRAMES ? 0 : FRAMES, hi = lo + FRAMES - 1; for (let d = 0; d < FRAMES; d++) { if (i - d >= lo && ok[i - d]) return i - d; if (i + d <= hi && ok[i + d]) return i + d; } return -1; };
    // where the footage sits, in CSS pixels. Wide screens: cover. Tall screens: the iPad, not the middle of the frame, is
    // what has to fit, so the shot is scaled to keep it (IPAD, as fractions of the frame) at most 88% of the width and
    // centred on it, with the frame's top and bottom edges faded into black.
    function fit() {
      const cw = canvas!.clientWidth, ch = canvas!.clientHeight, cover = Math.max(cw / SHOT_W, ch / SHOT_H);
      if (cw >= ch) return { sc: cover, ox: (cw - SHOT_W * cover) / 2, oy: (ch - SHOT_H * cover) / 2 };
      const sc = Math.min(cover, (0.88 * cw) / (IPAD.w * SHOT_W));
      const ox = Math.min(0, Math.max(cw - SHOT_W * sc, cw / 2 - IPAD.x * SHOT_W * sc));
      const oy = ch * 0.42 - IPAD.y * SHOT_H * sc;
      return { sc, ox, oy };
    }
    function paintFilm(idx: number) {
      if (!ctx) return;
      const k = nearest(Math.round(idx));
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      if (canvas!.width !== Math.round(canvas!.clientWidth * dpr) || canvas!.height !== Math.round(canvas!.clientHeight * dpr)) { canvas!.width = Math.round(canvas!.clientWidth * dpr); canvas!.height = Math.round(canvas!.clientHeight * dpr); }
      const { sc, ox, oy } = fit();
      if (touch.current) touch.current.style.transform = `translate3d(${ox + TOUCH[0] * SHOT_W * sc}px, ${oy + TOUCH[1] * SHOT_H * sc}px, 0)`;
      if (k < 0) return;
      const im = imgs[k]!, W = SHOT_W * sc * dpr, H = SHOT_H * sc * dpr, X = ox * dpr, Y = oy * dpr;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas!.width, canvas!.height);
      ctx.drawImage(im, X, Y, W, H);
      if (Y > 0 || Y + H < canvas!.height) {   // letterboxed: soften the frame's edges
        const f = Math.min(120 * dpr, H * 0.18);
        for (const [y0, y1] of [[Y, Y + f], [Y + H, Y + H - f]]) {
          const g = ctx.createLinearGradient(0, y0, 0, y1);
          g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1), canvas!.width, f);
        }
      }
    }
    function apply(p: number) {
      // which film frame: push-in forward, then the same frames backward for the pull-out
      // which frame of the strip: the tap, the push-in, then the push-in backwards for the pull-out
      const pushAt = (f: number) => HOLD + f * (FRAMES - 1 - HOLD);
      const idx = p < TAPR[1] ? HOLD : p < INSIDE[0] + 0.03 ? pushAt(span(p, PUSH)) : FRAMES + pushAt(1 - span(p, PULL));
      // the tap: a ring opens from his fingertip partway through the hold
      if (touch.current) { const t = span(p, [0.025, 0.065]); touch.current.style.opacity = String(t > 0 && t < 1 ? 1 - t : 0); touch.current.style.setProperty("--t", String(t)); }
      paintFilm(idx);
      // the hand-off: the glow fills the screen, flashes, and the scene is inside it
      const inIn = span(p, [INSIDE[0], INSIDE[0] + 0.05]), inOut = 1 - span(p, [INSIDE[1] - 0.04, INSIDE[1]]);
      const sOp = Math.min(inIn, inOut);
      if (stage.current) stage.current.style.opacity = String(sOp);
      if (tagsEl.current) tagsEl.current.style.opacity = String(sOp);   // the labels belong to the scene
      if (glow.current) glow.current.style.opacity = String(Math.max(0, 1 - Math.abs(p - INSIDE[0] - 0.015) / 0.035) * 0.9 + Math.max(0, 1 - Math.abs(p - INSIDE[1] + 0.01) / 0.03) * 0.8);
      scene?.set(span(p, INSIDE));
      BEATS.forEach((b, i) => {
        const node = beatEls.current[i];
        if (!node) return;
        const f = (p - b.from) / (b.to - b.from), e = 0.16;
        const o = f < 0 || f > 1 ? 0 : Math.min(1, f / e, (1 - f) / e);
        node.style.opacity = String(o);
        node.style.transform = `translate3d(0, ${(1 - Math.min(1, f / e)) * 18}px, 0)`;
        node.setAttribute("aria-hidden", o > 0.5 ? "false" : "true");
      });
    }
    const queue = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; apply(want); }); };

    const near = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      near.disconnect();
      Promise.all([import("./insideScene"), import("gsap"), import("gsap/ScrollTrigger")]).then(([{ mountInside }, { gsap }, { ScrollTrigger }]) => {
        if (dead || !stage.current || !sec.current) return;
        scene = mountInside(stage.current, {
          onAnchors: (A: Anchor[]) => {
            for (const a of A) {
              const n = anchorEls.current[a.id];
              if (!n) continue;
              // keep every label on screen and clear of the nav
              const W = stage.current?.clientWidth || window.innerWidth, half = n.offsetWidth / 2;
              const x = Math.max(half + 12, Math.min(W - half - 12, a.x)), y = Math.max(n.offsetHeight * 1.3 + 84, a.y);
              n.style.transform = `translate3d(${x}px, ${y}px, 0)`;
              n.dataset.show = a.show ? "1" : "0";
            }
          },
        });
        gsap.registerPlugin(ScrollTrigger);
        const st = ScrollTrigger.create({ trigger: sec.current, start: "top top", end: "bottom bottom", scrub: 0.4, onUpdate: (t) => { want = t.progress; queue(); } });
        want = st.progress; queue();
        kill = () => st.kill();
      });
    }, { rootMargin: "60% 0px" });
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
            {BEATS.slice(1, 6).map((b) => <li key={b.t}><b>{b.t}</b> {b.d}</li>)}
          </ol>
        </div>
        <Facts />
      </section>
    );
  }

  return (
    <section className="mk-in" id="dugout" aria-labelledby="in-h">
      <div className="mk-in-run" ref={sec}>
      <div className="mk-in-pin">
        <canvas className="mk-in-film" ref={film} aria-hidden="true" />
        <span className="mk-in-touch" ref={touch} aria-hidden="true" />
        <div className="mk-in-stage" ref={stage} />
        <div className="mk-in-glow" ref={glow} aria-hidden="true" />
        <div className="mk-in-shade" aria-hidden="true" />
        <h2 id="in-h" className="mk-sr">Inside the call</h2>
        <div className="mk-in-tags" ref={tagsEl}>
        {Object.entries(READ_TEXT).map(([id, [t, d]]) => (
          <div key={id} className="mk-in-tag mk-in-read" ref={(n) => { anchorEls.current[id] = n; }} aria-hidden="true"><b>{t}</b><span>{d}</span></div>
        ))}
        <div className="mk-in-tag mk-in-col" ref={(n) => { anchorEls.current.best = n; }} aria-hidden="true">
          <b>Best call: {best.pitch}, {SPOT_SHORT[best.quad]}</b><span>{best.cost.toFixed(2)} runs expected the rest of the inning</span>
        </div>
        {kept.map((c) => (
          <div key={`arc:${c.pitch}|${c.quad}`} className={`mk-in-tag mk-in-arc${c === pick ? " is-pick" : ""}`} ref={(n) => { anchorEls.current[`arc:${c.pitch}|${c.quad}`] = n; }} aria-hidden="true">
            <b>{Math.round(c.share * 100)}%</b><span>{c.pitch}, {SPOT_SHORT[c.quad]}</span>
          </div>
        ))}
        </div>
        <div className="mk-in-beats">
          {BEATS.map((b, i) => (
            <div key={b.t} className="mk-in-beat" ref={(n) => { beatEls.current[i] = n; }} style={{ opacity: i === 0 ? 1 : 0 }}>
              <p className="mk-in-t">{b.t}</p>
              <p className="mk-in-d">{b.d}</p>
            </div>
          ))}
        </div>
        <p className="mk-in-src">Real engine output (version {CAND_ENGINE}) for one spot: 1-2, runner on second, one out, fifth inning, tied.</p>
      </div>
      </div>
      <Facts />
    </section>
  );
}
