"use client";

import { useEffect, useRef, useState } from "react";

// The coaching rules built into the engine (README "Coach rules built in"), one at a time in big type. On wide screens
// one strike zone, drawn like the app's zone panel, stays beside them and shows the rule you've scrolled to; on phones
// each rule carries its own small zone. Then how the calls are checked (review.py's WRONG and QUESTIONABLE checks) and the
// numbers each level runs on (college_rates.py, hs_rates.py).

type Kind = "chase" | "landing" | "attack" | "shake" | "mix";
const RULES: { k: Kind; count: string; t: string; d: string }[] = [
  { k: "chase", count: "3-0", t: "No chase pitch at 3-0 or 3-1", d: "Behind in the count, it asks for a strike, never a pitch off the plate." },
  { k: "landing", count: "1-0", t: "Off-speed strikes only when they're landing", d: "It won't call a “get it over” changeup until his changeup is finding the zone today." },
  { k: "attack", count: "2-2", t: "Attacks the zone at 2-2", d: "Two strikes and a ball to play with is a pitch to go after, not to waste." },
  { k: "shake", count: "1-1", t: "Respects the shake", d: "When he shakes off a call, it moves on to something else." },
  { k: "mix", count: "1-2", t: "Mixes, but leans on the best call", d: "A hitter can't sit on a pattern, and in big counts the mix tightens around the strongest call." },
];

const CHECKS: [string, string][] = [
  ["Wrong", "A chase pitch at 3-0 or 3-1"],
  ["Wrong", "A pitch down the middle at 0-2 or 1-2"],
  ["Wrong", "The same pitch he just shook off"],
  ["Questionable", "An off-speed pitch up in the zone"],
  ["Questionable", "A breaking ball in the dirt with a runner on third"],
  ["Questionable", "The same pitch four times in a row to one hitter"],
];

// the zone, in the app's panel style: a dashed chase box, the zone, its nine cells; calls are filled marks in the
// pitch's colour (fastball red, slider gold, changeup green), ruled-out pitches are crossed-out outlines
const ZX0 = 56, ZX1 = 184, ZY0 = 56, ZY1 = 216;
function Mark({ x, y, c, r = 15, call = false }: { x: number; y: number; c: string; r?: number; call?: boolean }) {
  return (
    <g>
      {call ? <circle cx={x} cy={y} r={r + 9} className="z-ring" style={{ stroke: c }} /> : null}
      <circle cx={x} cy={y} r={r} style={{ fill: c }} />
    </g>
  );
}
function Out({ x, y, c = "rgba(255,255,255,0.5)" }: { x: number; y: number; c?: string }) {
  return (
    <g className="z-out">
      <circle cx={x} cy={y} r="14" style={{ stroke: c }} />
      <path d={`M${x - 9} ${y - 9}l18 18M${x + 9} ${y - 9}l-18 18`} />
    </g>
  );
}
const FB = "var(--mk-fb)", SL = "var(--mk-sl)", CH = "var(--mk-ch)";
const STATES: Record<Kind, React.ReactNode> = {
  chase: <><Out x={198} y={238} /><Mark x={148} y={98} c={FB} call /></>,
  landing: <><Out x={96} y={190} c={CH} /><Mark x={110} y={124} c={FB} call /><g className="z-meter"><rect x={ZX0} y={250} width={ZX1 - ZX0} height="5" rx="2.5" /><rect x={ZX0} y={250} width={(ZX1 - ZX0) * 0.28} height="5" rx="2.5" className="z-meter-on" /></g></>,
  attack: <Mark x={170} y={200} c={SL} call />,
  shake: <><Out x={160} y={82} c={FB} /><Mark x={80} y={196} c={SL} call /></>,
  mix: <><Mark x={84} y={84} c={FB} r={8} /><Mark x={110} y={186} c={CH} r={6} /><Mark x={168} y={196} c={SL} r={15} call /></>,
};
function Zone({ at, className }: { at: Kind | "all"; className?: string }) {
  return (
    <svg viewBox="0 0 240 290" className={`mk-ru-zone ${className ?? ""}`} aria-hidden="true">
      <rect x="24" y="24" width="192" height="224" rx="18" className="z-chase" />
      <rect x={ZX0} y={ZY0} width={ZX1 - ZX0} height={ZY1 - ZY0} className="z-box" />
      <path d={`M${ZX0 + (ZX1 - ZX0) / 3} ${ZY0}V${ZY1}M${ZX0 + (2 * (ZX1 - ZX0)) / 3} ${ZY0}V${ZY1}M${ZX0} ${ZY0 + (ZY1 - ZY0) / 3}H${ZX1}M${ZX0} ${ZY0 + (2 * (ZY1 - ZY0)) / 3}H${ZX1}`} className="z-grid" />
      {RULES.map((r) => (
        <g key={r.k} className="z-state" data-on={at === r.k ? "1" : "0"}>
          {STATES[r.k]}
          <text x="120" y="280" textAnchor="middle" className="z-count">{r.count}</text>
        </g>
      ))}
    </svg>
  );
}

export function Rules() {
  const [at, setAt] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  // the rule crossing the middle of the screen is the one the zone shows
  useEffect(() => {
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) setAt(Number((e.target as HTMLElement).dataset.i));
    }, { rootMargin: "-48% 0px -48% 0px" });
    items.current.forEach((n) => n && io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <section className="mk-ru" id="rules" aria-labelledby="ru-h">
      <div className="mk-wrap">
        <div className="mk-sec-head">
          <h2 id="ru-h">The rules it plays by</h2>
          <p>Built from how pitching coaches call a game.</p>
        </div>
        <div className="mk-ru-body">
          <div className="mk-ru-stage">
            <Zone at={RULES[at].k} />
            <p className="mk-ru-key" aria-hidden="true"><i style={{ background: FB }} />Fastball<i style={{ background: SL }} />Slider<i style={{ background: CH }} />Changeup</p>
          </div>
          <ul className="mk-ru-list">
            {RULES.map((r, i) => (
              <li key={r.k} ref={(n) => { items.current[i] = n; }} data-i={i} data-on={i === at ? "1" : "0"}>
                <Zone at={r.k} className="mk-ru-zone-sm" />
                <h3>{r.t}</h3>
                <p>{r.d}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="mk-ru-proof">
          <p className="mk-ru-lead">
            Then every version is checked. It plays full simulated games, and each call is graded by coaching checks the engine
            never sees.
          </p>
          <ul className="mk-ru-checks">
            {CHECKS.map(([v, t]) => <li key={t}><b className={v === "Wrong" ? "v-w" : "v-q"}>{v}</b>{t}</li>)}
          </ul>
          <p className="mk-ru-levels">
            Each level runs on its own numbers: 2026 national varsity averages for high school and travel ball, and 2026 NCAA
            conference stats for college.
          </p>
        </div>
      </div>
    </section>
  );
}
