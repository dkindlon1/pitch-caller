import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { pitchersOf, teamFor, ROLE } from "@/lib/team";
import { gradeHistory } from "@/lib/player";
import { KINDS, PITCH_TYPES, SIGN, type Kind } from "@/lib/docs";
import { revertGrade, savePitcher } from "../../actions";
import { Notice, type Search } from "../../ui";

export const metadata: Metadata = { title: "Pitcher · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; pitcher: string }>;

export default function PitcherPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}

async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team, pitcher } = await params, sp = await searchParams;
  const { manage, can, isCoach } = await teamFor(team);
  if (!isCoach) notFound();
  const p = (await pitchersOf(team)).find((x) => x.id === pitcher && !x.deletedAt);
  if (!p) notFound();
  const roster = manage("manage_roster"), grades = can("edit_grades") || roster;
  const hist = await gradeHistory(team, p.id);
  const byPlayer = hist.filter((h) => h.by_role === "player" && !h.reverted_at);
  const FIELD = { grade: "stuff", command: "command" } as const;
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const ro = !roster;
  return (
    <>
      <p><Link href={`/app/t/${team}/roster`}>Roster</Link></p>
      <h1 className="shell-h1">{p.number ? `#${p.number} ` : ""}{p.name || "Unnamed"}</h1>
      <Notice sp={sp} />
      <form action={savePitcher} className="shell-form" aria-label="Pitcher">
        <input type="hidden" name="team" value={team} /><input type="hidden" name="pitcher" value={p.id} />
        <div className="row-fields">
          <label>Name<input name="name" defaultValue={p.name} disabled={ro} maxLength={80} /></label>
          <label className="w-num">Number<input name="number" defaultValue={p.number} disabled={ro} maxLength={4} /></label>
          <label className="w-sel">Throws<select name="hand" defaultValue={p.hand} disabled={ro}><option value="R">Right</option><option value="L">Left</option></select></label>
          <label className="w-sel">Role<select name="role" defaultValue={p.role === "RP" ? "RP" : "SP"} disabled={ro}><option value="SP">Starter</option><option value="RP">Reliever</option></select></label>
        </div>
        <fieldset>
          <legend>Arsenal (stuff and command, 1 to 5; 3 is average)</legend>
          <div className="tbl-scroll"><table className="data-tbl arsenal" aria-label="Arsenal">
            <thead><tr><th>Sign</th><th>Pitch</th><th>Type</th><th>Stuff</th><th>Command</th><th>In use</th></tr></thead>
            <tbody>{(p.pitches || []).map((d, i) => (
              <tr key={d.id}>
                <td><span className={`chip k-${d.kind}`}>{SIGN[d.kind as Kind]}</span></td>
                <td><input name={`name_${i}`} defaultValue={d.name} aria-label={`Pitch ${i + 1} name`} disabled={!grades} maxLength={40} /></td>
                <td><select name={`type_${i}`} defaultValue={d.type} aria-label={`Pitch ${i + 1} type`} disabled={!grades}>
                  {Object.keys(PITCH_TYPES).map((tp) => <option key={tp} value={tp}>{tp === KINDS[PITCH_TYPES[tp].kind] ? tp : `${tp} (${KINDS[PITCH_TYPES[tp].kind].toLowerCase()})`}</option>)}</select></td>
                <td><input name={`grade_${i}`} type="number" min={1} max={5} defaultValue={d.grade === "" ? "" : d.grade} placeholder="3" aria-label={`Pitch ${i + 1} stuff`} disabled={!grades} /></td>
                <td><input name={`command_${i}`} type="number" min={1} max={5} defaultValue={d.command === "" ? "" : d.command} placeholder="3" aria-label={`Pitch ${i + 1} command`} disabled={!grades} /></td>
                <td><input name={`active_${i}`} type="checkbox" defaultChecked={d.active !== false} aria-label={`Pitch ${i + 1} in use`} disabled={!grades} /></td>
              </tr>))}</tbody>
          </table></div>
          {grades ? <label className="w-wide">Add a pitch<select name="add_type" defaultValue=""><option value="">None</option>{Object.keys(PITCH_TYPES).map((tp) => <option key={tp} value={tp}>{tp}</option>)}</select></label> : null}
        </fieldset>
        {grades ? <button type="submit" className="shell-btn primary">Save</button> : <p className="shell-note">Your role on this team can see the arsenal but not change it.</p>}
      </form>

      <section aria-labelledby="hist-h">
        <h2 id="hist-h" className="shell-h2">Grade changes {byPlayer.length ? <span className="pill-warn">{byPlayer.length} changed by player</span> : null}</h2>
        {hist.length ? (
          <ul className="plain-list hist" aria-label="Grade changes">{hist.map((h) => (
            <li key={h.id}>
              <span className="mono">{day(h.changed_at)}</span> <span>{h.pitch_name || "A pitch"} {FIELD[h.field]} {h.old_value ?? "–"} → <b>{h.new_value ?? "–"}</b>
              {" · "}{h.by_role ? (ROLE[h.by_role] || h.by_role) : "someone"}</span>
              {h.by_role === "player" && !h.reverted_at ? <span className="pill-warn">Changed by player</span> : null}
              {h.reverted_at ? <span className="lbl"> put back</span> : null}
              {grades && h.by_role === "player" && !h.reverted_at ? (
                <form action={revertGrade} className="inline" aria-label={`Put back ${h.pitch_name || "pitch"} ${FIELD[h.field]}`}>
                  <input type="hidden" name="team" value={team} /><input type="hidden" name="pitcher" value={p.id} /><input type="hidden" name="hist" value={h.id} />
                  <button type="submit" className="shell-btn text">Put back to {h.old_value ?? "blank"}</button>
                </form>) : null}
            </li>))}</ul>
        ) : <p className="shell-note">No grade changes yet. When the player changes a grade in his portal, it shows here and you can put it back.</p>}
      </section>
    </>
  );
}
