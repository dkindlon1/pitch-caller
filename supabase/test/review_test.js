/*
 * Server regressions from the code review (2026-11-04), against a real local Postgres with the migration applied.
 * Run from the repo root: PGURL=postgres://postgres@localhost:55432/postgres node supabase/test/review_test.js
 * Each check was first run against the migration as committed before the review, where it failed.
 */
const { Client } = require("pg");
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const BASE = process.env.PGURL || "postgres://postgres@localhost:55432/postgres";
const DB = "pc_review_test";
const MIG = process.env.MIGRATION || path.join(__dirname, "../migrations/20261103000000_pitch_caller.sql");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const url = BASE.replace(/\/[^/]*$/, "/" + DB);

(async () => {
  const a = new Client({ connectionString: BASE }); await a.connect();
  await a.query(`drop database if exists ${DB}`); await a.query(`create database ${DB}`); await a.end();
  const su = new Client({ connectionString: url }); await su.connect();
  await su.query(fs.readFileSync(path.join(__dirname, "auth_stub.sql"), "utf8"));
  await su.query(fs.readFileSync(MIG, "utf8"));
  const U = {};
  for (const n of ["coach", "coach2", "charter", "pitcher", "stranger", "unconfirmed"]) {
    U[n] = crypto.randomUUID();
    await su.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, $3)", [U[n], n + "@x.org", n === "unconfirmed" ? null : new Date()]);
  }
  const conn = async () => { const c = new Client({ connectionString: url }); await c.connect(); return c; };
  const as = async (who, sql, params, keep) => {
    const c = keep || await conn();
    try { await c.query("begin"); await c.query("set local role authenticated"); await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U[who] })]);
      const r = await c.query(sql, params); await c.query("commit"); return r; }
    catch (e) { await c.query("rollback").catch(() => {}); return { error: e.message, code: e.code }; }
    finally { if (!keep) await c.end(); }
  };
  const one = async (who, sql, params) => { const r = await as(who, sql, params); return r.error ? r : r.rows[0] && r.rows[0].r; };
  const push = (who, p, tbl, rows) => one(who, "select public.pc_push($1, $2, $3::jsonb) r", [p, tbl, JSON.stringify(rows)]);
  const pull = (who, p, tbl, cur = { xid: 0, id: "" }) => one(who, "select public.pc_pull($1, $2, $3, $4, 500) r", [p, tbl, cur.xid, cur.id]);
  const p = (await one("coach", "select public.pc_create_program('RIT') r"));

  console.log("1. Staff join by invitation only");
  const inv = await as("coach", "select public.pc_invite($1, 'Stranger@X.org', 'head_coach')", [p]);
  const before = await one("stranger", "select coalesce(jsonb_agg(x), '[]') r from public.pc_my_programs() x");
  check(!inv.error && before.length === 0, "an invite adds nobody: the stranger isn't a member until he accepts");
  const seen = await one("stranger", "select coalesce(jsonb_agg(x), '[]') r from public.pc_my_invites() x");
  check(seen.length === 1 && seen[0].role === "head_coach" && seen[0].name === "RIT", "he sees the invitation (matched on his email, any case)");
  const ghost = await as("coach", "select public.pc_invite($1, 'nobody@x.org', 'charter')", [p]);
  check(!ghost.error, "inviting an email with no account answers the same way (no way to probe who's signed up)");
  await as("coach", "select public.pc_invite($1, 'unconfirmed@x.org', 'charter')", [p]);
  const unc = await as("unconfirmed", "select public.pc_accept_invite($1)", [p]);
  check(!!unc.error && /confirm/.test(unc.error), "an account whose email isn't confirmed can't accept");
  const declined = await as("stranger", "select public.pc_decline_invite($1)", [p]);
  check(!declined.error && (await one("stranger", "select coalesce(jsonb_agg(x), '[]') r from public.pc_my_invites() x")).length === 0, "declining removes the invite");
  const cantAccept = await as("stranger", "select public.pc_accept_invite($1)", [p]);
  check(!!cantAccept.error, "and with no invite there's nothing to accept");
  for (const [who, role, pit] of [["coach2", "head_coach", null], ["charter", "charter", null], ["pitcher", "pitcher", "pit1"]]) {
    await as("coach", "select public.pc_invite($1, $2, $3, $4)", [p, who + "@x.org", role, pit]);
    await as(who, "select public.pc_accept_invite($1)", [p]);
  }
  const roles = (await su.query("select u.email, m.role from public.members m join auth.users u on u.id = m.user_id where program_id = $1 order by 1", [p])).rows.map((r) => `${r.email.split("@")[0]}:${r.role}`).join(" ");
  check(roles === "charter:charter coach2:head_coach coach:head_coach pitcher:pitcher", `accepted invites made them members (${roles})`);
  const chInv = await as("charter", "select public.pc_invite($1, 'stranger@x.org', 'head_coach')", [p]);
  check(!!chInv.error, "a charter can't invite anyone");

  console.log("2. Members and staff list");
  const pm = await one("pitcher", "select count(*)::int r from public.members where program_id = $1", [p]);
  check(pm === 1, `a pitcher sees only his own membership (${pm} row)`);
  const staff = await as("coach", "select * from public.pc_staff($1)", [p]);
  check(staff.rows && staff.rows.length >= 5 && staff.rows.some((r) => r.pending && r.email === "nobody@x.org"), "the head coach's staff list has members and pending invites");
  check(!!(await as("charter", "select * from public.pc_staff($1)", [p])).error, "a charter can't read the staff list");

  console.log("3. No writing around pc_push");
  await push("coach", p, "teams", [{ id: "t1", name: "Real", updatedAt: 5000 }]);
  const upd = await as("charter", `update public.teams set doc = '{"id":"t1","name":"rolled back","updatedAt":1}' where program_id = $1 and id = 't1'`, [p]);
  const ins = await as("charter", `insert into public.teams (program_id, id, doc) values ($1, 't9', '{"id":"t9","updatedAt":1}')`, [p]);
  const t1 = (await su.query("select doc->>'name' n from public.teams where id = 't1'")).rows[0].n;
  check(!!upd.error && !!ins.error && t1 === "Real", `direct UPDATE and INSERT through the API are refused (name still "${t1}")`);

  console.log("4. A refused caller learns nothing about a record he can't read");
  await push("coach", p, "checkins", [{ id: "c1", pitcherId: "pit2", updatedAt: 1700 }]);
  const lo = await push("pitcher", p, "checkins", [{ id: "c1", pitcherId: "pit1", updatedAt: 1 }]);
  const hi = await push("pitcher", p, "checkins", [{ id: "c1", pitcherId: "pit1", updatedAt: 99999 }]);
  check(JSON.stringify(lo) === JSON.stringify(hi) && lo.rejected[0].reason === "not allowed" && !lo.rejected[0].doc,
    `older and newer probes get the same answer, with no copy of the record (${JSON.stringify(lo.rejected)})`);

  console.log("5. One bad record never fails the batch");
  const randId = crypto.randomBytes(3000).toString("hex");
  const mixed = await push("coach", p, "teams", [{ id: "ok1", updatedAt: 10 }, { id: randId, updatedAt: 10 }, { id: "frac", updatedAt: 1.5 }, { id: "str", updatedAt: "9" },
    { id: "del", updatedAt: 3, deletedAt: "soon" }, { id: "fut", updatedAt: Date.now() + 365 * 864e5 }, { name: "no id", updatedAt: 1 }, "not an object", { id: "ok2", updatedAt: 11 }]);
  check(!mixed.error && mixed.applied === 2 && mixed.rejected.length === 7, `good rows go in, each bad one is refused with a reason (${mixed.error || `applied ${mixed.applied}, rejected ${mixed.rejected && mixed.rejected.map((x) => x.reason).join("; ")}`})`);
  check(mixed.rejected && mixed.rejected.some((x) => /clock/.test(x.reason)), "a record stamped a year ahead is refused as a broken clock");

  console.log("6. What wasn't applied comes back with the server's copy");
  const sk = await push("coach", p, "teams", [{ id: "t1", name: "stale edit", updatedAt: 4000 }]);
  check(sk.skipped === 1 && sk.server[0].doc.name === "Real", "an older record: skipped, and the server's newer copy comes back");
  await push("coach", p, "pitchers", [{ id: "pit1", name: "Ace", updatedAt: 100 }]);
  const ref = await push("charter", p, "pitchers", [{ id: "pit1", name: "charter's edit", updatedAt: 200 }]);
  check(ref.rejected[0].reason === "not allowed" && ref.rejected[0].doc && ref.rejected[0].doc.name === "Ace", "a charter's refused pitcher edit comes back with the server's copy, so his iPad can take it");

  console.log("7. Pull signals");
  const pc0 = await pull("pitcher", p, "checkins");
  check(pc0.access === "pitcher:pit1" && pc0.reset === false, `the pull says who's asking (${pc0.access})`);
  await as("coach", "select public.pc_set_role($1, $2, 'charter')", [p, U.pitcher]);
  const pc1 = await pull("pitcher", p, "checkins", pc0.next);
  check(pc1.access === "charter:" && pc1.access !== pc0.access, "promoted to charter: the access changes, which tells the iPad to start its cursors over");
  const fromZero = await pull("pitcher", p, "checkins");
  check(fromZero.rows.some((r) => r.id === "c1"), "and from the start he gets the check-in he couldn't see before");
  await as("coach", "select public.pc_set_role($1, $2, 'pitcher', 'pit1')", [p, U.pitcher]);
  const fut = await pull("coach", p, "teams", { xid: 9e15, id: "" });
  check(fut.reset === true, "a cursor from the future (a restored database) is told to start over");
  const hold = new Client({ connectionString: BASE }); await hold.connect(); await hold.query("begin"); await hold.query("select pg_current_xact_id()");
  await push("coach", p, "games", [{ id: "g1", updatedAt: 1 }]);
  const held = await pull("coach", p, "games");
  await hold.query("rollback"); await hold.end();
  const after = await pull("coach", p, "games");
  check(held.rows.length === 0 && held.held === true && after.held === false && after.rows.length === 1, "while another transaction is open, the pull says rows are held back; then they come");

  console.log("8. Head coaches, removing staff");
  const c1 = await conn(), c2 = await conn();
  await c1.query("begin"); await c1.query("set local role authenticated"); await c1.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.coach })]);
  await c2.query("begin"); await c2.query("set local role authenticated"); await c2.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.coach2 })]);
  await c1.query("select public.pc_set_role($1, $2, 'charter')", [p, U.coach]);
  const second = c2.query("select public.pc_set_role($1, $2, 'charter')", [p, U.coach2]).then(() => null, (e) => e.message);
  await new Promise((r) => setTimeout(r, 300)); await c1.query("commit");
  const err2 = await second; if (err2) await c2.query("rollback"); else await c2.query("commit");
  await c1.end(); await c2.end();
  const hc = (await su.query("select count(*)::int n from public.members where program_id = $1 and role = 'head_coach'", [p])).rows[0].n;
  check(hc === 1 && /at least one head coach/.test(err2 || ""), `two head coaches stepping down at once leave one (${hc} left)`);
  const boss = hc ? (await su.query("select u.email from public.members m join auth.users u on u.id = m.user_id where program_id = $1 and role = 'head_coach'", [p])).rows[0].email.split("@")[0] : "coach";
  await as(boss, "select public.pc_remove_member($1, $2)", [p, U.charter]);
  const gone = await pull("charter", p, "teams");
  check(!!gone.error, "a removed charter can't pull anything from then on");
  check(!!(await as(boss, "select public.pc_remove_member($1, $2)", [p, U[boss]])).error, "the last head coach can't remove himself");

  console.log("9. A pitcher's pull doesn't scan the program");
  await su.query(`insert into public.events (program_id, id, doc) select $1, 'e'||g, jsonb_build_object('id','e'||g,'updatedAt',1,'pitcherId','pit2') from generate_series(1, 100000) g`, [p]);
  await su.query("analyze public.events");
  let t = Date.now(); const pe = await pull("pitcher", p, "events"); const tp = Date.now() - t;
  t = Date.now(); await pull("pitcher", p, "checkins"); const tc = Date.now() - t;
  t = Date.now(); const ce = await pull(boss, p, "events"); const tcoach = Date.now() - t;
  check(pe.rows.length === 0 && tp < 300 && tc < 300, `events he can't see: ${tp} ms; his check-ins among 100k events: ${tc} ms (was 5.6 s)`);
  check(ce.rows.length === 500 && tcoach < 1000, `a coach's first page of 100k: ${tcoach} ms`);

  console.log("10. After a restore into a new project");
  await su.query("alter table public.teams disable trigger pc_stamp; update public.teams set sync_xid = 9000000000000; alter table public.teams enable trigger pc_stamp");
  const lost = await pull(boss, p, "teams");
  await su.query("select public.pc_restamp()");
  const back = await pull(boss, p, "teams");
  check(lost.rows.length === 0 && lost.held === true && back.rows.length >= 3, `rows stamped by the old cluster show as held (${lost.rows.length} rows), and pc_restamp brings them back (${back.rows.length})`);

  await su.end();
  console.log(fails ? `\n${fails} review check(s) FAILED` : "\nall review checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
