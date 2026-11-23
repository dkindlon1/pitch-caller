/*
 * Learner v2 checks against simulated worlds with a known truth (spec section 13, Phase 1).
 * Each world plays full seasons pitch by pitch with live in-game state. Pass criteria are fixed here, before results.
 * Run: node worlds_test.js [reps]       (about 5-10 minutes at the default)
 */
const { season, E, L } = require("./worlds.js");
const V1 = require("./learn.js");
const REPS = +(process.argv[2] || 5);
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
const P3 = [{ id: "fb", name: "Fastball", kind: "FB", shape: "ride", velo: 86, usage: 0.55 }, { id: "sl", name: "Slider", kind: "SL", shape: "tight", velo: 78, usage: 0.3 }, { id: "ch", name: "Changeup", kind: "CH", shape: "fade", velo: 78, usage: 0.15 }];
const grades = (fb, sl, ch) => ({ Fastball: fb, Slider: sl, Changeup: ch });
const pitcherOf = (entered, extra = {}) => Object.assign({ id: "p1", pitches: P3.map((p) => Object.assign({}, p, entered[p.name])) }, extra);
const flat = (t) => () => t;
const C3 = { command: 3, grade: 3 };
const t0 = Date.now();
const GATED = L.ACTIVE_TRAITS.slice();   // the traits switched on in use (the gate's result), before the tests turn all on
L.ACTIVE_TRAITS.push(...L.ALL_TRAITS.filter((k) => !L.ACTIVE_TRAITS.includes(k)));   // test the full trait machinery, even though the gate keeps them off in use

console.log("1. Steady pitcher, right grades: holds still, no false flags");
{
  const entered = grades(C3, C3, C3), errs = [], gradeFlags = [], changeFlags = [];
  for (let r = 0; r < REPS; r++) {
    const prof = L.learnPitcher(E, pitcherOf(entered), season({ pitches: P3, entered, truth: flat(grades(C3, C3, C3)), games: 20, pas: 22, seed: 10 + r, loc: true }), { scoreboard: false });
    for (const k of ["fb", "sl"]) errs.push(prof.pitches[k].talent.command - 3, prof.pitches[k].talent.grade - 3);
    gradeFlags.push(prof.flags.filter((f) => f.type === "grade").length); changeFlags.push(prof.flags.filter((f) => f.type === "change").length);
  }
  console.log(`     average learned minus truth ${mean(errs).toFixed(3)}, average size ${mean(errs.map(Math.abs)).toFixed(2)}; grade flags ${gradeFlags.join(",")}; change suggestions ${changeFlags.join(",")}`);
  check(Math.abs(mean(errs)) < 0.15, "no drift on average (within ±0.15)");
  check(gradeFlags.every((x) => x === 0), "no grade flags");
  check(changeFlags.filter((x) => x > 0).length <= Math.max(1, Math.round(REPS / 10)), "change suggestions in at most 1 in 10 seasons");
}

console.log("2. Wrong grades: moves toward the truth and flags it");
{
  const entered = grades({ command: 4, grade: 3 }, { command: 3, grade: 3 }, C3), truth = flat(grades({ command: 2, grade: 3 }, { command: 3, grade: 4.2 }, C3));
  const fbC = [], slG = [], flagged = [];
  for (let r = 0; r < REPS; r++) {
    const prof = L.learnPitcher(E, pitcherOf(entered), season({ pitches: P3, entered, truth, games: 20, pas: 22, seed: 20 + r, loc: true }), { scoreboard: false });
    fbC.push(prof.pitches.fb.talent.command); slG.push(prof.pitches.sl.talent.grade);
    flagged.push(prof.flags.some((f) => f.type === "grade" && f.pitchId === "fb" && f.dim === "command"));
  }
  console.log(`     fastball command: entered 4, truth 2, learned ${mean(fbC).toFixed(2)} | slider stuff: entered 3, truth 4.2, learned ${mean(slG).toFixed(2)} | fastball flagged ${flagged.filter(Boolean).length}/${REPS}`);
  check(Math.abs(mean(fbC) - 2) < 0.5 * 2, "fastball command error cut by half or more");
  check(Math.abs(mean(slG) - 4.2) < 0.5 * 1.2, "slider stuff error cut by half or more");
  check(flagged.filter(Boolean).length >= Math.ceil(REPS / 2), "the fastball command disagreement is flagged in most seasons");
}

console.log("3. The in-game leak: a low-command pitcher, in-game state live (v1 learner vs v2 on the same seasons)");
{
  const entered = grades({ command: 3.5, grade: 3 }, C3, C3), truth = flat(grades({ command: 2, grade: 3 }, C3, C3));
  const v2 = [], v1 = [];
  // Drew, Nov 10 (v1.0 Step 3, his standing rule for noisy learner checks): at least 40 seasons, bars unchanged. On 5
  // seasons v2 vs v1 flipped when Step 3 re-rolled the seasons (v1 2.01, v2 2.06); on 40 (seeds 30-69) v2 is closer,
  // mean error 0.085 vs 0.090 (Step 2 engine: 0.131 vs 0.157).
  const SEASONS3 = Math.max(40, REPS);
  for (let r = 0; r < SEASONS3; r++) {
    const evs = season({ pitches: P3, entered, truth, games: 20, pas: 22, seed: 30 + r, loc: true });
    v2.push(L.learnPitcher(E, pitcherOf(entered), evs, { scoreboard: false }).pitches.fb.talent.command);
    v1.push(V1.pitcherModel(E, { id: "p1", pitches: pitcherOf(entered).pitches }, evs).pitches.fb.fit.command);
  }
  console.log(`     truth 2: v1 learned ${mean(v1).toFixed(2)}, v2 learned ${mean(v2).toFixed(2)}`);
  check(Math.abs(mean(v2) - 2) < 0.2, "v2 within 0.2 of the truth");
  check(Math.abs(mean(v2) - 2) <= Math.abs(mean(v1) - 2) + 0.02, "v2 at least as close as v1");
}

console.log("4. Sudden change (injury at game 12: command 3 -> 1.8): with the coach's mark vs without");
{
  const entered = grades(C3, C3, C3), truth = (g) => grades(g < 12 ? C3 : { command: 1.8, grade: 3 }, C3, C3);
  const marked = [], unmarked = [], suggested = [];
  for (let r = 0; r < REPS; r++) {
    const evs = season({ pitches: P3, entered, truth, games: 20, pas: 22, seed: 40 + r, loc: true });
    const upTo15 = evs.filter((e) => +e.gameId.slice(1) < 15), markTs = evs.find((e) => e.gameId === "g12").ts;
    marked.push(L.learnPitcher(E, pitcherOf(entered, { changes: [{ pitchId: "fb", ts: markTs, source: "coach" }] }), upTo15, { scoreboard: false }).pitches.fb.talent.command);
    unmarked.push(L.learnPitcher(E, pitcherOf(entered), upTo15, { scoreboard: false }).pitches.fb.talent.command);
    suggested.push(L.learnPitcher(E, pitcherOf(entered), evs, { scoreboard: false }).flags.some((f) => f.type === "change" && f.pitchId === "fb"));
  }
  console.log(`     3 games after: with the mark ${mean(marked).toFixed(2)}, without ${mean(unmarked).toFixed(2)} (truth 1.8) | suggested by game 20 without a mark: ${suggested.filter(Boolean).length}/${REPS}`);
  check(Math.abs(mean(marked) - 1.8) < 0.5, "with the mark, within 0.5 three games later");
  check(Math.abs(mean(marked) - 1.8) < Math.abs(mean(unmarked) - 1.8), "the mark makes it faster");
  console.log(`     (results-only suggestion is low-power by design; reported, not required: ${suggested.filter(Boolean).length}/${REPS})`);
}

console.log("5. Charter mistakes (10% of results and locations wrong), right grades: stays put, no false grade flags");
{
  const entered = grades(C3, C3, C3), errs = [], flags = [];
  for (let r = 0; r < REPS; r++) {
    const prof = L.learnPitcher(E, pitcherOf(entered), season({ pitches: P3, entered, truth: flat(grades(C3, C3, C3)), games: 20, pas: 22, seed: 50 + r, loc: true, charterError: 0.1 }), { scoreboard: false });
    errs.push(prof.pitches.fb.talent.command - 3, prof.pitches.fb.talent.grade - 3); flags.push(prof.flags.filter((f) => f.type === "grade").length);
  }
  console.log(`     fastball learned minus truth ${mean(errs).toFixed(2)} on average; grade flags ${flags.join(",")}`);
  check(mean(errs.map(Math.abs)) < 0.6, "stays within 0.6 of the truth on average");
  check(flags.every((x) => x === 0), "no false grade flags");
}

console.log("6. Selective logging (hard contact always logged, the rest 40%): the 90% rule keeps stuff honest");
{
  const entered = grades(C3, C3, C3), withRule = [], without = [];
  for (let r = 0; r < REPS; r++) {
    const evs = season({ pitches: P3, entered, truth: flat(grades(C3, C3, C3)), games: 20, pas: 22, seed: 60 + r, loc: true, contact: "selective" });
    withRule.push(L.learnPitcher(E, pitcherOf(entered), evs, { scoreboard: false }).pitches.fb.talent.grade);
    const keep = L.CFG.completeness; L.CFG.completeness = 0;
    without.push(L.learnPitcher(E, pitcherOf(entered), evs, { scoreboard: false }).pitches.fb.talent.grade);
    L.CFG.completeness = keep;
  }
  console.log(`     fastball stuff, truth 3: with the rule ${mean(withRule).toFixed(2)}, without it ${mean(without).toFixed(2)}`);
  check(Math.abs(mean(withRule) - 3) < 0.25, "with the rule, within 0.25");
  check(Math.abs(mean(withRule) - 3) < Math.abs(mean(without) - 3), "the rule removes the bias");
}

console.log("7. Coach calls driven by unlogged feel: excluding them keeps stuff honest");
{
  const entered = grades(C3, C3, C3), excl = [], incl = [];
  for (let r = 0; r < REPS; r++) {
    const evs = season({ pitches: P3, entered, truth: flat(grades(C3, C3, C3)), games: 20, pas: 22, seed: 70 + r, loc: true, formSd: 0.6, coachCalls: { name: "Changeup" } });
    excl.push(L.learnPitcher(E, pitcherOf(entered), evs, { scoreboard: false }).pitches.ch.talent.grade);
    incl.push(L.learnPitcher(E, pitcherOf(entered), evs.map((e) => Object.assign({}, e, { choice: "engine", coach: false })), { scoreboard: false }).pitches.ch.talent.grade);
  }
  console.log(`     changeup stuff, truth 3 on average: excluding coach calls ${mean(excl).toFixed(2)}, including them ${mean(incl).toFixed(2)}`);
  check(Math.abs(mean(excl) - 3) < 0.3, "excluded: within 0.3");
}

console.log("8. Population honesty: grades off by coach-typical amounts; truth inside ±1 sd how often?");
{
  let inside = 0, n = 0;
  const g = (r) => (r() + r() + r() + r() - 2) * 1.22 * 0.7;
  // Drew, Nov 10 (v1.0 Step 1): at least 40 seasons (240 readings), band unchanged. On 10 seasons (60 readings, 6 per
  // season and correlated) the count moved 44 -> 35 of 60 when Step 1 re-rolled the simulated seasons, while 60 fresh
  // seasons read 79.7% before Step 1 and 80.6% after: the check was measuring luck, not the learner.
  const SEASONS8 = Math.max(40, REPS * 2);
  for (let r = 0; r < SEASONS8; r++) {
    const rr = require("./worlds.js").rng(800 + r), tr = {};
    for (const p of P3) tr[p.name] = { command: Math.min(4.8, Math.max(1.2, 3 + g(rr))), grade: Math.min(4.8, Math.max(1.2, 3 + g(rr))) };
    const prof = L.learnPitcher(E, pitcherOf(grades(C3, C3, C3)), season({ pitches: P3, entered: grades(C3, C3, C3), truth: flat(tr), games: 15, pas: 22, seed: 80 + r, loc: true }), { scoreboard: false });
    for (const p of P3) for (const dim of ["command", "grade"]) { n++; if (Math.abs(prof.pitches[p.id].talent[dim] - tr[p.name][dim]) <= prof.pitches[p.id].sd[dim]) inside++; }
  }
  console.log(`     truth within ±1 sd: ${inside} of ${n} (${Math.round((100 * inside) / n)}%)`);
  check(inside / n >= 0.6 && inside / n <= 0.9, "between 60% and 90% (68% is exact)");
}

console.log("9. Replay determinism, renames and cross-ups");
{
  const entered = grades(C3, C3, C3), evs = season({ pitches: P3, entered, truth: flat(grades(C3, C3, C3)), games: 8, pas: 22, seed: 90, loc: true });
  const a = JSON.stringify(L.learnPitcher(E, pitcherOf(entered), evs, { scoreboard: false, now: 1 }));
  const b = JSON.stringify(L.learnPitcher(E, pitcherOf(entered), evs.slice().reverse(), { scoreboard: false, now: 1 }));
  check(a === b, "same events in any order give the identical profile");
  // rename the slider to "Sweepy" halfway: its history must follow its id
  const renamed = evs.map((e) => { if (+e.gameId.slice(1) < 4) return e; const f = JSON.parse(JSON.stringify(e)); if (f.pitchName === "Slider") f.pitchName = "Sweepy";
    f.ars.forEach((x) => { if (x.name === "Slider") x.name = "Sweepy"; }); if (f.sit.last && f.sit.last[0] === "Slider") f.sit.last[0] = "Sweepy"; return f; });
  const p2 = pitcherOf(entered); p2.pitches[1].name = "Sweepy";
  const nA = L.learnPitcher(E, pitcherOf(entered), evs, { scoreboard: false }).pitches.sl.n, nB = L.learnPitcher(E, p2, renamed, { scoreboard: false }).pitches.sl.n;
  check(nA === nB && nA > 0, `a renamed pitch keeps its history (${nA} vs ${nB} pitches)`);
  // a cross-up: called slider, threw fastball -> counts for the fastball, not the slider
  const ev = evs.find((e) => e.pitchName === "Slider" && e.choice === "engine");
  const crossed = evs.map((e) => (e === ev ? Object.assign({}, e, { thrown: "Fastball" }) : e));
  const before = L.learnPitcher(E, pitcherOf(entered), evs, { scoreboard: false }), after = L.learnPitcher(E, pitcherOf(entered), crossed, { scoreboard: false });
  check(after.pitches.sl.n === before.pitches.sl.n - 1 && after.pitches.fb.n === before.pitches.fb.n + 1, "a cross-up counts as the pitch actually thrown");
  // soft-deleted (undone) pitches are skipped
  const del = evs.map((e) => (e === ev ? Object.assign({}, e, { deletedAt: 5 }) : e));
  check(L.learnPitcher(E, pitcherOf(entered), del, { scoreboard: false }).pitches.sl.n === before.pitches.sl.n - 1, "an undone pitch is skipped");
}

console.log("10. What the engine gets: caps, steps, phase-in, learning off");
{
  const pd = { id: "fb", name: "Fastball", kind: "FB", shape: "ride", velo: 86, grade: 3, command: 4 };
  const pit = { id: "p1", pitches: [pd] };
  const prof = { at: Date.now(), pitches: { fb: { n: 600, talent: { command: 1.6, grade: 3.4 }, sd: { command: 0.3, grade: 0.4 }, traits: { side_cmd: -0.9, miss_heart: 0.2 }, changeAt: [] } } };
  let sv = L.serve(prof, pit, null);
  check(sv.pitches.fb.command === 3.85 && sv.pitches.fb.grade === 3.15, `first game moves at most 0.15 (command ${sv.pitches.fb.command}, stuff ${sv.pitches.fb.grade})`);
  for (let i = 0; i < 30; i++) sv = L.serve(prof, pit, sv);
  check(sv.pitches.fb.command === 3 && Math.abs(sv.pitches.fb.grade - 3.4) < 1e-9, `never more than 1.0 from his grade without his OK (command ${sv.pitches.fb.command})`);
  check(sv.pitches.fb.traits.side_cmd === -0.5, "traits capped at ±0.5");
  // D2: Accept stores the learned value at that moment ("to"); it phases in over 3 games (detail in rails_test.js)
  const acc = Object.assign({}, pit, { accepted: { fb: { command: { ts: prof.at, from: sv.pitches.fb.command, to: 1.6 } } } });
  const s1 = L.serve(prof, acc, sv), s2 = L.serve(prof, acc, s1), s3 = L.serve(prof, acc, s2);
  check(s1.pitches.fb.command < 3 && s3.pitches.fb.command === 1.6, `after he accepts, it phases in over 3 games (${s1.pitches.fb.command}, ${s2.pitches.fb.command}, ${s3.pitches.fb.command})`);
  // bound to games: serving again with no new game moves nothing; a new game moves one step; a re-grade carries over
  const pg = (ids) => Object.assign({}, prof, { games: ids.map((id, i) => ({ id, ts: prof.at + i })) });
  const a1 = L.serve(pg(["g1"]), pit, null), a2 = L.serve(pg(["g1"]), pit, a1), a3 = L.serve(pg(["g1"]), pit, a2), a4 = L.serve(pg(["g1", "g2"]), pit, a3);
  const regraded = { id: "p1", pitches: [Object.assign({}, pd, { command: 3.5 })] }, a5 = L.serve(pg(["g1", "g2"]), regraded, a4);
  check(a1.pitches.fb.command === 3.85 && a3.pitches.fb.command === 3.85 && a4.pitches.fb.command === 3.7 && a5.pitches.fb.command === 3.2,
    `one step per game: same games served three times ${a1.pitches.fb.command}, ${a2.pitches.fb.command}, ${a3.pitches.fb.command}; a new game ${a4.pitches.fb.command}; re-graded 4 -> 3.5 with no new game ${a5.pitches.fb.command}`);
  const worse = { at: prof.at, pitches: { fb: Object.assign({}, prof.pitches.fb, { score: { worse: true } }) } };
  check(L.serve(worse, pit, sv).pitches.fb.learned === false && L.serve(worse, pit, sv).pitches.fb.command === 4, "learning off: back to his grades");
  check(L.serve(prof, Object.assign({}, pit, { useLearned: false }), sv).pitches.fb.command === 4, "the coach's off switch: his grades");
}

console.log("11. Hitter memory: a hitter who only faced an ace isn't marked as weak");
{
  const ace = [{ id: "fb", name: "Fastball", kind: "FB", shape: "ride", velo: 92, usage: 0.6 }, { id: "sl", name: "Slider", kind: "SL", shape: "sweeper", velo: 84, usage: 0.4 }];
  const g5 = { Fastball: { command: 4.5, grade: 5 }, Slider: { command: 4, grade: 5 } };
  const evs = season({ pitches: ace, entered: g5, truth: flat(g5), games: 6, pas: 27, seed: 95, loc: true }).map((e) => Object.assign({}, e, { hitterId: "h1" }));
  const v1 = V1.hitterModel({ id: "h1" }, evs, "college_d3"), v2 = L.hitterModel(E, { id: "h1" }, evs, "college_d3");
  console.log(`     an average hitter facing an ace: v1 fastball score ${v1.damage.FB[0]}, v2 ${v2.damage.FB[0]} (0 = average)`);
  // Drew, Nov 6: the requirement is that he isn't marked weak (within 0.1 of average). The comparison to the old v1 learner
  // was dropped: on the single v0.9 engine v1 lands closer to average than v2 here (-0.03 vs +0.07), both inside the limit.
  check(Math.abs(v2.damage.FB[0]) < 0.1, "v2 within 0.1 of average");
}

console.log("12. Scoreboard (scored before each game): learning beats wrong grades, and doesn't switch itself off on right ones");
{
  const wrong = grades({ command: 4.2, grade: 2 }, C3, C3), right = grades(C3, C3, C3);
  const pw = L.learnPitcher(E, pitcherOf(wrong), season({ pitches: P3, entered: wrong, truth: flat(grades({ command: 2, grade: 3.5 }, C3, C3)), games: 14, pas: 22, seed: 97, loc: true }));
  // the switch-off question is about learning as it runs in use, so this side uses the gated trait list
  const pr = L.learnPitcher(E, pitcherOf(right), season({ pitches: P3, entered: right, truth: flat(right), games: 14, pas: 22, seed: 98, loc: true }), { traits: GATED });
  const s = pw.pitches.fb.score, s2 = pr.pitches.fb.score;
  console.log(`     wrong grades: surprise per pitch learned ${s.learned.toFixed(4)} vs his grades ${s.coach.toFixed(4)} over ${s.rows} | right grades: ${s2.learned.toFixed(4)} vs ${s2.coach.toFixed(4)}`);
  check(s.learned < s.coach, "beats wrong grades");
  check(!s2.worse && !pr.flags.some((f) => f.type === "learningOff"), "no false switch-off on right grades");
}

console.log("13. The learner's fast strike-rate table matches the exact calculation");
{
  let worst = 0;
  for (const kind of [["FB", "ride", 86], ["SL", "sweeper", 79], ["CH", "fade", 78], ["CB", "loopy", 72]])
    for (const c of [1.2, 2.3, 3.6, 4.7]) for (const g of [1.4, 3.1, 4.9]) for (const t of [null, { behind_cmd: -0.4, stretch_cmd: -0.3 }, { miss_heart: 0.4, side_cmd: 0.3 }]) {
      const sp = { name: "x", kind: kind[0], shape: kind[1], velo: kind[2], command: c, grade: g, traits: t };
      worst = Math.max(worst, Math.abs(L.strikeRate(E, sp, "hs") - L.strikeRateFast(E, sp, "hs")));
    }
  check(worst < 0.01, `largest difference ${worst.toFixed(4)} (must be under 0.01)`);
}

console.log("14. Hitter world (v1.3 Part 5): hidden traits recovered from realistic at-bat counts; an average hitter isn't moved");
{
  // Estimator (what a prefill would do with logged pitches): each trait's maximum-likelihood value given the average
  // hitter's mix for every pitch he saw (the offset), one trait at a time (the traits act on separate outcomes, so this
  // is the joint estimate). SE from the curvature. Pass criteria fixed before results:
  //   a. 2-SE intervals cover the truth in 90-99% of seasons (150 and 400 PAs, every preset and trait, zeros included);
  //   b. at 400 PAs every preset trait of size >= 1 on early / two-strike swing / two-strike foul / contact has the right
  //      sign in >= 90% of seasons; power is reported with the PAs it needs (balls in play are few and extra-base hits
  //      rarer). Ruling 11 split two_strike into two_strike_swing / two_strike_foul and the fitted presets carry them below
  //      1 (battler +0.93 / +0.44), so a probe hitter (swing +1.5, foul -1.5: opposite signs, each estimated on its own)
  //      runs beside the presets so both new traits face the sign check;
  //   c. no bias: at 400 PAs the mean estimate is within 4 SE-of-the-mean (+0.05) of the truth for every trait;
  //   d. an average hitter (all traits 0) plays exactly the average hitter's at-bats, and his estimates sit at 0 (as c).
  const HW = require("./worlds.js"), SZ = HW.TRAIT_SIZE, R14 = Math.max(40, REPS), NS = [60, 150, 400];
  const HITTERS14 = Object.assign({}, HW.HITTER_PRESETS, { split_probe: { two_strike_swing: 1.5, two_strike_foul: -1.5 } });
  const SWING = new Set(["whiff", "foul", "weak", "solid", "hard"]), CONTACT = new Set(["foul", "weak", "solid", "hard"]);
  const sum = (o, ks) => ks.reduce((a, k) => a + (o[k] || 0), 0);
  const logitFit = (obs) => {   // obs: [offset, y, size]; logit P(y) = offset + size * theta
    let th = 0, info = 0;
    for (let it = 0; it < 50; it++) {
      let g = 0; info = 0;
      for (const [o, y, s] of obs) { const p = 1 / (1 + Math.exp(-(o + s * th))); g += s * (y - p); info += s * s * p * (1 - p); }
      if (!info) return { est: 0, se: Infinity };
      const st = g / info; th = Math.max(-8, Math.min(8, th + st)); if (Math.abs(st) < 1e-9) break;
    }
    return { est: th, se: 1 / Math.sqrt(info) };
  };
  const numFit = (ll) => {   // 1-D maximum likelihood by grid then Newton (numeric derivatives)
    let bt = 0, bv = -Infinity; for (let x = -6; x <= 6.0001; x += 0.1) { const v = ll(x); if (v > bv) { bv = v; bt = x; } }
    const h = 1e-3, d = (x) => [(ll(x + h) - ll(x - h)) / (2 * h), (ll(x + h) - 2 * ll(x) + ll(x - h)) / (h * h)];
    let th = bt; for (let it = 0; it < 30; it++) { const [d1, d2] = d(th); if (d2 >= 0) break; const st = -d1 / d2; th = Math.max(-8, Math.min(8, th + st)); if (Math.abs(st) < 1e-7) break; }
    const d2 = d(th)[1]; return { est: th, se: d2 < 0 ? 1 / Math.sqrt(-d2) : Infinity };
  };
  const lgt = (p) => Math.log(p / (1 - p));
  function estimate(pas) {
    const early = [], twoSw = [], twoFo = [], con = [], bips = [];
    for (const pa of pas) {
      for (const x of pa.pitches) {
        const B = x.base, sw = sum(B, [...SWING]), tot = sw + sum(B, ["ball", "wp_ball", "hbp", "cstrike"]), isEarly = x.b + x.k <= 1;   // 0-0, 1-0, 0-1
        const y = SWING.has(x.cat) ? 1 : 0;
        if (sw > 0 && sw < tot) { if (isEarly) early.push([lgt(sw / tot), y, SZ.early_swing]); if (x.k === 2) twoSw.push([lgt(sw / tot), y, SZ.two_strike_swing]); }
        if (y) {
          if (B.whiff > 0 && B.whiff < sw) con.push([lgt(B.whiff / sw), x.cat === "whiff" ? 1 : 0, SZ.contact_whiff]);
          const c = sw - B.whiff;
          if (x.k === 2 && CONTACT.has(x.cat) && B.foul > 0 && B.foul < c) twoFo.push([lgt(B.foul / c), x.cat === "foul" ? 1 : 0, SZ.two_strike_foul]);
        }
      }
      if (pa.bip) bips.push(pa.bip);
    }
    const OT = require("./engine_data.json").V08.OUT_TABLE.college_d3;
    const power = numFit((th) => { let s = 0; for (const b of bips) { let p = 0; for (const t of ["GB", "LD", "FB", "PU"]) p += b.mix[t] * HW.powerRow(OT[b.contact][t], th)[b.ev]; s += Math.log(Math.max(p, 1e-300)); } return s; });
    return { early: logitFit(early), two_strike_swing: logitFit(twoSw), two_strike_foul: logitFit(twoFo), contact: logitFit(con), power };
  }
  const TR = ["early", "two_strike_swing", "two_strike_foul", "contact", "power"], cover = [0, 0], need = {}, res = {};
  for (const [name, pre] of Object.entries(HITTERS14)) {
    res[name] = {};
    for (const n of NS) {
      const ests = []; for (let r = 0; r < R14; r++) ests.push(estimate(HW.hitterSeason({ traits: pre, pas: n, seed: 1400 + 97 * r + n })));
      res[name][n] = {};
      for (const t of TR) {
        const truth = pre[t] || 0, xs = ests.map((e) => e[t].est), ses = ests.map((e) => e[t].se), m = mean(xs);
        const sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2))), inside = xs.filter((x, i) => Math.abs(x - truth) <= 2 * ses[i]).length;
        const sign = truth ? xs.filter((x) => Math.sign(x) === Math.sign(truth)).length / R14 : null;
        res[name][n][t] = { truth, m, sd, se: mean(ses), inside, sign };
        if (n >= 150) { cover[0] += inside; cover[1] += R14; }
      }
    }
  }
  console.log("     preset              trait            truth |  60 PAs est (SE) sign |  150 PAs est (SE) sign |  400 PAs est (SE) sign");
  for (const [name, pre] of Object.entries(HITTERS14)) for (const t of TR) {
    const cells = NS.map((n) => { const x = res[name][n][t]; return `${x.m >= 0 ? "+" : ""}${x.m.toFixed(2)} (${x.se.toFixed(2)}) ${x.sign === null ? "  - " : (100 * x.sign).toFixed(0).padStart(3) + "%"}`; });
    console.log(`     ${name.padEnd(19)} ${t.padEnd(16)} ${(pre[t] || 0).toFixed(2).padStart(5)} | ${cells.join(" | ")}`);
  }
  // PAs needed: SE shrinks as 1/sqrt(PAs); read off the 400-PA SE (averaged over presets) for SE 0.5 (half a hitter SD)
  // and SE 0.75 (a preset-sized 1.5 told from average at 2 SE)
  for (const t of TR) { const se400 = mean(Object.keys(res).map((nm) => res[nm][400][t].se)); need[t] = [Math.round(400 * (se400 / 0.5) ** 2), Math.round(400 * (se400 / 0.75) ** 2), se400]; }
  console.log("     PAs needed (from the 400-PA SE): " + TR.map((t) => `${t} SE 0.5 -> ${need[t][0]}, SE 0.75 -> ${need[t][1]}`).join("; "));
  console.log("     spray: recorded only (no ball-in-play direction in either simulator), so not estimated");
  check(cover[0] / cover[1] >= 0.9 && cover[0] / cover[1] <= 0.99, `a. 2-SE intervals cover the truth in ${(100 * cover[0] / cover[1]).toFixed(1)}% of ${cover[1]} (150 and 400 PAs)`);
  const signs = []; for (const [name, pre] of Object.entries(HITTERS14)) for (const t of ["early", "two_strike_swing", "two_strike_foul", "contact"]) if (Math.abs(pre[t] || 0) >= 1) signs.push([`${name} ${t}`, res[name][400][t].sign]);
  check(signs.every(([, s]) => s >= 0.9), `b. right sign at 400 PAs: ${signs.map(([k, s]) => `${k} ${(100 * s).toFixed(0)}%`).join(", ")}`);
  const pw = Object.entries(HW.HITTER_PRESETS).filter(([, pre]) => Math.abs(pre.power || 0) >= 1).map(([nm]) => `${nm} ${(100 * res[nm][400].power.sign).toFixed(0)}%`);
  console.log(`     (power, reported: right sign at 400 PAs ${pw.join(", ")}; SE at 400 PAs ${need.power[2].toFixed(2)})`);
  const bias = []; for (const nm of Object.keys(res)) for (const t of TR) { const x = res[nm][400][t]; if (Math.abs(x.m - x.truth) >= 4 * x.sd / Math.sqrt(R14) + 0.05) bias.push(`${nm} ${t} ${x.m.toFixed(2)} vs ${x.truth}`); }
  check(bias.length === 0, `c. no bias at 400 PAs${bias.length ? ": " + bias.join(", ") : ""}`);
  // d. the average hitter
  const zeros = { early: 0, two_strike_swing: 0, two_strike_foul: 0, contact: 0, power: 0, spray: 0 };
  const same = JSON.stringify(HW.hitterSeason({ traits: zeros, pas: 400, seed: 1499 })) === JSON.stringify(HW.hitterSeason({ pas: 400, seed: 1499 }));
  let exact = true; for (const pa of HW.hitterSeason({ pas: 60, seed: 1498 })) for (const x of pa.pitches) { const Q = HW.applyHitterTraits(x.base, zeros, x.b, x.k); for (const k of Object.keys(x.base)) if (Q[k] !== x.base[k]) exact = false; }
  const z = []; for (let r = 0; r < R14; r++) z.push(estimate(HW.hitterSeason({ traits: zeros, pas: 400, seed: 1700 + r })));
  const zm = TR.map((t) => { const xs = z.map((e) => e[t].est), m = mean(xs), sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); return [t, m, sd]; });
  console.log(`     average hitter at 400 PAs: ${zm.map(([t, m, sd]) => `${t} ${m >= 0 ? "+" : ""}${m.toFixed(2)} (sd ${sd.toFixed(2)})`).join(", ")}`);
  check(same && exact, "d. all traits 0: the mix is returned unchanged and the at-bats are exactly the average hitter's");
  check(zm.every(([, m, sd]) => Math.abs(m) < 4 * sd / Math.sqrt(R14) + 0.05), "d. an average hitter's estimates sit at 0");
}

console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)}s, ${REPS} seasons per world`);
console.log(fails ? `${fails} check(s) failed` : "all worlds checks passed");
process.exit(fails ? 1 : 0);
