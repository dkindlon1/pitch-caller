"use server";
import { revalidatePath } from "next/cache";
import { getServerSupabase, getUser } from "@/lib/supabase/server";

// Coach notes on an outing or an at-bat. Written as the signed-in coach, so the database's row rules decide: any staff
// role but Viewer, on an active team (report_notes policies). Staff-only unless shared with the pitcher.
export type NoteState = { error?: string; ok?: number } | null;
const ID = /^[0-9a-f-]{36}$/, TXT = /^[\w-]{1,200}$/;

export async function addNote(_: NoteState, form: FormData): Promise<NoteState> {
  const team = String(form.get("team") || ""), game = String(form.get("game") || ""), pitcher = String(form.get("pitcher") || "");
  const atBat = String(form.get("at_bat") || ""), body = String(form.get("body") || "").trim(), shared = form.get("shared") === "on";
  if (!ID.test(team) || !TXT.test(game) || !TXT.test(pitcher)) return { error: "Something about this report changed. Reload the page." };
  if (!body) return { error: "Write the note first." };
  if (body.length > 4000) return { error: "Keep a note under 4,000 characters." };
  if (atBat && !/^\d{1,4}$/.test(atBat)) return { error: "Something about this at-bat changed. Reload the page." };
  const user = await getUser();
  if (!user) return { error: "Your sign-in ran out. Sign in again." };
  const sb = await getServerSupabase();
  const { error } = await sb.from("report_notes").insert({ program_id: team, game_id: game, pitcher_id: pitcher, scope: atBat ? "atbat" : "outing", at_bat: atBat || null, body, shared, author_id: user.id });
  if (error) return { error: /row-level|permission|42501/i.test(error.message) ? "Your role can read notes but not write them." : "The note didn't save. Try again." };
  revalidatePath(`/app/t/${team}/reports/${game}/${pitcher}`);
  return { ok: Date.now() };
}

export async function setNoteShared(form: FormData) {
  const id = String(form.get("id") || ""), team = String(form.get("team") || ""), path = String(form.get("path") || "");
  if (!ID.test(id) || !ID.test(team)) return;
  const sb = await getServerSupabase();
  await sb.from("report_notes").update({ shared: form.get("shared") === "1" }).eq("id", id).eq("program_id", team);
  if (path.startsWith(`/app/t/${team}/`)) revalidatePath(path);
}

export async function deleteNote(form: FormData) {
  const id = String(form.get("id") || ""), team = String(form.get("team") || ""), path = String(form.get("path") || "");
  if (!ID.test(id) || !ID.test(team)) return;
  const sb = await getServerSupabase();
  await sb.from("report_notes").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("program_id", team);
  if (path.startsWith(`/app/t/${team}/`)) revalidatePath(path);
}
