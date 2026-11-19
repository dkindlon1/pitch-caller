import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { teamFor } from "@/lib/team";
import { getServerSupabase } from "@/lib/supabase/server";
import { buildGameSummary } from "@/lib/report_data.ts";
import { gameEvents, gameMeta, teamGames, teamNames, teamPitchers, type SB } from "@/lib/report_fetch.ts";
import { LineStrip, OverridesBlock, Section, dayText } from "@/app/app/_reports/ui";
import { ReportSkeleton } from "@/app/app/_reports/skeleton";

export const metadata: Metadata = { title: "Game summary · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; game: string }>;
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "–");

export default function Page({ params }: { params: Params }) {
  return <Suspense fallback={<ReportSkeleton />}><Body params={params} /></Suspense>;
}

// The game summary for coaches (PLAN_reports_recap 3): the staff line, each pitcher's line and pitch count, the game's
// overrides, and a link to each outing report.
async function Body({ params }: { params: Params }) {
  const { team, game } = await params;
  const { team: t } = await teamFor(team);
  const sb = await getServerSupabase(), db = sb as unknown as SB;
  const [games, pitchers, names] = await Promise.all([teamGames(db, team), teamPitchers(db, team), teamNames(db, team)]);
  const g = games.find((x) => x.id === game);
  if (!g) notFound();
  const meta = gameMeta(g, names, t.level);
  const evs = await gameEvents(db, team, [game]);
  const s = buildGameSummary(evs, meta, pitchers.map((p) => ({ id: p.id, name: p.name, hand: p.hand, pitches: p.pitches })));
  return (
    <article className="rp">
      <header className="rp-head">
        <Link className="pq-crumb" href={`/app/t/${team}/games`}><span aria-hidden="true">←</span> Games</Link>
        <h1>Game summary</h1>
        <p className="rp-sub"><time dateTime={meta.date}>{dayText(meta.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</time>
          {meta.opponent ? <><span className="sep" aria-hidden="true">·</span><span>vs {meta.opponent}</span></> : null}
          <span className="sep" aria-hidden="true">·</span><span>{s.pitchers.length} pitcher{s.pitchers.length === 1 ? "" : "s"}</span></p>
      </header>
      {!s.pitchers.length ? <p className="rp-empty">No pitches from this game have reached the site yet. They arrive when the iPad syncs after End game.</p> : (<>
        <Section id="staff" title="Staff line"><LineStrip l={s.staff} k="staff" /></Section>
        <Section id="pitchers" title="Each pitcher">
          <div className="tbl-scroll" tabIndex={0} role="region" aria-label="Each pitcher"><table className="data-tbl">
            <thead><tr><th scope="col">Pitcher</th><th scope="col" className="num">IP</th><th scope="col" className="num">Pitches</th><th scope="col" className="num">Strike</th><th scope="col" className="num">K</th>
              <th scope="col" className="num">BB</th><th scope="col" className="num">H</th><th scope="col" className="num">Hard</th><th scope="col" className="num">Coach calls</th><th scope="col" className="num">Shake-offs</th><th scope="col" className="num">Cross-ups</th><th scope="col"><span className="sr">Report</span></th></tr></thead>
            <tbody>{s.pitchers.map((p) => (
              <tr key={p.pitcherId}>
                <th scope="row">{p.name}<span className="rp-note" style={{ display: "block" }}>pitches {p.first}–{p.last}</span></th>
                <td className="num" data-k={`p.${p.pitcherId}.ip`} data-v={p.line.ip}>{p.line.ip}</td>
                <td className="num" data-k={`p.${p.pitcherId}.pitches`} data-v={p.line.pitches}>{p.line.pitches}</td>
                <td className="num" data-k={`p.${p.pitcherId}.strikes`} data-v={p.line.strikes}>{pct(p.line.strikes, p.line.pitches)}<small>{p.line.strikes}</small></td>
                <td className="num" data-k={`p.${p.pitcherId}.k`} data-v={p.line.k}>{p.line.k}</td>
                <td className="num" data-k={`p.${p.pitcherId}.bb`} data-v={p.line.bb}>{p.line.bb}</td>
                <td className="num" data-k={`p.${p.pitcherId}.h`} data-v={p.line.h}>{p.line.h}</td>
                <td className="num" data-k={`p.${p.pitcherId}.hard`} data-v={p.line.hard}>{p.line.hard}</td>
                <td className="num" data-k={`p.${p.pitcherId}.coach`} data-v={p.overrides.coach}>{p.overrides.coach}</td>
                <td className="num" data-k={`p.${p.pitcherId}.shake`} data-v={p.overrides.shake}>{p.overrides.shake}</td>
                <td className="num" data-k={`p.${p.pitcherId}.cross`} data-v={p.overrides.cross}>{p.overrides.cross}</td>
                <td><Link href={`/app/t/${team}/reports/${game}/${p.pitcherId}`}>Outing report</Link></td>
              </tr>))}</tbody>
          </table></div>
        </Section>
        <Section id="ov" title="The game's overrides" aside={<span className="rp-note">Staff only</span>}><OverridesBlock ovs={s.overrides} who /></Section>
      </>)}
    </article>
  );
}
