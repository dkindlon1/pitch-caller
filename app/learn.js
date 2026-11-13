/*
 * Pitch Caller learning: the flywheel.
 *
 * Every pitch logged in a game stores what the engine expected to happen (the full outcome mix) and the exact
 * situation it was thrown in. After a game, each pitch in each pitcher's arsenal is refitted:
 *
 *   command and stuff = the values that make the engine's own outcome model best explain what actually happened
 *                       (multinomial likelihood over ball / called strike / whiff / foul / contact quality),
 *                       pulled toward what the coach entered by a prior, and weighted toward recent games.
 *
 * Then the same fit runs on slices, centred on the overall answer: against same-side vs opposite-side hitters,
 * and when he's ahead, even, or behind in the count. Slices are shown, not served (spec 18: none pass the trait gate).
 * What the calls get moves toward the fit by at most 0.15 per new game and never more than 1.0 from his grade.
 *
 * Little data moves nothing (the prior wins); a lot of data moves the numbers to wherever the results point.
 * Nothing here changes the engine's math: it only learns better inputs for it.
 *
 * Hitters: their results against fastballs and off-speed (and by location) carry across games, fading with age,
 * and seed what the engine knows about them the next time they come up. Season stats give a small starting lean.
 */
(function (root) {
  "use strict";
  const VERSION = "1.1.0";     // 1.1: served values step 0.15 a game, capped at 1.0, no slices served, coach calls left out
  const PRIOR_SD = 0.7;        // how far we expect a coach's grade to be off, in grade points
  const SLICE_SD = 0.45;       // how far a slice can sit from the pitcher's overall value
  const HALF_LIFE_DAYS = 180;  // a pitch from six months ago counts half
  const LO = 1, HI = 5;
  const LOCS = ["heart", "edge", "off", "noncomp"];   // the engine's landing zones: middle of the zone, its edges, just off, way off

  // ------------------------------------------------------------ what the engine expects for one pitch
  function predict(E, arsenal, sit, pitchName, quad) {
    const p = arsenal.find((x) => x.name === pitchName);
    const P = E.outcomeProbs(p, quad, sit, arsenal, null);
    const bip = P.weak + P.solid + P.hard;
    const r = (x) => Math.round(x * 1e4) / 1e4;
    return { ball: r(P.ball + P.wp_ball), hbp: r(P.hbp), cstrike: r(P.cstrike), whiff: r(P.whiff), foul: r(P.foul),
      weak: r(P.weak), solid: r(P.solid), hard: r(P.hard),
      strike: r(1 - P.ball - P.wp_ball - P.hbp), swing: r(P.whiff + P.foul + bip), bip: r(bip) };
  }

  // the pitch's arsenal entry and situation, small enough to keep with every logged pitch
  const PITCH_KEYS = ["name", "kind", "grade", "command", "conf", "base_conf", "shape", "velo", "slot", "height_ft", "ivb", "hb", "release_offset_in", "strike_rate", "strike_ref", "traits", "main", "lean_x", "lean_z", "spread"];   // v1.2: lean fields (only present when set)   // v1.1 Step 5: the main fastball mark (rel_shape reads it)
  function snapArsenal(arsenal) { return arsenal.map((p) => { const o = {}; for (const k of PITCH_KEYS) if (p[k] !== undefined) o[k] = p[k]; return o; }); }
  function snapSituation(s) { const o = Object.assign({}, s); delete o.wild_true; return JSON.parse(JSON.stringify(o)); }

  // which outcome bucket a logged result falls in
  function category(ev) {
    if (ev.res === "ball") return "ball";
    if (ev.res === "hbp") return "hbp";
    if (ev.res === "cstrike") return "cstrike";
    if (ev.res === "whiff") return "whiff";
    if (ev.res === "foul") return "foul";
    if (ev.res === "play") return ev.contact ? ev.contact : "bip";
    return null;
  }
  function probOf(P, cat) {
    switch (cat) {
      case "ball": return P.ball + P.wp_ball;
      case "bip": return P.weak + P.solid + P.hard;
      default: return P[cat];
    }
  }
  const sliceOf = (ev) => {
    const s = ev.sit; if (!s) return {};
    return { side: s.same_side ? "same" : "opp", count: s.strikes > s.balls ? "ahead" : s.balls > s.strikes ? "behind" : "even" };
  };
  const ageWeight = (ts, t0) => (ts ? Math.pow(0.5, Math.max(0, (t0 - ts) / 864e5) / HALF_LIFE_DAYS) : 1);

  // log-likelihood of a set of pitches if this pitch's command and stuff were (cmd, grade)
  function loglik(E, rows, pitchName, cmd, grade) {
    let ll = 0;
    for (const r of rows) {
      const nm = r.name || pitchName;   // the pitch's name when it was thrown (it may have been renamed since)
      const ars = r.ars.map((x) => (x.name === nm ? Object.assign({}, x, { command: cmd, grade }) : x));
      const p = ars.find((x) => x.name === nm);
      const P = E.outcomeProbs(p, r.quad, r.sit, ars, null);
      ll += r.w * Math.log(Math.max(1e-6, probOf(P, r.cat)));
      // where it ended up, when the charter logged it: this is what carries command
      if (r.loc) ll += r.w * Math.log(Math.max(1e-6, E.landing(p, r.quad, r.sit)[r.loc]));
    }
    return ll;
  }

  // MAP fit of (command, stuff) with a Gaussian prior; Newton steps with numeric derivatives, kept inside 1..5
  function fit(E, rows, pitchName, prior, sd) {
    const clamp = (x) => Math.min(HI, Math.max(LO, x));
    const f = (c, g) => loglik(E, rows, pitchName, c, g) - ((c - prior.command) ** 2 + (g - prior.grade) ** 2) / (2 * sd * sd);
    let c = clamp(prior.command), g = clamp(prior.grade), fc = f(c, g);
    const h = 0.05;
    for (let it = 0; it < 25; it++) {
      const cp = clamp(c + h), cm = clamp(c - h), gp = clamp(g + h), gm = clamp(g - h);
      const fcp = f(cp, g), fcm = f(cm, g), fgp = f(c, gp), fgm = f(c, gm), fpp = f(cp, gp);
      const dc = (fcp - fcm) / (cp - cm), dg = (fgp - fgm) / (gp - gm);
      const hcc = (fcp - 2 * fc + fcm) / (h * h), hgg = (fgp - 2 * fc + fgm) / (h * h);
      const hcg = (fpp - fcp - fgp + fc) / (h * h);
      // Newton step on the 2x2 Hessian; fall back to a gradient step if it isn't a maximum
      const det = hcc * hgg - hcg * hcg;
      let sc, sg;
      if (hcc < 0 && det > 0) { sc = -(hgg * dc - hcg * dg) / det; sg = -(-hcg * dc + hcc * dg) / det; }
      else { sc = 0.05 * Math.sign(dc); sg = 0.05 * Math.sign(dg); }
      const mx = Math.max(Math.abs(sc), Math.abs(sg)); if (mx > 0.5) { sc *= 0.5 / mx; sg *= 0.5 / mx; }
      let step = 1, moved = false;
      for (let k = 0; k < 6; k++) {   // backtrack until it improves
        const nc = clamp(c + step * sc), ng = clamp(g + step * sg), fn = f(nc, ng);
        if (fn > fc) { c = nc; g = ng; fc = fn; moved = true; break; }
        step /= 2;
      }
      if (!moved || Math.max(Math.abs(step * sc), Math.abs(step * sg)) < 0.005) break;
    }
    return { command: Math.round(c * 100) / 100, grade: Math.round(g * 100) / 100 };
  }

  // turn logged events into fit rows for one pitch
  // pd: the arsenal entry. Matched by its id when the event has one, so renaming a pitch keeps its history.
  function rowsFor(events, pd, t0) {
    if (typeof pd === "string") pd = { name: pd };
    const out = [];
    for (const ev of events) {
      if (ev.legacy || ev.deletedAt || (ev.type && ev.type !== "pitch") || !ev.sit || !ev.ars) continue;
      // spec 5.4: only the engine's own calls teach it. A coach's call or a re-call after a shake-off was chosen on
      // something the engine didn't see (how he looks tonight), so its result would bias the fit.
      if (ev.choice ? !(ev.choice === "engine" || ev.choice === "variety") : (ev.coach || (ev.shaken && ev.shaken.length))) continue;
      if (pd.id && ev.pitchId ? ev.pitchId !== pd.id : ev.pitchName !== pd.name) continue;
      if (!ev.ars.some((x) => x.name === ev.pitchName)) continue;
      const cat = category(ev); if (!cat) continue;
      out.push({ name: ev.pitchName, ars: ev.ars, sit: ev.sit, quad: ev.quad, cat, loc: LOCS.includes(ev.loc) ? ev.loc : null, w: ageWeight(ev.ts, t0), slice: sliceOf(ev), game: ev.gameId || null });
    }
    return out;
  }

  /*
   * pitcherModel(E, pitcher, events) -> { pitches: { [name]: { n, entered, fit, slices: { same, opp, ahead, even, behind } } } }
   * pitcher: the roster record (pitches with grade and command as entered). events: every logged pitch he threw.
   */
  function pitcherModel(E, pitcher, events, opts = {}) {
    const t0 = opts.now || Date.now(), cap = opts.cap || 1500;
    const out = { pitcherId: pitcher.id, at: t0, pitches: {} };
    for (const pd of pitcher.pitches || []) {
      let rows = rowsFor(events, pd, t0);
      if (rows.length > cap) rows = rows.slice(-cap);
      const entered = { command: +pd.command, grade: +pd.grade };
      const nEff = rows.reduce((a, r) => a + r.w, 0);
      const gameIds = [...new Set(rows.map((r) => r.game || "g?"))];
      const m = { n: rows.length, nLoc: rows.filter((r) => r.loc).length, nEff: Math.round(nEff * 10) / 10, games: gameIds.length, gameIds, entered, fit: entered, slices: {}, obs: summarize(rows) };
      if (rows.length) {
        m.fit = fit(E, rows, pd.name, entered, PRIOR_SD);
        for (const [dim, keys] of [["side", ["same", "opp"]], ["count", ["ahead", "even", "behind"]]]) {
          for (const k of keys) {
            const sub = rows.filter((r) => r.slice[dim] === k);
            if (!sub.length) continue;
            const s = fit(E, sub, pd.name, m.fit, SLICE_SD);
            m.slices[k] = { n: sub.length, dCommand: Math.round((s.command - m.fit.command) * 100) / 100, dGrade: Math.round((s.grade - m.fit.grade) * 100) / 100 };
          }
        }
      }
      m.name = pd.name;
      out.pitches[pd.id || pd.name] = m;
    }
    return serveModel(out, opts.prev || null);
  }

  function summarize(rows) {
    let n = 0, strikes = 0, swings = 0, whiffs = 0, bip = 0, hard = 0;
    for (const r of rows) {
      n++;
      if (r.cat !== "ball" && r.cat !== "hbp") strikes++;
      if (["whiff", "foul", "weak", "solid", "hard", "bip"].includes(r.cat)) swings++;
      if (r.cat === "whiff") whiffs++;
      if (["weak", "solid", "hard", "bip"].includes(r.cat)) bip++;
      if (r.cat === "hard") hard++;
    }
    return { n, strikes, swings, whiffs, bip, hard };
  }

  // ------------------------------------------------------------ serving: what the calls get (spec 11, Drew: "it has to stay within limits")
  // The fit is the evidence; what reaches the calls moves toward it by at most STEP per relearn with a new game in it, never
  // more than CAP from the coach's grade. Situational slices are measured and shown but not served: the trait gate
  // (spec 18) found none worth acting on. Served values are kept as offsets from the coach's grade, so a re-grade
  // moves them with him.
  const STEP = 0.15, CAP = 1.0;
  function serveModel(model, prev) {
    for (const [id, m] of Object.entries(model.pitches)) {
      const was = prev && prev.pitches && prev.pitches[id] && prev.pitches[id].served;
      const from = was || { dCommand: 0, dGrade: 0, games: [] };
      const seen = new Set(from.games || []);
      const fresh = (m.gameIds || []).filter((g) => !seen.has(g));
      const lim = (x, a) => Math.max(-a, Math.min(a, x));
      const out = { dCommand: from.dCommand, dGrade: from.dGrade, games: (m.gameIds || []).slice() };
      if (m.n && fresh.length) {       // one step per relearn that has a new game in it, toward the capped fit. One, not
        // one per new game: a pitcher whose history arrives at once (first load, a restored backup) still starts at his
        // grades and moves 0.15 a game from there, like learner v2's serve().
        const tc = lim(m.fit.command - m.entered.command, CAP), tg = lim(m.fit.grade - m.entered.grade, CAP);
        out.dCommand = r2(from.dCommand + lim(tc - from.dCommand, STEP));
        out.dGrade = r2(from.dGrade + lim(tg - from.dGrade, STEP));
      }
      m.served = out;
    }
    return model;
  }
  const r2 = (x) => Math.round(x * 100) / 100;

  // the values to hand the engine for this pitch (sit is accepted for compatibility; no situational slices are served)
  function adjusted(model, pd, sit) {
    const m = model && model.pitches && (model.pitches[pd.id] || model.pitches[pd.name]);
    if (!m || !m.n || !m.served) return { command: +pd.command, grade: +pd.grade, learned: false };
    const lim = (x) => Math.max(-CAP, Math.min(CAP, x));
    const clamp = (x) => Math.min(HI, Math.max(LO, x));
    return { command: clamp(+pd.command + lim(m.served.dCommand)), grade: clamp(+pd.grade + lim(m.served.dGrade)), learned: true };
  }

  // ------------------------------------------------------------ hitters
  const DMG_VAL = { hard: 1.0, solid: 0.3, weak: -0.3, whiff: -0.6, foul: 0.0, hit: 0.5, out: -0.2 };
  // the level averages these hitters are measured against (2026 conference and MaxPreps data in the repo; pro is MLB 2010-15)
  const LEVEL_AVG = {
    hs: { AVG: 0.286, OBP: 0.415, SLG: 0.383, K: 0.210, BB: 0.141 },
    college_d3: { AVG: 0.295, OBP: 0.402, SLG: 0.426, K: 0.162, BB: 0.114 },
    college_d1: { AVG: 0.265, OBP: 0.368, SLG: 0.395, K: 0.193, BB: 0.108 },
    mlb: { AVG: 0.255, OBP: 0.320, SLG: 0.405, K: 0.200, BB: 0.079 },
  };
  LEVEL_AVG.travel = LEVEL_AVG.hs;   // travel ball uses the high school numbers (engine v0.7c)
  const isOS = (k) => k === "SL" || k === "CB" || k === "CH";
  function damageEvent(ev) {
    if (ev.res === "whiff") return "whiff";
    if (ev.res === "foul") return "foul";
    if (ev.res === "play") return ev.contact || (["1B", "2B", "3B", "HR"].includes(ev.out) ? "hit" : "out");
    return null;
  }

  /*
   * hitterModel(hitter, events, level) -> { damage: { FB: [score, n], OS: [...], "up-in": [...] }, n, games, prior }
   * Same scoring as the in-game read, so the engine reads it the same way. Older games fade.
   */
  function hitterModel(hitter, events, level, opts = {}) {
    const t0 = opts.now || Date.now();
    const acc = {};
    const add = (key, val, w) => { const a = acc[key] || (acc[key] = [0, 0]); a[0] += val * w; a[1] += w; };
    // season stats give a small lean before we've seen him: worth about three swings
    const prior = statPrior(hitter && hitter.stats, level);
    if (prior) { add("FB", prior.FB, 3); add("OS", prior.OS, 3); }
    const games = new Set();
    for (const ev of events) {
      if (ev.type && ev.type !== "pitch") continue;   // plays between pitches (D0) say nothing about the hitter
      const d = damageEvent(ev); if (!d) continue;
      const w = ageWeight(ev.ts, t0);
      add(isOS(ev.kind) ? "OS" : "FB", DMG_VAL[d], w);
      if (ev.quad) add(ev.quad, DMG_VAL[d], w);
      if (ev.gameId) games.add(ev.gameId);
    }
    const damage = {};
    for (const [k, [s, n]] of Object.entries(acc)) if (n > 0) damage[k] = [Math.round((s / n) * 1000) / 1000, Math.round(n * 10) / 10];
    return { hitterId: hitter && hitter.id, damage, games: games.size, n: events.filter((ev) => !(ev.type && ev.type !== "pitch") && damageEvent(ev)).length, prior };
  }

  // OPS against the level average -> lean on fastballs; strikeout rate against the level -> lean on off-speed
  function statPrior(st, level) {
    if (!st) return null;
    const L = LEVEL_AVG[level] || LEVEL_AVG.college_d3;
    const num = (x) => (x === "" || x === undefined || x === null || Number.isNaN(+x) ? null : +x);
    const obp = num(st.obp), slg = num(st.slg), k = num(st.k_pct), pa = num(st.pa);
    if (obp === null && slg === null && k === null) return null;
    const rel = pa === null ? 0.5 : Math.min(1, pa / 80);   // a 10-PA season says little
    const opsGap = (obp !== null && slg !== null) ? (obp + slg) - (L.OBP + L.SLG) : 0;
    const kGap = k !== null ? k / 100 - L.K : 0;
    const clamp = (x) => Math.max(-0.6, Math.min(0.6, x));
    return { FB: Math.round(clamp(rel * opsGap * 1.5) * 1000) / 1000, OS: Math.round(clamp(rel * (opsGap * 1.0 - kGap * 2.0)) * 1000) / 1000 };
  }

  // what to put in the engine's hitter memory when he steps in; capped so tonight's swings still matter most
  function seedDamage(model, cap = 8) {
    const out = {};
    if (!model || !model.damage) return out;
    for (const [k, [s, n]] of Object.entries(model.damage)) out[k] = [s, Math.min(n, cap)];
    return out;
  }

  // check-in -> today's starting feel for each pitch, and his limit for today
  function checkinFeel(checkin, pitchId) {
    const v = checkin && checkin.conf ? checkin.conf[pitchId] : undefined;
    if (v === undefined || v === null || v === "") return null;
    return Math.round((0.3 + (Math.min(10, Math.max(1, +v)) - 1) / 9 * 0.65) * 100) / 100;   // 1..10 -> 0.30..0.95
  }
  function todayLimitShift(checkin) {   // pitches to take off his fatigue point today
    if (!checkin) return 0;
    let s = 0;
    const arm = +checkin.arm || 0, sleep = +checkin.sleep || 0;
    if (arm && arm < 3) s += (3 - arm) * 10;
    if (sleep && sleep < 6) s += 5;
    return s;
  }

  const api = { VERSION, predict, snapArsenal, snapSituation, category, pitcherModel, adjusted, hitterModel, statPrior, seedDamage,
    checkinFeel, todayLimitShift, LEVEL_AVG, _fit: fit, _loglik: loglik, _rowsFor: rowsFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PCLearn = api;
})(typeof window !== "undefined" ? window : this);
