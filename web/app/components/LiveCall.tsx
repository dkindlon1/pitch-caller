"use client";

import { useEffect, useState } from "react";
import { AT_BAT } from "@/content/at-bat";
import { CallBand } from "./CallBand";
import { Lights } from "./Lights";
import { PitchStage } from "./PitchStage";

// Plays the real at-bat in content/at-bat.ts the way the app shows it: the call with its reason, then what happened.
const CALL_MS = 2600;
const RESULT_MS = 1300;
const END_MS = 2600;

type Step = { i: number; phase: "call" | "result" | "end" };

function next({ i, phase }: Step): Step {
  if (phase === "call") return { i, phase: "result" };
  if (phase === "result") return i < AT_BAT.length - 1 ? { i: i + 1, phase: "call" } : { i, phase: "end" };
  return { i: 0, phase: "call" };
}

export function LiveCall() {
  const [step, setStep] = useState<Step>({ i: 0, phase: "call" });
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    // Under reduced motion the panel rests on the two-strike call and plays only if asked.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
      setStep({ i: AT_BAT.length - 1, phase: "call" });
    }
  }, []);

  useEffect(() => {
    if (!playing) return;
    const ms = step.phase === "call" ? CALL_MS : step.phase === "result" ? RESULT_MS : END_MS;
    const t = setTimeout(() => setStep(next), ms);
    return () => clearTimeout(t);
  }, [step, playing]);

  const p = AT_BAT[step.i];
  const after = step.phase !== "call";
  const balls = p.balls + (after && p.result === "Ball" ? 1 : 0);
  const strikes = Math.min(2, p.strikes + (after && p.result !== "Ball" && !(p.result === "Foul" && p.strikes === 2) ? 1 : 0));
  const out = step.phase === "end";

  return (
    <div className="call-panel" aria-live="polite">
      <div className="call-top">
        <span className="call-hitter">Right-handed hitter, 1st time up</span>
        <span className="call-count">
          <span className="lbl">Count</span>
          <b className="mono">{out ? "K" : `${balls}-${strikes}`}</b>
          <Lights n={balls} of={3} label="balls" />
          <Lights n={out ? 2 : strikes} of={2} label="strikes" />
        </span>
      </div>

      <div className="call-body">
        <div className="call-text" key={`${step.i}-${step.phase === "end"}`}>
          <CallBand p={p} />
          <p className="call-why">{p.why}</p>
          <p className={`call-result ${after ? "shown" : ""}`}>
            {out ? "Strikeout swinging" : after ? p.result : `Pitch ${step.i + 1} of the at-bat`}
          </p>
        </div>
        <PitchStage pitches={AT_BAT} current={step.i} />
      </div>

      <button type="button" className="call-pause" onClick={() => setPlaying((v) => !v)}
        aria-label={playing ? "Pause the at-bat" : "Play the at-bat"}>
        {playing ? "Pause" : "Play"}
      </button>
    </div>
  );
}
