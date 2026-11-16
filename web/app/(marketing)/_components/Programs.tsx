"use client";
import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { motion, reducedMotion } from "./motion";

// For programs: what a coach and a pitcher see after the game, shown as the pitcher's own page building itself.
// One glass panel drawn like the portal's pitcher page, for a made-up pitcher shaped like the site's sample starter and
// labelled as a sample. The figures are the ones the previous section showed (the portal's pitcher page: by pitch, by
// hitter side, usage by count, velocity from his uploads, expected strikes next to his grades).
// As the panel enters, the outing fills in: the pitch count runs up while bars grow pitch by pitch and the count grid
// fills cell by cell. The Coach / Player switch re-lays the same cards (a shared-element move), so you can see what
// each role gets. Hovering or focusing a pitch lights it across every chart. Phones get the cards as a swipeable row.
type P = "FB" | "SL" | "CH";
const TOP: [string, string][] = [["412", "Game pitches"], ["61%", "Strikes"], ["26%", "Whiffs per swing"], ["37%", "K with two strikes"], ["20%", "Hard contact"]];
const PITCHES: { p: P; name: string; velo: string; move: string; strike: number; whiff: number; hard: number }[] = [
  { p: "FB", name: "Fastball", velo: "86.1", move: "17 in. ride, 9 in. run", strike: 64, whiff: 19, hard: 24 },
  { p: "SL", name: "Slider", velo: "77.4", move: "2 in. drop, 4 in. sweep", strike: 61, whiff: 34, hard: 14 },
  { p: "CH", name: "Changeup", velo: "78.0", move: "8 in. ride, 14 in. fade", strike: 52, whiff: 29, hard: 18 },
];
// fastball / slider / changeup share in each count
const USAGE: [string, number, number, number][] = [
  ["0-0", 62, 24, 14], ["1-0", 66, 18, 16], ["2-0", 74, 12, 14], ["3-0", 92, 4, 4],
  ["0-1", 48, 34, 18], ["1-1", 50, 30, 20], ["2-1", 60, 22, 18], ["3-1", 76, 12, 12],
  ["0-2", 34, 46, 20], ["1-2", 36, 44, 20], ["2-2", 42, 38, 20], ["3-2", 58, 26, 16],
];
const VELO = [85.2, 85.6, 85.9, 86.3, 85.8, 86.4, 86.1, 86.6];   // fastball average, last eight outings
const SIDES: [string, number, number][] = [["Same-side hitters", 63, 28], ["Opposite-side hitters", 59, 23]];
const LEARNED: { p: P; name: string; exp: number; got: number; grade: string }[] = [
  { p: "FB", name: "Fastball", exp: 63, got: 64, grade: "Holds at 4" },
  { p: "SL", name: "Slider", exp: 57, got: 61, grade: "Up, 3.5 to 4" },
  { p: "CH", name: "Changeup", exp: 58, got: 52, grade: "Down, 3 to 2.5" },
];
const STAFF = [["17", "Right-handed starter"], ["22", "Left-handed starter"], ["31", "Right-handed reliever"], ["8", "Left-handed reliever"]];

function Velo() {
  const W = 260, H = 96, lo = 84.8, hi = 86.9;
  const x = (i: number) => 8 + (i / (VELO.length - 1)) * (W - 16), y = (v: number) => H - 10 - ((v - lo) / (hi - lo)) * (H - 22);
  const d = VELO.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  return (
    <span className="pq-pp-velo" data-p="FB"><span className="in"><svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={`${d}L${x(VELO.length - 1)} ${H}L${x(0)} ${H}Z`} className="a" />
      <path d={d} className="l" />
      {VELO.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === VELO.length - 1 ? 4 : 2.4} className={i === VELO.length - 1 ? "p on" : "p"} />)}
    </svg></span></span>
  );
}

export function Programs() {
  const sec = useRef<HTMLElement>(null);
  const flip = useRef<Flip.FlipState | null>(null);
  const [role, setRole] = useState<"coach" | "player">("coach");
  const [hl, setHl] = useState<P | null>(null);
  const lit = (p: P) => ({ "data-p": p, onMouseEnter: () => setHl(p), onMouseLeave: () => setHl(null), onFocus: () => setHl(p), onBlur: () => setHl(null) });

  const pick = (r: "coach" | "player") => {
    if (r === role) return;
    const el = sec.current;
    if (el && !reducedMotion() && window.matchMedia("(min-width: 861px)").matches) { gsap.registerPlugin(Flip); flip.current = Flip.getState(el.querySelectorAll(".pq-pp-card"), { props: "opacity" }); }
    setRole(r);
  };
  useLayoutEffect(() => {
    const el = sec.current, st = flip.current; if (!el || !st) return;
    flip.current = null;
    const M = motion();
    Flip.from(st, { targets: el.querySelectorAll(".pq-pp-card"), duration: M.durFlip + 0.1, ease: M.out, absolute: false, stagger: 0.025,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.45, delay: 0.12, ease: M.out }),
      onLeave: (els) => gsap.to(els, { opacity: 0, scale: 0.94, duration: 0.25, ease: M.inn }) });
  }, [role]);

  useGSAP(() => {
    const el = sec.current; if (!el || reducedMotion()) return;
    gsap.registerPlugin(ScrollTrigger);
    const M = motion(), q = (s: string) => el.querySelectorAll(s);
    // the outing fills in, once, as the panel comes into view
    const num = el.querySelector<HTMLElement>(".pq-pp-top dd[data-count]"), total = 412, c = { v: 0 };
    const tl = gsap.timeline({ defaults: { ease: M.out }, scrollTrigger: { trigger: el.querySelector(".pq-pp"), start: "top 68%", once: true } });
    tl.from(el.querySelector(".pq-pp"), { opacity: 0, y: 60, scale: 0.97, duration: M.durIn }, 0)
      .to(c, { v: total, duration: 2.4, ease: "power1.inOut", onUpdate: () => { if (num) num.textContent = String(Math.round(c.v)); } }, 0.2)
      .from(q(".pq-pp-top > div"), { opacity: 0, y: 14, duration: 0.5, stagger: 0.07 }, 0.25)
      .from(q(".pq-pp-meter b"), { scaleX: 0, duration: 0.9, stagger: 0.085, ease: "power2.out" }, 0.45)
      .from(q(".pq-pp-counts i"), { scaleY: 0, duration: 0.5, stagger: { each: 0.03, from: "start" }, ease: "power2.out" }, 0.6)
      .from(q(".pq-pp-velo .in"), { xPercent: -101, duration: 1.3, ease: "power2.inOut" }, 0.7).from(q(".pq-pp-velo svg"), { xPercent: 101, duration: 1.3, ease: "power2.inOut" }, 0.7)
      // (explicit end values: the table rows carry a CSS opacity transition, which a from() tween would read mid-flight)
      .fromTo(q(".pq-pp-side, .pq-pp-learned tbody tr, .pq-pp-staff li"), { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.06, clearProps: "opacity,transform" }, 0.9);
    window.dispatchEvent(new Event("pq:lens"));
  }, { scope: sec });

  const coach = role === "coach";
  return (
    <section ref={sec} id="programs" className="pq-sec pq-pg2" aria-labelledby="pp-h" tabIndex={-1}>
      <div className="pq-glowbg" aria-hidden="true" style={{ "--gx": "30%", "--gy": "34%" } as React.CSSProperties} />
      <div className="pq-wrap">
        <div className="pq-pp-headrow">
          <div className="pq-sec-head">
            <h2 id="pp-h">After the game, every pitcher has a page.</h2>
            <p>Built from every pitch you call and every bullpen file he brings.</p>
          </div>
          <div className="pq-pp-switch pq-glass" role="group" aria-label="Who is looking">
            <button type="button" className="pq-btn" aria-pressed={coach} onClick={() => pick("coach")}>Coach</button>
            <button type="button" className="pq-btn" aria-pressed={!coach} onClick={() => pick("player")}>Player</button>
          </div>
        </div>
        <p className="pq-pp-role" aria-live="polite">{coach ? "Coaches see the whole staff, and set each pitch's grade." : "A player sees his own page. Teammates never see each other's."}</p>

        <figure className={`pq-pp pq-glass is-${role}`} data-hl={hl || undefined} aria-label="A sample pitcher's page in PitchIQ">
          <div className="pq-pp-grid">
            {coach ? (
              <section className="pq-pp-card pq-pp-staff" data-flip-id="staff">
                <h3>Your staff</h3>
                <ul>{STAFF.map(([n, r], i) => <li key={n} className={i === 0 ? "is-on" : ""}><b>{n}</b><span>{r}</span></li>)}</ul>
              </section>
            ) : null}
            <header className="pq-pp-card pq-pp-who" data-flip-id="who">
              <span className="num">17</span>
              <div><b>Sample pitcher</b><span>Right-handed starter, three-quarter slot</span></div>
              <span className="meta">8 outings, 3 bullpen files</span>
            </header>
            <dl className="pq-pp-card pq-pp-top" data-flip-id="top">
              {TOP.map(([v, l], i) => <div key={l}><dt>{l}</dt><dd data-count={i === 0 ? "" : undefined}>{v}</dd></div>)}
            </dl>
            <section className="pq-pp-card pq-pp-pitches" data-flip-id="pitches">
              <h3>By pitch</h3>
              {PITCHES.map((p) => (
                <div key={p.p} className="pq-pp-pitch" tabIndex={0} {...lit(p.p)}>
                  <div className="name"><i /><b>{p.name}</b><small>{p.velo} mph, {p.move}</small></div>
                  {([["Strikes", p.strike], ["Whiff", p.whiff], ["Hard", p.hard]] as [string, number][]).map(([l, v]) => (
                    <div key={l} className="pq-pp-meter"><span>{l}</span><span className="tr"><b style={{ transform: `scaleX(${v / 100})` }} /></span><em>{v}%</em></div>
                  ))}
                </div>
              ))}
            </section>
            <section className="pq-pp-card pq-pp-usage" data-flip-id="usage">
              <h3>Usage by count</h3>
              <div className="pq-pp-counts">
                {USAGE.map(([n, f, s, c]) => (
                  <div key={n} role="img" aria-label={`${n}: fastball ${f}%, slider ${s}%, changeup ${c}%`}>
                    <span className="bar"><i data-p="CH" style={{ height: `${c}%` }} /><i data-p="SL" style={{ height: `${s}%` }} /><i data-p="FB" style={{ height: `${f}%` }} /></span>
                    <small>{n}</small>
                  </div>
                ))}
              </div>
              <p className="pq-pp-key">{PITCHES.map((p) => <span key={p.p} tabIndex={0} {...lit(p.p)}><i />{p.name}</span>)}</p>
            </section>
            {coach ? null : (
              <section className="pq-pp-card pq-pp-trend" data-flip-id="trend">
                <h3>Fastball velocity</h3>
                <p className="big">86.6<small> mph</small></p>
                <Velo />
                <p className="sub">Last 8 outings, from his TrackMan files</p>
              </section>
            )}
            {coach ? null : (
              <section className="pq-pp-card pq-pp-sides" data-flip-id="sides">
                <h3>By hitter side</h3>
                {SIDES.map(([s, st, wh]) => <div key={s} className="pq-pp-side"><span>{s}</span><b>{st}%</b><small>strikes</small><b>{wh}%</b><small>whiff</small></div>)}
              </section>
            )}
            <section className="pq-pp-card pq-pp-learned" data-flip-id="learned">
              <h3>What the engine learned</h3>
              <table>
                <thead><tr><th scope="col">Pitch</th><th scope="col">Expected strikes</th><th scope="col">Actual</th><th scope="col">{coach ? "Grade you set" : "His grade"}</th></tr></thead>
                <tbody>
                  {LEARNED.map((r) => (
                    <tr key={r.p} {...lit(r.p)}>
                      <th scope="row"><i />{r.name}</th>
                      <td>{r.exp}%</td><td className={r.got > r.exp + 1 ? "up" : r.got < r.exp - 1 ? "down" : ""}>{r.got}%</td><td>{r.grade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
          <figcaption>A sample pitcher, not a real player. Example numbers.</figcaption>
        </figure>
      </div>
    </section>
  );
}
