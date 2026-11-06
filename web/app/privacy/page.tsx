import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "../components/Mark";

export const metadata: Metadata = { title: "Privacy | PitchIQ Baseball" };

export default function Privacy() {
  return (
    <>
      <div className="doc-page day">
      <header className="nav nav-day">
        <div className="wrap nav-row">
          <Link href="/" className="brand" aria-label="PitchIQ home"><Mark /><span>PitchIQ</span></Link>
        </div>
      </header>
      <main className="doc wrap">
        <h1>Privacy on the waitlist</h1>
        <p>This page covers the spring waitlist only. The PitchIQ app will have its own privacy policy before it opens.</p>
        <h2>What we keep</h2>
        <p>
          Your email address, whether you are a coach, parent, player or something else, the level you picked, and when you
          signed up. We also keep a one-way scrambled code made from your network address, only to stop automated
          sign-ups; the address itself is never stored.
        </p>
        <h2>What we do with it</h2>
        <p>
          We send one email when teams can sign up. We don&apos;t sell it, share it or use it for ads, and this site has no
          tracking cookies.
        </p>
        <h2>How long we keep it</h2>
        <p>
          Until that email goes out, then for 12 months so we can answer questions about it, and then we delete it. Ask any
          time and we delete it sooner.
        </p>
        <h2>Children</h2>
        <p>
          The waitlist isn&apos;t for children under 13. A parent signs up instead. If we learn a child under 13 signed up,
          we delete it.
        </p>
        <p><Link href="/">Back to PitchIQ</Link></p>
      </main>
      </div>
    </>
  );
}
