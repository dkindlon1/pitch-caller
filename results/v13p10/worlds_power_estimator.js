// Part 10 task 4: the worlds_test section-14 power estimator (copied as is), the power preset (power 1.5, contact -1) and
// free_swinger (0.5), at 150 / 400 / 1600 / 6400 PAs, 40 seasons each (worlds_test's seeds 1400 + 97 r + n), three ways:
//   asis  - the test's estimator on the test's generator;
//   norm  - the estimator divides each powerRow by its sum (what the generator's pick does);
//   noclamp - generator and estimator both use a powerRow that rescales 1B / out instead of clamping out at 0 (scratch
//             world change, to show the bias is the clamp).
const dir = process.argv[2] || "C:/dev/pc-final/app";
const HW = require(dir + "/worlds.js"), OT = require(dir + "/engine_data.json").V08.OUT_TABLE.college_d3;
const MODE = process.argv[3] || "asis", R = 40;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const numFit = (ll) => {
  let bt = 0, bv = -Infinity; for (let x = -6; x <= 6.0001; x += 0.1) { const v = ll(x); if (v > bv) { bv = v; bt = x; } }
  const h = 1e-3, d = (x) => [(ll(x + h) - ll(x - h)) / (2 * h), (ll(x + h) - 2 * ll(x) + ll(x - h)) / (h * h)];
  let th = bt; for (let it = 0; it < 30; it++) { const [d1, d2] = d(th); if (d2 >= 0) break; const st = -d1 / d2; th = Math.max(-8, Math.min(8, th + st)); if (Math.abs(st) < 1e-7) break; }
  const d2 = d(th)[1]; return { est: th, se: d2 < 0 ? 1 / Math.sqrt(-d2) : Infinity };
};
const sg = (x) => 1 / (1 + Math.exp(-x)), lg = (p) => Math.log(p / (1 - p));
function rowNoClamp(row, power) {   // xbh shifted as powerRow; the increase taken from out and 1B in proportion (sums to 1)
  const d = (power || 0) * HW.TRAIT_SIZE.power_xbh; if (!d) return row;
  const [po, p1, p2, p3, phr, pe] = row, old = [p2, p3, phr], nw = old.map((x) => (x > 0 && x < 1 ? sg(lg(x) + d) : x));
  let up = 0; for (let i = 0; i < 3; i++) up += nw[i] - old[i];
  const f = (po + p1 - up) / (po + p1); return [po * f, p1 * f, nw[0], nw[1], nw[2], pe];
}

const pr = HW.powerRow;   // noclamp: run with the app_noclamp dir (its powerRow has no clamp)
function est(pas) {
  const bips = pas.filter((p) => p.bip).map((p) => p.bip);
  return numFit((th) => { let s = 0; for (const b of bips) { let p = 0; for (const t of ["GB", "LD", "FB", "PU"]) { const r = pr(OT[b.contact][t], th); const z = MODE === "norm" ? r.reduce((a, c) => a + c, 0) : 1; p += b.mix[t] * r[b.ev] / z; } s += Math.log(Math.max(p, 1e-300)); } return s; });
}
const out = {};
for (const [nm, pre] of [["power", HW.HITTER_PRESETS.power], ["free_swinger", HW.HITTER_PRESETS.free_swinger], ["contact", HW.HITTER_PRESETS.contact]]) {
  out[nm] = {};
  for (const n of [150, 400, 1600, 6400]) {
    const xs = [], ses = []; let nb = 0;
    for (let r = 0; r < R; r++) { const pas = HW.hitterSeason({ traits: pre, pas: n, seed: 1400 + 97 * r + n }); nb += pas.filter((p) => p.bip).length; const e = est(pas); xs.push(e.est); ses.push(e.se); }
    const m = mean(xs), sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
    out[nm][n] = { truth: pre.power, mean: +m.toFixed(3), sd: +sd.toFixed(3), se_mean: +(sd / Math.sqrt(R)).toFixed(3), avg_se: +mean(ses).toFixed(3), bips_per_season: Math.round(nb / R) };
  }
}
console.log(JSON.stringify({ mode: MODE, dir, out }));
