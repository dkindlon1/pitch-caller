"use client";

import { useEffect, useRef, useState } from "react";
import { AT_BAT, CELL, type Pitch } from "@/content/at-bat";
import { can3d } from "@/app/components/can3d";
import type { AtBatScene } from "./atbatScene";
import type { FieldPitch } from "./field";

// "One at-bat": a real engine at-bat played like a broadcast replay. It plays on its own once most of the chapter is on
// screen and pauses when it leaves; the rail jumps to a pitch, and there's a pause button. Each pitch: the windup at
// about real speed, the flight slowed to about a third (a real pitch is under half a second), then the result. Under
// reduced motion it's a plain list of the four calls beside a still of all four flights.
const VELO: Record<Pitch["pitch"], number> = { Fastball: 86, Slider: 78, Changeup: 77, Curveball: 72 };
const KIND: Record<Pitch["pitch"], FieldPitch["kind"]> = { Fastball: "FB", Slider: "SL", Changeup: "CH", Curveball: "CB" };
const toField = (p: Pitch): FieldPitch => ({ kind: KIND[p.pitch], velo: VELO[p.pitch], cell: p.spot === "Chase" ? "chase" : CELL[p.spot] });
const ACCENT = "#F04A3E";
declare global { interface Window { __mkAbProgress?: number } }
const START = 0.06, EACH = 0.21;   // keep in step with atbatScene.ts SPAN

// the replay's clock: keyframes of (seconds, chapter progress). The side shot (third pitch) is a still, so its windup
// is short
const W_UP = [2.0, 2.0, 0.9, 2.0], FLIGHT = 1.4, AFTER = 2.3, INTRO = 2.4, OUTRO = 1.4, HOLD = 7;
const KEYS: [number, number][] = (() => {
  const k: [number, number][] = [[0, 0], [INTRO, START]];
  let t = INTRO;
  for (let i = 0; i < 4; i++) {
    const b = START + i * EACH;
    t += W_UP[i]; k.push([t, b + EACH * 0.38]);
    t += FLIGHT; k.push([t, b + EACH * 0.78]);
    t += AFTER; k.push([t, b + EACH * (i === 3 ? 0.995 : 1)]);
  }
  t += OUTRO; k.push([t, 1]);
  return k;
})();
const T_END = KEYS[KEYS.length - 1][0];
const pAt = (t: number) => {
  let j = 0;
  while (j < KEYS.length - 2 && t > KEYS[j + 1][0]) j++;
  const [t0, p0] = KEYS[j], [t1, p1] = KEYS[j + 1];
  return p0 + (p1 - p0) * Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
};
const tOfPitch = (i: number) => KEYS[1 + i * 3][0];   // when pitch i's windup starts

type View = { i: number; landed: boolean; phase: "intro" | "pitch" | "end"; side: boolean };
function viewAt(p: number): View {
  const i = Math.max(0, Math.min(3, Math.floor((p - START) / EACH)));
  const u = (p - START - i * EACH) / EACH;
  // landed and side follow atbatScene.ts: the flight ends 78% into a pitch's stretch; the side shot is up from 0.48 to 0.69 (the card moves with the cut)
  return { i, landed: u >= 0.78, phase: p < START ? "intro" : p >= 0.9 ? "end" : "pitch", side: p >= 0.48 && p < 0.69 };
}

export function AtBat() {
  const sec = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const hoopLabel = useRef<HTMLSpanElement>(null);
  const speed = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState<View>({ i: 0, landed: false, phase: "intro", side: false });
  const [still, setStill] = useState(false);
  const [on, setOn] = useState(false);

  // which layout to show is decided first; the scene loads in a second pass, once that layout's elements are in place
  const [mode, setMode] = useState<"" | "scroll" | "still">("");
  const [paused, setPaused] = useState(false);
  const ctl = useRef<{ seek: (t: number) => void; toggle: () => void }>({ seek: () => {}, toggle: () => {} });
  const fill = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStill(reduced);
    setMode(reduced ? "still" : "scroll");
  }, []);

  useEffect(() => {
    if (!mode) return;
    const reduced = mode === "still";
    let scene: AtBatScene | null = null, dead = false, kill = () => {};
    const webgl = reduced ? (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } })() : can3d();
    // load the scene when the chapter is a screen away
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      // the film draws on a 2D canvas, so the scene loads even without WebGL (the graphics over it need WebGL)
      void webgl;
      import("./atbatScene").then(({ mountAtBat }) => {
        if (dead || !stage.current) return;
        scene = mountAtBat(stage.current, AT_BAT.map(toField), {
          accent: ACCENT,
          // kept on screen: on a phone the hoop sits near the left edge
          onHoop: ({ x, y, show }) => { const l = hoopLabel.current; if (l) { const half = l.offsetWidth / 2 || 110, cx = Math.min(window.innerWidth - half - 12, Math.max(half + 12, x)); l.style.transform = `translate(${cx - half}px, ${y}px)`; l.dataset.show = show ? "1" : "0"; } },
          onLabel: ({ x, y, show }) => { const l = label.current; if (l) { l.style.transform = `translate(${x}px, ${y}px)`; l.dataset.show = show ? "1" : "0"; } },
          onBall: ({ x, y, show, text }) => { const l = speed.current; if (!l) return; l.style.transform = `translate(${x}px, ${y}px)`; l.dataset.show = show ? "1" : "0"; if (l.textContent !== text) l.textContent = text; },
        });
        if (!scene) return;
        setOn(true);
        if (window.__mkAbProgress !== undefined) scene.set(window.__mkAbProgress);
        if (reduced) scene.set(1);
      }).catch(() => {});
      if (reduced) return;
      // the replay: a clock that runs while most of the chapter is on screen and the page is visible
      let last = "", t = 0, prev = 0, raf = 0, inView = false, user = false;
      const apply = (p: number) => {
        window.__mkAbProgress = p;
        scene?.set(p, true);
        const nv = viewAt(p), key = `${nv.i}${nv.landed}${nv.phase}${nv.side}`;
        if (key !== last) { last = key; setV(nv); }
        // the current pitch's rail button fills as the pitch plays
        const f = fill.current;
        if (f) { const u = Math.max(0, Math.min(1, (p - START - nv.i * EACH) / EACH)); f.style.transform = `scaleX(${nv.phase === "pitch" ? u : 0})`; }
      };
      const loop = (now: number) => {
        raf = 0;
        const dt = prev ? Math.min(0.1, (now - prev) / 1000) : 0;
        prev = now;
        t += dt;
        // after the strikeout holds, it starts over from the first pitch
        if (t > T_END + HOLD) t = tOfPitch(0);
        apply(pAt(t));
        if (inView && !user && !document.hidden) raf = requestAnimationFrame(loop); else prev = 0;
      };
      const run = () => { if (!raf && inView && !user && !document.hidden) { prev = 0; raf = requestAnimationFrame(loop); } };
      const stop = () => { cancelAnimationFrame(raf); raf = 0; prev = 0; };
      ctl.current = {
        seek: (to) => { t = to; apply(pAt(t)); if (user) { user = false; setPaused(false); } run(); },
        toggle: () => { user = !user; setPaused(user); if (user) stop(); else { if (t >= T_END) t = tOfPitch(0); run(); } },
      };
      const seen = new IntersectionObserver(([e]) => { inView = e.intersectionRatio >= 0.5; if (inView) run(); else stop(); }, { threshold: [0, 0.5, 1] });
      if (sec.current) seen.observe(sec.current);
      const onVis = () => { if (document.hidden) stop(); else run(); };
      document.addEventListener("visibilitychange", onVis);
      apply(0);
      kill = () => { stop(); seen.disconnect(); document.removeEventListener("visibilitychange", onVis); };
    }, { rootMargin: "40% 0px" });
    if (sec.current) io.observe(sec.current);
    return () => { dead = true; io.disconnect(); kill(); scene?.dispose(); };
  }, [mode]);

  // the rail: replay from that pitch's windup
  const jump = (i: number) => ctl.current.seek(tOfPitch(i));

  const p = AT_BAT[v.i];
  const result = v.i === AT_BAT.length - 1 ? "Strikeout swinging" : p.result;

  if (still) {
    return (
      <section className={`mk-ab is-still${on ? " is-on" : ""}`} id="at-bat" ref={sec} aria-labelledby="ab-h">
        <div className="mk-ab-stage" ref={stage} />
        <div className="mk-wrap mk-ab-list">
          <h2 id="ab-h">One at-bat, four calls</h2>
          <p className="mk-ab-sub">A right-handed hitter&apos;s first time up, called by the PitchIQ engine.</p>
          <ol>
            {AT_BAT.map((x, n) => (
              <li key={n} className="mk-glass mk-ab-card">
                <span className="mk-ab-count">{x.balls}-{x.strikes}</span>
                <b>{x.pitch}, {x.spot.toLowerCase()}</b>
                <span>{x.why}</span>
                <span className="mk-ab-res">{n === 3 ? "Strikeout swinging" : x.result}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    );
  }

  return (
    <section className={`mk-ab is-${v.phase}${v.side ? " is-side" : ""}${on ? " is-on" : ""}`} id="at-bat" ref={sec} aria-labelledby="ab-h" tabIndex={-1}>
      <div className="mk-ab-pin">
        <div className="mk-ab-stage" ref={stage} />
        <div className="mk-ab-shade" aria-hidden="true" />
        <span className="mk-ab-dist" ref={label} aria-hidden="true">60 ft 6 in</span>
        <span className="mk-ab-dist mk-ab-hoop" ref={hoopLabel} aria-hidden="true">Hitter decides here, 24 ft out</span>
        <span className="mk-speed" ref={speed} aria-hidden="true" />
        <div className="mk-ab-ctl">
          {v.phase === "end"
            ? <button type="button" className="mk-chip" onClick={() => jump(0)} aria-label="Replay the at-bat">Replay</button>
            : <button type="button" className="mk-chip" onClick={() => ctl.current.toggle()} aria-label={paused ? "Play the at-bat" : "Pause the at-bat"}>{paused ? "Play" : "Pause"}</button>}
        </div>

        <div className="mk-wrap mk-ab-ui">
          <div className="mk-ab-intro">
            <h2 id="ab-h">One at-bat, four calls</h2>
            <p>A right-handed hitter&apos;s first time up, called by the PitchIQ engine, pitch by pitch.</p>
          </div>

          <div className="mk-ab-panel">
            <ol className="mk-ab-rail" aria-label="Pitches in this at-bat">
              {AT_BAT.map((x, n) => (
                <li key={n}>
                  <button type="button" onClick={() => jump(n)} aria-current={v.phase === "pitch" && n === v.i ? "step" : undefined}
                    className={n < v.i || v.phase === "end" ? "is-done" : n === v.i && v.phase !== "intro" ? "is-now" : ""}>
                    {n === v.i && v.phase === "pitch" ? <span className="mk-ab-fill" ref={fill} aria-hidden="true" /> : null}
                    <i className="mk-pt" data-k={x.pitch} aria-hidden="true" /><span className="mk-sr">Pitch {n + 1}, {x.pitch.toLowerCase()}, count </span>{x.balls}-{x.strikes}
                  </button>
                </li>
              ))}
            </ol>

            <article className="mk-glass mk-ab-card" aria-live="polite">
              <div className="mk-ab-head">
                <span className="mk-ab-count">{p.balls}-{p.strikes}</span>
                <span className="mk-ab-n">Pitch {v.i + 1} of 4</span>
              </div>
              <div className="mk-ab-call" key={`c${v.i}`}>
                <span className="mk-ab-sign" aria-label={`Sign ${p.sign}`}>{p.sign}</span>
                <span><b><i className="mk-pt" data-k={p.pitch} aria-hidden="true" />{p.pitch}</b><span>{p.spot}</span></span>
              </div>
              <p className="mk-ab-why" key={`w${v.i}`}><span className="mk-sr">Why: </span>{p.why}</p>
              <p className={`mk-ab-res${v.landed || v.phase === "end" ? " is-shown" : ""}`}>{result}</p>
            </article>

            <p className={`mk-ab-note${v.side ? " is-shown" : ""}`}>From up the line: the fastball rides, the slider drops off its line. Both look alike until the hitter has to decide.</p>
          </div>

          <div className="mk-ab-end">
            <p className="mk-ab-k">Strikeout swinging.</p>
            <p>Four calls, each with the reason it was made. That&apos;s what a coach sees on the iPad, one pitch at a time.</p>
            <div className="mk-glass mk-ab-board" aria-label="The at-bat, pitch by pitch">
              <div className="mk-ab-board-h"><b>The at-bat</b><span>Right-handed hitter, first time up</span></div>
              <ol>
                {AT_BAT.map((x, n) => (
                  <li key={n} data-k={x.pitch} style={{ transitionDelay: `${120 + n * 90}ms` }}>
                    <i aria-hidden="true" />
                    <span className="mk-ab-board-c">{x.balls}-{x.strikes}</span>
                    <b>{x.pitch}</b>
                    <span className="mk-ab-board-s">{x.spot}</span>
                    <span className="mk-ab-board-r">{n === 3 ? "Strikeout" : x.result}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
