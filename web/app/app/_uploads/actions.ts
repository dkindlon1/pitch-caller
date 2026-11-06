"use server";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { refreshProposals, teamToday } from "@/lib/upload_data";
import type { UploadPitch } from "@/lib/uploads";
import { uploadAccess } from "./access";

// Uploads, review and proposals, for the pitcher and for a coach with review_uploads. Every change goes through the
// database's own checks (pc_upload_*), then the pitcher's proposals are worked out again from all his uploads.
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const go = (base: string, path: string, q: string): never => redirect(`${base}${path}${q ? "?" + q : ""}`);
const SESSION = new Set(["game", "live_bp", "bullpen"]);
const SOURCE = new Set(["trackman", "rapsodo", "mapped"]);
const REASON = new Set(["warmup", "grip", "mistag", "other"]);

async function ctx(f: FormData) {
  const a = await uploadAccess(str(f, "team"), str(f, "pitcher"));
  if (!a.edit) go(a.base, "/uploads", "error=not_allowed");
  return a;
}

// The browser reads the file and normalizes it with the game app's parser (lib/pc_import.js, lib/uploads.ts), then
// sends the rows here. The database checks every value again.
export async function addUpload(f: FormData) {
  const a = await ctx(f);
  let rows: UploadPitch[];
  try { rows = JSON.parse(str(f, "rows")); } catch { return go(a.base, "/uploads", "error=file"); }
  if (!Array.isArray(rows) || !rows.length) go(a.base, "/uploads", "error=empty");
  if (rows.length > 5000) go(a.base, "/uploads", "error=too_big");
  const meta = { source: SOURCE.has(str(f, "source")) ? str(f, "source") : "mapped", session_type: SESSION.has(str(f, "session_type")) ? str(f, "session_type") : "bullpen",
    session_date: str(f, "session_date"), file_name: str(f, "file_name").slice(0, 200), warnings: (() => { try { const w = JSON.parse(str(f, "warnings") || "[]"); return Array.isArray(w) ? w.slice(0, 20).map(String) : []; } catch { return []; } })() };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.session_date)) go(a.base, "/uploads", "error=date");
  const sb = await getServerSupabase();
  const sig = str(f, "template_sig"), tname = str(f, "template_name");
  if (sig && tname) {
    let map: Record<string, string> = {};
    try { map = JSON.parse(str(f, "template_map")); } catch {}
    await sb.rpc("pc_template_save", { p: a.team.team_id, template_name: tname, sig, map });
  }
  const { data: id, error } = await sb.rpc("pc_upload_add", { p: a.team.team_id, pitcher: a.pitcher.id, meta, pitches: rows });
  if (error || !id) go(a.base, "/uploads", `error=${/50 uploads/.test(error?.message || "") ? "daily" : /date/.test(error?.message || "") ? "date" : /locked|can't upload/.test(error?.message || "") ? "not_allowed" : "upload"}`);
  await refreshProposals(a.team.team_id, a.pitcher, await teamToday(a.team.timezone));
  go(a.base, `/uploads/${id}`, "ok=uploaded");
}

// the review form: every pitch's include/exclude, reason and developing, as they are now on the page
export async function reviewUpload(f: FormData) {
  const a = await ctx(f);
  const upload = str(f, "upload");
  if (!/^[0-9a-f-]{36}$/.test(upload)) go(a.base, "/uploads", "error=missing");
  const n = Math.min(5000, Math.max(0, Number(str(f, "n")) || 0));
  const changes = [];
  for (let i = 0; i < n; i++) {
    if (!f.has(`seen_${i}`)) continue;
    const excluded = f.get(`ex_${i}`) === "on", reason = str(f, `reason_${i}`);
    changes.push({ idx: i, excluded, reason: excluded && REASON.has(reason) ? reason : null, developing: f.get(`dev_${i}`) === "on" });
  }
  const sb = await getServerSupabase();
  const { error } = await sb.rpc("pc_upload_review", { upload, changes });
  if (error) go(a.base, `/uploads/${upload}`, "error=review");
  await refreshProposals(a.team.team_id, a.pitcher, await teamToday(a.team.timezone));
  go(a.base, `/uploads/${upload}`, "ok=reviewed");
}

export async function deleteUpload(f: FormData) {
  const a = await ctx(f);
  if (f.get("confirm") !== "on") go(a.base, `/uploads/${str(f, "upload")}`, "error=confirm");
  const sb = await getServerSupabase();
  const { error } = await sb.rpc("pc_upload_delete", { upload: str(f, "upload") });
  if (error) go(a.base, "/uploads", "error=delete");
  await refreshProposals(a.team.team_id, a.pitcher, await teamToday(a.team.timezone));
  go(a.base, "/uploads", "ok=deleted");
}

export async function decideProposal(f: FormData) {
  const a = await ctx(f);
  const id = Number(str(f, "proposal")), accept = str(f, "accept") === "yes";
  if (!Number.isSafeInteger(id)) go(a.base, "/uploads", "error=missing");
  const sb = await getServerSupabase();
  const { error } = await sb.rpc("pc_proposal_decide", { proposal: id, accept });
  go(a.base, "/uploads", error ? `error=${/already/.test(error.message) ? "decided" : /arsenal/.test(error.message) ? "pitch_gone" : "decide"}` : accept ? "ok=accepted" : "ok=rejected");
}
