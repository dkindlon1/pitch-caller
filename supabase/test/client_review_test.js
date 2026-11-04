/*
 * Sync client regressions from the code review (2026-11-04): app/db.js and app/sync.js on fake IndexedDB, against a
 * real local Postgres with the migration applied. Run from the repo root:
 *   PGURL=postgres://postgres@localhost:55432/postgres node supabase/test/client_review_test.js
 * Each check was first run against the client as committed before the review, where it failed.
 */
require("fake-indexeddb/auto");
const { Client } = require("pg");
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const APP = process.env.APPDIR || path.join(__dirname, "../../app");   // APPDIR: run against another copy (the pre-review one)
const PCDB = require(path.join(APP, "db.js"));
const PCSync = require(path.join(APP, "sync.js"));
const BASE = process.env.PGURL || "postgres://postgres@localhost:55432/postgres";
const DBNAME = "pc_client_review";
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const url = BASE.replace(/\/[^/]*$/, "/" + DBNAME);
const MIN = 60e3;

(async () => {
  const a = new Client({ connectionString: BASE }); await a.connect();
  await a.query(`drop database if exists ${DBNAME}`); await a.query(`create database ${DBNAME}`); await a.end();
  const su = new Client({ connectionString: url }); await su.connect();
  await su.query(fs.readFileSync(path.join(__dirname, "auth_stub.sql"), "utf8"));
  await su.query(fs.readFileSync(path.join(__dirname, "../migrations/20261103000000_pitch_caller.sql"), "utf8"));
  const U = {};
  for (const n of ["coach", "charter", "pitcher"]) { U[n] = crypto.randomUUID(); await su.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [U[n], n + "@x.org"]); }
  const c = new Client({ connectionString: url }); await c.connect();
  let queue = Promise.resolve();
  const as = (who, text, params) => { const run = queue.then(async () => {
    await c.query("begin");
    try { await c.query("set local role authenticated"); await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U[who] })]);
      const r = await c.query(text, params); await c.query("commit"); return r; } catch (e) { await c.query("rollback"); throw e; }
  }); queue = run.catch(() => {}); return run; };
  const r1 = async (who, text, params) => (await as(who, text, params)).rows[0].r;
  const P = await r1("coach", "select public.pc_create_program('RIT') r");
  const P2 = await r1("coach", "select public.pc_create_program('Summer ball') r");
  for (const [who, role, pit] of [["charter", "charter", null], ["pitcher", "pitcher", "pit1"]]) {
    await as("coach", "select public.pc_invite($1, $2, $3, $4)", [P, who + "@x.org", role, pit]); await as(who, "select public.pc_accept_invite($1)", [P]);
  }
  // the transport the app uses talks to /rest/v1/rpc/pc_push and pc_pull; this one calls the same functions directly
  const transport = (who, p) => ({
    push: (t, rows) => r1(who, "select public.pc_push($1, $2, $3::jsonb) r", [p, t, JSON.stringify(rows)]).catch((e) => { const err = new Error(e.message); err.status = 400; throw err; }),
    pull: (t, cur) => r1(who, "select public.pc_pull($1, $2, $3, $4, 500) r", [p, t, cur.xid || 0, cur.id || ""]),
  });
  let n = 0;
  const device = async (clockSkew = 0) => {
    const name = "dev" + n++;
    const D = await PCDB.open({ name, now: () => Date.now() + clockSkew });
    return { D, name, sync: (who, p) => PCSync.createSync({ db: D, transport: transport(who, p), programId: p, now: () => Date.now() + clockSkew }) };
  };
  const server = async (tbl, id) => { const r = (await su.query(`select doc from public.${tbl} where id = $1`, [id])).rows[0]; return r && r.doc; };

  // a wrong clock on one iPad: Date.now itself is shifted while it works (the pre-review db.js reads Date.now directly)
  const realNow = Date.now;
  const skewed = async (ms, fn) => { Date.now = () => realNow() + ms; try { return await fn(); } finally { Date.now = realNow; } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  console.log("1. An iPad whose clock runs fast doesn't make later edits elsewhere lose");
  {
    const fast = await device(), right = await device();
    const t = await skewed(10 * MIN, async () => { const t = await fast.D.put("teams", { name: "Rivals", isOurs: false }); await fast.sync("coach", P).syncNow(); return t; });
    await right.sync("coach", P).syncNow();
    const mine = await right.D.get("teams", t.id); mine.name = "Rivals (renamed later)"; await right.D.put("teams", mine);
    await right.sync("coach", P).syncNow();
    await skewed(10 * MIN, () => fast.sync("coach", P).syncNow());
    const s = await server("teams", t.id), r = await right.D.get("teams", t.id), f = await fast.D.get("teams", t.id);
    check(s.name === "Rivals (renamed later)" && r.name === s.name && f.name === s.name, `the later edit wins everywhere (server "${s.name}", this iPad "${r.name}", the fast one "${f.name}")`);
  }

  console.log("2. A record the server didn't take because its copy is newer: the server's copy replaces this one");
  {
    // A's clock is 10 minutes fast, so the server's copy is stamped ahead of anything B writes in those 10 minutes. B's
    // edit is written as the pre-review app wrote it (stamped with B's own clock, not after the version it came from).
    const A = await device(), B = await device();
    const t = await skewed(10 * MIN, async () => { const t = await A.D.put("teams", { name: "A's version", isOurs: false }); await A.sync("coach", P).syncNow(); return t; });
    await B.sync("coach", P).syncNow();
    const stale = Object.assign({}, await B.D.get("teams", t.id), { name: "B's edit, stamped behind", updatedAt: Date.now() });
    delete stale._pulled;
    const tx = B.D.raw.transaction("teams", "readwrite"); tx.objectStore("teams").put(stale); await new Promise((r) => (tx.oncomplete = r));
    const r = await B.sync("coach", P).syncNow();
    const bb = await B.D.get("teams", t.id), sv = await server("teams", t.id);
    check(r.push.skipped === 1 && bb.name === sv.name, `the server skipped it and B now has the server's copy ("${bb.name}"), not a copy only B has`);
  }

  console.log("3. A change refused for one account isn't written off");
  {
    const D = await device();
    await D.sync("coach", P).syncNow();
    const pit = await D.D.put("pitchers", { id: "pit1", name: "Ace", pitches: [] });
    await D.sync("coach", P).syncNow();
    await sleep(15);
    const p = await D.D.get("pitchers", "pit1"); p.name = "Ace (regraded offline)"; await D.D.put("pitchers", p);
    await sleep(15);                                                     // so the charter's sync starts a moment after the edit
    const asCharter = await D.sync("charter", P).syncNow();
    check(asCharter.push.rejected.length === 1, "a charter signed in on the same iPad: the coach's pitcher edit is refused for him");
    const back = await D.sync("coach", P).syncNow();
    const s = await server("pitchers", "pit1");
    check(s.name === "Ace (regraded offline)", `when the coach syncs again it goes up (server "${s.name}", pushed ${back.push.applied})`);
  }

  console.log("4. Records restored from a backup after the iPad synced still go up");
  {
    const D = await device();
    await D.D.put("teams", { name: "Synced", isOurs: false }); await D.sync("coach", P).syncNow();
    const old = { id: "tea_from_backup", name: "From an old backup", isOurs: false, createdAt: 1, updatedAt: 1000 };
    await D.D.importAll({ app: "pitch-caller", schema: PCDB.VERSION, stores: { teams: [old] } });
    await D.sync("coach", P).syncNow();
    check(!!(await server("teams", "tea_from_backup")), "the restored team is on the server");
  }

  console.log("5. One bad character doesn't stop the iPad syncing");
  {
    const D = await device();
    await D.D.put("teams", { name: "Good", isOurs: false });
    const bad = await D.D.put("hitters", { name: "Broken \u0000 name \ud83d", teamId: "x" });
    let err = null, r = null; try { r = await D.sync("coach", P).syncNow(); } catch (e) { err = e.message; }
    const s = await server("hitters", bad.id);
    check(!err && !!s, `the sync goes through and the record goes up cleaned (${err || JSON.stringify(s && s.name)})`);
  }

  console.log("6. A batch the server can't take whole is split, and the good records still go");
  {
    const D = await device();
    const good = await D.D.put("teams", { name: "Good", isOurs: false });
    await D.D.raw.transaction("teams", "readwrite").objectStore("teams").put({ id: "x".repeat(10) + crypto.randomBytes(1600).toString("hex"), name: "huge id", updatedAt: Date.now() });
    let err = null, r = null; try { r = await D.sync("coach", P).syncNow(); } catch (e) { err = e.message; }
    check(!err && !!(await server("teams", good.id)) && r.push.rejected.length === 1, `good records went up, the bad one is reported (${err || `${r.push.rejected.length} refused`})`);
  }

  console.log("7. A role change brings what was hidden");
  {
    const D = await device();
    // someone else's check-in, then one of his own after it: his cursor moves past the one he can't see
    await as("coach", "select public.pc_push($1, 'checkins', $2::jsonb)", [P, JSON.stringify([{ id: "ci_other", pitcherId: "pit2", updatedAt: 5 }])]);
    await as("coach", "select public.pc_push($1, 'checkins', $2::jsonb)", [P, JSON.stringify([{ id: "ci_mine", pitcherId: "pit1", updatedAt: 6 }])]);
    await D.sync("pitcher", P).syncNow();
    check(!!(await D.D.get("checkins", "ci_mine")), "(the setup: he has his own check-in)");
    const hidden = await D.D.get("checkins", "ci_other");
    await as("coach", "select public.pc_set_role($1, $2, 'charter')", [P, U.pitcher]);
    await D.sync("pitcher", P).syncNow();
    const now = await D.D.get("checkins", "ci_other");
    check(!hidden && !!now, `promoted to charter, his iPad gets the check-in it couldn't see before (${!!now})`);
    await as("coach", "select public.pc_set_role($1, $2, 'pitcher', 'pit1')", [P, U.pitcher]);
  }

  console.log("8. One iPad holds one program");
  {
    const D = await device();
    await D.D.put("pitchers", { id: "pit_rit", name: "RIT ace", pitches: [] });
    await D.sync("coach", P).syncNow();
    let err = null; try { await D.sync("coach", P2).syncNow(); } catch (e) { err = e.message; }
    check(!!err && !(await server("pitchers", "pit_rit").then((x) => x && x.id === "pit_rit" ? (su.query("select program_id from public.pitchers where id = 'pit_rit'").then((r) => r.rows.some((y) => y.program_id === P2))) : false)),
      `syncing it with another program is refused, and nothing of RIT's goes there (${err})`);
  }

  console.log("9. Rows held back by an unfinished transaction are reported");
  {
    const D = await device();
    const hold = new Client({ connectionString: BASE }); await hold.connect(); await hold.query("begin"); await hold.query("select pg_current_xact_id()");
    await as("coach", "select public.pc_push($1, 'games', $2::jsonb)", [P, JSON.stringify([{ id: "g_held", updatedAt: 9 }])]);
    const r = await D.sync("coach", P).syncNow();
    await hold.query("rollback"); await hold.end();
    check(r.pull.held === true, "the sync says some rows are still on their way");
  }

  await c.end(); await su.end();
  console.log(fails ? `\n${fails} client check(s) FAILED` : "\nall client checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
