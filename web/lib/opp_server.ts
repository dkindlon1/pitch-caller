import "server-only";
import { getServerSupabase } from "./supabase/server";
import type { FieldDef } from "./opp_model.ts";

// The organization's custom field definitions, as the signed-in coach (row level security: its coaches and its owner).
export async function defsFor(org: string): Promise<FieldDef[]> {
  const sb = await getServerSupabase();
  const { data } = await sb.from("opp_fields").select("id, scope, kind, label, options, position, archived_at").eq("org_id", org).order("position");
  return (data || []) as FieldDef[];
}
