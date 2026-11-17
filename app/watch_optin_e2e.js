/*
 * Watch mode is kept on the device: once the game app has been opened with ?watch=1, every later open comes up with
 * watches, the Game Day hand-off (/?game=..&team=..#pq=.., no ?watch) included; ?watch=0 turns it off and that is kept
 * too. Setup has a switch for the same setting (always there where there is Web Bluetooth); the full Watches card shows
 * only once watch mode is on. Where there is no Web Bluetooth (the iPad) the flag changes nothing and Setup shows nothing.
 *   node app/watch_optin_e2e.js
 */
const { chromium } = require("playwright");
const H = require("./shots_v2.js");
let fails = 0, oks = 0;
const check = (ok, msg) => { if (ok) oks++; else fails++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`); };
const HANDOFF = "?game=gam_abcdefghij12&team=00000000-0000-4000-8000-000000000000&name=Test#pq=nothing";

(async () => {
  await new Promise((r) => H.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${H.server.address().port}/`;
  const browser = await chromium.launch();
  const errs = [];
  const open = async (ctx, url) => {
    const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto(url); await p.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 15000 }); await p.waitForTimeout(400);
    return p;
  };
  const setup = async (p) => { await p.locator(".tabs button", { hasText: "Setup" }).click(); await p.waitForTimeout(300); };

  // a computer with Web Bluetooth (stand-in watches)
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx.addInitScript(H.FAKE_BT);
  let p = await open(ctx, base + HANDOFF);
  check(await p.evaluate(() => !WATCH), "a device that never opted in: a hand-off opens without watches");
  await p.close();
  p = await open(ctx, base + "?watch=1");
  check(await p.evaluate(() => !!WATCH), "?watch=1 turns watches on");
  await p.close();
  p = await open(ctx, base + HANDOFF);
  check(await p.evaluate(() => !!WATCH), "then a Game Day hand-off link (no ?watch) opens with watches");
  check(await p.evaluate(() => !/game=|pq=/.test(location.href)), "and the hand-off link is still cleared from the address bar");
  await setup(p);
  check(await p.getByRole("button", { name: "Connect a watch" }).count() === 1, "with the Watches card ready to connect");
  await p.close();
  p = await open(ctx, base);
  check(await p.evaluate(() => !!WATCH), "a plain open keeps watches on too");
  await p.close();
  p = await open(ctx, base + "?watch=0");
  check(await p.evaluate(() => !WATCH), "?watch=0 turns them off");
  await p.close();
  p = await open(ctx, base + HANDOFF);
  check(await p.evaluate(() => !WATCH), "and a later hand-off stays without watches");
  await p.close(); await ctx.close();

  // the Setup switch (Drew, Nov 17, round 4): always in Setup where there is Web Bluetooth; the card only once it's on
  const ctx2 = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx2.addInitScript(H.FAKE_BT);
  const sw = (pg) => pg.locator('#watch-switch [role="switch"]');
  const gameHasWatch = (pg) => pg.evaluate(() => !!document.querySelector(".btn.accept") || !!document.getElementById("watch-pill"));
  p = await open(ctx2, base); await setup(p);
  check(await sw(p).count() === 1 && await sw(p).getAttribute("aria-checked") === "false" && await p.locator("#watch-card").count() === 0, "switch: in Setup, off, and no Watches card");
  await Promise.all([p.waitForEvent("load"), sw(p).click()]);
  await p.waitForFunction(() => typeof DB !== "undefined" && DB.ready); await p.waitForTimeout(400); await setup(p);
  check(await sw(p).getAttribute("aria-checked") === "true" && await p.locator("#watch-card").count() === 1 && await p.getByRole("button", { name: "Connect a watch" }).count() === 1, "switch on: the Watches card shows, ready to connect");
  await p.reload(); await p.waitForFunction(() => typeof DB !== "undefined" && DB.ready); await p.waitForTimeout(400); await setup(p);
  check(await p.evaluate(() => !!WATCH) && await sw(p).getAttribute("aria-checked") === "true" && await p.locator("#watch-card").count() === 1, "switch on: the setting survives a reload");
  await p.close();
  p = await open(ctx2, base + HANDOFF);
  check(await p.evaluate(() => !!WATCH), "switch on: a hand-off with no ?watch opens with watches");
  await setup(p);
  await Promise.all([p.waitForEvent("load"), sw(p).click()]);
  await p.waitForFunction(() => typeof DB !== "undefined" && DB.ready); await p.waitForTimeout(400); await setup(p);
  check(await sw(p).getAttribute("aria-checked") === "false" && await p.locator("#watch-card").count() === 0, "switch off: the Watches card is hidden");
  await p.locator(".tabs button", { hasText: "Game" }).click(); await p.waitForTimeout(400);
  check(await p.evaluate(() => !WATCH) && !(await gameHasWatch(p)) && await p.locator(".call-panel .pitch").count() === 1, "switch off: the Game screen has a call and no watch controls (no Accept, no watch status)");
  await p.reload(); await p.waitForFunction(() => typeof DB !== "undefined" && DB.ready); await p.waitForTimeout(400);
  check(await p.evaluate(() => !WATCH), "switch off: it stays off after a reload");
  await p.close();
  p = await open(ctx2, base + HANDOFF);
  check(await p.evaluate(() => !WATCH) && !(await gameHasWatch(p)), "switch off: a hand-off with no ?watch opens without watches");
  await p.close(); await ctx2.close();

  // an iPad (no Web Bluetooth): the flag set or not, nothing about watches
  const ctx3 = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true }); await ctx3.addInitScript(H.NO_BT);
  p = await open(ctx3, base + "?watch=1"); await p.close();
  p = await open(ctx3, base + HANDOFF); await setup(p);
  check(await p.evaluate(() => !WATCH) && await p.locator("#watch-card").count() === 0, "without Web Bluetooth, even opted in, there is no watch link and no Watches card");
  await p.close(); await ctx3.close();

  for (const e of errs) check(false, "page error " + e);
  await browser.close(); H.server.close();
  console.log(fails ? `\n${fails} watch opt-in check(s) FAILED` : `\nwatch_optin_e2e: all ${oks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
