// D11: fixture pitches -> rates equal hand counts; fewer than 10 shows the count only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { byCountAndPitch, byPitch, bySide, combine, fmt, fromEvents, fromUploads, line, movement, outingLog, rate, usage, veloTrend, type StatRow } from "./stats.ts";

// 12 fastballs in 0-0: 3 called strikes, 2 whiffs, 1 foul, 1 in play (hard), 5 balls
const fb00 = [...Array(3).fill("cstrike"), ...Array(2).fill("whiff"), "foul", "play", ...Array(5).fill("ball")]
  .map((res, i) => ({ date: "2026-10-20", count: "0-0", pitch: "Fastball", kind: "FB", res, contact: res === "play" ? "hard" : null, side: i % 2 ? "same" : "opp" }));
// 10 sliders in 1-2: 2 whiffs, 1 called strike (3 strikeouts), 3 fouls, 2 in play (1 weak, 1 solid), 2 balls
const sl12 = ["whiff", "whiff", "cstrike", "foul", "foul", "foul", "play", "play", "ball", "ball"]
  .map((res, i) => ({ date: "2026-10-27", count: "1-2", pitch: "Slider", kind: "SL", res, contact: res === "play" ? (i === 6 ? "weak" : "solid") : null, side: "opp" }));
const rows = fromEvents([...fb00, ...sl12, { date: "2026-10-27", count: "garbage", pitch: "Slider", kind: "SL", res: "ball" }, { date: "2026-10-27", count: "0-0", pitch: "X", kind: "FB", res: "balk" }]);

test("rates and the minimum sample", () => {
  assert.deepEqual(rate(7, 12), { k: 7, n: 12, pct: 58.3 });
  assert.deepEqual(rate(2, 4), { k: 2, n: 4, pct: null });
  assert.equal(fmt(rate(2, 4), "swings"), "4 swings, not enough yet");
  assert.equal(fmt(rate(1, 1)), "1 pitch, not enough yet");
  assert.equal(fmt(rate(3, 10)), "30% (3 of 10)");
  assert.equal(fmt(rate(0, 0)), "–");
  assert.equal(fmt(rate(1, 1), "balls in play"), "1 ball in play, not enough yet");
});

test("events become rows; a pitch with no count or an unknown result is left out", () => {
  assert.equal(rows.length, 22);
  assert.ok(rows.every((r) => r.source === "pitchiq"));
});

test("each count and pitch: strike %, whiff %, strikeout % on two strikes, contact on balls in play", () => {
  const cp = byCountAndPitch(rows);
  const f = cp.find((x) => x.count === "0-0" && x.pitch === "Fastball")!.line, s = cp.find((x) => x.count === "1-2" && x.pitch === "Slider")!.line;
  assert.deepEqual(f.strike, { k: 7, n: 12, pct: 58.3 });
  assert.deepEqual(f.whiff, { k: 2, n: 4, pct: null }, "4 swings: not enough for a whiff rate");
  assert.equal(f.k, null, "no strikeout rate outside two-strike counts");
  assert.deepEqual(f.bip.hard, { k: 1, n: 1, pct: null });
  assert.deepEqual(s.strike, { k: 8, n: 10, pct: 80 });
  assert.deepEqual(s.whiff, { k: 2, n: 7, pct: null });
  assert.deepEqual(s.k, { k: 3, n: 10, pct: 30 }, "\"1-2 sliders: 30% K\" with its n");
  assert.equal(s.bip.n, 2);
});

test("usage by count, by pitch and by hitter side", () => {
  const u = usage(rows);
  assert.deepEqual(u.pitches, ["Fastball", "Slider"]);
  assert.deepEqual(u.counts.map((c) => [c.count, c.n]), [["0-0", 12], ["1-2", 10]]);
  assert.deepEqual(u.counts[0].by.Fastball, { k: 12, n: 12, pct: 100 });
  assert.deepEqual(byPitch(rows).map((x) => [x.pitch, x.line.n, x.line.strike.k]), [["Fastball", 12, 7], ["Slider", 10, 8]]);
  const sides = bySide(rows);
  // opposite: 6 fastballs (indices 0,2,4,6,8,10: cstrike, cstrike, whiff, play, ball, ball) + 10 sliders = 16
  const opp = sides.find((s) => s.side === "opp")!.line, same = sides.find((s) => s.side === "same")!.line;
  assert.equal(opp.n, 16); assert.equal(same.n, 6);
  assert.deepEqual(opp.strike, { k: 4 + 8, n: 16, pct: 75 });
  assert.deepEqual(same.strike, { k: 3, n: 6, pct: null });
});

test("TrackMan game files count; bullpens and excluded pitches don't; a charted game counts once", () => {
  const up = [
    { session_type: "game", session_date: "2026-10-27", pitch_type: "Slider", kind: "SL", balls: 0, strikes: 0, res: "ball", contact: null, batter_side: "L", excluded: false },
    { session_type: "game", session_date: "2026-11-03", pitch_type: "Four-seam", pitch_name: "Fastball", kind: "FB", balls: 0, strikes: 2, res: "whiff", contact: null, batter_side: "R", excluded: false },
    { session_type: "game", session_date: "2026-11-03", pitch_type: "Four-seam", kind: "FB", balls: 0, strikes: 0, res: "ball", contact: null, batter_side: "R", excluded: true },
    { session_type: "bullpen", session_date: "2026-11-03", pitch_type: "Four-seam", kind: "FB", balls: null, strikes: null, res: null, contact: null, batter_side: null, excluded: false },
  ];
  const tm = fromUploads(up, "R");
  assert.equal(tm.length, 2);
  assert.equal(tm[1].side, "same"); assert.equal(tm[1].pitch, "Fastball"); assert.equal(tm[0].side, "opp");
  const all = combine(rows, tm);
  assert.equal(all.length, 23, "Oct 27 was charted in PitchIQ: TrackMan's copy of that day is left out; Nov 3 is added");
  const log = outingLog(all);
  assert.deepEqual(log.map((o) => [o.date, o.source, o.pitches, o.strikes, o.k]), [["2026-11-03", "trackman", 1, 1, 1], ["2026-10-27", "pitchiq", 10, 8, 3], ["2026-10-20", "pitchiq", 12, 7, 0]]);
});

test("velocity trend and movement from every upload, excluded out, developing kept apart", () => {
  const up = [
    { session_type: "bullpen", session_date: "2026-11-01", pitch_type: "Four-seam", velo_mph: 90, ivb_in: 17, hb_in: 9, excluded: false, developing: false },
    { session_type: "bullpen", session_date: "2026-11-01", pitch_type: "Four-seam", velo_mph: 92, ivb_in: 18, hb_in: 8, excluded: false, developing: false },
    { session_type: "bullpen", session_date: "2026-11-01", pitch_type: "Four-seam", velo_mph: 70, ivb_in: 10, hb_in: 2, excluded: true, developing: false },
    { session_type: "bullpen", session_date: "2026-11-01", pitch_type: "Splitter", velo_mph: 80, ivb_in: 3, hb_in: 9, excluded: false, developing: true },
  ];
  assert.deepEqual(veloTrend(up), [{ date: "2026-11-01", type: "Four-seam", n: 2, velo: 91, max: 92 }]);
  const mv = movement(up);
  assert.equal(mv.length, 3); assert.ok(mv.find((m) => m.type === "Splitter")!.developing);
  assert.equal(line([] as StatRow[]).n, 0);
});
