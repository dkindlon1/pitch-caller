/*
 * The spring waitlist (supabase/migrations/20261105180000_waitlist.sql) against a real local Postgres.
 * Run from the repo root: PGURL=postgresql://postgres@localhost:5432/postgres node supabase/test/waitlist_test.js
 */
const { Client } = require("pg");
const fs = require("fs"), path = require("path");
const BASE = process.env.PGURL || "postgresql://postgres@localhost:5432/postgres";
const DB = "pc_waitlist_test";
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const dbUrl = (name) => { const u = new URL(BASE); u.pathname = "/" + name; return u.toString(); };

(async () => {
  const admin = new Client({ connectionString: BASE }); await admin.connect();
  await admin.query(`drop database if exists ${DB}`); await admin.query(`create database ${DB}`); await admin.end();
  const su = new Client({ connectionString: dbUrl(DB) }); await su.connect();
  await su.query(fs.readFileSync(path.join(__dirname, "auth_stub.sql"), "utf8"));
  // Supabase grants every new table and function in public to the client roles, so the migration's revokes must work
  // against that, not against a bare Postgres where nothing is granted.
  await su.query(`grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;`);
  const dir = path.join(__dirname, "../migrations");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await su.query(fs.readFileSync(path.join(dir, f), "utf8"));

  const as = async (role, sql, args = []) => {
    try { await su.query("begin"); await su.query(`set local role ${role}`); const r = await su.query(sql, args); await su.query("commit"); return r; }
    catch (e) { await su.query("rollback"); return { error: e }; }
  };
  const join = async (email, role, level, ip) => (await as("service_role", "select public.pc_join_waitlist($1, $2, $3, $4) as r", [email, role, level, ip])).rows[0].r;
  const ipA = "a".repeat(64), ipB = "b".repeat(64);

  console.log("1. Sign-ups through the server key");
  check(await join("Coach@School.edu", "coach", "hs", ipA) === "ok", "a new sign-up is stored");
  check(await join("  coach@school.EDU ", "parent", null, ipA) === "duplicate", "the same email in other case and spaces is a duplicate");
  const row = (await su.query("select email, role, level from public.waitlist")).rows;
  check(row.length === 1 && row[0].email === "coach@school.edu" && row[0].role === "coach" && row[0].level === "hs", "stored lowercased, the first sign-up kept");
  check(await join("p@x.org", "player", "", ipB) === "ok" && (await su.query("select level from public.waitlist where email = 'p@x.org'")).rows[0].level === null, "an empty level is stored as none");

  console.log("2. Bad input never reaches the table");
  for (const [e, r, l, ip, why] of [["nope", "coach", null, ipA, "email without @"], ["a@b.co", "admin", null, ipA, "unknown role"],
    ["a@b.co", "coach", "mlb", ipA, "unknown level"], ["a@b.co", "coach", null, "short", "ip hash too short"], [null, "coach", null, ipA, "no email"]]) {
    check(await join(e, r, l, ip) === "invalid", `invalid: ${why}`);
  }
  check((await su.query("select count(*)::int as n from public.waitlist")).rows[0].n === 2, "still 2 rows");

  console.log("3. At most 5 new sign-ups per network per hour");
  for (let i = 2; i <= 5; i++) await join(`n${i}@x.org`, "coach", null, ipA);
  check(await join("n6@x.org", "coach", null, ipA) === "rate_limited", "the 6th new email from one network is refused");
  check(await join("coach@school.edu", "coach", null, ipA) === "duplicate", "a repeat sign-up still says duplicate while limited");
  check(await join("n6@x.org", "coach", null, ipB) === "ok", "another network is not affected");
  await su.query("update public.waitlist set created_at = now() - interval '61 minutes' where ip_hash = $1", [ipA]);
  check(await join("n7@x.org", "coach", null, ipA) === "ok", "an hour later the network can sign up again");

  console.log("4. No client role can touch it");
  for (const role of ["anon", "authenticated"]) {
    const call = await as(role, "select public.pc_join_waitlist('z@x.org', 'coach', null, $1)", [ipB]);
    check(call.error && /permission denied/.test(call.error.message), `${role} cannot call pc_join_waitlist`);
    const read = await as(role, "select * from public.waitlist");
    check(read.error && /permission denied/.test(read.error.message), `${role} cannot read the table`);
    const write = await as(role, "insert into public.waitlist (email, role, ip_hash) values ('z@x.org', 'coach', $1)", [ipB]);
    check(write.error && /permission denied/.test(write.error.message), `${role} cannot insert`);
  }
  const rls = (await su.query("select relrowsecurity from pg_class where oid = 'public.waitlist'::regclass")).rows[0].relrowsecurity;
  check(rls === true, "row level security is on");
  const cfg = (await su.query("select proconfig from pg_proc where proname = 'pc_join_waitlist'")).rows[0].proconfig;
  check(Array.isArray(cfg) && cfg.some((x) => x === 'search_path=""' || x === "search_path=''"), "the function pins an empty search_path");

  await su.end();
  const cleanup = new Client({ connectionString: BASE }); await cleanup.connect(); await cleanup.query(`drop database if exists ${DB}`); await cleanup.end();
  console.log(fails ? `\n${fails} waitlist check(s) FAILED` : "\nall waitlist checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
