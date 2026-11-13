import "server-only";
import { availability, catchersOf, dayName, hittersOf, ourTeamOf, pitchersOf, teamRule, teamToday, teamsOf, type TeamRow } from "@/lib/team";
import { LEVELS, TIERS, defaultInnings, type GameDoc, type PlanInput } from "@/lib/gameplan";
import { abilities } from "@/lib/nav";
import type { Opts, HitterOpt } from "./GamePlanForm";

// What the setup sheet offers: today's pitchers with their rest under the team's rule, opponents and their hitters,
// catchers. Read as the signed-in coach, so the database decides what he sees.
export async function planOptions(t: TeamRow, game: string | null): Promise<Opts> {
  const team = t.team_id;
  const [pitchers, teams, hitters, catchers, ours] = await Promise.all([pitchersOf(team), teamsOf(team), hittersOf(team), catchersOf(team), ourTeamOf(team)]);
  const live = pitchers.filter((p) => !p.deletedAt).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const avail = await availability(t, live, teamRule(ours));
  const byTeam: Record<string, HitterOpt[]> = {};
  for (const h of hitters) if (!h.deletedAt) (byTeam[h.teamId] = byTeam[h.teamId] || []).push({ id: h.id, name: h.name, number: h.number || "", bats: h.bats || "R" });
  const a = abilities(t);
  return {
    team, game, today: teamToday(t.timezone), levels: Object.entries(LEVELS), tiers: TIERS,
    pitchers: live.map((p) => { const e = avail.find((x) => x.pitcher.id === p.id)?.eligible;
      return { id: p.id, name: p.name, number: p.number || "", hand: p.hand, kinds: [...new Set((p.pitches || []).filter((d) => d.active !== false).map((d) => d.kind as string))],
        eligible: e && !e.today ? dayName(e.date) : null, restNote: e && !e.today ? e.why || null : null }; }),
    opponents: teams.filter((x) => !x.isOurs && !x.deletedAt).sort((a, b) => a.name.localeCompare(b.name)).map((x) => ({ id: x.id, name: x.name })),
    hitters: byTeam, catchers: catchers.filter((c) => !c.deletedAt).map((c) => ({ id: c.id, name: c.name, block: String(c.block || 3) })),
    canAddOpponent: a.can("manage_opponents") || a.can("manage_roster"),
    defaultInnings: Object.fromEntries(Object.keys(LEVELS).map((k) => [k, defaultInnings(k)])),
  };
}

export function blankPlan(t: TeamRow, today: string): PlanInput {
  return { date: today, time: "", home: null, innings: null, extrasRunner: false, level: t.level && t.level in LEVELS ? t.level : "hs", opponentId: null, newOpponent: "",
    staffIds: [], starterId: null, catcherId: null, lineup: Array.from({ length: 9 }, () => ({ hitterId: null, name: "", hand: "R" as const })),
    inputs: 2, logLoc: false, radar: false, umpSeed: "normal" };
}

export function planOf(g: GameDoc): PlanInput {
  return { date: g.date, time: g.time || "", home: g.setup?.home ?? null, innings: g.setup?.innings ?? null, extrasRunner: !!g.setup?.extrasRunner, level: g.level,
    opponentId: g.opponentId, newOpponent: "", staffIds: g.staffIds || [], starterId: g.starterId || (g.staffIds || [])[0] || null, catcherId: g.catcherId,
    lineup: (g.lineup || []).map((b) => ({ hitterId: b.hitterId, name: b.name, hand: b.hand })), inputs: g.inputs || 2, logLoc: !!g.logLoc, radar: !!g.radar, umpSeed: g.setup?.umpSeed || "normal" };
}
