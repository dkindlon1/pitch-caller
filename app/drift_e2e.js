/*
 * Build 3: the drift notes in the game app. Two earlier games give a pitcher his normal (on this device, no signal
 * needed); then, mid-game, his slider stops missing bats. The Notes button in the game bar shows a count badge (no
 * sound, no pop-up: nothing opens on its own); tapping it lists the note in plain words; it holds through a reload;
 * Undo takes it back off when the pitches behind it are undone. Nothing about the call changes (drift_exact_test).
 * Usage (from app/, after python3 build.py): node drift_e2e.js
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const { playGame, seededRandomInit } = require("./chart_driver");
const DIST = path.join(__dirname, "dist/pitch-caller.html");
let fails = 0; const check = (ok, m) => { console.log((ok ? "  ok   " : "  FAIL ") + m); if (!ok) fails++; };
(async () => {
  const server = http.createServer((q, s) => { s.writeHead(200, { "content-type": "text/html; charset=utf-8" }); s.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx.addInitScript(seededRandomInit, 11);
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  let sounds = 0; await page.exposeFunction("__sound", () => sounds++);
  await page.addInitScript(() => { const A = window.Audio; window.Audio = function () { window.__sound(); return new A(); }; if (navigator.vibrate) navigator.vibrate = () => (window.__sound(), true); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready && DB.warm === true, null, { timeout: 15000 });
  await page.evaluate(async () => {
    const p = PCDB.newPitcher(ourTeam().id, { name: "Drift Ace", hand: "R" });
    p.pitches = [PCDB.newPitch("Four-seam", { name: "Fastball", kind: "FB", grade: 3, command: 3 }), PCDB.newPitch("Slider", { name: "Slider", kind: "SL", grade: 4, command: 3 })];
    const np = await dbPut("pitchers", p); DB.pitchers.set(np.id, np);
    S.setup.staffIds = [np.id]; attachStaff(); S.setup.level = "college_d3"; S.setup.logLoc = false; S.setup.inputs = 2; S.game = newGame(); S.view = "live"; makeCall(); save(); render();
  });
  for (let g = 0; g < 2; g++) await page.evaluate(playGame, { seed: 100 + g, truth: { Slider: { grade: 4.5 } }, pCoach: 0, pShake: 0, pCross: 0 });
  // tonight: every slider swing misses nothing (fouls and balls in play only), as if his slider has gone flat
  const tonight = await page.evaluate(async () => {
    S.view = "live"; render(); let n = 0;
    while (n < 70 && !G().inningOver) {
      makeCall(); const c = G().call;
      const res = c.pitch === "Slider" ? (n % 3 ? { result: "foul" } : { result: "play", out: "OUT", contact: "solid" }) : (n % 2 ? { result: "ball" } : { result: "cstrike" });
      record(res); n++;
      if (G().inningOver) startNextInning();
    }
    render(); await new Promise((r) => setTimeout(r, 400));
    return { n, sliders: G().log.filter((l) => l.pitch === "Slider").length };
  });
  await page.waitForTimeout(500);
  const btn = page.locator("#peak-btn");
  const label = await btn.getAttribute("aria-label");
  check(await btn.count() === 1 && /Notes: [1-9]/.test(label || ""), `the Notes button shows a count (${label}) after ${tonight.sliders} sliders with no whiffs`);
  check(await page.locator("#peak-panel").isHidden(), "nothing opens on its own (no pop-up)");
  check(sounds === 0, "no sound or vibration");
  const SHOT = process.env.SHOTS; if (SHOT) { require("fs").mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: SHOT + "/game-badge__1180.png" }); }
  await btn.click();
  const text = await page.locator("#peak-panel").innerText();
  if (SHOT) { await page.screenshot({ path: SHOT + "/game-panel__1180.png" }); await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300); await page.screenshot({ path: SHOT + "/game-panel__390.png" }); await page.setViewportSize({ width: 1180, height: 820 }); }
  check(/Drift Ace/.test(text) && /slider isn't missing bats like usual \(0 whiffs on \d+ swings vs about \d+%\)/.test(text), `the note in plain words: "${text.split("\n")[0]}"`);
  // Undo (its history lives in memory, so before any reload): take the pitches back and the note goes with them
  await page.evaluate(async () => { for (let i = 0; i < 70; i++) undoLast(); render(); await new Promise((r) => setTimeout(r, 300)); });
  await page.waitForTimeout(300);
  check(((await page.locator("#peak-btn").getAttribute("aria-label")) || "") === "Notes: none", "undo the pitches behind it and the note goes");
  // the same flat slider again, then a reload: worked out again from the game on this device
  await page.evaluate(async () => {
    let n = 0; while (n < 70 && !G().inningOver) { makeCall(); const c = G().call; record(c.pitch === "Slider" ? (n % 3 ? { result: "foul" } : { result: "play", out: "OUT", contact: "solid" }) : (n % 2 ? { result: "ball" } : { result: "cstrike" })); n++; if (G().inningOver) startNextInning(); }
    render(); await new Promise((r) => setTimeout(r, 400));
  });
  await page.reload(); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 15000 }); await page.waitForTimeout(1500);
  check(/Notes: [1-9]/.test((await page.locator("#peak-btn").getAttribute("aria-label")) || ""), "after a reload it's still there (worked out again from the game on this device)");
  check(!errs.length, `no page errors${errs.length ? ": " + errs.join(" | ") : ""}`);
  await browser.close(); server.close();
  console.log(fails ? `${fails} drift e2e check(s) FAILED` : "drift e2e: all passed"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
