import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { availability, dayName, gamesOf, ourTeamOf, pitchersOf, teamFor, teamRule, teamToday, teamsOf, ROLE } from "@/lib/team";
import { type Search } from "./ui";

export const metadata: Metadata = { title: "Team · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string }>;

export default function Home({ params }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading the team…</p>}><HomeBody params={params} /></Suspense>;
}

async function HomeBody({ params }: { params: Params }) {
  const { team } = await params;
  const { team: t, isCoach } = await teamFor(team);
  if (!isCoach) return <p className="shell-note">You&apos;re on {t.team_name} as {t.role ? ROLE[t.role].toLowerCase() : "its owner, not on the staff"}. The player portal comes next.</p>;
  const [pitchers, teams, games, ours] = await Promise.all([pitchersOf(team), teamsOf(team), gamesOf(team), ourTeamOf(team)]);
  const rule = teamRule(ours), today = teamToday(t.timezone);
  const avail = (await availability(t, pitchers.filter((p) => !p.deletedAt), rule)).sort((a, b) => (a.pitcher.name || "").localeCompare(b.pitcher.name || ""));
  const live = games.filter((g) => !g.dupOf);
  const next = live.filter((g) => (g.status === "planned" || g.status === "live") && (g.date || "") >= today).sort((a, b) => ((a.date || "") < (b.date || "") ? -1 : 1))[0];
  const recent = live.filter((g) => g.status === "final").sort((a, b) => ((a.date || "") < (b.date || "") ? 1 : -1)).slice(0, 5);
  const opp = (id?: string) => (teams.find((x) => x.id === id) || { name: "" }).name;
  const ready = avail.filter((a) => !a.eligible || a.eligible.today).length;
  return (
    <>
      <h1 className="shell-h1">{t.team_name}</h1>
      <div className="dash">
        <section className="dash-card next" aria-labelledby="next-h">
          <h2 id="next-h" className="lbl">Next game</h2>
          {next ? <p className="next-game"><b>{dayName(next.date || "")}</b>{opp(next.opponentId) ? ` vs ${opp(next.opponentId)}` : ""}{next.status === "live" ? " · in progress" : ""}</p>
            : <p className="shell-note">No game set up yet. Pick the opponent and today&apos;s staff in the game app, then get it ready for offline on Wi-Fi.</p>}
          <a className="shell-btn primary" href="/app/game/">Prep game</a>
          <p className="shell-note small">Opens the game app: Setup, Game day, Get ready for offline.</p>
        </section>
        <section className="dash-card" aria-labelledby="avail-sum">
          <h2 id="avail-sum" className="lbl">Available today</h2>
          <p className="big-num mono">{rule ? ready : pitchers.length}<small> of {pitchers.length}</small></p>
          <p className="shell-note small">{rule ? `Under ${rule.name}${rule.edited ? " (your numbers)" : ""}.` : <>No pitch-count rule set. <Link href={`/app/t/${team}/settings`}>Pick one</Link> to see rest days and eligible dates.</>}</p>
        </section>
      </div>

      <section aria-labelledby="avail-h">
        <h2 id="avail-h" className="shell-h2">Pitchers</h2>
        {avail.length ? (
          <div className="tbl-scroll"><table className="data-tbl" aria-label="Pitcher availability">
            <thead><tr><th>Pitcher</th><th>Last outing</th><th className="num">Last 7 days</th><th>Eligible</th></tr></thead>
            <tbody>{avail.map((a) => (
              <tr key={a.pitcher.id}>
                <td><Link href={`/app/t/${team}/roster/${a.pitcher.id}`}>{a.pitcher.number ? `#${a.pitcher.number} ` : ""}{a.pitcher.name || "Unnamed"}</Link></td>
                <td>{a.last ? `${dayName(a.last.date)}, ${a.last.pitches} pitches` : "None in 30 days"}</td>
                <td className="num mono">{a.week}</td>
                <td>{!a.eligible ? "" : a.eligible.today ? <span className="pill-ok">Today</span> : <span className="pill-warn" title={a.eligible.why}>{dayName(a.eligible.date)}</span>}</td>
              </tr>))}</tbody>
          </table></div>
        ) : <p className="shell-note">No pitchers yet. <Link href={`/app/t/${team}/roster`}>Add the roster</Link>: paste the names, one per line.</p>}
      </section>

      <section aria-labelledby="recent-h">
        <h2 id="recent-h" className="shell-h2">Recent games</h2>
        {recent.length ? <ul className="plain-list">{recent.map((g) => <li key={g.id}>{dayName(g.date || "")}{opp(g.opponentId) ? ` vs ${opp(g.opponentId)}` : ""}</li>)}</ul>
          : <p className="shell-note">Games charted on the iPad show up here once it syncs.</p>}
      </section>
    </>
  );
}
