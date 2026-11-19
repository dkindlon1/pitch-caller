import { outingPdf } from "@/lib/report_pdf";
import { loadStaffOuting, pdfResponse } from "@/app/app/_reports/load";

// The outing report as a clean light PDF (staff view: overrides and every note included). Coaches on the team only.
export async function GET(_: Request, { params }: { params: Promise<{ team: string; game: string; pitcher: string }> }) {
  const { team, game, pitcher } = await params;
  const d = await loadStaffOuting(team, game, pitcher);
  if (!d) return new Response("Not found", { status: 404 });
  const bytes = await outingPdf(d.report, { pitcher: d.pitcherName, opponent: d.opponent, level: d.level, notes: d.notes.map((n) => ({ ...n, body: n.shared ? n.body : `(staff only) ${n.body}` })),
    hitterName: (a) => { const h = a.hitterId ? d.hitters.get(a.hitterId) : undefined; return h ? `${h.number ? "#" + h.number + " " : ""}${h.name || "Hitter"}` : a.slot !== null ? `Batting ${a.slot + 1}` : "Hitter"; } });
  return pdfResponse(bytes, `${d.pitcherName} ${d.report.game.date} outing.pdf`);
}
