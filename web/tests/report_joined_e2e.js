/*
 * Pre-release (Nov 19): a coach or pitcher added to a team never gets an outing report, game summary or final recap
 * email for a game (or season) that ended before they joined. They can still open those reports in the portal.
 * Against the seeded season and a running local site (the backfill migration applied, as on deploy):
 *   1. game A ends (dated today, 3 s ago) and a season is marked over (2.5 s ago); a report run emails the coaches and
 *      pitchers already on the team (everyone the seed added, before both);
 *   2. 1.5 s ago a coach joins, and a pitcher in game A gets his account linked (the pitcher's own link moved to a new
 *      account for the test, put back after);
 *   3. the next run sends neither of them anything for game A or the season (both still viewable: rows are there);
 *   4. game B ends now: the new coach gets its game summary and the new pitcher account its outing email, nothing else;
 *   5. everything it added is removed again and the pitcher's own link is restored.
 * Usage (repo root, site running): node web/tests/report_joined_e2e.js   (SEASON, SITE as for the other season tests)
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
  const stamp = Date.now().toString(36), NEWC = `joined-coach-${stamp}@test.local`, NEWP = `joined-pitcher-${stamp}@test.local`;
  const GA = "gam_joined_a_" + stamp, GB = "gam_joined_b_" + stamp;
  const now = Date.now(), today = new Date().toISOString().slice(0, 10);
  let coachId = null, pitcherUser = null, moved = null, seasonId = null;
  try {
    if (fs.existsSync(MIG)) await db.query(fs.readFileSync(MIG, "utf8"));
    await run();   // anything the season itself still had owed goes out first
    const src = (await db.query("select id, doc from public.games where program_id = $1 and doc ->> 'status' = 'final' and doc ->> 'dupOf' is null order by doc ->> 'date' desc, (doc ->> 'pitches')::int desc limit 1", [T])).rows[0];
    const addGame = async (gid, endedAt) => {
      await db.query("insert into public.games (program_id, id, doc) values ($1, $2, $3)", [T, gid, { ...src.doc, id: gid, date: today, endedAt, updatedAt: endedAt }]);
      const evs = await db.query("insert into public.events (program_id, id, doc) select program_id, id || $4, jsonb_set(jsonb_set(doc, '{id}', to_jsonb(id || $4)), '{gameId}', to_jsonb($3::text)) from public.events where program_id = $1 and game_id = $2 and deleted_at is null returning doc ->> 'pitcherId' p, doc ->> 'type' t",
        [T, src.id, gid, "_" + gid.slice(10)]);
      return [...new Set(evs.rows.filter((x) => !x.t || x.t === "pitch").map((x) => x.p).filter(Boolean))];
    };
    const mailsTo = async (email) => (await db.query("select kind, ref from public.report_mail where program_id = $1 and email = $2 order by id", [T, email])).rows;

    console.log("1. Game A ends and a season is marked over, before anyone new joins");
    const pitchersA = await addGame(GA, now - 3000);
    seasonId = (await db.query("insert into public.seasons (program_id, name, start_date, end_date, ended_at) values ($1, $2, $3, $3, $4) returning id",
      [T, "Joined test " + stamp, today, new Date(now - 2500)])).rows[0].id;
    const r1 = await run();
    check(r1.summaryMails > 0 && r1.recapMails > 0, `the team already on it gets game A and the season's recap (run: ${JSON.stringify({ o: r1.outingMails, s: r1.summaryMails, r: r1.recapMails })})`);

    console.log("2. Just after, a coach joins and a pitcher from game A gets his account");
    const addUser = async (email) => (await db.query("insert into auth.users (id, email, email_confirmed_at, aud, role) values (gen_random_uuid(), $1, now(), 'authenticated', 'authenticated') returning id", [email])).rows[0].id;
    const joined = new Date(now - 1500);
    coachId = await addUser(NEWC);
    await db.query("insert into public.members select (jsonb_populate_record(null::public.members, to_jsonb(m) || jsonb_build_object('user_id', $2::uuid, 'added_at', $4::timestamptz))).* from public.members m where program_id = $1 and user_id = $3",
      [T, coachId, season.users.pcoach.id, joined]);
    // the pitcher: a pitcher in game A; his record's link (one account per pitcher) moves to a new account for the test
    const pid = pitchersA.find((p) => p === season.pitchers.Ace) || pitchersA[0];
    moved = (await db.query("select * from public.player_links where program_id = $1 and pitcher_id = $2", [T, pid])).rows[0] || null;
    if (moved) await db.query("delete from public.player_links where program_id = $1 and pitcher_id = $2", [T, pid]);
    pitcherUser = await addUser(NEWP);
    const playerRow = (await db.query("select * from public.members where program_id = $1 and role = 'player' limit 1", [T])).rows[0];
    await db.query("insert into public.members select (jsonb_populate_record(null::public.members, to_jsonb(m) || jsonb_build_object('user_id', $2::uuid, 'added_at', $3::timestamptz))).* from public.members m where program_id = $1 and user_id = $4",
      [T, pitcherUser, joined, playerRow.user_id]);
    await db.query("insert into public.player_links (program_id, user_id, pitcher_id, linked_at) values ($1, $2, $3, $4)", [T, pitcherUser, pid, joined]);
    const people = (await db.query("select * from public.pc_report_people($1)", [T])).rows;
    check(people.some((p) => p.email === NEWC && p.role !== "player") && people.some((p) => p.email === NEWP && p.pitcher_id === pid),
      `both are on the team's email list now (coach; pitcher ${pid})`);

    console.log("3. Nothing from before they joined");
    const r2 = await run();
    const c2 = await mailsTo(NEWC), p2 = await mailsTo(NEWP);
    check(!c2.some((m) => m.ref === GA), `the new coach gets no game summary for game A (${c2.filter((m) => m.ref === GA).length})`);
    check(!c2.some((m) => m.ref === seasonId), `the new coach gets no final recap for the season marked over before he joined (${c2.filter((m) => m.ref === seasonId).length})`);
    check(!p2.some((m) => m.ref === GA), `the new pitcher account gets no outing email for game A (${p2.filter((m) => m.ref === GA).length})`);
    check(!p2.some((m) => m.ref === seasonId), `the new pitcher account gets no final recap for that season (${p2.filter((m) => m.ref === seasonId).length})`);
    check(c2.length === 0 && p2.length === 0 && r2.outingMails + r2.summaryMails + r2.recapMails === 0, `nothing at all yet (run: ${JSON.stringify({ o: r2.outingMails, s: r2.summaryMails, r: r2.recapMails })})`);
    const viewable = (await db.query("select (select count(*) from public.games where program_id = $1 and id = $2) g, (select count(*) from public.recap_versions where season_id = $3) r", [T, GA, seasonId])).rows[0];
    check(+viewable.g === 1 && +viewable.r > 0, `game A and the season's frozen recaps are still there to open (${viewable.g} game, ${viewable.r} recaps)`);

    console.log("4. Game B ends after they joined: they get its emails");
    const pitchersB = await addGame(GB, Date.now());
    await run();
    const c3 = await mailsTo(NEWC), p3 = await mailsTo(NEWP);
    check(c3.length === 1 && c3[0].kind === "game_summary" && c3[0].ref === GB, `the new coach gets game B's summary and only that (${c3.map((m) => m.kind + ":" + m.ref.slice(0, 14)).join(", ") || "none"})`);
    const wantP = pitchersB.includes(pid) ? 1 : 0;
    check(p3.length === wantP && p3.every((m) => m.kind === "outing" && m.ref === GB), `the new pitcher account gets game B's outing email and only that (${p3.map((m) => m.kind + ":" + m.ref.slice(0, 14)).join(", ") || "none"}; expected ${wantP})`);
  } finally {
    console.log("5. Cleanup");
    await db.query("delete from public.report_mail where program_id = $1 and (ref = any($2) or email = any($3))", [T, [GA, GB, String(seasonId)], [NEWC, NEWP]]);
    for (const g of [GA, GB]) {
      await db.query("delete from public.events where program_id = $1 and game_id = $2", [T, g]);
      await db.query("delete from public.outcome_findings where program_id = $1 and game_id = $2", [T, g]).catch(() => {});
      await db.query("delete from public.games where program_id = $1 and id = $2", [T, g]);
    }
    if (seasonId) await db.query("delete from public.seasons where id = $1", [seasonId]);
    for (const u of [coachId, pitcherUser].filter(Boolean)) {
      await db.query("delete from public.player_links where user_id = $1", [u]);
      await db.query("delete from public.members where user_id = $1", [u]);
      await db.query("delete from auth.users where id = $1", [u]);
    }
    if (moved) await db.query("insert into public.player_links (program_id, user_id, pitcher_id, linked_at) values ($1, $2, $3, $4) on conflict do nothing", [moved.program_id, moved.user_id, moved.pitcher_id, moved.linked_at]);
    await db.end();
  }
  console.log(fails ? `${fails} of ${checks} joined check(s) FAILED` : `all ${checks} joined checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
