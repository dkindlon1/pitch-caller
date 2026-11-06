/*
 * v0.9 in the real page: v0.9 is the default engine, and each hitter's record against this pitcher in his earlier
 * at-bats today (item 6, matchup memory) is kept in the game state and reaches the engine on his next trip, the way
 * simulate.py keeps it: whiffs and called strikes by pitch class, hard contact by class and spot, earlier trips only.
 * Run from app/: node v09_matchup_e2e.js
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
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 10000 });

  console.log("1. v0.9 is the default engine");
  const f = await page.evaluate(() => ({ eng: S.setup.engine, same: !("FLAGS" in E), v: E.VERSION }));
  check(f.eng === "v09" && f.same && f.v === "0.9", `engine ${f.eng}, single flag-free engine ${f.same}, engine version ${f.v}`);

  console.log("2. A strikeout on three swinging strikes is kept for that hitter's next trip, not this one");
  const r2 = await page.evaluate(() => {
    let hk0 = null;
    S.view = "live";
    // each pitch gets a fresh call the way recall() makes one (the page's own recall waits 15 ms)
    const slot = slotIdx(), pk = pKey(), kinds = [], during = [];
    for (let i = 0; i < 3; i++) {
      G().call = null; makeCall();
      kinds.push(arsenal().find((x) => x.name === G().call.pitch).kind);
      during.push(JSON.stringify(situation().matchup));
      record({ result: "whiff" });
      if (i === 0) hk0 = hitterKey();   // his key, once the game has its id (the first pitch gives it one)
    }
    const hk = hk0;
    const want = {}; for (const k of kinds) want["succ|" + k] = (want["succ|" + k] || 0) + 1;
    return { slot, hk, pk, want, during, kept: ((G().mm || {})[pk] || {})[hk] || null, nextSlot: slotIdx(), nextMM: situation().matchup };
  });
  check(r2.during.every((x) => x === "{}"), `during his first trip the engine sees no matchup record (${r2.during.join(", ")})`);
  check(JSON.stringify(r2.kept) === JSON.stringify(r2.want), `kept for him: ${JSON.stringify(r2.kept)} (expected ${JSON.stringify(r2.want)})`);
  check(r2.nextSlot !== r2.slot && JSON.stringify(r2.nextMM) === "{}", `the next hitter (slot ${r2.nextSlot + 1}) starts with no record`);

  console.log("3. An extra-base hit counts as hard contact by class and spot (no contact grade logged)");
  const r3 = await page.evaluate(() => {
    G().call = null; makeCall();
    const hk = hitterKey(), pk = pKey(), c = G().call, kind = arsenal().find((x) => x.name === c.pitch).kind;
    record({ result: "play", out: "2B" });
    return { key: `hard|${kind}|${c.quad}`, kept: ((G().mm || {})[pk] || {})[hk] || null };
  });
  check(r3.kept && r3.kept[r3.key] === 1 && Object.keys(r3.kept).length === 1, `kept: ${JSON.stringify(r3.kept)} (expected ${r3.key}: 1)`);

  console.log("4. His next trip: the record reaches the engine, moves his whiff odds, and is logged with the pitch");
  const r4 = await page.evaluate(async () => {
    const g = G();
    g.batter += 9 - (slotIdx() - 0);   // back around to the first hitter (same pitcher, same game)
    while (slotIdx() !== 0) g.batter++;
    g.balls = 0; g.strikes = 0; g.last = null; g.pa = null; g.call = null; makeCall();
    const s = situation(), m = s.matchup, ars = arsenal();
    const fb = ars.find((x) => ("succ|" + x.kind) in m) || ars[0];
    const q = "middle";
    const pw = E.outcomeProbs(fb, q, E.Situation(s), ars, null), p0 = E.outcomeProbs(fb, q, E.Situation(Object.assign({}, s, { matchup: {} })), ars, null);
    const ratio = (P) => P.whiff / (P.whiff + P.foul + P.weak + P.solid + P.hard);
    record({ result: "ball" });
    await new Promise((r) => setTimeout(r, 300));
    const evs = (await DB.D.all("events")).filter((x) => x.gameId === g.dbId && x.v08);
    const last = evs[evs.length - 1];
    return { m, pitch: fb.name, w: ratio(pw), w0: ratio(p0), logged: last && last.v08.sit ? last.v08.sit.matchup : last && last.sit ? last.sit.matchup : undefined };
  });
  check(r4.m && Object.keys(r4.m).length > 0, `situation().matchup on his second trip: ${JSON.stringify(r4.m)}`);
  check(r4.w > r4.w0, `${r4.pitch} middle: whiff per swing ${(100 * r4.w).toFixed(1)}% with his record vs ${(100 * r4.w0).toFixed(1)}% without`);
  check(JSON.stringify(r4.logged) === JSON.stringify(r4.m), `the pitch's logged situation carries it: ${JSON.stringify(r4.logged)}`);

  console.log("5. Pitches in the current trip do not change his record until the trip ends");
  const r5 = await page.evaluate(() => {
    const pk = pKey(), hk = hitterKey(), before = JSON.stringify(((G().mm || {})[pk] || {})[hk] || {});
    G().call = null; makeCall(); record({ result: "whiff" });
    G().call = null; makeCall(); record({ result: "whiff" });
    const strikesNow = G().strikes;
    return { before, strikesNow };
  });
  check(r5.strikesNow === 2, `two more whiffs recorded (count now has ${r5.strikesNow} strikes); still the same trip, record unchanged until it ends`);
  const r5b = await page.evaluate(() => JSON.stringify(((G().mm || {})[pKey()] || {})[hitterKey()] || {}));
  check(r5b === r5.before, `record mid-trip unchanged: ${r5b}`);

  check(!errs.length, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" | ") : ""}`);
  await browser.close(); server.close();
  console.log(fails ? `${fails} FAILED` : "all v0.9 matchup browser checks passed");
  process.exit(fails ? 1 : 0);
})();
