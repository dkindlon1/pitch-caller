/*
 * v1.0 Step 3 in the real page (docs/PLAN_v1.0_2026-11-09.md):
 *   #4  a chase-target ball (no location logged, or "just off") changes neither his confidence nor the landing record;
 *       a ball on a zone target does both; an HBP is not a confidence debit;
 *   #4  the landing record is [strikes, expected strikes, pitches] over non-chase targets;
 *   compat: an open game saved before v1.0 ([strikes, pitches] pairs) still calls and keeps counting.
 * Run from app/ after a build: node v10_step3_e2e.js
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

  console.log("1. Chase balls and an HBP leave his confidence and the landing record alone; a zone ball counts");
  const r1 = await page.evaluate(() => {
    S.view = "live";
    const g = G();
    g.call = null; makeCall();
    const name = g.call.pitch;
    const conf = () => arsenal().find((x) => x.name === name).conf;
    const rec = () => JSON.stringify(((g.land || {})[pKey()] || {})[name] || null);
    const out = {};
    // a chase ball, no location
    g.call = Object.assign({}, g.call, { pitch: name, quad: "chase" }); g.balls = 0; g.strikes = 2;
    let c0 = conf(), l0 = rec(); record({ result: "ball" });
    out.chaseNoLoc = { dConf: conf() - c0, sameLand: rec() === l0 };
    // a chase ball that landed just off
    g.call = null; makeCall(); g.call = Object.assign({}, g.call, { pitch: name, quad: "chase" }); g.balls = 0; g.strikes = 2;
    c0 = conf(); l0 = rec(); record({ result: "ball", loc: "off" });
    out.chaseOff = { dConf: conf() - c0, sameLand: rec() === l0 };
    // a ball on a zone target
    g.call = null; makeCall(); g.call = Object.assign({}, g.call, { pitch: name, quad: "down-away" }); g.balls = 0; g.strikes = 0;
    c0 = conf(); l0 = rec(); record({ result: "ball" });
    const after = JSON.parse(rec());
    out.zone = { dConf: conf() - c0, land: after, prev: JSON.parse(l0) };
    // an HBP on a zone target
    g.call = null; makeCall(); g.call = Object.assign({}, g.call, { pitch: name, quad: "up-in" });
    c0 = conf(); const base = arsenal().find((x) => x.name === name).base_conf; record({ result: "hbp" });
    // the at-bat ends, so the usual between-hitters drift (15% back toward his bullpen feel) applies; nothing else should
    out.hbp = { dConf: conf() - c0, drift: 0.15 * (base - c0) };
    return { name, out };
  });
  const o = r1.out;
  check(Math.abs(o.chaseNoLoc.dConf) < 1e-12 && o.chaseNoLoc.sameLand, `chase ball, no location: confidence ${o.chaseNoLoc.dConf.toFixed(3)}, landing record unchanged ${o.chaseNoLoc.sameLand}`);
  check(Math.abs(o.chaseOff.dConf) < 1e-12 && o.chaseOff.sameLand, `chase ball just off: confidence ${o.chaseOff.dConf.toFixed(3)}, landing record unchanged ${o.chaseOff.sameLand}`);
  const z = o.zone.land, zp = o.zone.prev || [0, 0, 0];
  check(o.zone.dConf < 0 && Array.isArray(z) && z.length === 3 && z[0] === zp[0] && z[2] === zp[2] + 1 && z[1] > zp[1] && z[1] - zp[1] < 1,
    `zone ball: confidence ${o.zone.dConf.toFixed(3)}, record ${JSON.stringify(zp)} -> [${z.map((x) => +(+x).toFixed(3)).join(", ")}] (one pitch, no strike, his expectation added)`);
  check(Math.abs(o.hbp.dConf - o.hbp.drift) < 1e-9, `HBP: confidence ${o.hbp.dConf >= 0 ? "+" : ""}${o.hbp.dConf.toFixed(4)}, exactly the between-hitters drift ${o.hbp.drift.toFixed(4)} (no "ball" debit; a debit would add -0.020)`);

  console.log("2. An open game saved before v1.0 ([strikes, pitches] pairs) still calls and keeps counting");
  const r2 = await page.evaluate(() => {
    const g = G();
    g.call = null; makeCall();
    const name = g.call.pitch;
    g.land = g.land || {}; g.land[pKey()] = { [name]: [3, 5] };   // the old format
    g.balls = 0; g.strikes = 0;
    g.call = null; makeCall();
    const called = !!g.call;
    g.call = Object.assign({}, g.call, { pitch: name, quad: "middle" });
    record({ result: "cstrike" });
    return { called, rec: g.land[pKey()][name] };
  });
  check(r2.called, "the engine calls with an old-format record in the game");
  check(Array.isArray(r2.rec) && r2.rec.length === 3 && r2.rec[0] === 4 && r2.rec[2] === 6,
    `the next pitch converts it and counts on: [${(r2.rec || []).map((x) => +(+x).toFixed(3)).join(", ")}] (was [3, 5])`);

  check(!errs.length, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" | ") : ""}`);
  await browser.close(); server.close();
  console.log(fails ? `${fails} FAILED` : "all v1.0 Step 3 browser checks passed");
  process.exit(fails ? 1 : 0);
})();
