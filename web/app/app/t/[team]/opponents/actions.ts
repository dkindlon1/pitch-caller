"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { hittersOf, push, teamFor, teamsOf } from "@/lib/team";
import { applyHitterScouting, cleanHitterScouting, cleanTeamScouting, type Spray } from "@/lib/opp_model.ts";
import { defsFor } from "@/lib/opp_server";

// The opponent database's writes (Build 2). Every one goes through pc_push or a checked pc_ function as the signed-in
// coach, so the database decides: coaches with "manage opponents" (or roster) edit; a viewer, a player or someone
// signed out can't. The engine's own hitter fields (grades, approach / path / off-speed tags) are never written here.
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (team: string, path: string, q: string) => redirect(`/app/t/${team}${path}${q ? (path.includes("?") ? "&" : "?") + q : ""}`);
type Doc = Record<string, unknown> & { id: string; teamId?: string; aliases?: string[]; mergedInto?: string };

async function editor(team: string) {
  const c = await teamFor(team);
  if (!c.can("manage_opponents") && !c.can("manage_roster") && !c.oppOwner) return null;
  return c;
}

export async function saveHitterScouting(f: FormData) {
  const team = str(f, "team"), opp = str(f, "opp"), hid = str(f, "hitter"), path = `/opponents/${opp}/hitters/${hid}`;
  const c = await editor(team);
  if (!c) back(team, path, "error=not_allowed");
  const h = (await hittersOf(team)).find((x) => x.id === hid) as Doc | undefined;
  if (!h || h.teamId !== opp) back(team, "/opponents", "error=missing");
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(str(f, "payload") || "{}"); } catch { back(team, path, "error=push"); }
  const s = cleanHitterScouting(payload, await defsFor(c!.team.org_id));
  const spray = ["pull", "mixed", "oppo", "unknown"].includes(String(payload.spray)) ? (payload.spray as Spray) : null;
  const r = await push(team, "hitters", [applyHitterScouting(h as Doc, s, spray)], "hit");
  back(team, path, !r.error && r.applied === 1 ? "ok=saved" : "error=push");
}

export async function decideSuggestion(f: FormData) {
  const team = str(f, "team"), opp = str(f, "opp"), sid = str(f, "suggestion"), hid = str(f, "hitter"), accept = str(f, "accept") === "1";
  const path = `/opponents/${opp}/hitters/${hid}`;
  const c = await editor(team);
  if (!c) back(team, path, "error=not_allowed");
  const sb = await getServerSupabase();
  const { data, error } = await sb.rpc("pc_opp_suggestion_decide", { p: team, suggestion: sid, accept });
  if (error) back(team, path, "error=member");
  if (accept && data) {
    const d = data as { hitter_id: string; kind: string; key: string; value: string };
    const h = (await hittersOf(team)).find((x) => x.id === d.hitter_id) as Doc | undefined;
    if (h) {
      const cur = cleanHitterScouting(h as Record<string, unknown>, await defsFor(c!.team.org_id));
      if (d.kind === "zone") cur.zone = { ...(cur.zone || {}), [d.key]: d.value as "hot" | "cold" };
      if (d.kind === "rating") cur.ratings = { ...(cur.ratings || {}), [d.key]: +d.value as 1 | 2 | 3 };
      const r = await push(team, "hitters", [applyHitterScouting(h, cur)], "hit");
      if (r.error || r.applied !== 1) back(team, path, "error=push");
    }
  }
  back(team, path, accept ? "ok=accepted" : "ok=dismissed");
}

export async function saveTeamScouting(f: FormData) {
  const team = str(f, "team"), opp = str(f, "opp");
  const c = await editor(team);
  if (!c) back(team, `/opponents/${opp}`, "error=not_allowed");
  const o = (await teamsOf(team)).find((x) => x.id === opp && !x.isOurs) as Doc | undefined;
  if (!o) back(team, "/opponents", "error=missing");
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(str(f, "payload") || "{}"); } catch { back(team, `/opponents/${opp}`, "error=push"); }
  const s = cleanTeamScouting(payload, await defsFor(c!.team.org_id));
  const next: Doc = { ...(o as Doc) };
  for (const k of ["tendencies", "custom"] as const) { if (s[k]) next[k] = s[k]; else delete next[k]; }
  const r = await push(team, "teams", [next], "tea");
  back(team, `/opponents/${opp}`, !r.error && r.applied === 1 ? "ok=saved" : "error=push");
}

// The same hitter entered twice: the kept one takes the other's id (and its earlier aliases) so his history and
// suggestions follow; the duplicate is marked merged and soft-deleted, so every iPad drops it. Events aren't rewritten.
export async function mergeHitters(f: FormData) {
  const team = str(f, "team"), opp = str(f, "opp"), keep = str(f, "keep"), drop = str(f, "drop");
  if (!(await editor(team))) back(team, `/opponents/${opp}`, "error=not_allowed");
  if (!keep || !drop || keep === drop) back(team, `/opponents/${opp}`, "error=merge_same");
  const hs = (await hittersOf(team)) as unknown as Doc[];
  const k = hs.find((x) => x.id === keep && x.teamId === opp), d = hs.find((x) => x.id === drop && x.teamId === opp);
  if (!k || !d) back(team, `/opponents/${opp}`, "error=missing");
  const kept: Doc = { ...k!, aliases: [...new Set([...(k!.aliases || []), drop, ...(d!.aliases || [])])] };
  // what the kept record lacks, the duplicate fills in (never overwriting)
  for (const f2 of ["ratings", "zone", "pitchFlags", "smallBall", "classYear", "custom"]) if (kept[f2] === undefined && d![f2] !== undefined) kept[f2] = d![f2];
  if (!kept.notes && d!.notes) kept.notes = d!.notes;
  const merged: Doc = { ...d!, mergedInto: keep, deletedAt: Date.now() };
  const sb = await getServerSupabase();
  const { error } = await sb.rpc("pc_opp_merge_log", { p: team, kept: keep, merged: drop });
  if (error) back(team, `/opponents/${opp}`, "error=not_allowed");
  const r = await push(team, "hitters", [kept, merged], "hit");
  back(team, `/opponents/${opp}`, !r.error && r.applied === 2 ? "ok=merged" : "error=push");
}

// Custom fields: the organization's owner sets them up (the database checks).
export async function saveField(f: FormData) {
  const team = str(f, "team"), org = str(f, "org"), id = str(f, "field") || null;
  const label = str(f, "label").slice(0, 60), kind = str(f, "kind"), scope = str(f, "scope");
  const options = str(f, "options").split(/[\n,]/).map((x) => x.trim()).filter(Boolean).slice(0, 20);
  if (!label) back(team, "/opponents/fields", "error=field_label");
  if (kind === "dropdown" && options.length < 2) back(team, "/opponents/fields", "error=field_options");
  const sb = await getServerSupabase();
  const { error } = await sb.rpc("pc_opp_field_save", { org, field: id, field_scope: scope, field_kind: kind, field_label: label, field_options: options, field_position: +(str(f, "position") || 0), archive: str(f, "archive") === "1" });
  revalidatePath(`/app/t/${team}/opponents/fields`);
  back(team, "/opponents/fields", error ? (/owner/.test(error.message) ? "error=field_owner" : "error=field") : "ok=saved");
}
