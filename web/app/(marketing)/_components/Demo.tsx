"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bats, call, CELL_OF, LINEUP, makeArsenal, newGame, record, RESULT_LABEL, type Call, type Game, type Result } from "@/lib/demo";
import type { EPitch } from "@/lib/engine";

// "Call a game yourself": the game app's engine (lib/engine.js, the same file the iPad app runs) calling every pitch in
// the browser for the app's sample right-hander against a nine-man lineup. The visitor taps what happened and gets the
// next call, with the engine's own reason and how long the call took on this device. The engine loads only when the
// section is near. The device leans toward a mouse pointer; touch screens and reduced motion keep it flat.
type Engine = typeof import("@/lib/engine").default;
const RESULTS: { r: Result; key: string }[] = [
  { r: "ball", key: "B" }, { r: "cstrike", key: "C" }, { r: "whiff", key: "S" }, { r: "foul", key: "F" },
  { r: "out", key: "X" }, { r: "hit", key: "G" }, { r: "hbp", key: "H" },
];
const pct = (x: number) => `${Math.round(x * 100)}%`;

function Zone({ c, g, side }: { c: Call | null; g: Game; side: "R" | "L" }) {
  // the catcher's view: a right-handed hitter stands on the left, so his inside half is on the left
  const W = 150, H = 180, x0 = 45, y0 = 30, cw = W / 3, ch = H / 3;
  const at = (spot: string) => {
    const cell = CELL_OF(spot);
    if (!cell) return { x: x0 + W + 26, y: y0 + H + 18 };               // chase: just off the plate, low and away
    const [col, row] = cell, cc = side === "L" ? 2 - col : col;
    return { x: x0 + (cc + 0.5) * cw, y: y0 + (row + 0.5) * ch };
  };
  const now = c ? at(c.spot) : null;
  return (
    <svg className="mk-dm-zone" viewBox="0 0 240 260" role="img" aria-label={c ? `Target: ${c.spot.toLowerCase()}` : "Strike zone"}>
      <rect x={x0} y={y0} width={W} height={H} className="mk-dm-zbox" />
      {[1, 2].map((i) => <line key={`v${i}`} x1={x0 + i * cw} x2={x0 + i * cw} y1={y0} y2={y0 + H} className="mk-dm-zgrid" />)}
      {[1, 2].map((i) => <line key={`h${i}`} y1={y0 + i * ch} y2={y0 + i * ch} x1={x0} x2={x0 + W} className="mk-dm-zgrid" />)}
      <text x={side === "L" ? x0 + W + 10 : x0 - 10} y={y0 + H / 2} textAnchor={side === "L" ? "start" : "end"} className="mk-dm-ztag">{side === "L" ? "LHH" : "RHH"}</text>
      <path d={`M${x0 + 20} ${y0 + H + 34} h${W - 40} l10 10 l-${(W - 20) / 2} 12 l-${(W - 20) / 2} -12 z`} className="mk-dm-plate" />
      {g.atBat.map((l, n) => { const p = at(l.call.spot); return <g key={n}><circle cx={p.x + (n % 2 ? 7 : -7)} cy={p.y + 8} r="9" className="mk-dm-prev" /><text x={p.x + (n % 2 ? 7 : -7)} y={p.y + 11.5} textAnchor="middle" className="mk-dm-prevn">{n + 1}</text></g>; })}
      {now ? <g key={`${g.pitches}`} className="mk-dm-target"><circle cx={now.x} cy={now.y} r="22" className="mk-dm-ring" /><circle cx={now.x} cy={now.y} r="6" className="mk-dm-dot" /></g> : null}
    </svg>
  );
}

function Bases({ on }: { on: Game["bases"] }) {
  const who = ["first", "second", "third"].filter((_, i) => on[i]);
  const at: [number, number][] = [[34, 20], [20, 6], [6, 20]];
  return (
    <svg className="mk-dm-bases" viewBox="0 0 40 28" role="img" aria-label={who.length ? `Runner${who.length > 1 ? "s" : ""} on ${who.join(" and ")}` : "Bases empty"}>
      {at.map(([x, y], i) => <rect key={i} x={x - 5} y={y - 5} width="10" height="10" transform={`rotate(45 ${x} ${y})`} className={on[i] ? "is-on" : ""} />)}
    </svg>
  );
}

const Dots = ({ n, of, label }: { n: number; of: number; label: string }) => (
  <span className="mk-dm-dots" role="img" aria-label={`${n} ${label}`}>{Array.from({ length: of }, (_, i) => <i key={i} className={i < n ? "is-on" : ""} />)}</span>
);

export function Demo() {
  const root = useRef<HTMLDivElement>(null);
  const dev = useRef<HTMLDivElement>(null);
  const eng = useRef<{ E: Engine; ars: EPitch[] } | null>(null);
  const [g, setG] = useState<Game>(newGame);
  const [c, setC] = useState<Call | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState("");
  const [flash, setFlash] = useState("");

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
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); load(); } }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => { dead = true; io.disconnect(); };
  }, []);

  // lean toward the pointer
  useEffect(() => {
    const el = dev.current;
    if (!el || !window.matchMedia("(pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, tx = 0, ty = 0, x = 0, y = 0, run = false;
    const tick = () => { x += (tx - x) * 0.08; y += (ty - y) * 0.08; el.style.setProperty("--rx", `${(-y * 5).toFixed(2)}deg`); el.style.setProperty("--ry", `${(x * 7).toFixed(2)}deg`); if (Math.abs(tx - x) + Math.abs(ty - y) > 0.001) raf = requestAnimationFrame(tick); else run = false; };
    const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); tx = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / r.width)); ty = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / r.height)); if (!run) { run = true; raf = requestAnimationFrame(tick); } };
    const onLeave = () => { tx = 0; ty = 0; if (!run) { run = true; raf = requestAnimationFrame(tick); } };
    const box = root.current!;
    box.addEventListener("pointermove", onMove);
    box.addEventListener("pointerleave", onLeave);
    return () => { box.removeEventListener("pointermove", onMove); box.removeEventListener("pointerleave", onLeave); cancelAnimationFrame(raf); };
  }, []);

  const tap = useCallback((r: Result) => {
    const x = eng.current;
    if (!x || !c) return;
    const next = record(x.E, x.ars, g, c, r);
    setFlash(RESULT_LABEL[r]);
    setG(next);
    setC(call(x.E, x.ars, next));
  }, [c, g]);

  // keyboard shortcuts, like the app: live whenever the demo is on screen, except while typing in a form field
  const tapRef = useRef(tap);
  tapRef.current = tap;
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    // on screen = at least 40% of the device visible, measured at the key press itself
    const onScreen = () => { const r = el.getBoundingClientRect(), vis = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0); return vis > r.height * 0.4; };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || !onScreen()) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      const hit = RESULTS.find((x) => x.key !== "G" && x.key === e.key.toUpperCase());
      if (hit) { e.preventDefault(); tapRef.current(hit.r); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const restart = () => {
    const x = eng.current;
    if (!x) return;
    x.ars = makeArsenal(x.E);
    const fresh = newGame();
    setG(fresh);
    setFlash("");
    setC(call(x.E, x.ars, fresh));
  };

  const side = bats(g);
  const spot = LINEUP[g.batter % LINEUP.length];
  const hitter = `Hitter ${(g.batter % LINEUP.length) + 1} of 9`;
  const how = spot === "S" ? "Switch hitter, batting left" : side === "L" ? "Bats left" : "Bats right";
  const others = c ? c.mix.filter((m) => !(m.pitch === c.pitch && m.spot === c.spot)) : [];

  return (
    <section className="mk-dm" id="demo" aria-labelledby="dm-h" tabIndex={-1}>
      <div className="mk-wrap mk-dm-grid">
        <div className="mk-sec-head mk-dm-copy">
          <h2 id="dm-h">Call a game yourself</h2>
          <p>
            This is the engine from the iPad app, running in your browser. The pitcher is the app&apos;s sample right-hander:
            fastball 86, slider 78, changeup 77, at college D3. Tap what happened and it calls the next pitch.
          </p>
          <p className="mk-dm-keys">Keys work while it&apos;s on screen: <kbd>B</kbd> ball, <kbd>C</kbd> called strike, <kbd>S</kbd> swing and miss, <kbd>F</kbd> foul, <kbd>X</kbd> in play, <kbd>H</kbd> hit by pitch.</p>
        </div>

        <div className="mk-dm-stage" ref={root}>
          <div className="mk-dm-device" ref={dev}>
            <div className="mk-dm-screen mk-glass" data-engine={version || undefined}>
              <header className="mk-dm-top">
                <span className="mk-dm-who"><b>{hitter}</b><span>{how}</span></span>
                <span className="mk-dm-state">
                  <span><small>Inning</small><b>{g.inning}</b></span>
                  <span><small>Outs</small><Dots n={g.outs} of={2} label="outs" /></span>
                  <Bases on={g.bases} />
                  <span className="mk-dm-count"><small>Count</small><b>{g.balls}-{g.strikes}</b></span>
                </span>
              </header>

              <div className="mk-dm-body" aria-live="polite">
                {c ? (
                  <div className="mk-dm-call" key={g.pitches}>
                    <div className="mk-dm-callrow">
                      <span className="mk-dm-sign" aria-label={`Sign ${c.sign}`}>{c.sign}</span>
                      <span className="mk-dm-what"><b>{c.pitch}</b><span>{c.spot}</span></span>
                    </div>
                    <p className="mk-dm-why">{c.why && c.why !== "Only call allowed here" ? c.why : c.quad === "middle" ? "Throw a strike: aim at the heart of the plate." : "The best call here on its own."}</p>
                    <p className="mk-dm-meta">Comes up {pct(c.prob)} of the time here<span aria-hidden="true"> · </span><span className="mk-dm-ms">called in {Math.max(1, Math.round(c.ms))} ms</span></p>
                    {others.length ? (
                      <ul className="mk-dm-mix" aria-label="Also in the mix">
                        {[{ pitch: c.pitch, spot: c.spot, prob: c.prob }, ...others].slice(0, 4).map((m, n) => (
                          <li key={n} className={n === 0 ? "is-pick" : ""}>
                            <span>{m.pitch}, {m.spot.toLowerCase()}</span>
                            <span className="mk-dm-bar"><i style={{ transform: `scaleX(${Math.min(1, m.prob / Math.max(0.0001, c.mix[0]?.prob || m.prob))})` }} /></span>
                            <span>{pct(m.prob)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : (
                  <div className="mk-dm-call"><p className="mk-dm-why">{failed ? "The demo didn't load. Reload the page to try it." : "Loading the engine…"}</p></div>
                )}
                <Zone c={c} g={g} side={side} />
              </div>

              <ol className="mk-dm-log" aria-label="This at-bat so far">
                {g.atBat.length ? g.atBat.map((l, n) => (
                  <li key={n}><span className="mk-dm-logc">{l.balls}-{l.strikes}</span><b>{l.call.pitch}</b><span>{RESULT_LABEL[l.result]}</span></li>
                )) : <li className="mk-dm-logempty">This at-bat&apos;s pitches show up here.</li>}
              </ol>

              <fieldset className="mk-dm-results" disabled={!c}>
                <legend>What happened?</legend>
                {RESULTS.map(({ r, key }) => (
                  <button key={r} type="button" className="mk-dm-res" onClick={() => tap(r)} aria-keyshortcuts={key === "G" ? undefined : key}>
                    <span>{RESULT_LABEL[r]}</span>{key !== "G" ? <kbd aria-hidden="true">{key}</kbd> : null}
                  </button>
                ))}
              </fieldset>

              <footer className="mk-dm-foot">
                <p>
                  {g.ended.length ? <b className="mk-dm-ended">{g.ended.join(" ")}</b> : flash ? <span>{flash} logged.</span> : <span>First pitch is up.</span>}
                  <span className="mk-dm-tally"> {g.pitches} {g.pitches === 1 ? "pitch" : "pitches"}{g.runs ? `, ${g.runs} ${g.runs === 1 ? "run" : "runs"}` : ""}</span>
                </p>
                <button type="button" className="mk-chip" onClick={restart} disabled={!c || g.pitches === 0}>Start over</button>
              </footer>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
