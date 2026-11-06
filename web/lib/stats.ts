// A pitcher's stats (spec: "Player stats", D11): from game pitches called in PitchIQ (pc_pitch_rows) and pitches in
// TrackMan game files (upload_pitches with a count and a result). Always labeled by source, always with the sample:
// a rate on fewer than 10 pitches shows only the count ("6 pitches, not enough yet"). Pure: stats.test.ts checks it
// against hand counts.
export type Src = "pitchiq" | "trackman";
export type StatRow = { source: Src; date: string; balls: number; strikes: number; pitch: string; kind: string;
  res: "ball" | "cstrike" | "whiff" | "foul" | "play" | "hbp"; contact: "weak" | "solid" | "hard" | null; side: "same" | "opp" | null };
export const MIN_SAMPLE = 10;
export const COUNTS = ["0-0", "1-0", "2-0", "3-0", "0-1", "1-1", "2-1", "3-1", "0-2", "1-2", "2-2", "3-2"];

// ---------------------------------------------------------------- the rows
type EventRow = { date: string; count?: string | null; pitch: string; kind: string; res?: string | null; contact?: string | null; side?: string | null };
const RES = new Set(["ball", "cstrike", "whiff", "foul", "play", "hbp"]);
export function fromEvents(rows: EventRow[]): StatRow[] {
  const out: StatRow[] = [];
  for (const e of rows) {
    const m = String(e.count || "").match(/^([0-3])-([0-2])$/);
    if (!m || !RES.has(String(e.res))) continue;
    out.push({ source: "pitchiq", date: e.date, balls: +m[1], strikes: +m[2], pitch: e.pitch, kind: e.kind, res: e.res as StatRow["res"],
      contact: e.contact === "weak" || e.contact === "solid" || e.contact === "hard" ? e.contact : null,
      side: e.side === "same" || e.side === "opp" ? e.side : null });
  }
  return out;
}
type UpRow = { session_type: string; session_date: string; pitch_type: string; pitch_name?: string; kind: string; balls: number | null; strikes: number | null;
  res: string | null; contact: string | null; batter_side: string | null; excluded: boolean };
// TrackMan game files only (a bullpen's "strike" isn't a game's), excluded pitches out; the side against his hand
export function fromUploads(rows: UpRow[], hand: "R" | "L"): StatRow[] {
  const out: StatRow[] = [];
  for (const r of rows) {
    if (r.session_type !== "game" || r.excluded || r.balls === null || r.strikes === null || !RES.has(String(r.res))) continue;
    out.push({ source: "trackman", date: r.session_date, balls: r.balls, strikes: r.strikes, pitch: r.pitch_name || r.pitch_type, kind: r.kind,
      res: r.res as StatRow["res"], contact: (r.contact as StatRow["contact"]) ?? null,
      side: r.batter_side === "R" || r.batter_side === "L" ? (r.batter_side === hand ? "same" : "opp") : null });
  }
  return out;
}
// "All": a game charted in PitchIQ and also uploaded from TrackMan counts once (PitchIQ's, which has the calls)
export function combine(pitchiq: StatRow[], trackman: StatRow[]): StatRow[] {
  const charted = new Set(pitchiq.map((r) => r.date));
  return pitchiq.concat(trackman.filter((r) => !charted.has(r.date)));
}

// ---------------------------------------------------------------- rates
export type Rate = { k: number; n: number; pct: number | null };
export const rate = (k: number, n: number): Rate => ({ k, n, pct: n >= MIN_SAMPLE ? Math.round((k / n) * 1000) / 10 : null });
const ONE: Record<string, string> = { pitches: "pitch", swings: "swing", "balls in play": "ball in play" };
export const sample = (n: number, unit = "pitches") => `${n} ${n === 1 ? ONE[unit] || unit : unit}`;
export const fmt = (r: Rate, unit = "pitches") => (r.n === 0 ? "–" : r.pct === null ? `${sample(r.n, unit)}, not enough yet` : `${Math.round(r.pct)}% (${r.k} of ${r.n})`);

const isStrike = (r: StatRow) => r.res !== "ball" && r.res !== "hbp";
const isSwing = (r: StatRow) => r.res === "whiff" || r.res === "foul" || r.res === "play";
const isK = (r: StatRow) => r.strikes === 2 && (r.res === "whiff" || r.res === "cstrike");
const countOf = (r: StatRow) => `${r.balls}-${r.strikes}`;

export type Line = { n: number; strike: Rate; whiff: Rate; k: Rate | null; bip: { n: number; weak: Rate; solid: Rate; hard: Rate } };
// strike % of pitches; whiff % of swings; strikeout % of two-strike pitches; contact on balls in play (graded ones)
export function line(rows: StatRow[], twoStrike = rows.length > 0 && rows.every((r) => r.strikes === 2)): Line {
  const swings = rows.filter(isSwing), bip = rows.filter((r) => r.res === "play" && r.contact);
  const two = rows.filter((r) => r.strikes === 2);
  return {
    n: rows.length, strike: rate(rows.filter(isStrike).length, rows.length), whiff: rate(swings.filter((r) => r.res === "whiff").length, swings.length),
    k: twoStrike || two.length ? rate(two.filter(isK).length, two.length) : null,
    bip: { n: bip.length, weak: rate(bip.filter((r) => r.contact === "weak").length, bip.length),
      solid: rate(bip.filter((r) => r.contact === "solid").length, bip.length), hard: rate(bip.filter((r) => r.contact === "hard").length, bip.length) },
  };
}

// usage by count: in each count, how often each pitch
export function usage(rows: StatRow[]) {
  const pitches = [...new Set(rows.map((r) => r.pitch))].sort((a, b) => rows.filter((r) => r.pitch === b).length - rows.filter((r) => r.pitch === a).length);
  return {
    pitches,
    counts: COUNTS.map((c) => {
      const here = rows.filter((r) => countOf(r) === c);
      return { count: c, n: here.length, by: Object.fromEntries(pitches.map((p) => [p, rate(here.filter((r) => r.pitch === p).length, here.length)])) };
    }).filter((c) => c.n > 0),
  };
}

// each count and pitch: the full line
export function byCountAndPitch(rows: StatRow[]) {
  const out: { count: string; pitch: string; line: Line }[] = [];
  for (const c of COUNTS) for (const p of [...new Set(rows.map((r) => r.pitch))]) {
    const here = rows.filter((r) => countOf(r) === c && r.pitch === p);
    if (here.length) out.push({ count: c, pitch: p, line: line(here, c.endsWith("-2")) });
  }
  return out;
}

export function byPitch(rows: StatRow[]) {
  return [...new Set(rows.map((r) => r.pitch))].map((p) => ({ pitch: p, line: line(rows.filter((r) => r.pitch === p), false) })).sort((a, b) => b.line.n - a.line.n);
}

export function bySide(rows: StatRow[]) {
  return (["same", "opp"] as const).map((s) => ({ side: s, line: line(rows.filter((r) => r.side === s), false) }));
}

// one line per game day and source: pitches, strikes, strikeouts, walks, hard contact
export function outingLog(rows: StatRow[]) {
  const keys = [...new Set(rows.map((r) => `${r.date}|${r.source}`))].sort().reverse();
  return keys.map((k) => {
    const [date, source] = k.split("|"), rs = rows.filter((r) => r.date === date && r.source === source);
    return { date, source: source as Src, pitches: rs.length, strikes: rs.filter(isStrike).length, k: rs.filter(isK).length,
      bb: rs.filter((r) => r.balls === 3 && r.res === "ball").length, hbp: rs.filter((r) => r.res === "hbp").length,
      hard: rs.filter((r) => r.res === "play" && r.contact === "hard").length };
  });
}

// ---------------------------------------------------------------- from every upload: velocity and movement
type MoveRow = { session_type: string; session_date: string; pitch_type: string; velo_mph: number | null; ivb_in: number | null; hb_in: number | null; excluded: boolean; developing: boolean };
// mean velocity per session date and pitch type (every session type, excluded pitches out, developing kept apart)
export function veloTrend(rows: MoveRow[]) {
  const use = rows.filter((r) => !r.excluded && !r.developing && r.velo_mph !== null);
  const keys = [...new Set(use.map((r) => `${r.session_date}|${r.pitch_type}`))].sort();
  return keys.map((k) => {
    const [date, type] = k.split("|"), vs = use.filter((r) => r.session_date === date && r.pitch_type === type).map((r) => r.velo_mph as number);
    return { date, type, n: vs.length, velo: Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 10) / 10, max: Math.max(...vs) };
  });
}
export function movement(rows: MoveRow[]) {
  return rows.filter((r) => !r.excluded && r.ivb_in !== null && r.hb_in !== null)
    .map((r) => ({ type: r.pitch_type, ivb: r.ivb_in as number, hb: r.hb_in as number, developing: r.developing }));
}
