/*
 * Security regressions found in the code review (2026-11-04), in the real page. Run from app/: node security_e2e.js
 *   1. a backup file never carries the sign-in session, the device id or sync state; a restore never brings them in
 *   2. a hitter's "bats" or a pitch's kind arriving from a sync or a restore can't run script (they're drawn into SVG)
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const DIST = path.join(__dirname, "dist/pitch-caller.html");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`);
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const open = async () => {
    const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
    await page.goto(url); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 8000 });
    return page;
  };

  console.log("1. Backups and the sign-in session");
  const a = await open();
  const exported = await a.evaluate(async () => {
    await DB.D.put("meta", { id: "auth", access: "ACCESS-TOKEN", refresh: "REFRESH-TOKEN", expiresAt: Date.now() + 3600e3, email: "coach@x" });
    await DB.D.put("meta", { id: "syncConfig", url: "https://x.supabase.co", apiKey: "k", programId: "prog1" });
    await DB.D.put("meta", { id: "sync:prog1", lastPush: { events: Date.now() }, cursor: {} });
    return JSON.stringify(await DB.D.exportAll());
  });
  check(!/REFRESH-TOKEN|ACCESS-TOKEN/.test(exported), "the backup file has no sign-in tokens");
  const metaIds = JSON.parse(exported).stores.meta;
  check(!metaIds || !metaIds.length, `and no device id or sync state (meta in backup: ${metaIds ? metaIds.map((x) => x.id).join(", ") || "none" : "none"})`);
  const b = await open();
  const devB = await b.evaluate(() => DB.deviceId);
  const crafted = JSON.parse(exported); crafted.stores.meta = [{ id: "auth", access: "X", refresh: "EVIL", expiresAt: Date.now() + 1e9, email: "evil@x", updatedAt: Date.now() + 1e9, createdAt: 1 },
    { id: "device", uid: "dev_STOLEN", updatedAt: Date.now() + 1e9, createdAt: 1 }];
  const afterRestore = await b.evaluate(async (data) => { await DB.D.importAll(data); return { auth: await DB.D.get("meta", "auth"), dev: (await DB.D.get("meta", "device")).uid }; }, crafted);
  check(!afterRestore.auth && afterRestore.dev === devB, `restoring a file with a session and device id in it takes neither (signed in: ${!!afterRestore.auth}, device ${afterRestore.dev === devB ? "kept" : "replaced"})`);
  const signedOut = await a.evaluate(async () => {
    const auth = PCSync.supabaseAuth({ url: "https://x.supabase.co", apiKey: "k", db: DB.D });
    await auth.signOut();
    return JSON.stringify(await DB.D.all("meta", true));
  });
  check(!/REFRESH-TOKEN/.test(signedOut), "signing out removes the tokens from the iPad, not just hides them");

  console.log("2. Script can't ride in on a synced or restored record");
  const c = await open();
  const ran = await c.evaluate(async () => {
    window.__xss = 0;
    const evil = `<img src=x onerror="window.__xss++">`;
    const t = await dbPut("teams", { name: "Them", isOurs: false });
    const hit = await dbPut("hitters", { teamId: t.id, name: "H", bats: evil });
    await DB.D.mergeRows("hitters", [Object.assign({}, hit, { updatedAt: Date.now() + 1000 })]);
    const p = pitcherDef(); p.pitches[0].kind = `FB)"/><img src=x onerror="window.__xss++"><x y="`; await dbPut("pitchers", p);
    await reloadFromDb();
    DB.teams.set(t.id, t); DB.hitters.set(hit.id, Object.assign({}, hit, { bats: evil }));
    S.setup.lineup[0].hitterId = hit.id; S.setup.lineup[0].hand = evil; S.setup.opponentId = t.id;
    S.view = "live"; G().call = null; try { makeCall(); } catch (e) {}
    try { render(); } catch (e) {}
    S.view = "data"; try { render(); } catch (e) {}
    await new Promise((r) => setTimeout(r, 400));
    return { n: window.__xss, imgs: document.querySelectorAll("svg img, .zone img, .heat img").length };
  });
  check(ran.n === 0 && ran.imgs === 0, `no injected element ran or was created (ran ${ran.n}, elements ${ran.imgs})`);

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} security check(s) FAILED` : "\nall security checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
