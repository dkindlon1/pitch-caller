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
