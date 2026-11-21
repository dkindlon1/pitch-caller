/*
 * v1.3 Part 3 (plan 3.5): college D2 is a level the app plays, end to end. The coach picks "College D2" on the Setup
 * screen (the real button), the game bar says so, every call goes to the engine at college_d2, a whole seeded game
 * (all nine innings, results drawn through the app's own keys and follow-up buttons, as game_mix_e2e.js) charts with no page
 * error, and End game saves it as a D2 game. D2 runs on D3's numbers for now (PLACEHOLDER_D2; release_guard_d2.py keeps
 * it from shipping), so a D2 call is exactly the D3 call in the same spot.
 * Run from app/ after a build: node d2_e2e.js
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = process.env.DIST || path.join(__dirname, "dist/pitch-caller.html");
const INNINGS = 9, MAX_PITCHES = 450;
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
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(url); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 15000 });
  await page.waitForFunction(() => DB.warm !== false, null, { timeout: 60000 });
  const click = (re) => page.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll("button")].find((x) => x.offsetParent && r.test(x.textContent.trim().replace(/\s+/g, " "))); if (b) b.click(); return !!b; }, re.source);
  const visible = (re) => page.evaluate((src) => { const r = new RegExp(src); return [...document.querySelectorAll("button")].some((b) => b.offsetParent && r.test(b.textContent.trim())); }, re.source);

  console.log("1. The coach picks College D2 on the Setup screen");
  await page.getByRole("button", { name: "Setup", exact: true }).first().click();
  const d2 = page.locator("button.choice", { hasText: "College D2" });
  check(await d2.count() === 1, "the level choices include College D2");
  const order = await page.locator("button.choice b").allInnerTexts();
  check(order.indexOf("College D3") < order.indexOf("College D2") && order.indexOf("College D2") < order.indexOf("College D1"),
    `it sits between D3 and D1 (${order.slice(0, 6).join(", ")})`);
  await d2.click();
  check(await d2.getAttribute("aria-pressed") === "true" && await page.evaluate(() => S.setup.level) === "college_d2", "the D2 choice is pressed and saved as college_d2");
  await page.getByRole("button", { name: "Game", exact: true }).first().click();
  await page.waitForFunction(() => G().call, null, { timeout: 15000 });
  const stamp = await page.locator(".stamp").first().innerText().catch(() => "");
  check(/College D2/.test(stamp), `the game bar says College D2 ("${stamp}")`);
  const lv = await page.evaluate(() => situation().level);
  check(lv === "college_d2", `the engine is asked at college_d2 (${lv})`);
  const same = await page.evaluate(() => {
    const ars = arsenal(), s2 = situation(), s3 = Object.assign({}, s2, { level: "college_d3" });
    const pr = (s) => { const r = E.callV08(ars, s, { rng: () => 0.5 }); return JSON.stringify([r.pick.pitch.name, r.pick.quad, r.dist.map((d) => [d.pitch.name, d.quad, d.prob])]); };
    return [pr(s2) === pr(s3), pr(s2).slice(0, 80)];
  });
  check(same[0], `PLACEHOLDER_D2: the D2 call is exactly the D3 call in the same spot (${same[1]}...)`);

  console.log("2. A whole seeded nine-inning game at D2");
  await page.evaluate(() => { let a = 11; Math.random = () => (a = (a * 16807) % 2147483647) / 2147483647; });
  let sd = 7;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const pick = (pairs) => { let x = rnd(), acc = 0; for (const [v, w] of pairs) { acc += w; if (x <= acc) return v; } return pairs[pairs.length - 1][0]; };
  let pitches = 0, done = false;
  const over = () => page.evaluate((n) => G().inning > n || (G().inning === n && !!G().inningOver), INNINGS);
  for (let guard = 0; !done && pitches < MAX_PITCHES && guard < MAX_PITCHES * 5; guard++) {
    if (await over()) { done = true; break; }
    if (await click(/^(Take the field for the .*|Next inning|Continue|Done)$/)) { await page.waitForTimeout(80); continue; }
    const key = pick([["b", 0.36], ["c", 0.17], ["s", 0.11], ["f", 0.18], ["x", 0.17], ["h", 0.01]]);
    await page.keyboard.press(key); await page.waitForTimeout(60);
    if (await visible(/^Log pitch$/)) {
      if (key === "x") {
        await click(new RegExp("^" + pick([["Out", 0.68], ["Single", 0.2], ["Double", 0.07], ["Error", 0.03], ["Triple", 0.01], ["Home run", 0.01]]) + "$"));
        await click(new RegExp("^" + pick([["Weak", 0.4], ["Solid", 0.38], ["Hard", 0.22]]) + "$"));
      }
      if (await visible(/^Pulled$/)) await click(new RegExp("^" + pick([["Pulled", 0.45], ["Straight back", 0.3], ["Opposite way", 0.25]]) + "$"));
      if (await visible(/^Fooled$/)) await click(new RegExp("^" + pick([["Out in front", 0.45], ["Late", 0.3], ["Fooled", 0.25]]) + "$"));
      await click(/^Log pitch$/); await page.waitForTimeout(80);
    }
    pitches = await page.evaluate(() => Object.values(G().pc || {}).reduce((a, n) => a + n, 0));
  }
  const g = await page.evaluate(() => { const by = {}; for (const e of G().log || []) by[e.pitch] = (by[e.pitch] || 0) + 1; return { n: G().log.length, by, inning: G().inning, level: S.setup.level }; });
  check(done && g.n >= 9 * 3, `all ${INNINGS} innings charted: ${g.n} pitches, every call the app's own, inning ${g.inning}, (${Object.entries(g.by).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  check(Object.keys(g.by).length >= 2 && g.level === "college_d2", "the game keeps a mix and stays at D2");
  check(!errs.length, `no page errors${errs.length ? " (" + errs[0] + ")" : ""}`);

  console.log("3. End game saves it as a D2 game");
  await page.getByRole("button", { name: "End game" }).click();
  await page.getByRole("button", { name: "End game" }).click();
  await page.waitForFunction(() => (S.history || []).length > 0 && G().log.length === 0, null, { timeout: 30000 });
  const h0 = await page.evaluate(() => ({ level: S.history[0].level, n: S.history[0].log.length }));
  check(h0.level === "college_d2" && h0.n === g.n, `the saved game is at college_d2 with all ${h0.n} pitches`);
  const recs = await page.evaluate(async () => (await DB.D.all("games")).map((r) => ({ level: r.level, n: (r.events || r.log || []).length, closed: !!(r.endedAt || r.ended || r.final || r.completeness) })));
  check(recs.length >= 1, `the game record is in the database (${JSON.stringify(recs).slice(0, 160)})`);
  check(!errs.length, `still no page errors${errs.length ? " (" + errs[0] + ")" : ""}`);

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} D2 check(s) FAILED` : "\nall D2 checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
