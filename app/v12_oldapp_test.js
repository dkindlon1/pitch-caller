/*
 * v1.2 Step 4 old-app check (docs/PLAN_v1.2_2026-11-13.md, Step 4 "Proof"): a v1.1 build (14e0ad2) opens a database the
 * v1.2 app wrote, on the same iPad (same origin, same IndexedDB and saved state), and keeps working.
 * The v1.2 app writes: a pitcher whose fastball has a miss lean and spread, a charted bullpen session (40 pitches), a
 * learned miss lean, a game with a way-off pitch stored one ring outside the grid and a glove spot, logGlove on, and a
 * game in progress whose at-bat log holds that pitch. Then the v1.1 build opens it, and this reports what it drops.
 * Part B: an opponent hitter with the coach's tags (scoutTags) survives a v1.1 edit.
 * Run from app/ after a build: V11=/path/to/v1.1/pitch-caller.html node v12_oldapp_test.js
 *   (default: git show 14e0ad2:app/dist/pitch-caller.html, written to a temp file)
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
const V12 = process.env.DIST || path.join(__dirname, "dist/pitch-caller.html");
let V11 = process.env.V11;
if (!V11) {
  V11 = path.join(os.tmpdir(), "pc_v11_14e0ad2.html");
  fs.writeFileSync(V11, cp.execFileSync("git", ["show", "14e0ad2:app/dist/pitch-caller.html"], { cwd: path.join(__dirname, ".."), maxBuffer: 64 << 20 }));
}
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const report = (msg) => console.log("  note " + msg);
let serve = V12;
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${fs.readFileSync(serve, "utf8")}</body></html>`);
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  const errs = [];
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  const open = async () => { await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 15000 }); await page.waitForTimeout(300); };

  console.log("1. The v1.2 app writes leans, a charted session, a way-off cell and a glove spot");
  await open();
  check(await page.evaluate(() => typeof bullpenView === "function"), "this is the v1.2 build");
  const w = await page.evaluate(async () => {
    const pd = S.setup.staff[0], pid = pd.id, p = DB.pitchers.get(pid);
    p.hand = "R";
    const fb = p.pitches.find((d) => d.name === "Fastball"); fb.lean_x = 1.5; fb.lean_z = -1.5; fb.spread = 1.25;
    savePitcher(p, false);
    const pitches = [];
    for (let i = 0; i < 40; i++) { const gc = i % 2 ? 1 : 3; pitches.push({ pitch: "Fastball", kind: "FB", glove: [2, gc], landed: i === 5 ? [2, -1] : [2, gc - 1] }); }
    const sess = await dbPut("sessions", { pitcherId: pid, date: todayT(), type: "charted", source: "Charted bullpen", n: 40, byType: [{ type: "Fastball", kind: "FB", n: 40, velo: null }], pitches });
    DB.sessions.set(pid, [sess].concat(DB.sessions.get(pid) || []));
    S.setup.logGlove = true;
    S.view = "live"; G().call = null; makeCall();
    pendingGlove = [2, 3]; pendingLoc = { z: "noncomp", cell: [2, -1] }; record({ result: "ball" });
    G().call = null; makeCall(); pendingLoc = { z: "edge", cell: [1, 1] }; record({ result: "ball" });
    save();
    await new Promise((r) => setTimeout(r, 400));
    const m = await relearnPitcher(pid);
    // v1.2 Part B: an opponent hitter with the coach's tags
    const t = await dbPut("teams", { name: "Rivals", isOurs: false, level: S.setup.level, notes: "" }); DB.teams.set(t.id, t);
    const hx = await dbPut("hitters", PCDB.newHitter(t.id, { name: "Tagged Hitter", bats: "L", scoutTags: { approach: "aggressive", spray: "pull" } })); DB.hitters.set(hx.id, hx);
    window.__hid = hx.id;
    const evs = (await DB.D.byIndex("events", "gameId", G().dbId)).filter(PCDB.isPitch);
    return { hid: hx.id, pid, gameId: G().dbId, lean: !!(m.leans && m.leans.Fastball), way: evs.some((e) => e.locCell && e.locCell[1] === -1 && e.glove), paLog: JSON.stringify(G().pa && G().pa.log) };
  });
  check(w.lean && w.way && /"way"/.test(w.paLog), `written: a learned lean, a way-off event with a glove spot, an at-bat log with "way" (${w.paLog})`);

  console.log("2. The v1.1 build opens the same database and saved state");
  serve = V11; errs.length = 0;
  await open();
  check(await page.evaluate(() => typeof bullpenView === "undefined"), "this is the v1.1 build");
  check(errs.length === 0, `it opens without errors (${errs.slice(0, 2).join(" | ")})`);
  const o = await page.evaluate(async (pid) => {
    const p = DB.pitchers.get(pid), fb = p.pitches.find((d) => d.name === "Fastball");
    return { lean: [fb.lean_x, fb.lean_z, fb.spread], arsLean: arsenal().some((x) => x.lean_x !== undefined && x.lean_x !== 0),
      logGlove: S.setup.logGlove, sessions: (await DB.D.byIndex("sessions", "pitcherId", pid)).map((s) => s.type || s.source) };
  }, w.pid);
  check(JSON.stringify(o.lean) === "[1.5,-1.5,1.25]", `the stored pitcher still has the lean and spread (${JSON.stringify(o.lean)})`);
  check(!o.arsLean, "its calls don't use them (v1.1 builds each pitch from named fields): it calls as v1.1");
  report(`saved setup keeps logGlove (${o.logGlove}); v1.1 has no glove grid, so a v1.1 iPad logs no glove spots`);

  console.log("3. v1.1 screens over v1.2 data");
  errs.length = 0;
  await page.evaluate((pid) => { rosterSel = pid; S.view = "roster"; render(); }, w.pid); await page.waitForTimeout(600);
  const ros = await page.evaluate(() => [...document.querySelectorAll(".sess .srow2")].map((r) => r.textContent));
  check(ros.some((t) => /Charted bullpen, 40 pitches/.test(t)), `the roster lists the charted session among the sessions ("${ros[0] || ""}")`);
  await page.evaluate(() => { S.view = "data"; render(); }); await page.waitForTimeout(600);
  await page.evaluate(async (gid) => { pastFix.games = null; await pastFixLoad(gid); const ev = pastFix.evs.find((e) => e.locCell && e.locCell[1] === -1); pastFix.open = ev && ev.id; render(); }, w.gameId);
  await page.waitForTimeout(400);
  const fixRow = await page.evaluate(() => [...document.querySelectorAll('section[aria-label="Fix a pitch in an earlier game"] tbody tr')].map((r) => r.textContent).join(" | "));
  check(/way off/.test(fixRow), "the earlier-game fixer lists the way-off pitch as way off");
  check(errs.length === 0, `roster, data and the fixer render without errors (${errs.slice(0, 2).join(" | ")})`);

  console.log("4. v1.1 keeps calling the game in progress (its at-bat log holds the way-off pitch)");
  errs.length = 0;
  const g = await page.evaluate(() => {
    S.view = "live"; render();
    const g = G(); g.call = null; makeCall(); const c1 = g.call && g.call.pitch;
    pendingLoc = { z: "edge", cell: [1, 3] }; record({ result: "foul" });
    g.call = null; makeCall();
    return { c1, c2: g.call && g.call.pitch, log: JSON.stringify(g.pa && g.pa.log) };
  });
  check(!!g.c1 && !!g.c2 && errs.length === 0, `it makes calls and logs pitches after the "way" entry (${g.c1}, ${g.c2}; ${errs.slice(0, 2).join(" | ")})`);

  console.log("5. What a v1.1 iPad writes back");
  const b = await page.evaluate(async (pid) => {
    const p = DB.pitchers.get(pid); p.pitches.find((d) => d.name === "Fastball").grade = 4; savePitcher(p, false);
    await new Promise((r) => setTimeout(r, 300));
    const st = await DB.D.get("pitchers", pid), fb = st.pitches.find((d) => d.name === "Fastball");
    const evs = (await DB.D.byIndex("events", "pitcherId", pid)).filter(PCDB.isPitch).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const snapFb = (evs[0].ars || []).find((x) => x.name === "Fastball") || {};
    await relearnPitcher(pid);
    const m = await DB.D.get("learned", "v2:" + pid);
    const sess = (await DB.D.byIndex("sessions", "pitcherId", pid)).filter((s) => s.type === "charted");
    return { kept: [fb.grade, fb.lean_x, fb.lean_z, fb.spread], newEv: { ph: evs[0].ph, bs: evs[0].bs, snapLean: snapFb.lean_x }, leans: !!(m && m.leans), sess: sess.length };
  }, w.pid);
  check(JSON.stringify(b.kept) === "[4,1.5,-1.5,1.25]", `a v1.1 roster edit writes the pitcher back with the lean fields intact (${JSON.stringify(b.kept)})`);
  check(b.sess === 1, "the charted session is untouched");
  const ht = await page.evaluate(async (hid) => { const x = DB.hitters.get(hid); x.number = "7"; await dbPut("hitters", x); return (await DB.D.get("hitters", hid)).scoutTags; }, w.hid);
  check(JSON.stringify(ht) === '{"approach":"aggressive","spray":"pull"}', `a v1.1 hitter edit writes him back with his tags intact (${JSON.stringify(ht)})`);
  report(`a v1.1 pitch event has no ph / bs (${b.newEv.ph}, ${b.newEv.bs}) and its arsenal snapshot drops the lean (${b.newEv.snapLean}); the v1.2 learner falls back to the pitcher's hand and the event's situation`);
  report(`a v1.1 relearn rewrites the learned doc ${b.leans ? "keeping" : "without"} the lean estimate; the next v1.2 relearn rebuilds it from the events and charted sessions`);

  console.log("6. Back on v1.2: the lean estimate comes back from the same data");
  serve = V12; errs.length = 0;
  await open();
  const back = await page.evaluate(async (pid) => { const m = await relearnPitcher(pid); return { lean: m.leans && m.leans.Fastball && m.leans.Fastball.x.served, ars: arsenal().find((x) => x.name === "Fastball").lean_x }; }, w.pid);
  check(back.lean > 1.5 && back.ars === 1.5, `the estimate is rebuilt (${back.lean && back.lean.toFixed(2)} in.) and the coach's lean reaches the engine again (${back.ars})`);
  check(errs.length === 0, `no errors (${errs.slice(0, 2).join(" | ")})`);

  await browser.close(); server.close();
  console.log(fails ? `${fails} check(s) failed` : "all checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
