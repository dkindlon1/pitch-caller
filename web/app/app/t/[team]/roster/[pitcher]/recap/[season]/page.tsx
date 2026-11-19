import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { teamFor } from "@/lib/team";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Recap } from "@/lib/report_data.ts";
import { gameEvents, teamGames, teamNames, teamPitchers, type SB } from "@/lib/report_fetch.ts";
import { seasonOutcome } from "@/lib/outcome";
import { RecapView } from "@/app/app/_reports/recap";
import { ReportSkeleton } from "@/app/app/_reports/skeleton";

export const metadata: Metadata = { title: "Final recap · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; pitcher: string; season: string }>;

export default function Page({ params }: { params: Params }) {
  return <Suspense fallback={<ReportSkeleton />}><Body params={params} /></Suspense>;
}

// A final recap: the version frozen when the season was marked over (the newest, if it was rebuilt), as stored.
async function Body({ params }: { params: Params }) {
  const { team, pitcher, season } = await params;
  await teamFor(team);
  if (!/^[0-9a-f-]{36}$/.test(season)) notFound();
  const sb = await getServerSupabase(), db = sb as unknown as SB;
  const { data } = await sb.from("recap_versions").select("version, data, created_at").eq("program_id", team).eq("season_id", season).eq("pitcher_id", pitcher).order("version", { ascending: false }).limit(1);
  const v = (data || [])[0] as { version: number; data: Recap; created_at: string } | undefined;
  if (!v) notFound();
  const [games, names, pitchers] = await Promise.all([teamGames(db, team), teamNames(db, team), teamPitchers(db, team)]);
  const opp = new Map(games.map((g) => [g.id, g.opponent_id ? names.get(g.opponent_id) || null : null]));
  const p = pitchers.find((x) => x.id === pitcher);
  // outcome tracking: computed from that season's events now (it isn't part of the frozen version)
  const inSeason = games.filter((g) => String(g.date) >= String(v.data.meta.start) && String(g.date) <= String(v.data.meta.end));
  const outcome = seasonOutcome(await gameEvents(db, team, inSeason.map((g) => g.id), pitcher), inSeason.map((g) => ({ id: g.id, date: String(g.date) })), [], p?.pitches || []);
  return (
    <RecapView r={v.data} outcome={outcome} opponents={opp} outingHref={(g) => `/app/t/${team}/reports/${g}/${pitcher}`} back={{ href: `/app/t/${team}/roster/${pitcher}/recap`, label: `${p?.name || v.data.meta.name}'s season so far` }}
      sub={<><span className="sep" aria-hidden="true">·</span><span>Version {v.version}, {new Date(v.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></>}
      actions={<a className="shell-btn small" href={`/app/t/${team}/roster/${pitcher}/recap/${season}/pdf`} download>Download PDF</a>} />
  );
}
