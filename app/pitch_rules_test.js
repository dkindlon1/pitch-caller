/*
 * Pitch-count rules against each source's own table (pitch_rules.js says where each came from). Run: node pitch_rules_test.js
 */
const R = require("./pitch_rules.js");
let fails = 0, n = 0;
const check = (ok, msg) => { n++; console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const rule = (id) => R.resolve({ preset: id });

console.log("1. Every tier boundary, from the sources' tables");
// [preset, [pitches, rest] ...]: both ends of every tier
const TABLES = {
  "ps-7-8": [[1, 0], [20, 0], [21, 1], [35, 1], [36, 2], [50, 2]],
  "ps-9-10": [[20, 0], [21, 1], [35, 1], [36, 2], [50, 2], [51, 3], [65, 3], [66, 4], [75, 4]],
  "ps-11-12": [[65, 3], [66, 4], [85, 4]],
  "ps-13-14": [[20, 0], [21, 1], [66, 4], [95, 4]],
  "ps-15-16": [[30, 0], [31, 1], [45, 1], [46, 2], [60, 2], [61, 3], [75, 3], [76, 4], [95, 4]],
  "ps-17-18": [[30, 0], [31, 1], [60, 2], [61, 3], [80, 3], [81, 4], [105, 4]],
  "ps-19-22": [[30, 0], [80, 3], [81, 4], [105, 4], [120, 4]],
  "ll-11-12": [[20, 0], [21, 1], [35, 1], [36, 2], [50, 2], [51, 3], [65, 3], [66, 4], [85, 4]],
  "ll-15-16": [[30, 0], [31, 1], [45, 1], [46, 2], [60, 2], [61, 3], [75, 3], [76, 4], [95, 4]],
  "ny-jv": [[1, 1], [30, 1], [31, 2], [45, 2], [46, 3], [75, 3], [76, 4], [85, 4]],
  "ny-modified": [[20, 1], [21, 2], [40, 2], [41, 3], [60, 3], [61, 4], [75, 4]],
  nj: [[30, 0], [31, 1], [50, 1], [51, 2], [70, 2], [71, 3], [90, 3], [91, 4], [110, 4]],
  "ga-varsity": [[35, 0], [36, 1], [60, 1], [61, 2], [85, 2], [86, 3], [110, 3]],
  "ga-sub": [[24, 0], [25, 1], [44, 1], [45, 2], [64, 2], [65, 3], [90, 3]],
};
for (const [id, rows] of Object.entries(TABLES)) {
  const r = rule(id), bad = rows.filter(([pc, rest]) => R.restFor(r, pc, "2026-04-15") !== rest);
  check(!bad.length, `${r.name}: ${rows.length} boundaries${bad.length ? " WRONG at " + JSON.stringify(bad) : ""}`);
}
const MAX = { "ps-7-8": 50, "ps-9-10": 75, "ps-11-12": 85, "ps-13-14": 95, "ps-15-16": 95, "ps-17-18": 105, "ps-19-22": 120,
  "ll-6-8": 50, "ll-9-10": 75, "ll-11-12": 85, "ll-13-14": 95, "ll-15-16": 95, "ny-jv": 85, "ny-modified": 75, nj: 110, "ga-varsity": 110, "ga-sub": 90 };
const wrongMax = Object.entries(MAX).filter(([id, m]) => rule(id).max !== m);
check(!wrongMax.length, `daily limits match the sources${wrongMax.length ? ": " + JSON.stringify(wrongMax) : ""}`);
check(R.restFor(rule("nj"), 0, "2026-04-01") === 0, "no pitches, no rest");

console.log("2. New York varsity changes with the month");
const ny = rule("ny-varsity");
check(R.limits(ny, "2026-03-20").max === 85 && R.restFor(ny, 76, "2026-03-20") === 4 && R.restFor(ny, 75, "2026-03-20") === 3, "March: 85 a day, 76-85 is 4 nights");
check(R.limits(ny, "2026-04-20").max === 105 && R.restFor(ny, 65, "2026-04-20") === 2 && R.restFor(ny, 66, "2026-04-20") === 3 && R.restFor(ny, 96, "2026-04-20") === 4, "April: 105, 31-65 is 2 nights, 66-95 is 3, 96-105 is 4");
check(R.limits(ny, "2026-05-20").max === 125 && R.limits(ny, "2026-06-05").max === 125 && R.restFor(ny, 40, "2026-05-20") === 1 && R.restFor(ny, 41, "2026-05-20") === 2 && R.restFor(ny, 103, "2026-06-05") === 4,
  "May and June: 125, 1-40 is 1 night, 103-125 is 4");
check(R.limits(ny, "2026-02-25").max === 85, "a February scrimmage counts as March");

console.log("3. The day he can pitch again");
const ps = rule("ps-13-14");
let e = R.eligibleOn(ps, [{ date: "2026-11-03", pitches: 66 }], "2026-11-05");
check(e.date === "2026-11-08" && e.why.kind === "rest", `66 pitches Tuesday under Pitch Smart 13-14 (4 days off): eligible Sunday (${e.date})`);
e = R.eligibleOn(ps, [{ date: "2026-11-03", pitches: 20 }], "2026-11-04");
check(e.date === "2026-11-04" && e.today, "20 pitches yesterday (no rest needed): eligible today");
e = R.eligibleOn(ps, [{ date: "2026-11-05", pitches: 20 }], "2026-11-05");
check(e.date === "2026-11-06", "already pitched today: not again today");
e = R.eligibleOn(ny, [{ date: "2026-04-06", pitches: 30 }], "2026-04-06");
check(e.date === "2026-04-07", "New York: 1 night of rest means he can pitch the next day");
e = R.eligibleOn(ny, [{ date: "2026-04-06", pitches: 100 }], "2026-04-06");
check(e.date === "2026-04-10", "New York April: 100 pitches Monday is 4 nights, so Friday");
e = R.eligibleOn(ps, [{ date: "2026-11-03", pitches: 10 }, { date: "2026-11-04", pitches: 10 }], "2026-11-05");
check(e.date === "2026-11-06" && e.why.kind === "consecutive", `two days in a row: not a third (eligible ${e.date})`);
e = R.eligibleOn(ps, [{ date: "2026-11-02", pitches: 10 }, { date: "2026-11-04", pitches: 10 }], "2026-11-05");
check(e.date === "2026-11-05", "with a day between, he's fine");
e = R.eligibleOn(ps, [{ date: "2026-11-04", pitches: 30 }, { date: "2026-11-04", pitches: 25 }], "2026-11-05");
check(e.date === "2026-11-08", "two games on one day count as one day (55 pitches: 3 days off)");
const nj = rule("nj");
e = R.eligibleOn(nj, [{ date: "2026-04-01", pitches: 30 }, { date: "2026-04-02", pitches: 30 }], "2026-04-03");
check(e.date === "2026-04-04" && e.why.kind === "consecutive", `New Jersey: not three days in a row (${e.date})`);
e = R.eligibleOn(nj, [{ date: "2026-04-01", pitches: 50 }, { date: "2026-04-03", pitches: 50 }, { date: "2026-04-05", pitches: 50 }], "2026-04-06");
check(e.date === "2026-04-07", `New Jersey: 50 three times, a day apart: his rest says Tuesday (${e.date})`);
let s = R.liveStatus(nj, 0, "2026-04-07", [{ date: "2026-04-01", pitches: 50 }, { date: "2026-04-03", pitches: 50 }, { date: "2026-04-05", pitches: 50 }]);
check(s.max === 50, `and that day the 150-in-5-days cap leaves him 50, not 110 (${s.max})`);
const ga = rule("ga-varsity");
e = R.eligibleOn(ga, [{ date: "2026-04-01", pitches: 110 }], "2026-04-02");
check(e.date === "2026-04-05", "Georgia varsity: 110 pitches is 3 days off");

console.log("4. During the game");
s = R.liveStatus(ps, 33, "2026-11-05");
check(s.max === 95 && s.rest === 1 && s.nextAt === 36 && s.nextRest === 2 && s.level === "ok", `33 pitches: 1 day's rest now, 3 more is 2 days (${JSON.stringify(s)})`);
s = R.liveStatus(ps, 86, "2026-11-05");
check(s.level === "near" && s.left === 9 && s.nextAt === null, "86 of 95: near the limit, no tier left before it");
s = R.liveStatus(rule("ll-11-12"), 85, "2026-11-05");
check(s.level === "limit" && s.finishBatter === true, "Little League at 85: the limit, and he may finish the batter");
s = R.liveStatus(ps, 0, "2026-11-05");
check(s.rest === 0 && s.nextAt === 21, "before his first pitch: the next tier starts at 21");

s = R.liveStatus(rule("ga-varsity"), 0, "2026-04-02", [{ date: "2026-04-01", pitches: 35 }]);
check(s.max === 75 && s.capped && s.capped.before === 35, `Georgia: 35 pitches yesterday leave 75 today (110 over two days) (${s.max})`);
s = R.liveStatus(nj, 0, "2026-04-06", [{ date: "2026-04-02", pitches: 60 }, { date: "2026-04-04", pitches: 60 }, { date: "2026-03-30", pitches: 100 }]);
check(s.max === 30, `New Jersey: 120 in the last four days leaves 30 of the 150 (${s.max})`);
console.log("5. The coach's own numbers");
const mine = R.resolve({ preset: "ps-13-14", max: 80 });
check(mine.max === 80 && mine.edited && mine.tiers.length === 5, "a preset with the coach's own limit says it's edited");
check(R.resolve({}).id === "custom" && R.resolve({ preset: "nope" }).id === "custom", "no or unknown preset: custom");
check(R.PRESETS.every((x) => x.id === "custom" || (x.source && x.checked)), "every preset but custom names its source and when it was checked");

console.log(fails ? `\n${fails} rules check(s) FAILED` : `\nall ${n} rules checks passed`);
process.exit(fails ? 1 : 0);
