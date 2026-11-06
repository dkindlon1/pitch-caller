import "server-only";
import { notFound, redirect } from "next/navigation";
import { getServerSupabase, getUser } from "./supabase/server";
import { myTeams, type TeamRow } from "./team";
import type { Pitcher } from "./docs";
import PCRules from "./pitch_rules";
import type { Rule } from "./pitch_rules";

// The player portal's reads. A player (or a parent, for a child) never reads the team's tables directly: his pitcher
// record comes through pc_pull (without the coaches' notes), his outings and what the engine learned through
// functions that return only his rows (supabase/migrations/20261109000000_players_admin.sql).
export type Outing = { pitcher_id: string; game_id: string; date: string; pitches: number; strikes: number; by_pitch: Record<string, { n: number; strikes: number }> };
export type GradeChange = { id: number; pitch_id: string; pitch_name: string | null; field: "grade" | "command"; old_value: number | null; new_value: number | null;
  by_role: string | null; changed_by: string | null; changed_at: string; reverted_at: string | null };
export type Learned = { at?: number; learner?: string; pitches: Record<string, Record<string, unknown>> } | null;

// the team, for one of its players: signed out goes to sign-in, anyone else gets a 404
export async function playerTeam(teamId: string) {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/app/me/${teamId}`)}`);
  if (!/^[0-9a-f-]{36}$/.test(teamId)) notFound();
  const t = (await myTeams()).find((x) => x.team_id === teamId);
  if (!t || t.role !== "player") notFound();
  return { user, team: t as TeamRow };
}

export async function myPitchers(teamId: string): Promise<Pitcher[]> {
  const sb = await getServerSupabase();
  const { data, error } = await sb.rpc("pc_pull", { p: teamId, tbl: "pitchers", after_xid: 0, after_id: "", lim: 50 });
  if (error || !data) return [];
  return ((data as { rows: Pitcher[] }).rows || []).filter((p) => !p.deletedAt);
}

export async function myOutings(teamId: string): Promise<{ rule: Rule | null; outings: Outing[] }> {
  const sb = await getServerSupabase();
  const { data } = await sb.rpc("pc_my_outings", { p: teamId });
  const d = (data || { rule: null, outings: [] }) as { rule: Record<string, unknown> | null; outings: Outing[] };
  return { rule: d.rule ? PCRules.resolve(d.rule) : null, outings: d.outings || [] };
}

export async function myLearned(teamId: string, pitcher: string): Promise<Learned> {
  const sb = await getServerSupabase();
  const { data } = await sb.rpc("pc_my_learned", { p: teamId, pitcher });
  return (data || null) as Learned;
}

export async function gradeHistory(teamId: string, pitcher: string): Promise<GradeChange[]> {
  const sb = await getServerSupabase();
  const { data } = await sb.from("grade_history").select("id, pitch_id, pitch_name, field, old_value, new_value, by_role, changed_by, changed_at, reverted_at")
    .eq("program_id", teamId).eq("pitcher_id", pitcher).order("id", { ascending: false }).limit(100);
  return (data || []) as GradeChange[];
}

// his pitching days for the team's rule: game pitches per day
export function daysOf(outings: Outing[], pitcher: string) {
  const days = new Map<string, number>();
  for (const o of outings) if (o.pitcher_id === pitcher) days.set(o.date, (days.get(o.date) || 0) + o.pitches);
  return [...days].map(([date, pitches]) => ({ date, pitches })).sort((a, b) => (a.date < b.date ? -1 : 1));
}
