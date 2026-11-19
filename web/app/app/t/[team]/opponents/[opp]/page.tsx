import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { hittersOf, teamFor, teamsOf } from "@/lib/team";
import { getServerSupabase } from "@/lib/supabase/server";
import { addHitters } from "../../actions";
import { Notice, type Search } from "../../ui";

export const metadata: Metadata = { title: "Opponent · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; opp: string }>;

export default function Opponent({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}

async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team, opp } = await params, sp = await searchParams;
  const { manage, isCoach } = await teamFor(team);
  if (!isCoach) notFound();
  const [teams, hitters] = await Promise.all([teamsOf(team), hittersOf(team)]);
  const o = teams.find((x) => x.id === opp && !x.isOurs);
  if (!o) notFound();
  const mine = hitters.filter((x) => x.teamId === opp && !x.deletedAt).sort((a, b) => (+a.number || 999) - (+b.number || 999) || (a.name || "").localeCompare(b.name || ""));
  const edit = manage("manage_opponents") || manage("manage_roster");
  // at-bats seen per hitter, across seasons (each links to his page with every at-bat and its outing report)
  const sb = await getServerSupabase();
  const { data: ends } = await sb.from("events").select("doc->>hitterId").eq("program_id", team).is("deleted_at", null).eq("doc->>end", "true").in("doc->>hitterId", mine.map((x) => x.id).slice(0, 200)).limit(5000);
  const seen = new Map<string, number>();
  for (const r of (ends || []) as { hitterId: string }[]) seen.set(r.hitterId, (seen.get(r.hitterId) || 0) + 1);
  const BATS: Record<string, string> = { R: "Right", L: "Left", S: "Switch" };
  return (
    <>
      <Link className="pq-crumb" href={`/app/t/${team}/opponents`}>Opponents</Link>
      <h1 className="shell-h1">{o.name}{mine.length ? <span style={{ font: "500 1rem/1 var(--body)", letterSpacing: 0, color: "var(--text-3)", marginLeft: 14 }}>{mine.length} hitter{mine.length === 1 ? "" : "s"}</span> : null}</h1>
      <Notice sp={sp} />
      <div className="pq-cols"><div>
      {mine.length ? <div className="tbl-scroll" tabIndex={0}><table className="data-tbl" aria-label="Hitters">
        <thead><tr><th className="num">#</th><th>Hitter</th><th>Bats</th><th className="num">At-bats seen</th></tr></thead>
        <tbody>{mine.map((x) => <tr key={x.id}><td className="num mono">{x.number}</td><td><Link href={`/app/t/${team}/opponents/${opp}/hitters/${x.id}`}>{x.name}</Link></td><td>{BATS[x.bats] || x.bats}</td>
          <td className="num mono" data-k={`opp.${x.id}.abs`} data-v={seen.get(x.id) || 0}>{seen.get(x.id) || "–"}</td></tr>)}</tbody>
      </table></div> : <p className="pq-empty-box">No hitters yet.</p>}
      </div>
      {edit ? (
        <aside><form action={addHitters} className="shell-form" aria-label="Add hitters">
          <input type="hidden" name="team" value={team} /><input type="hidden" name="opp" value={opp} />
          <label>Their hitters, one per line: number, name, and R, L or S for how he bats (R if left out). A number already here updates that hitter.
            <textarea name="hitters" rows={9} required placeholder={"12 Smith R\n4 Jones L\n22 Diaz S"} /></label>
          <button type="submit" className="shell-btn primary">Save hitters</button>
        </form></aside>) : null}
      </div>
    </>
  );
}
