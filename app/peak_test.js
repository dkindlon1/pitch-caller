// Build 3: app/peak.js by hand (baseline weights and prior, the statistics, findings, drift, archetype) and the
// situational rule (plan proof 4): a pitch good in one situation and bad in another gets two findings, not one blanket.
const P = require("./peak.js");
let fails = 0; const check = (ok, m) => { console.log((ok ? "  ok   " : "  FAIL ") + m); if (!ok) fails++; };
const close = (a, b, t = 1e-4) => Math.abs(a - b) < t;
const ev = (o) => Object.assign({ type: "pitch", pitchId: "sl", pitchName: "Slider", kind: "SL", res: "ball", sit: { batters_faced: 0, same_side: true, bases: [false, false, false] }, pcRaw: 10 }, o);

console.log("1. statistics");
check(close(P.betaCdf(0.5, 1, 1), 0.5) && close(P.betaCdf(0.2, 2, 5), 0.34464, 1e-4) && close(P.betaCdf(0.9, 5, 2), 0.885735, 1e-4), "the beta CDF matches known values (uniform, Beta(2,5), Beta(5,2))");
check(close(P.normCdf(1.959964), 0.975, 2e-4) && close(P.normCdf(0), 0.5), "the normal CDF");

console.log("2. baseline");
const none = P.baseline([]);
check(Object.keys(none.pitches).length === 0, "no outings: no pitches (the prior speaks per pitch)");
const pr = P.priorFor("sl", "Slider", "SL");
check(pr.metrics.whiff.p === P.LEVEL.whiff.SL && pr.metrics.strike.p === P.LEVEL.strike.SL, "a new pitch starts at the level prior for its kind");
// 7 outings: the newest 5 count fully, the 6th 0.8, the 7th 0.64; the whiff rate pulls toward the prior by PRIOR_N swings
const outing = (date, whiffs, swings, season = "2026") => ({ date, season, pitches: Array.from({ length: swings }, (_, i) => ev({ res: i < whiffs ? "whiff" : "foul" })) });
const ous = [outing("2026-04-07", 0, 10), outing("2026-04-06", 0, 10), outing("2026-04-05", 5, 10), outing("2026-04-04", 5, 10), outing("2026-04-03", 5, 10), outing("2026-04-02", 5, 10), outing("2026-04-01", 5, 10)];
const b = P.baseline(ous, { season: "2026" }).pitches.sl.metrics.whiff;
const wSum = 5 * 10 + 0.8 * 10 + 0.64 * 10, wWhiff = 3 * 5 + 0.8 * 5 + 0.64 * 5;
check(close(b.p, (wWhiff + P.PRIOR_N * P.LEVEL.whiff.SL) / (wSum + P.PRIOR_N)) && close(b.n, wSum), `recency weights: newest 5 full, then 0.8, 0.64 (${b.p.toFixed(4)})`);
const b2 = P.baseline([outing("2026-04-01", 5, 10, "2026"), outing("2025-04-01", 10, 10, "2025")], { season: "2026" }).pitches.sl.metrics.whiff;
check(close(b2.n, 10 + 0.5 * 10), "a previous season's outing carries half weight");
const cross = P.baseline([{ date: "d", pitches: [ev({ thrown: "Fastball", thrownId: "fb", res: "whiff" })] }]);
check(!!cross.pitches.fb && !cross.pitches.sl, "a cross-up counts for the pitch thrown");

console.log("3. findings");
// a slider that misses bats early in the game and gets nothing the 3rd time through
const evs = [];
for (let i = 0; i < 30; i++) evs.push(ev({ res: i % 2 ? "whiff" : "foul", sit: { batters_faced: 2, same_side: true, bases: [false, false, false] } }));
for (let i = 0; i < 30; i++) evs.push(ev({ res: i % 10 === 0 ? "whiff" : "foul", sit: { batters_faced: 20, same_side: true, bases: [false, false, false] } }));
const base = P.baseline([{ date: "2026-03-01", pitches: Array.from({ length: 100 }, (_, i) => ev({ res: i % 10 < 3 ? "whiff" : "foul" })) }]);
const f = P.findings(evs, base);
const third = f.shown.find((x) => x.variable === "tto" && x.bucket === "3rd+" && x.metric === "whiff");
check(!!third && third.level !== "noise" && third.k === 3 && third.n === 30, `3rd time through: whiffs ${third && third.k}/${third && third.n} found (${third && third.level})`);
check(third && /Slider whiffs drop from 30% to 10% the third time through and after \(30 swings\)/.test(third.sentence), `the sentence reads plainly (${third && third.sentence})`);
const first = f.shown.find((x) => x.variable === "tto" && x.bucket === "1st" && x.metric === "whiff");
check(!!first && first.raw > first.base, "and the same pitch's first time through is its own (good) finding: never a blanket");
check(f.shown.length <= P.MAX_SHOWN && f.shown.every((x, i, a) => i === 0 || a[i - 1].level === "clear" || x.level === "early"), "at most 5, clear ones first");
check(third && third.chart.map((c) => c.bucket).join() === "1st,2nd,3rd+" && third.chart[2].n === 30, "the chart is the metric across that variable's buckets");
const tiny = P.findings(evs.slice(0, 7), base);
check(tiny.tested === 0, "cells under 8 aren't tested");
const flat = [];
for (let i = 0; i < 60; i++) flat.push(ev({ res: i % 10 < 3 ? "whiff" : "foul", sit: { batters_faced: i, same_side: i % 2 === 0, bases: [false, false, false] } }));
check(P.findings(flat, base).shown.filter((x) => x.level === "clear").length === 0, "a pitch exactly at his normal: nothing clear");

console.log("4. drift");
const night = (whiffs, swings) => Array.from({ length: swings }, (_, i) => ev({ res: i < whiffs ? "whiff" : "foul" }));
check(P.drift(night(0, 7), base).length === 0, "under 8 of a pitch tonight: no note");
const d1 = P.drift(night(0, 14), base);
check(d1.some((n) => n.metric === "whiff"), "0 whiffs on 14 swings vs a 30% normal: a whiff note");
check(/isn't missing bats like usual \(0 whiffs on 14 swings vs about 30%\)/.test((d1.find((n) => n.metric === "whiff") || {}).text || ""), `worded plainly (${(d1[0] || {}).text})`);
check(P.drift(night(3, 14), base).every((n) => n.metric !== "whiff"), "3 whiffs on 14 (21%): not clearly below, no note");
const log = P.driftLog([...night(1, 10), ...night(0, 16)], base);
check(log.filter((n) => n.metric === "whiff").length === 1 && log[0].at > 10, `one note per pitch per metric per game, at the pitch it first fired (pitch ${log[0] && log[0].at})`);

console.log("5. archetype");
const strong = P.baseline([{ date: "d", pitches: [...Array.from({ length: 60 }, (_, i) => ev({ pitchId: "fb", pitchName: "Fastball", kind: "FB", res: i % 10 < 7 ? "cstrike" : "ball" })),
  ...Array.from({ length: 40 }, (_, i) => ev({ res: i % 5 < 2 ? "whiff" : "foul" }))] }]);
check(P.archetype(strong) === "Strike thrower, slider for whiffs", `"${P.archetype(strong)}"`);
check(P.archetype(P.baseline([])) === null, "no history: no label");
// a pitch off all night (strikes low in every situation) shows once, with how many other situations matched
{ const wild = []; for (let i = 0; i < 60; i++) wild.push({ type: "pitch", n: i + 1, pcRaw: i, pitchId: "fb", pitchName: "Fastball", kind: "FB", res: i % 5 ? "ball" : "cstrike", sit: { batters_faced: Math.floor(i / 2.2), same_side: i % 2 === 0, bases: [i % 3 === 0, false, false] } });
  const fw = P.findings(wild, P.baseline([])), strikes = fw.shown.filter((x) => x.pitch === "fb" && x.metric === "strike");
  check(strikes.length === 1 && strikes[0].alsoIn >= 2 && /The same in \d+ other situations: most of the outing/.test(strikes[0].sentence), `off all night: one finding, not one per situation (${strikes.length}; "${strikes[0] && strikes[0].sentence}")`); }
console.log(fails ? `${fails} check(s) failed` : "all peak checks passed"); process.exit(fails ? 1 : 0);
