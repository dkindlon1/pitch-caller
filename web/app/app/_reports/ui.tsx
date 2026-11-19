import Link from "next/link";
import type { ReactNode } from "react";
import { COUNT_GROUPS, COUNT_GROUP_HINT, COUNT_GROUP_LABEL, MIN_SAMPLE, WAY_CELLS, cellKey, zoneOfCell, type Rate } from "@/lib/report_outcomes.ts";
import type { AbPitch, AtBat, Comparison, Grid, Heat, HeatFilter, Hurt, Line, Mix, MixRow, MixSlice, OutingRow, Override, Trend, Worked } from "@/lib/report_data.ts";
import { HeatSwitch, Slices } from "./switch";
import "./reports.css";

// The report's blocks, rendered on the server. Every number carries data-k (what it is) and data-v (its raw value), so
// scripts/report_check.js can read each one and recompute it from the raw events. A rate on fewer than 10 of that
// pitch shows its counts only.

const KINDS6 = ["FB", "SI", "FC", "SL", "CB", "CH"];
export const kindCls = (k: string) => `k-${KINDS6.includes(k) ? k : "FB"}`;
export const Chip = ({ kind }: { kind: string }) => <i className={`chip ${kindCls(kind)}`} aria-hidden="true">{KINDS6.includes(kind) ? kind : "?"}</i>;
export const dayText = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { ...opts, timeZone: "UTC" }) : iso.startsWith("#") ? `Outing ${+iso.slice(1)}` : iso;
const pct = (r: Rate) => (r.pct === null ? null : `${Math.round(100 * r.pct)}%`);
const rv = (r: Rate) => `${r.num}/${r.den}`;
export const SPOT: Record<string, string> = { "up-in": "up and in", "up-away": "up and away", "down-in": "down and in", "down-away": "down and away", chase: "chase", middle: "middle", "down-middle": "down the middle" };
const PA_SHORT: Record<string, string> = { k: "K", walk: "BB", hbp: "HBP", hit: "Hit", out: "Out", open: "–" };

export function Section({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return <section className="rp-sec" aria-labelledby={`h-${id}`}><header><h2 id={`h-${id}`}>{title}</h2>{aside}</header>{children}</section>;
}

/** A rate cell: the share when there's enough of that pitch, else the counts; data-v is always num/den. */
function RateTd({ k, r, n }: { k: string; r: Rate; n: number }) {
  const p = pct(r);
  if (r.den === 0) return <td className="num thin" data-k={k} data-v={rv(r)}>–</td>;
  return <td className="num" data-k={k} data-v={rv(r)}>{p ? <>{p}<small>{r.num}/{r.den}</small></> : <span className="thin" title={`Fewer than ${MIN_SAMPLE} of this pitch: counts only`}>{r.num} of {r.den}</span>}</td>;
}

// ---------------------------------------------------------------- the line
export function LineStrip({ l, k = "line", extra }: { l: Line; k?: string; extra?: ReactNode }) {
  const sp = pct(l.strikePct);
  const cell = (key: keyof Line, label: string, v: ReactNode, raw?: string | number) => <div><dt>{label}</dt><dd data-k={`${k}.${key}`} data-v={String(raw ?? (l[key] as number))}>{v}</dd></div>;
  return (
    <dl className="rp-line">
      {cell("ip", "Innings", l.ip, l.ip)}
      {cell("pitches", "Pitches", l.pitches)}
      {cell("strikes", "Strikes", <>{l.strikes}{sp ? <small>{sp}</small> : null}</>)}
      {cell("k", "Strikeouts", l.k)}
      {cell("bb", "Walks", l.bb)}
      {cell("h", "Hits", l.h)}
      {cell("hard", "Hard contact", l.hard)}
      {extra}
    </dl>
  );
}

// ---------------------------------------------------------------- pitch mix and results
function MixTable({ slice, k, label }: { slice: MixSlice; k: string; label: string }) {
  if (!slice.n) return <p className="rp-empty">No pitches in this group.</p>;
  return (
    <div className="tbl-scroll" tabIndex={0} role="region" aria-label={label}><table className="data-tbl">
      <thead><tr><th scope="col">Pitch</th><th scope="col" className="num">Pitches</th><th scope="col" className="num">Share</th><th scope="col" className="num">Strike</th>
        <th scope="col" className="num">Whiff per swing</th><th scope="col" className="num">Hard contact</th><th scope="col" className="num">Positive</th><th scope="col" className="num">Negative</th></tr></thead>
      <tbody>{slice.rows.map((r: MixRow) => (
        <tr key={r.key}>
          <th scope="row"><span className="pq-pitch"><Chip kind={r.kind} />{r.name}</span></th>
          <td className="num" data-k={`${k}.${r.key}.n`} data-v={r.n}>{r.n}</td>
          <td className="num" data-k={`${k}.${r.key}.share`} data-v={rv(r.share)}>{pct(r.share)}</td>
          <RateTd k={`${k}.${r.key}.strike`} r={r.strikes} n={r.n} />
          <RateTd k={`${k}.${r.key}.whiff`} r={r.whiffs} n={r.n} />
          <RateTd k={`${k}.${r.key}.hard`} r={r.hard} n={r.n} />
          <td className="num" data-k={`${k}.${r.key}.pos`} data-v={r.positive}>{r.positive}</td>
          <td className="num" data-k={`${k}.${r.key}.neg`} data-v={r.negative}>{r.negative}</td>
        </tr>))}</tbody>
    </table></div>
  );
}
export function MixBlock({ mix, hand }: { mix: Mix; hand?: string | null }) {
  const items = [{ key: "all", label: `All (${mix.all.n})` }, ...COUNT_GROUPS.map((g) => ({ key: `g-${g}`, label: `${COUNT_GROUP_LABEL[g]} (${mix.byGroup[g].n})` })),
    { key: "s-L", label: `vs left (${mix.bySide.L.n})` }, { key: "s-R", label: `vs right (${mix.bySide.R.n})` }];
  return (
    <>
      <Slices label="Count group or hitter side" items={items}>
        <div data-slice="all"><MixTable slice={mix.all} k="mix.all" label="Every pitch" /></div>
        {COUNT_GROUPS.map((g) => <div key={g} data-slice={`g-${g}`} hidden><p className="rp-note">{COUNT_GROUP_LABEL[g]}: {COUNT_GROUP_HINT[g]}.</p><MixTable slice={mix.byGroup[g]} k={`mix.g-${g}`} label={COUNT_GROUP_LABEL[g]} /></div>)}
        {(["L", "R"] as const).map((s) => <div key={s} data-slice={`s-${s}`} hidden><MixTable slice={mix.bySide[s]} k={`mix.s-${s}`} label={s === "L" ? "Left-handed hitters" : "Right-handed hitters"} /></div>)}
      </Slices>
      <p className="rp-note">Whiff per swing counts swinging strikes over swings; hard contact is over balls in play with contact logged. A share shows once a pitch has {MIN_SAMPLE} pitches in the slice; under that, the counts.{mix.bySide.unknown ? ` ${mix.bySide.unknown} pitch${mix.bySide.unknown === 1 ? " has" : "es have"} no hitter side logged.` : ""}{hand ? "" : ""}</p>
    </>
  );
}

// ---------------------------------------------------------------- heat maps
const LAYERS = ["strike", "ball", "positive", "negative"] as const;
function steps(g: Grid) {
  const max: Record<string, number> = {};
  for (const l of LAYERS) max[l] = Math.max(0, ...Object.values(g.cells).map((c) => c[l]));
  return (v: number, l: string) => (v <= 0 || !max[l] ? 0 : Math.max(1, Math.ceil((5 * v) / max[l])));
}
const CELL_NAME = (r: number, c: number) => {
  const z = zoneOfCell(r, c);
  if (z === "way") return r < 0 ? "Way off, high" : r > 4 ? "Way off, in the dirt" : c < 0 ? "Way off, left" : "Way off, right";
  const row = ["Top", "Up", "Middle", "Down", "Bottom"][r], col = ["far left", "left", "center", "right", "far right"][c];
  return `${z === "heart" ? "Heart" : z === "edge" ? "Edge" : "Just off"}, ${row.toLowerCase()} ${col}`;
};
function MapGrid({ g, k, view, caption }: { g: Grid; k: string; view: "called" | "landed"; caption: string }) {
  const step = steps(g), cells: ReactNode[] = [];
  for (let r = -1; r <= 5; r++) for (let c = -1; c <= 5; c++) {
    const inGrid = r >= 0 && r <= 4 && c >= 0 && c <= 4, way = WAY_CELLS.some(([a, b]) => a === r && b === c);
    const style = { gridRow: r + 2, gridColumn: c + 2 } as Record<string, string | number>;
    if (!inGrid && !way) continue;
    if (view === "called" && way) continue;   // a call is never "way off"
    const key = cellKey(r, c), x = g.cells[key] || { n: 0, strike: 0, ball: 0, positive: 0, negative: 0 };
    for (const l of LAYERS) { const s = step(x[l], l); style[`--bg-${l}`] = `var(--ramp-${s})`; style[`--fg-${l}`] = s ? `var(--on-${s})` : "var(--text-4)"; }
    cells.push(
      <div key={key} role="img" className={`rp-cell ${way ? "way" : "zone"}`} style={style} data-s1="" data-k={`${k}.${key}`} data-v={`${x.n},${x.strike},${x.ball},${x.positive},${x.negative}`}
        data-tip={CELL_NAME(r, c)} tabIndex={x.n ? 0 : -1} aria-label={`${CELL_NAME(r, c)}: ${x.n} pitches, ${x.strike} strikes, ${x.ball} balls, ${x.positive} positive, ${x.negative} negative`}>
        {LAYERS.map((l) => <span key={l} className={`v ${l}${x[l] ? "" : " zero"}`} aria-hidden="true">{x[l] || (x.n ? "0" : "")}</span>)}
      </div>);
  }
  return (
    <figure className={`rp-map ${view}`} style={{ margin: 0 }}>
      <div className="rp-grid" role="group" aria-label={caption}>
        {cells}<div className="rp-zone-frame" aria-hidden="true" /><div className="rp-plate" aria-hidden="true" />
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
export function HeatBlock({ heat, k = "heat" }: { heat: Heat; k?: string }) {
  const all = heat.filters[0];
  if (!all || !all.n) return <p className="rp-empty">No pitches to map.</p>;
  const filters = heat.filters.map((f: HeatFilter) => ({ key: f.key, label: f.key === "all" ? "All" : <><span className="sr">{f.name}</span><Chip kind={f.kind} /><span aria-hidden="true">{f.name}</span></> }));
  return (
    <HeatSwitch filters={filters}>
      {heat.filters.map((f) => (
        <div key={f.key} className="rp-filter" data-filter={f.key} {...(f.key === "all" ? { "data-on": "" } : {})}>
          <div className="rp-heat">
            <div className="rp-maps">
              <MapGrid g={f.called} k={`${k}.${f.key}.called`} view="called" caption={`${f.name}: where each was called (${f.called.counted})`} />
              <MapGrid g={f.landed} k={`${k}.${f.key}.landed`} view="landed" caption={`${f.name}: where each landed (${f.landed.counted})`} />
            </div>
            <div className="rp-heatnote">
              <div className="rp-legend" aria-hidden="true"><span>Fewer</span><span className="steps">{[1, 2, 3, 4, 5].map((s) => <i key={s} style={{ background: `var(--ramp-${s})` }} />)}</span><span>More</span></div>
              <p className="rp-left rp-only called">Every one of the <b data-k={`${k}.${f.key}.n`} data-v={f.n}>{f.n}</b> pitches has a called spot{f.called.left ? <>, except <b data-k={`${k}.${f.key}.called.left`} data-v={f.called.left}>{f.called.left}</b> logged before spots were exact</> : <span hidden data-k={`${k}.${f.key}.called.left`} data-v={0} />}.</p>
              <p className="rp-left rp-only landed">{f.landed.left
                ? <><b data-k={`${k}.${f.key}.landed.left`} data-v={f.landed.left}>{f.landed.left}</b> of {f.n} pitches have no landing spot logged, so they're only in &ldquo;where it was called&rdquo;.</>
                : <>Every pitch has its landing spot logged.<span hidden data-k={`${k}.${f.key}.landed.left`} data-v={0} /></>}</p>
              <p className="rp-note">Catcher&rsquo;s view. The box is the strike zone; the round cells are &ldquo;way off&rdquo;. Each cell counts the pitches in the layer you picked: strikes, balls, positive outcomes (whiffs, called strikes, fouls, weak contact, outs in play) or negative ones (hard contact, hits, ball four, hit by pitch). Shading is relative to this map.</p>
            </div>
          </div>
        </div>))}
    </HeatSwitch>
  );
}

// ---------------------------------------------------------------- hitter by hitter
export function PitchSeq({ ps, showChoice }: { ps: AbPitch[]; showChoice?: boolean }) {
  return (
    <ol className="rp-seq">{ps.map((p) => (
      <li key={p.n} className={p.positive ? "pos" : p.negative ? "neg" : ""} title={`Pitch ${p.n}${p.quad ? `, called ${SPOT[p.quad] || p.quad}` : ""}`}>
        <span className="c">{p.count}</span><Chip kind={p.kind} /><span>{p.pitch}{p.quad ? `, ${SPOT[p.quad] || p.quad}` : ""}</span><span className="tag">{p.text}</span>
        {p.called ? <span className="rp-mark" title={`Called ${p.called}, threw ${p.pitch}`}>cross-up</span> : null}
        {p.shaken ? <span className="rp-mark">after a shake-off</span> : null}
        {showChoice && p.choice === "coach" ? <span className="rp-mark">coach&rsquo;s call</span> : null}
        <span className="sr">{p.positive ? " (positive)" : p.negative ? " (negative)" : ""}</span>
      </li>))}</ol>
  );
}
export function AtBatList({ abs, who, notes, k = "ab" }: { abs: AtBat[]; who: (a: AtBat) => ReactNode; notes?: (a: AtBat) => ReactNode; k?: string }) {
  if (!abs.length) return <p className="rp-empty">No at-bats.</p>;
  return (
    <ol className="rp-abs">{abs.map((a) => (
      <li key={a.game + a.key} className="rp-ab">
        <header>
          <span className="who">{who(a)}</span>
          <span className="meta">{a.inning ? `Inning ${a.inning}` : ""}{a.side ? ` · bats ${a.side === "L" ? "left" : "right"}` : ""} · <span data-k={`${k}.${a.game}.${a.key}.n`} data-v={a.pitches.length}>{a.pitches.length}</span> pitch{a.pitches.length === 1 ? "" : "es"}</span>
          <span className={`res${a.result === "hit" || a.result === "walk" || a.result === "hbp" || a.hard ? " neg" : ""}`} data-k={`${k}.${a.game}.${a.key}.result`} data-v={a.result}>{a.resultText}</span>
        </header>
        <PitchSeq ps={a.pitches} showChoice={a.hitterId !== undefined} />
        {notes ? notes(a) : null}
      </li>))}</ol>
  );
}

export function WorkedHurt({ worked, hurt, hitterName }: { worked: Worked[]; hurt: Hurt[]; hitterName: (h: Hurt) => ReactNode }) {
  return (
    <div className="rp-pair">
      <div className="rp-card"><h3 style={{ fontSize: "1rem", marginBottom: 10 }}>What worked</h3>
        {worked.length ? <ul className="rp-list">{worked.map((w) => (
          <li key={w.pitch}><Chip kind={w.kind} /><span>{w.pitch}<br /><span className="why">{[w.whiffs && `${w.whiffs} whiff${w.whiffs === 1 ? "" : "s"}`, w.called && `${w.called} called`, w.weak && `${w.weak} weak contact`].filter(Boolean).join(", ") || "fouls and outs in play"}</span></span>
            <span className="n">{w.positive} of {w.n}</span></li>))}</ul> : <p className="rp-note">No positive outcomes.</p>}
      </div>
      <div className="rp-card"><h3 style={{ fontSize: "1rem", marginBottom: 10 }}>Who hurt us</h3>
        {hurt.length ? <ul className="rp-list">{hurt.map((h) => (
          <li key={h.key}><span>{hitterName(h)}<br /><span className="why">{[h.hits && `${h.hits} hit${h.hits === 1 ? "" : "s"}`, h.hard && `${h.hard} hard contact`, h.walks && `${h.walks} walk${h.walks === 1 ? "" : "s"}`, h.hbp && "hit by pitch"].filter(Boolean).join(", ")}</span></span>
            <span className="n">{h.negative}</span></li>))}</ul> : <p className="rp-note">Nobody: no negative outcomes.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- overrides and style (staff)
const OV_KIND: Record<string, string> = { coach: "Coach's call", shake: "Shake-off, then the re-call", cross: "Cross-up" };
export function OverridesBlock({ ovs, who }: { ovs: (Override & { pitcher?: string })[]; who?: boolean }) {
  if (!ovs.length) return <p className="rp-empty">No coach calls, shake-offs or cross-ups: every pitch was the engine&rsquo;s call, thrown as called.</p>;
  return (
    <div className="tbl-scroll" tabIndex={0} role="region" aria-label="Overrides"><table className="data-tbl rp-ov">
      <thead><tr><th scope="col" className="num">Pitch</th>{who ? <th scope="col">Pitcher</th> : null}<th scope="col">What</th><th scope="col">Count</th><th scope="col">The engine had</th><th scope="col">Thrown</th><th scope="col">That pitch</th><th scope="col">Rest of the at-bat</th></tr></thead>
      <tbody>{ovs.map((o, i) => (
        <tr key={i} data-k={`ov.${o.game}.${o.n}.${o.kind}`} data-v={o.kind}>
          <td className="num n">{o.n}</td>{who ? <td className="who" data-l="Pitcher">{o.pitcher}</td> : null}
          <td className="what">{OV_KIND[o.kind]}</td><td className="num cnt">{o.count}</td>
          <td className="had" data-l={o.kind === "shake" ? "Shaken off" : "The engine had"}>{o.kind === "shake" ? (o.shaken.length ? o.shaken.map((s) => `${s.pitch} ${SPOT[s.quad] || s.quad}`).join(", ") : "–")
            : o.engineTop.length ? o.engineTop.map((m) => `${m.pitch} ${SPOT[m.quad] || m.quad} ${Math.round(m.share * 100)}%`).join(" · ") : <span className="thin">Not logged (older app)</span>}</td>
          <td className="thr" data-l="Thrown">{o.kind === "cross" ? `${o.thrown} (called ${o.called})` : `${o.thrown}${o.calledQuad ? `, ${SPOT[o.calledQuad] || o.calledQuad}` : ""}`}</td>
          <td className={`res${o.negative ? " neg" : ""}`} data-l="That pitch">{o.result}</td>
          <td className="rest" data-l="Rest of the at-bat">{o.restOfAtBat.pitches ? `${o.restOfAtBat.pitches} more: ${o.restOfAtBat.positive} positive, ${o.restOfAtBat.negative} negative. ` : ""}{o.restOfAtBat.result}</td>
        </tr>))}</tbody>
    </table></div>
  );
}

// ---------------------------------------------------------------- recap: trends, comparison, outings
export function TrendChart({ rows, field, label, levelRef }: { rows: Trend[]; field: "strikePct" | "whiffPct" | "velo"; label: string; levelRef?: number | null }) {
  const pts = rows.map((r, i) => ({ i, date: r.date, v: field === "velo" ? r.velo : (r[field] as Rate).pct === null ? null : 100 * ((r[field] as Rate).pct as number), r }));
  const vals = pts.map((p) => p.v).filter((v): v is number => v !== null);
  if (vals.length < 2) return <p className="rp-empty">{label}: needs two outings with it logged.</p>;
  const W = 560, H = 200, L = 40, R = 14, T = 12, B = 28;
  const lo = field === "velo" ? Math.floor(Math.min(...vals) - 1) : 0, hi = field === "velo" ? Math.ceil(Math.max(...vals) + 1) : Math.max(60, Math.ceil(Math.max(...vals) / 10) * 10);
  const X = (i: number) => L + (pts.length === 1 ? (W - L - R) / 2 : (i / (pts.length - 1)) * (W - L - R)), Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [lo, (lo + hi) / 2, hi];
  const path = pts.filter((p) => p.v !== null).map((p, j) => `${j ? "L" : "M"}${X(p.i).toFixed(1)},${Y(p.v as number).toFixed(1)}`).join(" ");
  const unit = field === "velo" ? " mph" : "%";
  return (
    <figure className="rp-trend" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} by outing: ${pts.map((p) => `${dayText(p.date, { month: "short", day: "numeric" })} ${p.v === null ? "not enough" : Math.round(p.v) + unit}`).join(", ")}`}>
        {ticks.map((t) => <g key={t}><line className="ax" x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} /><text className="tick" x={L - 6} y={Y(t) + 4} textAnchor="end">{Math.round(t)}{unit === "%" ? "%" : ""}</text></g>)}
        {levelRef != null ? <line className="ref" x1={L} x2={W - R} y1={Y(levelRef)} y2={Y(levelRef)} /> : null}
        <path className="ln" d={path} />
        {pts.map((p) => p.v === null ? null : <g key={p.i}><circle className="dot" cx={X(p.i)} cy={Y(p.v)} r={4.5}><title>{`${dayText(p.date)}: ${field === "velo" ? (p.v as number).toFixed(1) + " mph" : `${Math.round(p.v)}% (${(p.r[field] as Rate).num} of ${(p.r[field] as Rate).den})`}`}</title></circle></g>)}
        {pts.length <= 14 ? pts.map((p) => <text key={"x" + p.i} className="tick" x={X(p.i)} y={H - 8} textAnchor={pts.length > 1 && p.i === 0 ? "start" : pts.length > 1 && p.i === pts.length - 1 ? "end" : "middle"}>{p.date.startsWith("#") ? `#${+p.date.slice(1)}` : dayText(p.date, { month: "numeric", day: "numeric" })}</text>) : null}
      </svg>
      <figcaption className="rp-note">{label} per outing{field === "velo" ? ", from the radar readings logged" : ", every outing counted (no 10-pitch rule on a whole outing)"}.</figcaption>
    </figure>
  );
}
export function CompareBlock({ c }: { c: Comparison }) {
  const row = (key: string, label: string, r: Rate, lvl: number | null, fmt: (x: number) => string) => (
    <div><dt>{label}</dt><dd><b data-k={`cmp.${key}`} data-v={rv(r)}>{r.pct === null ? "–" : fmt(r.pct)}</b><span>{lvl === null ? "" : `${c.label} average ${fmt(lvl)}`}</span></dd>
      <dd className="rp-note">{r.num} of {r.den}</dd></div>);
  return (
    <>
      <dl className="rp-cmp">
        {row("k", "Strikeouts per batter", c.k, c.levelK, (x) => `${(100 * x).toFixed(1)}%`)}
        {row("bb", "Walks per batter", c.bb, c.levelBB, (x) => `${(100 * x).toFixed(1)}%`)}
        {row("avg", "Batting average against", c.avg, c.levelAVG, (x) => x.toFixed(3).replace(/^0/, ""))}
      </dl>
      <p className="rp-note">{c.label ? `Level averages are public level data (${c.label}), the same numbers the engine starts from; not other PitchIQ teams.` : "No level set for this team, so no comparison."} At-bats against: batters faced minus walks and hit batters (sacrifices aren&rsquo;t charted).</p>
    </>
  );
}
export function OutingsTable({ rows, href, opponents }: { rows: OutingRow[]; href?: (r: OutingRow) => string; opponents?: Map<string, string | null> }) {
  if (!rows.length) return <p className="rp-empty">No outings in this season yet.</p>;
  return (
    <div className="tbl-scroll" tabIndex={0} role="region" aria-label="Outing list table"><table className="data-tbl">
      <thead><tr><th scope="col">Date</th>{opponents ? <th scope="col">Opponent</th> : null}<th scope="col" className="num">IP</th><th scope="col" className="num">Pitches</th><th scope="col" className="num">Strike</th><th scope="col" className="num">K</th><th scope="col" className="num">BB</th><th scope="col" className="num">H</th><th scope="col" className="num">Hard</th></tr></thead>
      <tbody>{rows.map((o) => (
        <tr key={o.game}>
          <th scope="row">{href ? <Link href={href(o)}>{dayText(o.date)}</Link> : dayText(o.date)}</th>
          {opponents ? <td>{opponents.get(o.game) || "–"}</td> : null}
          <td className="num" data-k={`out.${o.game}.ip`} data-v={o.line.ip}>{o.line.ip}</td><td className="num" data-k={`out.${o.game}.pitches`} data-v={o.line.pitches}>{o.line.pitches}</td>
          <td className="num" data-k={`out.${o.game}.strike`} data-v={rv(o.line.strikePct)}>{pct(o.line.strikePct)}</td>
          <td className="num" data-k={`out.${o.game}.k`} data-v={o.line.k}>{o.line.k}</td><td className="num" data-k={`out.${o.game}.bb`} data-v={o.line.bb}>{o.line.bb}</td>
          <td className="num" data-k={`out.${o.game}.h`} data-v={o.line.h}>{o.line.h}</td><td className="num" data-k={`out.${o.game}.hard`} data-v={o.line.hard}>{o.line.hard}</td>
        </tr>))}</tbody>
    </table></div>
  );
}

export function Completeness({ c }: { c: { pitches: number; located: number; bip: number; contact: number; mixLogged: number }; }) {
  return <p className="rp-note">Logged: landing spot on {c.located} of {c.pitches} pitches; contact quality on {c.contact} of {c.bip} balls in play.</p>;
}
export const paShort = (r: string) => PA_SHORT[r] || r;
