import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { setPassword } from "../../login/actions";
import { Shell } from "../../shell";

export const metadata: Metadata = { title: "New password · PitchIQ", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
// fixed messages only: the URL carries a code, never text to show
const ERRORS: Record<string, string> = {
  short: "Use a password of at least 8 characters.",
  mismatch: "The two passwords don't match.",
  failed: "That password couldn't be saved. Try a different one, or ask for a new reset link.",
};

// Where the reset email's link lands (through /auth/confirm, which signs him in), and "Change password" in the
// account menu. Signed out, the proxy sends him to sign-in first.
export default function PasswordPage({ searchParams }: { searchParams: Search }) {
  return (
    <Shell title="Set a new password">
      <Suspense fallback={null}><Body searchParams={searchParams} /></Suspense>
    </Shell>
  );
}

async function Body({ searchParams }: { searchParams: Search }) {
  const user = await getUser();
  if (!user) redirect("/login?next=/app/password");
  const sp = await searchParams, error = ERRORS[one(sp.error)];
  if (one(sp.ok) === "saved") return (
    <>
      <p className="shell-note" role="status">Your password is changed. Use it the next time you sign in.</p>
      <p><Link href="/app" className="shell-btn primary">Go to your teams</Link></p>
    </>
  );
  return (
    <>
      {error ? <p className="shell-alert" role="alert">{error}</p> : null}
      <p className="shell-note">For {user.email}.</p>
      <form action={setPassword} className="shell-form" aria-label="Set a new password">
        <label>New password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
        <label>Type it again<input name="password2" type="password" autoComplete="new-password" minLength={8} required /></label>
        <button type="submit" className="shell-btn primary">Save the new password</button>
      </form>
    </>
  );
}
