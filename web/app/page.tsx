import Image from "next/image";
import Link from "next/link";
import { AT_BAT } from "@/content/at-bat";
import { CallBand } from "./components/CallBand";
import { LiveCall } from "./components/LiveCall";
import { LiveDemo } from "./components/LiveDemo";
import { Mark } from "./components/Mark";
import { MovementCloud } from "./components/MovementCloud";
import ipadLive from "@/public/marketing/ipad-live.png";
import { WaitlistForm } from "./components/WaitlistForm";
import { Zone } from "./components/Zone";

const READS = [
  { t: "Your pitcher today", d: "His pitches, his velocity, and how much he trusts each one as the game goes on." },
  { t: "The hitter", d: "Early or late on the fastball, where his fouls go, and what he has already seen." },
  { t: "The game", d: "Count, outs, runners, score, and how wide the umpire is calling it." },
  { t: "The rest of the at-bat", d: "It plans the next pitches too, so a fastball now can set up the slider." },
];

// the three parts of a game, in order
const STEPS = [
  { t: "Before the game", d: "Enter your staff once: each pitcher's pitches, how hard he throws them and how good each one is. Add the other team's hitters if you have a scouting report." },
  { t: "During the game", d: "After each pitch, tap what happened. The next call is up in under a second, on the iPad, with or without a signal. Everything syncs when you're back online." },
  { t: "After the game", d: "The engine checks your grades against what actually happened and moves its read toward his results, a little each game. Your pitchers see what it learned." },
];

const DUGOUT = [
  { t: "One tap a pitch", d: "Ball, called strike, swing and miss, foul, in play or hit by pitch. Each has a keyboard shortcut too." },
  { t: "No signal needed", d: "The game runs on the iPad itself, so losing the signal in the dugout doesn't stop it." },
  { t: "You stay in charge", d: "Tap “He shook it off” or “Call my own”, and fix a mis-tap with Undo." },
  { t: "Readable in the sun", d: "A brighter Day screen for afternoon games." },
];

const PEOPLE = [
  {
    t: "For coaches",
    items: [
      "Your roster and each pitcher's arsenal in one place.",
      "Invite a pitching coach and choose what he can change.",
      "Scouting notes on the other team's hitters.",
      "Each pitcher's results by count and pitch, from the games you called.",
    ],
  },
  {
    t: "For pitchers and parents",
    items: [
      "His own stats, and only his: teammates can't see each other's.",
      "He can update his own grades; his coach sees every change and can undo it.",
      "Bullpen and game files from TrackMan or Rapsodo, on his own page.",
      "Players under 13 join through a parent, who gives consent first.",
    ],
  },
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
          <span className="nav-links">
            <a className="nav-link" href="#demo">Try the demo</a>
            <a className="btn btn-sm" href="#join">Join the spring waitlist</a>
          </span>
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

        <section className="band day" id="problem" aria-labelledby="h-problem">
          <div className="wrap split">
            <h2 id="h-problem">A few seconds between pitches</h2>
            <p className="problem-text">
              In that time a coach weighs the count, the runners, what this hitter has already seen and what his pitcher has
              working today, then puts down a sign. A pitch chart on paper records what happened. It doesn&apos;t say what
              to throw next.
            </p>
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

        <section className="band day" id="how" aria-labelledby="h-how">
          <div className="wrap">
            <h2 id="h-how">How it works</h2>
            <ol className="steps">
              {STEPS.map((s, i) => (
                <li key={s.t}>
                  <span className="step-n mono" aria-hidden="true">{i + 1}</span>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="band night field-grid" id="demo" aria-labelledby="h-demo">
          <div className="wrap demo-grid">
            <div className="demo-copy">
              <h2 id="h-demo">Call a game yourself</h2>
              <p className="sub">
                This is the engine from the iPad app, running in your browser. The pitcher is the app&apos;s sample
                right-hander: fastball 86, slider 78, changeup 77. Tap what happened and it calls the next pitch for the
                next count, hitter and inning.
              </p>
              <p className="demo-note">Left-handed hitters stand on the right of the zone, so their inside half is on the right.</p>
            </div>
            <LiveDemo />
          </div>
        </section>

        <section className="band day-2" id="ipad" aria-labelledby="h-ipad">
          <div className="wrap ipad-grid">
            <div className="ipad-scene">
              <div className="ipad">
                <Image src={ipadLive} alt="The live-calling screen on an iPad: a fastball, get it over, for the first hitter at a 1-1 count, with the six result buttons beside it." sizes="(max-width: 1080px) 92vw, 720px" placeholder="blur" />
              </div>
            </div>
            <div>
              <h2 id="h-ipad">Built for the dugout</h2>
              <dl className="dugout">
                {DUGOUT.map((d) => (
                  <div key={d.t}>
                    <dt>{d.t}</dt>
                    <dd>{d.d}</dd>
                  </div>
                ))}
              </dl>
            </div>
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

        <section className="band day" id="people" aria-labelledby="h-people">
          <div className="wrap">
            <h2 id="h-people">Who uses it</h2>
            <div className="people">
              {PEOPLE.map((g) => (
                <div key={g.t}>
                  <h3>{g.t}</h3>
                  <ul>{g.items.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="band night" id="uploads" aria-labelledby="h-uploads">
          <div className="wrap uploads-grid">
            <div>
              <h2 id="h-uploads">TrackMan and Rapsodo files</h2>
              <p className="sub">
                Drop in a TrackMan or Rapsodo export, or any pitch file with a header row. It&apos;s read on your device and
                you leave out the warmups. PitchIQ then proposes his velocity, pitch shape and arm slot from it, and nothing
                changes until he or his coach accepts.
              </p>
              <ul className="upload-facts">
                <li>A game file counts more than live BP, and live BP more than a bullpen.</li>
                <li>A file counts half as much after 60 days.</li>
                <li>A file with new column names is matched once, then read the same way every time.</li>
              </ul>
            </div>
            <MovementCloud />
          </div>
        </section>

        <section className="band day-2" id="pricing" aria-labelledby="h-pricing">
          <div className="wrap pricing">
            <div>
              <h2 id="h-pricing">One price per team, per year</h2>
              <p className="sub">
                Each team in your program is billed once a year, and the first year is discounted. There&apos;s no charge for
                players or parents. Prices come out before teams can sign up for the spring.
              </p>
            </div>
            <a className="btn btn-day" href="#join">Join the spring waitlist</a>
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
