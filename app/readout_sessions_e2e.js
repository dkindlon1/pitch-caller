/*
 * The line under the call reads his uploaded TrackMan / Rapsodo sessions from this iPad's own database:
 *   - no network request (every request but the page itself is refused and counted),
 *   - the sessions are read after the first render, not while the call is worked out or drawn,
 *   - logging a pitch reads nothing from the database for it (the call screen uses the in-memory copy),
 *   - offline, the copy reloads from the device and the line still shows the range.
 *   node app/readout_sessions_e2e.js
 */
const { chromium } = require("playwright");
const H = require("./shots_v2.js");
let fails = 0, oks = 0;
const check = (ok, msg) => { if (ok) oks++; else fails++; console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`); };

// every getAll on the sessions store, and the moment the app first drew its screen
const PROBE = () => {
  window.__sess = [];
  const ga = IDBIndex.prototype.getAll;
  IDBIndex.prototype.getAll = function (...a) { if (this.objectStore.name === "sessions") window.__sess.push(performance.now()); return ga.apply(this, a); };
  const ga2 = IDBObjectStore.prototype.getAll;
  IDBObjectStore.prototype.getAll = function (...a) { if (this.name === "sessions") window.__sess.push(performance.now()); return ga2.apply(this, a); };
  new MutationObserver((_, mo) => { if (document.querySelector(".bar")) { window.__firstRender = performance.now(); mo.disconnect(); } })
    .observe(document, { childList: true, subtree: true });
};

(async () => {
  await new Promise((r) => H.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${H.server.address().port}/`;
  const browser = await chromium.launch(), errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  await ctx.addInitScript(PROBE);
  const net = [];
  await ctx.route("**/*", (r) => { const u = r.request().url(); if (u === base) return r.continue(); net.push(u); return r.abort(); });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(String(e)));
  const ready = () => p.waitForFunction(() => typeof DB !== "undefined" && DB.ready && G().call);
  await p.goto(base); await ready();

  // one uploaded session for today's starter: readings for each of his pitches (his pitches have one of each kind)
  await p.evaluate(async () => {
    const pd = pitcherDef(), rows = [];
    for (const d of pd.pitches) { const v = +d.velo || 80; for (const dv of [-2, -1, 0, 0, 1, 2]) rows.push({ type: d.type || "x", kind: d.kind, velo: v + dv }); }
    await DB.D.put("sessions", { pitcherId: pd.id, date: todayT(), source: "TrackMan", n: rows.length, byType: [], rows });
  });
  await p.reload(); await ready();
  await p.waitForFunction(() => /usually \d+–\d+ mph/i.test((document.querySelector(".readout") || {}).textContent || ""), null, { timeout: 5000 }).catch(() => {});
  const r1 = await p.evaluate(() => ({ sess: window.__sess.slice(), first: window.__firstRender, line: (document.querySelector(".readout") || {}).textContent || "" }));
  check(/usually \d+–\d+ mph/i.test(r1.line), `the line shows the range from the uploaded session ("${r1.line}")`);
  check(r1.sess.length >= 1 && r1.first !== undefined && r1.sess.every((t) => t > r1.first),
    `sessions read only after the first render (first render ${Math.round(r1.first)} ms; reads at ${r1.sess.map(Math.round).join(", ")} ms)`);

  // a pitch logged: a new call is worked out and drawn, and nothing is read from the sessions store for it
  const n0 = await p.evaluate(() => window.__sess.length), pitch0 = await p.evaluate(() => G().pitchNo);
  await p.getByRole("button", { name: "Ball", exact: true }).click();
  await p.waitForFunction((n) => G().pitchNo > n && G().call, pitch0);
  await p.waitForTimeout(300);
  const r2 = await p.evaluate(() => ({ n: window.__sess.length, line: (document.querySelector(".readout") || {}).textContent || "" }));
  check(r2.n === n0, `logging a pitch reads no sessions (${n0} reads before, ${r2.n} after)`);
  check(/usually \d+–\d+ mph/i.test(r2.line), `the next call's line still has the range ("${r2.line}")`);

  // offline: the in-memory copy is dropped and reloaded from the device, as after a sync
  await ctx.setOffline(true);
  await p.evaluate(() => { DB.sessions.clear(); attachStaff(); render(); });
  await p.waitForFunction(() => /usually \d+–\d+ mph/i.test((document.querySelector(".readout") || {}).textContent || ""), null, { timeout: 5000 }).catch(() => {});
  const r3 = await p.evaluate(() => ({ online: navigator.onLine, line: (document.querySelector(".readout") || {}).textContent || "" }));
  check(!r3.online && /usually \d+–\d+ mph/i.test(r3.line), `offline, the sessions reload from the device ("${r3.line}")`);
  await ctx.setOffline(false);

  check(net.length === 0, `no network request besides the page itself (${net.length}${net.length ? ": " + net.slice(0, 3).join(", ") : ""})`);
  for (const e of errs) check(false, "page error " + e);
  await browser.close(); H.server.close();
  console.log(`\n${fails ? fails + " of " + (fails + oks) + " check(s) FAILED" : "all " + oks + " readout sessions checks passed"}`);
  console.log(`::group::summary\nreadout_sessions_e2e: exit=${fails ? 1 : 0} passed=${oks} failed=${fails}\n::endgroup::`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
