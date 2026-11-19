/*
 * Build 1: one game charted through the real game app, for the logging exact-match test (logging_exact_test.js) and the
 * seeded season (season_seed.js). Everything that decides a call is the app's own code (makeCall, shakeOff, the "Call
 * my own" box, changePitcher, record, finishGameRecord); only each pitch's result and where it ended up are drawn here,
 * from the engine with the pitcher's true grades, as app/sim_backup.js does.
 *
 * playGame runs inside the page (page.evaluate(playGame, opts)) and uses no new app field, so it drives an older build
 * exactly the same way. Its own draws come from a seeded generator; the app's own Math.random is seeded by the caller.
 *
 * opts: { seed, truth: {pitchName: {grade, command}}, innings = 6, maxPitches = 140, pShake = 0.06, pCoach = 0.05,
 *         pCross = 0.03, pNoLoc = 0.08, pNoContact = 0.1, changeAt = null (inning to bring in the next pitcher),
 *         changeAtPitch = null (or after this many pitches) }
 */
async function playGame(opts) {
  const o = Object.assign({ innings: 6, maxPitches: 140, pShake: 0.06, pCoach: 0.05, pCross: 0.03, pNoLoc: 0.08, pNoContact: 0.1, changeAt: null, changeAtPitch: null }, opts);
  let s = o.seed >>> 0 || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const pickW = (items, w) => { let t = 0; for (const x of w) t += x; let u = rnd() * t; for (let i = 0; i < items.length; i++) { u -= w[i]; if (u <= 0) return items[i]; } return items[items.length - 1]; };
  // the called spot as a cell of the 5x5 catcher's-view grid (the inverse of the engine's locQuad), for drawing a landing
  const target = (quad, kind, bRight) => {
    const inC = bRight ? 1 : 3, awC = bRight ? 3 : 1;
    return { middle: [2, 2], "down-middle": [3, 2], "up-in": [1, inC], "up-away": [1, awC], "down-in": [3, inC], "down-away": [3, awC],
      chase: E.isFastball ? (E.isFastball(kind) ? [0, 2] : [4, 2]) : [4, 2] }[quad] || [2, 2];
  };
  const RING = { heart: [[2, 2]], edge: [], off: [], noncomp: [[2, -1], [-1, 2], [5, 2], [2, 5]] };
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) { const z = r === 0 || r === 4 || c === 0 || c === 4 ? "off" : r === 2 && c === 2 ? "heart" : "edge"; if (z !== "heart") RING[z].push([r, c]); }
  const landCell = (z, t) => { const cs = RING[z]; return pickW(cs, cs.map(([r, c]) => 1 / (1 + (r - t[0]) ** 2 + (c - t[1]) ** 2))).slice(); };
  let pitches = 0, changed = false;
  while (G().inning <= o.innings && pitches < o.maxPitches) {
    const g = G();
    if (g.inningOver) { if (g.inning >= o.innings) break; startNextInning(); continue; }
    if (!changed && S.setup.staff.length > 1 && ((o.changeAt && g.inning >= o.changeAt && !g.pa) || (o.changeAtPitch && pitches >= o.changeAtPitch && !g.pa))) { changePitcher(); changed = true; }
    makeCall();
    if (rnd() < o.pShake) { shakeOff(); makeCall(); }                  // a shake-off: the re-call is logged as such
    if (rnd() < o.pCoach) {                                              // the coach calls his own through the "Call my own" box
      const ars = arsenal(), p = ars[Math.floor(rnd() * ars.length)], q = E.QUADS[Math.floor(rnd() * E.QUADS.length)];
      pickMode = true; pickSel = { pitch: p.name, quad: q }; render();
      const btn = [...document.querySelectorAll(".pick button.btn.primary")].find((b) => !b.disabled);
      if (btn) btn.click(); else { pickMode = false; render(); }
    }
    const call = g.call, ars = arsenal();
    let thrownName = call.pitch;
    if (ars.length > 1 && rnd() < o.pCross) { const others = ars.filter((x) => x.name !== call.pitch); thrownName = others[Math.floor(rnd() * others.length)].name; }
    const trueArs = ars.map((p) => E.Pitch(Object.assign({}, p, (o.truth || {})[p.name] || {})));
    const tp = trueArs.find((p) => p.name === thrownName);
    const bz = {}; E.outcomeProbs(tp, call.quad, situation(), trueArs, null, bz);
    let r = rnd(), z = "noncomp";
    for (const k of ["heart", "edge", "off", "noncomp"]) { r -= bz[k].land; if (r <= 0) { z = k; break; } }
    const m = bz[z], tot = m.ball + m.wp_ball + m.hbp + m.cstrike + m.whiff + m.foul + m.weak + m.solid + m.hard;
    let u = rnd() * tot, cat = "hard";
    for (const k of ["ball", "wp_ball", "hbp", "cstrike", "whiff", "foul", "weak", "solid", "hard"]) { u -= m[k]; if (u <= 0) { cat = k; break; } }
    const res = {};
    if (cat === "ball" || cat === "wp_ball") res.result = "ball";
    else if (cat === "hbp") res.result = "hbp";
    else if (["cstrike", "whiff", "foul"].includes(cat)) res.result = cat;
    else {
      res.result = "play";
      if (S.setup.inputs >= 2 && rnd() >= o.pNoContact) res.contact = cat;
      const q = rnd(), hitP = { weak: 0.12, solid: 0.35, hard: 0.6 }[cat];
      res.out = q > hitP ? "OUT" : cat === "hard" && q < 0.1 ? "HR" : cat === "hard" && q < 0.25 ? "2B" : "1B";
    }
    if (cat === "wp_ball") res.wp = "wp";
    if (thrownName !== call.pitch) res.thrown = thrownName;
    if (S.setup.logLoc && rnd() >= o.pNoLoc) {
      const bh = batterDef().hand, bRight = bh === "S" ? (pitcherDef().hand || "R") !== "R" : bh !== "L";
      res.loc = z; res.locCell = landCell(z, target(call.quad, tp.kind, bRight));
    }
    record(res); pitches++;
    // o.drift (Build 3, drift_exact_test): run the app's own drift check after the pitch, as its render does in a real
    // game, and keep the most notes it showed at once; a build without it (before outcome tracking) skips this
    if (o.drift && typeof peakRefresh === "function") { peakRefresh(); window.__peakMax = Math.max(window.__peakMax || 0, PEAK.notes.length); }
    if (G().inningOver && G().inning >= o.innings) break;
  }
  const c = await finishGameRecord(); archiveGame(); S.game = newGame(); S.view = "live"; makeCall(); save();
  if (c && c.learn) await learnAfterGame(c.learn);
  return { pitches, located: c && c.located };
}

// the app's own Math.random, seeded, for an exact-match run: installed before the app's scripts run
function seededRandomInit(seed) {
  let a = seed >>> 0 || 1;
  Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

module.exports = { playGame, seededRandomInit };
