import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { teamFor } from "@/lib/team";
import { getServerSupabase } from "@/lib/supabase/server";
import { buildOuting } from "@/lib/report_data.ts";
import { gameEvents, gameMeta, teamGames, teamNames, teamPitchers } from "@/lib/report_fetch.ts";
import { OutingReport } from "@/app/app/_reports/outing";
import type { Note } from "@/app/app/_reports/notes";
import { ReportSkeleton } from "@/app/app/_reports/skeleton";

export const metadata: Metadata = { title: "Outing report · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; game: string; pitcher: string }>;

export default function Page({ params }: { params: Params }) {
  return <Suspense fallback={<ReportSkeleton />}><Body params={params} /></Suspense>;
}

// A coach's view of one pitcher's outing: everything, read as the signed-in coach (row level security: his team's).
async function Body({ params }: { params: Params }) {
  const { team, game, pitcher } = await params;
  const { team: t } = await teamFor(team);
  const sb = await getServerSupabase();
  const [games, pitchers, names] = await Promise.all([teamGames(sb, team), teamPitchers(sb, team), teamNames(sb, team)]);
  const g = games.find((x) => x.id === game);
  if (!g) notFound();
  const evs = await gameEvents(sb, team, [game]);
  const mine = evs.filter((e) => e.pitcherId === pitcher);
  if (!mine.some((e) => e.type === undefined || e.type === "pitch")) notFound();
  const p = pitchers.find((x) => x.id === pitcher);
  const meta = gameMeta(g, names, t.level);
  const report = buildOuting(mine, meta, pitcher, p?.pitches || [], "staff", p?.hand);
  const [{ data: notes }, { data: hitters }] = await Promise.all([
    sb.from("report_notes").select("id, scope, at_bat, body, shared, created_at").eq("program_id", team).eq("game_id", game).eq("pitcher_id", pitcher).is("deleted_at", null).order("created_at"),
    sb.from("hitters").select("id, doc").eq("program_id", team).eq("doc->>teamId", g.opponent_id || "-").limit(200),
  ]);
  const hn = new Map(((hitters || []) as { id: string; doc: { name?: string; number?: string } }[]).map((h) => [h.id, h.doc]));
  const others = [...new Set(evs.map((e) => e.pitcherId).filter((x): x is string => !!x && x !== pitcher))]
    .map((id) => ({ id, name: pitchers.find((x) => x.id === id)?.name || "Pitcher", href: `/app/t/${team}/reports/${game}/${id}` }));
  const path = `/app/t/${team}/reports/${game}/${pitcher}`;
  return (
    <OutingReport r={report} c={{
      team, pitcherId: pitcher, pitcherName: p?.name || "Unknown pitcher", hand: p?.hand, opponent: meta.opponent || null, level: t.level,
      hitterName: (a) => {
        const h = a.hitterId ? hn.get(a.hitterId) : undefined;
        if (h) return <a href={`/app/t/${team}/opponents/${g.opponent_id}/hitters/${a.hitterId}`}>{h.number ? `#${h.number} ` : ""}{h.name || "Hitter"}</a>;
        return a.slot !== null ? `Batting ${a.slot + 1}` : "Hitter";
      },
      notes: (notes || []) as Note[], canWrite: ["head", "pitching", "caller"].includes(t.role || "") && t.active, path, others,
      summaryHref: `/app/t/${team}/reports/${game}`, pdfHref: `${path}/pdf`, back: { href: `/app/t/${team}/roster/${pitcher}/recap`, label: `${p?.name || "Pitcher"}'s season` },
    }} />
  );
}
