/* Database checks, run in Node against an in-memory IndexedDB. Run: node db_test.js (needs fake-indexeddb) */
require("fake-indexeddb/auto");
const PCDB = require("./db.js");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };

(async () => {
  const D = await PCDB.open({ name: "t1" });

  console.log("1. Records: create, read, update, soft delete");
  const team = await D.put("teams", { name: "RIT", isOurs: true, level: "college_d3" });
  check(team.id && team.createdAt && team.updatedAt, "ids and timestamps are stamped");
  const p = await D.put("pitchers", PCDB.newPitcher(team.id, { name: "Kindlon", number: "21" }));
  check((await D.get("pitchers", p.id)).name === "Kindlon", "read back a pitcher");
  check((await D.byIndex("pitchers", "teamId", team.id)).length === 1, "find pitchers by team");
  await new Promise((r) => setTimeout(r, 5));
  const p2 = await D.put("pitchers", Object.assign({}, p, { number: "22" }));
  check(p2.updatedAt > p.updatedAt && p2.createdAt === p.createdAt, "update keeps createdAt, moves updatedAt");
  await D.del("pitchers", p.id);
  check((await D.get("pitchers", p.id)) === null && (await D.all("pitchers")).length === 0, "deleted pitcher is gone from reads");
  check((await D.all("pitchers", true)).length === 1, "but kept as a tombstone so a sync can carry the delete");

  console.log("2. Events in bulk, found by game, pitcher and hitter");
  const g = await D.put("games", { date: PCDB.today(), level: "college_d3" });
  const evs = [];
  for (let i = 0; i < 2000; i++) evs.push({ gameId: g.id, pitcherId: i % 2 ? "pA" : "pB", hitterId: "h" + (i % 9), n: i, res: "ball" });
  const t0 = Date.now(); await D.putMany("events", evs);
  check((await D.byIndex("events", "gameId", g.id)).length === 2000, `2000 pitches written in one go (${Date.now() - t0} ms)`);
  check((await D.byIndex("events", "pitcherId", "pA")).length === 1000 && (await D.byIndex("events", "hitterId", "h3")).length === 222, "indexed by pitcher and hitter");

  console.log("3. Backup and restore");
  const dump = await D.exportAll();
  const json = JSON.stringify(dump);
  check(dump.stores.events.length === 2000 && dump.schema === PCDB.VERSION, `export carries every store (${(json.length / 1024).toFixed(0)} KB for 2000 pitches)`);
  const D2 = await PCDB.open({ name: "t2" });
  const st = await D2.importAll(JSON.parse(json));
  check(st.events === 2000 && (await D2.get("teams", team.id)).name === "RIT", "restores onto an empty device");
  await new Promise((r) => setTimeout(r, 5));
  await D2.put("teams", Object.assign({}, await D2.get("teams", team.id), { name: "RIT Tigers" }));
  const st2 = await D2.importAll(JSON.parse(json));
  check((await D2.get("teams", team.id)).name === "RIT Tigers" && st2.teams === 0, "an older backup never overwrites newer edits");
  let threw = false; try { await D2.importAll({ hello: 1 }); } catch (e) { threw = true; }
  check(threw, "refuses a file that isn't a backup");
  const since = await D2.changedSince(dump.exportedAt ? Date.parse(dump.exportedAt) : 0);
  check(since.teams.length === 1 && since.events.length === 0, "changedSince lists only what a sync would push");

  console.log("4. Moving the prototype's saved state into the database");
  const D3 = await PCDB.open({ name: "t3" });
  const S = { setup: { level: "hs", staff: [
    { name: "Starter", hand: "R", slot: "three-quarter", height_ft: 6.1, pitches: [{ name: "Fastball", kind: "FB", grade: 3, command: 4, feel: 0.8, shape: "ride", velo: 86 }, { name: "Slider", kind: "SL", grade: 4, command: 3, feel: 0.75, shape: "tight", velo: 78 }] },
    { name: "Reliever", hand: "L", slot: "sidearm", height_ft: 6.3, pitches: [{ name: "Fastball", kind: "FB", grade: 4, command: 3, feel: 0.8, shape: "", velo: 89 }] }],
    lineup: [{ name: "Smith", hand: "L" }, { name: "", hand: "R" }] },
    history: [{ when: Date.now() - 864e5, level: "hs", log: [{ n: 2, p: 1, pitch: "Fastball", kind: "FB", quad: "up-in", count: "0-1", res: "whiff", slot: 0, inning: 1 }, { n: 1, p: 0, pitch: "Slider", kind: "SL", quad: "chase", count: "0-0", res: "cstrike", slot: 0, inning: 1 }] }] };
  const m = await PCDB.migrateLegacy(D3, S);
  const ps = await D3.all("pitchers");
  check(ps.length === 2 && ps.find((x) => x.name === "Reliever").hand === "L" && ps.find((x) => x.name === "Starter").pitches[1].grade === 4, "staff and arsenals carried over");
  check((await D3.all("hitters")).length === 1 && S.setup.lineup[0].hitterId, "named hitters become an opponent roster");
  const mev = await D3.all("events");
  check(m.games === 1 && mev.length === 2 && mev.find((e) => e.n === 2).pitcherId === m.staffIds[1], "saved games become events credited to the right pitcher");
  check((await PCDB.migrateLegacy(D3, S)) === null && (await D3.all("pitchers")).length === 2, "runs once only");

  console.log("5. Pitch types map onto the engine's six kinds (v1.1)");
  const t = PCDB.PITCH_TYPES;
  check(t.Cutter.kind === "FC" && t.Sinker.kind === "SI" && t["Two-seam"].kind === "SI" && t.Sweeper.shape === "sweeper" && t.Splitter.kind === "CH" && t.Splitter.shape === "split" && t["Knuckle curve"].kind === "CB", "cutter, sinker, two-seam, sweeper, splitter, knuckle curve");

  for (const d of [D, D2, D3]) await d.destroy();
  console.log(fails ? `\n${fails} check(s) failed` : "\nall database checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
