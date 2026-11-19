// The clean light PDF of an outing report and a season recap (PLAN_reports_recap: "a clean light PDF for print and
// email"), US Letter, drawn with pdf-lib from the same data the pages render. Heat maps print all four layers in both
// views for every pitch together (no switches on paper), with the light ramp validated for print (one hue, monotone,
// the faintest step 2.1:1 on white, cell numbers at least 4.5:1). Standard Helvetica: equal-width digits, no download.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { AtBat, Grid, Heat, Line, MixSlice, OutingRow, Outing, Override, Recap } from "./report_data.ts";
import { WAY_CELLS, cellKey } from "./report_outcomes.ts";

const W = 612, H = 792, M = 44;
const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const INK = hex("#0c0b0e"), INK2 = hex("#33343c"), INK3 = hex("#5f616c"), RULE = hex("#dcdbd5"), PANEL = hex("#f6f5f1"), WHITE = hex("#ffffff");
const RAMP = ["#ecebe6", "#b6b3a5", "#8f8b7b", "#696553", "#46412e", "#26200b"].map(hex);   // 0 = empty cell
const ON = [INK3, INK, INK, WHITE, WHITE, WHITE];
const SPOT: Record<string, string> = { "up-in": "up-in", "up-away": "up-away", "down-in": "down-in", "down-away": "down-away", chase: "chase", middle: "middle", "down-middle": "down-middle" };
// Helvetica's WinAnsi set: keep to it
const clean = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/[^\x20-\x7e–—·éñ]/g, "");
const day = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : iso.startsWith("#") ? `Outing ${+iso.slice(1)}` : iso);
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "-");

class Doc {
  doc!: PDFDocument; page!: PDFPage; f!: PDFFont; b!: PDFFont; y = H - M; n = 0; foot = "";
  static async make(foot: string) { const d = new Doc(); d.doc = await PDFDocument.create(); d.f = await d.doc.embedFont(StandardFonts.Helvetica); d.b = await d.doc.embedFont(StandardFonts.HelveticaBold); d.foot = foot; d.add(); return d; }
  add() {
    this.page = this.doc.addPage([W, H]); this.y = H - M; this.n++;
    this.page.drawText(clean(this.foot), { x: M, y: 24, size: 8, font: this.f, color: INK3 });
    this.page.drawText(`Page ${this.n}`, { x: W - M - this.f.widthOfTextAtSize(`Page ${this.n}`, 8), y: 24, size: 8, font: this.f, color: INK3 });
  }
  need(h: number) { if (this.y - h < M) this.add(); }
  text(s: string, x: number, y: number, size = 9, bold = false, color = INK, maxW?: number) {
    let t = clean(s); const font = bold ? this.b : this.f;
    if (maxW) while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -2) + "…".replace("…", ".");
    this.page.drawText(t, { x, y, size, font, color });
  }
  right(s: string, xr: number, y: number, size = 9, bold = false, color = INK) { const t = clean(s); this.page.drawText(t, { x: xr - (bold ? this.b : this.f).widthOfTextAtSize(t, size), y, size, font: bold ? this.b : this.f, color }); }
  wrap(s: string, size = 9, color = INK2, maxW = W - 2 * M, lead = 12) {
    const words = clean(s).split(/\s+/); let line = "";
    const flush = () => { this.need(lead); this.text(line, M, this.y - size, size, false, color); this.y -= lead; line = ""; };
    for (const w of words) { const t = line ? line + " " + w : w; if (this.f.widthOfTextAtSize(t, size) > maxW) flush(); line = line ? line + " " + w : w; }
    if (line) flush();
  }
  h2(s: string) { this.need(40); this.y -= 14; this.text(s, M, this.y - 13, 13, true); this.y -= 22; }
  rule() { this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.6, color: RULE }); }
}

function header(d: Doc, title: string, sub: string) {
  d.text(title, M, d.y - 22, 22, true); d.y -= 32;
  d.text(sub, M, d.y - 10, 10, false, INK2); d.y -= 22; d.rule(); d.y -= 6;
}
function lineRow(d: Doc, l: Line) {
  const cells: [string, string][] = [["Innings", l.ip], ["Pitches", String(l.pitches)], ["Strikes", `${l.strikes} (${pct(l.strikes, l.pitches)})`], ["Strikeouts", String(l.k)], ["Walks", String(l.bb)], ["Hits", String(l.h)], ["Hard contact", String(l.hard)], ["Batters", String(l.bf)]];
  d.need(54); const w = (W - 2 * M) / cells.length;
  d.page.drawRectangle({ x: M, y: d.y - 48, width: W - 2 * M, height: 48, color: PANEL, borderColor: RULE, borderWidth: 0.6 });
  cells.forEach(([k, v], i) => { d.text(k, M + 8 + i * w, d.y - 14, 7.5, false, INK3); d.text(v, M + 8 + i * w, d.y - 36, v.length > 7 ? 12 : 17, true); });
  d.y -= 58;
}
function mixTable(d: Doc, s: MixSlice) {
  const cols = [["Pitch", M, false], ["Pitches", M + 170, true], ["Share", M + 225, true], ["Strike", M + 290, true], ["Whiff/swing", M + 365, true], ["Hard contact", M + 445, true], ["Pos / neg", W - M, true]] as const;
  d.need(30); cols.forEach(([t, x, r]) => (r ? d.right(t, x, d.y - 10, 8, true, INK3) : d.text(t, x, d.y - 10, 8, true, INK3))); d.y -= 16; d.rule();
  const rate = (r: { num: number; den: number; pct: number | null }) => (r.den === 0 ? "-" : r.pct === null ? `${r.num} of ${r.den}` : `${Math.round(100 * r.pct)}% (${r.num}/${r.den})`);
  for (const r of s.rows) {
    d.need(16);
    d.text(`${r.name} (${r.kind})`, M, d.y - 11, 9, true);
    d.right(String(r.n), M + 170, d.y - 11); d.right(r.share.pct === null ? "-" : `${Math.round(100 * r.share.pct)}%`, M + 225, d.y - 11);
    d.right(rate(r.strikes), M + 290, d.y - 11); d.right(rate(r.whiffs), M + 365, d.y - 11); d.right(rate(r.hard), M + 445, d.y - 11); d.right(`${r.positive} / ${r.negative}`, W - M, d.y - 11);
    d.y -= 15;
  }
  d.y -= 4; d.wrap("Rates show once a pitch has 10 pitches; under that, the counts. Whiff/swing: swinging strikes over swings. Hard contact: over balls in play with contact logged.", 7.5, INK3);
}
function heatMaps(d: Doc, heat: Heat) {
  const all = heat.filters[0]; if (!all || !all.n) return;
  const cell = 14, gap = 1.5, size = 7 * cell + 6 * gap, layers = [["strike", "Strikes"], ["ball", "Balls"], ["positive", "Positive"], ["negative", "Negative"]] as const;
  const colW = (W - 2 * M) / 4;
  for (const view of ["called", "landed"] as const) {
    const g: Grid = all[view];
    d.need(size + 40);
    d.text(view === "called" ? `Where it was called (all ${all.n} pitches)` : `Where it landed (${g.counted} of ${all.n}; ${g.left} with no landing spot logged)`, M, d.y - 10, 9, true, INK2); d.y -= 18;
    layers.forEach(([l, label], li) => {
      const x0 = M + li * colW + (colW - size) / 2, y0 = d.y;
      const max = Math.max(0, ...Object.values(g.cells).map((c) => c[l]));
      d.text(label, M + li * colW + (colW - d.b.widthOfTextAtSize(label, 8)) / 2, y0 - 8, 8, true, INK3);
      for (let r = -1; r <= 5; r++) for (let c = -1; c <= 5; c++) {
        const inG = r >= 0 && r <= 4 && c >= 0 && c <= 4, way = WAY_CELLS.some(([a, b]) => a === r && b === c);
        if (!inG && !(way && view === "landed")) continue;
        const v = (g.cells[cellKey(r, c)] || { strike: 0, ball: 0, positive: 0, negative: 0 })[l];
        const st = v <= 0 || !max ? 0 : Math.max(1, Math.ceil((5 * v) / max));
        const x = x0 + (c + 1) * (cell + gap), y = y0 - 14 - (r + 2) * (cell + gap);
        d.page.drawRectangle({ x, y, width: cell, height: cell, color: RAMP[st] });
        if (v) { const t = String(v), fs = 6.5; d.page.drawText(t, { x: x + (cell - d.b.widthOfTextAtSize(t, fs)) / 2, y: y + 4.2, size: fs, font: d.b, color: ON[st] }); }
      }
      // the zone box
      d.page.drawRectangle({ x: x0 + 2 * (cell + gap) - 0.75, y: y0 - 14 - 5 * (cell + gap) + gap - 0.75, width: 3 * cell + 2 * gap + 1.5, height: 3 * cell + 2 * gap + 1.5, borderColor: INK, borderWidth: 1 });
    });
    d.y -= size + 26;
  }
  d.wrap("Catcher's view; the box is the strike zone; the outer cells (landed) are way off. Each map counts its layer's pitches per cell; shading is relative to that map. Positive: whiffs, called strikes, fouls, weak contact, outs in play. Negative: hard contact, hits, ball four, hit by pitch.", 7.5, INK3);
}
function atBats(d: Doc, abs: AtBat[], who: (a: AtBat) => string) {
  for (const a of abs) {
    const seq = a.pitches.map((p) => `${p.count} ${p.pitch}${p.quad ? " " + (SPOT[p.quad] || p.quad) : ""}: ${p.text}${p.called ? ` (called ${p.called})` : ""}`).join("  /  ");
    d.need(30);
    d.text(`${who(a)}${a.inning ? `, inning ${a.inning}` : ""}${a.side ? `, bats ${a.side}` : ""}`, M, d.y - 10, 9, true); d.right(a.resultText, W - M, d.y - 10, 9, true, a.negative ? hex("#9a3f0e") : INK); d.y -= 14;
    d.wrap(seq, 8, INK2, W - 2 * M, 11); d.y -= 3;
  }
}
function overrides(d: Doc, ovs: Override[]) {
  if (!ovs.length) { d.wrap("No coach calls, shake-offs or cross-ups.", 9); return; }
  for (const o of ovs) {
    const what = o.kind === "coach" ? "Coach's call" : o.kind === "shake" ? "Shake-off, then the re-call" : "Cross-up";
    const had = o.kind === "shake" ? `shaken: ${o.shaken.map((s) => `${s.pitch} ${s.quad}`).join(", ") || "-"}` : o.engineTop.length ? `engine had ${o.engineTop.map((m) => `${m.pitch} ${m.quad} ${Math.round(100 * m.share)}%`).join(", ")}` : "engine mix not logged";
    d.wrap(`Pitch ${o.n} (${o.count}), ${what}: threw ${o.thrown}${o.kind === "cross" ? ` (called ${o.called})` : ""}; ${had}. ${o.result}. ${o.restOfAtBat.pitches ? `Then ${o.restOfAtBat.pitches} more (${o.restOfAtBat.positive} positive, ${o.restOfAtBat.negative} negative). ` : ""}${o.restOfAtBat.result}`, 8.5, INK2);
  }
}
function outingsTable(d: Doc, rows: OutingRow[], opp?: Map<string, string | null>) {
  d.need(30); const cols = [["Date", M], ["IP", M + 230], ["Pitches", M + 280], ["Strike", M + 330], ["K", M + 370], ["BB", M + 405], ["H", M + 440], ["Hard", W - M]] as const;
  cols.forEach(([t, x], i) => (i ? d.right(t, x, d.y - 10, 8, true, INK3) : d.text(t, x, d.y - 10, 8, true, INK3))); d.y -= 16; d.rule();
  for (const o of rows) {
    d.need(15); const L = o.line;
    d.text(`${day(o.date)}${opp && opp.get(o.game) ? ` vs ${opp.get(o.game)}` : ""}`, M, d.y - 11, 9, false, INK, 220);
    [L.ip, String(L.pitches), pct(L.strikes, L.pitches), String(L.k), String(L.bb), String(L.h), String(L.hard)].forEach((v, i) => d.right(v, cols[i + 1][1], d.y - 11));
    d.y -= 15;
  }
}

export async function outingPdf(r: Outing, c: { pitcher: string; opponent: string | null; level: string | null; team?: string; notes: { scope: string; at_bat: string | null; body: string }[]; hitterName: (a: AtBat) => string }) {
  const d = await Doc.make(`PitchIQ outing report · ${c.pitcher} · ${day(r.game.date)}`);
  header(d, c.pitcher, `Outing report · ${day(r.game.date)}${c.opponent ? ` vs ${c.opponent}` : ""}${c.level ? ` · ${c.level.replace("college_", "College ").toUpperCase().replace("COLLEGE ", "College ")}` : ""}`);
  lineRow(d, r.line);
  d.wrap(`First-pitch strikes ${r.line.firstStrikes} of ${r.line.firstPitches}. Positive outcomes ${r.line.positive}, negative ${r.line.negative}. Landing spot logged on ${r.completeness.located} of ${r.completeness.pitches} pitches; contact on ${r.completeness.contact} of ${r.completeness.bip} balls in play.`, 8.5);
  d.h2("Pitch mix and results"); mixTable(d, r.mix.all);
  d.h2("Heat maps, every pitch"); heatMaps(d, r.heat);
  d.h2("Hitter by hitter"); atBats(d, r.atBats, c.hitterName);
  if (r.view === "staff") { d.h2("Overrides and style (staff only)"); overrides(d, r.overrides || []); d.wrap("Style notes: none yet (the style layer isn't on).", 8.5, INK3); }
  d.h2("Outcome tracking"); d.wrap("Coming soon.", 9, INK3);
  const notes = c.notes.filter((n) => n.body);
  d.h2(r.view === "staff" ? "Notes" : "Notes from your coaches");
  if (!notes.length) d.wrap("None.", 9, INK3);
  for (const n of notes) d.wrap(`${n.scope === "atbat" ? `At-bat from pitch ${n.at_bat}: ` : ""}${n.body}`, 9, INK2);
  return d.doc.save();
}

export async function recapPdf(r: Partial<Recap> & { meta: Recap["meta"] }, sections: { summary: boolean; heat: boolean; pitches: boolean; outings: boolean }, c: { title: string; team?: string; opp?: Map<string, string | null> }) {
  const m = r.meta;
  const d = await Doc.make(`PitchIQ season recap · ${c.title} · ${m.season}`);
  header(d, c.title, `${m.final ? `${m.season}, final recap` : "Season so far"}${c.team ? ` · ${c.team}` : ""} · ${m.outings} outing${m.outings === 1 ? "" : "s"}`);
  if (sections.summary && r.line) {
    lineRow(d, r.line);
    if (r.comparison) {
      const cm = r.comparison, p1 = (x: number | null) => (x === null ? "-" : `${(100 * x).toFixed(1)}%`);
      d.wrap(`Strikeouts per batter ${p1(cm.k.pct)}${cm.levelK !== null ? ` (${cm.label} average ${p1(cm.levelK)})` : ""}. Walks per batter ${p1(cm.bb.pct)}${cm.levelBB !== null ? ` (${p1(cm.levelBB)})` : ""}. Average against ${cm.avg.pct === null ? "-" : cm.avg.pct.toFixed(3).replace(/^0/, "")}${cm.levelAVG !== null ? ` (${cm.levelAVG.toFixed(3).replace(/^0/, "")})` : ""}. Level averages: public level data.`, 8.5);
    }
  }
  if (sections.summary && r.pitchMix) { d.h2("Pitch mix and results"); mixTable(d, r.pitchMix.all); }
  if (sections.heat && r.heat) { d.h2("Heat maps, every pitch"); heatMaps(d, r.heat); }
  if (sections.summary && r.trends) {
    d.h2("Across his outings");
    for (const t of r.trends.rows) { d.need(14); d.text(day(t.date), M, d.y - 10, 9); d.right(`${t.pitches} pitches`, M + 260, d.y - 10); d.right(`strikes ${t.strikePct.pct === null ? "-" : Math.round(100 * t.strikePct.pct) + "%"}`, M + 360, d.y - 10); d.right(`whiff/swing ${t.whiffPct.pct === null ? "-" : Math.round(100 * t.whiffPct.pct) + "%"}`, M + 470, d.y - 10); if (r.trends.showVelo && t.velo) d.right(`${t.velo.toFixed(1)} mph`, W - M, d.y - 10); d.y -= 14; }
  }
  if (sections.outings && r.outings) { d.h2("Outings"); outingsTable(d, r.outings, c.opp); }
  if (sections.pitches && r.pitchByPitch) {
    d.h2("Pitch by pitch");
    for (const o of r.pitchByPitch) { d.need(24); d.text(day(o.date), M, d.y - 10, 9, true); d.y -= 14; d.wrap(o.pitches.map((p) => `${p.count} ${p.pitch}: ${p.text}`).join("  /  "), 7.5, INK2, W - 2 * M, 10); d.y -= 4; }
  }
  return d.doc.save();
}
