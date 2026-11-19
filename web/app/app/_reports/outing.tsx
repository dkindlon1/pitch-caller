import Link from "next/link";
import type { ReactNode } from "react";
import type { AtBat, Hurt, Outing } from "@/lib/report_data.ts";
import { AtBatList, Completeness, HeatBlock, LineStrip, MixBlock, OverridesBlock, Section, WorkedHurt, dayText } from "./ui";
import { Notes, type Note } from "./notes";

// One outing report (PLAN_reports_recap 2), in the order the plan lists: the line, pitch mix and results, heat maps,
// hitter by hitter, overrides and style (staff only), outcome tracking (coming), notes. The staff view and the
// pitcher's own view are the same page; the pitcher's never gets overrides, coach push-backs, staff notes or hitters'
// names (his data has none of them: the database leaves them out).
export type OutingCtx = {
  team: string; pitcherId: string; pitcherName: string; pitcherNo?: string | number | null; hand?: string | null;
  opponent: string | null; level: string | null; teamName?: string;
  hitterName: (a: { hitterId?: string | null; slot: number | null }) => ReactNode;
  notes: Note[]; canWrite: boolean; path: string;
  others?: { id: string; name: string; href: string }[];   // the game's other pitchers (staff)
  summaryHref?: string; pdfHref?: string; back: { href: string; label: string };
};
const LEVEL: Record<string, string> = { hs: "High school", travel: "Travel ball", college_d3: "College D3", college_d1: "College D1", mlb: "Pro" };

export function OutingReport({ r, c }: { r: Outing; c: OutingCtx }) {
  const staff = r.view === "staff";
  const outingNotes = c.notes.filter((n) => n.scope === "outing");
  const abNotes = (a: AtBat) => c.notes.filter((n) => n.scope === "atbat" && n.at_bat === a.key);
  const hurtName = (h: Hurt) => c.hitterName({ hitterId: h.hitterId, slot: h.slot });
  return (
    <article className="rp">
      <header className="rp-head">
        <Link className="pq-crumb" href={c.back.href}><span aria-hidden="true">←</span> {c.back.label}</Link>
        <h1>{c.pitcherName}</h1>
        <p className="rp-sub">
          <span>Outing report</span><span className="sep" aria-hidden="true">·</span>
          <span><time dateTime={r.game.date}>{dayText(r.game.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</time></span>
          {c.opponent ? <><span className="sep" aria-hidden="true">·</span><span>vs {c.opponent}</span></> : null}
          {c.level ? <><span className="sep" aria-hidden="true">·</span><span>{LEVEL[c.level] || c.level}</span></> : null}
        </p>
        <div className="rp-acts">
          {c.summaryHref ? <Link className="shell-btn small" href={c.summaryHref}>Game summary</Link> : null}
          {(c.others || []).map((o) => <Link key={o.id} className="shell-btn small" href={o.href}>{o.name}&rsquo;s report</Link>)}
          {c.pdfHref ? <a className="shell-btn small" href={c.pdfHref} download>Download PDF</a> : null}
        </div>
      </header>

      <Section id="line" title="The line">
        <LineStrip l={r.line} extra={<div><dt>Batters</dt><dd data-k="line.bf" data-v={r.line.bf}>{r.line.bf}</dd></div>} />
        <p className="rp-note">First-pitch strikes: <span data-k="line.firstStrikes" data-v={r.line.firstStrikes}>{r.line.firstStrikes}</span> of <span data-k="line.firstPitches" data-v={r.line.firstPitches}>{r.line.firstPitches}</span>. Positive outcomes <span data-k="line.positive" data-v={r.line.positive}>{r.line.positive}</span>, negative <span data-k="line.negative" data-v={r.line.negative}>{r.line.negative}</span>.{r.velo.n ? ` Velocity: ${r.velo.avg!.toFixed(1)} mph average, ${r.velo.max} top (${r.velo.n} readings).` : ""}</p>
        <Completeness c={r.completeness} />
      </Section>

      <Section id="mix" title="Pitch mix and results"><MixBlock mix={r.mix} hand={c.hand} /></Section>

      <Section id="heat" title="Heat maps"><HeatBlock heat={r.heat} /></Section>

      <Section id="abs" title="Hitter by hitter" aside={<span className="rp-note">{r.atBats.length} at-bats</span>}>
        <WorkedHurt worked={r.worked} hurt={r.hurt} hitterName={hurtName} />
        <AtBatList abs={r.atBats} who={(a) => c.hitterName(a)}
          notes={(a) => (staff || abNotes(a).length) ? <Notes notes={abNotes(a)} team={c.team} game={r.game.id} pitcher={c.pitcherId} atBat={a.key} canWrite={staff && c.canWrite} path={c.path} compact /> : null} />
      </Section>

      {staff ? (
        <Section id="ov" title="Overrides and style" aside={<span className="rp-note">Staff only</span>}>
          <OverridesBlock ovs={r.overrides || []} />
          <h3 style={{ fontSize: "1rem" }}>Style notes</h3>
          <p className="rp-empty">No style notes: the style layer isn&rsquo;t on yet. Its push-backs and peak-drift notes will show here.</p>
        </Section>
      ) : null}

      <Section id="ot" title="Outcome tracking">
        <p className="rp-empty">Coming soon: how each pitch did by time through the order, pitch count and runners, against his own normal.</p>
      </Section>

      <Section id="notes" title={staff ? "Notes" : "Notes from your coaches"} aside={staff ? <span className="rp-note">Staff only unless shared</span> : null}>
        {staff ? <Notes notes={outingNotes} team={c.team} game={r.game.id} pitcher={c.pitcherId} canWrite={c.canWrite} path={c.path} />
          : outingNotes.length ? <ul className="rp-notes">{outingNotes.map((n) => <li key={n.id}><p>{n.body}</p></li>)}</ul> : <p className="rp-note">Your coaches haven&rsquo;t shared a note on this outing.</p>}
      </Section>
    </article>
  );
}
