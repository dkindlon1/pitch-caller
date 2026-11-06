import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { Shell } from "../../shell";
import { createOrganization } from "../billing/actions";

export const metadata: Metadata = { title: "Start your organization · PitchIQ", robots: { index: false } };
type Search = Promise<Record<string, string | string[] | undefined>>;
const ERROR: Record<string, string> = {
  name: "Your organization needs a name.", too_many: "Up to 20 teams at sign-up: add more later on the billing page.",
  org: "That couldn't be saved. Try again in a moment.",
};

export default function NewOrg({ searchParams }: { searchParams: Search }) {
  return (
    <Shell title="Start your organization" actions={<Link href="/app" className="shell-btn text">Your teams</Link>}>
      <Suspense fallback={<p className="shell-note">Loading…</p>}><Body searchParams={searchParams} /></Suspense>
    </Shell>
  );
}

async function Body({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  if (!(await getUser())) redirect("/login?next=/app/new");
  const e = ERROR[String(sp.error || "")];
  return (
    <>
      {e ? <p className="shell-alert" role="alert">{e}</p> : null}
      <p className="shell-note">A school, club or program. You pay per team, yearly, by card. Add coaches and players once it&apos;s on.</p>
      <form action={createOrganization} className="shell-form" aria-label="New organization">
        <label>Organization name<input name="name" required maxLength={120} placeholder="Lakeside High Baseball" /></label>
        <label>Level<select name="level" defaultValue="hs">
          <option value="hs">High school</option><option value="travel">Travel ball</option>
          <option value="college_d3">College D3</option><option value="college_d1">College D1</option><option value="mlb">Pro</option>
        </select></label>
        <label>Teams, one per line (blank: one team with the organization&apos;s name)<textarea name="teams" rows={3} placeholder={"Varsity\nJV"} /></label>
        <label>You, on the first team<select name="role" defaultValue="head">
          <option value="head">Head coach</option><option value="pitching">Pitching coach</option><option value="caller">Pitch caller</option>
          <option value="">Not on the staff (I just pay)</option>
        </select></label>
        <button type="submit" className="shell-btn primary">Continue to payment</button>
        <p className="shell-note small">Payment is by Stripe Checkout.{process.env.STRIPE_COUPON_ID ? " Your first year is discounted." : ""}</p>
      </form>
    </>
  );
}
