/*
 * Pitch Caller learner v2 (spec: docs/LEARNING_SPEC.md). Runs anywhere JavaScript runs: the server in production,
 * Node for tests, the browser until the server exists. Pure functions: events and records in, a profile out.
 *
 * For each pitch in a pitcher's arsenal it learns:
 *   talent     command and stuff, drifting slowly game to game (a Kalman filter over the engine's own likelihood,
 *              with change points that widen it), with a certainty
 *   traits     his situational effects and miss tendency (engine v0.7 TRAIT_KEYS), with certainties
 *   strike_rate his own expected strike rate, so tonight's in-game layer measures news against HIM
 *
 * Every game is replayed pitch by pitch: tonight's confidence and "landing today" are rebuilt for every candidate
 * value from the raw results, never read from what was frozen at the time (the leak found in review).
 * The profile then goes through serve(): caps, phase-ins and the coach's flags decide what the engine actually gets.
 */
(function (root) {
  "use strict";
  const VERSION = "2.1.0";
  const CFG = {
    priorSd: 0.7,               // how far a coach's grade is assumed to be off (measured later from data, spec 4.6)
    driftPerGame: 0.08,         // talent sd added per game
    driftPerDay: 0.004,         // and per day of gap (an off-season of ~150 days adds ~0.05)
    seasonGapDays: 60,          // a gap this long counts as a season boundary
    seasonJump: 0.3,            // extra sd at a season boundary
    changeJump: 1.0,            // extra sd at a change point (coach mark, shape change, kind change)
    effectSd: { side_cmd: 0.5, side_grade: 0.5, ahead_cmd: 0.4, behind_cmd: 0.4, stretch_cmd: 0.5, miss_heart: 0.4 },
    completeness: 0.9,          // contact / location detail used only from games logged at least this completely
    caps: { total: 1.0, step: 0.15, stepAfterChange: 0.5, changeGames: 5, phaseGames: 3,
      effectTotal: 0.5, effectStep: 0.1,
      // D6: each game moves the calls by what that game told the learner (how far it moved the estimate: its length and
      // how much it disagreed), never more than the step. A game he didn't throw the pitch in moves nothing.
      // OFF: tested against the flat step on 5 simulated worlds x 6 seasons (d6_test.js, decision rule fixed before the
      // run). Rerun after the code review fixed the scoreboard (it now serves with the after-change step, as in use) and
      // the first serve (one game's step, not every game's): worse pooled (+0.0030 surprise per pitch, se 0.0007) and
      // worst on wrong grades (+0.0094, se 0.0020); the earlier gain on short relief outings came from the first-serve
      // bug and is gone (+0.0028). The flat step stays.
      evidence: false, evidenceRef: 0.15 },
    flags: { gradeGap: 1.0, gradeZ: 2.5, stuffMinN: 400, cmdMinLoc: 150, changeWindow: 8, changeZ2: 9.21,
      starvedShare: 0.05, starvedGames: 5, scoreMinRows: 150, scoreMargin: 0.015, scoreWindow: 300, scoreZ: 1.645 },
  };
  // Traits the learner fits. Set by the trait gate (gate_test.js, gate_result.json, 12 seasons per trait). All six are
  // learnable on the calibrated engine, but with the real walk/strikeout link (v0.7b) command no longer buys strikeouts,
  // so situational command effects change the calls too little against the yardstick: none pass (spec 18). The full
  // list is ALL_TRAITS.
  const ALL_TRAITS = ["side_cmd", "side_grade", "ahead_cmd", "behind_cmd", "stretch_cmd", "miss_heart"];
  const ACTIVE_TRAITS = [];
  const DAY = 864e5;
  // D0: events are pitches or plays between pitches (a steal, a sub). Only pitches are learned from; a version 1 event has
  // no type and is a pitch.
  const isPitch = (ev) => !!ev && (ev.type === undefined || ev.type === null || ev.type === "pitch");
  const isOS = (k) => k === "SL" || k === "CB" || k === "CH";
  // D8: a blank or unreadable grade is "not graded": the level average (3 on the engine's scale), never 0
  const has = (v) => v !== "" && v !== undefined && v !== null && Number.isFinite(+v);
  // a coach's grade is 1 to 5; anything else (blank, 0 from an empty box, junk) is "not graded"
  const gradeOk = (v) => has(v) && +v >= 1 && +v <= 5;
  const coachValue = (pd, dim) => (pd && gradeOk(pd[dim]) ? +pd[dim] : 3);
  const graded = (pd, dim) => !!pd && gradeOk(pd[dim]);
  const clamp15 = (x) => Math.min(5, Math.max(1, x));

  // D1, D2: the coach's answer to a grade flag, per pitch and dimension.
  //   keep    "Keep mine": the calls use his number until he answers a new flag
  //   accept  "Accept": the learned value at that moment ("to") becomes the centre; it phases in over phaseGames games
  //           from what the calls had ("from"), then the usual ±total limit applies around it. A re-grade after he
  //           accepted replaces it (his new number is the centre again).
  function railsFor(pd, pitcher, dim) {
    const id = pd.id || pd.name, coach = coachValue(pd, dim);
    const st = pitcher && pitcher.flagState && pitcher.flagState[`${id}|${dim}`];
    let acc = pitcher && pitcher.accepted && pitcher.accepted[id] && pitcher.accepted[id][dim];
    if (acc && typeof acc === "number") acc = { ts: acc };
    const log = pd.gradeLog || [];
    if (acc && log.some((e, i) => i > 0 && (e.ts || 0) > (acc.ts || 0) && +e[dim] !== +log[i - 1][dim])) acc = null;
    // an accept holds while it's the latest answer, or he said "ask me later" to a flag that came after it. Any other
    // answer since (Keep mine) retired it, and a later "ask me later" doesn't bring it back.
    if (acc && st && st.how !== "accept" && !(st.how === "remind" && st.keepAccept)) acc = null;
    const keep = !!(st && st.how === "keep");
    // an accept saved before the review fix has no "to": it keeps its old meaning (follow what's learned, no limit)
    const legacy = !!(acc && !has(acc.to));
    const center = acc && !legacy ? clamp15(+acc.to) : coach;
    return { coach, center, keep, acc: keep ? null : acc, legacy };
  }
  // the phase-in of an accept: counted in steps the calls have taken (stored with what was served), not games played
  const phaseOf = (sv, dim, acc) => (sv && sv.phase && sv.phase[dim] && acc && sv.phase[dim].ts === acc.ts ? sv.phase[dim].k : 0);
  // D4: the last word on what the calls use, applied where the arsenal is built: never more than the limit from the
  // centre (his grade, or the value he accepted), and his own number when he said "Keep mine"
  function clampServed(pd, pitcher, sv) {
    const out = {}, T = CFG.caps.total;
    for (const dim of ["command", "grade"]) {
      const R = railsFor(pd, pitcher, dim), v = sv && has(sv[dim]) ? +sv[dim] : R.coach;
      let lo = R.center - T, hi = R.center + T;
      if (R.acc && R.legacy) { lo = 1; hi = 5; }
      else if (R.acc && phaseOf(sv, dim, R.acc) < CFG.caps.phaseGames) {
        // while an accept phases in, the calls are somewhere between where they were and the accepted value
        const from = has(R.acc.from) ? +R.acc.from : R.coach;
        lo = Math.min(from, lo); hi = Math.max(from, hi);
      }
      out[dim] = R.keep ? R.coach : r2(clamp15(Math.min(hi, Math.max(lo, v))));
    }
    return out;
  }

  // ---------------------------------------------------------------- small linear algebra
  function solve(A, b) {           // Gaussian elimination with pivoting; A square
    const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      if (Math.abs(M[c][c]) < 1e-12) return null;
      for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]; }
    }
    const x = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
    return x;
  }
  function inv(A) { const n = A.length; const cols = []; for (let j = 0; j < n; j++) { const e = Array(n).fill(0); e[j] = 1; cols.push(solve(A, e)); }
    if (cols.some((c) => !c)) return null; return A.map((_, i) => cols.map((c) => c[i])); }
  const madd = (A, B) => A.map((r, i) => r.map((x, j) => x + B[i][j]));
  const diag = (v) => v.map((x, i) => v.map((_, j) => (i === j ? x : 0)));
  // make a symmetric matrix positive definite enough to invert (2x2 and small k: clip by adding to the diagonal)
  function psd(H, floor = 1e-4) {
    const n = H.length, S = H.map((r, i) => r.map((x, j) => 0.5 * (x + H[j][i])));
    for (let tries = 0; tries < 30; tries++) {
      if (cholOk(S)) return S;
      const add = Math.max(floor, Math.abs(minDiag(S)) * 0.5 + floor * Math.pow(2, tries));
      for (let i = 0; i < n; i++) S[i][i] += add;
    }
    return diag(Array(n).fill(1));
  }
  const minDiag = (S) => Math.min(...S.map((r, i) => r[i]));
  function cholOk(A) { const n = A.length, L = A.map(() => Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (s <= 0) return false; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j]; }
    return true; }

  // MAP of f over x (k dims) by Newton with numeric derivatives and backtracking; returns { x, H (Hessian of f), f }
  function maximize(f, x0, opts = {}) {
    const h = opts.h || 0.04, lo = opts.lo || -Infinity, hi = opts.hi || Infinity, maxIt = opts.maxIt || 25;
    const k = x0.length, clamp = (v) => v.map((z) => Math.min(hi, Math.max(lo, z)));
    let x = clamp(x0.slice()), fx = f(x);
    let H = null;
    for (let it = 0; it < maxIt; it++) {
      const { g, Hm } = derivs(f, x, fx, h);
      H = Hm;
      const negH = Hm.map((r) => r.map((v) => -v));
      let step = solve(psd(negH), g);
      if (!step) step = g.map((v) => 0.05 * Math.sign(v));
      const mx = Math.max(...step.map(Math.abs)); if (mx > 0.6) step = step.map((v) => (v * 0.6) / mx);
      let t = 1, moved = false;
      for (let b = 0; b < 8; b++) { const xn = clamp(x.map((v, i) => v + t * step[i])), fn = f(xn); if (fn > fx) { x = xn; fx = fn; moved = true; break; } t /= 2; }
      if (!moved || t * Math.max(...step.map(Math.abs)) < 0.003) break;
    }
    if (!H) H = derivs(f, x, fx, h).Hm;
    return { x, H: derivs(f, x, fx, h).Hm, f: fx };
  }
  function derivs(f, x, fx, h) {
    const k = x.length, g = Array(k).fill(0), Hm = Array.from({ length: k }, () => Array(k).fill(0));
    const at = (d) => f(x.map((v, i) => v + (d[i] || 0)));
    const fp = [], fm = [];
    for (let i = 0; i < k; i++) { const e = Array(k).fill(0); e[i] = h; fp[i] = at(e); e[i] = -h; fm[i] = at(e); g[i] = (fp[i] - fm[i]) / (2 * h); Hm[i][i] = (fp[i] - 2 * fx + fm[i]) / (h * h); }
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { const e = Array(k).fill(0); e[i] = h; e[j] = h; const fpp = at(e); Hm[i][j] = Hm[j][i] = (fpp - fp[i] - fp[j] + fx) / (h * h); }
    return { g, Hm };
  }

  // ---------------------------------------------------------------- his expected strike rate
  // The average strike probability over a fixed grid of counts, targets, hitter sides and bases, shifted so a
  // grade-3, no-trait pitch lands exactly on the engine's default center. Same function on server and iPad.
  const COUNTS = [[0, 0], [1, 0], [0, 1], [2, 0], [1, 1], [0, 2], [3, 0], [2, 1], [1, 2], [3, 1], [2, 2], [3, 2]];
  const SR_REF = new Map();
  function gridStrike(E, p, level) {
    let s = 0, n = 0;
    for (const [b, k] of COUNTS) for (const q of E.QUADS) for (const ss of [true, false]) for (const bases of [[false, false, false], [true, false, false]]) {
      const sit = E.Situation({ balls: b, strikes: k, outs: 1, bases, level, same_side: ss, timing: {}, hitter_damage: {}, landing_today: {} });
      const P = E.outcomeProbs(p, q, sit, [p], null);
      s += 1 - P.ball - P.wp_ball - P.hbp; n++;
    }
    return s / n;
  }
  // Fast version for the learner's inner loop: a table over (command, stuff) with bilinear interpolation, plus a
  // straight-line correction for traits whose slope depends on command. It's only the centering point for tonight's wildness, so small table error
  // can't move anything; strikeRateFast is checked against strikeRate in worlds_test.js (check 13).
  const SR_TABLE = new Map(), SR_STEP = 0.25, SR_LO = 0, SR_N = 25, SL_STEP = 0.5, SL_N = 13;   // 0..6 in steps of 0.25 (slopes: 0.5)
  function srTable(E, spec, level) {
    const key = spec.kind + "|" + (spec.shape || "") + "|" + (+spec.velo || 0) + "|" + level;
    if (SR_TABLE.has(key)) return SR_TABLE.get(key);
    const T = [];
    for (let i = 0; i < SR_N; i++) { T.push([]); for (let j = 0; j < SR_N; j++) T[i].push(strikeRate(E, Object.assign({}, spec, { command: SR_LO + i * SR_STEP, grade: SR_LO + j * SR_STEP, traits: null }), level)); }
    // trait slopes by command (every 0.5): with command spread to real pitchers (spec 17) the strike rate bends with
    // command, so one slope measured at command 3 is off by up to 0.016 for a command-1 pitcher
    const slope = {};
    for (const k of ALL_TRAITS) {
      slope[k] = [];
      for (let i = 0; i < SL_N; i++) {
        const c = SR_LO + i * SL_STEP, at = (x) => strikeRate(E, Object.assign({}, spec, { command: c, grade: 3, traits: { [k]: x } }), level);
        slope[k].push((at(0.5) - at(-0.5)) / 1.0);   // central difference: traits can be either sign
      }
    }
    const out = { T, slope }; SR_TABLE.set(key, out); return out;
  }
  function strikeRateFast(E, spec, level) {
    const { T, slope } = srTable(E, spec, level);
    const ci = Math.min(SR_N - 1.0001, Math.max(0, (spec.command - SR_LO) / SR_STEP)), gj = Math.min(SR_N - 1.0001, Math.max(0, (spec.grade - SR_LO) / SR_STEP));
    const i = Math.floor(ci), j = Math.floor(gj), a = ci - i, b = gj - j;
    let v = (1 - a) * (1 - b) * T[i][j] + a * (1 - b) * T[i + 1][j] + (1 - a) * b * T[i][j + 1] + a * b * T[i + 1][j + 1];
    const si = Math.min(SL_N - 1.0001, Math.max(0, (spec.command - SR_LO) / SL_STEP)), sk = Math.floor(si), sa = si - sk;
    for (const [k, x] of Object.entries(spec.traits || {})) if (slope[k]) v += ((1 - sa) * slope[k][sk] + sa * slope[k][sk + 1]) * x;
    return Math.min(0.9, Math.max(0.2, v));
  }
  // v1.0 Step 3: his expected strike rate is the engine's own (gridStrike), no longer re-centered on the deleted
  // LAND_CENTER (served rates drop ~0.1, to what the model actually expects). strikeRef is the same rate for an average
  // (3/3) pitch of the kind at his level; the engine scales confidence news by the two (engine.py update_confidence).
  function strikeRef(E, spec, level) {
    const key = spec.kind + "|" + (spec.shape || "") + "|" + level;
    if (!SR_REF.has(key)) {
      const base = { name: spec.name || "x", kind: spec.kind, shape: spec.shape || "", velo: +spec.velo || 0, conf: 0.6, base_conf: 0.6 };
      SR_REF.set(key, gridStrike(E, E.Pitch(Object.assign({}, base, { grade: 3, command: 3 })), level));
    }
    return Math.min(0.9, Math.max(0.2, SR_REF.get(key)));
  }
  function strikeRate(E, spec, level) {
    const base = { name: spec.name || "x", kind: spec.kind, shape: spec.shape || "", velo: +spec.velo || 0, conf: 0.6, base_conf: 0.6 };
    const mine = gridStrike(E, E.Pitch(Object.assign({}, base, { grade: spec.grade, command: spec.command, traits: spec.traits || null })), level);
    return Math.min(0.9, Math.max(0.2, mine));
  }

  // ---------------------------------------------------------------- preparing the raw data
  function category(ev) {
    switch (ev.res) {
      case "ball": return "ball"; case "hbp": return "hbp"; case "cstrike": return "cstrike"; case "whiff": return "whiff"; case "foul": return "foul";
      case "play": return ev.contact || "bip"; default: return null;
    }
  }
  const prob = (P, cat) => (cat === "ball" ? P.ball + P.wp_ball : cat === "bip" ? P.weak + P.solid + P.hard : P[cat]);
  const LOCS = ["heart", "edge", "off", "noncomp"];
  // which pitches the fit may use (spec 5.4): engine calls only; coach calls and re-calls after a shake-off are scored apart
  function usable(ev) {
    if (ev.legacy || ev.deletedAt || !isPitch(ev) || !ev.sit || !ev.ars || !category(ev)) return false;
    if (ev.choice) return ev.choice === "engine" || ev.choice === "variety";
    return !ev.coach && !(ev.shaken && ev.shaken.length);
  }
  const thrownName = (ev) => (ev.thrown && ev.thrown !== ev.pitchName ? ev.thrown : ev.pitchName);

  // events of one pitcher -> games in order, each with every pitch (for in-game replay) and logging completeness
  function gamesOf(events) {
    const by = new Map();
    for (const ev of events) { if (ev.deletedAt || ev.legacy || !isPitch(ev)) continue; const k = ev.gameId || "g?"; if (!by.has(k)) by.set(k, []); by.get(k).push(ev); }
    const games = [...by.entries()].map(([id, evs]) => {
      evs.sort((a, b) => (a.n || 0) - (b.n || 0));
      const plays = evs.filter((e) => e.res === "play"), ts = Math.min(...evs.map((e) => e.ts || 0));
      return { id, ts, evs, contactOk: !plays.length || plays.filter((e) => e.contact).length / plays.length >= CFG.completeness,
        locOk: evs.filter((e) => e.loc).length / evs.length >= CFG.completeness };
    });
    games.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
    return games;
  }

  // one pitch's rows in one game, plus the script that rebuilds its confidence through the game
  function pitchGame(game, pd, nameAt) {
    const rows = [], script = [];
    let base = null, regs = 0;
    const logged = game.evs.some((e) => e.regs !== undefined);   // the app logs how many between-hitter drifts came before each pitch
    for (const ev of game.evs) {
      const nm = nameAt(ev);
      if (logged && ev.regs !== undefined) { for (; regs < ev.regs; regs++) script.push({ op: "regress" }); }
      if (ev.shaken) for (const [sn] of ev.shaken) if (sn === nm) script.push({ op: "event", ev: "shakeoff" });
      const crossed = ev.thrown && ev.thrown !== ev.pitchName;   // a cross-up: scored as the pitch actually thrown
      const isMine = crossed ? ev.thrown === nm : (pd.id && ev.pitchId ? ev.pitchId === pd.id : ev.pitchName === nm);
      if (isMine) {
        const snap = ev.ars.find((x) => x.name === nm);
        if (base === null && snap) base = snap.base_conf;
        if (usable(ev) && snap) {
          const cat = category(ev);
          rows.push({ idx: script.length, name: nm, ars: ev.ars, quad: ev.quad,
            cat: cat === "weak" || cat === "solid" || cat === "hard" ? (game.contactOk ? cat : "bip") : cat,
            loc: game.locOk && LOCS.includes(ev.loc) ? ev.loc : null,
            sit: Object.assign({}, ev.sit, { hitter_damage: {}, timing: {} }), ts: ev.ts || game.ts, gameId: game.id,
            same: !!ev.sit.same_side, count: ev.sit.strikes > ev.sit.balls ? "ahead" : ev.sit.balls > ev.sit.strikes ? "behind" : "even",
            stretch: !!(ev.sit.bases && (ev.sit.bases[0] || ev.sit.bases[1] || ev.sit.bases[2])) });
        }
        script.push({ op: "mark" });
        const r = ev.res, hardish = r === "play" && (ev.contact === "hard" || (!ev.contact && ["2B", "3B", "HR"].includes(ev.out)));
        // v1.0 Step 3: a ball on a chase target is no debit unless it went way off, and an HBP is no "ball" (the engine's rule)
        const ball = r === "ball" && !(ev.quad === "chase" && ev.loc !== "noncomp");   // = engine ballConfEvent
        const ce = ball ? "ball" : r === "cstrike" ? "cstrike" : r === "whiff" ? "whiff" : hardish ? "hard" : null;
        if (ce) script.push({ op: "event", ev: ce });
      }
      if (ev.end && !logged) script.push({ op: "regress" });   // older logs and simulations: one drift after each hitter
    }
    return { rows, script, base: base === null ? 0.7 : base };
  }
  // rebuild his confidence in this pitch before each of his pitches tonight, for a given strike rate
  function confPath(E, kind, base, script, sr, ref) {
    const p = E.Pitch({ name: "x", kind, grade: 3, command: 3, conf: base, base_conf: base, strike_rate: sr, strike_ref: sr === null ? null : ref });
    const out = [];
    for (const st of script) {
      if (st.op === "mark") out.push(p.conf);
      else if (st.op === "event") E.updateConfidence(p, st.ev);
      else E.regressConfidence(p);
    }
    return out;   // indexed by the k-th "mark"
  }

  // ---------------------------------------------------------------- the likelihood of one pitch's games
  // theta: { command, grade, traits{} }. games: [{ rows, script, base, kind, w }]. Rows carry the raw situation.
  function loglikGames(E, games, theta, level, srCache, opts = {}) {
    const key = theta.command.toFixed(4) + "|" + theta.grade.toFixed(4) + "|" + JSON.stringify(theta.traits || {});
    let ll = 0;
    for (const G of games) {
      if (!G.rows.length) continue;
      const shapeSpec = G.spec;
      let sr = null;
      if (!opts.noStrikeRate) {
        const k2 = key + "|" + shapeSpec.kind + shapeSpec.shape + "|" + level;
        if (!srCache.has(k2)) srCache.set(k2, strikeRateFast(E, Object.assign({}, shapeSpec, { command: theta.command, grade: theta.grade, traits: theta.traits }), level));
        sr = srCache.get(k2);
      }
      const path = confPath(E, shapeSpec.kind, G.base, G.script, sr, sr === null ? null : strikeRef(E, shapeSpec, level));
      // marks are in script order; map row -> its mark number
      if (!G._markAt) { let mark = 0; G._markAt = []; for (let i = 0; i < G.script.length; i++) if (G.script[i].op === "mark") G._markAt[i] = mark++; }
      const markAt = G._markAt;
      for (const r of G.rows) {
        if (!r._S) {   // built once per row: the situation and the other pitches don't depend on theta
          r._S = E.Situation(r.sit);
          r._snap = r.ars.find((x) => x.name === r.name);
          r._others = r.ars.map((x) => (x.name === r.name ? null : E.Pitch(Object.assign({}, x))));
        }
        const p = E.Pitch(Object.assign({}, r._snap, { command: theta.command, grade: theta.grade, traits: theta.traits, strike_rate: sr,
          strike_ref: sr === null ? null : strikeRef(E, shapeSpec, level),
          conf: path[markAt[r.idx]] ?? G.base, base_conf: G.base }));
        const arsP = r._others.map((x) => x || p);
        const s = r._S;
        let pr;
        if (r.loc) { const bz = {}; E.outcomeProbs(p, r.quad, s, arsP, null, bz); const z = bz[r.loc]; pr = z ? z.land * prob(z, r.cat) : 0; }
        else pr = prob(E.outcomeProbs(p, r.quad, s, arsP, null), r.cat);
        ll += (G.w ?? 1) * Math.log(Math.max(1e-9, pr));
      }
    }
    return ll;
  }

  // ---------------------------------------------------------------- talent filter (Kalman over games, Laplace updates)
  function filterTalent(E, games, prior, effects, level, changeAt, opts = {}) {
    let m = [prior.command, prior.grade], P = diag([CFG.priorSd ** 2, CFG.priorSd ** 2]);
    const srCache = new Map(), out = [];
    let lastTs = null;
    for (let gi = 0; gi < games.length; gi++) {
      const G = games[gi];
      if (gi > 0 || lastTs !== null) {
        const days = lastTs === null ? 0 : Math.max(0, (G.ts - lastTs) / DAY);
        let q = CFG.driftPerGame ** 2 + CFG.driftPerDay ** 2 * days;
        if (days >= CFG.seasonGapDays) q += CFG.seasonJump ** 2;
        P = madd(P, diag([q, q]));
      }
      if (changeAt.has(G.id)) P = madd(P, diag([CFG.changeJump ** 2, CFG.changeJump ** 2]));
      for (const ed of (opts.coachEdits || []).filter((e) => e.gameIdx === gi)) {   // an independent coach re-grade: one more piece of evidence
        const R = CFG.priorSd ** 2, Pi = inv(P);
        const Rc = ed.command === null ? 0 : 1 / R, Rg = ed.grade === null ? 0 : 1 / R;   // a blank dimension says nothing
        const Pn = inv(madd(Pi, diag([Rc, Rg])));
        const rhs = [Pi[0][0] * m[0] + Pi[0][1] * m[1] + Rc * (ed.command || 0), Pi[1][0] * m[0] + Pi[1][1] * m[1] + Rg * (ed.grade || 0)];
        m = [Pn[0][0] * rhs[0] + Pn[0][1] * rhs[1], Pn[1][0] * rhs[0] + Pn[1][1] * rhs[1]]; P = Pn;
      }
      const pred = { m: m.slice(), P: P.map((r) => r.slice()) };
      if (G.rows.length) {
        const Pi = inv(P);
        const f = (x) => loglikGames(E, [G], { command: x[0], grade: x[1], traits: effects }, level, srCache)
          - 0.5 * ((x[0] - m[0]) * (Pi[0][0] * (x[0] - m[0]) + Pi[0][1] * (x[1] - m[1])) + (x[1] - m[1]) * (Pi[1][0] * (x[0] - m[0]) + Pi[1][1] * (x[1] - m[1])));
        const r = maximize(f, m, { lo: 0, hi: 6, maxIt: 12 });
        const post = psd(r.H.map((row) => row.map((v) => -v)));   // posterior precision (prior included in f)
        m = r.x; P = inv(post) || P;
      }
      out.push({ gameId: G.id, ts: G.ts, pred, m: m.slice(), P: P.map((r) => r.slice()), n: G.rows.length });
      lastTs = G.ts;
    }
    return out;
  }
  // Rauch-Tung-Striebel smoother: the best estimate of his talent in each past game, using every game
  function smooth(filt) {
    const n = filt.length; if (!n) return [];
    const ms = filt.map((f) => f.m.slice()), Ps = filt.map((f) => f.P.map((r) => r.slice()));
    for (let k = n - 2; k >= 0; k--) {
      const Pp = filt[k + 1].pred.P, Ppi = inv(Pp); if (!Ppi) continue;
      const Pk = filt[k].P;
      const Gk = [[Pk[0][0] * Ppi[0][0] + Pk[0][1] * Ppi[1][0], Pk[0][0] * Ppi[0][1] + Pk[0][1] * Ppi[1][1]], [Pk[1][0] * Ppi[0][0] + Pk[1][1] * Ppi[1][0], Pk[1][0] * Ppi[0][1] + Pk[1][1] * Ppi[1][1]]];
      const d = [ms[k + 1][0] - filt[k + 1].pred.m[0], ms[k + 1][1] - filt[k + 1].pred.m[1]];
      ms[k] = [filt[k].m[0] + Gk[0][0] * d[0] + Gk[0][1] * d[1], filt[k].m[1] + Gk[1][0] * d[0] + Gk[1][1] * d[1]];
    }
    return ms;
  }
  // his traits, given his talent in each game
  function fitEffects(E, games, talentByGame, level, traitKeys, start) {
    if (!traitKeys.length) return { traits: {}, sd: {} };
    const srCache = new Map();
    const f = (x) => {
      const t = {}; traitKeys.forEach((k, i) => (t[k] = x[i]));
      let ll = 0;
      for (let gi = 0; gi < games.length; gi++) if (games[gi].rows.length) ll += loglikGames(E, [games[gi]], { command: talentByGame[gi][0], grade: talentByGame[gi][1], traits: t }, level, srCache);
      for (const [i, k] of traitKeys.entries()) ll -= (x[i] ** 2) / (2 * CFG.effectSd[k] ** 2);
      return ll;
    };
    const x0 = traitKeys.map((k) => (start && start[k]) || 0);
    const r = maximize(f, x0, { lo: -2, hi: 2, maxIt: 10, h: 0.05 });
    const cov = inv(psd(r.H.map((row) => row.map((v) => -v))));
    const traits = {}, sd = {};
    traitKeys.forEach((k, i) => { traits[k] = Math.round(r.x[i] * 1000) / 1000; sd[k] = cov ? Math.round(Math.sqrt(Math.max(0, cov[i][i])) * 1000) / 1000 : CFG.effectSd[k]; });
    return { traits, sd };
  }

  // ---------------------------------------------------------------- one pitch, all of it
  function learnPitch(E, pd, gamesAll, level, opts = {}) {
    const traitKeys = opts.traits || ACTIVE_TRAITS;
    const games = gamesAll.map((g) => {
      if (g.locOk === undefined) Object.assign(g, gamesOf(g.evs)[0] || {});
      // the name this pitch had in that game: renames follow the pitch id
      const byId = pd.id && g.evs.find((e) => e.pitchId === pd.id && !(e.thrown && e.thrown !== e.pitchName));
      const nm = byId ? byId.pitchName : pd.name;
      const pg = pitchGame(g, pd, () => nm);
      const anyEv = g.evs.find((e) => e.ars && e.ars.some((x) => x.name === nm));
      const sp = anyEv ? anyEv.ars.find((x) => x.name === nm) : null;
      return Object.assign(pg, { id: g.id, ts: g.ts, spec: { name: nm, kind: (sp && sp.kind) || pd.kind, shape: (sp && sp.shape) || pd.shape || "", velo: (sp && sp.velo) || pd.velo || 0 } });
    }).filter((g) => g.rows.length || g.script.some((s) => s.op === "mark"));
    // change points: coach marks, shape changes from TrackMan, a change of kind
    const changeAt = new Set();
    for (const c of opts.changes || []) { const g = games.find((x) => x.ts >= c.ts); if (g) changeAt.add(g.id); }
    for (let i = 1; i < games.length; i++) if (games[i].spec.kind !== games[i - 1].spec.kind) changeAt.add(games[i].id);
    const prior = opts.prior || { command: coachValue(pd, "command"), grade: coachValue(pd, "grade") };
    // a coach re-grade is evidence per dimension: a blank (or the 0 an empty box used to log) counts for nothing
    const coachEdits = (opts.coachEdits || []).filter((e) => !e.sawLearned && (gradeOk(e.command) || gradeOk(e.grade))).map((e) => ({ gameIdx: games.findIndex((g) => g.ts >= e.ts), command: gradeOk(e.command) ? +e.command : null, grade: gradeOk(e.grade) ? +e.grade : null })).filter((e) => e.gameIdx >= 0);
    const n = games.reduce((a, g) => a + g.rows.length, 0), nLoc = games.reduce((a, g) => a + g.rows.filter((r) => r.loc).length, 0);
    if (!n) return { n: 0, nLoc: 0, entered: prior, talent: prior, sd: { command: CFG.priorSd, grade: CFG.priorSd }, traits: {}, traitSd: {}, games: games.length, changeAt: [] };
    let effects = {}, filt = null, sm = null, eff = { traits: {}, sd: {} };
    for (let round = 0; round < (opts.rounds || 2); round++) {
      filt = filterTalent(E, games, prior, effects, level, changeAt, { coachEdits });
      sm = smooth(filt);
      eff = fitEffects(E, games, sm, level, traitKeys, effects);
      effects = eff.traits;
    }
    filt = filterTalent(E, games, prior, effects, level, changeAt, { coachEdits });
    const last = filt[filt.length - 1];
    const daysSince = Math.max(0, ((opts.now || last.ts) - last.ts) / DAY);
    const P = madd(last.P, diag([CFG.driftPerDay ** 2 * daysSince, CFG.driftPerDay ** 2 * daysSince]));
    // D6: what each game told the learner, per dimension: how far that game moved the estimate (filtered, so it only
    // looks back). Kept for the last few games in the profile; the scoreboard gets every game.
    const evidenceAll = {};
    for (const f of filt) if (f.n) evidenceAll[f.gameId] = [r3(Math.abs(f.m[0] - f.pred.m[0])), r3(Math.abs(f.m[1] - f.pred.m[1]))];
    const evidence = {};
    for (const f of filt.slice(-12)) if (evidenceAll[f.gameId]) evidence[f.gameId] = evidenceAll[f.gameId];
    const out = { n, nLoc, games: games.length, entered: prior, evidence,
      talent: { command: r2(last.m[0]), grade: r2(last.m[1]) }, sd: { command: r2(Math.sqrt(P[0][0])), grade: r2(Math.sqrt(P[1][1])) },
      traits: effects, traitSd: eff.sd, changeAt: [...changeAt], path: filt.map((f) => ({ ts: f.ts, command: r2(f.m[0]), grade: r2(f.m[1]) })) };
    out.possibleChange = detectChange(E, games, filt, effects, level, changeAt);
    out._games = games; out._evidenceAll = evidenceAll;
    return out;
  }
  const r2 = (x) => Math.round(x * 100) / 100;
  const r3 = (x) => Math.round(x * 1000) / 1000;

  // results-only change suggestion (spec 5.2): low-power, so it only ever suggests
  function detectChange(E, games, filt, effects, level, changeAt) {
    const W = CFG.flags.changeWindow;
    if (games.length < W + 3) return null;
    const start = games.length - W;
    if (games.slice(start).some((g) => changeAt.has(g.id))) return null;
    const before = filt[start - 1];
    const rows = games.slice(start);
    const srCache = new Map();
    const f = (x) => loglikGames(E, rows, { command: x[0], grade: x[1], traits: effects }, level, srCache) - ((x[0] - before.m[0]) ** 2 + (x[1] - before.m[1]) ** 2) / (2 * 4);
    const r = maximize(f, before.m, { lo: 0, hi: 6, maxIt: 12 });
    const C = inv(madd(inv(psd(r.H.map((row) => row.map((v) => -v)))), before.P));
    if (!C) return null;
    const d = [r.x[0] - before.m[0], r.x[1] - before.m[1]];
    const z2 = d[0] * (C[0][0] * d[0] + C[0][1] * d[1]) + d[1] * (C[1][0] * d[0] + C[1][1] * d[1]);
    return z2 > CFG.flags.changeZ2 ? { sinceTs: games[start].ts, command: r2(r.x[0]), grade: r2(r.x[1]), z2: r2(z2) } : null;
  }

  // ---------------------------------------------------------------- scoreboard: learned vs the coach's grades, scored before each game
  function scoreboard(E, pd, games, level, opts = {}) {
    const every = opts.every || 3, minGames = opts.minGames || 3, traitKeys = opts.traits || ACTIVE_TRAITS;
    let learnedLL = 0, coachLL = 0, rows = 0, fitted = null, prev = null;
    const scored = [];
    // Scored is what the calls would have used: the fit as served, with the same limits as serve() (at most 0.15 per
    // game, 1.0 in total, traits ±0.5 and 0.1 per game). Scoring the raw fit instead charged learning for noise the
    // limits never let through: on right grades a 265-pitch fit can sit 0.6 off in stuff, which since the calibration
    // costs real surprise per pitch.
    const one = { id: pd.id || pd.name, name: pd.name, command: coachValue(pd, "command"), grade: coachValue(pd, "grade") };
    for (let gi = minGames; gi < games.length; gi++) {
      if (!games[gi].rows.length) continue;
      if (!fitted || (gi - minGames) % every === 0) fitted = learnPitch(E, pd, games.slice(0, gi).map((g) => g._game), level, Object.assign({}, opts, { traits: traitKeys, rounds: 1 }));
      const G = games[gi];
      const sv = serve({ at: 0, games: games.slice(0, gi).map((g) => ({ id: g.id, ts: g.ts })),
        pitches: { [one.id]: { n: 1, talent: fitted.talent, traits: fitted.traits, evidence: opts.evidence || null } } }, { pitches: [one], changes: opts.changes || [] }, prev);   // with his change marks, as serve() gets them in use
      prev = sv;
      const u = sv.pitches[one.id];
      const l = loglikGames(E, [G], { command: u.command, grade: u.grade, traits: u.traits }, level, new Map());
      const c = loglikGames(E, [G], { command: coachValue(pd, "command"), grade: coachValue(pd, "grade"), traits: null }, level, new Map(), { noStrikeRate: true });
      scored.push({ n: G.rows.length, l, c });
    }
    // the last scoreWindow pitches
    let nAcc = 0;
    const win = [];
    for (let i = scored.length - 1; i >= 0 && nAcc < CFG.flags.scoreWindow; i--) { learnedLL += scored[i].l; coachLL += scored[i].c; nAcc += scored[i].n; win.push(scored[i]); }
    rows = nAcc;
    // Margin 0.02 per pitch (was 0.01): after the calibration a wrong grade costs 0.14 per pitch and right grades cost
    // the learner about 0.007 of noise on average; at 0.01, 14 right-grade seasons switched off twice, at 0.02 none did.
    // Switch off only when his grades are clearly better: by the margin AND by more than scoreZ standard errors of the
    // game-by-game difference (one-sided: the only question is whether learning is worse).
    // Retuned Nov 6 for the single v0.9 engine (margin 0.02 -> 0.015, 2 SE -> 1.645 SE). With v0.9 driving the replay a
    // season gives each pitch ~300 scored pitches, so 2 SE was what kept a noise-chasing learner on. Noise-chaser switched
    // off: tuning seeds 300-309 9/10 (was 5/10), held-out 500-509 7/10 (was 5/10), fresh 600-619 13/20 (was 12/20); the real learner
    // was never switched off on right or wrong grades in any of those 40 seasons. Any fitted estimate pays a small price for its own noise when the grades are already
    // right (about 1/(2n) per pitch per learned number), and that price must not read as "learning is broken".
    const gap = rows ? (coachLL - learnedLL) / rows : 0;       // + = learned predicted worse (more surprise per pitch)
    const se = rows ? Math.sqrt(win.reduce((a, g) => a + ((g.c - g.l) - gap * g.n) ** 2, 0)) / rows : 0;
    const allN = scored.reduce((a, g) => a + g.n, 0);
    return { rows, learned: rows ? -learnedLL / rows : null, coach: rows ? -coachLL / rows : null, gap, se,
      all: { n: allN, learned: allN ? -scored.reduce((a, g) => a + g.l, 0) / allN : null, coach: allN ? -scored.reduce((a, g) => a + g.c, 0) / allN : null },
      worse: rows >= CFG.flags.scoreMinRows && gap > CFG.flags.scoreMargin && gap > CFG.flags.scoreZ * se };
  }

  // ---------------------------------------------------------------- the whole pitcher
  /*
   * learnPitcher(E, pitcher, events, opts) -> profile
   *   pitcher: roster record (pitches with id, name, kind, shape, velo, grade, command; optional changes[], gradeLog[])
   *   events: every logged pitch he threw (soft-deleted ones are skipped)
   *   opts: { level, now, scoreboard: true|false, traits: [...] }
   */
  // D7: a logged row the engine can't read (a broken arsenal snapshot, an impossible count) is skipped, never fatal.
  // Each candidate row is tried once against the engine; whatever throws is set aside and counted.
  const CONTACTS = ["weak", "solid", "hard"];
  function readable(E, ev) {
    // every pitch is replayed for in-game confidence, so its shape must be sound even if it isn't learned from
    if (!ev || typeof ev !== "object") return false;
    // every pitch's arsenal snapshot is read when its game is replayed, learned from or not
    if (!(Array.isArray(ev.ars) && ev.ars.every((x) => x && typeof x === "object" && typeof x.name === "string"))) return false;
    if (ev.sit !== undefined && (ev.sit === null || typeof ev.sit !== "object")) return false;
    if (ev.res === "play" && ev.contact && !CONTACTS.includes(ev.contact)) return false;
    if (ev.shaken !== undefined && ev.shaken !== null && !(Array.isArray(ev.shaken) && ev.shaken.every((x) => Array.isArray(x) && typeof x[0] === "string"))) return false;
    if (!usable(ev)) return true;   // not learned from: the shape is enough
    try {
      if (!Array.isArray(ev.ars) || !ev.ars.length || !ev.ars.some((x) => x && x.name === (ev.thrown || ev.pitchName))) return false;
      const s = ev.sit;
      if (!(s.balls >= 0 && s.balls <= 3 && s.strikes >= 0 && s.strikes <= 2 && s.outs >= 0 && s.outs <= 2)) return false;
      const ars = ev.ars.map((x) => E.Pitch(Object.assign({}, x)));
      const p = ars.find((x) => x.name === (ev.thrown || ev.pitchName));
      const P = E.outcomeProbs(p, ev.quad, E.Situation(Object.assign({}, s, { hitter_damage: {}, timing: {} })), ars, null);
      return Object.values(P).every((v) => typeof v !== "number" || Number.isFinite(v));
    } catch (e) { return false; }
  }
  function learnPitcher(E, pitcher, events, opts = {}) {
    const level = opts.level || "college_d3";
    // D12: an event that arrives twice (the same id, from a restore and a sync) counts once: the newest copy
    const byId = new Map();
    for (const e of events) { if (e.pitcherId && e.pitcherId !== pitcher.id) continue; const k = e.id || "_" + byId.size; const o = byId.get(k); if (!o || (e.updatedAt || 0) > (o.updatedAt || 0)) byId.set(k, e); }
    const mine = [...byId.values()];
    const bad = mine.filter((e) => isPitch(e) && !e.deletedAt && !e.legacy && !readable(E, e));
    const badSet = new Set(bad);   // by the record itself: rows without an id must not all match one bad row's missing id
    const gamesAll = gamesOf(bad.length ? mine.filter((e) => !badSet.has(e)) : mine);
    // D10: the starved flag compares the engine's own calls (coach calls and shake-offs aren't the engine starving it)
    const total = gamesAll.reduce((a, g) => a + g.evs.filter(usable).length, 0);
    const prof = { pitcherId: pitcher.id, learner: VERSION, at: opts.now || Date.now(), level, pitches: {}, flags: [],
      games: gamesAll.map((g) => ({ id: g.id, ts: g.ts })),   // serve() steps once per game in this list it hasn't seen
      skipped: { n: bad.length, ids: bad.slice(0, 50).map((e) => e.id), games: [...new Set(bad.map((e) => e.gameId))].slice(0, 20) } };
    for (const pd of pitcher.pitches || []) {
      if (pd.active === false) continue;
      const changes = (pitcher.changes || []).filter((c) => !c.pitchId || c.pitchId === pd.id);
      const edits = (pd.gradeLog || []).slice(1);   // the first entry is the starting grade itself
      const g0 = pd.gradeLog && pd.gradeLog.length ? pd.gradeLog[0] : null;
      const L = learnPitch(E, pd, gamesAll, level, Object.assign({}, opts, { changes, coachEdits: edits,
        prior: g0 ? { command: gradeOk(g0.command) ? +g0.command : coachValue(pd, "command"), grade: gradeOk(g0.grade) ? +g0.grade : coachValue(pd, "grade") } : undefined }));
      const games = L._games || []; delete L._games;
      const evAll = L._evidenceAll || {}; delete L._evidenceAll;
      if (opts.scoreboard !== false && L.n >= CFG.flags.scoreMinRows) {
        for (const g of games) g._game = gamesAll.find((x) => x.id === g.id);
        L.score = scoreboard(E, pd, games, level, Object.assign({}, opts, { changes, coachEdits: edits, evidence: evAll }));
      }
      L.strike_rate = r2(strikeRate(E, { name: pd.name, kind: pd.kind, shape: pd.shape, velo: pd.velo, command: L.talent.command, grade: L.talent.grade, traits: L.traits }, level) * 100) / 100;
      prof.pitches[pd.id || pd.name] = L;
      prof.flags.push(...flagsFor(pd, L, total, gamesAll.length, pitcher));
    }
    return prof;
  }

  function flagsFor(pd, L, total, nGames, pitcher) {
    const F = CFG.flags, out = [], id = pd.id || pd.name, name = pd.name;
    for (const dim of ["grade", "command"]) {
      if (!graded(pd, dim)) continue;   // D8: not graded yet, so nothing to disagree with until he sets it
      // after an Accept, later flags are against the value he accepted (D2); otherwise against his grade
      const R = railsFor(pd, pitcher, dim), ref = R.acc && has(R.acc.to) ? R.center : R.coach;
      const coach = R.coach, val = L.talent[dim], sd = L.sd[dim], gap = val - ref;
      const enough = dim === "grade" ? L.n >= F.stuffMinN : L.nLoc >= F.cmdMinLoc;
      if (enough && Math.abs(gap) > F.gradeGap && Math.abs(gap) > F.gradeZ * sd)
        out.push({ type: "grade", pitchId: id, dim, coach, ref, learned: val, sd, text: `${name}: ${dim === "grade" ? "stuff" : "command"} plays like ${val.toFixed(1)}, ${ref === coach ? `you have ${coach}` : `the calls are centred on ${ref} (accepted)`} (±${sd.toFixed(2)}, ${L.n} pitches)` });
    }
    if (L.possibleChange) out.push({ type: "change", pitchId: id, text: `${name} may have changed over his last ${CFG.flags.changeWindow} games. Mark it changed if you know why.`, detail: L.possibleChange });
    if (nGames >= F.starvedGames && total > 0 && L.n < F.starvedShare * total) out.push({ type: "starved", pitchId: id, text: `${name} has barely been called by the engine (${L.n} of its ${total} calls), so there's little to learn from. Use it in a low-leverage spot or a bullpen if you want it learned.` });
    if (L.n >= 100 && L.nLoc < 0.5 * L.n) out.push({ type: "noLocation", pitchId: id, text: `${name}: command can't be learned without "where it ended up" logged.` });
    if (L.score && L.score.worse) out.push({ type: "learningOff", pitchId: id, text: `${name}: what it learned predicted worse than your grades over the last ${L.score.rows} pitches, so the calls use your grades.` });
    return out;
  }

  // ---------------------------------------------------------------- what the engine actually gets (spec 11)
  /*
   * serve(profile, pitcher, prev) -> { pitches: { id: { command, grade, traits, strike_rate, learned } }, at }
   * prev: the last served profile (for per-game steps).
   * pitcher.accepted: { [pitchId]: { command: { ts, from }, grade: { ts, from } } }: the coach accepted the flag; "from" is
   * the value the engine was getting at that moment.
   */
  function serve(profile, pitcher, prev, opts = {}) {
    const C = CFG.caps, out = { at: profile.at, learner: VERSION, pitches: {} };
    const off = pitcher.useLearned === false;
    // one step per game: serving again with no new game (a relearn, a reload, a re-grade) moves nothing. Profiles
    // without a game list (older callers) step on every call, as before.
    const gameIds = profile.games ? profile.games.map((g) => g.id) : null;
    const seen = new Set((prev && prev.games) || []);
    const newIds = gameIds ? gameIds.filter((g) => !seen.has(g)) : null;
    const newGame = !prev || !gameIds || newIds.length > 0;
    out.games = gameIds || (prev && prev.games) || [];
    const tsOf = new Map((profile.games || []).map((g) => [g.id, g.ts]));
    for (const pd of pitcher.pitches || []) {
      const id = pd.id || pd.name, L = profile.pitches[id], was = prev && prev.pitches && prev.pitches[id];
      const coachNow = { command: coachValue(pd, "command"), grade: coachValue(pd, "grade") };
      const learningOff = off || !L || !L.n || (L.score && L.score.worse);
      if (learningOff) { out.pitches[id] = { command: coachNow.command, grade: coachNow.grade, traits: null, strike_rate: null, learned: false }; continue; }
      if (!newGame && was && was.learned) {
        // same games as last time: keep what was served, but follow a coach re-grade since (the offset from his grade
        // holds), and his answers to flags (Keep mine, Accept) through the same final limits as everywhere else
        const coachWas = was.coach || coachNow;
        const moved = { command: was.command + (coachNow.command - coachWas.command), grade: was.grade + (coachNow.grade - coachWas.grade), phase: was.phase };
        out.pitches[id] = Object.assign({}, was, clampServed(pd, pitcher, moved), { coach: coachNow });
        continue;
      }
      // spec 11: bigger steps for the first games after a change mark (counted in games, not days)
      const changedLately = (pitcher.changes || []).some((c) => (!c.pitchId || c.pitchId === id) &&
        (profile.games ? profile.games.filter((g) => g.ts >= c.ts).length < C.changeGames : profile.at - c.ts < 30 * DAY));
      const v = {}, phase = {};
      const steps = gameIds && prev ? Math.max(1, newIds.length) : 1;   // games this serve takes in (a sync can bring two)
      ["command", "grade"].forEach((dim, k) => {
        const R = railsFor(pd, pitcher, dim);
        if (R.keep) { v[dim] = R.coach; return; }                       // D1: Keep mine holds his number
        let target = Math.min(R.center + C.total, Math.max(R.center - C.total, L.talent[dim]));
        const from = was && has(was[dim]) ? +was[dim] : R.coach;
        const cap = changedLately ? C.stepAfterChange : C.step;
        // D6: per new game, a step in proportion to what that game told the learner, up to the cap
        let step = cap;
        if (C.evidence && newIds && L.evidence) {
          const ids = prev ? newIds : gameIds.slice(-1);   // a first serve takes one game's step, as the flat rule does
          step = ids.reduce((a, g) => a + (L.evidence[g] ? Math.min(cap, cap * L.evidence[g][k] / C.evidenceRef) : 0), 0);
        }
        // D2: accepted: phase in to the value he accepted over phaseGames steps, each a third of the gap at that moment
        // (two games arriving together are two steps); after that, the usual limit around the accepted value (target)
        if (R.acc && R.legacy) { target = clamp15(L.talent[dim]); step = Math.max(step, Math.abs(target - (has(R.acc.from) ? +R.acc.from : R.coach)) / C.phaseGames + 1e-9); }
        else if (R.acc) {
          const fromA = has(R.acc.from) ? +R.acc.from : R.coach, k0 = phaseOf(was, dim, R.acc);
          if (k0 < C.phaseGames) {
            const kk = Math.min(C.phaseGames - k0, steps);
            target = R.center; step = Math.max(step, kk * Math.abs(R.center - fromA) / C.phaseGames + 1e-9);
            phase[dim] = { ts: R.acc.ts, k: k0 + kk };
          } else phase[dim] = { ts: R.acc.ts, k: k0 };
        }
        v[dim] = r2(clamp15(from + Math.max(-step, Math.min(step, target - from))));
      });
      const traits = {};
      for (const [k, val] of Object.entries(L.traits || {})) {
        const from = was && was.traits ? was.traits[k] || 0 : 0;
        const target = Math.max(-C.effectTotal, Math.min(C.effectTotal, val));
        traits[k] = r2(from + Math.max(-C.effectStep, Math.min(C.effectStep, target - from)));
      }
      if (Object.keys(phase).length) v.phase = phase;
      out.pitches[id] = Object.assign({ traits, learned: true, sd: L.sd, coach: coachNow }, clampServed(pd, pitcher, v), Object.keys(phase).length ? { phase } : {});
    }
    return out;
  }
  // the served pitch's strike rate (needs the engine; done once per game pack)
  function finishServe(E, served, pitcher, level) {
    for (const pd of pitcher.pitches || []) {
      const s = served.pitches[pd.id || pd.name]; if (!s || !s.learned) continue;
      s.strike_rate = r2(strikeRate(E, { name: pd.name, kind: pd.kind, shape: pd.shape, velo: pd.velo, command: s.command, grade: s.grade, traits: s.traits }, level) * 100) / 100;
    }
    return served;
  }

  // ---------------------------------------------------------------- hitters: what he did against what the engine expected
  const DMG_VAL = { hard: 1.0, solid: 0.3, weak: -0.3, whiff: -0.6, foul: 0.0 };
  function hitterModel(E, hitter, events, level, opts = {}) {
    const t0 = opts.now || Date.now(), acc = {};
    const add = (k, v, w) => { const a = acc[k] || (acc[k] = [0, 0]); a[0] += v * w; a[1] += w; };
    const prior = statPrior(hitter && hitter.stats, level);
    if (prior) { add("FB", prior.FB, 3); add("OS", prior.OS, 3); }
    const games = new Set(); let n = 0;
    for (const ev of events) {
      if (ev.deletedAt || ev.legacy || !isPitch(ev) || !ev.sit || !ev.ars) continue;
      const swing = ev.res === "whiff" || ev.res === "foul" || (ev.res === "play" && ev.contact);
      if (!swing) continue;
      const obs = ev.res === "play" ? DMG_VAL[ev.contact] : DMG_VAL[ev.res];
      const ars = ev.ars.map((x) => E.Pitch(Object.assign({}, x)));
      const p = ars.find((x) => x.name === ev.pitchName); if (!p) continue;
      const P = E.outcomeProbs(p, ev.quad, E.Situation(Object.assign({}, ev.sit, { hitter_damage: {}, timing: {} })), ars, null);
      const sw = P.whiff + P.foul + P.weak + P.solid + P.hard;
      if (sw <= 0) continue;
      const exp = (P.whiff * DMG_VAL.whiff + P.foul * DMG_VAL.foul + P.weak * DMG_VAL.weak + P.solid * DMG_VAL.solid + P.hard * DMG_VAL.hard) / sw;
      const w = ev.ts ? Math.pow(0.5, Math.max(0, (t0 - ev.ts) / DAY) / 365) : 1;   // hitters develop: a year-old swing counts half
      add(isOS(ev.kind) ? "OS" : "FB", obs - exp, w);
      if (ev.quad) add(ev.quad, obs - exp, w);
      if (ev.gameId) games.add(ev.gameId); n++;
    }
    const damage = {};
    for (const [k, [s, w]] of Object.entries(acc)) if (w > 0) damage[k] = [Math.max(-1, Math.min(1, Math.round((s / w) * 1000) / 1000)), Math.round(w * 10) / 10];
    const grades = hitterGrades(E, hitter, events, level, opts.prev);
    return Object.assign({ hitterId: hitter && hitter.id, damage, games: games.size, n, prior, learner: VERSION }, grades ? { grades } : {});
  }
  // v0.8 (spec 8.2): contact, power and discipline grades from the (p_i, d_i) pairs logged with each pitch (each computed
  // with that grade at 3 and the others at their values then), shrunk to the coach's grade by I0. Rails: no effect before
  // 30 pitches, at most 0.5 a game from what was served before, and a flag instead of a change past 1 point from the coach.
  function hitterGrades(E, hitter, events, level, prev) {
    if (!E.v08 || !E.v08.SIM || !E.v08.SIM.I0_GRADE) return null;
    const obs = { c: [], w: [], d: [] }; let n = 0;
    for (const ev of events) {
      if (ev.deletedAt || ev.legacy || !isPitch(ev) || !ev.v08 || !ev.v08.grades) continue;
      const g = ev.v08.grades, swing = ev.res === "whiff" || ev.res === "foul" || ev.res === "play";
      n++;
      if (g.d) obs.d.push([swing ? 1 : 0, g.d[0], g.d[1]]);
      if (swing && g.c) obs.c.push([ev.res === "whiff" ? 1 : 0, g.c[0], g.c[1]]);
      if (ev.res === "play" && ev.contact && g.w) obs.w.push([ev.contact === "hard" ? 1 : 0, g.w[0], g.w[1]]);
    }
    if (!n) return null;
    const I0 = E.v08.SIM.I0_GRADE[level] || E.v08.SIM.I0_GRADE.college_d3, coach = (hitter && hitter.grades) || {}, out = {};
    for (const g of ["c", "w", "d"]) {
      const gc = +coach[g] || 3, pv = prev && prev.grades && prev.grades[g] ? prev.grades[g].served : null;
      const [used, est, flag] = E.v08.gradeEstimate(obs[g], gc, I0[g], pv === undefined ? null : pv, n);
      out[g] = { served: r2(used), est: r2(est), flag, n: obs[g].length, coach: gc };
    }
    return out;
  }
  const LEVEL_AVG = {
    hs: { AVG: 0.286, OBP: 0.415, SLG: 0.383, K: 0.210, BB: 0.141 },
    college_d3: { AVG: 0.295, OBP: 0.402, SLG: 0.426, K: 0.162, BB: 0.114 },
    college_d1: { AVG: 0.265, OBP: 0.368, SLG: 0.395, K: 0.193, BB: 0.108 },
    mlb: { AVG: 0.255, OBP: 0.320, SLG: 0.405, K: 0.200, BB: 0.079 },
  };
  LEVEL_AVG.travel = LEVEL_AVG.hs;   // travel ball uses the high school numbers (engine v0.7c)
  function statPrior(st, level) {
    if (!st) return null;
    const L = LEVEL_AVG[level] || LEVEL_AVG.college_d3;
    const num = (x) => (x === "" || x === undefined || x === null || Number.isNaN(+x) ? null : +x);
    const obp = num(st.obp), slg = num(st.slg), k = num(st.k_pct), pa = num(st.pa);
    if (obp === null && slg === null && k === null) return null;
    const rel = pa === null ? 0.5 : Math.min(1, pa / 80);
    const opsGap = (obp !== null && slg !== null) ? (obp + slg) - (L.OBP + L.SLG) : 0;
    const kGap = k !== null ? k / 100 - L.K : 0;
    const clamp = (x) => Math.max(-0.6, Math.min(0.6, x));
    return { FB: Math.round(clamp(rel * opsGap * 1.5) * 1000) / 1000, OS: Math.round(clamp(rel * (opsGap * 1.0 - kGap * 2.0)) * 1000) / 1000 };
  }
  function seedDamage(model, cap = 8, center = false) {
    const out = {};
    if (!model || !model.damage) return out;
    // v0.8 (8.2): with hitter grades on, the seed is centered (his mean damage across classes and spots taken out), so
    // damage carries only class and spot differences and the grades carry his overall level: no double count
    const vals = Object.values(model.damage).map((x) => x[0]);
    const mean = center && vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    for (const [k, [s, n]] of Object.entries(model.damage)) out[k] = [Math.round((s - mean) * 1000) / 1000, Math.min(n, cap)];
    return out;
  }

  const api = { VERSION, CFG, ACTIVE_TRAITS, ALL_TRAITS, learnPitcher, learnPitch, serve, finishServe, clampServed, railsFor, coachValue, graded, readable, strikeRate, strikeRateFast, strikeRef, hitterModel, statPrior, seedDamage, LEVEL_AVG,
    category, usable, gamesOf, isPitch, loglikGames, _maximize: maximize, _confPath: confPath, _pitchGame: pitchGame };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PCLearner = api;
})(typeof window !== "undefined" ? window : this);
