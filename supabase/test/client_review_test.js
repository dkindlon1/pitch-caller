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
const FX = require("./teams_fixture.js");
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
  await FX.applyAll(su);
  const U = {};
  for (const n of ["coach", "charter", "pitcher", "pitcher2"]) { U[n] = crypto.randomUUID(); await su.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [U[n], n + "@x.org"]); }
  const c = new Client({ connectionString: url }); await c.connect();
  let queue = Promise.resolve();
  const as = (who, text, params) => { const run = queue.then(async () => {
    await c.query("begin");
    try { await c.query("set local role authenticated"); await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U[who] })]);
      const r = await c.query(text, params); await c.query("commit"); return r; } catch (e) { await c.query("rollback"); throw e; }
  }); queue = run.catch(() => {}); return run; };
  const r1 = async (who, text, params) => (await as(who, text, params)).rows[0].r;
  const P = await FX.newTeam(su, U.coach, "RIT");
  const P2 = await FX.newTeam(su, U.coach, "Summer ball");
  await FX.addMember(su, P, U.charter, "caller");
  await FX.addMember(su, P, U.pitcher, "player", ["pit1"]);
  await FX.addMember(su, P, U.pitcher2, "player", ["pit3"]);
  // the transport the app uses talks to /rest/v1/rpc/pc_push and pc_pull; this one calls the same functions directly
  const transport = (who, p) => ({
    push: (t, rows) => r1(who, "select public.pc_push($1, $2, $3::jsonb) r", [p, t, JSON.stringify(rows)]).catch((e) => { const err = new Error(e.message); err.status = 400; throw err; }),
    pull: (t, cur) => r1(who, "select public.pc_pull($1, $2, $3, $4, 500) r", [p, t, cur.xid || 0, cur.id || ""]),
  });
  let n = 0;
  const device = async (clockSkew = 0) => {
    const name = "dev" + n++;
    const D = await PCDB.open({ name, now: () => Date.now() + clockSkew });
    return { D, name, sync: (who, p, signedIn) => PCSync.createSync({ db: D, transport: transport(who, p), programId: p, now: () => Date.now() + clockSkew,
      userId: signedIn ? U[who] : null, userEmail: signedIn ? who + "@x.org" : null }) };
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
    // A's clock is 90 seconds fast (inside the 2 minutes the server lets through unclamped), so the server's copy is
    // stamped ahead of anything B writes in those 90 seconds. B's edit is written as the pre-review app wrote it
    // (stamped with B's own clock, not after the version it came from).
    const A = await device(), B = await device();
    const t = await skewed(90 * 1000, async () => { const t = await A.D.put("teams", { name: "A's version", isOurs: false }); await A.sync("coach", P).syncNow(); return t; });
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

  console.log("7. A change in what he may see brings what was hidden");
  {
    const D = await device();
    // someone else's check-in, then one of his own after it: his cursor moves past the one he can't see
    await as("coach", "select public.pc_push($1, 'checkins', $2::jsonb)", [P, JSON.stringify([{ id: "ci_other", pitcherId: "pit2", updatedAt: 5 }])]);
    await as("coach", "select public.pc_push($1, 'checkins', $2::jsonb)", [P, JSON.stringify([{ id: "ci_mine", pitcherId: "pit1", updatedAt: 6 }])]);
    await D.sync("pitcher", P).syncNow();
    check(!!(await D.D.get("checkins", "ci_mine")), "(the setup: he has his own check-in)");
    const hidden = await D.D.get("checkins", "ci_other");
    await su.query("insert into public.player_links (program_id, user_id, pitcher_id) values ($1, $2, 'pit2')", [P, U.pitcher]);
    await D.sync("pitcher", P).syncNow();
    const now = await D.D.get("checkins", "ci_other");
    check(!hidden && !!now, `linked to a second pitcher record, his iPad gets the check-in it couldn't see before (${!!now})`);
    await su.query("delete from public.player_links where program_id = $1 and pitcher_id = 'pit2'", [P]);
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

  console.log("10. A removed coach's iPad keeps what it couldn't send");
  {
    const D = await device();
    await D.sync("charter", P, true).syncNow();
    await D.D.putMany("events", Array.from({ length: 5 }, (_, i) => ({ gameId: "g_rm", pitcherId: "pit1", type: "pitch", n: i + 1, seq: i + 1 })));
    await as("coach", "select public.pc_remove_member($1, $2)", [P, U.charter]);
    let err = null; try { await D.sync("charter", P, true).syncNow(); } catch (e) { err = e.message; }
    const left = (await D.D.byIndex("events", "gameId", "g_rm")).length;
    check(!!err && /not a member/.test(err) && left === 5 && (await D.sync("charter", P, true).pending()).events === 5, `the server refuses him and all 5 pitches stay on the iPad, still waiting (${left})`);
    await FX.addMember(su, P, U.charter, "caller");
  }

  console.log("11. A locked team keeps the work and sends it once it's paid up");
  {
    const D = await device();
    await D.sync("coach", P, true).syncNow();
    const org = (await su.query("select org_id from public.programs where id = $1", [P])).rows[0].org_id;
    await su.query("update public.organizations set billing_status = 'locked' where id = $1", [org]);
    await D.D.putMany("events", Array.from({ length: 5 }, (_, i) => ({ gameId: "g_lock", pitcherId: "pit1", type: "pitch", n: i + 1, seq: i + 1 })));
    const r = await D.sync("coach", P, true).syncNow();
    const onServer = async () => +(await su.query("select count(*) n from public.events where program_id = $1 and game_id = 'g_lock'", [P])).rows[0].n;
    check(r.locked === true && r.push.rejected.filter((x) => x.reason === "team_locked").length === 5 && (await onServer()) === 0, "while locked, the sync says so and none of the 5 pitches go up");
    await su.query("update public.organizations set billing_status = 'active' where id = $1", [org]);
    const r2 = await D.sync("coach", P, true).syncNow();
    check(r2.locked === false && (await onServer()) === 5 && (await D.sync("coach", P, true).pending()).events === 0, "paid up again, the next sync sends all 5 and nothing is left waiting");
  }

  console.log("12. A shared iPad");
  {
    const D = await device();
    await D.sync("coach", P, true).syncNow();
    check((await D.D.all("hitters")).length + (await D.D.all("games")).length > 0, "(the setup: the coach's iPad holds the team's data)");
    await D.D.putMany("events", Array.from({ length: 3 }, (_, i) => ({ gameId: "g_share", pitcherId: "pit1", type: "pitch", n: i + 1, seq: i + 1 })));
    let err = null; try { await D.sync("pitcher", P, true).syncNow(); } catch (e) { err = e; }
    const up = +(await su.query("select count(*) n from public.events where game_id = 'g_share'")).rows[0].n;
    check(err && err.code === "other-user" && /coach@x\.org/.test(err.message) && up === 0, `a player signing in on the coach's iPad can't send the coach's 3 unsent pitches as his own (${err && err.message})`);
    await D.sync("coach", P, true).syncNow();
    check(+(await su.query("select count(*) n from public.events where game_id = 'g_share'")).rows[0].n === 3, "the coach signs back in and they go up as his");
    await D.sync("pitcher", P, true).syncNow();
    const games = (await D.D.all("games")).length, hitters = (await D.D.all("hitters")).length, events = (await D.D.all("events")).length;
    const mine = (await D.D.all("pitchers")).map((x) => x.id);
    check(games === 0 && hitters === 0 && events === 0 && mine.join() === "pit1", `then the player takes over: the coach's cached team data is cleared and he gets only his own (pitchers ${mine.join()}, games ${games}, hitters ${hitters}, events ${events})`);
  }

  console.log("13. A child's data a parent had deleted leaves the coaches' iPads too");
  {
    const A = await device(), B = await device();
    await A.D.put("pitchers", { id: "pk1", name: "Kid", number: "9", pitches: [] });
    await A.D.put("checkins", { pitcherId: "pk1", date: "2026-11-05", arm: 3 });
    await A.sync("coach", P, true).syncNow();
    await sleep(25); await A.sync("coach", P, true).syncNow();                      // A has nothing left to send
    await B.sync("coach", P, true).syncNow();
    await B.D.put("sessions", { pitcherId: "pk1", kind: "bullpen" });               // B charts a bullpen offline...
    await su.query("insert into public.minors (program_id, pitcher_id) values ($1, 'pk1')", [P]);
    await su.query("insert into public.guardian_consents (program_id, pitcher_id, guardian_user_id, method) values ($1, 'pk1', $2, 'test')", [P, U.pitcher2]);
    await su.query("begin"); await su.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
    await su.query("select public.pc_delete_minor($1, 'pk1')", [P]); await su.query("commit");   // ...and the parent has it all deleted
    const ra = await A.sync("coach", P, true).syncNow();
    const leftA = (await A.D.all("pitchers", true)).filter((x) => x.id === "pk1").length + (await A.D.all("checkins", true)).filter((x) => x.pitcherId === "pk1").length;
    check(ra.pull.purged === 2 && leftA === 0 && !ra.push.applied, `iPad A, with nothing to send, deletes his record and check-in when the pull lists him (${ra.pull.purged} deleted)`);
    const rb = await B.sync("coach", P, true).syncNow();
    const leftB = (await B.D.all("sessions", true)).filter((x) => x.pitcherId === "pk1").length + (await B.D.all("pitchers", true)).filter((x) => x.id === "pk1").length;
    check(leftB === 0 && (await B.sync("coach", P, true).pending()).sessions === 0 && !rb.push.rejected.length, "iPad B's offline bullpen for him is refused for good and deleted, not left waiting");
    check(+(await su.query("select count(*) n from public.pitchers where id = 'pk1'")).rows[0].n === 0, "and nothing of his came back to the server");
  }

  console.log("14. A held under-13 player: the coach's iPad keeps him, and sends him again at every release");
  {
    const A = await device();
    const onServer = async (pid) => +(await su.query("select count(*) n from public.checkins where program_id = $1 and pitcher_id = $2", [P, pid])).rows[0].n;
    const srvName = async (pid) => ((await su.query("select doc->>'name' n from public.pitchers where program_id = $1 and id = $2", [P, pid])).rows[0] || {}).n;
    const local = async (pid) => (await A.D.all("pitchers", true)).find((x) => x.id === pid) || {};
    await A.D.put("pitchers", { id: "pk2", name: "Young", number: "12", pitches: [{ id: "f", name: "Fastball", grade: 4 }] });
    await A.D.put("checkins", { pitcherId: "pk2", date: "2026-11-05", arm: 4 });
    await A.sync("coach", P, true).syncNow(); await sleep(25); await A.sync("coach", P, true).syncNow();
    // the real flow: an open link, someone says he's under 13 and gives a parent's email, the coach approves it
    const t = (await as("coach", "select public.pc_invite($1, 'player', 'pk2') r", [P])).rows[0].r;
    await as("charter", "select public.pc_accept_invite($1, true, 'pitcher2@x.org')", [t]);
    const pinv = (await su.query("select token from public.invites where program_id = $1 and pitcher_id = 'pk2' and needs_approval", [P])).rows[0].token;
    await as("coach", "select public.pc_approve_invite($1)", [pinv]);
    await A.sync("coach", P, true).syncNow();
    check(!(await srvName("pk2")) && (await onServer("pk2")) === 0 && (await local("pk2")).name === "Young" && (await local("pk2")).pitches.length === 1,
      "held: the server keeps only the placeholder, and the coach's iPad keeps its full record of him");
    await as("pitcher2", "select public.pc_record_guardian_consent($1, 'checkbox')", [pinv]);
    let r = await A.sync("coach", P, true).syncNow();
    check(r.pull.resend >= 1 && (await srvName("pk2")) === "Young" && (await onServer("pk2")) === 1, `the parent agrees: the next sync sends his record and check-in again (${await srvName("pk2")}, ${await onServer("pk2")} check-in)`);
    r = await A.sync("coach", P, true).syncNow();
    check(!r.pull.resend, "once per release");
    // the parent's consent goes (her account deleted), he is held again, and a parent agrees again
    await su.query("delete from public.guardian_consents where program_id = $1 and pitcher_id = 'pk2'", [P]);
    await A.sync("coach", P, true).syncNow();
    check(!(await srvName("pk2")) && (await onServer("pk2")) === 0 && (await local("pk2")).name === "Young", "consent gone: held again on the server, kept whole on the iPad");
    const t2 = (await as("coach", "select public.pc_invite($1, 'player', 'pk2', 'pitcher2@x.org', true) r", [P])).rows[0].r;
    await as("pitcher2", "select public.pc_record_guardian_consent($1, 'checkbox')", [t2]);
    r = await A.sync("coach", P, true).syncNow();
    check(r.pull.resend >= 1 && (await srvName("pk2")) === "Young" && (await onServer("pk2")) === 1, "a second consent is a second release: everything goes up again");
    // a coach marks someone by mistake and takes it off
    await A.D.put("pitchers", { id: "pk3", name: "Not A Kid", number: "13", pitches: [] });
    await A.D.put("checkins", { pitcherId: "pk3", date: "2026-11-05", arm: 5 });
    await A.sync("coach", P, true).syncNow(); await sleep(25); await A.sync("coach", P, true).syncNow();
    await as("coach", "select public.pc_mark_minor($1, 'pk3')", [P]);
    await A.sync("coach", P, true).syncNow();
    await as("coach", "select public.pc_unmark_minor($1, 'pk3')", [P]);
    r = await A.sync("coach", P, true).syncNow();
    check((await srvName("pk3")) === "Not A Kid" && (await onServer("pk3")) === 1 && (await local("pk3")).name === "Not A Kid", "a wrong mark taken off: his record and check-in go back up from the iPad");
  }

  console.log("15. Several coaches' iPads after a release: nobody's newer work is undone");
  {
    const srv = async (pid) => ((await su.query("select doc from public.pitchers where program_id = $1 and id = $2", [P, pid])).rows[0] || {}).doc || {};
    const loc = async (D, pid) => (await D.D.all("pitchers", true)).find((x) => x.id === pid) || {};
    const hold = async (pid) => { await as("coach", "select public.pc_mark_minor($1, $2)", [P, pid]); };
    const agree = async (pid) => {
      const t = (await as("coach", "select public.pc_invite($1, 'player', $2, 'pitcher2@x.org', true) r", [P, pid])).rows[0].r;
      await as("pitcher2", "select public.pc_record_guardian_consent($1, 'checkbox')", [t]);
      return t;
    };
    const A = await device(), B = await device(), C = await device();
    await A.D.put("pitchers", { id: "q2", name: "v1", number: "22", notes: "coach note", pitches: [{ id: "f", name: "Fastball", grade: 4 }] });
    await A.sync("coach", P, true).syncNow(); await B.sync("coach", P, true).syncNow();
    await hold("q2");
    await A.sync("coach", P, true).syncNow(); await B.sync("coach", P, true).syncNow();
    await C.sync("coach", P, true).syncNow();                                   // a new iPad: it only ever sees the placeholder
    check((await loc(A, "q2")).name === "v1" && (await loc(B, "q2")).name === "v1" && !(await loc(C, "q2")).name, "(held: A and B keep v1, the new iPad C has only the placeholder)");
    const tok = await agree("q2");
    await A.sync("coach", P, true).syncNow();
    const a = await loc(A, "q2"); await sleep(5); await A.D.put("pitchers", Object.assign({}, a, { name: "v2 corrected on A" })); await A.sync("coach", P, true).syncNow();
    await B.sync("coach", P, true).syncNow();                                   // B acts on the release later, with its older v1
    await C.sync("coach", P, true).syncNow();                                   // C acts on it with only a placeholder
    await A.sync("coach", P, true).syncNow();
    const sv = await srv("q2");
    check(sv.name === "v2 corrected on A" && sv.notes === "coach note" && sv.pitches.length === 1, `P2/P3: the server keeps A's correction and the full record (${sv.name})`);
    check((await loc(A, "q2")).name === "v2 corrected on A" && (await loc(B, "q2")).name === "v2 corrected on A" && (await loc(C, "q2")).name === "v2 corrected on A",
      "and every iPad ends up with it, the one that had only the placeholder too");
    // P4: deleted on one iPad while held
    await B.D.put("pitchers", { id: "q4", name: "Seven", number: "7", pitches: [] });
    await B.sync("coach", P, true).syncNow(); await A.sync("coach", P, true).syncNow();
    await hold("q4");
    await A.sync("coach", P, true).syncNow(); await B.sync("coach", P, true).syncNow();
    await sleep(5); await A.D.del("pitchers", "q4"); await A.sync("coach", P, true).syncNow();
    await agree("q4");
    await B.sync("coach", P, true).syncNow();                                   // B's live copy goes first
    await A.sync("coach", P, true).syncNow();                                   // then A's delete, made later
    await B.sync("coach", P, true).syncNow();
    const s4 = await srv("q4");
    check(!!s4.deletedAt && s4.name === "Seven" && !!(await loc(B, "q4")).deletedAt, `P4: a delete made while he was held stands (deletedAt ${s4.deletedAt ? "set" : "missing"})`);
    // P5: one release per consent, however many times it's sent
    const n0 = +(await su.query("select count(*) n from public.minor_releases where pitcher_id = 'q2'")).rows[0].n;
    const again = await as("pitcher2", "select public.pc_record_guardian_consent($1, 'checkbox')", [tok]).then(() => "ok", (e) => e.message);
    const n1 = +(await su.query("select count(*) n from public.minor_releases where pitcher_id = 'q2'")).rows[0].n;
    check(again === "ok" && n0 === 1 && n1 === 1, `P5: agreeing again goes through but isn't another release (${again}, ${n0} -> ${n1})`);
    // P6: the parent types the child's name before any coach's iPad has sent the full record back
    await A.D.put("pitchers", { id: "q6", name: "Full Name", number: "16", notes: "coach-only note", pitchLimit: 60, pitches: [{ id: "f", name: "Fastball", grade: 4 }] });
    await A.sync("coach", P, true).syncNow();
    await hold("q6"); await A.sync("coach", P, true).syncNow();
    const t6 = (await as("coach", "select public.pc_invite($1, 'player', 'q6', 'pitcher2@x.org', true) r", [P])).rows[0].r;
    await as("pitcher2", "select public.pc_record_guardian_consent($1, 'checkbox')", [t6]);
    await as("pitcher2", "select public.pc_accept_invite($1)", [t6]);
    await as("pitcher2", "select public.pc_push($1, 'pitchers', $2::jsonb)", [P, JSON.stringify([{ id: "q6", updatedAt: Date.now(), name: "Parent typed name" }])]);
    await A.sync("coach", P, true).syncNow();
    await A.sync("coach", P, true).syncNow();
    const s6 = await srv("q6"), l6 = await loc(A, "q6");
    check(s6.name === "Parent typed name" && s6.notes === "coach-only note" && s6.pitchLimit === 60 && (s6.pitches || []).length === 1 && l6.notes === "coach-only note" && l6.name === "Parent typed name",
      `P6: the parent's edit and the coach's notes, limit and grades all survive, on the server and the iPad (${JSON.stringify(s6).slice(0, 140)})`);
    // P6b: the same, when the coach's iPad sends its copy first and the server answers with the parent's thinner one
    await A.D.put("pitchers", { id: "q7", name: "Full Seven", number: "17", notes: "coach-only 7", pitches: [{ id: "f", name: "Fastball", grade: 3 }] });
    await A.sync("coach", P, true).syncNow();
    await hold("q7"); await A.sync("coach", P, true).syncNow();
    const t7b = (await as("coach", "select public.pc_invite($1, 'player', 'q7', 'pitcher2@x.org', true) r", [P])).rows[0].r;
    await as("pitcher2", "select public.pc_record_guardian_consent($1, 'checkbox')", [t7b]);
    await as("pitcher2", "select public.pc_accept_invite($1)", [t7b]);
    await as("pitcher2", "select public.pc_push($1, 'pitchers', $2::jsonb)", [P, JSON.stringify([{ id: "q7", updatedAt: Date.now(), name: "Parent seven" }])]);
    await A.D.put("meta", { id: "pushExtra", tables: { pitchers: ["q7"] } });   // its copy goes up first, and loses on the stamp
    const r7 = await A.sync("coach", P, true).syncNow();
    const s7b = await srv("q7"), l7b = await loc(A, "q7");
    check(r7.push.skipped >= 1 && s7b.name === "Parent seven" && s7b.notes === "coach-only 7" && (s7b.pitches || []).length === 1 && l7b.notes === "coach-only 7",
      `P6b: answered with the thinner copy, the iPad merges it in and sends the merge (${JSON.stringify(s7b).slice(0, 120)})`);
    // R4: an iPad that only ever had the placeholder changes his number offline, after the full record is back
    await A.D.put("pitchers", { id: "q8", name: "Eight", number: "18", notes: "coach-only 8", pitches: [{ id: "f", name: "Fastball", grade: 5 }] });
    await A.sync("coach", P, true).syncNow();
    await hold("q8"); await A.sync("coach", P, true).syncNow();
    const D8 = await device();
    await D8.sync("coach", P, true).syncNow();                                  // a new iPad: it sees him only as the placeholder
    check(!(await loc(D8, "q8")).name, "(the setup: the new iPad has only his placeholder)");
    await agree("q8");
    await A.sync("coach", P, true).syncNow();                                   // A sends the full record back
    check((await srv("q8")).notes === "coach-only 8", "(the setup: the full record is back on the server)");
    const d8 = await loc(D8, "q8"); await sleep(5);
    await D8.D.put("pitchers", Object.assign({}, d8, { number: "21" }));        // offline, before its next pull
    await D8.sync("coach", P, true).syncNow(); await A.sync("coach", P, true).syncNow(); await D8.sync("coach", P, true).syncNow();
    const s8 = await srv("q8");
    check(s8.number === "21" && s8.name === "Eight" && s8.notes === "coach-only 8" && (s8.pitches || []).length === 1 && (await loc(A, "q8")).notes === "coach-only 8" && (await loc(D8, "q8")).notes === "coach-only 8",
      `R4: his new number goes in, nothing else of the record is lost, and both iPads end up with all of it (${JSON.stringify(s8).slice(0, 140)})`);
  }

  await c.end(); await su.end();
  console.log(fails ? `\n${fails} client check(s) FAILED` : "\nall client checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
