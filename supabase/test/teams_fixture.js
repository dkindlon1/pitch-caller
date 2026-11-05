/*
 * Shared setup for the Supabase tests: Supabase's auth stand-in plus every migration in order, and a paid-up team with
 * members (what billing and invites would produce, done directly so each test starts from the same place).
 * Role names: head, pitching, caller, viewer (coach presets) and player (linked to pitcher records).
 */
const fs = require("fs"), path = require("path");

async function applyAll(su) {
  await su.query(fs.readFileSync(path.join(__dirname, "auth_stub.sql"), "utf8"));
  const dir = path.join(__dirname, "../migrations");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await su.query(fs.readFileSync(path.join(dir, f), "utf8"));
}

async function asUser(c, userId, text, params) {
  await c.query("begin");
  try {
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    const r = await c.query(text, params);
    await c.query("commit");
    return r;
  } catch (e) { await c.query("rollback"); throw e; }
}

// an organization owned by ownerId with one team he is head coach of, switched on as billing would
async function newTeam(su, ownerId, name, level = "college_d3") {
  const org = (await asUser(su, ownerId, "select public.pc_create_org($1, $2) as id", [name, level])).rows[0].id;
  const team = (await asUser(su, ownerId, "select public.pc_create_team($1, $2, $3, 'America/New_York', 'head') as id", [org, name, level])).rows[0].id;
  await su.query("update public.organizations set billing_status = 'active' where id = $1", [org]);
  await su.query("update public.programs set status = 'active' where id = $1", [team]);
  return team;
}

async function addMember(su, team, userId, role, pitcherIds = []) {
  await su.query("insert into public.members (program_id, user_id, role) values ($1, $2, $3) on conflict (program_id, user_id) do update set role = excluded.role", [team, userId, role]);
  for (const pid of pitcherIds) await su.query("insert into public.player_links (program_id, user_id, pitcher_id) values ($1, $2, $3)", [team, userId, pid]);
}

module.exports = { applyAll, asUser, newTeam, addMember };
