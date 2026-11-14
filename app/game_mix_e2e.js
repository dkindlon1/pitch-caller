/*
 * v1.1 (docs/FINDING_v1.0_game_mix_collapse_2026-11-12.md): a whole game played through the real app keeps a mix. The
 * v1.0 app, given random results, threw 75-95% of one pitch over 82 pitches: the "landing better than normal" coach read
 * kept the first pitch to land well hot and pushed every other pitch out. The read now wears off once he has leaned
 * (engine hot_fade). Each game here: the sample staff at college D3, 82 pitches, every call the app's own, results drawn
 * with a seeded random through the app's own keys and follow-up buttons (the finding's own mix: 36% balls), the app's
 * Math.random seeded too, so a game is repeatable. The five games are ones that collapsed on the v1.1 app before the fix
 * (84-94% one pitch; checked Nov 12), so this test fails on that build and passes on this one. The sixth (tier 3, seed 11)
 * is the not-landing case: the fastball draws 5-for-12 early and the hold kept it out at 0-0 and when behind (slider 79%
 * with the hot fix alone); with Drew's comeback (the hold lifts after COMEBACK_N pitches without it) it is 56%.
 * Run from app/ after a build: node game_mix_e2e.js
 * v1.1 Step 4 diagnosis: SCAN='[{"tier":2,"seed":1},...]' runs other seeds; SETUP_OFF=1 zeroes the setup sizes in the page
 * (E.v08.SETUP_RULE, the object the engine reads) so the same seeds can be compared without the setup credits; RIDEUP_OFF=1
 * zeroes the riding-fastball-up rule (COACH_RULE.ride_up_2k); SETUP_ZERO=S4,S7 zeroes those rules only; COACH_ZERO=late_fb the named coach reads; HOT_END=0.25 the hot read's fade end. The
 * tie-break stays on. Neither is used by scripts/test-app.sh.
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = process.env.DIST || path.join(__dirname, "dist/pitch-caller.html");
const PITCHES = 82, TOP_MAX = 0.70;
const GAME_MAX = 0.85, MEAN_MAX = 0.60, OVER_MAX = 1;   // v1.1 Step 4: the 21-game gate (Drew, Nov 13)    // v0.9 threw 61% fastballs on this script; the v1.0 collapse was 88-96%
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
  // v1.2 (Drew, Nov 13): the start-of-game learning (hitter memory for the lineup, any unfinished learning) finishes before
  // the first pitch, as it would before a real game, so a game doesn't depend on how fast the machine is. Nothing waits
  // during the game.
  await page.waitForFunction(() => DB.warm !== false, null, { timeout: 60000 });
  await page.evaluate(({ tier, appSeed, off, rideOff, zero, coachZero, hotEnd }) => { let a = appSeed; Math.random = () => (a = (a * 16807) % 2147483647) / 2147483647; S.setup.inputs = tier; S.view = "live"; if (off) for (const k of Object.keys(E.v08.SETUP_RULE)) E.v08.SETUP_RULE[k] = 0; if (rideOff) (E.v08.COACH_RULE || E.COACH_RULE).ride_up_2k = 0; for (const k of zero) E.v08.SETUP_RULE[k] = 0; for (const k of (coachZero || "").split(",").filter(Boolean)) E.v08.COACH_RULE[k] = 0; if (hotEnd) E.v08.HOT_FADE[1] = hotEnd; G().call = null; makeCall(); save(); render(); }, { tier, appSeed: seed + 4, off: !!process.env.SETUP_OFF, rideOff: !!process.env.RIDEUP_OFF, zero: (process.env.SETUP_ZERO || "").split(",").filter(Boolean), coachZero: process.env.COACH_ZERO || "", hotEnd: +(process.env.HOT_END || 0) });
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
  if (process.env.GM_DEBUG) console.log("  landing today at the end:", await page.evaluate(() => JSON.stringify(landToday(G()))),
    "| by 20s:", await page.evaluate(() => { const L = (G().log || []).map((e) => e.pitch[0]); const o = []; for (let i = 0; i < L.length; i += 20) o.push(L.slice(i, i + 20).join("")); return o.join(" "); }));
  await ctx.close();
  return { pitches, thrown, errs };
}

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  console.log("1. Whole games through the app keep a mix (sample staff: fastball, slider, changeup; college D3)");
  // v1.1 Step 4 (Drew, Nov 13): one game is path-dependent (one changed call re-routes the rest), so the gate is 21 games, not
  // 6: the 20 scan seeds plus the forced-reads game. Each game charts cleanly, keeps 2+ pitches and stays at or under 85%;
  // over all of them the average top pitch is at most 60% and at most one game goes over 70%. v1.0's collapse (75-95% in
  // every game) fails all three.
  const T2 = [7, 11, 21, 33, 45, 57, 69, 81, 93, 105], T3 = [7, 11, 31337, 21, 33, 45, 57, 69, 81, 93];
  const GAMES = process.env.SCAN ? JSON.parse(process.env.SCAN)
    : [...T2.map((seed) => ({ tier: 2, seed })), ...T3.map((seed) => ({ tier: 3, seed })), { tier: 3, seed: 7, forcedReads: true }];
  const tops = [];
  for (const g of GAMES) {
    const r = await game(browser, url, g);
    const n = Object.values(r.thrown).reduce((a, b) => a + b, 0);
    const top = Object.entries(r.thrown).sort((a, b) => b[1] - a[1])[0] || ["none", 0];
    const share = n ? top[1] / n : 1;
    tops.push(share);
    const label = `tier ${g.tier}${g.forcedReads ? ", every whiff 'Fooled' and every foul 'Straight back'" : ""}, seed ${g.seed}`;
    check(r.pitches >= PITCHES && n >= PITCHES && !r.errs.length, `${label}: ${n} pitches charted, no page errors${r.errs.length ? " (" + r.errs[0] + ")" : ""}`);
    const mix = `${Object.entries(r.thrown).map(([k, v]) => `${k} ${v}`).join(", ")}; top ${(100 * share).toFixed(0)}%`;
    if (process.env.SCAN) check(share <= TOP_MAX && Object.keys(r.thrown).length >= 2, `${label}: no pitch over ${TOP_MAX * 100}% of the game (${mix})`);
    else check(share <= GAME_MAX && Object.keys(r.thrown).length >= 2, `${label}: 2+ pitches, none over ${GAME_MAX * 100}% (${mix})`);
  }
  if (!process.env.SCAN) {
    const mean = tops.reduce((a, b) => a + b, 0) / tops.length, over = tops.filter((x) => x > TOP_MAX).length;
    console.log(`2. Over the ${tops.length} games`);
    check(mean <= MEAN_MAX, `average top pitch ${(100 * mean).toFixed(1)}% (at most ${MEAN_MAX * 100}%)`);
    check(over <= OVER_MAX, `${over} game(s) over ${TOP_MAX * 100}% (at most ${OVER_MAX})`);
  }
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} game-mix check(s) FAILED` : "\nall game-mix checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
