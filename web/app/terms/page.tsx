import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "../components/DocPage";
import { CONTACT_EMAIL, CONTACT_TEXT, LEGAL_VERSION } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms | PitchIQ Baseball" };

export default function Terms() {
  return (
    <DocPage>
      <h1>Terms</h1>
      <p className="doc-note">Working draft, version {LEGAL_VERSION}. A lawyer reviews these before PitchIQ opens to teams; you&apos;ll be asked to agree again if they change.</p>
      <h2>What PitchIQ is</h2>
      <p>
        PitchIQ suggests which pitch to throw and where, from what you tell it about your pitchers, the hitters and the game. Its calls are
        suggestions. The coach on the field decides, and PitchIQ doesn&apos;t promise any result.
      </p>
      <h2>Accounts</h2>
      <p>
        You need to be 13 or older to make an account. A player under 13 uses an account a parent or guardian makes and agrees to on their
        behalf. Keep your password to yourself: what&apos;s done with your account is yours.
      </p>
      <h2>Teams and billing</h2>
      <p>
        An organization (a school, club or program) pays for each of its teams once a year, by card, through Stripe. The first year may be
        discounted. The subscription renews each year until the owner cancels it in the billing portal; it then ends with the paid year.
        A team removed partway through the year stays usable until the paid year ends, and that year isn&apos;t refunded.
      </p>
      <p>
        If a payment fails or the subscription ends, every team locks. Each coach is emailed the team&apos;s data and each player his own,
        and the owner can still open the billing page to fix the card. Paying again unlocks everything. Locked data is kept for 12 months,
        then deleted.
      </p>
      <h2>Your data</h2>
      <p>
        Your team&apos;s data stays yours. We use it to run PitchIQ for your team, including tuning the engine to your pitchers. We don&apos;t
        sell it or show ads. The <Link href="/privacy">Privacy Policy</Link> says what we keep and who sees it.
      </p>
      <h2>Using it fairly</h2>
      <p>
        Use PitchIQ for your own teams. Don&apos;t try to read other teams&apos; data, get around the limits on accounts and teams, or disrupt the
        service.
      </p>
      <h2>League rules</h2>
      <p>
        Some leagues limit electronic devices in the dugout during games. Following your league&apos;s rules (high school, NCAA or other) is up
        to you; PitchIQ also works for bullpens, scrimmages and game prep.
      </p>
      <h2>Availability and changes</h2>
      <p>
        We work to keep PitchIQ running, and the game app keeps working on the iPad without a signal. We may change or add features. If these
        Terms change in a way that matters, we&apos;ll tell owners first and ask everyone to agree again.
      </p>
      <h2>Ending</h2>
      <p>
        An owner can cancel any time in the billing portal. We may close an account that breaks these Terms. Either way, the data is kept for
        12 months unless you ask us to delete it sooner.
      </p>
      <h2>Contact</h2>
      <p>Questions, or a request to see or delete your data: {CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : CONTACT_TEXT}.</p>
      <p><Link href="/">Back to PitchIQ</Link></p>
    </DocPage>
  );
}
