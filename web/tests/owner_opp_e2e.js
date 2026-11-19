/*
 * The organization's owner and opponents in the portal (Drew, Nov 19; 20261119003000_owner_opponents.sql). Against the
 * seeded season and the running local site: ownership of the organization goes to an account that isn't on the team's
 * staff ("outsider"), then
 *   - the nav offers Opponents, not Roster or Game Day;
 *   - the opponents list, a team page and a hitter page open, and the owner saves a hitter's rating and note (stored);
 *   - the roster, the games, a report and the staff's own pages stay closed;
 *   - the previous owner (the head coach) is unaffected as a coach; another account with no tie sees nothing.
 * Ownership goes back afterwards. Usage (repo root): node web/tests/owner_opp_e2e.js
 */
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs");
const season = JSON.parse(fs.readFileSync(process.env.SEASON || "C:/dev/pitch-caller-logs/season.json", "utf8"));
const SITE = process.env.SITE || season.site, T = season.team;
let fails = 0, checks = 0;
const check = (ok, msg) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };

(async () => {
  const db = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" }); await db.connect();
  const org = (await db.query("select org_id from public.programs where id = $1", [T])).rows[0].org_id;
  const before = (await db.query("select owner_id from public.organizations where id = $1", [org])).rows[0].owner_id;
  const outsider = season.users.outsider.id;
  check(!(await db.query("select 1 from public.members where program_id = $1 and user_id = $2", [T, outsider])).rows.length, "outsider isn't on the team's staff");
  await db.query("update public.organizations set owner_id = $2 where id = $1", [org, outsider]);
  const browser = await chromium.launch();
  try {
    const signIn = async (who) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage();
      await page.goto(SITE + "/login?next=/app"); const f = page.getByRole("form", { name: "Sign in" });
      await f.getByLabel("Email").fill(`${who}@test.local`); await f.getByLabel("Password").fill(season.password); await f.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 15000 });
      return { ctx, page };
    };
    // a live hitter of the first opponent (opponents_e2e may have merged one away before this runs)
    const opp = Object.values(season.opponents)[0];
    const live = (await db.query("select id, doc ->> 'name' n from public.hitters where program_id = $1 and id = any($2) and deleted_at is null and doc ->> 'mergedInto' is null and coalesce(doc ->> 'deletedAt', 'null') = 'null' order by id limit 1", [T, opp.hitters])).rows[0];
    const hid = live.id;
    const o = await signIn("outsider"), p = o.page;
    await p.goto(`${SITE}/app/t/${T}`, { waitUntil: "networkidle" });
    const nav = (await p.locator("nav").allInnerTexts()).join(" ");
    check(/Opponents/.test(nav) && !/Roster/.test(nav) && !/Game Day/.test(nav), `the owner's nav: Opponents, no Roster or Game Day (${nav.replace(/\s+/g, " ").slice(0, 120)})`);
    let r = await p.goto(`${SITE}/app/t/${T}/opponents`, { waitUntil: "networkidle" });
    check(r.status() === 200 && await p.getByText(opp.name || "", { exact: false }).count() > 0 && !/for the team.s coaches/.test(await p.locator("main").innerText()), "the opponents list opens with the team's opponents");
    r = await p.goto(`${SITE}/app/t/${T}/opponents/${opp.id}`, { waitUntil: "networkidle" });
    check(r.status() === 200 && /hitter/i.test(await p.locator("main").innerText()), "a team page opens");
    // review tidy-up (Nov 19): no empty game-history sections for the owner off the staff, one line instead
    const STAFF_ONLY = "Only the team’s staff can see game history.";
    let main = await p.locator("main").innerText();
    check(main.includes(STAFF_ONLY) && /Lineups we.ve faced/.test(main) && !/No games against them yet/.test(main) && !/against us/.test(main)
      && await p.getByRole("columnheader", { name: /At-bats seen|Seen/ }).count() === 0,
      "the team page says only the staff can see game history, with no empty lineups, game count or at-bat columns");
    r = await p.goto(`${SITE}/app/t/${T}/opponents/${opp.id}/hitters/${hid}`, { waitUntil: "networkidle" });
    const h1 = await p.locator("h1").first().innerText().catch(() => "");
    check(r.status() === 200 && h1.includes(live.n), `a hitter page opens (it shows "${h1}"; a signed-in not-found would also answer 200)`);
    main = await p.locator("main").innerText();
    check(main.includes(STAFF_ONLY) && !/Every at-bat/.test(main) && !/At-bats seen/.test(main) && !/Not faced yet|Seen \d{4}/.test(main),
      "the hitter page says only the staff can see game history, with no empty at-bat list, totals or seasons seen");
    // review fixes (Nov 19): a hitter with a suggestion waiting; the owner sees the question, never its evidence from the games
    const EVIDENCE = /plate appearances|balls in play|hard-hit balls|whiffs or weak contact|strikeouts? in \d/;
    const sg = (await db.query("select s.hitter_id, s.text, h.doc ->> 'teamId' opp from public.opp_suggestions s join public.hitters h on h.program_id = s.program_id and h.id = s.hitter_id where s.program_id = $1 and s.status = 'pending' and h.deleted_at is null order by s.created_at limit 1", [T])).rows[0];
    if (sg) {
      await p.goto(`${SITE}/app/t/${T}/opponents/${sg.opp}/hitters/${sg.hitter_id}`, { waitUntil: "networkidle" });
      const ownMain = await p.locator("main").innerText();
      const question = sg.text.split("?")[0] + "?";
      check(!EVIDENCE.test(ownMain) && ownMain.includes(question), `the owner sees the suggestion "${question}" without its evidence from the games (staff text: "${sg.text}")`);
      await p.goto(`${SITE}/app/t/${T}/opponents/${opp.id}/hitters/${hid}`, { waitUntil: "networkidle" });   // back to the hitter the next steps edit
    } else check(false, "the season has a pending suggestion to look at");
    // the editor's button reads "Saved" until something changes, then "Save scouting"
    const power3 = p.getByRole("group", { name: "Power" }).getByRole("button", { name: "3" });
    const editable = await power3.count() > 0 && !(await power3.isDisabled()) && !(await p.getByLabel("Notes on this hitter").isDisabled());
    check(editable, "with the scouting editor switched on (the owner may edit)");
    const save = p.getByRole("button", { name: "Save scouting" });
    if (editable) {
      await power3.click();
      const note = `owner note ${Date.now()}`;
      await p.getByLabel("Notes on this hitter").fill(note);
      await save.click(); await p.waitForURL(/ok=saved|error=/, { timeout: 15000 });
      const doc = (await db.query("select doc from public.hitters where program_id = $1 and id = $2", [T, hid])).rows[0].doc;
      check(/ok=saved/.test(p.url()) && doc.notes === note && doc.ratings && doc.ratings.power === 3, `saved by the owner: power ${doc.ratings && doc.ratings.power}, note "${doc.notes}" (${p.url().split("?")[1]})`);
    }
    for (const [u, what] of [[`/app/t/${T}/roster`, "the roster"], [`/app/t/${T}/games`, "the games"], [`/app/t/${T}/reports/${season.games[0].id}`, "a game report"],
      [`/app/t/${T}/roster/${Object.values(season.pitchers)[0]}`, "a pitcher's page"]]) {
      r = await p.goto(SITE + u, { waitUntil: "networkidle" });
      const body = await p.locator("main").innerText().catch(() => "");
      const pitcherNames = (await db.query("select doc ->> 'name' n from public.pitchers where program_id = $1", [T])).rows.map((x) => x.n).filter(Boolean);
      check(r.status() === 404 || !pitcherNames.some((n) => body.includes(n)), `${what} stays closed to the owner (${r.status()}, no pitcher shown)`);
    }
    await o.ctx.close();
    const c = await signIn("coach");
    r = await c.page.goto(`${SITE}/app/t/${T}/roster`, { waitUntil: "networkidle" });
    check(r.status() === 200 && /Pitchers|Roster/.test(await c.page.locator("main").innerText()), "the head coach (no longer owner) still has the roster as a coach");
    await c.page.goto(`${SITE}/app/t/${T}/opponents/${opp.id}`, { waitUntil: "networkidle" });
    const cTeam = await c.page.locator("main").innerText();
    await c.page.goto(`${SITE}/app/t/${T}/opponents/${opp.id}/hitters/${hid}`, { waitUntil: "networkidle" });
    const cHit = await c.page.locator("main").innerText();
    check(!cTeam.includes(STAFF_ONLY) && /Lineups we.ve faced/.test(cTeam) && /against us/.test(cTeam) && !cHit.includes(STAFF_ONLY) && /Every at-bat/.test(cHit) && /At-bats seen/.test(cHit),
      "the staff still get the game history on both pages (lineups, games against us, every at-bat)");
    if (sg) {
      await c.page.goto(`${SITE}/app/t/${T}/opponents/${sg.opp}/hitters/${sg.hitter_id}`, { waitUntil: "networkidle" });
      check((await c.page.locator("main").innerText()).includes(sg.text), "the staff see the suggestion with its evidence");
    }
    await c.ctx.close();
    const v = await signIn("viewer");
    r = await v.page.goto(`${SITE}/app/t/${T}/opponents/${opp.id}/hitters/${hid}`, { waitUntil: "networkidle" });
    check(await v.page.getByRole("button", { name: /Save scouting|Saved/ }).count() === 0 && await v.page.getByRole("group", { name: "Power" }).getByRole("button", { name: "3" }).isDisabled(), "a viewer (no manage opponents, not the owner) gets no editor: read-only controls, no save button");
    await v.ctx.close();
  } finally {
    await browser.close();
    await db.query("update public.organizations set owner_id = $2 where id = $1", [org, before]);
    await db.end();
  }
  console.log(fails ? `${fails} of ${checks} owner check(s) FAILED` : `all ${checks} owner checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
