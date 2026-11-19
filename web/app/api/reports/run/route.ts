import { timingSafeEqual } from "node:crypto";
import { runReports } from "@/lib/report_jobs";

// Builds and emails the outing reports and final recaps that are due (lib/report_jobs.ts).
// - POST from the game app right after a sync sends something up (app/roster.js reportsReady), with the signed-in
//   coach's own access token: only a member of that team can start it, and it runs for that team only.
// - GET from Vercel's daily cron with "Authorization: Bearer $CRON_SECRET": every team, so a report the app's call
//   missed (a closed tab, a dropped connection) still goes out.
// Running twice is safe: each email is claimed in report_mail before it's sent.
export const maxDuration = 300;
const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const site = (request: Request) => process.env.SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(request.headers.get("authorization") || ""), want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return reply({ error: "not_configured" }, 503);
  if (!cronAuthorized(request)) return reply({ error: "unauthorized" }, 401);
  try { return reply(await runReports(site(request))); }
  catch (e) { console.error("reports run failed", (e as Error).message); return reply({ error: "failed" }, 500); }
}

export async function POST(request: Request) {
  const url = process.env.SUPABASE_URL, pub = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !pub) return reply({ error: "not_configured" }, 503);
  const token = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  const body = (await request.json().catch(() => null)) as { team?: unknown } | null;
  const team = typeof body?.team === "string" && /^[0-9a-f-]{36}$/.test(body.team) ? body.team : null;
  if (!token || !team) return reply({ error: "bad_request" }, 400);
  // the caller's own teams, as the caller (his token): a coach or player on this team may start its run
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/pc_my_teams`, { method: "POST", cache: "no-store",
    headers: { apikey: pub, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });
  if (!res.ok) return reply({ error: "unauthorized" }, 401);
  const teams = (await res.json().catch(() => [])) as { team_id: string; role: string | null; active: boolean }[];
  if (!teams.some((t) => t.team_id === team && t.role && t.active)) return reply({ error: "forbidden" }, 403);
  try { return reply(await runReports(site(request), team)); }
  catch (e) { console.error("reports run failed", (e as Error).message); return reply({ error: "failed" }, 500); }
}
