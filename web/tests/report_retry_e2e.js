/*
 * Pre-release (Nov 20, review S4): a report email recorded as "no_provider" (no email provider set up when it was due) is
 * sent by the next job run once a provider is set up, never twice, and the backfill and joined-date rules still hold.
 * Against the seeded season and the running local site (port 3197: provider set up, the fake Resend inbox on 3198), this
 * test starts a second copy of the same build on 3196 with no RESEND_API_KEY:
 *   1. the backfill migration is applied (as on deploy) and anything owed is sent first;
 *   2. game G ends and a season is marked over; a run with no provider records every email as no_provider, sends nothing;
 *   3. a coach joins after both; a run with the provider sends exactly the no_provider emails (each once, the fake inbox
 *      agrees), nothing for the new coach, nothing for a backfilled (past) game;
 *   4. another run with the provider, and one without, change nothing: a sent email is never sent again or un-sent;
 *   5. game H ends, recorded no_provider; two runs with the provider at the same time send each email exactly once;
 *   6. everything it added is removed again.
 * Usage (repo root, site running on 3197): node web/tests/report_retry_e2e.js   (SEASON, SITE as for the other season tests)
 */
const fs = require("fs"), path = require("path"), { spawn, execSync, execFileSync } = require("child_process");
const { Client } = require("pg");
const season = JSON.parse(fs.readFileSync(process.env.SEASON || "C:/dev/pitch-caller-logs/season.json", "utf8"));
const SITE = process.env.SITE || season.site, T = season.team, CRON = "local-cron-secret", NOKEY = "http://localhost:3196", INBOX = "http://127.0.0.1:3198/emails";
const ROOT = path.join(__dirname, "../.."), MIG = path.join(ROOT, "supabase/migrations/20261118020000_report_backfill.sql");
let fails = 0, checks = 0;
const check = (ok, msg) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const run = async (site) => { const r = await fetch(site + "/api/reports/run", { headers: { authorization: `Bearer ${CRON}` } }); const j = await r.json();
  if (!r.ok || j.error) throw new Error(`report run on ${site}: ${r.status} ${JSON.stringify(j)}`); return j; };
const inbox = async () => (await (await fetch(INBOX)).json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the same build, no email provider: the local Supabase's keys from the CLI (as season_seed does), RESEND_API_KEY left
// out; its output goes to report_retry_nokey.log next to the season file
function startNoKey() {
  const st = JSON.parse(execSync("npx -y supabase@2.122.1 status -o json", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString());
  const e = { ...process.env, SUPABASE_URL: st.API_URL, SUPABASE_PUBLISHABLE_KEY: st.PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY: st.SECRET_KEY, SITE_URL: NOKEY, CRON_SECRET: CRON, NODE_ENV: "production" };
  delete e.RESEND_API_KEY; delete e.RESEND_FAKE_API; delete e.NODE_OPTIONS;
  const log = fs.openSync(path.join(path.dirname(process.env.SEASON || "C:/dev/pitch-caller-logs/season.json"), "report_retry_nokey.log"), "w");
  return spawn("npx next start -p 3196 -H localhost", { cwd: path.join(ROOT, "web"), env: e, shell: true, stdio: ["ignore", log, log] });
}
async function up(site) { for (let i = 0; i < 90; i++) { try { const r = await fetch(site + "/login"); if (r.status < 500) return true; } catch {} await sleep(1000); } return false; }
function stop(child) {
  try { execFileSync("powershell", ["-NoProfile", "-Command", "Get-NetTCPConnection -LocalPort 3196 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"], { stdio: "ignore" }); } catch {}
  try { child && child.kill(); } catch {}
}

(async () => {
  const db = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" }); await db.connect();
  const stamp = Date.now().toString(36), NEWC = `retry-coach-${stamp}@test.local`, GG = "gam_retry_g_" + stamp, GH = "gam_retry_h_" + stamp;
  const today = new Date().toISOString().slice(0, 10);
  let child = null, coachId = null, seasonId = null;
  try {
    child = startNoKey();
    check(await up(NOKEY), "a second copy of the site with no email provider is running on 3196");

    console.log("1. The backfill migration (as on deploy); anything the season still had owed goes out first");
    if (fs.existsSync(MIG)) await db.query(fs.readFileSync(MIG, "utf8"));
    await run(SITE);
    const backfilled = (await db.query("select ref from public.report_backfill where program_id = $1 and kind = 'game'", [T])).rows.map((r) => r.ref);
    check(backfilled.length > 0, `the season's past games are backfilled (${backfilled.length})`);
    const src = (await db.query("select id, doc from public.games where program_id = $1 and doc ->> 'status' = 'final' and doc ->> 'dupOf' is null order by doc ->> 'date' desc, (doc ->> 'pitches')::int desc limit 1", [T])).rows[0];
    const addGame = async (gid, endedAt) => {
      await db.query("insert into public.games (program_id, id, doc) values ($1, $2, $3)", [T, gid, { ...src.doc, id: gid, date: today, endedAt, updatedAt: endedAt }]);
      await db.query("insert into public.events (program_id, id, doc) select program_id, id || $4, jsonb_set(jsonb_set(doc, '{id}', to_jsonb(id || $4)), '{gameId}', to_jsonb($3::text)) from public.events where program_id = $1 and game_id = $2 and deleted_at is null",
        [T, src.id, gid, "_" + gid.slice(10)]);
    };
    const rowsFor = async (refs) => (await db.query("select kind, ref, pitcher_id, email, status from public.report_mail where program_id = $1 and ref = any($2) order by id", [T, refs])).rows;
    const keyOf = (m) => `${m.kind}|${m.ref}|${m.pitcher_id}|${m.to || m.email}`;

    console.log("2. Game G ends and a season is marked over; the run has no provider");
    await addGame(GG, Date.now() - 4000);
    seasonId = (await db.query("insert into public.seasons (program_id, name, start_date, end_date, ended_at) values ($1, $2, $3, $3, $4) returning id",
      [T, "Retry test " + stamp, today, new Date(Date.now() - 3500)])).rows[0].id;
    const in0 = (await inbox()).length;
    await run(NOKEY);
    const r0 = await rowsFor([GG, seasonId]);
    check(r0.length > 0 && r0.every((m) => m.status === "no_provider"), `every email is recorded no_provider (${r0.length}: ${[...new Set(r0.map((m) => m.status))].join(", ")})`);
    check(r0.some((m) => m.ref === GG) && r0.some((m) => m.ref === seasonId), `both the game's and the season's emails (${r0.filter((m) => m.ref === GG).length} + ${r0.filter((m) => m.ref === seasonId).length})`);
    check((await inbox()).length === in0, "nothing reached the inbox");

    console.log("3. A coach joins after both; the next run has a provider");
    coachId = (await db.query("insert into auth.users (id, email, email_confirmed_at, aud, role) values (gen_random_uuid(), $1, now(), 'authenticated', 'authenticated') returning id", [NEWC])).rows[0].id;
    await db.query("insert into public.members select (jsonb_populate_record(null::public.members, to_jsonb(m) || jsonb_build_object('user_id', $2::uuid, 'added_at', now()))).* from public.members m where program_id = $1 and user_id = $3",
      [T, coachId, season.users.pcoach.id]);
    const in1 = (await inbox()).length, all1 = +(await db.query("select count(*) n from public.report_mail where program_id = $1", [T])).rows[0].n;
    await run(SITE);
    const r1 = await rowsFor([GG, seasonId]), got1 = (await inbox()).slice(in1);
    check(r1.length === r0.length && r1.every((m) => m.status === "sent"), `every no_provider email is now sent (${r1.filter((m) => m.status === "sent").length} of ${r0.length}; ${[...new Set(r1.map((m) => m.status))].join(", ")})`);
    check(got1.length === r0.length, `the inbox got exactly those, each once (${got1.length} new emails for ${r0.length} rows)`);
    const want = new Set(r0.map((m) => m.email)), counts = {};
    for (const m of got1) for (const to of m.to) counts[to] = (counts[to] || 0) + 1;
    const expectPer = {}; for (const m of r0) expectPer[m.email] = (expectPer[m.email] || 0) + 1;
    check(Object.keys(counts).every((to) => want.has(to)) && Object.entries(expectPer).every(([e, n]) => counts[e] === n), `to the people who were owed them, as many as each was owed (${Object.keys(expectPer).length} people)`);
    check(!r1.some((m) => m.email === NEWC) && !got1.some((m) => m.to.includes(NEWC)), "nothing for the coach who joined after (joined-date rule)");
    const all2 = +(await db.query("select count(*) n from public.report_mail where program_id = $1", [T])).rows[0].n;
    const pastMail = +(await db.query("select count(*) n from public.report_mail where program_id = $1 and ref = any($2)", [T, backfilled])).rows[0].n;
    check(all2 === all1 && pastMail === 0, `no new rows, and no email for any backfilled game (${all2 - all1} new rows; ${pastMail} for past games)`);

    console.log("4. Sent stays sent");
    const in2 = (await inbox()).length;
    await run(SITE); await run(NOKEY);
    const r2 = await rowsFor([GG, seasonId]);
    check((await inbox()).length === in2, `another run with the provider and one without send nothing (${(await inbox()).length - in2})`);
    check(r2.length === r1.length && r2.every((m) => m.status === "sent"), "every row is still sent, once");

    console.log("5. Game H recorded no_provider; two runs with the provider at once");
    await addGame(GH, Date.now() - 1000);
    await run(NOKEY);
    const h0 = await rowsFor([GH]);
    check(h0.length > 0 && h0.every((m) => m.status === "no_provider"), `game H's emails recorded no_provider (${h0.length})`);
    const in3 = (await inbox()).length;
    await Promise.all([run(SITE), run(SITE)]);
    const h1 = await rowsFor([GH]), got3 = (await inbox()).slice(in3);
    const dup = got3.length - new Set(got3.map((m) => m.subject + "|" + m.to.join(","))).size;
    check(h1.every((m) => m.status === "sent") && got3.length === h0.length && dup === 0, `each sent exactly once (${got3.length} emails for ${h0.length} rows, ${dup} duplicates)`);
  } catch (e) { check(false, "error: " + (e.stack || e.message)); }
  finally {
    console.log("6. Clean up");
    await db.query("delete from public.report_mail where program_id = $1 and ref = any($2)", [T, [GG, GH, seasonId].filter(Boolean)]);
    await db.query("delete from public.events where program_id = $1 and game_id = any($2)", [T, [GG, GH]]);
    await db.query("delete from public.games where program_id = $1 and id = any($2)", [T, [GG, GH]]);
    if (seasonId) { await db.query("delete from public.recap_versions where season_id = $1", [seasonId]); await db.query("delete from public.seasons where id = $1", [seasonId]); }
    if (coachId) { await db.query("delete from public.members where user_id = $1", [coachId]); await db.query("delete from auth.users where id = $1", [coachId]); }
    await db.end(); stop(child);
  }
  console.log(fails ? `report retry: ${fails} of ${checks} checks FAILED` : `all ${checks} retry checks passed`);
  process.exit(fails ? 1 : 0);
})();
