"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getServerSupabase } from "@/lib/supabase/server";
import { askParent } from "@/lib/report_jobs";

// A pitcher's public recap link (PLAN_reports_recap 4): made, changed and turned off as the signed-in player through
// the database's own functions, which check he's that pitcher. Under 18, the link stays off until his parent's account
// approves it; making it emails the parent.
const ID = /^[0-9a-f-]{36}$/, TOK = /^[0-9a-f]{64}$/, PID = /^[\w-]{1,200}$/;
async function site() {
  const h = await headers();
  return process.env.SITE_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "http"}://${h.get("host")}`;
}
const back = (team: string, pitcher: string, season: string) => `/app/me/${team}/${pitcher}/recap${season ? `/${season}` : ""}`;

export async function createShare(form: FormData) {
  const team = String(form.get("team") || ""), pitcher = String(form.get("pitcher") || ""), season = String(form.get("season") || "");
  if (!ID.test(team) || !PID.test(pitcher) || (season && !ID.test(season))) return;
  const sb = await getServerSupabase();
  const { data: tok, error } = await sb.rpc("pc_share_create", { p: team, pitcher, season: season || null });
  if (error || typeof tok !== "string") return;
  // under 18 and not live yet: ask the parent (once per link)
  const { data: live } = await sb.rpc("pc_public_recap", { tok });
  if (!live) await askParent(await site(), team, pitcher, tok).catch(() => false);
  revalidatePath(back(team, pitcher, season));
}

export async function saveSections(form: FormData) {
  const tok = String(form.get("token") || ""), team = String(form.get("team") || ""), pitcher = String(form.get("pitcher") || ""), season = String(form.get("season") || "");
  if (!TOK.test(tok) || !ID.test(team) || !PID.test(pitcher)) return;
  const secs = { summary: form.get("summary") === "on", heat: form.get("heat") === "on", pitches: form.get("pitches") === "on", outings: form.get("outings") === "on" };
  const sb = await getServerSupabase();
  await sb.rpc("pc_share_sections", { tok, secs });
  revalidatePath(back(team, pitcher, season));
}

export async function revokeShare(form: FormData) {
  const tok = String(form.get("token") || ""), path = String(form.get("path") || "");
  if (!TOK.test(tok)) return;
  const sb = await getServerSupabase();
  await sb.rpc("pc_share_revoke", { tok });
  if (path.startsWith("/app/")) revalidatePath(path);
}

// the parent's switch
export async function approveShare(form: FormData) {
  const tok = String(form.get("token") || ""), approve = form.get("approve") === "1";
  if (!TOK.test(tok)) return;
  const sb = await getServerSupabase();
  await sb.rpc("pc_share_approve", { tok, approve });
  revalidatePath("/app/approve");
}
