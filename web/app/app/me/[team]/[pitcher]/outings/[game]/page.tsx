import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { playerTeam } from "@/lib/player";
import { OutingReport } from "@/app/app/_reports/outing";
import type { Note } from "@/app/app/_reports/notes";
import { ReportSkeleton } from "@/app/app/_reports/skeleton";
import { loadMyOuting } from "@/app/app/_reports/load";

export const metadata: Metadata = { title: "Outing report · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; game: string; pitcher: string }>;

export default function Page({ params }: { params: Params }) {
  return <Suspense fallback={<ReportSkeleton />}><Body params={params} /></Suspense>;
}

// The pitcher's own outing report: read through pc_my_report, which returns only his pitches, with who chose each call,
// the engine's mix, hitters' identities and the catcher left out, and only the notes a coach shared with him. A player
// asking for someone else's pitcher id gets nothing (the database checks his links).
async function Body({ params }: { params: Params }) {
  const { team, game, pitcher } = await params;
  await playerTeam(team);
  const d = await loadMyOuting(team, game, pitcher);
  if (!d) notFound();
  return (
    <OutingReport r={d.report} c={{
      team, pitcherId: pitcher, pitcherName: d.pitcherName, hand: d.hand, opponent: d.opponent, level: d.level,
      hitterName: (a) => (a.slot !== null ? `Batting ${a.slot + 1}` : "Hitter"),
      notes: d.notes.map((n) => ({ ...n, shared: true })) as Note[], canWrite: false, path: `/app/me/${team}/${pitcher}/outings/${game}`,
      pdfHref: `/app/me/${team}/${pitcher}/outings/${game}/pdf`, back: { href: `/app/me/${team}/${pitcher}/recap`, label: "Your season" },
    }} />
  );
}
