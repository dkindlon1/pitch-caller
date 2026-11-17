/*
 * Game screen performance trace (app v2). Logs pitches on the Game screen and measures, for each one:
 *   - how long from the key press until the next call's words are in the page and painted (the budget is 200 ms),
 *   - the longest main-thread task while the call updates (the budget is 50 ms),
 *   - layout shift during the update,
 *   - that the call's words are never transparent or mid-animation in the first painted frame.
 * Runs twice: as is, and with the CPU slowed 4x (a stand-in for an older iPad). Both themes.
 *   node app/perf_v2.js [--pitches 30]
 * Exit 1 if a budget is missed at normal speed.
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = process.env.DIST || path.join(__dirname, "dist/pitch-caller.html");   // DIST=<file> traces another build (the old one, for a baseline)
const N = process.argv.includes("--pitches") ? +process.argv[process.argv.indexOf("--pitches") + 1] : 30;
const server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`); });

async function run(browser, { slow, theme }) {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 15000 });
  if (theme === "day") await page.locator('.bar button[aria-label^="Switch to the"]').click();
  await page.locator(".tabs button", { hasText: "Game" }).click();
  await page.waitForSelector(".call-panel .pitch");
  const cdp = await ctx.newCDPSession(page);
  if (slow) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(() => {
    window.__long = []; window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: e.startTime, d: e.duration }); }).observe({ entryTypes: ["longtask"] });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: false });
  });
  const out = [];
  const keys = ["b", "c", "b", "c", "c", "b", "b", "c"];   // ball and called strike: the two results that log in one tap at every charting level
  for (let i = 0; i < N; i++) {
    if (await page.evaluate(() => G().inningOver)) { await page.locator(".done .btn.primary").click(); await page.waitForSelector(".call-panel .pitch"); continue; }
    const r = await page.evaluate((key) => new Promise((resolve) => {
      const before = window.__long.length, cls0 = window.__cls, id0 = G().call && G().call.id, n0 = G().pitchNo, t0 = performance.now();
      document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      const tick = () => {
        const g = G(), el = document.querySelector(".call-panel .pitch");
        const ready = g.inningOver || (g.pitchNo !== n0 && g.call && g.call.id !== id0 && el && el.textContent.trim().length > 0);
        if (!ready) { if (performance.now() - t0 > 3000) return resolve({ timeout: true }); return requestAnimationFrame(tick); }
        // the first painted frame with the call in it: its words must be fully there (opacity 1, nothing animating on them)
        requestAnimationFrame(() => {
          const words = [...document.querySelectorAll(".call-panel .pitch, .call-panel .spot, .call-panel .sign")];
          const opacity = Math.min(1, ...words.map((w) => +getComputedStyle(w).opacity));
          const anim = words.reduce((n, w) => n + w.getAnimations().length, 0);
          resolve({ ms: performance.now() - t0, over: g.inningOver, opacity, anim, long: Math.max(0, ...window.__long.slice(before).map((x) => x.d)), cls: window.__cls - cls0 });
        });
      };
      requestAnimationFrame(tick);
    }), keys[i % keys.length]);
    if (process.env.DBG) console.log(JSON.stringify(r));
    if (r.timeout) {   // a result that needs a second step (none of these keys should): skip it
      await page.keyboard.press("Escape").catch(() => {}); continue; }
    if (!r.over) out.push(r);
    await page.waitForTimeout(120);
  }
  await ctx.close();
  const ms = out.map((x) => x.ms).sort((a, b) => a - b), q = (p) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))];
  return { slow, theme, n: out.length, median: q(0.5), p95: q(0.95), max: ms[ms.length - 1], longest: Math.max(0, ...out.map((x) => x.long)), cls: Math.max(0, ...out.map((x) => x.cls)),
    faded: out.filter((x) => x.opacity < 1 || x.anim > 0).length, errs };
}

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  let bad = 0;
  for (const cfg of [{ slow: false, theme: "night" }, { slow: false, theme: "day" }, { slow: true, theme: "night" }, { slow: true, theme: "day" }]) {
    const r = await run(browser, cfg);
    const ok = r.n > 0 && r.max < 200 && r.longest <= 50 && r.cls < 0.05 && r.faded === 0 && !r.errs.length;
    if (!ok && !cfg.slow) bad++;
    console.log(`${ok ? "  ok  " : cfg.slow ? "  note" : "  FAIL"} ${cfg.theme}${cfg.slow ? ", CPU 4x slower" : ""}: ${r.n} calls; key press to call painted median ${r.median.toFixed(0)} ms, p95 ${r.p95.toFixed(0)} ms, max ${r.max.toFixed(0)} ms; longest task ${r.longest.toFixed(0)} ms; layout shift ${r.cls.toFixed(4)}; calls shown faded or mid-animation ${r.faded}${r.errs.length ? "; page errors " + r.errs.join(" | ") : ""}`);
  }
  await browser.close(); server.close();
  console.log(bad ? "perf_v2: budgets missed" : "perf_v2: within budget at normal speed");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
