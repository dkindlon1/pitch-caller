"use client";

import { useEffect, useRef, useState } from "react";
import { CELL, PITCH_COLOR, type Pitch } from "@/content/at-bat";
import { can3d, whenIdle } from "./can3d";
import { Zone } from "./Zone";
import type { Scene, StagePitch } from "./pitch3d";

// The hero's zone. The page ships the flat zone (it paints at once and is what reduced motion and phones without WebGL
// keep); once the page has loaded and the browser is idle, the 3D pitch takes its place in the same box.
const VELO: Record<Pitch["pitch"], number> = { Fastball: 86, Slider: 78, Changeup: 77, Curveball: 72 };
const KIND: Record<Pitch["pitch"], StagePitch["kind"]> = { Fastball: "FB", Slider: "SL", Changeup: "CH", Curveball: "CB" };
const QUAD: Record<Pitch["spot"], string> = { "Up and in": "UP-IN", "Up and away": "UP-AWAY", "Down and in": "DOWN-IN", "Down and away": "DOWN-AWAY", "Get it over": "MIDDLE", Chase: "CHASE" };
const toStage = (p: Pitch): StagePitch => ({ kind: KIND[p.pitch], velo: VELO[p.pitch], cell: p.spot === "Chase" ? "chase" : CELL[p.spot], color: PITCH_COLOR[p.pitch].fill });

export function PitchStage({ pitches, current }: { pitches: Pitch[]; current: number }) {
  const box = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!can3d()) return;
    let dead = false;
    const cancel = whenIdle(() => {
      import("./pitch3d").then(({ mount }) => {
        if (dead || !box.current) return;
        scene.current = mount(box.current);
        if (scene.current) setOn(true);
      }).catch(() => {});
    });
    return () => { dead = true; cancel(); scene.current?.dispose(); scene.current = null; };
  }, []);

  useEffect(() => { if (on && scene.current && current >= 0) scene.current.play(pitches.map(toStage), current); }, [on, current, pitches]);

  const p = current >= 0 ? pitches[current] : null;
  return (
    <div className={`stage${on ? " on" : ""}`}>
      <div className="stage-box">
        <Zone pitches={pitches} current={current} />
        <div className="stage-3d" ref={box} />
      </div>
      {p ? (
        <p className="hud mono" aria-hidden="true">
          <span style={{ color: PITCH_COLOR[p.pitch].fill }}>{PITCH_COLOR[p.pitch].code}</span> · {QUAD[p.spot]} · {p.balls}-{p.strikes}
          <small>{VELO[p.pitch]} mph</small>
        </p>
      ) : null}
    </div>
  );
}
