"use client";
import { useState } from "react";
import { TENDENCIES, type FieldDef, type Heat } from "@/lib/opp_model.ts";
import { saveTeamScouting } from "@/app/app/t/[team]/opponents/actions";
import { ZoneGrid } from "./HitterEditor";
import "./opp.css";

// An opponent team's tendencies and the owner's team fields (plan 4). Coach info only; never the engine.
export function TeamEditor({ team, opp, init, defs, canEdit }: { team: string; opp: string; init: { tendencies: Record<string, boolean>; custom: Record<string, unknown> }; defs: FieldDef[]; canEdit: boolean }) {
  const [s, setS] = useState(init), [dirty, setDirty] = useState(false);
  const set = (p: Partial<typeof init>) => { setS((x) => ({ ...x, ...p })); setDirty(true); };
  const live = defs.filter((d) => d.scope === "team");
  return (
    <form action={saveTeamScouting} className="rp-card op-block">
      <input type="hidden" name="team" value={team} /><input type="hidden" name="opp" value={opp} /><input type="hidden" name="payload" value={JSON.stringify(s)} />
      <h2>Tendencies</h2>
      {TENDENCIES.map(([k, l]) => <label key={k} className="rp-check"><input type="checkbox" checked={!!s.tendencies[k]} disabled={!canEdit} onChange={(e) => set({ tendencies: { ...s.tendencies, [k]: e.target.checked } })} /> {l}</label>)}
      {live.map((d) => {
        const v = s.custom[d.id], ro = !canEdit || !!d.archived_at, put = (x: unknown) => set({ custom: { ...s.custom, [d.id]: x } });
        return <div key={d.id} className="op-custom">
          {d.kind === "checkbox" ? <label className="rp-check"><input type="checkbox" checked={v === true} disabled={ro} onChange={(e) => put(e.target.checked)} /> {d.label}</label>
            : d.kind === "dropdown" ? <label className="op-field"><span>{d.label}</span><select value={typeof v === "string" ? v : ""} disabled={ro} onChange={(e) => put(e.target.value)}><option value="">Not set</option>{d.options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
            : d.kind === "text" ? <label className="op-field"><span>{d.label}</span><input value={typeof v === "string" ? v : ""} disabled={ro} maxLength={1000} autoComplete="off" onChange={(e) => put(e.target.value)} /></label>
            : <div><span className="op-flabel">{d.label}</span><ZoneGrid value={(v as Record<string, Heat>) || {}} onChange={ro ? undefined : (z) => put(z)} bats="R" disabled={ro} label={d.label} /></div>}
        </div>;
      })}
      {canEdit ? <div><button type="submit" className="shell-btn small">{dirty ? "Save" : "Saved"}</button></div> : null}
      <p className="rp-note">For the staff; the engine doesn&rsquo;t read these.</p>
    </form>
  );
}
