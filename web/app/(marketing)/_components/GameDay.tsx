"use client";

import { useEffect, useRef, useState } from "react";

// A game, in order: before (the staff, entered once), during (a tap a pitch), after (what it learns). On wide screens
// the three panels slide past sideways as the page scrolls; on phones, under reduced motion, they simply stack.
// The learning chart is an illustration of the rules in docs/LEARNING_SPEC.md: the read of a pitch starts at the
// coach's grade, moves at most 0.15 a game toward his results, never more than a full grade away unless the coach
// accepts a flag, and big disagreements are flagged instead of applied.

function Before(_: { on?: boolean }) {
  const pitches = [{ n: "Fastball", v: 86, g: 3 }, { n: "Slider", v: 78, g: 4 }, { n: "Changeup", v: 77, g: 3 }];
  return (
    <div className="mk-gd-viz mk-gd-before" aria-hidden="true">
      <div className="mk-gd-card">
        <p className="mk-gd-cardh"><b>Starter</b><span>Right-handed, three-quarter</span></p>
        {pitches.map((p) => (
          <div key={p.n} className="mk-gd-pitch">
            <span>{p.n}</span>
            <span className="mk-gd-pips">{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= p.g ? "is-on" : ""} />)}</span>
            <span>{p.v}</span>
          </div>
        ))}
      </div>
      <div className="mk-gd-card mk-gd-card-2">
        <p className="mk-gd-cardh"><b>Their lineup</b><span>Optional scouting</span></p>
        {["Bats right, aggressive early", "Bats left, chases breaking balls", "Bats right, power to the pull side"].map((t) => <p key={t} className="mk-gd-line">{t}</p>)}
      </div>
    </div>
  );
}

function During({ on }: { on: boolean }) {
  // a tap, then the next call comes up
  const seq = [
    { tap: "Called strike", next: ["0-1", "Slider", "Get it over"] },
    { tap: "Foul", next: ["0-2", "Fastball", "Up and away"] },
    { tap: "Swing and miss", next: ["Strikeout", "Next hitter", "Fastball, get it over"] },
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!on || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % seq.length), 2200);
    return () => window.clearInterval(t);
  }, [on]);  // eslint-disable-line react-hooks/exhaustive-deps
  const s = seq[i];
  return (
    <div className="mk-gd-viz mk-gd-during" aria-hidden="true">
      <div className="mk-gd-buttons">
        {["Ball", "Called strike", "Swing and miss", "Foul", "In play", "Hit by pitch"].map((b) => <span key={b === s.tap ? `${b}-${i}` : b} className={b === s.tap ? "is-tap" : ""}>{b}</span>)}
      </div>
      <div className="mk-gd-next" key={i}>
        <span>{s.next[0]}</span>
        <b>{s.next[1]}</b>
        <span>{s.next[2]}</span>
      </div>
    </div>
  );
}

function After({ on }: { on: boolean }) {
  // the slider's command, game by game: the coach graded it 3; his results say it's better
  const W = 320, H = 170, L = 30, B = 140, T = 20;
  const games = 8;
  const results = [3.9, 3.7, 4.2, 3.8, 4.4, 4.1, 3.9, 4.3];
  const learned: number[] = [];
  let v = 3;
  for (const r of results) { v = Math.min(4, v + Math.max(-0.15, Math.min(0.15, r - v))); learned.push(v); }
  const x = (i: number) => L + (i / (games - 1)) * (W - L - 10);
  const y = (g: number) => B - ((g - 1.8) / (4.6 - 1.8)) * (B - T);
  const line = learned.map((g, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(g).toFixed(1)}`).join(" ");
  return (
    <div className="mk-gd-viz mk-gd-after">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Over eight games the slider's command read moves from the coach's grade of 3 toward his results, a little each game.">
        <rect x={L} y={y(4)} width={W - L - 10} height={y(2) - y(4)} className="mk-gd-band" />
        <line x1={L} x2={W - 10} y1={y(3)} y2={y(3)} className="mk-gd-coach" />
        <text x={W - 12} y={y(3) - 6} textAnchor="end" className="mk-gd-t">Your grade</text>
        {results.map((r, i) => <circle key={i} cx={x(i)} cy={y(r)} r="3.5" className="mk-gd-res" />)}
        <path d={line} className={`mk-gd-learn${on ? " is-on" : ""}`} pathLength={1} />
        <text x={L} y={H - 6} className="mk-gd-t">Game 1</text>
        <text x={W - 10} y={H - 6} textAnchor="end" className="mk-gd-t">Game 8</text>
      </svg>
      <ul className="mk-gd-key">
        <li><i className="k-res" />His results</li>
        <li><i className="k-learn" />What it learned</li>
        <li><i className="k-band" />Never more than a grade from yours</li>
      </ul>
      <p className="mk-gd-flag">Big disagreements are flagged for you, not applied.</p>
    </div>
  );
}

const PANELS = [
  { t: "Before the game", d: "Enter your staff once: each pitcher's pitches, how hard he throws them and how good each one is. Add the other team's hitters if you have a report.", V: Before },
  { t: "During the game", d: "After each pitch, tap what happened. The next call is up right away, on the iPad, with or without a signal.", V: During },
  { t: "After the game", d: "It compares what happened with what it expected and moves its read of each pitch a little, never more than 0.15 a game. Your pitchers see what it learned.", V: After },
];

export function GameDay() {
  const sec = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  const [flat, setFlat] = useState(true);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setOn(true); }, { threshold: 0.2 });
    if (sec.current) io.observe(sec.current);
    const wide = window.matchMedia("(min-width: 1024px)").matches, reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (wide && !reduced) setFlat(false);
    return () => io.disconnect();
  }, []);

  // the sideways scroll is measured only once the track is laid out in a row (after the render that drops is-flat)
  useEffect(() => {
    if (flat) return;
    let kill = () => {}, dead = false;
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      if (dead || !sec.current || !track.current) return;
      gsap.registerPlugin(ScrollTrigger);
      const t = track.current;
      const dist = () => Math.max(0, t.scrollWidth - t.parentElement!.clientWidth);
      const tw = gsap.to(t, {
        x: () => -dist(), ease: "none",
        scrollTrigger: { trigger: sec.current, start: "top top", end: () => `+=${dist() * 1.4}`, pin: true, scrub: 0.6, invalidateOnRefresh: true, anticipatePin: 1 },
      });
      ScrollTrigger.refresh();
      kill = () => { tw.scrollTrigger?.kill(); tw.kill(); };
    });
    return () => { dead = true; kill(); };
  }, [flat]);

  return (
    <section className={`mk-gd${flat ? " is-flat" : ""}`} id="gameday" ref={sec} aria-labelledby="gd-h">
      <div className="mk-gd-inner">
        <div className="mk-wrap mk-gd-headwrap">
          <div className="mk-sec-head">
            <h2 id="gd-h">A game with PitchIQ</h2>
            <p>Set up once, a tap a pitch, and it gets to know your pitchers a little better after every outing.</p>
          </div>
        </div>
        <div className="mk-gd-viewport">
          <div className="mk-gd-track" ref={track}>
            {PANELS.map(({ t, d, V }, n) => (
              <article key={t} className="mk-glass mk-gd-panel">
                <span className="mk-gd-step" aria-hidden="true">{n + 1}</span>
                <h3>{t}</h3>
                <p>{d}</p>
                <V on={on} />
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
