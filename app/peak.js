/*
 * Build 3: pitch outcome tracking and the peak profile (docs/PLAN_outcome_tracking_2026-11-18.md). One module for the
 * game app (the in-game drift check, offline) and the website (outing report and recap sections, the server job); the
 * website loads an identical copy (web/lib/peak.js, checked by scripts/test-app.sh like engine.js).
 *
 *   baseline(outings, opts)  his normal per pitch: whiff per swing, strike rate, hard contact per logged ball in play
 *                            (and velo when radar was logged), recency-weighted (the last 5 outings count fully, older
 *                            ones fade, about half weight carried over from a previous season), starting from a level
 *                            prior for the pitch's kind so a new pitch or pitcher doesn't swing wildly.
 *   findings(evs, base)      each pitch x situation (time through the order, pitch count, runners, hitter side, hitter
 *                            approach tag) x metric cell against his normal for that pitch, shrunk toward it; a
 *                            Benjamini-Hochberg false-discovery control keeps "clear" honest; at most 5 shown, strongest
 *                            first; "early sign" when likely but not clear; noise hidden. Findings are per situation:
 *                            never a blanket "stop throwing it".
 *   drift(tonight, base)     after each pitch: for each pitch with 8+ thrown tonight, a note when it's very likely
 *                            (90%) below his normal by at least a quarter of the way to the level's bad end. Notes only:
 *                            nothing here is read by the engine or changes a call.
 *   archetype(base)          a plain label for what he is at his best ("Strike thrower, slider for whiffs").
 * Pure, no clock, no randomness. peak_test.js and web/lib/peak.test.ts check it; the simulations are in peak_sim.js.
 */
(function (root) {
  "use strict";
  const VERSION = "1.0.0";

  // ---------------------------------------------------------------- what one pitch counts toward
  const HARD = { hard: 1 };
  function pitchOf(e) {
    // results follow the pitch actually thrown (a cross-up's are the thrown pitch's), keyed by pitch id when known
    const crossed = e.thrown && e.thrown !== e.pitchName;
    return { key: crossed ? (e.thrownId || "name:" + e.thrown) : (e.pitchId || "name:" + e.pitchName), name: crossed ? e.thrown : e.pitchName };
  }
  function counts(e) {
    const r = e.res, strike = r === "cstrike" || r === "whiff" || r === "foul" || r === "play";
    const swing = r === "whiff" || r === "foul" || r === "play";
    const bip = r === "play" && (e.contact === "weak" || e.contact === "solid" || e.contact === "hard");
    return { pitch: 1, strike: strike ? 1 : 0, swing: swing ? 1 : 0, whiff: r === "whiff" ? 1 : 0, bip: bip ? 1 : 0, hard: bip && HARD[e.contact] ? 1 : 0 };
  }
  const isPitch = (e) => (e.type === undefined || e.type === null || e.type === "pitch") && !e.deletedAt && !e.legacy && ["ball", "cstrike", "whiff", "foul", "play", "hbp"].includes(e.res);
  // the three rates: numerator, denominator, which way is bad
  const METRICS = { whiff: { num: "whiff", den: "swing", bad: "low", label: "whiffs per swing" }, strike: { num: "strike", den: "pitch", bad: "low", label: "strike rate" },
    hard: { num: "hard", den: "bip", bad: "high", label: "hard contact" } };

  // ---------------------------------------------------------------- level priors (starting points, by pitch kind)
  // Typical rates by kind for a college pitcher, used as a weak prior (PRIOR_N pseudo-observations) so early numbers
  // aren't wild, and the "bad end" a drift is measured toward. Starting points, to be refit on real data.
  const LEVEL = {
    whiff: { FB: 0.19, SI: 0.14, FC: 0.22, SL: 0.31, CB: 0.29, CH: 0.30, "?": 0.22 },
    strike: { FB: 0.64, SI: 0.63, FC: 0.63, SL: 0.60, CB: 0.57, CH: 0.58, "?": 0.61 },
    hard: { FB: 0.38, SI: 0.33, FC: 0.35, SL: 0.30, CB: 0.30, CH: 0.31, "?": 0.34 },
  };
  const BAD = { whiff: 0.06, strike: 0.45, hard: 0.65 };   // the level's bad end for each rate
  const PRIOR_N = 15, RECENT = 5, FADE = 0.8, LAST_SEASON = 0.5;
  const level = (metric, kind) => LEVEL[metric][kind] ?? LEVEL[metric]["?"];

  // ---------------------------------------------------------------- the baseline (his normal)
  /**
   * outings: [{ date, season, pitches: [event] }] for one pitcher, any order. opts: { season (the current one), kinds:
   * { pitchKey: kind } }. Weights: newest RECENT outings 1, then FADE^k; outings from another season x LAST_SEASON.
   */
  function baseline(outings, opts = {}) {
    const list = outings.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const by = {};
    list.forEach((o, i) => {
      // opts.flat: every outing counts the same (a season's own normal, for the recap's situational findings)
      const w = opts.flat ? 1 : (i < RECENT ? 1 : Math.pow(FADE, i - RECENT + 1)) * (opts.season && o.season && o.season !== opts.season ? LAST_SEASON : 1);
      for (const e of o.pitches) {
        if (!isPitch(e)) continue;
        const p = pitchOf(e), c = counts(e), b = by[p.key] || (by[p.key] = { key: p.key, name: p.name, kind: (opts.kinds || {})[p.key] || e.kind || "?", sums: { pitch: 0, strike: 0, swing: 0, whiff: 0, bip: 0, hard: 0 }, raw: { pitch: 0, swing: 0, bip: 0 }, velo: [] });
        for (const k in c) b.sums[k] += w * c[k];
        b.raw.pitch += c.pitch; b.raw.swing += c.swing; b.raw.bip += c.bip;
        const v = Number(e.radar ?? (e.v08 && e.v08.radar)); if (v > 40) b.velo.push([v, w]);
      }
    });
    const out = {};
    for (const b of Object.values(by)) {
      const m = {};
      for (const [k, d] of Object.entries(METRICS)) {
        const prior = level(k, b.kind), n = b.sums[d.den], x = b.sums[d.num];
        const p = (x + PRIOR_N * prior) / (n + PRIOR_N);
        m[k] = { p, n, raw: b.raw[d.den], se: Math.sqrt(p * (1 - p) / (n + PRIOR_N)), prior };
      }
      let velo = null;
      if (b.velo.length) { const W = b.velo.reduce((a, [, w]) => a + w, 0), mu = b.velo.reduce((a, [v, w]) => a + v * w, 0) / W;
        const sd = Math.sqrt(b.velo.reduce((a, [v, w]) => a + w * (v - mu) * (v - mu), 0) / W) || 1.5; velo = { mean: mu, sd: Math.max(0.8, sd), n: b.velo.length }; }
      out[b.key] = { key: b.key, name: b.name, kind: b.kind, pitches: b.raw.pitch, metrics: m, velo };
    }
    return { version: VERSION, pitches: out, outings: list.length };
  }
  /** a pitch with no history: the level prior alone */
  function priorFor(key, name, kind) {
    const m = {}; for (const k of Object.keys(METRICS)) { const p = level(k, kind); m[k] = { p, n: 0, raw: 0, se: Math.sqrt(p * (1 - p) / PRIOR_N), prior: p }; }
    return { key, name, kind, pitches: 0, metrics: m, velo: null };
  }

  // ---------------------------------------------------------------- statistics
  function normCdf(z) {   // Abramowitz-Stegun 7.1.26
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
    return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }
  // P(rate < x) for a Beta(a, b): the regularized incomplete beta (Numerical Recipes' continued fraction)
  function lgamma(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const k of c) s += k / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
  function betacf(a, b, x) { let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d; let h = d;
    for (let m = 1; m <= 200; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break; }
    return h; }
  function betaCdf(x, a, b) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }

  // ---------------------------------------------------------------- situations (plan 2: the breakdowns)
  function tto(e) { const bf = Number(e.sit && e.sit.batters_faced); return Number.isFinite(bf) ? Math.min(3, Math.floor(bf / 9) + 1) : null; }
  function pcBucket(e) { const pc = Number(e.pcRaw ?? (e.sit && e.sit.pitch_count)); if (!Number.isFinite(pc)) return null; return pc <= 25 ? "0-25" : pc <= 50 ? "26-50" : pc <= 75 ? "51-75" : "76+"; }
  const VARS = {
    tto: { label: "time through the order", of: (e) => { const t = tto(e); return t === null ? null : ["1st", "2nd", "3rd+"][t - 1]; }, order: ["1st", "2nd", "3rd+"],
      phrase: (b) => ({ "1st": "the first time through", "2nd": "the second time through", "3rd+": "the third time through and after" })[b] },
    pc: { label: "pitch count", of: pcBucket, order: ["0-25", "26-50", "51-75", "76+"], phrase: (b) => `at pitches ${b}` },
    runners: { label: "runners", of: (e) => (e.sit && Array.isArray(e.sit.bases) ? (e.sit.bases.some(Boolean) ? "on" : "empty") : null), order: ["empty", "on"],
      phrase: (b) => (b === "on" ? "with runners on (from the stretch)" : "with the bases empty") },
    side: { label: "hitter side", of: (e) => (e.sit && typeof e.sit.same_side === "boolean" ? (e.sit.same_side ? "same" : "opp") : null), order: ["same", "opp"],
      phrase: (b) => (b === "same" ? "to same-side hitters" : "to opposite-side hitters") },
    approach: { label: "hitter approach", of: (e) => { const t = e.sit && e.sit.hitter_tags && e.sit.hitter_tags.approach; return t === "aggressive" || t === "patient" ? t : null; },
      order: ["aggressive", "patient"], phrase: (b) => `to ${b} hitters` },
  };
  const MIN_CELL = 8, SHRINK = 10, CLEAR_Q = 0.05, EARLY_P = 0.2, MAX_SHOWN = 5;
  const pct = (x) => `${Math.round(100 * x)}%`;

  /**
   * evs: the pitches being looked at (one outing, or a season). base: baseline() (his normal) or null. kinds: { pitchKey:
   * kind }. Returns { tested, shown: [finding], all } where each finding has its sentence, numbers and the chart data.
   */
  function findings(evs, base, opts = {}) {
    const ps = evs.filter(isPitch), cells = [];
    const byPitch = {};
    for (const e of ps) { const p = pitchOf(e); (byPitch[p.key] || (byPitch[p.key] = { name: p.name, list: [] })).list.push(e); }
    for (const [key, { name, list }] of Object.entries(byPitch)) {
      const kind = (opts.kinds || {})[key] || list[0].kind || "?";
      const b = (base && base.pitches && base.pitches[key]) || priorFor(key, name, kind);
      for (const [vk, v] of Object.entries(VARS)) {
        const buckets = {};
        for (const e of list) { const bk = v.of(e); if (bk === null || bk === undefined) continue; const c = counts(e), s = buckets[bk] || (buckets[bk] = { pitch: 0, strike: 0, swing: 0, whiff: 0, bip: 0, hard: 0 }); for (const k in c) s[k] += c[k]; }
        for (const [mk, md] of Object.entries(METRICS)) {
          const p0 = b.metrics[mk].p;
          const chart = v.order.map((bk) => { const s = buckets[bk]; return { bucket: bk, k: s ? s[md.num] : 0, n: s ? s[md.den] : 0 }; });
          for (const c of chart) {
            if (c.n < MIN_CELL) continue;
            const raw = c.k / c.n, shrunk = (c.k + SHRINK * p0) / (c.n + SHRINK);
            const z = (c.k - c.n * p0) / Math.sqrt(c.n * p0 * (1 - p0));
            const pv = 2 * (1 - normCdf(Math.abs(z)));
            const worse = md.bad === "low" ? raw < p0 : raw > p0;
            cells.push({ pitch: key, name, kind, variable: vk, bucket: c.bucket, metric: mk, k: c.k, n: c.n, raw, shrunk, base: p0, z, p: pv, worse, chart, unit: md.den });
          }
        }
      }
    }
    // Benjamini-Hochberg over every cell tested here
    const sorted = cells.slice().sort((a, b) => a.p - b.p), m = sorted.length;
    let cut = -1; sorted.forEach((c, i) => { if (c.p <= ((i + 1) / m) * CLEAR_Q) cut = i; });
    // "early sign": the same control at a looser rate (likely, not certain), so noise doesn't fill the list either
    let cutE = -1; sorted.forEach((c, i) => { if (c.p <= ((i + 1) / m) * EARLY_P) cutE = i; });
    sorted.forEach((c, i) => { c.level = i <= cut ? "clear" : i <= cutE ? "early" : "noise"; c.q = Math.min(1, (c.p * m) / (i + 1)); });
    // one finding per pitch, metric and direction (the strongest): a pitch off all night shows once, saying in how many
    // other situations it was the same; a pitch good in one situation and bad in another still shows twice
    const ranked = sorted.filter((c) => c.level !== "noise").sort((a, b) => (a.level === b.level ? Math.abs(b.z) - Math.abs(a.z) : a.level === "clear" ? -1 : 1));
    const firstOf = {}, shown = [];
    for (const c of ranked) {
      const g = `${c.pitch}|${c.metric}|${c.raw > c.base ? "up" : "down"}`;
      if (firstOf[g]) { firstOf[g].alsoIn++; continue; }
      c.alsoIn = 0; firstOf[g] = c; shown.push(c);
    }
    shown.splice(MAX_SHOWN);
    for (const c of shown) c.sentence = sentence(c);
    return { tested: m, shown, all: sorted };
  }
  const UNIT = { swing: ["swing", "swings"], pitch: ["pitch", "pitches"], bip: ["ball in play", "balls in play"] };
  function sentence(c) {
    const md = METRICS[c.metric], up = c.raw > c.base, verb = up ? "rise" : "drop";
    const what = c.metric === "whiff" ? `${c.name} whiffs` : c.metric === "strike" ? `${c.name} strikes` : `Hard contact on his ${c.name.toLowerCase()}`;
    const v = VARS[c.variable];
    const nWord = c.unit === "pitch" ? `${c.n} ${c.name.toLowerCase()}${c.n === 1 ? "" : "s"}` : `${c.n} ${UNIT[c.unit][c.n === 1 ? 0 : 1]}`;
    void md;
    const also = c.alsoIn ? ` The same in ${c.alsoIn} other situation${c.alsoIn === 1 ? "" : "s"}: ${c.alsoIn >= 2 ? "most of the outing, not just this spot" : "worth a look"}.` : "";
    return `${what} ${c.metric === "hard" ? (up ? "goes up" : "goes down") : verb} from ${pct(c.base)} to ${pct(c.raw)} ${v.phrase(c.bucket)} (${nWord}).${also}`;
  }

  // ---------------------------------------------------------------- drift (in game)
  // 8+ of the pitch tonight and 8+ of the metric's own count (swings, pitches, logged balls in play); tonight's rate is
// judged with his normal as a modest prior (DRIFT_PRIOR observations), so a short stretch alone can't fire a note
const DRIFT_MIN = 8, DRIFT_P = 0.9, VELO_DROP = 1.5;
let DRIFT_SHARE = 0.35;   // plan default 0.25; 0.35 keeps false notes under 1 per 5 outings (peak_sim.js)
let DRIFT_PRIOR = 4, SE_SHIFT = 0.5, EARLY_LOOK = 0.08;   // tuned on simulations (peak_sim.js); _tune() is for that sweep only
// a note needs more certainty on few observations (each pitch is another look at the same night): 90% at 20+, more below
const needP = (n) => Math.min(0.99, DRIFT_P + EARLY_LOOK * Math.max(0, (20 - n) / 12));
  /**
   * tonight: tonight's pitches for one pitcher, in order; base: his baseline (or null). Returns the notes that hold now,
   * one per pitch per metric: { pitch, name, metric, k, n, base, prob, text }. A note that stops holding is dropped.
   */
  function drift(tonight, base, opts = {}) {
    const by = {};
    for (const e of tonight) { if (!isPitch(e)) continue; const p = pitchOf(e); (by[p.key] || (by[p.key] = { name: p.name, list: [] })).list.push(e); }
    const notes = [];
    for (const [key, { name, list }] of Object.entries(by)) {
      if (list.length < DRIFT_MIN) continue;
      const kind = (opts.kinds || {})[key] || list[0].kind || "?";
      const b = (base && base.pitches && base.pitches[key]) || priorFor(key, name, kind);
      const s = { pitch: 0, strike: 0, swing: 0, whiff: 0, bip: 0, hard: 0 };
      for (const e of list) { const c = counts(e); for (const k in c) s[k] += c[k]; }
      for (const [mk, md] of Object.entries(METRICS)) {
        const k = s[md.num], n = s[md.den]; if (n < DRIFT_MIN) continue;
        const p0 = b.metrics[mk].p, se0 = b.metrics[mk].se, bad = BAD[mk];
        // the line: a quarter of the way from his normal toward the level's bad end, measured from the cautious edge of
        // his normal (one standard error), so an uncertain normal doesn't make an ordinary night look like a drop
        const line = md.bad === "low" ? (p0 - SE_SHIFT * se0) - DRIFT_SHARE * Math.max(0, p0 - bad) : (p0 + SE_SHIFT * se0) + DRIFT_SHARE * Math.max(0, bad - p0);
        // tonight's rate as Beta(k + DRIFT_PRIOR p0, n - k + DRIFT_PRIOR (1 - p0)): the chance it's on the bad side of the line
        const a = k + DRIFT_PRIOR * p0, bb = n - k + DRIFT_PRIOR * (1 - p0);
        const prob = md.bad === "low" ? betaCdf(line, a, bb) : 1 - betaCdf(line, a, bb);
        if (prob >= needP(n)) notes.push({ pitch: key, name, metric: mk, k, n, base: p0, line, prob, text: driftText(name, mk, k, n, p0) });
      }
      const velos = list.map((e) => Number(e.radar ?? (e.v08 && e.v08.radar))).filter((v) => v > 40);
      if (b.velo && b.velo.n >= 15 && velos.length >= DRIFT_MIN) {
        const mu = velos.reduce((a, v) => a + v, 0) / velos.length, se = b.velo.sd / Math.sqrt(velos.length);
        const prob = normCdf(((b.velo.mean - VELO_DROP) - mu) / se);
        if (prob >= DRIFT_P) notes.push({ pitch: key, name, metric: "velo", k: Math.round(mu * 10) / 10, n: velos.length, base: b.velo.mean, line: b.velo.mean - VELO_DROP, prob,
          text: `His ${name.toLowerCase()} is down in velocity (${mu.toFixed(1)} mph on ${velos.length} readings vs about ${b.velo.mean.toFixed(1)})` });
      }
    }
    return notes;
  }
  function driftText(name, metric, k, n, p0) {
    const nm = name.toLowerCase();
    if (metric === "whiff") return `His ${nm} isn't missing bats like usual (${k} whiff${k === 1 ? "" : "s"} on ${n} swing${n === 1 ? "" : "s"} vs about ${pct(p0)})`;
    if (metric === "strike") return `His ${nm} isn't finding the zone like usual (${k} strike${k === 1 ? "" : "s"} on ${n} vs about ${pct(p0)})`;
    return `His ${nm} is getting hit harder than usual (${k} hard of ${n} in play vs about ${pct(p0)})`;
  }
  /** every drift note that fired during a game, in order, each at the pitch it first fired (for the outing report) */
  function driftLog(game, base, opts = {}) {
    const ps = game.filter(isPitch), seen = {}, out = [];
    for (let i = 0; i < ps.length; i++) for (const n of drift(ps.slice(0, i + 1), base, opts)) {
      const id = n.pitch + "|" + n.metric;
      if (!seen[id]) { seen[id] = true; out.push(Object.assign({ at: i + 1, atN: ps[i].n }, n)); }
    }
    return out;
  }

  // ---------------------------------------------------------------- peak archetype
  /** a plain label for what he is at his best, from his normal (only pitches with real history speak) */
  function archetype(base) {
    const ps = Object.values((base && base.pitches) || {}).filter((p) => p.pitches >= 30);
    if (!ps.length) return null;
    const total = ps.reduce((a, p) => a + p.pitches, 0);
    const strike = ps.reduce((a, p) => a + p.metrics.strike.p * p.pitches, 0) / total;
    const parts = [];
    if (strike >= 0.64) parts.push("Strike thrower"); else if (strike < 0.57) parts.push("Effectively wild");
    const whiffer = ps.filter((p) => p.metrics.whiff.raw >= 15).sort((a, b) => b.metrics.whiff.p - a.metrics.whiff.p)[0];
    if (whiffer && whiffer.metrics.whiff.p >= 0.28) parts.push(`${whiffer.name.toLowerCase()} for whiffs`);
    const soft = ps.filter((p) => p.metrics.hard.raw >= 10).sort((a, b) => a.metrics.hard.p - b.metrics.hard.p)[0];
    if (!whiffer || whiffer.metrics.whiff.p < 0.28) { if (soft && soft.metrics.hard.p <= 0.28) parts.push(`pitches to weak contact with the ${soft.name.toLowerCase()}`); else parts.push("pitches to contact"); }
    const s = parts.join(", ");
    return s ? s[0].toUpperCase() + s.slice(1) : null;
  }

  const api = { VERSION, METRICS, VARS, LEVEL, BAD, PRIOR_N, RECENT, FADE, LAST_SEASON, MIN_CELL, SHRINK, CLEAR_Q, EARLY_P, MAX_SHOWN, DRIFT_MIN, DRIFT_P, DRIFT_SHARE, DRIFT_PRIOR,
    isPitch, pitchOf, counts, baseline, _tune: (o) => { if (o.prior !== undefined) DRIFT_PRIOR = o.prior; if (o.seShift !== undefined) SE_SHIFT = o.seShift; if (o.early !== undefined) EARLY_LOOK = o.early; if (o.share !== undefined) DRIFT_SHARE = o.share; }, priorFor, findings, sentence, drift, driftLog, archetype, betaCdf, normCdf, tto, pcBucket };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PCPeak = api;
})(typeof window !== "undefined" ? window : this);
