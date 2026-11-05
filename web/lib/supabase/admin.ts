import "server-only";

// The one call the website makes with the server key: moving a player's invite to a parent before the child has an
// account (pc_invite_to_parent, executable by service_role only). The key never leaves the server.
export async function inviteToParent(token: string, parentEmail: string): Promise<string> {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("not_configured");
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/pc_invite_to_parent`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ tok: token, parent_email: parentEmail }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json && json.code === "P0002" ? "expired" : json && json.code === "22023" ? "coach_invite" : "failed");
  return (json && json.status) || "failed";
}
