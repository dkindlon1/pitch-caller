// Build 1 proof 3: the outcome definitions (PLAN_reports_recap 2), a test per result type: fouls by strike count,
// unlogged contact, ball four, HBP, and the grid / count group / side helpers every report uses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calledCell, countGroup, countOf, hitterSide, landedCell, outcome, rate, thrownKey, thrownName, zoneOfCell, COUNT_GROUPS } from "./report_outcomes.ts";

const o = (res: string, count: string, extra: Record<string, unknown> = {}) => outcome({ res, count, ...extra })!;
const kind = (x: ReturnType<typeof o>) => (x.positive ? "positive" : x.negative ? "negative" : "neither");

test("whiff: a strike, positive, at any count", () => {
  for (const c of ["0-0", "1-2", "3-2"]) { const x = o("whiff", c); assert.equal(x.strike, true); assert.equal(kind(x), "positive"); }
});
test("called strike: a strike, positive", () => { const x = o("cstrike", "2-1"); assert.equal(x.strike, true); assert.equal(kind(x), "positive"); });
test("foul with 2 strikes: a strike, positive", () => {
  for (const c of ["0-2", "1-2", "2-2", "3-2"]) { const x = o("foul", c); assert.equal(x.strike, true); assert.equal(kind(x), "positive", c); }
});
test("foul with fewer than 2 strikes: positive too (plan default: it adds a strike)", () => {
  for (const c of ["0-0", "1-0", "2-1", "3-1", "0-1"]) assert.equal(kind(o("foul", c)), "positive", c);
});
test("ball that isn't ball four: a ball, neither", () => {
  for (const c of ["0-0", "2-2", "2-0"]) { const x = o("ball", c); assert.equal(x.ball, true); assert.equal(x.strike, false); assert.equal(kind(x), "neither"); assert.equal(x.ballFour, false); }
});
test("ball four: a ball, negative (from the count before the pitch: three balls)", () => {
  for (const c of ["3-0", "3-1", "3-2"]) { const x = o("ball", c); assert.equal(x.ball, true); assert.equal(x.ballFour, true); assert.equal(kind(x), "negative", c); }
  assert.equal(o("ball", "", { sit: { balls: 3, strikes: 1 } }).ballFour, true, "count from the situation snapshot when the count string is missing");
});
test("a wild pitch is still a ball (neither unless ball four)", () => { assert.equal(kind(o("ball", "1-1", { wp: "wp" })), "neither"); assert.equal(kind(o("ball", "3-1", { wp: "wp" })), "negative"); });
test("HBP: a ball, negative, at any count", () => {
  for (const c of ["0-0", "0-2", "3-2"]) { const x = o("hbp", c); assert.equal(x.ball, true); assert.equal(kind(x), "negative"); }
});
test("in play, weak contact: positive (a bloop hit too)", () => {
  assert.equal(kind(o("play", "1-1", { out: "OUT", contact: "weak" })), "positive");
  const bloop = o("play", "1-1", { out: "1B", contact: "weak" }); assert.equal(kind(bloop), "positive"); assert.equal(bloop.hit, true);
});
test("in play, hard contact: negative (a hard out too), counted as hard", () => {
  for (const out of ["OUT", "1B", "2B", "HR"]) { const x = o("play", "0-0", { out, contact: "hard" }); assert.equal(kind(x), "negative", out); assert.equal(x.hard, true); assert.equal(x.strike, true); }
});
test("in play, solid contact: the result decides (out positive, hit negative)", () => {
  assert.equal(kind(o("play", "2-2", { out: "OUT", contact: "solid" })), "positive");
  assert.equal(kind(o("play", "2-2", { out: "2B", contact: "solid" })), "negative");
  assert.equal(o("play", "2-2", { out: "2B", contact: "solid" }).hard, false);
});
test("in play, contact not logged: an out is positive, a hit negative (plan default)", () => {
  assert.equal(kind(o("play", "0-1", { out: "OUT" })), "positive");
  for (const out of ["1B", "2B", "3B", "HR"]) assert.equal(kind(o("play", "0-1", { out })), "negative", out);
  assert.equal(o("play", "0-1", { out: "HR" }).hard, false, "an unlogged home run isn't counted as hard contact (only logged contact is)");
});
test("reached on error counts as an out in play", () => { assert.equal(kind(o("play", "1-0", { out: "E" })), "positive"); assert.equal(o("play", "1-0", { out: "E" }).hit, false); });
test("contact on a pitch that wasn't in play is ignored", () => { assert.equal(o("foul", "0-0", { contact: "hard" }).hard, false); });
test("not a result: null", () => { assert.equal(outcome({ res: "balk", count: "0-0" }), null); assert.equal(outcome({ count: "0-0" }), null); });
test("every result type is exactly one of positive / negative / neither", () => {
  const cases = [["ball", "0-0"], ["ball", "3-0"], ["hbp", "1-1"], ["cstrike", "0-0"], ["whiff", "1-2"], ["foul", "0-0"], ["foul", "1-2"], ["play", "0-0", { out: "OUT" }], ["play", "0-0", { out: "1B" }], ["play", "0-0", { out: "OUT", contact: "hard" }]] as const;
  for (const [r, c, x] of cases) { const y = o(r, c, x || {}); assert.equal(+y.positive + +y.negative + +y.neither, 1, `${r} ${c}`); assert.equal(+y.strike + +y.ball, 1); }
});

test("count groups: a partition of the 12 counts", () => {
  const want: Record<string, string> = { "0-0": "0-0", "0-1": "ahead", "1-1": "even", "1-0": "behind", "2-0": "behind", "2-1": "behind", "0-2": "two", "1-2": "two", "2-2": "two", "3-0": "three", "3-1": "three", "3-2": "three" };
  for (const [c, g] of Object.entries(want)) assert.equal(countGroup(countOf({ count: c })!), g, c);
  assert.deepEqual(new Set(Object.values(want)), new Set(COUNT_GROUPS));
});
test("hitter side: logged, else from the same-side flag and his hand", () => {
  assert.equal(hitterSide({ bs: "L" }), "L");
  assert.equal(hitterSide({ ph: "R", sit: { same_side: true } }), "R");
  assert.equal(hitterSide({ ph: "R", sit: { same_side: false } }), "L");
  assert.equal(hitterSide({ sit: { same_side: false } }, "L"), "R");
  assert.equal(hitterSide({}), null);
});
test("the pitch a result belongs to: the one thrown on a cross-up, by id", () => {
  assert.equal(thrownKey({ pitchId: "a", pitchName: "Fastball" }), "a");
  assert.equal(thrownKey({ pitchId: "a", pitchName: "Fastball", thrown: "Slider", thrownId: "b" }), "b");
  assert.equal(thrownKey({ pitchName: "Fastball", thrown: "Slider" }), "name:Slider");
  assert.equal(thrownName({ pitchName: "Fastball", thrown: "Slider" }), "Slider");
  assert.equal(thrownKey({ pitchId: "a", pitchName: "Fastball", thrown: "Fastball" }), "a", "thrown = called is not a cross-up");
});
test("called cell: the inverse of the engine's locQuad (inside is the hitter's side; chase by the called kind)", () => {
  assert.deepEqual(calledCell("up-in", "FB", "R"), [1, 1]); assert.deepEqual(calledCell("up-in", "FB", "L"), [1, 3]);
  assert.deepEqual(calledCell("down-away", "SL", "R"), [3, 3]); assert.deepEqual(calledCell("down-away", "SL", "L"), [3, 1]);
  assert.deepEqual(calledCell("middle", "CH", "R"), [2, 2]); assert.deepEqual(calledCell("down-middle", "CH", "R"), [3, 2]);
  assert.deepEqual(calledCell("chase", "FB", "R"), [0, 2]); assert.deepEqual(calledCell("chase", "SL", "R"), [4, 2]); assert.deepEqual(calledCell("chase", "SI", "L"), [0, 2]);
  assert.equal(calledCell("away", "FB", "R"), null, "an old coarse spot has no cell");
});
test("landed cell: the 5x5 grid and the four way-off cells only", () => {
  assert.deepEqual(landedCell([0, 4]), [0, 4]); assert.deepEqual(landedCell([5, 2]), [5, 2]); assert.deepEqual(landedCell([2, -1]), [2, -1]);
  assert.equal(landedCell([5, 5]), null); assert.equal(landedCell(null), null); assert.equal(landedCell(undefined), null); assert.equal(landedCell("2,2"), null);
  assert.equal(zoneOfCell(2, 2), "heart"); assert.equal(zoneOfCell(1, 3), "edge"); assert.equal(zoneOfCell(0, 0), "off"); assert.equal(zoneOfCell(-1, 2), "way");
});
test("the 10-pitch rule: a rate shows only with 10+ of that pitch", () => {
  assert.equal(rate(3, 9, 9).pct, null); assert.equal(rate(3, 9, 9).num, 3);
  assert.equal(rate(3, 10, 10).pct, 0.3); assert.equal(rate(2, 4, 12).pct, 0.5, "the sample is the pitch count, not the denominator");
  assert.equal(rate(0, 0, 20).pct, null);
});
