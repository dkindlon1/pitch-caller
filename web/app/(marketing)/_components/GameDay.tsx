"use client";

import { useEffect, useRef, useState } from "react";

// A game with PitchIQ: before, during and after, each shown with the real app's own screen. On wide screens one iPad
// stays beside the three steps and shows the screen of the step in the middle of the screen; on phones each step carries
// its own. Only one of the two is ever displayed, so a screen reader meets each screen once. The screens are captures of the real app (app/dist): the Roster (scripts/capture-app-views.cjs), the call
// (scripts/capture-app-call.cjs) and the Data screen after a game played through the app's own buttons
// (capture-app-views.cjs, seeded, so it comes out the same every time).

const STEPS = [
  {
    t: "Before the game",
    d: "Enter your staff once: each pitcher's pitches, how hard he throws them and how good each one is. On game day he checks in with how his arm feels.",
    img: "/marketing/game-before.webp",
    alt: "The app's Roster screen: the starter's arm slot, pitch cap and arsenal, with stuff and command grades for each pitch.",
  },
  {
    t: "During the game",
    d: "Tap what happened after each pitch. The next call is up right away, on the iPad, with or without a signal.",
    img: "/marketing/game-during.webp",
    alt: "The app's Game screen: the call is a fastball up and away, with the count, the runner on second and the result buttons.",
  },
  {
    t: "After the game",
    d: "Every pitch is charted: strikes, whiffs and hard contact for each pitch, and who needs a rest. It learns a little more about each pitcher every outing.",
    img: "/marketing/game-after.webp",
    alt: "The app's Data screen after 82 pitches: 66% strikes, 30% whiffs per swing, seven strikeouts, and the starter flagged as needing a change.",
  },
];

function Device({ at, only, className }: { at: number; only?: number; className?: string }) {
  return (
    <div className={`mk-gd-ipad ${className ?? ""}`}>
      <div className="mk-gd-screen">
        {STEPS.map((s, i) => (only === undefined || only === i) ? (
          <img key={s.img} src={s.img} alt={s.alt}
            width={1180} height={820} loading="lazy" decoding="async" data-on={(only ?? at) === i ? "1" : "0"} />
        ) : null)}
      </div>
    </div>
  );
}

export function GameDay() {
  const [at, setAt] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  // the step crossing the middle of the screen is the one the iPad shows
  useEffect(() => {
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) setAt(Number((e.target as HTMLElement).dataset.i));
    }, { rootMargin: "-48% 0px -48% 0px" });
    items.current.forEach((n) => n && io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <section className="mk-gd" id="gameday" aria-labelledby="gd-h">
      <div className="mk-wrap mk-gd-body">
        <div className="mk-gd-col">
          <div className="mk-sec-head">
            <h2 id="gd-h">A game with PitchIQ</h2>
            <p>Set it up once, tap once a pitch, and see what happened when it&apos;s over.</p>
          </div>
          <ol className="mk-gd-steps">
            {STEPS.map((s, i) => (
              <li key={s.t} ref={(n) => { items.current[i] = n; }} data-i={i} data-on={i === at ? "1" : "0"}>
                <Device at={at} only={i} className="mk-gd-ipad-sm" />
                <span className="mk-gd-n" aria-hidden="true">{i + 1}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
          <p className="mk-gd-src mk-gd-src-sm">Screens from the PitchIQ app.</p>
        </div>
        <div className="mk-gd-stage">
          <div className="mk-gd-fig"><Device at={at} /><p className="mk-gd-src">Screens from the PitchIQ app.</p></div>
        </div>
      </div>
    </section>
  );
}
