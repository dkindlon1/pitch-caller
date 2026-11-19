/*
 * Build 2: the opponent database end to end on the built site and the LOCAL Supabase, on the seeded two-part season
 * (node web/tests/season_seed.js first: spring and fall against the same three opponents).
 *   1. At-bats attach to the right hitters across seasons (each hitter page's history = his at-bats in the raw events).
 *   2. Suggestions after the report run: each one meets its threshold in the raw events, and every cell / rating that
 *      meets one is suggested (unless already set); accept writes the hitter, dismiss stays quiet on the next run.
 *   3. A coach edits a hitter (ratings with Unknown, the grid, checkboxes, notes, a custom field the owner made) and it
 *      persists; the engine's fields (grades, approach / path / off-speed tags) are untouched; a viewer sees it read-only.
 *   4. Merge: two hitters become one, with both records' at-bats; the other is gone from the roster.
 *   5. Players never reach the opponent pages.
 * Run from the repo root after `npm run build` in web/: node web/tests/opponents_e2e.js
 */
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs"), path = require("path"), { spawn, execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "../.."), WEB = path.join(__dirname, ".."), PORT = 3211, SITE = `http://localhost:${PORT}`, CRON = "e2e-cron";
const season = JSON.parse(fs.readFileSync(process.env.SEASON || "C:/dev/pitch-caller-logs/season.json", "utf8"));
const T = season.team, PASS = season.password;
let fails = 0, checks = 0;
const check = (ok, msg) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const status = () => JSON.parse(execFileSync("npx", ["-y", "supabase@2.122.1", "status", "-o", "json"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString());

(async () => {
  const S = status();
  if (!/127\.0\.0\.1|localhost/.test(S.API_URL)) throw new Error("refusing to run against a non-local Supabase");
  const db = new Client({ connectionString: S.DB_URL }); await db.connect();
  if (!(await db.query("select 1 from public.programs where id = $1", [T])).rows.length) throw new Error("run web/tests/season_seed.js first");
  const web = spawn(process.execPath, [path.join(WEB, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "localhost"], {
    cwd: WEB, env: { ...process.env, SUPABASE_URL: S.API_URL, SUPABASE_PUBLISHABLE_KEY: S.PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY: S.SECRET_KEY, NODE_ENV: "production", SITE_URL: SITE, CRON_SECRET: CRON }, stdio: "ignore" });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(SITE + "/login")).ok) break; } catch {} await wait(500); }
  const browser = await chromium.launch();
  const ctxs = {};
  const as = async (who) => {
    if (ctxs[who]) return ctxs[who].page;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage();
    await page.goto(SITE + "/login?next=/app"); const f = page.getByRole("form", { name: "Sign in" });
    await f.getByLabel("Email").fill(`${who}@test.local`); await f.getByLabel("Password").fill(PASS); await f.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 15000 });
    ctxs[who] = { ctx, page }; return page;
  };
  const hitterDoc = async (id) => (await db.query("select doc from public.hitters where program_id = $1 and id = $2", [T, id])).rows[0].doc;
  const opp = season.opponents.Lakeside, oppId = opp.id;
  try {
    console.log("1. At-bats across seasons");
    const coach = await as("coach");
    for (const hid of opp.hitters.slice(0, 4)) {
      const n = (await db.query("select count(*)::int n from public.events where program_id = $1 and deleted_at is null and doc->>'hitterId' = $2 and (doc->>'end')::boolean", [T, hid])).rows[0].n;
      const dates = (await db.query("select distinct g.doc->>'date' d from public.events e join public.games g on g.program_id = e.program_id and g.id = e.game_id where e.program_id = $1 and e.doc->>'hitterId' = $2 and e.deleted_at is null order by 1", [T, hid])).rows.map((r) => r.d);
      await coach.goto(`${SITE}/app/t/${T}/opponents/${oppId}/hitters/${hid}`, { waitUntil: "networkidle" });
      const shown = +(await coach.locator('[data-k="hitter.abs"]').getAttribute("data-v"));
      const spring = dates.some((d) => d < "2026-06-01"), fall = dates.some((d) => d >= "2026-06-01");
      check(shown === n && n > 0, `${hid.slice(-5)}: ${shown} at-bats on his page = ${n} in the raw events (spring: ${spring}, fall: ${fall})`);
    }

    console.log("2. Suggestions");
    const run = await (await fetch(SITE + "/api/reports/run", { headers: { authorization: `Bearer ${CRON}` } })).json();
    check(run.suggestions > 0, `the report run made suggestions (${run.suggestions})`);
    const sugg = (await db.query("select id, hitter_id, kind, key, value, n, status from public.opp_suggestions where program_id = $1", [T])).rows;
    const evs = (await db.query("select doc from public.events where program_id = $1 and deleted_at is null and doc->>'hitterId' is not null and coalesce(doc->>'type','pitch') = 'pitch'", [T])).rows.map((r) => r.doc);
    let okAll = true, missing = 0;
    for (const s of sugg) {
      const mine = evs.filter((e) => e.hitterId === s.hitter_id);
      if (s.kind === "zone") {
        const [r, c] = s.key.split(",").map(Number), at = mine.filter((e) => Array.isArray(e.locCell) && e.locCell[0] === r && e.locCell[1] === c);
        const hard = at.filter((e) => e.res === "play" && e.contact === "hard").length, soft = at.filter((e) => e.res === "whiff" || (e.res === "play" && e.contact === "weak")).length;
        if (!(s.value === "hot" ? hard >= 2 : soft >= 3)) { okAll = false; console.log(`    ${s.hitter_id} ${s.key} ${s.value}: hard ${hard}, soft ${soft}`); }
      } else {
        const pa = mine.filter((e) => e.paEnd).length;
        if (pa < 10) { okAll = false; console.log(`    ${s.hitter_id} ${s.key}: ${pa} PA`); }
      }
    }
    // and every hitter / cell that meets a threshold got one
    for (const h of Object.values(season.opponents).flatMap((o) => o.hitters)) {
      const mine = evs.filter((e) => e.hitterId === h), cells = {};
      for (const e of mine) if (Array.isArray(e.locCell) && e.locCell[0] >= 0 && e.locCell[0] <= 4 && e.locCell[1] >= 0 && e.locCell[1] <= 4 && e.res === "play" && e.contact === "hard") { const k = e.locCell.join(","); cells[k] = (cells[k] || 0) + 1; }
      for (const [k, n] of Object.entries(cells)) if (n >= 2 && !sugg.some((s) => s.hitter_id === h && s.key === k)) missing++;
      if (mine.filter((e) => e.paEnd).length >= 10 && !sugg.some((s) => s.hitter_id === h && s.key === "contact")) missing++;
    }
    check(okAll && sugg.length > 0, `every stored suggestion meets its threshold in the raw events (${sugg.length} checked)`);
    check(missing === 0, `every hot cell (2+ hard-hit balls) and every 10-PA hitter got a suggestion (${missing} missing)`);
    const zone = sugg.find((s) => s.kind === "zone" && opp.hitters.includes(s.hitter_id)), other = sugg.find((s) => s.kind === "rating" && opp.hitters.includes(s.hitter_id) && s.hitter_id !== (zone || {}).hitter_id);
    if (zone) {
      await coach.goto(`${SITE}/app/t/${T}/opponents/${oppId}/hitters/${zone.hitter_id}`, { waitUntil: "networkidle" });
      const li = coach.locator(".op-sugg li").filter({ hasText: zone.value === "hot" ? "hot?" : "cold?" }).first();
      // the Accept of exactly this suggestion (its form carries its id), then the redirect the action makes
      await coach.locator(`form:has(input[name="suggestion"][value="${zone.id}"]):has(input[name="accept"][value="1"]) button`).click();
      await coach.waitForURL(/ok=|error=/, { timeout: 15000 }); await coach.waitForLoadState("networkidle"); void li;
      const d = await hitterDoc(zone.hitter_id);
      check((d.zone || {})[zone.key] === zone.value, `accept writes it to his grid (${zone.key} ${zone.value})`);
      check((await db.query("select status from public.opp_suggestions where id = $1", [zone.id])).rows[0].status === "accepted", "and marks it accepted");
    }
    if (other) {
      await coach.goto(`${SITE}/app/t/${T}/opponents/${oppId}/hitters/${other.hitter_id}`, { waitUntil: "networkidle" });
      await coach.locator(`form:has(input[name="suggestion"][value="${other.id}"]):has(input[name="accept"][value="0"]) button`).click();
      await coach.waitForURL(/ok=|error=/, { timeout: 15000 }); await coach.waitForLoadState("networkidle");
      check((await db.query("select status from public.opp_suggestions where id = $1", [other.id])).rows[0].status === "dismissed", "Dismiss marks exactly that suggestion dismissed");
      const before = (await hitterDoc(other.hitter_id)).ratings || {};
      check(before[other.key] === undefined, "dismiss changes nothing on him");
      await fetch(SITE + "/api/reports/run", { headers: { authorization: `Bearer ${CRON}` } });
      check((await db.query("select status from public.opp_suggestions where id = $1", [other.id])).rows[0].status === "dismissed", "the next run leaves the dismissed one quiet");
    }

    console.log("3. Editing a hitter");
    // the owner (the head coach owns the organization) adds a custom field
    await coach.goto(`${SITE}/app/t/${T}/opponents/fields`, { waitUntil: "networkidle" });
    const add = coach.getByRole("form", { name: "Add a field" });
    await add.getByLabel("Name").fill("Plays first base"); await add.getByRole("button", { name: "Add the field" }).click(); await coach.waitForURL(/ok=saved|error=/);
    check(/ok=saved/.test(coach.url()), "the owner adds a custom field");
    const hid = opp.hitters[5], before = await hitterDoc(hid);
    await coach.goto(`${SITE}/app/t/${T}/opponents/${oppId}/hitters/${hid}`, { waitUntil: "networkidle" });
    await coach.getByRole("group", { name: "Power" }).getByRole("button", { name: "3" }).click();
    await coach.getByRole("group", { name: "Contact" }).getByRole("button", { name: "Unknown" }).click();
    await coach.getByRole("group", { name: "Speed" }).getByRole("button", { name: "1" }).click();
    await coach.getByRole("group", { name: "Spray" }).getByRole("button", { name: "Pull side" }).click();
    const cell = coach.getByRole("group", { name: "Zone grid, catcher's view" }).getByRole("button").nth(6);
    await cell.click(); const cell2 = coach.getByRole("group", { name: "Zone grid, catcher's view" }).getByRole("button").nth(18); await cell2.click(); await cell2.click();
    await coach.getByLabel("Crushes fastballs").check(); await coach.getByLabel("Steal threat").check(); await coach.getByLabel("Plays first base").check();
    await coach.getByLabel("Notes on this hitter").fill("E2E: sits on the first fastball.");
    await coach.getByRole("button", { name: "Save scouting" }).click(); await coach.waitForURL(/ok=saved|error=/, { timeout: 15000 });
    const d = await hitterDoc(hid);
    check(/ok=saved/.test(coach.url()), "saved");
    check(d.ratings && d.ratings.power === 3 && d.ratings.contact === "unknown" && d.ratings.speed === 1 && Object.keys(d.ratings).length === 3, `ratings stored, Unknown as "unknown" (${JSON.stringify(d.ratings)})`);
    // compared with his grid before the taps: an accepted suggestion earlier in this test may already have marked a cell
    const z0 = Object.assign({}, before.zone || {}); delete z0["1,1"]; delete z0["3,3"];
    check(d.zone && d.zone["1,1"] === "hot" && d.zone["3,3"] === "cold" && Object.keys(d.zone).length === 2 + Object.keys(z0).length && Object.entries(z0).every(([k, v]) => d.zone[k] === v),
      `grid: one tap hot, two taps cold, the rest as it was (${JSON.stringify(d.zone)}; before ${JSON.stringify(before.zone || {})})`);
    check(d.pitchFlags.crushesFB && d.smallBall.steal && d.notes === "E2E: sits on the first fastball." && Object.values(d.custom || {}).includes(true), "checkboxes, notes and the custom field stored");
    check(JSON.stringify(d.grades || null) === JSON.stringify(before.grades || null) && JSON.stringify({ ...(d.scoutTags || {}), spray: undefined }) === JSON.stringify({ ...(before.scoutTags || {}), spray: undefined }) && d.scoutTags.spray === "pull",
      "the engine's fields (grades, approach / path / off-speed) are untouched; spray is scoutTags.spray");
    await coach.reload({ waitUntil: "networkidle" });
    check(await coach.getByRole("group", { name: "Contact" }).getByRole("button", { name: "Unknown" }).getAttribute("aria-pressed") === "true", "shown as Unknown after a reload");
    const viewer = await as("viewer");
    await viewer.goto(`${SITE}/app/t/${T}/opponents/${oppId}/hitters/${hid}`, { waitUntil: "networkidle" });
    check(await viewer.getByRole("button", { name: "Save scouting" }).count() === 0 && await viewer.getByRole("group", { name: "Power" }).getByRole("button", { name: "3" }).isDisabled(), "a viewer sees it read-only");
    // team tendencies
    await coach.goto(`${SITE}/app/t/${T}/opponents/${oppId}`, { waitUntil: "networkidle" });
    await coach.getByLabel("Runs a lot").check(); await coach.getByRole("button", { name: "Save", exact: true }).click(); await coach.waitForURL(/ok=saved|error=/);
    check(((await db.query("select doc from public.teams where program_id = $1 and id = $2", [T, oppId])).rows[0].doc.tendencies || {}).runs === true, "team tendencies saved");
    await coach.goto(`${SITE}/app/t/${T}/opponents/${oppId}`, { waitUntil: "networkidle" });
    check(await coach.locator(".op-lineup").first().waitFor({ timeout: 10000 }).then(() => true, () => false), "lineups faced are listed");

    console.log("4. Merge");
    const [keep, drop] = [opp.hitters[1], opp.hitters[2]];
    const nKeep = (await db.query("select count(*)::int n from public.events where program_id = $1 and doc->>'hitterId' = any($2) and (doc->>'end')::boolean and deleted_at is null", [T, [keep, drop]])).rows[0].n;
    await coach.getByLabel("Keep").selectOption(keep); await coach.getByLabel("Merge into him").selectOption(drop);
    await coach.getByRole("button", { name: "Merge them" }).click(); await coach.getByRole("button", { name: "Yes, merge them" }).click(); await coach.waitForURL(/ok=merged|error=/, { timeout: 15000 });
    check(/ok=merged/.test(coach.url()), "merged");
    const k = await hitterDoc(keep), dd = (await db.query("select doc, deleted_at from public.hitters where program_id = $1 and id = $2", [T, drop])).rows[0];
    check((k.aliases || []).includes(drop) && dd.doc.mergedInto === keep && dd.deleted_at, "the kept hitter takes the other's id; the other is marked merged and removed");
    check(!(await coach.locator(`a[href$="/hitters/${drop}"]`).count()), "the merged one is gone from the roster");
    await coach.goto(`${SITE}/app/t/${T}/opponents/${oppId}/hitters/${keep}`, { waitUntil: "networkidle" });
    check(+(await coach.locator('[data-k="hitter.abs"]').getAttribute("data-v")) === nKeep, `his page counts both records' at-bats (${nKeep})`);
    check((await db.query("select count(*)::int n from public.opp_merges where program_id = $1", [T])).rows[0].n === 1, "the merge is logged");

    console.log("5. Players");
    const ace = await as("ace");
    await ace.goto(`${SITE}/app/t/${T}/opponents/${oppId}/hitters/${hid}`, { waitUntil: "networkidle" });
    check(!/Hot and cold|Ratings|sits on the first fastball/.test(await ace.content()), "a player never reaches a hitter page");
    await ace.goto(`${SITE}/app/t/${T}/opponents/fields`, { waitUntil: "networkidle" });
    check(!/Plays first base/.test(await ace.content()), "nor the custom fields");
  } finally { await browser.close(); web.kill(); await db.end(); }
  console.log(`${checks - fails}/${checks} checks passed`);
  if (fails) { console.log(`${fails} opponent e2e check(s) FAILED`); process.exit(1); }
  console.log("opponents e2e: all passed"); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
