import { outingPdf } from "@/lib/report_pdf";
import { loadMyOuting, pdfResponse } from "@/app/app/_reports/load";

// The pitcher's own outing report as a PDF: the same data as his page (no overrides, no staff notes, no hitters' names).
export async function GET(_: Request, { params }: { params: Promise<{ team: string; game: string; pitcher: string }> }) {
  const { team, game, pitcher } = await params;
  const d = await loadMyOuting(team, game, pitcher);
  if (!d) return new Response("Not found", { status: 404 });
  const bytes = await outingPdf(d.report, { pitcher: d.pitcherName, opponent: d.opponent, level: d.level, notes: d.notes, hitterName: (a) => (a.slot !== null ? `Batting ${a.slot + 1}` : "Hitter") });
  return pdfResponse(bytes, `${d.pitcherName} ${d.report.game.date} outing.pdf`);
}
