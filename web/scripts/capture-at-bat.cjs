// Captures content/at-bat.ts's AT_BAT: one at-bat through the real app (app/dist/pitch-caller.html) with its own default
// setup (college D3, the sample right-handed starter) against a right-handed hitter. Each call is the app's own: its
// engine draws from the mix (seeded, so the capture comes out the same every run) and gives its reason; the results
// (called strike, ball, foul, swing and miss) are chosen to play the at-bat out to a strikeout, and are logged through
// the app's own result keys, so every call after the first sees what happened before it.
//   Run from web/ after building the app: node scripts/capture-at-bat.cjs
// It prints the AT_BAT array; paste it into content/at-bat.ts and update the header line.
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs");
const DIST = require("path").join(__dirname, "../../app/dist/pitch-caller.html");
const server = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  r.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`); });
const SPOT = { "up-in": "Up and in", "up-away": "Up and away", "down-in": "Down and in", "down-away": "Down and away", middle: "Get it over", chase: "Chase", "down-middle": "Keep it down" };
const SIGN = { Fastball: 1, Curveball: 2, Slider: 3, Changeup: 4 };
const PLAY = [["c", "Called strike"], ["b", "Ball"], ["f", "Foul"], ["s", "Swing and miss"]];
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 15000 });
  const seed = +(process.env.SEED || 5);
  const version = await page.evaluate((sd) => {
    let s = sd; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const g = G(); S.view = "live"; S.setup.lineup[g.batter % S.setup.lineup.length].hand = "R";
    g.call = null; makeCall(); save(); render();
    return E.VERSION;
  }, seed);
  const out = [];
  for (const [key, result] of PLAY) {
    await page.waitForTimeout(300);
    const c = await page.evaluate(() => ({ b: G().balls, s: G().strikes, pitch: G().call.pitch, quad: G().call.quad, why: G().call.why, prob: G().call.prob }));
    out.push({ balls: c.b, strikes: c.s, sign: SIGN[c.pitch], pitch: c.pitch, spot: SPOT[c.quad] || c.quad, why: String(c.why).trim().replace(/([^.])$/, "$1."), result, prob: Math.round(c.prob * 1000) / 1000 });
    await page.mouse.click(5, 5); await page.keyboard.press(key); await page.waitForTimeout(300);
    if (await page.evaluate(() => typeof pending !== "undefined" && !!pending)) { await page.keyboard.press("Enter"); await page.waitForTimeout(300); }
  }
  const end = await page.evaluate(() => ({ outs: G().outs, balls: G().balls, strikes: G().strikes }));
  console.log(`// engine ${version}, seed ${seed}; after the at-bat: ${JSON.stringify(end)}`);
  console.log("export const AT_BAT: Pitch[] = [");
  for (const p of out) { const { prob, ...q } = p; console.log(`  ${JSON.stringify(q).replace(/"(\w+)":/g, "$1: ").replace(/,(?=\w+: )/g, ", ")},   // ${Math.round(prob * 100)}% of the mix`); }
  console.log("];");
  console.log(errs.join("\n") || "// no errors");
  await b.close(); server.close();
})();
