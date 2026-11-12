import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { dayName, gameList, teamFor, teamToday, teamsOf, timeName, type GameListRow } from "@/lib/team";
import { abilities } from "@/lib/nav";
import { one, type Search } from "../ui";
import { Icon } from "../../../_frame/Icon";

export const metadata: Metadata = { title: "Game Day · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string }>;

const MSG: Record<string, string> = {
  removed: "Taken off the schedule.", not_allowed: "Your role on this team can't do that.", started: "That game has started, so it stays on the schedule.",
  push: "That couldn't be saved. Try again in a moment.",
};

// Game Day: the schedule. Games set up ahead, the one being called (only that it's live: nothing from it shows here
// until it ends), and the last few played.
export default function GameDay({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading the schedule…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}

async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team } = await params, sp = await searchParams;
  const { team: t, isCoach } = await teamFor(team);
  const a = abilities(t);
  if (!isCoach) return <p className="shell-note">The schedule is for the team&apos;s coaches.</p>;
  const [games, teams] = await Promise.all([gameList(team), teamsOf(team)]);
  const today = teamToday(t.timezone);
  const opp = (id: string | null) => (teams.find((x) => x.id === id) || { name: "" }).name;
  const upcoming = games.filter((g) => g.status === "live" || g.status === "suspended" || (g.status === "planned" && (g.date || "") >= today))
    .sort((x, y) => ((x.date || "") + (x.starts || "")).localeCompare((y.date || "") + (y.starts || "")));
  const stale = games.filter((g) => g.status === "planned" && (g.date || "") < today);
  const played = games.filter((g) => g.status === "final").slice(0, 8);
  const msg = MSG[one(sp.ok)] || MSG[one(sp.error)];
  return (
    <>
      <div className="pq-head">
        <div><h1 className="pq-h1">Game Day</h1><p>{a.callGames ? "Set a game up here, then start it on the iPad or any device signed in to this team." : a.seesPlan ? "The game plans your staff set up, read only." : "The schedule. Your role doesn't show the game plans."}</p></div>
        {a.callGames ? <Link href={`/app/t/${team}/games/new`} className="shell-btn primary"><Icon name="plus" /> Set up a game</Link> : null}
      </div>
      {msg ? <p className={sp.error ? "shell-alert" : "shell-note ok-note"} role={sp.error ? "alert" : "status"}>{msg}</p> : null}
      <h2 className="shell-h2" style={{ marginTop: 0 }}>Coming up</h2>
      {upcoming.length ? <ul className="pq-games">{upcoming.map((g) => <Row key={g.id} g={g} team={team} opp={opp(g.opponent_id)} a={a} today={today} />)}</ul>
        : <p className="shell-note">{a.callGames ? "Nothing set up. Set up the next game and it's ready on every device signed in to this team." : "No game set up yet."}</p>}
      {stale.length && a.callGames ? <>
        <h2 className="shell-h2">Set up but never started</h2>
        <ul className="pq-games">{stale.map((g) => <Row key={g.id} g={g} team={team} opp={opp(g.opponent_id)} a={a} today={today} />)}</ul>
      </> : null}
      {played.length ? <>
        <h2 className="shell-h2">Played</h2>
        <ul className="pq-games">{played.map((g) => <Row key={g.id} g={g} team={team} opp={opp(g.opponent_id)} a={a} today={today} />)}</ul>
      </> : null}
    </>
  );
}

function Row({ g, team, opp, a, today }: { g: GameListRow; team: string; opp: string; a: ReturnType<typeof abilities>; today: string }) {
  const d = g.date ? new Date(g.date + "T12:00:00") : null;
  const isLive = g.status === "live" || g.status === "suspended";
  const base = `/app/t/${team}/games/${g.id}`;
  return (
    <li className="pq-gamerow">
      <span className="date" aria-hidden="true"><b>{d ? d.getDate() : "–"}</b><span>{d ? d.toLocaleDateString("en-US", { month: "short" }) : ""}</span></span>
      <div>
        <h3>{opp ? `${g.home === false ? "at" : "vs"} ${opp}` : "No opponent picked"}</h3>
        <p>{g.date === today ? "Today" : dayName(g.date || "")}{g.starts ? `, ${timeName(g.starts)}` : ""}{g.home === null ? "" : g.home ? ", home" : ", away"}</p>
      </div>
      <div className="acts">
        {isLive ? <span className="pill-live">{g.status === "suspended" ? "Suspended on one device" : "Live on one device"}</span>
          : g.status === "final" ? <span className="pill">Final</span>
          : <>
            {a.seesPlan ? <Link className="shell-btn" href={base}>{a.callGames ? "Plan" : "See plan"}</Link> : null}
            {a.callGames ? <a className="shell-btn primary" href={`${base}/open`}>Start on this device</a> : null}
          </>}
      </div>
    </li>
  );
}
