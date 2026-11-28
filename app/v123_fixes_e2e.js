/*
 * v1.2.3 (Nov 14): the game-app fixes from the end-to-end check (docs/REVIEW_e2e_v1.2.2_2026-11-14.md), in the real page.
 *   - one called strike moves today's umpire under 0.25 (v1.2.2: 0.82 on a heart-of-the-plate strike);
 *   - the radar box shows on a confirmed pitch only when "Log radar readings" is on;
 *   - the Bullpen card counts the batters he faced (v1.2.2 read a key that's no longer used, so it said 0);
 *   - the third out clears the bases (no stranded runners or steal buttons on the three-outs screen);
 *   - a coach's own call on a pitch shaken off this at-bat isn't graded "In the engine's mix", and the runs wording says
 *     "worse than";
 *   - the setup screen reads the current version line ("PitchIQ 1.5.1 · engine 1.3.1" since V1.3).
 * Run from app/ after a build: node v123_fixes_e2e.js
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
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const errs = [];
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(url); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 8000 });
  await page.waitForTimeout(300);
  const key = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(120); };
  const logPitch = async () => { const b = page.getByRole("button", { name: "Log pitch" }); if (await b.count()) { await b.first().click(); await page.waitForTimeout(120); } };

  // 1. umpire: one called strike on the first pitch
  await key("c");
  const u1 = await page.evaluate(() => E.v08.umpEstimate(G().takes || [], S.setup.level, 0));
  check(u1 > 0 && u1 < 0.25, `one called strike moves the umpire to ${u1.toFixed(3)} (under 0.25, the most one simulated take moves it; v1.2.2: up to 0.82 on a heart-of-the-plate strike)`);

  // 2. radar box: off by default, on when the setting is on
  await key("f");   // a foul at a hitter-reads tier opens the detail panel
  const radarOff = await page.getByText("Radar, mph (optional)").count();
  await logPitch();
  await page.evaluate(() => { S.setup.radar = true; save(); render(); });
  await key("f");
  const radarOn = await page.getByText("Radar, mph (optional)").count();
  await logPitch();
  await page.evaluate(() => { S.setup.radar = false; save(); render(); });
  check(radarOff === 0 && radarOn === 1, `radar box: ${radarOff} with radar logging off, ${radarOn} with it on`);

  // 3. finish this hitter (0-2 now: strikeout), then get a runner on and make three outs
  await key("s"); await logPitch();
  await page.evaluate(() => { const g = G(); g.bases = [true, true, false]; save(); render(); });
  for (let i = 0; i < 2; i++) { await key("c"); await key("c"); await key("s"); await logPitch(); }
  const st = await page.evaluate(() => ({ over: !!G().inningOver, bases: G().bases.slice(), steal: document.body.innerText.includes("Holding") }));
  check(st.over && !st.bases.some(Boolean) && !st.steal, `three outs: inning over ${st.over}, bases ${JSON.stringify(st.bases)}, steal buttons ${st.steal}`);

  // 4. bullpen card: batters faced
  await page.getByRole("button", { name: "Data" }).first().click(); await page.waitForTimeout(250);
  const pen = await page.evaluate(() => { const m = document.body.innerText.match(/(\d+) pitches?, (\d+) faced/); return m ? [+m[1], +m[2]] : null; });
  check(pen && pen[1] === 3, `bullpen card after three strikeouts: ${pen && pen[0]} pitches, ${pen && pen[1]} faced (3)`);
  await page.getByRole("button", { name: "Game" }).first().click(); await page.waitForTimeout(200);
  await page.getByRole("button", { name: /^Take the field/ }).click(); await page.waitForTimeout(200);

  // 5. coach's own call on a shaken-off pitch
  const first = await page.evaluate(() => G().call.pitch);
  await page.getByRole("button", { name: "He shook it off" }).click(); await page.waitForTimeout(250);
  await page.getByRole("button", { name: "Call my own" }).click(); await page.waitForTimeout(150);
  await page.locator(".pick .seg").first().getByRole("button", { name: new RegExp(first) }).click();
  await page.locator(".pick .seg").nth(1).getByRole("button").first().click();
  await page.getByRole("button", { name: "Grade and use my call" }).click(); await page.waitForTimeout(250);
  const v = await page.evaluate(() => ({ verdict: G().call.verdict, why: document.querySelector(".call-panel")?.innerText || "" }));
  check(v.verdict !== "In the engine's mix", `${first} after he shook it off, called by the coach: "${v.verdict}"`);
  check(!/runs more than/.test(v.why), "the runs wording no longer says \"more than\"");

  // 6. version line
  await page.getByRole("button", { name: "Setup" }).first().click(); await page.waitForTimeout(200);
  const ver = await page.evaluate(() => (document.body.innerText.match(/PitchIQ [\d.]+ · engine [\d.]+/) || [""])[0]);
  check(ver === "PitchIQ 1.5.1 · engine 1.3.1", `setup screen version line: ${JSON.stringify(ver)}`);

  check(!errs.length, `no page errors${errs.length ? ": " + errs.join(" | ") : ""}`);
  await browser.close(); server.close();
  console.log(fails ? `v123_fixes_e2e: ${fails} failed` : "v123_fixes_e2e: all passed");
  process.exit(fails ? 1 : 0);
})();
