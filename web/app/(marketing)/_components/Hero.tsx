"use client";

import { useEffect, useRef, useState } from "react";
import { AT_BAT } from "@/content/at-bat";
import { ScrollFilm, type Beat } from "./ScrollFilm";

// The hero: a night flyover of a ballpark (a Runway Gen-4.5 clip, web/public/media/film/flyover) that plays as you
// scroll, from high over the outfield down to a catcher's view behind the plate, which is where the at-bat chapter
// picks up. Over it, the headline and a glass panel stepping through a real engine at-bat (content/at-bat.ts says
// where it came from). Under reduced motion the film is its first frame and the panel rests on the two-strike call.
const FRAMES = 121;

// the line that lands as the camera comes down behind the plate
const BEATS: Beat[] = [
  { from: 0.62, to: 1.25, className: "mk-hero-beat", node: <p className="mk-hero-late">Under the lights, every pitch is a decision.</p> },
];

export function Hero() {
  const copy = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setI(AT_BAT.length - 1); return; }
    const t = window.setInterval(() => setI((n) => (n + 1) % AT_BAT.length), 3200);
    return () => window.clearInterval(t);
  }, []);

  // as the camera starts down, the copy and the call lift and fade. The fade is on the glass card itself: opacity on an
  // ancestor would make that ancestor the card's backdrop and switch its blur off
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let kill = () => {};
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      const sec = document.getElementById("hero");
      if (!sec || !copy.current || !card.current || !shade.current) return;
      gsap.registerPlugin(ScrollTrigger);
      const st = { trigger: sec, start: "top top", end: () => `+=${Math.round(window.innerHeight * 0.9)}`, scrub: true };
      // explicit start values: the tweens are created while the entrance is still running, and must not record its
      // half-faded state as where they start
      const a = gsap.fromTo(copy.current, { y: 0, opacity: 1 }, { y: -90, opacity: 0, ease: "none", immediateRender: false, scrollTrigger: st });
      const b = gsap.fromTo(card.current, { y: 0, opacity: 1 }, { y: -60, opacity: 0, ease: "none", immediateRender: false, scrollTrigger: st });
      // the shade that keeps the copy readable lifts with it, so the field brightens as the camera comes down
      const c = gsap.fromTo(shade.current, { opacity: 1 }, { opacity: 0.25, ease: "none", immediateRender: false, scrollTrigger: st });
      kill = () => [a, b, c].forEach((x) => { x.scrollTrigger?.kill(); x.kill(); });
    });
    return () => kill();
  }, []);

  const p = AT_BAT[i];
  return (
    <ScrollFilm id="hero" name="flyover" wide={FRAMES} tall={FRAMES} length={340} poster="/media/film/flyover/wide-poster.jpg" beats={BEATS} className="mk-hfilm" labelledBy="hero-h">
      <div className="mk-hero">
        <div className="mk-hero-shade" ref={shade} aria-hidden="true" />
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
      </div>
    </ScrollFilm>
  );
}
