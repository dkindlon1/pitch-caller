"use client";

import { useEffect, useRef, useState } from "react";
import { MIX, MIX_ENGINE, MIX_SITUATION } from "@/content/mix";

// What the engine weighs before each call, as a console of glass tiles: the pitcher today, the hitter, the game, the
// umpire, and the call mix it draws from. The four input tiles are an illustrated example (and say so); the mix is real
// engine output (content/mix.ts). Each tile's small visual plays once when it scrolls into view.
function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setSeen(true); return; }
    const el = ref.current;
    if (!el) return;
    // fires once the element's top has come a fifth of the way up the screen (a threshold on a tall grid never trips on a phone)
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: "0px 0px -20% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

const ARSENAL = [
  { name: "Fastball", velo: 86, conf: 0.8, strikes: "7 of 10" },
  { name: "Slider", velo: 78, conf: 0.75, strikes: "5 of 7" },
  { name: "Changeup", velo: 77, conf: 0.42, strikes: "1 of 4", off: true },
];

function Pitcher({ on }: { on: boolean }) {
  return (
    <div className="mk-rd-viz mk-rd-pitcher">
      {ARSENAL.map((p, n) => (
        <div key={p.name} className={`mk-rd-row${p.off ? " is-off" : ""}`} data-k={p.name}>
          <span className="mk-rd-name">{p.name}<small>{p.velo} mph</small></span>
          <span className="mk-rd-bar" aria-hidden="true">
            <span style={{ transform: `scaleX(${on ? p.conf : 0})`, transitionDelay: `${n * 120}ms` }} />
            <i style={{ left: "50%" }} />
          </span>
          <span className="mk-rd-num">{p.strikes}</span>
        </div>
      ))}
      <p className="mk-rd-flag">Changeup isn&apos;t landing today, so no &ldquo;get it over&rdquo; changeups until it does.</p>
    </div>
  );
}

function Hitter({ on }: { on: boolean }) {
  // timing gauge: early on the left, late on the right; the needle settles late on the fastball
  const a = on ? 38 : -60;
  return (
    <div className="mk-rd-viz mk-rd-hitter">
      <svg viewBox="0 0 220 120" role="img" aria-label="Timing gauge: he's late on the fastball">
        <path d="M20 110 A90 90 0 0 1 200 110" className="mk-rd-arc" />
        <path d="M110 110 L110 34" className="mk-rd-needle" style={{ transform: `rotate(${a}deg)` }} />
        <circle cx="110" cy="110" r="5" className="mk-rd-hub" />
        <text x="22" y="104" className="mk-rd-tick">Early</text>
        <text x="198" y="104" textAnchor="end" className="mk-rd-tick">Late</text>
      </svg>
      <div className="mk-rd-fouls" aria-label="Fouls so far: two to the opposite field, one straight back">
        <svg viewBox="0 0 120 70" aria-hidden="true">
          <path d="M60 66 L8 14 M60 66 L112 14" className="mk-rd-lines" />
          <path d="M8 14 Q60 -12 112 14" className="mk-rd-lines" />
          {[[92, 22], [100, 30], [60, 60]].map(([x, y], n) => <circle key={n} cx={x} cy={y} r="4" className={`mk-rd-dot${on ? " is-on" : ""}`} style={{ transitionDelay: `${300 + n * 180}ms` }} />)}
        </svg>
        <span>Fouls go the other way</span>
      </div>
    </div>
  );
}

function Game() {
  return (
    <div className="mk-rd-viz mk-rd-game">
      <svg viewBox="0 0 120 92" role="img" aria-label="Runner on second, one out">
        <path d="M60 86 L14 44 L60 6 L106 44 Z" className="mk-rd-lines" />
        {[[106, 44, false], [60, 6, true], [14, 44, false]].map(([x, y, on], n) => (
          <rect key={n} x={(x as number) - 8} y={(y as number) - 8} width="16" height="16" transform={`rotate(45 ${x} ${y})`} className={on ? "mk-rd-base is-on" : "mk-rd-base"} />
        ))}
        <path d="M54 80 L66 80 L66 86 L60 91 L54 86 Z" className="mk-rd-plate" />
      </svg>
      <dl>
        <div><dt>Count</dt><dd>1-2</dd></div>
        <div><dt>Outs</dt><dd>1</dd></div>
        <div><dt>Inning</dt><dd>5th</dd></div>
        <div><dt>Score</dt><dd>Tied</dd></div>
      </dl>
    </div>
  );
}

function Umpire({ on }: { on: boolean }) {
  return (
    <div className="mk-rd-viz mk-rd-ump">
      <svg viewBox="0 0 160 150" role="img" aria-label="Today's umpire is calling strikes a little off the edges">
        <rect x="45" y="30" width="70" height="90" className="mk-rd-zone" />
        <rect x="36" y="22" width="88" height="106" rx="6" className={`mk-rd-wide${on ? " is-on" : ""}`} />
        {[[40, 60], [120, 96], [80, 125], [41, 108]].map(([x, y], n) => <circle key={n} cx={x} cy={y} r="4.5" className={`mk-rd-dot${on ? " is-on" : ""}`} style={{ transitionDelay: `${200 + n * 160}ms` }} />)}
      </svg>
      <p>4 of his last 5 borderline pitches went for strikes</p>
    </div>
  );
}

// the mix: one bar split by how often each call comes up; a needle runs along it and stops where the draw lands
function Mix() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [pick, setPick] = useState(0);
  const [drawing, setDrawing] = useState(true);
  const [at, setAt] = useState(0);         // needle position, 0..1
  const [run, setRun] = useState(0);
  const cum = MIX.reduce<number[]>((a, m) => [...a, (a[a.length - 1] || 0) + m.prob], []);
  const total = cum[cum.length - 1];
  useEffect(() => {
    if (!seen) return;
    // the first draw shows the engine's own pick (the top of the mix, from content/mix.ts); "Draw again" is random
    const r = run === 0 ? MIX[0].prob / 2 / total : Math.random();
    const i = Math.max(0, cum.findIndex((c) => r * total <= c));
    setDrawing(true);
    setAt(r);
    const t = window.setTimeout(() => { setPick(i); setDrawing(false); }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1300);
    return () => window.clearTimeout(t);
  }, [seen, run]);  // eslint-disable-line react-hooks/exhaustive-deps
  const m = MIX[pick];
  const lit = (n: number) => (n === pick && !drawing ? "is-pick" : "");
  return (
    <div className="mk-rd-mix" ref={ref}>
      <div className="mk-rd-mixbar" role="img" aria-label={`The mix: ${MIX.map((x) => `${x.pitch.toLowerCase()} ${x.spot.toLowerCase()} ${Math.round(x.prob * 100)}%`).join(", ")}`}>
        {MIX.map((x, n) => (
          <span key={n} className={lit(n)} data-k={x.pitch} style={{ flexGrow: x.prob }}>
            <b>{Math.round(x.prob * 100)}%</b>
          </span>
        ))}
        <i className={`mk-rd-pin${seen ? " is-on" : ""}`} style={{ left: `${at * 100}%` }} />
      </div>
      <ol className="mk-rd-legend">
        {MIX.map((x, n) => (
          <li key={n} className={lit(n)}><span><i className="mk-pt" data-k={x.pitch} aria-hidden="true" />{x.pitch}, {x.spot.toLowerCase()}</span><span>{Math.round(x.prob * 100)}%</span></li>
        ))}
      </ol>
      <div className="mk-rd-mixfoot">
        <p aria-live="polite">{drawing ? <span className="mk-rd-wait">Drawing…</span> : <><b>{m.pitch}, {m.spot.toLowerCase()}.</b> Drawn from the mix, where it comes up {Math.round(m.prob * 100)}% of the time.</>}</p>
        <button type="button" className="mk-chip" onClick={() => setRun((r) => r + 1)} disabled={drawing && seen}>Draw again</button>
      </div>
      <p className="mk-rd-src">Real engine output (version {MIX_ENGINE}): {MIX_SITUATION}. College D3, the app&apos;s sample right-hander.</p>
    </div>
  );
}

export function Reads() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <section className="mk-rd" id="reads" aria-labelledby="rd-h">
      <svg className="mk-rd-art" viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path d="M1500 -40 C 1100 160, 900 320, 520 980" />
        <path d="M1500 40 C 1150 200, 980 420, 700 980" />
        <path className="is-live" d="M1500 120 C 1180 260, 1040 520, 860 980" />
        <path d="M-80 640 C 260 560, 520 640, 760 980" />
      </svg>
      <div className="mk-wrap">
        <div className="mk-sec-head">
          <h2 id="rd-h">It watches what a pitching coach watches</h2>
          <p>Before every call it weighs your pitcher today, the hitter, the game and the umpire, then draws the pitch from a mix so the hitter can&apos;t sit on a pattern.</p>
        </div>
        <div className="mk-rd-grid" ref={ref}>
          <article className="mk-glass mk-rd-tile">
            <h3>Your pitcher, today</h3>
            <p>How much he trusts each pitch, and which ones are landing.</p>
            <Pitcher on={seen} />
          </article>
          <article className="mk-glass mk-rd-tile">
            <h3>The hitter</h3>
            <p>Early or late, where his fouls go, what he&apos;s already seen.</p>
            <Hitter on={seen} />
          </article>
          <article className="mk-glass mk-rd-tile">
            <h3>The game</h3>
            <p>Count, outs, runners and score. Late in a close game it plays to win the game, not just save runs.</p>
            <Game />
          </article>
          <article className="mk-glass mk-rd-tile">
            <h3>Today&apos;s umpire</h3>
            <p>How wide he&apos;s calling it, learned from the pitches you log.</p>
            <Umpire on={seen} />
          </article>
          <article className="mk-glass mk-rd-tile mk-rd-tile-mix">
            <h3>Then it draws the call</h3>
            <p>Every reasonable call gets a share. The best ones get the most. In big counts like 2-2 and 3-2 the mix tightens around the best call.</p>
            <Mix />
          </article>
        </div>
        <p className="mk-rd-note">The four tiles above are an illustrated example of what gets logged in a game.</p>
      </div>
    </section>
  );
}
