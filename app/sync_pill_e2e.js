/*
 * The sync pill in the game bar: nothing on a device that isn't signed in to a team; on one that is, "Offline" while
 * there is no signal, "Syncing" while a sync runs, "Synced" for a few seconds after, then nothing. It never moves the
 * call. (The sync itself is the app's own and runs against a real Supabase in web/tests/offline_game_e2e.js; here a
 * stand-in marks the device as signed in, and the test flips the network and the sync's busy flag.)
 *   node app/sync_pill_e2e.js
 */
const { chromium } = require("playwright");
const H = require("./shots_v2.js");
let fails = 0, oks = 0;
const check = (ok, msg) => { if (ok) oks++; else fails++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`); };

(async () => {
  await new Promise((r) => H.server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch(), errs = [];
  for (const theme of ["night", "day"]) {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 740 }, hasTouch: true });
    const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${H.server.address().port}/`);
    await p.waitForFunction(() => typeof DB !== "undefined" && DB.ready); await p.waitForTimeout(400);
    if (theme === "day") await p.locator('.bar button[aria-label^="Switch to the"]').click();
    const pill = () => p.evaluate(() => { const e = document.getElementById("sync-pill"); return e ? e.className + "|" + e.firstChild.nextSibling.textContent : ""; });
    const callTop = () => p.evaluate(() => Math.round(document.querySelector(".call-panel .pitch").getBoundingClientRect().top));
    await ctx.setOffline(true); await p.waitForTimeout(1200);
    check(await pill() === "", `${theme}: a device not signed in to a team shows no pill, even offline`);
    await ctx.setOffline(false);
    const top0 = await callTop();
    await p.evaluate(() => { SYNC.sync = SYNC.sync || { pending: async () => ({}) }; });   // stand-in: signed in to a team
    await ctx.setOffline(true); await p.waitForTimeout(1200);
    check(/offline\|Offline$/.test(await pill()), `${theme}: offline shows "Offline" (${await pill()})`);
    check(await callTop() === top0, `${theme}: the call does not move when the pill appears`);
    if (theme === "night") await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + "/pill-offline__night.png" : require("os").tmpdir() + "/pill-offline.png", clip: { x: 600, y: 0, width: 580, height: 80 } });
    await ctx.setOffline(false); await p.evaluate(() => { SYNC.busy = true; }); await p.waitForTimeout(1200);
    check(/syncing\|Syncing$/.test(await pill()), `${theme}: a running sync shows "Syncing" (${await pill()})`);
    await p.evaluate(() => { SYNC.busy = false; SYNC.error = null; }); await p.waitForTimeout(1200);
    check(/synced\|Synced$/.test(await pill()), `${theme}: a finished sync shows "Synced" (${await pill()})`);
    // "Synced" stays 4 s from the check that sees the sync finish (checks run each second): gone within 7 s
    let gone = false; for (let i = 0; i < 14 && !gone; i++) { await p.waitForTimeout(500); gone = (await pill()) === ""; }
    check(gone, `${theme}: and then the pill goes`);
    check(await callTop() === top0, `${theme}: the call is where it started`);
    const a11y = await p.evaluate(async () => { SYNC.busy = true; await new Promise((r) => setTimeout(r, 1200)); const e = document.getElementById("sync-pill"); return e ? { role: e.getAttribute("role"), txt: e.textContent } : null; });
    check(a11y && a11y.role === "status" && /Syncing\. Sending/.test(a11y.txt), `${theme}: the pill is a status with words for a screen reader`);
    await ctx.close();
  }
  for (const e of errs) check(false, "page error " + e);
  await browser.close(); H.server.close();
  console.log(fails ? `\n${fails} sync pill check(s) FAILED` : `\nsync_pill_e2e: all ${oks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
