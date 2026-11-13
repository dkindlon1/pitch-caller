/*
 * v1.1 Step 5: supabase/migrations/20261115000000_v11_kinds.sql against a real Postgres. Every earlier migration is
 * applied, v1.0 data is put in (upload rows with sinkers and cutters stored as FB, pending shape proposals with v1.0
 * tags), then the v1.1 migration runs, and the checks read what it left.
 * Run from the repo root: PGURL=postgresql://postgres@localhost:5432/postgres node supabase/test/v11_kinds_test.js
 */
const { Client } = require("pg");
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const { asUser, newTeam, addMember } = require("./teams_fixture.js");
const BASE = process.env.PGURL || "postgresql://postgres@localhost:5432/postgres";
const DB = "pc_v11_kinds_test", V11 = "20261115000000_v11_kinds.sql";
const MIG = process.env.PC_MIGRATIONS || path.join(__dirname, "../migrations");   // a local copy for an older Postgres
let fails = 0, n = 0;
const check = (ok, msg) => { n++; console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const dbUrl = (name) => { const u = new URL(BASE); u.pathname = "/" + name; return u.toString(); };
const uid = (i) => `00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;

(async () => {
  const admin = new Client({ connectionString: BASE }); await admin.connect();
  await admin.query(`drop database if exists ${DB}`); await admin.query(`create database ${DB}`); await admin.end();
  const su = new Client({ connectionString: dbUrl(DB) }); await su.connect();
  try {
    await su.query(fs.readFileSync(path.join(__dirname, "auth_stub.sql"), "utf8"));
    const files = fs.readdirSync(MIG).filter((x) => x.endsWith(".sql")).sort();
    check(files[files.length - 1] === V11, `the v1.1 migration runs last (${files[files.length - 1]})`);
    for (const f of files.filter((x) => x < V11)) await su.query(fs.readFileSync(path.join(MIG, f), "utf8"));

    // ---- v1.0 data
    const U = { owner: uid(1), coach: uid(2) };
    for (const [k, id] of Object.entries(U)) await su.query("insert into auth.users (id, email) values ($1, $2)", [id, `${k}@x.org`]);
    const t = await newTeam(su, U.owner, "Lakeside");
    await addMember(su, t, U.coach, "pitching");
    const pitches = [   // as a v1.0 iPad stored them: four kinds, v1.0 tags, the real name in `type`
      { id: "a", name: "Fastball", kind: "FB", type: "Four-seam", shape: "ride" }, { id: "b", name: "Sinker", kind: "FB", type: "Sinker", shape: "sink" },
      { id: "c", name: "Cutter", kind: "FB", type: "Cutter", shape: "cut" }, { id: "d", name: "Curve", kind: "CB", type: "Curveball", shape: "loopy" },
      { id: "e", name: "Splitter", kind: "CH", type: "Splitter", shape: "drop" }, { id: "f", name: "Slider", kind: "SL", type: "Slider", shape: "tight" },
      { id: "g", name: "Fastball 2", kind: "FB", type: "Four-seam", shape: "ride" }, { id: "h", name: "Sinker 2", kind: "FB", type: "Sinker", shape: "sink" }];   // one pending proposal per pitch
    await su.query("insert into public.pitchers (program_id, id, doc) values ($1, 'p1', $2)", [t, { id: "p1", updatedAt: 1000, teamId: "ours", name: "Drew", hand: "R", pitches }]);
    const up = (await su.query(`insert into public.uploads (program_id, pitcher_id, uploaded_by, source, session_type, session_date, n_pitches)
      values ($1, 'p1', $2, 'trackman', 'bullpen', current_date, 6) returning id`, [t, U.coach])).rows[0].id;
    const rows = [["Four-seam", "FB"], ["Two-seam", "FB"], ["Sinker", "FB"], ["Cutter", "FB"], ["Slider", "SL"], ["Splitter", "CH"]];
    for (const [i, [ty, k]] of rows.entries()) await su.query("insert into public.upload_pitches (upload_id, idx, program_id, pitcher_id, pitch_type, kind, velo_mph) values ($1, $2, $3, 'p1', $4, $5, 88)", [up, i, t, ty, k]);
    check(!!(await su.query("insert into public.upload_pitches (upload_id, idx, program_id, pitcher_id, pitch_type, kind) values ($1, 99, $2, 'p1', 'Sinker', 'SI')", [up, t]).catch((e) => e)).code,
      "before: an SI row is refused (v1.0's four kinds)");
    const prop = (pid, shape, status = "pending") => su.query(`insert into public.proposals (program_id, pitcher_id, pitch_id, pitch_name, field, value, status)
      values ($1, 'p1', $2, 'x', 'shape', $3, $4) returning id`, [t, pid, { shape, ivb: 10, hb: 5 }, status]).then((r) => r.rows[0].id);
    const P = { fbRun: await prop("a", "run"), siSink: await prop("b", "sink"), siRide: await prop("h", "ride"), fcCut: await prop("c", "cut"),
      cbSharp: await prop("d", "sharp"), fbSink: await prop("g", "sink"), slLoopy: await prop("f", "loopy"), done: await prop("a", "cut", "accepted") };

    // ---- the v1.1 migration
    await su.query(fs.readFileSync(path.join(MIG, V11), "utf8"));
    console.log("1. upload_pitches: six kinds, stored rows remapped by pitch type");
    const kinds = (await su.query("select pitch_type, kind from public.upload_pitches where upload_id = $1 order by idx", [up])).rows.map((r) => `${r.pitch_type}:${r.kind}`);
    check(kinds.join(",") === "Four-seam:FB,Two-seam:SI,Sinker:SI,Cutter:FC,Slider:SL,Splitter:CH", `remapped (${kinds.join(", ")})`);
    check(!(await su.query("insert into public.upload_pitches (upload_id, idx, program_id, pitcher_id, pitch_type, kind) values ($1, 99, $2, 'p1', 'Sinker', 'SI')", [up, t]).catch((e) => e)).code
      && !!(await su.query("insert into public.upload_pitches (upload_id, idx, program_id, pitcher_id, pitch_type, kind) values ($1, 98, $2, 'p1', 'Knuckler', 'KN')", [up, t]).catch((e) => e)).code,
      "after: SI is taken, an unknown kind is still refused");

    console.log("2. The SQL migration table is the engine's (engine.py)");
    const engineSays = JSON.parse(execFileSync("python3", ["-c", `
import json, sys; sys.path.insert(0, ".")
import engine as e
cases = [("FB","ride","Four-seam"),("FB","sink","Sinker"),("FB","run","Two-seam"),("FB","cut","Cutter"),("FB","cut",None),("FB","run",None),
         ("CB","loopy","Curveball"),("CB","sharp","12-6 curve"),("CB","sharp",None),("CH","drop","Splitter"),("CH","drop",None),("SL","","Slurve"),
         ("SI","run","Sinker"),("FC","hard","Cutter"),("FB","runs","Four-seam"),("SI","ride",None),("FC","sink",None),("SL","tight","Sweeper")]
print(json.dumps([[*c, list(e.migrate_pitch(*c))] for c in cases]))`], { cwd: path.join(__dirname, "../.."), encoding: "utf8" }));
    const bad = [];
    for (const [k, s, ty, want] of engineSays) {
      const got = (await su.query("select private.pc_migrate_pitch($1, $2, $3) m", [k, s, ty])).rows[0].m;
      if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${k}/${s}/${ty}: ${got} vs ${want}`);
    }
    check(!bad.length, `pc_migrate_pitch = engine.py migrate_pitch on ${engineSays.length} cases${bad.length ? " (" + bad.join("; ") + ")" : ""}`);
    check((await su.query("select private.pc_shape_ok('SI', 'two-seam') a, private.pc_shape_ok('SI', 'rides') b, private.pc_shape_ok('FC', '') c, private.pc_shape_ok(null, 'run') d")).rows
      .map((r) => [r.a, r.b, r.c, r.d].join())[0] === "true,false,true,false", "pc_shape_ok: a kind's own tags (typical included), nothing else");
    const denied = await asUser(su, U.coach, "select private.pc_migrate_pitch('FB', 'ride', null)").catch((e) => e);
    check(denied.code === "42501", `the helpers aren't callable by a signed-in user (${denied.code}: ${denied.message})`);

    console.log("3. Pending v1.0 shape proposals: remapped through the table, or superseded");
    const got = Object.fromEntries((await su.query("select id, value, status from public.proposals where id = any($1)", [Object.values(P)])).rows.map((r) => [r.id, r]));
    const v = (id) => `${got[id].status}:${got[id].value.kind || "-"}/${got[id].value.shape}`;
    check(v(P.fbRun) === "pending:FB/runs" && v(P.siSink) === "pending:SI/run" && v(P.siRide) === "pending:SI/two-seam" && v(P.fcCut) === "pending:FC/" && v(P.cbSharp) === "pending:CB/power",
      `remapped in the pitch's v1.1 kind (four-seam run -> runs; sinker sink -> run, ride -> two-seam; cutter cut -> typical; curve sharp -> power)`);
    check(got[P.fbSink].status === "superseded" && got[P.slLoopy].status === "superseded",
      `superseded: "sink" on the four-seam (would make it a sinker) and "loopy" on the slider (no such slider tag) (${v(P.fbSink)}, ${v(P.slLoopy)})`);
    check(v(P.done) === "accepted:-/cut" && got[P.fbRun].value.ivb === 10, "a decided proposal is left alone; the numbers are kept");

    console.log("4. New proposals in v1.1 terms");
    const set = (list) => asUser(su, U.coach, "select public.pc_proposals_set($1, 'p1', $2::jsonb) r", [t, JSON.stringify(list)]).then((r) => r.rows[0].r);
    const kept = await set([{ field: "shape", pitch_id: "b", value: { shape: "two-seam", ivb: 14, hb: 13 } },   // the v1.0-stored sinker: SI tags
      { field: "shape", pitch_id: "a", value: { shape: "sink", ivb: 8, hb: 15 } },                                // a v1.0 tag: refused
      { field: "shape", pitch_id: "c", value: { kind: "FC", shape: "hard", ivb: 12, hb: -2 } },                   // kind given and right
      { field: "shape", pitch_id: "a", value: { kind: "SI", shape: "run", ivb: 8, hb: 15 } },                     // can't change the kind
      { field: "shape", pitch_id: "e", value: { shape: "split", ivb: 2, hb: 9 } },
      { field: "shape", pitch_id: "f", value: { ivb: 1, hb: -6 } }]);                                             // no shape: refused
    const pend = (await su.query("select pitch_id, value from public.proposals where program_id = $1 and status = 'pending' order by id", [t])).rows;
    check(kept === 3 && pend.map((r) => `${r.pitch_id}:${r.value.kind}/${r.value.shape}`).join(",") === "b:SI/two-seam,c:FC/hard,e:CH/split",
      `three kept, each with the pitch's kind (${pend.map((r) => `${r.pitch_id}:${r.value.kind}/${r.value.shape}`).join(", ")})`);
    const sid = (await su.query("select id from public.proposals where program_id = $1 and status = 'pending' and pitch_id = 'b'", [t])).rows[0].id;
    await asUser(su, U.coach, "select public.pc_proposal_decide($1, true)", [sid]);
    const b = (await su.query("select doc from public.pitchers where program_id = $1 and id = 'p1'", [t])).rows[0].doc.pitches.find((x) => x.id === "b");
    check(b.kind === "SI" && b.shape === "two-seam" && b.type === "Sinker" && b.ivb === 14,
      `accepting it leaves the v1.0-stored sinker a consistent v1.1 pitch (${JSON.stringify({ kind: b.kind, shape: b.shape, type: b.type })})`);
  } finally {
    await su.end();
    const a2 = new Client({ connectionString: BASE }); await a2.connect(); await a2.query(`drop database if exists ${DB}`); await a2.end();
  }
  console.log(fails ? `\n${fails} of ${n} check(s) FAILED` : `\nall ${n} v1.1 kinds checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
