"use server";
import { hasAccepted } from "@/lib/legal";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSupabase, getUser } from "@/lib/supabase/server";
import { billingConfigured, billingIds, checkoutUrl, portalUrl, setQuantity } from "@/lib/billing";

// The owner's billing actions. Each checks ownership as the signed-in user (pc_billing_info raises for anyone else),
// asks Stripe, and goes back to the page with a code for a fixed message. Stripe's answer reaches the database only
// through the webhook, except removing a team, which is the owner's own change (A5).
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LEVELS = new Set(["hs", "travel", "college_d3", "college_d1", "mlb"]);
const PRESETS = new Set(["head", "pitching", "caller", "viewer"]);
const back = (org: string, q: string): never => redirect(`/app/billing?org=${org}${q ? "&" + q : ""}`);

async function origin() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") || "http"}://${h.get("host")}`;
}

type Info = { status: string; live: boolean; has_customer: boolean; teams: { id: string; status: string }[] };
async function owned(f: FormData): Promise<{ org: string; info: Info }> {
  const org = str(f, "org");
  if (!UUID.test(org)) redirect("/app");
  if (!(await getUser())) redirect(`/login?next=/app/billing`);
  const sb = await getServerSupabase();
  const { data, error } = await sb.rpc("pc_billing_info", { org });
  if (error || !data) redirect("/app");
  return { org, info: data as Info };
}

// ---------------------------------------------------------------- signing up
export async function createOrganization(f: FormData) {
  if (!(await getUser())) redirect("/login?next=/app/new");
  if (!(await hasAccepted(await getServerSupabase()))) redirect("/app/new?error=agree");
  const name = str(f, "name").slice(0, 120), level = LEVELS.has(str(f, "level")) ? str(f, "level") : null;
  const role = PRESETS.has(str(f, "role")) ? str(f, "role") : null;
  if (!name) redirect("/app/new?error=name");
  const teams = [...new Set(str(f, "teams").split(/\r?\n/).map((x) => x.trim().slice(0, 120)).filter(Boolean))];
  if (teams.length > 20) redirect("/app/new?error=too_many");
  if (!teams.length) teams.push(name);
  const sb = await getServerSupabase();
  const { data: org, error } = await sb.rpc("pc_create_org", { name, level });
  if (error || !org) redirect("/app/new?error=org");
  for (const [i, t] of teams.entries()) {
    // the owner coaches the first team if he said so; he can join the others later
    const { error: e } = await sb.rpc("pc_create_team", { org, name: t, level, timezone: "America/New_York", join_as: i === 0 ? role : null });
    if (e) back(org as string, "error=team");
  }
  if (!billingConfigured()) back(org as string, "error=not_configured");
  let url: string;
  try { url = await checkoutUrl(org as string, await origin()); } catch { return back(org as string, "error=stripe"); }
  redirect(url);
}

// ---------------------------------------------------------------- paying
export async function startCheckout(f: FormData) {
  const { org, info } = await owned(f);
  if (info.live) back(org, "error=live");
  let url: string;
  try { url = await checkoutUrl(org, await origin()); } catch (e) { return back(org, `error=${(e as Error).message === "no_teams" ? "no_teams" : "stripe"}`); }
  redirect(url);
}

export async function openPortal(f: FormData) {
  const { org, info } = await owned(f);
  if (!info.has_customer) back(org, "error=no_customer");
  let url: string;
  try { url = await portalUrl(org, await origin()); } catch { return back(org, "error=stripe"); }
  redirect(url);
}

// ---------------------------------------------------------------- teams
export async function addTeam(f: FormData) {
  const { org, info } = await owned(f);
  if (info.status === "locked") back(org, "error=locked");
  const name = str(f, "name").slice(0, 120);
  if (!name) back(org, "error=team_name");
  const sb = await getServerSupabase();
  const { data: lvl } = await sb.from("organizations").select("level").eq("id", org).single();
  const { error } = await sb.rpc("pc_create_team", { org, name, level: lvl?.level ?? null, timezone: "America/New_York", join_as: null });
  if (error) back(org, "error=team");
  // not paying yet: the new team goes into the first Checkout. Paying: charge it now, for the rest of the year.
  if (!info.live) back(org, "ok=team_waiting");
  try {
    const ids = await billingIds(org);
    await setQuantity(org, ids.seats, "now");
  } catch { return back(org, "error=payment"); }
  back(org, "ok=team_adding");
}

// a team that's waiting (an added team whose charge didn't go through): try the charge again
export async function payWaiting(f: FormData) {
  const { org, info } = await owned(f);
  if (!info.live || info.status === "locked") back(org, "error=locked");
  try { const ids = await billingIds(org); await setQuantity(org, ids.seats, "now"); } catch { return back(org, "error=payment"); }
  back(org, "ok=team_adding");
}

export async function removeTeam(f: FormData) {
  const { org, info } = await owned(f);
  if (f.get("confirm") !== "on") back(org, "error=confirm");
  const team = str(f, "team");
  if (!info.teams.some((t) => t.id === team)) back(org, "error=missing");
  const sb = await getServerSupabase();
  const { data: became, error } = await sb.rpc("pc_end_team", { team });
  if (error) back(org, `error=${/last team/.test(error.message) ? "last_team" : /locked/.test(error.message) ? "locked" : /paid year/.test(error.message) ? "not_yet" : "remove"}`);
  if (became === "ending") {
    try { const ids = await billingIds(org); await setQuantity(org, ids.active, "next_year"); }
    catch { await sb.rpc("pc_keep_team", { team }); return back(org, "error=stripe"); }   // Stripe didn't change: undo
  }
  back(org, `ok=${became === "ending" ? "team_ending" : "team_removed"}`);
}

export async function keepTeam(f: FormData) {
  const { org } = await owned(f);
  const team = str(f, "team");
  const sb = await getServerSupabase();
  const { error } = await sb.rpc("pc_keep_team", { team });
  if (error) back(org, `error=${/locked/.test(error.message) ? "locked" : "keep"}`);
  // already paid for this year: no charge, just back in next year's count
  try { const ids = await billingIds(org); await setQuantity(org, ids.active, "next_year"); }
  catch { await sb.rpc("pc_end_team", { team }); return back(org, "error=stripe"); }
  back(org, "ok=team_kept");
}
