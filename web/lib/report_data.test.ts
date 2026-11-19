// Build 1: the report data layer against hand counts on a small charted outing, and the heat map totals rule
// (called and landed add up; pitches without a cell are counted, not dropped).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { buildGameSummary, buildHitterAtBats, buildOuting, buildRecap, pitchesOf, type Ev } from "./report_data.ts";
import { calledCell } from "./report_outcomes.ts";

const require = createRequire(import.meta.url);
const PC = require("./engine.js");
PC.init(require("./engine_data.json"));

const P = [{ id: "fb", name: "Fastball", kind: "FB" }, { id: "sl", name: "Slider", kind: "SL" }];
let n = 0;
const ev = (o: Partial<Ev>): Ev => ({ type: "pitch", gameId: "g1", pitcherId: "p1", inning: 1, ph: "R", ...o, n: ++n } as Ev);
// Inning 1, three at-bats (slot 0 R, slot 1 L, slot 2 R):
//  AB1: FB up-in called strike [1,1]; SL chase whiff [4,2]; FB down-away foul (0-2) [3,3]; SL chase in play OUT weak (no cell)  -> out
//  AB2 (L): FB 0-0 ball [2,4]; FB 1-0 ball; FB 2-0 ball [2,-1]; FB 3-0 ball -> walk (ball four), coach call on the 3rd, cross-up on the 4th (threw SL)
//  AB3: SL 0-0 in play 2B unlogged contact [2,2] (recall after a shake-off) -> hit
const evs: Ev[] = [
  ev({ slot: 0, bs: "R", count: "0-0", sit: { outs: 0 }, outs: 0, pitchId: "fb", pitchName: "Fastball", kind: "FB", quad: "up-in", res: "cstrike", locCell: [1, 1], choice: "engine", prob: 0.3, mix: [["fb", "Fastball", "up-in", 0.3], ["sl", "Slider", "chase", 0.7]] }),
  ev({ slot: 0, bs: "R", count: "0-1", sit: { outs: 0 }, outs: 0, pitchId: "sl", pitchName: "Slider", kind: "SL", quad: "chase", res: "whiff", locCell: [4, 2], choice: "engine" }),
  ev({ slot: 0, bs: "R", count: "0-2", sit: { outs: 0 }, outs: 0, pitchId: "fb", pitchName: "Fastball", kind: "FB", quad: "down-away", res: "foul", locCell: [3, 3], choice: "engine" }),
  ev({ slot: 0, bs: "R", count: "0-2", sit: { outs: 0 }, outs: 1, pitchId: "sl", pitchName: "Slider", kind: "SL", quad: "chase", res: "play", out: "OUT", contact: "weak", end: true, paEnd: "out", choice: "engine", radar: 80 }),
  ev({ slot: 1, bs: "L", count: "0-0", sit: { outs: 1 }, outs: 1, pitchId: "fb", pitchName: "Fastball", kind: "FB", quad: "up-away", res: "ball", locCell: [2, 4], choice: "engine", radar: 88 }),
  ev({ slot: 1, bs: "L", count: "1-0", sit: { outs: 1 }, outs: 1, pitchId: "fb", pitchName: "Fastball", kind: "FB", quad: "down-in", res: "ball", choice: "engine" }),
  ev({ slot: 1, bs: "L", count: "2-0", sit: { outs: 1 }, outs: 1, pitchId: "fb", pitchName: "Fastball", kind: "FB", quad: "middle", res: "ball", locCell: [2, -1], choice: "coach", coach: true, mix: [["sl", "Slider", "down-away", 0.6], ["fb", "Fastball", "middle", 0.4]] }),
  ev({ slot: 1, bs: "L", count: "3-0", sit: { outs: 1 }, outs: 1, pitchId: "fb", pitchName: "Fastball", kind: "FB", thrown: "Slider", thrownId: "sl", quad: "middle", res: "ball", end: true, paEnd: "walk", choice: "engine" }),
  ev({ slot: 2, bs: "R", count: "0-0", sit: { outs: 1 }, outs: 1, pitchId: "sl", pitchName: "Slider", kind: "SL", quad: "down-away", res: "play", out: "2B", locCell: [2, 2], end: true, paEnd: "hard", runs: 1, choice: "recall", shaken: [["Fastball", "up-in"]] }),
  // a deleted pitch and a play between pitches (caught stealing: an out)
  ev({ slot: 3, count: "0-0", res: "cstrike", deletedAt: 5, pitchId: "fb", pitchName: "Fastball", kind: "FB", quad: "middle" }),
];
const plays: Ev[] = [{ type: "play", play: "cs", gameId: "g1", pitcherId: "p1", inning: 1, outs: 2 }];
const game = { id: "g1", date: "2026-03-01", opponent: "Rivals", level: "college_d3" };

test("pitchesOf: deleted pitches and plays left out", () => { assert.equal(pitchesOf([...evs, ...plays]).length, 9); });

test("the line, by hand", () => {
  const r = buildOuting([...evs, ...plays], game, "p1", P, "staff", "R");
  const L = r.line;
  assert.equal(L.pitches, 9); assert.equal(L.strikes, 5); assert.equal(L.balls, 4);
  assert.equal(L.k, 0); assert.equal(L.bb, 1); assert.equal(L.hbp, 0); assert.equal(L.h, 1); assert.equal(L.hard, 0, "the double's contact wasn't logged");
  assert.equal(L.bf, 3); assert.equal(L.outs, 2, "1 out in play + 1 caught stealing"); assert.equal(L.ip, "0.2"); assert.equal(L.runs, 1);
  assert.equal(L.whiffs, 1); assert.equal(L.swings, 4); assert.equal(L.positive, 4); assert.equal(L.negative, 2, "ball four and the double");
  assert.equal(L.firstPitches, 3); assert.equal(L.firstStrikes, 2);
});

test("pitch mix: results follow the pitch thrown (the cross-up counts as a slider)", () => {
  const r = buildOuting(evs, game, "p1", P, "staff", "R");
  const fb = r.mix.all.rows.find((x) => x.key === "fb")!, sl = r.mix.all.rows.find((x) => x.key === "sl")!;
  assert.equal(fb.n, 5); assert.equal(sl.n, 4);
  assert.equal(fb.strikes.num, 2); assert.equal(fb.strikes.pct, null, "fewer than 10 fastballs: no rate");
  assert.equal(sl.whiffs.num, 1); assert.equal(sl.whiffs.den, 3);
  assert.equal(r.mix.byGroup["0-0"].n, 3); assert.equal(r.mix.byGroup.two.n, 2); assert.equal(r.mix.byGroup.three.n, 1); assert.equal(r.mix.byGroup.behind.n, 2); assert.equal(r.mix.byGroup.ahead.n, 1);
  assert.equal(r.mix.bySide.L.n, 4); assert.equal(r.mix.bySide.R.n, 5);
});

test("heat maps: called + left = landed + left = every pitch, per filter and layer", () => {
  const r = buildOuting(evs, game, "p1", P, "staff", "R");
  for (const f of r.heat.filters) {
    assert.equal(f.called.counted + f.called.left, f.n, `${f.name} called`);
    assert.equal(f.landed.counted + f.landed.left, f.n, `${f.name} landed`);
    for (const g of [f.called, f.landed]) {
      const s = Object.values(g.cells).reduce((a, c) => ({ n: a.n + c.n, st: a.st + c.strike, b: a.b + c.ball }), { n: 0, st: 0, b: 0 });
      assert.equal(s.n, g.counted); assert.equal(s.st + s.b, g.counted, "every counted pitch is a strike or a ball");
    }
  }
  const all = r.heat.filters[0];
  assert.equal(all.landed.left, 3, "three pitches had no cell logged (the weak out, the 1-0 ball, the cross-up)"); assert.equal(all.called.left, 0);
  assert.deepEqual(all.landed.cells["2,-1"], { n: 1, strike: 0, ball: 1, positive: 0, negative: 0 }, "the way-off cell counts");
  assert.equal(all.called.cells["2,2"].n, 2, "two pitches called middle (the coach's and the cross-up's)");
  assert.equal(all.called.cells["1,1"].n, 2, "up-in to a righty and up-away to a lefty are both the catcher's left, high");
  assert.equal(all.called.cells["4,2"].n, 2, "two slider chases in the dirt");
});

test("hitter by hitter: three at-bats with their results; the pitcher's view has no hitter ids or who chose", () => {
  const s = buildOuting(evs, game, "p1", P, "staff", "R"), p = buildOuting(evs, game, "p1", P, "pitcher", "R");
  assert.deepEqual(s.atBats.map((a) => [a.key, a.result, a.pitches.length]), [["1", "out", 4], ["5", "walk", 4], ["9", "hit", 1]]);
  assert.equal(s.atBats[1].pitches[3].called, "Fastball"); assert.equal(s.atBats[1].pitches[3].pitch, "Slider");
  assert.equal(s.atBats[2].pitches[0].choice, "recall");
  assert.ok(p.atBats.every((a) => !("hitterId" in a) && a.pitches.every((x) => !("choice" in x))));
  assert.equal(p.atBats[2].pitches[0].shaken, 1, "his own shake-off shows in his view");
  assert.equal(p.overrides, null);
});

test("overrides: the coach's call, the re-call after a shake-off and the cross-up, with what the engine had", () => {
  const r = buildOuting(evs, game, "p1", P, "staff", "R");
  assert.deepEqual(r.overrides!.map((o) => [o.n, o.kind]), [[7, "coach"], [8, "cross"], [9, "shake"]].map(([a, b]) => [Number(a) + (n - 10), b]));
  const coach = r.overrides!.find((o) => o.kind === "coach")!;
  assert.deepEqual(coach.engineTop.map((m) => m.pitch), ["Slider", "Fastball"]); assert.equal(coach.engineProb, null);
  assert.equal(coach.restOfAtBat.pitches, 1); assert.equal(coach.restOfAtBat.negative, 1); assert.equal(coach.restOfAtBat.result, "Walk");
  const shake = r.overrides!.find((o) => o.kind === "shake")!;
  assert.deepEqual(shake.shaken, [{ pitch: "Fastball", quad: "up-in" }]);
});

test("game summary: one row per pitcher, the staff line is their sum", () => {
  const two = [...evs, ev({ pitcherId: "p2", slot: 3, bs: "R", count: "0-0", sit: { outs: 2 }, outs: 3, pitchId: "x", pitchName: "Sinker", kind: "SI", quad: "down-in", res: "play", out: "OUT", end: true, paEnd: "out" })];
  const s = buildGameSummary([...two, ...plays], game, [{ id: "p1", name: "Ace", pitches: P }, { id: "p2", name: "Pen" }]);
  assert.deepEqual(s.pitchers.map((p) => [p.name, p.line.pitches, p.line.outs]), [["Ace", 9, 2], ["Pen", 1, 1]]);
  assert.equal(s.staff.pitches, 10); assert.equal(s.staff.outs, 3); assert.equal(s.pitchers[0].overrides.coach, 1);
});

test("recap: season line, trends, level comparison labeled from public level data", () => {
  const g2 = evs.map((e) => ({ ...e, gameId: "g2" }));
  const r = buildRecap([...evs, ...g2], [game, { id: "g2", date: "2026-03-08", opponent: "Others", level: "college_d3" }], { id: "p1", name: "Ace", hand: "R", pitches: P }, { name: "Spring", final: true }, "public");
  assert.equal(r.line.pitches, 18); assert.equal(r.meta.outings, 2); assert.equal(r.trends.rows.length, 2);
  assert.equal(r.trends.showVelo, false, "velo logged in 2 outings: under the 3-outing rule");
  assert.equal(r.comparison.levelK, 0.162); assert.equal(r.comparison.ab, 4); assert.equal(r.comparison.avg.num, 2);
  assert.ok(r.outings.every((o) => !("opponent" in o)), "no opponent on a public recap");
});

test("a hitter's at-bats across games", () => {
  const withIds = evs.map((e) => ({ ...e, hitterId: e.slot === 1 ? "h1" : "h0" }));
  const abs = buildHitterAtBats([...withIds, ...withIds.map((e) => ({ ...e, gameId: "g2" }))], [game, { id: "g2", date: "2026-03-08" }], [{ id: "p1", name: "Ace", pitches: P }], "h1");
  assert.equal(abs.length, 2); assert.equal(abs[0].date, "2026-03-08"); assert.equal(abs[0].result, "walk");
});

test("old events (no mix, no bs, no cell) still build every section", () => {
  const old = evs.map(({ mix: _m, bs: _b, locCell: _l, ...e }) => ({ ...e, sit: { ...e.sit, same_side: e.slot !== 1 } }));
  const r = buildOuting(old, game, "p1", P, "staff", "R");
  assert.equal(r.line.pitches, 9); assert.equal(r.mix.bySide.L.n, 4, "side from the same-side flag");
  assert.equal(r.heat.filters[0].landed.left, 9); assert.equal(r.completeness.mixLogged, 0);
  assert.ok(r.overrides!.every((o) => Array.isArray(o.engineTop)));
});

test("called cells agree with the engine's own locQuad, every spot, kind and side", () => {
  for (const q of PC.QUADS) for (const kind of ["FB", "SI", "FC", "SL", "CB", "CH"]) for (const side of ["L", "R"] as const) {
    const c = calledCell(q, kind, side)!;
    assert.equal(PC.v08.locQuad(c, kind, side === "R"), q, `${q} ${kind} ${side} -> ${c}`);
  }
});
