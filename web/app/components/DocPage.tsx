import Link from "next/link";
import { siteFonts } from "../(marketing)/fonts";
import { Mark } from "../(marketing)/_components/Mark";
import "../(marketing)/site.css";
import "../(marketing)/sections.css";

// The plain page the Terms and Privacy Policy are set in: the public site's ground, type and mark, and nothing else.
export function DocPage({ children }: { children: React.ReactNode }) {
  return (
    <div className={`pq pq-docpage ${siteFonts}`}>
      <a className="pq-skip" href="#main">Skip to content</a>
      <header className="pq-doc-head">
        <div className="pq-wrap"><Link href="/" className="pq-brand" aria-label="PitchIQ home"><Mark /><span>PitchIQ</span></Link></div>
      </header>
      <main id="main" className="pq-doc pq-wrap">{children}</main>
      <footer className="pq-doc-foot">
        <div className="pq-wrap"><span>© 2026 PitchIQ</span><span><Link className="pq-link" href="/">Home</Link> · <Link className="pq-link" href="/terms">Terms</Link> · <Link className="pq-link" href="/privacy">Privacy</Link></span></div>
      </footer>
    </div>
  );
}
