/*
 * Step 2 proof (spec 4): a game charted in the real app replays exactly from the raw log.
 * A scripted game in a browser (served over http so IndexedDB works): locations on every pitch, shake-offs, a coach
 * call, a cross-up, a wild pitch fixed after the fact, an undo, an inning change and a pitching change; End game; Back up.
 * Then, in Node, from the backup alone, learner v2's own replay rebuilds every pitch's confidence, "landing today" and
 * pitch count exactly as the app had them, and every pitch is present, versioned and sorted into the right game.
 * Run from app/: node replay_e2e.js
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const E = require("./engine.js"); E.init(require("./engine_data.json"));
const L2 = require("./learner.js");
const DIST = path.join(__dirname, "dist/pitch-caller.html"), OUT = path.join(__dirname, "e2e_shots");
fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/?")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`); }
  else { res.writeHead(404); res.end(); }
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e))); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  const wait = (ms = 120) => page.waitForTimeout(ms);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 8000 });
  // two pitchers on today's staff, locations and hitter reads logged
  await page.evaluate(async () => {
    if (S.setup.staffIds.length < 2) { const np = await dbPut("pitchers", PCDB.newPitcher(ourTeam().id, { name: "Reliever" })); DB.pitchers.set(np.id, np); S.setup.staffIds.push(np.id); attachStaff(); }
    S.setup.logLoc = true; S.setup.inputs = 3; S.view = "live"; G().call = null; makeCall(); save(); render();
  });
  await wait(300);
  const live = () => page.evaluate(() => ({ over: G().inningOver, n: G().pitchNo, bases: G().bases.some(Boolean), call: G().call && G().call.pitch }));
  const tapLoc = async () => { await page.locator(".lgrid .lc").nth(Math.floor(rnd() * 25)).click(); };
  // a swing-and-miss or a foul with hitter reads open the follow-ups; Enter logs it without a read
  const logDetail = async () => { if (await page.locator(".lv-tray").count()) await page.keyboard.press("Enter"); };
  let pitched = 0, didCoach = false, didCross = false, didWP = false, didUndo = false, didChange = false, didInning = false;
  while (pitched < 46) {
    let st = await live();
    if (st.over) { await page.getByRole("button", { name: /Take the field/ }).click(); didInning = true; await wait(200); continue; }
    if (pitched === 24 && !didChange) {   // pitching change through the bullpen panel
      await page.locator(".tabs button", { hasText: "Data" }).click(); await wait(200);
      await page.locator("button.pen-act").first().click(); didChange = true; await wait(250); continue;
    }
    if (pitched % 7 === 3) { await page.keyboard.press("k"); await wait(150); }                // a shake-off before this pitch
    if (pitched === 10 && !didCoach) {                                                        // the coach calls his own
      await page.getByRole("button", { name: "Call my own" }).click();
      await page.locator(".pick .seg").first().locator("button").nth(1).click();
      await page.locator(".pick .seg").nth(1).locator("button").first().click();
      await page.locator(".pick .go").click(); await wait(150); didCoach = true;
    }
    await tapLoc();
    const r = rnd();
    if (pitched === 15 && !didCross) {                                                        // in play, crossed up
      await page.locator(".key", { hasText: "In play" }).click();
      await page.locator(".lv-tray .ct", { hasText: "Weak" }).click();
      await page.locator(".lv-tray .dash", { hasText: "Cross-up" }).click();
      await page.locator('.lv-tray .opts[aria-label="Crossed up? He threw"] button').first().click();
      await page.locator(".lv-tray .out", { hasText: "Out" }).first().click(); didCross = true;   // the result logs it
    } else if (r < 0.36) await page.keyboard.press("b");
    else if (r < 0.52) await page.keyboard.press("c");
    else if (r < 0.64) { await page.keyboard.press("s"); await wait(60); await logDetail(); }
    else if (r < 0.78) { await page.keyboard.press("f"); await wait(60); await logDetail(); }
    else {
      await page.locator(".key", { hasText: "In play" }).click();
      const out = rnd() < 0.7 ? "Out" : rnd() < 0.7 ? "Single" : "Double";
      await page.locator(".lv-tray .ct", { hasText: ["Weak", "Solid", "Hard"][Math.floor(rnd() * 3)] }).click();
      await page.locator(".lv-tray .out", { hasText: out }).first().click();
    }
    await wait(140);
    pitched++;
    if (pitched === 20 && !didUndo) { await page.keyboard.press("u"); await wait(200); pitched--; didUndo = true; }
  }
  // the database not open yet (it opens a moment after the page): two pitches wait in the saved state, then are written
  if ((await live()).over) { await page.getByRole("button", { name: /Take the field/ }).click(); await wait(200); }
  await page.evaluate(() => { DB.ready = false; });
  for (const k of ["b", "c"]) { await tapLoc(); await page.keyboard.press(k); await wait(150); }
  const queued = await page.evaluate(() => (S.queue && S.queue.events.length) || 0);
  await page.evaluate(async () => { DB.ready = true; await flushQueued(); });
  check(queued === 2, `with the database closed, the pitches wait in the saved state (${queued} queued) and are written when it opens`);
  // a wild pitch, marked afterwards with Fix on the newest ball with runners on
  // (walk a hitter if needed, so the newest pitches include a ball with a runner on)
  for (let i = 0; i < 9 && !(await page.evaluate(() => G().bases.some(Boolean))); i++) { await tapLoc(); await page.keyboard.press("b"); await wait(140); }
  await tapLoc(); await page.keyboard.press("b"); await wait(160);
  const wpN = await page.evaluate(() => { const l = G().log.find((x) => x.res === "ball" && x.on); return l ? l.n : null; });
  if (wpN) {
    await page.locator(`.log-row[data-n="${wpN}"]`).click(); await wait(150);
    await page.locator(".fixbox .fixrow", { hasText: "Wild pitch / passed ball" }).locator("button", { hasText: "Wild pitch" }).click(); await wait(200);
    await page.locator(".fixbox").getByRole("button", { name: "Done" }).click(); didWP = true;
  }
  await page.screenshot({ path: path.join(OUT, "replay_game.png"), fullPage: true });
  const charted = await page.evaluate(() => ({ n: G().pitchNo, gameId: G().dbId }));
  // End game (two taps), then Back up
  await page.getByRole("button", { name: "End game" }).click(); await wait(100);
  await page.getByRole("button", { name: "End game" }).click();
  await page.waitForFunction((id) => G().pitchNo === 0 && [...DB.models.keys()].filter((k) => k.startsWith("v2:")).length >= 2, null, { timeout: 60000 }); await wait(300);
  const usedWorker = await page.evaluate(() => !!learnWorker);
  check(usedWorker, "learning ran in the background worker, not on the screen's thread");
  await page.locator(".tabs button", { hasText: "Roster" }).click(); await wait(300);
  // a re-grade and a change mark, both kept for the learner
  const stuff = page.locator('input[aria-label="Stuff, 1 to 5"]').first();
  const was = await stuff.inputValue(); await stuff.fill(String(+was === 4 ? 3.5 : 4)); await stuff.press("Tab"); await wait(300);
  await page.getByRole("button", { name: "Mark changed" }).first().click(); await wait(300);
  await page.screenshot({ path: path.join(OUT, "replay_roster.png"), fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Back up" }).click()]);
  const file = path.join(OUT, "replay_backup.json"); await dl.saveAs(file);
  await browser.close(); server.close();

  // ---------------------------------------------------------------- from the backup alone
  const bk = JSON.parse(fs.readFileSync(file, "utf8"));
  const game = bk.stores.games.find((g) => g.id === charted.gameId);
  // D0: a game's events are its pitches and the plays between them (here, the pitching change); these checks are about pitches
  const evs = bk.stores.events.filter((e) => e.gameId === charted.gameId && !e.deletedAt && e.type === "pitch").sort((a, b) => a.n - b.n);
  const playsHere = bk.stores.events.filter((e) => e.gameId === charted.gameId && !e.deletedAt && e.type === "play");
  console.log(`scripted game: ${charted.n} pitches charted; coach call ${didCoach}, cross-up ${didCross}, wild pitch ${didWP}, undo ${didUndo}, inning change ${didInning}, pitching change ${didChange}`);
  check(evs.length === charted.n && evs.every((e, i) => e.n === i + 1), `every pitch is in the backup, numbered 1..${charted.n} with no holes (${evs.length})`);
  check(bk.stores.events.filter((e) => e.gameId === charted.gameId && e.deletedAt).length === 1, "the undone pitch is kept as a deletion, not counted");
  check(playsHere.length === 1 && playsHere[0].play === "sub_pitcher" && playsHere[0].afterPitch === 24, `the pitching change is logged as a play after pitch 24 (${playsHere.map((e) => e.play + "@" + e.afterPitch).join(", ")})`);
  check(game && game.status === "final" && game.completeness && game.completeness.located === 1, `End game saved the game as final with its completeness (${game && JSON.stringify(game.completeness)})`);
  check(evs.every((e) => e.v && e.v.engine && e.v.data && e.v.learn && e.v.app && e.deviceId && e.choice), "every pitch carries app, engine, table and learner versions, the device and who chose it");
  check(evs.some((e) => e.choice === "coach") && evs.some((e) => e.choice === "recall") && evs.some((e) => e.thrown) && evs.some((e) => e.wp === "wp" && e.edits && e.edits.length),
    "a coach call, a re-call after a shake-off, a cross-up and a wild pitch fixed afterwards (with its edit history) are all logged");
  const pids = [...new Set(evs.map((e) => e.pitcherId))];
  check(pids.length === 2, "both pitchers' pitches are in the game");
  const pitchers = new Map(bk.stores.pitchers.map((p) => [p.id, p]));
  let confWorst = 0, confN = 0, landBad = 0, pcBad = 0, usableBad = 0;
  for (const pid of pids) {
    const mine = evs.filter((e) => e.pitcherId === pid);
    const games = L2.gamesOf(mine);
    if (games.length !== 1 || games[0].evs.length !== mine.length) usableBad++;
    // confidence: learner v2's own replay script, strike rate as the app had it (none served yet)
    for (const pd of pitchers.get(pid).pitches) {
      const { script, base } = L2._pitchGame(games[0], pd, () => pd.name);
      // the strike rate the app served for this pitch in this game (logged in each pitch's arsenal snapshot)
      const firstSnap = mine.map((e) => e.ars.find((x) => x.name === pd.name)).find(Boolean);
      const path_ = L2._confPath(E, pd.kind, base, script, firstSnap && firstSnap.strike_rate != null ? firstSnap.strike_rate : null);
      const thrownEvs = mine.filter((e) => (e.thrown || e.pitchName) === pd.name);
      thrownEvs.forEach((e, k) => { const snap = e.ars.find((x) => x.name === pd.name); confWorst = Math.max(confWorst, Math.abs(path_[k] - snap.conf)); confN++; });
    }
    // landing today and pitch count, rebuilt by counting
    const land = {};
    mine.forEach((e, i) => {
      if (JSON.stringify(e.sit.landing_today || {}) !== JSON.stringify(land)) landBad++;
      if (e.pcRaw !== i || e.sit.pitch_count !== e.pcRaw + e.fatigueShift) pcBad++;
      const t = e.thrown || e.pitchName, x = land[t] || [0, 0];
      land[t] = [x[0] + (e.res === "ball" || e.res === "hbp" ? 0 : 1), x[1] + 1];
      if (L2.usable(e) !== (e.choice === "engine")) usableBad++;
    });
  }
  check(confWorst === 0 && confN === evs.length, `learner v2's replay rebuilds his confidence before every pitch exactly (${confN} pitches, largest difference ${confWorst})`);
  check(landBad === 0, `"landing today" rebuilt exactly before every pitch (${landBad} mismatches)`);
  check(pcBad === 0, `raw pitch count and the fatigue-adjusted count rebuilt exactly (${pcBad} mismatches)`);
  check(usableBad === 0, "every pitch sorts into its game, and the learner uses exactly the engine's own calls");
  const regraded = bk.stores.pitchers.find((p) => (p.pitches || []).some((d) => d.gradeLog && d.gradeLog.length === 2));
  const gl = regraded && regraded.pitches.find((d) => d.gradeLog).gradeLog;
  check(!!gl && gl[1].sawLearned === true && gl[0].grade !== gl[1].grade, `a re-grade is logged with the grade before it and whether he'd seen what was learned (${JSON.stringify(gl)})`);
  check(bk.stores.pitchers.some((p) => (p.changes || []).length === 1 && p.changes[0].pitchId), "a change mark is saved with its pitch and time");
  check(!errs.length, `no page errors${errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""}`);
  console.log(fails ? `\n${fails} check(s) failed` : "\nall replay checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
