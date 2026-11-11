/*
 * v1.0 Step 5 in the real page (docs/PLAN_v1.0_2026-11-09.md, Step 5):
 *   #24 the hitter's look moves toward where the catcher logged the pitch (grid row), not the called target;
 *   #7  a hard hit is keyed on the logged landing spot (as the matchup memory was fitted), else the called target;
 *   #7  the engine reads only the cross-game damage seed: tonight's swings don't feed hitter_damage (the matchup memory
 *       owns in-game memory); the hitter card's running read still updates;
 *   #20 the cross-game seed is centered only when the hitter has grades on.
 * Run from app/ after a build: node v10_step5_e2e.js
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = process.env.DIST || path.join(__dirname, "dist/pitch-caller.html");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`);
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  const errs = [];
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 10000 });

  console.log("1. #24: the look follows the logged landing row");
  const r1 = await page.evaluate(() => {
    S.view = "live";
    const g = G(), out = {};
    for (const [tag, extra] of [["target", {}], ["logged", { loc: "off", locCell: [0, 2] }]]) {
      g.balls = 0; g.strikes = 0; g.call = null; makeCall();
      g.call = Object.assign({}, g.call, { quad: "down-away" });
      const before = g.pa && g.pa.look ? g.pa.look[1] : null;
      record(Object.assign({ result: "ball" }, extra));
      out[tag] = { before, after: g.pa.look[1] };
    }
    return out;
  });
  check(r1.target.after < (r1.target.before ?? 2.5) + 1e-9, `called down-away, nothing logged: look height ${(r1.target.before ?? 2.5).toFixed(2)} -> ${r1.target.after.toFixed(2)} (down)`);
  check(r1.logged.after > r1.logged.before, `called down-away, caught in the top row: look height ${r1.logged.before.toFixed(2)} -> ${r1.logged.after.toFixed(2)} (up)`);

  console.log("2. #7: a hard hit is keyed on the logged spot; without a logged spot, on the called target");
  const r2 = await page.evaluate(() => {
    S.setup.inputs = Math.max(2, S.setup.inputs || 0);
    const g = G(), out = {};
    const fb = arsenal().find((x) => x.kind === "FB");
    const right = (() => { const h = batterDef().hand; return h === "S" ? pitcherDef().hand !== "R" : h !== "L"; })();
    for (const [tag, extra] of [["logged", { locCell: [1, right ? 0 : 4], loc: "edge" }], ["target", {}]]) {
      g.balls = 0; g.strikes = 0; g.call = null; makeCall();
      g.call = Object.assign({}, g.call, { pitch: fb.name, quad: "down-away" });
      g.pa.mm = {};
      record(Object.assign({ result: "play", contact: "hard", out: "OUT" }, extra));
      const m = ((g.mm || {})[pKey()] || {});
      out[tag] = JSON.stringify(m);
    }
    return { out, kind: fb.kind };
  });
  check(r2.out.logged.includes(`"hard|${r2.kind}|up-in"`), `hard hit caught up and in, called down-away: memory ${r2.out.logged}`);
  check(r2.out.target.includes(`"hard|${r2.kind}|down-away"`), `hard hit with no spot logged: keyed on the called target (${r2.out.target})`);

  console.log("3. #7: the engine reads only the cross-game seed; tonight's swings update the card, not hitter_damage");
  const r3 = await page.evaluate(() => {
    const g = G();
    g.balls = 0; g.strikes = 0; g.call = null; makeCall();
    const kn = know(), seed = JSON.stringify(kn.seed || {}), before = JSON.stringify(situation().hitter_damage);
    record({ result: "whiff" });
    return { seed, before, after: JSON.stringify(situation().hitter_damage), card: JSON.stringify(know().damage) };
  });
  check(r3.before === r3.seed && r3.after === r3.seed, `hitter_damage stays the seed ${r3.seed} after a whiff (was ${r3.before}, now ${r3.after})`);
  check(r3.card !== r3.seed, `the hitter card's running read still moves: ${r3.card}`);

  console.log("4. #20: the cross-game seed is centered only when the hitter has grades on");
  const r4 = await page.evaluate(() => {
    const b = batterDef(), k = G().know, i = String(slotIdx());
    const saved = { id: b.hitterId, grades: b.grades, k: k[i] };
    b.hitterId = "e2e-hitter";
    DB.models.set("h2:e2e-hitter", { damage: { FB: [0.6, 10], OS: [0.2, 10] } });   // a learned cross-game model
    const out = {};
    try {
      b.grades = {}; delete k[i]; out.noGrades = know().seed;
      b.grades = { w: 4 }; delete k[i]; out.grades = know().seed;
    } finally {
      DB.models.delete("h2:e2e-hitter"); b.hitterId = saved.id; b.grades = saved.grades; k[i] = saved.k;
    }
    return out;
  });
  check(r4.noGrades.FB && Math.abs(r4.noGrades.FB[0] - 0.6) < 1e-9, `no grades: seed kept as learned (FB ${JSON.stringify(r4.noGrades.FB)})`);
  check(r4.grades.FB && Math.abs(r4.grades.FB[0] - 0.2) < 1e-9, `grades on: seed centered (FB ${JSON.stringify(r4.grades.FB)}; mean 0.4 taken out)`);

  check(!errs.length, `no page errors${errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""}`);
  await browser.close(); server.close();
  console.log(fails ? `FAIL: ${fails} check(s)` : "PASS: v1.0 Step 5 app checks");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
