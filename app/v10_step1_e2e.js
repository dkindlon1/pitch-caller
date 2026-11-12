/*
 * v1.0 Step 1 in the real page (docs/PLAN_v1.0_2026-11-09.md):
 *   #6 / D2  a shake-off means "not that pitch": no spot of it is re-called for the rest of the at-bat, and the next
 *            hitter starts clean;
 *   #2       the at-bat table is re-solved when the bases or outs change mid at-bat, and only then.
 * Run from app/ after a build: node v10_step1_e2e.js
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

  console.log("1. A shake-off keeps that pitch out at every spot for the rest of the at-bat (#6, D2)");
  const r1 = await page.evaluate(() => {
    S.view = "live";
    G().call = null; makeCall();
    const shook = G().call.pitch, slot = slotIdx();
    shakeOff();
    const calls = [];
    for (let i = 0; i < 3; i++) {   // the re-call, then two more pitches in the same at-bat
      G().call = null; makeCall();
      const c = G().call;
      calls.push({ pitch: c.pitch, distPitches: c.dist.map((d) => d.pitch) });
      if (i < 2) record({ result: "ball" });
    }
    const sameSlot = slotIdx() === slot, shakenPA = (G().pa.shaken || []).slice();
    record({ result: "play", out: "GO" });   // the at-bat ends
    G().call = null; makeCall();
    return { shook, calls, sameSlot, shakenPA, nextSlot: slotIdx() !== slot, nextShaken: (G().pa.shaken || []).length,
      nextDist: G().call.dist.map((d) => d.pitch) };
  });
  check(r1.calls.every((c) => c.pitch !== r1.shook && !c.distPitches.includes(r1.shook)),
    `shook off the ${r1.shook}; the next three calls in the at-bat never include it (calls: ${r1.calls.map((c) => c.pitch).join(", ")})`);
  check(r1.sameSlot && JSON.stringify(r1.shakenPA) === JSON.stringify([r1.shook]), `the at-bat remembers the shake-off: ${JSON.stringify(r1.shakenPA)}`);
  check(r1.nextSlot && r1.nextShaken === 0, `the next hitter starts with no shake-offs (his call list: ${[...new Set(r1.nextDist)].join(", ")})`);

  console.log("2. A runner moving or an out mid at-bat re-solves the at-bat table; nothing else does (#2)");
  const r2 = await page.evaluate(() => {
    G().call = null; makeCall();
    const n0 = G().pa.solve.n;
    G().call = null; makeCall();
    const nSame = G().pa.solve.n;
    G().bases = [true, false, false];
    G().call = null; makeCall();
    const nRunner = G().pa.solve.n;
    G().bases = [false, true, false];
    G().call = null; makeCall();
    const nAdvance = G().pa.solve.n;
    G().outs = Math.min(2, G().outs + 1);
    G().call = null; makeCall();
    return { n0, nSame, nRunner, nAdvance, nOut: G().pa.solve.n };
  });
  check(r2.nSame === r2.n0, `no change: same table (solve #${r2.n0} -> #${r2.nSame})`);
  check(r2.nRunner === r2.n0 + 1 && r2.nAdvance === r2.n0 + 2 && r2.nOut === r2.n0 + 3,
    `runner on 1st -> solve #${r2.nRunner}, runner to 2nd -> #${r2.nAdvance}, an out -> #${r2.nOut}`);

  check(!errs.length, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" | ") : ""}`);
  await browser.close(); server.close();
  console.log(fails ? `${fails} FAILED` : "all v1.0 Step 1 browser checks passed");
  process.exit(fails ? 1 : 0);
})();
