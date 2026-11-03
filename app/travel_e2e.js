// v0.7c browser check: travel ball can be picked in Setup, the game screen calls pitches with it, and a coach's chase
// call at 3-1 is graded against the rule. usage (from app/): node travel_e2e.js
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs");
(async () => {
  const b = await chromium.launch(); const errs = []; let fails = 0;
  const ok = (cond, msg) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) fails++; };
  const page = await b.newPage({ viewport: { width: 1180, height: 820 } });
  page.on("pageerror", (e) => errs.push(String(e))); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  const html = fs.readFileSync(path.join(__dirname, "dist/pitch-caller.html"), "utf8");
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.locator(".tabs button", { hasText: "Setup" }).click(); await page.waitForTimeout(150);
  await page.locator(".choice", { hasText: "Travel ball" }).click(); await page.waitForTimeout(150);
  ok(await page.locator(".choice[aria-pressed=true]", { hasText: "Travel ball" }).count() === 1, "Travel ball can be picked in Setup");
  await page.locator(".tabs button", { hasText: "Game" }).click(); await page.waitForTimeout(400);
  const call = (await page.locator(".pitch").innerText()) + " / " + (await page.locator(".spot").innerText());
  ok(call.trim().length > 3, `the game screen makes a call at travel ball: ${call.replace(/\n/g, " ")}`);
  ok((await page.locator(".stamp").innerText()).includes("Travel ball"), "the game screen shows the level as Travel ball");
  // 3-1 count: three balls then a called strike
  for (const k of ["b", "b", "b"]) { await page.keyboard.press(k); await page.waitForTimeout(150); }
  await page.keyboard.press("c"); await page.waitForTimeout(250);
  const cnt = (await page.locator(".cell .v").first().innerText()).replace(/\s/g, "").replace("\u2013", "-");
  ok(cnt.startsWith("3-1"), `count reached 3-1 (shows ${JSON.stringify(cnt)})`);
  await page.getByRole("button", { name: "Call my own" }).click();
  await page.locator(".pick .seg").first().locator("button").nth(1).click();
  await page.locator(".pick .seg").nth(1).locator("button", { hasText: "Chase it" }).click();
  await page.getByRole("button", { name: "Grade and use my call" }).click(); await page.waitForTimeout(200);
  const why = await page.locator(".why").innerText();
  ok(/no chase pitch at 3-0 or 3-1/.test(why), `coach's chase call at 3-1 is graded against the rule: "${why.replace(/\n/g, " ").slice(0, 90)}"`);
  ok(errs.length === 0, `no page errors${errs.length ? ": " + errs.join(" | ") : ""}`);
  await b.close();
  console.log(fails ? `\n${fails} travel checks failed` : "\nall travel checks passed");
  process.exit(fails ? 1 : 0);
})();
