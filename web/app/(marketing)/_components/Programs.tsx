"use client";
import { useRef, useState } from "react";
import { calm, motion, useCalm, useKit } from "./motion";

// For programs: what a coach and a pitcher see after the game. One glass panel for a made-up pitcher shaped like the
// site's sample starter, labelled as a sample; the figures are the ones the portal's pitcher page shows and the
// earlier version of this section used. Three big numbers, then one lane per pitch.
// The one motion moment: as the panel comes into view the outing plays back. The pitch count runs up to 412 while
// pitches drop into the three lanes one at a time, strikes lit and the rest left as outlines, so each lane ends as that
// pitch's strike rate out of 25. The Coach / Player switch changes what sits beside each lane (the grade a coach sets,
// or what the engine learned in plain words) and whether the staff row shows. Hovering or focusing a lane lights it.
type P = "FB" | "SL" | "CH";
const BIG: [string, string][] = [["61%", "Strikes"], ["26%", "Whiffs per swing"], ["37%", "Strikeouts with two strikes"]];
const PITCHES: { p: P; name: string; detail: string; strike: number; exp: number; grade: string; learned: string }[] = [
  { p: "FB", name: "Fastball", detail: "86.1 mph, 17 in. ride", strike: 64, exp: 63, grade: "Holds at 4", learned: "Doing what its grade says." },
  { p: "SL", name: "Slider", detail: "78.1 mph, 4 in. sweep", strike: 61, exp: 57, grade: "Up, 3.5 to 4", learned: "Better than its grade. Moving up." },
  { p: "CH", name: "Changeup", detail: "77.2 mph, 14 in. fade", strike: 52, exp: 58, grade: "Down, 3 to 2.5", learned: "Missing more than expected. Moving down." },
];
const STAFF = ["17", "22", "31", "8", "40", "12"];
const DOTS = 25, TOTAL = 412;

export function Programs() {
  const sec = useRef<HTMLElement>(null);
  const [role, setRole] = useState<"coach" | "player">("coach");
  const [hl, setHl] = useState<P | null>(null);
  const coach = role === "coach";
  const still = useCalm();

  useKit(({ gsap }) => {
    const el = sec.current; if (!el || calm()) return;
    const M = motion(), q = (s: string) => Array.from(el.querySelectorAll(s));
    const num = el.querySelector<HTMLElement>(".pq-pr-count b"), c = { v: 0 };
    // the outing plays back, once: pitches fall into the lanes in the order a game would mix them
    const lanes = PITCHES.map((_, i) => q(`.pq-pr-lane:nth-child(${i + 1}) .pq-pr-dots i`)), order: Element[] = [];
    const turn = [0, 1, 0, 2, 0, 1, 2, 1, 0, 2, 1, 0], at = [0, 0, 0];      // a mix, fastball first and most
    for (let n = 0; order.length < lanes.flat().length && n < 400; n++) { const i = turn[n % turn.length]; if (lanes[i][at[i]]) order.push(lanes[i][at[i]++]); }
    const tl = gsap.timeline({ defaults: { ease: M.out }, scrollTrigger: { trigger: el.querySelector(".pq-pr"), start: "top 66%", once: true } });
    tl.from(el.querySelector(".pq-pr"), { opacity: 0, y: 60, scale: 0.97, duration: M.durIn }, 0)
      .from(q(".pq-pr-big > div"), { opacity: 0, y: 22, duration: 0.7, stagger: 0.09 }, 0.15)
      .to(c, { v: TOTAL, duration: 2.6, ease: "power1.inOut", onUpdate: () => { if (num) num.textContent = String(Math.round(c.v)); } }, 0.35)
      .from(order, { opacity: 0, y: -26, scale: 0.4, duration: 0.42, ease: "back.out(2.2)", stagger: 2.2 / order.length }, 0.4)
      .fromTo(q(".pq-pr-rate"), { opacity: 0, x: 14 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.12, clearProps: "opacity,transform" }, 2.5)
      .fromTo(q(".pq-pr-note"), { opacity: 0 }, { opacity: 1, duration: 0.5, stagger: 0.1, clearProps: "opacity" }, 2.75);
    window.dispatchEvent(new Event("pq:lens"));
    return () => { if (num) num.textContent = String(TOTAL); };
  }, [still], sec);

  return (
    <section ref={sec} id="programs" className="pq-sec pq-pg2" aria-labelledby="pp-h" tabIndex={-1}>
      <div className="pq-glowbg" aria-hidden="true" style={{ "--gx": "30%", "--gy": "34%" } as React.CSSProperties} />
      <div className="pq-wrap">
        <div className="pq-pr-headrow">
          <div className="pq-sec-head">
            <h2 id="pp-h">After the game, every pitcher has a page.</h2>
            <p>Built from every pitch you call and every bullpen file he brings.</p>
          </div>
          <div className="pq-pr-switch pq-glass" role="group" aria-label="Who is looking">
            <button type="button" className="pq-btn" aria-pressed={coach} onClick={() => setRole("coach")}>Coach</button>
            <button type="button" className="pq-btn" aria-pressed={!coach} onClick={() => setRole("player")}>Player</button>
          </div>
        </div>

        <figure className={`pq-pr pq-glass is-${role}`} data-hl={hl || undefined} aria-label="A sample pitcher's page in PitchIQ">
          <header className="pq-pr-who">
            <span className="num">17</span>
            <div><b>Sample pitcher</b><span>Right-handed starter</span></div>
            <p className="pq-pr-count"><b>{TOTAL}</b><span>game pitches, 8 outings</span></p>
          </header>
          <dl className="pq-pr-big">
            {BIG.map(([v, l]) => <div key={l}><dd>{v}</dd><dt>{l}</dt></div>)}
          </dl>
          <div className="pq-pr-lanes" role="list" aria-label="Strikes by pitch">
            {PITCHES.map((p) => {
              const lit = Math.round((p.strike / 100) * DOTS);
              return (
                <div key={p.p} role="listitem" className="pq-pr-lane" data-p={p.p} tabIndex={0} onMouseEnter={() => setHl(p.p)} onMouseLeave={() => setHl(null)} onFocus={() => setHl(p.p)} onBlur={() => setHl(null)}>
                  <div className="name"><b>{p.name}</b><small>{p.detail}</small></div>
                  <div className="pq-pr-dots" role="img" aria-label={`${lit} strikes in every ${DOTS} pitches`}>{Array.from({ length: DOTS }, (_, i) => <i key={i} className={i < lit ? "is-k" : ""} />)}</div>
                  <div className="pq-pr-rate"><b>{p.strike}%</b><span>strikes</span></div>
                  <p className="pq-pr-note">
                    {coach
                      ? <><span className="k">Grade you set</span>{p.grade}<small>Expected {p.exp}%</small></>
                      : <><span className="k">What it learned</span>{p.learned}<small>Expected {p.exp}%</small></>}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="pq-pr-foot" aria-live="polite">
            {coach
              ? <span className="pq-pr-staff"><span className="k">Your whole staff</span>{STAFF.map((n, i) => <i key={n} className={i === 0 ? "is-on" : ""}>{n}</i>)}<small>Every pitcher has one of these.</small></span>
              : <span className="pq-pr-own"><span className="k">His page only</span>Teammates never see each other&rsquo;s.</span>}
          </p>
          <figcaption>A sample pitcher, not a real player. Example numbers. Each lane shows strikes in every 25 pitches.</figcaption>
        </figure>
      </div>
    </section>
  );
}
