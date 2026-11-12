"use client";
import { useActionState, useMemo, useRef, useState } from "react";
import { saveGamePlan, type SaveState } from "./actions";
import type { Bat, PlanInput } from "@/lib/gameplan";

export type PitcherOpt = { id: string; name: string; number: string; hand: string; kinds: string[]; eligible: string | null; restNote: string | null };
export type HitterOpt = { id: string; name: string; number: string; bats: "R" | "L" | "S" };
export type Opts = {
  team: string; game: string | null; today: string; levels: [string, string][]; tiers: [number, string, string][];
  pitchers: PitcherOpt[]; opponents: { id: string; name: string }[]; hitters: Record<string, HitterOpt[]>; catchers: { id: string; name: string; block: string }[];
  canAddOpponent: boolean; defaultInnings: Record<string, number>;
};

const STEPS = ["Game", "Our staff", "Their lineup", "Charting", "Review"];
const KIND: Record<string, string> = { FB: "Fastball", SI: "Sinker", FC: "Cutter", SL: "Slider", CB: "Curveball", CH: "Changeup" };
const dayName = (d: string) => (d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : "");

// The setup sheet: five steps on one page, each one jumpable back to, nothing saved until Save game. The server checks
// everything again (actions.ts, lib/gameplan.ts).
export function GamePlanForm({ o, initial }: { o: Opts; initial: PlanInput }) {
  const [p, setP] = useState<PlanInput>(initial);
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(1);   // which side the next step slides in from
  const [local, setLocal] = useState<string | null>(null);
  const [state, action, pending] = useActionState<SaveState, FormData>(saveGamePlan, null);
  const head = useRef<HTMLHeadingElement>(null);
  const set = (patch: Partial<PlanInput>) => { setP((x) => ({ ...x, ...patch })); setLocal(null); };
  const roster = (p.opponentId && o.hitters[p.opponentId]) || [];
  const oppName = p.opponentId === "__new" ? p.newOpponent : (o.opponents.find((x) => x.id === p.opponentId) || { name: "" }).name;
  const staff = useMemo(() => o.pitchers.filter((x) => p.staffIds.includes(x.id)), [o.pitchers, p.staffIds]);

  const check = (n: number): string | null => {
    if (n === 1 && !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return "Pick the game's date.";
    if (n === 1 && p.opponentId === "__new" && !p.newOpponent.trim()) return "Type the new opponent's name.";
    if (n === 2 && !p.staffIds.length) return "Pick at least one pitcher for today's staff.";
    return null;
  };
  const go = (n: number) => {
    if (n > step) for (let s = step; s < n; s++) { const e = check(s); if (e) { setStep(s); setLocal(e); return; } }
    setDir(n >= step ? 1 : -1); setStep(n); setLocal(null);
    requestAnimationFrame(() => head.current?.focus());
  };
  const serverErr = state?.errors?.length ? state.errors : null;

  const bat = (i: number, patch: Partial<Bat>) => set({ lineup: p.lineup.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const typeName = (i: number, name: string) => {
    const h = roster.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    bat(i, h ? { name: h.name, hitterId: h.id, hand: h.bats } : { name, hitterId: null });
  };
  const fillFromRoster = () => {
    const list = [...roster].sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999)).slice(0, 9);
    const lineup = Array.from({ length: Math.max(9, p.lineup.length) }, (_, i) => (list[i] ? { hitterId: list[i].id, name: list[i].name, hand: list[i].bats } : { hitterId: null, name: "", hand: "R" as const }));
    set({ lineup });
  };
  const toggle = (id: string) => {
    const on = p.staffIds.includes(id);
    const staffIds = on ? p.staffIds.filter((x) => x !== id) : [...p.staffIds, id];
    set({ staffIds, starterId: on && p.starterId === id ? staffIds[0] || null : p.starterId || id });
  };

  return (
    <form action={action} className="pq-sheet glass pq-form" aria-label={o.game ? "Change the game plan" : "Set up a game"}
      onKeyDown={(e) => { if (e.key === "Enter" && step < 5 && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault(); }}>
      <input type="hidden" name="team" value={o.team} />
      <input type="hidden" name="game" value={o.game || ""} />
      <input type="hidden" name="plan" value={JSON.stringify(p)} />
      <ol className="pq-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}><button type="button" onClick={() => go(i + 1)} aria-current={step === i + 1 ? "step" : undefined} className={i + 1 < step ? "done" : undefined}><i>{i + 1}</i>{s}</button></li>
        ))}
      </ol>

      {step === 1 ? (
        <section className="pq-step" aria-labelledby="st-h" style={{ ["--dir" as string]: dir } as React.CSSProperties}>
          <h2 id="st-h" ref={head} tabIndex={-1}>The game</h2>
          <p>When and against whom. Home or away and the scheduled innings let the engine weigh the score late in close games.</p>
          <div className="pq-fields">
            <label className="narrow">Date<input type="date" value={p.date} min={o.today} onChange={(e) => set({ date: e.target.value })} required /></label>
            <label className="narrow">First pitch (optional)<input type="time" value={p.time} onChange={(e) => set({ time: e.target.value })} /></label>
            <label>Opponent
              <select value={p.opponentId || ""} onChange={(e) => set({ opponentId: e.target.value || null, lineup: p.lineup.map(() => ({ hitterId: null, name: "", hand: "R" })) })}>
                <option value="">No opponent picked</option>
                {o.opponents.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                {o.canAddOpponent ? <option value="__new">New opponent…</option> : null}
              </select>
            </label>
            {p.opponentId === "__new" ? <label>New opponent&apos;s name<input value={p.newOpponent} onChange={(e) => set({ newOpponent: e.target.value })} placeholder="Ithaca College" maxLength={80} autoFocus /></label> : null}
          </div>
          <div className="pq-fields">
            <fieldset className="pq-fieldset"><legend>We&apos;re</legend>
              <div className="pq-seg">{([[true, "Home"], [false, "Away"], [null, "Not set"]] as [boolean | null, string][]).map(([v, l]) => (
                <button key={l} type="button" aria-pressed={p.home === v} onClick={() => set({ home: v })}>{l}</button>))}</div>
            </fieldset>
            <label className="narrow">Level<select value={p.level} onChange={(e) => set({ level: e.target.value })}>{o.levels.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="narrow">Scheduled innings<input type="number" inputMode="numeric" min={5} max={12} value={p.innings ?? ""} placeholder={String(o.defaultInnings[p.level] || 9)} onChange={(e) => set({ innings: e.target.value === "" ? null : Number(e.target.value) })} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={p.extrasRunner} onChange={(e) => set({ extrasRunner: e.target.checked })} /> Extra innings start with a runner on 2nd</label>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="pq-step" aria-labelledby="st-h" style={{ ["--dir" as string]: dir } as React.CSSProperties}>
          <h2 id="st-h" ref={head} tabIndex={-1}>Our staff today</h2>
          <p>Who&apos;s available to pitch. Pitchers still resting under your pitch-count rule show the day they&apos;re eligible. Tap again to make one the starter.</p>
          {o.pitchers.length ? (
            <div className="pq-picks" role="group" aria-label="Today's staff">
              {o.pitchers.map((x) => {
                const on = p.staffIds.includes(x.id), starter = on && p.starterId === x.id;
                return (
                  <button key={x.id} type="button" className="pq-pick" aria-pressed={on} onClick={() => (on && !starter ? set({ starterId: x.id }) : toggle(x.id))}
                    aria-label={`${x.name}${on ? starter ? ", starting. Tap to take him off today's staff" : ", on today's staff. Tap to make him the starter" : ""}`}>
                    {starter ? <span className="tag">Starter</span> : null}
                    <b>{x.number ? `#${x.number} ` : ""}{x.name || "Unnamed"}</b>
                    <small>{x.hand === "L" ? "Lefty" : "Righty"}{x.kinds.length ? `, ${x.kinds.map((k) => KIND[k] || k).join(", ")}` : ""}</small>
                    {x.eligible ? <small className="warn">Eligible {x.eligible}{x.restNote ? ` (${x.restNote})` : ""}</small> : null}
                  </button>
                );
              })}
            </div>
          ) : <p className="pq-empty">No pitchers on the roster yet. Add them on the Roster screen first.</p>}
          <label style={{ maxWidth: 360 }}>Today&apos;s catcher
            <select value={p.catcherId || ""} onChange={(e) => set({ catcherId: e.target.value || null })}>
              <option value="">Average blocker (3)</option>
              {o.catchers.map((c) => <option key={c.id} value={c.id}>{c.name}, blocking {c.block}</option>)}
            </select>
          </label>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="pq-step" aria-labelledby="st-h" style={{ ["--dir" as string]: dir } as React.CSSProperties}>
          <h2 id="st-h" ref={head} tabIndex={-1}>Their lineup</h2>
          <p>{oppName ? `${oppName}'s batting order. ` : ""}Only how each hitter bats is needed. A hitter you&apos;ve faced before starts with what was learned about him; a new name joins their roster.</p>
          {roster.length ? <div><button type="button" className="shell-btn" onClick={fillFromRoster}>Fill from their roster</button></div> : null}
          <ol className="pq-lineup">
            {p.lineup.map((b, i) => (
              <li key={i}>
                <input aria-label={`Hitter ${i + 1}`} value={b.name} list={roster.length ? "pq-hitters" : undefined} placeholder={`${i + 1}${["st", "nd", "rd"][i] || "th"} hitter`} onChange={(e) => typeName(i, e.target.value)} />
                <span className="hands" role="group" aria-label={`Hitter ${i + 1} bats`}>
                  {(["R", "L", "S"] as const).map((h) => <button key={h} type="button" aria-pressed={b.hand === h} aria-label={{ R: "Bats right", L: "Bats left", S: "Switch hitter" }[h]} onClick={() => bat(i, { hand: h })}>{h}</button>)}
                </span>
                <span className="known">{b.hitterId ? "On their roster" : b.name ? "New" : ""}</span>
              </li>
            ))}
          </ol>
          {roster.length ? <datalist id="pq-hitters">{roster.map((h) => <option key={h.id} value={h.name}>{h.number ? `#${h.number}` : ""}</option>)}</datalist> : null}
          {p.lineup.length < 12 ? <div><button type="button" className="shell-btn text" onClick={() => set({ lineup: [...p.lineup, { hitterId: null, name: "", hand: "R" }] })}>Add a hitter (DH or extra)</button></div> : null}
        </section>
      ) : null}

      {step === 4 ? (
        <section className="pq-step" aria-labelledby="st-h" style={{ ["--dir" as string]: dir } as React.CSSProperties}>
          <h2 id="st-h" ref={head} tabIndex={-1}>How you&apos;ll chart</h2>
          <p>Pick what your charter can keep up with. Every option calls the game; more detail mostly helps it learn each hitter.</p>
          <div className="pq-picks" role="radiogroup" aria-label="What you'll log">
            {o.tiers.map(([n, t, d]) => (
              <button key={n} type="button" role="radio" aria-checked={p.inputs === n} className="pq-pick" aria-pressed={p.inputs === n} onClick={() => set({ inputs: n })}><b>{t}</b><small>{d}</small></button>
            ))}
          </div>
          <label className="check"><input type="checkbox" checked={p.logLoc} onChange={(e) => set({ logLoc: e.target.checked })} /> Also log where each pitch ended up (one more tap; it&apos;s how the app learns real command)</label>
          <label className="check"><input type="checkbox" checked={p.radar} onChange={(e) => set({ radar: e.target.checked })} /> Log radar readings</label>
          <fieldset className="pq-fieldset"><legend>Today&apos;s umpire</legend>
            <div className="pq-seg">{[["tight", "Tight zone"], ["normal", "Normal"], ["wide", "Wide zone"]].map(([v, l]) => <button key={v} type="button" aria-pressed={p.umpSeed === v} onClick={() => set({ umpSeed: v })}>{l}</button>)}</div>
          </fieldset>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="pq-step" aria-labelledby="st-h" style={{ ["--dir" as string]: dir } as React.CSSProperties}>
          <h2 id="st-h" ref={head} tabIndex={-1}>Review</h2>
          <p>Save it, then start it on the iPad or any device signed in to this team. Everything here can still change on the device during the game.</p>
          <dl className="pq-sum">
            <div><dt>Game</dt><dd>{dayName(p.date)}{p.time ? `, ${p.time}` : ""}<br />{oppName ? `${p.home === false ? "at" : "vs"} ${oppName}` : "No opponent picked"}{p.home === null ? "" : p.home ? ", home" : ", away"}</dd></div>
            <div><dt>Level and length</dt><dd>{(o.levels.find((l) => l[0] === p.level) || ["", p.level])[1]}, {p.innings || o.defaultInnings[p.level] || 9} innings{p.extrasRunner ? ", runner on 2nd in extras" : ""}</dd></div>
            <div><dt>Our staff</dt><dd>{staff.length ? <ol>{[...staff].sort((a, b) => (a.id === p.starterId ? -1 : b.id === p.starterId ? 1 : 0)).map((x) => <li key={x.id}>{x.name}{x.id === p.starterId ? " (starts)" : ""}</li>)}</ol> : "Nobody picked"}</dd></div>
            <div><dt>Their lineup</dt><dd>{p.lineup.some((b) => b.name) ? <ol>{p.lineup.filter((b) => b.name).map((b, i) => <li key={i}>{b.name} ({b.hand})</li>)}</ol> : "Hands only, no names"}</dd></div>
            <div><dt>Charting</dt><dd>{(o.tiers.find((t) => t[0] === p.inputs) || [0, ""])[1]}{p.logLoc ? ", with locations" : ""}{p.radar ? ", radar" : ""}; {p.umpSeed === "normal" ? "normal" : p.umpSeed} zone</dd></div>
            <div><dt>Catcher</dt><dd>{(o.catchers.find((c) => c.id === p.catcherId) || { name: "Average blocker" }).name}</dd></div>
          </dl>
        </section>
      ) : null}

      {local ? <p className="pq-err" role="alert">{local}</p> : null}
      {serverErr ? <div className="pq-err" role="alert">{serverErr.map((e, i) => <p key={i}>{e.msg} <button type="button" className="shell-btn text" onClick={() => go(e.step)}>Go to {STEPS[e.step - 1]}</button></p>)}</div> : null}
      <div className="pq-nav">
        {step > 1 ? <button type="button" className="shell-btn" onClick={() => go(step - 1)}>Back</button> : <span />}
        <div className="end">
          {/* separate keys: React must not turn the Next button into the submit button in the middle of its own click
              (the browser would then submit the form on the tap that only meant to reach Review) */}
          {step < 5 ? <button key="next" type="button" className="shell-btn primary" onClick={() => go(step + 1)}>Next: {STEPS[step]}</button>
            : <button key="save" type="submit" className="shell-btn primary" disabled={pending}>{pending ? "Saving…" : o.game ? "Save changes" : "Save game"}</button>}
        </div>
      </div>
    </form>
  );
}
