import { buildRecap, type Recap } from "@/lib/report_data.ts";
import { readPublicRecap } from "@/lib/public_recap";
import { recapPdf } from "@/lib/report_pdf";
import { pdfResponse } from "@/app/app/_reports/load";

// A public recap as a PDF: exactly what the link's page shows (only the chosen sections; nothing once it's revoked or,
// under 18, until the parent approves).
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await readPublicRecap(token);
  if (!d || !d.pitcher) return new Response("Not found", { status: 404 });
  const name = d.pitcher.name || "Pitcher";
  const games = (d.games || []).map((g, i) => ({ ...g, date: g.date || `#${String(i + 1).padStart(3, "0")}` }));
  const r: Partial<Recap> & { meta: Recap["meta"] } = d.frozen
    ? { ...(d.frozen as Partial<Recap>), meta: { ...((d.frozen as Partial<Recap>).meta as Recap["meta"]), name } }
    : buildRecap(d.events || [], games, { id: "public", name, hand: d.pitcher.hand, pitches: d.pitcher.pitches }, { name: d.season.name, start: d.season.start, end: d.season.end ?? null, final: d.season.final }, "public", d.level);
  return pdfResponse(await recapPdf(r, d.sections, { title: name, team: d.team }), `${name} recap.pdf`);
}
