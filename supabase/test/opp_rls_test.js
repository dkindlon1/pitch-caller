/*
 * Build 2 proof 4, at the database: the opponent database's permissions (20261119000000_opponent_db.sql plus the
 * existing hitters / teams rules). Players can't read opponents; coaches without "manage opponents" can't edit; the
 * organization's owner (only) sets up custom fields; signed out, nothing.
 * Run from the repo root: PGURL=postgresql://postgres@localhost:5432/postgres node supabase/test/opp_rls_test.js
 */
const { Client } = require("pg");
const crypto = require("crypto"), fs = require("fs"), path = require("path");
const FX = require("./teams_fixture.js");
const BASE = process.env.PGURL || "postgresql://postgres@localhost:5432/postgres";
const DB = "pc_opp_rls_test";
let fails = 0, checks = 0;
const check = (ok, msg) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const dbUrl = (n) => { const u = new URL(BASE); u.pathname = "/" + n; return u.toString(); };

(async () => {
  const a = new Client({ connectionString: BASE }); await a.connect();
  await a.query(`drop database if exists ${DB}`); await a.query(`create database ${DB}`); await a.end();
  const su = new Client({ connectionString: dbUrl(DB) }); await su.connect();
  try {
    await su.query(fs.readFileSync(path.join(__dirname, "auth_stub.sql"), "utf8"));
    await su.query("alter default privileges in schema public grant all on functions to anon, authenticated, service_role");
    for (const f of fs.readdirSync(path.join(__dirname, "../migrations")).filter((x) => x.endsWith(".sql")).sort()) await su.query(fs.readFileSync(path.join(__dirname, "../migrations", f), "utf8"));
    const U = {};
    for (const n of ["head", "caller", "viewer", "player", "owner", "stranger", "xhead"]) { U[n] = crypto.randomUUID(); await su.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [U[n], n + "@x.org"]); }
    // the owner owns the organization but isn't on the team's staff; the head coach runs the team
    const org = (await FX.asUser(su, U.owner, "select public.pc_create_org('Tigers Org', 'college_d3') as id")).rows[0].id;
    const t = (await FX.asUser(su, U.owner, "select public.pc_create_team($1, 'Tigers', 'college_d3', 'America/New_York', null) as id", [org])).rows[0].id;
    await su.query("update public.organizations set billing_status = 'active' where id = $1", [org]); await su.query("update public.programs set status = 'active' where id = $1", [t]);
    await FX.addMember(su, t, U.head, "head"); await FX.addMember(su, t, U.caller, "caller"); await FX.addMember(su, t, U.viewer, "viewer"); await FX.addMember(su, t, U.player, "player", ["p1"]);
    const x = await FX.newTeam(su, U.xhead, "Rivals");
    const as = async (who, sql, params = []) => {
      try {
        if (who === "anon") { await su.query("begin"); await su.query("set local role anon"); const r = await su.query(sql, params); await su.query("commit"); return { rows: r.rows }; }
        return { rows: (await FX.asUser(su, U[who], sql, params)).rows };
      } catch (e) { if (who === "anon") await su.query("rollback").catch(() => {}); return { error: e.message }; }
    };
    const push = (who, tbl, rows) => as(who, "select public.pc_push($1, $2, $3::jsonb) as r", [t, tbl, JSON.stringify(rows)]).then((r) => (r.rows ? r.rows[0].r : r));
    const now = Date.now();
    const hitter = { id: "h1", createdAt: now, updatedAt: now, teamId: "opp1", name: "Slugger", number: "9", bats: "L", ratings: { power: 3, contact: "unknown" }, zone: { "1,1": "hot" },
      pitchFlags: { crushesFB: true }, smallBall: { steal: true }, notes: "sits fastball", classYear: "JR" };

    console.log("1. Writing scouting");
    check((await push("head", "teams", [{ id: "opp1", createdAt: now, updatedAt: now, name: "Rivals U", isOurs: false, tendencies: { aggressive: true } }])).applied === 1, "the head coach saves an opponent with its tendencies");
    check((await push("caller", "hitters", [hitter])).applied === 1, "a pitch caller (manage opponents) saves a hitter's ratings, grid, checkboxes and notes");
    const v = await push("viewer", "hitters", [{ ...hitter, updatedAt: now + 5, notes: "viewer edit" }]);
    check(v.applied === 0, `a viewer (no manage opponents) can't edit (${JSON.stringify(v.rejected || v.error || "")})`);
    const pl = await push("player", "hitters", [{ ...hitter, id: "h2", updatedAt: now + 6 }]);
    check(pl.applied === 0 || !!pl.error, "a player can't write one");
    // Nov 19, approved by Drew: the owner edits opponents off the staff (20261119003000_owner_opponents.sql); still not the roster
    check((await push("owner", "hitters", [{ ...hitter, updatedAt: now + 7, notes: "owner edit" }])).applied === 1, "the owner who isn't on the staff edits a hitter (the Nov 19 rule)");
    const ownRoster = await push("owner", "pitchers", [{ id: "pz", updatedAt: now + 8, name: "x" }]);
    check(!!ownRoster.error || ownRoster.applied === 0, "but still can't write the roster");

    console.log("2. Reading");
    const read = (who, tbl) => as(who, `select count(*)::int n from public.${tbl} where program_id = $1`, [t]).then((r) => (r.error ? "denied" : r.rows[0].n));
    check((await read("viewer", "hitters")) === 1 && (await read("viewer", "teams")) >= 1, "every coach reads the opponents, a viewer too");
    check((await read("player", "hitters")) === 0 && (await read("player", "teams")) === 0, "a player reads no opponents or hitters");
    check(["denied", 0].includes(await read("anon", "hitters")), "signed out: nothing");
    check((await read("xhead", "hitters")) === 0, "another team's coach: nothing");
    const pulled = (await as("player", "select public.pc_pull($1, 'hitters', 0, '', 500) as r", [t]));
    check(!!pulled.error || (pulled.rows[0].r.rows || []).length === 0, "nor through the sync function");

    console.log("3. Custom fields (the owner sets them up)");
    const save = (who, args) => as(who, "select public.pc_opp_field_save($1, $2, $3, $4, $5, $6::jsonb, $7, $8) as id", args);
    const f = await save("owner", [org, null, "hitter", "dropdown", "Class", JSON.stringify(["FR", "SO", "JR", "SR"]), 0, false]);
    check(!f.error && !!f.rows[0].id, "the owner adds a dropdown field");
    check(!!(await save("head", [org, null, "hitter", "text", "Agent", "[]", 1, false])).error, "the head coach can't add one");
    check(!!(await save("player", [org, null, "hitter", "text", "Agent", "[]", 1, false])).error, "nor a player");
    const fread = (who) => as(who, "select count(*)::int n from public.opp_fields").then((r) => (r.error ? "denied" : r.rows[0].n));
    check((await fread("viewer")) === 1 && (await fread("head")) === 1, "the team's coaches read the definitions");
    check((await fread("player")) === 0 && (await fread("xhead")) === 0 && ["denied", 0].includes(await fread("anon")), "players, other teams and signed out don't");
    const fid = f.rows[0].id;
    check(!(await save("owner", [org, fid, "team", "grid", "Class year", JSON.stringify(["FR", "SO"]), 2, true])).error, "the owner renames and archives it");
    const after = (await su.query("select scope, kind, label, archived_at from public.opp_fields where id = $1", [fid])).rows[0];
    check(after.scope === "hitter" && after.kind === "dropdown" && after.label === "Class year" && !!after.archived_at, "scope and kind never change; label and archive do");

    console.log("4. Suggestions and merges");
    const sid = (await su.query("insert into public.opp_suggestions (program_id, hitter_id, kind, key, value, text, n) values ($1, 'h1', 'zone', '3,3', 'cold', 'Mark down-away cold?', 3) returning id", [t])).rows[0].id;
    check((await read("viewer", "opp_suggestions")) === 1 && (await read("player", "opp_suggestions")) === 0, "coaches see suggestions; players don't");
    check(!!(await as("viewer", "select public.pc_opp_suggestion_decide($1, $2, true)", [t, sid])).error, "a viewer can't accept one");
    check(!!(await as("head", "insert into public.opp_suggestions (program_id, hitter_id, kind, key, value, text) values ($1, 'h1', 'zone', '1,1', 'hot', 'x')", [t])).error, "no client writes suggestions (the server makes them)");
    const d = await as("caller", "select public.pc_opp_suggestion_decide($1, $2, false) as r", [t, sid]);
    check(!d.error && d.rows[0].r.value === "cold", "a pitch caller dismisses it");
    check(!!(await as("head", "select public.pc_opp_suggestion_decide($1, $2, true)", [t, sid])).error, "a decided suggestion can't be decided again");
    check((await su.query("select decided_n from public.opp_suggestions where id = $1", [sid])).rows[0].decided_n === 3, "the evidence it was decided on is kept (it stays quiet until that grows)");
    check(!!(await as("viewer", "select public.pc_opp_merge_log($1, 'h1', 'h2')", [t])).error, "a viewer can't merge");
    check(!(await as("head", "select public.pc_opp_merge_log($1, 'h1', 'h2')", [t])).error && (await read("viewer", "opp_merges")) === 1, "the head coach merges; it's logged");
    check(!!(await as("anon", "select public.pc_opp_merge_log($1, 'h1', 'h2')", [t])).error && !!(await as("anon", "select public.pc_opp_suggestion_decide($1, $2, true)", [t, sid])).error, "signed out: no functions");
    void x;
  } finally { await su.end(); }
  console.log(`${checks - fails}/${checks} checks passed`);
  if (fails) { console.log(`${fails} opponent permission check(s) FAILED`); process.exit(1); }
  console.log("all opponent permission checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
