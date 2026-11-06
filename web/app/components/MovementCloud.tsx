"use client";

import { useEffect, useRef, useState } from "react";
import { MOVE_POINTS, MOVE_TYPES, RANGE, type MovePoint } from "@/content/movement";
import { can3d, whenIdle } from "./can3d";
import type { Cloud, View } from "./cloud3d";

// The movement plot from an uploaded bullpen. The server renders it flat (what reduced motion and no-WebGL visitors
// keep, and what a screen reader reads); in the browser a 3D cloud of the same points takes its place and can be
// turned to show velocity.
const COLORS = Object.fromEntries(MOVE_TYPES.map((t) => [t.kind, t.color])) as Record<MovePoint["kind"], string>;
const L = 44, R = 344, T = 14, B = 278;
const px = (hb: number) => L + ((RANGE.hb[1] - hb) / (RANGE.hb[1] - RANGE.hb[0])) * (R - L);   // arm side on the left
const py = (ivb: number) => B - ((ivb - RANGE.ivb[0]) / (RANGE.ivb[1] - RANGE.ivb[0])) * (B - T);

function Flat() {
  return (
    <svg className="cloud-flat" viewBox="0 0 360 320" role="img"
      aria-label="Sample movement plot. Fastballs ride about 18 inches with 8 inches of arm-side run, sliders break about 5 inches to the glove side with little ride, changeups fade about 15 inches to the arm side.">
      {[-6, 0, 6, 12, 18].map((hb) => <line key={`x${hb}`} className={hb === 0 ? "zero" : "grid"} x1={px(hb)} x2={px(hb)} y1={T} y2={B} />)}
      {[-5, 0, 5, 10, 15, 20, 25].map((ivb) => <line key={`y${ivb}`} className={ivb === 0 ? "zero" : "grid"} x1={L} x2={R} y1={py(ivb)} y2={py(ivb)} />)}
      {[-6, 0, 6, 12, 18].map((hb) => <text key={`tx${hb}`} className="tick" x={px(hb)} y={B + 16} textAnchor="middle">{hb}</text>)}
      {[0, 10, 20].map((ivb) => <text key={`ty${ivb}`} className="tick" x={L - 8} y={py(ivb)} dy="0.35em" textAnchor="end">{ivb}</text>)}
      <text className="axis" x={(L + R) / 2} y={B + 36} textAnchor="middle">Horizontal break, in (arm side on the left)</text>
      {MOVE_POINTS.map((p, i) => <circle key={i} cx={px(p.hb)} cy={py(p.ivb)} r="3.4" fill={COLORS[p.kind]} fillOpacity="0.85" />)}
    </svg>
  );
}

export function MovementCloud() {
  const box = useRef<HTMLDivElement>(null);
  const cloud = useRef<Cloud | null>(null);
  const [on, setOn] = useState(false);
  const [view, setView] = useState<View>("break");

  useEffect(() => {
    if (!can3d() || !box.current) return;
    let dead = false, cancel = () => {};
    // load when the section is close, after the page is idle
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      cancel = whenIdle(() => {
        import("./cloud3d").then(({ mount }) => {
          if (dead || !box.current) return;
          cloud.current = mount(box.current, MOVE_POINTS, COLORS);
          if (cloud.current) setOn(true);
        }).catch(() => {});
      });
    }, { rootMargin: "400px 0px" });
    io.observe(box.current);
    return () => { dead = true; io.disconnect(); cancel(); cloud.current?.dispose(); cloud.current = null; };
  }, []);

  const pick = (v: View) => { setView(v); cloud.current?.view(v); };

  return (
    <figure className={`cloud${on ? " on" : ""}`}>
      <div className="cloud-box">
        <Flat />
        <div className="cloud-3d" ref={box} />
      </div>
      <figcaption>
        <span className="legend">
          {MOVE_TYPES.map((t) => <span key={t.kind}><i style={{ background: t.color }} />{t.name}, {t.n}</span>)}
        </span>
        {on ? (
          <span className="cloud-views" role="group" aria-label="Turn the plot">
            <button type="button" aria-pressed={view === "break"} onClick={() => pick("break")}>Break</button>
            <button type="button" aria-pressed={view === "velo"} onClick={() => pick("velo")}>Velocity</button>
          </span>
        ) : null}
        <span className="cloud-note">
          Sample data, not a real file. {view === "velo" && on ? "Velocity in mph, slower on the left; the fastball sits 8 to 9 mph above the slider and changeup." : "Induced vertical break against horizontal break, in inches."}
        </span>
      </figcaption>
    </figure>
  );
}
