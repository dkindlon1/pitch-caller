"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { AGE_COOKIE, ageAnswer, safeNext } from "@/lib/age";
import { LEGAL_VERSION } from "@/lib/legal";
import { serviceRpc } from "@/lib/supabase/admin";

const back = (next: string, q: string) => redirect(`/login?next=${encodeURIComponent(next)}&${q}`);
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function signIn(form: FormData) {
  const next = safeNext(str(form, "next"));
  const email = str(form, "email"), password = String(form.get("password") ?? "");
  if (!email || !password) back(next, "error=missing");
  const sb = await getServerSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  // a right password on an account whose email isn't confirmed yet: say so, and offer the link again
  if (error) back(next, error.code === "email_not_confirmed" ? "error=unconfirmed" : "error=bad_login");
  redirect(next);
}

// where the confirmation email's link comes back to: /auth/confirm on this site (SITE_URL, else the address in use)
async function confirmUrl(next: string) {
  const h = await headers();
  const origin = process.env.SITE_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "http"}://${h.get("host")}`;
  return `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
}

// Send the sign-up email again. The answer is the same whether or not the address has an account; only the email
// service's own rate limit is reported.
export async function resendConfirm(form: FormData) {
  const next = safeNext(str(form, "next"));
  const email = str(form, "email");
  if (!email) back(next, "error=missing_email");
  const sb = await getServerSupabase();
  const { error } = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: await confirmUrl(next) } });
  if (error && (error.status === 429 || error.code === "over_email_send_rate_limit")) back(next, "error=resend_wait");
  back(next, "notice=check_email");
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
  if (form.get("agree") !== "on") back(next, "mode=signup&error=agree");
  const sb = await getServerSupabase();
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: await confirmUrl(next) } });
  if (error) back(next, "mode=signup&error=signup_failed");
  // the agreement, with its time (D15); if it can't be recorded now, the portal asks again
  if (data.user?.id) await serviceRpc("pc_legal_signup", { uid: data.user.id, ver: LEGAL_VERSION }).catch((e) => console.error("legal acceptance", (e as Error).message));
  if (!data.session) back(next, "notice=check_email");   // email confirmation is on: the link in it signs him in
  redirect(next);
}

export async function signOut() {
  const sb = await getServerSupabase();
  await sb.auth.signOut();
  redirect("/login");
}

// an account made before this version of the Terms: agree from the portal
export async function acceptTerms(form: FormData) {
  const next = safeNext(str(form, "next") || "/app");
  if (form.get("agree") !== "on") redirect(`${next}${next.includes("?") ? "&" : "?"}error=agree`);
  const sb = await getServerSupabase();
  const { error } = await sb.rpc("pc_legal_accept", { ver: LEGAL_VERSION });
  if (error) redirect("/login?next=" + encodeURIComponent(next));
  redirect(next);
}
