/*
 * v0.9 item 4 in the real page: the call carries an intent label (computed after the call, like the why line) and the
 * pitch's event stores it in doc.v08.intent / .mechanism for the Supabase columns. Display is left to the UI redesign.
 * Run from app/: node v09_labels_e2e.js
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = process.env.DIST || path.join(__dirname, "dist/pitch-caller.html");
const LABELS = ["Get ahead", "Get it over", "Setup", "Expand", "Finish", "Early off-zone"];
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
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 10000 });
  await page.evaluate(() => { S.view = "live"; G().call = null; makeCall(); save(); render(); });
  await page.waitForFunction(() => G().call && G().call.intent, null, { timeout: 8000 }).catch(() => {});
  const c = await page.evaluate(() => ({ intent: G().call.intent, mech: G().call.mechanism, line: G().call.intentLine, why: G().call.why,
    count: `${G().balls}-${G().strikes}` }));
  check(LABELS.includes(c.intent) && !!c.line, `call at ${c.count} labeled "${c.intent}" ("${c.line}"), why "${c.why}"`);
  await page.keyboard.press("c"); await page.waitForTimeout(400);
  const e = await page.evaluate(async () => {
    const evs = (await DB.D.all("events")).filter((x) => x.gameId === G().dbId && x.v08);
    const x = evs[evs.length - 1];
    return x ? { intent: x.v08.intent, mech: x.v08.mechanism === undefined ? "missing" : x.v08.mechanism, why: x.v08.why } : null;
  });
  check(e && e.intent === c.intent && e.mech !== "missing", `event stores intent "${e && e.intent}" and mechanism ${e && JSON.stringify(e.mech)}`);
  // a second call at the new count gets its own label
  await page.waitForFunction(() => G().call && G().call.intent, null, { timeout: 8000 }).catch(() => {});
  const c2 = await page.evaluate(() => ({ intent: G().call && G().call.intent, count: `${G().balls}-${G().strikes}` }));
  check(LABELS.includes(c2.intent), `next call at ${c2.count} labeled "${c2.intent}"`);
  check(!errs.length, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" | ") : ""}`);
  await browser.close(); server.close();
  console.log(fails ? `${fails} FAILED` : "all v0.9 label browser checks passed");
  process.exit(fails ? 1 : 0);
})();
