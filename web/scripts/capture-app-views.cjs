// Run from web/ after building the app (app/dist): node scripts/capture-app-views.cjs
// The real app's Roster and Data screens for the site's "A game with PitchIQ": a fresh app (the sample staff), a game
// played through the app's own result keys and buttons with a seeded random (so it's repeatable), then the Roster screen
// (the starter's arsenal and check-in: before the game) and the Data screen (this game's numbers: after it). The call
// screen (during) is public/marketing/app-call-before.png from capture-app-call.cjs.
const { chromium } = require(process.env.PW || "playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = path.join(__dirname, "../../app/dist/pitch-caller.html");
const OUT = path.join(__dirname, "../public/marketing");
const server = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  r.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`); });

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (pairs) => { let x = rnd(), acc = 0; for (const [v, w] of pairs) { acc += w; if (x <= acc) return v; } return pairs[pairs.length - 1][0]; };

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 });
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(url); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 15000 });
  // the app draws its calls with Math.random: seed it too, so the game (and the screens) come out the same every time
  await page.evaluate(() => { if (window.__SEED !== 0) { let sd = 11; Math.random = () => (sd = (sd * 16807) % 2147483647) / 2147483647; } S.view = "live"; G().call = null; makeCall(); save(); render(); });

  const visible = (re) => page.evaluate((src) => { const r = new RegExp(src); return [...document.querySelectorAll("button")].some((b) => b.offsetParent && r.test(b.textContent.trim())); }, re.source);
  const click = (re) => page.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll("button")].find((x) => x.offsetParent && r.test(x.textContent.trim().replace(/\s+/g, " "))); if (b) b.click(); return !!b; }, re.source);

  let pitches = 0;
  for (let guard = 0; pitches < 82 && guard < 400; guard++) {
    // between innings and any other prompt the game screen raises: take the default way forward
    if (await click(/^(Take the field for the .*|Next inning|Continue|Done)$/)) { await page.waitForTimeout(150); continue; }
    const key = pick([["b", 0.36], ["c", 0.17], ["s", 0.11], ["f", 0.18], ["x", 0.17], ["h", 0.01]]);
    await page.keyboard.press(key); await page.waitForTimeout(120);
    // the app's follow-up questions for this pitch (an in-play result, contact and direction; how a swing missed), then
    // Log pitch, the way a charter would
    if (await visible(/^Log pitch$/)) {
      if (key === "x") {
        await click(new RegExp("^" + pick([["Out", 0.68], ["Single", 0.2], ["Double", 0.07], ["Error", 0.03], ["Triple", 0.01], ["Home run", 0.01]]) + "$"));
        await click(new RegExp("^" + pick([["Weak", 0.4], ["Solid", 0.38], ["Hard", 0.22]]) + "$"));
      }
      if (await visible(/^Pulled$/)) await click(new RegExp("^" + pick([["Pulled", 0.45], ["Straight back", 0.3], ["Opposite way", 0.25]]) + "$"));
      if (await visible(/^Fooled$/)) await click(new RegExp("^" + pick([["Out in front", 0.45], ["Late", 0.3], ["Fooled", 0.25]]) + "$"));
      await click(/^Log pitch$/);
      await page.waitForTimeout(150);
    }
    const was = pitches;
    pitches = await page.evaluate(() => Object.values(G().pc || {}).reduce((a, n) => a + n, 0));
    if (process.env.DEBUG && pitches === was && guard % 20 === 5) console.log("stuck at", pitches, await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.offsetParent).map((b) => b.textContent.trim().replace(/\s+/g, " ")).join(" | ")));
  }
  console.log("pitches charted:", pitches);

  await page.evaluate(() => { S.view = "roster"; render(); }); await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "app-roster.png") });
  await page.evaluate(() => { S.view = "data"; render(); }); await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "app-data.png") });
  if (errs.length) console.log("page errors:", errs.slice(0, 3));
  await b.close(); server.close();
})();
