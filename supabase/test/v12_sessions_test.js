/*
 * v1.2 Step 4: the v1.2 docs through the sync functions against a real Postgres (no migration: sessions, events and
 * pitchers are generic doc jsonb tables). A charted bullpen session (type "charted", 40 pitches with glove and landed
 * cells, a way-off cell one ring outside the grid), a game event with ph / bs / glove and a way-off cell, and a pitcher
 * whose pitch has lean_x / lean_z / spread: pushed by the roles that write them, pulled back unchanged by the others.
 * Run from the repo root: PGURL=postgresql://postgres@localhost:5432/postgres node supabase/test/v12_sessions_test.js
 */
const { Client } = require("pg");
const crypto = require("crypto");
const FX = require("./teams_fixture.js");
const BASE = process.env.PGURL || "postgresql://postgres@localhost:5432/postgres";
const DB = "pc_v12_sessions_test";
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const dbUrl = (name) => { const u = new URL(BASE); u.pathname = "/" + name; return u.toString(); };
// jsonb stores keys in its own order: compare with keys sorted
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

(async () => {
  const admin = new Client({ connectionString: BASE }); await admin.connect();
  await admin.query(`drop database if exists ${DB}`); await admin.query(`create database ${DB}`); await admin.end();
  const su = new Client({ connectionString: dbUrl(DB) }); await su.connect();
  try {
    await FX.applyAll(su);
    const U = { coach: crypto.randomUUID(), caller: crypto.randomUUID(), player: crypto.randomUUID(), viewer: crypto.randomUUID() };
    for (const [k, id] of Object.entries(U)) await su.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [id, `${k}@test.local`]);
    const t = await FX.newTeam(su, U.coach, "Lakeside");
    await FX.addMember(su, t, U.caller, "caller");
    await FX.addMember(su, t, U.player, "player", ["p1"]);
    await FX.addMember(su, t, U.viewer, "viewer");
    const push = (who, tbl, rows) => FX.asUser(su, U[who], "select public.pc_push($1, $2, $3::jsonb) as r", [t, tbl, JSON.stringify(rows)]).then((r) => r.rows[0].r);
    const pull = (who, tbl) => FX.asUser(su, U[who], "select public.pc_pull($1, $2, 0, '', 500) as r", [t, tbl]).then((r) => r.rows[0].r.rows);

    const pitcher = { id: "p1", createdAt: 1, updatedAt: 1000, teamId: "ours", name: "Drew", hand: "R",
      pitches: [{ id: "a", name: "Fastball", kind: "FB", grade: 3, command: 3, lean_x: 1.5, lean_z: -1.5, spread: 1.25 }, { id: "b", name: "Slider", kind: "SL", grade: 3, command: 3 }] };
    const pens = [];
    for (let i = 0; i < 40; i++) pens.push({ pitch: "Fastball", kind: "FB", glove: [1 + (i % 3), i % 2 ? 1 : 3], landed: i === 7 ? [2, -1] : i === 9 ? [5, 2] : [1 + (i % 3), i % 2 ? 0 : 2], radar: i % 4 ? undefined : 86 });
    const session = JSON.parse(JSON.stringify({ id: "s1", createdAt: 2, updatedAt: 2000, pitcherId: "p1", date: "2026-11-13", type: "charted", source: "Charted bullpen", n: 40,
      byType: [{ type: "Fastball", kind: "FB", n: 40, velo: 86 }], pitches: pens }));   // as IndexedDB -> JSON sends it (undefined radars dropped)
    const event = { id: "e1", createdAt: 3, updatedAt: 3000, type: "pitch", gameId: "g1", pitcherId: "p1", n: 1, pitchName: "Fastball", quad: "away", ph: "R", bs: "L",
      res: "ball", loc: "noncomp", locCell: [2, -1], glove: [2, 3] };

    console.log("1. Pushed by the roles that write them");
    let r = await push("coach", "pitchers", [pitcher]);
    check(r.applied === 1, "the head coach writes the pitcher with his lean and spread");
    r = await push("caller", "sessions", [session]);
    check(r.applied === 1, `a caller writes the charted bullpen session (${JSON.stringify(r.rejected || [])})`);
    r = await push("caller", "events", [event]);
    check(r.applied === 1, "a caller writes the game event with ph / bs / glove and a way-off cell");
    r = await push("player", "sessions", [Object.assign({}, session, { id: "s2", updatedAt: 2001 })]);
    check(r.applied === 1, "the pitcher himself can save a charted bullpen of his own");
    r = await push("viewer", "sessions", [Object.assign({}, session, { id: "s3", updatedAt: 2002 })]);
    check(r.applied === 0, "a viewer can't");
    const badTime = await push("caller", "sessions", [Object.assign({}, session, { id: "s4", updatedAt: "2026-11-13" })]).catch((e) => ({ err: e.message }));
    check(badTime.err || badTime.applied === 0, `a doc without a numeric updatedAt is refused (${badTime.err || JSON.stringify(badTime.rejected)})`);

    console.log("2. Pulled back unchanged");
    const ps = await pull("coach", "pitchers"), ss = await pull("coach", "sessions"), es = await pull("coach", "events");
    const p1 = ps.find((x) => x.id === "p1"), s1 = ss.find((x) => x.id === "s1"), e1 = es.find((x) => x.id === "e1");
    check(!!p1 && same(p1.pitches[0], pitcher.pitches[0]), `the pitcher's lean_x / lean_z / spread come back (${p1 && JSON.stringify(p1.pitches[0])})`);
    check(!!s1 && same(s1.pitches, session.pitches) && s1.type === "charted" && same(s1.byType, session.byType), "the charted session comes back whole: 40 pitches, the way-off cells ([2,-1], [5,2]), byType");
    check(!!e1 && same(e1.locCell, [2, -1]) && same(e1.glove, [2, 3]) && e1.ph === "R" && e1.bs === "L", "the event's cell, glove spot, ph and bs come back");
    const mine = (await pull("player", "sessions")).map((x) => x.id).sort();
    check(same(mine, ["s1", "s2"]), `the pitcher sees his own charted sessions (${mine})`);
    check((await pull("caller", "sessions")).length === 2, "the caller reads them");
  } finally { await su.end(); }
  console.log(fails ? `${fails} check(s) failed` : "all checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
