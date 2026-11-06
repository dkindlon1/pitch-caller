"use server";
import { redirect } from "next/navigation";
import { adminOnly } from "./lib";

// Support: hand an organization to one of its coaches when its owner can't (pc_admin_transfer_owner, logged with
// the reason).
export async function transferOwner(f: FormData) {
  const org = String(f.get("org") || "");
  if (!/^[0-9a-f-]{36}$/.test(org)) redirect("/admin");
  const { sb } = await adminOnly(`/admin/org/${org}`);
  const { error } = await sb.rpc("pc_admin_transfer_owner", { org, new_owner_email: String(f.get("email") || "").trim(), reason: String(f.get("reason") || "").trim() });
  redirect(`/admin/org/${org}?${error ? `error=${/reason/.test(error.message) ? "reason" : /coach/.test(error.message) ? "not_coach" : "transfer"}` : "ok=transferred"}`);
}
