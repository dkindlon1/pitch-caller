import Link from "next/link";
import { AT_BAT } from "@/content/at-bat";
import { CallBand } from "./components/CallBand";
import { LiveCall } from "./components/LiveCall";
import { Mark } from "./components/Mark";
import { WaitlistForm } from "./components/WaitlistForm";
import { Zone } from "./components/Zone";

const READS = [
  { t: "Your pitcher today", d: "His pitches, his velocity, and how much he trusts each one as the game goes on." },
  { t: "The hitter", d: "Early or late on the fastball, where his fouls go, and what he has already seen." },
  { t: "The game", d: "Count, outs, runners, score, and how wide the umpire is calling it." },
  { t: "The rest of the at-bat", d: "It plans the next pitches too, so a fastball now can set up the slider." },
];

const RULES = [
  "Never calls a chase pitch at 3-0 or 3-1.",
  "Mixes its calls so a hitter can't sit on a pattern, and leans on the best call in big counts like 2-2 and 3-2.",
  "Calls an off-speed strike only while that pitch is landing.",
  "Uses numbers fit to your level: high school, travel ball or college.",
];

const FAQ = [
  {
    q: "Can I use it during games?",
    a: "Rules differ by level. High school follows the NFHS and your state association; college follows NCAA Rule 5-16 on electronic devices. Ask your state association or compliance office before using a tablet in the dugout. Game prep, bullpens and scrimmages are fine anywhere.",
  },
  {
    q: "What will it cost?",
    a: "One price per team, billed yearly, with the first year discounted. Prices come out before teams can sign up.",
  },
  {
    q: "Do my players need accounts?",
    a: "No. A coach can enter the staff and call a game alone. Players and parents can join later to see their own stats.",
  },
  {
    q: "Who builds PitchIQ?",
    a: "A college pitcher studying mechanical engineering, who checks every call against how a pitching coach would think about it.",
  },
];

export default function Home() {
  return (
    <>
      <header className="nav">
        <div className="wrap nav-row">
          <Link href="/" className="brand" aria-label="PitchIQ home">
            <Mark />
            <span>PitchIQ</span>
          </Link>
          <a className="btn btn-sm" href="#join">Join the spring waitlist</a>
        </div>
      </header>

      <main>
        <section className="hero field-grid" aria-labelledby="h1">
          <div className="wrap hero-grid">
            <div className="hero-copy">
              <h1 id="h1">Pitch calling for high school, travel and college coaches</h1>
              <p className="lede">
                PitchIQ calls each pitch from the count, the hitter&apos;s swings and your pitcher&apos;s stuff today. It plans the
                whole at-bat and tells you why it picked the pitch.
              </p>
              <p className="fact">A new call in under a second on an iPad, with no signal in the dugout.</p>
              <WaitlistForm />
            </div>
            <LiveCall />
          </div>
        </section>

        <section className="band night" id="at-bat" aria-labelledby="h-atbat">
          <div className="wrap">
            <h2 id="h-atbat">One at-bat, four calls</h2>
            <p className="sub">
              A right-handed hitter&apos;s first time up, called by PitchIQ. Each reason is the engine&apos;s own words, shown
              with the call.
            </p>
            <ol className="seq">
              {AT_BAT.map((p, i) => (
                <li key={i} className="seq-pitch">
                  <p className="seq-count"><span className="lbl">Pitch {i + 1}</span><b className="mono">{p.balls}-{p.strikes}</b></p>
                  <CallBand p={p} size="sm" />
                  <Zone pitches={AT_BAT} current={i} size="sm" />
                  <p className="seq-why">{p.why}</p>
                  <p className="seq-result">{i === AT_BAT.length - 1 ? "Strikeout swinging" : p.result}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="band day" id="reads" aria-labelledby="h-reads">
          <div className="wrap split">
            <div>
              <h2 id="h-reads">What PitchIQ reads</h2>
              <p className="sub">The same things a pitching coach watches, logged with one tap after each pitch.</p>
            </div>
            <dl className="reads">
              {READS.map((r) => (
                <div key={r.t} className="read">
                  <dt>{r.t}</dt>
                  <dd>{r.d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="band day-2" id="rules" aria-labelledby="h-rules">
          <div className="wrap split">
            <div>
              <h2 id="h-rules">Rules it plays by</h2>
              <p className="sub">Built from how pitching coaches call a game, then checked call by call in simulated games.</p>
            </div>
            <ul className="rules">
              {RULES.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        </section>

        <section className="band day" id="questions" aria-labelledby="h-faq">
          <div className="wrap split">
            <h2 id="h-faq">Questions from coaches</h2>
            <div className="faq">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="band field-grid close" id="join" aria-labelledby="h-join">
          <div className="wrap close-grid">
            <div>
              <h2 id="h-join">The spring waitlist</h2>
              <p className="sub">Leave your email and get one message when teams can sign up for the spring season.</p>
            </div>
            <WaitlistForm />
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-row">
          <span className="brand brand-foot"><Mark size={22} /><span>PitchIQ</span></span>
          <span>© 2026 PitchIQ</span>
          <Link href="/privacy">Privacy</Link>
        </div>
      </footer>
    </>
  );
}
