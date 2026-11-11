"use client";

import { useEffect, useRef, useState } from "react";
import { AT_BAT, CELL, type Pitch } from "@/content/at-bat";
import { can3d } from "@/app/components/can3d";
import type { AtBatScene } from "./atbatScene";
import type { FieldPitch } from "./field";

// "One at-bat": the hero's at-bat again, slowed down and driven by scroll. The section is tall; inside it the field
// and the glass call card stay on screen while the scroll throws each pitch. Under reduced motion it's a plain list
// of the four calls beside a still of all four flights.
const VELO: Record<Pitch["pitch"], number> = { Fastball: 86, Slider: 78, Changeup: 77, Curveball: 72 };
const KIND: Record<Pitch["pitch"], FieldPitch["kind"]> = { Fastball: "FB", Slider: "SL", Changeup: "CH", Curveball: "CB" };
const toField = (p: Pitch): FieldPitch => ({ kind: KIND[p.pitch], velo: VELO[p.pitch], cell: p.spot === "Chase" ? "chase" : CELL[p.spot] });
const ACCENT = "#F04A3E";
const START = 0.06, EACH = 0.21;   // keep in step with atbatScene.ts SPAN

type View = { i: number; landed: boolean; phase: "intro" | "pitch" | "end"; side: boolean };
function viewAt(p: number): View {
  const i = Math.max(0, Math.min(3, Math.floor((p - START) / EACH)));
  const u = (p - START - i * EACH) / EACH;
  return { i, landed: u >= 0.66, phase: p < START ? "intro" : p >= 0.9 ? "end" : "pitch", side: p > 0.44 && p < 0.64 };
}

export function AtBat() {
  const sec = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState<View>({ i: 0, landed: false, phase: "intro", side: false });
  const [still, setStill] = useState(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStill(reduced);
    let scene: AtBatScene | null = null, dead = false, kill = () => {};
    const webgl = reduced ? (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } })() : can3d();
    // load the scene when the chapter is a screen away
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      if (webgl) import("./atbatScene").then(({ mountAtBat }) => {
        if (dead || !stage.current) return;
        scene = mountAtBat(stage.current, AT_BAT.map(toField), {
          accent: ACCENT,
          onLabel: ({ x, y, show }) => { const l = label.current; if (l) { l.style.transform = `translate(${x}px, ${y}px)`; l.dataset.show = show ? "1" : "0"; } },
        });
        if (!scene) return;
        setOn(true);
        if (reduced) scene.set(1);
      }).catch(() => {});
      if (reduced) return;
      Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
        if (dead || !sec.current) return;
        gsap.registerPlugin(ScrollTrigger);
        let last = "";
        const st = ScrollTrigger.create({
          trigger: sec.current, start: "top top", end: "bottom bottom",
          onUpdate: (self) => {
            scene?.set(self.progress);
            const nv = viewAt(self.progress), key = `${nv.i}${nv.landed}${nv.phase}${nv.side}`;
            if (key !== last) { last = key; setV(nv); }
          },
        });
        kill = () => st.kill();
      });
    }, { rootMargin: "40% 0px" });
    if (sec.current) io.observe(sec.current);
    return () => { dead = true; io.disconnect(); kill(); scene?.dispose(); };
  }, []);

  // the rail: jump the scroll to the middle of a pitch's stretch (its flight just landed)
  const jump = (i: number) => {
    const el = sec.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY, len = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + len * (START + i * EACH + EACH * 0.72), behavior: "smooth" });
  };

  const p = AT_BAT[v.i];
  const result = v.i === AT_BAT.length - 1 ? "Strikeout swinging" : p.result;

  if (still) {
    return (
      <section className="mk-ab is-still" id="at-bat" aria-labelledby="ab-h">
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
    <section className={`mk-ab is-${v.phase}${on ? " is-on" : ""}`} id="at-bat" ref={sec} aria-labelledby="ab-h" tabIndex={-1}>
      <div className="mk-ab-pin">
        <div className="mk-ab-stage" ref={stage} />
        <div className="mk-ab-shade" aria-hidden="true" />
        <span className="mk-ab-dist" ref={label} aria-hidden="true">60 ft 6 in</span>

        <div className="mk-wrap mk-ab-ui">
          <div className="mk-ab-intro">
            <h2 id="ab-h">One at-bat, four calls</h2>
            <p>A right-handed hitter&apos;s first time up, called by the PitchIQ engine. Scroll to throw each pitch.</p>
          </div>

          <div className="mk-ab-panel">
            <ol className="mk-ab-rail" aria-label="Pitches in this at-bat">
              {AT_BAT.map((x, n) => (
                <li key={n}>
                  <button type="button" onClick={() => jump(n)} aria-current={v.phase === "pitch" && n === v.i ? "step" : undefined}
                    className={n < v.i || v.phase === "end" ? "is-done" : n === v.i && v.phase !== "intro" ? "is-now" : ""}>
                    <span className="mk-sr">Pitch {n + 1}, count </span>{x.balls}-{x.strikes}
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
                <span><b>{p.pitch}</b><span>{p.spot}</span></span>
              </div>
              <p className="mk-ab-why" key={`w${v.i}`}><span className="mk-sr">Why: </span>{p.why}</p>
              <p className={`mk-ab-res${v.landed || v.phase === "end" ? " is-shown" : ""}`}>{result}</p>
            </article>

            <p className={`mk-ab-note${v.side ? " is-shown" : ""}`}>From up the line: the fastball rides, the slider drops off its line.</p>
          </div>

          <div className="mk-ab-end">
            <p className="mk-ab-k">Strikeout swinging.</p>
            <p>Four calls, each with the reason it was made. That&apos;s what a coach sees on the iPad, one pitch at a time.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
