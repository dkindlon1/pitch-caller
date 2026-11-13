import "server-only";
import { getServerSupabase } from "./supabase/server";
import { propose, summarize, type SessionPitch, type SessionType, type Proposal } from "./uploads";
import { proposeOpts } from "./engine_server";
import type { Pitcher } from "./docs";

// The upload pages' reads (row level security decides: the pitcher, his parent, the team's coaches) and the one
// write every change ends with: the pitcher's pending proposals worked out again from all his uploads.
export type UploadRow = { id: string; pitcher_id: string; source: "trackman" | "rapsodo" | "mapped"; session_type: SessionType; session_date: string;
  file_name: string | null; n_pitches: number; warnings: string[]; created_at: string; uploaded_by: string | null };
export type StoredPitch = SessionPitch & { upload_id: string; idx: number };
export type ProposalRow = { id: number; pitch_id: string | null; pitch_name: string | null; field: "velo" | "shape" | "slot"; value: unknown; current: unknown;
  basis: { n?: number; weight?: number; type?: string; angle?: number; uploads?: string[] }; status: string; created_at: string; decided_at: string | null; decided_by: string | null };

export async function uploadsOf(team: string, pitcher: string): Promise<UploadRow[]> {
  const sb = await getServerSupabase();
  const { data } = await sb.from("uploads").select("id, pitcher_id, source, session_type, session_date, file_name, n_pitches, warnings, created_at, uploaded_by")
    .eq("program_id", team).eq("pitcher_id", pitcher).order("session_date", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  return (data || []) as UploadRow[];
}

// every pitch of his, with its session's type and date (paged: PostgREST hands back at most 1000 rows at a time)
export async function pitchesOf(team: string, pitcher: string, upload?: string): Promise<StoredPitch[]> {
  const sb = await getServerSupabase();
  const out: StoredPitch[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    let q = sb.from("upload_pitches").select("*, uploads!inner(session_type, session_date)").eq("program_id", team).eq("pitcher_id", pitcher);
    if (upload) q = q.eq("upload_id", upload);
    const { data, error } = await q.order("upload_id").order("idx").range(from, from + 999);
    if (error || !data) break;
    for (const r of data as (StoredPitch & { uploads: { session_type: SessionType; session_date: string } })[]) {
      const { uploads, ...rest } = r;
      const num = (v: unknown) => (v === null || v === undefined ? null : +v);
      out.push({ ...rest, velo_mph: num(rest.velo_mph), ivb_in: num(rest.ivb_in), hb_in: num(rest.hb_in), spin_rpm: num(rest.spin_rpm),
        rel_height_ft: num(rest.rel_height_ft), rel_side_ft: num(rest.rel_side_ft), extension_ft: num(rest.extension_ft),
        plate_x_ft: num(rest.plate_x_ft), plate_z_ft: num(rest.plate_z_ft), session_type: uploads.session_type, session_date: uploads.session_date });
    }
    if (data.length < 1000) break;
  }
  return out;
}

export async function proposalsOf(team: string, pitcher: string, status?: "pending"): Promise<ProposalRow[]> {
  const sb = await getServerSupabase();
  let q = sb.from("proposals").select("id, pitch_id, pitch_name, field, value, current, basis, status, created_at, decided_at, decided_by")
    .eq("program_id", team).eq("pitcher_id", pitcher);
  if (status) q = q.eq("status", status);
  const { data } = await q.order("created_at", { ascending: false }).limit(100);
  return (data || []) as ProposalRow[];
}

// a team's pending proposals and recent uploads, per pitcher (the coach's home card)
export async function waitingOn(team: string) {
  const sb = await getServerSupabase();
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const [{ data: props }, { data: ups }] = await Promise.all([
    sb.from("proposals").select("pitcher_id").eq("program_id", team).eq("status", "pending").limit(1000),
    sb.from("uploads").select("pitcher_id").eq("program_id", team).gte("created_at", since).limit(1000),
  ]);
  const by = new Map<string, { proposals: number; uploads: number }>();
  for (const r of props || []) { const x = by.get(r.pitcher_id) || { proposals: 0, uploads: 0 }; x.proposals++; by.set(r.pitcher_id, x); }
  for (const r of ups || []) { const x = by.get(r.pitcher_id) || { proposals: 0, uploads: 0 }; x.uploads++; by.set(r.pitcher_id, x); }
  return by;
}

export async function teamToday(tz: string | null) {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz || "America/New_York" });
}

// after any upload change: his summary from every upload, and a fresh set of pending proposals
export async function refreshProposals(team: string, p: Pitcher, today: string, level?: string | null): Promise<{ proposals: Proposal[]; error?: string }> {
  const all = await pitchesOf(team, p.id);
  const { proposals } = propose(p, summarize(all, today), proposeOpts(level));   // v1.1: the engine's tags, at his team's level
  const sb = await getServerSupabase();
  const { error } = await sb.rpc("pc_proposals_set", { p: team, pitcher: p.id, list: proposals });
  return { proposals, error: error?.message };
}
