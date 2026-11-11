// Run from web/ after building the app (app/dist): node scripts/capture-app-call.cjs
// The real app (app/dist/pitch-caller.html) showing the call from web/content/candidates.ts: the same spot (sample
// starter, college D3, 1-2, runner on second, one out, fifth, tied, 61 pitches), the at-bat so far recorded through the
// app's own buttons, then the engine's drawn call and mix from the capture put on the call card.
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs");
const DIST = require("path").join(__dirname, "../../app/dist/pitch-caller.html");
const cand = fs.readFileSync(require("path").join(__dirname, "../content/candidates.ts"), "utf8");
const CANDS = JSON.parse(cand.slice(cand.indexOf("= [", cand.indexOf("export const CANDIDATES")) + 2).trim().replace(/;$/, ""));
const server = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  r.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`); });
const geo = async (page) => page.evaluate(() => {
  const f = (r) => ({ x: r.x / innerWidth, y: r.y / innerHeight, w: r.width / innerWidth, h: r.height / innerHeight });
  const rects = [...document.querySelectorAll(".zone svg rect")];
  const box = rects.find((r) => r.getAttribute("stroke") === "var(--ink)"), dash = rects.find((r) => r.getAttribute("stroke-dasharray"));
  const foul = [...document.querySelectorAll("button")].find((b) => /^Foul/.test(b.textContent.trim()));
  return { zone: f(box.getBoundingClientRect()), chase: f(dash.getBoundingClientRect()), foul: foul ? f(foul.getBoundingClientRect()) : null };
});
// the zone panel again at 6x, for the site's dive into it (the full screenshot is 2x, too soft at that zoom): the same
// saved game opened in a 6x browser, the panel clipped out with room for the marks' halos
const zoneShot = async (page, file) => {
  const g = await geo(page), c = g.chase, px = 24 / 1180, py = 24 / 820;
  const clip = { x: (c.x - px) * 1180, y: (c.y - py) * 820, width: (c.w + 2 * px) * 1180, height: (c.h + 2 * py) * 820 };
  const state = await page.evaluate(() => localStorage.getItem("pitchcaller.v2"));
  const ctx = await page.context().browser().newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 6 });
  await ctx.addInitScript((st) => { try { localStorage.setItem("pitchcaller.v2", st); } catch (e) {} }, state);
  const p2 = await ctx.newPage();
  await p2.goto(page.url()); await p2.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 15000 });
  await p2.evaluate(() => { S.view = "live"; render(); }); await p2.waitForTimeout(700);
  const g2 = await geo(p2);
  if (Math.abs(g2.zone.x - g.zone.x) > 1e-3 || Math.abs(g2.zone.y - g.zone.y) > 1e-3) throw new Error("the 6x copy laid out differently");
  await p2.screenshot({ path: file, clip });
  await ctx.close();
  return { x: clip.x / 1180, y: clip.y / 820, w: clip.width / 1180, h: clip.height / 820 };
};
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 });
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(url); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 15000 });
  await page.evaluate(() => {
    const g = G(); S.view = "live";
    S.setup.lineup[8].hand = "R";
    Object.assign(g, { inning: 5, outs: 1, balls: 0, strikes: 0, bases: [false, true, false], us: 2, them: 2, batter: 17 });
    g.pc[pKey()] = 58; g.bf[pKey()] = 17;
    g.call = null; makeCall(); save(); render();
  });
  // the at-bat so far, through the app's own result keys: slider away for a ball, fastball in for a called strike,
  // fastball up and away fouled off
  for (const [pitch, quad, key] of [["Slider", "down-away", "b"], ["Fastball", "up-in", "c"], ["Fastball", "up-away", "f"]]) {
    if (key === "f") {
      // the 1-1 call: the app's own call, redrawn until its draw is the fastball up and away (so it is one the engine
      // really makes here), then the "before the tap" screen
      const got = await page.evaluate(() => { G().takes = []; let sd = 11; Math.random = () => (sd = (sd * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 400; i++) { G().call = null; makeCall(); if (G().call.pitch === "Fastball" && G().call.quad === "up-away") return { i, prob: G().call.prob }; } return null; });
      console.log("1-1 call:", JSON.stringify(got));
      await page.evaluate(() => { save(); render(); }); await page.waitForTimeout(600);
      await page.screenshot({ path: require("path").join(__dirname, "../public/marketing/app-call-before.png") });
      const g = await geo(page);
      g.zoneHi = await zoneShot(page, require("path").join(__dirname, "../public/marketing/app-zone-before.png"));
      console.log("before geometry (fractions of the screenshot):", JSON.stringify(g));
      fs.writeFileSync(require("path").join(__dirname, "../content/app-call-geometry.json"), JSON.stringify(g, null, 1) + "\n");
      await page.mouse.click(5, 5); await page.keyboard.press(key); await page.waitForTimeout(300);
      if (await page.evaluate(() => !!pending)) { await page.keyboard.press("Enter"); await page.waitForTimeout(300); }
      continue;
    }
    await page.evaluate(([p, q]) => { const c = G().call; c.pitch = p; c.quad = q; render(); }, [pitch, quad]);
    await page.waitForTimeout(150); await page.mouse.click(5, 5); await page.keyboard.press(key); await page.waitForTimeout(300);
    if (await page.evaluate(() => !!pending)) { await page.keyboard.press("Enter"); await page.waitForTimeout(300); }
  }
  const st = await page.evaluate(() => ({ b: G().balls, s: G().strikes, o: G().outs, bases: G().bases, pc: G().pc[pKey()], last: G().last, seen: know().seen }));
  console.log(JSON.stringify(st));
  // the engine's call for this spot, exactly as scripts/capture-candidates.cjs makes it (same arsenal, situation and
  // seeded draw), with its why line and intent from the same solve
  await page.evaluate(() => {
    const ars = [["Fastball", "FB", 3, 4, 0.8, "ride", 86], ["Slider", "SL", 4, 3, 0.75, "tight", 78], ["Changeup", "CH", 3, 2, 0.6, "fade", 77]]
      .map(([name, kind, grade, command, feel, shape, velo]) => E.Pitch({ name, kind, grade, command, conf: feel, base_conf: feel, shape, velo, slot: "three-quarter", height_ft: 6.1 }));
    const sit = E.Situation({ balls: 1, strikes: 2, outs: 1, bases: [false, true, false], inning: 5, margin: 0, pitch_count: 61, batters_faced: 17, level: "college_d3", same_side: true, last: ["Fastball", "up-away"], hitter_seen: { Fastball: 2, Slider: 1 }, usage_this_count: {} });
    let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const r = E.callV08(ars, sit, { rng });
    const c = G().call;
    Object.assign(c, { pitch: r.pick.pitch.name, quad: r.pick.quad, prob: r.pick.prob, coach: false, walk: false, sigma: r.info.sigma,
      dist: r.dist.slice(0, 5).map((d) => ({ pitch: d.pitch.name, quad: d.quad, prob: d.prob })) });
    c.why = E.whyLine(ars, r.info.s, r.tab, r.pick, r.info)[0];
    [c.intent, c.mechanism, c.intentLine] = E.intentLabel(ars, r.info.s, r.tab, r.pick, r.info, []);
    window.__lock = JSON.stringify(c);
    save(); render();
  });
  await page.waitForTimeout(800);
  console.log("after geometry (fractions of the screenshot):", JSON.stringify(await geo(page)));
  const why = await page.evaluate(() => ({ same: JSON.stringify(G().call) === window.__lock, pick: G().call.pitch + " " + G().call.quad, prob: G().call.prob, why: G().call.why, intent: G().call.intentLine }));
  console.log(JSON.stringify(why));
  await page.screenshot({ path: require("path").join(__dirname, "../public/marketing/app-call-after.png") });
  await zoneShot(page, require("path").join(__dirname, "../public/marketing/app-zone-after.png"));
  console.log(errs.join("\n") || "no errors");
  await b.close(); server.close();
})();
