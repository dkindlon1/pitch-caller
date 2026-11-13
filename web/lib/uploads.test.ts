// D10: the upload pipeline against hand calculations, on files built with TrackMan V3's own column names (the
// Mendeley Track_Combo.csv check needs the file: see docs/plans/2026-11-05-pitchiq-uploads-stats.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { armAngle, contactOf, dateOf, looksLikeGame, normalize, propose, resOf, slotOf, sourceOf, summarize, weightOf, type SessionPitch } from "./uploads.ts";
import type { Pitcher } from "./docs.ts";

const PCImport = createRequire(import.meta.url)("./pc_import.js");
const E = createRequire(import.meta.url)("./engine.js");   // v1.1 Step 5: the shape proposer uses the engine's tagFor / migratePitch
const OPTS = { tagFor: E.tagFor, migrate: E.migratePitch, level: "college_d3" };
const HEAD = "PitchNo,Date,Time,Pitcher,PitcherThrows,Batter,BatterSide,Inning,Balls,Strikes,TaggedPitchType,AutoPitchType,PitchCall,KorBB,PlayResult,RelSpeed,SpinRate,RelHeight,RelSide,Extension,InducedVertBreak,HorzBreak,PlateLocHeight,PlateLocSide,ExitSpeed";
// one TrackMan row; hb and side as TrackMan writes them for this pitcher (the parser decides which way is arm side)
const row = (n: number, o: { name?: string; throws?: string; type: string; velo: number; ivb: number; hb: number; relS?: number; call?: string; balls?: number; strikes?: number; side?: string; exit?: number | "" }) =>
  [n, "2026-11-01", "18:00:00", `"${o.name || "Kindlon, Drew"}"`, o.throws || "Right", '"Hitter, A"', o.side || "Right", 1, o.balls ?? 0, o.strikes ?? 0, o.type, o.type,
    o.call || "BallCalled", "Undefined", "Undefined", o.velo, 2250, 5.8, o.relS ?? -1.9, 6.1, o.ivb, o.hb, 2.5, 0.1, o.exit ?? ""].join(",");
const FB_VELO = [90, 91, 92, 90, 91, 92, 90, 91, 92, 90, 91, 92];
function file(throws: "Right" | "Left") {
  const s = throws === "Right" ? -1 : 1;   // here a right-hander's fastball runs negative and a lefty's positive (real TrackMan V3 is the other way round: trackcombo.test.ts)
  const lines = [HEAD];
  let n = 0;
  for (const v of FB_VELO) lines.push(row(++n, { throws, type: "Fastball", velo: v, ivb: 17, hb: s * 9, relS: s * 1.9 }));
  for (let i = 0; i < 10; i++) lines.push(row(++n, { throws, type: "Slider", velo: 82, ivb: 2, hb: -s * 6, relS: s * 1.9 }));
  for (let i = 0; i < 4; i++) lines.push(row(++n, { throws, type: "ChangeUp", velo: 83, ivb: 8, hb: s * 14, relS: s * 1.9 }));
  lines.push(row(++n, { throws, type: "Other", velo: 70, ivb: 0, hb: 0 }));
  return lines.join("\n");
}

test("a right-hander's and a left-hander's TrackMan files both come out arm side positive", () => {
  for (const throws of ["Right", "Left"] as const) {
    const parsed = PCImport.parse(file(throws));
    const rows = normalize(parsed);
    assert.equal(parsed.source, "TrackMan"); assert.equal(sourceOf(parsed), "trackman");
    assert.equal(rows.length, 26, "every row with a known pitch type; 'Other' skipped");
    assert.equal(parsed.hand, throws[0], "his hand read from PitcherThrows");
    const fb = rows.filter((r) => r.kind === "FB"), sl = rows.filter((r) => r.kind === "SL"), ch = rows.filter((r) => r.kind === "CH");
    assert.ok(fb.every((r) => r.hb_in === 9 && r.rel_side_ft === 1.9), `${throws}: fastballs +9 arm side, release side +1.9`);
    assert.ok(sl.every((r) => r.hb_in === -6), `${throws}: sliders -6 (glove side)`);
    assert.ok(ch.every((r) => r.hb_in === 14 && r.pitch_type === "Changeup"), `${throws}: "ChangeUp" is the app's Changeup, +14`);
  }
});

test("the per-type summary is the hand calculation", () => {
  const rows = normalize(PCImport.parse(file("Right")));
  const pitches: SessionPitch[] = rows.map((r) => ({ ...r, session_type: "bullpen", session_date: "2026-11-01", upload_id: "u1" }));
  const s = summarize(pitches, "2026-11-01");
  const fb = s.find((t) => t.type === "Four-seam")!, sl = s.find((t) => t.type === "Slider")!, ch = s.find((t) => t.type === "Changeup")!;
  // one session, so every weight is the same (bullpen 0.4): plain means
  assert.deepEqual([fb.n, fb.velo, fb.veloMax, fb.ivb, fb.hb, fb.spin, fb.relH, fb.relS, fb.ext], [12, 91, 92, 17, 9, 2250, 5.8, 1.9, 6.1]);
  assert.equal(fb.weight, 4.8);
  assert.deepEqual([sl.n, sl.velo, sl.ivb, sl.hb], [10, 82, 2, -6]);
  assert.equal(ch.n, 4);
});

test("session type and age weight the summary (game 1.0, live BP 0.7, bullpen 0.4, 60-day half-life)", () => {
  assert.equal(weightOf({ session_type: "game", session_date: "2026-11-01" }, "2026-11-01"), 1);
  assert.equal(weightOf({ session_type: "live_bp", session_date: "2026-11-01" }, "2026-11-01"), 0.7);
  assert.ok(Math.abs(weightOf({ session_type: "bullpen", session_date: "2026-09-02" }, "2026-11-01") - 0.2) < 1e-9, "60 days old: half of 0.4");
  const base = normalize(PCImport.parse(file("Right"))).filter((r) => r.kind === "FB").slice(0, 10);
  const game: SessionPitch[] = base.map((r) => ({ ...r, velo_mph: 92, session_type: "game", session_date: "2026-11-01" }));
  const pen: SessionPitch[] = base.map((r) => ({ ...r, velo_mph: 88, session_type: "bullpen", session_date: "2026-09-02" }));
  const fb = summarize(game.concat(pen), "2026-11-01")[0];
  // (10 x 92 x 1.0 + 10 x 88 x 0.2) / (10 x 1.0 + 10 x 0.2) = 91.33
  assert.equal(fb.velo, 91.3); assert.equal(fb.n, 20); assert.equal(fb.weight, 12);
});

test("excluded pitches count nowhere; developing ones are kept apart and feed nothing", () => {
  const rows = normalize(PCImport.parse(file("Right"))).filter((r) => r.kind === "FB");
  const pitches: SessionPitch[] = rows.map((r, i) => ({ ...r, session_type: "bullpen", session_date: "2026-11-01",
    excluded: i < 3, reason: i < 3 ? "warmup" : null, developing: i === 5 }));   // the first three (90, 91, 92) warmups; the sixth (92) developing
  const fb = summarize(pitches, "2026-11-01")[0];
  // left: 90, 91, 92, 90, 91, 92, 90, 91 minus... indices 3..11 except 5: 90, 91, 90, 91, 92, 90, 91, 92 -> 727 / 8
  assert.equal(fb.n, 8); assert.equal(fb.excluded, 3); assert.equal(fb.developing, 1);
  assert.equal(fb.velo, Math.round((727 / 8) * 10) / 10);
});

test("shape and slot rules", () => {
  // v1.1: shape tags are the engine's (tagFor, plan 2.2); propose() is checked with them below
  // release 5.8 ft up, 1.9 ft out; a 6'1" pitcher's shoulder at 4.27 ft: atan2(1.53, 1.9) = 38.8 degrees
  assert.equal(Math.round(armAngle(5.8, 1.9, 6.1) * 10) / 10, 38.8);
  assert.equal(slotOf(38.8), "three-quarter"); assert.equal(slotOf(65), "over the top"); assert.equal(slotOf(50), "high three-quarter");
  assert.equal(slotOf(25), "low three-quarter"); assert.equal(slotOf(8), "sidearm"); assert.equal(slotOf(-5), "submarine");
});

test("proposals: only with 10+ pitches, only what differs, matched to his arsenal", () => {
  const rows = normalize(PCImport.parse(file("Right")));
  const cb = Array.from({ length: 11 }, () => ({ ...rows[0], pitch_type: "Curveball", kind: "CB" as const, velo_mph: 75, ivb_in: -12, hb_in: -7 }));
  const pitches: SessionPitch[] = rows.concat(cb).map((r) => ({ ...r, session_type: "bullpen", session_date: "2026-11-01", upload_id: "u1" }));
  const p = { id: "pit1", teamId: "t", name: "Drew", number: "", hand: "R", role: "SP", height_ft: 6.1, slot: "three-quarter", updatedAt: 1, createdAt: 1,
    pitches: [{ id: "pf", type: "Four-seam", name: "Fastball", kind: "FB", shape: "ride", grade: 3, command: 3, feel: 0.7, velo: "", ivb: "", hb: "", spin: "", active: true },
      { id: "ps", type: "Slider", name: "Slider", kind: "SL", shape: "tight", grade: 3, command: 3, feel: 0.7, velo: 82, ivb: 2, hb: -6, spin: "", active: true },
      { id: "pc", type: "Changeup", name: "Change", kind: "CH", shape: "fade", grade: 3, command: 3, feel: 0.7, velo: "", ivb: "", hb: "", spin: "", active: true }] } as unknown as Pitcher;
  const { proposals, unmatched, notes } = propose(p, summarize(pitches, "2026-11-01"), OPTS);
  const key = (x: { field: string; pitch_id?: string }) => `${x.field}:${x.pitch_id || ""}`;
  assert.deepEqual(proposals.map(key).sort(), ["shape:pf", "velo:pf"], "fastball velo and shape; the slider already matches; three-quarter already his slot");
  assert.equal(proposals.find((x) => x.field === "velo")!.value, 91);
  // his four-seam (17 up, 9 arm side, 91) against itself: the engine's tag at D3, with the kind it keeps
  assert.deepEqual(proposals.find((x) => x.field === "shape")!.value, { kind: "FB", shape: E.tagFor("FB", 17, 9, 91, 91, 17, 9, "college_d3", "Four-seam"), ivb: 17, hb: 9 });
  assert.equal(propose(p, summarize(pitches, "2026-11-01")).proposals.filter((x) => x.field === "shape").length, 0, "no engine tagFor, no shape proposal (never a v1.0 tag)");
  assert.deepEqual(proposals.find((x) => x.field === "velo")!.basis, { n: 12, weight: 4.8, uploads: ["u1"], type: "Four-seam" });
  assert.deepEqual(unmatched, [{ type: "Curveball", n: 11 }], "a pitch he doesn't have is reported, not added");
  assert.ok(notes.some((n) => /Changeup: 4 pitches, not enough yet/.test(n)));
  const taller = propose({ ...p, height_ft: 6.5 } as Pitcher, summarize(pitches, "2026-11-01"), OPTS).proposals.find((x) => x.field === "slot");
  assert.ok(taller && taller.value === "low three-quarter" && taller.basis.angle === 33, "a 6'5\" pitcher releasing at the same spot is lower: low three-quarter");
  assert.ok(propose({ ...p, height_ft: undefined } as Pitcher, summarize(pitches, "2026-11-01")).notes.some((n) => /Set his height/.test(n)));
});

test("v1.1 Step 5: proposals in six kinds and v1.1 tags; a record still in v1.0 terms is read through the table", () => {
  const mk = (type: string, kind: string, velo: number, ivb: number, hb: number, n: number) => Array.from({ length: n }, () => ({ pitch_type: type, kind, velo_mph: velo, ivb_in: ivb, hb_in: hb,
    spin_rpm: null, rel_height_ft: 5.8, rel_side_ft: 1.9, extension_ft: 6.1, plate_x_ft: null, plate_z_ft: null, balls: null, strikes: null, res: null, contact: null, batter_side: null,
    excluded: false, reason: null, developing: false, session_type: "bullpen", session_date: "2026-11-01", upload_id: "u1" }));
  const pitches = [...mk("Sinker", "SI", 89, 7, 16, 14), ...mk("Sweeper", "SL", 78, 1, -15, 12), ...mk("Cutter", "FC", 86, 12, -3, 11)] as unknown as SessionPitch[];
  const p = { id: "pit2", teamId: "t", name: "Low slot", number: "", hand: "R", role: "SP", height_ft: 6.1, slot: "three-quarter", updatedAt: 1, createdAt: 1,
    pitches: [{ id: "si", type: "Sinker", name: "Sinker", kind: "FB", shape: "sink", grade: 3, command: 3, feel: 0.7, velo: 89, ivb: "", hb: "", spin: "", active: true },   // v1.0-stored
      { id: "sw", type: "Sweeper", name: "Sweeper", kind: "SL", shape: "sweeper", grade: 3, command: 3, feel: 0.7, velo: 78, ivb: 1, hb: -15, spin: "", active: true },
      { id: "fc", type: "Cutter", name: "Cutter", kind: "FC", shape: "", grade: 3, command: 3, feel: 0.7, velo: 86, ivb: "", hb: "", spin: "", active: true }] } as unknown as Pitcher;
  const { proposals } = propose(p, summarize(pitches, "2026-11-01"), OPTS);
  const shapes = Object.fromEntries(proposals.filter((x) => x.field === "shape").map((x) => [x.pitch_id, x.value as { kind: string; shape: string }]));
  assert.equal(shapes.si.kind, "SI", "the v1.0-stored sinker is proposed as a sinker (its kind through the table)");
  assert.ok(E.SHAPE_TAGS.SI.includes(shapes.si.shape) && E.SHAPE_TAGS.FC.includes(shapes.fc.shape), `v1.1 tags (${shapes.si.shape}, ${shapes.fc.shape})`);
  assert.equal(shapes.sw, undefined, "the sweeper already matches: nothing proposed");
  assert.equal(shapes.fc.kind, "FC");
});

test("game files: TrackMan's PitchCall, count, batter side and exit speed", () => {
  const lines = [HEAD,
    row(1, { type: "Fastball", velo: 91, ivb: 17, hb: -9, call: "StrikeCalled", balls: 0, strikes: 0, side: "Left" }),
    row(2, { type: "Fastball", velo: 91, ivb: 17, hb: -9, call: "StrikeSwinging", balls: 0, strikes: 1 }),
    row(3, { type: "Slider", velo: 82, ivb: 2, hb: 6, call: "FoulBallNotFieldable", balls: 0, strikes: 2 }),
    row(4, { type: "Slider", velo: 82, ivb: 2, hb: 6, call: "InPlay", balls: 0, strikes: 2, exit: 101.2 }),
    row(5, { type: "Fastball", velo: 91, ivb: 17, hb: -9, call: "HitByPitch", balls: 1, strikes: 0 }),
    row(6, { type: "Fastball", velo: 91, ivb: 17, hb: -9, call: "BallinDirt", balls: 3, strikes: 2 })];
  const rows = normalize(PCImport.parse(lines.join("\n")));
  assert.deepEqual(rows.map((r) => r.res), ["cstrike", "whiff", "foul", "play", "hbp", "ball"]);
  assert.deepEqual(rows.map((r) => `${r.balls}-${r.strikes}`), ["0-0", "0-1", "0-2", "0-2", "1-0", "3-2"]);
  assert.equal(rows[0].batter_side, "L"); assert.equal(rows[3].contact, "hard"); assert.equal(rows[2].contact, null);
  assert.ok(looksLikeGame(rows));
  assert.equal(contactOf(85, "play"), "solid"); assert.equal(contactOf(70, "play"), "weak"); assert.equal(resOf("BallIntentional"), "ball"); assert.equal(resOf("Undefined"), null);
});

test("dates, and a saved mapping for a file nobody recognizes", () => {
  assert.equal(dateOf("11/1/2026"), "2026-11-01"); assert.equal(dateOf("2026-11-01T18:00"), "2026-11-01"); assert.equal(dateOf("yesterday"), null);
  const odd = "Throw,MPH,Up,Over,When\nFastball,90,16,8,2026-10-30\nFastball,92,18,10,2026-10-30\nSlider,81,1,-7,2026-10-30";
  const h = PCImport.headerOf(odd);
  assert.deepEqual(h.header, ["Throw", "MPH", "Up", "Over", "When"]); assert.equal(h.sig, "throw|mph|up|over|when");
  const parsed = PCImport.parse(odd, { mapping: { type: "Throw", velo: "MPH", ivb: "Up", hb: "Over", date: "When" }, hand: "R" });
  const rows = normalize(parsed);
  assert.equal(sourceOf(parsed), "mapped");
  assert.deepEqual(rows.map((r) => [r.pitch_type, r.velo_mph, r.ivb_in]), [["Four-seam", 90, 16], ["Four-seam", 92, 18], ["Slider", 81, 1]]);
});
