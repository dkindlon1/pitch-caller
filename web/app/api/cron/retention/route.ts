import { timingSafeEqual } from "node:crypto";
import { removeExports } from "@/lib/exports";
import { serviceRpc } from "@/lib/supabase/admin";

// The 12-month retention sweep (spec: "Billing and lockout": data is kept 12 months after a lapse, then deleted).
// Vercel runs it daily (vercel.json) with "Authorization: Bearer $CRON_SECRET". It only reports what is due until
// RETENTION_DELETE=on is set: nothing is deleted before Drew turns that on. When it does delete, the export files go
// from storage first, then the rows (so a storage failure leaves everything in place to try again tomorrow).
export const maxDuration = 300;
type Sweep = { dry: boolean; cutoff: string; orgs: string[]; teams: number; exports: number; paths: string[] };
const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(request.headers.get("authorization") || ""), want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return reply({ error: "not_configured" }, 503);
  if (!authorized(request)) return reply({ error: "unauthorized" }, 401);
  try {
    const due = await serviceRpc<Sweep>("pc_retention_sweep", { dry: true });
    const report = { cutoff: due.cutoff, orgs: due.orgs.length, teams: due.teams, exports: due.exports, files: due.paths.length };
    if (process.env.RETENTION_DELETE !== "on") {
      if (due.orgs.length || due.exports) console.log("retention: due but not deleted (RETENTION_DELETE is off)", report);
      return reply({ deleted: false, ...report });
    }
    await removeExports(due.paths);
    const done = await serviceRpc<Sweep>("pc_retention_sweep", { dry: false });
    // anything that became due between the two calls
    const extra = done.paths.filter((x) => !due.paths.includes(x));
    if (extra.length) await removeExports(extra);
    console.log("retention: deleted", { orgs: done.orgs.length, teams: done.teams, exports: done.exports, files: due.paths.length + extra.length });
    return reply({ deleted: true, cutoff: done.cutoff, orgs: done.orgs.length, teams: done.teams, exports: done.exports, files: due.paths.length + extra.length });
  } catch (e) {
    console.error("retention sweep failed", (e as Error).message);
    return reply({ error: "failed" }, 500);
  }
}
