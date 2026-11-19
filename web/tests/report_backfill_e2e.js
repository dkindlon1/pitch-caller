/*
 * Review fixes (Nov 19): the report emails start with 20261118020000_report_backfill.sql. Against the seeded season (its
 * games and seasons stand in for production's past ones) and a running local site:
 *   1. the backfill migration runs on the season, as it would on deploy;
 *   2. a coach is added to the team today; the next report run emails nobody (no past outing, game or final recap);
 *   3. a new game ends (a copy of the season's last game, dated today, all its pitches synced); the next run sends exactly
 *      that game's emails: one game summary to each coach (the new one too) and one outing email to each pitcher with an
 *      account who pitched in it, and nothing else;
 *   4. everything it added is removed again.
 * Usage (repo root, site running): node web/tests/report_backfill_e2e.js   (SEASON, SITE as for the other season tests)
 */
const fs = require("fs"), path = require("path");
const { Client } = require("pg");
const season = JSON.parse(fs.readFileSync(process.env.SEASON || "C:/dev/pitch-caller-logs/season.json", "utf8"));
const SITE = process.env.SITE || season.site, T = season.team, CRON = "local-cron-secret";
const MIG = path.join(__dirname, "../../supabase/migrations/20261118020000_report_backfill.sql");
let fails = 0, checks = 0;
const check = (ok, msg) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const run = async () => { const r = await fetch(SITE + "/api/reports/run", { headers: { authorization: `Bearer ${CRON}` } }); return r.json(); };

(async () => {
  const db = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" }); await db.connect();
  const NEW = "backfill-newcoach@test.local", GID = "gam_backfill_e2e_" + Date.now().toString(36);
  let uid = null;
  try {
    console.log("1. The backfill migration on the season (as on deploy)");
    if (fs.existsSync(MIG)) { await db.query(fs.readFileSync(MIG, "utf8")); check(true, "applied " + path.basename(MIG)); }
    else check(false, "no backfill migration on this branch (" + path.basename(MIG) + ")");
    await run();   // anything the season itself still had owed goes out first, so the counts below are only what this test causes
    const mailCount = async () => +(await db.query("select count(*) n from public.report_mail where program_id = $1", [T])).rows[0].n;

    console.log("2. A coach added today gets nothing for past games");
    uid = (await db.query("insert into auth.users (id, email, email_confirmed_at, aud, role) values (gen_random_uuid(), $1, now(), 'authenticated', 'authenticated') returning id", [NEW])).rows[0].id;
    await db.query("insert into public.members select (jsonb_populate_record(null::public.members, to_jsonb(m) || jsonb_build_object('user_id', $2::uuid))).* from public.members m where program_id = $1 and user_id = $3",
      [T, uid, season.users.pcoach.id]);
    const before = await mailCount();
    const r1 = await run();
    const toNew = (await db.query("select kind, ref from public.report_mail where email = $1", [NEW])).rows;
    check(toNew.length === 0, `the new coach gets no email for the season's past games or recaps (${toNew.length ? toNew.length + ": " + [...new Set(toNew.map((x) => x.kind))].join(", ") : "none"})`);
    check((await mailCount()) === before && r1.outingMails === 0 && r1.summaryMails === 0 && r1.recapMails === 0, `and nobody else gets anything either (run: ${JSON.stringify({ o: r1.outingMails, s: r1.summaryMails, r: r1.recapMails })})`);
    const pages = await db.query("select count(*) n from public.games where program_id = $1 and doc ->> 'status' = 'final'", [T]);
    check(+pages.rows[0].n > 0, `the past games are still there to view (${pages.rows[0].n} final games)`);

    console.log("3. A game that ends after the migration sends exactly its emails");
    const src = (await db.query("select id, doc from public.games where program_id = $1 and doc ->> 'status' = 'final' and doc ->> 'dupOf' is null order by doc ->> 'date' desc, (doc ->> 'pitches')::int desc limit 1", [T])).rows[0];
    const today = new Date().toISOString().slice(0, 10), now = Date.now();
    await db.query("insert into public.games (program_id, id, doc) values ($1, $2, $3)", [T, GID, { ...src.doc, id: GID, date: today, endedAt: now, updatedAt: now }]);
    const evs = await db.query("insert into public.events (program_id, id, doc) select program_id, id || '_bf', jsonb_set(jsonb_set(doc, '{id}', to_jsonb(id || '_bf')), '{gameId}', to_jsonb($3::text)) from public.events where program_id = $1 and game_id = $2 and deleted_at is null returning doc ->> 'pitcherId' p, doc ->> 'type' t", [T, src.id, GID]);
    const pitchers = [...new Set(evs.rows.filter((x) => !x.t || x.t === "pitch").map((x) => x.p).filter(Boolean))];
    const people = (await db.query("select * from public.pc_report_people($1)", [T])).rows;
    const coaches = people.filter((p) => p.role !== "player").map((p) => p.email).sort();
    const players = people.filter((p) => p.role === "player" && pitchers.includes(p.pitcher_id)).map((p) => `${p.email}|${p.pitcher_id}`).sort();
    const before2 = await mailCount();
    const r2 = await run();
    const sent = (await db.query("select kind, ref, pitcher_id, email from public.report_mail where program_id = $1 order by id desc limit $2", [T, (await mailCount()) - before2])).rows;
    const sums = sent.filter((m) => m.kind === "game_summary").map((m) => m.email).sort(), outs = sent.filter((m) => m.kind === "outing").map((m) => `${m.email}|${m.pitcher_id}`).sort();
    check(sent.every((m) => m.ref === GID), `every email is about the new game (${sent.length} sent: ${[...new Set(sent.map((m) => m.kind))].join(", ")})`);
    check(JSON.stringify(sums) === JSON.stringify(coaches) && sums.includes(NEW), `one game summary to each coach, the new one too (${sums.length} of ${coaches.length})`);
    check(JSON.stringify(outs) === JSON.stringify(players), `one outing email to each pitcher with an account who pitched in it (${outs.length}: ${outs.map((x) => x.split("|")[0]).join(", ") || "none"}; expected ${players.length})`);
    check(sent.length === sums.length + outs.length && r2.recapMails === 0, "and nothing else");
    const r3 = await run();
    check(r3.outingMails === 0 && r3.summaryMails === 0, "a second run sends none of them again");
  } finally {
    console.log("4. Cleanup");
    await db.query("delete from public.report_mail where program_id = $1 and (ref = $2 or email = $3)", [T, GID, NEW]);
    await db.query("delete from public.events where program_id = $1 and game_id = $2", [T, GID]);
    await db.query("delete from public.outcome_findings where program_id = $1 and game_id = $2", [T, GID]).catch(() => {});
    await db.query("delete from public.games where program_id = $1 and id = $2", [T, GID]);
    if (uid) { await db.query("delete from public.members where user_id = $1", [uid]); await db.query("delete from auth.users where id = $1", [uid]); }
    await db.end();
  }
  console.log(fails ? `${fails} of ${checks} backfill check(s) FAILED` : `all ${checks} backfill checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
