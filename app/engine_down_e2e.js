// Audit (Nov 27): the engine fails mid-game (mode 1: callV08 throws; mode 2: solveTable and gradeCall too). The stale call must
// leave the screen, the coach gives his own sign from the pick box, pitches record and survive a reload, and the engine
// comes back by itself on the next pitch. Run from app/: node engine_down_e2e.js 1 && node engine_down_e2e.js 2
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs");
const DIST = require("path").join(__dirname, "dist/pitch-caller.html");
const MODE = process.argv[2] || "1";
const server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`); });
let fails = 0; const check = (ok, msg) => { console.log(`${ok ? "[PASS]" : "[FAIL]"} ${msg}`); if (!ok) fails++; };
(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx.addInitScript((MODE) => {
    let api;
    Object.defineProperty(window, "PitchEngine", { configurable: true, get: () => api, set: (v) => {
      const boom = () => localStorage.getItem("boom") === "1";
      const wrap = (o, k) => { const f = o[k]; o[k] = function () { if (boom()) throw new Error("simulated engine error"); return f.apply(this, arguments); }; };
      wrap(v, "callV08");
      if (MODE === "2") { wrap(v.v08, "solveTable"); wrap(v.v08, "gradeCall"); }
      api = v; } });
  }, MODE);
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  const st = () => page.evaluate(() => ({ call: G().call ? `${G().call.pitch}/${G().call.quad}${G().call.coach ? "/coach" : ""}` : null,
    count: `${G().balls}-${G().strikes}`, pno: G().pitchNo, shown: (document.querySelector(".strip .cell .v") || {}).innerText,
    txt: (document.querySelector(".call-panel") || {}).innerText || "" }));
  await page.goto(url); await page.waitForTimeout(1500);
  let s0 = await st(); check(!!s0.call, `start: engine call on screen (${s0.call})`);
  await page.keyboard.press("b"); await page.waitForTimeout(600);
  await page.evaluate(() => localStorage.setItem("boom", "1"));
  await page.keyboard.press("b"); await page.waitForTimeout(900);
  let s1 = await st();
  check(s1.count === "2-0" && (s1.shown || "").startsWith("2"), `after 2nd ball with engine down: count in memory ${s1.count}, on screen ${JSON.stringify((s1.shown||"").slice(0,3))}`);
  check(s1.call === null && /No engine call/.test(s1.txt), `no stale call; the panel says so (call ${s1.call})`);
  const btns = await page.locator(".call-panel .pick button").count();
  check(btns > 0, `pick box offered in the call panel (${btns} buttons)`);
  await page.locator(".call-panel .pick .seg").nth(0).locator("button").first().click();
  await page.locator(".call-panel .pick .seg").nth(1).locator("button").first().click();
  await page.getByRole("button", { name: "Grade and use my call" }).click(); await page.waitForTimeout(500);
  let s2 = await st(); check(s2.call && s2.call.endsWith("/coach"), `coach's own call is on screen (${s2.call})`);
  await page.keyboard.press("c"); await page.waitForTimeout(900);
  let s3 = await st(); check(s3.count === "2-1" && s3.pno === s1.pno + 1, `called strike recorded: ${s3.count}, pitch ${s3.pno}`);
  check(s3.call === null && /No engine call/.test(s3.txt), `still down: asks for his own sign again (call ${s3.call})`);
  await page.reload(); await page.waitForTimeout(1500);
  let s4 = await st(); check(s4.count === "2-1" && s4.pno === s3.pno, `after reload the pitches are kept: ${s4.count}, pitch ${s4.pno}`);
  await page.evaluate(() => localStorage.removeItem("boom"));
  // engine healthy again: the coach records a pitch with his own call, then the engine is back
  await page.locator(".call-panel .pick .seg").nth(0).locator("button").first().click();
  await page.locator(".call-panel .pick .seg").nth(1).locator("button").first().click();
  await page.getByRole("button", { name: "Grade and use my call" }).click(); await page.waitForTimeout(500);
  await page.keyboard.press("b"); await page.waitForTimeout(900);
  let s5 = await st(); check(s5.call && !s5.call.endsWith("/coach") && s5.count === "3-1", `engine back: its call on screen at ${s5.count} (${s5.call})`);
  check(errs.length === 0, `no uncaught page errors (${errs.length}: ${errs.slice(0, 2).join(" | ")})`);
  console.log(fails ? `FAIL: ${fails}` : "PASS: engine-down path");
  await b.close(); server.close(); process.exit(fails ? 1 : 0);
})();
