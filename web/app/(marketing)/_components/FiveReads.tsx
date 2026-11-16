// The five things the engine reads before it puts down a call, in plain words. Each line is something the engine
// already weighs (README, "How it decides" and "Planning the at-bat"); the figures in the small pictures are
// an illustrated example and say so. Nothing here is a claim about results.
const READS = [
  {
    n: "01", title: "The count",
    body: "Every count changes what a pitch is worth. The engine solves each at-bat once across every count, so a call is valued for what it sets up.",
    pic: "count",
  },
  {
    n: "02", title: "The hitter",
    body: "What he's sitting on, how he's timed up, and what he has done earlier today.",
    pic: "hitter",
  },
  {
    n: "03", title: "How your pitcher is throwing today",
    body: "His confidence in each pitch and whether it's landing right now. Off-speed “get it over” calls only come when it is.",
    pic: "pitcher",
  },
  {
    n: "04", title: "The game",
    body: "Runners, outs, inning and score. Late in a close game it weighs winning, not just runs.",
    pic: "game",
  },
  {
    n: "05", title: "This at-bat so far",
    body: "The speeds and heights he has already seen. The next call is chosen for what the last one set up.",
    pic: "atbat",
  },
] as const;

function Pic({ kind }: { kind: (typeof READS)[number]["pic"] }) {
  if (kind === "count") return (
    <div className="pq-pic pq-pic-count" aria-hidden="true">
      <span className="pq-count">1 &ndash; 2</span>
      <span className="pq-dots"><i className="on" /><i /><i /><i className="on" /><i className="on" /><i /></span>
    </div>
  );
  if (kind === "hitter") return (
    <div className="pq-pic pq-pic-hitter" aria-hidden="true">
      <span className="pq-gauge"><i style={{ left: "72%" }} /></span>
      <span className="pq-cap"><b>Early</b><b>Late</b></span>
    </div>
  );
  if (kind === "pitcher") return (
    <div className="pq-pic pq-pic-pitcher" aria-hidden="true">
      {[["FB", 0.8], ["SL", 0.75], ["CH", 0.42]].map(([c, v]) => (
        <span className="pq-row" key={c as string}><b>{c}</b><span className="pq-track"><i style={{ width: `${(v as number) * 100}%` }} /></span></span>
      ))}
    </div>
  );
  if (kind === "game") return (
    <div className="pq-pic pq-pic-game" aria-hidden="true">
      <svg viewBox="0 0 120 90"><path d="M60 8 L108 46 L60 84 L12 46 Z" className="dia" /><rect x="55" y="3" width="10" height="10" className="base" /><rect x="103" y="41" width="10" height="10" className="base on" /><rect x="55" y="79" width="10" height="10" className="base" /><rect x="7" y="41" width="10" height="10" className="base" /></svg>
      <span className="pq-cap"><b>One out</b><b>Tie game</b></span>
    </div>
  );
  return (
    <div className="pq-pic pq-pic-atbat" aria-hidden="true">
      <span className="pq-seq"><i className="fb">FB</i><i className="sl">SL</i><i className="fb">FB</i><i className="next">?</i></span>
    </div>
  );
}

export function FiveReads() {
  return (
    <section className="pq-reads" id="reads" tabIndex={-1} aria-labelledby="reads-h">
      <div className="mk-wrap">
        <p className="pq-eyebrow">Before every call</p>
        <h2 id="reads-h" className="pq-display pq-reads-h">Five reads. <em>One call.</em></h2>
        <p className="pq-lede pq-reads-lede">Between pitches there are a few seconds. This is what PitchIQ weighs in them. The small pictures are illustrated examples.</p>
        <ol className="pq-reads-list">
          {READS.map((r) => (
            <li key={r.n} className="pq-read">
              <span className="pq-read-n">{r.n}</span>
              <div className="pq-read-copy">
                <h3>{r.title}</h3>
                <p>{r.body}</p>
              </div>
              <Pic kind={r.pic} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
