import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "../components/DocPage";
import { LEGAL_VERSION } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy | PitchIQ Baseball" };

export default function Privacy() {
  return (
    <DocPage>
      <h1>Privacy</h1>
      <p className="doc-note">Working draft, version {LEGAL_VERSION}. A lawyer reviews this before PitchIQ opens to teams.</p>
      <h2>What we keep</h2>
      <p>
        For an account: its email address, its password (stored by our sign-in provider, scrambled so nobody can read it), and when it agreed to
        these terms. For a team: its roster, each pitcher&apos;s profile and arsenal, the games called in PitchIQ (every pitch, its call and what
        happened), scouting notes on opposing hitters, pitch files uploaded from TrackMan or Rapsodo, and every change to a pitch&apos;s grade.
      </p>
      <h2>Who sees it</h2>
      <p>
        A team&apos;s coaches see its data, as far as their role allows. A player sees his own data and nothing of his teammates&apos;. The
        organization&apos;s owner manages billing. PitchIQ&apos;s staff look at an organization only to support it, and each look is logged.
      </p>
      <h2>Players under 13</h2>
      <p>
        A player under 13 has no account of his own: a parent or guardian makes one and agrees first. Until a parent agrees, we keep only a
        placeholder for him. A parent can see and delete his data at any time, and that deletion is final. His data isn&apos;t included in the
        coaches&apos; exports.
      </p>
      <h2>Who we use</h2>
      <p>
        Supabase stores the data and runs sign-in; Vercel hosts the site; Stripe takes payments (we never see card numbers); Resend sends
        email. Each handles the data only to provide its service to us.
      </p>
      <h2>What we don&apos;t do</h2>
      <p>We don&apos;t sell data, share it for advertising, or use tracking cookies. The only cookies keep you signed in.</p>
      <h2>How long we keep it</h2>
      <p>
        While the team subscribes. If its subscription lapses, the data is kept for 12 months so it all comes back when the team pays again,
        then deleted. The exports emailed at a lapse are kept for the same 12 months. Ask and we delete your data sooner.
      </p>
      <h2>The spring waitlist</h2>
      <p>
        If you joined the waitlist, we keep your email, your role and level, when you signed up, and a one-way scrambled code made from your
        network address to stop automated sign-ups (the address itself isn&apos;t stored). We send one email when teams can sign up, keep it 12
        months after that, then delete it. The waitlist isn&apos;t for children under 13.
      </p>
      <p><Link href="/terms">Terms</Link> · <Link href="/">Back to PitchIQ</Link></p>
    </DocPage>
  );
}
