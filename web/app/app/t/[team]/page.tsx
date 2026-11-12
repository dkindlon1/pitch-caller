import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { availability, dayName, gameList, nextGame, ourTeamOf, pitchersOf, teamFor, teamRule, teamToday, teamsOf, timeName, type GameListRow } from "@/lib/team";
import { abilities, coachNav } from "@/lib/nav";
import { waitingOn } from "@/lib/upload_data";
import { Tiles } from "../../_frame/Tiles";
import { SeamEdge } from "../../_frame/Icon";
import { Num } from "../../_frame/Num";
import { LauncherSkeleton } from "../../_frame/Skeleton";
import { type Search } from "./ui";

export const metadata: Metadata = { title: "Team · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string }>;

// The launcher: the next game on top (the one question a coach opens this with), then a tile for every screen this
// account may open on this team, and on the side what needs him and who can pitch today.
export default function Home({ params }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<LauncherSkeleton />}><HomeBody params={params} /></Suspense>;
}

async function HomeBody({ params }: { params: Params }) {
  const { team } = await params;
  const { team: t, isCoach } = await teamFor(team);
  const a = abilities(t);
  const reviewsOn = a.can("review_uploads");
  const wait = isCoach && reviewsOn ? await waitingOn(team) : new Map<string, { proposals: number; uploads: number }>();
  const reviews = [...wait.values()].reduce((n, w) => n + w.proposals, 0);
  const tiles = coachNav(t, { reviews });

  if (!isCoach) {
    return (
      <>
        <div className="pq-head"><h1 className="pq-h1">{t.team_name}</h1></div>
        <section className="pq-game glass is-empty" aria-labelledby="own-h">
          <span className="seam"><SeamEdge /></span>
          <div className="pq-game-top">{t.org_name}</div>
          <h2 id="own-h">You own this team<small>You aren&apos;t on its staff, so its players and games aren&apos;t shown to you. You decide who coaches it, who sees the game plan, and the bill.</small></h2>
        </section>
        <div style={{ height: "var(--gap)" }} />
        <Tiles items={tiles} label="Screens you can open" />
      </>
    );
  }

  const [pitchers, teams, games, ours] = await Promise.all([pitchersOf(team), teamsOf(team), gameList(team), ourTeamOf(team)]);
  const rule = teamRule(ours), today = teamToday(t.timezone);
  const live = pitchers.filter((p) => !p.deletedAt);
  const avail = (await availability(t, live, rule)).sort((x, y) => (x.pitcher.name || "").localeCompare(y.pitcher.name || ""));
  const opp = (id?: string | null) => (teams.find((x) => x.id === id) || { name: "" }).name;
  const next = nextGame(games, today);
  const resting = avail.filter((x) => x.eligible && !x.eligible.today);
  const waitList = [...wait].filter(([pid]) => live.some((x) => x.id === pid)).slice(0, 5);
  const recent = games.filter((g) => g.status === "final").sort((x, y) => (y.date || "").localeCompare(x.date || "")).slice(0, 5);

  return (
    <>
      <div className="pq-head">
        <div><h1 className="pq-h1">{t.team_name}</h1><p>{t.org_name}{t.level ? `, ${levelName(t.level)}` : ""}</p></div>
      </div>
      <div className="pq-launch">
        <div className="pq-col">
          <GameCard team={team} g={next} opp={opp(next?.opponent_id)} a={a} today={today} />
          <Tiles items={tiles} label="Screens you can open" />
          <section aria-labelledby="avail-h">
            <div className="pq-head" style={{ margin: "8px 0 10px" }}>
              <h2 id="avail-h" className="shell-h2" style={{ margin: 0 }}>Who can pitch</h2>
              <p className="small">{rule ? `${live.length - resting.length} of ${live.length} available today. Under ${rule.name}${rule.edited ? " (your numbers)" : ""}.` : "No pitch-count rule set, so no rest days are shown."}</p>
            </div>
            {avail.length ? (
              <div className="tbl-scroll"><table className="data-tbl" aria-label="Pitcher availability">
                <thead><tr><th>Pitcher</th><th>Last outing</th><th className="num">Last 7 days</th><th>Eligible</th></tr></thead>
                <tbody>{avail.map((x) => (
                  <tr key={x.pitcher.id}>
                    <td><Link href={`/app/t/${team}/roster/${x.pitcher.id}`}>{x.pitcher.number ? `#${x.pitcher.number} ` : ""}{x.pitcher.name || "Unnamed"}</Link></td>
                    <td>{x.last ? `${dayName(x.last.date)}, ${x.last.pitches} pitches` : "None in 30 days"}</td>
                    <td className="num"><Num value={x.week} delay={300} /></td>
                    <td>{!x.eligible ? "–" : x.eligible.today ? <span className="pill-ok">Today</span> : <span className="pill-warn" title={x.eligible.why}>{dayName(x.eligible.date)}</span>}</td>
                  </tr>))}</tbody>
              </table></div>
            ) : <p className="shell-note">No pitchers yet. {a.can("manage_roster") ? <Link href={`/app/t/${team}/roster`}>Add the roster</Link> : null}</p>}
          </section>
        </div>
        <aside className="pq-col" aria-label="Today">
          <section className="pq-panel" aria-labelledby="need-h">
            <h2 id="need-h">Needs you</h2>
            <ul className="pq-list">
              {waitList.map(([pid, w]) => (
                <li key={pid}><span className="need"><Link href={`/app/t/${team}/roster/${pid}/uploads`}>{(live.find((x) => x.id === pid) || { name: "A pitcher" }).name || "A pitcher"}</Link>
                  <small>{[w.proposals ? `${w.proposals} proposed value${w.proposals === 1 ? "" : "s"}` : "", w.uploads ? `${w.uploads} new upload${w.uploads === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}</small></span></li>))}
              {!rule && a.manage("manage_roster") ? <li><span className="need"><Link href={`/app/t/${team}/settings`}>Pick a pitch-count rule</Link><small>Then rest days and eligible dates show up</small></span></li> : null}
              {!live.length && a.can("manage_roster") ? <li><span className="need"><Link href={`/app/t/${team}/roster`}>Add your pitchers</Link><small>Paste the names, one per line</small></span></li> : null}
              {resting.length ? <li><span className="need">{resting.length} pitcher{resting.length === 1 ? " is" : "s are"} resting today<small>{resting.slice(0, 3).map((x) => x.pitcher.name).join(", ")}{resting.length > 3 ? "…" : ""}</small></span></li> : null}
            </ul>
            {!waitList.length && (rule || !a.manage("manage_roster")) && (live.length || !a.can("manage_roster")) && !resting.length ? <p className="pq-empty">Nothing waiting on you.</p> : null}
          </section>
          <section className="pq-panel" aria-labelledby="recent-h">
            <h2 id="recent-h">Recent games</h2>
            {recent.length ? <ul className="pq-list">{recent.map((g) => <li key={g.id}><span>{dayName(g.date || "")}</span><span className="meta">{opp(g.opponent_id) ? `vs ${opp(g.opponent_id)}` : ""}</span></li>)}</ul>
              : <p className="pq-empty">Games called in the game app show up here once the device syncs.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}

const LEVELS: Record<string, string> = { hs: "high school", travel: "travel ball", college_d3: "college D3", college_d1: "college D1", mlb: "pro" };
const levelName = (l: string) => LEVELS[l] || l;

function GameCard({ team, g, opp, a, today }: { team: string; g: GameListRow | null; opp: string; a: ReturnType<typeof abilities>; today: string }) {
  const base = `/app/t/${team}/games`;
  if (!g) {
    return (
      <section className="pq-game glass is-empty" aria-labelledby="game-h">
        <span className="seam"><SeamEdge /></span>
        <div className="pq-game-top">Next game</div>
        <h2 id="game-h">No game set up yet<small>{a.callGames ? "Pick the opponent, today's staff and their lineup here, then start it on the iPad or any device." : "When a coach sets up the next game, it shows here."}</small></h2>
        {a.callGames ? <div className="pq-game-acts"><Link className="shell-btn primary" href={`${base}/new`}>Set up a game</Link></div> : null}
      </section>
    );
  }
  const isLive = g.status === "live" || g.status === "suspended";
  const when = g.date === today ? "Today" : dayName(g.date || "");
  return (
    <section className="pq-game glass" aria-labelledby="game-h">
      <span className="seam"><SeamEdge /></span>
      <div className="pq-game-top">
        {isLive ? <span className="pill-live">{g.status === "suspended" ? "Suspended" : "Live"}</span> : <span className="pill">Set up</span>}
        <span>Next game</span>
      </div>
      <h2 id="game-h">{when}{opp ? ` ${g.home === false ? "at" : "vs"} ${opp}` : ""}
        <small>{isLive ? "It's being called on one device. Nothing from it shows anywhere else until it ends." : [g.home === true ? "Home" : g.home === false ? "Away" : "", timeName(g.starts)].filter(Boolean).join(", ") || "Ready to start"}</small></h2>
      {!isLive ? (
        <div className="pq-game-acts">
          {a.callGames ? <Link className="shell-btn primary" href={`${base}/${g.id}`}>Review and start</Link> : null}
          {!a.callGames && a.seesPlan ? <Link className="shell-btn" href={`${base}/${g.id}`}>See the game plan</Link> : null}
          {a.callGames ? <Link className="shell-btn text" href={`${base}/${g.id}/edit`}>Change the plan</Link> : null}
        </div>
      ) : null}
    </section>
  );
}
