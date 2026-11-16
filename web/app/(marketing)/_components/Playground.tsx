"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { STORY_SIT, pct, sameSit, weigh, type Sit, type Weighed } from "@/lib/story";
import { motion, reducedMotion } from "./motion";

// "Set the situation": the film's last frame stays where it is and two glass panels rise around it. The left one sets
// the count, runners, outs, inning and which side the hitter stands on; the right one shows what the engine would
// throw, grouped the way the film told it (pitch and side of the plate), each group opening into its exact spots in
// the watch's own words. It opens on the film's situation and the page's build-time engine run (the `story` prop), so
// the "42%" in the film and the first row here are the same number from the same run. Any change runs the real engine
// in the browser (lib/engine.js, loaded when the page is idle): the rows re-sort, a line runs from the mix into the
// watch, the light behind it goes green and a live face redraws on the film's screen.
type Engine = typeof import("@/lib/engine").default;
const ORD: Record<number, string> = { 3: "3rd", 7: "7th", 9: "9th" };

export function Playground({ story, faceOn }: { story: Weighed; faceOn: RefObject<boolean> }) {
  const root = useRef<HTMLDivElement>(null);
  const eng = useRef<Engine | null>(null);
  const loading = useRef<Promise<Engine> | null>(null);
  const flip = useRef<Flip.FlipState | null>(null);
  const landTl = useRef<gsap.core.Timeline | null>(null);
  const shown = useRef<Weighed>(story);
  const [sit, setSit] = useState<Sit>(STORY_SIT);
  const [res, setRes] = useState<Weighed>(story);
  const [open, setOpen] = useState<string | null>(story.groups[0].key);
  const [version, setVersion] = useState("");
  const [say, setSay] = useState("");

  const load = useCallback(() => {
    if (!loading.current) {
      loading.current = Promise.all([import("@/lib/engine"), import("@/lib/engine_data_d3.json")]).then(([m, d]) => {
        const E = (m.default || m) as Engine;
        E.init((d as { default?: unknown }).default || d);
        eng.current = E; setVersion(E.VERSION);
        return E;
      });
    }
    return loading.current;
  }, []);
  // the engine and its tables load once the page is idle, well before anyone can reach the controls
  useEffect(() => {
    gsap.registerPlugin(Flip);
    const idle = window.requestIdleCallback || ((f: () => void) => window.setTimeout(f, 1800));
    const id = idle(() => { load().catch(() => {}); });
    return () => { (window.cancelIdleCallback || window.clearTimeout)(id as number); landTl.current?.kill(); };
  }, [load]);

  const change = useCallback((next: Sit) => {
    setSit(next);
    load().then((E) => {
      const r = sameSit(next, STORY_SIT) ? story : weigh(E, next);
      if (root.current && !reducedMotion()) flip.current = Flip.getState(root.current.querySelectorAll(".pq-rowwrap"));
      setRes(r); setOpen(r.groups[0].key);
      const t = r.groups[0];
      setSay(`${t.name}, ${pct(t.p)}% of the mix.`);
    }).catch(() => setSay("The engine didn't load. Reload the page to try again."));
  }, [load, story]);

  // after the rows re-render: slide them to their new order, then land the new call on the watch
  useLayoutEffect(() => {
    if (shown.current === res) return;      // nothing new to land (the first render, or an effect run twice in development)
    shown.current = res;
    const el = root.current; if (!el) return;
    const M = motion(), pin = el.closest(".pq-pin") || document, q = <T extends Element>(s: string) => pin.querySelector<T>(s) as T;
    const top = res.groups[0].spots[0], words = top.words, face = q<HTMLElement>(".pq-face"), f1 = q<HTMLElement>(".pq-f1"), f2 = q<HTMLElement>(".pq-f2"), hr = face.querySelector("hr") as HTMLElement;
    const draw = () => { f1.textContent = top.pitch.toUpperCase(); f2.innerHTML = words.map((w) => `<span>${w}</span>`).join(""); hr.style.display = words.length ? "" : "none"; };
    faceOn.current = true;
    if (reducedMotion()) { draw(); return; }
    if (flip.current) {
      Flip.from(flip.current, { targets: el.querySelectorAll(".pq-rowwrap"), duration: M.durFlip, ease: M.out, absolute: false,
        onEnter: (els) => gsap.fromTo(els, { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: 0.4, ease: M.out }) });
      flip.current = null;
    }
    const fp = q<SVGPathElement>(".pq-flowp"), fg = q<SVGPathElement>(".pq-flowg"), lg = q<HTMLElement>(".pq-light.is-g"), lb = q<HTMLElement>(".pq-light.is-b"), ring = q<HTMLElement>(".pq-face-ring");
    const len = fp.getTotalLength ? fp.getTotalLength() : 0;
    landTl.current?.kill();
    landTl.current = gsap.timeline()
      .set(lg, { opacity: 0 }).set(lb, { opacity: 1 })
      .fromTo([fp, fg], { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: M.durLand, ease: "power2.inOut" }, 0)
      .to(face, { opacity: 1, duration: 0.15 }, 0.3)
      .to([f1, f2], { opacity: 0, y: -6, duration: 0.12, ease: M.inn, onComplete: draw }, 0.3)
      .to([f1, f2], { opacity: 1, y: 0, duration: 0.3, ease: M.out, stagger: 0.05 }, 0.46)
      .to(lg, { opacity: 1, duration: 0.5, ease: "power2.out" }, 0.4).to(lb, { opacity: 0, duration: 0.5, ease: "power2.out" }, 0.4)
      .fromTo(ring, { opacity: 1 }, { opacity: 0, duration: 1.1, ease: "power2.out" }, 0.46)
      .to(lg, { opacity: 0.18, duration: 1.2, ease: "power2.inOut" }, 1.3).to(lb, { opacity: 0.82, duration: 1.2, ease: "power2.inOut" }, 1.3);
  }, [res, faceOn]);

  const set = (patch: Partial<Sit>) => change({ ...sit, ...patch });
  const base = (i: number) => { const b = sit.bases.slice() as Sit["bases"]; b[i] = !b[i]; set({ bases: b }); };
  const rows = res.groups.slice(0, 5), topP = rows[0].p, changed = !sameSit(sit, STORY_SIT);

  return (
    <div className="pq-pg" id="pg" ref={root} data-engine={version || undefined}>
      <div className="pq-pgtitle">
        <h2 id="pg-h">Set the situation.</h2>
        <p>Change anything. The real engine re-weighs it in your browser and the watch gets the new call.</p>
      </div>

      <div className="pq-ctl pq-glass pq-lens" role="group" aria-labelledby="pg-h">
        <div className="pq-lbl">The count</div>
        <div className="pq-countrow">
          <div className="pq-num" aria-label={`Count: ${sit.b} balls, ${sit.s} strikes`}>{sit.b}&ndash;{sit.s}</div>
          <div className="pq-steps">
            <div><span>Balls</span>
              <button type="button" className="pq-btn is-rnd" aria-label="One fewer ball" disabled={sit.b === 0} onClick={() => set({ b: Math.max(0, sit.b - 1) })}>&minus;</button>
              <span className="pq-dots" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i < sit.b ? "is-on" : ""} />)}</span>
              <button type="button" className="pq-btn is-rnd" aria-label="One more ball" disabled={sit.b === 3} onClick={() => set({ b: Math.min(3, sit.b + 1) })}>+</button>
            </div>
            <div><span>Strikes</span>
              <button type="button" className="pq-btn is-rnd" aria-label="One fewer strike" disabled={sit.s === 0} onClick={() => set({ s: Math.max(0, sit.s - 1) })}>&minus;</button>
              <span className="pq-dots" aria-hidden="true">{[0, 1].map((i) => <i key={i} className={i < sit.s ? "is-on" : ""} />)}</span>
              <button type="button" className="pq-btn is-rnd" aria-label="One more strike" disabled={sit.s === 2} onClick={() => set({ s: Math.min(2, sit.s + 1) })}>+</button>
            </div>
          </div>
        </div>
        <div className="pq-sep" />
        <div className="pq-lbl">Runners</div>
        <div className="pq-gamerow">
          <div className="pq-dia">
            <button type="button" className="pq-base" aria-pressed={sit.bases[1]} aria-label="Runner on second" style={{ left: "50%", top: 0 }} onClick={() => base(1)}><i /></button>
            <button type="button" className="pq-base" aria-pressed={sit.bases[2]} aria-label="Runner on third" style={{ left: "8%", top: "42%" }} onClick={() => base(2)}><i /></button>
            <button type="button" className="pq-base" aria-pressed={sit.bases[0]} aria-label="Runner on first" style={{ left: "92%", top: "42%" }} onClick={() => base(0)}><i /></button>
            <span className="pq-plate" />
          </div>
          <div className="pq-side">
            <div className="pq-lbl" id="pg-outs">Outs</div>
            <div className="pq-seg" role="group" aria-labelledby="pg-outs">
              {[0, 1, 2].map((o) => <button key={o} type="button" className="pq-btn" aria-pressed={sit.outs === o} aria-label={`${o} out${o === 1 ? "" : "s"}`} onClick={() => set({ outs: o })}>{o}</button>)}
            </div>
            <div className="pq-lbl" id="pg-inn">Inning, tied game</div>
            <div className="pq-seg" role="group" aria-labelledby="pg-inn">
              {[3, 7, 9].map((n) => <button key={n} type="button" className="pq-btn" aria-pressed={sit.inn === n} aria-label={`${ORD[n]} inning`} onClick={() => set({ inn: n })}>{ORD[n]}</button>)}
            </div>
          </div>
        </div>
        <div className="pq-hit">
          <div className="pq-lbl" id="pg-hit">Hitter</div>
          <div className="pq-seg" role="group" aria-labelledby="pg-hit" style={{ marginTop: 0 }}>
            <button type="button" className="pq-btn" aria-pressed={sit.sameSide} onClick={() => set({ sameSide: true })}>Same side</button>
            <button type="button" className="pq-btn" aria-pressed={!sit.sameSide} onClick={() => set({ sameSide: false })}>Opposite</button>
          </div>
        </div>
        <p className="pq-fixed">He just saw a slider, low and outside.</p>
        <button type="button" className={`pq-btn pq-reset${changed ? " is-shown" : ""}`} tabIndex={changed ? 0 : -1} aria-hidden={!changed} onClick={() => change(STORY_SIT)}>Back to the film&rsquo;s situation</button>
      </div>

      <div className={`pq-mix pq-glass pq-lens${changed ? "" : " is-story"}`}>
        <div className="pq-lbl" id="pg-mix">What the engine would throw here</div>
        <div className="pq-rows" role="list" aria-labelledby="pg-mix">
          {rows.map((g, i) => {
            const isOpen = open === g.key, id = `pg-spots-${g.key.replace(/[^a-z]/gi, "")}`;
            return (
              <div key={g.key} role="listitem" className={`pq-rowwrap${i === 0 ? " is-top" : ""}`} data-flip-id={g.key} data-group={g.name} data-pct={pct(g.p)}>
                <button type="button" className={`pq-row${i === 0 ? " is-top" : ""}`} aria-expanded={isOpen} aria-controls={id} onClick={() => setOpen(isOpen ? null : g.key)}>
                  <span className="t"><span>{g.name}</span><span>{pct(g.p)}%</span></span>
                  <span className="pq-bar" aria-hidden="true"><b style={{ transform: `scaleX(${(g.p / topP).toFixed(3)})` }} /></span>
                </button>
                <ul className="pq-spots" id={id} hidden={!isOpen}>
                  {g.spots.map((s) => <li key={s.quad} data-spot={s.phrase} data-pct={pct(s.p)}><span>{s.phrase}</span><span>{pct(s.p)}%</span></li>)}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="pq-why">{res.why}</p>
        <p className="pq-fine">Real engine, running here. The watch shows the leading call at its most likely spot; in a game the engine draws from this mix. Sample starter, college tables. The watch is an illustration and a prototype.</p>
      </div>

      <svg className="pq-flow" aria-hidden="true">
        <defs><linearGradient id="pq-fl" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#62f07a" /><stop offset=".25" stopColor="#45d1ab" /><stop offset=".5" stopColor="#2cb0cd" /><stop offset=".75" stopColor="#238be8" /><stop offset="1" stopColor="#2f5bff" /></linearGradient></defs>
        <path className="pq-flowg" fill="none" stroke="url(#pq-fl)" strokeWidth="9" strokeLinecap="round" opacity=".35" style={{ filter: "blur(6px)" }} />
        <path className="pq-flowp" fill="none" stroke="url(#pq-fl)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div className="pq-head">
        {/* reduced motion only: the film's watch as a still, with the live face on its screen */}
        <img src="/media/film/watch/head.webp" alt="" width="538" height="672" loading="lazy" decoding="async" />
        <div className="pq-face" aria-hidden="true"><span className="pq-f1">{story.groups[0].pitch.toUpperCase()}</span><hr /><span className="pq-f2"><span>OUTSIDE</span></span><i className="pq-face-ring" /></div>
      </div>
      <p className="pq-sr" role="status" aria-live="polite">{say}</p>
    </div>
  );
}
