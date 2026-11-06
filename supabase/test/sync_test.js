/*
 * Supabase checks against a real local Postgres (not a hosted project). Run from the repo root:
 *   PGURL=postgres://postgres@localhost:55432/postgres node supabase/test/sync_test.js
 * (needs: npm i pg fake-indexeddb). Each run makes a fresh database, applies test/auth_stub.sql (Supabase's auth
 * schema, test only) and every migration, then checks:
 *   1. who sees and writes what, per role and across teams; nothing can be deleted; anon gets nothing
 *   2. push keeps the newer record and reports refused ones without losing the rest
 *   3. pull never skips a row that commits late (two connections, one transaction held open)
 *   4. two iPads (fake IndexedDB, app/db.js and app/sync.js unchanged) sync a charted game both ways; an edit on each
 *      side resolves to the newer one; a push with no signal loses nothing and goes up later
 *   5. app/sync.js's REST transport against a stand-in for Supabase's /rest/v1 that forwards to the same Postgres
 *      (checks the request format; it is not Supabase's own REST server)
 * Calls are made the way Supabase makes them: role authenticated, the user's id in request.jwt.claims.
 */
require("fake-indexeddb/auto");
const { Client } = require("pg");
const fs = require("fs"), path = require("path"), http = require("http"), crypto = require("crypto");
const PCDB = require("../../app/db.js");
const PCSync = require("../../app/sync.js");
const FX = require("./teams_fixture.js");
const BASE = process.env.PGURL || "postgres://postgres@localhost:55432/postgres";
const DBNAME = "pc_sync_test";
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const sql = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");

// one connection per signed-in user, each call in its own transaction with that user's claims (as PostgREST does)
async function connect() { const c = new Client({ connectionString: BASE.replace(/\/[^/]*$/, "/" + DBNAME) }); await c.connect(); return c; }
function as(client, userId) {
  return async (text, params) => {
    await client.query("begin");
    try {
      await client.query("set local role " + (userId ? "authenticated" : "anon"));
      if (userId) await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
      const r = await client.query(text, params);
      await client.query("commit");
      return r;
    } catch (e) { await client.query("rollback"); throw e; }
  };
}
const fails_with = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const doc = (id, extra = {}) => Object.assign({ id, createdAt: 1, updatedAt: 1000 }, extra);

(async () => {
  const admin = new Client({ connectionString: BASE }); await admin.connect();
  await admin.query(`drop database if exists ${DBNAME}`); await admin.query(`create database ${DBNAME}`); await admin.end();
  const su = await connect();
  await FX.applyAll(su);
  const users = { coach: crypto.randomUUID(), charter: crypto.randomUUID(), pitcher: crypto.randomUUID(), other: crypto.randomUUID(), stranger: crypto.randomUUID() };
  for (const [name, id] of Object.entries(users)) await su.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [id, name + "@test.local"]);
  const conns = {}, q = {};
  for (const name of Object.keys(users)) { conns[name] = await connect(); q[name] = as(conns[name], users[name]); }
  const qAnon = as(await connect(), null);

  console.log("1. Who sees and writes what");
  // a team each (an organization, a team, billing switched on); the charter is a caller, the pitcher a player linked
  // to his pitcher record. rls_matrix_test.js and review_test.js check invites and the role rules in detail.
  const prog = await FX.newTeam(su, users.coach, "RIT");
  const prog2 = await FX.newTeam(su, users.other, "Other U");
  await FX.addMember(su, prog, users.charter, "caller");
  await FX.addMember(su, prog, users.pitcher, "player", ["pit_me"]);
  const push = (who, p, t, rows) => q[who]("select public.pc_push($1, $2, $3::jsonb) as r", [p, t, JSON.stringify(rows)]).then((r) => r.rows[0].r);
  const pull = (who, p, t, cur = { xid: 0, id: "" }) => q[who]("select public.pc_pull($1, $2, $3, $4, 500) as r", [p, t, cur.xid, cur.id]).then((r) => r.rows[0].r);
  const mine = await q.coach("select * from public.pc_my_teams()");
  check(mine.rows.length === 1 && mine.rows[0].role === "head" && mine.rows[0].is_owner, "the creator owns the organization and is head coach of its team");
  let r = await push("coach", prog, "pitchers", [doc("pit_me", { name: "Me" }), doc("pit_other", { name: "Ace" })]);
  check(r.applied === 2, "head coach writes pitchers");
  r = await push("charter", prog, "pitchers", [doc("pit_x", { name: "Sneak" })]);
  check(r.applied === 0 && r.rejected.length === 1 && r.rejected[0].reason === "not allowed", "a charter can't write pitchers (reported, not applied)");
  r = await push("charter", prog, "events", [doc("e1", { gameId: "g1", pitcherId: "pit_me", type: "pitch" }), doc("e2", { gameId: "g1", pitcherId: "pit_other", type: "pitch" })]);
  check(r.applied === 2, "a charter writes pitches");
  await push("coach", prog, "checkins", [doc("ci_other", { pitcherId: "pit_other" })]);
  r = await push("pitcher", prog, "checkins", [doc("ci_me", { pitcherId: "pit_me" }), doc("ci_fake", { pitcherId: "pit_other" })]);
  check(r.applied === 1 && r.rejected.length === 1, "a pitcher writes his own check-in, not someone else's");
  const pv = (await pull("pitcher", prog, "pitchers")).rows.map((x) => x.id);
  const pc = (await pull("pitcher", prog, "checkins")).rows.map((x) => x.id);
  const pe = (await pull("pitcher", prog, "events")).rows.length;
  check(pv.join() === "pit_me" && pc.join() === "ci_me" && pe === 0, `a pitcher sees only his own record and check-in (${pv}, ${pc}), no game events`);
  check((await pull("charter", prog, "pitchers")).rows.length === 2, "a charter reads pitchers");
  const cross = await fails_with(() => pull("other", prog, "events"));
  check(cross && /not a member/.test(cross.message), "another program's coach can't pull this program's rows");
  const crossPush = await fails_with(() => push("other", prog, "events", [doc("e9")]));
  check(crossPush && /not a member/.test(crossPush.message), "or push into it");
  const direct = await q.other("select count(*)::int n from public.events");
  check(direct.rows[0].n === 0, "reading the table directly shows another program nothing");
  r = await push("other", prog2, "events", [doc("e1", { gameId: "g1" })]);
  check(r.applied === 1 && (await pull("coach", prog, "events")).rows.find((x) => x.id === "e1").gameId === "g1", "the same record id in two programs stays two separate records");
  const del = await fails_with(() => q.coach("delete from public.events where id = 'e1'"));
  check(del && /permission denied/.test(del.message), "nothing can be deleted from the server, even by the head coach (soft deletes sync as edits)");
  const memberEdit = await fails_with(() => q.charter("update public.members set role = 'head' where user_id = $1", [users.charter]));
  check(memberEdit && /permission denied/.test(memberEdit.message), "a charter can't promote himself by editing members directly");
  const anon = await fails_with(() => qAnon("select count(*) from public.events"));
  check(anon && /permission denied/.test(anon.message), "anon (the public key alone) can't read the tables");
  const anonRpc = await fails_with(() => qAnon("select public.pc_pull($1, 'events')", [prog]));
  check(anonRpc && /permission denied/.test(anonRpc.message), "or call the sync functions");
  const stranger = await fails_with(() => q.stranger("select public.pc_invite($1, 'head', null, 'stranger@test.local')", [prog]));
  check(stranger && /can't invite coaches/.test(stranger.message), "a stranger can't invite anyone");
  const self = await fails_with(() => q.charter("select public.pc_set_member($1, $2, 'head')", [prog, users.charter]));
  check(self && /can't change this team's staff/.test(self.message), "a charter can't promote himself through pc_set_member");

  console.log("2. Push keeps the newer record");
  await push("coach", prog, "teams", [doc("t1", { name: "v1", updatedAt: 2000 })]);
  r = await push("charter", prog, "teams", [doc("t1", { name: "older", updatedAt: 1500 })]);
  const t1 = (await pull("coach", prog, "teams")).rows.find((x) => x.id === "t1");
  check(r.skipped === 1 && t1.name === "v1", "an older version is skipped, not applied");
  r = await push("charter", prog, "teams", [doc("t1", { name: "newer", updatedAt: 2500 }), { id: "bad", updatedAt: "soon" }, { id: "t2", name: "ok", updatedAt: 10 }]);
  check(r.applied === 2 && r.rejected.length === 1 && /bad record/.test(r.rejected[0].reason), `a malformed record is refused and the rest go in (${JSON.stringify(r)})`);
  const tooMany = await fails_with(() => push("coach", prog, "teams", Array.from({ length: 501 }, (_, i) => doc("x" + i))));
  check(tooMany && /at most 500/.test(tooMany.message), "a push is capped at 500 records");
  const badTable = await fails_with(() => push("coach", prog, "members", []));
  check(badTable && /unknown table/.test(badTable.message), "only the synced tables can be pushed to");

  console.log("3. Pull never skips a row that commits late");
  {
    const c1 = await connect(), c2 = await connect();
    const begin = async (c, uid) => { await c.query("begin"); await c.query("set local role authenticated"); await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid })]); };
    let cur = (await pull("coach", prog, "games")).next;
    await begin(c1, users.coach);
    await c1.query("select public.pc_push($1, 'games', $2::jsonb)", [prog, JSON.stringify([doc("slow", { updatedAt: 5000 })])]);   // started first, still open
    await begin(c2, users.coach);
    await c2.query("select public.pc_push($1, 'games', $2::jsonb)", [prog, JSON.stringify([doc("fast", { updatedAt: 5000 })])]);
    await c2.query("commit");                                                    // committed while the first is still open
    const mid = await pull("coach", prog, "games", cur);
    check(!mid.rows.some((x) => x.id === "fast"), "while an earlier transaction is still open, the later one's row waits");
    cur = mid.next;
    await c1.query("commit");
    const after = await pull("coach", prog, "games", cur);
    check(["slow", "fast"].every((id) => after.rows.some((x) => x.id === id)), `after it commits, both arrive (${after.rows.map((x) => x.id)})`);
    const again = await pull("coach", prog, "games", after.next);
    check(again.rows.length === 0, "and the cursor doesn't hand them out twice");
    await c1.end(); await c2.end();
    // paging
    await push("coach", prog, "hitters", Array.from({ length: 23 }, (_, i) => doc("h" + String(i).padStart(2, "0"))));
    let got = [], c = { xid: 0, id: "" }, pages = 0, more = true;
    while (more) { const pg = await q.coach("select public.pc_pull($1, 'hitters', $2, $3, 10) as r", [prog, c.xid, c.id]).then((x) => x.rows[0].r); got = got.concat(pg.rows); c = pg.next; more = pg.more; pages++; }
    check(got.length === 23 && new Set(got.map((x) => x.id)).size === 23 && pages === 3, `23 rows in pages of 10: ${pages} pages, ${got.length} rows, no repeats`);
  }

  console.log("4. Two iPads sync a charted game");
  {
    const pgTransport = (who, p) => ({ push: (t, rows) => push(who, p, t, rows), pull: (t, cur) => pull(who, p, t, cur) });
    const A = await PCDB.open({ name: "ipadA" }), B = await PCDB.open({ name: "ipadB" });
    // on iPad A: a team, a pitcher, a game with 40 pitches and 2 plays, a pack
    const team = await A.put("teams", { name: "RIT", isOurs: true });
    const p = await A.put("pitchers", PCDB.newPitcher(team.id, { name: "Starter" }));
    const g = await A.put("games", PCDB.moveGame({ date: "2026-03-01", status: "planned" }, "live"));
    await A.put("packs", { gameId: g.id, v: 1, staff: [] });
    const evs = Array.from({ length: 40 }, (_, i) => ({ gameId: g.id, pitcherId: p.id, type: "pitch", n: i + 1, seq: i + 1, res: "ball" }));
    evs.push({ gameId: g.id, type: "play", play: "sub_pitcher", seq: 41 }, { gameId: g.id, type: "play", play: "correct", seq: 42 });
    await A.putMany("events", evs);
    let sa = PCSync.createSync({ db: A, transport: pgTransport("coach", prog), programId: prog });
    const sb = PCSync.createSync({ db: B, transport: pgTransport("charter", prog), programId: prog });
    const pend = await sa.pending();
    check(pend.events === 42 && pend.games === 1 && pend.packs === 1, `iPad A has ${pend.events} events, ${pend.games} game, ${pend.packs} pack waiting`);
    const up = await sa.syncNow();
    check(up.push.applied === 46 && !up.push.rejected.length, `iPad A pushed all ${up.push.applied} records (team, pitcher, game, pack, 42 events)`);
    check(Object.values(await sa.pending()).every((n) => n === 0), "nothing left waiting on A after a push");
    const down = await sb.syncNow();
    const bEvs = await B.byIndex("events", "gameId", g.id);
    check(bEvs.length === 42 && bEvs.filter((e) => e.type === "play").length === 2 && (await B.get("games", g.id)).status === "live", `iPad B pulled the game: ${bEvs.length} events, plays and status intact`);
    const bp = await B.get("pitchers", p.id);
    check(bp && bp.updatedAt === p.updatedAt && bp.createdAt === p.createdAt, "pulled records keep their own timestamps");
    check(down.pull.received > 0 && Object.values(await sb.pending()).every((n) => n === 0), "what iPad B pulled isn't queued to go back up");
    // both sides edit: the newer edit wins on both
    await new Promise((res) => setTimeout(res, 5));
    await B.put("teams", Object.assign(await B.get("teams", team.id), { name: "RIT (B)" }));
    await new Promise((res) => setTimeout(res, 5));
    await A.put("teams", Object.assign(await A.get("teams", team.id), { name: "RIT (A, later)" }));
    await sb.syncNow(); await sa.syncNow(); await sb.syncNow();
    check((await A.get("teams", team.id)).name === "RIT (A, later)" && (await B.get("teams", team.id)).name === "RIT (A, later)", "an edit on each iPad: both end up with the later one");
    // the charter's iPad edits a pitcher grade: refused by the server, reported, and the pitch data still syncs
    await B.put("pitchers", Object.assign(await B.get("pitchers", p.id), { name: "Renamed by charter" }));
    await B.put("events", { gameId: g.id, pitcherId: p.id, type: "pitch", n: 41, seq: 43, res: "cstrike" });
    const bres = await sb.syncNow();
    check(bres.push.rejected.some((x) => x.table === "pitchers") && bres.push.applied >= 1, "the charter's pitcher edit is refused and reported; his new pitch still goes up");
    // no signal: the push throws, nothing is lost, it goes up next time
    let online = false;
    const flaky = pgTransport("coach", prog);
    const off = { push: (t, rows) => { if (!online) throw new Error("offline"); return flaky.push(t, rows); }, pull: (t, c) => { if (!online) throw new Error("offline"); return flaky.pull(t, c); } };
    sa = PCSync.createSync({ db: A, transport: off, programId: prog });
    await A.putMany("events", [{ gameId: g.id, pitcherId: p.id, type: "pitch", n: 42, seq: 44, res: "whiff" }, { gameId: g.id, pitcherId: p.id, type: "pitch", n: 43, seq: 45, res: "foul" }]);
    const err = await fails_with(() => sa.syncNow());
    check(err && err.message === "offline" && (await sa.pending()).events === 2, "with no signal the push fails and both new pitches stay waiting");
    online = true;
    await sa.syncNow(); await sb.syncNow();
    check((await B.byIndex("events", "gameId", g.id)).length === 45, "back online, they go up and reach iPad B (45 events)");
  }

  console.log("5. The REST transport, through a stand-in for Supabase's /rest/v1");
  {
    // forwards POST /rpc/<fn> to Postgres as the user in the bearer token's sub claim (signature not checked: a stand-in)
    const pass = await connect();
    const srv = http.createServer(async (req, res) => {
      let body = ""; for await (const ch of req) body += ch;
      const fn = (req.url.match(/^\/rpc\/(\w+)$/) || [])[1];
      const tok = (req.headers.authorization || "").replace(/^Bearer /, "");
      const sub = tok.includes(".") ? JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString()).sub : null;
      const args = JSON.parse(body || "{}");
      const calls = {
        pc_push: ["select public.pc_push($1, $2, $3::jsonb) as r", [args.p, args.tbl, JSON.stringify(args.rows)]],
        pc_pull: ["select public.pc_pull($1, $2, $3, $4, $5) as r", [args.p, args.tbl, args.after_xid, args.after_id, args.lim]],
      };
      if (!req.headers.apikey || !calls[fn]) { res.writeHead(404); return res.end(JSON.stringify({ message: "not found" })); }
      try { const out = await as(pass, sub)(...calls[fn]); res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out.rows[0].r)); }
      catch (e) { res.writeHead(e.code === "42501" ? 403 : 400, { "content-type": "application/json" }); res.end(JSON.stringify({ code: e.code, message: e.message })); }
    });
    await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
    const jwt = (sub) => ["e30", Buffer.from(JSON.stringify({ sub, role: "authenticated" })).toString("base64url"), "sig"].join(".");
    const restUrl = `http://127.0.0.1:${srv.address().port}`;
    const C = await PCDB.open({ name: "ipadC" });
    const tr = PCSync.restTransport({ restUrl, apiKey: "anon-key", token: async () => jwt(users.coach), programId: prog });
    const sc = PCSync.createSync({ db: C, transport: tr, programId: prog });
    const st = await sc.syncNow();
    check(st.pull.received >= 45 && (await C.all("events")).length >= 45, `a third device pulls everything over REST (${st.pull.received} records)`);
    await C.put("hitters", { teamId: "t1", name: "New Guy" });
    const st2 = await sc.syncNow();
    check(st2.push.applied >= 1, "and pushes over REST");
    const stranger = PCSync.restTransport({ restUrl, apiKey: "anon-key", token: async () => jwt(users.stranger), programId: prog });
    const D4 = await PCDB.open({ name: "ipadD" });
    const e = await fails_with(() => PCSync.createSync({ db: D4, transport: stranger, programId: prog }).syncNow());
    check(e && e.status === 403 && /not a member/.test(e.message), `a refused call surfaces as an error with its status (${e && e.status})`);
    srv.close(); await pass.end();
  }

  for (const c of Object.values(conns)) await c.end();
  await su.end();
  console.log(fails ? `\n${fails} Supabase check(s) FAILED` : "\nall Supabase checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
