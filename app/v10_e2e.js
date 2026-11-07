/*
 * v1.0 in the real page (PLAN_v1.0.md 3.1, 3.2, 3.4, 3.8, 6.2). Run from app/: node v10_e2e.js
 * The at-bat history built from the pitch log (a foul straight back keeps that exact call off the next pitch), the plan
 * line, a stolen base mid at-bat re-solving the plan, the fallback flag, and why lines without a doubled period.
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = process.env.DIST || path.join(__dirname, "dist/pitch-caller.html");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`);
});
const waitCall = (page) => page.waitForFunction(() => G().call && G().call.why !== null, null, { timeout: 8000 }).catch(() => {});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(url); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 10000 });
  await page.evaluate(() => { S.setup.inputs = 3; S.view = "live"; G().call = null; makeCall(); save(); render(); });
  await waitCall(page);

  console.log("1. The plan line is on the call card");
  const p1 = await page.evaluate(() => ({ plan: G().call.plan, shown: document.querySelectorAll(".planline").length }));
  check(p1.plan && p1.plan.startsWith("Plan: ") && p1.shown === 1, `"${p1.plan}" shown (${p1.shown})`);

  console.log("2. History from the pitch log: after a foul straight back, that exact call is off the next pitch");
  const p2 = await page.evaluate(async () => {
    const c = G().call, x = [c.pitch, c.quad];
    record({ result: "foul", read: "back" });
    await new Promise((r) => setTimeout(r, 400));
    const s = situation(), r = E.v08.callRules(arsenal(), s);
    return { x, hist: s.history, out: r[0].includes(x[0] + "|" + x[1]), rules: r[1],
      dist: (G().call.dist || []).some((d) => d.pitch === x[0] && d.quad === x[1]) };
  });
  const last = p2.hist[p2.hist.length - 1] || [];
  check(p2.hist.length === 1 && last[0] === p2.x[0] && last[1] === p2.x[1] && last[2] === "foul" && last[3] === "back",
    `history ${JSON.stringify(p2.hist)}`);
  check(!p2.out && p2.rules.RP2 && !p2.dist, `RP2 keeps ${p2.x.join(" ")} out of the allowed calls and the call mix`);
  await waitCall(page);
  const why2 = await page.evaluate(() => G().call.why);
  check(why2 === "He fouled it straight back. Don't go back there yet.", `why line "${why2}"`);
  const txt = await page.locator(".whyline").first().textContent();
  check(!txt.includes(".."), `no doubled period on the card ("${txt.trim()}")`);

  console.log("3. A stolen base mid at-bat re-solves the plan");
  const p3 = await page.evaluate(async () => {
    const g = G(); g.bases = [true, false, false]; G().call = null; makeCall();
    const n0 = g.pa.solve.n;
    g.bases = [false, true, false]; G().call = null; makeCall();   // runner steals second
    const n1 = g.pa.solve.n;
    G().call = null; makeCall();                                  // nothing changed: no re-solve
    return { n0, n1, n2: g.pa.solve.n, frozen: g.pa.solve.frozen.bases };
  });
  check(p3.n1 === p3.n0 + 1 && p3.n2 === p3.n1 && p3.frozen === "010", `solve ${p3.n0} -> ${p3.n1} after the steal, ${p3.n2} with nothing new (frozen bases ${p3.frozen})`);

  console.log("4. Nothing trusted: the fallback flag shows");
  const p4 = await page.evaluate(async () => {
    const g = G(), ars = arsenal();
    for (const p of ars) p.conf = 0.2;
    const keep = arsenal; window.arsenal = () => ars;
    G().call = null; makeCall(); render();
    await new Promise((r) => setTimeout(r, 300)); render();
    const out = { fb: G().call.fallback, shown: document.querySelectorAll(".fallback-note").length, why: G().call.why,
      pitches: new Set(G().call.dist.map((d) => d.pitch)).size };
    window.arsenal = keep;
    return out;
  });
  check(p4.fb && p4.shown === 1 && p4.pitches === 1, `fallback flag ${p4.fb}, shown ${p4.shown}, one pitch in the mix (${p4.pitches})`);
  check((p4.why || "").startsWith("Nothing's working. Going with what's landing."), `why line "${p4.why}"`);

  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.join(" | ") : ""}`);
  await browser.close(); server.close();
  console.log(fails ? `${fails} v1.0 app check(s) failed` : "all v1.0 app checks passed");
  process.exit(fails ? 1 : 0);
})();
