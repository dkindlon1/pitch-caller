"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSupabase, getUser } from "@/lib/supabase/server";
import { inviteToParent } from "@/lib/supabase/admin";
import { AGE_COOKIE, ageAnswer } from "@/lib/age";

const TOKEN = /^[0-9a-f]{64}$/;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const tokenOf = (f: FormData) => { const t = str(f, "token"); if (!TOKEN.test(t)) redirect("/login"); return t; };
const to = (t: string, q: string) => redirect(`/join/${t}?${q}`);

// Signed out: the age question, before any account. 13 or older goes on to sign in or make an account; under 13
// goes to the parent's-email form. Only the answer's direction is kept, in a one-day cookie.
export async function answerAge(form: FormData) {
  const token = tokenOf(form);
  const a = ageAnswer(Number(str(form, "birth_month")), Number(str(form, "birth_year")));
  if (!a) to(token, "error=birth");
  (await cookies()).set(AGE_COOKIE, a as string, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 86400, path: "/" });
  if (a === "13plus") redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);
  to(token, "");
}

// Signed out and under 13: the invite moves to a parent's email. Nothing of the child's is collected.
export async function sendToParent(form: FormData) {
  const token = tokenOf(form);
  let status = "";
  try { status = await inviteToParent(token, str(form, "parent_email")); }
  catch (e) { to(token, `error=${e instanceof Error && ["expired", "coach_invite", "email_invite"].includes(e.message) ? e.message : "failed"}`); }
  if (status === "parent_email_required") to(token, "error=parent_email");
  to(token, `done=${status === "for_parent" ? "for_parent" : "parent_invite_sent"}`);
}

const CODES: [RegExp, string][] = [
  [/expired or was already used/, "expired"],
  [/different email/, "other_email"],
  [/consent first/, "consent"],
  [/only the parent who gave consent/, "other_parent"],
  [/already on this team's staff/, "already_staff"],
  [/on this team as a player/, "already_player"],
  [/already has an account/, "pitcher_taken"],
  [/waiting for a coach/, "waiting"],
  [/from their own account/, "self_parent"],
];

// Signed in: accept. A parent accepting a child's invite gives consent in the same step. A player who says he's under
// 13 isn't linked: the invite moves to the parent's email he gives.
export async function accept(form: FormData) {
  const token = tokenOf(form);
  if (!(await getUser())) redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);
  const sb = await getServerSupabase();
  if (str(form, "consent") === "yes") {
    const { error } = await sb.rpc("pc_record_guardian_consent", { tok: token, method: "web_checkbox_v1" });
    if (error) to(token, `error=${(CODES.find(([re]) => re.test(error.message)) || [null, "failed"])[1]}`);
  }
  const under13 = str(form, "under13");
  if (form.has("under13") && under13 !== "yes" && under13 !== "no") to(token, "error=age");
  const { data, error } = await sb.rpc("pc_accept_invite", { tok: token, declares_under13: under13 === "yes", parent_email: str(form, "parent_email") || null });
  if (error) to(token, `error=${(CODES.find(([re]) => re.test(error.message)) || [null, "failed"])[1]}`);
  const r = data as { status: string; team_id?: string };
  if (r.status === "parent_email_required") to(token, "error=parent_email");
  if (r.status === "parent_invite_sent") to(token, "done=parent_invite_sent");
  redirect("/app");
}
