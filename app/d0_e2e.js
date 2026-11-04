/*
 * D0 in the real page (served over http so IndexedDB works). Run from app/: node d0_e2e.js
 *   - every pitch is logged as type "pitch" with a running order and the pack version the calls were reading
 *   - a pitching change, a Correct edit and a catcher change are logged as plays, in order with the pitches
 *   - the game starts with pack version 1; a re-grade mid-game makes version 2, and pitches after it carry it
 *   - undoing the very first pitch keeps the same game record (it used to start a second one)
 *   - End game moves the game to final through the status rules; the learner and pitch counts ignore plays
 *   - a backup carries the plays and packs, and a fresh device restores it
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = path.join(__dirname, "dist/pitch-caller.html");
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
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e))); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  const wait = (ms = 150) => page.waitForTimeout(ms);
  await page.goto(url);
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 8000 });
  await page.evaluate(async () => {
    if (S.setup.staffIds.length < 2) { const np = await dbPut("pitchers", PCDB.newPitcher(ourTeam().id, { name: "Reliever" })); DB.pitchers.set(np.id, np); S.setup.staffIds.push(np.id); attachStaff(); }
    const c = await dbPut("catchers", { teamId: ourTeam().id, name: "Backup C", block: 2 }); DB.catchers.set(c.id, c);
    S.view = "live"; G().call = null; makeCall(); save(); render();
  });
  await wait(300);
  const game = () => page.evaluate(() => ({ dbId: G().dbId, packId: G().packId, packV: G().packV, seq: G().seq, n: G().pitchNo }));

  console.log("1. Undoing the first pitch keeps the same game");
  await page.keyboard.press("b"); await wait();
  const first = await game();
  await page.keyboard.press("u"); await wait(250);
  const afterUndo = await game();
  await page.keyboard.press("c"); await wait();
  const second = await game();
  check(first.dbId && afterUndo.dbId === first.dbId && second.dbId === first.dbId, `one game id through the undo (${first.dbId})`);
  const nGames = await page.evaluate(async () => (await DB.D.all("games")).filter((g) => g.status === "live").length);
  check(nGames === 1, `one live game record in the database (${nGames})`);

  console.log("2. Pitches, plays and pack versions");
  for (const k of ["b", "c", "b"]) { await page.keyboard.press(k); await wait(); }
  const v1 = await game();
  // a re-grade mid-game: the same path the Roster's arsenal card takes
  await page.evaluate(() => { const p = pitcherDef(); const d = p.pitches[0]; const old = d.command; d.command = old >= 5 ? 4 : old + 1; logGrade(p, d, "command", old); savePitcher(p, false); render(); });
  await wait();
  const v2 = await game();
  check(v1.packV === 1 && v2.packV === 2 && v2.packId !== v1.packId, `the game started on pack version 1; the re-grade made version 2 (${v1.packV} > ${v2.packV})`);
  for (const k of ["b", "c"]) { await page.keyboard.press(k); await wait(); }
  // a Correct edit (outs +1) and a pitching change from the game screen
  await page.getByRole("button", { name: "Correct" }).click(); await wait();
  await page.getByRole("button", { name: "Outs up" }).click(); await wait();
  await page.getByRole("button", { name: "Done" }).click(); await wait();
  await page.evaluate(() => changePitcher()); await wait(250);
  // a catcher change through Setup's picker
  await page.evaluate(() => { const id = [...DB.catchers.values()][0].id; const was = S.setup.catcherId || null; S.setup.catcherId = id; logPlay("sub_catcher", { outId: was, inId: id }); makePack("catcher"); save(); });
  for (const k of ["b", "c", "b"]) { await page.keyboard.press(k); await wait(); }
  await wait(300);
  const evs = await page.evaluate(async () => (await DB.D.byIndex("events", "gameId", G().dbId)).sort((a, b) => a.seq - b.seq));
  const pitches = evs.filter((e) => e.type === "pitch"), plays = evs.filter((e) => e.type === "play");
  check(pitches.length === 9 && pitches.every((e) => e.seq && e.packId), `9 pitches, each with a running order and a pack id (${pitches.length})`);
  check(plays.map((e) => e.play).join(",") === "correct,sub_pitcher,sub_catcher", `plays in order: ${plays.map((e) => e.play).join(", ")}`);
  const seqs = evs.map((e) => e.seq);
  check(seqs.every((x, i) => x === seqs[0] + i), `one running order, no gaps, pitches and plays together (${seqs[0]}..${seqs.at(-1)})`);
  check(pitches.map((e) => e.n).join(",") === "1,2,3,4,5,6,7,8,9", "pitch numbers still run 1..N with plays left out");
  const packs = await page.evaluate(async () => (await DB.D.byIndex("packs", "gameId", G().dbId)).sort((a, b) => a.v - b.v));
  check(packs.map((p) => p.v).join(",") === "1,2,3" && packs.map((p) => p.reason).join(",") === "start,pitcher,catcher", `pack versions ${packs.map((p) => p.v + ":" + p.reason).join(", ")}`);
  const byId = Object.fromEntries(packs.map((p) => [p.id, p.v]));
  check(pitches.slice(0, 4).every((e) => byId[e.packId] === 1) && pitches.slice(4, 6).every((e) => byId[e.packId] === 2) && pitches.slice(6).every((e) => byId[e.packId] === 3),
    `pitches carry the version in force when thrown (${pitches.map((e) => byId[e.packId]).join("")})`);
  const graded = packs[1].staff[0].pitches[0].command, before = packs[0].staff[0].pitches[0].command;
  check(graded !== before, `version 2 holds the new grade (${before} > ${graded}); version 1 kept the old one`);
  check(packs.every((p) => p.versions && p.versions.engine && p.versions.learner), "each pack records the app, engine, tables, and learner versions");
  check(plays[0].field === "outs" && plays[0].to === plays[0].from + 1 && plays[0].afterPitch === 6, `the Correct play says what changed (${plays[0].field} ${plays[0].from} > ${plays[0].to}, after pitch ${plays[0].afterPitch})`);

  console.log("3. End game, counts and the learner skip plays");
  const pid = pitches[0].pitcherId;
  await page.evaluate(() => endGame()); await wait(1500);
  const after = await page.evaluate(async (pid) => { const g = (await DB.D.all("games")).find((x) => x.statusLog && x.statusLog.some((s) => s.to === "final"));
    return { status: g && g.status, log: g && g.statusLog.map((s) => s.to).join(">"), packs: g && g.packs, count: DB.counts.get(pid), m: pModel(pid) }; }, pid);
  check(after.status === "final" && after.log === "live>final" && after.packs === 3, `the game closed through the rules (${after.log}, ${after.packs} packs)`);
  const mine = pitches.filter((e) => e.pitcherId === pid).length;
  check(after.count === mine, `the starter's pitch count is ${after.count}, his pitches only (plays with his id left out)`);
  check(after.m && after.m.profile && Object.values(after.m.profile.pitches).reduce((a, x) => a + x.n, 0) <= mine, "the learner ran on pitches only");

  console.log("4. Backup and restore on a fresh device");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.evaluate(() => backup())]);
  const data = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  check(data.schema === 2 && data.stores.packs.length === 3 && data.stores.events.filter((e) => e.type === "play").length === 3, `backup is version 2 with ${data.stores.packs.length} packs and 3 plays`);
  const page2 = await (await browser.newContext()).newPage();
  page2.on("pageerror", (e) => errs.push(String(e)));
  await page2.goto(url); await page2.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 8000 });
  const st = await page2.evaluate(async (d) => DB.D.importAll(d), data);
  check(st.events === data.stores.events.length && st.packs === 3, `restored ${st.events} events and ${st.packs} packs`);

  check(!errs.length, "no page errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} D0 check(s) FAILED` : "\nall D0 browser checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
