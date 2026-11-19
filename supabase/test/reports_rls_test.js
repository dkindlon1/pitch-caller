/*
 * Build 1 proof 5, at the database: who can read and write what in the reports (20261118010000_reports.sql), signed in
 * as each role and signed out. Row level security and the functions decide; the website is never the guard.
 *   - a pitcher sees his own outings (pc_my_report) without the coach-only fields, only notes shared with him, never
 *     another pitcher's; players never read events, hitters or opponents;
 *   - notes: staff read; head / pitching / caller write; a viewer reads only; another team sees nothing;
 *   - a public link (pc_public_recap, signed out) returns only the chosen sections, nothing once revoked, and for a
 *     player under 18 nothing until his parent's account approves; only that parent can approve;
 *   - mark season over: only a coach who manages the roster; a frozen recap can't be changed;
 *   - the mail log and the recipient list are the server's only.
 * Run from the repo root: PGURL=postgresql://postgres@localhost:5432/postgres node supabase/test/reports_rls_test.js
 */
const { Client } = require("pg");
const crypto = require("crypto");
const FX = require("./teams_fixture.js");
const BASE = process.env.PGURL || "postgresql://postgres@localhost:5432/postgres";
const DB = "pc_reports_rls_test";
let fails = 0, checks = 0;
const check = (ok, msg) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const dbUrl = (n) => { const u = new URL(BASE); u.pathname = "/" + n; return u.toString(); };
const FORBIDDEN = ["choice", "coach", "mix", "styledMix", "prob", "pred", "hitterId", "catcherId", "ars", "v08", "styleApplied", "deviceId"];

(async () => {
  const a = new Client({ connectionString: BASE }); await a.connect();
  await a.query(`drop database if exists ${DB}`); await a.query(`create database ${DB}`); await a.end();
  const su = new Client({ connectionString: dbUrl(DB) }); await su.connect();
  try {
    await su.query((require("fs")).readFileSync(require("path").join(__dirname, "auth_stub.sql"), "utf8"));
    // Supabase grants new functions in public to the client roles too; the migration must hold against that
    await su.query("alter default privileges in schema public grant all on functions to anon, authenticated, service_role");
    const fs = require("fs"), path = require("path");
    for (const f of fs.readdirSync(path.join(__dirname, "../migrations")).filter((x) => x.endsWith(".sql")).sort()) await su.query(fs.readFileSync(path.join(__dirname, "../migrations", f), "utf8"));

    const U = {};
    for (const n of ["head", "pitching", "caller", "viewer", "p1", "p2", "kid", "parent", "stranger", "xhead"]) {
      U[n] = crypto.randomUUID();
      await su.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [U[n], n + "@x.org"]);
    }
    const t = await FX.newTeam(su, U.head, "Tigers"), x = await FX.newTeam(su, U.xhead, "Rivals");
    await FX.addMember(su, t, U.pitching, "pitching"); await FX.addMember(su, t, U.caller, "caller"); await FX.addMember(su, t, U.viewer, "viewer");
    await FX.addMember(su, t, U.p1, "player", ["pA"]); await FX.addMember(su, t, U.p2, "player", ["pB"]); await FX.addMember(su, t, U.kid, "player", ["pK"]);
    const as = async (who, sql, params = []) => {
      try {
        if (who === "anon" || who === "service") {
          await su.query("begin"); await su.query(`set local role ${who === "anon" ? "anon" : "service_role"}`); await su.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: who === "anon" ? "anon" : "service_role" })]);
          const r = await su.query(sql, params); await su.query("commit"); return { rows: r.rows };
        }
        return { rows: (await FX.asUser(su, U[who], sql, params)).rows };
      } catch (e) { if (who === "anon" || who === "service") await su.query("rollback").catch(() => {}); return { error: e.message }; }
    };
    const push = (tbl, rows) => as("head", "select public.pc_push($1, $2, $3::jsonb) as r", [t, tbl, JSON.stringify(rows)]).then((r) => r.rows ? r.rows[0].r : r);

    // a little data: three pitchers, an opponent hitter, one game with A, B and K pitching
    const now = Date.now();
    await push("pitchers", ["pA", "pB", "pK"].map((id, i) => ({ id, updatedAt: now + i, createdAt: now, name: `Pitcher ${id}`, hand: "R", pitches: [{ id: id + "f", name: "Fastball", kind: "FB" }] })));
    await push("teams", [{ id: "opp1", updatedAt: now, createdAt: now, name: "Rivals U", isOurs: false }]);
    await push("hitters", [{ id: "h1", updatedAt: now, createdAt: now, teamId: "opp1", name: "Slugger", bats: "L" }]);
    await push("games", [{ id: "g1", updatedAt: now, createdAt: now, date: "2026-04-01", status: "final", opponentId: "opp1", pitches: 3 }]);
    const ev = (id, pid, n, extra) => ({ id, updatedAt: now + n, createdAt: now, type: "pitch", gameId: "g1", pitcherId: pid, n, pitchId: pid + "f", pitchName: "Fastball", kind: "FB",
      quad: "down-away", count: "0-0", outs: 0, inning: 1, slot: n, bs: "L", res: "cstrike", locCell: [3, 1], hitterId: "h1", catcherId: "c1", choice: "coach", coach: true, prob: 0.4,
      mix: [[pid + "f", "Fastball", "down-away", 1]], styledMix: [[pid + "f", "Fastball", "down-away", 1]], styleApplied: "none", strength: null, pred: { x: 1 }, sit: { balls: 0, strikes: 0, outs: 0, same_side: false }, v08: { radar: 88, why: "secret" }, ...extra });
    let r = await push("events", [ev("eA", "pA", 1), ev("eB", "pB", 2), ev("eK", "pK", 3, { choice: "recall", shaken: [["Fastball", "up-in"]] })]);
    check(r.applied === 3, "setup: a game with three pitchers' pitches");

    console.log("1. A pitcher's own report");
    const mine = (await as("p1", "select public.pc_my_report($1, 'pA') as r", [t])).rows[0].r;
    check(mine && mine.events.length === 1 && mine.events[0].id === "eA", "pitcher A reads his own pitch");
    const keys = mine ? Object.keys(mine.events[0]) : [];
    check(FORBIDDEN.every((k) => !keys.includes(k)), `no coach-only field reaches him (has: ${keys.join(",")})`);
    check(mine && mine.events[0].radar === 88 && mine.events[0].locCell && mine.events[0].quad, "but his own pitch's spot, where it landed and the radar do");
    check(mine && mine.games[0].opponent === "Rivals U" && !JSON.stringify(mine).includes("Slugger"), "the opponent team's name, never a hitter's");
    const theirs = (await as("p1", "select public.pc_my_report($1, 'pB') as r", [t])).rows[0].r;
    check(theirs === null, "pitcher A asking for pitcher B's report gets nothing");
    check((await as("stranger", "select public.pc_my_report($1, 'pA') as r", [t])).rows[0].r === null, "someone off the team gets nothing");
    const kid = (await as("kid", "select public.pc_my_report($1, 'pK') as r", [t])).rows[0].r;
    check(kid && kid.events[0].recall === true && Array.isArray(kid.events[0].shaken), "his own shake-off shows (the re-call), the coach's calls don't");
    for (const tbl of ["events", "hitters", "teams", "games"]) {
      const c = await as("p1", `select count(*)::int n from public.${tbl} where program_id = $1`, [t]);
      check(c.error || c.rows[0].n === 0, `a player reads no ${tbl} rows (opponents and hitters stay with the staff)`);
    }

    console.log("2. Coach notes");
    const note = (who, body, shared, at) => as(who, "insert into public.report_notes (program_id, game_id, pitcher_id, scope, at_bat, body, shared, author_id) values ($1, 'g1', 'pA', $2, $3, $4, $5, $6) returning id",
      [t, at ? "atbat" : "outing", at || null, body, shared, U[who]]);
    check(!(await note("head", "shared with him", true)).error, "the head coach writes a note");
    check(!(await note("caller", "staff only", false, "1")).error, "a pitch caller writes an at-bat note");
    check(!!(await note("viewer", "viewer try", false)).error, "a viewer can't write notes");
    check(!!(await note("p1", "player try", true)).error, "a pitcher can't write notes");
    check(!!(await as("head", "insert into public.report_notes (program_id, game_id, pitcher_id, scope, body, author_id) values ($1, 'g1', 'pA', 'outing', 'x', $2)", [t, U.caller])).error, "nobody writes a note as someone else");
    const seen = (who) => as(who, "select body from public.report_notes where program_id = $1 order by body", [t]).then((q) => (q.rows || []).map((x) => x.body));
    check(JSON.stringify(await seen("viewer")) === JSON.stringify(["shared with him", "staff only"]), "every coach reads the team's notes, a viewer too");
    check(JSON.stringify(await seen("p1")) === JSON.stringify(["shared with him"]), "the pitcher reads only the note shared with him");
    check((await seen("p2")).length === 0, "another pitcher reads none of them");
    check((await seen("xhead")).length === 0 && (await seen("stranger")).length === 0, "another team's coach and a stranger read none");
    check(mine.notes.length === 0 && (await as("p1", "select public.pc_my_report($1, 'pA') as r", [t])).rows[0].r.notes.map((n) => n.body).join() === "shared with him", "his report carries the shared note only");
    const upd = await as("p1", "update public.report_notes set shared = true where program_id = $1 returning id", [t]);
    check(upd.error || upd.rows.length === 0, "a pitcher can't flip a note to shared");
    const sh = await as("caller", "update public.report_notes set shared = true where program_id = $1 and body = 'staff only' returning id", [t]);
    check(sh.rows && sh.rows.length === 1 && JSON.stringify(await seen("p1")) === JSON.stringify(["shared with him", "staff only"]), "a coach shares a note and the pitcher sees it");
    const del = await as("head", "delete from public.report_notes where program_id = $1", [t]);
    check(!!del.error, "notes are never hard-deleted (soft delete only)");

    console.log("3. Public links (a signed-out visitor reads them through the website's server key; anon can't call it)");
    check(!!(await as("p2", "select public.pc_share_create($1, 'pA', null)", [t])).error, "only the pitcher himself makes his link");
    check(!!(await as("head", "select public.pc_share_create($1, 'pA', null)", [t])).error, "a coach can't make it for him");
    const tok = (await as("p1", "select public.pc_share_create($1, 'pA', null) as t", [t])).rows[0].t;
    check(/^[0-9a-f]{64}$/.test(tok), "a 64-character random token");
    check((await as("p1", "select public.pc_share_create($1, 'pA', null) as t", [t])).rows[0].t === tok, "one live link per recap (asking again returns it)");
    let pub = (await as("service", "select public.pc_public_recap($1) as r", [tok])).rows[0].r;
    check(pub && pub.sections.summary === true && pub.sections.heat === false && pub.sections.pitches === false && pub.sections.outings === false, "signed out: live, summary on by default, the rest off");
    check(pub && pub.events.length === 1 && !("locCell" in pub.events[0]) && !("quad" in pub.events[0]) && pub.games.every((g) => !("date" in g)), "heat maps off: no spots; outing list off: no dates");
    check(pub && !JSON.stringify(pub).match(/Slugger|Rivals U|shared with him|staff only|secret|"coach"|"mix"|catcherId|hitterId/), "no notes, hitters, opponents, overrides or style in it");
    check(!!(await as("p2", "select public.pc_share_sections($1, '{\"heat\":true}')", [tok])).error, "another player can't change his sections");
    await as("p1", "select public.pc_share_sections($1, '{\"summary\":true,\"heat\":true,\"outings\":true}')", [tok]);
    pub = (await as("service", "select public.pc_public_recap($1) as r", [tok])).rows[0].r;
    check(pub && "locCell" in pub.events[0] && pub.games[0].date === "2026-04-01", "heat maps and the outing list on: spots and dates come through");
    check((await as("service", "select public.pc_public_recap($1) as r", ["f".repeat(64)])).rows[0].r === null && (await as("service", "select public.pc_public_recap($1) as r", ["nope"])).rows[0].r === null, "a guessed or malformed token gets nothing");
    check(!!(await as("anon", "select public.pc_public_recap($1)", [tok])).error, "signed out, pc_public_recap itself isn't callable (no pc_ function is anon's)");
    const anonRead = await as("anon", "select count(*)::int n from public.recap_shares");
    check(!!anonRead.error, "signed out, the links table itself can't be read");
    await as("p1", "select public.pc_share_revoke($1)", [tok]);
    check((await as("service", "select public.pc_public_recap($1) as r", [tok])).rows[0].r === null, "revoked: the link is dead");
    const tok2 = (await as("p1", "select public.pc_share_create($1, 'pA', null) as t", [t])).rows[0].t;
    check(tok2 !== tok && (await as("service", "select public.pc_public_recap($1) as r", [tok])).rows[0].r === null, "a new link gets a new token; the old one stays dead");
    console.log("4. Seasons and frozen recaps");
    check(!!(await as("caller", "select public.pc_mark_season_over($1, 'Spring')", [t])).error, "a pitch caller can't mark the season over");
    check(!!(await as("viewer", "select public.pc_mark_season_over($1, 'Spring')", [t])).error, "a viewer can't");
    check(!!(await as("p1", "select public.pc_mark_season_over($1, 'Spring')", [t])).error, "a player can't");
    const sid = (await as("head", "select public.pc_mark_season_over($1, 'Spring') as id", [t])).rows[0].id;
    check(!!sid, "the head coach marks the season over");
    check(!!(await as("head", "select public.pc_mark_season_over($1, 'Again')", [t])).error, "not twice on the same day");
    await su.query("insert into public.recap_versions (program_id, season_id, pitcher_id, version, data) values ($1, $2, 'pA', 1, '{\"line\":{\"pitches\":1}}')", [t, sid]);
    check(!!(await su.query("update public.recap_versions set data = '{}' where season_id = $1", [sid]).then(() => null, (e) => e.message)), "a frozen recap can't be changed, even by the database owner");
    check(!!(await as("head", "insert into public.recap_versions (program_id, season_id, pitcher_id, data) values ($1, $2, 'pB', '{}')", [t, sid])).error, "no client writes a recap (the server freezes them)");
    check((await as("p1", "select count(*)::int n from public.recap_versions")).rows[0].n === 1 && (await as("p2", "select count(*)::int n from public.recap_versions")).rows[0].n === 0, "a pitcher reads his own frozen recap, not another's");

    // frozen: only the chosen sections of the stored recap
    const ftok = (await as("p1", "select public.pc_share_create($1, 'pA', $2) as t", [t, sid])).rows[0].t;
    pub = (await as("service", "select public.pc_public_recap($1) as r", [ftok])).rows[0].r;
    check(pub && pub.frozen && pub.frozen.line && pub.season.final === true && !("heat" in pub.frozen), "a final recap's link serves the frozen data, only the chosen sections");

    console.log("5. Under 18: the parent turns it on");
    check(!!(await as("caller", "select public.pc_set_minor18($1, 'pK', 'parent@x.org')", [t])).error, "only a coach who manages the roster marks a player under 18");
    check(!(await as("head", "select public.pc_set_minor18($1, 'pK', 'parent@x.org')", [t])).error, "the head coach marks him, with his parent's email");
    const ktok = (await as("kid", "select public.pc_share_create($1, 'pK', null) as t", [t])).rows[0].t;
    check((await as("service", "select public.pc_public_recap($1) as r", [ktok])).rows[0].r === null, "his link is made but stays off");
    check(!!(await as("kid", "select public.pc_share_approve($1)", [ktok])).error, "he can't approve it himself");
    check(!!(await as("head", "select public.pc_share_approve($1)", [ktok])).error, "a coach can't approve it");
    check(!!(await as("stranger", "select public.pc_share_approve($1)", [ktok])).error, "nor anyone else");
    const reqs = (await as("parent", "select * from public.pc_my_share_requests()")).rows;
    check(reqs.length === 1 && reqs[0].pitcher_name === "Pitcher pK" && reqs[0].approved === false, "his parent (signed in with that email) sees the request");
    check((await as("stranger", "select * from public.pc_my_share_requests()")).rows.length === 0, "nobody else does");
    check(!(await as("parent", "select public.pc_share_approve($1)", [ktok])).error && !!(await as("service", "select public.pc_public_recap($1) as r", [ktok])).rows[0].r, "the parent approves and the link goes live");
    await as("head", "select public.pc_set_minor18($1, 'pK', 'newparent@x.org')", [t]);
    check((await as("service", "select public.pc_public_recap($1) as r", [ktok])).rows[0].r === null, "a different parent email: the old approval no longer counts");
    await as("head", "select public.pc_set_minor18($1, 'pK', 'parent@x.org')", [t]);
    check((await as("service", "select public.pc_public_recap($1) as r", [ktok])).rows[0].r === null, "and going back doesn't revive it: it needs approving again");
    await as("parent", "select public.pc_share_approve($1)", [ktok]);
    check(!!(await as("service", "select public.pc_public_recap($1) as r", [ktok])).rows[0].r, "approved again: live");
    // review fixes (Nov 19), S2 of the review: after the parent approves, widening the sections goes back to the parent; until
    // then the link serves only what was approved. Narrowing needs no approval.
    const served = async (tk) => { const r = (await as("service", "select public.pc_public_recap($1) as r", [tk])).rows[0].r; return r ? r.sections : null; };
    const pending = async () => ((await as("parent", "select * from public.pc_my_share_requests()")).rows.find((x) => x.token === ktok) || {}).pending;
    await as("kid", "select public.pc_share_sections($1, $2::jsonb)", [ktok, JSON.stringify({ summary: true })]);
    await as("parent", "select public.pc_share_approve($1)", [ktok]);
    let sv = await served(ktok);
    check(!!sv && sv.summary === true && sv.heat === false && (await pending()) === false, "approved with the summary only: live, the summary only, nothing waiting");
    await as("kid", "select public.pc_share_sections($1, $2::jsonb)", [ktok, JSON.stringify({ summary: true, heat: true, pitches: true, outings: true })]);
    sv = await served(ktok);
    check(!!sv && sv.summary === true && !sv.heat && !sv.pitches && !sv.outings, `he widens it (heat maps, pitch by pitch, outings): still only the approved summary is served (${JSON.stringify(sv)})`);
    check((await pending()) === true, "and the widening waits for his parent (shown on the parent's approval page)");
    await as("parent", "select public.pc_share_approve($1)", [ktok]);
    sv = await served(ktok);
    check(!!sv && sv.heat === true && sv.pitches === true && sv.outings === true && (await pending()) === false, "the parent approves the wider link: all four sections served");
    await as("kid", "select public.pc_share_sections($1, $2::jsonb)", [ktok, JSON.stringify({ summary: true, heat: true })]);
    sv = await served(ktok);
    check(!!sv && sv.heat === true && !sv.pitches && !sv.outings && (await pending()) === false, "narrowing (pitch by pitch and outings off) needs no approval: served at once");
    check(!(await as("parent", "select public.pc_share_revoke($1)", [ktok])).error && (await as("service", "select public.pc_public_recap($1) as r", [ktok])).rows[0].r === null, "the parent can kill it too");
    // review fixes (Nov 19), S1 of the review: clearing the under-18 mark leaves an unapproved link off until he turns it on
    await as("head", "select public.pc_set_minor18($1, 'pK', 'parent@x.org')", [t]);
    const ctok = (await as("kid", "select public.pc_share_create($1, 'pK', null) as t", [t])).rows[0].t;
    check((await served(ctok)) === null, "a new link while he's marked: off, waiting for the parent");
    await as("head", "select public.pc_set_minor18($1, 'pK', '')", [t]);
    check((await served(ctok)) === null, "the coach clears the under-18 mark: the link stays off (it never goes live by itself)");
    check(!!(await as("p1", "select public.pc_share_resume($1)", [ctok])).error, "another player can't turn it on");
    check(!(await as("kid", "select public.pc_share_resume($1)", [ctok])).error && !!(await served(ctok)), "he turns it on himself: live");
    await as("head", "select public.pc_set_minor18($1, 'pK', '')", [t]);
    const ptok = (await as("kid", "select public.pc_share_create($1, 'pK', $2) as t", [t, sid])).rows[0].t;
    await as("head", "select public.pc_set_minor18($1, 'pK', 'parent@x.org')", [t]);
    await as("head", "select public.pc_set_minor18($1, 'pK', '')", [t]);
    check((await served(ptok)) === null, "(another link, paused the same way: off)");
    await as("head", "select public.pc_set_minor18($1, 'pK', 'parent@x.org')", [t]);
    check(!(await as("parent", "select public.pc_share_approve($1)", [ptok])).error && !!(await served(ptok)), "marked again: his parent approving turns a paused link on too");


    console.log("6. The server's own tables");
    check(!!(await as("head", "select count(*) from public.report_mail")).error, "a coach can't read the mail log");
    check(!!(await as("head", "select * from public.pc_report_people($1)", [t])).error, "a coach can't call the recipient list");
    check(!!(await as("anon", "select * from public.pc_report_people($1)", [t])).error, "nor can anyone signed out");
    check(!!(await as("anon", "select public.pc_my_report($1, 'pA')", [t])).error, "signed out, pc_my_report isn't callable");
    // a team that's switched off shares nothing
    await su.query("update public.organizations set billing_status = 'locked' where id = (select org_id from public.programs where id = $1)", [t]);
    check((await as("service", "select public.pc_public_recap($1) as r", [tok2])).rows[0].r === null, "a locked team's links go dark");
    check((await as("p1", "select public.pc_my_report($1, 'pA') as r", [t])).rows[0].r === null, "and its pitchers' reports with them");
  } finally { await su.end(); }
  console.log(`${checks - fails}/${checks} checks passed`);
  if (fails) { console.log(`${fails} reports permission check(s) FAILED`); process.exit(1); }
  console.log("all reports permission checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
