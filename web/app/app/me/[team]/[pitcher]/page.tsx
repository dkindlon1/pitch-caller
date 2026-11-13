import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { daysOf, myOutings, myPitchers, playerTeam } from "@/lib/player";
import { dayName, teamToday } from "@/lib/team";
import PCRules from "@/lib/pitch_rules";
import { playerNav } from "@/lib/nav";
import { Tiles } from "../../../_frame/Tiles";
import { NumberBlock } from "../../../_frame/DateBlock";
import { Num } from "../../../_frame/Num";
import { LauncherSkeleton } from "../../../_frame/Skeleton";

export const metadata: Metadata = { title: "Me · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; pitcher: string }>;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "");

export default function PlayerHome({ params }: { params: Params }) {
  return <Suspense fallback={<LauncherSkeleton />}><Body params={params} /></Suspense>;
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
      <section className="pq-game pq-white" aria-labelledby="me-h">
        <NumberBlock number={me.number} sub={me.hand === "L" ? "Lefty" : "Righty"} />
        <div className="pq-game-body">
        <div className="pq-game-top">{t.team_name}</div>
        <h1 id="me-h" className="pq-h1" style={{ margin: 0 }}>{me.name || "Unnamed"}</h1>
        <dl className="pq-game-facts">
          <div><dt>Can pitch</dt><dd>{elig ? (elig.today ? "Today" : dayName(elig.date)) : "No pitch-count rule set"}</dd></div>
          <div><dt>Last outing</dt><dd>{last ? `${last.pitches} pitches, ${dayName(last.date)}` : "None in the last year"}</dd></div>
          <div><dt>Last 7 days</dt><dd><Num value={week} delay={250} /> pitches</dd></div>
          <div><dt>Strikes, last 12 months</dt><dd className="num">{season.n ? `${pct(season.s, season.n)} of ${season.n}` : "–"}</dd></div>
        </dl>
        {rule ? <p className="shell-note small">Rest days under {rule.name}.</p> : null}
        </div>
      </section>
      <Tiles items={playerNav(team, pitcher).filter((x) => x.key !== "home")} label="Your screens" />

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
        ) : <p className="shell-note">Your game pitches show up here once your coach’s iPad syncs a game you pitched in.</p>}
      </section>
          </>
  );
}
