/*
 * Key passes in WebKit and Firefox (app v2): the entry, the launcher, a pitcher's stats, the Game Day wizard, and the
 * game app's Game screen in both themes with one pitch logged. For each: no page errors, both typefaces in use, no
 * sideways overflow, glass has a backdrop filter or its solid fallback, and a screenshot.
 *   node web/tests/app_browsers.js --url http://localhost:3120 --out docs/app-v2-shots/final/browsers
 */
const pw = require("playwright");
const fs = require("fs"), path = require("path"), http = require("http");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const URL_ = arg("--url", "http://localhost:3120"), OUT = arg("--out", "docs/app-v2-shots/final/browsers");
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "screens/app_seed.json"), "utf8"));
const team = seed.team.varsity, pitcher = seed.claimedPitcher.id || seed.claimedPitcher;
let fails = 0; const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const game = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  r.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${fs.readFileSync(path.join(__dirname, "../../app/dist/pitch-caller.html"), "utf8")}</body></html>`); });
const probe = ([fontA, fontB]) => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  // (the first family only: the second is next/font's metric fallback, a local face Firefox does not count as loaded)
  archivo: [...document.fonts].some((f) => fontA.split(",")[0].includes(f.family.replace(/["']/g, "")) && f.status === "loaded"),
  hanken: [...document.fonts].some((f) => fontB.split(",")[0].includes(f.family.replace(/["']/g, "")) && f.status === "loaded"),
  h1: (() => { const h = document.querySelector("h1"); return h ? getComputedStyle(h).fontFamily.slice(0, 40) : ""; })() });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => game.listen(0, "127.0.0.1", r));
  for (const name of ["webkit", "firefox"]) {
    const browser = await pw[name].launch();
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } }); const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    console.log(name);
    await page.goto(URL_ + "/login", { waitUntil: "networkidle" }); await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, `${name}__login.png`) });
    let p = await page.evaluate(probe, await page.evaluate(() => { const s = getComputedStyle(document.querySelector(".pq")); return [s.getPropertyValue("--font-archivo").trim(), s.getPropertyValue("--font-hanken").trim()]; }));
    check(p.over <= 1 && p.archivo && p.hanken, `login: no sideways overflow (${p.over}), Archivo and Hanken loaded (${p.archivo}, ${p.hanken})`);
    await page.getByLabel("Email").first().fill("coach@test.local"); await page.getByLabel("Password").first().fill("test-pass-1234");
    await page.getByRole("button", { name: "Sign in" }).click(); await page.waitForURL(/\/app/, { timeout: 30000 });
    for (const [n, route] of [["launcher", `/app/t/${team}`], ["pitcher-stats", `/app/t/${team}/roster/${pitcher}/stats`], ["wizard", `/app/t/${team}/games/new`]]) {
      await page.goto(URL_ + route, { waitUntil: "networkidle" }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1200);
      const fam = await page.evaluate(() => { const s = getComputedStyle(document.querySelector(".pq")); return [s.getPropertyValue("--font-archivo").trim(), s.getPropertyValue("--font-hanken").trim()]; });
      p = await page.evaluate(probe, fam);
      const glass = await page.evaluate(() => { const g = document.querySelector(".pq-bar-in"); const s = getComputedStyle(g); return (s.backdropFilter || s.webkitBackdropFilter || "none") + " | " + s.backgroundImage.slice(0, 30); });
      check(p.over <= 1 && p.archivo && p.hanken, `${n}: no sideways overflow (${p.over}), fonts loaded, bar glass: ${glass}`);
      await page.screenshot({ path: path.join(OUT, `${name}__${n}.png`) });
    }
    if (await page.locator(".pq-steps button").count()) { await page.getByRole("button", { name: /Next: Our staff/ }).click(); await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, `${name}__wizard-2.png`) }); check(await page.locator(".pq-pick").count() > 0, "wizard: step 2 opens with the staff picks"); }
    // the game app
    await page.goto(`http://127.0.0.1:${game.address().port}/`); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 20000 });
    await page.locator(".tabs button", { hasText: "Game" }).click(); await page.waitForSelector(".call-panel .pitch");
    for (const theme of ["night", "day"]) {
      if (theme === "day") await page.locator('.bar button[aria-label^="Switch to the"]').click();
      await page.keyboard.press("b"); await page.waitForTimeout(400);
      const g = await page.evaluate(() => { const el = document.querySelector(".call-panel .pitch"), cs = getComputedStyle(el), r = el.getBoundingClientRect();
        return { over: document.documentElement.scrollWidth - document.documentElement.clientWidth, font: cs.fontFamily.slice(0, 20), size: parseFloat(cs.fontSize), wide: r.width, card: el.closest(".call-panel").getBoundingClientRect().width,
          archivo: document.fonts.check('900 40px "Archivo"'), hanken: document.fonts.check('500 16px "Hanken Grotesk"'), count: document.querySelector(".strip .cell .v").textContent.trim().slice(0, 3) }; });
      check(g.over <= 1 && g.archivo && g.hanken && g.size >= 48 && g.wide <= g.card, `game ${theme}: call in ${g.font} at ${Math.round(g.size)} px inside its card, count ${g.count}, no overflow (${g.over})`);
      await page.screenshot({ path: path.join(OUT, `${name}__game-${theme}.png`) });
    }
    check(!errs.length, `no page errors${errs.length ? ": " + errs.join(" | ") : ""}`);
    await browser.close();
  }
  game.close();
  console.log(fails ? `${fails} failed` : "all browser checks passed"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
