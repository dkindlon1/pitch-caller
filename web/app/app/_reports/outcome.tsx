import type { Cell, DriftNote } from "@/lib/peak";
import type { OutcomeOuting, OutcomeSeason } from "@/lib/outcome";

// Build 3: the outcome tracking section (PLAN_outcome_tracking 3.2 / 3.4) in the outing report and the recap: up to 5
// findings, each a plain sentence with its sample and a small chart of the metric across that situation's buckets;
// "early sign" when likely but not certain; noise hidden. One neutral hue (blue and green are taken, orange is the
// alert colour); the flagged bucket is marked in words and outline, never by colour alone. Numbers carry data-k / data-v
// for scripts/outcome_check.js.
const pct = (x: number) => `${Math.round(100 * x)}%`;
const VAR_WORD: Record<string, string> = { tto: "Time through the order", pc: "Pitch count", runners: "Runners", side: "Hitter side", approach: "Hitter approach" };
const BUCKET_WORD: Record<string, string> = { "1st": "1st", "2nd": "2nd", "3rd+": "3rd+", empty: "Bases empty", on: "Runners on", same: "Same side", opp: "Opposite", aggressive: "Aggressive", patient: "Patient" };
const UNIT_WORD: Record<string, string> = { swing: "swings", pitch: "pitches", bip: "balls in play" };

function MiniChart({ c, i, k }: { c: Cell; i: number; k: string }) {
  const W = 300, H = 120, L = 34, R = 8, T = 10, B = 30, n = c.chart.length, bw = (W - L - R) / n;
  const vals = c.chart.map((b) => (b.n ? b.k / b.n : null)), hi = Math.max(0.5, ...vals.filter((v): v is number => v !== null), c.base) * 1.1;
  const Y = (v: number) => T + (1 - v / hi) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="oc-chart" role="img" aria-label={`${c.name} ${c.metric === "whiff" ? "whiffs per swing" : c.metric === "strike" ? "strike rate" : "hard contact"} by ${VAR_WORD[c.variable].toLowerCase()}: ${c.chart.map((b) => `${BUCKET_WORD[b.bucket] || b.bucket} ${b.n ? pct(b.k / b.n) : "none"} of ${b.n}`).join(", ")}; his normal ${pct(c.base)}`}>
      <line className="ax" x1={L} x2={W - R} y1={Y(0)} y2={Y(0)} />
      <text className="tick" x={L - 5} y={Y(0) + 4} textAnchor="end">0</text>
      <text className="tick" x={L - 5} y={Y(hi / 1.1) + 4} textAnchor="end">{pct(hi / 1.1)}</text>
      {c.chart.map((b, j) => {
        const v = vals[j], x = L + j * bw + bw * 0.18, w = bw * 0.64, flagged = b.bucket === c.bucket;
        return <g key={b.bucket}>
          {v !== null ? <rect className={`bar${flagged ? " flag" : ""}`} x={x} y={Y(v)} width={w} height={Math.max(1, Y(0) - Y(v))} rx={4} data-k={`${k}.${i}.chart.${b.bucket}`} data-v={`${b.k}/${b.n}`} /> : null}
          <text className="tick" x={x + w / 2} y={H - 16} textAnchor="middle">{BUCKET_WORD[b.bucket] || b.bucket}</text>
          <text className="tick n" x={x + w / 2} y={H - 4} textAnchor="middle">{b.n ? `${b.k}/${b.n}` : "–"}</text>
        </g>;
      })}
      <line className="base" x1={L} x2={W - R} y1={Y(c.base)} y2={Y(c.base)} />
      <text className="tick base-t" x={W - R} y={Y(c.base) - 4} textAnchor="end">his normal {pct(c.base)}</text>
    </svg>
  );
}

export function OutcomeFindings({ f, k = "oc", empty }: { f: { shown: Cell[]; tested: number }; k?: string; empty: string }) {
  if (!f.shown.length) return <p className="rp-empty">{f.tested ? `${f.tested} situations checked: nothing stands out from his normal yet.` : empty}</p>;
  return (
    <>
      <ol className="oc-list">{f.shown.map((c, i) => (
        <li key={i} className="rp-card oc-item">
          <div className="oc-head"><span className={`rp-pill oc-${c.level}`} data-k={`${k}.${i}.level`} data-v={c.level}>{c.level === "clear" ? "Clear" : "Early sign"}</span>
            <span className="rp-note">{VAR_WORD[c.variable]} · {c.name}</span></div>
          <p className="oc-sentence">{c.sentence}</p>
          <span hidden data-k={`${k}.${i}.cell`} data-v={`${c.pitch}|${c.variable}|${c.bucket}|${c.metric}|${c.k}/${c.n}|${c.base.toFixed(4)}`} />
          <MiniChart c={c} i={i} k={k} />
          <p className="rp-note">{c.k} of {c.n} {UNIT_WORD[c.unit]} {BUCKET_WORD[c.bucket] ? `(${(BUCKET_WORD[c.bucket] || c.bucket).toLowerCase()})` : ""} vs his normal {pct(c.base)}.</p>
        </li>))}</ol>
      <p className="rp-note">{f.tested} situations checked against his own normal for each pitch. &ldquo;Clear&rdquo; holds after a false-discovery control across all of them (about 95%); &ldquo;early sign&rdquo; is likely but not certain. Each finding is about one situation: a pitch doing well elsewhere isn&rsquo;t written off.</p>
    </>
  );
}

export function OutingOutcome({ o, staff }: { o: OutcomeOuting; staff: boolean }) {
  return (
    <>
      {o.archetype ? <p className="oc-arch">At his best: <b>{o.archetype}</b></p> : null}
      <OutcomeFindings f={o.findings} empty={o.priorOutings ? "Not enough of any pitch in one situation to compare yet." : "His first charted outing: his normal starts from typical numbers for each pitch until there's history."} />
      {staff ? <DriftNotes notes={o.drift} /> : null}
    </>
  );
}
export function DriftNotes({ notes }: { notes: DriftNote[] }) {
  return (
    <div className="oc-drift">
      <h3 style={{ fontSize: "1rem" }}>Drift notes in the game</h3>
      {notes.length ? <ul className="rp-list">{notes.map((n, i) => <li key={i}><span>{n.text}</span><span className="n" data-k={`drift.${i}`} data-v={`${n.pitch}|${n.metric}|${n.k}/${n.n}|${n.at}`}>pitch {n.atN ?? n.at}</span></li>)}</ul>
        : <p className="rp-note">None: no pitch fell clearly below his normal. (Notes need 8 of a pitch; they never change a call.)</p>}
    </div>
  );
}
export function SeasonOutcome({ o }: { o: OutcomeSeason }) {
  return (
    <>
      {o.archetype ? <p className="oc-arch">At his best: <b>{o.archetype}</b></p> : null}
      <OutcomeFindings f={o.findings} k="ocs" empty="Not enough of any pitch in one situation yet this season." />
    </>
  );
}
