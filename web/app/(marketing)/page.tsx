import { readdirSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { atBat, story } from "@/lib/story_server";
import { Film } from "./_components/Film";
import { Nav } from "./_components/Nav";
import { AtBat } from "./_components/AtBat";
import { TwoWrists } from "./_components/TwoWrists";
import { Programs } from "./_components/Programs";
import { Faq } from "./_components/Faq";
import { ContactForm } from "./_components/ContactForm";
import { Mark } from "./_components/Mark";
import { Rise } from "./_components/Rise";

// what search engines read about the product: no price, no ratings, only what's true on this page
const LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "PitchIQ",
  applicationCategory: "SportsApplication",
  operatingSystem: "iPadOS, Web",
  description: "Pitch calling for high school, travel and college baseball. Calls every pitch from the pitcher's stuff today, the hitter and the count, and gives the reason for it.",
};

// how many frames each film set has on disk, so the player and the render can't drift apart
function frameCount(set: string) {
  return readdirSync(path.join(process.cwd(), "public/media/film/watch", set)).filter((f) => /^\d{4}\.webp$/.test(f)).length;
}

export default function Home() {
  const s = story();     // one real engine run, made while the page is built (it throws, and the build fails, if the film's call stops being true)
  const frames = { wide: frameCount("wide"), tall: frameCount("tall") };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LD) }} />
      <a className="pq-skip" href="#main">Skip to content</a>
      <Nav />
      <main id="main" tabIndex={-1}>
        <Film story={s} frames={frames} />
        <AtBat pitches={atBat()} />
        <TwoWrists calls={[s.groups[0].spots[0], s.groups[1].spots[0]]} />
        <Programs />
        <Faq />

        <section className="pq-sec pq-contact" id="contact" tabIndex={-1} aria-labelledby="contact-h">
          <div className="pq-glowbg" aria-hidden="true" style={{ "--gx": "44%", "--gy": "10%" } as React.CSSProperties} />
          <div className="pq-wrap pq-contact-grid">
            <div className="pq-sec-head">
              <h2 id="contact-h">Talk to us.</h2>
              <p>Tell us about your team and what you&apos;d want help with. We read every message and write back.</p>
            </div>
            <div className="pq-glass pq-contact-panel" data-rise>
              <ContactForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="pq-foot">
        <div className="pq-wrap">
          <div className="pq-foot-top">
            <div className="pq-foot-brand">
              <span className="pq-brand"><Mark size={22} /><span>PitchIQ</span></span>
              <p>Pitch calling for high school, travel and college baseball.</p>
            </div>
            <nav className="pq-foot-cols" aria-label="Footer">
              <div>
                <h2>Product</h2>
                <ul>
                  <li><a href="#top">The call</a></li>
                  <li><a href="#pg">Try the engine</a></li>
                  <li><a href="#at-bat">The at-bat</a></li>
                  <li><a href="#wrists">Two wrists</a></li>
                </ul>
              </div>
              <div>
                <h2>Teams</h2>
                <ul>
                  <li><a href="#programs">For programs</a></li>
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
          <div className="pq-foot-row">
            <span>© 2026 PitchIQ</span>
            <span>The watch shown on this page is an illustration and a prototype.</span>
          </div>
        </div>
      </footer>
      <Rise />
    </>
  );
}
