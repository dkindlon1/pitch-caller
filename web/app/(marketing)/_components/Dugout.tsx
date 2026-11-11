"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import night from "@/public/marketing/app-night.png";
import day from "@/public/marketing/app-day.png";
import type { IpadScene } from "./ipadScene";

// "In the dugout": the real live-calling screen from the iPad app (captured from app/dist/pitch-caller.html at iPad
// landscape size, two pitches into a game), in Night and Day. The tablet settles flat as it scrolls into view.
const FACTS = [
  { t: "One tap a pitch", d: "Ball, called strike, swing and miss, foul, in play or hit by pitch. Each has a key, so a keyboard case works too." },
  { t: "No signal needed", d: "The game runs on the iPad itself. Lose the signal in the dugout and it keeps calling; it syncs when you're back online." },
  { t: "You stay in charge", d: "Tap “He shook it off” or “Call my own” whenever you want, and fix a mis-tap with Undo." },
  { t: "Readable in the sun", d: "Night for the dugout and under the lights. Day for a bright afternoon, with darker lines and solid buttons." },
];

export function Dugout() {
  const [mode, setMode] = useState<"night" | "day">("night");
  const [three, setThree] = useState(false);
  const tilt = useRef<HTMLDivElement>(null);
  const sec = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<IpadScene | null>(null);

  // the tablet in 3D where WebGL is there and motion is welcome; otherwise the flat one below tilts into place
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dead = false, kill = () => {};
    const el = stage.current;
    if (!el) return;
    const start = () => Promise.all([import("./ipadScene"), import("gsap"), import("gsap/ScrollTrigger")]).then(([{ mountIpad }, { gsap }, { ScrollTrigger }]) => {
      if (dead || !stage.current || !sec.current) return;
      const s = still ? null : mountIpad(stage.current, { night: night.src, day: day.src }, { onReady: () => setThree(true) });
      gsap.registerPlugin(ScrollTrigger);
      if (s) {
        scene.current = s;
        const st = ScrollTrigger.create({ trigger: stage.current, start: "top bottom", end: "center 55%", scrub: 0.8, onUpdate: (t) => s.set(t.progress) });
        s.set(st.progress);
        kill = () => { st.kill(); s.dispose(); scene.current = null; };
      } else if (!still && tilt.current) {
        const tw = gsap.fromTo(tilt.current, { rotateX: 24, rotateZ: -4, y: 60, scale: 0.92 }, { rotateX: 4, rotateZ: 0, y: 0, scale: 1, ease: "none",
          scrollTrigger: { trigger: sec.current, start: "top bottom", end: "center center", scrub: 0.8 } });
        kill = () => { tw.scrollTrigger?.kill(); tw.kill(); };
      }
    });
    // load it only as the chapter comes near
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); start(); } }, { rootMargin: "80% 0px" });
    io.observe(el);
    return () => { dead = true; io.disconnect(); kill(); };
  }, []);
  useEffect(() => { scene.current?.mode(mode); }, [mode]);

  return (
    <section className={`mk-dg is-${mode}`} id="dugout" ref={sec} aria-labelledby="dg-h" tabIndex={-1}>
      <div className="mk-wrap">
        <div className="mk-dg-head">
          <div className="mk-sec-head">
            <h2 id="dg-h">Built for the dugout</h2>
            <p>The screen a coach actually uses: the call, the reason, the zone and six result buttons, readable at arm&apos;s length.</p>
          </div>
          <div className="mk-seg mk-glass" role="radiogroup" aria-label="Screen mode">
            {(["night", "day"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "is-on" : ""} onClick={() => setMode(m)}>
                {m === "night" ? "Night" : "Day"}
              </button>
            ))}
          </div>
        </div>

        <div className={`mk-dg-scene${three ? " is-3d" : ""}`}>
          <div className="mk-dg-stage" ref={stage} />
          <div className="mk-dg-tilt" ref={tilt}>
            <div className="mk-dg-ipad">
              <span className="mk-dg-cam" aria-hidden="true" />
              <div className="mk-dg-glass">
                <Image src={night} alt="The live-calling screen at night: first inning, count 1-1, the call is fastball, get it over, with its reason, the zone, the six result buttons and the at-bat so far." sizes="(max-width: 960px) 92vw, 1100px" className={mode === "night" ? "is-on" : ""} priority={false} />
                <Image src={day} alt="The same screen in Day mode, with a light background, darker lines and solid buttons for bright sun." sizes="(max-width: 960px) 92vw, 1100px" className={mode === "day" ? "is-on" : ""} aria-hidden={mode !== "day"} />
                <span className="mk-dg-glare" key={mode} aria-hidden="true" />
              </div>
            </div>
            <div className="mk-dg-floor" aria-hidden="true" />
          </div>
        </div>

        <dl className="mk-dg-facts">
          {FACTS.map((f) => (
            <div key={f.t}>
              <dt>{f.t}</dt>
              <dd>{f.d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
