/*
 * Pitch Caller engine v0.7c, JavaScript port of engine.py (same math, same order of operations).
 * Cost(p,q|s) = sum_e P(e|p,q,s) * [R(e) + V(s'_e)]; calls drawn at a game-theory balance point.
 * Data tables (run values, outcome fit) come from engine_data.json, exported from the Python engine.
 * Works in the browser (window.PitchEngine) and in Node (module.exports) for parity tests.
 */
(function (root) {
  "use strict";
  let D = null;                       // tables, set by init(data)

  const QUADS = ["up-in", "up-away", "down-in", "down-away", "chase", "middle"];
  // v0.7b coach rule W1 (Drew): never a chase target at 3-0 or 3-1
  const targets = (b, k) => ((b === 3 && (k === 0 || k === 1)) ? QUADS.filter((q) => q !== "chase") : QUADS);
  const ZONES = ["heart", "edge", "off", "noncomp"];
  const COUNTS = [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2]];
  const DEFAULT_VELO = { FB: 85, SL: 77, CB: 71, CH: 77 };
  const EV_ADJ = { "up-in": 3.0, "up-away": 0.0, "down-in": 0.0, "down-away": -3.0, middle: 0.0, chase: -3.0 };
  const HBP_LOC = { "up-in": 1.6, "down-in": 1.6, chase: 0.8, middle: 0.5, "up-away": 0.3, "down-away": 0.3 };
  const CONF_DELTA = { ball: -0.02, cstrike: 0.03, whiff: 0.05, hard: -0.08, shakeoff: -0.20 };
  const CONF_CAP_ABOVE = 0.10, CONF_REGRESS = 0.15, LOC_WINDOW = 0.010;
  const S0 = { heart: 0.72, edge: 0.50, off: 0.28, noncomp: 0.05 };
  const C0 = { heart: 0.98, edge: 0.55, off: 0.08, noncomp: 0.0 };
  const W0 = { heart: 0.12, edge: 0.20, off: 0.34, noncomp: 0.50 };
  const F0 = { heart: 0.40, edge: 0.50, off: 0.50, noncomp: 0.45 };
  const Q0 = { heart: [0.30, 0.38, 0.32], edge: [0.48, 0.34, 0.18], off: [0.60, 0.30, 0.10], noncomp: [0.75, 0.20, 0.05] };
  const ZONE_IN = { heart: 1.0, edge: 0.5, off: 0.0, noncomp: 0.0 };
  const KIND_W = { FB: -0.20, SL: 0.25, CB: 0.20, CH: 0.25 };
  const SHAPES = {
    "FB|ride": [18, 8], "FB|run": [13, 15], "FB|sink": [8, 16], "FB|cut": [12, -3], "FB|": [15, 10],
    "SL|tight": [3, -5], "SL|sweeper": [0, -15], "SL|": [2, -7],
    "CB|loopy": [-14, -5], "CB|sharp": [-8, -9], "CB|": [-10, -7],
    "CH|fade": [7, 15], "CH|drop": [3, 10], "CH|": [6, 13],
  };
  const SLOTS = { "over the top": [1.05, 1.0], "high three-quarter": [0.95, 1.6], "three-quarter": [0.88, 2.0],
    "low three-quarter": [0.78, 2.5], "sidearm": [0.62, 3.0], "submarine": [0.35, 3.2] };
  const FLIGHT_FT = 54.0, DECISION_S = 0.175, G_IN = 32.17 * 12;

  // v0.8 compatibility flags (docs/SPEC_v0.8.md section 1); FLAGS_V07 reproduces v0.7c exactly (golden/golden.js)
  const FLAGS_V07 = { pairing_v07: true, bf_term_v07: true, ev_full: true, expect_v07: true, look_state: false, timing_B: false,
    objective_win: false, inplay_typed: false, running_game: false, umpire_learn: false, fatigue_v08: false,
    hitter_grades: false, hs_pitch_cost: false, temp_unc: false };
  const FLAGS_V08 = { pairing_v07: false, bf_term_v07: false, ev_full: false, expect_v07: false, look_state: true, timing_B: true,
    objective_win: true, inplay_typed: true, running_game: true, umpire_learn: true, fatigue_v08: true,
    hitter_grades: true, hs_pitch_cost: true, temp_unc: true };
  const FLAGS = Object.assign({}, FLAGS_V07);
  function setFlags(kw) {
    const prev = Object.assign({}, FLAGS);
    for (const k in kw) { if (!(k in FLAGS)) throw new Error("unknown flag " + k); FLAGS[k] = !!kw[k]; }
    return prev;
  }

  const VERSION = "0.8";      // engine logic version; the tables carry their own fingerprint (data.version)
  function init(data) {
    D = data;
    // v0.7c travel ball (Drew): uses the high school numbers until there's travel-ball data of its own
    for (const t of [D.RE, D.CV, D.IN_PLAY, D.OUTCOME_ADJ, D.LW, D.LEVEL]) if (t && t.hs && !t.travel) t.travel = t.hs;
    if (D.V08) initV08(D.V08);
  }
  const dataVersion = () => (D && D.version) || null;

  // ---------------------------------------------------------------- objects
  function Pitch(o) {
    const p = Object.assign({ shape: "", velo: 0, base_conf: -1, ivb: null, hb: null, slot: "three-quarter",
      height_ft: 6.1, release_offset_in: [0, 0], strike_rate: null, traits: null }, o);
    if (p.base_conf < 0) p.base_conf = p.conf;
    return p;
  }
  function Situation(o) {
    return Object.assign({ inning: 1, margin: 0, pitch_count: 0, batters_faced: 0, level: "college_d3",
      same_side: true, last: null, hitter_seen: {}, usage_this_count: {}, timing: {}, hitter_damage: {},
      catcher_block: 3, landing_today: {}, wild_true: {},
      // v0.8 inputs (inert at their defaults, so v0.7c callers are unchanged)
      sit_sigma: null, look: null, familiar: {}, crowding: false, grades: null, ump_u: 0.0, radar: {}, infield_in: false,
      win: null, usage_by_call: {}, b_h: {}, steal: null, pitch_cap: 105, home: null, sched_innings: null, extras_runner: false }, o);
  }
  const replace = (s, o) => Object.assign({}, s, o);
  const mph = (p) => p.velo || DEFAULT_VELO[p.kind];

  // ---------------------------------------------------------------- state values
  const basesKey = (b) => (b[0] ? "1" : "0") + (b[1] ? "2" : "0") + (b[2] ? "3" : "0");
  const re = (outs, bases, level) => (outs >= 3 ? 0.0 : D.RE[level][outs + "|" + basesKey(bases)]);
  const runScale = (level) => D.RE[level]["0|000"] / D.RE.mlb["0|000"];
  const cvKey = (b, k) => b + "-" + k;
  const V = (b, k, outs, bases, cv, level) => re(outs, bases, level) + (cv || D.CV[level])[cvKey(b, k)];

  // ---------------------------------------------------------------- confidence
  function updateConfidence(p, event) {
    let d = CONF_DELTA[event];
    if (event === "whiff" && p.kind === "FB") d += 0.02;
    if (p.strike_rate !== null && p.strike_rate !== undefined) {   // v0.7: news measured against his usual strike rate
      const c = LAND_CENTER[isOffspeed(p.kind) ? "OS" : "FB"], q = Math.min(0.95, Math.max(0.05, p.strike_rate));
      if (event === "ball") d *= (1 - c) / (1 - q);
      else if (event === "cstrike" || event === "whiff") d *= c / q;
    }
    p.conf = Math.max(0.0, Math.min(p.base_conf + CONF_CAP_ABOVE, 1.0, p.conf + d));
  }
  function regressConfidence(p) { p.conf += CONF_REGRESS * (p.base_conf - p.conf); }

  // ---------------------------------------------------------------- helpers
  function logit(p) { p = Math.min(Math.max(p, 1e-4), 1 - 1e-4); return Math.log(p / (1 - p)); }
  const sig = (x) => 1 / (1 + Math.exp(-x));
  const isOffspeed = (k) => k === "SL" || k === "CB" || k === "CH";
  const isBigSpot = (s) => s.inning >= 7 && Math.abs(s.margin) <= 2 && (s.bases[1] || s.bases[2]);
  const anyBase = (b) => b[0] || b[1] || b[2];

  // ---------------------------------------------------------------- landing today (v0.6d)
  const LAND_CENTER = { FB: 0.66, OS: 0.58 }, LAND_K = 5.0, LAND_GAIN = 4.0, LAND_MAX = 0.6;
  const DMG_SCALE = 3.0;   // v0.6e: a strong masher is worth ~+0.03 runs per pitch, like the best real fastball hitters
  function landingEstimate(p, s) {
    const ev = s.landing_today ? s.landing_today[p.name] : null;
    const center = p.strike_rate !== null && p.strike_rate !== undefined ? p.strike_rate : LAND_CENTER[isOffspeed(p.kind) ? "OS" : "FB"];
    if (!ev) return [center, center, 0];
    const [st, n] = ev;
    return [(center * LAND_K + st) / (LAND_K + n), center, n];
  }
  function wildToday(p, s) {
    if (s.wild_true && Object.keys(s.wild_true).length) return s.wild_true[p.name] || 0.0;
    const [est, center, n] = landingEstimate(p, s);
    return n ? Math.min(LAND_MAX, Math.max(0.0, LAND_GAIN * (center - est))) : 0.0;
  }

  // ---------------------------------------------------------------- landing
  // v0.7 personal traits (see engine.py TRAIT_KEYS); absent = the default engine
  const TRAIT_KEYS = ["side_cmd", "side_grade", "ahead_cmd", "behind_cmd", "stretch_cmd", "miss_heart"];
  function effective(p, s) {
    const t = p.traits;
    if (!t) return [p.command, p.grade];
    const side = s.same_side ? 0.5 : -0.5, g = (k) => t[k] || 0.0;
    let cmd = p.command + side * g("side_cmd") + g("stretch_cmd") * ((s.bases[0] || s.bases[1] || s.bases[2]) ? 1.0 : 0.0);
    if (s.strikes > s.balls) cmd += g("ahead_cmd");
    else if (s.balls > s.strikes) cmd += g("behind_cmd");
    return [cmd, p.grade + side * g("side_grade")];
  }

  function landing(p, q, s) {
    const A = D.OUTCOME_ADJ[s.level];
    const [command] = effective(p, s);
    const sc = D.LEVEL[s.level].cmd_scale ?? 1.0;   // v0.7 spread calibration (engine.py)
    const d = sc === 1.0 ? Math.min(5, Math.max(1, command + A.cmd + 2.0 * (p.conf - 0.6))) - 3   // the v0.6 formula exactly
      : Math.min(8.0, Math.max(-8.0, sc * (command - 3) + A.cmd + 2.0 * (p.conf - 0.6)));
    let z0, sl, z;
    if (q === "chase") { z0 = { heart: 0.05, edge: 0.24, off: 0.57, noncomp: 0.14 }; sl = { heart: -0.01, edge: 0.0, off: 0.04, noncomp: -0.03 }; }
    else if (q === "middle") { z0 = { heart: 0.50, edge: 0.30, off: 0.13, noncomp: 0.07 }; sl = { heart: 0.03, edge: 0.0, off: -0.02, noncomp: -0.01 }; }
    else { z0 = { heart: 0.26, edge: 0.42, off: 0.22, noncomp: 0.10 }; sl = { heart: -0.03, edge: 0.08, off: -0.03, noncomp: -0.02 }; }
    if (sc === 1.0) {   // the v0.6 straight-line shares, exactly
      z = {}; for (const k of ZONES) z[k] = z0[k] + sl[k] * d;
      if (isOffspeed(p.kind)) { z.edge -= 0.12; z.off += 0.07; z.noncomp += 0.05; }
    } else {            // v0.7: exponential shares, same first-order change around an average pitcher (engine.py)
      if (isOffspeed(p.kind)) z0 = { heart: z0.heart, edge: z0.edge - 0.12, off: z0.off + 0.07, noncomp: z0.noncomp + 0.05 };
      const w = {}; let t = 0; for (const k of ZONES) { w[k] = z0[k] * Math.exp(sl[k] / z0[k] * d); t += w[k]; }
      z = {}; for (const k of ZONES) z[k] = w[k] / t;
    }
    let mhT = p.traits ? p.traits.miss_heart || 0.0 : 0.0;
    if (mhT) {   // v0.7: where his misses go, beyond what command says
      mhT = Math.min(1.0, Math.max(-1.0, mhT));
      if (mhT > 0) { const m = 0.3 * mhT * z.off; z.off -= m; z.heart += m; }
      else { const m = 0.3 * -mhT * z.heart; z.heart -= m; z.off += m; }
    }
    const w = A.wild;
    if (w) {
      const mh = w * z.heart, me = w * z.edge;
      z.heart -= mh; z.edge -= me; z.off += 0.6 * (mh + me); z.noncomp += 0.4 * (mh + me);
    }
    const wt = wildToday(p, s);
    if (wt) {   // v0.6e: misses go both ways
      const me = wt * z.edge, mh = 0.6 * wt * z.heart;
      z.edge += 0.6 * mh - me; z.heart += 0.30 * me - mh; z.off += 0.45 * me + 0.4 * mh; z.noncomp += 0.25 * me;
    }
    const over = s.pitch_count - D.LEVEL[s.level].fatigue;
    if (over > 0) { const shift = Math.min(z.edge - 0.05, 0.02 * over / 10); z.edge -= shift; z.heart += shift; }
    for (const k of ZONES) z[k] = Math.max(z[k], 0.01);
    let t = 0; for (const k of ZONES) t += z[k];
    const out = {}; for (const k of ZONES) out[k] = z[k] / t;
    return out;
  }

  // ---------------------------------------------------------------- hitter expectation
  function expectation(p, arsenal, s, policy) {
    const m = arsenal.length;
    const hittersCount = s.balls > s.strikes && s.strikes < 2;
    const fb = arsenal.filter((x) => x.kind === "FB"), os = arsenal.filter((x) => x.kind !== "FB");
    let prior = {};
    if (fb.length && os.length) {
      const fbShare = hittersCount ? 0.65 : (s.strikes === 2 ? 0.35 : 0.5);
      for (const x of fb) prior[x.name] = fbShare / fb.length;
      for (const x of os) prior[x.name] = (1 - fbShare) / os.length;
    } else for (const x of arsenal) prior[x.name] = 1 / m;
    if (policy) {
      const lam = 0.6, np = {};
      for (const x of arsenal) np[x.name] = (1 - lam) * prior[x.name] + lam * (policy[x.name] || 0.0);
      prior = np;
    }
    let n = 0; for (const k in s.usage_this_count) n += s.usage_this_count[k];
    const k = 4.0;
    return [(k * prior[p.name] + (s.usage_this_count[p.name] || 0)) / (k + n), 1 / m];
  }

  // ---------------------------------------------------------------- tunneling
  function movement(p) {
    const base = SHAPES[p.kind + "|" + p.shape] || SHAPES[p.kind + "|"];
    return [p.ivb !== null && p.ivb !== undefined ? p.ivb : base[0], p.hb !== null && p.hb !== undefined ? p.hb : base[1]];
  }
  const flightTime = (p) => FLIGHT_FT / (mph(p) * 1.4667 * 0.92);
  function targetXY(q, sameSide, offspeed) {
    const inside = sameSide ? 1 : -1;
    switch (q) {
      case "up-in": return [7 * inside, 38];
      case "up-away": return [-7 * inside, 38];
      case "down-in": return [7 * inside, 22];
      case "down-away": return [-7 * inside, 22];
      case "middle": return [0, 30];
      default: return offspeed ? [-10 * inside, 14] : [0, 46];
    }
  }
  function pathAt(p, q, sameSide, secs) {
    const tf = flightTime(p);
    const u = Math.max(0.0, 1 - secs / tf);
    const sl = SLOTS[p.slot] || SLOTS["three-quarter"];
    const rx = sl[1] * 12 + p.release_offset_in[0];
    const rz = sl[0] * p.height_ft * 12 + p.release_offset_in[1];
    const [ivb, hb] = movement(p);
    const mx = hb, mz = ivb - 0.5 * G_IN * tf ** 2;
    const [tx, tz] = targetXY(q, sameSide, isOffspeed(p.kind));
    const ax = tx - mx, az = tz - mz;
    return [rx + (ax - rx) * u + mx * u * u, rz + (az - rz) * u + mz * u * u];
  }
  function remainingBreak(p, secs) {
    const tf = flightTime(p);
    const u = Math.max(0.0, 1 - secs / tf);
    const [ivb, hb] = movement(p);
    const mx = hb, mz = ivb - 0.5 * G_IN * tf ** 2;
    return [mx * (1 - u * u), mz * (1 - u * u)];
  }
  function tunnelScore(p1, q1, p2, q2, sameSide) {
    const a1 = pathAt(p1, q1, sameSide, DECISION_S), a2 = pathAt(p2, q2, sameSide, DECISION_S);
    const b1 = pathAt(p1, q1, sameSide, 0.0), b2 = pathAt(p2, q2, sameSide, 0.0);
    const r1 = remainingBreak(p1, DECISION_S), r2 = remainingBreak(p2, DECISION_S);
    const dT = ((a1[0] - a2[0]) ** 2 + (a1[1] - a2[1]) ** 2) ** 0.5;
    const dP = ((b1[0] - b2[0]) ** 2 + (b1[1] - b2[1]) ** 2) ** 0.5;
    const dB = ((r1[0] - r2[0]) ** 2 + (r1[1] - r2[1]) ** 2) ** 0.5;
    const dR = ((p1.release_offset_in[0] - p2.release_offset_in[0]) ** 2 + (p1.release_offset_in[1] - p2.release_offset_in[1]) ** 2) ** 0.5;
    const score = 0.6 * Math.min(dB, 18) / 18 + 0.4 * Math.min(dP, 24) / 24 - dT / 10 - dR / 8;
    return [Math.max(-1.0, Math.min(1.0, score)), dT, dB, dP];
  }
  const perceived = (p, q) => mph(p) + EV_ADJ[q];

  function pairing(p, q, s, arsenal) {
    if (!s.last) return 0.0;
    const lastName = s.last[0], lastQ = s.last[1];
    const lastResult = s.last.length > 2 ? s.last[2] : null;
    const last = arsenal.find((x) => x.name === lastName);
    if (!last) return 0.0;
    const upLast = lastQ.startsWith("up"), upNow = q.startsWith("up");
    if (last.name === p.name) {
      if (lastResult === "whiff") return lastQ === q ? 0.4 : 0.3;
      if (lastQ === q) return -0.8;
    }
    let base;
    if (last.kind === "FB") base = isOffspeed(p.kind) ? ((upLast && !upNow) ? 1.0 : 0.6) : (upLast !== upNow ? 0.3 : -0.2);
    else if (p.kind === "FB") base = upNow ? 0.6 : 0.3;
    else base = last.name === p.name ? -0.3 : 0.2;
    const gap = Math.abs(perceived(p, q) - perceived(last, lastQ));
    const speed = Math.min(gap / 16.0, 1.0) * 0.6 - 0.2;
    const tun = last.name !== p.name ? tunnelScore(last, lastQ, p, q, s.same_side)[0] : 0.0;
    return Math.max(-1.0, Math.min(1.0, 0.30 * base + speed + 0.50 * tun));
  }

  function shapeFit(p, q, s) {
    let f = 0.0;
    const up = q.startsWith("up");
    if (p.kind === "FB") {
      if (p.shape === "ride") f += up ? 0.5 : -0.2;
      if (p.shape === "sink") f += !up ? 0.5 : -0.3;
    } else {
      f += (!up || q === "chase") ? 0.4 : -1.0;
      if (p.kind === "SL" && s.same_side && (q.includes("away") || q === "chase")) f += 0.3;
    }
    if (p.kind === "CH" && s.same_side) f -= 0.3;
    return f;
  }

  function damage(p, q, s) {
    let total = 0.0;
    for (const key of [isOffspeed(p.kind) ? "OS" : "FB", q]) {
      if (key in s.hitter_damage) {
        const [score, n] = s.hitter_damage[key];
        let eff = score * n / (n + 10.0);
        if (eff < 0 && n < 20) eff *= 0.5;
        total += eff;
      }
    }
    return total;
  }

  // ---------------------------------------------------------------- outcome model
  function outcomeProbs(p, q, s, arsenal, policy, byZone, sit, zout) {   // byZone (optional): each landing zone's own outcome mix
    const L = D.LEVEL[s.level], A = D.OUTCOME_ADJ[s.level];
    const big = isBigSpot(s);
    const cL = L.cL * (big ? 1.5 : 1.0);
    const bT = 0.4 * (big ? 0.5 : 1.0);
    const v08x = (sit !== undefined && sit !== null) || !FLAGS.expect_v07;   // v0.8 sit terms replace the v0.7c expectation E
    let E = 0, neutral = 0, mT = 0, mH = 0, vSit = 0;
    if (v08x) {
      if (sit === undefined || sit === null) sit = ["mix", s.sit_sigma !== null && s.sit_sigma !== undefined ? s.sit_sigma : sitPrior(arsenal, s)];
      [mT, mH, vSit] = sitShift(p, q, arsenal, s, sit);
    } else [E, neutral] = expectation(p, arsenal, s, policy);
    let T = 0, pw = 0, ps = 0;
    if (FLAGS.pairing_v07) T = pairing(p, q, s, arsenal);
    else [pw, ps] = pairTerms(p, q, s, arsenal);
    let tB = 0.0;
    if (FLAGS.timing_B) {
      if (!v08x) { const pr = sitPrior(arsenal, s); vSit = psum(Object.keys(pr).map((key) => pr[key] * speedToday(byName(arsenal, key.slice(0, key.lastIndexOf("|"))), s))); }
      tB = (RHO_L[s.level] ?? 1.0) * timingB(p, q, s, vSit) * (big ? 0.5 : 1.0);   // 4: pair terms halved in a big spot
    }
    const capped = !FLAGS.expect_v07;
    const hL = L.hL;
    const gr = FLAGS.hitter_grades ? (s.grades || GRADES_OVERRIDE) : null;
    const f = shapeFit(p, q, s);
    const dmg = damage(p, q, s);
    const tau = (isOffspeed(p.kind) ? s.timing.OS : s.timing.FB) || 0.0;
    const tauEff = p.kind === "FB" ? tau : -tau;
    const hittersCount = s.balls > s.strikes && s.strikes < 2;
    const land = landing(p, q, s);
    let [command, grade] = effective(p, s);
    if (FLAGS.fatigue_v08) grade = grade - Math.min(P08.kg_cap, P08.kg * Math.max(0, s.pitch_count - L.fatigue) / 20);
    const gs = 0.25 * (L.stuff_scale ?? 1.0);
    const cw = (L.cmd_whiff ?? 0.0) * (command - 3);   // v0.7b: better command adds contact, not strikeouts (fit_spread.py)
    const out = { ball: 0, cstrike: 0, whiff: 0, foul: 0, weak: 0, solid: 0, hard: 0, wp_ball: 0, hbp: 0 };
    for (const z of ZONES) {
      const pz = land[z];
      let sl = logit(S0[z]);
      if (s.strikes === 2) sl += 0.9;
      if (s.balls === 0 && s.strikes === 0) sl -= 0.4;
      if (s.balls === 3 && s.strikes === 0) sl -= 2.0;
      else if (hittersCount) sl += (z === "heart" || z === "edge") ? 0.3 : -0.4;
      if (z === "off" && isOffspeed(p.kind)) sl += 0.2;
      const wz = ZONE_IN[z];
      sl += wz * A.zsw + (1 - wz) * A.osw;
      const offz = z === "off" || z === "noncomp";
      if (v08x) sl += hL * (P08.sit_tS * mT + P08.sit_hS * mH);
      if (!FLAGS.pairing_v07 && offz) sl += ps;
      if (gr && offz) sl -= gval("g_d", s.level) * ((gr.d ?? 3) - 3);
      const S = S0[z] > 0 ? sig(sl) : 0;
      let C;
      if (FLAGS.umpire_learn && (z === "edge" || z === "off")) C = sig(logit(C0[z]) + A.cs + countKappa(s.balls, s.strikes, s.level) + s.ump_u);
      else C = (z === "edge" || z === "off") ? sig(logit(C0[z]) + A.cs) : C0[z];
      let wl = logit(W0[z]) + KIND_W[p.kind] + gs * (grade - 3) + cL * 1.5 * (p.conf - 0.6);
      if (!v08x) wl += L.hL * (-1.5 * (E - neutral) + 0.6 * tauEff - 0.4 * DMG_SCALE * dmg);
      else {
        let ex = -hL * (P08.sit_tW * mT + P08.sit_hW * mH) + hL * 0.6 * tauEff + P08.beta_T * tB;
        if (capped) ex = Math.max(-P08.capW * hL, Math.min(P08.capW * hL, ex));
        wl += ex - hL * 0.4 * DMG_SCALE * dmg;
      }
      if (FLAGS.timing_B && !v08x) wl += P08.beta_T * tB;
      if (FLAGS.pairing_v07) wl += bT * T + 0.25 * f;
      else wl += pw + 0.25 * f;
      wl += wz * A.wz + (1 - wz) * A.wo;
      if (cw) wl -= cw;
      if (gr) wl -= gval("g_c", s.level) * ((gr.c ?? 3) - 3);
      const W = sig(wl);
      const F = sig(logit(F0[z]) + (s.strikes === 2 ? 0.3 : 0));
      let hl;
      if (!v08x) hl = -gs * (grade - 3) - cL * 0.5 * (p.conf - 0.6) + L.hL * (1.0 * (E - neutral) + 0.8 * DMG_SCALE * dmg) - 0.3 * f;
      else {
        let hx = hL * (P08.sit_tH * mT + P08.sit_hH * mH) - hL * 0.5 * tauEff - P08.gamma_T * tB;
        if (capped) hx = Math.max(-P08.capH * hL, Math.min(P08.capH * hL, hx));
        hl = -gs * (grade - 3) - cL * 0.5 * (p.conf - 0.6) + hx + hL * 0.8 * DMG_SCALE * dmg - 0.3 * f;
      }
      if (FLAGS.bf_term_v07) hl += 0.012 * s.batters_faced;
      else { const c_ = isOffspeed(p.kind) ? "OS" : "FB"; hl += Math.min(P08.fam_cap, P08["phi_" + c_] * ((s.familiar || {})[c_] || 0)); }
      if (!v08x) hl -= L.hL * 0.5 * tauEff;   // v0.6e: off-time swings make weaker contact too
      if (FLAGS.timing_B && !v08x) hl -= P08.gamma_T * tB;
      if (gr) hl += gval("g_w", s.level) * ((gr.w ?? 3) - 3);
      if (s.crowding && (q === "up-in" || q === "down-in")) hl -= P08.crowd;
      if (p.kind === "CH" && s.same_side) hl += 0.2;
      if (z === "heart" && isOffspeed(p.kind)) hl += 0.5;
      if (isOffspeed(p.kind) && (q.startsWith("up") || q === "middle")) hl += 0.4;
      const [weak, solid, hard] = Q0[z];
      const hard2 = sig(logit(hard) + hl);
      if (zout) zout[z] = { L: pz, S, C, W, F, H: hard2, offz, cz: z === "edge" || z === "off" };
      const scale = (1 - hard2) / (weak + solid);
      const weak2 = weak * scale, solid2 = solid * scale;
      const take = 1 - S;
      let ballP = pz * take * (1 - C);
      if ((z === "noncomp" || z === "off") && A.hbp > 0) {
        const hb = Math.min(0.9, A.hbp * HBP_LOC[q] * (z === "noncomp" ? 1.0 : 0.1));
        out.hbp += ballP * hb;
        ballP *= (1 - hb);
      }
      if (z === "noncomp" && anyBase(s.bases)) {
        const wp = (isOffspeed(p.kind) ? 0.12 : 0.04) * (1 - 0.15 * (s.catcher_block - 3));
        out.wp_ball += ballP * wp;
        ballP *= (1 - wp);
      }
      out.ball += ballP;
      out.cstrike += pz * take * C;
      out.whiff += pz * S * W;
      out.foul += pz * S * (1 - W) * F;
      const contact = pz * S * (1 - W) * (1 - F);
      out.weak += contact * weak2; out.solid += contact * solid2; out.hard += contact * hard2;
      if (byZone) {   // v0.7: the outcome mix given the pitch landed in this zone (for learning from logged location)
        const take_ = 1 - S, bp = take_ * (1 - C);
        let hbpZ = 0, wpZ = 0, ballZ = bp;
        if ((z === "noncomp" || z === "off") && A.hbp > 0) { const hb = Math.min(0.9, A.hbp * HBP_LOC[q] * (z === "noncomp" ? 1.0 : 0.1)); hbpZ = ballZ * hb; ballZ *= (1 - hb); }
        if (z === "noncomp" && anyBase(s.bases)) { const wp = (isOffspeed(p.kind) ? 0.12 : 0.04) * (1 - 0.15 * (s.catcher_block - 3)); wpZ = ballZ * wp; ballZ *= (1 - wp); }
        const ct = S * (1 - W) * (1 - F);
        byZone[z] = { land: pz, ball: ballZ, wp_ball: wpZ, hbp: hbpZ, cstrike: take_ * C, whiff: S * W, foul: S * (1 - W) * F, weak: ct * weak2, solid: ct * solid2, hard: ct * hard2 };
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- situation terms
  function inPlayValue(contact, outs, bases, level) {
    const [b1, b2, b3] = bases;
    const [po, p1, p2, p3, phr, pe] = D.IN_PLAY[level][contact];
    const epv = (o, b, r) => r + re(o, b, level);
    let total = 0.0, vOut;
    if (outs + 1 >= 3) vOut = 0.0;
    else {
      const dp = (b1 && contact === "weak" && outs < 2) ? 0.20 : 0.0;
      const vDp = outs + 2 >= 3 ? 0.0 : epv(outs + 2, [false, b2, b3], 0);
      const vReg = b3 ? 0.4 * epv(outs + 1, [b1, b2, false], 1) + 0.6 * epv(outs + 1, bases, 0) : epv(outs + 1, bases, 0);
      vOut = dp * vDp + (1 - dp) * vReg;
    }
    total += po * vOut;
    let runs = b3 ? 1 : 0, v1;
    if (b2) v1 = 0.55 * epv(outs, [true, b1, false], runs + 1) + 0.45 * epv(outs, [true, b1, true], runs);
    else v1 = epv(outs, [true, b1, false], runs);
    total += (p1 + pe) * v1;
    runs = (b2 ? 1 : 0) + (b3 ? 1 : 0);
    let v2;
    if (b1) v2 = 0.4 * epv(outs, [false, true, false], runs + 1) + 0.6 * epv(outs, [false, true, true], runs);
    else v2 = epv(outs, [false, true, false], runs);
    total += p2 * v2;
    total += p3 * epv(outs, [false, false, true], +b1 + +b2 + +b3);
    total += phr * epv(outs, [false, false, false], +b1 + +b2 + +b3 + 1);
    return total;
  }
  function walkValue(outs, bases, level) {
    const [b1, b2, b3] = bases;
    const runs = (b1 && b2 && b3) ? 1 : 0;
    return runs + re(outs, [true, b1 || b2, b3 || (b1 && b2)], level);
  }
  function cost(p, q, s, arsenal, policy, cv, sit) {
    const P = outcomeProbs(p, q, s, arsenal, policy, null, sit);
    const b = s.balls, k = s.strikes, o = s.outs, B = s.bases, L = s.level;
    const afterBall = (bases, runs) => (b + 1 === 4 ? runs + walkValue(o, bases, L) : runs + V(b + 1, k, o, bases, cv, L));
    const afterStrike = () => (k + 1 === 3 ? re(o + 1, B, L) : V(b, k + 1, o, B, cv, L));
    let v = 0.0;
    v += P.ball * afterBall(B, 0);
    const nb = [false, B[0], B[1]], r = B[2] ? 1 : 0;
    v += P.wp_ball * afterBall(nb, r);
    v += P.hbp * walkValue(o, B, L);
    v += (P.cstrike + P.whiff) * afterStrike();
    v += P.foul * (k < 2 ? V(b, k + 1, o, B, cv, L) : V(b, k, o, B, cv, L));
    if (FLAGS.inplay_typed) for (const c of ["weak", "solid", "hard"]) v += P[c] * inPlayValueTyped(c, p, q, s);
    else for (const c of ["weak", "solid", "hard"]) v += P[c] * inPlayValue(c, o, B, L);
    return [v, P];
  }

  // ---------------------------------------------------------------- decision rule
  function softmax(costs, temp, window, best) {   // costs: array of [key, cost] in insertion order
    if (best === undefined || best === null) best = Math.min(...costs.map((c) => c[1]));
    const keep = costs.filter((c) => c[1] - best <= window);
    if (!keep.length) return [];
    const mk = Math.min(...keep.map((c) => c[1]));
    const w = keep.map((c) => [c[0], Math.exp(-(c[1] - mk) / temp)]);
    let t = 0; for (const x of w) t += x[1];
    return w.map((x) => [x[0], x[1] / t]);
  }
  function candidates(arsenal, s, forced) {
    const cutoff = D.LEVEL[s.level].cutoff;
    let c = arsenal.filter((x) => x.conf >= cutoff || (forced && x.name === forced));
    if (!c.length) c = [arsenal.reduce((a, x) => (x.conf > a.conf ? x : a), arsenal[0])];
    return c;
  }
  function countStakes(b, k, level) {
    const cv = D.CV[level], [bb, kk] = D.LW[level];
    const strike = k === 2 ? kk : cv[cvKey(b, k + 1)];
    const ball = b === 3 ? bb : cv[cvKey(b + 1, k)];
    return ball - strike;
  }
  function stakesFactor(b, k, level) {
    if (!D.LW[level]) return 1.0;
    if (b === 3 && k === 0) return 0.5;   // v0.7c (Drew): 3-0 gets the tightest setting, like 3-2 (engine.py)
    let avg = 0; for (const [b_, k_] of COUNTS) avg += countStakes(b_, k_, level);
    avg /= COUNTS.length;
    return Math.min(1.5, Math.max(0.5, avg / countStakes(b, k, level)));
  }
  const ck = (name, q) => name + "|" + q;

  function mixedPolicy(arsenal, s, T = 0.010, window = 0.030, forced = null, iters = 8, cv = null) {
    const cands = candidates(arsenal, s, forced);
    const k = runScale(s.level);
    const f = stakesFactor(s.balls, s.strikes, s.level);
    T = T * k; window = window * k * Math.min(1.0, f);
    const temp = T * (isBigSpot(s) ? 0.5 : 1.0) * f;
    let policy = null, costs = null;
    for (let it = 0; it < iters; it++) {
      costs = new Map();
      for (const p of cands) for (const q of QUADS) costs.set(ck(p.name, q), cost(p, q, s, arsenal, policy, cv)[0]);
      const tq = targets(s.balls, s.strikes);
      const bestBy = cands.map((p) => [p.name, Math.min(...tq.map((q) => costs.get(ck(p.name, q))))]);
      const pp = new Map(softmax(bestBy, temp, window));
      const nw = {}; for (const x of arsenal) nw[x.name] = pp.get(x.name) || 0.0;
      if (policy === null) policy = nw;
      else { const m = {}; for (const kk in nw) m[kk] = 0.5 * policy[kk] + 0.5 * nw[kk]; policy = m; }
    }
    return [policy, costs, temp];
  }
  const minAllowed = (costs, tq) => { let m = Infinity; for (const [key, v] of costs) if (tq.includes(key.slice(key.lastIndexOf("|") + 1)) && v < m) m = v; return m; };

  function atBatValues(arsenal, s, T = 0.010, window = 0.030, sweeps = 10, iters = 4) {
    const cv = Object.assign({}, D.CV[s.level]);
    const base = re(s.outs, s.bases, s.level);
    const order = COUNTS.slice().sort((a, b) => -(a[0] + a[1]) + (b[0] + b[1]));   // stable: same as Python
    for (let sw = 0; sw < sweeps; sw++) {
      let delta = 0.0;
      for (const [b, k] of order) {
        const same = b === s.balls && k === s.strikes;
        const sc = replace(s, { balls: b, strikes: k, last: same ? s.last : null, usage_this_count: same ? s.usage_this_count : {} });
        const [policy, costs, temp] = mixedPolicy(arsenal, sc, T, window, null, iters, cv);
        let ev = 0.0;
        const tq = targets(b, k), bestOk = minAllowed(costs, tq);
        for (const name in policy) {
          const pp = policy[name];
          if (pp <= 0) continue;
          let loc = softmax(tq.map((q) => [q, costs.get(ck(name, q))]), temp,
            LOC_WINDOW * runScale(s.level) * Math.min(1.0, stakesFactor(b, k, s.level)), bestOk);
          if (!loc.length) {
            let bq = tq[0]; for (const q of tq) if (costs.get(ck(name, q)) < costs.get(ck(name, bq))) bq = q;
            loc = [[bq, 1.0]];
          }
          let sub = 0; for (const [q, pq] of loc) sub += pq * costs.get(ck(name, q));
          ev += pp * sub;
        }
        const nv = ev - base;
        delta = Math.max(delta, Math.abs(nv - cv[cvKey(b, k)]));
        cv[cvKey(b, k)] = nv;
      }
      if (delta < 0.001) break;
    }
    const zero = cv["0-0"], rel = {};
    for (const key in cv) rel[key] = cv[key] - zero;
    return [rel, cv];
  }

  const KINDS = ["FB", "SL", "CB", "CH"];
  function checkInputs(arsenal, s) {   // v0.7c: impossible input gets a clear error, not a crash or a silent empty call
    if (!arsenal || !arsenal.length) throw new Error("no pitches: the arsenal is empty");
    const names = arsenal.map((x) => x.name);
    if (new Set(names).size !== names.length) throw new Error(`two pitches share a name: ${names.join(", ")}`);
    for (const x of arsenal) if (!KINDS.includes(x.kind)) throw new Error(`unknown pitch kind "${x.kind}" for ${x.name}`);
    if (!D.LEVEL[s.level] || !D.RE[s.level]) throw new Error(`unknown level "${s.level}"`);
    if (!(s.balls >= 0 && s.balls <= 3 && s.strikes >= 0 && s.strikes <= 2)) throw new Error(`impossible count ${s.balls}-${s.strikes}`);
    if (!(s.outs >= 0 && s.outs <= 2)) throw new Error(`impossible number of outs ${s.outs}`);
    if (!s.bases || s.bases.length !== 3) throw new Error("bases must be three flags (1st, 2nd, 3rd)");
  }

  function callMixed(arsenal, s, opts = {}) {
    checkInputs(arsenal, s);
    const T = opts.T ?? 0.010, window = opts.window ?? 0.030, forced = opts.forced ?? null, iters = opts.iters ?? 8;
    const rng = opts.rng || Math.random, atBat = opts.atBat ?? true;
    const cv = atBat ? atBatValues(arsenal, s, T, window)[1] : null;
    const [policy, costs, temp] = mixedPolicy(arsenal, s, T, window, forced, iters, cv);
    let pPitch = Object.entries(policy).filter(([, v]) => v > 0.005);
    let t = 0; for (const [, v] of pPitch) t += v;
    pPitch = pPitch.map(([kk, v]) => [kk, v / t]);
    const dist = [];
    const tq = targets(s.balls, s.strikes), overall = minAllowed(costs, tq);
    for (const [name, pp] of pPitch) {
      let loc = softmax(tq.map((q) => [q, costs.get(ck(name, q))]), temp,
        LOC_WINDOW * runScale(s.level) * Math.min(1.0, stakesFactor(s.balls, s.strikes, s.level)), overall);
      if (!loc.length) {
        let bq = tq[0]; for (const q of tq) if (costs.get(ck(name, q)) < costs.get(ck(name, bq))) bq = q;
        loc = [[bq, 1.0]];
      }
      const p = arsenal.find((x) => x.name === name);
      for (const [q, pq] of loc) dist.push({ prob: pp * pq, cost: costs.get(ck(name, q)), pitch: p, quad: q });
    }
    if (opts.exclude && opts.exclude.length) {   // never re-call what he just shook off (unless nothing else is left)
      const kept = dist.filter((d) => !opts.exclude.some(([n, q]) => d.pitch.name === n && d.quad === q));
      if (kept.length) { const t_ = kept.reduce((a, d) => a + d.prob, 0); dist.length = 0; for (const d of kept) dist.push(Object.assign(d, { prob: d.prob / t_ })); }
    }
    dist.sort((a, b) => b.prob - a.prob);
    const r = rng();
    let acc = 0.0;
    for (const d of dist) { acc += d.prob; if (r <= acc) return { pick: d, dist, best: overall, policy }; }
    return { pick: dist[dist.length - 1], dist, best: overall, policy };
  }

  function gradeCall(arsenal, s, pitchName, quad, opts = {}) {
    const { dist } = callMixed(arsenal, s, opts);
    // v0.7c: scored the way the call is made: count values solved for this matchup, and only the targets allowed here
    const cv = (opts.atBat ?? true) ? atBatValues(arsenal, s)[1] : null;
    const [policy, costs] = mixedPolicy(arsenal, s, 0.010, 0.030, null, 8, cv);
    const p = arsenal.find((x) => x.name === pitchName);
    const cHuman = costs.has(ck(pitchName, quad)) ? costs.get(ck(pitchName, quad)) : cost(p, quad, s, arsenal, policy, cv)[0];
    const tq = targets(s.balls, s.strikes), best = minAllowed(costs, tq), allowed = tq.includes(quad);
    let prob = 0; for (const d of dist) if (d.pitch.name === pitchName && d.quad === quad) prob += d.prob;
    return { call: pitchName + " " + quad, engine_prob: prob, runs_vs_best: cHuman - best, allowed,
      verdict: !allowed ? "costly" : prob >= 0.02 ? "in the engine's mix" : (cHuman - best <= 0.03 * runScale(s.level) ? "close" : "costly"),
      engine_top: dist.slice(0, 3).map((d) => [d.pitch.name, d.quad, d.prob]) };
  }

  // ---------------------------------------------------------------- "time for a change" (flags.py)
  function pitcherStatus(arsenal, level, pitchCount, recent) {
    const L = D.LEVEL[level];
    const trusted = arsenal.filter((p) => p.conf >= L.cutoff);
    let slide = 0; for (const p of arsenal) slide += Math.max(0.0, p.base_conf - p.conf); slide /= arsenal.length;
    const over = pitchCount - L.fatigue;
    const last6 = (recent || []).slice(-6);
    const traffic = last6.filter((r) => r === "walk" || r === "hbp" || r === "hard").length;
    const reasons = []; let score = 0;
    if (!trusted.length) { reasons.push("he trusts none of his pitches right now"); score += 3; }
    else if (trusted.length === 1 && arsenal.length > 1) { reasons.push(`he's down to one pitch he trusts (${trusted[0].name})`); score += 1; }
    if (slide >= 0.15) { reasons.push(`confidence is down ${slide.toFixed(2)} from his bullpen on average`); score += 1; }
    if (over >= 20) { reasons.push(`${over} pitches past his usual fatigue point`); score += 2; }
    else if (over >= 0) { reasons.push(`at his fatigue point (${pitchCount} pitches)`); score += 1; }
    if (traffic >= 4) { reasons.push(`${traffic} of his last ${last6.length} batters walked, were hit, or hit it hard`); score += 2; }
    else if (traffic >= 3) { reasons.push(`${traffic} of his last ${last6.length} batters walked, were hit, or hit it hard`); score += 1; }
    return { status: score >= 3 ? "change" : (score >= 1 ? "watch" : "ok"), reasons, trusted: trusted.map((p) => p.name), score };
  }

  // ================================================================ v0.8 (docs/SPEC_v0.8.md), port of engine.py
  // Parity notes: Python 3.12+ sum() over floats is compensated (Neumaier); psum reproduces it. Dicts iterate in insertion
  // order in both languages; min/max keep the first of equal values, as Python's do.
  function psum(xs) {
    if (!xs.length) return 0;
    let f = 0 + xs[0], c = 0.0;
    for (let i = 1; i < xs.length; i++) {
      const x = xs[i], t = f + x;
      if (Math.abs(f) >= Math.abs(x)) c += (f - t) + x; else c += (x - t) + f;
      f = t;
    }
    if (c && Number.isFinite(c)) f += c;
    return f;
  }
  const byName = (arsenal, n) => arsenal.find((x) => x.name === n);
  const sk = (n, j) => n + "|" + j;                    // sit option key
  const skName = (key) => key.slice(0, key.lastIndexOf("|"));
  const skH = (key) => key.slice(key.lastIndexOf("|") + 1);
  const cntKey = (b, k) => b + "-" + k;

  let P08 = {}, TYPED = {}, RHO_L = {}, KAPPA_FIT = null, SIM = {}, OUT_TABLE = {}, RUNNER_FIT = {}, HITTER_SPREAD = {},
    RUN_GAME = {}, WE = null;
  let GRADES_OVERRIDE = null;
  const HEIGHTS = ["up", "middle", "down"];            // amendment A1
  const Y_TARGET = { "up-in": 3.2, "up-away": 3.2, middle: 2.5, "down-in": 1.8, "down-away": 1.8 };
  const V_CENTERS = [1.00, 0.94, 0.88], Y_CENTERS = [3.0, 2.0];
  const QRE_ITERS = 3000, QRE_TOL = 1e-3, QRE_WMIN = 0.002, TAPER = 0.2;
  const B_TYPES = ["GB", "LD", "FB", "PU"];
  function initV08(v) {
    P08 = Object.assign({}, v.P08); TYPED = v.TYPED; RHO_L = v.RHO_L;
    KAPPA_FIT = v.KAPPA_FIT && Object.keys(v.KAPPA_FIT).length ? v.KAPPA_FIT : null;
    SIM = v.SIM; OUT_TABLE = v.OUT_TABLE; RUNNER_FIT = v.RUNNER_FIT; HITTER_SPREAD = v.HITTER_SPREAD || {}; RUN_GAME = v.RUN_GAME;
    WE = D.WE || null;
    for (const t of [OUT_TABLE, RUNNER_FIT, HITTER_SPREAD, RUN_GAME, SIM.A_BAR || {}, SIM.I_BAR_UMP || {}, SIM.I0_GRADE || {}, SIM.T_unc || {}])
      if (t.hs && !t.travel) t.travel = t.hs;
  }
  const yTarget = (q, kind) => (q === "chase" ? (kind === "SL" || kind === "CB" || kind === "CH" ? 1.2 : 3.8) : Y_TARGET[q]);
  function heightMember(q, kind, j) {
    const h = q === "middle" ? "middle" : (q.startsWith("up") || (q === "chase" && kind === "FB")) ? "up" : "down";
    return h === j ? 1.0 : 0.0;
  }
  const sitOptions = (arsenal) => { const o = []; for (const x of arsenal) for (const j of HEIGHTS) o.push(sk(x.name, j)); return o; };
  function sitPrior(arsenal, s) {
    const m = arsenal.length, hc = s.balls > s.strikes && s.strikes < 2;
    const fb = arsenal.filter((x) => x.kind === "FB"), os = arsenal.filter((x) => x.kind !== "FB");
    const pr = {};
    if (fb.length && os.length) {
      const fs = hc ? 0.65 : (s.strikes === 2 ? 0.35 : 0.5);
      for (const x of arsenal) pr[x.name] = x.kind === "FB" ? fs / fb.length : (1 - fs) / os.length;
    } else for (const x of arsenal) pr[x.name] = 1 / m;
    const out = {};
    for (const n in pr) for (const j of HEIGHTS) out[sk(n, j)] = pr[n] / HEIGHTS.length;
    return out;
  }
  function speedToday(p, s) {
    if (s.radar && p.name in s.radar) return s.radar[p.name];
    let v = mph(p);
    if (FLAGS.fatigue_v08) v -= Math.min(P08.kv_cap, P08.kv * Math.max(0, s.pitch_count - D.LEVEL[s.level].fatigue) / 10);
    return v;
  }
  function sitShift(p, q, arsenal, s, sit) {
    const kt = arsenal.length;
    if (sit[0] === "pure") {
      const i = sit[1], j = sit[2];
      return [(p.name === i ? 1.0 : 0.0) - 1 / kt, heightMember(q, p.kind, j) - 1 / HEIGHTS.length, speedToday(byName(arsenal, i), s)];
    }
    const sg = sit[1], keys = Object.keys(sg);
    const mt = psum(keys.filter((key) => skName(key) === p.name).map((key) => sg[key])) - 1 / kt;
    const mh = psum(keys.map((key) => sg[key] * heightMember(q, p.kind, skH(key)))) - 1 / HEIGHTS.length;
    const vs = psum(keys.map((key) => sg[key] * speedToday(byName(arsenal, skName(key)), s)));
    return [mt, mh, vs];
  }
  function timingB(p, q, s, vSit) {
    const vHat = s.look ? s.look[0] : vSit;
    const vt = (1 - P08.alpha) * vHat + P08.alpha * vSit;
    const vp = speedToday(p, s) + 0.5 * EV_ADJ[q];
    const r = (vt - vp) / vt;
    const sr = Math.min(1.0, Math.max(0.0, (Math.abs(r) - P08.dead) / P08.ramp));
    if (r < 0) return P08.fast_mult * sr;
    if (p.kind === "CH" && r > P08.ch_hi) return sr * Math.exp(-(r - P08.ch_hi) / P08.ch_decay);
    return sr;
  }
  const gMod = (d, ds) => (d > 0 ? (d / ds) * Math.exp(1 - d / ds) : 0.0);
  function pairTerms(p, q, s, arsenal) {
    const yHat = s.look ? s.look[1] : 2.5;
    const ey = gMod((p.kind === "FB" ? 1 : -1) * (yTarget(q, p.kind) - yHat), P08.dstar_E);
    let w = P08.beta_E * ey, sw = P08.beta_E_S * ey;
    if (s.last) {
      const last = byName(arsenal, s.last[0]);
      const lq = s.last[1], res = s.last.length > 2 ? s.last[2] : null;
      if (last) {
        if (last.name === p.name) {
          if (res === "whiff") w += lq === q ? P08.rep_whiff_same : P08.rep_whiff_other;
          else if (lq === q) w += P08.rep_same_spot;
        } else {
          const ts = tunnelScore(last, lq, p, q, s.same_side), dTun = ts[1], dPlate = ts[3];
          const dRel = ((last.release_offset_in[0] - p.release_offset_in[0]) ** 2 + (last.release_offset_in[1] - p.release_offset_in[1]) ** 2) ** 0.5;
          const tun = Math.max(-1.0, Math.min(1.0, Math.exp(-dTun / 6) * gMod(dPlate, 18) - dRel / 8));
          const kap = (p.kind === "SL" || p.kind === "CB") ? P08.kappa_brk : 1.0;
          w += kap * P08.beta_tun * tun; sw += kap * P08.beta_tun * tun;
        }
      }
    }
    if (isBigSpot(s)) { w = 0.5 * w; sw = 0.5 * sw; }
    return [w, sw];
  }
  const gval = (name, level) => ((HITTER_SPREAD[level] && HITTER_SPREAD[level][name] !== undefined) ? HITTER_SPREAD[level][name] : P08[name]);
  const zoneArea = (b, k) => 3.03 + 0.22 * b - 0.30 * k;
  const countKappa = (b, k, level) => (KAPPA_FIT ? KAPPA_FIT[cntKey(b, k)] : Math.log(zoneArea(b, k) / ((SIM.A_BAR || {})[level] ?? 3.0)));

  // ---------------------------------------------------------------- 7.2 end values, 7.3 typed balls in play
  function vEnd(s, o, bases, r) {
    const base = r + re(o, bases, s.level), w = s.win;
    if (!(FLAGS.objective_win && w && w.omega > 0)) return base;
    const we = wePitch(w.ctx, o, bases, w.margin0 - r);
    return (1 - w.omega) * base + w.omega * (w.WE0 - we) / w.m0;
  }
  function gbRate(p) {
    if (p.kind === "FB") return ({ sink: 0.495, cut: 0.430 })[p.shape] ?? 0.379;
    return ({ SL: 0.439, CB: 0.487, CH: 0.478 })[p.kind];
  }
  function typeMix(p, q, c) {
    const g = sig(logit(gbRate(p)) + TYPED.beta_y * (yTarget(q, p.kind) - 2.5) + TYPED.gamma[c]);
    const l = TYPED.nongb[c];
    return { GB: g, LD: (1 - g) * l[0], FB: (1 - g) * l[1], PU: (1 - g) * l[2] };
  }
  function inPlayValueTyped(c, p, q, s) {
    const o = s.outs, [b1, b2, b3] = s.bases, L = s.level;
    const tab = OUT_TABLE[L][c], rf = RUNNER_FIT[L];
    const ev = (o_, b_, r_) => vEnd(s, o_, b_, r_);
    const tm = typeMix(p, q, c);
    let total = 0.0;
    for (const t of B_TYPES) {
      const [po, p1, p2, p3, phr, pe] = tab[t];
      let vOut;
      if (o + 1 >= 3) vOut = ev(3, [false, false, false], 0);
      else {
        let psc, dp;
        if (t === "GB") { psc = s.infield_in ? TYPED.gb_infield_in : rf.p_GB; dp = b1 ? Math.min(0.95, TYPED.dp[c] * rf.S_DP) : 0.0; }
        else if (t === "FB") { psc = rf.p_FB; dp = 0.0; }
        else { psc = 0.01; dp = 0.0; }
        const vDp = dp ? (o + 2 >= 3 ? ev(3, [false, false, false], 0) : ev(o + 2, [false, false, b2], b3 ? 1 : 0)) : 0.0;
        const adv = TYPED.r2_to_3rd[t] ?? 0.0;
        const after = (scored) => {
          const thirdOpen = !b3 || scored;
          if (b2 && thirdOpen && adv)
            return adv * ev(o + 1, [b1, false, true], (b3 && scored) ? 1 : 0) + (1 - adv) * ev(o + 1, [b1, b2, b3 && !scored], (b3 && scored) ? 1 : 0);
          return ev(o + 1, [b1, b2, b3 && !scored], (b3 && scored) ? 1 : 0);
        };
        const vReg = b3 ? (psc * after(true) + (1 - psc) * after(false)) : after(false);
        vOut = dp * vDp + (1 - dp) * vReg;
      }
      let tt = po * vOut;
      let runs = b3 ? 1 : 0, v1;
      if (b2) v1 = 0.55 * ev(o, [true, b1, false], runs + 1) + 0.45 * ev(o, [true, b1, true], runs);
      else v1 = ev(o, [true, b1, false], runs);
      tt += (p1 + pe) * v1;
      runs = (b2 ? 1 : 0) + (b3 ? 1 : 0);
      let v2;
      if (b1) v2 = 0.4 * ev(o, [false, true, false], runs + 1) + 0.6 * ev(o, [false, true, true], runs);
      else v2 = ev(o, [false, true, false], runs);
      tt += p2 * v2;
      tt += p3 * ev(o, [false, false, true], +b1 + +b2 + +b3);
      tt += phr * ev(o, [false, false, false], +b1 + +b2 + +b3 + 1);
      total += tm[t] * tt;
    }
    return total;
  }
  function inPlayValueEv(contact, s) {   // v0.7c in_play_value with every PA end through vEnd
    if (!(FLAGS.objective_win && s.win && s.win.omega > 0)) return inPlayValue(contact, s.outs, s.bases, s.level);
    const outs = s.outs, bases = s.bases, [b1, b2, b3] = bases;
    const [po, p1, p2, p3, phr, pe] = D.IN_PLAY[s.level][contact];
    const ev = (o_, b_, r_) => vEnd(s, o_, b_, r_);
    let total = 0.0, vOut;
    if (outs + 1 >= 3) vOut = ev(3, [false, false, false], 0);
    else {
      const dp = (b1 && contact === "weak" && outs < 2) ? 0.20 : 0.0;
      const vDp = outs + 2 >= 3 ? ev(3, [false, false, false], 0) : ev(outs + 2, [false, b2, b3], 0);
      const vReg = b3 ? 0.4 * ev(outs + 1, [b1, b2, false], 1) + 0.6 * ev(outs + 1, bases, 0) : ev(outs + 1, bases, 0);
      vOut = dp * vDp + (1 - dp) * vReg;
    }
    total += po * vOut;
    let runs = b3 ? 1 : 0, v1;
    if (b2) v1 = 0.55 * ev(outs, [true, b1, false], runs + 1) + 0.45 * ev(outs, [true, b1, true], runs);
    else v1 = ev(outs, [true, b1, false], runs);
    total += (p1 + pe) * v1;
    runs = (b2 ? 1 : 0) + (b3 ? 1 : 0);
    let v2;
    if (b1) v2 = 0.4 * ev(outs, [false, true, false], runs + 1) + 0.6 * ev(outs, [false, true, true], runs);
    else v2 = ev(outs, [false, true, false], runs);
    total += p2 * v2;
    total += p3 * ev(outs, [false, false, true], +b1 + +b2 + +b3);
    total += phr * ev(outs, [false, false, false], +b1 + +b2 + +b3 + 1);
    return total;
  }

  // ---------------------------------------------------------------- 2.3 sit game
  function sitPayoff(M, ks, pi) {
    const out = {}, calls = Object.keys(M);
    for (const k of ks) out[k] = psum(calls.map((a) => (pi[a] ?? 0.0) * M[a][k]));
    return out;
  }
  function sitResponse(M, ks, pi, T, b) {
    const cb = sitPayoff(M, ks, pi), u = {};
    for (const k of ks) u[k] = cb[k] / T + (b ? (b[k] ?? 0.0) : 0.0);
    let mx = -Infinity; for (const k of ks) if (u[k] > mx) mx = u[k];
    const w = {}; for (const k of ks) w[k] = Math.exp(u[k] - mx);
    const t = psum(ks.map((k) => w[k]));
    const out = {}; for (const k of ks) out[k] = w[k] / t;
    return out;
  }
  function exploitability(M, ks, pi, sigma) {
    const cb = sitPayoff(M, ks, pi);
    let mx = -Infinity; for (const k of ks) if (cb[k] > mx) mx = cb[k];
    return mx - psum(ks.map((k) => sigma[k] * cb[k]));
  }
  function temperature(arsenal, s) {
    const k_ = runScale(s.level), f = stakesFactor(s.balls, s.strikes, s.level);
    let t = 0.010 * k_ * (isBigSpot(s) ? 0.5 : 1.0) * f;
    if (FLAGS.temp_unc) {
      const size = ({ 2: "two", 3: "three" })[arsenal.length] || "four";
      const tu = (((SIM.T_unc || {})[s.level] || {})[size] || {})[cntKey(s.balls, s.strikes)];
      if (tu !== undefined && tu !== null) t = Math.max(t, tu);
    }
    return t;
  }
  function windows(s) {
    const k_ = runScale(s.level), f = Math.min(1.0, stakesFactor(s.balls, s.strikes, s.level));
    return [0.030 * k_ * f, LOC_WINDOW * k_ * f];
  }
  function taper(g, w) {
    if (g >= w) return 0.0;
    const edge = w * (1 - TAPER);
    return g <= edge ? 1.0 : (w - g) / (w - edge);
  }
  function soft(costs, temp, w, ref) {   // costs: [[key, cost]] in order
    const wt = costs.map(([k, c]) => [k, Math.exp(-(c - ref) / temp) * taper(c - ref, w)]);
    const t = psum(wt.map((x) => x[1]));
    return t > 0 ? wt.filter((x) => x[1] > 0).map(([k, v]) => [k, v / t]) : [];
  }
  function policyFromCosts(costs, s, temp) {   // costs: {callKey: cost} in allowed-call order; returns {callKey: prob}
    const [win, lwin] = windows(s);
    const names = [], keys = Object.keys(costs);
    for (const a of keys) { const n = skName(a); if (!names.includes(n)) names.push(n); }
    const bestBy = names.map((n) => { let m = Infinity; for (const a of keys) if (skName(a) === n && costs[a] < m) m = costs[a]; return [n, m]; });
    let overall = Infinity; for (const [, v] of bestBy) if (v < overall) overall = v;
    const pp = soft(bestBy, temp, win, overall);
    const bb = Object.fromEntries(bestBy), pi = {};
    for (const [n, pn] of pp) {
      const lw = Math.max(TAPER * lwin, lwin - (bb[n] - overall));
      const loc = soft(keys.filter((a) => skName(a) === n).map((a) => [skH(a), costs[a]]), temp, lw, bb[n]);
      for (const [q, pq] of loc) pi[ck(n, q)] = pn * pq;
    }
    return pi;
  }
  function solveSitGame(M, ks, s, temp, bH, usage) {
    const calls = Object.keys(M);
    const us = {}; for (const a in (usage || {})) if (a in M) us[a] = usage[a];
    const nU = psum(Object.values(us));
    const tilde = (p_) => { if (!nU) return p_; const o = {}; for (const a of calls) o[a] = (4 * (p_[a] ?? 0.0) + (us[a] ?? 0)) / (4 + nU); return o; };
    const phi = (sg) => { const c = {}; for (const a of calls) c[a] = psum(ks.map((k) => sg[k] * M[a][k])); return policyFromCosts(c, s, temp); };
    let sg = {}; for (const k of ks) sg[k] = 1.0 / ks.length;
    let w = 0.3, last = null;
    for (let t = 0; t < QRE_ITERS; t++) {
      const pi = phi(sg), f = sitResponse(M, ks, tilde(pi), temp, bH);
      let res = -Infinity; for (const k of ks) res = Math.max(res, Math.abs(sg[k] - f[k]));
      if (res < QRE_TOL) return [pi, sg, res];
      if (last !== null && res > last) w = Math.max(QRE_WMIN, w / 2);
      last = res;
      const ns = {}; for (const k of ks) ns[k] = (1 - w) * sg[k] + w * f[k];
      sg = ns;
    }
    const pi = phi(sg), f = sitResponse(M, ks, tilde(pi), temp, bH);
    let res = -Infinity; for (const k of ks) res = Math.max(res, Math.abs(sg[k] - f[k]));
    return [pi, sg, res];
  }
  function allowedCalls(arsenal, s, exclude) {
    const tq = targets(s.balls, s.strikes), out = [];
    for (const p of candidates(arsenal, s)) for (const q of tq) if (!(exclude && exclude.some(([n, qq]) => n === p.name && qq === q))) out.push(ck(p.name, q));
    return out;
  }

  // ---------------------------------------------------------------- 2.6-2.7 look, 6 planning table
  function vFb(arsenal, s) {
    const fbs = arsenal.filter((x) => x.kind === "FB");
    let m = -Infinity; for (const x of (fbs.length ? fbs : arsenal)) m = Math.max(m, speedToday(x, s));
    return m;
  }
  function lookUpdate(look, p, q, s) {
    const lam = P08.lam, vp = speedToday(p, s) + 0.5 * EV_ADJ[q];
    return [lam * look[0] + (1 - lam) * vp, lam * look[1] + (1 - lam) * yTarget(q, p.kind)];
  }
  function interpAxis(x, c) {
    if (x >= c[0]) return [[0, 1.0]];
    if (x <= c[c.length - 1]) return [[c.length - 1, 1.0]];
    for (let i = 0; i < c.length - 1; i++) {
      const hi = c[i], lo = c[i + 1];
      if (lo <= x && x <= hi) { const w = (x - lo) / (hi - lo); return [[i, w], [i + 1, 1 - w]]; }
    }
  }
  function Table(arsenal, s) {
    const looked = FLAGS.look_state, bins = [];
    if (looked) { for (let iv = 0; iv < V_CENTERS.length; iv++) for (let iy = 0; iy < Y_CENTERS.length; iy++) bins.push(iv + "," + iy); }
    else bins.push("none");
    return { ars: arsenal, s0: s, vfb: vFb(arsenal, s), looked, bins, V: {}, N: {}, sigma: {}, h0: null, sweeps: 0, residuals: [] };
  }
  function binLook(tab, bn) {
    if (bn === "none") return tab.h0;
    const [iv, iy] = bn.split(",").map(Number);
    return [V_CENTERS[iv] * tab.vfb, Y_CENTERS[iy]];
  }
  function tabValue(tab, b, k, look, which) {
    const t = (which === "N" ? tab.N : tab.V)[cntKey(b, k)];
    if (!tab.looked) return t.none;
    let tot = 0.0;
    for (const [iv, wv] of interpAxis(look[0] / tab.vfb, V_CENTERS)) for (const [iy, wy] of interpAxis(look[1], Y_CENTERS)) tot += wv * wy * t[iv + "," + iy];
    return tot;
  }
  function stealCost(p, q, s, tab, nl) {
    const st = s.steal;
    const a = st.a * (st.runner === 2 ? 0.5 : 1.0);
    const y = yTarget(q, p.kind);
    const dL = RUN_GAME[s.level] ?? 0.08;
    const dT = st.t ? Math.min(0.15, Math.max(-0.15, 0.10 * (st.t - 1.4) / 0.2)) : 0.0;
    const pS = Math.min(0.95, Math.max(0.30, 0.64 + 0.20 * Math.min(1.0, Math.max(0.0, (4 - y) / 3)) + dL + dT));
    const [b1, b2, b3] = s.bases, o = s.outs;
    let safe, outB;
    if (st.runner === 2) { safe = [b1, false, true]; outB = [b1, false, b3]; } else { safe = [false, true, b3]; outB = [false, b2, b3]; }
    const here = tabValue(tab, s.balls, s.strikes, nl);
    const baseEnd = vEnd(s, o, s.bases, 0);
    const vSafe = here + vEnd(s, o, safe, 0) - baseEnd;
    const vCaught = o + 1 >= 3 ? vEnd(s, 3, [false, false, false], 0) : here + vEnd(s, o + 1, outB, 0) - baseEnd;
    return a * (pS * vSafe + (1 - pS) * vCaught - here);
  }
  function cost08(p, q, s, arsenal, tab, look, sit, myopic) {
    const s_ = replace(s, { look });
    const P = outcomeProbs(p, q, s_, arsenal, null, null, sit);
    const b = s.balls, k = s.strikes, o = s.outs, B = s.bases;
    const nl = myopic ? tab.h0 : lookUpdate(look, p, q, s);
    const baseEnd = vEnd(s, o, B, 0);
    const tv = (b_, k_) => tabValue(tab, b_, k_, nl);
    const walkEnd = (bases, runs) => { const [b1, b2, b3] = bases, r_ = (b1 && b2 && b3) ? 1 : 0; return vEnd(s, o, [true, b1 || b2, b3 || (b1 && b2)], runs + r_); };
    let v = 0.0;
    v += P.ball * (b + 1 === 4 ? walkEnd(B, 0) : tv(b + 1, k));
    const nb = [false, B[0], B[1]], r = B[2] ? 1 : 0;
    v += P.wp_ball * (b + 1 === 4 ? walkEnd(nb, r) : tv(b + 1, k) + vEnd(s, o, nb, r) - baseEnd);
    v += P.hbp * walkEnd(B, 0);
    v += (P.cstrike + P.whiff) * (k + 1 === 3 ? vEnd(s, o + 1, B, 0) : tv(b, k + 1));
    v += P.foul * (k < 2 ? tv(b, k + 1) : tv(b, k));
    for (const c of ["weak", "solid", "hard"]) v += P[c] * (FLAGS.inplay_typed ? inPlayValueTyped(c, p, q, s) : inPlayValueEv(c, s));
    if (FLAGS.running_game && s.steal && (s.steal.a || 0) > 0) v += stealCost(p, q, s, tab, nl);
    if (FLAGS.hs_pitch_cost && (s.level === "hs" || s.level === "travel")) {
      const w_ = Math.min(1.0, Math.max(0.0, (s.pitch_count - (s.pitch_cap - 20)) / 20));
      if (w_ > 0) {
        const nxt = P.ball * (b + 1 === 4 ? 0 : tabValue(tab, b + 1, k, nl, "N")) +
          (P.cstrike + P.whiff) * (k + 1 === 3 ? 0 : tabValue(tab, b, k + 1, nl, "N")) +
          P.foul * tabValue(tab, b, Math.min(k + 1, 2), nl, "N") + P.wp_ball * (b + 1 === 4 ? 0 : tabValue(tab, b + 1, k, nl, "N"));
        v += 0.002 * runScale(s.level) * w_ * (1 + nxt);
      }
    }
    return [v, P];
  }
  function pitchesLeft(P, s, tab, nl) {
    const b = s.balls, k = s.strikes;
    return 1 + P.ball * (b + 1 === 4 ? 0 : tabValue(tab, b + 1, k, nl, "N")) +
      P.wp_ball * (b + 1 === 4 ? 0 : tabValue(tab, b + 1, k, nl, "N")) +
      (P.cstrike + P.whiff) * (k + 1 === 3 ? 0 : tabValue(tab, b, k + 1, nl, "N")) +
      P.foul * tabValue(tab, b, Math.min(k + 1, 2), nl, "N");
  }
  const pureSit = (key) => ["pure", skName(key), skH(key)];
  function solveTable(arsenal, s, sweeps = 10, tol = 0.001) {
    const tab = Table(arsenal, s);
    const order = COUNTS.slice().sort((a, b) => -(a[0] + a[1]) + (b[0] + b[1]));
    const ks = sitOptions(arsenal);
    for (const [b, k] of COUNTS) {
      const v0 = vEnd(s, s.outs, s.bases, 0) + D.CV[s.level][cntKey(b, k)];
      tab.V[cntKey(b, k)] = {}; tab.N[cntKey(b, k)] = {};
      for (const bn of tab.bins) { tab.V[cntKey(b, k)][bn] = v0; tab.N[cntKey(b, k)][bn] = 2.0; }
    }
    const prior = sitPrior(arsenal, replace(s, { balls: 0, strikes: 0 }));
    tab.h0 = [psum(Object.keys(prior).map((key) => prior[key] * speedToday(byName(arsenal, skName(key)), s))), 2.5];
    for (let sw = 0; sw < sweeps; sw++) {
      let delta = 0.0;
      for (const [b, k] of order) {
        const sc = replace(s, { balls: b, strikes: k, last: null, usage_this_count: {}, usage_by_call: {}, b_h: Object.assign({}, s.b_h) });
        const temp = temperature(arsenal, sc);
        const calls = allowedCalls(arsenal, sc);
        const M = {};
        for (const a of calls) { M[a] = {}; for (const kk of ks) M[a][kk] = cost08(byName(arsenal, skName(a)), skH(a), sc, arsenal, tab, tab.h0, pureSit(kk))[0]; }
        const [, sg, res] = solveSitGame(M, ks, sc, temp, sc.b_h);
        tab.sigma[cntKey(b, k)] = sg;
        tab.residuals.push(res);
        for (const bn of tab.bins) {
          const look = binLook(tab, bn), cs = {}, Ps = {};
          for (const a of calls) [cs[a], Ps[a]] = cost08(byName(arsenal, skName(a)), skH(a), sc, arsenal, tab, look, ["mix", sg]);
          const pol = policyFromCosts(cs, sc, temp);
          const nv = psum(Object.keys(pol).map((a) => pol[a] * cs[a]));
          delta = Math.max(delta, Math.abs(nv - tab.V[cntKey(b, k)][bn]));
          tab.V[cntKey(b, k)][bn] = nv;
          if (FLAGS.hs_pitch_cost)
            tab.N[cntKey(b, k)][bn] = psum(Object.keys(pol).map((a) => pol[a] * pitchesLeft(Ps[a], sc, tab, lookUpdate(look, byName(arsenal, skName(a)), skH(a), sc))));
        }
      }
      const s00 = tab.sigma["0-0"];
      if (s00) tab.h0 = [psum(Object.keys(s00).map((key) => s00[key] * speedToday(byName(arsenal, skName(key)), s))), 2.5];
      tab.sweeps = sw + 1;
      if (delta < tol) break;
    }
    return tab;
  }
  function rootCall(arsenal, s, tab, exclude, lookValue = true) {
    const ks = sitOptions(arsenal);
    const look = s.look || tab.h0;
    const temp = temperature(arsenal, s);
    let calls = allowedCalls(arsenal, s, exclude);
    if (!calls.length) calls = allowedCalls(arsenal, s);
    let M = {};
    for (const a of calls) { M[a] = {}; for (const kk of ks) M[a][kk] = cost08(byName(arsenal, skName(a)), skH(a), s, arsenal, tab, look, pureSit(kk))[0]; }
    const sgTab = tab.sigma[cntKey(s.balls, s.strikes)];
    if (FLAGS.look_state) {
      const Mmy = {};
      for (const a of calls) { Mmy[a] = {}; for (const kk of ks) Mmy[a][kk] = cost08(byName(arsenal, skName(a)), skH(a), s, arsenal, tab, look, pureSit(kk), true)[0]; }
      const cmy = {}; for (const a of calls) cmy[a] = psum(ks.map((kk) => sgTab[kk] * Mmy[a][kk]));
      let best = Infinity; for (const a of calls) if (cmy[a] < best) best = cmy[a];
      const delta = 0.010 * runScale(s.level);
      const keep = calls.filter((a) => cmy[a] - best <= delta);
      const M2 = {};
      for (const a of keep) M2[a] = (s.balls === 3 || !lookValue) ? Mmy[a] : M[a];
      M = M2;
    }
    const [pi, sg, res] = solveSitGame(M, ks, s, temp, s.b_h, s.usage_by_call);
    const full = {}; for (const a in M) full[a] = psum(ks.map((kk) => sg[kk] * M[a][kk]));
    return [pi, sg, full, res, M];
  }
  function callV08(arsenal, s, opts = {}) {
    checkInputs(arsenal, s);
    const rng = opts.rng || Math.random;
    let s_ = s;
    if (FLAGS.objective_win && !s_.win && s_.home !== null && s_.home !== undefined) s_ = replace(s_, { win: winConstants(s_) });
    const tab = opts.tab || solveTable(arsenal, replace(s_, { balls: 0, strikes: 0, last: null }));
    const [pi, sg, full, res, M] = rootCall(arsenal, s_, tab, opts.exclude);
    const pPitch = {};
    for (const a in pi) pPitch[skName(a)] = (pPitch[skName(a)] ?? 0.0) + pi[a];
    const keepN = new Set(Object.keys(pPitch).filter((n) => pPitch[n] > 0.005));
    let dist = [];
    for (const a in pi) if (keepN.has(skName(a)) && pi[a] > 0) dist.push({ prob: pi[a], cost: full[a], pitch: byName(arsenal, skName(a)), quad: skH(a) });
    const t = psum(dist.map((d) => d.prob));
    dist = dist.map((d) => Object.assign(d, { prob: d.prob / t }));
    dist.sort((a, b) => b.prob - a.prob);
    const r = rng();
    let acc = 0.0, pick = dist[dist.length - 1];
    for (const d of dist) { acc += d.prob; if (r <= acc) { pick = d; break; } }
    let best = Infinity; for (const a in full) if (full[a] < best) best = full[a];
    return { pick, dist, best, tab, info: { sigma: sg, residual: res, M, s: s_ } };
  }
  function rootCosts(arsenal, s, tab, sigma) {
    const ks = sitOptions(arsenal), sg = sigma || tab.sigma[cntKey(s.balls, s.strikes)], look = s.look || tab.h0, out = {};
    for (const a of allowedCalls(arsenal, s)) out[a] = psum(ks.filter((k) => sg[k] > 1e-4).map((k) => sg[k] * cost08(byName(arsenal, skName(a)), skH(a), s, arsenal, tab, look, pureSit(k))[0]));
    return out;
  }
  function frozenInputs(arsenal, s) {
    const conf = {}, wild = {};
    for (const x of arsenal) { conf[x.name] = x.conf; wild[x.name] = wildToday(x, s); }
    return { conf, wild, ump: s.ump_u, names: arsenal.map((x) => x.name).join("|") };
  }
  function needsResolve(frozen, arsenal, s) {
    if (!frozen || frozen.names !== arsenal.map((x) => x.name).join("|")) return true;
    if (arsenal.some((x) => Math.abs(x.conf - frozen.conf[x.name]) > 0.10)) return true;
    if (arsenal.some((x) => Math.abs(wildToday(x, s) - frozen.wild[x.name]) > 0.10)) return true;
    return Math.abs(s.ump_u - frozen.ump) > 0.20;
  }
  function leanBh(arsenal, s, fooled = [], eta = 0.0) {   // 2.5
    const out = {};
    for (const key of sitOptions(arsenal)) {
      const p = byName(arsenal, skName(key)), c = p.kind === "FB" ? "FB" : "OS";
      let v = 0.0;
      if (eta && s.hitter_damage && c in s.hitter_damage) { const [d, nn] = s.hitter_damage[c]; v += eta * d * nn / (nn + 10); }
      v += psum(fooled.filter((fc) => fc !== c).map(() => Math.log(1.3)));
      if (v) out[key] = v;
    }
    return out;
  }

  // ---------------------------------------------------------------- 7.1-7.2 win expectancy, 7.7 walk suggestion
  const WE_LEVEL = { travel: "hs", college: "college_d1" };
  const sched = (s) => s.sched_innings || ((s.level === "hs" || s.level === "travel") ? 7 : 9);
  const bitsOf = (b) => (b[0] ? 1 : 0) | (b[1] ? 2 : 0) | (b[2] ? 4 : 0);
  function weTab(level, N, xr) { return WE ? WE[(WE_LEVEL[level] || level) + "|" + N + "|" + (xr ? 1 : 0)] : null; }
  function wePitch(ctx, o, bases, margin, field) {
    const N = sched(ctx), t = weTab(ctx.level, N, ctx.extras_runner);
    const i = Math.min(Math.max(1, ctx.inning), N + 1);
    const half = t.tab[i + (ctx.home ? "t" : "b")];
    const mHome = ctx.home ? margin : -margin;
    const j = Math.max(-15, Math.min(15, mHome)) + 15;
    if (field === "L") return half.L[Math.min(o, 2) + "" + bitsOf(bases)][j];
    const v = o >= 3 ? half.E[j] : half.W[o + "" + bitsOf(bases)][j];
    return ctx.home ? v : 1.0 - v;
  }
  function winConstants(s) {
    if (s.home === null || s.home === undefined || !weTab(s.level, sched(s), s.extras_runner)) return null;
    const ctx = { level: s.level, inning: s.inning, home: s.home, sched_innings: s.sched_innings, extras_runner: s.extras_runner };
    const li = wePitch(ctx, s.outs, s.bases, s.margin, "L");
    const we0 = wePitch(ctx, s.outs, s.bases, s.margin);
    const m0 = Math.max(0.005, we0 - wePitch(ctx, s.outs, s.bases, s.margin - 1));
    return { omega: Math.min(1.0, Math.max(0.0, li - 1)), WE0: we0, m0, margin0: s.margin, LI: li, ctx };
  }
  function walkSuggestion(arsenal, s, tab) {
    const [b1, b2, b3] = s.bases, r_ = (b1 && b2 && b3) ? 1 : 0;
    const vWalk = vEnd(s, s.outs, [true, b1 || b2, b3 || (b1 && b2)], r_);
    const vPa = tabValue(tab, 0, 0, tab.h0);
    return [vWalk < vPa - 0.010 * runScale(s.level), vWalk, vPa];
  }

  // ---------------------------------------------------------------- 7.5 umpire, 8.2 grades (learners, A4)
  function takeStats(p, q, s, arsenal, sit) {
    const zo = {}, P = outcomeProbs(p, q, s, arsenal, null, null, sit, zo);
    const den = P.cstrike + P.ball + P.wp_ball + P.hbp;
    const pi = den > 0 ? P.cstrike / den : 0.0;
    const vals = ZONES.filter((z) => z in zo).map((z) => zo[z]);
    const tw = psum(vals.map((v) => v.L * (1 - v.S)));
    const d = tw > 0 ? psum(vals.filter((v) => v.cz).map((v) => v.L * (1 - v.S) * v.C * (1 - v.C))) / tw : 0.0;
    return [pi, d];
  }
  function mapLogitShift(obs, x0, priorMean, priorInfo, lo, hi, iters = 20) {
    const o = obs.filter(([, p_, d]) => p_ > 0 && p_ < 1 && d !== 0).map(([y, p_, d]) => [y, p_, d / (p_ * (1 - p_))]);
    let x = x0;
    for (let it = 0; it < iters; it++) {
      let sc = -priorInfo * (x - priorMean), inf = priorInfo;
      for (const [y, p_, a] of o) { const pp = sig(logit(p_) + a * (x - x0)); sc += (y - pp) * a; inf += pp * (1 - pp) * a * a; }
      if (inf <= 0) break;
      const step = sc / inf;
      x = Math.max(lo, Math.min(hi, x + step));
      if (Math.abs(step) < 1e-6) break;
    }
    return x;
  }
  function umpEstimate(takes, level, u0 = 0.0, a0 = 20.0) {
    const ib = (SIM.I_BAR_UMP || {})[level] ?? 0.05;
    if (!takes.length) return u0;
    return mapLogitShift(takes, u0, u0, a0 * ib, -1.5, 1.5);
  }
  function gradeStats(p, q, s, arsenal, sit, grades) {
    const out = {};
    for (const g of ["c", "w", "d"]) {
      const gr = Object.assign({}, grades || {}); gr[g] = 3;
      const zo = {}, prev = FLAGS.hitter_grades;
      FLAGS.hitter_grades = true;
      try { outcomeProbs(p, q, replace(s, { grades: gr }), arsenal, null, null, sit, zo); } finally { FLAGS.hitter_grades = prev; }
      const zs = ZONES.filter((z) => z in zo), vals = zs.map((z) => zo[z]);
      const sw = psum(vals.map((v) => v.L * v.S));
      const bipw = vals.map((v) => v.L * v.S * (1 - v.W) * (1 - v.F)), bip = psum(bipw);
      if (g === "c" && sw > 0) {
        const pw = psum(vals.map((v) => v.L * v.S * v.W)) / sw;
        out.c = [pw, -gval("g_c", s.level) * psum(vals.map((v) => v.L * v.S / sw * v.W * (1 - v.W)))];
      } else if (g === "w" && bip > 0) {
        const ph = psum(vals.map((v, i) => bipw[i] * v.H)) / bip;
        out.w = [ph, gval("g_w", s.level) * psum(vals.map((v, i) => bipw[i] / bip * v.H * (1 - v.H)))];
      } else if (g === "d") out.d = [sw, -gval("g_d", s.level) * psum(vals.filter((v) => v.offz).map((v) => v.L * v.S * (1 - v.S)))];
    }
    return out;
  }
  function gradeEstimate(obs, gCoach, I0, gPrev = null, nPitches = null) {
    const est = mapLogitShift(obs, 3.0, gCoach, I0, 1.0, 5.0);
    if ((nPitches !== null ? nPitches : obs.length) < 30) return [gCoach, est, false];
    if (Math.abs(est - gCoach) > 1.0) return [gPrev !== null ? gPrev : gCoach, est, true];
    const base = gPrev !== null ? gPrev : gCoach;
    return [Math.max(base - 0.5, Math.min(base + 0.5, est)), est, false];
  }

  // ---------------------------------------------------------------- 9 "why" line
  const WHY_PARAMS = { sit: ["sit_tW", "sit_hW", "sit_tH", "sit_hH", "sit_tS", "sit_hS"], timing: ["beta_T", "gamma_T"],
    "eye level": ["beta_E", "beta_E_S"], tunneling: ["beta_tun"], repeat: ["rep_whiff_same", "rep_whiff_other", "rep_same_spot"],
    familiarity: ["phi_FB", "phi_OS"] };
  function rootCostPair(arsenal, s, tab, a, b, sigma, myopic) {
    const look = s.look || tab.h0, ks = sitOptions(arsenal);
    const c = (x) => psum(ks.filter((k) => sigma[k] > 1e-4).map((k) => sigma[k] * cost08(byName(arsenal, skName(x)), skH(x), s, arsenal, tab, look, pureSit(k), myopic)[0]));
    return [c(a), c(b)];
  }
  function whyLine(arsenal, s, tab, pick, info) {
    const M = info.M, sigma = info.sigma, a = ck(pick.pitch.name, pick.quad);
    const full = {}; for (const x in M) full[x] = psum(Object.keys(M[x]).map((k) => sigma[k] * M[x][k]));
    const others = Object.keys(full).filter((x) => x !== a);
    if (!others.length) return ["Only call allowed here", {}, null];
    let b = others[0]; for (const x of others) if (full[x] < full[b]) b = x;
    const base = full[a] - full[b], deltas = {};
    for (const term in WHY_PARAMS) {
      const saved = {}; for (const n of WHY_PARAMS[term]) saved[n] = P08[n];
      let ca, cb;
      try { for (const n of WHY_PARAMS[term]) P08[n] = 0.0; [ca, cb] = rootCostPair(arsenal, s, tab, a, b, sigma); } finally { Object.assign(P08, saved); }
      deltas[term] = base - (ca - cb);
    }
    let [ca, cb] = rootCostPair(arsenal, s, tab, a, b, sigma, true);
    deltas["look value"] = base - (ca - cb);
    for (const [term, sOff] of [["situation", replace(s, { win: null })], ["umpire", replace(s, { ump_u: 0.0 })],
      ["running game", replace(s, { steal: null })], ["grades", replace(s, { grades: null })]]) {
      [ca, cb] = rootCostPair(arsenal, sOff, tab, a, b, sigma);
      deltas[term] = base - (ca - cb);
    }
    let term = null; for (const t in deltas) if (term === null || deltas[t] < deltas[term]) term = t;
    if (deltas[term] >= -1e-6) return ["Best call on its own merits", deltas, b];
    const p = pick.pitch, q = pick.quad, look = s.look || tab.h0;
    let line;
    if (term === "timing") {
      const vs = psum(Object.keys(sigma).map((k) => sigma[k] * speedToday(byName(arsenal, skName(k)), s)));
      const vt = (1 - P08.alpha) * look[0] + P08.alpha * vs, vp = speedToday(p, s) + 0.5 * EV_ADJ[q];
      line = `He's timed for ${vt.toFixed(0)} mph; this plays ${Math.abs(vt - vp).toFixed(0)} mph ${vt > vp ? "slower" : "faster"}`;
    } else if (term === "look value") {
      let nxt = null; for (const x in full) if (skName(x) !== p.name && (nxt === null || full[x] < full[nxt])) nxt = x;
      if (nxt === null) nxt = b;
      line = `Sets up the ${skName(nxt).toLowerCase()} ${skH(nxt)}`;
    } else if (term === "eye level") line = s.last ? `Changes his eye level after the ${s.last[0].toLowerCase()}` : "Changes his eye level";
    else if (term === "familiarity") {
      const c_ = isOffspeed(byName(arsenal, skName(b)).kind) ? "OS" : "FB";
      line = `He's seen the ${skName(b).toLowerCase()} ${(s.familiar || {})[c_] || 0} times today`;
    } else if (term === "sit") {
      const byT = {}, byH = {};
      for (const k of Object.keys(sigma)) { byT[skName(k)] = (byT[skName(k)] ?? 0.0) + sigma[k]; byH[skH(k)] = (byH[skH(k)] ?? 0.0) + sigma[k]; }
      let topT = null; for (const n in byT) if (topT === null || byT[n] > byT[topT]) topT = n;
      if (topT !== p.name) line = `He's sitting ${topT.toLowerCase()} (${Math.round(100 * byT[topT])}%)`;
      else {
        let topH = null; for (const j in byH) if (!(q.startsWith(j) || (j === "middle" && q === "middle")) && (topH === null || byH[j] > byH[topH])) topH = j;
        line = `He's looking ${topH} (${Math.round(100 * byH[topH])}%)`;
      }
    } else if (term === "situation") line = (s.bases[2] && s.win && Math.abs(s.margin) <= 1) ? "Tying run on third: need a strikeout or a ground ball"
      : s.margin > 0 ? "Game situation: protect the lead" : "Game situation: keep it close";
    else if (term === "umpire") line = `Today's umpire is calling ${s.ump_u > 0 ? "more" : "fewer"} strikes than usual`;
    else if (term === "running game") line = "Runner may go: a pitch he can throw on";
    else if (term === "grades") line = "Matches this hitter's scouting grades";
    else if (term === "repeat") line = "Back to what he just missed";
    else line = "Tunnels off the last pitch";
    return [line, deltas, b];
  }
  const v08 = { psum, sitOptions, sitPrior, sitShift, speedToday, timingB, pairTerms, yTarget, countKappa, vEnd, typeMix, inPlayValueTyped,
    inPlayValueEv, sitPayoff, sitResponse, exploitability, temperature, windows, policyFromCosts, solveSitGame, allowedCalls, lookUpdate,
    solveTable, tabValue, rootCall, callV08, rootCosts, cost08, frozenInputs, needsResolve, leanBh, winConstants, wePitch, walkSuggestion,
    takeStats, umpEstimate, gradeStats, gradeEstimate, mapLogitShift, whyLine,
    get P08() { return P08; }, get SIM() { return SIM; }, setGradesOverride: (g) => { GRADES_OVERRIDE = g; } };

  const api = { VERSION, dataVersion, init, FLAGS, FLAGS_V07, FLAGS_V08, setFlags, Pitch, Situation, QUADS, targets, COUNTS, landing, expectation, movement, tunnelScore, pairing,
    outcomeProbs, cost, mixedPolicy, atBatValues, callMixed, gradeCall, candidates, stakesFactor, countStakes,
    runScale, re, updateConfidence, effective, TRAIT_KEYS, regressConfidence, pitcherStatus, isOffspeed, isBigSpot, landingEstimate, wildToday,
    v08, callV08, solveTable, whyLine };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PitchEngine = api;
})(typeof window !== "undefined" ? window : this);
