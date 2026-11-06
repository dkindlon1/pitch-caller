"use client";

import { useEffect, useRef, useState } from "react";
import type { Pitch } from "@/content/at-bat";
import { bats, call, LINEUP, makeArsenal, newGame, reason, record, RESULT_LABEL, type Call, type Game, type Result } from "@/lib/demo";
import type { EPitch } from "@/lib/engine";
import { CallBand } from "./CallBand";
import { Lights } from "./Lights";
import { Zone } from "./Zone";

// The working demo: the game app's engine (lib/engine.js, the same file as app/engine.js) runs here in the browser and
// calls every pitch for the app's sample right-hander against a nine-man lineup. The visitor says what happened and
// gets the next call. The engine loads only when the section comes near the screen.
type Engine = typeof import("@/lib/engine").default;
const RESULTS: Result[] = ["ball", "cstrike", "whiff", "foul", "out", "hit", "hbp"];
const name = (c: Call) => c.pitch as Pitch["pitch"];

function Bases({ on }: { on: Game["bases"] }) {
  const who = ["first", "second", "third"].filter((_, i) => on[i]);
  // second at the top, first on the right, third on the left: the diamond as seen from home plate
  const at: [number, number][] = [[34, 20], [20, 6], [6, 20]];
  return (
    <svg className="bases" viewBox="0 0 40 30" role="img" aria-label={who.length ? `Runner${who.length > 1 ? "s" : ""} on ${who.join(" and ")}` : "Bases empty"}>
      {at.map(([x, y], i) => <rect key={i} x={x - 5} y={y - 5} width="10" height="10" transform={`rotate(45 ${x} ${y})`} className={on[i] ? "on" : ""} />)}
    </svg>
  );
}

export function LiveDemo() {
  const root = useRef<HTMLDivElement>(null);
  const eng = useRef<{ E: Engine; ars: EPitch[] } | null>(null);
  const [g, setG] = useState<Game>(newGame);
  const [c, setC] = useState<Call | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let dead = false;
    const load = () =>
      Promise.all([import("@/lib/engine"), import("@/lib/engine_data.json")])
        .then(([m, d]) => {
          if (dead) return;
          const E = ((m as { default?: Engine }).default ?? m) as Engine;
          E.init((d as { default?: unknown }).default ?? d);
          const ars = makeArsenal(E);
          eng.current = { E, ars };
          setVersion(E.VERSION);
          setC(call(E, ars, newGame()));
        })
        .catch(() => { if (!dead) setFailed(true); });
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); load(); } }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => { dead = true; io.disconnect(); };
  }, []);

  const tap = (r: Result) => {
    const x = eng.current;
    if (!x || !c) return;
    const next = record(x.E, x.ars, g, c, r);
    setG(next);
    setC(call(x.E, x.ars, next));
  };
  const restart = () => {
    const x = eng.current;
    if (!x) return;
    x.ars = makeArsenal(x.E);
    const fresh = newGame();
    setG(fresh);
    setC(call(x.E, x.ars, fresh));
  };

  const side = bats(g);
  const spot = LINEUP[g.batter % LINEUP.length];
  const hitter = `Hitter ${(g.batter % LINEUP.length) + 1} of 9, ${spot === "S" ? "a switch hitter batting left" : `bats ${side === "L" ? "left" : "right"}`}`;
  const zone = c ? [...g.atBat.map((l) => ({ pitch: name(l.call), spot: l.call.spot })), { pitch: name(c), spot: c.spot }] : [];

  return (
    <div className="demo" ref={root}>
      <div className="call-panel demo-panel" data-engine={version || undefined}>
        <div className="call-top">
          <span className="call-hitter">{hitter}</span>
          <span className="demo-game">
            <span><span className="lbl">Inning</span> <b className="mono">{g.inning}</b></span>
            <span><span className="lbl">Outs</span> <b className="mono">{g.outs}</b></span>
            <Bases on={g.bases} />
          </span>
          <span className="call-count">
            <span className="lbl">Count</span>
            <b className="mono">{g.balls}-{g.strikes}</b>
            <Lights n={g.balls} of={3} label="balls" />
            <Lights n={g.strikes} of={2} label="strikes" />
          </span>
        </div>

        <div className="call-body" aria-live="polite">
          {c ? (
            <div className="call-text" key={g.pitches}>
              <CallBand p={{ pitch: name(c), spot: c.spot, sign: c.sign }} />
              <p className="demo-why">{reason(c, g)}</p>
              {g.ended.length ? <p className="call-result shown">{g.ended.join(" ")}</p> : <p className="call-result">Pitch {g.atBat.length + 1} to this hitter</p>}
            </div>
          ) : (
            <div className="call-text demo-wait">
              <p className="demo-why">{failed ? "The demo didn't load. Reload the page to try it." : "Loading the engine."}</p>
            </div>
          )}
          <Zone pitches={zone} current={c ? zone.length - 1 : -1} bats={side} />
        </div>

        <fieldset className="demo-results" disabled={!c}>
          <legend>What happened?</legend>
          {RESULTS.map((r) => (
            <button key={r} type="button" className="demo-result" onClick={() => tap(r)}>{RESULT_LABEL[r]}</button>
          ))}
        </fieldset>

        <div className="demo-foot">
          <p>
            {g.pitches} {g.pitches === 1 ? "pitch" : "pitches"} so far
            {g.runs ? `, ${g.runs} ${g.runs === 1 ? "run" : "runs"} in` : ""}
          </p>
          <button type="button" className="call-pause" onClick={restart} disabled={!c || g.pitches === 0}>Start over</button>
        </div>
      </div>
    </div>
  );
}
