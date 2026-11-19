import { recapPdf } from "@/lib/report_pdf";
import { loadFinal, pdfResponse } from "@/app/app/_reports/load";
import { ALL_SECTIONS } from "@/app/app/_reports/recap";

// A frozen final recap as a PDF, for the team's coaches (row level security decides).
export async function GET(_: Request, { params }: { params: Promise<{ team: string; pitcher: string; season: string }> }) {
  const { team, pitcher, season } = await params;
  const v = await loadFinal(team, season, pitcher);
  if (!v) return new Response("Not found", { status: 404 });
  return pdfResponse(await recapPdf(v.data, ALL_SECTIONS, { title: v.data.meta.name }), `${v.data.meta.name} ${v.data.meta.season} recap.pdf`);
}
