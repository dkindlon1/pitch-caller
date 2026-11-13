/*
 * v1.2 Step 4 in the real page (docs/PLAN_v1.2_2026-11-13.md, 2.6 and Step 4 "Proof"):
 *   1. bullpen mode: 40 charted pitches (one through the buttons) save as a sessions doc (type "charted", with id,
 *      updatedAt, source, n, byType), feed the miss-lean estimate, survive a reload, and list on the roster;
 *   2. game events carry ph / bs, a directional way-off cell (one ring outside the grid) and the glove spot when on;
 *      the at-bat log reads a way-off cell as "way";
 *   3. correcting a location: the cell can be re-picked (its zone follows), a zone that contradicts the cell clears it,
 *      the same cell again clears both; the earlier-game fixer does the same;
 *   4. no page errors.
 * Sync of the charted doc against Postgres is supabase/test/v12_sessions_test.js (scripts/test-sql.sh).
 * Run from app/ after a build: node v12_step4_e2e.js
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
  const wait = (ms = 150) => page.waitForTimeout(ms);

  console.log("1. Bullpen mode: 40 charted pitches save, feed the lean estimate, reload, list on the roster");
  check(await page.evaluate(() => S.setup.logLoc === true), "a new setup logs locations by default (Q3)");
  const pid = await page.evaluate(() => { const pd = S.setup.staff[0]; pd.hand = "R"; return pd.id; });
  await page.locator(".tabs button", { hasText: "Bullpen" }).click(); await wait();
  const pname = await page.evaluate((id) => DB.pitchers.get(id).name, pid);
  await page.locator('section[aria-label="Bullpen charting"] [aria-label="Pitcher"] button', { hasText: pname }).click(); await wait();
  await page.locator('section[aria-label="Bullpen charting"] [aria-label="Pitch"] button', { hasText: "Fastball" }).click(); await wait();
  check(await page.getByRole("button", { name: "Log pitch" }).isDisabled(), "Log pitch waits for all three taps");
  // a righty: arm side is the catcher's left. Catcher sets up glove side (column 4 of 5), it ends up one column arm side.
  await page.getByRole("button", { name: "Where the catcher set up: row 3, column 4" }).click(); await wait();
  await page.getByRole("button", { name: "Where it ended up: row 3, column 3" }).click(); await wait();
  await page.getByRole("button", { name: "Log pitch" }).click(); await wait();
  const after1 = await page.evaluate(() => ({ n: pen.log.length, glove: pen.glove, landed: pen.landed, first: pen.log[0] }));
  check(after1.n === 1 && JSON.stringify(after1.first.glove) === "[2,3]" && JSON.stringify(after1.first.landed) === "[2,2]" && after1.first.kind === "FB",
    `one pitch logged through the buttons (${JSON.stringify(after1.first)})`);
  check(JSON.stringify(after1.glove) === "[2,3]" && after1.landed === null, "the catcher's spot stays set; the landed tap clears for the next pitch");
  // a way-off arrow from the buttons
  await page.getByRole("button", { name: "Way off, left" }).click(); await wait();
  check(await page.evaluate(() => JSON.stringify(pen.landed) === "[2,-1]"), "a way-off arrow stores a cell one ring outside the grid ([2,-1])");
  await page.getByRole("button", { name: "Way off, left" }).click(); await wait();   // tapped again: cleared
  check(await page.evaluate(() => pen.landed === null), "tapping the arrow again clears it");
  // 39 more: targets on both sides (columns 2 and 4, rows 2 to 4), most landing one column arm side, some on the spot,
  // two way off arm side (catcher's left); a few with a radar reading
  await page.evaluate(() => {
    for (let i = 1; i < 40; i++) {
      const gc = i % 2 ? 1 : 3, gr = 1 + (i % 3), hit = i % 5 === 0, way = i === 7 || i === 21;
      pen.log.push({ pitch: "Fastball", kind: "FB", glove: [gr, gc], landed: way ? [2, -1] : [gr, hit ? gc : gc - 1], radar: i % 4 === 0 ? 85 + (i % 3) : undefined });
    }
    render();
  });
  await wait();
  await page.getByRole("button", { name: "Save session (40)" }).click();
  await page.waitForFunction(() => pen.log.length === 0, null, { timeout: 10000 }); await wait(400);
  const s1 = await page.evaluate(async (id) => {
    const docs = (await DB.D.byIndex("sessions", "pitcherId", id)).filter((x) => x.type === "charted");
    const m = pModel(id), lm = m && m.leans && m.leans.Fastball;
    return { docs: docs.length, d: docs[0], lm };
  }, pid);
  const d = s1.d || {};
  check(s1.docs === 1 && d.n === 40 && d.pitches.length === 40 && d.source === "Charted bullpen", `one charted session, 40 pitches (${s1.docs} doc, n ${d.n})`);
  check(typeof d.id === "string" && d.id.length > 0 && typeof d.updatedAt === "number", `it carries an id and a numeric updatedAt (the sync table's constraints)`);
  check(Array.isArray(d.byType) && d.byType.length === 1 && d.byType[0].type === "Fastball" && d.byType[0].n === 40 && d.byType[0].kind === "FB" && d.byType[0].velo > 84 && d.byType[0].velo < 88,
    `byType lists the fastball with its radar average, so an older app's session list can show it (${JSON.stringify(d.byType)})`);
  const lm = s1.lm;
  check(!!lm && lm.x && lm.x.sides[0] >= 10 && lm.x.sides[1] >= 10, `the estimator read both target sides (${lm && JSON.stringify(lm.x.sides)} arm / glove)`);
  check(!!lm && lm.x.served > 1.5 && (lm.flag || []).some((f) => /arm side/i.test(f)), `it reads an arm-side lean and flags it (${lm && lm.x.served.toFixed(2)} in.; "${lm && (lm.flag || []).join("; ")}")`);
  check(!!lm && lm.served === false, "a flag only: the engine keeps the coach's setting (the gate hasn't admitted leans)");
  check(await page.evaluate((id) => { const p = DB.pitchers.get(id); return arsenal().every((x) => !x.lean_x) && !p.pitches.some((x) => x.lean_x); }, pid),
    "nothing written into his arsenal or the calls");
  // reload: the doc and the learned leans come back
  await page.reload(); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 10000 }); await wait(300);
  const s2 = await page.evaluate(async (id) => {
    const docs = (await DB.D.byIndex("sessions", "pitcherId", id)).filter((x) => x.type === "charted");
    const m = pModel(id); return { docs: docs.length, n: docs[0] && docs[0].pitches.length, est: m && m.leans && m.leans.Fastball && m.leans.Fastball.x.served };
  }, pid);
  check(s2.docs === 1 && s2.n === 40 && Math.abs(s2.est - lm.x.served) < 1e-9, `after a reload: the session and the lean are still there (${s2.docs} doc, est ${s2.est && s2.est.toFixed(2)})`);
  // relearning from scratch reads the charted pitches again (not just a cached model)
  const s3 = await page.evaluate(async (id) => { const m = await relearnPitcher(id); return m.leans.Fastball.x.served; }, pid);
  check(Math.abs(s3 - lm.x.served) < 1e-9, `relearning after the reload reads the charted session again (${s3.toFixed(2)})`);
  // the roster lists it with the TrackMan sessions, and the arsenal card shows the flag
  await page.evaluate((id) => { rosterSel = id; S.view = "roster"; render(); }, pid); await wait(500);
  const ros = await page.evaluate(() => ({
    sess: [...document.querySelectorAll(".sess .srow2")].map((r) => r.textContent),
    note: [...document.querySelectorAll("small.muted")].some((x) => /arm side/i.test(x.textContent)) }));
  check(ros.sess.some((t) => /Charted bullpen, 40 pitches/.test(t)), `the roster's session list shows it ("${ros.sess[0] || ""}")`);
  check(ros.note, "the arsenal card shows what his logs say about his fastball's misses");

  console.log("2. Game events: pitcher hand, batter side, a directional way-off cell, the glove spot when on");
  await page.evaluate(() => { S.setup.logGlove = true; S.view = "live"; G().call = null; makeCall(); render(); }); await wait();
  check(await page.locator('[aria-label="Where the catcher set up, catcher\'s view"] button').count() === 25, "with the setup option on, the glove grid shows (25 cells)");
  check(await page.locator('[aria-label="Way off, which way (catcher\'s view)"] button').count() === 4, "Way off has four arrows");
  await page.getByRole("button", { name: "Catcher set up at row 3, column 4" }).click(); await wait();
  await page.getByRole("button", { name: "Way off, left" }).click(); await wait();
  check(await page.evaluate(() => [...document.querySelectorAll(".locpick .lg-head .muted")].some((x) => /way off, left/.test(x.textContent))), "the grid header says which way");
  const g1 = await page.evaluate(async () => {
    const g = G(); const quad = g.call.quad;
    record({ result: "ball" });
    await new Promise((r) => setTimeout(r, 300));
    const evs = (await DB.D.byIndex("events", "gameId", g.dbId)).filter(PCDB.isPitch).sort((a, b) => a.n - b.n);
    const ev = evs[evs.length - 1];
    return { ev: { ph: ev.ph, bs: ev.bs, loc: ev.loc, locCell: ev.locCell, glove: ev.glove, quad }, landed: g.pa && g.pa.log ? g.pa.log[g.pa.log.length - 1][3] : "no pa log",
      batter: batterDef().hand, pHand: pitcherDef().hand, pending: [pendingLoc, pendingGlove] };
  });
  const bsWant = g1.batter === "S" ? (g1.pHand === "R" ? "L" : "R") : g1.batter === "L" ? "L" : "R";
  check(g1.ev.ph === g1.pHand && g1.ev.bs === bsWant, `the event carries ph ${g1.ev.ph} and bs ${g1.ev.bs} (batter ${g1.batter})`);
  check(g1.ev.loc === "noncomp" && JSON.stringify(g1.ev.locCell) === "[2,-1]", `a way-off arrow: loc noncomp, cell [2,-1] (${JSON.stringify(g1.ev.locCell)})`);
  check(JSON.stringify(g1.ev.glove) === "[2,3]", `the glove spot is on the event (${JSON.stringify(g1.ev.glove)})`);
  check(g1.landed === "way", `the at-bat log reads the out-of-grid cell as "way" (${JSON.stringify(g1.landed)})`);
  check(g1.pending[0] === null && g1.pending[1] === null, "both taps clear for the next pitch");
  // glove logging off: no glove key
  const g2 = await page.evaluate(async () => {
    S.setup.logGlove = false; const g = G(); g.call = null; makeCall(); pendingLoc = { z: "edge", cell: [1, 1] }; record({ result: "ball" });
    await new Promise((r) => setTimeout(r, 300));
    const evs = (await DB.D.byIndex("events", "gameId", g.dbId)).filter(PCDB.isPitch).sort((a, b) => a.n - b.n);
    return { hasGlove: evs[evs.length - 1].glove !== undefined, cell: evs[evs.length - 1].locCell, ph: evs[evs.length - 1].ph };
  });
  check(!g2.hasGlove && JSON.stringify(g2.cell) === "[1,1]" && !!g2.ph, "with the option off, no glove spot; the grid cell and ph still saved");
  // the at-bat log and leanModel read these game events too
  const g3 = await page.evaluate(async (id) => {
    const evs = (await DB.D.byIndex("events", "pitcherId", id));
    return PCLearner.leanSample(evs.find((e) => e.glove), "R");
  }, pid);
  check(!!g3 && Math.abs(g3.tx - (-20 / 3)) < 1e-9 && g3.dx > 0, `the estimator reads a game pitch from the catcher's spot, not the called one (target ${g3 && g3.tx.toFixed(2)}, miss ${g3 && g3.dx.toFixed(2)} arm side)`);

  console.log("3. Correcting a location keeps it at cell resolution");
  const f1 = await page.evaluate(async () => {
    const g = G(), l = g.log[0];   // the [1,1] edge pitch
    const read = async () => { const ev = await DB.D.get("events", l.evId); return { loc: ev.loc, cell: ev.locCell, edits: (ev.edits || []).length }; };
    const out = { logged: { loc: l.loc, cell: l.locCell } };
    fixingPitch = l.n; S.view = "live"; render();
    await new Promise((r) => setTimeout(r, 100));
    return out;
  });
  check(f1.logged.loc === "edge" && JSON.stringify(f1.logged.cell) === "[1,1]", "the game log row keeps the cell it was logged with");
  check(await page.locator('[aria-label="Or tap the cell"] button').count() === 25, "the fix editor offers the cell grid");
  await page.getByRole("button", { name: "Or tap the cell: row 1, column 2" }).click(); await wait(300);
  const f2 = await page.evaluate(async () => { const l = G().log[0], ev = await DB.D.get("events", l.evId); return { l: [l.loc, l.locCell], ev: [ev.loc, ev.locCell, (ev.edits || []).length] }; });
  check(JSON.stringify(f2.ev) === '["off",[0,1],1]' && JSON.stringify(f2.l) === '["off",[0,1]]', `re-picking the cell moves the cell and its zone together, original kept (${JSON.stringify(f2.ev)})`);
  await page.locator(".fixbox .fixrow", { hasText: "Where it ended up" }).getByRole("button", { name: "Middle" }).click(); await wait(300);
  const f3 = await page.evaluate(async () => { const l = G().log[0], ev = await DB.D.get("events", l.evId); return [ev.loc, ev.locCell]; });
  check(JSON.stringify(f3) === '["heart",null]', `a zone that contradicts the cell clears the cell (${JSON.stringify(f3)})`);
  await page.getByRole("button", { name: "Or tap the cell: row 3, column 3" }).click(); await wait(300);
  await page.getByRole("button", { name: "Or tap the cell: row 3, column 3" }).click(); await wait(300);
  const f4 = await page.evaluate(async () => { const l = G().log[0], ev = await DB.D.get("events", l.evId); return [ev.loc, ev.locCell, l.loc === undefined, l.locCell === undefined]; });
  check(JSON.stringify(f4) === "[null,null,true,true]", `the same cell tapped twice: set, then cleared (${JSON.stringify(f4)})`);
  // the earlier-game fixer
  const f5 = await page.evaluate(async () => {
    const g = G(), evId = g.log[1].evId;   // the way-off pitch
    const ev = await DB.D.get("events", evId);
    ev.gameId = "old-game"; await DB.D.put("events", ev);
    await DB.D.put("games", Object.assign({}, await DB.D.get("games", g.dbId), { id: "old-game", date: "2026-11-01" }));
    pastFix.games = null; await pastFixLoad("old-game"); pastFix.open = evId; S.view = "data"; render();
    return evId;
  });
  await wait(400);
  const grid = page.locator('section[aria-label="Fix a pitch in an earlier game"] [aria-label="Or tap the cell"] button');
  check(await grid.count() === 25, "the earlier-game fixer offers the cell grid too");
  await page.locator('section[aria-label="Fix a pitch in an earlier game"]').getByRole("button", { name: "Or tap the cell: row 3, column 1" }).click(); await wait(300);
  const f6 = await page.evaluate(async (id) => { const ev = await DB.D.get("events", id); return [ev.loc, ev.locCell, pastFix.touched.has(ev.pitcherId)]; }, f5);
  check(JSON.stringify(f6) === '["off",[2,0],true]', `it moves cell and zone together and marks him to learn again (${JSON.stringify(f6)})`);

  console.log("4. Page errors");
  check(errs.length === 0, `none (${errs.slice(0, 3).join(" | ")})`);
  await browser.close(); server.close();
  console.log(fails ? `${fails} check(s) failed` : "all checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
