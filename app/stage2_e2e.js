/*
 * Plan Stage 2 in the real page (served over http so IndexedDB and the learning worker work). Run from app/: node stage2_e2e.js
 *   D3  a re-grade made while End-game learning runs in the worker stands (it used to be overwritten)
 *   D9  closing the page mid-learning leaves the game closed and the next one up; learning finishes on the next launch
 *   D1  Keep mine: the calls use his number   D2  Accept stores the learned value and phases in   D4  the final clamp
 *   D8  a blank grade shows "not graded" and the calls use 3
 *   D11 every pitch of this game can be fixed; any pitch of an earlier game, from the Data screen
 *   D7  a pitch learning can't read shows on Roster, opens on the Data screen, and can be left out
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
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  let page = await ctx.newPage();
  const errs = [];
  const watch = (p) => { p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); }); };
  watch(page);
  const wait = (ms = 150) => page.waitForTimeout(ms);
  const ready = () => page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 8000 });
  await page.goto(url); await ready();
  const pid = await page.evaluate(async () => {
    const p = pitcherDef(); p.name = "Ace"; p.pitches[0].command = 4; p.pitches[0].grade = 3; await dbPut("pitchers", p);
    S.view = "live"; G().call = null; makeCall(); save(); render(); return p.id;
  });
  // presses keys until n more pitches are logged (a key that lands mid-render is dropped by the page, so count, don't assume)
  const chart = async (n) => {
    const start = await page.evaluate(() => G().pitchNo);
    for (let i = 0, guard = 0; guard < n * 4; guard++) {
      if ((await page.evaluate(() => G().pitchNo)) - start >= n) break;
      if (await page.evaluate(() => !!G().inningOver)) { await page.getByRole("button", { name: /^Take the field/ }).click(); await page.waitForTimeout(120); continue; }
      await page.keyboard.press(["b", "c"][i++ % 2]); await page.waitForTimeout(90);
    }
  };

  console.log("D11. Every pitch of this game can be fixed");
  await chart(30); await wait(200);
  const rows14 = await page.locator(".log-tbl tbody tr").count();
  await page.getByRole("button", { name: /Show all 30 pitches/ }).click(); await wait();
  const rowsAll = await page.locator(".log-tbl tbody tr").count();
  check(rows14 === 14 && rowsAll === 30, `the log shows the last 14, then all 30 (${rows14} -> ${rowsAll})`);
  await page.locator(".log-tbl tbody tr").nth(29).getByRole("button", { name: "Fix" }).click(); await wait();
  await page.getByRole("button", { name: "Edge", exact: true }).click(); await wait(200);
  const first = await page.evaluate(async () => { const l = G().log[G().log.length - 1]; const ev = await DB.D.get("events", l.evId); return { n: l.n, loc: ev.loc, edits: (ev.edits || []).length }; });
  check(first.n === 1 && first.loc === "edge" && first.edits === 1, `the first pitch of the game (#${first.n}) is fixed in place, original kept (loc ${first.loc}, ${first.edits} edit)`);

  console.log("D3. A re-grade made while End-game learning runs stands");
  const fbId = await page.evaluate(() => pitcherDef().pitches[0].id);
  await page.evaluate(() => { window.__end = endGame(); });     // not awaited: learning runs in the worker
  await page.waitForFunction(() => G().pitchNo === 0, null, { timeout: 5000 });
  const during = await page.evaluate(async ({ pid }) => {
    const running = (await DB.D.all("meta")).some((m) => /^toLearn/.test(m.id)) && !pModel(pid);   // learning hasn't landed yet
    const p = DB.pitchers.get(pid), d = p.pitches[0], old = d.command; d.command = 2; logGrade(p, d, "command", old); savePitcher(p, false);
    return running;
  }, { pid });
  check(during, "(the setup: the re-grade happened while that learning was still running)");
  await page.evaluate(() => window.__end);
  await page.waitForFunction(async () => !(await DB.D.all("meta")).some((m) => /^toLearn/.test(m.id)), null, { timeout: 20000 });
  const r3 = await page.evaluate(({ pid, fbId }) => { const m = pModel(pid); const sv = m && m.served.pitches[fbId]; G().pitcher = 0; const a = arsenal().find((x) => x.name === pitcherDef().pitches[0].name); return { served: sv && sv.command, coach: sv && sv.coach && sv.coach.command, calls: a.command }; }, { pid, fbId });
  check(r3.coach === 2 && Math.abs(r3.served - 2) <= 0.15 + 1e-9 && Math.abs(r3.calls - 2) <= 0.15 + 1e-9, `re-graded 4 -> 2 during learning: served ${r3.served} from his ${r3.coach}, the calls use ${r3.calls} (the bug was 3.7)`);

  console.log("D9. Closing the page mid-learning");
  await page.evaluate(() => { S.view = "live"; G().call = null; makeCall(); render(); });
  await chart(24); await wait(200);
  const g2 = await page.evaluate(() => G().dbId);
  const modelAt = await page.evaluate(({ pid }) => (pModel(pid) || {}).at || 0, { pid });
  await page.evaluate(() => { endGame(); });
  await page.waitForFunction(() => G().pitchNo === 0, null, { timeout: 5000 });
  const midway = await page.evaluate(async ({ pid, at }) => ({ job: !!(await DB.D.all("meta")).some((m) => /^toLearn/.test(m.id)), relearned: ((pModel(pid) || {}).at || 0) > at }), { pid, at: modelAt });
  await page.reload(); await ready();
  const after = await page.evaluate(async ({ g2 }) => ({ cur: G().dbId, n: G().pitchNo, rec: (await DB.D.get("games", g2)).status, hist: (S.history || []).length }), { g2 });
  check(midway.job && !midway.relearned, `closed while learning was still to do (job saved: ${midway.job}, finished: ${midway.relearned})`);
  check(after.cur !== g2 && after.n === 0 && after.rec === "final" && after.hist >= 2, `after reopening: that game is final and archived, a fresh game is up (${after.rec}, ${after.n} pitches)`);
  await page.waitForFunction(async ({ pid, at }) => !(await DB.D.all("meta")).some((m) => /^toLearn/.test(m.id)) && ((pModel(pid) || {}).at || 0) > at, { pid, at: modelAt }, { timeout: 20000 });
  check(true, "and the learning it missed ran on launch");

  console.log("D1 D2 D4. Answering a grade flag, through the Roster");
  // a learned profile that disagrees with his grade (as the worker would hand back after a long season)
  await page.evaluate(async ({ pid, fbId }) => {
    const m = pModel(pid);
    m.profile.pitches[fbId] = Object.assign({}, m.profile.pitches[fbId] || {}, { n: 600, nLoc: 400, talent: { command: 0.6, grade: 3 }, sd: { command: 0.2, grade: 0.3 }, score: null });
    m.profile.flags = [{ type: "grade", pitchId: fbId, dim: "command", coach: 2, ref: 2, learned: 0.6, sd: 0.2, text: "Fastball: command plays like 0.6, you have 2" }];
    m.served.pitches[fbId] = Object.assign({}, m.served.pitches[fbId], { command: 1.2, grade: 3, learned: true, coach: { command: 2, grade: 3 } });
    await dbPut("learned", m); DB.models.set(m.id, m);
    S.view = "roster"; rosterTab = "ours"; rosterSel = pid; save(); render();
  }, { pid, fbId });
  await wait(300);
  const callCmd = () => page.evaluate(() => { G().pitcher = 0; return arsenal()[0].command; });
  const beforeKeep = await callCmd();
  await page.getByRole("button", { name: "Keep my 2" }).click(); await wait(300);
  const kept = await callCmd();
  check(beforeKeep === 1.2 && kept === 2, `Keep my 2: the calls go from ${beforeKeep} to his ${kept}`);
  const flagGone = await page.getByRole("button", { name: "Keep my 2" }).count();
  check(flagGone === 0, "and the flag he answered goes away");
  // D4: a served value that's stale (from before a re-grade) can't get past the clamp
  await page.evaluate(async ({ pid, fbId }) => { const p = DB.pitchers.get(pid); p.flagState = {}; await dbPut("pitchers", p); const m = pModel(pid); m.served.pitches[fbId].command = 0.4; render(); }, { pid, fbId });
  check(await callCmd() === 1, `a stale served 0.4 is held at 1.0 from his 2 (${await callCmd()})`);
  await page.evaluate(({ pid }) => { rosterSel = pid; render(); }, { pid }); await wait(200);
  await page.getByRole("button", { name: /^Use 0\.6/ }).click(); await wait(300);
  const acc = await page.evaluate(({ pid, fbId }) => DB.pitchers.get(pid).accepted[fbId].command, { pid, fbId });
  check(acc && acc.to === 0.6 && typeof acc.from === "number", `Accept stores the learned value (${acc && acc.to}) and where the calls were (${acc && acc.from}), to phase in over 3 games`);

  console.log("D2 (review). Answers after an Accept");
  const r2 = await page.evaluate(({ pid, fbId }) => {
    const p = DB.pitchers.get(pid), d = p.pitches.find((x) => x.id === fbId);
    const flag = (ref) => ({ type: "grade", pitchId: fbId, dim: "command", coach: +d.command, ref, learned: 0.2, sd: 0.2 });
    const shownBefore = flagShown(p, flag(+d.command), pModel(pid));                 // a stale flag against his old grade
    const old = d.command; d.command = 3; logGrade(p, d, "command", old);           // he re-grades after accepting
    const cleared = !(p.flagState || {})[`${fbId}|command`] && !((p.accepted || {})[fbId] || {}).command;
    const shownAfter = flagShown(p, flag(3), pModel(pid));
    flagAnswer(p, flag(3), "accept"); flagAnswer(p, Object.assign(flag(p.accepted[fbId].command.to), { learned: 2.9 }), "keep");
    const kept = !((p.accepted || {})[fbId] || {}).command;
    d.grade = ""; const og = 3; logGrade(p, d, "command", 3);
    return { shownBefore, cleared, shownAfter, kept, blankLogged: d.gradeLog[d.gradeLog.length - 1].grade };
  }, { pid, fbId });
  check(!r2.shownBefore && r2.cleared && r2.shownAfter, `a re-grade after Accept clears that answer, so the next flag shows (cleared ${r2.cleared}, shown ${r2.shownAfter})`);
  check(r2.kept, "Keep mine retires the accept it answers");
  check(r2.blankLogged === null, `a blank stuff box is logged as blank, not 0 (${r2.blankLogged})`);
  await page.evaluate(({ pid }) => { const p = DB.pitchers.get(pid); p.pitches[0].grade = 3; p.flagState = {}; p.accepted = {}; savePitcher(p); }, { pid });

  console.log("D8. A blank grade");
  await page.evaluate(({ pid }) => { const p = DB.pitchers.get(pid); p.pitches[1].command = ""; p.useLearned = false; savePitcher(p); S.view = "roster"; rosterSel = pid; render(); }, { pid });
  await wait(300);
  const shown = await page.getByText("not graded: calls use 3").count();
  const used = await page.evaluate(() => { G().pitcher = 0; return arsenal()[1].command; });
  check(shown >= 1 && used === 3, `a cleared command shows "not graded" (${shown}) and the calls use ${used}, not 0`);
  await page.evaluate(({ pid }) => { const p = DB.pitchers.get(pid); p.pitches[1].command = 3; p.useLearned = true; savePitcher(p); }, { pid });

  console.log("D7. A pitch learning can't read");
  const badId = await page.evaluate(async ({ g2 }) => {
    const evs = (await DB.D.byIndex("events", "gameId", g2)).filter(PCDB.isPitch).sort((a, b) => a.n - b.n);
    const ev = evs[3]; ev.quad = null; await DB.D.put("events", ev); return ev.id;
  }, { g2 });
  await page.evaluate(async ({ pid }) => { await relearnPitcher(pid); S.view = "roster"; rosterSel = pid; render(); }, { pid });
  await wait(300);
  const msg = await page.getByText(/1 logged pitch was skipped/).count();
  check(msg === 1, "Roster says 1 logged pitch was skipped");
  await page.getByRole("button", { name: "Fix or leave out" }).click(); await wait(600);
  const onData = await page.evaluate(({ g2 }) => ({ view: S.view, game: pastFix.gameId === g2 }), { g2 });
  const marked = await page.getByText("· skipped by learning").count();
  check(onData.view === "data" && onData.game && marked === 1, `it opens that game on the Data screen with the pitch marked (${marked})`);
  await page.locator("tr.bad-row").getByRole("button", { name: "Fix" }).click(); await wait();
  await page.getByRole("button", { name: "Leave this pitch out of learning" }).click(); await wait(200);
  await page.getByRole("button", { name: "Done: learn again" }).click();
  await page.waitForFunction(async ({ pid }) => { const m = pModel(pid); return m && m.profile.skipped && m.profile.skipped.n === 0; }, { pid }, { timeout: 20000 });
  const gone = await page.evaluate(async ({ badId }) => !(await DB.D.get("events", badId)), { badId });
  check(gone, "left out: the pitch is soft-deleted and learning reads every pitch left");

  console.log("D11. A pitch of an earlier game, from the Data screen");
  await page.evaluate(({ g2 }) => pastFixLoad(g2), { g2 }); await wait(300);
  await page.locator(".log-tbl").last().locator("tbody tr").first().getByRole("button", { name: "Fix" }).click(); await wait();
  await page.getByRole("button", { name: "Way off", exact: true }).click(); await wait(200);
  const fixed = await page.evaluate(async ({ g2 }) => { const ev = (await DB.D.byIndex("events", "gameId", g2)).filter(PCDB.isPitch).sort((a, b) => a.n - b.n)[0]; return { loc: ev.loc, edits: (ev.edits || []).length }; }, { g2 });
  check(fixed.loc === "noncomp" && fixed.edits >= 1, `fixed in place in the saved game, original kept (${fixed.loc}, ${fixed.edits} edit)`);
  await page.getByRole("button", { name: "Done: learn again" }).click(); await wait(1500);

  check(!errs.length, "no page errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} stage 2 browser check(s) FAILED` : "\nall stage 2 browser checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
