import "server-only";
import type { PublicRecap } from "./report_fetch.ts";

// A public recap link, read for a signed-out visitor. pc_public_recap isn't callable signed out (no pc_ function is
// anon's), so the website's server calls it with the service key; it still returns only the sections the pitcher chose,
// and nothing for a revoked or unapproved link. The key never leaves the server.
export async function readPublicRecap(token: string): Promise<PublicRecap> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/pc_public_recap`, { method: "POST", cache: "no-store",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ tok: token }) }).catch(() => null);
  if (!res || !res.ok) return null;
  return ((await res.json().catch(() => null)) || null) as PublicRecap;
}
