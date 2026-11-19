// Outing reports, the game summary, the season recap and a hitter's at-bats (docs/PLAN_reports_recap_2026-11-18.md
// 2-4), built straight from the raw pitch events, the same rows the learner replays. Nothing here is stored; the
// frozen final recap is this module's output saved once. Every outcome comes from report_outcomes.ts. Pure and
// JSON-safe: report_data.test.ts checks it, and scripts/report_check.js recomputes every number shown by a separate
// code path.
//
// Views: "staff" sees everything; "pitcher" (his own report, through pc_my_report) and "public" never get who chose a
// call, the engine's mix, overrides, hitters' identities or coach notes. The database already leaves those fields out
// for those views; this module also never builds the sections that need them unless the view is "staff".
import {
  COUNT_GROUPS, HITS, calledCell, cellKey, countGroup, countOf, hitterSide, isResult, landedCell, outcome, rate, share, thrownKey, thrownName,
  type CountGroup, type Outcome, type Rate,
} from "./report_outcomes.ts";

export type View = "staff" | "pitcher" | "public";
export type PitchInfo = { id?: string | null; name?: string | null; kind?: string | null };
export type GameMeta = { id: string; date: string; opponent?: string | null; opponentId?: string | null; level?: string | null; status?: string | null };
// a raw event doc, as logged (only the fields reports read)
export type Ev = {
  id?: string; gameId?: string; n?: number; seq?: number; type?: string; pitcherId?: string | null; pitchId?: string | null; pitchName?: string; kind?: string;
  thrown?: string; thrownId?: string; quad?: string; bs?: string; ph?: string; count?: string; outs?: number; inning?: number; slot?: number;
  res?: string; out?: string; contact?: string; loc?: string; locCell?: unknown; wp?: string; end?: boolean; paEnd?: string | null; runs?: number;
  choice?: string; coach?: boolean; prob?: number | null; shaken?: [string, string][]; mix?: [string | null, string, string, number][];
  styleApplied?: string; hitterId?: string | null; recall?: boolean; radar?: number; v08?: { radar?: number } | null;
  sit?: { balls?: number; strikes?: number; outs?: number; bases?: boolean[]; batters_faced?: number; same_side?: boolean } | null;
  ars?: { name?: string; kind?: string }[]; deletedAt?: number | null; legacy?: boolean; play?: string; afterPitch?: number;
};

// ---------------------------------------------------------------- the pitches a report counts
/** Pitches only (plays between pitches aren't pitches), not deleted, not migrated legacy rows, with a real result; in pitch order. */
export function pitchesOf(evs: Ev[]): Ev[] {
  return evs.filter((e) => (e.type === undefined || e.type === "pitch") && !e.deletedAt && !e.legacy && isResult(e.res))
    .sort((a, b) => String(a.gameId ?? "").localeCompare(String(b.gameId ?? "")) || (Number(a.n) || 0) - (Number(b.n) || 0) || (Number(a.seq) || 0) - (Number(b.seq) || 0));
}
const OUT_PLAYS = new Set(["cs", "pickoff", "out_on_bases"]);   // an out made between pitches counts for the pitcher on the mound

// ---------------------------------------------------------------- pitch names and kinds
export type PitchKey = { key: string; name: string; kind: string };
export function pitchResolver(pitches: PitchInfo[] = []) {
  const byId = new Map<string, PitchInfo>(), byName = new Map<string, PitchInfo>();
  for (const p of pitches) { if (p.id) byId.set(String(p.id), p); if (p.name) byName.set(String(p.name), p); }
  return (e: Ev): PitchKey => {
    const key = thrownKey(e), name = thrownName(e), crossed = !!e.thrown && e.thrown !== e.pitchName;
    const rec = key.startsWith("name:") ? byName.get(key.slice(5)) : byId.get(key) || byName.get(name);
    const snap = (e.ars || []).find((a) => a && a.name === name);
    return { key, name: rec?.name || name, kind: String(rec?.kind || (crossed ? snap?.kind : e.kind) || snap?.kind || "?") };
  };
}

// ---------------------------------------------------------------- the line
export type Line = { pitches: number; strikes: number; balls: number; strikePct: Rate; outs: number; ip: string; bf: number; k: number; bb: number; hbp: number;
  h: number; hard: number; runs: number; whiffs: number; swings: number; whiffPct: Rate; positive: number; negative: number; firstStrikes: number; firstPitches: number };
function outsMade(ps: Ev[], plays: Ev[]): number {
  let outs = 0, prev: Ev | null = null;
  for (const e of ps) {
    const before = typeof e.sit?.outs === "number" ? e.sit.outs : prev && prev.gameId === e.gameId && prev.inning === e.inning && typeof prev.outs === "number" && prev.outs < 3 ? prev.outs : 0;
    if (typeof e.outs === "number") outs += Math.max(0, e.outs - before);
    prev = e;
  }
  return outs + plays.filter((p) => p.type === "play" && !p.deletedAt && OUT_PLAYS.has(String(p.play))).length;
}
export function line(ps: Ev[], plays: Ev[] = []): Line {
  let strikes = 0, k = 0, bb = 0, hbp = 0, h = 0, hard = 0, runs = 0, whiffs = 0, swings = 0, pos = 0, neg = 0, bf = 0, f1 = 0, f1n = 0;
  for (const e of ps) {
    const o = outcome(e) as Outcome;
    if (o.strike) strikes++;
    if (e.paEnd === "k") k++;
    if (e.paEnd === "walk") bb++;
    if (e.paEnd === "hbp") hbp++;
    if (e.paEnd) bf++;
    if (o.hit) h++;
    if (o.hard) hard++;
    runs += Number(e.runs) || 0;
    if (e.res === "whiff") whiffs++;
    if (e.res === "whiff" || e.res === "foul" || e.res === "play") swings++;
    if (o.positive) pos++;
    if (o.negative) neg++;
    const c = countOf(e);
    if (c && c.balls === 0 && c.strikes === 0) { f1n++; if (o.strike) f1++; }
  }
  const outs = outsMade(ps, plays);
  return { pitches: ps.length, strikes, balls: ps.length - strikes, strikePct: share(strikes, ps.length), outs, ip: `${Math.floor(outs / 3)}.${outs % 3}`, bf, k, bb, hbp, h, hard, runs,
    whiffs, swings, whiffPct: share(whiffs, swings), positive: pos, negative: neg, firstStrikes: f1, firstPitches: f1n };
}

// ---------------------------------------------------------------- pitch mix and results
export type MixRow = { key: string; name: string; kind: string; n: number; share: Rate; strikes: Rate; whiffs: Rate; hard: Rate; positive: number; negative: number;
  swings: number; bip: number; bipContact: number };
export type MixSlice = { n: number; rows: MixRow[] };
function mixRows(ps: Ev[], res: (e: Ev) => PitchKey, total: number): MixRow[] {
  const m = new Map<string, { k: PitchKey; list: Ev[] }>();
  for (const e of ps) { const k = res(e); const x = m.get(k.key) || { k, list: [] }; x.list.push(e); m.set(k.key, x); }
  const rows: MixRow[] = [];
  for (const { k, list } of m.values()) {
    const n = list.length;
    let strikes = 0, whiffs = 0, swings = 0, bip = 0, bipContact = 0, hard = 0, pos = 0, neg = 0;
    for (const e of list) {
      const o = outcome(e) as Outcome;
      if (o.strike) strikes++;
      if (e.res === "whiff") whiffs++;
      if (e.res === "whiff" || e.res === "foul" || e.res === "play") swings++;
      if (e.res === "play") { bip++; if (e.contact === "weak" || e.contact === "solid" || e.contact === "hard") bipContact++; }
      if (o.hard) hard++;
      if (o.positive) pos++;
      if (o.negative) neg++;
    }
    rows.push({ key: k.key, name: k.name, kind: k.kind, n, share: share(n, total), strikes: rate(strikes, n, n), whiffs: rate(whiffs, swings, n), hard: rate(hard, bipContact, n),
      positive: pos, negative: neg, swings, bip, bipContact });
  }
  return rows.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}
export type Mix = { all: MixSlice; byGroup: Record<CountGroup, MixSlice>; bySide: { L: MixSlice; R: MixSlice; unknown: number } };
export function mix(ps: Ev[], res: (e: Ev) => PitchKey, hand?: string | null): Mix {
  const groups = Object.fromEntries(COUNT_GROUPS.map((g) => [g, [] as Ev[]])) as Record<CountGroup, Ev[]>;
  const sides = { L: [] as Ev[], R: [] as Ev[] };
  let unknown = 0;
  for (const e of ps) {
    const c = countOf(e); if (c) groups[countGroup(c)].push(e);
    const s = hitterSide(e, hand); if (s) sides[s].push(e); else unknown++;
  }
  const slice = (list: Ev[]): MixSlice => ({ n: list.length, rows: mixRows(list, res, list.length) });
  return { all: slice(ps), byGroup: Object.fromEntries(COUNT_GROUPS.map((g) => [g, slice(groups[g])])) as Record<CountGroup, MixSlice>,
    bySide: { L: slice(sides.L), R: slice(sides.R), unknown } };
}

// ---------------------------------------------------------------- heat maps
export type Cell = { n: number; strike: number; ball: number; positive: number; negative: number };
export type Grid = { cells: Record<string, Cell>; counted: number; left: number };   // left: pitches with no cell in this view
export type HeatFilter = { key: string; name: string; kind: string; n: number; called: Grid; landed: Grid };
export type Heat = { filters: HeatFilter[] };   // filters[0] is every pitch
function grid(): Grid { return { cells: {}, counted: 0, left: 0 }; }
function add(g: Grid, cell: [number, number] | null, o: Outcome) {
  if (!cell) { g.left++; return; }
  const k = cellKey(cell[0], cell[1]), c = g.cells[k] || (g.cells[k] = { n: 0, strike: 0, ball: 0, positive: 0, negative: 0 });
  c.n++; g.counted++;
  if (o.strike) c.strike++; else c.ball++;
  if (o.positive) c.positive++;
  if (o.negative) c.negative++;
}
export function heat(ps: Ev[], res: (e: Ev) => PitchKey, hand?: string | null): Heat {
  const all: HeatFilter = { key: "all", name: "All pitches", kind: "", n: 0, called: grid(), landed: grid() };
  const by = new Map<string, HeatFilter>();
  for (const e of ps) {
    const k = res(e), o = outcome(e) as Outcome, side = hitterSide(e, hand);
    // where it was called: the call's spot, drawn for the pitch that was called (its kind decides a chase's row)
    const called = calledCell(e.quad, e.kind, side), landed = landedCell(e.locCell);
    const f = by.get(k.key) || { key: k.key, name: k.name, kind: k.kind, n: 0, called: grid(), landed: grid() };
    by.set(k.key, f);
    for (const x of [all, f]) { x.n++; add(x.called, called, o); add(x.landed, landed, o); }
  }
  return { filters: [all, ...[...by.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))] };
}

// ---------------------------------------------------------------- hitter by hitter
export type AbPitch = { n: number; count: string; pitch: string; kind: string; quad: string | null; cell: [number, number] | null; res: string; out: string | null;
  contact: string | null; positive: boolean; negative: boolean; strike: boolean; text: string; choice?: string | null; called?: string | null; shaken?: number };
export type AtBat = { key: string; game: string; inning: number | null; slot: number | null; hitterId?: string | null; side: "L" | "R" | null; pitches: AbPitch[];
  result: string; resultText: string; positive: number; negative: number; hard: number; ended: boolean };
const RES_TEXT: Record<string, string> = { ball: "Ball", cstrike: "Called strike", whiff: "Swinging strike", foul: "Foul", play: "In play", hbp: "Hit by pitch" };
const OUT_TEXT: Record<string, string> = { OUT: "Out in play", E: "Reached on error", "1B": "Single", "2B": "Double", "3B": "Triple", HR: "Home run" };
export const PA_TEXT: Record<string, string> = { k: "Strikeout", walk: "Walk", hbp: "Hit by pitch", out: "Out", hit: "Hit", hard: "Hard contact" };
export function pitchText(e: Ev): string {
  if (e.res === "play") return (OUT_TEXT[String(e.out)] || "In play") + (e.contact ? `, ${e.contact}` : "");
  return RES_TEXT[String(e.res)] || String(e.res);
}
function paResult(last: Ev): { result: string; text: string } {
  const p = String(last.paEnd || "");
  if (p === "k") return { result: "k", text: last.res === "whiff" ? "Strikeout swinging" : "Strikeout looking" };
  if (p === "walk") return { result: "walk", text: "Walk" };
  if (p === "hbp") return { result: "hbp", text: "Hit by pitch" };
  if (p) return { result: HITS.has(String(last.out)) ? "hit" : "out", text: pitchText(last) };
  return { result: "open", text: "At-bat not finished by him" };
}
export function atBats(ps: Ev[], res: (e: Ev) => PitchKey, view: View, hand?: string | null): AtBat[] {
  const out: AtBat[] = [];
  let cur: AtBat | null = null, prev: Ev | null = null;
  for (const e of ps) {
    const fresh = !cur || !prev || prev.end || prev.gameId !== e.gameId || prev.slot !== e.slot || prev.inning !== e.inning;
    if (fresh) {
      cur = { key: String(e.n ?? 0), game: String(e.gameId ?? ""), inning: typeof e.inning === "number" ? e.inning : null, slot: typeof e.slot === "number" ? e.slot : null,
        side: hitterSide(e, hand), pitches: [], result: "open", resultText: "", positive: 0, negative: 0, hard: 0, ended: false };
      if (view === "staff") cur.hitterId = e.hitterId ?? null;
      out.push(cur);
    }
    const k = res(e), o = outcome(e) as Outcome, c = countOf(e);
    const p: AbPitch = { n: Number(e.n) || 0, count: c ? `${c.balls}-${c.strikes}` : "", pitch: k.name, kind: k.kind, quad: e.quad ?? null, cell: landedCell(e.locCell),
      res: String(e.res), out: e.out ?? null, contact: e.contact ?? null, positive: o.positive, negative: o.negative, strike: o.strike, text: pitchText(e) };
    if (e.thrown && e.thrown !== e.pitchName) p.called = e.pitchName ?? null;          // a cross-up: the pitch that was called
    if (view !== "public" && Array.isArray(e.shaken) && e.shaken.length) p.shaken = e.shaken.length;   // his own shake-offs
    if (view === "staff") p.choice = e.choice ?? (e.coach ? "coach" : "engine");
    cur!.pitches.push(p);
    if (o.positive) cur!.positive++;
    if (o.negative) cur!.negative++;
    if (o.hard) cur!.hard++;
    const r = paResult(e); cur!.result = r.result; cur!.resultText = r.text; cur!.ended = !!e.end;
    prev = e;
  }
  return out;
}

// ---------------------------------------------------------------- overrides and style (staff only)
export type MixEntry = { pitch: string; quad: string; share: number };
export type Override = { n: number; game: string; kind: "coach" | "shake" | "cross"; count: string; called: string; calledQuad: string | null; thrown: string;
  engineTop: MixEntry[]; engineProb: number | null; shaken: { pitch: string; quad: string }[]; result: string; positive: boolean; negative: boolean;
  restOfAtBat: { pitches: number; positive: number; negative: number; result: string } };
export function overrides(ps: Ev[], res: (e: Ev) => PitchKey, abs: AtBat[]): Override[] {
  const out: Override[] = [];
  const abOf = (e: Ev) => abs.find((a) => a.game === String(e.gameId ?? "") && a.pitches.some((p) => p.n === (Number(e.n) || 0)));
  for (const e of ps) {
    const crossed = !!e.thrown && e.thrown !== e.pitchName;
    const kinds: Override["kind"][] = [];
    if (e.choice === "coach" || (e.choice === undefined && e.coach)) kinds.push("coach");
    else if (e.choice === "recall") kinds.push("shake");
    if (crossed) kinds.push("cross");
    if (!kinds.length) continue;
    const o = outcome(e) as Outcome, c = countOf(e), ab = abOf(e), n = Number(e.n) || 0;
    const rest = ab ? ab.pitches.filter((p) => p.n > n) : [];
    const top = Array.isArray(e.mix) ? e.mix.slice(0, 3).map((m) => ({ pitch: String(m[1]), quad: String(m[2]), share: Number(m[3]) })) : [];
    for (const kind of kinds)
      out.push({ n, game: String(e.gameId ?? ""), kind, count: c ? `${c.balls}-${c.strikes}` : "", called: String(e.pitchName ?? ""), calledQuad: e.quad ?? null,
        thrown: res(e).name, engineTop: top, engineProb: kind === "coach" ? null : typeof e.prob === "number" ? e.prob : null,
        shaken: Array.isArray(e.shaken) ? e.shaken.map((s) => ({ pitch: String(s[0]), quad: String(s[1]) })) : [],
        result: pitchText(e), positive: o.positive, negative: o.negative,
        restOfAtBat: { pitches: rest.length, positive: rest.filter((p) => p.positive).length, negative: rest.filter((p) => p.negative).length, result: ab ? ab.resultText : "" } });
  }
  return out;
}

// ---------------------------------------------------------------- what worked / who hurt us
export type Worked = { pitch: string; kind: string; positive: number; whiffs: number; called: number; weak: number; n: number };
export function whatWorked(ps: Ev[], res: (e: Ev) => PitchKey): Worked[] {
  const m = new Map<string, Worked>();
  for (const e of ps) {
    const k = res(e), o = outcome(e) as Outcome;
    const w = m.get(k.key) || { pitch: k.name, kind: k.kind, positive: 0, whiffs: 0, called: 0, weak: 0, n: 0 };
    w.n++;
    if (o.positive) w.positive++;
    if (e.res === "whiff") w.whiffs++;
    if (e.res === "cstrike") w.called++;
    if (e.res === "play" && e.contact === "weak") w.weak++;
    m.set(k.key, w);
  }
  return [...m.values()].filter((w) => w.positive > 0).sort((a, b) => b.positive - a.positive || a.pitch.localeCompare(b.pitch));
}
export type Hurt = { key: string; slot: number | null; hitterId?: string | null; side: "L" | "R" | null; hits: number; hard: number; walks: number; hbp: number; negative: number };
export function whoHurtUs(abs: AtBat[], view: View): Hurt[] {
  const m = new Map<string, Hurt>();
  for (const a of abs) {
    if (!a.negative) continue;
    const key = view === "staff" && a.hitterId ? a.hitterId : `slot:${a.slot ?? "?"}`;
    const h = m.get(key) || { key, slot: a.slot, side: a.side, hits: 0, hard: 0, walks: 0, hbp: 0, negative: 0, ...(view === "staff" ? { hitterId: a.hitterId ?? null } : {}) };
    for (const p of a.pitches) { if (p.res === "play" && HITS.has(String(p.out))) h.hits++; }
    h.hard += a.hard; h.negative += a.negative;
    if (a.result === "walk") h.walks++;
    if (a.result === "hbp") h.hbp++;
    m.set(key, h);
  }
  return [...m.values()].sort((a, b) => b.negative - a.negative || (a.slot ?? 99) - (b.slot ?? 99));
}

// ---------------------------------------------------------------- logging completeness
export type Completeness = { pitches: number; located: number; bip: number; contact: number; mixLogged: number };
export function completeness(ps: Ev[]): Completeness {
  const bip = ps.filter((e) => e.res === "play");
  return { pitches: ps.length, located: ps.filter((e) => landedCell(e.locCell)).length, bip: bip.length,
    contact: bip.filter((e) => e.contact === "weak" || e.contact === "solid" || e.contact === "hard").length, mixLogged: ps.filter((e) => Array.isArray(e.mix)).length };
}

// ---------------------------------------------------------------- the outing report
export type Outing = { view: View; game: GameMeta; pitcherId: string; line: Line; mix: Mix; heat: Heat; atBats: AtBat[]; worked: Worked[]; hurt: Hurt[];
  overrides: Override[] | null; completeness: Completeness; velo: { n: number; avg: number | null; max: number | null } };
function veloOf(ps: Ev[]) {
  const v = ps.map((e) => Number(e.radar ?? e.v08?.radar)).filter((x) => x > 40);
  return { n: v.length, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, max: v.length ? Math.max(...v) : null };
}
/** One pitcher's outing in one game. evs: that game's events for him (pitches and plays). */
export function buildOuting(evs: Ev[], game: GameMeta, pitcherId: string, pitches: PitchInfo[], view: View, hand?: string | null): Outing {
  const ps = pitchesOf(evs), res = pitchResolver(pitches), plays = evs.filter((e) => e.type === "play");
  const abs = atBats(ps, res, view, hand);
  return { view, game, pitcherId, line: line(ps, plays), mix: mix(ps, res, hand), heat: heat(ps, res, hand), atBats: abs, worked: whatWorked(ps, res),
    hurt: whoHurtUs(abs, view), overrides: view === "staff" ? overrides(ps, res, abs) : null, completeness: completeness(ps), velo: veloOf(ps) };
}

// ---------------------------------------------------------------- the game summary (coaches)
export type SummaryRow = { pitcherId: string; name: string; line: Line; overrides: { coach: number; shake: number; cross: number }; first: number; last: number };
export type GameSummary = { game: GameMeta; staff: Line; pitchers: SummaryRow[]; overrides: (Override & { pitcherId: string; pitcher: string })[] };
export function buildGameSummary(evs: Ev[], game: GameMeta, pitchers: { id: string; name: string; hand?: string | null; pitches?: PitchInfo[] }[]): GameSummary {
  const ps = pitchesOf(evs), plays = evs.filter((e) => e.type === "play");
  const ids = [...new Set(ps.map((e) => String(e.pitcherId ?? "")))];
  const rows: SummaryRow[] = [], ovs: GameSummary["overrides"] = [];
  for (const id of ids) {
    const mine = ps.filter((e) => String(e.pitcherId ?? "") === id), info = pitchers.find((p) => p.id === id);
    const res = pitchResolver(info?.pitches || []), abs = atBats(mine, res, "staff", info?.hand), ov = overrides(mine, res, abs);
    rows.push({ pitcherId: id, name: info?.name || "Unknown pitcher", line: line(mine, plays.filter((p) => String(p.pitcherId ?? "") === id)),
      overrides: { coach: ov.filter((o) => o.kind === "coach").length, shake: ov.filter((o) => o.kind === "shake").length, cross: ov.filter((o) => o.kind === "cross").length },
      first: Number(mine[0]?.n) || 0, last: Number(mine[mine.length - 1]?.n) || 0 });
    for (const o of ov) ovs.push({ ...o, pitcherId: id, pitcher: info?.name || "Unknown pitcher" });
  }
  rows.sort((a, b) => a.first - b.first);
  ovs.sort((a, b) => a.n - b.n);
  return { game, staff: line(ps, plays), pitchers: rows, overrides: ovs };
}

// ---------------------------------------------------------------- the season recap (per pitcher)
// Level averages from the public level data the engine already uses (app/learn.js LEVEL_AVG: per plate appearance K
// and BB rates, batting average against). Labeled "public level data" wherever shown.
export const LEVEL_AVG: Record<string, { AVG: number; K: number; BB: number; label: string }> = {
  hs: { AVG: 0.286, K: 0.210, BB: 0.141, label: "high school" },
  travel: { AVG: 0.286, K: 0.210, BB: 0.141, label: "travel ball (high school numbers)" },
  college_d3: { AVG: 0.295, K: 0.162, BB: 0.114, label: "D3" },
  college_d1: { AVG: 0.265, K: 0.193, BB: 0.108, label: "D1" },
  mlb: { AVG: 0.255, K: 0.200, BB: 0.079, label: "pro" },
};
export type Trend = { game: string; date: string; pitches: number; strikePct: Rate; whiffPct: Rate; velo: number | null };
export type OutingRow = { game: string; date: string; opponent?: string | null; line: Line };
export type Comparison = { level: string | null; label: string | null; k: Rate; bb: Rate; avg: Rate; ab: number; levelK: number | null; levelBB: number | null; levelAVG: number | null };
export type Recap = { meta: { pitcherId: string; name: string; hand: string | null; season: string; start: string | null; end: string | null; final: boolean; outings: number };
  line: Line; pitchMix: Mix; heat: Heat; trends: { rows: Trend[]; showVelo: boolean }; outings: OutingRow[]; comparison: Comparison; completeness: Completeness;
  pitchByPitch: { game: string; date: string; pitches: AbPitch[] }[] };
export const VELO_MIN_OUTINGS = 3;   // plan open item default: velo trend only when logged in 3+ outings
export function buildRecap(evs: Ev[], games: GameMeta[], pitcher: { id: string; name: string; hand?: string | null; pitches?: PitchInfo[] },
  season: { name: string; start?: string | null; end?: string | null; final: boolean }, view: View, level?: string | null): Recap {
  const ps = pitchesOf(evs), res = pitchResolver(pitcher.pitches || []), plays = evs.filter((e) => e.type === "play");
  const gs = games.filter((g) => ps.some((e) => e.gameId === g.id)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const trends: Trend[] = [], outings: OutingRow[] = [], pbp: Recap["pitchByPitch"] = [];
  let veloOutings = 0;
  for (const g of gs) {
    const mine = ps.filter((e) => e.gameId === g.id), L = line(mine, plays.filter((p) => p.gameId === g.id)), v = veloOf(mine);
    if (v.n) veloOutings++;
    trends.push({ game: g.id, date: g.date, pitches: L.pitches, strikePct: L.strikePct, whiffPct: L.whiffPct, velo: v.avg });
    outings.push({ game: g.id, date: g.date, ...(view === "public" ? {} : { opponent: g.opponent ?? null }), line: L });
    pbp.push({ game: g.id, date: g.date, pitches: atBats(mine, res, view === "staff" ? "pitcher" : view, pitcher.hand).flatMap((a) => a.pitches) });
  }
  const L = line(ps, plays), lvl = level || gs.map((g) => g.level).find(Boolean) || null, avg = lvl ? LEVEL_AVG[lvl] : undefined;
  const ab = L.bf - L.bb - L.hbp;
  return {
    meta: { pitcherId: pitcher.id, name: pitcher.name, hand: pitcher.hand ?? null, season: season.name, start: season.start ?? null, end: season.end ?? null, final: season.final, outings: gs.length },
    line: L, pitchMix: mix(ps, res, pitcher.hand), heat: heat(ps, res, pitcher.hand), trends: { rows: trends, showVelo: veloOutings >= VELO_MIN_OUTINGS }, outings,
    comparison: { level: lvl, label: avg ? avg.label : null, k: share(L.k, L.bf), bb: share(L.bb, L.bf), avg: share(L.h, ab), ab, levelK: avg ? avg.K : null, levelBB: avg ? avg.BB : null, levelAVG: avg ? avg.AVG : null },
    completeness: completeness(ps), pitchByPitch: pbp,
  };
}

// ---------------------------------------------------------------- a hitter's at-bats (opponent pages; staff only)
export type HitterAb = AtBat & { date: string; pitcherId: string; pitcherName: string };
export function buildHitterAtBats(evs: Ev[], games: GameMeta[], pitchers: { id: string; name: string; hand?: string | null; pitches?: PitchInfo[] }[], hitterId: string): HitterAb[] {
  const ps = pitchesOf(evs).filter((e) => e.hitterId === hitterId);
  const out: HitterAb[] = [];
  const byPitcherGame = new Map<string, Ev[]>();
  for (const e of ps) { const k = `${e.gameId}|${e.pitcherId}`; (byPitcherGame.get(k) || byPitcherGame.set(k, []).get(k)!).push(e); }
  for (const [k, list] of byPitcherGame) {
    const [gid, pid] = k.split("|"), info = pitchers.find((p) => p.id === pid), g = games.find((x) => x.id === gid);
    if (!g) continue;
    for (const a of atBats(list, pitchResolver(info?.pitches || []), "staff", info?.hand)) out.push({ ...a, date: g.date, pitcherId: pid, pitcherName: info?.name || "Unknown pitcher" });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.game.localeCompare(b.game) || Number(a.key) - Number(b.key));
}
