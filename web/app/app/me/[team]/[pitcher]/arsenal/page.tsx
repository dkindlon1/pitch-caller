import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { gradeHistory, myPitchers, playerTeam } from "@/lib/player";
import { KINDS, PITCH_TYPES, signOf } from "@/lib/docs";
import { v11Pitch } from "@/lib/engine_server";
import { ROLE } from "@/lib/team";
import { saveArsenal } from "../../actions";
import { Notice, when, type Search } from "../ui";

export const metadata: Metadata = { title: "Arsenal · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; pitcher: string }>;
const FIELD = { grade: "stuff", command: "command" } as const;

export default function Arsenal({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}

async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team, pitcher } = await params, sp = await searchParams;
  const { user, team: t } = await playerTeam(team);
  const [ps, hist] = await Promise.all([myPitchers(team), gradeHistory(team, pitcher)]);
  const p = ps.find((x) => x.id === pitcher);
  if (!p) notFound();
  const off = !t.active;
  return (
    <>
      <h1 className="shell-h1">Arsenal</h1>
      <Notice sp={sp} />
      <p className="shell-note">Grade your pitches 1 to 5 (3 is average). Stuff is how good the pitch is when it&apos;s where you want it, compared with other pitches of the same type (a 3 sweeper is an average sweeper); command is how often it is. A change applies at once, and your coaches see it.</p>
      <form action={saveArsenal} className="shell-form" aria-label="Arsenal">
        <input type="hidden" name="team" value={team} /><input type="hidden" name="pitcher" value={pitcher} />
        <div className="tbl-scroll"><table className="data-tbl arsenal" aria-label="Your pitches">
          <thead><tr><th>Sign</th><th>Pitch</th><th>Type</th><th title="Compared with other pitches of the same type and shape: a 3 sweeper is an average sweeper">Stuff</th><th>Command</th><th>In use</th></tr></thead>
          <tbody>{(p.pitches || []).map((d, i) => (
            <tr key={d.id}>
              <td><span className={`chip k-${v11Pitch(d).kind}`}>{signOf(v11Pitch(d))}</span></td>
              <td><input name={`name_${i}`} defaultValue={d.name} aria-label={`Pitch ${i + 1} name`} maxLength={40} disabled={off} /></td>
              <td><select name={`type_${i}`} defaultValue={d.type} aria-label={`Pitch ${i + 1} type`} disabled={off}>
                {Object.keys(PITCH_TYPES).map((tp) => <option key={tp} value={tp}>{tp === KINDS[PITCH_TYPES[tp].kind] ? tp : `${tp} (${KINDS[PITCH_TYPES[tp].kind].toLowerCase()})`}</option>)}</select></td>
              <td><input name={`grade_${i}`} type="number" min={1} max={5} defaultValue={d.grade === "" ? "" : d.grade} placeholder="3" aria-label={`Pitch ${i + 1} stuff`} disabled={off} /></td>
              <td><input name={`command_${i}`} type="number" min={1} max={5} defaultValue={d.command === "" ? "" : d.command} placeholder="3" aria-label={`Pitch ${i + 1} command`} disabled={off} /></td>
              <td><input name={`active_${i}`} type="checkbox" defaultChecked={d.active !== false} aria-label={`Pitch ${i + 1} in use`} disabled={off} /></td>
            </tr>))}</tbody>
        </table></div>
        <label className="w-wide">Add a pitch<select name="add_type" defaultValue="" disabled={off}><option value="">None</option>{Object.keys(PITCH_TYPES).map((tp) => <option key={tp} value={tp}>{tp}</option>)}</select></label>
        {off ? null : <button type="submit" className="shell-btn primary">Save</button>}
      </form>

      <section aria-labelledby="hist-h">
        <h2 id="hist-h" className="shell-h2">Changes</h2>
        {hist.length ? (
          <ul className="plain-list hist" aria-label="Grade changes">{hist.map((h) => (
            <li key={h.id}>
              <span className="mono">{when(h.changed_at)}</span> <span>{h.pitch_name || "A pitch"} {FIELD[h.field]} {h.old_value ?? "–"} → <b>{h.new_value ?? "–"}</b>
              {" · "}{h.changed_by === user.id ? "you" : h.by_role ? (ROLE[h.by_role] || h.by_role).toLowerCase() : "a coach"}</span>
              {h.reverted_at ? <span className="pill-warn">Put back by a coach</span> : null}
            </li>))}</ul>
        ) : <p className="shell-note">No changes yet.</p>}
      </section>
    </>
  );
}
