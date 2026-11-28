// Drew, Nov 28 (V1.3 audit): a pitcher's learned model records the engine data it was learned against. When the engine
// data changes (an outcome-table change, e.g. V1.3), the next load relearns him once from his games and what the calls
// get restarts from one step; with the same data, a reload relearns nothing. Run from app/: node relearn_data_e2e.js
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = path.join(__dirname, "dist/pitch-caller.html");
let fails = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails++; };
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/?")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`); }
  else { res.writeHead(404); res.end(); }
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  const wait = (ms = 150) => page.waitForTimeout(ms);
  const ready = () => page.waitForFunction(() => typeof DB !== "undefined" && DB.ready && DB.warm === true, null, { timeout: 30000 });
  await page.goto(url); await ready();

  console.log("1. Log a short game for the first staff pitcher, then end it: the learner runs");
  const pid = await page.evaluate(() => { S.view = "live"; G().pitcher = 0; G().call = null; render(); return S.setup.staff[0].id; });
  await wait(400);
  for (const k of ["b", "c", "s", "b", "c", "b", "b", "c", "s", "b", "c", "c", "s", "b", "b", "c", "s", "c"]) {
    if (await page.locator(".done").count()) { await page.getByRole("button", { name: /Take the field/ }).click(); await wait(200); }
    if (k === "s") { await page.keyboard.press("s"); await page.keyboard.press("Enter"); } else await page.keyboard.press(k);
    await wait(90);
  }
  await page.locator(".tabs button", { hasText: "Setup" }).click(); await wait();
  await page.getByRole("button", { name: "Start a new game" }).click();
  await page.waitForFunction((id) => { const m = DB.models.get("v2:" + id); return !!m && !!m.profile; }, pid, { timeout: 60000 });
  await wait(600);
  const cur = await page.evaluate((id) => { const m = DB.models.get("v2:" + id); return { at: m.at, data: m.data, v: E.dataVersion() }; }, pid);
  check(cur.data === cur.v && !!cur.v, `the learned model records the engine data it was learned against (${cur.data})`);

  console.log("2. Same engine data: a reload doesn't relearn him");
  await page.reload(); await ready();
  check(await page.evaluate(([id, at]) => DB.models.get("v2:" + id).at === at, [pid, cur.at]), "model untouched after the reload");

  console.log("3. Older engine data: relearned once on load, served values start over from one step");
  await page.evaluate(async (id) => {
    const m = DB.models.get("v2:" + id); m.data = "older-tables";
    for (const x of Object.values(m.served.pitches)) if (x.learned) { x.command = x.coach.command + 0.9; x.grade = x.coach.grade - 0.9; }
    await DB.D.put("learned", m);
  }, pid);
  await page.reload(); await ready();
  const re = await page.evaluate((id) => { const m = DB.models.get("v2:" + id); return { at: m.at, data: m.data, v: E.dataVersion(),
    learned: Object.values(m.served.pitches).filter((x) => x.learned).length,
    oneStep: Object.values(m.served.pitches).every((x) => !x.learned || (Math.abs(x.command - x.coach.command) <= 0.15 + 1e-9 && Math.abs(x.grade - x.coach.grade) <= 0.15 + 1e-9)) }; }, pid);
  check(re.data === re.v && re.at > cur.at, "relearned on load and stamped with the current engine data");
  check(re.oneStep, `the 0.9 offsets learned against the old tables are gone: every served value is within one 0.15 step of his grades (${re.learned} learned pitch(es))`);
  await page.reload(); await ready();
  check(await page.evaluate(([id, at]) => DB.models.get("v2:" + id).at === at, [pid, re.at]), "the next reload leaves it alone");
  check(errs.length === 0, `no page errors (${errs.slice(0, 2).join(" | ")})`);
  console.log(fails ? `FAIL: ${fails}` : "PASS: relearn on engine data change");
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})();
