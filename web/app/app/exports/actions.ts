"use server";
import { redirect } from "next/navigation";
import { getServerSupabase, getUser } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/exports";

// A fresh 10-minute link to one of his own exports. Row-level security decides whether it's his: another person's id
// finds nothing.
export async function downloadExport(form: FormData) {
  const user = await getUser();
  if (!user) redirect("/login?next=/app/exports");
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect("/app/exports?error=missing");
  const sb = await getServerSupabase();
  const { data } = await sb.from("exports").select("path").eq("id", id).maybeSingle();
  if (!data) redirect("/app/exports?error=missing");
  let url: string;
  try { url = await signedUrl(data.path, 600); } catch { redirect("/app/exports?error=failed"); }
  redirect(url);
}
