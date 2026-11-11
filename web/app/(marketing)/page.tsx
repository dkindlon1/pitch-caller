import Link from "next/link";
import { ContactForm } from "./_components/ContactForm";
import { Hero } from "./_components/Hero";
import { Mark } from "./_components/Mark";
import { Reveal } from "./_components/Reveal";

const BETWEEN =
  "Between pitches you get a few seconds. In that time you weigh the count, the runners, what this hitter has already seen and what your pitcher actually has working today. Then you put down a sign.";

export default function Home() {
  return (
    <>
      <a className="mk-skip" href="#main">Skip to content</a>
      <header className="mk-nav">
        <nav className="mk-nav-pill mk-glass" aria-label="Main">
          <Link href="/" className="mk-nav-brand" aria-label="PitchIQ home"><Mark /><span>PitchIQ</span></Link>
          <a className="mk-nav-link" href="#between">How it calls</a>
          <Link className="mk-nav-link" href="/login">Sign in</Link>
          <a className="mk-btn mk-btn-sm" href="#contact">Talk to us</a>
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        <Hero />

        <section className="mk-between" id="between" tabIndex={-1} aria-labelledby="between-h">
          <div className="mk-wrap">
            <h2 id="between-h" className="mk-sr">A few seconds between pitches</h2>
            <Reveal className="mk-between-text" text={BETWEEN} />
            <p className="mk-between-after">PitchIQ does that weighing for every pitch, and shows its work.</p>
          </div>
        </section>

        <section className="mk-contact" id="contact" tabIndex={-1} aria-labelledby="contact-h">
          <svg className="mk-contact-art" viewBox="0 0 800 700" preserveAspectRatio="xMinYMid slice" aria-hidden="true">
            <path d="M120 -20 C 260 140, 420 260, 860 380" />
            <path d="M60 -20 C 240 180, 460 300, 860 470" />
            <path d="M180 -20 C 300 120, 500 200, 860 300" />
            <path className="is-live" d="M90 -20 C 260 200, 470 380, 860 600" />
          </svg>
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
        <div className="mk-wrap mk-foot-row">
          <span className="mk-nav-brand"><Mark size={18} /><span>PitchIQ</span></span>
          <span className="mk-foot-links">
            <Link href="/login">Sign in</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </span>
          <span className="mk-foot-copy">© 2026 PitchIQ</span>
        </div>
      </footer>
    </>
  );
}
