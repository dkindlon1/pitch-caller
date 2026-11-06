// D10 on a real file: the upload pipeline against the public TrackMan V3 college dataset (tests/data/Track_Combo.csv,
// Mendeley, CC BY 4.0; 3,344 pitches by 32 anonymized pitchers). Every expected number is worked out here from the
// raw CSV, independently of the parser.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { normalize, summarize, type SessionPitch } from "./uploads.ts";

const PCImport = createRequire(import.meta.url)("./pc_import.js");
const TEXT = fs.readFileSync(new URL("../tests/data/Track_Combo.csv", import.meta.url), "utf8");
const LINES = TEXT.split(/\r?\n/).filter((l) => l.trim() !== "");
const HEAD = LINES[0], H = HEAD.split(","), at = (name: string) => H.indexOf(name);
const ROWS = LINES.slice(1).map((l) => l.split(","));   // the file has no quoted cells
// TrackMan's tagged names to the app's types (Knuckleball has no app type and is skipped)
const TYPE: Record<string, string> = { Fastball: "Four-seam", Sinker: "Sinker", Cutter: "Cutter", Slider: "Slider", Curveball: "Curveball", ChangeUp: "Changeup", Splitter: "Splitter" };
const num = (s: string) => (s === "" ? null : Number.isFinite(+s) ? +s : null);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r1 = (x: number) => Math.round(x * 10) / 10;

const BY: Record<string, string[][]> = {};
for (const c of ROWS) (BY[c[at("PitcherId")]] ||= []).push(c);
// one pitcher's own file: the header and his rows, as he'd export it
const fileOf = (rows: string[][]) => [HEAD, ...rows.map((c) => c.join(","))].join("\n");
const handOf = (rows: string[][]) => rows.map((c) => c[at("PitcherThrows")]).find((h) => h === "Right" || h === "Left") ?? null;

test("D10: the whole file parses, and is refused as one pitcher's because it has 32", () => {
  const p = PCImport.parse(TEXT);
  assert.equal(ROWS.length, 3344);
  assert.equal(p.source, "TrackMan");
  assert.equal(p.n, ROWS.filter((c) => TYPE[c[at("TaggedPitchType")]]).length);
  assert.equal(p.n, 3343, "every row but the one knuckleball");
  assert.ok(p.warnings.some((w: string) => w.startsWith("1 rows had no pitch type")));
  assert.equal(p.columns.pitcherId, "PitcherId");
  assert.equal(p.columns.pitcher, undefined, "PitcherId and PitcherThrows aren't taken for the pitcher's name");
  assert.equal(p.pitchers, 32);
  assert.ok(p.warnings.includes("This file has pitches from 32 different pitchers. Use a file with only his pitches."));
});

test("D10: arm side comes out positive for every right- and left-hander", () => {
  let right = 0, left = 0;
  for (const [id, rows] of Object.entries(BY)) {
    const p = PCImport.parse(fileOf(rows)), hand = handOf(rows);
    assert.equal(p.pitchers, 1, id);
    assert.equal(p.n, rows.filter((c) => TYPE[c[at("TaggedPitchType")]]).length, `${id}: every row with a pitch type`);
    assert.equal(p.hand, hand === "Right" ? "R" : hand === "Left" ? "L" : null, id);
    const fb = p.rows.filter((r: { type: string }) => r.type === "Four-seam" || r.type === "Sinker");
    const hb = fb.map((r: { hb: number | null }) => r.hb).filter((x: number | null) => x !== null).sort((a: number, b: number) => a - b);
    assert.ok(hb[Math.floor(hb.length / 2)] > 0, `${id} (${hand}): his fastballs run to his arm side`);
    const rel = p.rows.map((r: { relS: number | null }) => r.relS).filter((x: number | null) => x !== null);
    assert.ok(mean(rel) > 0, `${id} (${hand}): he releases on his arm side`);
    // TrackMan V3 here writes a right-hander's arm side as positive: only lefties' files get flipped, which is also
    // what the parser assumes for a file with no fastballs
    if (hand) assert.equal(p.flipped, hand === "Left", `${id} (${hand})`);
    if (hand === "Right") right++; else if (hand === "Left") left++;
  }
  assert.deepEqual([right, left], [21, 10], "21 right-handers and 10 left-handers (one pitcher's hand is Undefined)");
});

test("D10: each pitcher's per-type summary matches a hand calculation", () => {
  let checked = 0;
  for (const [id, rows] of Object.entries(BY)) {
    const p = PCImport.parse(fileOf(rows)), s = p.flipped ? -1 : 1;
    for (const t of p.byType) {
      const mine = rows.filter((c) => TYPE[c[at("TaggedPitchType")]] === t.type);
      const col = (name: string, sign = 1) => mine.map((c) => num(c[at(name)])).filter((x): x is number => x !== null).map((x) => x * sign);
      assert.equal(t.n, mine.length, `${id} ${t.type} n`);
      assert.equal(t.velo, r1(mean(col("RelSpeed"))), `${id} ${t.type} velo`);
      assert.equal(t.ivb, r1(mean(col("InducedVertBreak"))), `${id} ${t.type} ivb`);
      assert.equal(t.hb, r1(mean(col("HorzBreak", s))), `${id} ${t.type} hb`);
      if (col("SpinRate").length) assert.equal(t.spin, Math.round(mean(col("SpinRate"))), `${id} ${t.type} spin`);
      checked++;
    }
  }
  assert.ok(checked >= 100, `${checked} pitcher-and-type summaries checked`);
});

test("D10: left-out and developing pitches change the stored summary as the spec says", () => {
  // the pitcher with the most pitches, stored as one bullpen today (every weight 0.4, so the weighted means are plain means)
  const [id, rows] = Object.entries(BY).sort((a, b) => b[1].length - a[1].length)[0];
  const p = PCImport.parse(fileOf(rows));
  const stored: SessionPitch[] = normalize(p).map((x) => ({ ...x, session_type: "bullpen", session_date: "2026-11-06" }));
  const fbAll = stored.filter((x) => x.pitch_type === "Four-seam");
  const base = summarize(stored, "2026-11-06").find((t) => t.type === "Four-seam")!;
  assert.equal(base.n, fbAll.length);
  assert.ok(Math.abs(base.velo! - mean(fbAll.map((x) => x.velo_mph!))) <= 0.05, `${id}: the stored summary is the plain mean`);

  // leave out his five hardest fastballs as warmups... (an example; any five would do)
  const out = new Set([...fbAll].sort((a, b) => b.velo_mph! - a.velo_mph!).slice(0, 5));
  const types = [...new Set(stored.map((x) => x.pitch_type))].filter((t) => t !== "Four-seam");
  const dev = types[0];
  const marked = stored.map((x) => (out.has(x) ? { ...x, excluded: true, reason: "warmup" as const } : x.pitch_type === dev ? { ...x, developing: true } : x));
  const sum = summarize(marked, "2026-11-06");
  const fb = sum.find((t) => t.type === "Four-seam")!, rest = fbAll.filter((x) => !out.has(x));
  assert.deepEqual([fb.n, fb.excluded], [fbAll.length - 5, 5], "left-out pitches count nowhere");
  assert.ok(Math.abs(fb.velo! - mean(rest.map((x) => x.velo_mph!))) <= 0.05 && fb.velo! < base.velo!, "the velocity is the mean of the rest");
  assert.equal(fb.veloMax, Math.max(...rest.map((x) => x.velo_mph!)));
  // ...and mark every pitch of his next type as one he's developing: stored and counted apart, feeding nothing
  const d = sum.find((t) => t.type === dev)!;
  assert.deepEqual([d.n, d.developing, d.velo, d.ivb, d.hb], [0, stored.filter((x) => x.pitch_type === dev).length, null, null, null]);
});
