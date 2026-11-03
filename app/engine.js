/*
 * Pitch Caller engine v0.6e, JavaScript port of engine.py (same math, same order of operations).
 * Cost(p,q|s) = sum_e P(e|p,q,s) * [R(e) + V(s'_e)]; calls drawn at a game-theory balance point.
 * Data tables (run values, outcome fit) come from engine_data.json, exported from the Python engine.
 * Works in the browser (window.PitchEngine) and in Node (module.exports) for parity tests.
 */
(function (root) {
  "use strict";
  let D = null;                       // tables, set by init(data)

  const QUADS = ["up-in", "up-away", "down-in", "down-away", "chase", "middle"];
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

  function init(data) { D = data; }

  // ---------------------------------------------------------------- objects
  function Pitch(o) {
    const p = Object.assign({ shape: "", velo: 0, base_conf: -1, ivb: null, hb: null, slot: "three-quarter",
      height_ft: 6.1, release_offset_in: [0, 0] }, o);
    if (p.base_conf < 0) p.base_conf = p.conf;
    return p;
  }
  function Situation(o) {
    return Object.assign({ inning: 1, margin: 0, pitch_count: 0, batters_faced: 0, level: "college_d3",
      same_side: true, last: null, hitter_seen: {}, usage_this_count: {}, timing: {}, hitter_damage: {},
      catcher_block: 3, landing_today: {}, wild_true: {} }, o);
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
    const center = LAND_CENTER[isOffspeed(p.kind) ? "OS" : "FB"];
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
  function landing(p, q, s) {
    const A = D.OUTCOME_ADJ[s.level];
    const eff = Math.min(5, Math.max(1, p.command + A.cmd + 2.0 * (p.conf - 0.6)));
    const d = eff - 3;
    let z;
    if (q === "chase") z = { heart: 0.05 - 0.01 * d, edge: 0.24, off: 0.57 + 0.04 * d, noncomp: 0.14 - 0.03 * d };
    else if (q === "middle") z = { heart: 0.50 + 0.03 * d, edge: 0.30, off: 0.13 - 0.02 * d, noncomp: 0.07 - 0.01 * d };
    else z = { heart: 0.26 - 0.03 * d, edge: 0.42 + 0.08 * d, off: 0.22 - 0.03 * d, noncomp: 0.10 - 0.02 * d };
    if (isOffspeed(p.kind)) { z.edge -= 0.12; z.off += 0.07; z.noncomp += 0.05; }
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
  function outcomeProbs(p, q, s, arsenal, policy) {
    const L = D.LEVEL[s.level], A = D.OUTCOME_ADJ[s.level];
    const big = isBigSpot(s);
    const cL = L.cL * (big ? 1.5 : 1.0);
    const bT = 0.4 * (big ? 0.5 : 1.0);
    const [E, neutral] = expectation(p, arsenal, s, policy);
    const T = pairing(p, q, s, arsenal);
    const f = shapeFit(p, q, s);
    const dmg = damage(p, q, s);
    const tau = (isOffspeed(p.kind) ? s.timing.OS : s.timing.FB) || 0.0;
    const tauEff = p.kind === "FB" ? tau : -tau;
    const hittersCount = s.balls > s.strikes && s.strikes < 2;
    const land = landing(p, q, s);
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
      const S = S0[z] > 0 ? sig(sl) : 0;
      const C = (z === "edge" || z === "off") ? sig(logit(C0[z]) + A.cs) : C0[z];
      let wl = logit(W0[z]) + KIND_W[p.kind] + 0.25 * (p.grade - 3) + cL * 1.5 * (p.conf - 0.6);
      wl += L.hL * (-1.5 * (E - neutral) + 0.6 * tauEff - 0.4 * DMG_SCALE * dmg);
      wl += bT * T + 0.25 * f;
      wl += wz * A.wz + (1 - wz) * A.wo;
      const W = sig(wl);
      const F = sig(logit(F0[z]) + (s.strikes === 2 ? 0.3 : 0));
      let hl = -0.25 * (p.grade - 3) - cL * 0.5 * (p.conf - 0.6) + L.hL * (1.0 * (E - neutral) + 0.8 * DMG_SCALE * dmg) - 0.3 * f;
      hl += 0.012 * s.batters_faced;
      hl -= L.hL * 0.5 * tauEff;   // v0.6e: off-time swings make weaker contact too
      if (p.kind === "CH" && s.same_side) hl += 0.2;
      if (z === "heart" && isOffspeed(p.kind)) hl += 0.5;
      if (isOffspeed(p.kind) && (q.startsWith("up") || q === "middle")) hl += 0.4;
      const [weak, solid, hard] = Q0[z];
      const hard2 = sig(logit(hard) + hl);
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
  function cost(p, q, s, arsenal, policy, cv) {
    const P = outcomeProbs(p, q, s, arsenal, policy);
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
    for (const c of ["weak", "solid", "hard"]) v += P[c] * inPlayValue(c, o, B, L);
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
      const bestBy = cands.map((p) => [p.name, Math.min(...QUADS.map((q) => costs.get(ck(p.name, q))))]);
      const pp = new Map(softmax(bestBy, temp, window));
      const nw = {}; for (const x of arsenal) nw[x.name] = pp.get(x.name) || 0.0;
      if (policy === null) policy = nw;
      else { const m = {}; for (const kk in nw) m[kk] = 0.5 * policy[kk] + 0.5 * nw[kk]; policy = m; }
    }
    return [policy, costs, temp];
  }
  const minCost = (costs) => Math.min(...costs.values());

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
        for (const name in policy) {
          const pp = policy[name];
          if (pp <= 0) continue;
          let loc = softmax(QUADS.map((q) => [q, costs.get(ck(name, q))]), temp,
            LOC_WINDOW * runScale(s.level) * Math.min(1.0, stakesFactor(b, k, s.level)), minCost(costs));
          if (!loc.length) {
            let bq = QUADS[0]; for (const q of QUADS) if (costs.get(ck(name, q)) < costs.get(ck(name, bq))) bq = q;
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

  function callMixed(arsenal, s, opts = {}) {
    const T = opts.T ?? 0.010, window = opts.window ?? 0.030, forced = opts.forced ?? null, iters = opts.iters ?? 8;
    const rng = opts.rng || Math.random, atBat = opts.atBat ?? true;
    const cv = atBat ? atBatValues(arsenal, s, T, window)[1] : null;
    const [policy, costs, temp] = mixedPolicy(arsenal, s, T, window, forced, iters, cv);
    let pPitch = Object.entries(policy).filter(([, v]) => v > 0.005);
    let t = 0; for (const [, v] of pPitch) t += v;
    pPitch = pPitch.map(([kk, v]) => [kk, v / t]);
    const dist = [];
    const overall = minCost(costs);
    for (const [name, pp] of pPitch) {
      let loc = softmax(QUADS.map((q) => [q, costs.get(ck(name, q))]), temp,
        LOC_WINDOW * runScale(s.level) * Math.min(1.0, stakesFactor(s.balls, s.strikes, s.level)), overall);
      if (!loc.length) {
        let bq = QUADS[0]; for (const q of QUADS) if (costs.get(ck(name, q)) < costs.get(ck(name, bq))) bq = q;
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
    const [policy, costs] = mixedPolicy(arsenal, s);
    const p = arsenal.find((x) => x.name === pitchName);
    const cHuman = costs.has(ck(pitchName, quad)) ? costs.get(ck(pitchName, quad)) : cost(p, quad, s, arsenal, policy)[0];
    const best = minCost(costs);
    let prob = 0; for (const d of dist) if (d.pitch.name === pitchName && d.quad === quad) prob += d.prob;
    return { call: pitchName + " " + quad, engine_prob: prob, runs_vs_best: cHuman - best,
      verdict: prob >= 0.02 ? "in the engine's mix" : (cHuman - best <= 0.03 * runScale(s.level) ? "close" : "costly"),
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

  const api = { init, Pitch, Situation, QUADS, COUNTS, landing, expectation, movement, tunnelScore, pairing,
    outcomeProbs, cost, mixedPolicy, atBatValues, callMixed, gradeCall, candidates, stakesFactor, countStakes,
    runScale, re, updateConfidence, regressConfidence, pitcherStatus, isOffspeed, isBigSpot, landingEstimate, wildToday };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PitchEngine = api;
})(typeof window !== "undefined" ? window : this);
