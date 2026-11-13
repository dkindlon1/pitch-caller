import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { catchersOf, dayName, gamesOf, hittersOf, pitchersOf, teamFor, teamToday, teamsOf, timeName } from "@/lib/team";
import { abilities } from "@/lib/nav";
import { LEVELS, TIERS, defaultInnings, type GameDoc } from "@/lib/gameplan";
import { removeGamePlan } from "../actions";
import { one, type Search } from "../../ui";
import { DateBlock } from "../../../../_frame/DateBlock";
import { ConfirmSubmit } from "../../../../_frame/ConfirmSubmit";
import { SheetSkeleton } from "../../../../_frame/Skeleton";

export const metadata: Metadata = { title: "Game plan · PitchIQ", robots: { index: false } };
type Params = Promise<{ team: string; game: string }>;

const ERR: Record<string, string> = {
  not_allowed: "Starting games is for coaches who call them.", locked: "This team isn’t switched on yet (billing).", missing: "That game isn’t on this team’s schedule.",
  over: "That game is over.",
};

// One game's plan, and the button that starts it on this device. Shown only to coaches who call games or whom the
// owner lets see the plan (the database won't hand the record to anyone else).
export default function GamePlan({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<SheetSkeleton label="Loading the plan" />}><Body params={params} searchParams={searchParams} /></Suspense>;
}

async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { team, game } = await params, sp = await searchParams;
  const { team: t } = await teamFor(team);
  const a = abilities(t);
  const back = <Link href={`/app/t/${team}/games`}>Back to Game Day</Link>;
  if (!a.seesPlan) return <p className="shell-note">Your role on this team doesn’t show game plans. The organization’s owner decides who sees them. {back}</p>;
  const [games, pitchers, teams, hitters, catchers] = await Promise.all([gamesOf(team), pitchersOf(team), teamsOf(team), hittersOf(team), catchersOf(team)]);
  const g = games.find((x) => x.id === game) as GameDoc | undefined;
  if (!g) return <p className="shell-note">That game isn’t on this team’s schedule. {back}</p>;
  const opp = (teams.find((x) => x.id === g.opponentId) || { name: "" }).name;
  const pname = (id: string) => { const p = pitchers.find((x) => x.id === id); return p ? `${p.number ? `#${p.number} ` : ""}${p.name || "Unnamed"}` : "A pitcher no longer on the roster"; };
  const isLive = g.status === "live" || g.status === "suspended";
  const today = teamToday(t.timezone);
  const err = ERR[one(sp.error)];
  const lineup = (g.lineup || []).filter((b) => b.name);
  const known = new Set(hitters.map((h) => h.id));
  return (
    <>
      {err ? <p className="shell-alert" role="alert">{err}</p> : null}
      {one(sp.ok) === "planned" ? <p className="shell-note ok-note" role="status">Saved. It’s on every device signed in to this team the next time it syncs.</p> : null}
      <section className="pq-game pq-white" aria-labelledby="g-h" style={{ marginBottom: "var(--gap)" }}>
        <DateBlock date={g.date} today={today} />
        <div className="pq-game-body">
        <div className="pq-game-top">
          {isLive ? <span className="pill-live">{g.status === "suspended" ? "Suspended" : "Live"}</span> : g.status === "final" ? <span className="pill">Final</span> : <span className="pill">Set up</span>}
          <Link href={`/app/t/${team}/games`} className="shell-btn text">Game Day</Link>
        </div>
        <h1 id="g-h" className="pq-h1" style={{ margin: 0 }}>{g.date === today ? "Today" : dayName(g.date)}{opp ? ` ${g.setup?.home === false ? "at" : "vs"} ${opp}` : ""}</h1>
        <dl className="pq-game-facts">
          <div><dt>First pitch</dt><dd>{timeName(g.time) || "Not set"}</dd></div>
          <div><dt>We’re</dt><dd>{g.setup?.home === true ? "Home" : g.setup?.home === false ? "Away" : "Not set"}</dd></div>
          <div><dt>Level</dt><dd>{LEVELS[g.level] || g.level}, {g.setup?.innings || defaultInnings(g.level)} innings</dd></div>
          <div><dt>Charting</dt><dd>{(TIERS.find((x) => x[0] === g.inputs) || [0, "Results only"])[1]}</dd></div>
        </dl>
        {isLive ? <p className="shell-note" style={{ margin: 0 }}>It’s being called on one device. A game in progress stays on that device only: nothing from it shows here or anywhere else until it ends.</p>
          : g.status === "final" ? null : a.callGames ? (
          <div className="pq-game-acts">
            <a className="shell-btn primary" href={`/app/t/${team}/games/${game}/open`}>Start on this device</a>
            <Link className="shell-btn" href={`/app/t/${team}/games/${game}/edit`}>Change the plan</Link>
          </div>
        ) : <p className="shell-note" style={{ margin: 0 }}>Read only: a coach who calls games starts it.</p>}
        </div>
      </section>

      <div className="pq-launch">
        <div className="pq-col">
          <section className="pq-panel" aria-labelledby="lu-h">
            <h2 id="lu-h">Their lineup <small>{opp || "No opponent picked"}</small></h2>
            {lineup.length ? <ol className="pq-list" style={{ listStyle: "none" }}>{lineup.map((b, i) => (
              <li key={i}><span>{i + 1}. {b.name}</span><span className="meta">Bats {b.hand === "S" ? "both" : b.hand === "L" ? "left" : "right"}{b.hitterId && known.has(b.hitterId) ? "" : ", new"}</span></li>))}</ol>
              : <p className="pq-empty">No names: the engine starts every hitter as average and learns him during the game.</p>}
          </section>
        </div>
        <aside className="pq-col" aria-label="Our side">
          <section className="pq-panel" aria-labelledby="st-h">
            <h2 id="st-h">Our staff</h2>
            <ul className="pq-list">{(g.staffIds || []).map((id) => <li key={id}><span>{pname(id)}</span>{id === (g.starterId || g.staffIds[0]) ? <span className="pill">Starts</span> : null}</li>)}</ul>
          </section>
          <section className="pq-panel" aria-labelledby="c-h">
            <h2 id="c-h">Catcher and umpire</h2>
            <ul className="pq-list">
              <li><span>{(catchers.find((c) => c.id === g.catcherId) || { name: "Average blocker" }).name}</span></li>
              <li><span>{g.setup?.umpSeed === "tight" ? "Tight zone" : g.setup?.umpSeed === "wide" ? "Wide zone" : "Normal zone"}</span>{g.logLoc ? <span className="meta">Logging locations</span> : null}</li>
            </ul>
          </section>
          {a.callGames && g.status === "planned" ? (
            <form action={removeGamePlan}>
              <input type="hidden" name="team" value={team} /><input type="hidden" name="game" value={game} />
              <ConfirmSubmit label="Take it off the schedule" confirm="Yes, take it off" />
            </form>
          ) : null}
        </aside>
      </div>
      <p className="shell-note small" style={{ marginTop: 18 }}>{g.plannedBy ? `Set up by ${g.plannedBy}. ` : ""}On the iPad, open the PitchIQ game app: today’s planned game is offered when it opens.</p>
    </>
  );
}
