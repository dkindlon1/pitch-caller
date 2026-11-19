import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { teamFor } from "@/lib/team";
import { getServerSupabase } from "@/lib/supabase/server";
import { buildRecap } from "@/lib/report_data.ts";
import { gameEvents, gameMeta, seasonSoFarStart, teamGames, teamNames, teamPitchers, teamSeasons, type SB } from "@/lib/report_fetch.ts";
import { RecapView } from "@/app/app/_reports/recap";
import { ReportSkeleton } from "@/app/app/_reports/skeleton";
import { dayText } from "@/app/app/_reports/ui";

export const metadata: Metadata = { title: "Season so far · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; pitcher: string }>;

export default function Page({ params }: { params: Params }) {
  return <Suspense fallback={<ReportSkeleton />}><Body params={params} /></Suspense>;
}

// A pitcher's season so far, live (every game after the last season marked over), with his finished seasons' final
// recaps listed underneath. Built from the raw events each time it opens.
async function Body({ params }: { params: Params }) {
  const { team, pitcher } = await params;
  const { team: t } = await teamFor(team);
  const sb = await getServerSupabase(), db = sb as unknown as SB;
  const [games, pitchers, names, seasons] = await Promise.all([teamGames(db, team), teamPitchers(db, team), teamNames(db, team), teamSeasons(db, team)]);
  const p = pitchers.find((x) => x.id === pitcher);
  if (!p) notFound();
  const start = seasonSoFarStart(seasons);
  const inSeason = games.filter((g) => !start || (g.date as string) >= start);
  const evs = await gameEvents(db, team, inSeason.map((g) => g.id), pitcher);
  const metas = inSeason.map((g) => gameMeta(g, names, t.level));
  const r = buildRecap(evs, metas, { id: pitcher, name: p.name, hand: p.hand, pitches: p.pitches }, { name: "Season so far", start, final: false }, "staff", t.level);
  const opp = new Map(metas.map((g) => [g.id, g.opponent || null]));
  const { data: finals } = await sb.from("recap_versions").select("season_id, version").eq("program_id", team).eq("pitcher_id", pitcher);
  const done = seasons.filter((s) => (finals || []).some((f: { season_id: string }) => f.season_id === s.id));
  return (
    <>
      <RecapView r={r} opponents={opp} outingHref={(g) => `/app/t/${team}/reports/${g}/${pitcher}`} back={{ href: `/app/t/${team}/roster/${pitcher}`, label: p.name }} />
      <section className="rp-sec" style={{ marginTop: 28 }} aria-labelledby="h-finals">
        <header><h2 id="h-finals">Final recaps</h2></header>
        {done.length ? <ul className="pq-list">{done.map((s) => <li key={s.id}><Link href={`/app/t/${team}/roster/${pitcher}/recap/${s.id}`}>{s.name}</Link> <span className="rp-note">({dayText(s.start_date, { month: "short", day: "numeric" })} – {dayText(s.end_date, { month: "short", day: "numeric", year: "numeric" })})</span></li>)}</ul>
          : <p className="rp-note">None yet. A head coach marks the season over in Settings; each pitcher&rsquo;s final recap is built then, frozen and emailed.</p>}
      </section>
    </>
  );
}
