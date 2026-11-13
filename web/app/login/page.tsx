import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { resendConfirm, signIn, signUp } from "./actions";
import { AGE_COOKIE, MONTHS, birthYears, safeNext } from "@/lib/age";
import { Shell } from "../shell";

// the portal's own bar colour for the browser chrome (the public site keeps its own in the root layout)
export const viewport: Viewport = { themeColor: "#121316", colorScheme: "dark", width: "device-width", initialScale: 1 };

export const metadata: Metadata = { title: "Sign in · PitchIQ", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

// Fixed messages only: the URL carries a code, never text to show.
const ERRORS: Record<string, string> = {
  missing: "Enter your email and password.",
  bad_login: "That email and password don't match an account.",
  birth: "Pick the month and year you were born.",
  under13: "Players under 13 can't make their own account. A parent or guardian sets it up from the team's invite: ask your coach to send it to your parent's email.",
  short: "Use an email and a password of at least 8 characters.",
  signup_failed: "That account couldn't be made. If you already have one, sign in instead.",
  unconfirmed: "Your email isn't confirmed yet. Open the link in the email we sent you (check spam too), or get a new one below.",
  missing_email: "Enter the email you signed up with.",
  resend_wait: "Too many emails sent for now. Wait a few minutes, then try again.",
  agree: "To make an account, agree to the Terms and the Privacy Policy.",
};

export default function LoginPage({ searchParams }: { searchParams: Search }) {
  return (
    <Shell title="Sign in" auth>
      <Suspense fallback={null}>
        <LoginForms searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

async function LoginForms({ searchParams }: { searchParams: Search }) {
  await connection();   // the birth-year list reads today's date: request time only
  const sp = await searchParams;
  const next = safeNext(one(sp.next));
  const error = ERRORS[one(sp.error)];
  const signup = one(sp.mode) === "signup";
  const resend = ["unconfirmed", "missing_email", "resend_wait"].includes(one(sp.error)) || one(sp.notice) === "check_email";
  const asked = (await cookies()).get(AGE_COOKIE)?.value;
  return (
    <>
      {error ? <p className="shell-alert" role="alert">{error}</p> : null}
      {one(sp.notice) === "check_email" ? <p className="shell-note" role="status">Check your email for a link to finish making your account. It can take a minute, and it may land in spam.</p> : null}
      {one(sp.notice) === "confirm_failed" ? <p className="shell-alert" role="alert">That link didn&apos;t work (it may have been used already). Sign in, or make the account again to get a new link.</p> : null}
      <form action={signIn} className="shell-form" aria-label="Sign in">
        <input type="hidden" name="next" value={next} />
        <label>Email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button type="submit" className="shell-btn primary">Sign in</button>
      </form>
      {resend ? (
        <form action={resendConfirm} className="shell-form" aria-label="Send the confirmation email again">
          <input type="hidden" name="next" value={next} />
          <label>Email you signed up with<input name="email" type="email" autoComplete="email" required /></label>
          <button type="submit" className="shell-btn">Send the link again</button>
        </form>
      ) : null}
      <details className="shell-more" open={signup}>
        <summary>New to PitchIQ? Make an account</summary>
        <form action={signUp} className="shell-form" aria-label="Make an account">
          <input type="hidden" name="next" value={next} />
          {asked ? null : (
            <fieldset>
              <legend>When were you born?</legend>
              <label>Month<select name="birth_month" defaultValue="" required>
                <option value="" disabled>Month</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select></label>
              <label>Year<select name="birth_year" defaultValue="" required>
                <option value="" disabled>Year</option>
                {birthYears().map((y) => <option key={y} value={y}>{y}</option>)}
              </select></label>
            </fieldset>
          )}
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password (8 characters or more)<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
          <label className="check"><input name="agree" type="checkbox" required /> I agree to the <Link href="/terms" target="_blank">Terms</Link> and the <Link href="/privacy" target="_blank">Privacy Policy</Link></label>
          <button type="submit" className="shell-btn">Make account</button>
        </form>
      </details>
    </>
  );
}
