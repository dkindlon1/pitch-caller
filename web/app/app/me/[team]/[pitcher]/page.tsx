import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { daysOf, myOutings, myPitchers, playerTeam } from "@/lib/player";
import { dayName, teamToday } from "@/lib/team";
import PCRules from "@/lib/pitch_rules";

export const metadata: Metadata = { title: "Me · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; pitcher: string }>;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "");

export default function PlayerHome({ params }: { params: Params }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} /></Suspense>;
}

async function Body({ params }: { params: Params }) {
  const { team, pitcher } = await params;
  const { team: t } = await playerTeam(team);
  const [ps, { rule, outings }] = await Promise.all([myPitchers(team), myOutings(team)]);
  const me = ps.find((p) => p.id === pitcher);
  if (!me) notFound();
  const mine = outings.filter((o) => o.pitcher_id === pitcher);
  const days = daysOf(outings, pitcher), today = teamToday(t.timezone), weekAgo = PCRules.addDays(today, -6);
  const week = days.filter((d) => d.date >= weekAgo).reduce((a, d) => a + d.pitches, 0);
  const elig = rule ? PCRules.eligibleOn(rule, days, today) : null;
  const last = mine[0];
  const season = mine.reduce((a, o) => ({ n: a.n + o.pitches, s: a.s + o.strikes }), { n: 0, s: 0 });
  return (
    <>
      <h1 className="shell-h1">{me.number ? `#${me.number} ` : ""}{me.name || "Unnamed"}</h1>
      <div className="dash">
        <section className="dash-card" aria-labelledby="elig-h">
          <h2 id="elig-h" className="lbl">Can pitch</h2>
          {elig ? <p className="big-num">{elig.today ? "Today" : dayName(elig.date)}</p> : <p className="shell-note">Your team hasn&apos;t set a pitch-count rule.</p>}
          {rule ? <p className="shell-note small">Under {rule.name}.</p> : null}
        </section>
        <section className="dash-card" aria-labelledby="last-h">
          <h2 id="last-h" className="lbl">Last outing</h2>
          {last ? <p className="big-num mono">{last.pitches}<small> pitches, {dayName(last.date)}</small></p> : <p className="shell-note">None in the last year.</p>}
          <p className="shell-note small">{week} in the last 7 days.</p>
        </section>
        <section className="dash-card" aria-labelledby="season-h">
          <h2 id="season-h" className="lbl">Strikes, last 12 months</h2>
          <p className="big-num mono">{season.n ? pct(season.s, season.n) : "–"}<small> of {season.n} pitches</small></p>
        </section>
      </div>

      <section aria-labelledby="out-h">
        <h2 id="out-h" className="shell-h2">Outings</h2>
        {mine.length ? (
          <div className="tbl-scroll"><table className="data-tbl" aria-label="Outings">
            <thead><tr><th>Date</th><th className="num">Pitches</th><th className="num">Strikes</th><th>By pitch</th></tr></thead>
            <tbody>{mine.map((o) => (
              <tr key={o.game_id}>
                <td>{dayName(o.date)}</td>
                <td className="num mono">{o.pitches}</td>
                <td className="num mono">{pct(o.strikes, o.pitches)}</td>
                <td>{Object.entries(o.by_pitch).sort((a, b) => b[1].n - a[1].n).map(([name, x]) => `${name} ${x.n}`).join(" · ")}</td>
              </tr>))}</tbody>
          </table></div>
        ) : <p className="shell-note">Your game pitches show up here once your coach&apos;s iPad syncs a game you pitched in.</p>}
      </section>
      <p className="shell-note small">Your grades and arsenal: <Link href={`/app/me/${team}/${pitcher}/arsenal`}>Arsenal</Link>. Your TrackMan and Rapsodo sessions: <Link href={`/app/me/${team}/${pitcher}/uploads`}>Uploads</Link>. Counts, rates and charts: <Link href={`/app/me/${team}/${pitcher}/stats`}>Stats</Link>.</p>
    </>
  );
}
