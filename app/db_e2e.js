/*
 * End to end in a real browser, served over http so IndexedDB works: roster, check-in, TrackMan import, opponents,
 * a charted game with location and an undo, learning after the game, reload, backup and restore.
 * Run from app/: node db_e2e.js   (needs playwright; writes screenshots to e2e_shots/)
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = path.join(__dirname, "dist/pitch-caller.html"), OUT = path.join(__dirname, "e2e_shots");
fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };

// fixtures: a TrackMan-shaped bullpen file for "Drew Kindlon" and an opponent hitters sheet (made-up numbers)
let seed = 3; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const g = (m, s) => m + s * (rnd() + rnd() + rnd() - 1.5);
function trackmanCSV() {
  const lines = ["PitchNo,Date,Pitcher,PitcherThrows,TaggedPitchType,PitchCall,RelSpeed,SpinRate,RelHeight,RelSide,Extension,InducedVertBreak,HorzBreak,PlateLocHeight,PlateLocSide"];
  let n = 0;
  for (const [t, v, ivb, hb, cnt] of [["Fastball", 88, 17, 10, 30], ["Sweeper", 78, 1, -14, 18], ["Splitter", 81, 4, 9, 12]])
    for (let i = 0; i < cnt; i++) lines.push([++n, "2026-11-01", '"Kindlon, Drew"', "Right", t, "BallCalled", g(v, 2).toFixed(1), Math.round(g(2300, 90)), g(5.7, 0.1).toFixed(2), g(t === "Sweeper" ? 2.0 : 1.8, 0.05).toFixed(2), "6.2", g(ivb, 1.4).toFixed(1), g(hb, 1.4).toFixed(1), g(2.5, 1.2).toFixed(2), g(0, 1.0).toFixed(2)].join(","));
  return lines.join("\n");
}
const HITTERS = "Name,#,Bats,PA,AVG,OBP,SLG,SO,BB\nJay Ortiz,4,L,140,.352,.470,.610,14,24\nSam Lee,12,S,90,.231,.310,.290,27,8\nAl Brooks,7,R,120,.300,.390,.480,20,15\nMo Diaz,22,R,60,.250,.340,.330,15,6\nTy Hart,3,L,110,.280,.400,.410,18,17\nRe Cole,15,R,100,.270,.360,.380,22,10\nKo Bell,9,R,95,.240,.330,.300,25,9\nLu Park,1,L,130,.320,.430,.450,12,20\nEd Fox,30,R,70,.210,.290,.260,24,5\n";

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/?")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`); }
  else { res.writeHead(404); res.end(); }
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e))); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  const shot = (name, full = true) => page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: full });
  const tab = (name) => page.locator(".tabs button", { hasText: name }).click();
  const wait = (ms = 150) => page.waitForTimeout(ms);
  const dbCount = (store, filter) => page.evaluate(async ([s, f]) => (await DB.D.all(s)).filter((x) => !f || eval(f)(x)).length, [store, filter || null]);

  await page.goto(url); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 8000 });
  console.log("1. First open: the prototype's saved state moves into the database");
  check(await page.evaluate(() => DB.pitchers.size === 2 && S.setup.staff.every((p) => p.id && DB.pitchers.get(p.id) === p)), "sample staff became two roster pitchers, and today's staff points at them");

  console.log("2. Roster: add a pitcher, fill his profile and arsenal");
  await tab("Roster"); await wait();
  await page.getByRole("button", { name: "Add a pitcher" }).click(); await wait();
  const prof = page.locator('section[aria-label="Profile"]');
  await prof.locator("label", { hasText: "Name" }).locator("input").fill("Drew Kindlon"); await prof.locator("label", { hasText: "Name" }).locator("input").press("Tab"); await wait();
  await prof.locator("label", { hasText: "Number" }).locator("input").fill("21"); await prof.locator("label", { hasText: "Number" }).locator("input").press("Tab"); await wait();
  await prof.getByRole("button", { name: "Reliever" }).click(); await wait();
  await prof.getByRole("button", { name: "Add to today's staff" }).click(); await wait();
  const ars = page.locator('section[aria-label="Arsenal"]');
  await ars.locator("select").last().selectOption("Sweeper"); await wait();
  const pid = await page.evaluate(() => rosterSel);
  const rec = await page.evaluate(async (id) => DB.D.get("pitchers", id), pid);
  check(rec && rec.name === "Drew Kindlon" && rec.number === "21" && rec.role === "RP" && rec.pitches.some((d) => d.type === "Sweeper" && d.kind === "SL"), "saved to the database: name, number, role, a sweeper filed as a slider");
  check(await page.evaluate((id) => S.setup.staffIds.includes(id) && S.setup.staff.length === 3, pid), "added to today's staff");

  console.log("3. Check-in");
  const ci = page.locator('section[aria-label="Today\'s check-in"]');
  await ci.getByRole("button", { name: "Tight" }).click();
  await ci.locator("label", { hasText: "Hours of sleep" }).locator("input").fill("5"); await ci.locator("label", { hasText: "Hours of sleep" }).locator("input").press("Tab");
  await ci.locator('input[type="range"]').first().fill("9");
  await ci.getByRole("button", { name: /Save check-in/ }).click(); await wait(300);
  const c = await page.evaluate(async (id) => (await DB.D.byIndex("checkins", "pitcherId", id))[0], pid);
  check(c && c.arm === 2 && c.sleep === 5 && Object.values(c.conf)[0] === 9, "arm 'tight', 5 hours, fastball confidence 9 saved");
  check(await page.evaluate((id) => { const p = DB.pitchers.get(id); return fatigueShift(p) === 15 && PCLearn.checkinFeel(todayCheckin(id), p.pitches[0].id) === 0.88; }, pid), "today: fatigue point down 15 pitches, fastball starts at feel 0.88");

  console.log("4. TrackMan file");
  await page.locator('section[aria-label="TrackMan and Rapsodo"] input[type="file"]').setInputFiles({ name: "bullpen.csv", mimeType: "text/csv", buffer: Buffer.from(trackmanCSV()) }); await wait(300);
  check(await page.locator(".imp tbody tr").count() === 3, "preview shows three pitch types");
  await shot("roster_import");
  await page.getByRole("button", { name: /Apply velo, break and spin/ }).click(); await wait(300);
  const rec2 = await page.evaluate(async (id) => DB.D.get("pitchers", id), pid);
  const fb = rec2.pitches.find((d) => d.kind === "FB"), sw = rec2.pitches.find((d) => d.type === "Sweeper"), sp = rec2.pitches.find((d) => d.type === "Splitter");
  check(Math.abs(fb.velo - 88) < 1.5 && sw && sw.hb < -10 && sp && sp.kind === "CH" && Array.isArray(sw.relOff), `arsenal filled: FB ${fb.velo} mph, sweeper ${sw && sw.hb} in, splitter added as a changeup, release offsets kept`);
  check((await dbCount("sessions")) === 1, "session stored");

  console.log("5. Catcher and opponent");
  await page.getByRole("button", { name: "Add a catcher" }).click(); await wait();
  await page.locator(".crow2 .seg button", { hasText: "5" }).click(); await wait();
  await page.locator(".roster .filters .seg button", { hasText: "Opponents" }).click(); await wait();
  await page.getByRole("button", { name: "Add an opponent" }).click(); await wait();
  const tp = page.locator('section[aria-label="Team"]');
  await tp.locator("label", { hasText: "Name" }).locator("input").fill("Ithaca"); await tp.locator("label", { hasText: "Name" }).locator("input").press("Tab"); await wait();
  await tp.locator('input[type="file"]').setInputFiles({ name: "ithaca.csv", mimeType: "text/csv", buffer: Buffer.from(HITTERS) }); await wait(400);
  check((await dbCount("hitters")) === 9, "nine hitters imported");
  await tp.getByRole("button", { name: "Play them today" }).click(); await wait(500);
  const lu = await page.evaluate(() => S.setup.lineup.map((b) => b.name + ":" + !!b.hitterId).join(", "));
  check(await page.evaluate(() => S.setup.lineup.every((b) => b.hitterId) && S.setup.lineup[0].name === "Lu Park"), `lineup filled from their roster in number order (${lu})`);
  const ortiz = await page.evaluate(() => { const x = [...DB.hitters.values()].find((y) => y.name === "Jay Ortiz"); const m = hModel(x.id); return m && m.damage.FB && m.damage.FB[0]; });
  check(ortiz > 0.2, `Ortiz (.470/.610) starts with a lean on fastballs (${ortiz})`);
  await shot("roster_opponents");

  console.log("6. Setup: today's catcher, log location");
  await tab("Setup"); await wait();
  await page.locator(".srow", { hasText: "Catcher" }).locator("select").selectOption({ index: 1 }); await wait();
  await page.getByRole("button", { name: /Also log where each pitch ended up/ }).click(); await wait();
  check(await page.evaluate(() => situation().catcher_block === 5 && S.setup.logLoc), "situation now carries blocking 5; location logging on");
  await shot("setup");

  console.log("7. Chart a game: Kindlon pitches with location, one undo");
  await tab("Game"); await wait(300);
  await page.evaluate((id) => { const i = S.setup.staff.findIndex((p) => p.id === id); G().pitcher = i; G().call = null; render(); }, pid); await wait(300);
  check(await page.locator(".locpick").count() === 1, "location grid shows on the game screen");
  await shot("game_location");
  const seq = ["b", "c", "s", "f", "b", "x", "b", "b", "c", "s", "c", "b", "f", "x", "c", "c", "s", "b", "c", "x", "b", "s", "c", "c"];
  let logged = 0;
  for (const k of seq) {
    if (await page.locator(".done").count()) { await page.getByRole("button", { name: /Take the field/ }).click(); await wait(200); }
    const cell = Math.floor(rnd() * 25); await page.locator(".lgrid .lc").nth(cell).click();
    // in play: contact first, then the result, which logs it
    if (k === "x") { const res = rnd() < 0.6 ? "Out" : "Single"; await page.locator(".key", { hasText: "In play" }).click(); await page.locator(".lv-tray .ct", { hasText: "Solid" }).click(); await page.locator(".lv-tray .out", { hasText: res }).first().click(); }
    else if (k === "s" || k === "f") { await page.keyboard.press(k); await page.keyboard.press("Enter"); }
    else await page.keyboard.press(k);
    await wait(80); logged++;
  }
  await page.keyboard.press("u"); await wait(400); logged--;
  const evs = await page.evaluate(async () => (await DB.D.byIndex("events", "gameId", G().dbId)));
  check(evs.length === logged && evs.length === G0(await page.evaluate(() => G().pitchNo)), `${evs.length} pitches in the database after the undo (game shows ${await page.evaluate(() => G().pitchNo)})`);
  function G0(x) { return x; }
  const e0 = evs.find((e) => e.loc && e.pred && e.sit && e.ars);
  check(evs.every((e) => e.pitcherId === pid && e.pred && e.sit && e.ars && e.hitterId && e.loc) && Math.abs(e0.pred.strike + e0.pred.ball + e0.pred.hbp - 1) < 0.01, "every pitch carries the pitcher, hitter, location, situation, inputs and the engine's prediction");
  check(e0.sit.catcher_block === 5 && e0.ars.find((a) => a.name === e0.pitchName).base_conf !== undefined, "the situation recorded the catcher; inputs recorded his feel");

  console.log("8. End the game: the flywheel runs");
  await tab("Setup"); await wait();
  await page.getByRole("button", { name: "Start a new game" }).click();
  await page.waitForFunction((id) => !!hModel && !!DB.models.get("v2:" + id) && DB.models.get("v2:" + id).profile, pid, { timeout: 30000 });
  await wait(600);
  const m = await page.evaluate((id) => DB.models.get("v2:" + id), pid);
  const nTot = Object.values(m.profile.pitches).reduce((a, x) => a + x.n, 0);
  const engineCalls = await page.evaluate(async (id) => (await DB.D.byIndex("events", "pitcherId", id)).filter((e) => !e.deletedAt && e.choice === "engine").length, pid);
  check(nTot === engineCalls && nTot > 0, `learner v2 learned from all ${nTot} of the engine's own calls (coach calls and re-calls left out)`);
  const firstStep = Object.entries(m.served.pitches).every(([id, x]) => { const d = m.profile.pitches[id]; return !x.learned || (Math.abs(x.command - x.coach.command) <= 0.15 + 1e-9 && Math.abs(x.grade - x.coach.grade) <= 0.15 + 1e-9); });
  check(firstStep && m.served.games.length === 1, "after one game the calls moved at most one 0.15 step from his grades");
  const game = await page.evaluate(async () => (await DB.D.all("games")).find((x) => x.status === "final" && !x.legacy));
  check(game && game.pitches === logged && game.opponentId, "game filed as final against the opponent");
  const faced = await page.evaluate(async () => (await DB.D.all("learned")).filter((x) => x.id.startsWith("h2:") && x.n > 0).length);
  check(faced >= 3, `${faced} hitters now carry what they did into the next game`);
  await tab("Roster"); await wait(200);
  await page.locator(".roster .filters .seg button", { hasText: "Our pitchers" }).click(); await wait(200);
  await page.locator(".pcard", { hasText: "Drew Kindlon" }).click(); await wait(200);
  check(await page.locator(".ltable tbody tr").first().locator(".lcell").count() === 2, "Roster shows entered vs learned for his pitches");
  await page.locator('section[aria-label="What it has learned"]').scrollIntoViewIfNeeded();
  await shot("roster_learned");

  console.log("9. Reload: everything is still there");
  await page.reload(); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 8000 }); await wait(300);
  check(await page.evaluate((id) => DB.pitchers.get(id).name === "Drew Kindlon" && S.setup.staffIds.includes(id) && DB.models.has("v2:" + id) && S.setup.opponentId && DB.teams.get(S.setup.opponentId).name === "Ithaca", pid), "pitcher, staff, model and opponent survive a reload");
  check(await page.evaluate((id) => { S.view = "live"; const i = S.setup.staff.findIndex((p) => p.id === id); G().pitcher = i; G().call = null; render(); return arsenal().length === S.setup.staff[i].pitches.length; }, pid), "calls come from his learned arsenal after reload");

  console.log("10. Backup and restore onto a fresh device");
  await tab("Roster"); await wait();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Back up" }).click()]);
  const file = path.join(OUT, "backup.json"); await dl.saveAs(file);
  const bk = JSON.parse(fs.readFileSync(file, "utf8"));
  const live = bk.stores.events.filter((x) => !x.deletedAt).length, gone = bk.stores.events.length - live;
  check(live === logged && gone === 1 && bk.stores.hitters.length === 9, `backup has ${live} pitches, the undone one kept as a deletion for sync, and 9 hitters`);
  const ctx2 = await browser.newContext({ viewport: { width: 1180, height: 820 } }); const p2 = await ctx2.newPage();
  p2.on("pageerror", (e) => errs.push(String(e)));
  await p2.goto(url); await p2.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 8000 });
  await p2.locator(".tabs button", { hasText: "Roster" }).click(); await p2.waitForTimeout(200);
  await p2.locator('label.btn.file:has-text("Restore") input').setInputFiles(file);
  await p2.waitForTimeout(1500); await p2.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 8000 });
  check(await p2.evaluate(async () => (await DB.D.all("events")).length) === logged && await p2.evaluate(() => [...DB.pitchers.values()].some((p) => p.name === "Drew Kindlon")), "fresh device has the pitches and the pitcher");
  await ctx2.close();

  console.log("11. Layout");
  for (const [w, hgt, v, name] of [[820, 1180, "roster", "roster_820"], [390, 844, "roster", "roster_390"], [390, 844, "live", "game_390"], [390, 844, "setup", "setup_390"]]) {
    await page.setViewportSize({ width: w, height: hgt }); await page.evaluate((v) => { S.view = v; render(); }, v); await wait(250);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= w, `${name}: nothing scrolls sideways (${sw}px)`);
    await shot(name);
  }
  await page.setViewportSize({ width: 1180, height: 820 }); await page.evaluate(() => { S.view = "roster"; rosterTab = "ours"; render(); }); await wait(200); await shot("roster_1180", false);
  check(!errs.length, `no page errors${errs.length ? ": " + errs.join(" | ") : ""}`);

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} check(s) failed` : "\nall end-to-end checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
