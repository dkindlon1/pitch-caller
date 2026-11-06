import "server-only";
import { notFound, redirect } from "next/navigation";
import { getServerSupabase, getUser } from "./supabase/server";
import type { Doc, Hitter, Pitcher, Team } from "./docs";
import { stamp } from "./docs";
import PCRules from "./pitch_rules";
import type { Outing, Rule } from "./pitch_rules";

// What the signed-in user is on one team (pc_my_teams), checked on every page and action: the server checks again.
export type TeamRow = {
  team_id: string; team_name: string; level: string | null; timezone: string; org_id: string; org_name: string;
  role: string | null; perms: Record<string, boolean>; pitcher_ids: string[]; is_owner: boolean; active: boolean; status: string;
};
export const ROLE: Record<string, string> = { head: "Head coach", pitching: "Pitching coach", caller: "Pitch caller", viewer: "Viewer", player: "Player" };
export const TOGGLES: [string, string][] = [["call_games", "Call games"], ["edit_grades", "Edit grades"], ["review_uploads", "Review uploads"],
  ["manage_opponents", "Opponents"], ["manage_roster", "Roster"], ["manage_staff", "Staff"]];
export const PRESET_PERMS: Record<string, string[]> = { head: TOGGLES.map((t) => t[0]), pitching: ["call_games", "edit_grades", "review_uploads", "manage_opponents"],
  caller: ["call_games", "manage_opponents"], viewer: [], player: [] };

export async function myTeams(): Promise<TeamRow[]> {
  const sb = await getServerSupabase();
  const { data } = await sb.rpc("pc_my_teams");
  return (data || []) as TeamRow[];
}

// the team, for a coach (or its owner): signed out goes to sign-in, someone not on it gets a 404
export async function teamFor(teamId: string) {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/app/t/${teamId}`)}`);
  if (!/^[0-9a-f-]{36}$/.test(teamId)) notFound();
  const teams = await myTeams();
  const t = teams.find((x) => x.team_id === teamId);
  if (!t) notFound();
  if (t.role === "player") redirect(`/app/me/${teamId}`);   // players have their own portal
  const can = (perm: string) => !!(t.role && t.role !== "player" && t.active && (t.perms || {})[perm]);
  return { user, team: t, teams, can, isCoach: !!t.role && t.role !== "player", manage: (perm: string) => can(perm) || (t.is_owner && t.status !== "removed") };
}

async function rows<T>(table: string, teamId: string): Promise<T[]> {
  const sb = await getServerSupabase();
  const { data, error } = await sb.from(table).select("doc").eq("program_id", teamId).is("deleted_at", null).limit(2000);
  if (error) return [];
  return (data || []).map((r: { doc: T }) => r.doc);
}
export const pitchersOf = (teamId: string) => rows<Pitcher>("pitchers", teamId);
export const teamsOf = (teamId: string) => rows<Team>("teams", teamId);
export const hittersOf = (teamId: string) => rows<Hitter>("hitters", teamId);
export const gamesOf = (teamId: string) => rows<Doc & { date?: string; status?: string; opponentId?: string; dupOf?: string }>("games", teamId);
export const ourTeamOf = async (teamId: string) => (await teamsOf(teamId)).find((x) => x.isOurs) || null;

export type PushResult = { applied: number; skipped: number; rejected: { id: string; reason: string }[]; error?: string };
// write through pc_push: the same rules (who may write what, newest wins) as the iPad's sync
export async function push(teamId: string, table: string, docs: Partial<Doc>[], prefix: string): Promise<PushResult> {
  const sb = await getServerSupabase();
  const { data, error } = await sb.rpc("pc_push", { p: teamId, tbl: table, rows: docs.map((d) => stamp(d, prefix)) });
  if (error) return { applied: 0, skipped: 0, rejected: [], error: error.message };
  return data as PushResult;
}

// the team's own team record (the iPad makes one when it joins; a team started on the website gets one here)
export async function ensureOurTeam(t: TeamRow): Promise<Team | null> {
  const ours = await ourTeamOf(t.team_id);
  if (ours) return ours;
  const r = await push(t.team_id, "teams", [{ name: t.team_name, isOurs: true, level: t.level || undefined }], "tea");
  return r.applied ? ourTeamOf(t.team_id) : null;
}

// today in the team's time zone
export function teamToday(tz: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
}

export type Availability = { pitcher: Pitcher; last: Outing | null; week: number; eligible: { date: string; today: boolean; why: string } | null };
// each pitcher's last outing, pitches in the last 7 days and the day he can pitch again under the team's rule
export async function availability(t: TeamRow, pitchers: Pitcher[], rule: Rule | null): Promise<Availability[]> {
  const sb = await getServerSupabase();
  const { data } = await sb.rpc("pc_team_workload", { team: t.team_id });
  const work = (data || []) as { pitcher_id: string; day: string; pitches: number }[];
  const today = teamToday(t.timezone), weekAgo = PCRules.addDays(today, -6);
  return pitchers.map((p) => {
    const days = new Map<string, number>();
    for (const w of work) if (w.pitcher_id === p.id) days.set(w.day, (days.get(w.day) || 0) + w.pitches);
    const outings = [...days].map(([date, pitches]) => ({ date, pitches })).sort((a, b) => (a.date < b.date ? -1 : 1));
    const last = outings.length ? outings[outings.length - 1] : null;
    const week = outings.filter((o) => o.date >= weekAgo).reduce((a, o) => a + o.pitches, 0);
    let eligible = null;
    if (rule) {
      const e = PCRules.eligibleOn(rule, outings, today);
      const w = e.why;
      const why = !w ? "" : w.kind === "rest" ? `${w.pitches} pitches on ${dayName(w.date || "")}` : w.kind === "consecutive" ? "pitched days in a row" : `${w.max} in ${w.days} days`;
      eligible = { date: e.date, today: e.today, why };
    }
    return { pitcher: p, last, week, eligible };
  });
}

export const dayName = (d: string) => (d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "");
export const teamRule = (ours: Team | null): Rule | null => (ours && ours.pitchRule ? PCRules.resolve(ours.pitchRule) : null);
