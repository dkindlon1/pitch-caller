/*
 * PitchIQ teams (supabase/migrations/20261106000000_pitchiq_teams.sql) against a real local Postgres: who can see and
 * change what, invites, minors, ownership, and the team-scoped sync. Plan 1, tasks 2-6, and both reviews' findings.
 * Run from the repo root: PGURL=postgresql://postgres@localhost:5432/postgres node supabase/test/rls_matrix_test.js
 */
const { Client } = require("pg");
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const BASE = process.env.PGURL || "postgresql://postgres@localhost:5432/postgres";
const DB = "pc_rls_matrix_test";
let fails = 0, checks = 0;
const check = (ok, msg) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const dbUrl = (n) => { const u = new URL(BASE); u.pathname = "/" + n; return u.toString(); };
const TABLES = ["teams", "pitchers", "catchers", "hitters", "checkins", "sessions", "games", "events", "packs", "readings", "learned"];
const now = () => Date.now();

(async () => {
  const a = new Client({ connectionString: BASE }); await a.connect();
  await a.query(`drop database if exists ${DB}`); await a.query(`create database ${DB}`); await a.end();
  const su = new Client({ connectionString: dbUrl(DB) }); await su.connect();
  await su.query(fs.readFileSync(path.join(__dirname, "auth_stub.sql"), "utf8"));
  // Supabase grants new functions in public to the client roles too; the migration must hold against that
  await su.query("alter default privileges in schema public grant all on functions to anon, authenticated, service_role");
  const dir = path.join(__dirname, "../migrations");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await su.query(fs.readFileSync(path.join(dir, f), "utf8"));

  const U = {};
  for (const n of ["owner", "head", "pitching", "caller", "viewer", "pl1", "pl2", "parent", "kid", "nonmember", "xhead", "unconfirmed"]) {
    U[n] = crypto.randomUUID();
    await su.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, $3)", [U[n], n + "@x.org", n === "unconfirmed" ? null : new Date()]);
  }
  const conn = new Client({ connectionString: dbUrl(DB) }); await conn.connect();
  const as = async (who, sql, params = []) => {
    try {
      await conn.query("begin");
      if (who === "anon") await conn.query("set local role anon");
      else if (who === "service") { await conn.query("set local role service_role"); await conn.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]); }
      else { await conn.query("set local role authenticated"); await conn.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U[who], role: "authenticated" })]); }
      const r = await conn.query(sql, params); await conn.query("commit"); return r;
    } catch (e) { await conn.query("rollback").catch(() => {}); return { error: e.message, code: e.code }; }
  };
  const one = async (who, sql, params) => { const r = await as(who, sql, params); return r.error ? r : r.rows[0] && r.rows[0].r; };
  const push = (who, p, tbl, rows) => one(who, "select public.pc_push($1, $2, $3::jsonb) r", [p, tbl, JSON.stringify(rows)]);
  const pull = (who, p, tbl) => one(who, "select public.pc_pull($1, $2, 0, '', 500) r", [p, tbl]);
  const teams = async (who) => (await as(who, "select * from public.pc_my_teams()")).rows || [];

  // ---------------------------------------------------------------- organizations and teams
  console.log("1. Organizations, teams and presets");
  const org1 = await one("owner", "select public.pc_create_org('Lakeside Baseball') r");
  const tA = await one("owner", "select public.pc_create_team($1, 'Varsity', 'hs') r", [org1]);
  const tB = await one("owner", "select public.pc_create_team($1, 'JV', 'hs') r", [org1]);
  const org2 = await one("xhead", "select public.pc_create_org('Other Club') r");
  const tC = await one("xhead", "select public.pc_create_team($1, 'Other 16U', 'travel', 'America/Chicago', 'head') r", [org2]);
  check(typeof tA === "string" && typeof tC === "string", "an owner creates an organization and its teams");
  const st = (await su.query("select status from public.programs where id = $1", [tA])).rows[0].status;
  check(st === "pending", "a new team starts pending (billing turns it on)");
  const forced = await as("owner", "update public.programs set status = 'active' where id = $1", [tA]);
  check((forced.error || forced.rowCount === 0) && (await su.query("select status from public.programs where id = $1", [tA])).rows[0].status === "pending", "the owner can't switch a team on himself");
  const forcedOrg = await as("owner", "update public.organizations set billing_status = 'active' where id = $1", [org1]);
  check(!!forcedOrg.error || forcedOrg.rowCount === 0, "nor mark his organization paid");
  const notOwner = await as("head", "select public.pc_create_team($1, 'Sneaky', 'hs')", [org1]);
  check(!!notOwner.error, "only the owner can add a team");
  // billing (Plan 2) would do this through the service role
  await su.query("update public.organizations set billing_status = 'active' where id in ($1, $2)", [org1, org2]);
  await su.query("update public.programs set status = 'active' where id in ($1, $2, $3)", [tA, tB, tC]);
  for (const [who, role] of [["head", "head"], ["pitching", "pitching"], ["caller", "caller"], ["viewer", "viewer"], ["pl1", "player"], ["pl2", "player"], ["parent", "player"]]) {
    await su.query("insert into public.members (program_id, user_id, role) values ($1, $2, $3)", [tA, U[who], role]);
  }
  await su.query("insert into public.members (program_id, user_id, role) values ($1, $2, 'caller')", [tB, U.head]);
  for (const id of ["p1", "p2", "p3", "p4", "p5"]) {
    const doc = { id, updatedAt: 1000, teamId: "ours", name: "Pitcher " + id, number: "1" + id.slice(1), hand: "R", role: "SP", notes: "coach note", pitchLimit: 80, pitches: [{ id: "pt1", name: "Fastball", grade: 3 }] };
    await su.query("insert into public.pitchers (program_id, id, doc) values ($1, $2, $3)", [tA, id, doc]);
  }
  await su.query("insert into public.player_links (program_id, user_id, pitcher_id) values ($1, $2, 'p1'), ($1, $3, 'p2'), ($1, $4, 'p3'), ($1, $4, 'p4')", [tA, U.pl1, U.pl2, U.parent]);
  const presets = await one("owner", "select jsonb_object_agg(m.role, m.perms) r from public.pc_my_teams() m");
  const caller = (await teams("caller")).find((t) => t.team_id === tA);
  check(JSON.stringify(caller.perms) === JSON.stringify({ call_games: true, manage_opponents: true }), `the caller preset is exactly call games and manage opponents (${JSON.stringify(caller.perms)})`);
  const head = (await teams("head")).find((t) => t.team_id === tA);
  check(Object.keys(head.perms).length === 6 && Object.values(head.perms).every(Boolean), "the head coach preset has every toggle");
  const ownerTeams = await teams("owner");
  check(ownerTeams.length === 2 && ownerTeams.every((t) => t.is_owner && t.role === null), "the owner sees both of his teams, as owner, with no role on them");
  check((await teams("head")).length === 2 && (await teams("nonmember")).length === 0, "a coach on two teams sees two; a stranger sees none");
  check((await teams("parent")).find((t) => t.team_id === tA).pitcher_ids.length === 2, "a parent linked to two siblings sees both pitcher records on one team");
  void presets;

  // ---------------------------------------------------------------- seed every table on teams A and C
  const seed = async (p, suffix) => {
    for (const t of TABLES) {
      if (t === "pitchers" && suffix === "a") continue;
      for (const [i, pit] of [[1, "p1"], [2, "p2"]]) {
        const id = `${t}-${suffix}${i}`;
        await su.query(`insert into public.${t} (program_id, id, doc) values ($1, $2, $3)`, [p, id, { id, updatedAt: 1000, pitcherId: pit, gameId: "g1", teamId: "opp1", note: "x" }]);
      }
    }
  };
  await seed(tA, "a"); await seed(tC, "c");

  // ---------------------------------------------------------------- reads
  console.log("2. Who sees what");
  const count = async (who, t, p) => { const r = await as(who, `select count(*)::int n from public.${t} where program_id = $1`, [p]); return r.error ? "denied" : r.rows[0].n; };
  const want = { pitchers: 5, other: 2 };
  let allCoach = true, allPlayer = true, allNone = true;
  for (const t of TABLES) {
    const full = t === "pitchers" ? want.pitchers : want.other;
    for (const who of ["head", "pitching", "caller", "viewer"]) if ((await count(who, t, tA)) !== full) { allCoach = false; console.log(`     ${who} ${t}: ${await count(who, t, tA)}`); }
    const own = t === "pitchers" ? 1 : ["checkins", "sessions", "readings"].includes(t) ? 1 : 0;
    if ((await count("pl1", t, tA)) !== own) { allPlayer = false; console.log(`     pl1 ${t}: ${await count("pl1", t, tA)} (want ${own})`); }
    for (const who of ["owner", "nonmember", "xhead"]) { const n = await count(who, t, tA); if (n !== 0 && n !== "denied") { allNone = false; console.log(`     ${who} ${t}: ${n}`); } }
    const an = await count("anon", t, tA); if (an !== "denied" && an !== 0) { allNone = false; console.log(`     anon ${t}: ${an}`); }
  }
  check(allCoach, "every coach preset sees all of its own team's rows in every table");
  check(allPlayer, "a player sees only his own pitcher record and his own check-ins, sessions and readings; no events, games, hitters, packs or learned values");
  check(allNone, "the owner without membership, a stranger, another team's coach and anon see nothing of the team");
  check((await count("head", "events", tC)) === 0, "a coach on team A sees nothing of team C");
  check((await count("parent", "pitchers", tA)) === 2, "the parent sees both siblings' records");
  const members = await as("viewer", "select count(*)::int n from public.members where program_id = $1", [tA]);
  check(members.rows[0].n === 1, "a viewer sees only his own membership, not the staff list");
  const orgsSeen = await as("pl1", "select count(*)::int n from public.organizations");
  check(orgsSeen.rows[0].n === 1 && (await as("nonmember", "select count(*)::int n from public.organizations")).rows[0].n === 0, "members see their own organization; strangers see none");
  for (const t of ["invites", "player_links", "minors", "guardian_consents", "deletion_log", "waitlist"]) {
    const r = await as("head", `select count(*) from public.${t}`);
    check(!!r.error, `no client can read ${t} directly`);
  }

  console.log("3. No direct writes");
  let blocked = true;
  for (const t of TABLES) {
    for (const who of ["head", "pl1", "anon"]) {
      const ins = await as(who, `insert into public.${t} (program_id, id, doc) values ($1, 'zz', '{"id":"zz","updatedAt":1}')`, [tA]);
      const upd = await as(who, `update public.${t} set doc = doc || '{"x":1}' where program_id = $1`, [tA]);
      const del = await as(who, `delete from public.${t} where program_id = $1`, [tA]);
      if (!ins.error || (!upd.error && upd.rowCount) || (!del.error && del.rowCount)) { blocked = false; console.log(`     ${who} ${t}`); }
    }
  }
  check(blocked && (await su.query("select count(*)::int n from public.events where program_id = $1", [tA])).rows[0].n === 2, "inserts, updates and deletes outside pc_push are refused for every table and role, and nothing changed");
  const memberEdit = await as("viewer", "update public.members set role = 'head' where user_id = $1", [U.viewer]);
  check(!!memberEdit.error || memberEdit.rowCount === 0, "nobody can edit his own membership directly");

  console.log("4. Helpers aren't part of the API");
  const exposed = (await su.query("select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname in ('pc_can_read','pc_can_write','pc_can','pc_role','pc_team_active','pc_my_pitchers','pc_preset_perms','pc_owner_can_manage','pc_my_email')")).rows;
  check(exposed.length === 0, "no permission helper lives in the public schema (the API's)");
  const rls = (await su.query("select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relkind = 'r' and not relrowsecurity")).rows;
  check(rls.length === 0, `row level security is on for every public table${rls.length ? " (off: " + rls.map((r) => r.relname).join(", ") + ")" : ""}`);
  const anonFns = (await su.query("select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'pc\\_%' and has_function_privilege('anon', p.oid, 'execute')")).rows;
  check(anonFns.length === 0, `anon can execute no pc_ function${anonFns.length ? " (" + anonFns.map((r) => r.proname).join(", ") + ")" : ""}`);
  const definer = (await su.query("select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.prosecdef and not ('search_path=\"\"' = any (coalesce(p.proconfig, '{}'::text[])))")).rows;
  check(definer.length === 0, `every security definer function pins an empty search_path${definer.length ? " (" + definer.map((r) => r.proname).join(", ") + ")" : ""}`);

  // ---------------------------------------------------------------- push
  console.log("5. Writes through pc_push");
  const sess = (id, pit, extra = {}) => Object.assign({ id, updatedAt: now(), pitcherId: pit, gameId: null }, extra);
  let r = await push("pl1", tA, "sessions", [sess("s-new", "p2")]);
  check(r.rejected && r.rejected[0].reason === "not allowed" && (await su.query("select count(*)::int n from public.sessions where id = 's-new'")).rows[0].n === 0, "a player can't write a session for a teammate");
  r = await push("pl1", tA, "sessions", [sess("sessions-a2", "p1")]);
  check(r.rejected[0].reason === "not allowed" && (await su.query("select doc->>'pitcherId' p from public.sessions where id = 'sessions-a2'")).rows[0].p === "p2", "nor take over a teammate's existing session by claiming it as his");
  r = await push("pl1", tA, "sessions", [sess("s-mine", "p1"), { id: "bad", updatedAt: "x" }]);
  check(r.applied === 1 && r.rejected.length === 1, "a player writes his own session, and one bad record doesn't fail the batch");
  r = await push("xhead", tA, "events", [sess("e-x", "p1")]);
  check(!!r.error && /not a member/.test(r.error), "another team's coach can't push into this team at all");
  r = await push("owner", tA, "events", [sess("e-o", "p1")]);
  check(!!r.error, "nor can the owner without membership");
  r = await push("pitching", tA, "pitchers", [{ id: "p9", updatedAt: now(), name: "New" }]);
  check(r.rejected[0].reason === "not allowed", "a pitching coach can't add a roster spot (manage_roster)");
  r = await push("pitching", tA, "pitchers", [{ id: "p5", updatedAt: now(), name: "Pitcher p5", pitches: [{ id: "pt1", name: "Fastball", grade: 4 }] }]);
  check(r.applied === 1, "but can change a pitcher's grades (edit_grades)");
  r = await push("head", tA, "pitchers", [{ id: "p9", updatedAt: now(), name: "New" }, { id: "p5", updatedAt: now() + 5, deletedAt: now(), name: "Pitcher p5" }]);
  check(r.applied === 2, "the head coach adds a roster spot and removes one");
  r = await push("pl1", tA, "pitchers", [{ id: "p1", updatedAt: now(), deletedAt: now() }]);
  check(r.rejected[0].reason === "not allowed", "a player can't remove his own roster spot");
  r = await push("pl1", tA, "pitchers", [{ id: "p1", updatedAt: now() + 10, name: "Pitcher p1", role: "Closer", notes: "I'm the ace", pitchLimit: 200, pitches: [{ id: "pt1", name: "Fastball", grade: 5 }] }]);
  let p1 = (await su.query("select doc from public.pitchers where id = 'p1'")).rows[0].doc;
  check(r.applied === 1 && p1.pitches[0].grade === 5 && p1.role === "SP" && p1.notes === "coach note" && p1.pitchLimit === 80,
    "a player's edit keeps his grade change and drops coach-only fields (role, notes, fatigue point)");
  check(r.server.length === 1 && r.server[0].doc.role === "SP", "and the server's merged copy goes back so his iPad shows the truth");
  r = await push("pl1", tA, "pitchers", [{ id: "p1", updatedAt: 4102444800000, name: "Pitcher p1", pitches: [{ id: "pt1", name: "Fastball", grade: 5 }] }]);
  p1 = (await su.query("select doc from public.pitchers where id = 'p1'")).rows[0].doc;
  check(p1.updatedAt <= now() + 120000 && r.server.length === 1, `a timestamp from the year 2100 is pulled back to now (${p1.updatedAt})`);
  await new Promise((res) => setTimeout(res, 20));
  r = await push("head", tA, "pitchers", [Object.assign({}, p1, { updatedAt: now(), notes: "revert" })]);
  check(r.applied === 1 && (await su.query("select doc->>'notes' n from public.pitchers where id = 'p1'")).rows[0].n === "revert", "so a coach's later edit still wins");

  console.log("6. Locked teams and pulls");
  r = await pull("pl1", tA, "events");
  check(r.rows.length === 0 && r.locked === false, "a player's pull of events returns nothing");
  r = await pull("pl1", tA, "sessions");
  check(r.rows.every((d) => d.pitcherId === "p1") && r.rows.length === 2, "his pull of sessions returns only his own");
  const headA = await pull("head", tA, "events"), headB = await pull("head", tB, "events");
  check(headA.rows.length === 2 && headB.rows.length === 0, "a coach on two teams pulls each team's rows separately");
  const acc1 = (await pull("viewer", tA, "events")).access;
  await as("head", "select public.pc_set_member($1, $2, 'viewer', '{\"call_games\": true}'::jsonb)", [tA, U.viewer]);
  const acc2 = (await pull("viewer", tA, "events")).access;
  check(acc1 !== acc2, "the pull's access string changes when a coach's toggles change, so his iPad starts its cursors over");
  r = await push("viewer", tA, "events", [sess("e-viewer", "p1")]);
  check(r.applied === 1, "a viewer given the call_games toggle can log pitches");
  await su.query("update public.organizations set billing_status = 'locked' where id = $1", [org1]);
  r = await push("head", tA, "events", [sess("e-locked", "p1")]);
  check(r.rejected[0].reason === "team_locked", "on a locked organization every pushed row comes back team_locked");
  r = await pull("head", tA, "events");
  check(r.rows.length === 0 && r.locked === true, "and a pull says locked and returns nothing");
  check((await count("head", "events", tA)) === 0, "direct reads see nothing either");
  check(!(await as("owner", "select public.pc_invite($1, 'viewer')", [tA])).error === false, "while locked, even the owner can't manage staff");
  await su.query("update public.organizations set billing_status = 'active' where id = $1", [org1]);
  for (const [s, ends, expect] of [["pending", null, false], ["removed", null, false], ["ending", "now() - interval '1 minute'", false], ["ending", "now() + interval '1 day'", true]]) {
    await su.query(`update public.programs set status = $2, ends_at = ${ends || "null"} where id = $1`, [tA, s]);
    const ok = (await one("head", "select private.pc_can($1, 'call_games') r", [tA]));
    check(ok === expect, `a team that is ${s}${ends ? (expect ? " until tomorrow" : " since a minute ago") : ""} ${expect ? "still works" : "doesn't work"}`);
  }
  await su.query("update public.programs set status = 'removed', ends_at = null where id = $1", [tB]);
  await su.query("update public.organizations set billing_status = 'locked' where id = $1", [org1]);
  await su.query("update public.organizations set billing_status = 'active' where id = $1", [org1]);
  check((await one("head", "select private.pc_team_active($1) r", [tB])) === false, "unlocking the organization doesn't bring back a removed team");
  await su.query("update public.programs set status = 'active', ends_at = null where id = $1", [tA]);

  // ---------------------------------------------------------------- invites and members
  console.log("7. Invites");
  const coachTok = await one("head", "select public.pc_invite($1, 'caller', null, 'newcoach@x.org') r", [tA]);
  check(typeof coachTok === "string" && coachTok.length === 64, "a head coach creates a coach invite (a 64-character token)");
  check(!!(await as("caller", "select public.pc_invite($1, 'viewer')", [tA])).error, "a caller can't invite coaches");
  check(!!(await as("pitching", "select public.pc_invite($1, 'player', 'p9')", [tA])).error, "a pitching coach can't invite players");
  check(!(await as("owner", "select public.pc_invite($1, 'head')", [tA])).error, "the owner can, without being on the team");
  check(!!(await as("nonmember", "select public.pc_accept_invite($1)", [coachTok])).error, "an invite tied to an email can't be used from another account");
  U.newcoach = crypto.randomUUID(); await su.query("insert into auth.users values ($1, 'newcoach@x.org', now())", [U.newcoach]);
  r = await one("newcoach", "select public.pc_accept_invite($1) r", [coachTok]);
  check(r.status === "joined" && (await teams("newcoach")).some((t) => t.team_id === tA && t.role === "caller"), "the right account joins as the invited preset");
  check(!!(await as("newcoach", "select public.pc_accept_invite($1)", [coachTok])).error, "the same link can't be used twice");
  const linkTok = await one("head", "select public.pc_invite($1, 'viewer') r", [tA]);
  await as("head", "select public.pc_cancel_invite($1)", [linkTok]);
  check(!!(await as("nonmember", "select public.pc_accept_invite($1)", [linkTok])).error, "a cancelled link can't be used");
  const oldTok = await one("head", "select public.pc_invite($1, 'viewer') r", [tA]);
  await su.query("update public.invites set created_at = now() - interval '15 days' where token = $1", [oldTok]);
  check(!!(await as("nonmember", "select public.pc_accept_invite($1)", [oldTok])).error, "a link older than 14 days can't be used");
  check(!!(await as("unconfirmed", "select public.pc_accept_invite($1)", [await one("head", "select public.pc_invite($1, 'viewer', null, 'unconfirmed@x.org') r", [tA])])).error, "an unconfirmed email can't accept an invite sent to it");
  check(!!(await as("head", "select public.pc_invite($1, 'player', 'nope')", [tA])).error, "a player invite must name a pitcher on this roster");
  check(!!(await as("head", "select public.pc_invite($1, 'player', 'p1')", [tA])).error, "and one that nobody has claimed yet");

  console.log("8. Members");
  check(!!(await as("head", "select public.pc_set_member($1, $2, 'viewer', '{\"is_owner\": true}'::jsonb)", [tA, U.viewer])).error, "an unknown toggle is refused");
  check(!!(await as("head", "select public.pc_set_member($1, $2, 'head')", [tA, U.pl1])).error, "a player can't be turned into a coach");
  check(!!(await as("head", "select public.pc_set_member($1, $2, 'viewer')", [tC, U.xhead])).error, "a coach can't change another team's staff");
  check(!!(await as("pitching", "select public.pc_remove_member($1, $2)", [tA, U.caller])).error, "a pitching coach can't remove a coach");
  check(!(await as("head", "select public.pc_set_member($1, $2, 'caller', '{\"manage_staff\": true}'::jsonb)", [tA, U.newcoach])).error, "a head coach gives a coach the manage_staff toggle");
  check(!(await as("pl2", "select public.pc_remove_member($1, $2)", [tA, U.pl2])).error && (await teams("pl2")).length === 0, "a player can leave on his own");
  await as("head", "select public.pc_remove_member($1, $2)", [tA, U.newcoach]);
  check((await count("newcoach", "events", tA)) === 0 && !!(await push("newcoach", tA, "events", [sess("e-gone", "p1")])).error, "a removed coach can't read or push anything");

  console.log("9. Players under 13");
  check(!!(await as("head", "select public.pc_invite($1, 'player', 'p9', null, true)", [tA])).error, "an under-13 invite needs a parent's email");
  await push("head", tA, "pitchers", [{ id: "p8", updatedAt: now(), name: "Little Kid", number: "8", gradYear: "2034", pitches: [] }]);
  const kidTok = await one("head", "select public.pc_invite($1, 'player', 'p8', 'parent@x.org', true) r", [tA]);
  const stripped = (await su.query("select doc from public.pitchers where id = 'p8'")).rows[0].doc;
  check(!stripped.name && !stripped.gradYear && stripped.number === "8", "flagging a child under 13 strips his record to a placeholder (no name, no grad year)");
  r = await push("head", tA, "pitchers", [{ id: "p8", updatedAt: now() + 50, name: "Little Kid", number: "8" }]);
  check(/consent/.test(r.rejected[0].reason), "before consent a coach can't put his name back");
  check(!!(await as("kid", "select public.pc_record_guardian_consent($1, 'checkbox')", [kidTok])).error, "the child's own account can't give consent");
  check(!!(await as("kid", "select public.pc_accept_invite($1)", [kidTok])).error, "or accept the invite");
  check(!!(await as("parent", "select public.pc_accept_invite($1)", [kidTok])).error, "even the parent can't accept before consenting");
  check(!(await as("parent", "select public.pc_record_guardian_consent($1, 'checkbox')", [kidTok])).error, "the parent the invite was sent to gives consent");
  r = await one("parent", "select public.pc_accept_invite($1) r", [kidTok]);
  check(r.status === "joined" && (await teams("parent")).find((t) => t.team_id === tA).pitcher_ids.includes("p8"), "then accepts, and the child's record is linked to the parent's account");
  r = await push("head", tA, "pitchers", [{ id: "p8", updatedAt: now() + 100, name: "Little Kid", number: "8" }]);
  check(r.applied === 1, "after consent the coach can fill in the record");
  // the no-email link path
  await push("head", tA, "pitchers", [{ id: "p7", updatedAt: now(), name: "Another Kid", number: "7" }]);
  const openTok = await one("head", "select public.pc_invite($1, 'player', 'p7') r", [tA]);
  r = await one("kid", "select public.pc_accept_invite($1, true) r", [openTok]);
  check(r.status === "parent_email_required" && !(await teams("kid")).length, "a child who says he is under 13 on an open link isn't linked; he's asked for a parent's email");
  r = await one("kid", "select public.pc_accept_invite($1, true, 'Mom@X.org') r", [openTok]);
  const parentInv = (await su.query("select email, under13 from public.invites where pitcher_id = 'p7' and used_at is null")).rows;
  check(r.status === "parent_invite_sent" && parentInv.length === 1 && parentInv[0].email === "mom@x.org" && parentInv[0].under13, "then a new under-13 invite goes to that parent");
  check(!!(await as("kid", "select public.pc_accept_invite($1)", [openTok])).error && !(await su.query("select doc->>'name' n from public.pitchers where id = 'p7'")).rows[0].n, "the open link is used up, and his record is already stripped");
  check(!!(await as("head", "select public.pc_delete_minor($1, 'p8')", [tA])).error, "a coach can't hard-delete a child's data");
  await push("head", tA, "sessions", [sess("s-kid", "p8")]);
  check(!(await as("parent", "select public.pc_delete_minor($1, 'p8')", [tA])).error, "the consenting parent can");
  const left = await su.query("select (select count(*) from public.pitchers where id = 'p8') + (select count(*) from public.sessions where pitcher_id = 'p8') + (select count(*) from public.player_links where pitcher_id = 'p8') + (select count(*) from public.guardian_consents where pitcher_id = 'p8') + (select count(*) from public.minors where pitcher_id = 'p8') n");
  const log = (await su.query("select * from public.deletion_log")).rows;
  check(+left.rows[0].n === 0 && log.length === 1 && !JSON.stringify(log).includes("p8") && !JSON.stringify(log).includes("Little"), "every row about the child is gone, and the log keeps only a hash");
  check((await teams("parent")).find((t) => t.team_id === tA).pitcher_ids.join() === "p3,p4", "the parent keeps his other children's links");

  console.log("10. Ownership");
  check(!!(await as("head", "select public.pc_transfer_owner($1, $2)", [org1, U.head])).error, "a coach can't take the organization");
  check(!!(await as("owner", "select public.pc_transfer_owner($1, $2)", [org1, U.nonmember])).error, "the owner can't hand it to someone outside its teams");
  check(!!(await as("owner", "select public.pc_transfer_owner($1, $2)", [org1, U.pl1])).error, "or to a player");
  check(!(await as("owner", "select public.pc_transfer_owner($1, $2)", [org1, U.head])).error, "he hands it to a coach on one of its teams");
  check((await teams("head")).every((t) => t.is_owner) && (await teams("owner")).length === 0, "the coach is now the owner, and the old owner has nothing");

  await conn.end(); await su.end();
  const z = new Client({ connectionString: BASE }); await z.connect(); await z.query(`drop database if exists ${DB}`); await z.end();
  console.log(fails ? `\n${fails} of ${checks} team check(s) FAILED` : `\nall ${checks} team checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
