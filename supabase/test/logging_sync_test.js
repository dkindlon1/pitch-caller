/*
 * Build 1, Part 1: the new log fields through the sync functions against a real Postgres. A pitch event from the new
 * game app (full mix, styled mix, style applied, strength) is pushed and pulled back unchanged; an event from an older
 * game app (none of these fields) still pushes, pulls back as it was, and reads as "not logged" in the new columns.
 * A coach-call event keeps the engine's mix. Players still never read events rows.
 * Run from the repo root: PGURL=postgresql://postgres@localhost:5432/postgres node supabase/test/logging_sync_test.js
 */
const { Client } = require("pg");
const crypto = require("crypto");
const FX = require("./teams_fixture.js");
const BASE = process.env.PGURL || "postgresql://postgres@localhost:5432/postgres";
const DB = "pc_logging_sync_test";
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const dbUrl = (name) => { const u = new URL(BASE); u.pathname = "/" + name; return u.toString(); };
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

(async () => {
  const admin = new Client({ connectionString: BASE }); await admin.connect();
  await admin.query(`drop database if exists ${DB}`); await admin.query(`create database ${DB}`); await admin.end();
  const su = new Client({ connectionString: dbUrl(DB) }); await su.connect();
  try {
    await FX.applyAll(su);
    const U = { coach: crypto.randomUUID(), caller: crypto.randomUUID(), player: crypto.randomUUID() };
    for (const [k, id] of Object.entries(U)) await su.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [id, `${k}@test.local`]);
    const t = await FX.newTeam(su, U.coach, "Lakeside");
    await FX.addMember(su, t, U.caller, "caller");
    await FX.addMember(su, t, U.player, "player", ["p1"]);
    const push = (who, tbl, rows) => FX.asUser(su, U[who], "select public.pc_push($1, $2, $3::jsonb) as r", [t, tbl, JSON.stringify(rows)]).then((r) => r.rows[0].r);
    const pull = (who, tbl) => FX.asUser(su, U[who], "select public.pc_pull($1, $2, 0, '', 500) as r", [t, tbl]).then((r) => r.rows[0].r.rows);

    // a full mix as the app logs it: 0.1 + 0.2 + 0.3 + 0.4 is not exactly 1 in floating point, so real shares are used
    const mix = [["a", "Fastball", "down-away", 0.41234567890123], ["b", "Slider", "chase", 0.30123456789], ["a", "Fastball", "up-in", 0.18], ["c", "Changeup", "down-away", 0.10641975320877]];
    const fresh = { id: "e_new", createdAt: 3, updatedAt: 3000, type: "pitch", gameId: "g1", pitcherId: "p1", n: 1, pitchName: "Fastball", quad: "down-away", choice: "engine", prob: mix[0][3],
      res: "cstrike", count: "0-0", mix, styledMix: mix.map((m) => m.slice()), styleApplied: "none", strength: null };
    const coachEv = Object.assign({}, fresh, { id: "e_coach", n: 2, updatedAt: 3001, choice: "coach", coach: true, pitchName: "Changeup", quad: "up-in" });
    const old = { id: "e_old", createdAt: 1, updatedAt: 1000, type: "pitch", gameId: "g0", pitcherId: "p1", n: 1, pitchName: "Fastball", quad: "down-away", choice: "engine", prob: 0.4, res: "ball", count: "0-0" };

    console.log("1. The new fields go up and come back unchanged");
    let r = await push("caller", "events", [fresh, coachEv]);
    check(r.applied === 2, `a caller's iPad pushes events with the full mix (${JSON.stringify(r.rejected || [])})`);
    let es = await pull("coach", "events");
    const e1 = es.find((x) => x.id === "e_new"), e2 = es.find((x) => x.id === "e_coach");
    check(!!e1 && same(e1.mix, mix) && same(e1.styledMix, mix), "the full mix and the styled mix come back exactly (every share to the last digit)");
    check(!!e1 && e1.styleApplied === "none" && e1.strength === null && "strength" in e1, "style applied \"none\" and strength null come back (null kept, not dropped)");
    check(!!e2 && e2.choice === "coach" && same(e2.mix, mix), "a coach's own call keeps the engine's mix");

    console.log("2. An older game app (no new fields) still syncs");
    r = await push("caller", "events", [old]);
    check(r.applied === 1, "an event with none of the new fields is accepted");
    es = await pull("coach", "events");
    const e0 = es.find((x) => x.id === "e_old");
    check(!!e0 && same(e0, Object.assign({}, old, e0.updatedAt ? { updatedAt: e0.updatedAt } : {})) && !("mix" in e0) && !("styleApplied" in e0), "it comes back exactly as sent, with no new fields added");
    r = await push("caller", "events", [Object.assign({}, old, { updatedAt: 1001, res: "cstrike" })]);
    check(r.applied === 1, "an older app's later edit of that event still applies");

    console.log("3. The new columns");
    const cols = (await su.query("select id, style_applied, has_mix from public.events where program_id = $1 order by id", [t])).rows;
    const by = Object.fromEntries(cols.map((c) => [c.id, c]));
    check(by.e_new.style_applied === "none" && by.e_new.has_mix === true, "style_applied = none, has_mix = true for the new event");
    check(by.e_old.style_applied === null && by.e_old.has_mix === false, "style_applied null, has_mix false for the old one (\"not logged\")");

    console.log("4. Permissions unchanged");
    const mine = await pull("player", "events").catch((e) => ({ err: e.message }));
    check(Array.isArray(mine) ? mine.length === 0 : !!mine.err, `a player still reads no events rows (${Array.isArray(mine) ? mine.length + " rows" : mine.err})`);
  } finally { await su.end(); }
  console.log(fails ? `${fails} check(s) failed` : "all checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
