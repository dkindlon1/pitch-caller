import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { hittersOf, teamFor, teamsOf } from "@/lib/team";
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
  const BATS: Record<string, string> = { R: "Right", L: "Left", S: "Switch" };
  return (
    <>
      <p><Link href={`/app/t/${team}/opponents`}>Opponents</Link></p>
      <h1 className="shell-h1">{o.name}</h1>
      <Notice sp={sp} />
      {mine.length ? <div className="tbl-scroll"><table className="data-tbl" aria-label="Hitters">
        <thead><tr><th className="num">#</th><th>Hitter</th><th>Bats</th></tr></thead>
        <tbody>{mine.map((x) => <tr key={x.id}><td className="num mono">{x.number}</td><td>{x.name}</td><td>{BATS[x.bats] || x.bats}</td></tr>)}</tbody>
      </table></div> : <p className="shell-note">No hitters yet.</p>}
      {edit ? (
        <form action={addHitters} className="shell-form" aria-label="Add hitters">
          <input type="hidden" name="team" value={team} /><input type="hidden" name="opp" value={opp} />
          <label>Their hitters, one per line: number, name, and R, L or S for how he bats (R if left out). A number already here updates that hitter.
            <textarea name="hitters" rows={9} required placeholder={"12 Smith R\n4 Jones L\n22 Diaz S"} /></label>
          <button type="submit" className="shell-btn primary">Save hitters</button>
        </form>) : null}
    </>
  );
}
