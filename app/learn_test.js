/*
 * Learning checks. Ground truth is the engine's own outcome model run with a pitcher's TRUE command and stuff;
 * the coach enters something else; the learner only sees the logged results. Run: node learn_test.js [quick]
 */
const E = require("./engine.js");
E.init(require("./engine_data.json"));
const L = require("./learn.js");

let seed = +(process.env.SEED || 12345);
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const QUICK = process.argv[2] === "quick";
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };

function arsenal(spec) {
  return spec.map((d) => E.Pitch({ name: d.name, kind: d.kind, grade: d.grade, command: d.command, conf: 0.7, base_conf: 0.7, shape: d.shape, velo: d.velo, slot: "three-quarter", height_ft: 6.1 }));
}
function randomSituation(level, sameSideBias) {
  const balls = Math.floor(rnd() * 4), strikes = Math.floor(rnd() * 3);
  return E.Situation({ balls, strikes, outs: Math.floor(rnd() * 3), bases: [rnd() < 0.3, rnd() < 0.2, rnd() < 0.12], inning: 1 + Math.floor(rnd() * 7),
    margin: Math.floor(rnd() * 5) - 2, pitch_count: Math.floor(rnd() * 90), batters_faced: Math.floor(rnd() * 25), level,
    same_side: rnd() < (sameSideBias ?? 0.5), last: null, timing: {}, hitter_damage: {}, landing_today: {} });
}
function sampleCat(P, logContact) {
  const cats = [["ball", P.ball + P.wp_ball], ["hbp", P.hbp], ["cstrike", P.cstrike], ["whiff", P.whiff], ["foul", P.foul], ["weak", P.weak], ["solid", P.solid], ["hard", P.hard]];
  let r = rnd() * cats.reduce((a, c) => a + c[1], 0);
  for (const [c, p] of cats) { r -= p; if (r <= 0) return c; }
  return "foul";
}
// simulate n logged pitches of one pitch type. truth(sit) lets a test make him different by slice.
function simulate(spec, enteredSpec, pitchName, n, level, truth, opts = {}) {
  const evs = [];
  for (let i = 0; i < n; i++) {
    const sit = randomSituation(level, opts.sameSideBias);
    const t = truth(sit);
    const trueArs = arsenal(spec.map((d) => (d.name === pitchName ? Object.assign({}, d, t) : d)));
    const quad = pick(E.QUADS);
    const P = E.outcomeProbs(trueArs.find((x) => x.name === pitchName), quad, sit, trueArs, null);
    const c = sampleCat(P);
    // where it ended up: drawn from the same landing model (the location and the result are drawn separately here,
    // which is a simplification; in the engine they're linked through the zone)
    let loc;
    if (opts.loc) { const land = E.landing(trueArs.find((x) => x.name === pitchName), quad, sit); let r = rnd(); for (const z of ["heart", "edge", "off", "noncomp"]) { r -= land[z]; if (r <= 0) { loc = z; break; } } loc = loc || "noncomp"; }
    const res = { ball: "ball", hbp: "hbp", cstrike: "cstrike", whiff: "whiff", foul: "foul", weak: "play", solid: "play", hard: "play" }[c];
    const loggedArs = arsenal(enteredSpec);   // what the app knew at the time
    evs.push({ pitchName, kind: spec.find((d) => d.name === pitchName).kind, quad, res, contact: res === "play" && !opts.noContact ? c : undefined,
      loc, sit: L.snapSituation(sit), ars: L.snapArsenal(loggedArs), ts: opts.ts ? opts.ts(i) : Date.now(), _trueP: P });
  }
  return evs;
}
const pitcherOf = (spec) => ({ id: "p1", pitches: spec.map((d) => ({ name: d.name, kind: d.kind, grade: d.grade, command: d.command })) });
function logloss(evs, ars, pitchName) {   // average surprise of the logged results under these inputs
  let s = 0;
  for (const ev of evs) {
    const P = E.outcomeProbs(ars.find((x) => x.name === pitchName), ev.quad, ev.sit, ars, null);
    const c = L.category(ev);
    s -= Math.log(Math.max(1e-6, c === "ball" ? P.ball + P.wp_ball : c === "bip" ? P.weak + P.solid + P.hard : P[c]));
  }
  return s / evs.length;
}

function locloss(evs, ars, pitchName) {
  let s = 0;
  for (const ev of evs) s -= Math.log(Math.max(1e-6, E.landing(ars.find((x) => x.name === pitchName), ev.quad, ev.sit)[ev.loc]));
  return s / evs.length;
}
const TRUE = [
  { name: "Fastball", kind: "FB", grade: 3, command: 2, shape: "ride", velo: 85 },
  { name: "Slider", kind: "SL", grade: 4.5, command: 3, shape: "tight", velo: 77 },
  { name: "Changeup", kind: "CH", grade: 2, command: 3, shape: "fade", velo: 77 },
];
// the coach got all three wrong
const ENTERED = [
  { name: "Fastball", kind: "FB", grade: 3, command: 4, shape: "ride", velo: 85 },
  { name: "Slider", kind: "SL", grade: 3, command: 3, shape: "tight", velo: 77 },
  { name: "Changeup", kind: "CH", grade: 3.5, command: 3, shape: "fade", velo: 77 },
];

// One simulated "season" of a pitch type is noisy, so these checks average several seasons: the claim is that the
// learner moves toward the truth on average and tightens with more pitches, not that one season nails it.
const REPS = QUICK ? 4 : 8;
function seasons(pn, n, opt) {
  const fits = [];
  for (let r = 0; r < REPS; r++) fits.push(L.pitcherModel(E, pitcherOf(ENTERED), simulate(TRUE, ENTERED, pn, n, "college_d3", () => ({}), opt)).pitches[pn].fit);
  const mean = (k) => fits.reduce((a, f) => a + f[k], 0) / fits.length;
  const err = (k, truth) => fits.reduce((a, f) => a + Math.abs(f[k] - truth), 0) / fits.length;
  return { fits, mean, err };
}
console.log(`1. Stuff from results alone, averaged over ${REPS} simulated seasons (D3)`);
let t1 = Date.now();
for (const pn of ["Slider", "Changeup"]) {
  const tr = TRUE.find((d) => d.name === pn), en = ENTERED.find((d) => d.name === pn), e0 = Math.abs(en.grade - tr.grade);
  const s5 = seasons(pn, 500, {}), s15 = seasons(pn, 1500, {});
  console.log(`     ${pn}: true stuff ${tr.grade}, entered ${en.grade} | 500 pitches: mean ${s5.mean("grade").toFixed(2)}, avg error ${s5.err("grade", tr.grade).toFixed(2)} | 1500: mean ${s15.mean("grade").toFixed(2)}, avg error ${s15.err("grade", tr.grade).toFixed(2)}`);
  check(s5.err("grade", tr.grade) < 0.75 * e0, `${pn}: 500 pitches cut the stuff error by a quarter or more`);
  check(s15.err("grade", tr.grade) < 0.4 * e0, `${pn}: 1500 pitches cut it by 60% or more`);
}
console.log(`     (${((Date.now() - t1) / 1000).toFixed(1)}s)`);

console.log("2. Command: results alone are weak evidence; with location logged it's recovered");
{
  const tr = 2, en = 4;
  const a = seasons("Fastball", 500, {}), b = seasons("Fastball", 500, { loc: true });
  console.log(`     fastball true command ${tr}, entered ${en}, 500 pitches: results only mean ${a.mean("command").toFixed(2)} (avg error ${a.err("command", tr).toFixed(2)}); with location mean ${b.mean("command").toFixed(2)} (avg error ${b.err("command", tr).toFixed(2)})`);
  check(a.mean("command") <= en + 0.2, "results only doesn't drift the wrong way (it mostly holds still: command needs location)");
  check(b.err("command", tr) < 0.5, "with location, average error under 0.5 (from 2.0)");
  check(b.err("command", tr) < a.err("command", tr) * 0.7, "location beats results only clearly");
}

console.log("3. Learned inputs predict new pitches better than the entered ones (held-out data)");
for (const [label, opt] of [["results only", {}], ["with location", { loc: true }]]) {
  const pn = "Fastball";
  const train = simulate(TRUE, ENTERED, pn, QUICK ? 400 : 700, "college_d3", () => ({}), opt);
  const test = simulate(TRUE, ENTERED, pn, 800, "college_d3", () => ({}), opt);
  const m = L.pitcherModel(E, pitcherOf(ENTERED), train).pitches[pn];
  const entered = arsenal(ENTERED), learned = arsenal(ENTERED.map((d) => (d.name === pn ? Object.assign({}, d, m.fit) : d))), truth = arsenal(TRUE);
  const ll = (ars) => logloss(test, ars, pn) + (opt.loc ? locloss(test, ars, pn) : 0);
  const a = ll(entered), b = ll(learned), c = ll(truth);
  console.log(`     ${label}: surprise per pitch entered ${a.toFixed(4)}, learned ${b.toFixed(4)}, truth ${c.toFixed(4)}`);
  // with results only the effect is smaller than test-set noise (the truth itself can score worse than the entry), so allow it
  check(b <= a + (opt.loc ? 0.002 : 0.005), `${label}: learned is no worse than entered on new pitches`);
  if (opt.loc) check(b < a && (b - c) < 0.35 * (a - c), `${label}: learned closes most of the gap to the truth`);
}

console.log("4. Doesn't overreact: 15 pitches barely move a correct entry; a right entry stays put with lots of data");
{
  // judged on what the calls get (adjusted: the fit within the per-game limits), with the raw fit shown for reference
  let mv = 0, raw = 0;
  const sl = pitcherOf(TRUE).pitches.find((p) => p.name === "Slider");
  for (let r = 0; r < REPS * 2; r++) {
    const model = L.pitcherModel(E, pitcherOf(TRUE), simulate(TRUE, TRUE, "Slider", 15, "college_d3", () => ({}), { loc: true })), m = model.pitches.Slider;
    const a = L.adjusted(model, sl, null);
    mv += Math.hypot(a.command - 3, a.grade - 4.5) / (REPS * 2);
    raw += Math.hypot(m.fit.command - 3, m.fit.grade - 4.5) / (REPS * 2);
  }
  check(mv < 0.3, `15 pitches moved a correct slider by ${mv.toFixed(2)} on average in the calls (raw fit ${raw.toFixed(2)}, limited to 0.15 per game)`);
  // stuff can only be pinned to about +/-0.4 even at 2000 pitches (a grade point moves whiff odds a little), so the check
  // here is for bias: averaged over seasons, a correct entry should stay centred where it is
  const fits = [];
  for (let r = 0; r < REPS; r++) fits.push(L.pitcherModel(E, pitcherOf(TRUE), simulate(TRUE, TRUE, "Slider", 700, "college_d3", () => ({}), { loc: true })).pitches.Slider.fit);
  const mc = fits.reduce((a, f) => a + f.command, 0) / REPS, mg = fits.reduce((a, f) => a + f.grade, 0) / REPS;
  console.log(`     correct slider (3 / 4.5), 700 pitches, mean over ${REPS} seasons: ${mc.toFixed(2)} / ${mg.toFixed(2)}`);
  check(Math.abs(mc - 3) < 0.2 && Math.abs(mg - 4.5) < 0.3, "no systematic drift on a correct entry");
}

console.log("5. Slices: finds a fastball he can't command against opposite-side hitters (location logged); measured, not served");
{
  const evs = simulate(TRUE, TRUE, "Fastball", QUICK ? 900 : 1400, "college_d3", (s) => (s.same_side ? { command: 3.5 } : { command: 1.5 }), { loc: true });
  const pitcher = pitcherOf(TRUE.map((d) => (d.name === "Fastball" ? Object.assign({}, d, { command: 2.5 }) : d)));
  const model = L.pitcherModel(E, pitcher, evs);
  const fb = model.pitches.Fastball;
  const same = fb.fit.command + fb.slices.same.dCommand, opp = fb.fit.command + fb.slices.opp.dCommand;
  console.log(`     overall ${fb.fit.command}; same side ${same.toFixed(2)} (true 3.5), opposite ${opp.toFixed(2)} (true 1.5)`);
  check(same - opp > 1.0, "the slice fit finds same-side command clearly above opposite-side");
  const a = L.adjusted(model, pitcher.pitches[0], { same_side: true, balls: 1, strikes: 1 }).command, b = L.adjusted(model, pitcher.pitches[0], { same_side: false, balls: 1, strikes: 1 }).command;
  check(a === b, `slices aren't served to the calls (spec 18: no trait passes the gate): same side ${a}, opposite ${b}`);
}

console.log("6. Recent games count more: he fixed his changeup command (2 -> 4) two months ago");
{
  const DAY = 864e5, t0 = Date.now();
  let faded = 0, flat = 0;
  for (let r = 0; r < REPS; r++) {
    const old = simulate(TRUE, TRUE, "Changeup", 500, "college_d3", () => ({ command: 2 }), { ts: () => t0 - 400 * DAY, loc: true });
    const recent = simulate(TRUE, TRUE, "Changeup", 250, "college_d3", () => ({ command: 4 }), { ts: () => t0 - 20 * DAY, loc: true });
    const both = old.concat(recent);
    faded += L.pitcherModel(E, pitcherOf(TRUE), both, { now: t0 }).pitches.Changeup.fit.command / REPS;
    flat += L.pitcherModel(E, pitcherOf(TRUE), both.map((e) => Object.assign({}, e, { ts: undefined })), { now: t0 }).pitches.Changeup.fit.command / REPS;
  }
  console.log(`     500 pitches at command 2 from 400 days ago + 250 at command 4 from 20 days ago: learned ${faded.toFixed(2)}; same pitches with no fading ${flat.toFixed(2)}`);
  check(faded > flat + 0.3, "fading old games moves it toward the recent changeup");
}

console.log("7. High school, results plus location, no contact quality");
{
  let err = 0, mean = 0;
  for (let r = 0; r < REPS; r++) {
    const m = L.pitcherModel(E, pitcherOf(ENTERED), simulate(TRUE, ENTERED, "Fastball", 800, "hs", () => ({}), { noContact: true, loc: true })).pitches.Fastball;
    err += Math.abs(m.fit.command - 2) / REPS; mean += m.fit.command / REPS;
  }
  console.log(`     HS fastball, true cmd 2 entered 4, 800 pitches: mean ${mean.toFixed(2)}, avg error ${err.toFixed(2)}`);
  check(err < 0.6, "command recovered at high school (from 2.0; HS pitchers are wilder, so each pitch says less)");
}

console.log("8. Hitter memory: a fastball masher across two games makes the engine throw him fewer fastballs");
{
  const evs = [];
  for (let g = 0; g < 2; g++) for (let i = 0; i < 9; i++) evs.push({ gameId: "g" + g, kind: "FB", quad: pick(["up-in", "middle", "down-away"]), res: "play", contact: i % 3 ? "hard" : "solid", ts: Date.now() });
  for (let i = 0; i < 6; i++) evs.push({ gameId: "g1", kind: "SL", quad: "down-away", res: "whiff", ts: Date.now() });
  const hm = L.hitterModel({ id: "h1" }, evs, "college_d3");
  const ars = arsenal(TRUE);
  const share = (dmg) => {
    const s = E.Situation({ balls: 1, strikes: 1, outs: 1, bases: [false, false, false], level: "college_d3", same_side: true, hitter_damage: dmg, timing: {}, landing_today: {} });
    const r = E.callMixed(ars, s, { rng: () => 0.5 });
    return r.dist.filter((d) => d.pitch.kind === "FB").reduce((a, d) => a + d.prob, 0);
  };
  const a = share({}), b = share(L.seedDamage(hm));
  console.log(`     fastball share at 1-1: unknown hitter ${(a * 100).toFixed(0)}%, known masher ${(b * 100).toFixed(0)}%  (FB score ${hm.damage.FB[0]}, OS ${hm.damage.OS[0]})`);
  check(b < a - 0.05, "fewer fastballs to the masher");
}

console.log("9. Season stats lean the right way and stay small");
{
  const good = L.statPrior({ pa: 150, obp: 0.48, slg: 0.62, k_pct: 10 }, "college_d3"), weak = L.statPrior({ pa: 150, obp: 0.30, slg: 0.30, k_pct: 30 }, "college_d3");
  const tiny = L.statPrior({ pa: 8, obp: 0.6, slg: 1.0 }, "college_d3");
  console.log(`     .480/.620 hitter ${JSON.stringify(good)} | .300/.300 with 30% K ${JSON.stringify(weak)} | 8 PA hot streak ${JSON.stringify(tiny)}`);
  check(good.FB > 0.2 && weak.FB < -0.1 && weak.OS < good.OS, "good hitter leans up, weak hitter leans down, high K rate hurts vs off-speed");
  check(Math.abs(tiny.FB) < Math.abs(good.FB), "eight plate appearances count for less than 150");
}

console.log("10. Check-in maps to feel and today's limit");
{
  check(L.checkinFeel({ conf: { a: 10 } }, "a") === 0.95 && L.checkinFeel({ conf: { a: 1 } }, "a") === 0.3 && L.checkinFeel({ conf: {} }, "a") === null, "confidence 1..10 -> feel 0.30..0.95, blank stays blank");
  check(L.todayLimitShift({ arm: 1, sleep: 5 }) === 25 && L.todayLimitShift({ arm: 4, sleep: 8 }) === 0, "sore arm and short sleep take pitches off his limit");
}


console.log("11. Limits on what the calls get (spec 11): one step a game, never more than 1.0 from his grade, coach calls ignored");
{
  // he's entered at command 4 but is really a 1, worse still against opposite-side hitters; 20 games of located pitches
  const WRONG = TRUE.map((d) => (d.name === "Fastball" ? Object.assign({}, d, { command: 4 }) : d));
  const evs = simulate(TRUE, WRONG, "Fastball", 1200, "college_d3", (s) => ({ command: s.same_side ? 1.5 : 1 }), { loc: true });
  evs.forEach((e, i) => { e.gameId = "g" + Math.floor(i / 60); });
  const pitcher = pitcherOf(WRONG), fbDef = pitcher.pitches[0];
  // relearn after each game, as the app does
  let model = null, worstGap = 0, worstStep = 0, prevServed = 4;
  for (let g = 1; g <= 20; g++) {
    const sub = evs.filter((e) => +e.gameId.slice(1) < g);
    model = L.pitcherModel(E, pitcher, sub, { prev: model });
    for (const sit of [null, { same_side: true, balls: 0, strikes: 2 }, { same_side: false, balls: 3, strikes: 0 }]) {
      const c = L.adjusted(model, fbDef, sit).command;
      worstGap = Math.max(worstGap, Math.abs(c - 4));
    }
    const c = L.adjusted(model, fbDef, null).command;
    worstStep = Math.max(worstStep, Math.abs(c - prevServed)); prevServed = c;
  }
  console.log(`     fit ${model.pitches.Fastball.fit.command} (truth about 1.2); served ${prevServed}`);
  check(worstGap <= 1.0 + 1e-9, `never more than 1.0 from his grade in any spot (largest ${worstGap.toFixed(2)})`);
  check(worstStep <= 0.15 + 1e-9, `at most 0.15 per game (largest ${worstStep.toFixed(2)})`);
  check(Math.abs(prevServed - 3) < 1e-9, "after enough games it reaches the cap (3.0) and stops there");
  // the whole history at once (first load, a restored backup) still starts at his grade
  const fresh = L.pitcherModel(E, pitcher, evs);
  check(Math.abs(L.adjusted(fresh, fbDef, null).command - 3.85) < 1e-9, `20 games loaded at once: served ${L.adjusted(fresh, fbDef, null).command} (one step from 4)`);
  // relearning again with no new game changes nothing
  const again = L.pitcherModel(E, pitcher, evs, { prev: fresh });
  check(L.adjusted(again, fbDef, null).command === L.adjusted(fresh, fbDef, null).command, "relearning with no new game changes nothing");
  // coach calls and re-calls after a shake-off don't teach it
  const extra = simulate(TRUE, WRONG, "Fastball", 300, "college_d3", () => ({ command: 5 }), { loc: true });
  extra.forEach((e, i) => { e.gameId = "c" + Math.floor(i / 60); if (i % 2) e.coach = true; else e.shaken = ["Slider"]; });
  const m1 = L.pitcherModel(E, pitcher, evs), m2 = L.pitcherModel(E, pitcher, evs.concat(extra));
  check(m1.pitches.Fastball.fit.command === m2.pitches.Fastball.fit.command && m1.pitches.Fastball.n === m2.pitches.Fastball.n,
    `coach calls and re-calls are left out (${m2.pitches.Fastball.n} pitches used of ${evs.length + extra.length})`);
}

console.log(fails ? `\n${fails} check(s) failed` : "\nall learning checks passed");
process.exit(fails ? 1 : 0);
