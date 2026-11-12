/*
 * The trait gate (spec 5.7): a trait ships only if it is
 *   1. learnable: one season of realistic charting (location logged) moves it at least halfway to the truth, with the
 *      right sign, and leaves it near zero when the truth is zero;
 *   2. worth it: ignoring a realistic-size trait costs at least a quarter as much as getting that pitch's stuff wrong by
 *      one grade point (the yardstick, from the same engine). Cost = regret: the true cost of the call that looks best
 *      under what we believe, minus the truly best call's (never negative). A mixed-strategy comparison was tried
 *      first and rejected: the mix deliberately accepts cost to stay unpredictable, so it isn't a valid loss.
 * Run: node gate_test.js [reps]   (prints a table; writes gate_result.json for the learner's ACTIVE_TRAITS)
 */
const fs = require("fs");
const { season, E, L } = require("./worlds.js");
const REPS = +(process.argv[2] || 5), SHARE = 0.25;
const SIZE = { side_cmd: 0.8, side_grade: 0.8, ahead_cmd: -0.6, behind_cmd: -0.6, stretch_cmd: -0.8, miss_heart: 0.6 };
const pitches = [{ id: "fb", name: "Fastball", kind: "FB", shape: "ride", velo: 86, usage: 0.55 }, { id: "sl", name: "Slider", kind: "SL", shape: "tight", velo: 78, usage: 0.3 }, { id: "ch", name: "Changeup", kind: "CH", shape: "fade", velo: 78, usage: 0.15 }];
const entered = { Fastball: { command: 3, grade: 3 }, Slider: { command: 3, grade: 3 }, Changeup: { command: 3, grade: 3 } };
const pitcher = { id: "p1", pitches: pitches.map((p) => Object.assign({}, p, entered[p.name])) };

// ---- worth it: runs lost per 100 pitches by calling as if the trait weren't there
function rnd(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function valueOf(trait, size, onPitch = "Fastball", mod = null) {
  const r = rnd(11); let lost = 0, n = 0;
  for (let i = 0; i < 160; i++) {
    const b = Math.floor(r() * 4), k = Math.floor(r() * 3);
    const s = E.Situation({ balls: b, strikes: k, outs: Math.floor(r() * 3), bases: r() < 0.4 ? [true, r() < 0.3, false] : [false, false, false], inning: 1 + Math.floor(r() * 7),
      level: "college_d3", same_side: r() < 0.55, timing: {}, hitter_damage: {}, landing_today: {} });
    const mk = (withTrait) => pitches.map((p) => E.Pitch(Object.assign({ name: p.name, kind: p.kind, shape: p.shape, velo: p.velo, grade: 3, command: 3, conf: 0.7, base_conf: 0.7,
      traits: withTrait && p.name === onPitch && !mod ? { [trait]: size } : null }, withTrait && p.name === onPitch && mod ? mod : {})));
    const truth = mk(true), believed = mk(false);
    // v1.0 #18: the live costs (rootCosts over each world's own at-bat table); was the retired v0.7c E.cost
    const live = (ars) => { const tab = E.v08.solveTable(ars, Object.assign({}, s, { balls: 0, strikes: 0, last: null })); return E.v08.rootCosts(ars, s, tab); };
    const ct = live(truth), cb = live(believed);
    const costTrue = new Map(Object.entries(ct));
    let bestB = null, bestBv = Infinity, bestT = Infinity;
    for (const k in cb) if (cb[k] < bestBv) { bestBv = cb[k]; bestB = k; }
    for (const v of costTrue.values()) bestT = Math.min(bestT, v);
    lost += costTrue.get(bestB) - bestT; n++;
  }
  return (100 * lost) / n;
}

// ---- learnable
function learn(trait, size, onPitch, seed) {
  const truth = () => { const t = {}; for (const p of pitches) t[p.name] = { command: 3, grade: 3, traits: p.name === onPitch && size ? { [trait]: size } : null }; return t; };
  const evs = season({ pitches, entered, truth, games: 20, pas: 22, seed, loc: true });
  const prof = L.learnPitcher(E, pitcher, evs, { scoreboard: false, traits: L.ALL_TRAITS });   // the gate judges every trait, on or off in use
  const id = pitches.find((p) => p.name === onPitch).id, v = prof.pitches[id].traits[trait];
  if (!Number.isFinite(v)) throw new Error(`learner returned no value for ${trait}`);   // never let a missing value read as "not learnable"
  return v;
}

const out = {}, rows = [];
const t0 = Date.now();
const zeroCheck = valueOf("side_grade", 0);                       // sanity: a zero-size trait costs nothing
const yard = valueOf(null, 0, "Fastball", { grade: 2 });             // the yardstick: fastball stuff off by one point
console.log(`yardstick: fastball stuff off by one point costs ${yard.toFixed(3)} runs per 100 pitches; a trait must cost ${(SHARE * yard).toFixed(3)} or more`);
for (const [trait, size] of Object.entries(SIZE)) {
  const v = valueOf(trait, size);
  let withT = 0, zero = 0;
  for (let r = 0; r < REPS; r++) { withT += learn(trait, size, "Fastball", 500 + r) / REPS; zero += learn(trait, 0, "Fastball", 900 + r) / REPS; }
  const learnable = Math.sign(withT) === Math.sign(size) && Math.abs(withT) >= 0.5 * Math.abs(size) && Math.abs(zero) < 0.15;
  const worth = v >= SHARE * yard;
  out[trait] = { size, learned: +withT.toFixed(3), whenZero: +zero.toFixed(3), runsPer100: +v.toFixed(3), learnable, worth, pass: learnable && worth };
  rows.push(`${trait.padEnd(12)} true ${String(size).padStart(4)} -> learned ${withT.toFixed(2).padStart(5)} | true 0 -> ${zero.toFixed(2).padStart(5)} | ignoring it costs ${v.toFixed(2)} runs/100 pitches | ${learnable ? "learnable" : "NOT learnable"}, ${worth ? "worth it" : "not worth it"} => ${learnable && worth ? "PASS" : "stays at default"}`);
  console.log(rows[rows.length - 1]);
}
console.log(`(zero-size check: ${zeroCheck.toFixed(4)} runs/100; ${REPS} seasons per row; ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
fs.writeFileSync(__dirname + "/gate_result.json", JSON.stringify({ at: new Date().toISOString(), reps: REPS, yardstick: yard, share: SHARE, traits: out }, null, 1));
