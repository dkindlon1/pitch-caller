/*
 * Build 2 proof: the opponent database's new fields change no call. The same seeded games are charted through this
 * build's game app twice against the same opponent and lineup: once with bare hitters, once with every new field set
 * on every hitter (ratings 1 / 2 / 3 and Unknown, the zone grid, pitch checkboxes, speed / small ball, class year,
 * notes, custom values, spray, a merge alias) and on the team (tendencies, custom values). Every logged pitch must be
 * identical field for field (ids and clock stamps aside). The bare run is repeated first, so a difference can't be noise.
 * Usage (from app/, after python3 build.py): node opponent_exact_test.js [games, default 2]
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const { playGame, seededRandomInit } = require("./chart_driver");

const GAMES = +(process.argv[2] || 2), DIST = path.join(__dirname, "dist/pitch-caller.html");
let fails = 0, checks = 0;
const check = (ok, msg) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const ARS = [{ type: "Four-seam", name: "Fastball", kind: "FB", shape: "ride", velo: 87, grade: 3, command: 4, feel: 0.75 },
  { type: "Slider", name: "Slider", kind: "SL", shape: "tight", velo: 79, grade: 3, command: 3, feel: 0.7 },
  { type: "Changeup", name: "Changeup", kind: "CH", shape: "fade", velo: 79, grade: 3, command: 3, feel: 0.6 }];
const TRUTH = { Fastball: { command: 2.5 }, Slider: { grade: 4 } };
const BATS = ["R", "L", "R", "S", "L", "R", "R", "L", "R"];
// every new field, on every hitter (cycling values so each one appears)
const FULL = (i) => ({ ratings: { power: [1, 2, 3, "unknown"][i % 4], contact: [3, "unknown", 1, 2][i % 4], speed: ["unknown", 3, 2, 1][i % 4] },
  zone: { "1,1": "hot", "3,3": "cold", "0,2": i % 2 ? "hot" : "cold", "4,2": "cold", [`${1 + (i % 3)},${1 + ((i + 1) % 3)}`]: "hot" },
  pitchFlags: { crushesFB: true, chasesSL: i % 2 === 0, chasesCB: true, cantHitCH: true, lateOnVelo: true, hitsOSHard: true },
  smallBall: { bunt: true, steal: i % 2 === 1 }, classYear: ["FR", "SO", "JR", "SR"][i % 4], notes: `Scouting note ${i}: sits on the fastball.`,
  custom: { f1: true, f2: "SR", f3: { "1,1": "hot" } }, aliases: [`old_${i}`], scoutSpray: ["pull", "mixed", "oppo", "unknown"][i % 4] });
const DROP = new Set(["ts", "createdAt", "updatedAt", "deviceId"]);
function canon(x, ids) {
  if (Array.isArray(x)) return x.map((v) => canon(v, ids));
  if (x && typeof x === "object") { const o = {}; for (const k of Object.keys(x).sort()) if (!DROP.has(k)) o[k] = canon(x[k], ids); return o; }
  if (typeof x === "string" && /^[a-z]{2,4}_[0-9a-z]{16,}$/.test(x)) { if (!ids.has(x)) ids.set(x, "ID" + ids.size); return ids.get(x); }
  return x;
}

async function run(browser, full, seed) {
  const server = http.createServer((q, s) => { s.writeHead(200, { "content-type": "text/html; charset=utf-8" }); s.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const ctx = await browser.newContext(); await ctx.addInitScript(seededRandomInit, seed);
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready && DB.warm === true, null, { timeout: 15000 });
  await page.evaluate(async ({ ARS, BATS, full, FULLsrc }) => {
    const FULL = eval(FULLsrc);
    const p = PCDB.newPitcher(ourTeam().id, { name: "Exact", hand: "R" }); p.pitches = ARS.map((d) => PCDB.newPitch(d.type, Object.assign({}, d)));
    const np = await dbPut("pitchers", p); DB.pitchers.set(np.id, np);
    const t = await dbPut("teams", Object.assign({ name: "Rivals", isOurs: false, level: "college_d3", notes: "" }, full ? { tendencies: { aggressive: true, patient: true, bunts: true, runs: true, hitAndRun: true }, custom: { t1: "zone team" } } : {}));
    DB.teams.set(t.id, t);
    for (let i = 0; i < 9; i++) {
      let h = PCDB.newHitter(t.id, { name: `Hitter ${i + 1}`, bats: BATS[i], number: String(i + 1), scoutTags: { approach: i % 3 === 0 ? "aggressive" : undefined } });
      if (!h.scoutTags.approach) delete h.scoutTags;
      if (full) { const f = FULL(i); const spray = f.scoutSpray; delete f.scoutSpray; h = Object.assign(h, f); h.scoutTags = Object.assign({}, h.scoutTags, { spray }); }
      const nh = await dbPut("hitters", h); DB.hitters.set(nh.id, nh);
    }
    S.setup.staffIds = [np.id]; attachStaff(); S.setup.level = "college_d3"; S.setup.logLoc = true; S.setup.inputs = 3;
    S.setup.lineup.forEach((b) => { b.hitterId = null; b.name = ""; }); useOpponent(t.id);
    S.game = newGame(); S.view = "live"; makeCall(); save(); render();
  }, { ARS, BATS, full, FULLsrc: `(${FULL.toString()})` });
  await page.waitForTimeout(300);
  for (let gi = 0; gi < GAMES; gi++) await page.evaluate(playGame, { seed: seed * 7919 + gi * 104729, truth: TRUTH, pCoach: 0.08, pShake: 0.08, pCross: 0.04 });
  const evs = await page.evaluate(async () => (await DB.D.all("events", true)).sort((a, b) => (a.gameId + String(a.seq).padStart(6, "0")).localeCompare(b.gameId + String(b.seq).padStart(6, "0"))));
  const hitters = await page.evaluate(() => [...DB.hitters.values()].map((h) => Object.keys(h)));
  await ctx.close(); server.close();
  return { evs, errs, hitters };
}
function compare(label, A, B) {
  const ia = new Map(), ib = new Map(), a = A.evs.map((e) => canon(e, ia)), b = B.evs.map((e) => canon(e, ib));
  check(a.length === b.length && a.length > 0, `${label}: same number of logged events (${a.length} vs ${b.length})`);
  let first = -1; for (let i = 0; i < Math.min(a.length, b.length); i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) { first = i; break; }
  if (first >= 0) { const d = Object.keys(a[first]).filter((k) => JSON.stringify(a[first][k]) !== JSON.stringify(b[first][k])); console.log(`    first difference at event ${first}: ${d.join(", ")}`); }
  check(first < 0, `${label}: every event identical field for field (calls, mixes, snapshots, results)`);
  return a.filter((e) => e.type === "pitch").length;
}
(async () => {
  const browser = await chromium.launch();
  let total = 0;
  for (const seed of [5, 17]) {
    console.log(`seed ${seed}, ${GAMES} games`);
    const bare = await run(browser, false, seed), bare2 = await run(browser, false, seed), full = await run(browser, true, seed);
    check(![...bare.errs, ...full.errs].length, "no page errors");
    check(full.hitters.every((k) => ["ratings", "zone", "pitchFlags", "smallBall", "classYear", "custom", "aliases"].every((f) => k.includes(f))), "the full run really carries every new field on every hitter");
    compare("bare vs bare (deterministic)", bare, bare2);
    total += compare("bare vs every new field set", bare, full);
  }
  await browser.close();
  console.log(`${total} pitches compared; ${checks - fails}/${checks} checks passed`);
  if (fails) { console.log(`${fails} opponent exact-match check(s) FAILED`); process.exit(1); }
  console.log("opponent fields exact match: passed");
})().catch((e) => { console.error(e); process.exit(1); });
