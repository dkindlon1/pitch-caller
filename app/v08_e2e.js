/*
 * v0.8 in the real page (docs/SPEC_v0.8.md 8.3, 9, 6.2). Run from app/: node v08_e2e.js
 * The engine default, the why line, the game inputs, the frozen plate-appearance solve (a reload rebuilds the same one),
 * familiarity, the umpire learner, the running game, radar, the per-pitch v0.8 log, the v0.7c switch, and phone width.
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = process.env.DIST || path.join(__dirname, "dist/pitch-caller.html");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`);
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const open = async () => {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto(url); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 10000 });
    return page;
  };
  let page = await open();
  await page.evaluate(() => { S.view = "live"; G().call = null; makeCall(); save(); render(); });

  console.log("1. v0.8 is the default engine, and the call carries a why line");
  const r1 = await page.evaluate(() => ({ eng: S.setup.engine, look: E.FLAGS.look_state, v08: !!G().call.v08 }));
  check(r1.eng === "v08" && r1.look && r1.v08, `engine ${r1.eng}, look_state ${r1.look}, call made by v0.8 ${r1.v08}`);
  await page.waitForFunction(() => G().call && G().call.why, null, { timeout: 5000 }).catch(() => {});
  const why = await page.evaluate(() => G().call.why);
  const shown = await page.locator(".whyline").count();
  check(!!why && shown === 1, `why line "${why}" shown on the call card (${shown})`);

  console.log("2. Game situation inputs reach the engine");
  await page.evaluate(() => { S.view = "setup"; render(); });
  await page.getByRole("group", { name: "Home or away" }).getByRole("button", { name: "Home" }).click();
  await page.evaluate(() => { S.view = "live"; G().call = null; makeCall(); save(); render(); });
  const r2 = await page.evaluate(() => ({ home: S.setup.home, win: G().pa && G().pa.win, sched: situation().sched_innings }));
  check(r2.home === true && r2.win && r2.win.omega >= 0 && r2.win.m0 > 0, `home set; this at-bat's win constants omega ${r2.win && r2.win.omega.toFixed(3)}, m0 ${r2.win && r2.win.m0.toFixed(3)}`);

  console.log("3. A reload mid at-bat rebuilds the same frozen solve and the same call mix");
  await page.keyboard.press("b"); await page.waitForTimeout(250);
  const before = await page.evaluate(() => { G().call = null; makeCall(); save(); return JSON.stringify(G().call.dist); });
  await page.reload(); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 10000 });
  const after = await page.evaluate(() => { G().call = null; makeCall(); return JSON.stringify(G().call.dist); });
  check(before === after, `call mix after reload identical (${before.length} chars)`);

  console.log("4. Each pitch is logged with its v0.8 inputs");
  await page.keyboard.press("c"); await page.waitForTimeout(300);
  const r4 = await page.evaluate(async () => {
    const evs = (await DB.D.all("events")).filter((e) => e.gameId === G().dbId && e.v08);
    const e = evs[evs.length - 1];
    return e ? { n: evs.length, ump: e.v08.ump, grades: Object.keys(e.v08.grades || {}), flags: e.v08.flags && e.v08.flags.look_state, look: e.v08.look, sitLook: e.sit && e.sit.look, home: e.sit && e.sit.home } : null;
  });
  check(r4 && r4.ump && r4.ump.length === 2 && r4.grades.join() === "c,w,d" && r4.flags === true && Array.isArray(r4.look),
    `events with v0.8 block: ${r4 && r4.n}; umpire pair ${r4 && JSON.stringify(r4.ump)}; grade pairs ${r4 && r4.grades}; look ${r4 && JSON.stringify(r4.look)}`);

  console.log("5. Umpire learner: takes accumulate and move the estimate");
  const r5 = await page.evaluate(() => ({ takes: G().takes.length, u: situation().ump_u }));
  check(r5.takes >= 2 && typeof r5.u === "number", `${r5.takes} takes logged; today's umpire estimate ${r5.u.toFixed(3)}`);

  console.log("6. Familiarity: what he saw this at-bat counts at his next one");
  const r6 = await page.evaluate(() => {
    const pk = pKey(), hk = hitterKey();
    // finish this plate appearance with a ball in play out
    record({ result: "play", out: "OUT" });
    const f = (G().fam[pk] || {})[hk];
    return { f, pa: G().pa };
  });
  check(r6.f && r6.f.FB + r6.f.OS >= 3, `this hitter's earlier-at-bat counts: ${JSON.stringify(r6.f)}`);

  console.log("7. Running game: a steal threat control for the runner, and it reaches the engine");
  await page.evaluate(() => { G().bases = [true, false, false]; G().call = null; makeCall(); render(); });
  const seg = page.getByRole("group", { name: "Runner on 1st may run" });
  check(await seg.count() === 1, "steal-threat control shown with a runner on 1st and 2nd open");
  await seg.getByRole("button", { name: "Running" }).click(); await page.waitForTimeout(250);
  const st = await page.evaluate(() => situation().steal);
  check(st && st.a === 0.10 && st.runner === 1, `situation().steal ${JSON.stringify(st)}`);

  console.log("8. Radar readings (optional) are logged per pitch");
  await page.evaluate(() => { S.setup.radar = true; save(); render(); });
  await page.keyboard.press("b"); await page.waitForTimeout(150);
  const radarBox = page.getByLabel("Radar reading, mph");
  check(await radarBox.count() === 1, "radar box in the result panel when radar logging is on");
  await radarBox.fill("84.5"); await radarBox.dispatchEvent("change");
  await page.getByRole("button", { name: "Log pitch" }).click(); await page.waitForTimeout(300);
  const rr = await page.evaluate(() => JSON.stringify(G().radar));
  check(rr.includes("84.5"), `radar stored: ${rr}`);
  await page.evaluate(() => { S.setup.radar = false; save(); render(); });

  console.log("9. Hitter grades and crowding in Setup, on his roster record");
  await page.evaluate(() => { S.view = "setup"; render(); });
  const gsel = page.getByLabel("Hitter 1 contact grade");
  check(await gsel.count() === 1, "contact / power / eye grades in the lineup");
  await gsel.selectOption("5"); await page.waitForTimeout(150);
  const g1 = await page.evaluate(() => { const b = S.setup.lineup[0], x = b.hitterId && DB.hitters.get(b.hitterId); return (x || b).grades; });
  check(g1 && g1.c === 5, `grade saved: ${JSON.stringify(g1)}`);

  console.log("10. The v0.7c engine is one switch away and is exactly v0.7c");
  await page.getByRole("button", { name: /v0\.7c: the previous engine/ }).click(); await page.waitForTimeout(150);
  const r10 = await page.evaluate(() => {
    S.view = "live"; G().call = null; makeCall();
    const a = JSON.stringify(G().call.dist), ref = E.callMixed(arsenal(), situation(), {}).dist.slice(0, 5).map((d) => ({ pitch: d.pitch.name, quad: d.quad, prob: d.prob }));
    return { flags: E.FLAGS.look_state, same: a === JSON.stringify(ref), v08: !!G().call.v08 };
  });
  check(!r10.flags && r10.same && !r10.v08, `v0.7c mode: look_state ${r10.flags}, call is callMixed's ${r10.same}`);
  await page.getByRole("button", { name: /v0\.7c: the previous engine/ }).count();
  await page.evaluate(() => { S.setup.engine = "v08"; applyEngineMode(); G().pa = null; save(); });

  console.log("11. Phone width: no sideways scroll with the v0.8 controls showing");
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const pp = await phone.newPage(); pp.on("pageerror", (e) => errs.push(String(e)));
  await pp.goto(url); await pp.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 10000 });
  await pp.evaluate(() => { S.view = "live"; G().bases = [true, false, true]; G().outs = 0; G().call = null; makeCall(); render(); });
  await pp.waitForTimeout(400);
  const sw = await pp.evaluate(() => document.documentElement.scrollWidth);
  check(sw <= 390, `scrollWidth ${sw} at 390 px`);
  await pp.screenshot({ path: path.join(__dirname, "v08_390.png"), fullPage: true });
  await page.evaluate(() => { S.view = "live"; G().bases = [true, false, false]; render(); });
  await page.screenshot({ path: path.join(__dirname, "v08_1180.png") });

  check(errs.length === 0, `page errors: ${errs.length ? errs.join(" | ") : "none"}`);
  await browser.close(); server.close();
  console.log(fails ? `FAIL: ${fails} v0.8 browser checks failed` : "all v0.8 browser checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
