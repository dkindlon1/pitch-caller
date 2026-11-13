/*
 * Simulated seasons for testing the learner (spec section 13). Games are played pitch by pitch the way the app logs
 * them: tonight's confidence and "landing today" evolve live, the pitch lands in a zone and then the result is drawn
 * given that zone (so location and result are linked as in the engine), and events come out in the app's format.
 *
 * The TRUE pitcher (talent, traits, his real strike rate) generates what happens. The APP's knowledge (the coach's
 * grades) is what gets logged in the snapshots, exactly like the real app.
 */
const E = require("./engine.js");
E.init(require("./engine_data.json"));
const L = require("./learner.js");

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const DAY = 864e5;

/*
 * season(opts):
 *   pitches: [{ id, name, kind, shape, velo, usage }]                  his arsenal (usage = share of pitches)
 *   entered: { [name]: { command, grade } }                             the coach's grades (what the app logs)
 *   truth(gameIdx, ctx): { [name]: { command, grade, traits } }         who he really is in that game
 *   games, pas (batters per game), level, seed, loc (log location), contact: "all" | "selective" | "none",
 *   charterError (share of logged entries wrong), runnersShare, sameShare, coachCalls ({ name, when(form) }),
 *   formSd (hidden per-game form on stuff, for the coach-calls world)
 *   cells (v1.2 Step 3): { lean: { [name]: [lean_x, lean_z] }, sd, directional, hand } logs a landing cell per pitch:
 *     the landed point is Normal(target + lean, sd) in the pitcher's frame (inches), on the app's 5x5 catcher's-view grid;
 *     past the grid it's a directional "Way off" cell (index -1 / 5) when directional, else "Way off" with no cell. The
 *     hidden lean is also on the true pitch, so the zone and result draws carry it.
 */
function season(o) {
  const r = rng(o.seed || 1), level = o.level || "college_d3";
  const pitches = o.pitches, names = pitches.map((p) => p.name);
  const start = (o.startTs || Date.UTC(2026, 1, 20)), events = [];
  const pick = (ws) => { let x = r() * ws.reduce((a, w) => a + w, 0); for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x <= 0) return i; } return ws.length - 1; };
  const QW = { "up-in": 0.13, "up-away": 0.17, "down-in": 0.17, "down-away": 0.27, middle: 0.14, chase: 0.12 };
  for (let gi = 0; gi < o.games; gi++) {
    const ts = start + gi * (o.gapDays || 4) * DAY, gameId = `g${gi}`;
    const tr = o.truth(gi);
    const form = {}; for (const nm of names) form[nm] = o.formSd ? o.formSd * (r() + r() + r() - 1.5) * 2 : 0;
    // the true pitcher tonight, and the app's view of him (coach grades)
    const trueSpec = (nm) => { const p = pitches.find((x) => x.name === nm), t = tr[nm];
      const ln = o.cells && o.cells.lean && o.cells.lean[nm];
      return Object.assign({ name: nm, kind: p.kind, shape: p.shape, velo: p.velo, command: t.command, grade: t.grade + form[nm], traits: t.traits || null },
        ln ? { lean_x: ln[0], lean_z: ln[1] } : {}); };
    const srTrue = {}; for (const nm of names) srTrue[nm] = L.strikeRate(E, trueSpec(nm), level);
    const conf = {}, confApp = {}, land = {}, feel = 0.7;
    for (const nm of names) { conf[nm] = feel; confApp[nm] = feel; }
    let pc = 0, bf = 0, n = 0, outs = 0, inning = 1;
    for (let pa = 0; pa < o.pas; pa++) {
      const same = r() < (o.sameShare ?? 0.55);
      const bases = r() < (o.runnersShare ?? 0.4) ? [r() < 0.8, r() < 0.35, r() < 0.2] : [false, false, false];
      let b = 0, k = 0, last = null, ended = false;
      while (!ended) {
        // what gets thrown: the engine-ish mix, or a coach call driven by the hidden form
        let nm = names[pick(pitches.map((p) => p.usage))], choice = "engine";
        if (o.coachCalls && r() < 0.25) { const cc = o.coachCalls; if (form[cc.name] > 0.2) { nm = cc.name; choice = "coach"; } }
        const quad = Object.keys(QW)[pick(Object.values(QW))];
        const sit = E.Situation({ balls: b, strikes: k, outs, bases, inning, margin: 0, pitch_count: pc, batters_faced: bf, level, same_side: same,
          last, timing: {}, hitter_damage: {}, landing_today: JSON.parse(JSON.stringify(land)) });
        // truth
        const arsT = names.map((x) => E.Pitch(Object.assign(trueSpec(x), { conf: conf[x], base_conf: feel, strike_rate: srTrue[x], strike_ref: L.strikeRef(E, trueSpec(x), level) })));
        const pT = arsT.find((x) => x.name === nm);
        const bz = {}; E.outcomeProbs(pT, quad, sit, arsT, null, bz);
        const zs = Object.keys(bz), z = zs[pick(zs.map((zz) => bz[zz].land))];
        const cats = ["ball", "wp_ball", "hbp", "cstrike", "whiff", "foul", "weak", "solid", "hard"];
        let cat = cats[pick(cats.map((c) => bz[z][c]))];
        if (cat === "wp_ball") cat = "ball";
        let res = ["weak", "solid", "hard"].includes(cat) ? "play" : cat;
        // what the charter logs (with mistakes)
        let logRes = res, logZone = z;
        if (o.charterError && r() < o.charterError) logRes = ["ball", "cstrike", "foul", "whiff"][Math.floor(r() * 4)];
        if (o.charterError && r() < o.charterError) logZone = ["heart", "edge", "off", "noncomp"][Math.floor(r() * 4)];
        let contact;
        if (logRes === "play") {
          const c = res === "play" ? cat : "solid";
          if (o.contact === "all" || o.contact === undefined) contact = c;
          else if (o.contact === "selective") contact = c === "hard" || r() < 0.4 ? c : undefined;
        }
        const out = logRes === "play" ? (contact === "hard" || r() < 0.3 ? "1B" : "OUT") : undefined;
        // the app's snapshot: coach grades, the app's confidence
        const arsApp = names.map((x) => { const p = pitches.find((y) => y.name === x); return { name: x, kind: p.kind, shape: p.shape, velo: p.velo,
          grade: o.entered[x].grade, command: o.entered[x].command, conf: confApp[x], base_conf: feel, slot: "three-quarter", height_ft: 6.1,
          ivb: null, hb: null, release_offset_in: [0, 0] }; });   // the same fields the app's snapshot carries
        // count and plate appearance
        let end = false;
        if (logRes === "ball") { b++; if (b === 4) end = true; }
        else if (logRes === "hbp") end = true;
        else if (logRes === "cstrike" || logRes === "whiff") { k++; if (k === 3) end = true; }
        else if (logRes === "foul") { if (k < 2) k++; }
        else if (logRes === "play") end = true;
        if (logRes === "play" && out === "OUT" || k === 3) outs++;
        n++; pc++;
        const pd = pitches.find((x) => x.name === nm);
        let locCell, cellLoc;
        if (o.cells && quad !== "chase") {   // v1.2 Step 3: a landing cell from the hidden lean
          const hand = o.cells.hand || "R", ln = (o.cells.lean || {})[nm] || [0, 0], sd = o.cells.sd || 8;
          const T = { "up-in": [20 / 3, 8], "up-away": [-20 / 3, 8], "down-in": [20 / 3, -8], "down-away": [-20 / 3, -8], middle: [0, 0] }[quad];
          const bRight = same ? hand === "R" : hand === "L";
          const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
          const armOfCv = (x) => (hand === "L" ? x : -x);
          const tx = armOfCv(bRight ? -T[0] : T[0]), x = tx + ln[0] + sd * gauss(), zz = T[1] + ln[1] + sd * gauss();
          const xcv = hand === "L" ? x : -x;
          const col = xcv < -16 ? -1 : xcv < -10 ? 0 : xcv < -10 / 3 ? 1 : xcv < 10 / 3 ? 2 : xcv < 10 ? 3 : xcv < 16 ? 4 : 5;
          const row = zz > 18 ? -1 : zz > 12 ? 0 : zz > 4 ? 1 : zz > -4 ? 2 : zz > -12 ? 3 : zz > -18 ? 4 : 5;
          const way = col < 0 || col > 4 || row < 0 || row > 4;
          if (way && !o.cells.directional) { locCell = null; cellLoc = "noncomp"; }
          else { locCell = [row, col]; cellLoc = way ? "noncomp" : (row === 0 || row === 4 || col === 0 || col === 4) ? "off" : (row === 2 && col === 2) ? "heart" : "edge"; }
        }
        events.push({ id: `${gameId}-${n}`, gameId, n, ts: ts + n * 1000, pitcherId: "p1", pitchId: pd.id, pitchName: nm, kind: pd.kind, quad,
          res: logRes, contact, out, loc: o.cells && quad !== "chase" ? cellLoc : (o.loc ? logZone : undefined), end, choice, coach: choice === "coach",
          ...(o.cells ? { locCell, ph: o.cells.hand || "R", bs: (same ? (o.cells.hand || "R") === "R" : (o.cells.hand || "R") === "L") ? "R" : "L" } : {}),
          sit: L.statPrior ? JSON.parse(JSON.stringify(Object.assign({}, sit, { wild_true: undefined }))) : sit, ars: arsApp });
        // in-game updates: the truth uses his real strike rate, the app uses the default (it only knows the grades)
        // v1.0 Step 3: the app's landing record, [strikes, expected strikes, pitches] over non-chase targets, expectation
        // from the app's own view of the pitch before the result; a chase ball is no confidence debit unless way off; no HBP debit
        if (quad !== "chase") {
          const arsE = arsApp.map((x) => E.Pitch(Object.assign({}, x)));
          land[nm] = E.landingRecord(land[nm], !(res === "ball" || res === "hbp"), E.expectedStrike(arsE.find((x) => x.name === nm), quad, sit, arsE));
        }
        const ce = res === "ball" ? E.ballConfEvent(quad, z) : res === "cstrike" ? "cstrike" : res === "whiff" ? "whiff" : cat === "hard" ? "hard" : null;
        if (ce) { const q = E.Pitch(Object.assign(trueSpec(nm), { conf: conf[nm], base_conf: feel, strike_rate: srTrue[nm], strike_ref: L.strikeRef(E, trueSpec(nm), level) })); E.updateConfidence(q, ce); conf[nm] = q.conf; }
        const lce = logRes === "ball" ? E.ballConfEvent(quad, o.loc ? logZone : undefined) : logRes === "cstrike" ? "cstrike" : logRes === "whiff" ? "whiff" : contact === "hard" ? "hard" : null;
        if (lce) { const q = E.Pitch({ name: nm, kind: pd.kind, grade: 3, command: 3, conf: confApp[nm], base_conf: feel }); E.updateConfidence(q, lce); confApp[nm] = q.conf; }
        last = [nm, quad, res === "whiff" ? "whiff" : res];
        if (end) {
          for (const x of names) { conf[x] += 0.15 * (feel - conf[x]); confApp[x] += 0.15 * (feel - confApp[x]); }
          bf++; ended = true;
          if (outs >= 3) { outs = 0; inning++; }
        }
      }
    }
  }
  return events;
}

module.exports = { season, rng, E, L };
