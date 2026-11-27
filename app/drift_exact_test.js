/*
 * Build 3 proof 5: drift notes and findings change no call. The same seeded games are charted through the game app
 * before outcome tracking (app/dist at BASE_REF, Build 2's head) and with it (app/dist now: the drift check running after
 * every pitch through the app's own peakRefresh, notes showing: the later games are played worse than the first, which
 * sets his normal). Every logged pitch must be identical field for field, the engine's full mix
 * included (ids and clock stamps aside); the new build is run twice first so a difference can't be noise. The new run
 * must really have computed drift (PCPeak loaded, the Notes button drawn, notes evaluated).
 * Usage (from app/, after python3 build.py): node drift_exact_test.js [games=2]   BASE_REF (default 3e4660b)
 * scripts/test-app.sh runs 4 games (v1.3 Part 10, W = 32: seed 3 first shows a drift note in its 4th game).
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), { execFileSync } = require("child_process");
const { playGame, seededRandomInit } = require("./chart_driver");
const GAMES = +(process.argv[2] || 2), BASE_REF = process.env.BASE_REF || "3e4660b";
const NEW = path.join(__dirname, "dist/pitch-caller.html"), OLD = path.join(os.tmpdir(), `pc-dist-${BASE_REF}.html`);
// audit Nov 27: the base commit's app code with the current engine (base_dist.js), not the base commit's whole dist
fs.copyFileSync(require("./base_dist").baseDistWithCurrentEngine(BASE_REF), OLD);
let fails = 0, checks = 0;
const check = (ok, m) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + m); if (!ok) fails++; };
const ARS = [{ type: "Four-seam", name: "Fastball", kind: "FB", shape: "ride", velo: 87, grade: 3, command: 4, feel: 0.75 },
  { type: "Slider", name: "Slider", kind: "SL", shape: "tight", velo: 79, grade: 3, command: 3, feel: 0.7 }, { type: "Changeup", name: "Changeup", kind: "CH", shape: "fade", velo: 79, grade: 3, command: 3, feel: 0.6 }];
const ARS2 = [{ type: "Sinker", name: "Sinker", kind: "FB", shape: "sink", velo: 85, grade: 3, command: 3, feel: 0.7 }, { type: "12-6 curve", name: "Curve", kind: "CB", shape: "sharp", velo: 72, grade: 4, command: 3, feel: 0.6 }];
// the first game sets his normal; from the second on, his slider and curve are truly much worse than that, so drift
// notes fire during the later games (the same games in both builds: only the drift check differs)
const TRUTH = { Fastball: { command: 2.5 }, Slider: { grade: 3, command: 3 }, Curve: { command: 3 } };
const WORSE = { Fastball: { command: 2.5 }, Slider: { grade: 0.5, command: 1 }, Curve: { grade: 1, command: 1 } };
// v1.3 Part 3: the data fingerprint (v.data) is left out too: it changes with any new table (college_d2 added D2 rows,
// D3's numbers), while every call, probability and snapshot below is still compared field for field.
const DROP = new Set(["ts", "createdAt", "updatedAt", "deviceId"]);
function canon(x, ids) {
  if (Array.isArray(x)) return x.map((v) => canon(v, ids));
  if (x && typeof x === "object") { const o = {}; for (const k of Object.keys(x).sort()) { if (DROP.has(k)) continue; if (k === "v") { const v = Object.assign({}, x.v); delete v.app; delete v.data; o.v = v; continue; } o[k] = canon(x[k], ids); } return o; }
  if (typeof x === "string" && /^[a-z]{2,4}_[0-9a-z]{16,}$/.test(x)) { if (!ids.has(x)) ids.set(x, "ID" + ids.size); return ids.get(x); }
  return x;
}
async function run(browser, dist, seed) {
  const server = http.createServer((q, s) => { s.writeHead(200, { "content-type": "text/html; charset=utf-8" }); s.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${fs.readFileSync(dist, "utf8")}</body></html>`); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const ctx = await browser.newContext(); await ctx.addInitScript(seededRandomInit, seed);
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready && DB.warm === true, null, { timeout: 15000 });
  await page.evaluate(async ({ ARS, ARS2 }) => {
    const mk = async (name, list) => { const p = PCDB.newPitcher(ourTeam().id, { name, hand: "R" }); p.pitches = list.map((d) => PCDB.newPitch(d.type, Object.assign({}, d))); const np = await dbPut("pitchers", p); DB.pitchers.set(np.id, np); return np.id; };
    S.setup.staffIds = [await mk("Drift One", ARS), await mk("Drift Two", ARS2)]; attachStaff(); S.setup.level = "college_d3"; S.setup.logLoc = true; S.setup.inputs = 2;
    S.game = newGame(); S.view = "live"; makeCall(); save(); render();
  }, { ARS, ARS2 });
  let drift = { peak: false, button: false, evaluated: 0, maxNotes: 0 };
  for (let gi = 0; gi < GAMES; gi++) {
    // his normal from the games before this one, loaded the way the app loads it (from the device's own database)
    await page.evaluate(async () => { if (typeof PEAK === "undefined") return; PEAK.base = {}; for (const id of S.setup.staffIds) await peakBaseFor(id); });
    await page.evaluate(playGame, { seed: seed * 7919 + gi * 104729, truth: gi === 0 ? TRUTH : WORSE, changeAt: 5, pCoach: 0.06, pShake: 0.06, pCross: 0.03, drift: true });
    await page.waitForTimeout(300);
    // the notes the app is showing at the end of this game (before End game clears the log), as the drift check left them
    const d = await page.evaluate(() => ({ peak: typeof PCPeak !== "undefined", button: !!document.getElementById("peak-btn"), evaluated: typeof PEAK !== "undefined" ? Object.keys(PEAK.base).length : 0,
      notes: window.__peakMax || 0 }));
    drift = { peak: drift.peak || d.peak, button: drift.button || d.button, evaluated: Math.max(drift.evaluated, d.evaluated), maxNotes: Math.max(drift.maxNotes, d.notes) };
  }

  const evs = await page.evaluate(async () => (await DB.D.all("events", true)).sort((a, b) => (a.gameId + String(a.seq).padStart(6, "0")).localeCompare(b.gameId + String(b.seq).padStart(6, "0"))));
  await ctx.close(); server.close();
  return { evs, errs, drift };
}
function compare(label, A, B) {
  const ia = new Map(), ib = new Map(), a = A.evs.map((e) => canon(e, ia)), b = B.evs.map((e) => canon(e, ib));
  check(a.length === b.length && a.length > 0, `${label}: same number of logged events (${a.length} vs ${b.length})`);
  let first = -1; for (let i = 0; i < Math.min(a.length, b.length); i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) { first = i; break; }
  if (first >= 0) console.log(`    first difference at event ${first}: ${Object.keys(a[first]).filter((k) => JSON.stringify(a[first][k]) !== JSON.stringify(b[first][k])).join(", ")}`);
  check(first < 0, `${label}: every event identical field for field, the engine's full mix included`);
  return a.filter((e) => e.type === "pitch").length;
}
(async () => {
  const browser = await chromium.launch(); let total = 0;
  for (const seed of [3, 29]) {
    console.log(`seed ${seed}, ${GAMES} games`);
    const n1 = await run(browser, NEW, seed), n2 = await run(browser, NEW, seed), o = await run(browser, OLD, seed);
    check(![...n1.errs, ...o.errs].length, `no page errors${[...n1.errs, ...o.errs].length ? ": " + [...n1.errs, ...o.errs].join(" | ") : ""}`);
    check(n1.drift.peak && n1.drift.button && n1.drift.evaluated >= 1 && !o.drift.peak, `the new build ran the drift check (baselines for ${n1.drift.evaluated} pitcher(s), Notes button drawn); the old build has none`);
    check(n1.drift.maxNotes > 0, `drift notes really showed during the compared games (up to ${n1.drift.maxNotes} at once on the Notes badge, the drift check run after every pitch)`);
    compare("new vs new (deterministic)", n1, n2);
    total += compare("before vs with outcome tracking", o, n1);
  }
  await browser.close();
  console.log(`${total} pitches compared; ${checks - fails}/${checks} checks passed`);
  if (fails) { console.log(`${fails} drift exact-match check(s) FAILED`); process.exit(1); }
  console.log("drift exact match: passed");
})().catch((e) => { console.error(e); process.exit(1); });
