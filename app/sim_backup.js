/*
 * Make a backup the way the app makes one: games charted in the real app in a browser, with each pitch's result and
 * location drawn from a hidden "true" pitcher, and the app's own learner relearning after each End game, as in use. For step 3 (shadow.js), so learner v2 is judged on data the app itself produced, not on worlds.js.
 *
 * Usage (from app/): node sim_backup.js <out.json> <scenario> [games] [seed]
 *   scenario: wrong  (fastball command entered 4, truly 2.5; slider stuff entered 3, truly 4; changeup right)
 *             right  (every grade right)
 *             change (grades right until game 8, then fastball command drops to 1.8; the coach marks it)
 * The game flow, calls, confidence and logging are the app's own code (record(), shakeOff(), endGame()); only the
 * result and location of each pitch are drawn here, from the engine with the true grades.
 */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const [out, scenario = "wrong", G_ = "14", SEED = "1"] = process.argv.slice(2);
const DIST = path.join(__dirname, "dist/pitch-caller.html");

const ENTERED = [{ type: "Four-seam", name: "Fastball", kind: "FB", shape: "ride", velo: 87, grade: 3, command: 4, feel: 0.75 },
  { type: "Slider", name: "Slider", kind: "SL", shape: "tight", velo: 79, grade: 3, command: 3, feel: 0.7 },
  { type: "Changeup", name: "Changeup", kind: "CH", shape: "fade", velo: 79, grade: 3, command: 3, feel: 0.6 }];
const TRUTH = {
  wrong: () => ({ Fastball: { grade: 3, command: 2.5 }, Slider: { grade: 4, command: 3 }, Changeup: { grade: 3, command: 3 } }),
  right: () => ({ Fastball: { grade: 3, command: 4 }, Slider: { grade: 3, command: 3 }, Changeup: { grade: 3, command: 3 } }),
  change: (g) => ({ Fastball: { grade: 3, command: g >= 8 ? 1.8 : 4 }, Slider: { grade: 3, command: 3 }, Changeup: { grade: 3, command: 3 } }),
}[scenario];
if (!out || !TRUTH) { console.error("usage: node sim_backup.js <out.json> wrong|right|change [games] [seed]"); process.exit(2); }

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${fs.readFileSync(DIST, "utf8")}</body></html>`);
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 8000 });
  const pid = await page.evaluate(async (ars) => {
    const p = PCDB.newPitcher(ourTeam().id, { name: "Sim Pitcher", hand: "R" });
    p.pitches = ars.map((d) => PCDB.newPitch(d.type, Object.assign({}, d)));
    const np = await dbPut("pitchers", p); DB.pitchers.set(np.id, np);
    S.setup.staffIds = [np.id]; attachStaff(); S.setup.level = "college_d3"; S.setup.logLoc = true; S.setup.inputs = 2;
    S.game = newGame(); S.view = "live"; makeCall(); save(); render();
    return np.id;
  }, ENTERED);
  const games = +G_;
  for (let gi = 0; gi < games; gi++) {
    if (scenario === "change" && gi === 8) await page.evaluate((id) => markChanged(DB.pitchers.get(id), null), pid);
    const truth = TRUTH(gi);
    // one game: about 6 innings, then End game (the app relearns)
    const n = await page.evaluate(async ({ truth, seed }) => {
      let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
      let pitches = 0;
      while (G().inning <= 6 && pitches < 140) {
        const g = G();
        if (g.inningOver) { startNextInning(); continue; }
        // the app makes the next call on a short timer after each pitch; this loop doesn't yield, so call directly
        makeCall();
        if (rnd() < 0.06) { shakeOff(); makeCall(); }              // a shake-off now and then: the re-call is logged as such
        const call = g.call, ars = arsenal();
        // the true pitch: the app's arsenal entry (same feel, same confidence) with the true grades
        const trueArs = ars.map((p) => E.Pitch(Object.assign({}, p, truth[p.name] || {})));
        const tp = trueArs.find((p) => p.name === call.pitch);
        const bz = {}; E.outcomeProbs(tp, call.quad, situation(), trueArs, null, bz);
        // draw the zone, then the result within it
        let r = rnd(), z = "noncomp";
        for (const k of ["heart", "edge", "off", "noncomp"]) { r -= bz[k].land; if (r <= 0) { z = k; break; } }
        const m = bz[z], tot = m.ball + m.wp_ball + m.hbp + m.cstrike + m.whiff + m.foul + m.weak + m.solid + m.hard;
        let u = rnd() * tot, cat = "hard";
        for (const k of ["ball", "wp_ball", "hbp", "cstrike", "whiff", "foul", "weak", "solid", "hard"]) { u -= m[k]; if (u <= 0) { cat = k; break; } }
        const res = { loc: z };
        if (cat === "ball" || cat === "wp_ball") res.result = "ball";
        else if (cat === "hbp") res.result = "hbp";
        else if (["cstrike", "whiff", "foul"].includes(cat)) res.result = cat;
        else {
          res.result = "play"; res.contact = cat;
          const q = rnd(), hitP = { weak: 0.12, solid: 0.35, hard: 0.6 }[cat];
          res.out = q > hitP ? "OUT" : cat === "hard" && q < 0.1 ? "HR" : cat === "hard" && q < 0.25 ? "2B" : "1B";
        }
        if (cat === "wp_ball") res.wp = "wp";
        record(res); pitches++;
        if (G().inningOver && G().inning >= 6) break;
      }
      const c = await finishGameRecord(); archiveGame(); S.game = newGame(); S.view = "live"; makeCall(); save();
      return { pitches, located: c && c.located };
    }, { truth, seed: (+SEED * 7919 + gi * 104729) % 4294967296 });
    process.stdout.write(`game ${gi + 1}: ${n.pitches} pitches\n`);
  }
  await page.evaluate(() => render());
  await page.locator(".tabs button", { hasText: "Roster" }).click(); await page.waitForTimeout(300);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Back up" }).click()]);
  await dl.saveAs(out);
  const bk = JSON.parse(fs.readFileSync(out, "utf8"));
  bk.sim = { scenario, games, seed: +SEED, entered: ENTERED.map((d) => ({ name: d.name, grade: d.grade, command: d.command })),
    truth: Array.from({ length: games }, (_, g) => TRUTH(g)), pitcherId: pid };
  fs.writeFileSync(out, JSON.stringify(bk));
  console.log(`wrote ${out}: ${bk.stores.events.filter((e) => !e.deletedAt && e.type !== "play").length} pitches${errs.length ? ", page errors: " + errs.join(" | ") : ""}`);
  await browser.close(); server.close();
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
