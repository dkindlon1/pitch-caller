/*
 * Review fixes (Nov 19): the Build 1 logging migration must not rewrite or long-lock the events table.
 * Builds a scratch database with an events table of LOCK_ROWS rows (default 1,000,000; test-sql.sh runs 20,000) whose
 * docs are a real pitch event's (about 2.8 KB), then applies the migration (MIGRATION, default the repo's
 * 20261118000000_build1_logging.sql) in one transaction while
 *   - another session watches pg_locks on public.events (the lock modes held, for how long), and
 *   - a third session runs an ordinary read of public.events and times how long it waits.
 * Checks: no table rewrite (the table's file, relfilenode, is unchanged), the migration's locks are held under a second,
 * the concurrent read isn't held up by more than a second, rows already there keep both columns null, and a doc written
 * afterwards gets them filled. Prints every timing. Usage: PGURL=... node supabase/test/logging_lock_test.js
 */
const { Client } = require("pg");
const fs = require("fs"), path = require("path");
const BASE = process.env.PGURL; if (!BASE) { console.error("set PGURL"); process.exit(2); }
const ROWS = +(process.env.LOCK_ROWS || 1000000);
const MIG = process.env.MIGRATION || path.join(__dirname, "../migrations/20261118000000_build1_logging.sql");
const DB = "pc_lock_" + process.pid, url = BASE.replace(/\/[^/?]*(\?|$)/, `/${DB}$1`);
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// a real pitch event from the seeded season (its shape and size); the ids vary per row
const DOC = { id: "x", type: "pitch", gameId: "g", pitcherId: "p", n: 1, res: "cstrike", count: { balls: 0, strikes: 0 }, choice: "engine", pitchId: "pf", pitchName: "Fastball", quad: "down-away",
  prob: 0.31, mix: Array.from({ length: 12 }, (_, i) => [`p${i % 4}`, ["Fastball", "Slider", "Changeup", "Curveball"][i % 4], ["up-in", "up-away", "down-in", "down-away"][i % 4], 0.08]),
  styledMix: Array.from({ length: 12 }, (_, i) => [`p${i % 4}`, ["Fastball", "Slider", "Changeup", "Curveball"][i % 4], ["up-in", "up-away", "down-in", "down-away"][i % 4], 0.08]),
  styleApplied: "none", strength: null, sit: { balls: 0, strikes: 0, outs: 1, bases: [false, true, false], batters_faced: 7, pitch_count: 23, inning: 3, same_side: true },
  pred: { whiff: 0.12, strike: 0.61, hard: 0.2, note: "x".repeat(600) }, ars: { pitches: Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, grade: 3, command: 3, feel: 0.7 })) },
  v08: { look: 0.2, sigma: 1.1, why: "Ahead in the count, his slider has been missing bats", intent: "chase", mechanism: "tunnel" }, v: { app: "1.3.0", engine: "1.2.3", data: "x", learn: "2" } };

(async () => {
  const a0 = new Client({ connectionString: BASE }); await a0.connect();
  await a0.query(`drop database if exists ${DB}`); await a0.query(`create database ${DB}`); await a0.end();
  const su = new Client({ connectionString: url }); await su.connect();
  try {
    console.log(`Building public.events with ${ROWS.toLocaleString()} rows (migration: ${path.basename(MIG)}${process.env.MIGRATION ? ", from MIGRATION" : ""})`);
    await su.query("create schema private; create table public.events (program_id uuid not null, id text not null, doc jsonb not null, primary key (program_id, id))");
    let t = Date.now();
    for (let from = 0; from < ROWS; from += 200000) {
      const n = Math.min(200000, ROWS - from);
      await su.query(`insert into public.events (program_id, id, doc) select '00000000-0000-0000-0000-000000000001', 'e' || g, jsonb_set($1::jsonb, '{id}', to_jsonb('e' || g)) from generate_series($2::int, $3::int) g`, [JSON.stringify(DOC), from + 1, from + n]);
    }
    await su.query("vacuum analyze public.events");
    const size = (await su.query("select pg_size_pretty(pg_total_relation_size('public.events')) s, (select relfilenode from pg_class where oid = 'public.events'::regclass) f")).rows[0];
    console.log(`  built in ${((Date.now() - t) / 1000).toFixed(1)} s: ${size.s}`);

    // the migration, in one transaction, with a watcher on pg_locks and an ordinary reader alongside
    const mig = new Client({ connectionString: url }), watch = new Client({ connectionString: url }), reader = new Client({ connectionString: url });
    await Promise.all([mig.connect(), watch.connect(), reader.connect()]);
    const migPid = (await mig.query("select pg_backend_pid() p")).rows[0].p;
    const seen = new Map(); let watching = true;
    const watcher = (async () => {
      while (watching) {
        const r = await watch.query("select mode, granted from pg_locks where pid = $1 and relation = 'public.events'::regclass", [migPid]);
        const now = Date.now(); for (const x of r.rows) if (x.granted) { const s = seen.get(x.mode) || { first: now, last: now }; s.last = now; seen.set(x.mode, s); }
        await sleep(5);
      }
    })();
    t = Date.now();
    await mig.query("begin");
    const migDone = mig.query(fs.readFileSync(MIG, "utf8"));
    await sleep(50);
    const r0 = Date.now(); const readDone = reader.query("select doc ->> 'n' n from public.events where program_id = '00000000-0000-0000-0000-000000000001' and id = 'e12345'").then(() => Date.now() - r0);
    await migDone; const migMs = Date.now() - t;
    await mig.query("commit"); const totalMs = Date.now() - t;
    const readWait = await readDone; watching = false; await watcher;
    const after = (await su.query("select (select relfilenode from pg_class where oid = 'public.events'::regclass) f, pg_size_pretty(pg_total_relation_size('public.events')) s")).rows[0];
    console.log(`  migration statements: ${migMs} ms; committed after ${totalMs} ms`);
    for (const [mode, s] of seen) console.log(`  lock on public.events: ${mode}, seen held for ~${Math.max(1, s.last - s.first)} ms`);
    console.log(`  an ordinary read started 50 ms in waited ${readWait} ms`);
    console.log(`  table file (relfilenode) ${size.f} -> ${after.f}; size ${size.s} -> ${after.s}`);
    check(after.f === size.f, "no table rewrite: the events table's file is the same one");
    check(totalMs < 1000, `the migration holds its locks on events for under a second (${totalMs} ms, ${ROWS.toLocaleString()} rows)`);
    check(readWait < 1000, `a sync-like read alongside it isn't held up (${readWait} ms)`);
    const old = (await su.query("select count(*) filter (where style_applied is null and has_mix is null) n_null, count(*) n from public.events where id in ('e1', 'e500', 'e" + ROWS + "')")).rows[0];
    check(+old.n_null === 3, `rows already in the table keep both columns null (${old.n_null} of ${old.n} sampled)`);
    await su.query("insert into public.events (program_id, id, doc) values ('00000000-0000-0000-0000-000000000001', 'new1', $1), ('00000000-0000-0000-0000-000000000001', 'new2', $2)",
      [JSON.stringify(DOC), JSON.stringify({ id: "new2", type: "pitch", n: 1 })]);
    const nw = (await su.query("select id, style_applied, has_mix from public.events where id in ('new1', 'new2') order by id")).rows;
    check(nw[0].style_applied === "none" && nw[0].has_mix === true && nw[1].style_applied === null && nw[1].has_mix === false,
      `a doc written afterwards gets them filled (new app: ${nw[0].style_applied}/${nw[0].has_mix}; old app: ${nw[1].style_applied}/${nw[1].has_mix})`);
    await Promise.all([mig.end(), watch.end(), reader.end()]);
  } finally {
    await su.end();
    const a1 = new Client({ connectionString: BASE }); await a1.connect(); await a1.query(`drop database if exists ${DB}`); await a1.end();
  }
  console.log(fails ? `${fails} logging lock check(s) FAILED` : "all logging lock checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
