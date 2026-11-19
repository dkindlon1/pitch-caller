"use client";
import { useState } from "react";
import { cellWords, PITCH_FLAGS, RATING_KEYS, RATING_LABEL, RATING_WORDS, SMALL_BALL, SPRAY, ZONE_KEYS, inZone, nextHeat, type FieldDef, type Heat, type Rating, type RatingKey, type Spray } from "@/lib/opp_model.ts";
import { saveHitterScouting } from "@/app/app/t/[team]/opponents/actions";
import "./opp.css";

// A hitter's scouting (plan 3): ratings 1 / 2 / 3 with Unknown, spray, the zone grid (tap: hot, cold, neutral), pitch
// checkboxes, speed / small ball, class year, notes and the owner's custom fields. Saved as one record through pc_push;
// read-only for anyone who can't edit opponents. None of it reaches the engine yet.
export type HitterScoutingInit = { ratings: Partial<Record<RatingKey, Rating>>; spray: Spray | null; zone: Record<string, Heat>; pitchFlags: Record<string, boolean>;
  smallBall: Record<string, boolean>; classYear: string; notes: string; custom: Record<string, unknown> };

const CELL_LABEL = (k: string, bats: string) => cellWords(k, bats);

export function ZoneGrid({ value, onChange, bats, disabled, label }: { value: Record<string, Heat>; onChange?: (z: Record<string, Heat>) => void; bats: string; disabled?: boolean; label: string }) {
  return (
    <div className="op-zone" role="group" aria-label={label}>
      {ZONE_KEYS.map((k) => {
        const h = value[k], name = CELL_LABEL(k, bats);
        return <button key={k} type="button" className={`op-cell${inZone(k) ? " zone" : " ring"}${h ? ` ${h}` : ""}`} disabled={disabled} aria-pressed={h ? "true" : "false"}
          aria-label={`${name}: ${h || "neutral"}`} title={`${name}: ${h || "neutral"}`}
          onClick={() => { if (!onChange) return; const n = nextHeat(h); const z = { ...value }; if (n) z[k] = n; else delete z[k]; onChange(z); }}>
          <span aria-hidden="true">{h === "hot" ? "Hot" : h === "cold" ? "Cold" : ""}</span></button>;
      })}
    </div>
  );
}

export function HitterEditor({ team, opp, hitter, bats, init, defs, canEdit }: { team: string; opp: string; hitter: string; bats: string; init: HitterScoutingInit; defs: FieldDef[]; canEdit: boolean }) {
  const [s, setS] = useState<HitterScoutingInit>(init);
  const [dirty, setDirty] = useState(false);
  const set = (patch: Partial<HitterScoutingInit>) => { setS((x) => ({ ...x, ...patch })); setDirty(true); };
  const live = defs.filter((d) => d.scope === "hitter");
  const seg = (name: string, items: [string, string][], cur: string, pick: (v: string) => void) => (
    <div className="rp-seg" role="group" aria-label={name}>
      {items.map(([v, l]) => <button key={v} type="button" aria-pressed={cur === v} disabled={!canEdit} onClick={() => pick(v)}>{l}</button>)}
    </div>);
  return (
    <form action={saveHitterScouting} className="op-edit">
      <input type="hidden" name="team" value={team} /><input type="hidden" name="opp" value={opp} /><input type="hidden" name="hitter" value={hitter} />
      <input type="hidden" name="payload" value={JSON.stringify({ ...s, spray: s.spray })} />
      <section className="rp-card op-block" aria-labelledby="h-ratings">
        <h2 id="h-ratings">Ratings</h2>
        <dl className="op-ratings">
          {RATING_KEYS.map((k) => (
            <div key={k}><dt>{RATING_LABEL[k]}</dt>
              <dd>{seg(RATING_LABEL[k], [["1", "1"], ["2", "2"], ["3", "3"], ["unknown", "Unknown"]], String(s.ratings[k] ?? "unknown"), (v) => set({ ratings: { ...s.ratings, [k]: v === "unknown" ? "unknown" : (+v as 1 | 2 | 3) } }))}
                <span className="op-word">{typeof s.ratings[k] === "number" ? RATING_WORDS[k][(s.ratings[k] as number) - 1] : "Unknown"}</span></dd></div>))}
          <div><dt>Spray</dt><dd>{seg("Spray", [...SPRAY, ["unknown", "Unknown"]], s.spray || "unknown", (v) => set({ spray: v as Spray }))}</dd></div>
        </dl>
        <p className="rp-note">Ratings and spray are scouting for the staff: the engine doesn&rsquo;t read them yet (that comes after the hitter model update).</p>
      </section>
      <div className="op-two">
        <section className="rp-card op-block" aria-labelledby="h-zone">
          <h2 id="h-zone">Hot and cold</h2>
          <ZoneGrid value={s.zone} onChange={canEdit ? (z) => set({ zone: z }) : undefined} bats={bats} disabled={!canEdit} label="Zone grid, catcher's view" />
          <p className="rp-note">Catcher&rsquo;s view{bats ? `, he bats ${bats === "L" ? "left" : bats === "S" ? "both ways" : "right"}` : ""}. The box is the strike zone, the ring the chase spots. {canEdit ? "Tap a spot: hot, then cold, then neutral." : ""}</p>
        </section>
        <section className="rp-card op-block" aria-labelledby="h-pitches">
          <h2 id="h-pitches">Pitches</h2>
          {PITCH_FLAGS.map(([k, l]) => <label key={k} className="rp-check"><input type="checkbox" checked={!!s.pitchFlags[k]} disabled={!canEdit} onChange={(e) => set({ pitchFlags: { ...s.pitchFlags, [k]: e.target.checked } })} /> {l}</label>)}
          <h2 style={{ marginTop: 14 }}>Speed and small ball</h2>
          {SMALL_BALL.map(([k, l]) => <label key={k} className="rp-check"><input type="checkbox" checked={!!s.smallBall[k]} disabled={!canEdit} onChange={(e) => set({ smallBall: { ...s.smallBall, [k]: e.target.checked } })} /> {l}</label>)}
          <label className="op-field"><span>Class year</span><input value={s.classYear} disabled={!canEdit} maxLength={20} placeholder="JR…" autoComplete="off" onChange={(e) => set({ classYear: e.target.value })} /></label>
        </section>
      </div>
      {live.length ? (
        <section className="rp-card op-block" aria-labelledby="h-custom">
          <h2 id="h-custom">Your fields</h2>
          {live.map((d) => {
            const v = s.custom[d.id], ro = !canEdit || !!d.archived_at, put = (x: unknown) => set({ custom: { ...s.custom, [d.id]: x } });
            return <div key={d.id} className="op-custom">
              {d.kind === "checkbox" ? <label className="rp-check"><input type="checkbox" checked={v === true} disabled={ro} onChange={(e) => put(e.target.checked)} /> {d.label}</label>
                : d.kind === "dropdown" ? <label className="op-field"><span>{d.label}</span><select value={typeof v === "string" ? v : ""} disabled={ro} onChange={(e) => put(e.target.value)}><option value="">Not set</option>{d.options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
                : d.kind === "text" ? <label className="op-field"><span>{d.label}</span><input value={typeof v === "string" ? v : ""} disabled={ro} maxLength={1000} autoComplete="off" onChange={(e) => put(e.target.value)} /></label>
                : <div><span className="op-flabel">{d.label}</span><ZoneGrid value={(v as Record<string, Heat>) || {}} onChange={ro ? undefined : (z) => put(z)} bats={bats} disabled={ro} label={d.label} /></div>}
              {d.archived_at ? <span className="rp-note"> (archived)</span> : null}
            </div>;
          })}
        </section>) : null}
      <section className="rp-card op-block" aria-labelledby="h-notes">
        <h2 id="h-notes">Notes</h2>
        <label className="sr" htmlFor="op-notes">Notes on this hitter</label>
        <textarea id="op-notes" className="op-notes" value={s.notes} disabled={!canEdit} maxLength={4000} autoComplete="off" placeholder="What to remember about him…" onChange={(e) => set({ notes: e.target.value })} />
        <p className="rp-note">Staff only. Players never see opponents.</p>
      </section>
      {canEdit ? <div className="op-save"><button type="submit" className="shell-btn">{dirty ? "Save scouting" : "Saved"}</button>{dirty ? <span className="rp-note" role="status">Unsaved changes</span> : null}</div> : null}
    </form>
  );
}
