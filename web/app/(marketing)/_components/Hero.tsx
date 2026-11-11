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
  const sec = useRef<HTMLElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const speed = useRef<HTMLSpanElement>(null);
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
            scene = mountHero(stage.current, AT_BAT.map(toScene), {
              accent: ACCENT, still, onPitch: setI,
              onBall: ({ x, y, show, text }) => { const l = speed.current; if (!l) return; l.style.transform = `translate(${x}px, ${y}px)`; l.dataset.show = show ? "1" : "0"; if (l.textContent !== text) l.textContent = text; },
              // a device too slow for the 3D keeps the last frame, and the call card steps on its own
              onStill: () => { timer = window.setInterval(() => setI((n) => (n + 1) % AT_BAT.length), 3200); },
            });
            if (scene) setOn(true);
          }).catch(() => {});
        })
      : () => {};
    if (!want3d && !still) timer = window.setInterval(() => setI((n) => (n + 1) % AT_BAT.length), 3200);
    return () => { dead = true; cancel(); window.clearInterval(timer); scene?.dispose(); };
  }, []);

  // as the hero scrolls away, the copy and the call lift and fade while the field pushes in and dims. The fade is on the
  // glass card itself: opacity on an ancestor would make that ancestor the card's backdrop and switch its blur off
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let kill = () => {};
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      if (!sec.current || !copy.current || !card.current || !stage.current) return;
      gsap.registerPlugin(ScrollTrigger);
      const st = { trigger: sec.current, start: "top top", end: "bottom top", scrub: true };
      // explicit start values: the tweens are created while the entrance is still running, and must not record its
      // half-faded state as where they start
      const a = gsap.fromTo(copy.current, { y: 0, opacity: 1 }, { y: -90, opacity: 0, ease: "none", immediateRender: false, scrollTrigger: { ...st, end: "70% top" } });
      const b = gsap.fromTo(card.current, { y: 0, opacity: 1 }, { y: -50, opacity: 0, ease: "none", immediateRender: false, scrollTrigger: { ...st, end: "60% top" } });
      const c = gsap.fromTo(stage.current, { scale: 1, opacity: 1 }, { scale: 1.07, opacity: 0.25, ease: "none", immediateRender: false, scrollTrigger: st });
      kill = () => [a, b, c].forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
    });
    return () => kill();
  }, []);

  const p = AT_BAT[i];
  return (
    <section className="mk-hero" aria-labelledby="hero-h" ref={sec}>
      <div className={`mk-hero-stage${on ? " is-on" : ""}`} ref={stage} />
      <span className="mk-speed" ref={speed} aria-hidden="true" />
      <div className="mk-hero-shade" aria-hidden="true" />
      <div className="mk-wrap mk-hero-grid">
        <div className="mk-hero-copy" ref={copy}>
          <h1 id="hero-h"><span className="mk-line"><span style={{ "--d": "0.15s" } as React.CSSProperties}>Every pitch called.</span></span> <span className="mk-line"><span style={{ "--d": "0.27s" } as React.CSSProperties}>Every call explained.</span></span></h1>
          <p className="mk-hero-lede">
            PitchIQ reads your pitcher&apos;s stuff today, the hitter and the count, then gives you a sign, a spot and the
            reason for it. Built for high school, travel and college coaches.
          </p>
          <div className="mk-hero-actions">
            <a className="mk-btn" href="#contact">Talk to us</a>
            <a className="mk-link" href="#at-bat">See how it calls</a>
          </div>
        </div>

        <div className="mk-call-wrap">
        <figure className="mk-call mk-glass" ref={card} aria-live="polite" aria-atomic="true">
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
      </div>
    </section>
  );
}
