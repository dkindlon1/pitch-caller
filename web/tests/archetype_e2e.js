/*
 * "Effectively wild" is staff-only (Drew, Nov 19). Against the seeded season and the running local site (SITE):
 *   - as the head coach, at least one pitcher's "At his best" label says it (so this test isn't empty);
 *   - signed in as each player and as the parent, on every page their account opens (home, each of their outings, the
 *     season so far, each final recap) and in their PDFs, the label never appears, while their own numbers still do;
 *     the parent (not linked to a pitcher) on their home, the approval page, and the child's link once approved;
 *   - signed out, on every live public recap link and its PDF, never;
 *   - the database: the stored copies (outcome_findings, peak_baselines) are closed to players and parents;
 *   - the emails: the mail code never carries the label.
 * Usage (repo root): node web/tests/archetype_e2e.js
 */
const { chromium } = require("playwright");
const { Client } = require("pg");
const fs = require("fs"), path = require("path");
const season = JSON.parse(fs.readFileSync(process.env.SEASON || "C:/dev/pitch-caller-logs/season.json", "utf8"));
const SITE = process.env.SITE || season.site, T = season.team, WILD = /effectively\s+wild/i;
let fails = 0, checks = 0;
const check = (ok, msg) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
// every text string in a pdf-lib PDF (it writes text as <hex> strings, sometimes (literal) ones)
const pdfText = (buf) => {
  const s = buf.toString("latin1"), out = [];
  for (const m of s.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)) out.push(Buffer.from(m[1].replace(/\s/g, ""), "hex").toString("latin1"));
  for (const m of s.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) out.push(m[1]);
  return out.join(" ");
};

(async () => {
  const db = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" }); await db.connect();
  const games = (await db.query("select id from public.games where program_id = $1 and deleted_at is null and doc ->> 'dupOf' is null", [T])).rows.map((r) => r.id);
  const pitchedIn = async (pid) => (await db.query("select distinct game_id from public.events where program_id = $1 and deleted_at is null and doc ->> 'pitcherId' = $2 and game_id = any($3)", [T, pid, games])).rows.map((r) => r.game_id);
  const finals = async (pid) => (await db.query("select season_id from public.recap_versions where program_id = $1 and pitcher_id = $2", [T, pid])).rows.map((r) => r.season_id);
  const links = async (uid) => (await db.query("select pitcher_id from public.player_links where program_id = $1 and user_id = $2", [T, uid])).rows.map((r) => r.pitcher_id);
  const names = Object.fromEntries((await db.query("select id, doc ->> 'name' n from public.pitchers where program_id = $1", [T])).rows.map((r) => [r.id, r.n]));
  const browser = await chromium.launch();
  const signIn = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage();
    if (who) { await page.goto(SITE + "/login?next=/app"); const f = page.getByRole("form", { name: "Sign in" });
      await f.getByLabel("Email").fill(`${who}@test.local`); await f.getByLabel("Password").fill(season.password); await f.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 15000 }); }
    return { ctx, page };
  };
  const text = async (page, url) => { const r = await page.goto(SITE + url, { waitUntil: "networkidle" }); return { status: r ? r.status() : 0, html: await page.content(), body: await page.locator("body").innerText() }; };
  const pdf = async (page, url) => { const r = await page.request.get(SITE + url); return { status: r.status(), text: r.ok() ? pdfText(await r.body()) : "" }; };

  console.log("1. Staff see it");
  const coach = await signIn("coach"), staffLabel = {};
  for (const pid of Object.values(season.pitchers)) {
    const { body } = await text(coach.page, `/app/t/${T}/roster/${pid}`);
    const m = body.match(/At his best:\s*([^\n(]+)/); staffLabel[pid] = m ? m[1].trim() : null;
  }
  const wild = Object.keys(staffLabel).filter((p) => WILD.test(staffLabel[p] || ""));
  check(wild.length >= 1, `the head coach sees "Effectively wild" on ${wild.length} pitcher page(s): ${wild.map((p) => `${names[p]}: "${staffLabel[p]}"`).join("; ") || "none (the test would prove nothing)"}`);
  await coach.ctx.close();

  console.log("2. Players and parents never do, and still see their own numbers");
  const accounts = [];
  for (const who of ["ace", "lefty", "kid", "parent"]) for (const pid of await links(season.users[who].id)) accounts.push({ who, pid });
  check(accounts.some((a) => wild.includes(a.pid)), `a player account belongs to a pitcher whose staff label says it (${accounts.filter((a) => wild.includes(a.pid)).map((a) => `${a.who}/${names[a.pid]}`).join(", ")})`);
  let pages = 0, pdfs = 0;
  for (const { who, pid } of accounts) {
    const me = await signIn(who), base = `/app/me/${T}/${pid}`, seen = [], numbersOk = [];
    const urls = [base, `${base}/recap`, ...(await pitchedIn(pid)).map((g) => `${base}/outings/${g}`), ...(await finals(pid)).map((s) => `${base}/recap/${s}`)];
    for (const u of urls) {
      const r = await text(me.page, u); pages++;
      if (r.status !== 200) seen.push(`${u} -> ${r.status}`);
      if (WILD.test(r.html)) seen.push(u);
      if (/\/outings\//.test(u)) numbersOk.push(await me.page.locator("[data-k]").count() > 0);
    }
    const pdfUrls = [...(await pitchedIn(pid)).map((g) => `${base}/outings/${g}/pdf`), ...(await finals(pid)).map((s) => `${base}/recap/${s}/pdf`)];
    for (const u of pdfUrls) { const r = await pdf(me.page, u); pdfs++; if (r.status !== 200) seen.push(`${u} -> ${r.status}`); else if (WILD.test(r.text)) seen.push(u); }
    const home = await text(me.page, base);
    const own = (home.body.match(/At your best:\s*([^\n]+)/) || [])[1] || null;
    check(!seen.length, `${who} (${names[pid]}): not on any of ${urls.length} pages or ${pdfUrls.length} PDFs${seen.length ? ": " + seen.join(", ") : ""}`);
    check(numbersOk.length === 0 || numbersOk.every(Boolean), `${who} (${names[pid]}): their own outing numbers are still there (${numbersOk.length} outing pages)`);
    if (wild.includes(pid)) check(!own || (!WILD.test(own) && staffLabel[pid].toLowerCase().includes(own.trim().toLowerCase())), `${who}: the rest of the label stays ("${own}" vs staff "${staffLabel[pid]}")`);
    await me.ctx.close();
  }

  // a parent's account isn't linked to a pitcher: it opens its home, the approval page and the child's public links
  {
    const par = await signIn("parent"), seen = [], urls = ["/app", "/app/approve"];
    for (const u of urls) { const r = await text(par.page, u); pages++; if (r.status !== 200) seen.push(`${u} -> ${r.status}`); else if (WILD.test(r.html)) seen.push(u); }
    // the child's waiting link is approved for this check (as the parent would) and put back afterwards
    const pending = (await db.query("update public.recap_shares set approved_at = now(), approved_by = $2 where program_id = $1 and pitcher_id = $3 and revoked_at is null and approved_at is null returning token",
      [T, season.users.parent.id, season.pitchers.Kid || Object.values(season.pitchers).find((id) => names[id] === "Eli Brooks")])).rows.map((r) => r.token);
    const approveHtml = (await text(par.page, "/app/approve")).html;
    const kidLinks = [...new Set([...approveHtml.matchAll(/\/r\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]))];
    for (const tok of kidLinks) {
      const r = await text(par.page, `/r/${tok}`); pages++; if (r.status === 200 && WILD.test(r.html)) seen.push(`/r/${tok}`);
      const p = await pdf(par.page, `/r/${tok}/pdf`); pdfs++; if (p.status === 200 && WILD.test(p.text)) seen.push(`/r/${tok}/pdf`);
    }
    check(/Eli Brooks/.test(approveHtml) && !seen.length, `parent (signed in): not on home, the approval page (shows Eli Brooks: ${/Eli Brooks/.test(approveHtml)}), or ${kidLinks.length} of the child's link(s) and PDFs${seen.length ? ": " + seen.join(", ") : ""}`);
    if (pending.length) await db.query("update public.recap_shares set approved_at = null, approved_by = null where token = any($1)", [pending]);
    check(kidLinks.length >= 1, `the child's approved link was read as the parent (${kidLinks.length}; ${pending.length} approved for the check, then put back)`);
    await par.ctx.close();
  }

  console.log("3. Public links");
  const anon = await signIn(null), pub = [];
  let live = 0;
  for (const tok of Object.values(season.shares || {})) {
    const r = await text(anon.page, `/r/${tok}`); if (r.status !== 200) continue;
    live++; if (WILD.test(r.html)) pub.push(`/r/${tok}`);
    const p = await pdf(anon.page, `/r/${tok}/pdf`); if (p.status === 200 && WILD.test(p.text)) pub.push(`/r/${tok}/pdf`);
  }
  check(!pub.length, `not on ${live} live public recap link(s) or their PDFs${pub.length ? ": " + pub.join(", ") : ""}`);
  await anon.ctx.close(); await browser.close();

  console.log("4. The stored copies and the emails");
  const asUser = async (uid, sql) => { await db.query("begin"); await db.query("set local role authenticated"); await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    try { const r = await db.query(sql); await db.query("commit"); return r.rows; } catch (e) { await db.query("rollback"); return e.message; } };
  for (const who of ["ace", "parent"]) {
    const a = await asUser(season.users[who].id, "select count(*)::int n from public.outcome_findings"), b = await asUser(season.users[who].id, "select count(*)::int n from public.peak_baselines");
    check(Array.isArray(a) && a[0].n === 0 && Array.isArray(b) && b[0].n === 0, `${who}: reads none of the stored outcome rows or baselines (which carry the staff label)`);
  }
  const coachRows = await asUser(season.users.coach.id, "select count(*)::int n from public.peak_baselines where data ->> 'archetype' ~* 'effectively wild'");
  check(Array.isArray(coachRows) && coachRows[0].n >= 1, `the head coach does (${Array.isArray(coachRows) ? coachRows[0].n : coachRows} stored baseline(s) with the label)`);
  const mailSrc = fs.readFileSync(path.join(__dirname, "../lib/email.ts"), "utf8") + fs.readFileSync(path.join(__dirname, "../lib/report_jobs.ts"), "utf8").split("export async function storeOutcomes")[0];
  check(!/archetype|effectively wild|peakLabel/i.test(mailSrc), "the emails never carry it (the mail code doesn't read the archetype at all)");
  await db.end();
  console.log(`${pages} pages and ${pdfs} PDFs read as players and parents`);
  console.log(fails ? `${fails} of ${checks} archetype check(s) FAILED` : `all ${checks} archetype checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
