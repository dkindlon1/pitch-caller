import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { playerTeam } from "@/lib/player";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Recap } from "@/lib/report_data.ts";
import { myReport, type SB } from "@/lib/report_fetch.ts";
import { RecapView } from "@/app/app/_reports/recap";
import { seasonOutcome } from "@/lib/outcome";
import { ReportSkeleton } from "@/app/app/_reports/skeleton";
import { ShareFor } from "../shared";

export const metadata: Metadata = { title: "Final recap · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; pitcher: string; season: string }>;

export default function Page({ params }: { params: Params }) {
  return <Suspense fallback={<ReportSkeleton />}><Body params={params} /></Suspense>;
}

// His final recap for one season, as frozen (row level security: his own, or his child's for a parent account).
async function Body({ params }: { params: Params }) {
  const { team, pitcher, season } = await params;
  await playerTeam(team);
  if (!/^[0-9a-f-]{36}$/.test(season)) notFound();
  const sb = await getServerSupabase();
  const { data } = await sb.from("recap_versions").select("version, data").eq("program_id", team).eq("season_id", season).eq("pitcher_id", pitcher).order("version", { ascending: false }).limit(1);
  const v = (data || [])[0] as { version: number; data: Recap } | undefined;
  if (!v) notFound();
  const d = await myReport(sb as unknown as SB, team, pitcher, { from: v.data.meta.start, to: v.data.meta.end });
  const opp = new Map((d?.games || []).map((g) => [g.id, g.opponent || null]));
  const outcome = d ? seasonOutcome(d.events, d.games.map((g) => ({ id: g.id, date: g.date })), [], d.pitcher.pitches || []) : null;
  return (
    <div className="pq-stack">
      <RecapView r={v.data} outcome={outcome} opponents={opp} outingHref={(g) => `/app/me/${team}/${pitcher}/outings/${g}`} back={{ href: `/app/me/${team}/${pitcher}/recap`, label: "Your season so far" }}
        title={`Your ${v.data.meta.season}`} own actions={<a className="shell-btn small" href={`/app/me/${team}/${pitcher}/recap/${season}/pdf`} download>Download PDF</a>} />
      <ShareFor team={team} pitcher={pitcher} season={season} />
    </div>
  );
}
