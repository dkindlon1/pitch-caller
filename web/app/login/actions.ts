"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { AGE_COOKIE, ageAnswer, safeNext } from "@/lib/age";

const back = (next: string, q: string) => redirect(`/login?next=${encodeURIComponent(next)}&${q}`);
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function signIn(form: FormData) {
  const next = safeNext(str(form, "next"));
  const email = str(form, "email"), password = String(form.get("password") ?? "");
  if (!email || !password) back(next, "error=missing");
  const sb = await getServerSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) back(next, "error=bad_login");
  redirect(next);
}

// A new account: the age question first (unless the join page already asked it today). Under 13, no account is made
// and nothing typed is kept; a parent sets it up from the invite.
export async function signUp(form: FormData) {
  const next = safeNext(str(form, "next"));
  const store = await cookies();
  let age = store.get(AGE_COOKIE)?.value;
  if (age !== "13plus" && age !== "under13") {
    const a = ageAnswer(Number(str(form, "birth_month")), Number(str(form, "birth_year")));
    if (!a) back(next, "mode=signup&error=birth");
    age = a as string;
    store.set(AGE_COOKIE, age, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 86400, path: "/" });
  }
  if (age === "under13") back(next, "mode=signup&error=under13");
  const email = str(form, "email"), password = String(form.get("password") ?? "");
  if (!email || password.length < 8) back(next, "mode=signup&error=short");
  const sb = await getServerSupabase();
  // the confirmation email's link comes back to /auth/confirm on this site (SITE_URL, else the address in use)
  const h = await headers();
  const origin = process.env.SITE_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "http"}://${h.get("host")}`;
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}` } });
  if (error) back(next, "mode=signup&error=signup_failed");
  if (!data.session) back(next, "notice=check_email");   // email confirmation is on: the link in it signs him in
  redirect(next);
}

export async function signOut() {
  const sb = await getServerSupabase();
  await sb.auth.signOut();
  redirect("/login");
}
