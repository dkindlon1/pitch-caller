"use client";

import { useEffect, useRef, useState } from "react";
import { MOVE_POINTS, MOVE_TYPES, RANGE, type MovePoint } from "@/content/movement";
import { can3d, whenIdle } from "@/app/components/can3d";
import type { Cloud, View } from "@/app/components/cloud3d";

// Who uses it (coaches, pitchers and their parents) and the TrackMan/Rapsodo uploads, shown as a bullpen's movement
// cloud (content/movement.ts, a made-up bullpen shaped like the sample starter, labelled as such). The cloud is drawn
// flat first; with WebGL it becomes a 3D cloud that turns to show velocity, in the site's black, white and red.
const COLORS: Record<MovePoint["kind"], string> = { FB: "#F04A3E", SL: "#F2B33D", CH: "#3FCB8C" };   // --mk-fb, --mk-sl, --mk-ch
const L = 44, R = 344, T = 14, B = 278;
const px = (hb: number) => L + ((RANGE.hb[1] - hb) / (RANGE.hb[1] - RANGE.hb[0])) * (R - L);
const py = (ivb: number) => B - ((ivb - RANGE.ivb[0]) / (RANGE.ivb[1] - RANGE.ivb[0])) * (B - T);

function Flat() {
  return (
    <svg className="mk-pg-flat" viewBox="0 0 360 320" role="img"
      aria-label="Sample movement plot. Fastballs ride about 18 inches with 8 inches of arm-side run, sliders break about 5 inches to the glove side with little ride, changeups fade about 15 inches to the arm side.">
      {[-6, 0, 6, 12, 18].map((hb) => <line key={`x${hb}`} className={hb === 0 ? "z" : "g"} x1={px(hb)} x2={px(hb)} y1={T} y2={B} />)}
      {[-5, 0, 5, 10, 15, 20, 25].map((ivb) => <line key={`y${ivb}`} className={ivb === 0 ? "z" : "g"} x1={L} x2={R} y1={py(ivb)} y2={py(ivb)} />)}
      {MOVE_POINTS.map((p, i) => <circle key={i} cx={px(p.hb)} cy={py(p.ivb)} r="3.4" fill={COLORS[p.kind]} fillOpacity="0.9" />)}
    </svg>
  );
}

function Cloud3D() {
  const box = useRef<HTMLDivElement>(null);
  const cloud = useRef<Cloud | null>(null);
  const [on, setOn] = useState(false);
  const [view, setView] = useState<View>("break");
  useEffect(() => {
    if (!can3d() || !box.current) return;
    let dead = false, cancel = () => {};
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      cancel = whenIdle(() => {
        import("@/app/components/cloud3d").then(({ mount }) => {
          if (dead || !box.current) return;
          cloud.current = mount(box.current, MOVE_POINTS, COLORS);
          if (cloud.current) setOn(true);
        }).catch(() => {});
      });
    }, { rootMargin: "400px 0px" });
    io.observe(box.current);
    return () => { dead = true; io.disconnect(); cancel(); cloud.current?.dispose(); };
  }, []);
  useEffect(() => { cloud.current?.view(view); }, [view]);
  return (
    <div className={`mk-pg-cloud${on ? " is-on" : ""}`}>
      <div className="mk-pg-cloudbox">
        <Flat />
        <div className="mk-pg-3d" ref={box} />
      </div>
      <div className="mk-pg-cloudbar">
        <ul className="mk-pg-legend">
          {MOVE_TYPES.map((t) => <li key={t.kind}><i style={{ background: COLORS[t.kind] }} />{t.name}<span>{t.n}</span></li>)}
        </ul>
        {on ? (
          <div className="mk-seg mk-seg-sm" role="radiogroup" aria-label="View">
            {(["break", "velo"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? "is-on" : ""} onClick={() => setView(v)}>{v === "break" ? "Movement" : "Velocity"}</button>
            ))}
          </div>
        ) : null}
      </div>
      <p className="mk-pg-src">A sample bullpen, not a real file. Induced vertical break against horizontal break, in inches{on ? "; drag to turn it" : ""}.</p>
    </div>
  );
}

const PEOPLE = [
  {
    t: "For coaches",
    items: [
      "Your roster and each pitcher's arsenal in one place.",
      "Invite a pitching coach and choose what he can change.",
      "Scouting notes on the other team's hitters.",
      "Each pitcher's results by count and pitch, from the games you called.",
    ],
  },
  {
    t: "For pitchers and parents",
    items: [
      "His own stats, and only his. Teammates can't see each other's.",
      "He can update his own grades; his coach sees every change and can undo it.",
      "Bullpen and game files from TrackMan or Rapsodo, on his own page.",
      "Players under 13 join through a parent, who gives consent first.",
    ],
  },
];

export function Program() {
  return (
    <section className="mk-pg" id="program" aria-labelledby="pg-h">
      <div className="mk-wrap">
        <div className="mk-sec-head">
          <h2 id="pg-h">One place for the whole staff</h2>
          <p>Coaches run the team. Pitchers and their parents see their own numbers and bring in their bullpen data.</p>
        </div>
        <div className="mk-pg-grid">
          {PEOPLE.map((g) => (
            <article key={g.t} className="mk-pg-people">
              <h3>{g.t}</h3>
              <ul>{g.items.map((x) => <li key={x}>{x}</li>)}</ul>
            </article>
          ))}
          <article className="mk-glass mk-pg-up">
            <div className="mk-pg-upcopy">
              <h3>TrackMan and Rapsodo files</h3>
              <p>Drop in an export, or any pitch file with a header row. It&apos;s read on your device and you leave out the warmups. PitchIQ proposes his velocity, pitch shape and arm slot from it, and nothing changes until he or his coach accepts.</p>
              <ul className="mk-pg-facts">
                <li>A game file counts more than live BP, and live BP more than a bullpen.</li>
                <li>A file counts half as much after 60 days.</li>
                <li>New column names are matched once, then read the same way every time.</li>
              </ul>
            </div>
            <Cloud3D />
          </article>
        </div>
      </div>
    </section>
  );
}
