"use client";

import { useEffect, useRef, useState } from "react";
import { MOVE_POINTS, MOVE_TYPES, RANGE, type MovePoint } from "@/content/movement";
import { can3d, whenStill } from "@/app/components/can3d";
import type { Cloud, View } from "@/app/components/cloud3d";

// Every pitcher gets his own page: one idea, shown with one picture, his bullpen's movement cloud (content/movement.ts, a
// made-up bullpen shaped like the sample starter, labelled as such), big and on the black stage like the rest of the
// page. Drawn flat first; with WebGL it becomes a 3D cloud that turns to show velocity. The details (accounts, consent,
// how files are weighed) live in the FAQ.
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
      cancel = whenStill(() => {
        import("@/app/components/cloud3d").then(({ mount }) => {
          if (dead || !box.current) return;
          cloud.current = mount(box.current, MOVE_POINTS, COLORS, { zoom: 1.5 });
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

export function Program() {
  return (
    <section className="mk-pg" id="program" aria-labelledby="pg-h">
      <div className="mk-wrap mk-pg-head">
        <h2 id="pg-h">Every pitcher gets his own page</h2>
        <p>His pitches, his numbers and his bullpen files. Coaches see the whole staff. Teammates never see each other&apos;s.</p>
      </div>
      <div className="mk-pg-stage">
        <Cloud3D />
      </div>
      <p className="mk-wrap mk-pg-note">
        Drop in a TrackMan or Rapsodo file and PitchIQ proposes his velocity, pitch shapes and arm slot from it. Nothing
        changes until he or his coach says yes.
      </p>
    </section>
  );
}
