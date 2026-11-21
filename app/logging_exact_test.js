/*
 * Build 1, Part 1 proof: logging the engine's full mix changes no call.
 * The same seeded games are charted through the old build (app/dist at BASE_REF, before the logging change) and the new
 * build (app/dist now): the app's Math.random is seeded, and chart_driver.js draws results with its own seeded generator.
 * Every logged pitch (the call, its probability, who chose it, the situation and arsenal snapshots, the prediction,
 * the v0.8 inputs, the result) must be identical, field for field; only the new fields and per-run values (ids, clock
 * stamps, the app version string) are left out. The new build is run twice first, so a difference can't be noise.
 * The new fields are then checked: the full mix has the call's own share, sums to 1, is sorted, the styled mix equals
 * it, style applied is "none" and strength null; a coach's call keeps the engine's mix.
 *
 * Usage (from app/, after python3 build.py): node logging_exact_test.js [games per config, default 2]
 *   BASE_REF=<git ref> (default 8ee2fdc: main before Build 1)
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), { execFileSync } = require("child_process");
const { playGame, seededRandomInit } = require("./chart_driver");

const GAMES = +(process.argv[2] || 2);
const BASE_REF = process.env.BASE_REF || "8ee2fdc";
const NEW = path.join(__dirname, "dist/pitch-caller.html");
const OLD = path.join(os.tmpdir(), `pc-dist-${BASE_REF}.html`);
fs.writeFileSync(OLD, execFileSync("git", ["show", `${BASE_REF}:app/dist/pitch-caller.html`], { cwd: __dirname, maxBuffer: 64 << 20 }));

let fails = 0, checks = 0;
const check = (ok, msg) => { checks++; if (!ok) { fails++; console.log("  FAIL " + msg); } else console.log("  ok   " + msg); };

const ARS = [{ type: "Four-seam", name: "Fastball", kind: "FB", shape: "ride", velo: 87, grade: 3, command: 4, feel: 0.75 },
  { type: "Slider", name: "Slider", kind: "SL", shape: "tight", velo: 79, grade: 3, command: 3, feel: 0.7 },
  { type: "Changeup", name: "Changeup", kind: "CH", shape: "fade", velo: 79, grade: 3, command: 3, feel: 0.6 }];
const ARS2 = [{ type: "Sinker", name: "Sinker", kind: "FB", shape: "sink", velo: 85, grade: 3, command: 3, feel: 0.7 },
  { type: "12-6 curve", name: "Curve", kind: "CB", shape: "sharp", velo: 72, grade: 4, command: 3, feel: 0.6 }];
const TRUTH = { Fastball: { grade: 3, command: 2.5 }, Slider: { grade: 4, command: 3 }, Changeup: { grade: 3, command: 3 }, Sinker: { grade: 3, command: 3 }, Curve: { grade: 3, command: 2.5 } };
const CONFIGS = [
  { name: "contact logged, locations, two pitchers", seed: 11, inputs: 2, logLoc: true, two: true, changeAt: 4 },
  { name: "results only, no locations", seed: 23, inputs: 1, logLoc: false, two: false },
  { name: "full detail, locations, coach-heavy", seed: 37, inputs: 3, logLoc: true, two: true, changeAtPitch: 55, pCoach: 0.12, pShake: 0.1, pCross: 0.06 },
];

// per-run values: ids made from the clock and crypto, clock stamps, the app version string, and Build 1's new fields
// v1.3 Part 3: the data fingerprint (v.data) is left out too: it changes with any new table (college_d2 added D2 rows,
// D3's numbers), while every call, probability and snapshot below is still compared field for field.
const DROP = new Set(["ts", "createdAt", "updatedAt", "deviceId", "mix", "styledMix", "styleApplied", "strength"]);
function canon(x, ids) {
  if (Array.isArray(x)) return x.map((v) => canon(v, ids));
  if (x && typeof x === "object") {
    const o = {};
    for (const k of Object.keys(x).sort()) { if (DROP.has(k)) continue; if (k === "v") { const v = Object.assign({}, x.v); delete v.app; delete v.data; o.v = v; continue; } o[k] = canon(x[k], ids); }
    return o;
  }
  if (typeof x === "string" && /^[a-z]{2,4}_[0-9a-z]{16,}$/.test(x)) { if (!ids.has(x)) ids.set(x, "ID" + ids.size); return ids.get(x); }
  return x;
}

async function run(browser, dist, cfg) {
  const server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${fs.readFileSync(dist, "utf8")}</body></html>`); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const ctx = await browser.newContext();
  await ctx.addInitScript(seededRandomInit, cfg.seed);
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready && DB.warm === true, null, { timeout: 15000 });
  await page.evaluate(async ({ ars, ars2, cfg }) => {
    const mk = async (name, list) => { const p = PCDB.newPitcher(ourTeam().id, { name, hand: "R" }); p.pitches = list.map((d) => PCDB.newPitch(d.type, Object.assign({}, d))); const np = await dbPut("pitchers", p); DB.pitchers.set(np.id, np); return np.id; };
    const ids = [await mk("Exact One", ars)]; if (cfg.two) ids.push(await mk("Exact Two", ars2));
    S.setup.staffIds = ids; attachStaff(); S.setup.level = "college_d3"; S.setup.logLoc = cfg.logLoc; S.setup.inputs = cfg.inputs;
    S.game = newGame(); S.view = "live"; makeCall(); save(); render();
  }, { ars: ARS, ars2: ARS2, cfg });
  for (let gi = 0; gi < GAMES; gi++)
    await page.evaluate(playGame, Object.assign({ seed: cfg.seed * 7919 + gi * 104729, truth: TRUTH }, cfg));
  const out = await page.evaluate(async () => {
    const evs = (await DB.D.all("events", true)).sort((a, b) => (a.gameId + String(a.seq).padStart(6, "0")).localeCompare(b.gameId + String(b.seq).padStart(6, "0")));
    const games = (await DB.D.all("games")).map((g) => g.id);
    return { evs, gameOrder: games, lastCall: G().call };
  });
  await ctx.close(); server.close();
  return { evs: out.evs, lastCall: out.lastCall, errs };
}

function compare(label, A, B) {
  const ia = new Map(), ib = new Map();
  const a = A.evs.map((e) => canon(e, ia)), b = B.evs.map((e) => canon(e, ib));
  check(a.length === b.length && a.length > 0, `${label}: same number of logged events (${a.length} vs ${b.length})`);
  let first = -1;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) { first = i; break; }
  if (first >= 0) {
    const ka = a[first], kb = b[first], diff = [...new Set([...Object.keys(ka), ...Object.keys(kb)])].filter((k) => JSON.stringify(ka[k]) !== JSON.stringify(kb[k]));
    console.log(`    first difference at event ${first} (seq ${ka.seq}): fields ${diff.join(", ")}`);
    for (const k of diff.slice(0, 3)) console.log(`      ${k}: ${JSON.stringify(ka[k]).slice(0, 160)}\n      ${" ".repeat(k.length)}  ${JSON.stringify(kb[k]).slice(0, 160)}`);
  }
  check(first < 0, `${label}: every event identical field for field (calls, probabilities, who chose, snapshots, results)`);
  return a.filter((e) => e.type === "pitch").length;
}

(async () => {
  const browser = await chromium.launch();
  let total = 0, coachSeen = 0, recallSeen = 0, crossSeen = 0;
  for (const cfg of CONFIGS) {
    console.log(`config: ${cfg.name} (seed ${cfg.seed}, ${GAMES} games)`);
    const n1 = await run(browser, NEW, cfg), n2 = await run(browser, NEW, cfg), o = await run(browser, OLD, cfg);
    check(!n1.errs.length && !n2.errs.length && !o.errs.length, `no page errors${[...n1.errs, ...o.errs].length ? ": " + [...n1.errs, ...o.errs].join(" | ") : ""}`);
    compare("new vs new (the run is deterministic)", n1, n2);
    const np = compare("old build vs new build", o, n1);
    total += np;
    // the new fields
    const pitches = n1.evs.filter((e) => e.type === "pitch" && !e.deletedAt);
    let bad = [];
    for (const e of pitches) {
      if (!Array.isArray(e.mix) || !e.mix.length) { bad.push(`${e.seq}: no mix`); continue; }
      const sum = e.mix.reduce((t, m) => t + m[3], 0);
      if (Math.abs(sum - 1) > 1e-9) bad.push(`${e.seq}: mix sums to ${sum}`);
      for (let i = 1; i < e.mix.length; i++) if (e.mix[i][3] > e.mix[i - 1][3]) { bad.push(`${e.seq}: mix not sorted`); break; }
      if (e.mix.some((m) => !m[0] || typeof m[1] !== "string" || typeof m[2] !== "string" || !(m[3] > 0))) bad.push(`${e.seq}: malformed entry`);
      if (JSON.stringify(e.styledMix) !== JSON.stringify(e.mix)) bad.push(`${e.seq}: styled mix differs`);
      if (e.styleApplied !== "none" || e.strength !== null) bad.push(`${e.seq}: styleApplied/strength`);
      const own = e.mix.find((m) => m[1] === e.pitchName && m[2] === e.quad);
      if (e.choice !== "coach" && (!own || own[3] !== e.prob)) bad.push(`${e.seq}: the call's own share ${own && own[3]} != prob ${e.prob}`);
      if (e.choice === "coach") coachSeen++; if (e.choice === "recall") recallSeen++; if (e.thrown) crossSeen++;
    }
    check(!bad.length, `${pitches.length} pitches: full mix logged, sums to 1, sorted, the call's own share = its logged probability, styled mix = mix, style "none", strength null${bad.length ? " | " + bad.slice(0, 5).join("; ") : ""}`);
    const lc = n1.lastCall;
    check(lc && Array.isArray(lc.mix) && JSON.stringify(lc.mix.slice(0, 5).map(([p, q, pr]) => ({ pitch: p, quad: q, prob: pr }))) === JSON.stringify(lc.dist), "the call on screen: its top 5 (what the app always showed) are the first 5 of the full mix");
    check(o.evs.filter((e) => e.type === "pitch").every((e) => e.mix === undefined && e.styleApplied === undefined), "the old build logs none of the new fields (so the comparison above really compares two builds)");
  }
  check(coachSeen > 0 && recallSeen > 0 && crossSeen > 0, `the games covered coach calls (${coachSeen}), re-calls after a shake-off (${recallSeen}) and cross-ups (${crossSeen})`);
  await browser.close();
  console.log(`${total} pitches compared; ${checks - fails}/${checks} checks passed`);
  if (fails) { console.log(`${fails} logging exact-match check(s) FAILED`); process.exit(1); }
  console.log("logging exact match: passed");
})().catch((e) => { console.error(e); process.exit(1); });
