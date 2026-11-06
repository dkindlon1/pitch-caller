import "server-only";
import { notFound, redirect } from "next/navigation";
import { getServerSupabase, getUser } from "@/lib/supabase/server";

// The super admin (spec: "Super admin", D13). Every read and action goes through a pc_admin_ function that checks the
// caller and writes to admin_audit; none of them returns pitch data. Anyone else gets a 404, not a hint.
export async function adminOnly(next: string) {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const sb = await getServerSupabase();
  const { data } = await sb.rpc("pc_is_admin");
  if (data !== true) notFound();
  return { user, sb };
}
export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) : "");
export const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "");
export const STATUS: Record<string, string> = { active: "Active", locked: "Locked", pending: "Not paid yet" };
