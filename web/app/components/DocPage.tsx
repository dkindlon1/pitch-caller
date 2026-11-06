import Link from "next/link";
import { Mark } from "./Mark";

// The plain page the Terms and Privacy Policy are set in.
export function DocPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="doc-page day">
      <header className="nav nav-day">
        <div className="wrap nav-row">
          <Link href="/" className="brand" aria-label="PitchIQ home"><Mark /><span>PitchIQ</span></Link>
        </div>
      </header>
      <main className="doc wrap">{children}</main>
    </div>
  );
}
