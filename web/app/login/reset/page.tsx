import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { sendReset } from "../actions";
import { Shell } from "../../shell";

export const viewport: Viewport = { themeColor: "#0c0b0e", colorScheme: "dark", width: "device-width", initialScale: 1 };
export const metadata: Metadata = { title: "Reset your password · PitchIQ", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
// fixed messages only: the URL carries a code, never text to show
const ERRORS: Record<string, string> = {
  missing_email: "Enter the email you sign in with.",
  resend_wait: "Too many emails sent for now. Wait a few minutes, then try again.",
};

// Forgot password: the email gets a link that signs him in through /auth/confirm and opens /app/password.
export default function ResetPage({ searchParams }: { searchParams: Search }) {
  return (
    <Shell title="Reset your password" auth>
      <Suspense fallback={null}><ResetForm searchParams={searchParams} /></Suspense>
    </Shell>
  );
}

async function ResetForm({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams, error = ERRORS[one(sp.error)];
  return (
    <>
      {error ? <p className="shell-alert" role="alert">{error}</p> : null}
      {one(sp.notice) === "reset_sent" ? <p className="shell-note" role="status">If that email has an account, a link to set a new password is on its way. It can take a minute, and it may land in spam.</p> : null}
      <form action={sendReset} className="shell-form" aria-label="Reset your password">
        <label>Email you sign in with<input name="email" type="email" autoComplete="username" required /></label>
        <button type="submit" className="shell-btn primary">Email me a reset link</button>
      </form>
      <p className="shell-note"><Link href="/login">Back to sign in</Link></p>
    </>
  );
}
