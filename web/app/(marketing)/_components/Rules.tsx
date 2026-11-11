// What keeps the calls sensible: the coaching rules built into the engine (README "Coach rules built in"), the real
// numbers each level runs on (college_rates.py, hs_rates.py, run_tables.py), and how the calls are checked (review.py).
// Each rule has a small zone drawing of what it means.

function Glyph({ kind }: { kind: "chase" | "landing" | "attack" | "shake" | "mix" }) {
  const zone = <rect x="14" y="10" width="36" height="44" className="g-zone" />;
  const cells = <path d="M26 10v44M38 10v44M14 24.67h36M14 39.33h36" className="g-grid" />;
  return (
    <svg viewBox="0 0 64 64" className="mk-ru-glyph" aria-hidden="true">
      {zone}{cells}
      {kind === "chase" ? <><circle cx="56" cy="60" r="5" className="g-off" /><path d="M51 55l10 10M61 55l-10 10" className="g-x" /><text x="32" y="7" textAnchor="middle" className="g-t">3-0 · 3-1</text></> : null}
      {kind === "landing" ? <><circle cx="32" cy="32" r="6" className="g-on" /><path d="M8 58h48" className="g-grid" /><path d="M8 58h30" className="g-meter" /></> : null}
      {kind === "attack" ? <><circle cx="44" cy="47" r="5" className="g-on" /><circle cx="20" cy="17" r="5" className="g-on" /><text x="32" y="7" textAnchor="middle" className="g-t">2-2</text></> : null}
      {kind === "shake" ? <><circle cx="44" cy="17" r="6" className="g-off" /><path d="M39 12l10 10M49 12l-10 10" className="g-x" /><circle cx="20" cy="47" r="5" className="g-on" /></> : null}
      {kind === "mix" ? <><circle cx="20" cy="17" r="4" className="g-dim" /><circle cx="44" cy="47" r="6" className="g-on" /><circle cx="32" cy="32" r="3" className="g-dim" /><circle cx="44" cy="17" r="3.5" className="g-dim" /></> : null}
    </svg>
  );
}

const RULES = [
  { k: "chase" as const, t: "No chase pitch at 3-0 or 3-1", d: "Behind in the count, it asks for a strike, never a pitch off the plate." },
  { k: "landing" as const, t: "Off-speed strikes only when they're landing", d: "It won't call a “get it over” changeup until his changeup is finding the zone today." },
  { k: "attack" as const, t: "Attacks the zone at 2-2", d: "Two strikes and a ball to play with is a pitch to go after, not to waste." },
  { k: "shake" as const, t: "Respects the shake", d: "When he shakes off a call, it moves on to something else." },
  { k: "mix" as const, t: "Mixes, but leans on the best call", d: "A hitter can't sit on a pattern, and in big counts the mix tightens around the strongest call." },
];

// from review.py's WRONG and QUESTIONABLE checks, in a coach's words
const CHECKS: [string, string][] = [
  ["Wrong", "A chase pitch at 3-0 or 3-1"],
  ["Wrong", "A pitch down the middle at 0-2 or 1-2"],
  ["Wrong", "The same pitch he just shook off"],
  ["Questionable", "An off-speed pitch up in the zone"],
  ["Questionable", "A breaking ball in the dirt with a runner on third"],
  ["Questionable", "The same pitch four times in a row to one hitter"],
];

const LEVELS = [
  { l: "High school", s: "2026 national varsity averages" },
  { l: "Travel ball", s: "The high school numbers" },
  { l: "College D3 and D1", s: "2026 NCAA conference team stats" },
];

export function Rules() {
  return (
    <section className="mk-ru" id="rules" aria-labelledby="ru-h">
      <div className="mk-wrap">
        <div className="mk-sec-head">
          <h2 id="ru-h">The rules it plays by</h2>
          <p>Built from how pitching coaches call a game, then checked call by call.</p>
        </div>
        <ul className="mk-ru-list">
          {RULES.map((r) => (
            <li key={r.t}>
              <Glyph kind={r.k} />
              <div><h3>{r.t}</h3><p>{r.d}</p></div>
            </li>
          ))}
        </ul>
        <div className="mk-ru-proof">
          <article className="mk-glass mk-ru-card">
            <h3>Numbers from your level</h3>
            <p>What a ball or a strike is worth depends on who&apos;s hitting. Each level runs on its own real numbers.</p>
            <dl>{LEVELS.map((x) => <div key={x.l}><dt>{x.l}</dt><dd>{x.s}</dd></div>)}</dl>
          </article>
          <article className="mk-glass mk-ru-card">
            <h3>Checked call by call</h3>
            <p>
              Every version plays full simulated games. Each call is graded by a separate set of coaching checks the engine
              never sees, and the whole pattern is graded for how predictable it is.
            </p>
            <ul className="mk-ru-checks">
              {CHECKS.map(([v, t]) => <li key={t}><span className={`v-${v === "Wrong" ? "w" : "q"}`}>{v}</span>{t}</li>)}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
