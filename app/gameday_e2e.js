/*
 * Game-day regressions from the code review (2026-11-04), in the real page. Run from app/: node gameday_e2e.js
 * Each check was first run against the build as it was before the fix, where it failed.
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = process.env.DIST || path.join(__dirname, "dist/pitch-caller.html");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(req.url.startsWith("/holder") ? "<!doctype html><title>holder</title>" : `<!doctype html><html><head><meta charset="utf-8"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`);
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const errs = [];
  const open = async (ctx) => {
    const page = await (ctx || await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
    page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto(url); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 8000 });
    return page;
  };
  const chart = async (page, n) => {
    const start = await page.evaluate(() => G().pitchNo);
    for (let i = 0, guard = 0; guard < n * 6; guard++) {
      if ((await page.evaluate(() => G().pitchNo)) - start >= n) break;
      if (await page.evaluate(() => !!G().inningOver)) { await page.getByRole("button", { name: /^Take the field/ }).click(); await page.waitForTimeout(120); continue; }
      await page.keyboard.press(["b", "c"][i++ % 2]); await page.waitForTimeout(110);
    }
  };
  const page = await open();
  await page.evaluate(() => { S.view = "live"; G().call = null; makeCall(); save(); render(); });

  console.log("1. Learning that lands during the next game is a new pack version");
  await chart(page, 12);
  await page.evaluate(() => { window.__end = endGame(); });
  await page.waitForFunction(() => G().pitchNo === 0, null, { timeout: 5000 });
  await chart(page, 1);                                              // the first pitch of the next game, before learning lands
  await page.evaluate(() => window.__end);
  const r1 = await page.evaluate(async () => {
    const pk = await DB.D.get("packs", G().packId);
    const now = JSON.parse(JSON.stringify(packContents()));
    return { v: G().packV, reason: pk.reason, same: JSON.stringify(pk.staff) === JSON.stringify(now.staff) };
  });
  check(r1.same, `the pack the next pitch is logged against holds what the calls now use (pack v${r1.v}, "${r1.reason}", matches: ${r1.same})`);

  console.log("2. A sync can't swap the pitcher on the mound");
  const r2 = await page.evaluate(async () => {
    const mk = async (name) => { const p = await dbPut("pitchers", PCDB.newPitcher(ourTeam().id, { name })); DB.pitchers.set(p.id, p); return p; };
    const A = await mk("Arm A"), B = await mk("Arm B"), C = await mk("Arm C");
    S.setup.staffIds = [A.id, B.id, C.id]; attachStaff(); G().pitcher = 1; save();
    await DB.D.del("pitchers", A.id);                                    // another iPad's delete of A came down
    await reloadFromDb();
    return { on: pitcherDef().id === B.id, name: pitcherDef().name };
  });
  check(r2.on, `B stays in the game after A is removed by a sync (on the mound: ${r2.name})`);

  console.log("3. Undo doesn't delete a later catcher change");
  const r3 = await page.evaluate(async () => {
    const c = await dbPut("catchers", { teamId: ourTeam().id, name: "Backup C", block: 2 }); DB.catchers.set(c.id, c);
    return c.id;
  });
  await chart(page, 2);
  await page.evaluate((cid) => { const was = S.setup.catcherId || null; S.setup.catcherId = cid; logPlay("sub_catcher", { outId: was, inId: cid }); makePack("catcher"); save(); render(); }, r3);
  await page.keyboard.press("u"); await page.waitForTimeout(300);
  const r3b = await page.evaluate(async (cid) => {
    const evs = (await DB.D.byIndex("events", "gameId", G().dbId));
    const play = (await DB.D.all("events", true)).find((e) => e.play === "sub_catcher" && e.inId === cid);
    return { catcher: S.setup.catcherId === cid, playKept: !!play && !play.deletedAt };
  }, r3);
  check(r3b.catcher && r3b.playKept, `the catcher change stands and so does its play in the log (catcher changed: ${r3b.catcher}, play kept: ${r3b.playKept})`);

  console.log("4. Two games ended close together keep both learning jobs");
  const r4 = await page.evaluate(async () => {
    await chartQuick(3); const c1 = await finishGameRecord(); archiveGame(); S.game = newGame();
    await chartQuick(3); const c2 = await finishGameRecord(); archiveGame(); S.game = newGame(); save();
    async function chartQuick(n) { for (let i = 0; i < n; i++) { if (!G().call) makeCall(); record({ result: "ball" }); } }
    await learnAfterGame(c1.learn);
    const left = (await DB.D.all("meta")).filter((m) => /^toLearn/.test(m.id));
    return { left: left.length, keys: left.map((m) => m.id).join(",") };
  });
  check(r4.left === 1, `after the first game's learning finishes, the second's job is still waiting (${r4.left} job${r4.left === 1 ? "" : "s"} left: ${r4.keys || "none"})`);

  console.log("5. A duplicate check never marks both copies");
  const r5 = await page.evaluate(async () => {
    const pid = pitcherDef().id, mkGame = async (id, dev, n) => {
      await DB.D.put("games", { id, date: "2026-04-01", status: "final", deviceId: dev, startedAt: dev === "A" ? 1 : 2 });
      for (let i = 0; i < n; i++) await DB.D.put("events", { id: `${id}-e${i}`, type: "pitch", gameId: id, pitcherId: pid, n: i + 1, seq: i + 1, pitchName: "Fastball", res: i % 3 ? "ball" : "cstrike", sit: { inning: 1 + Math.floor(i / 9), batters_faced: Math.floor(i / 4), balls: i % 4, strikes: i % 3 } });
    };
    await mkGame("gA", "A", 40); await mkGame("gB", "B", 38);
    for (let i = 0; i < 38; i++) { const e = await DB.D.get("events", `gB-e${i}`); Object.assign(e, { sit: (await DB.D.get("events", `gA-e${i}`)).sit }); await DB.D.put("events", e); }
    await checkDuplicates();
    for (const i of [10, 11, 12]) await DB.D.del("events", `gA-e${i}`);     // "leave this pitch out" on three of A's
    await checkDuplicates();
    const a = await DB.D.get("games", "gA"), b = await DB.D.get("games", "gB");
    return { a: a.dupOf || null, b: b.dupOf || null };
  });
  check(!(r5.a && r5.b), `at most one of the two is marked a copy (A: ${r5.a}, B: ${r5.b})`);

  console.log("6. A synced re-grade doesn't freeze the next call");
  const r6 = await page.evaluate(async () => {
    S.view = "live"; S.setup.level = "college_d3";
    const p = pitcherDef(), d = p.pitches[1];
    const m = pModel(p.id) || { id: "v2:" + p.id, pitcherId: p.id, profile: { pitches: {}, games: [] }, served: { pitches: {} } };
    m.served.pitches[d.id] = { command: 4, grade: 4, learned: true, traits: {}, strike_rate: 0.6, coach: { command: 4, grade: 4 } }; DB.models.set(m.id, m);
    d.kind = "CB"; d.shape = "12-6 hammer"; d.velo = 71.3; d.command = 2; d.grade = 2;     // a shape and velo no table has been built for yet
    G().call = null;
    const t0 = performance.now(); makeCall(); return performance.now() - t0;
  });
  check(r6 < 200, `the next call takes ${r6.toFixed(0)} ms (was about 700)`);

  console.log("7. The first pack has the staff even if the database wasn't open yet");
  const r7 = await page.evaluate(() => {
    const keep = new Map(DB.pitchers); DB.pitchers.clear();
    const pc = packContents(); for (const [k, v] of keep) DB.pitchers.set(k, v);
    return pc.staff.length;
  });
  check(r7 >= 1, `the pack lists ${r7} pitcher${r7 === 1 ? "" : "s"}`);

  console.log("8. A sync never leaves the screens reading empty lists");
  const r8 = await page.evaluate(async () => { const p = reloadFromDb(); await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); const mid = { t: DB.teams.size, p: DB.pitchers.size }; await p; return mid; });
  check(r8.t > 0 && r8.p > 0, `teams and pitchers while it reloads: ${r8.t}, ${r8.p}`);

  console.log("9. The earlier-game list, and odd saved values");
  await page.evaluate(async () => { S.view = "data"; render(); await new Promise((r) => setTimeout(r, 400)); S.view = "live"; render(); });   // the list was looked at once
  await chart(page, 2); await page.evaluate(() => endGame()); await page.waitForTimeout(1500);
  const r9 = await page.evaluate(async () => {
    S.view = "data"; render(); await new Promise((r) => setTimeout(r, 400)); render();
    const opts = document.querySelectorAll("#pastfix-game option").length - 1;
    const final = (await DB.D.all("games")).filter((g) => g.status === "final" && g.id !== G().dbId).length;
    return { opts, final };
  });
  check(r9.opts === r9.final && r9.opts > 0, `every saved game is in the list right after End game (${r9.opts} listed of ${r9.final})`);
  const r9b = await page.evaluate(async () => {
    const g = (await DB.D.all("games")).find((x) => x.status === "final");
    const evs = (await DB.D.byIndex("events", "gameId", g.id)).filter(PCDB.isPitch); const e = evs[0]; e.quad = "low"; await DB.D.put("events", e);
    try { await pastFixLoad(g.id); render(); return "ok"; } catch (er) { return er.message; }
  });
  check(r9b === "ok" && !errs.some((e) => /toLowerCase/.test(e)), `a pitch saved with a spot the app doesn't know still shows (${r9b})`);

  console.log("10. Two quick fixes to one pitch both stick");
  const r10 = await page.evaluate(async () => {
    const ev = (await DB.D.all("events")).find((e) => PCDB.isPitch(e) && e.res === "ball");
    await Promise.all([editEvent(ev.id, { loc: "edge" }), editEvent(ev.id, { wp: "wp" })]);
    const x = await DB.D.get("events", ev.id); return { loc: x.loc, wp: x.wp, edits: (x.edits || []).length };
  });
  check(r10.loc === "edge" && r10.wp === "wp", `both edits saved (loc ${r10.loc}, wild pitch ${r10.wp}, ${r10.edits} edits kept)`);

  console.log("11. An old copy of the app open in another tab doesn't hang the upgrade silently");
  {
    const ctx = await browser.newContext();
    const holder = await ctx.newPage(); await holder.goto(url + "holder");
    await holder.evaluate(() => new Promise((res) => { const r = indexedDB.open("pitchcaller", 1); r.onupgradeneeded = () => r.result.createObjectStore("events", { keyPath: "id" }); r.onsuccess = () => { window.__held = r.result; res(); }; }));
    const p2 = await ctx.newPage(); p2.on("pageerror", (e) => errs.push(String(e)));
    await p2.goto(url); await p2.waitForTimeout(3000);
    const st = await p2.evaluate(() => ({ ready: DB.ready, failed: DB.failed ? String(DB.failed.message || DB.failed) : null, text: document.body.innerText.slice(0, 4000) }));
    check(!st.ready && !!st.failed && /close|other/i.test(st.text), `it says so (ready ${st.ready}, message: ${st.failed ? st.failed.slice(0, 80) : "none"})`);
    await ctx.close();
  }

  check(!errs.filter((e) => !/toLowerCase/.test(e)).length, "no page errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} game-day check(s) FAILED` : "\nall game-day checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
