/*
 * v1.1 Step 1: six pitch kinds in the app. The engine's one migration table, the stored-roster migration (db.js), kept
 * signs and fastball-class keys. Run: node kinds_test.js
 */
const E = require("./engine.js");
const D = require("./db.js");
E.init(require("./engine_data.json"));
let fails = 0, n = 0;
const check = (ok, msg) => { n++; console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("1. The engine migrates a pitch the moment it exists");
const P = (kind, shape, extra = {}) => E.Pitch(Object.assign({ name: "x", kind, shape, grade: 3, command: 3, conf: 0.7 }, extra));
check(same([P("FB", "sink").kind, P("FB", "sink").shape], ["SI", "run"]), "Pitch(FB/sink) is SI/run");
check(same([P("FB", "ride").kind, P("FB", "ride").shape], ["FB", "rides"]), "Pitch(FB/ride) is FB/rides");
check(same([P("CB", "loopy").kind, P("CB", "loopy").shape], ["CB", "slow"]), "Pitch(CB/loopy) is CB/slow");
check(same([P("FB", "cut", { type: "Cutter" }).kind, P("FB", "cut", { type: "Cutter" }).shape], ["FC", ""]), "a stored Cutter (FB/cut) is FC");
check(same(E.migratePitch("FB", "runs", "Four-seam"), ["FB", "runs"]), "a type never undoes a coach's edit (Four-seam set to 'runs' stays FB/runs)");
let idem = true;
for (const [k, tags] of Object.entries(E.SHAPE_TAGS)) for (const s of tags) if (!same(E.migratePitch(k, s), [k, s])) idem = false;
check(idem, "every v1.1 kind and tag passes through unchanged");
check(same(E.migratePitch("SI", "sink"), ["SI", "run"]) && same(E.migratePitch("FC", "cut"), ["FC", ""]), "an old portal proposal's fastball tag on a sinker or cutter maps to that kind's tag (SI/sink -> run, FC/cut -> typical)");
check(E.keyKind("SI") === "FB" && E.keyKind("FC") === "FB" && E.keyKind("SL") === "SL" && E.pclass("FC") === "FB" && E.pclass("CH") === "OS",
  "stored keys and classes: sinker and cutter use the fastball's keys");

console.log("2. The app's pitch types are the engine's table");
check(Object.entries(D.PITCH_TYPES).every(([t, v]) => same(E.MIGRATE_BY_TYPE[t], [v.kind, v.shape])) &&
  Object.keys(D.PITCH_TYPES).length === Object.keys(E.MIGRATE_BY_TYPE).length, "PITCH_TYPES (db.js) = MIGRATE_BY_TYPE (engine.js), 13 types");
check(Object.values(D.PITCH_TYPES).every((v) => E.KINDS.includes(v.kind) && E.SHAPE_TAGS[v.kind].includes(v.shape)), "every pitch type is a valid v1.1 kind and tag");
check(Object.keys(D.DEFAULT_TYPE).length === 6 && Object.entries(D.DEFAULT_TYPE).every(([k, t]) => D.PITCH_TYPES[t].kind === k), "a default type for each of the six kinds");

console.log("3. A stored v1.0 pitcher moves to the six kinds once, logged, signs kept");
const v10 = { id: "p1", name: "Ace", pitches: [
  { name: "Fastball", type: "Four-seam", kind: "FB", shape: "ride" }, { name: "Sinker", type: "Sinker", kind: "FB", shape: "sink" },
  { name: "Two-seam", type: "Two-seam", kind: "FB", shape: "run" }, { name: "Cutter", type: "Cutter", kind: "FB", shape: "cut" },
  { name: "Curve", type: "12-6 curve", kind: "CB", shape: "sharp" }, { name: "Split", type: "Splitter", kind: "CH", shape: "drop" },
  { name: "Change", type: "Changeup", kind: "CH", shape: "fade" }, { name: "Old", kind: "FB", shape: "run" }] };
const log = D.migratePitcherV11(v10, E.migratePitch);
const got = v10.pitches.map((d) => `${d.kind}/${d.shape}` + (d.sign ? `#${d.sign}` : ""));
check(same(got, ["FB/rides", "SI/run#1", "SI/two-seam#1", "FC/#1", "CB/12-6", "CH/split", "CH/fade", "FB/runs"]),
  "kinds and tags as the table says; the sinker, two-seamer and cutter keep sign 1 (" + got.join(", ") + ")");
check(log.length === 7 && log.every((x) => x.from && x.to && x.pitch), "every change logged with pitch, from and to (7 changes; the changeup didn't change)");
check(v10.kindsV === D.KINDS_V && D.migratePitcherV11(v10, E.migratePitch).length === 0, "marked as migrated; a second pass changes nothing");
const edited = { name: "B", kindsV: D.KINDS_V, pitches: [{ name: "Splitter", type: "Splitter", kind: "CH", shape: "drop" }] };
check(D.migratePitcherV11(edited, E.migratePitch).length === 0 && edited.pitches[0].shape === "drop", "a pitcher already on v1.1 is left alone (a coach's 'drop' on a Splitter stays)");

console.log("4. Calls for migrated arsenals");
const ars = v10.pitches.slice(0, 7).map((d, i) => E.Pitch({ name: d.name, kind: d.kind, shape: d.shape, sign: d.sign, grade: 3, command: 3, conf: 0.7, velo: [90, 88, 88, 86, 76, 82, 80][i] }));
const s = E.Situation({ balls: 1, strikes: 1, outs: 1, bases: [false, false, false], level: "college_d3" });
const r = E.callV08(ars, s, { rng: () => 0.5 });
const tot = r.dist.reduce((a, d) => a + d.prob, 0);
check(Math.abs(tot - 1) < 1e-9 && r.dist.some((d) => d.pitch.name === "Sinker") && r.dist.some((d) => d.pitch.name === "Cutter"), "a seven-pitch arsenal with a sinker and a cutter gets a call mix that sums to 1, sinker and cutter in it");
let threw = false;
try { E.callV08([E.Pitch({ name: "y", kind: "SI", shape: "rides", grade: 3, command: 3, conf: 0.7 })], s, { rng: () => 0.5 }); } catch (e) { threw = /unknown shape/.test(e.message); }
check(threw, "a tag from another kind (SI/rides) is rejected with a clear message");

console.log("5. Step 1b: the profile table in the app, and old games read through the roster's type");
const L = require("./learner.js");
const pd = { pitches: [{ name: "Two-seam", type: "Two-seam", kind: "SI", shape: "two-seam" }, { name: "Splitter", type: "Splitter", kind: "CH", shape: "split" }] };
const types = L.typesOf(pd);
const old2 = L.snapPitch(E, { name: "Two-seam", kind: "FB", shape: "run", grade: 3, command: 3, conf: 0.7 }, types);
const oldSp = L.snapPitch(E, { name: "Splitter", kind: "CH", shape: "drop", grade: 3, command: 3, conf: 0.7 }, types);
const new2 = L.snapPitch(E, { name: "Two-seam", kind: "SI", shape: "drop", grade: 3, command: 3, conf: 0.7 }, types);
check(old2.kind === "SI" && old2.shape === "two-seam" && oldSp.shape === "split", "a v1.0 snapshot of a two-seamer (FB/run) and a splitter (CH/drop) read as SI/two-seam and CH/split through the roster's type");
check(new2.kind === "SI" && new2.shape === "drop", "a v1.1 snapshot is never changed by the type (a sinker logged as SI/drop stays SI/drop)");
check(E.profile("SL", "sweeper", "hs")[2] < E.profile("SL", "gyro", "hs")[2] && E.defaultMph("FC", "") < E.defaultMph("FB", "") && E.mph(E.Pitch({ name: "c", kind: "CB", shape: "slow", grade: 3, command: 3, conf: 0.7 })) === E.defaultMph("CB", "slow"),
  "the app's engine has the profile table: a sweeper sweeps more than a gyro slider, a cutter's default speed is under the fastball's, a pitch with no speed gets its profile's default");

console.log("v1.1 Step 5. The learner's specs read in v1.1 terms (a record still in v1.0 terms migrates by its type)");
{
  const lv = "college_d3";
  const v10 = { name: "Two-seam", kind: "FB", shape: "run", type: "Two-seam", velo: 87, command: 3, grade: 3 };
  const v11 = { name: "Two-seam", kind: "SI", shape: "two-seam", velo: 87, command: 3, grade: 3 };
  const noType = { name: "Two-seam", kind: "FB", shape: "run", velo: 87, command: 3, grade: 3 };
  const a = [L.strikeRate(E, v10, lv), L.strikeRef(E, v10, lv), L.strikeRateFast(E, v10, lv)];
  const b = [L.strikeRate(E, v11, lv), L.strikeRef(E, v11, lv), L.strikeRateFast(E, v11, lv)];
  check(a.every((x, i) => Math.abs(x - b[i]) < 1e-12) && Math.abs(L.strikeRate(E, noType, lv) - b[0]) > 1e-3,
    `a v1.0-stored two-seamer (FB/run, type Two-seam) has the v1.1 sinker's strike rate, reference and fast rate (${b.map((x) => x.toFixed(4)).join(", ")}); without its type it would read as a four-seam "runs" (${L.strikeRate(E, noType, lv).toFixed(4)})`);
}

console.log(fails ? `\n${fails} kinds check(s) FAILED` : `\nall ${n} kinds checks passed`);
process.exit(fails ? 1 : 0);
