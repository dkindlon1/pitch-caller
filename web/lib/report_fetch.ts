// Reads for the outing reports, the game summary, the season recap and a hitter's at-bats. Takes any Supabase client
// (the website's per-request client acting as the signed-in user, or supabase-js in a script), so row level security
// decides what comes back: a coach reads his team's events; a pitcher only pc_my_report (his own pitches, coach-only
// fields left out); a visitor only pc_public_recap. No "server-only" import: scripts/report_check.js and the seeded
// season load it too.
import type { Ev, GameMeta, PitchInfo } from "./report_data.ts";

// the slice of the Supabase client used here
type Q = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  eq: (c: string, v: unknown) => Q; in: (c: string, v: unknown[]) => Q; is: (c: string, v: null) => Q; order: (c: string, o?: { ascending?: boolean }) => Q;
  range: (a: number, b: number) => Q; gte: (c: string, v: unknown) => Q; lte: (c: string, v: unknown) => Q; limit: (n: number) => Q;
};
export type SB = { from: (t: string) => { select: (cols: string) => Q }; rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

export type PitcherDoc = { id: string; name: string; hand?: string | null; pitches?: PitchInfo[]; number?: string | number | null };
export type Season = { id: string; name: string; start_date: string; end_date: string; ended_at: string };
export type ListGame = { id: string; date: string | null; status: string; opponent_id: string | null; home: boolean | null };

const PAGE = 1000;   // PostgREST's row cap per request: read in pages
async function all<T>(make: () => Q): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}
const chunks = <T,>(xs: T[], n = 100) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

// ---------------------------------------------------------------- coaches (row level security: the team's coaches)
export async function teamGames(sb: SB, team: string): Promise<ListGame[]> {
  const { data, error } = await sb.rpc("pc_game_list", { p: team });
  if (error) throw new Error(error.message);
  return ((data || []) as ListGame[]).filter((g) => g.date && /^\d{4}-\d{2}-\d{2}$/.test(g.date));
}
export async function teamPitchers(sb: SB, team: string): Promise<PitcherDoc[]> {
  const rows = await all<{ doc: PitcherDoc & { deletedAt?: number } }>(() => sb.from("pitchers").select("doc").eq("program_id", team).order("id"));
  return rows.map((r) => r.doc).filter((p) => p && !p.deletedAt);
}
export async function teamNames(sb: SB, team: string): Promise<Map<string, string>> {
  const rows = await all<{ id: string; doc: { name?: string } }>(() => sb.from("teams").select("id, doc").eq("program_id", team).order("id"));
  return new Map(rows.map((r) => [r.id, r.doc?.name || "Opponent"]));
}
export async function teamSeasons(sb: SB, team: string): Promise<Season[]> {
  const { data, error } = await sb.from("seasons").select("id, name, start_date, end_date, ended_at").eq("program_id", team).order("end_date", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data || []) as Season[];
}
/** the season so far starts the day after the last season marked over */
export const seasonSoFarStart = (seasons: Season[]) => {
  const last = seasons.map((s) => s.end_date).sort().pop();
  if (!last) return null;
  const d = new Date(last + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
export async function gameEvents(sb: SB, team: string, gameIds: string[], pitcherId?: string | null): Promise<Ev[]> {
  const out: Ev[] = [];
  for (const ids of chunks(gameIds)) {
    const rows = await all<{ doc: Ev }>(() => {
      let q = sb.from("events").select("doc").eq("program_id", team).in("game_id", ids).is("deleted_at", null);
      if (pitcherId) q = q.eq("pitcher_id", pitcherId);
      return q.order("id");
    });
    out.push(...rows.map((r) => r.doc));
  }
  return out;
}
export async function hitterEvents(sb: SB, team: string, hitterId: string): Promise<Ev[]> {
  const rows = await all<{ doc: Ev }>(() => sb.from("events").select("doc").eq("program_id", team).eq("doc->>hitterId", hitterId).is("deleted_at", null).order("id"));
  return rows.map((r) => r.doc);
}
export function gameMeta(g: ListGame, names: Map<string, string>, level: string | null): GameMeta {
  return { id: g.id, date: String(g.date), opponentId: g.opponent_id, opponent: g.opponent_id ? names.get(g.opponent_id) || "Opponent" : null, level, status: g.status };
}

// ---------------------------------------------------------------- a pitcher's own view (pc_my_report)
export type MyReport = { pitcher: PitcherDoc; team: string; games: (GameMeta & { status?: string })[]; events: Ev[];
  notes: { id: string; game_id: string; scope: "outing" | "atbat"; at_bat: string | null; body: string; created_at: string }[];
  seasons: { id: string; name: string; start: string; end: string }[]; season_start: string | null } | null;
export async function myReport(sb: SB, team: string, pitcher: string, opts: { game?: string; from?: string | null; to?: string | null } = {}): Promise<MyReport> {
  const { data, error } = await sb.rpc("pc_my_report", { p: team, pitcher, game: opts.game ?? null, from_day: opts.from ?? null, to_day: opts.to ?? null });
  if (error) throw new Error(error.message);
  return (data || null) as MyReport;
}

// ---------------------------------------------------------------- a signed-out visitor (pc_public_recap)
export type PublicRecap = { pitcher: PitcherDoc; team: string; level: string | null; sections: { summary: boolean; heat: boolean; pitches: boolean; outings: boolean };
  season: { name: string; start: string | null; end?: string | null; final: boolean }; frozen?: Record<string, unknown>; games?: GameMeta[]; events?: Ev[] } | null;
export async function publicRecap(sb: SB, token: string): Promise<PublicRecap> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data, error } = await sb.rpc("pc_public_recap", { tok: token });
  if (error) return null;
  return (data || null) as PublicRecap;
}
