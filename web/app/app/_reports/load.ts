import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import { myTeams } from "@/lib/team";
import { buildOuting, type Outing, type Recap } from "@/lib/report_data.ts";
import { gameEvents, gameMeta, myReport, teamGames, teamNames, teamPitchers, teamSeasons, type SB } from "@/lib/report_fetch.ts";
import { outingOutcome, type OutcomeOuting, type Season } from "@/lib/outcome";

// The one place an outing report's data is gathered, for its page and its PDF alike, so the two can't differ.
// Everything is read as the signed-in user: row level security decides what comes back.

export type StaffOuting = { report: Outing; pitcherName: string; hand: string | null; opponent: string | null; opponentId: string | null; level: string | null;
  notes: { id: string; scope: string; at_bat: string | null; body: string; shared: boolean; created_at: string }[]; hitters: Map<string, { name?: string; number?: string }>;
  others: { id: string; name: string }[]; outcome: OutcomeOuting };

/** null: not a coach on an active team, no such game, or he didn't pitch in it */
export async function loadStaffOuting(team: string, game: string, pitcher: string): Promise<StaffOuting | null> {
  const t = (await myTeams()).find((x) => x.team_id === team);
  if (!t || !t.role || t.role === "player") return null;
  const sb = await getServerSupabase(), db = sb as unknown as SB;
  const [games, pitchers, names] = await Promise.all([teamGames(db, team), teamPitchers(db, team), teamNames(db, team)]);
  const g = games.find((x) => x.id === game);
  if (!g) return null;
  const evs = await gameEvents(db, team, [game]);
  const mine = evs.filter((e) => e.pitcherId === pitcher);
  if (!mine.some((e) => e.type === undefined || e.type === "pitch")) return null;
  const p = pitchers.find((x) => x.id === pitcher), meta = gameMeta(g, names, t.level);
  // his history (every game he pitched in) for outcome tracking: his normal before this game, tonight's findings and drift
  const [history, seasons] = await Promise.all([gameEvents(db, team, games.map((x) => x.id), pitcher), teamSeasons(db, team)]);
  const ss: Season[] = seasons.map((x) => ({ name: x.name, start: x.start_date, end: x.end_date }));
  const outcome = outingOutcome(history, games.map((x) => ({ id: x.id, date: String(x.date) })), game, ss, p?.pitches || []);
  const [{ data: notes }, { data: hitters }] = await Promise.all([
    sb.from("report_notes").select("id, scope, at_bat, body, shared, created_at").eq("program_id", team).eq("game_id", game).eq("pitcher_id", pitcher).is("deleted_at", null).order("created_at"),
    sb.from("hitters").select("id, doc").eq("program_id", team).eq("doc->>teamId", g.opponent_id || "-").limit(200),
  ]);
  return {
    report: buildOuting(mine, meta, pitcher, p?.pitches || [], "staff", p?.hand), pitcherName: p?.name || "Unknown pitcher", hand: p?.hand || null,
    opponent: meta.opponent || null, opponentId: g.opponent_id, level: t.level, notes: (notes || []) as StaffOuting["notes"],
    hitters: new Map(((hitters || []) as { id: string; doc: { name?: string; number?: string } }[]).map((h) => [h.id, h.doc])),
    others: [...new Set(evs.map((e) => e.pitcherId).filter((x): x is string => !!x && x !== pitcher))].map((id) => ({ id, name: pitchers.find((x) => x.id === id)?.name || "Pitcher" })),
    outcome,
  };
}

export type MyOuting = { report: Outing; pitcherName: string; hand: string | null; opponent: string | null; level: string | null; notes: { id: string; scope: string; at_bat: string | null; body: string; created_at: string }[]; outcome: OutcomeOuting };
/** the pitcher's own outing, through pc_my_report (his own pitches, coach-only fields left out) */
export async function loadMyOuting(team: string, game: string, pitcher: string): Promise<MyOuting | null> {
  const sb = (await getServerSupabase()) as unknown as SB;
  // his whole history through pc_my_report (his own pitches only): this game's report and his outcome tracking
  const d = await myReport(sb, team, pitcher, {}).catch(() => null);
  if (!d || !d.events.some((e) => e.gameId === game)) return null;
  const g = d.games.find((x) => x.id === game);
  if (!g) return null;
  const ss: Season[] = d.seasons.map((x) => ({ name: x.name, start: x.start, end: x.end }));
  const outcome = outingOutcome(d.events, d.games.map((x) => ({ id: x.id, date: x.date })), game, ss, d.pitcher.pitches || [], "player");   // a player or parent: no "Effectively wild"
  return { report: buildOuting(d.events.filter((e) => e.gameId === game), { id: g.id, date: g.date, opponent: g.opponent, level: g.level }, pitcher, d.pitcher.pitches || [], "pitcher", d.pitcher.hand),
    pitcherName: d.pitcher.name || "Your outing", hand: d.pitcher.hand || null, opponent: g.opponent || null, level: g.level || null, notes: d.notes.filter((n) => n.game_id === game), outcome };
}

/** a frozen final recap, newest version (row level security: the team's coaches, or the pitcher himself) */
export async function loadFinal(team: string, season: string, pitcher: string): Promise<{ version: number; data: Recap; created_at: string } | null> {
  if (!/^[0-9a-f-]{36}$/.test(season)) return null;
  const sb = await getServerSupabase();
  const { data } = await sb.from("recap_versions").select("version, data, created_at").eq("program_id", team).eq("season_id", season).eq("pitcher_id", pitcher).order("version", { ascending: false }).limit(1);
  return ((data || [])[0] as { version: number; data: Recap; created_at: string }) || null;
}

export const pdfResponse = (bytes: Uint8Array, name: string) => new Response(Buffer.from(bytes), {
  headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name.replace(/[^\w.-]+/g, "-")}"`, "cache-control": "private, no-store" } });
