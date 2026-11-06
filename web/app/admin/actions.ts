"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { runLapse } from "@/lib/exports";
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

// Support: send a locked organization's lapse exports again: anyone who didn't get theirs, and any email that failed.
// The admin check and the audit entry are pc_admin_exports'; the files are built with the server key.
export async function resendExports(f: FormData) {
  const org = String(f.get("org") || "");
  if (!/^[0-9a-f-]{36}$/.test(org)) redirect("/admin");
  const { sb } = await adminOnly(`/admin/org/${org}`);
  const { error } = await sb.rpc("pc_admin_exports", { org, resend: true });
  if (error) redirect(`/admin/org/${org}?error=${/locked/.test(error.message) ? "not_locked" : "resend"}`);
  const h = await headers();
  const site = process.env.SITE_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "http"}://${h.get("host")}`;
  let ok = true;
  try { await runLapse({ org }, site); } catch (e) { ok = false; console.error("resend exports", org, (e as Error).message); }
  redirect(`/admin/org/${org}?${ok ? "ok=resent" : "error=resend"}`);
}
