/*
 * D0 schema checks (database version 2). Run: node schema_test.js   (needs fake-indexeddb)
 *   1. a real version 1 database on the device upgrades in place: nothing lost, every old event marked a pitch,
 *      new stores and indexes made
 *   2. restoring a version 1 backup and a version 2 backup both work; a backup from a newer app is refused, untouched
 *   3. game statuses only move the allowed ways
 *   4. rows merged from elsewhere (a sync pull) keep their timestamps and only replace older ones
 *   5. plays between pitches change nothing the learner computes: learner v2 (pitchers and hitters) and v1
 */
require("fake-indexeddb/auto");
const PCDB = require("./db.js");
const { season, E, L } = require("./worlds.js");
const V1 = require("./learn.js");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// the version 1 schema exactly as it shipped (db.js at commit fed143e)
const V1_STORES = { teams: ["isOurs"], pitchers: ["teamId"], catchers: ["teamId"], hitters: ["teamId"], checkins: ["pitcherId", "date"],
  sessions: ["pitcherId"], games: ["date", "opponentId"], events: ["gameId", "pitcherId", "hitterId"], learned: [], meta: [] };
async function makeV1(name, events) {
  const r = indexedDB.open(name, 1);
  r.onupgradeneeded = () => { const db = r.result; for (const [s, idx] of Object.entries(V1_STORES)) { const os = db.createObjectStore(s, { keyPath: "id" }); for (const i of idx) os.createIndex(i, i); } };
  const db = await req(r);
  const tx = db.transaction(["events", "games"], "readwrite");
  tx.objectStore("games").put({ id: "g1", date: "2026-03-01", status: "final", updatedAt: 1, createdAt: 1 });
  for (const e of events) tx.objectStore("events").put(e);
  await new Promise((res) => (tx.oncomplete = res));
  db.close();
}

(async () => {
  console.log("1. A version 1 database on the device upgrades in place");
  {
    const old = Array.from({ length: 300 }, (_, i) => ({ id: "e" + i, gameId: "g1", pitcherId: "p1", n: i + 1, res: "ball", updatedAt: 5, createdAt: 5 }));
    await makeV1("up1", old);
    const D = await PCDB.open({ name: "up1" });
    const evs = await D.all("events");
    check(evs.length === 300 && evs.every((e) => e.type === "pitch"), `all 300 old events kept and marked as pitches (${evs.filter((e) => e.type === "pitch").length})`);
    check((await D.byIndex("events", "type", "pitch")).length === 300, "the new type index finds them");
    check((await D.get("games", "g1")).status === "final" && (await D.byIndex("games", "status", "final")).length === 1, "the old game is kept and the new status index finds it");
    const tx = D.raw.transaction(["packs", "readings"], "readonly");
    check(tx.objectStore("packs").indexNames.contains("gameId") && tx.objectStore("readings").indexNames.contains("sessionId"), "packs and readings stores made with their indexes");
    check(D.raw.version === 2, `database is at version ${D.raw.version}`);
    D.close();
    const again = await PCDB.open({ name: "up1" });
    check((await again.all("events")).length === 300, "opening it again changes nothing");
    again.close();
  }

  console.log("2. Backups: version 1 and version 2 restore; a newer one is refused");
  {
    const v1backup = { app: "pitch-caller", schema: 1, exportedAt: "2026-11-02T00:00:00Z", stores: {
      teams: [{ id: "t1", name: "RIT", isOurs: true, updatedAt: 10 }], pitchers: [], catchers: [], hitters: [], checkins: [], sessions: [],
      games: [{ id: "g1", date: "2026-03-01", status: "final", updatedAt: 10 }],
      events: [{ id: "e1", gameId: "g1", pitcherId: "p1", n: 1, res: "ball", updatedAt: 10 }, { id: "e2", gameId: "g1", pitcherId: "p1", n: 2, res: "whiff", updatedAt: 10 }],
      learned: [], meta: [] } };
    const D = await PCDB.open({ name: "r1" });
    const st = await D.importAll(JSON.parse(JSON.stringify(v1backup)));
    const evs = await D.all("events");
    check(st.events === 2 && st.teams === 1 && evs.every((e) => e.type === "pitch"), "a version 1 backup restores, its events marked as pitches");
    check(v1backup.stores.events.every((e) => e.type === undefined), "the backup itself isn't changed");
    await D.put("events", { gameId: "g1", type: "play", play: "sb", seq: 3 });
    await D.put("packs", { gameId: "g1", v: 1, staff: [] });
    const dump = await D.exportAll();
    check(dump.schema === 2 && dump.stores.packs.length === 1, "a new backup is version 2 and carries packs");
    const D2 = await PCDB.open({ name: "r2" });
    const st2 = await D2.importAll(JSON.parse(JSON.stringify(dump)));
    check(st2.events === 3 && st2.packs === 1 && (await D2.byIndex("events", "type", "play")).length === 1, "a version 2 backup restores, plays and packs included");
    let msg = "";
    try { await D2.importAll(Object.assign({}, dump, { schema: 3 })); } catch (e) { msg = e.message; }
    check(/newer version/.test(msg), `a version 3 backup is refused: "${msg.slice(0, 70)}…"`);
    msg = "";
    try { await D2.importAll({ app: "pitch-caller", schema: 2, stores: Object.assign({}, dump.stores, { lineups: [{ id: "x" }] }) }); } catch (e) { msg = e.message; }
    check(/doesn't know/.test(msg), "a backup with a store this app doesn't know is refused");
    check((await D2.all("events")).length === 3, "and a refused backup writes nothing");
  }

  console.log("3. Game statuses");
  {
    const g = { id: "g", status: "planned" };
    PCDB.moveGame(g, "live"); PCDB.moveGame(g, "suspended"); PCDB.moveGame(g, "live"); PCDB.moveGame(g, "final");
    check(g.status === "final" && g.statusLog.map((x) => x.to).join(">") === "live>suspended>live>final", "planned > live > suspended > live > final, each logged");
    const bad = [["final", "live"], ["planned", "suspended"], ["live", "planned"]].filter(([a, b]) => { try { PCDB.moveGame({ status: a }, b); return true; } catch (e) { return false; } });
    check(!bad.length, "final can't reopen, planned can't be suspended, live can't go back to planned");
    let thrown = false; try { PCDB.moveGame({ status: "live" }, "paused"); } catch (e) { thrown = true; }
    check(thrown, "an unknown status is refused");
  }

  console.log("4. Rows merged from a sync keep their timestamps; only newer ones replace");
  {
    const D = await PCDB.open({ name: "m1" });
    const mine = await D.put("teams", { id: "t1", name: "Mine" });
    const n = await D.mergeRows("teams", [{ id: "t1", name: "Older", updatedAt: mine.updatedAt - 1000 }, { id: "t2", name: "New", updatedAt: 42, createdAt: 40 }]);
    const t2 = await D.get("teams", "t2");
    check(n === 1 && (await D.get("teams", "t1")).name === "Mine", "an older row from elsewhere doesn't replace a newer one here");
    check(t2.updatedAt === 42 && t2.createdAt === 40, "a merged row keeps its own timestamps (not restamped)");
    await D.mergeRows("teams", [{ id: "t1", name: "Newer", updatedAt: mine.updatedAt + 1000 }]);
    check((await D.get("teams", "t1")).name === "Newer", "a newer row replaces ours");
  }

  console.log("5. Plays between pitches change nothing the learner computes");
  {
    const P3 = [{ id: "fb", name: "Fastball", kind: "FB", shape: "ride", velo: 86, usage: 0.55 }, { id: "sl", name: "Slider", kind: "SL", shape: "tight", velo: 78, usage: 0.3 }, { id: "ch", name: "Changeup", kind: "CH", shape: "fade", velo: 78, usage: 0.15 }];
    const entered = { Fastball: { command: 3, grade: 3 }, Slider: { command: 4, grade: 2 }, Changeup: { command: 2, grade: 3 } };
    const truth = () => ({ Fastball: { command: 2, grade: 4 }, Slider: { command: 4, grade: 2 }, Changeup: { command: 2, grade: 3 } });
    const pitches = season({ pitches: P3, entered, truth, games: 8, pas: 20, seed: 7, loc: true });
    const pitcher = { id: "p1", pitches: P3.map((p) => Object.assign({}, p, entered[p.name])) };
    // a play every 7 pitches, of every kind, carrying the same pitcher and hitter ids and even a res field
    const withPlays = [];
    pitches.forEach((e, i) => {
      withPlays.push(Object.assign({}, e, { type: "pitch" }));
      if (i % 7 === 3) withPlays.push({ id: "pl" + i, type: "play", play: PCDB.PLAY_KINDS[i % PCDB.PLAY_KINDS.length], gameId: e.gameId, pitcherId: e.pitcherId, hitterId: e.hitterId,
        ts: e.ts, n: e.n, res: "play", contact: "hard", kind: "FB", pitchName: "Fastball", quad: "middle" });
    });
    const plays = withPlays.length - pitches.length;
    const a = L.learnPitcher(E, pitcher, pitches, { scoreboard: true, now: 1e15 }), b = L.learnPitcher(E, pitcher, withPlays, { scoreboard: true, now: 1e15 });
    const strip = (p) => JSON.stringify(p, (k, v) => (k === "at" ? undefined : v));
    check(strip(a) === strip(b), `learner v2: the same profile, flags and scoreboard with ${plays} plays mixed in`);
    const hitter = { id: pitches[0].hitterId };
    const ha = L.hitterModel(E, hitter, pitches.filter((e) => e.hitterId === hitter.id), "college_d3", { now: 1e15 });
    const hb = L.hitterModel(E, hitter, withPlays.filter((e) => e.hitterId === hitter.id), "college_d3", { now: 1e15 });
    check(JSON.stringify(ha) === JSON.stringify(hb), `hitter memory is the same (${ha.n} swings)`);
    const va = V1.pitcherModel(E, pitcher, pitches, { now: 1e15 }), vb = V1.pitcherModel(E, pitcher, withPlays, { now: 1e15 });
    check(strip(va) === strip(vb), "learner v1 (check-ins and logging helpers) is the same too");
    const h1a = V1.hitterModel(hitter, pitches.filter((e) => e.hitterId === hitter.id), "college_d3", { now: 1e15 });
    const h1b = V1.hitterModel(hitter, withPlays.filter((e) => e.hitterId === hitter.id), "college_d3", { now: 1e15 });
    check(JSON.stringify(h1a) === JSON.stringify(h1b), "and v1 hitter memory");
    check(L.isPitch({}) && L.isPitch({ type: "pitch" }) && !L.isPitch({ type: "play" }) && PCDB.isPitch({}) && !PCDB.isPitch({ type: "play" }), "an event with no type (version 1) is a pitch; a play is not");
  }

  console.log(fails ? `\n${fails} schema check(s) FAILED` : "\nall schema checks passed");
  process.exit(fails ? 1 : 0);
})();
