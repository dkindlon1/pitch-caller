import Link from "next/link";
import { ContactForm } from "./_components/ContactForm";
import { AtBat } from "./_components/AtBat";
import { Demo } from "./_components/Demo";
import { InsideCall } from "./_components/InsideCall";
import { Faq } from "./_components/Faq";
import { Program } from "./_components/Program";
import { Mark } from "./_components/Mark";
import { Nav } from "./_components/Nav";
import { WatchFilm } from "./_components/WatchFilm";
import { FiveReads } from "./_components/FiveReads";

// what search engines read about the product: no price, no ratings, only what's true on this page
const LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "PitchIQ",
  applicationCategory: "SportsApplication",
  operatingSystem: "iPadOS, Web",
  description: "Pitch calling for high school, travel and college baseball. Calls every pitch from the pitcher's stuff today, the hitter and the count, and gives the reason for it.",
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LD) }} />
      <a className="mk-skip" href="#main">Skip to content</a>
      <Nav />

      <main id="main" tabIndex={-1}>
        <WatchFilm />
        <FiveReads />
        <InsideCall />
        <AtBat />
        <Demo />
        <Program />
        <Faq />

        <section className="mk-contact" id="contact" tabIndex={-1} aria-labelledby="contact-h">
          <div className="mk-wrap mk-contact-grid">
            <div className="mk-contact-copy">
              <p className="pq-eyebrow">Contact</p>
              <h2 id="contact-h" className="pq-display">Talk <em>to us</em></h2>
              <p>Tell us about your team and what you&apos;d want help with. We read every message and write back.</p>
            </div>
            <div className="mk-glass mk-contact-panel">
              <ContactForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="mk-foot">
        <div className="mk-wrap">
          <div className="mk-foot-top">
            <div className="mk-foot-brand">
              <span className="mk-nav-brand"><Mark size={22} /><span>PitchIQ</span></span>
              <p>Pitch calling for high school, travel and college baseball.</p>
            </div>
            <nav className="mk-foot-cols" aria-label="Footer">
              <div>
                <h2>Product</h2>
                <ul>
                  <li><a href="#reads">The reads</a></li>
                  <li><a href="#dugout">The call</a></li>
                  <li><a href="#at-bat">The sequence</a></li>
                  <li><a href="#demo">Try the engine</a></li>
                </ul>
              </div>
              <div>
                <h2>Teams</h2>
                <ul>
                  <li><a href="#program">Coaches and players</a></li>
                  <li><a href="#faq">Questions</a></li>
                  <li><a href="#contact">Talk to us</a></li>
                </ul>
              </div>
              <div>
                <h2>Account</h2>
                <ul>
                  <li><Link href="/login">Sign in</Link></li>
                  <li><Link href="/terms">Terms</Link></li>
                  <li><Link href="/privacy">Privacy</Link></li>
                </ul>
              </div>
            </nav>
          </div>
          <div className="mk-foot-row">
            <span>© 2026 PitchIQ</span>
          </div>
        </div>
      </footer>
    </>
  );
}
