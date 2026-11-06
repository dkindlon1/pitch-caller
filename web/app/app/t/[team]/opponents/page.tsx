import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { hittersOf, teamFor, teamsOf } from "@/lib/team";
import { addOpponent } from "../actions";
import { Notice, type Search } from "../ui";

export const metadata: Metadata = { title: "Opponents · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string }>;

export default function Opponents({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}

async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team } = await params, sp = await searchParams;
  const { manage, isCoach } = await teamFor(team);
  if (!isCoach) return <p className="shell-note">Opponents are for the team&apos;s coaches.</p>;
  const [teams, hitters] = await Promise.all([teamsOf(team), hittersOf(team)]);
  const opps = teams.filter((x) => !x.isOurs && !x.deletedAt).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const edit = manage("manage_opponents") || manage("manage_roster");
  return (
    <>
      <h1 className="shell-h1">Opponents</h1>
      <Notice sp={sp} />
      <p className="shell-note">Only your team&apos;s coaches see these. What the engine learns about each hitter stays with your team.</p>
      {opps.length ? <ul className="team-cards" aria-label="Opponents">{opps.map((o) => (
        <li key={o.id} className="team-card"><h2><Link href={`/app/t/${team}/opponents/${o.id}`}>{o.name}</Link></h2>
          <p>{hitters.filter((x) => x.teamId === o.id && !x.deletedAt).length} hitters</p></li>))}</ul>
        : <p className="shell-note">No opponents yet.</p>}
      {edit ? (
        <form action={addOpponent} className="shell-form" aria-label="Add an opponent">
          <input type="hidden" name="team" value={team} />
          <label>Opponent<input name="name" required maxLength={80} placeholder="Ithaca College" /></label>
          <button type="submit" className="shell-btn primary">Add</button>
        </form>) : null}
    </>
  );
}
