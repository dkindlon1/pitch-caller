import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { siteFonts } from "./(marketing)/fonts";
import { Mark } from "./(marketing)/_components/Mark";
import "./(marketing)/site.css";
import "./(marketing)/sections.css";

export const metadata: Metadata = { title: "Page not found | PitchIQ", robots: { index: false } };
export const viewport: Viewport = { themeColor: "#0c0b0e", colorScheme: "dark" };

// Any address that isn't a page: the public site's ground and type, one line, and the way back.
export default function NotFound() {
  return (
    <div className={`pq pq-docpage ${siteFonts}`}>
      <header className="pq-doc-head">
        <div className="pq-wrap"><Link href="/" className="pq-brand" aria-label="PitchIQ home"><Mark /><span>PitchIQ</span></Link></div>
      </header>
      <main id="main" className="pq-lost pq-wrap">
        <p className="pq-lost-n" aria-hidden="true">404</p>
        <h1>That one got away.</h1>
        <p>There&rsquo;s no page at this address. It may have moved, or the link may be wrong.</p>
        <p className="pq-lost-go"><Link className="pq-cta" href="/">Back to PitchIQ</Link><Link className="pq-link" href="/login">Sign in</Link></p>
      </main>
    </div>
  );
}
