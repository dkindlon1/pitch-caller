/*
 * Build 3, at the database: the outcome tracking tables (20261119010000_outcome_tracking.sql). The report job writes
 * them with the service key; the team's coaches read them; a player (whose outcome tracking comes from his own pitches
 * through pc_my_report), another team's coach and signed-out visitors read nothing; nobody signed in can write.
 * Run from the repo root: PGURL=postgresql://postgres@localhost:5432/postgres node supabase/test/outcome_rls_test.js
 */
const { Client } = require("pg");
const crypto = require("crypto"), fs = require("fs"), path = require("path");
const FX = require("./teams_fixture.js");
const BASE = process.env.PGURL || "postgresql://postgres@localhost:5432/postgres";
const DB = "pc_outcome_rls_test";
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
    for (const n of ["head", "viewer", "player", "xhead"]) { U[n] = crypto.randomUUID(); await su.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [U[n], n + "@x.org"]); }
    const t = await FX.newTeam(su, U.head, "Tigers");
    await FX.addMember(su, t, U.viewer, "viewer"); await FX.addMember(su, t, U.player, "player", ["p1"]);
    await FX.newTeam(su, U.xhead, "Rivals");
    const as = async (who, sql, params = []) => {
      try {
        if (who === "anon" || who === "service") { await su.query("begin"); await su.query(`set local role ${who === "anon" ? "anon" : "service_role"}`); const r = await su.query(sql, params); await su.query("commit"); return { rows: r.rows }; }
        return { rows: (await FX.asUser(su, U[who], sql, params)).rows };
      } catch (e) { await su.query("rollback").catch(() => {}); return { error: e.message }; }
    };
    const data = JSON.stringify({ findings: { tested: 3, shown: [] }, drift: [{ text: "His slider isn't missing bats like usual" }] });
    console.log("1. The report job (service key) writes");
    { const r = await as("service", "insert into public.outcome_findings (program_id, game_id, pitcher_id, data) values ($1, 'g1', 'p1', $2::jsonb)", [t, data]); check(!r.error, `service writes an outing's findings${r.error ? ": " + r.error : ""}`); }
    check(!(await as("service", "insert into public.peak_baselines (program_id, pitcher_id, data) values ($1, 'p1', '{}'::jsonb)", [t])).error, "service writes a baseline");
    console.log("2. Who reads");
    for (const [who, want, why] of [["head", 1, "the head coach reads them"], ["viewer", 1, "a viewer on the staff reads them"], ["player", 0, "a player reads none (his comes from his own pitches; these carry staff drift notes)"], ["xhead", 0, "another team's coach reads none"]]) {
      const r1 = await as(who, "select count(*)::int n from public.outcome_findings"), r2 = await as(who, "select count(*)::int n from public.peak_baselines");
      check(r1.rows && r1.rows[0].n === want && r2.rows && r2.rows[0].n === want, `${why} (${r1.rows ? r1.rows[0].n : r1.error} / ${r2.rows ? r2.rows[0].n : r2.error})`);
    }
    const an = await as("anon", "select count(*) from public.outcome_findings");
    check(!!an.error, `signed out: refused (${(an.error || "").slice(0, 50)})`);
    console.log("3. Nobody signed in writes");
    for (const who of ["head", "player"]) {
      const w = await as(who, "insert into public.outcome_findings (program_id, game_id, pitcher_id, data) values ($1, 'g2', 'p1', '{}'::jsonb)", [t]);
      const u = await as(who, "update public.outcome_findings set data = '{}'::jsonb returning 1");
      const d = await as(who, "delete from public.peak_baselines returning 1");
      check(!!w.error && (!!u.error || !u.rows.length) && (!!d.error || !d.rows.length), `${who}: insert, update and delete refused`);
    }
  } finally { await su.end(); const b = new Client({ connectionString: BASE }); await b.connect(); await b.query(`drop database if exists ${DB}`); await b.end(); }
  console.log(`${checks - fails} ok, ${fails} FAIL`); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
