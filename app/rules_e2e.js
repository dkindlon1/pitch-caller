/*
 * Game day (Plan 5, A7) in the real page: the team's pitch-count rule, the live count and its warnings, eligible-on
 * on the roster and the staff picker, the pitching log, the sign card, and the team's time zone.
 * Run from app/ after a build: node rules_e2e.js
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
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const errs = [];
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(url); await page.waitForFunction(() => typeof DB !== "undefined" && DB.ready, null, { timeout: 8000 });
  await page.waitForTimeout(300);
  const chartTo = async (target) => {
    for (let guard = 0; guard < target * 8; guard++) {
      if ((await page.evaluate(() => G().pc[pKey()] || 0)) >= target) break;
      if (await page.evaluate(() => !!G().inningOver)) { await page.getByRole("button", { name: /^Take the field/ }).click(); await page.waitForTimeout(80); continue; }
      await page.keyboard.press(["b", "c"][guard % 2]); await page.waitForTimeout(60);
    }
  };
  const line = () => page.evaluate(() => { const el = document.getElementById("count-line"); return el ? { text: el.textContent, warn: el.classList.contains("warn") } : null; });

  console.log("1. Picking the team's rule");
  await page.locator(".tabs button", { hasText: "Setup" }).click(); await page.waitForTimeout(200);
  check(await page.getByText("Pick your league's rule").count() === 1, "Setup asks for the league's rule");
  await page.locator("#rule-preset").selectOption("ps-13-14"); await page.waitForTimeout(300);
  const saved = await page.evaluate(() => ourTeam().pitchRule);
  const setupText = await page.locator("main").innerText();
  const tierVals = await page.locator(".rule-tbl input").evaluateAll((xs) => xs.map((x) => +x.value));
  check(saved && saved.preset === "ps-13-14" && JSON.stringify(tierVals) === JSON.stringify([20, 0, 35, 1, 50, 2, 65, 3, 95, 4]) && /checked 2026-11-05/.test(setupText),
    `Pitch Smart 13-14 is saved on our team, with its table (${tierVals.join(",")}) and where it came from`);
  await page.locator("#rule-max").fill("90"); await page.locator("#rule-max").press("Tab"); await page.waitForTimeout(300);
  check((await page.evaluate(() => teamRule().max)) === 90 && /changed some numbers/.test(await page.locator("main").innerText()), "the coach can change the limit, and the page says it's been changed");
  await page.getByRole("button", { name: "Back to the preset's numbers" }).click(); await page.waitForTimeout(300);
  check((await page.evaluate(() => teamRule().max)) === 95, "and go back to the preset");

  console.log("2. The live count");
  await page.evaluate(() => { S.view = "live"; G().call = null; makeCall(); save(); render(); });
  await page.waitForTimeout(200);
  let l = await line();
  check(l && /95 left of 95/.test(l.text) && /21 more: 1 day's rest/.test(l.text) && !l.warn, `before his first pitch: "${l && l.text}"`);
  await chartTo(33);
  l = await line();
  check(l && /62 left of 95/.test(l.text) && /3 more: 2 days' rest/.test(l.text), `at 33: "${l && l.text}"`);
  await chartTo(86);
  l = await line();
  check(l && l.warn && /9 left of 95/.test(l.text), `the last 10 before the limit are amber: "${l && l.text}"`);
  await chartTo(95);
  l = await line();
  check(l && l.warn && /At his limit of 95/.test(l.text), `at 95: "${l && l.text}"`);
  const pid = await page.evaluate(() => pitcherDef().id), gid = await page.evaluate(() => G().dbId);
  await page.evaluate(() => endGame()); await page.waitForTimeout(1500);

  console.log("3. Eligible on");
  const want = await page.evaluate(() => PCRules.addDays(todayT(), 5));
  const el = await page.evaluate((p) => eligibility(p), pid);
  check(el && el.date === want && !el.today, `95 pitches today (4 days off): eligible ${want} (${el && el.date})`);
  await page.locator(".tabs button", { hasText: "Roster" }).click(); await page.waitForTimeout(300);
  const card = await page.locator(".pcard").filter({ has: page.locator(".pc-top b", { hasText: new RegExp(`^(#\\d+ )?${await page.evaluate((p) => DB.pitchers.get(p).name, pid)}$`) }) }).first().innerText();
  check(/Eligible /.test(card) && /95 pitches/.test(card), `his roster card says when: "${card.split("\n").pop()}"`);
  await page.locator(".tabs button", { hasText: "Setup" }).click(); await page.waitForTimeout(200);
  const pick = await page.locator(".staffpick .choice", { hasText: await page.evaluate((p) => DB.pitchers.get(p).name, pid) }).first().innerText();
  check(/Eligible /.test(pick), "and so does the staff picker");
  const other = await page.evaluate((p) => rosterPitchers().find((x) => x.id !== p).id, pid);
  check(/eligible today/.test(await page.evaluate((p) => eligibleText(p), other)), "a pitcher who hasn't thrown is eligible today");

  console.log("4. The pitching log");
  const L = await page.evaluate(async (g) => { const x = await pitchingLog(g); return { rows: x.rows, csv: pitchingLogCsv(x), date: x.game.date }; }, gid);
  const me = L.rows.find((x) => x.pid === pid);
  check(me && me.pitches === 95 && me.rest === 4 && me.eligible === want && me.bf > 0, `his line: ${me && me.pitches} pitches, ${me && me.bf} batters, ${me && me.rest} days' rest, eligible ${me && me.eligible}`);
  check(L.csv.split("\n").length === L.rows.length + 1 && /"Days of rest","Eligible on"/.test(L.csv.split("\n")[0]), "the CSV has a header and one row per pitcher");
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await page.evaluate((g) => printPitchingLog(g), gid); await page.waitForTimeout(200);
  const printed = await page.evaluate(() => ({ n: window.__printed, text: document.getElementById("print-area").innerText }));
  check(printed.n === 1 && /Pitching log/.test(printed.text) && /Pitch Smart, ages 13-14/.test(printed.text) && /95/.test(printed.text), "Print puts the log on the page and opens the print dialog");
  await page.locator(".tabs button", { hasText: "Data" }).click(); await page.waitForTimeout(500);
  check(await page.getByRole("region", { name: "Pitching log" }).count() === 1 && (await page.getByRole("region", { name: "Pitching log" }).getByRole("button", { name: "CSV" }).count()) >= 1, "the Data screen lists games to print or download");

  console.log("5. The sign card");
  await page.evaluate(() => printSignCard()); await page.waitForTimeout(100);
  const card2 = await page.evaluate(() => document.getElementById("print-area").innerText);
  const names = await page.evaluate(() => S.setup.staff.map((p) => p.name));
  check(/1 Fastball/.test(card2) && /2 Curveball/.test(card2) && names.every((n) => card2.includes(n)), `each of today's pitchers with his signs (${names.join(", ")})`);

  console.log("6. Picking a pitcher who isn't eligible");
  await page.locator(".tabs button", { hasText: "Setup" }).click(); await page.waitForTimeout(200);
  if (await page.evaluate((p) => S.setup.staffIds.includes(p), pid)) { await page.evaluate((p) => toggleStaff(p), pid); await page.waitForTimeout(100); }
  await page.evaluate((p) => toggleStaff(p), pid); await page.waitForTimeout(150);
  const toastText = await page.evaluate(() => (document.querySelector(".toast") || {}).textContent || "");
  check(/isn't eligible until/.test(toastText), `adding him to today's staff warns: "${toastText}"`);

  console.log("7. The team's time zone");
  const tz = await page.evaluate(() => ({ utc: PCDB.today("UTC"), real: new Date().toISOString().slice(0, 10), kiri: PCDB.today("Pacific/Kiritimati"), bad: PCDB.today("Not/AZone") }));
  check(tz.utc === tz.real && /^\d{4}-\d\d-\d\d$/.test(tz.kiri) && /^\d{4}-\d\d-\d\d$/.test(tz.bad), `dates follow the zone given (UTC ${tz.utc}, Kiritimati ${tz.kiri}), and a bad zone falls back to the device`);

  check(!errs.length, "no page errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} game-day check(s) FAILED` : "\nall game-day checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
