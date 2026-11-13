/*
 * v1.2 Part B (plan 2.8, Step B2 "App") in the real page: the coach's hitter tags.
 *   1. four tag rows on the hitter card, unknown by default; setting one stores it on his roster record (scoutTags)
 *   2. the engine gets hitter_tags only when one is set, and the event snapshot carries them only then
 *   3. the importer reads tag columns; blank cells keep what he has
 *   4. no page errors
 * Run from app/ after a build: node v12_tags_e2e.js
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = process.env.DIST || path.join(__dirname, "dist/pitch-caller.html");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`);
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  const errs = [];
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 10000 });

  console.log("1. Untagged: nothing changes");
  const u = await page.evaluate(async () => {
    S.view = "live"; G().call = null; makeCall();
    const s = situation(); record({ result: "ball" });
    await new Promise((r) => setTimeout(r, 300));
    const evs = (await DB.D.byIndex("events", "gameId", G().dbId)).filter(PCDB.isPitch).sort((a, b) => a.n - b.n);
    return { has: "hitter_tags" in s, snap: "hitter_tags" in (evs[evs.length - 1].sit || {}) };
  });
  check(!u.has && !u.snap, "no tags set: the engine's situation and the event snapshot have no hitter_tags key");

  console.log("2. Tag the batter up through the hitter card");
  const hid = await page.evaluate(async () => {
    // give the current batter a roster record on an opponent, as the opponent screen would
    const t = await dbPut("teams", { name: "Rivals", isOurs: false, level: S.setup.level, notes: "" }); DB.teams.set(t.id, t);
    const b = batterDef(); const x = await dbPut("hitters", PCDB.newHitter(t.id, { name: b.name || "Smith", bats: "R" })); DB.hitters.set(x.id, x);
    b.hitterId = x.id; S.setup.opponentId = t.id; S.view = "roster"; rosterTab = "opp"; teamSel = t.id; render();
    return x.id;
  });
  await page.waitForTimeout(300);
  const name = await page.evaluate((id) => DB.hitters.get(id).name, hid);
  const sel = (label) => page.locator(`select[aria-label="${name} ${label}"]`);
  check(await sel("early counts").count() === 1 && await sel("spray").count() === 1 && await sel("swing path").count() === 1 && await sel("off-speed").count() === 1,
    "the hitter row has four tag rows");
  check(await sel("early counts").inputValue() === "", "each starts as Unknown");
  await sel("early counts").selectOption("aggressive"); await page.waitForTimeout(200);
  await sel("spray").selectOption("pull"); await page.waitForTimeout(300);
  const stored = await page.evaluate(async (id) => (await DB.D.get("hitters", id)).scoutTags, hid);
  check(JSON.stringify(stored) === '{"approach":"aggressive","spray":"pull"}', `stored on his roster record (${JSON.stringify(stored)})`);
  const t1 = await page.evaluate(async () => {
    S.view = "live"; G().call = null; makeCall();
    const s = situation(); record({ result: "ball" });
    await new Promise((r) => setTimeout(r, 300));
    const evs = (await DB.D.byIndex("events", "gameId", G().dbId)).filter(PCDB.isPitch).sort((a, b) => a.n - b.n);
    return { tags: s.hitter_tags, snap: (evs[evs.length - 1].sit || {}).hitter_tags };
  });
  check(JSON.stringify(t1.tags) === '{"approach":"aggressive","spray":"pull"}', `the engine gets them (${JSON.stringify(t1.tags)})`);
  check(JSON.stringify(t1.snap) === JSON.stringify(t1.tags), "the event snapshot carries them");
  await page.evaluate(() => { S.view = "roster"; render(); }); await page.waitForTimeout(300);
  await sel("early counts").selectOption(""); await sel("spray").selectOption(""); await page.waitForTimeout(300);
  const cleared = await page.evaluate(async (id) => ({ rec: "scoutTags" in (await DB.D.get("hitters", id)), sit: "hitter_tags" in situation() }), hid);
  check(!cleared.rec && !cleared.sit, "back to Unknown: removed from the record, and the engine gets none");

  console.log("3. The importer reads tag columns");
  const imp = await page.evaluate(() => PCImport.parseHitters("Name,Bats,Approach,Spray,Path,Offspeed\nAl Able,R,Aggressive,pull-heavy,level,\nBo Bee,L,,,uppercut,hits hard\nCy Sea,S,maybe,,,\n")
    .map((x) => [x.name, x.scoutTags || null]));
  check(JSON.stringify(imp) === '[["Al Able",{"approach":"aggressive","spray":"pull","path":"flat"}],["Bo Bee",{"path":"lift","offspeed":"hits"}],["Cy Sea",null]]',
    `tag words read loosely; blank or unknown words are Unknown (${JSON.stringify(imp)})`);

  console.log("4. Page errors");
  check(errs.length === 0, `none (${errs.slice(0, 3).join(" | ")})`);
  await browser.close(); server.close();
  console.log(fails ? `${fails} check(s) failed` : "all checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
