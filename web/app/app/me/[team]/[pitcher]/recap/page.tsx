import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { playerTeam } from "@/lib/player";
import { getServerSupabase } from "@/lib/supabase/server";
import { buildRecap } from "@/lib/report_data.ts";
import { myReport, type SB } from "@/lib/report_fetch.ts";
import { RecapView } from "@/app/app/_reports/recap";
import { seasonOutcome } from "@/lib/outcome";
import { ReportSkeleton } from "@/app/app/_reports/skeleton";
import { ShareFor } from "./shared";

export const metadata: Metadata = { title: "Season recap · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; pitcher: string }>;

export default function Page({ params }: { params: Params }) {
  return <Suspense fallback={<ReportSkeleton />}><Body params={params} /></Suspense>;
}

// His season so far (live), his final recaps, and his public link. Read through pc_my_report: his own pitches only.
async function Body({ params }: { params: Params }) {
  const { team, pitcher } = await params;
  await playerTeam(team);
  const sb = (await getServerSupabase()) as unknown as SB;
  const first = await myReport(sb, team, pitcher, { from: "1900-01-01", to: "1900-01-01" });   // seasons and where the season so far starts
  if (!first) notFound();
  const d = await myReport(sb, team, pitcher, { from: first.season_start });
  if (!d) notFound();
  const r = buildRecap(d.events, d.games, { id: pitcher, name: d.pitcher.name, hand: d.pitcher.hand, pitches: d.pitcher.pitches }, { name: "Season so far", start: d.season_start, final: false }, "pitcher", d.games[0]?.level);
  const opp = new Map(d.games.map((g) => [g.id, g.opponent || null]));
  const outcome = seasonOutcome(d.events, d.games.map((g) => ({ id: g.id, date: g.date })), [], d.pitcher.pitches || [], "player");
  const ssb = await getServerSupabase();
  const { data: finals } = await ssb.from("recap_versions").select("season_id").eq("program_id", team).eq("pitcher_id", pitcher);
  const done = d.seasons.filter((s) => (finals || []).some((f: { season_id: string }) => f.season_id === s.id));
  return (
    <div className="pq-stack">
      <RecapView r={r} outcome={outcome} opponents={opp} outingHref={(g) => `/app/me/${team}/${pitcher}/outings/${g}`} title="Your season so far" own />
      <ShareFor team={team} pitcher={pitcher} season="" />
      <section className="rp-sec" aria-labelledby="h-finals">
        <header><h2 id="h-finals">Final recaps</h2></header>
        {done.length ? <ul className="pq-list">{done.map((s) => <li key={s.id}><Link href={`/app/me/${team}/${pitcher}/recap/${s.id}`}>{s.name}</Link></li>)}</ul>
          : <p className="rp-note">None yet. When your coach marks the season over, your final recap is built, frozen and emailed to you.</p>}
      </section>
    </div>
  );
}
