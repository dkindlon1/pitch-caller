import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildRecap, type Recap } from "@/lib/report_data.ts";
import { readPublicRecap } from "@/lib/public_recap";
import { RecapView } from "@/app/app/_reports/recap";
import { Night } from "@/app/app/_frame/Night";
import { Ball } from "@/app/app/_frame/Icon";
import { portalFonts } from "@/app/portal-font";
import "../../portal.css";

// A pitcher's public recap (PLAN_reports_recap 4): no sign-in, an unguessable link he made and can turn off. Only the
// sections he chose: pc_public_recap returns nothing else (for a section he left off, the data never leaves the
// database), and nothing at all once the link is revoked or, for a player under 18, until his parent approves it.
// Never coach notes, style, overrides, hitters or opponents. Not indexed.
export const metadata: Metadata = { title: "Season recap · PitchIQ", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const viewport: Viewport = { themeColor: "#0c0b0e", colorScheme: "dark" };
// blocking on purpose: the link is read before anything is sent, so a dead link is a real 404
export const instant = false;
type Params = Promise<{ token: string }>;

export default async function PublicRecap({ params }: { params: Params }) {
  // read before anything streams, so a dead, revoked or unapproved link answers 404, not an empty 200
  const { token } = await params;
  const d = await readPublicRecap(token);
  if (!d || !d.pitcher) notFound();
  return (
    <div className={`pq ${portalFonts}`}>
      <Night />
      <main className="rp-public">
        <header className="rp-pubbar"><Link href="/" aria-label="PitchIQ home"><Ball size={22} />PitchIQ</Link><span>Public season recap</span></header>
        <Body token={token} d={d} />
        <p className="rp-note" style={{ marginTop: 40 }}>Built by <Link href="/">PitchIQ</Link> from every pitch charted in his games. Level averages are public level data.</p>
      </main>
    </div>
  );
}

function Body({ token, d }: { token: string; d: NonNullable<Awaited<ReturnType<typeof readPublicRecap>>> }) {
  const name = d.pitcher.name || "Pitcher";
  // with no dates (the outing list and pitch by pitch off) the outings are numbered in order
  const games = (d.games || []).map((g, i) => ({ ...g, date: g.date || `#${String(i + 1).padStart(3, "0")}` }));
  const r: Partial<Recap> & { meta: Recap["meta"] } = d.frozen
    ? { ...(d.frozen as Partial<Recap>), meta: { ...((d.frozen as Partial<Recap>).meta as Recap["meta"]), name } }
    : buildRecap(d.events || [], games, { id: "public", name, hand: d.pitcher.hand, pitches: d.pitcher.pitches },
        { name: d.season.name, start: d.season.start, end: d.season.end ?? null, final: d.season.final }, "public", d.level);
  return (
    <RecapView r={r} sections={d.sections} title={name}
      sub={<><span className="sep" aria-hidden="true">·</span><span>{d.team}</span></>}
      actions={<a className="shell-btn small" href={`/r/${token}/pdf`} download>Download PDF</a>} />
  );
}
