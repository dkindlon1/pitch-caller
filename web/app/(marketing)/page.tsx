import Link from "next/link";
import { Haze } from "./_components/Haze";
import { Seam } from "./_components/Seam";
import { ContactForm } from "./_components/ContactForm";
import { Hero } from "./_components/Hero";
import { AtBat } from "./_components/AtBat";
import { Demo } from "./_components/Demo";
import { InsideCall } from "./_components/InsideCall";
import { Faq } from "./_components/Faq";
import { GameDay } from "./_components/GameDay";
import { Program } from "./_components/Program";
import { Reads } from "./_components/Reads";
import { GlassLight } from "./_components/GlassLight";
import { Mark } from "./_components/Mark";
import { Nav } from "./_components/Nav";
import { Reveal } from "./_components/Reveal";

const BETWEEN =
  "Between pitches you get a few seconds. In that time you weigh the count, the runners, what this hitter has already seen and what your pitcher actually has working today. Then you put down a sign.";

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
      <GlassLight />
      <div className="mk-grain" aria-hidden="true" />
      <Nav />

      <main id="main" tabIndex={-1}>
        <Hero />

        <section className="mk-between" id="between" tabIndex={-1} aria-labelledby="between-h">
          <Seam />
          <div className="mk-wrap">
            <h2 id="between-h" className="mk-sr">A few seconds between pitches</h2>
            <Reveal className="mk-between-text" text={BETWEEN} clock />
            <p className="mk-between-after">PitchIQ does that weighing for every pitch, and shows its work.</p>
          </div>
        </section>

        <AtBat />
        <Reads />
        <Demo />
        <InsideCall />
        <GameDay />
        <Program />
        <Faq />

        <section className="mk-contact" id="contact" tabIndex={-1} aria-labelledby="contact-h">
          <Haze />
          <div className="mk-wrap mk-contact-grid">
            <div className="mk-contact-copy">
              <h2 id="contact-h">Talk to us</h2>
              <p>
                Tell us about your team and what you&apos;d want help with. The person who builds PitchIQ reads every
                message and writes back.
              </p>
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
                  <li><a href="#at-bat">How it calls</a></li>
                  <li><a href="#demo">Try the engine</a></li>
                  <li><a href="#dugout">In the dugout</a></li>
                  <li><a href="#gameday">A game with PitchIQ</a></li>
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
