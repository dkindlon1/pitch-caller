/*
 * v1.1 (docs/FINDING_v1.0_game_mix_collapse_2026-11-12.md): a whole game played through the real app keeps a mix. The
 * v1.0 app, given random results, threw 75-95% of one pitch over 82 pitches: the "landing better than normal" coach read
 * kept the first pitch to land well hot and pushed every other pitch out. The read now wears off once he has leaned
 * (engine hot_fade). Each game here: the sample staff at college D3, 82 pitches, every call the app's own, results drawn
 * with a seeded random through the app's own keys and follow-up buttons (the finding's own mix: 36% balls), the app's
 * Math.random seeded too, so a game is repeatable. The five games are ones that collapsed on the v1.1 app before the fix
 * (84-94% one pitch; checked Nov 12), so this test fails on that build and passes on this one. Left out on purpose: a game
 * where one pitch draws an unlucky run early (tier 3, seed 11: the fastball 5-for-12) and Drew's not-landing rule holds it
 * back at 0-0 and when behind, so the other pitch gets most of the game. That is the rule as he set it (BUILD_v1.1_REPORT).
 * Run from app/ after a build: node game_mix_e2e.js
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = process.env.DIST || path.join(__dirname, "dist/pitch-caller.html");
const PITCHES = 82, TOP_MAX = 0.70;    // v0.9 threw 61% fastballs on this script; the v1.0 collapse was 88-96%
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`);
});

async function game(browser, url, { tier, seed, forcedReads }) {
  let sd = seed;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const pick = (pairs) => { let x = rnd(), acc = 0; for (const [v, w] of pairs) { acc += w; if (x <= acc) return v; } return pairs[pairs.length - 1][0]; };
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(url); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 15000 });
  await page.evaluate(({ tier, appSeed }) => { let a = appSeed; Math.random = () => (a = (a * 16807) % 2147483647) / 2147483647; S.setup.inputs = tier; S.view = "live"; G().call = null; makeCall(); save(); render(); }, { tier, appSeed: seed + 4 });
  const visible = (re) => page.evaluate((src) => { const r = new RegExp(src); return [...document.querySelectorAll("button")].some((b) => b.offsetParent && r.test(b.textContent.trim())); }, re.source);
  const click = (re) => page.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll("button")].find((x) => x.offsetParent && r.test(x.textContent.trim().replace(/\s+/g, " "))); if (b) b.click(); return !!b; }, re.source);
  let pitches = 0;
  for (let guard = 0; pitches < PITCHES && guard < PITCHES * 5; guard++) {
    if (await click(/^(Take the field for the .*|Next inning|Continue|Done)$/)) { await page.waitForTimeout(80); continue; }
    const key = pick([["b", 0.36], ["c", 0.17], ["s", 0.11], ["f", 0.18], ["x", 0.17], ["h", 0.01]]);
    await page.keyboard.press(key); await page.waitForTimeout(60);
    if (await visible(/^Log pitch$/)) {
      if (key === "x") {
        await click(new RegExp("^" + pick([["Out", 0.68], ["Single", 0.2], ["Double", 0.07], ["Error", 0.03], ["Triple", 0.01], ["Home run", 0.01]]) + "$"));
        await click(new RegExp("^" + pick([["Weak", 0.4], ["Solid", 0.38], ["Hard", 0.22]]) + "$"));
      }
      if (await visible(/^Pulled$/)) await click(forcedReads ? /^Straight back$/ : new RegExp("^" + pick([["Pulled", 0.45], ["Straight back", 0.3], ["Opposite way", 0.25]]) + "$"));
      if (await visible(/^Fooled$/)) await click(forcedReads ? /^Fooled$/ : new RegExp("^" + pick([["Out in front", 0.45], ["Late", 0.3], ["Fooled", 0.25]]) + "$"));
      await click(/^Log pitch$/); await page.waitForTimeout(80);
    }
    pitches = await page.evaluate(() => Object.values(G().pc || {}).reduce((a, n) => a + n, 0));
  }
  const thrown = await page.evaluate(() => { const by = {}; for (const e of G().log || []) by[e.pitch] = (by[e.pitch] || 0) + 1; return by; });
  await ctx.close();
  return { pitches, thrown, errs };
}

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  console.log("1. Whole games through the app keep a mix (sample staff: fastball, slider, changeup; college D3)");
  const GAMES = process.env.SCAN ? JSON.parse(process.env.SCAN) : [{ tier: 2, seed: 7 }, { tier: 2, seed: 11 }, { tier: 3, seed: 7 }, { tier: 3, seed: 31337 }, { tier: 3, seed: 7, forcedReads: true }];
  for (const g of GAMES) {
    const r = await game(browser, url, g);
    const n = Object.values(r.thrown).reduce((a, b) => a + b, 0);
    const top = Object.entries(r.thrown).sort((a, b) => b[1] - a[1])[0] || ["none", 0];
    const label = `tier ${g.tier}${g.forcedReads ? ", every whiff 'Fooled' and every foul 'Straight back'" : ""}, seed ${g.seed}`;
    check(r.pitches >= PITCHES && n >= PITCHES && !r.errs.length, `${label}: ${n} pitches charted, no page errors${r.errs.length ? " (" + r.errs[0] + ")" : ""}`);
    check(top[1] / n <= TOP_MAX && Object.keys(r.thrown).length >= 2, `${label}: no pitch over ${TOP_MAX * 100}% of the game (${Object.entries(r.thrown).map(([k, v]) => `${k} ${v}`).join(", ")}; top ${(100 * top[1] / n).toFixed(0)}%)`);
  }
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} game-mix check(s) FAILED` : "\nall game-mix checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
