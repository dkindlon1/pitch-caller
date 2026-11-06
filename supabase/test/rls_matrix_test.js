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
    const own = ["checkins", "sessions", "readings"].includes(t) ? 1 : 0;   // his pitcher record only through pc_pull (no coach notes)
    if ((await count("pl1", t, tA)) !== own) { allPlayer = false; console.log(`     pl1 ${t}: ${await count("pl1", t, tA)} (want ${own})`); }
    for (const who of ["owner", "nonmember", "xhead"]) { const n = await count(who, t, tA); if (n !== 0 && n !== "denied") { allNone = false; console.log(`     ${who} ${t}: ${n}`); } }
    const an = await count("anon", t, tA); if (an !== "denied" && an !== 0) { allNone = false; console.log(`     anon ${t}: ${an}`); }
  }
  check(allCoach, "every coach preset sees all of its own team's rows in every table");
  check(allPlayer, "reading the tables, a player sees only his own check-ins, sessions and readings: no pitcher records, events, games, hitters, packs or learned values");
  const plPull = await pull("pl1", tA, "pitchers");
  check(plPull.rows.length === 1 && plPull.rows[0].id === "p1" && !("notes" in plPull.rows[0]), "his own pitcher record comes through pc_pull, without the coaches' notes");
  check(allNone, "the owner without membership, a stranger, another team's coach and anon see nothing of the team");
  check((await count("head", "events", tC)) === 0, "a coach on team A sees nothing of team C");
  check((await pull("parent", tA, "pitchers")).rows.map((x) => x.id).sort().join() === "p3,p4", "the parent's pull has both siblings' records");
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
  check(!!(await as("kid", "select public.pc_accept_invite($1)", [openTok])).error && (await su.query("select doc->>'name' n from public.pitchers where id = 'p7'")).rows[0].n === "Another Kid", "the open link is used up; his record is untouched until a coach approves the parent's email");
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

  console.log("11. The age question comes before an account");
  {
    const doc = { id: "p11", updatedAt: 1000, teamId: "ours", name: "Young arm", number: "11", hand: "R", notes: "coach note", pitches: [{ id: "pt1", name: "Fastball", grade: 3 }] };
    await su.query("insert into public.pitchers (program_id, id, doc) values ($1, 'p11', $2)", [tA, doc]);
    const kidTok = await one("head", "select public.pc_invite($1, 'player', 'p11') r", [tA]);
    const toParent = (who, tok, pe) => one(who, "select public.pc_invite_to_parent($1, $2) r", [tok, pe]);
    for (const who of ["anon", "nonmember", "head"]) check(!!(await toParent(who, kidTok, "mom@x.org")).error, `${who === "anon" ? "a visitor" : who === "head" ? "a coach" : "a signed-in account"} can't call the website-only function`);
    check((await toParent("service", kidTok, "not an email")).status === "parent_email_required", "the website's server needs a real parent email");
    check(!!(await toParent("service", await one("head", "select public.pc_invite($1, 'viewer') r", [tA]), "mom@x.org")).error, "a coach invite can't be moved to a parent");
    r = await toParent("service", kidTok, "Mom@X.org");
    const moved = (await su.query("select token, email, under13, pitcher_id from public.invites where program_id = $1 and pitcher_id = 'p11' and used_at is null", [tA])).rows;
    const held = (await su.query("select doc from public.pitchers where program_id = $1 and id = 'p11'", [tA])).rows[0].doc;
    check(r.status === "parent_invite_sent" && moved.length === 1 && moved[0].under13 && moved[0].pitcher_id === "p11", "an under-13 answer moves the invite to the parent's email, marked under 13");
    check(held.name === "Young arm", "nothing about him changes on the say-so of whoever opened the link");
    check(!(await as("head", "select public.pc_approve_invite($1)", [moved[0].token])).error, "(a coach approves the parent's email)");
    const held2 = (await su.query("select doc from public.pitchers where program_id = $1 and id = 'p11'", [tA])).rows[0].doc;
    check(!("name" in held2) && !("notes" in held2) && held2.number === "11", `then his record is held to the placeholder until the parent consents (${Object.keys(held2).sort().join(",")})`);
    check(!!(await as("nonmember", "select public.pc_accept_invite($1)", [kidTok])).error, "the link the child opened no longer works");
    check((await toParent("service", moved[0].token, "dad@x.org")).status === "for_parent", "the parent's own link can't be moved again");
  }

  const usable = async (tok) => +(await su.query("select count(*) n from public.invites where token = $1 and used_at is null and cancelled_at is null", [tok])).rows[0].n === 1;
  console.log("12. The independent review's findings stay fixed");
  {
    const user = async (n) => { U[n] = crypto.randomUUID(); await su.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [U[n], n + "@x.org"]); };
    for (const n of ["f1", "atk", "mom2", "kid2", "pc2", "h2"]) await user(n);
    const pit = async (id, extra = {}) => push("head", tA, "pitchers", [Object.assign({ id, updatedAt: now(), name: "Name " + id, number: "2" + id.slice(-1), notes: "coach note", pitches: [] }, extra)]);
    const inv = (who, pid, email = null, u13 = false) => one(who, "select public.pc_invite($1, 'player', $2, $3, $4) r", [tA, pid, email, u13]);

    // H1: a spare link for a pitcher someone already speaks for can't be used to pose as his parent
    await pit("r1");
    const t1 = await inv("head", "r1"), t2 = await inv("head", "r1");
    check(!(await usable(t1)) && (await usable(t2)), "H1: a new invite for a pitcher cancels the last one (one open link per pitcher)");
    await one("f1", "select public.pc_accept_invite($1) r", [t2]);
    check(!!(await as("atk", "select public.pc_accept_invite($1, true, 'atk@evil.org')", [t1])).error, "H1: the old link can't claim to be a child's and send an invite to an 'atk' parent");
    const t3 = await su.query("insert into public.invites (program_id, role, pitcher_id) values ($1, 'player', 'r1') returning token", [tA]).then((x) => x.rows[0].token);
    r = await as("atk", "select public.pc_accept_invite($1, true, 'atk@evil.org') r", [t3]);
    const r1 = (await su.query("select doc from public.pitchers where program_id = $1 and id = 'r1'", [tA])).rows[0].doc;
    check(!!r.error && /already has an account/.test(r.error) && r1.name === "Name r1", "H1: even a link made some other way can't flag a linked pitcher as a minor or strip his record");
    // H1 (minor case) and M1: consent is never replaced, a coach approves a player-typed parent email, the player can't be his own parent
    await pit("r2");
    const t4 = await inv("head", "r2");
    r = await one("kid2", "select public.pc_accept_invite($1, true, 'kid2@x.org') r", [t4]);
    check(r.status === "parent_email_required", "M1: a child can't give his own email as the parent's");
    r = await one("kid2", "select public.pc_accept_invite($1, true, 'mom2@x.org') r", [t4]);
    const pinv = (await su.query("select token, needs_approval, declared_by from public.invites where program_id = $1 and pitcher_id = 'r2' and used_at is null and cancelled_at is null", [tA])).rows;
    check(r.status === "parent_invite_sent" && pinv.length === 1 && pinv[0].needs_approval && pinv[0].declared_by === U.kid2, "the parent invite a player asked for waits for a coach");
    check(!!(await as("mom2", "select public.pc_record_guardian_consent($1, 'checkbox')", [pinv[0].token])).error, "M1: before a coach approves it, nobody can consent with it");
    check(!!(await as("caller", "select public.pc_approve_invite($1)", [pinv[0].token])).error, "a coach without the roster can't approve it");
    const staffRow = ((await as("head", "select * from public.pc_staff($1)", [tA])).rows || []).find((x) => x.token === pinv[0].token);
    check(staffRow && staffRow.needs_approval === true, "the staff list shows it waiting for approval");
    check(!(await as("head", "select public.pc_approve_invite($1)", [pinv[0].token])).error, "the head coach approves it");
    check(!(await as("mom2", "select public.pc_record_guardian_consent($1, 'checkbox')", [pinv[0].token])).error && (await one("mom2", "select public.pc_accept_invite($1) r", [pinv[0].token])).status === "joined", "then the parent consents and joins");
    await su.query("insert into public.invites (program_id, role, pitcher_id, email, under13) values ($1, 'player', 'r2', 'atk@x.org', true)", [tA]);
    const t5 = (await su.query("select token from public.invites where email = 'atk@x.org'")).rows[0].token;
    check(!!(await as("atk", "select public.pc_record_guardian_consent($1, 'checkbox')", [t5])).error && (await su.query("select guardian_user_id g from public.guardian_consents where program_id = $1 and pitcher_id = 'r2'", [tA])).rows[0].g === U.mom2, "H1: a second 'parent' can't replace the one who consented");
    check(!!(await as("atk", "select public.pc_delete_minor($1, 'r2')", [tA])).error, "H1: and so can't delete the child's data");

    // H3: before consent, nothing about the child goes in
    await pit("r3", { name: "Johnny" });
    await push("head", tA, "checkins", [sess("ck-r3-old", "r3", { arm: 3 })]);
    await as("head", "select public.pc_mark_minor($1, 'r3')", [tA]);
    check(+(await su.query("select count(*) n from public.checkins where id = 'ck-r3-old'")).rows[0].n === 0, "H3: flagging a child removes his check-ins from the server too");
    for (const [label, doc] of [["a name in the number", { number: "Johnny Smith DOB 2015" }], ["an object in createdAt", { createdAt: { name: "Johnny" } }], ["a school in teamId", { teamId: { school: "Elm" } }]]) {
      r = await push("head", tA, "pitchers", [Object.assign({ id: "r3", updatedAt: now() + 1000 }, doc)]);
      check(r.rejected && r.rejected.length === 1 && /consent/.test(r.rejected[0].reason), `H3: the placeholder can't carry ${label}`);
    }
    for (const [t, row] of [["checkins", sess("ck-r3", "r3", { arm: 2 })], ["sessions", sess("ss-r3", "r3")], ["readings", sess("rd-r3", "r3")], ["events", sess("ev-r3", "r3", { type: "pitch" })], ["learned", { id: "p:r3", updatedAt: now() }]]) {
      r = await push("head", tA, t, [row]);
      check(r.rejected && r.rejected.length === 1 && /consent/.test(r.rejected[0].reason), `H3: his ${t} wait on the iPad until a parent agrees`);
    }
    r = await push("head", tA, "packs", [{ id: "pk-r3", updatedAt: now(), gameId: "g1", staff: [{ pitcherId: "p1", name: "Ace" }, { pitcherId: "r3", name: "Johnny" }] }]);
    check(r.rejected && /consent/.test(r.rejected[0].reason), "H3: and so does a game pack that names him");

    // H2: a deleted child's data can't come back
    await pit("r4", { name: "Deleted Kid" });
    const t6 = await inv("head", "r4", "mom2@x.org", true);
    await as("mom2", "select public.pc_record_guardian_consent($1, 'checkbox')", [t6]); await one("mom2", "select public.pc_accept_invite($1) r", [t6]);
    await push("head", tA, "events", [sess("ev-r4", "r4", { type: "pitch" })]);
    await push("head", tA, "packs", [{ id: "pk-r4", updatedAt: now(), gameId: "g1", staff: [{ pitcherId: "p1", name: "Ace" }, { pitcherId: "r4", name: "Deleted Kid" }] }]);
    check(!(await as("mom2", "select public.pc_delete_minor($1, 'r4')", [tA])).error, "(the parent deletes the child's data)");
    const evDoc = (await su.query("select doc from public.events where id = 'ev-r4'")).rows[0].doc;
    const pk = JSON.stringify((await su.query("select doc from public.packs where id = 'pk-r4'")).rows[0].doc);
    check(/^removed_/.test(evDoc.pitcherId) && !pk.includes("Deleted Kid") && !pk.includes('"r4"'), "H2: the game keeps the pitch under a stand-in, and the pack no longer names him");
    r = await push("head", tA, "pitchers", [{ id: "r4", updatedAt: now() + 5000, name: "Deleted Kid", number: "24" }]);
    check(r.rejected && r.rejected[0].reason === "purged" && +(await su.query("select count(*) n from public.pitchers where id = 'r4'")).rows[0].n === 0, "H2: an iPad sending his record again is refused, for good");
    r = await push("head", tA, "checkins", [sess("ck-r4", "r4", { arm: 4 })]);
    check(r.rejected && r.rejected[0].reason === "purged", "H2: so are his check-ins");
    r = await push("head", tA, "events", [sess("ev-r4-late", "r4", { type: "pitch" })]);
    const late = (await su.query("select doc from public.events where id = 'ev-r4-late'")).rows[0];
    check(r.applied === 1 && late && /^removed_/.test(late.doc.pitcherId) && r.server.length === 1, "H2: a pitch charted offline before the deletion goes in under the stand-in, and the iPad gets that copy back");
    const pl = await pull("head", tA, "pitchers");
    check(Array.isArray(pl.purged) && pl.purged.includes("r4"), "H2: a coach's pull lists him so his iPad deletes its copies");
    check(!(await pull("pl1", tA, "pitchers")).purged.length, "and a player's pull lists nothing");

    // M3: one link, one use, even at the same moment
    const t7 = await one("head", "select public.pc_invite($1, 'viewer') r", [tA]);
    const c2 = new Client({ connectionString: dbUrl(DB) }); await c2.connect();
    const claims = (n) => JSON.stringify({ sub: U[n], role: "authenticated" });
    await conn.query("begin"); await conn.query("set local role authenticated"); await conn.query("select set_config('request.jwt.claims', $1, true)", [claims("pc2")]);
    await conn.query("select public.pc_accept_invite($1)", [t7]);
    const second = (async () => {
      try { await c2.query("begin"); await c2.query("set local role authenticated"); await c2.query("select set_config('request.jwt.claims', $1, true)", [claims("h2")]);
        await c2.query("select public.pc_accept_invite($1)", [t7]); await c2.query("commit"); return "joined"; }
      catch (e) { await c2.query("rollback"); return e.message; }
    })();
    // commit only once the second accept is waiting on the first's lock, so the race is really exercised
    let blocked = false;
    for (let i = 0; i < 100 && !blocked; i++) { blocked = (await su.query("select count(*) n from pg_stat_activity where wait_event_type = 'Lock' and query like '%pc_accept_invite%'")).rows[0].n > 0; if (!blocked) await new Promise((res) => setTimeout(res, 50)); }
    await conn.query("commit");
    const out = await second; await c2.end();
    const both = +(await su.query("select count(*) n from public.members where program_id = $1 and user_id in ($2, $3)", [tA, U.pc2, U.h2])).rows[0].n;
    check(blocked && /expired or was already used/.test(out) && both === 1, `M3: two accepts of one link at once (the second blocked on the first: ${blocked}): one joins, the other is told it's used (${out})`);

    // M5: nobody gives or takes more than he has; a team keeps a head coach
    await as("head", "select public.pc_set_member($1, $2, 'pitching', '{\"manage_staff\":true}')", [tA, U.pitching]);
    check(!!(await as("pitching", "select public.pc_set_member($1, $2, 'head')", [tA, U.pitching])).error, "M5: a coach with the staff toggle can't make himself head");
    check(!!(await as("pitching", "select public.pc_set_member($1, $2, 'viewer')", [tA, U.head])).error, "M5: or demote the head coach");
    check(!!(await as("pitching", "select public.pc_remove_member($1, $2)", [tA, U.head])).error, "M5: or remove him");
    check(!!(await as("pitching", "select public.pc_invite($1, 'head')", [tA])).error, "M5: or invite a head coach");
    check(!(await as("pitching", "select public.pc_invite($1, 'caller')", [tA])).error, "but can invite a pitch caller (within what he has)");
    await as("head", "select public.pc_set_member($1, $2, 'pitching')", [tA, U.pitching]);
    // "head" owns the organization since section 10; the owner may always manage. pc2 becomes the only other head.
    await as("head", "select public.pc_set_member($1, $2, 'head')", [tA, U.pc2]);
    await as("head", "select public.pc_set_member($1, $2, 'viewer')", [tA, U.head]);
    const heads = (await su.query("select user_id from public.members where program_id = $1 and role = 'head'", [tA])).rows.map((x) => x.user_id);
    check(heads.join() === U.pc2 && !!(await as("pc2", "select public.pc_remove_member($1, $2)", [tA, U.pc2])).error, "M5: the last head coach can't leave the team headless");
    check(!!(await as("pc2", "select public.pc_set_member($1, $2, 'viewer')", [tA, U.pc2])).error, "nor demote himself");
    await as("head", "select public.pc_set_member($1, $2, 'head')", [tA, U.head]);

    // M4: the people tables look up the caller once per query
    await su.query(`insert into public.organizations (id, name, owner_id) select gen_random_uuid(), 'bulk', $1 from generate_series(1, 1)`, [U.xhead]);
    const bulkOrg = (await su.query("select id from public.organizations where name = 'bulk'")).rows[0].id;
    await su.query("insert into public.programs (id, name, org_id) select gen_random_uuid(), 'bulk ' || i, $1 from generate_series(1, 1000) i", [bulkOrg]);
    await su.query("insert into auth.users (id, email) select gen_random_uuid(), 'bulk' || i || '@x.org' from generate_series(1, 20000) i");
    await su.query(`insert into public.members (program_id, user_id, role) select t.id, u.id, 'viewer' from (select id, row_number() over () rn from public.programs where name like 'bulk %') t
                    join (select id, row_number() over () rn from auth.users where email like 'bulk%') u on (u.rn % 1000) + 1 = t.rn`);
    const n = +(await su.query("select count(*) n from public.members")).rows[0].n;
    let t0 = Date.now(); await as("nonmember", "select * from public.members"); const msM = Date.now() - t0;
    t0 = Date.now(); await as("nonmember", "select * from public.programs"); const msP = Date.now() - t0;
    check(msM < 150 && msP < 150, `M4: an account on no team reads ${n} member rows' table in ${msM} ms and programs in ${msP} ms`);

    // L1, L3, L5, L6
    check(!!(await as("pl1", "select stripe_customer_id from public.organizations")).error && !(await as("pl1", "select id, name from public.organizations")).error, "L1: nobody signed in can read the Stripe ids; the name is fine");
    check(!!(await as("head", "select private.pc_strip_minor($1, 'p1')", [tA])).error && !!(await as("head", "select private.pc_flag_minor($1, 'p1')", [tA])).error, "L3: the helpers that change data can't be called directly");
    check(!!(await as("head", "lock table public.pitchers in access exclusive mode")).error, "L3: nor can a signed-in user lock a table (Postgres 17's MAINTAIN)");
    const mine = (await pull("pl1", tA, "pitchers")).rows.find((x) => x.id === "p1");
    check(mine && !("notes" in mine) && mine.name, "L5: a player's copy of his record leaves out the coaches' notes");
    r = await push("pl1", tA, "pitchers", [{ id: "p1", updatedAt: now() + 9000, name: "Ace (his edit)", deletedAt: null }]);
    const p1 = (await su.query("select doc from public.pitchers where program_id = $1 and id = 'p1'", [tA])).rows[0].doc;
    check(r.applied === 1 && p1.name === "Ace (his edit)" && !!p1.notes && !("notes" in r.server[0].doc), "L6: deletedAt: null is no delete, and his edit keeps the notes on the server without sending them to him");
  }

  console.log("14. The second review's findings stay fixed");
  {
    const user = async (n) => { U[n] = crypto.randomUUID(); await su.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [U[n], n + "@x.org"]); };
    for (const n of ["mom3", "mom4", "h3", "o3", "v3"]) await user(n);
    const evCount = async (pid) => +(await su.query("select count(*) n from public.events where program_id = $1 and pitcher_id = $2", [tA, pid])).rows[0].n;
    const pdoc = async (pid) => ((await su.query("select doc from public.pitchers where program_id = $1 and id = $2", [tA, pid])).rows[0] || {}).doc;
    // N1: a claim nobody approved changes nothing
    await push("head", tA, "pitchers", [{ id: "p20", updatedAt: now(), name: "Senior Ace", number: "20", notes: "coach note", pitches: [{ id: "f", name: "Fastball", grade: 5 }] }]);
    await push("head", tA, "events", [sess("ev20a", "p20", { type: "pitch" }), sess("ev20b", "p20", { type: "pitch" })]);
    await push("head", tA, "checkins", [sess("ck20", "p20", { arm: 4 })]);
    await push("head", tA, "packs", [{ id: "pk20", updatedAt: now(), gameId: "g20", staff: [{ pitcherId: "p20", name: "Senior Ace" }] }]);
    const t20 = await one("head", "select public.pc_invite($1, 'player', 'p20') r", [tA]);
    r = await one("viewer", "select public.pc_accept_invite($1, true, 'whoever@x.org') r", [t20]);
    const pk20 = JSON.stringify((await su.query("select doc from public.packs where id = 'pk20'")).rows[0].doc);
    check(r.status === "parent_invite_sent" && (await pdoc("p20")).name === "Senior Ace" && (await evCount("p20")) === 2
      && +(await su.query("select count(*) n from public.checkins where id = 'ck20'")).rows[0].n === 1 && pk20.includes("Senior Ace"),
      "N1: someone saying a pitcher is under 13 strips, deletes and moves nothing until a coach approves");
    const tie = await one("head", "select public.pc_invite($1, 'player', 'p20', 'pl10@x.org') r", [tA]);
    r = await one("service", "select public.pc_invite_to_parent($1, 'evil3@x.org') r", [tie]);
    check(!!r.error && /sent to an email/.test(r.error) && (await pdoc("p20")).name === "Senior Ace", "N1: the website path can't redirect an invite sent to someone's email");
    // a coach's yes holds his data; the game pitches wait under a random id and come back
    const pinv20 = await one("head", "select public.pc_invite($1, 'player', 'p20', 'mom3@x.org', true) r", [tA]);
    const held = (await su.query("select held_id from public.minors where program_id = $1 and pitcher_id = 'p20'", [tA])).rows[0].held_id;
    check(!(await pdoc("p20")).name && (await evCount("p20")) === 0 && (await evCount(held)) === 2 && /^held_[0-9a-f]{32}$/.test(held),
      "a coach marking him under 13 holds his record to the placeholder and his game pitches under a random id");
    const relBefore = (await pull("head", tA, "pitchers")).minors;
    check(relBefore.held.includes("p20"), "a coach's pull lists him as held, so coaches' iPads keep their full record of him");
    check(!(await as("head", "select public.pc_unmark_minor($1, 'p20')", [tA])).error && (await evCount("p20")) === 2
      && +(await su.query("select count(*) n from public.minors where pitcher_id = 'p20'")).rows[0].n === 0 && !(await usable(pinv20)),
      "N1: a coach can take a wrong mark off: the game pitches come back on the server and the parent invite is cancelled");
    const relAfter = (await pull("head", tA, "pitchers")).minors;
    check(!relAfter.held.includes("p20") && relAfter.released.filter((x) => x.id === "p20").length === 1, "and the pull lists the release, so coaches' iPads send what they kept of him (record, check-ins, bullpens)");
    check(!!(await as("caller", "select public.pc_unmark_minor($1, 'p20')", [tA])).error, "but not a coach without the roster");
    const pinv20b = await one("head", "select public.pc_invite($1, 'player', 'p20', 'mom3@x.org', true) r", [tA]);
    await as("mom3", "select public.pc_record_guardian_consent($1, 'checkbox')", [pinv20b]);
    const pl20 = await pull("head", tA, "pitchers");
    check((await evCount("p20")) === 2 && pl20.minors.released.filter((x) => x.id === "p20").length === 2 && !pl20.minors.held.includes("p20"),
      "a parent agreeing brings the pitches back and is a release of its own (each release is listed once, so iPads send again)");
    check(!!(await as("head", "select public.pc_unmark_minor($1, 'p20')", [tA])).error, "once a parent has agreed, a coach can't take the mark off");
    // N3: approval only for a parent email waiting on it, never reviving an old invite
    await as("head", "select public.pc_set_member($1, $2, 'caller', '{\"manage_roster\":true}')", [tA, U.caller]);
    const oldHead = await one("head", "select public.pc_invite($1, 'head') r", [tA]);
    await su.query("update public.invites set created_at = now() - interval '30 days' where token = $1", [oldHead]);
    check(!!(await as("caller", "select public.pc_approve_invite($1)", [oldHead])).error && !!(await as("head", "select public.pc_approve_invite($1)", [oldHead])).error,
      "N3: an expired head-coach invite can't be brought back by approving it");
    check(!!(await as("head", "select public.pc_approve_invite($1)", [await one("head", "select public.pc_invite($1, 'viewer') r", [tA])])).error, "N3: only an invite waiting for approval can be approved");
    await as("head", "select public.pc_set_member($1, $2, 'caller')", [tA, U.caller]);
    // a parent who agreed but let the invite run out gets a new one, to their own email only
    await su.query("update public.invites set created_at = now() - interval '15 days' where token = $1", [pinv20b]);
    check(!(await as("head", "select public.pc_invite($1, 'player', 'p20', 'mom3@x.org', true)", [tA])).error
      && !!(await as("head", "select public.pc_invite($1, 'player', 'p20', 'mom4@x.org', true)", [tA])).error, "a consented player can be re-invited to the parent who agreed, and nobody else");
    // L2: a parent deleting their account takes the consent, and the child's data goes back to held
    await push("head", tA, "pitchers", [{ id: "p20", updatedAt: now() + 20000, name: "Senior Ace", number: "20" }]);
    check((await pdoc("p20")).name === "Senior Ace", "(the setup: after consent the coach fills his record in again)");
    await su.query("delete from auth.users where id = $1", [U.mom3]);
    check(!(await pdoc("p20")).name && (await evCount("p20")) === 0 && +(await su.query("select count(*) n from public.guardian_consents where pitcher_id = 'p20'")).rows[0].n === 0,
      "L2: deleting a parent's account takes the consent with it, and the child's record goes back to held");
    let ownerErr = null; try { await su.query("delete from auth.users where id = $1", [U.head]); } catch (e) { ownerErr = e.message; }
    check(/organizations_owner_id_fkey/.test(ownerErr || ""), "L2: an owner's account can't be deleted while it owns an organization (ownership is transferred first)");

    // N4: accepting an invite can't leave a team without a head coach
    const o3org = (await su.query("insert into public.organizations (name, owner_id, billing_status) values ('o3', $1, 'active') returning id", [U.o3])).rows[0].id;
    const tD = (await su.query("insert into public.programs (name, org_id, status) values ('tD', $1, 'active') returning id", [o3org])).rows[0].id;
    await su.query("insert into public.members (program_id, user_id, role) values ($1, $2, 'head')", [tD, U.h3]);
    const self = await one("h3", "select public.pc_invite($1, 'viewer') r", [tD]);
    r = await as("h3", "select public.pc_accept_invite($1)", [self]);
    check(!!r.error && /head coach/.test(r.error) && (await su.query("select role from public.members where program_id = $1 and user_id = $2", [tD, U.h3])).rows[0].role === "head",
      "N4: the only head coach accepting a lesser invite himself is refused");
    // N5: a refusal tells a player nothing about pitchers he can't see
    r = await push("pl1", tA, "checkins", [sess("ck-n5a", "r3"), sess("ck-n5b", "r4"), sess("ck-n5c", "p2")]);
    check(r.rejected.length === 3 && r.rejected.every((x) => x.reason === "not allowed"), `N5: a player's pushes about a held, a deleted and a teammate's record all just say not allowed (${r.rejected.map((x) => x.reason).join(" | ")})`);
    // N6: the placeholder's team id is a real team of this program
    r = await push("head", tA, "pitchers", [{ id: "r3", updatedAt: now() + 30000, number: "23", teamId: "Johnny_Smith_DOB_2015-03-02_ElmMiddle" }]);
    check(r.rejected.length === 1 && /consent/.test(r.rejected[0].reason), "N6: free text can't ride in the placeholder's teamId");
    // N7: a learned model is checked by its id as well as its pitcherId
    r = await push("head", tA, "learned", [{ id: "p:r4", pitcherId: "zz", updatedAt: now() }, { id: "p:r3", pitcherId: "zz", updatedAt: now() }]);
    check(r.rejected.length === 2 && r.rejected[0].reason === "purged" && /consent/.test(r.rejected[1].reason), "N7: a learned model can't dodge the checks with a different pitcherId");
    // N8: the stand-in is random, and games' staff lists lose the deleted id too
    await push("head", tA, "pitchers", [{ id: "p21", updatedAt: now(), name: "Gone Kid", number: "21" }]);
    const t21 = await one("head", "select public.pc_invite($1, 'player', 'p21', 'mom4@x.org', true) r", [tA]);
    await as("mom4", "select public.pc_record_guardian_consent($1, 'checkbox')", [t21]);
    await push("head", tA, "events", [sess("ev21", "p21", { type: "pitch" })]);
    await push("head", tA, "games", [{ id: "g21", updatedAt: now(), staffIds: ["p1", "p21"] }]);
    await as("mom4", "select public.pc_delete_minor($1, 'p21')", [tA]);
    const standIn = (await su.query("select stand_in from public.purged where program_id = $1 and pitcher_id = 'p21'", [tA])).rows[0].stand_in;
    const ev21 = (await su.query("select doc from public.events where id = 'ev21'")).rows[0].doc;
    const g21 = (await su.query("select doc from public.games where id = 'g21'")).rows[0].doc;
    const sha = crypto.createHash("sha256").update(`${tA}:p21`).digest("hex").slice(0, 12);
    check(ev21.pitcherId === standIn && /^removed_[0-9a-f]{32}$/.test(standIn) && !standIn.includes(sha), "N8: his pitches carry a random stand-in that can't be worked out from his id");
    check(JSON.stringify(g21.staffIds) === JSON.stringify(["p1", standIn]), "N8: the game's staff list no longer has his id");
    r = await push("head", tA, "games", [{ id: "g21b", updatedAt: now(), staffIds: ["p21"] }]);
    check(r.server.length === 1 && r.server[0].doc.staffIds[0] === standIn && !("staff" in r.server[0].doc), "and an old game sent again from an iPad goes in with the stand-in, and nothing else added");
    // A (third review): packs made offline before the deletion
    r = await push("head", tA, "packs", [{ id: "pk21-late", updatedAt: now(), gameId: "g21", staff: [{ pitcherId: "p1", name: "Ace" }, { pitcherId: "p21", name: "Gone Kid" }] }, { id: "pk-ok3", updatedAt: now(), gameId: "g1", staff: [{ pitcherId: "p1" }] }]);
    const late = (await su.query("select doc from public.packs where id = 'pk21-late'")).rows[0];
    check(!r.error && r.applied === 2 && late && late.doc.staff.length === 2 && late.doc.staff[0].name === "Ace" && JSON.stringify(late.doc.staff[1]) === JSON.stringify({ pitcherId: standIn }) && !("staffIds" in late.doc),
      `A: a pack naming him, made offline before the deletion, goes in with the stand-in, and the rest of the batch with it (${r.error || r.applied})`);
    await push("head", tA, "packs", [{ id: "pk21", updatedAt: now(), gameId: "g21", staff: [{ pitcherId: "p21", name: "Gone Kid" }] }]);
    r = await push("head", tA, "packs", [{ id: "pk21", updatedAt: now() + 1000, gameId: "g21", note: "newer", staff: [{ pitcherId: "p21", name: "Gone Kid" }] }]);
    const pk21 = (await su.query("select doc from public.packs where id = 'pk21'")).rows[0].doc;
    check(pk21.note === "newer" && pk21.staff[0].pitcherId === standIn, "A: a newer copy of such a pack replaces the older one");
    // C (third review): a coach-made team id can't carry free text into a held child's placeholder
    await push("caller", tA, "teams", [{ id: "Johnny_Smith_DOB_2015-03-02_ElmMiddle", updatedAt: now(), name: "x" }]);
    r = await push("head", tA, "pitchers", [{ id: "r3", updatedAt: now() + 40000, number: "23", teamId: "Johnny_Smith_DOB_2015-03-02_ElmMiddle" }]);
    check(r.rejected.length === 1 && /consent/.test(r.rejected[0].reason), "C: not even through a team record named that way");
    await push("caller", tA, "teams", [{ id: "tea_mqz1abcd0123456789abcdef", updatedAt: now(), name: "Our team" }]);
    r = await push("head", tA, "pitchers", [{ id: "r3", updatedAt: now() + 50000, number: "23", teamId: "tea_mqz1abcd0123456789abcdef" }]);
    check(r.applied === 1, "a real team id is fine");
  }

  console.log("15. A missing pitcherId is a no, not a maybe");
  {
    r = await push("pl1", tA, "checkins", [{ id: "ck-nopit", updatedAt: now() }, { id: "ck-nullpit", updatedAt: now(), pitcherId: null }]);
    const got = +(await su.query("select count(*) n from public.checkins where id in ('ck-nopit', 'ck-nullpit')")).rows[0].n;
    check(r.rejected.length === 2 && r.rejected.every((x) => x.reason === "not allowed") && got === 0, `a player's check-in with no pitcher is refused (${JSON.stringify(r.rejected)}, ${got} stored)`);
    r = await push("head", tA, "checkins", [{ id: "ck-coach-nopit", updatedAt: now() }]);
    check(r.applied === 1, "(a coach's check-in with no pitcher is fine: coaches may write the team's check-ins)");
  }

  console.log("16. The coach portal (Plan 3a)");
  {
    const gm = (id, date) => ({ id, updatedAt: now(), date, status: "final" });
    const ev = (id, game, pit) => ({ id, updatedAt: now(), gameId: game, pitcherId: pit, type: "pitch" });
    const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    await push("head", tA, "games", [gm("wg1", day(1)), gm("wg2", day(3)), gm("wg-old", day(40)), Object.assign(gm("wg-dup", day(1)), { dupOf: "wg1" })]);
    await push("head", tA, "events", [ev("we1", "wg1", "p1"), ev("we2", "wg1", "p1"), ev("we3", "wg2", "p1"), ev("we4", "wg2", "p2"), ev("we5", "wg-old", "p1"), ev("we6", "wg-dup", "p1"),
      Object.assign(ev("we7", "wg1", "p1"), { type: "play" })]);
    const w = (await as("head", "select * from public.pc_team_workload($1) order by pitcher_id, day", [tA])).rows || [];
    const p1 = w.filter((x) => x.pitcher_id === "p1");
    check(p1.length === 2 && p1.find((x) => x.game_id === "wg1").pitches === 2 && p1.find((x) => x.game_id === "wg2").pitches === 1,
      `workload: each pitcher's game pitches per day, the last 30 days, a game charted twice once, plays not counted (${JSON.stringify(p1)})`);
    check(((await as("pl1", "select * from public.pc_team_workload($1)", [tA])).rows || []).length === 0, "a player gets none of it (he can't read events)");
    check(((await as("xhead", "select * from public.pc_team_workload($1)", [tA])).rows || []).length === 0, "nor another team's coach");
    check(!!(await as("caller", "select public.pc_set_team($1, 'New name', 'America/Chicago')", [tA])).error, "a pitch caller can't change the team's settings");
    check(!!(await as("head", "select public.pc_set_team($1, 'New name', 'Mars/Olympus')", [tA])).error, "an unknown time zone is refused");
    check(!(await as("head", "select public.pc_set_team($1, 'RIT Tigers', 'America/Chicago')", [tA])).error
      && (await su.query("select name, timezone from public.programs where id = $1", [tA])).rows[0].timezone === "America/Chicago", "the head coach changes the name and time zone");
    await su.query("update public.programs set timezone = 'Not/AZone' where id = $1", [tA]);
    check(!(await as("head", "select * from public.pc_team_workload($1)", [tA])).error, "a time zone the database doesn't know doesn't break the workload");
    await su.query("update public.programs set timezone = 'America/New_York' where id = $1", [tA]);
  }

  console.log("17. Billing (Plan 2): Stripe events, lockout, adding and removing teams");
  {
    const ev = (n) => "evt_test" + n + "_" + crypto.randomBytes(4).toString("hex");
    const at = (s) => new Date(Date.UTC(2026, 10, 5, 12, 0, s)).toISOString();
    const bill = (id, type, t, a) => one("service", "select public.pc_billing_event($1, $2, $3, $4::jsonb) r", [id, type, t, JSON.stringify(a)]);
    const orgRow = async (o) => (await su.query("select * from public.organizations where id = $1", [o])).rows[0];
    const statuses = async (o) => (await su.query("select name, status from public.programs where org_id = $1 order by created_at, id", [o])).rows.map((x) => `${x.name}:${x.status}`).join(" ");
    const activeTeam = async (t) => (await su.query("select private.pc_team_active($1) a", [t])).rows[0].a;
    const U3 = crypto.randomUUID(); U.owner3 = U3;
    await su.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'owner3@x.org', now())", [U3]);
    const org3 = await one("owner3", "select public.pc_create_org('Ridge Baseball', 'hs') r");
    const t31 = await one("owner3", "select public.pc_create_team($1, 'Varsity', 'hs', 'America/New_York', 'head') r", [org3]);
    await su.query("update public.programs set created_at = now() - interval '3 minutes' where id = $1", [t31]);
    const t32 = await one("owner3", "select public.pc_create_team($1, 'JV', 'hs') r", [org3]);
    await su.query("update public.programs set created_at = now() - interval '2 minutes' where id = $1", [t32]);
    const t33 = await one("owner3", "select public.pc_create_team($1, 'Freshman', 'hs') r", [org3]);

    for (const who of ["owner3", "head", "anon"]) {
      const viaUser = await as(who, "select public.pc_billing_event('evt_forged', 'invoice.paid', now(), $1::jsonb)", [JSON.stringify({ org: org3, status: "active" })]);
      check(!!viaUser.error && (await orgRow(org3)).billing_status === "pending", `${who} can't send a billing event himself`);
    }
    check(!!(await as("owner3", "select public.pc_billing_ids($1)", [org3])).error, "nor read the organization's Stripe ids");
    check(!!(await as("owner3", "select * from private.stripe_events")).error, "nor the event log");

    // Checkout for two of the three teams
    const e1 = ev(1);
    let r = await bill(e1, "checkout.session.completed", at(10), { org: org3, customer: "cus_R3", subscription: "sub_R3", status: "active", quantity: 2, adopt: true });
    let o = await orgRow(org3);
    check(r === "applied" && o.billing_status === "active" && o.stripe_customer_id === "cus_R3" && o.stripe_subscription_id === "sub_R3",
      `checkout paid: the organization is active and keeps its Stripe ids (${r})`);
    check(await statuses(org3) === "Varsity:active JV:active Freshman:pending", `two teams paid for: the two oldest switch on, the third waits (${await statuses(org3)})`);
    check(await activeTeam(t31) && !(await activeTeam(t33)), "the paid team syncs, the unpaid one doesn't");
    r = await bill(e1, "checkout.session.completed", at(10), { org: org3, customer: "cus_R3", subscription: "sub_R3", status: "active", quantity: 3, adopt: true });
    check(r === "duplicate" && await statuses(org3) === "Varsity:active JV:active Freshman:pending", "the same event sent again changes nothing (D5)");
    r = await bill(ev(2), "customer.subscription.created", at(8), { org: org3, customer: "cus_R3", subscription: "sub_R3", sub_status: "active", quantity: 2, period_end: Date.UTC(2027, 10, 5) / 1000, adopt: true });
    o = await orgRow(org3);
    check(r === "stale" && o.period_ends_at === null, `an older subscription snapshot arriving late is ignored (${r})`);
    r = await bill(ev(3), "customer.subscription.updated", at(11), { org: org3, subscription: "sub_R3", sub_status: "active", quantity: 2, period_end: Date.UTC(2027, 10, 5) / 1000 });
    o = await orgRow(org3);
    check(r === "applied" && +o.period_ends_at === Date.UTC(2027, 10, 5) && o.subscription_status === "active", "a newer one sets the paid year's end");
    check(!!(await as("xhead", "select public.pc_billing_info($1)", [org3])).error && !!(await as("head", "select public.pc_billing_info($1)", [org3])).error,
      "only the owner sees the billing page's data (not another org, not his own head coach)");
    const info = await one("owner3", "select public.pc_billing_info($1) r", [org3]);
    check(info && info.status === "active" && info.live === true && info.teams.length === 3 && !/cus_R3|sub_R3/.test(JSON.stringify(info)),
      "the owner sees the state and teams, never the Stripe ids");

    // a team added: pending until the higher quantity is paid
    r = await bill(ev(4), "customer.subscription.updated", at(20), { org: org3, subscription: "sub_R3", sub_status: "active", quantity: 3 });
    check(r === "applied" && await statuses(org3) === "Varsity:active JV:active Freshman:active", "the quantity goes up: the waiting team switches on");

    // removing a team
    check(!!(await as("head", "select public.pc_end_team($1)", [t32])).error, "a head coach can't remove a team (only the owner)");
    check(await one("owner3", "select public.pc_end_team($1) r", [t32]) === "ending", "the owner removes JV");
    let t = (await su.query("select status, ends_at from public.programs where id = $1", [t32])).rows[0];
    check(t.status === "ending" && +t.ends_at === Date.UTC(2027, 10, 5) && await activeTeam(t32), "it stays usable until the paid year ends (D6)");
    r = await bill(ev(5), "customer.subscription.updated", at(21), { org: org3, subscription: "sub_R3", sub_status: "active", quantity: 2 });
    check(await statuses(org3) === "Varsity:active JV:ending Freshman:active", "the lower quantity in Stripe doesn't take anything else away");
    await as("owner3", "select public.pc_keep_team($1)", [t32]);
    check((await su.query("select status from public.programs where id = $1", [t32])).rows[0].status === "active", "the owner can keep it again before the year ends");
    r = await bill(ev(6), "customer.subscription.updated", at(22), { org: org3, subscription: "sub_R3", sub_status: "active", quantity: 3 });
    await as("owner3", "select public.pc_end_team($1)", [t32]);
    await su.query("update public.programs set ends_at = now() - interval '1 second' where id = $1", [t32]);
    check(!(await activeTeam(t32)), "once its year is over, it locks");
    const t34 = await one("owner3", "select public.pc_create_team($1, 'Summer', 'hs') r", [org3]);
    check(await one("owner3", "select public.pc_end_team($1) r", [t34]) === "removed", "a team never paid for is removed at once");
    await su.query("update public.organizations set period_ends_at = now() + interval '1 year' where id = $1", [org2]);
    const lone = await one("xhead", "select public.pc_end_team($1) r", [tC]);
    check(!!(lone && /last team/.test(lone.error || "")), `the last active team can't be removed (cancel the subscription instead) (${lone && lone.error})`);

    // lapse and unlock
    r = await bill(ev(7), "invoice.payment_failed", at(5), { org: org3, subscription: "sub_R3", status: "locked" });
    check(r === "stale" && (await orgRow(org3)).billing_status === "active", "a payment failure older than the last change is ignored (A5)");
    r = await bill(ev(8), "invoice.payment_failed", at(30), { subscription: "sub_R3", customer: "cus_R3", status: "locked" });
    check(r === "applied" && (await orgRow(org3)).billing_status === "locked" && !(await activeTeam(t31)), "a failed payment locks every team (found by its subscription)");
    const lockedPush = await push("owner3", t31, "pitchers", [{ id: "lk1", updatedAt: now(), name: "x" }]);
    check(lockedPush.rejected && lockedPush.rejected.length === 1, "and the iPad's writes are refused");
    check((await one("owner3", "select public.pc_billing_info($1) r", [org3])).status === "locked", "the owner still sees the billing page");
    check(!!(await as("owner3", "select public.pc_end_team($1)", [t33])).error, "but can't remove teams while locked");
    r = await bill(ev(9), "invoice.paid", at(25), { subscription: "sub_R3", status: "active" });
    check(r === "stale" && (await orgRow(org3)).billing_status === "locked", "an older payment arriving after the failure doesn't unlock");
    r = await bill(ev(10), "invoice.paid", at(40), { subscription: "sub_R3", status: "active" });
    check(r === "applied" && (await orgRow(org3)).billing_status === "active" && await activeTeam(t31), "a newer payment unlocks");
    check(await statuses(org3) === "Varsity:active JV:removed Freshman:active Summer:removed" && !(await activeTeam(t32)),
      `and the team removed last year stays removed (A5) (${await statuses(org3)})`);

    // other subscriptions
    r = await bill(ev(11), "customer.subscription.deleted", at(50), { org: org3, subscription: "sub_OLD", status: "locked", sub_status: "canceled" });
    check(r === "other_subscription" && (await orgRow(org3)).billing_status === "active", "an event from some other subscription is ignored");
    r = await bill(ev(12), "checkout.session.completed", at(51), { org: org3, subscription: "sub_SECOND", status: "active", quantity: 5, adopt: true });
    check(r === "second_subscription" && (await orgRow(org3)).stripe_subscription_id === "sub_R3", "a second Checkout while the first is live doesn't take over (logged for a refund)");
    r = await bill(ev(13), "customer.subscription.deleted", at(60), { org: org3, subscription: "sub_R3", status: "locked", sub_status: "canceled" });
    check(r === "applied" && (await orgRow(org3)).billing_status === "locked", "the subscription cancelled: locked");
    r = await bill(ev(14), "checkout.session.completed", at(70), { org: org3, customer: "cus_R3", subscription: "sub_NEW", status: "active", quantity: 2, adopt: true });
    o = await orgRow(org3);
    check(r === "applied" && o.stripe_subscription_id === "sub_NEW" && o.billing_status === "active" && o.subscription_quantity === 2, "coming back: a new subscription after the old one ended takes over");
    r = await bill(ev(15), "invoice.payment_failed", at(80), { org: org3, subscription: "sub_R3", status: "locked" });
    check(r === "other_subscription" && (await orgRow(org3)).billing_status === "active", "and the old one's late events no longer count");

    r = await bill(ev(16), "invoice.paid", at(90), { subscription: "sub_NOBODY", customer: "cus_NOBODY", status: "active" });
    const logged = (await su.query("select result, org_id from private.stripe_events where type = 'invoice.paid' and result = 'unknown_org'")).rows;
    check(r === "unknown_org" && logged.length === 1 && logged[0].org_id === null, "an event for no organization we know is logged and otherwise ignored");
    const bad = await as("service", "select public.pc_billing_event('not-an-event', 'x', now(), '{}'::jsonb)");
    check(!!bad.error, "an event id that isn't Stripe's is refused");
    const ids = await one("service", "select public.pc_billing_ids($1) r", [org3]);
    check(ids && ids.customer === "cus_R3" && ids.subscription === "sub_NEW" && ids.seats === 2 && ids.owner_email === "owner3@x.org", `the website's server reads the ids it needs (${JSON.stringify(ids)})`);
  }

  console.log("18. Player portal (Plan 3b): grade history, his own outings and what the engine learned");
  {
    const pitcherDoc = async (id) => (await su.query("select doc from public.pitchers where program_id = $1 and id = $2", [tA, id])).rows[0].doc;
    let tick = now() + 100000;
    const withGrade = async (id, pitchId, field, v, extra = {}) => {
      const d = await pitcherDoc(id);
      return { ...d, ...extra, updatedAt: Math.max(tick += 10, (d.updatedAt || 0) + 1), pitches: d.pitches.map((x) => (x.id === pitchId ? { ...x, [field]: v } : x)) };
    };
    const hist = async (id) => (await su.query("select * from public.grade_history where program_id = $1 and pitcher_id = $2 order by id", [tA, id])).rows;
    await su.query("delete from public.grade_history where program_id = $1", [tA]);   // earlier sections' edits
    await su.query("update public.pitchers set doc = jsonb_set(doc, '{pitches}', '[{\"id\":\"pt1\",\"name\":\"Fastball\",\"grade\":3,\"command\":3},{\"id\":\"pt2\",\"name\":\"Slider\",\"grade\":2,\"command\":2}]') where program_id = $1", [tA]);
    check((await hist("p1")).length === 0, "(setting up as the database owner writes no history: only people's changes count)");
    r = await push("pl1", tA, "pitchers", [await withGrade("p1", "pt1", "grade", 4)]);
    let h = await hist("p1");
    check(!r.error && h.length === 1 && h[0].field === "grade" && +h[0].old_value === 3 && +h[0].new_value === 4 && h[0].by_role === "player" && h[0].changed_by === U.pl1 && h[0].pitch_name === "Fastball",
      `a player raises his fastball's stuff: it applies at once and the history says who, what, old and new (D9) (${JSON.stringify(h.map((x) => [x.field, x.old_value, x.new_value, x.by_role]))})`);
    r = await push("head", tA, "pitchers", [await withGrade("p1", "pt2", "command", 3)]);
    h = await hist("p1");
    check(h.length === 2 && h[1].by_role === "head" && h[1].field === "command", "a coach's change is in the history too");
    r = await push("head", tA, "pitchers", [{ ...(await pitcherDoc("p1")), notes: "new note", updatedAt: (tick += 10) }]);
    check((await hist("p1")).length === 2, "a change that touches no grade writes nothing");
    const seen = async (who) => ((await as(who, "select pitcher_id, field from public.grade_history where program_id = $1", [tA])).rows || []);
    check((await seen("pl1")).length === 2 && (await seen("pl1")).every((x) => x.pitcher_id === "p1"), "he sees his own history");
    check((await seen("parent")).length === 0, "a teammate sees none of it");
    check((await seen("viewer")).length === 2 && (await seen("xhead")).length === 0, "the team's coaches see it (even a viewer); another team's coach doesn't");
    check(!!(await as("pl1", "insert into public.grade_history (program_id, pitcher_id, pitch_id, field) values ($1, 'p1', 'pt1', 'grade')", [tA])).error,
      "nobody writes the history by hand");
    const playerEdit = h[0].id;
    check(!!(await as("parent", "select public.pc_revert_grade($1)", [playerEdit])).error && !!(await as("viewer", "select public.pc_revert_grade($1)", [playerEdit])).error
      && !!(await as("caller", "select public.pc_revert_grade($1)", [playerEdit])).error, "a teammate, a viewer and a pitch caller can't revert");
    check(!(await as("pitching", "select public.pc_revert_grade($1)", [playerEdit])).error, "a pitching coach reverts it in one tap");
    let d = await pitcherDoc("p1");
    h = await hist("p1");
    check(d.pitches.find((x) => x.id === "pt1").grade === 3 && h[0].reverted_by === U.pitching && h.at(-1).by_role === "pitching" && +h.at(-1).new_value === 3,
      "his fastball is back to 3, the edit is marked reverted, and the revert is in the history");
    check(!!(await as("pitching", "select public.pc_revert_grade($1)", [playerEdit])).error, "a change can't be reverted twice");
    await push("pl1", tA, "pitchers", [await withGrade("p1", "pt1", "grade", 5)]);
    await push("pl1", tA, "pitchers", [await withGrade("p1", "pt1", "grade", 4)]);
    const mid = (await hist("p1")).at(-2);
    const stale = await as("head", "select public.pc_revert_grade($1)", [mid.id]);
    check(/changed again/.test(stale.error || "") && (await pitcherDoc("p1")).pitches.find((x) => x.id === "pt1").grade === 4,
      "a change that's been changed again since isn't put back over the newer one");

    // his outings
    const gm = (id, date) => ({ id, updatedAt: now(), date, status: "final", opponentId: "opp-secret" });
    const ev = (id, game, pit, res, pitchName, kind) => ({ id, updatedAt: now(), gameId: game, pitcherId: pit, type: "pitch", res, pitchName, kind, hitterId: "h-secret", call: { why: "secret plan" } });
    const today = new Date().toISOString().slice(0, 10);
    await push("head", tA, "games", [gm("og1", today)]);
    await push("head", tA, "events", [ev("oe1", "og1", "p1", "cstrike", "Fastball", "FB"), ev("oe2", "og1", "p1", "ball", "Fastball", "FB"),
      ev("oe3", "og1", "p1", "whiff", "Slider", "SL"), ev("oe4", "og1", "p2", "ball", "Fastball", "FB"), { ...ev("oe5", "og1", "p1", "play", "Slider", "SL"), type: "play" }]);
    const ours = (await su.query("select doc from public.teams where program_id = $1 and (doc->>'isOurs')::boolean", [tA])).rows[0];
    if (!ours) await push("head", tA, "teams", [{ id: "tea_ours000000000000000000", updatedAt: now(), name: "Varsity", isOurs: true, pitchRule: { preset: "nfhs_ny" } }]);
    else await push("head", tA, "teams", [{ ...ours.doc, updatedAt: now() + 9000, pitchRule: { preset: "nfhs_ny" } }]);
    const mine = await one("pl1", "select public.pc_my_outings($1) r", [tA]);
    const o1 = mine && mine.outings && mine.outings.find((x) => x.game_id === "og1");
    check(mine && mine.outings.every((x) => x.pitcher_id === "p1") && o1.pitcher_id === "p1" && o1.pitches === 3 && o1.strikes === 2 && o1.by_pitch.Fastball.n === 2 && o1.by_pitch.Slider.strikes === 1,
      `his outing: 3 pitches, 2 strikes, by pitch; a teammate's pitches and a play aren't counted (${JSON.stringify(o1)})`);
    check(!/secret|opp-|h-secret/.test(JSON.stringify(mine)) && mine.rule && mine.rule.preset === "nfhs_ny", "no opponent, hitter or game plan in it; the team's pitch-count rule is");
    const two = await one("parent", "select public.pc_my_outings($1) r", [tA]);
    check(two && two.outings.every((x) => ["p3", "p4"].includes(x.pitcher_id)), "a parent gets his children's only");
    check(await one("head", "select public.pc_my_outings($1) r", [tA]) === null && await one("xhead", "select public.pc_my_outings($1) r", [tA]) === null,
      "a coach (not a player here) and another team's coach get nothing from it");
    // what the engine learned
    await push("head", tA, "learned", [{ id: "p:p1", updatedAt: now(), pitcherId: "p1", at: 123, learner: "2.0", pitches: { pt1: { n: 40, talent: 3.4, evidence: { games: ["og1"], hitters: ["h-secret"] } } } },
      { id: "p:p2", updatedAt: now(), pitcherId: "p2", pitches: { pt1: { n: 9 } } }]);
    const lp = await one("pl1", "select public.pc_my_learned($1, 'p1') r", [tA]);
    check(lp && lp.pitches.pt1.n === 40 && lp.pitches.pt1.talent === 3.4 && !("evidence" in lp.pitches.pt1), `what the engine learned about him, without the evidence (${JSON.stringify(lp)})`);
    check(await one("pl1", "select public.pc_my_learned($1, 'p2') r", [tA]) === null, "not a teammate's");
    // a child's history goes with his data
    await su.query("insert into public.pitchers (program_id, id, doc) values ($1, 'p30', $2)", [tA, { id: "p30", updatedAt: 1000, teamId: "ours", name: "Kid", pitches: [{ id: "pt1", grade: 3 }] }]);
    await push("head", tA, "pitchers", [await withGrade("p30", "pt1", "grade", 1)]);
    check((await hist("p30")).length === 1, "(p30 has a history row)");
    await su.query("insert into public.purged (program_id, pitcher_id) values ($1, 'p30')", [tA]);
    check((await hist("p30")).length === 0, "when a parent deletes a child, his grade history goes too");
  }

  console.log("19. Super admin (D13)");
  {
    U.admin = crypto.randomUUID();
    await su.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'admin@x.org', now())", [U.admin]);
    await su.query("insert into public.platform_admins (user_id, note) values ($1, 'Drew')", [U.admin]);
    for (const who of ["owner", "head", "nonmember", "anon"]) {
      const x = await as(who, "select public.pc_admin_orgs(null)");
      check(!!x.error, `${who}: pc_admin_orgs denied`);
    }
    check(await one("head", "select public.pc_is_admin() r") === false && await one("admin", "select public.pc_is_admin() r") === true, "pc_is_admin tells the website who is one");
    const before = +(await su.query("select count(*) n from public.admin_audit")).rows[0].n;
    const list = await one("admin", "select public.pc_admin_orgs(null) r");
    if (list && list.error) console.log("    pc_admin_orgs:", list.error);
    const lake = list && list.orgs.find((x) => x.name === "Lakeside Baseball");
    const lakeOwner = (await su.query("select u.email, u.id from public.organizations o join auth.users u on u.id = o.owner_id where o.id = $1", [org1])).rows[0];
    check(lake && lake.owner_email === lakeOwner.email && lake.status === "active" && lake.coaches >= 4 && lake.players >= 3 && list.signups.users_7d >= 10,
      `the admin sees organizations, owners, billing state, counts and sign-ups (${JSON.stringify(lake)})`);
    const found = await one("admin", "select public.pc_admin_orgs('ridge') r");
    check(found.orgs.length === 1 && found.orgs[0].name === "Ridge Baseball" && (await one("admin", "select public.pc_admin_orgs('100%') r")).orgs.length === 0,
      "search by name or owner email (a % is just a character)");
    const org3 = (await su.query("select id from public.organizations where name = 'Ridge Baseball'")).rows[0].id;
    const det = await one("admin", "select public.pc_admin_org($1) r", [org3]);
    check(det && det.teams.length === 4 && det.events.length >= 10 && det.events.every((e) => e.type && e.result) && det.staff.some((s) => s.email === "owner3@x.org"),
      "one organization: its teams, head counts, staff and billing events");
    check(!/"doc"|pitchers|Pitcher p/.test(JSON.stringify(det)) && !/Pitcher p|coach note/.test(JSON.stringify(list)), "no pitch data, pitcher or player record in any of it");
    for (const t of ["events", "pitchers", "games", "grade_history"]) {
      const rows = (await as("admin", `select count(*) n from public.${t}`)).rows;
      check(rows && +rows[0].n === 0, `the admin can't read ${t} (he's on no team)`);
    }
    check(!!(await as("admin", "select * from public.admin_audit")).error && !!(await as("owner", "select * from public.platform_admins")).error, "the audit log and admin list aren't readable directly");
    check(!!(await as("admin", "insert into public.platform_admins (user_id) values ($1)", [U.owner])).error, "nor can anyone add an admin through the API");
    check(!!(await as("admin", "select public.pc_admin_transfer_owner($1, 'pl1@x.org', 'owner left')", [org1])).error, "support transfer: not to a player");
    check(!!(await as("admin", "select public.pc_admin_transfer_owner($1, 'head@x.org', ' ')", [org1])).error, "not without a reason");
    check(!(await as("admin", "select public.pc_admin_transfer_owner($1, 'PITCHING@x.org', 'Owner left the school; head coach asked by email')", [org1])).error
      && (await su.query("select owner_id from public.organizations where id = $1", [org1])).rows[0].owner_id === U.pitching, "to a coach on one of its teams, with a reason");
    await su.query("update public.organizations set owner_id = $1 where id = $2", [lakeOwner.id, org1]);
    const audit = await one("admin", "select public.pc_admin_audit(50) r");
    const acts = audit.map((a) => a.action);
    const after = +(await su.query("select count(*) n from public.admin_audit")).rows[0].n;
    check(after - before === 6 && acts[0] === "view_audit" && acts.includes("transfer_owner") && acts.filter((a) => a === "list_orgs").length === 3 && acts.includes("view_org"),
      `every admin call wrote to the audit log, and failed ones didn't (${acts.join(", ")})`);
    const tr = audit.find((a) => a.action === "transfer_owner");
    check(tr.admin_email === "admin@x.org" && tr.org_name === "Lakeside Baseball" && /Owner left/.test(tr.detail.reason) && tr.detail.to === U.pitching && tr.detail.from === lakeOwner.id, "the transfer's row says who, which organization, to whom and why");
  }

  console.log("20. Uploads, proposals and stats rows (Plan 4)");
  {
    const meta = (extra = {}) => JSON.stringify({ source: "trackman", session_type: "bullpen", session_date: new Date().toISOString().slice(0, 10), file_name: "pen.csv", warnings: ["one note"], ...extra });
    const fb = (i, extra = {}) => ({ pitch_type: "Four-seam", kind: "FB", velo_mph: 88 + (i % 3), ivb_in: 17, hb_in: 9, spin_rpm: 2250, rel_height_ft: 5.8, rel_side_ft: 1.9, extension_ft: 6.1, ...extra });
    const rows12 = JSON.stringify(Array.from({ length: 12 }, (_, i) => fb(i, i === 11 ? { velo_mph: 150, res: "nonsense", kind: "FB" } : {})));
    const up = await one("pl1", "select public.pc_upload_add($1, 'p1', $2::jsonb, $3::jsonb) r", [tA, meta(), rows12]);
    const stored = (await su.query("select * from public.upload_pitches where upload_id = $1 order by idx", [up])).rows;
    check(typeof up === "string" && stored.length === 12 && +stored[0].velo_mph === 88 && stored[11].velo_mph === null && stored[11].res === null,
      `a player uploads his bullpen: 12 pitches stored; an impossible velo or result is blank, not clamped (${typeof up === "string" ? "ok" : JSON.stringify(up)})`);
    check(!!(await as("pl1", "select public.pc_upload_add($1, 'p2', $2::jsonb, $3::jsonb)", [tA, meta(), rows12])).error, "not for a teammate");
    check(!!(await as("caller", "select public.pc_upload_add($1, 'p1', $2::jsonb, $3::jsonb)", [tA, meta(), rows12])).error, "a coach without review_uploads can't upload for him");
    const byCoach = await one("pitching", "select public.pc_upload_add($1, 'p1', $2::jsonb, $3::jsonb) r", [tA, meta({ session_type: "live_bp" }), rows12]);
    check(typeof byCoach === "string", "a pitching coach (review_uploads) can");
    check(!!(await as("pl1", "select public.pc_upload_add($1, 'p1', $2::jsonb, '[]'::jsonb)", [tA, meta()])).error
      && !!(await as("pl1", "select public.pc_upload_add($1, 'p1', $2::jsonb, $3::jsonb)", [tA, meta({ session_date: "soon" }), rows12])).error
      && !!(await as("pl1", "select public.pc_upload_add($1, 'p1', $2::jsonb, $3::jsonb)", [tA, meta({ source: "excel" }), rows12])).error, "no empty file, no date, no unknown source");
    const seenUp = async (who) => ((await as(who, "select id from public.uploads where program_id = $1", [tA])).rows || []).length;
    const seenPitches = async (who) => ((await as(who, "select idx from public.upload_pitches where program_id = $1", [tA])).rows || []).length;
    check(await seenUp("pl1") === 2 && await seenPitches("pl1") === 24, "he sees his uploads and their pitches");
    check(await seenUp("parent") === 0 && await seenPitches("parent") === 0, "a teammate sees none");
    check(await seenUp("viewer") === 2 && await seenUp("xhead") === 0, "his coaches see them (a viewer too); another team's don't");
    check(!!(await as("pl1", "insert into public.uploads (program_id, pitcher_id, source, session_type, session_date, n_pitches) values ($1, 'p1', 'trackman', 'game', now(), 1)", [tA])).error
      && !!(await as("pl1", "update public.upload_pitches set excluded = true where upload_id = $1", [up])).error, "nobody writes the tables directly");

    // review
    const rv = await one("pl1", "select public.pc_upload_review($1, $2::jsonb) r", [up, JSON.stringify([{ idx: 0, excluded: true, reason: "warmup" }, { idx: 1, developing: true }, { idx: 2, reason: "grip" }, { idx: 99, excluded: true }])]);
    const after = (await su.query("select idx, excluded, reason, developing from public.upload_pitches where upload_id = $1 and idx < 3 order by idx", [up])).rows;
    check(rv === 3 && after[0].excluded && after[0].reason === "warmup" && after[1].developing && !after[1].excluded && after[2].reason === null && !after[2].excluded,
      `exclude with a reason, mark developing; a reason on an included pitch means nothing (${JSON.stringify(after)})`);
    check(!!(await as("parent", "select public.pc_upload_review($1, $2::jsonb)", [up, JSON.stringify([{ idx: 3, excluded: true }])])).error
      && !!(await as("caller", "select public.pc_upload_review($1, $2::jsonb)", [up, JSON.stringify([{ idx: 3, excluded: true }])])).error, "a teammate and a pitch caller can't review it");
    check(!(await as("pitching", "select public.pc_upload_review($1, $2::jsonb)", [up, JSON.stringify([{ idx: 3, excluded: true, reason: "mistag" }])])).error, "a coach with review_uploads can");

    // proposals
    const props = JSON.stringify([
      { field: "velo", pitch_id: "pt1", value: 89.24, basis: { n: 10 } }, { field: "shape", pitch_id: "pt1", value: { shape: "ride", ivb: 17.04, hb: 9.2 } },
      { field: "slot", value: "sidearm" }, { field: "velo", pitch_id: "nope", value: 80 }, { field: "shape", pitch_id: "pt2", value: { shape: "zoom", ivb: 1, hb: 1 } },
      { field: "velo", pitch_id: "pt2", value: 300 }, { field: "grade", pitch_id: "pt1", value: 5 }]);
    check(await one("pl1", "select public.pc_proposals_set($1, 'p1', $2::jsonb) r", [tA, props]) === 3, "proposals: three valid ones kept (a pitch he doesn't throw, a made-up shape, 300 mph and a grade are dropped)");
    let pend = (await su.query("select id, field, value, current, status from public.proposals where program_id = $1 and pitcher_id = 'p1' and status = 'pending' order by id", [tA])).rows;
    check(pend.length === 3 && pend[0].value === 89.2 && pend[1].value.ivb === 17 && pend[2].value === "sidearm", `values rounded and stored, with what the record held (${JSON.stringify(pend.map((x) => x.value))})`);
    await one("pl1", "select public.pc_proposals_set($1, 'p1', $2::jsonb) r", [tA, props]);
    const all = (await su.query("select status from public.proposals where program_id = $1 and pitcher_id = 'p1'", [tA])).rows.map((x) => x.status);
    check(all.filter((s) => s === "pending").length === 3 && all.filter((s) => s === "superseded").length === 3, "a fresh set supersedes the old pending ones");
    pend = (await su.query("select id, field from public.proposals where program_id = $1 and pitcher_id = 'p1' and status = 'pending' order by id", [tA])).rows;
    const [pv, ps, pslot] = pend.map((x) => x.id);
    const before = (await su.query("select doc from public.pitchers where program_id = $1 and id = 'p1'", [tA])).rows[0].doc;
    check(!!(await as("parent", "select public.pc_proposal_decide($1, true)", [pv])).error && !!(await as("caller", "select public.pc_proposal_decide($1, true)", [pv])).error
      && !!(await as("viewer", "select public.pc_proposal_decide($1, true)", [pv])).error, "a teammate, a pitch caller and a viewer can't accept one");
    check((await su.query("select doc from public.pitchers where program_id = $1 and id = 'p1'", [tA])).rows[0].doc.updatedAt === before.updatedAt, "(nothing changed)");
    const d1 = await as("pl1", "select public.pc_proposal_decide($1, true)", [pv]);
    const d2 = await as("pitching", "select public.pc_proposal_decide($1, true)", [ps]);
    check(!d1.error && !d2.error, `the pitcher accepts the velo, a pitching coach the shape (${d1.error || ""}${d2.error || ""})`);
    await as("pl1", "select public.pc_proposal_decide($1, false)", [pslot]);
    const doc = (await su.query("select doc from public.pitchers where program_id = $1 and id = 'p1'", [tA])).rows[0].doc;
    const pt1 = doc.pitches.find((x) => x.id === "pt1");
    check(pt1.velo === 89.2 && pt1.shape === "ride" && pt1.ivb === 17 && pt1.hb === 9.2 && doc.slot === before.slot && doc.updatedAt > before.updatedAt,
      `accepted: his fastball reads 89.2 mph, ride, 17/9.2; the slot he rejected is unchanged; the record is newer, so every iPad gets it (${JSON.stringify({ velo: pt1.velo, shape: pt1.shape, slot: doc.slot })})`);
    const st = (await su.query("select status, decided_by from public.proposals where id = any($1) order by id", [[pv, ps, pslot]])).rows;
    check(st[0].status === "accepted" && st[0].decided_by === U.pl1 && st[1].decided_by === U.pitching && st[2].status === "rejected", "each says who decided");
    check(!!(await as("pl1", "select public.pc_proposal_decide($1, true)", [pv])).error, "and can't be decided twice");
    check(((await as("parent", "select id from public.proposals where program_id = $1", [tA])).rows || []).length === 0, "a teammate sees none of his proposals");

    // templates
    check(!(await as("pl1", "select public.pc_template_save($1, 'Yakkertech', 'pitch|mph|vert|horz', $2::jsonb)", [tA, JSON.stringify({ type: "Pitch", velo: "MPH", ivb: "Vert", hb: "Horz" })])).error, "a player saves a column mapping for his team");
    check(!!(await as("pl1", "select public.pc_template_save($1, 'x', 'a|b', $2::jsonb)", [tA, JSON.stringify({ velo: "MPH" })])).error
      && !!(await as("pl1", "select public.pc_template_save($1, 'x', 'a|b', $2::jsonb)", [tA, JSON.stringify({ type: "Pitch", evil: "x" })])).error
      && !!(await as("xhead", "select public.pc_template_save($1, 'x', 'a|b', $2::jsonb)", [tA, JSON.stringify({ type: "Pitch" })])).error, "not without a pitch type, not with unknown fields, not on another team");
    const tq = await as("parent", "select name from public.upload_templates where program_id = $1", [tA]);
    check((tq.rows || []).length === 1, "the team's players and coaches can use it");

    // stats rows
    await push("head", tA, "hitters", [{ id: "h-lefty", updatedAt: now(), teamId: "opp1", name: "Lefty Secret", bats: "L" }]);
    await push("head", tA, "events", [{ id: "oe9", updatedAt: now(), gameId: "og1", pitcherId: "p1", type: "pitch", res: "play", contact: "hard", paEnd: "hard", out: "2B", count: "1-1", pitchName: "Fastball", kind: "FB", hitterId: "h-lefty", call: { why: "secret plan" }, n: 9 }]);
    const pr = await one("pl1", "select public.pc_pitch_rows($1, 'p1') r", [tA]);
    const hard = pr && pr.find((x) => x.out === "2B");
    check(Array.isArray(pr) && pr.length >= 4 && hard && hard.side === "opp" && hard.count === "1-1" && hard.contact === "hard" && !/secret|h-lefty|hitterId|Lefty/.test(JSON.stringify(pr)),
      `his game pitches for stats: count, result, contact, hitter as same/opposite side and nothing else (${JSON.stringify(hard)})`);
    check(Array.isArray(await one("viewer", "select public.pc_pitch_rows($1, 'p1') r", [tA])) && await one("parent", "select public.pc_pitch_rows($1, 'p1') r", [tA]) === null
      && await one("xhead", "select public.pc_pitch_rows($1, 'p1') r", [tA]) === null, "his coaches get them; a teammate and another team's coach get nothing");

    // a locked team, deleting, and a child's data
    await su.query("update public.organizations set billing_status = 'locked' where id = $1", [org1]);
    check(!!(await as("pl1", "select public.pc_upload_add($1, 'p1', $2::jsonb, $3::jsonb)", [tA, meta(), rows12])).error && await seenUp("pl1") === 0, "a locked team: no uploads, and nothing readable");
    await su.query("update public.organizations set billing_status = 'active' where id = $1", [org1]);
    check(!!(await as("parent", "select public.pc_upload_delete($1)", [up])).error, "a teammate can't delete his upload");
    await as("pl1", "select public.pc_upload_delete($1)", [up]);
    check(+(await su.query("select count(*) n from public.upload_pitches where upload_id = $1", [up])).rows[0].n === 0, "he deletes it: its pitches go with it");
    for (const [pid, how] of [["p31", "deleted by a parent"], ["p32", "held (under 13, no consent)"], ["p33", "held again when consent is withdrawn"]]) {
      await su.query("insert into public.pitchers (program_id, id, doc) values ($1, $2, $3)", [tA, pid, { id: pid, updatedAt: 1000, teamId: "ours", name: "Kid", pitches: [{ id: "pt1", grade: 3 }] }]);
      if (pid === "p33") {
        await su.query("insert into public.minors (program_id, pitcher_id) values ($1, $2)", [tA, pid]);
        await su.query("insert into public.guardian_consents (program_id, pitcher_id, guardian_user_id, method) values ($1, $2, $3, 'test')", [tA, pid, U.parent]);
      }
      const u2 = await one("pitching", "select public.pc_upload_add($1, $2, $3::jsonb, $4::jsonb) r", [tA, pid, meta(), rows12]);
      await as("pitching", "select public.pc_proposals_set($1, $2, $3::jsonb)", [tA, pid, JSON.stringify([{ field: "slot", value: "sidearm" }])]);
      const had = +(await su.query("select (select count(*) from public.uploads where pitcher_id = $1) + (select count(*) from public.proposals where pitcher_id = $1) n", [pid])).rows[0].n;
      if (pid === "p31") await su.query("insert into public.purged (program_id, pitcher_id) values ($1, $2)", [tA, pid]);
      if (pid === "p32") await su.query("insert into public.minors (program_id, pitcher_id) values ($1, $2)", [tA, pid]);
      if (pid === "p33") await su.query("delete from public.guardian_consents where program_id = $1 and pitcher_id = $2", [tA, pid]);
      const left = +(await su.query("select (select count(*) from public.uploads where pitcher_id = $1) + (select count(*) from public.proposals where pitcher_id = $1) n", [pid])).rows[0].n;
      check(typeof u2 === "string" && had === 2 && left === 0, `a child's uploads and proposals go when he's ${how} (${had} -> ${left})`);
    }
    check(!!(await as("pitching", "select public.pc_upload_add($1, 'p32', $2::jsonb, $3::jsonb)", [tA, meta(), rows12])).error, "and nothing new is taken while he's held");
    await su.query("insert into public.pitchers (program_id, id, doc) values ($1, 'p34', $2)", [tA, { id: "p34", updatedAt: 1000, teamId: "ours", name: "Gone", pitches: [{ id: "pt1", grade: 3 }] }]);
    await as("pitching", "select public.pc_proposals_set($1, 'p34', $2::jsonb)", [tA, JSON.stringify([{ field: "slot", value: "sidearm" }])]);
    const gone = (await su.query("select id from public.proposals where pitcher_id = 'p34' and status = 'pending'")).rows[0];
    await su.query("update public.pitchers set doc = doc || '{\"deletedAt\": 2000, \"updatedAt\": 2000}' where program_id = $1 and id = 'p34'", [tA]);
    const dec = await as("pitching", "select public.pc_proposal_decide($1, true)", [gone && gone.id]);
    const kept = (await su.query("select doc from public.pitchers where program_id = $1 and id = 'p34'", [tA])).rows[0].doc;
    check(gone && !!dec.error && kept && kept.name === "Gone" && !kept.slot, "a pitcher taken off the roster: his proposal can't be accepted, and his record is left as it was");
  }

  console.log("13. The migration refuses a database that already has programs");
  {
    const G = DB + "_guard";
    const g0 = new Client({ connectionString: BASE }); await g0.connect(); await g0.query(`drop database if exists ${G}`); await g0.query(`create database ${G}`); await g0.end();
    const g = new Client({ connectionString: dbUrl(G) }); await g.connect();
    await g.query(fs.readFileSync(path.join(__dirname, "auth_stub.sql"), "utf8"));
    const files = fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort();
    for (const f of files.filter((x) => x < "20261106")) await g.query(fs.readFileSync(path.join(dir, f), "utf8"));
    await g.query("insert into public.programs (name) values ('An old program')");
    let err = null; try { await g.query(fs.readFileSync(path.join(dir, "20261106000000_pitchiq_teams.sql"), "utf8")); } catch (e) { err = e.message; }
    const untouched = (await g.query("select to_regclass('public.invites') is not null i, to_regclass('public.organizations') is null o, exists (select 1 from pg_proc where proname = 'pc_push') f")).rows[0];
    check(/already hold rows/.test(err || "") && untouched.i && untouched.o && untouched.f, `M2: it stops before changing anything (${err})`);
    await g.end();
    const g1 = new Client({ connectionString: BASE }); await g1.connect(); await g1.query(`drop database if exists ${G}`); await g1.end();
  }

  await conn.end(); await su.end();
  const z = new Client({ connectionString: BASE }); await z.connect(); await z.query(`drop database if exists ${DB}`); await z.end();
  console.log(fails ? `\n${fails} of ${checks} team check(s) FAILED` : `\nall ${checks} team checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
