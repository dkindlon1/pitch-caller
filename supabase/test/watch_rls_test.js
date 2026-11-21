/*
 * Build 4, at the database: the team's watch list (20261119020000_watch_security.sql). A coach who calls games
 * registers a paired watch; every coach on the team sees the list; the head coach (manage roster) or the organization's
 * owner removes one; a removed watch can't be put back by a caller; players, other teams and signed-out visitors see
 * nothing; nobody writes the table directly.
 * Run from the repo root: PGURL=postgresql://postgres@localhost:5432/postgres node supabase/test/watch_rls_test.js
 */
const { Client } = require("pg");
const crypto = require("crypto"), fs = require("fs"), path = require("path");
const FX = require("./teams_fixture.js");
const BASE = process.env.PGURL || "postgresql://postgres@localhost:5432/postgres";
const DB = "pc_watch_rls_test";
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
    for (const n of ["head", "caller", "viewer", "player", "xhead"]) { U[n] = crypto.randomUUID(); await su.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [U[n], n + "@x.org"]); }
    const t = await FX.newTeam(su, U.head, "Tigers");
    await FX.addMember(su, t, U.caller, "caller"); await FX.addMember(su, t, U.viewer, "viewer"); await FX.addMember(su, t, U.player, "player", ["p1"]);
    await FX.newTeam(su, U.xhead, "Rivals");
    const as = async (who, sql, params = []) => {
      try {
        if (who === "anon") { await su.query("begin"); await su.query("set local role anon"); const r = await su.query(sql, params); await su.query("commit"); return { rows: r.rows }; }
        return { rows: (await FX.asUser(su, U[who], sql, params)).rows };
      } catch (e) { await su.query("rollback").catch(() => {}); return { error: e.message }; }
    };
    const reg = (who, id, role = "pitcher") => as(who, "select public.pc_watch_register($1, $2, $3, $4) r", [t, id, "Bangle.js " + id.slice(-4), role]);
    const list = async (who) => { const r = await as(who, "select watch_id, role, removed_at is not null removed from public.team_watches order by watch_id"); return r.rows || r.error; };

    console.log("1. Registering");
    let r = await reg("caller", "dev-aaaa");
    check(r.rows && r.rows[0].r.ok === true, "a pitch caller registers a paired watch as the pitcher's");
    r = await reg("caller", "dev-bbbb", "catcher");
    check(r.rows && r.rows[0].r.ok === true, "and a second as the catcher's");
    r = await reg("viewer", "dev-cccc");
    check(!!r.error, `a viewer (doesn't call games) can't register one (${(r.error || "").slice(0, 30)})`);
    r = await reg("player", "dev-cccc");
    check(!!r.error, "a player can't");
    r = await reg("xhead", "dev-cccc");
    check(!!r.error, "another team's head coach can't");
    r = await as("caller", "select public.pc_watch_register($1, $2, $3, $4) r", [t, "dev-dddd", "x", "umpire"]);
    check(!!r.error, "a role other than pitcher / catcher is refused");
    r = await reg("caller", "dev-bbbb", "pitcher");
    check(r.rows && r.rows[0].r.ok === true && JSON.stringify(await list("head")).includes('"watch_id":"dev-bbbb","role":"pitcher"'), "registering again changes its role");

    console.log("2. Who sees the list");
    for (const [who, n, why] of [["head", 2, "the head coach"], ["caller", 2, "a pitch caller"], ["viewer", 2, "a viewer on the staff"], ["player", 0, "a player sees none"], ["xhead", 0, "another team's coach sees none"]]) {
      const l = await list(who); check(Array.isArray(l) && l.length === n, `${why} (${Array.isArray(l) ? l.length : l})`);
    }
    const an = await as("anon", "select count(*) from public.team_watches");
    check(!!an.error, "signed out: refused");

    console.log("3. Removing");
    r = await as("caller", "select public.pc_watch_remove($1, $2) r", [t, "dev-aaaa"]);
    check(!!r.error, "a pitch caller can't remove a watch");
    r = await as("head", "select public.pc_watch_remove($1, $2) r", [t, "dev-aaaa"]);
    check(r.rows && r.rows[0].r.ok === true && (await list("head")).find((w) => w.watch_id === "dev-aaaa").removed === true, "the head coach removes it (kept, marked removed)");
    r = await reg("caller", "dev-aaaa");
    check(r.rows && r.rows[0].r.ok === false && r.rows[0].r.removed === true && (await list("head")).find((w) => w.watch_id === "dev-aaaa").removed === true, "a pitch caller can't put a removed watch back");
    // review fixes (Nov 19): the game app registers every watch it links to on its own; a head coach's laptop that hadn't
    // heard of the removal yet must not undo it. Only a deliberate re-add (after pairing it again) does
    r = await reg("head", "dev-aaaa");
    check(r.rows && r.rows[0].r.ok === false && r.rows[0].r.removed === true && (await list("head")).find((w) => w.watch_id === "dev-aaaa").removed === true,
      `the head coach's game app linking to it on its own (a stale laptop): still removed, no key (${r.error || JSON.stringify(r.rows[0].r)})`);
    r = await as("caller", "select public.pc_watch_register($1, $2, $3, $4, true) r", [t, "dev-aaaa", "Bangle.js aaaa", "pitcher"]);
    check((!!r.error || r.rows[0].r.ok === false) && (await list("head")).find((w) => w.watch_id === "dev-aaaa").removed === true, "a pitch caller can't re-add it even deliberately");
    r = await as("head", "select public.pc_watch_register($1, $2, $3, $4, true) r", [t, "dev-aaaa", "Bangle.js aaaa", "pitcher"]);
    check(r.rows && r.rows[0].r.ok === true && (await list("head")).find((w) => w.watch_id === "dev-aaaa").removed === false, "the head coach re-adds it deliberately, after pairing it again");

    console.log("4. Nobody writes the table directly");
    for (const who of ["head", "caller"]) {
      const w = await as(who, "insert into public.team_watches (program_id, watch_id, name, role) values ($1, 'x', 'x', 'pitcher')", [t]);
      const u = await as(who, "update public.team_watches set removed_at = null returning 1");
      const d = await as(who, "delete from public.team_watches returning 1");
      check(!!w.error && (!!u.error || !u.rows.length) && (!!d.error || !d.rows.length), `${who}: insert, update and delete refused`);
    }
  } finally { await su.end(); const b = new Client({ connectionString: BASE }); await b.connect(); await b.query(`drop database if exists ${DB}`); await b.end(); }
  console.log(`${checks - fails} ok, ${fails} FAIL`); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
