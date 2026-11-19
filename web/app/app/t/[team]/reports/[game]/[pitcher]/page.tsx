import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { teamFor } from "@/lib/team";
import { OutingReport } from "@/app/app/_reports/outing";
import type { Note } from "@/app/app/_reports/notes";
import { ReportSkeleton } from "@/app/app/_reports/skeleton";
import { loadStaffOuting } from "@/app/app/_reports/load";

export const metadata: Metadata = { title: "Outing report · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; game: string; pitcher: string }>;

export default function Page({ params }: { params: Params }) {
  return <Suspense fallback={<ReportSkeleton />}><Body params={params} /></Suspense>;
}

// A coach's view of one pitcher's outing: everything, read as the signed-in coach (row level security: his team's).
async function Body({ params }: { params: Params }) {
  const { team, game, pitcher } = await params;
  const { team: t } = await teamFor(team);
  const d = await loadStaffOuting(team, game, pitcher);
  if (!d) notFound();
  const path = `/app/t/${team}/reports/${game}/${pitcher}`;
  return (
    <OutingReport r={d.report} c={{
      team, pitcherId: pitcher, pitcherName: d.pitcherName, hand: d.hand, opponent: d.opponent, level: d.level,
      hitterName: (a) => {
        const h = a.hitterId ? d.hitters.get(a.hitterId) : undefined;
        if (h) return <a href={`/app/t/${team}/opponents/${d.opponentId}/hitters/${a.hitterId}`}>{h.number ? `#${h.number} ` : ""}{h.name || "Hitter"}</a>;
        return a.slot !== null ? `Batting ${a.slot + 1}` : "Hitter";
      },
      notes: d.notes as Note[], canWrite: ["head", "pitching", "caller"].includes(t.role || "") && t.active, path,
      others: d.others.map((o) => ({ ...o, href: `/app/t/${team}/reports/${game}/${o.id}` })),
      summaryHref: `/app/t/${team}/reports/${game}`, pdfHref: `${path}/pdf`, outcome: d.outcome, back: { href: `/app/t/${team}/roster/${pitcher}/recap`, label: `${d.pitcherName}'s season` },
    }} />
  );
}
