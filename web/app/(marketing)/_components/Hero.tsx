"use client";

import { useEffect, useRef, useState } from "react";
import { AT_BAT, CELL, type Pitch } from "@/content/at-bat";
import { can3d, whenIdle } from "@/app/components/can3d";
import type { Hero as Scene, HeroPitch } from "./heroScene";

// The hero's live call: a glass panel over the 3D field that shows each call of a real engine at-bat as the ball is
// thrown (content/at-bat.ts says where the at-bat came from). Without WebGL the panel still steps through the at-bat
// over a still backdrop; under reduced motion it rests on the two-strike call.
const VELO: Record<Pitch["pitch"], number> = { Fastball: 86, Slider: 78, Changeup: 77, Curveball: 72 };
const KIND: Record<Pitch["pitch"], HeroPitch["kind"]> = { Fastball: "FB", Slider: "SL", Changeup: "CH", Curveball: "CB" };
const toScene = (p: Pitch): HeroPitch => ({ kind: KIND[p.pitch], velo: VELO[p.pitch], cell: p.spot === "Chase" ? "chase" : CELL[p.spot] });
const ACCENT = "#F04A3E";

export function Hero() {
  const stage = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scene: Scene | null = null, dead = false, timer = 0;
    if (still) setI(AT_BAT.length - 1);
    // the 3D scene can be skipped (reduced motion keeps a still render if WebGL is there)
    const webgl = (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } })();
    const want3d = still ? webgl : can3d();
    const cancel = want3d
      ? whenIdle(() => {
          import("./heroScene").then(({ mountHero }) => {
            if (dead || !stage.current) return;
            scene = mountHero(stage.current, AT_BAT.map(toScene), { accent: ACCENT, still, onPitch: setI });
            if (scene) setOn(true);
          }).catch(() => {});
        })
      : () => {};
    if (!want3d && !still) timer = window.setInterval(() => setI((n) => (n + 1) % AT_BAT.length), 3200);
    return () => { dead = true; cancel(); window.clearInterval(timer); scene?.dispose(); };
  }, []);

  const p = AT_BAT[i];
  return (
    <section className="mk-hero" aria-labelledby="hero-h">
      <div className={`mk-hero-stage${on ? " is-on" : ""}`} ref={stage} />
      <div className="mk-hero-shade" aria-hidden="true" />
      <div className="mk-wrap mk-hero-grid">
        <div className="mk-hero-copy">
          <h1 id="hero-h"><span>Every pitch called.</span> <span>Every call explained.</span></h1>
          <p className="mk-hero-lede">
            PitchIQ reads your pitcher&apos;s stuff today, the hitter and the count, then gives you a sign, a spot and the
            reason for it. Built for high school, travel and college coaches.
          </p>
          <div className="mk-hero-actions">
            <a className="mk-btn" href="#contact">Talk to us</a>
            <a className="mk-link" href="#between">See how it calls</a>
          </div>
        </div>

        <figure className="mk-call mk-glass" aria-live="polite" aria-atomic="true">
          <div className="mk-call-top">
            <span className="mk-call-count" aria-label={`Count ${p.balls} and ${p.strikes}`}>{p.balls}-{p.strikes}</span>
            <span className="mk-call-step">Pitch {i + 1} of {AT_BAT.length}</span>
          </div>
          <div className="mk-call-main" key={i}>
            <span className="mk-call-sign" aria-label={`Sign ${p.sign}`}>{p.sign}</span>
            <span className="mk-call-what">
              <b>{p.pitch}</b>
              <span>{p.spot}</span>
            </span>
          </div>
          <p className="mk-call-why" key={`w${i}`}>{p.why}</p>
          <figcaption>A real at-bat called by the PitchIQ engine, right-handed hitter, college D3.</figcaption>
        </figure>
      </div>
    </section>
  );
}
