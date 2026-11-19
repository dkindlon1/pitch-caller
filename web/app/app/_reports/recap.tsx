import Link from "next/link";
import type { ReactNode } from "react";
import type { Recap } from "@/lib/report_data.ts";
import { CompareBlock, Completeness, HeatBlock, LineStrip, MixBlock, OutingsTable, PitchSeq, Section, TrendChart, dayText } from "./ui";

// The season recap (PLAN_reports_recap 4): the season line and the level comparison, the pitch mix and results, the
// heat maps, trends across outings, the outing list and pitch by pitch. One view for the coach, the pitcher and a
// public link; a public link shows only the sections the pitcher chose (the data for the others never reaches it).
export type Sections = { summary: boolean; heat: boolean; pitches: boolean; outings: boolean };
export const ALL_SECTIONS: Sections = { summary: true, heat: true, pitches: true, outings: true };

export function RecapView({ r, sections = ALL_SECTIONS, opponents, outingHref, back, sub, actions, title, own }: {
  r: Partial<Recap> & { meta: Recap["meta"] }; sections?: Sections; opponents?: Map<string, string | null>; outingHref?: (game: string) => string;
  back?: { href: string; label: string }; sub?: ReactNode; actions?: ReactNode; title?: string; own?: boolean;
}) {
  const m = r.meta;
  const range = m.start ? (m.end ? `${dayText(m.start, { month: "short", day: "numeric" })} – ${dayText(m.end, { month: "short", day: "numeric", year: "numeric" })}` : `Since ${dayText(m.start, { month: "short", day: "numeric" })}`) : "";
  return (
    <article className="rp">
      <header className="rp-head">
        {back ? <Link className="pq-crumb" href={back.href}><span aria-hidden="true">←</span> {back.label}</Link> : null}
        <h1>{title || m.name}</h1>
        <p className="rp-sub"><span>{m.final ? `${m.season}, final recap` : "Season so far"}</span>
          {range ? <><span className="sep" aria-hidden="true">·</span><span>{range}</span></> : null}
          <span className="sep" aria-hidden="true">·</span><span data-k="recap.outings" data-v={m.outings}>{m.outings} outing{m.outings === 1 ? "" : "s"}</span>
          {m.final ? <><span className="sep" aria-hidden="true">·</span><span>Frozen when the season was marked over</span></> : null}{sub}</p>
        {actions ? <div className="rp-acts">{actions}</div> : null}
      </header>
      {!m.outings ? <p className="rp-empty">{m.final ? (own ? "You didn't pitch in this season." : "He didn't pitch in this season.") : own ? "No outings yet this season. Your recap fills in after your first game syncs." : "No outings yet this season. The recap fills in after his first game syncs."}</p> : (<>
        {sections.summary && r.line ? (
          <Section id="line" title="Season line">
            <LineStrip l={r.line} extra={<div><dt>Batters</dt><dd data-k="line.bf" data-v={r.line.bf}>{r.line.bf}</dd></div>} />
            {r.comparison ? <CompareBlock c={r.comparison} /> : null}
            {r.completeness ? <Completeness c={r.completeness} /> : null}
          </Section>) : null}
        {sections.summary && r.pitchMix ? <Section id="mix" title="Pitch mix and results"><MixBlock mix={r.pitchMix} hand={m.hand} /></Section> : null}
        {sections.heat && r.heat ? <Section id="heat" title="Heat maps"><HeatBlock heat={r.heat} /></Section> : null}
        {sections.summary && r.trends ? (
          <Section id="trends" title="Across his outings">
            <div className="rp-pair">
              <div className="rp-card"><h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Strike rate</h3><TrendChart rows={r.trends.rows} field="strikePct" label="Strike rate" /></div>
              <div className="rp-card"><h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Whiffs per swing</h3><TrendChart rows={r.trends.rows} field="whiffPct" label="Whiffs per swing" /></div>
              {r.trends.showVelo ? <div className="rp-card"><h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Velocity</h3><TrendChart rows={r.trends.rows} field="velo" label="Average velocity" /></div> : null}
            </div>
            {!r.trends.showVelo ? <p className="rp-note">Velocity shows once radar readings are logged in 3 or more outings.</p> : null}
          </Section>) : null}
        {sections.outings && r.outings ? <Section id="outings" title="Outings"><OutingsTable rows={r.outings} href={outingHref ? (o) => outingHref(o.game) : undefined} opponents={opponents} /></Section> : null}
        {sections.pitches && r.pitchByPitch ? (
          <Section id="pbp" title="Pitch by pitch">
            {r.pitchByPitch.map((o) => (
              <details key={o.game} className="pq-fold"><summary><h3 style={{ fontSize: "1rem" }}>{dayText(o.date)}</h3><span className="pq-fold-meta">{o.pitches.length} pitches</span></summary>
                <div style={{ marginTop: 10 }}><PitchSeq ps={o.pitches} /></div></details>))}
          </Section>) : null}
      </>)}
    </article>
  );
}
