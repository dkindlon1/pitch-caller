/*
 * Build 3 proof 1 and 2 (PLAN_outcome_tracking 5), on simulated seasons (seeded, repeatable; mulberry32: an LCG's
 * consecutive draws are correlated, which skews simulated rates).
 *   1. Findings. With no planted effect: how many seasons show any "clear" finding, and how many "early signs" (the
 *      false-discovery control's job: targets 5% of seasons and well under one early sign a season). With a planted effect
 *      (slider whiffs down 15 or 25 points the third time through, 12- and 24-outing seasons): how often it's flagged.
 *   2. Drift. Steady outings (every pitch at his normal): false notes per outing (target under 1 per 5 outings). Planted
 *      drops (slider whiffs to 8% from the first pitch, or from pitch 30): how often caught, and after how many slider swings.
 * The false-alarm targets pass or fail the run; detection is reported as measured.
 * Usage (from app/): node peak_sim.js [n=200]
 */
const P = require("./peak.js");
const N = +(process.argv[2] || 200);
let seed = 20261119;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const PITCHES = [["fb", "Fastball", "FB", 0.5, 0.20, 0.36], ["sl", "Slider", "SL", 0.3, 0.32, 0.28], ["ch", "Changeup", "CH", 0.2, 0.28, 0.30]];
function outing(date, effect, pitchCount = 95) {
  const evs = []; let bf = 0, n = 0;
  while (n < pitchCount) {
    const len = 2 + Math.floor(rnd() * 5), bases = [rnd() < 0.3, rnd() < 0.15, rnd() < 0.1], same = rnd() < 0.5;
    for (let j = 0; j < len && n < pitchCount; j++, n++) {
      let u = rnd(), p = PITCHES[0]; for (const x of PITCHES) { u -= x[3]; if (u <= 0) { p = x; break; } }
      const e = { type: "pitch", n: n + 1, pitchId: p[0], pitchName: p[1], kind: p[2], pcRaw: n, sit: { batters_faced: bf, same_side: same, bases } };
      const whiff = effect ? effect(e, p[4]) : p[4];
      if (rnd() < 0.36) e.res = "ball"; else if (rnd() < 0.33) e.res = "cstrike"; else if (rnd() < whiff) e.res = "whiff"; else if (rnd() < 0.5) e.res = "foul";
      else { e.res = "play"; e.contact = rnd() < p[5] ? "hard" : rnd() < 0.5 ? "weak" : "solid"; e.out = "OUT"; }
      evs.push(e);
    }
    bf++;
  }
  return { date, season: "2026", pitches: evs };
}
const day = (i) => `2026-${String(2 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`;
const season = (len, eff) => Array.from({ length: len }, (_, i) => outing(day(i), eff));
const look = (outs) => P.findings(outs.flatMap((o) => o.pitches), P.baseline(outs, { season: "2026" }));

console.log(`1. Findings (${N} simulated seasons each)`);
let falseSeasons = 0, falseEarly = 0;
for (let s = 0; s < N; s++) { const f = look(season(12, null)); if (f.all.some((c) => c.level === "clear")) falseSeasons++; falseEarly += f.shown.filter((c) => c.level === "early").length; }
console.log(`   no planted effect: ${falseSeasons} seasons (${(100 * falseSeasons / N).toFixed(1)}%) with any clear finding; ${(falseEarly / N).toFixed(2)} early signs a season`);
for (const [len, drop] of [[12, 0.15], [24, 0.15], [12, 0.25], [24, 0.25]]) {
  let clear = 0, early = 0;
  for (let s = 0; s < N; s++) {
    const f = look(season(len, (e, w) => (e.pitchId === "sl" && P.tto(e) === 3 ? w - drop : w)));
    const c = f.all.find((x) => x.pitch === "sl" && x.variable === "tto" && x.bucket === "3rd+" && x.metric === "whiff");
    if (c && c.level === "clear") clear++; else if (c && c.level === "early") early++;
  }
  console.log(`   planted ${Math.round(drop * 100)}-point drop, ${len}-outing season: clear ${(100 * clear / N).toFixed(0)}%, early sign ${(100 * early / N).toFixed(0)}% more`);
}

console.log(`2. Drift (${N} outings each, his normal from 8 earlier outings)`);
let falseNotes = 0;
for (let i = 0; i < N; i++) { const base = P.baseline(season(8, null), { season: "2026" }); falseNotes += P.driftLog(outing("2026-04-01", null).pitches, base).length; }
console.log(`   steady outings: ${(falseNotes / N).toFixed(3)} false notes per outing (target under 0.2)`);
for (const [label, from] of [["off from the first pitch", 0], ["drops at pitch 30", 30]]) {
  let caught = 0; const swings = [];
  for (let i = 0; i < N; i++) {
    const base = P.baseline(season(8, null), { season: "2026" }), o = outing("2026-04-01", (e, w) => (e.pitchId === "sl" && e.pcRaw >= from ? 0.08 : w), 110);
    const hit = P.driftLog(o.pitches, base).find((x) => x.pitch === "sl" && x.metric === "whiff");
    if (hit) { caught++; swings.push(o.pitches.filter((e) => e.pitchId === "sl" && e.pcRaw >= from && e.n <= hit.atN && ["whiff", "foul", "play"].includes(e.res)).length); }
  }
  swings.sort((a, b) => a - b);
  console.log(`   slider whiffs to 8%, ${label}: caught in ${(100 * caught / N).toFixed(0)}% of outings, median ${swings[Math.floor(swings.length / 2)] ?? "-"} slider swings after it started`);
}
// the false-alarm targets, as checks (detection above is reported, not judged)
const target = (ok, msg) => console.log((ok ? "  ok   " : "  FAIL ") + msg);
target(falseSeasons / N <= 0.05, `seasons with a false "clear" finding: ${(100 * falseSeasons / N).toFixed(1)}% (target 5% or less)`);
target(falseEarly / N < 0.5, `false early signs: ${(falseEarly / N).toFixed(2)} a season (target under 0.5)`);
target(falseNotes / N < 0.2, `false drift notes: ${(falseNotes / N).toFixed(3)} per steady outing (target under 0.2)`);
const ok = falseSeasons / N <= 0.05 && falseEarly / N < 0.5 && falseNotes / N < 0.2;
console.log(ok ? "peak simulations: the false-alarm targets are met" : "peak simulations: a false-alarm target was missed");
process.exit(ok ? 0 : 1);
