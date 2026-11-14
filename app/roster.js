// ------------------------------------------------------------------ database glue
// The database is the source of truth for the roster, opponents, games, every pitch and what's been learned.
// Reads during a game come from an in-memory copy (the engine needs answers instantly); writes go straight through.
const DB = { D: null, ready: false, failed: null, teams: new Map(), pitchers: new Map(), catchers: new Map(), hitters: new Map(),
  checkins: new Map(), models: new Map(), sessions: new Map(), counts: new Map() };
// games set up on the website (see openFromPortal): a message to show, and today's planned games on this device
var PORTAL = { msg: null, today: [] };
const FATIGUE = { hs: 60, travel: 60, college_d3: 75, college_d1: 80, mlb: 90 };   // the engine's fatigue points (engine_data.json, LEVEL)
const LOCZ = ["heart", "edge", "off", "noncomp"];
let pendingLoc = null;
let pendingGlove = null;   // v1.2: where the catcher set up (a 5x5 cell), when that's logged
let saveWarned = false;

function dbErr(e) { console.error(e); if (!saveWarned) { saveWarned = true; toast("Couldn't save to the database on this device"); } }
async function dbPut(store, obj) {
  if (!DB.D) return obj;
  try { const x = await DB.D.put(store, obj); obj.id = x.id; obj.createdAt = x.createdAt; obj.updatedAt = x.updatedAt; return obj; }
  catch (e) { dbErr(e); return obj; }
}
const ourTeam = () => [...DB.teams.values()].find((t) => t.isOurs);
const opponents = () => [...DB.teams.values()].filter((t) => !t.isOurs).sort((a, b) => a.name.localeCompare(b.name));
const teamHitters = (tid) => [...DB.hitters.values()].filter((x) => x.teamId === tid).sort((a, b) => (+a.number || 99) - (+b.number || 99) || a.name.localeCompare(b.name));
const rosterPitchers = () => [...DB.pitchers.values()].sort((a, b) => a.name.localeCompare(b.name));
const todayCheckin = (pid) => { const c = DB.checkins.get(pid); return c && c.date === todayT() ? c : null; };
// what's been learned (learner v2): per pitcher { profile, served }, per hitter the hitter model
const pModel = (pid) => DB.models.get("v2:" + pid);
const hModel = (hid) => DB.models.get("h2:" + hid);

async function boot() {
  if (typeof PCDB === "undefined") return;
  try {
    const D = await PCDB.open({ onVersionChange: () => { DB.ready = false; DB.failed = new Error("A newer version of PitchIQ opened in another tab. Reload this page."); toast(DB.failed.message); render(); } });
    DB.D = D;
    const mig = await PCDB.migrateLegacy(D, S);
    for (const [store, map] of [["teams", DB.teams], ["pitchers", DB.pitchers], ["catchers", DB.catchers], ["hitters", DB.hitters]]) for (const x of await D.all(store)) map.set(x.id, x);
    await migrateRosterV11([...DB.pitchers.values()]);
    for (const x of await D.all("learned")) DB.models.set(x.id, x);
    for (const x of await D.byIndex("checkins", "date", todayT())) DB.checkins.set(x.pitcherId, x);
    if (!ourTeam()) { const t = await dbPut("teams", { name: "Our team", isOurs: true, level: S.setup.level }); DB.teams.set(t.id, t); }
    if (mig) { S.setup.staffIds = mig.staffIds; if (mig.opponentId) S.setup.opponentId = mig.opponentId; }
    if (!DB.pitchers.size) { const p = await dbPut("pitchers", PCDB.newPitcher(ourTeam().id, { name: "Pitcher 1" })); DB.pitchers.set(p.id, p); }
    S.setup.staffIds = (S.setup.staffIds || []).filter((id) => DB.pitchers.has(id));
    if (!S.setup.staffIds.length) S.setup.staffIds = rosterPitchers().slice(0, 2).map((p) => p.id);
    attachStaff();
    if (S.setup.catcherId && !DB.catchers.has(S.setup.catcherId)) S.setup.catcherId = null;
    // this device's id, logged with every pitch (several iPads may chart for one team once there's sync)
    let dev = await D.get("meta", "device");
    if (!dev) dev = await D.put("meta", { id: "device", uid: PCDB.uid("dev") });
    DB.deviceId = dev.uid;
    DB.ready = true;
    await flushQueued();
    await syncSetup().catch((e) => console.warn("sync setup", e));
    await loadPrep().catch(() => {});
    await openFromPortal().catch((e) => { PORTAL.msg = syncMessage(e); console.warn("open from the website", e); });
    await loadPlanned().catch(() => {});
    save(); render();
    // pitch counts per pitcher for the roster cards, and hitter memory for tonight's lineup, without holding up the screen.
    // DB.warm says when that start-of-game learning is done (v1.2: game_mix_e2e waits for it before the first pitch)
    DB.warm = false;
    setTimeout(async () => { try {
      // D9: learning that a closed page never finished (one job per game; "toLearn" alone is the older single slot)
      for (const job of (await D.all("meta")).filter((m) => m.id === "toLearn" || /^toLearn:/.test(m.id))) await learnAfterGame(job);
      if (await D.get("meta", "checkDups")) { await checkDuplicates().catch((e) => console.warn("duplicate check", e)); await D.del("meta", "checkDups"); }
      for (const p of DB.pitchers.values()) DB.counts.set(p.id, (await D.byIndex("events", "pitcherId", p.id)).filter((e) => !e.legacy && PCDB.isPitch(e)).length);
      await refreshOutings().catch((e) => console.warn("outings", e));
      for (const p of S.setup.staff) if (!pModel(p.id) && DB.counts.get(p.id)) await relearnPitcher(p.id);
      await refreshLineupMemory();
      if (S.view === "roster") render();
    } finally { DB.warm = true; } }, 50);
  } catch (e) {
    DB.failed = e; console.warn("Database unavailable, running without it:", e && e.message);
    toast(e && e.code === "blocked" ? e.message : "The database couldn't open, so pitches are kept on this page only. Reload to try again.");
    render();
  }
}

// today's staff: the roster records themselves, so edits on the Roster screen show up in the game right away
// v1.1 Step 1: stored pitchers move to the six kinds through the engine's one migration table (PitchEngine.migratePitch,
// by the stored pitch type first). Each changed pitcher is written back once; every change is kept in meta "v11_migration"
// (pitcher, pitch, type, from, to, kept sign) so it can be checked or undone by hand.
async function migrateRosterV11(list) {
  const log = [];
  for (const p of list) {
    const r = PCDB.migratePitcherV11(p, PitchEngine.migratePitch, PitchEngine.SHAPE_TAGS);   // v1.1 Step 5: an unknown tag reads as typical, as v1.0 did
    if (p.kindsV === PCDB.KINDS_V && r.length) { log.push(...r); await dbPut("pitchers", p); }
  }
  if (log.length && DB.D) {
    try {
      const m = (await DB.D.get("meta", "v11_migration")) || { id: "v11_migration", log: [] };
      const ts = Date.now();
      m.log = (m.log || []).concat(log.map((x) => Object.assign({ ts }, x)));
      await DB.D.put("meta", m);
    } catch (e) { console.warn("v1.1 migration log", e); }
  }
  return log;
}

function attachStaff() {
  const staff = S.setup.staffIds.map((id) => DB.pitchers.get(id)).filter(Boolean);
  if (staff.length) S.setup.staff = staff;
  if (G().pitcher >= S.setup.staff.length) G().pitcher = 0;
}

// what's been learned about tonight's hitters, loaded before they step in
async function refreshLineupMemory() {
  for (const b of S.setup.lineup) if (b.hitterId) await relearnHitter(b.hitterId);
  // hitters who haven't seen a pitch yet tonight pick up what was just loaded; if that's the man at the plate, call again
  const k = G().know; let redo = false;
  S.setup.lineup.forEach((b, i) => {
    const e = k[String(i)], m = b.hitterId && hModel(b.hitterId);
    if (e && m && !Object.keys(e.seen).length) { e.seed = PCLearner.seedDamage(m, 8, hitterGrades(b) !== null); e.damage = Object.assign({}, e.seed); if (i === slotIdx()) redo = true; }   // v1.0 #20, #7
  });
  if (redo && G().call && !G().call.coach && !G().inningOver) makeCall();
}

// ------------------------------------------------------------------ learning (learner v2, spec 5-12)
// Runs in a worker so learning after a game never freezes the screen. If a worker can't start, the same code runs here.
let learnWorker = null, learnSeq = 0;
const learnWaiting = new Map();
function learnLocal(msg) { return Promise.resolve(pcLearnMessage(E, PCLearner, msg)); }
function learnCall(msg) {
  if (learnWorker === null) {
    try {
      const src = document.getElementById("pc-worker").textContent;
      learnWorker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      learnWorker.onmessage = (e) => { const w = learnWaiting.get(e.data.id); if (!w) return; learnWaiting.delete(e.data.id); e.data.ok ? w.res(e.data) : w.rej(new Error(e.data.error)); };
      learnWorker.onerror = (e) => { console.warn("learning worker failed, learning on the main thread", e.message); learnWorker = false; for (const [, w] of learnWaiting) w.retry(); learnWaiting.clear(); };
      learnWorker.postMessage({ type: "init", data: PC_DATA });
    } catch (e) { learnWorker = false; }
  }
  if (!learnWorker) return learnLocal(msg);
  return new Promise((res, rej) => {
    const id = ++learnSeq;
    learnWaiting.set(id, { res, rej, retry: () => learnLocal(msg).then(res, rej) });
    learnWorker.postMessage(Object.assign({ id }, JSON.parse(JSON.stringify(msg))));
  });
}
const levelOf = () => S.setup.level;
// learn from every pitch he's thrown, then serve one step toward it (spec 11). Serving steps once per new game only.
// v1.2: what his logged cells say about a pitch's miss lean (a flag: the coach's setting is what the engine uses)
function leanNote(pid, name) {
  const m = pModel(pid), lm = m && m.leans && m.leans[name];
  return lm && lm.flag && lm.flag.length ? h("small", { class: "muted", style: { display: "block" } }, lm.flag.join("; ")) : null;
}

// ------------------------------------------------------------------ v1.2 Step 4: bullpen charting (plan 2.6, L8)
// Three taps a pitch: which pitch, where the catcher set up, where it ended up (a grid cell, or a way-off arrow). Saved as
// a sessions doc (type "charted") next to TrackMan / Rapsodo sessions; it feeds only the miss-lean estimate (no game
// state, no landing-today, no confidence). It carries source / n / byType so an older app lists it without trouble.
let pen = { pid: null, pitch: null, glove: null, landed: null, radar: "", log: [] };
function cellGrid(label, sel, pick, withWay) {   // a 5x5 catcher's-view grid (+ way-off arrows); bullpen mode and the fix editors
  const cells = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const on = sel && sel[0] === r && sel[1] === c;
    cells.push(h("button", { class: `lc z-${cellZone([r, c])}${on ? " on" : ""}`, "aria-pressed": String(!!on), "aria-label": `${label}: row ${r + 1}, column ${c + 1}`,
      on: { click: () => { pick(on ? null : [r, c]); render(); } } }));
  }
  const ways = withWay ? h("div", { class: "lways", role: "group", "aria-label": `${label}: way off, which way` }, WAY_DIRS.map(([wc, arrow, name]) => {
    const on = sel && sel[0] === wc[0] && sel[1] === wc[1];
    return h("button", { class: `btn pill lwild${on ? " on" : ""}`, "aria-pressed": String(!!on), "aria-label": `Way off, ${name}`, on: { click: () => { pick(on ? null : wc.slice()); render(); } } }, `Way off ${arrow}`);
  })) : null;
  return h("div", { class: "locpick" }, h("div", { class: "lg-head" }, h("span", { class: "t" }, label), h("span", { class: "muted" }, sel ? (inGrid(sel) ? cellZone(sel) : "way off") : "catcher's view")),
    h("div", { class: "lg-body" }, h("div", { class: "lgrid", role: "group", "aria-label": label }, cells), ways));
}
function bullpenView() {
  const ps = DB.ready ? rosterPitchers() : [];
  const p = ps.find((x) => x.id === pen.pid) || null;
  const logIt = () => {
    if (!p || !pen.pitch || !pen.glove || !pen.landed) return;
    const d = p.pitches.find((x) => x.name === pen.pitch);
    pen.log.push({ pitch: pen.pitch, kind: d ? d.kind : "FB", glove: pen.glove, landed: pen.landed, radar: pen.radar === "" ? undefined : +pen.radar });
    pen.landed = null; pen.radar = ""; render();
  };
  const save = async () => {
    if (!p || !pen.log.length) return;
    const by = {};
    for (const x of pen.log) { const b = (by[x.pitch] = by[x.pitch] || { type: x.pitch, kind: x.kind, n: 0, velo: null, _v: [] }); b.n++; if (x.radar) b._v.push(x.radar); }
    const byType = Object.values(by).map((b) => ({ type: b.type, kind: b.kind, n: b.n, velo: b._v.length ? Math.round(b._v.reduce((a, v) => a + v, 0) / b._v.length * 10) / 10 : null }));
    const sess = await dbPut("sessions", { pitcherId: p.id, date: todayT(), type: "charted", source: "Charted bullpen", n: pen.log.length, byType, pitches: pen.log.slice() });
    DB.sessions.set(p.id, [sess].concat(DB.sessions.get(p.id) || []));
    pen.log = []; await relearnPitcher(p.id); render(); toast(`Saved ${sess.n} bullpen pitches for ${p.name}`);
  };
  if (!DB.ready) return h("main", {}, h("section", { class: "panel glass" }, h("h2", {}, "Bullpen"),
    h("p", { class: "note" }, "Bullpen charting saves to your roster, so it needs the database. Set up your roster (Roster screen), then chart here.")));
  const lm = p ? (pModel(p.id) || {}).leans || {} : {};
  return h("main", {}, h("section", { class: "panel glass", "aria-label": "Bullpen charting" },
    h("div", { class: "panel-head" }, h("h2", {}, "Bullpen"), h("span", { class: "meta" }, "Three taps a pitch: the pitch, where the catcher set up, where it ended up")),
    h("div", { class: "seg", role: "group", "aria-label": "Pitcher" }, ps.map((x) => h("button", { "aria-pressed": String(pen.pid === x.id), on: { click: () => { if (pen.log.length && pen.pid !== x.id) { toast("Save or clear this session first"); return; } pen.pid = x.id; pen.pitch = null; render(); } } }, x.name))),
    p ? [
      h("div", { class: "seg", role: "group", "aria-label": "Pitch" }, (p.pitches || []).filter((d) => d.active !== false).map((d) =>
        h("button", { "aria-pressed": String(pen.pitch === d.name), on: { click: () => { pen.pitch = d.name; render(); } } }, chip(d.kind, d.sign), d.name))),
      h("div", { class: "lg-body" }, cellGrid("Where the catcher set up", pen.glove, (v) => { pen.glove = v; }, false),
        cellGrid("Where it ended up", pen.landed, (v) => { pen.landed = v; }, true)),
      h("label", { class: "f radar" }, "Radar, mph (optional)", h("input", { type: "number", inputmode: "decimal", min: 40, max: 105, step: 0.5, value: pen.radar, style: { width: "90px" },
        on: { change: (e) => { pen.radar = e.target.value; } } })),
      h("div", { class: "row-acts" },
        h("button", { class: "btn primary", disabled: !(pen.pitch && pen.glove && pen.landed), on: { click: logIt } }, "Log pitch"),
        h("button", { class: "btn", disabled: !pen.log.length, on: { click: () => { pen.log.pop(); render(); } } }, "Undo last"),
        h("button", { class: "btn", disabled: !pen.log.length, on: { click: save } }, `Save session (${pen.log.length})`)),
      h("p", { class: "note" }, "The catcher's spot stays set between pitches; tap a new one when he moves. Set up on both sides of the plate: each pitch's lean needs targets on both sides."),
      pen.log.length ? h("div", { class: "pen-log" }, pen.log.slice(-12).map((x) => h("span", {}, `${x.pitch}: ${inGrid(x.landed) ? cellZone(x.landed) : "way off"}`))) : null,
      Object.keys(lm).length ? h("div", {}, h("h3", {}, "What his logs say about his misses"), Object.entries(lm).map(([nm, x]) =>
        h("p", { class: "note" }, `${nm}: ${x.flag.length ? x.flag.join("; ") : "no clear lean yet"} (side ${x.x.sides.join(" arm / ")} glove targets)`))) : null] : null));
}

async function relearnPitcher(pid) {
  const p0 = DB.pitchers.get(pid); if (!p0 || !DB.D) return null;
  const p = JSON.parse(JSON.stringify(p0));   // the record as it was when learning started (D3 compares against it)
  const dups = await dupGameIds();
  const evs = (await DB.D.byIndex("events", "pitcherId", pid)).filter((e) => !e.legacy && !e.deletedAt && PCDB.isPitch(e) && !dups.has(e.gameId));
  DB.counts.set(pid, evs.length);
  const was = pModel(pid);
  let r;
  try { r = await learnCall({ type: "pitcher", pitcher: p, events: evs, level: levelOf(), prev: was ? was.served : null }); }
  catch (e) { console.error(e); toast("Couldn't learn from his games just now; the calls keep using what they had"); return was || null; }
  const m = { id: "v2:" + pid, pitcherId: pid, profile: r.profile, served: r.served, at: Date.now() };
  // v1.2 Step 3 / 4: each pitch's miss lean from his logged cells, games and charted bullpens (a flag until the gate admits it)
  try {
    const pens = (await DB.D.byIndex("sessions", "pitcherId", pid)).filter((x) => x.type === "charted" && !x.deletedAt);
    const penEvs = pens.flatMap((x) => (x.pitches || []).map((y) => ({ pitchName: y.pitch, quad: null, glove: y.glove, locCell: y.landed,
      ph: p.hand || "R", loc: cellZone(y.landed) })));
    m.leans = PCLearner.leanModel(evs.concat(penEvs), { hand: p.hand || "R" });
  } catch (e) { console.error(e); }
  // D3: the coach may have re-graded, answered a flag or switched learning off while the worker ran. The worker served
  // from the record as it was; serve again from the record as it is now (same games, same step), so his change stands.
  const now = DB.pitchers.get(pid);
  if (now && railsKey(now) !== railsKey(p)) m.served = PCLearner.finishServe(E, PCLearner.serve(r.profile, now, was ? was.served : null), now, levelOf());
  DB.models.set(m.id, await dbPut("learned", m));
  return m;
}
// what serving reads from a pitcher record: if any of it changes while learning runs, serve again
const railsKey = (p) => JSON.stringify([p.useLearned, p.accepted || null, p.flagState || null, p.changes || null,
  (p.pitches || []).map((d) => [d.id, d.grade, d.command, d.active, (d.gradeLog || []).length])]);
// a re-grade, an accepted flag or the learning switch takes effect now, without waiting for a game (no step is taken)
function reserve(p) {
  const m = pModel(p.id); if (!m || !m.profile) return;
  m.served = PCLearner.finishServe(E, PCLearner.serve(m.profile, p, m.served), p, levelOf());
  dbPut("learned", m);
}
async function relearnHitter(hid) {
  const x = DB.hitters.get(hid); if (!x || !DB.D) return null;
  const dups = await dupGameIds();
  const evs = (await DB.D.byIndex("events", "hitterId", hid)).filter((e) => !e.deletedAt && PCDB.isPitch(e) && !dups.has(e.gameId));
  const team = DB.teams.get(x.teamId);
  let r;
  // v1.1: each pitcher's pitch types, so a game logged before the six kinds is read in v1.1 terms
  const types = {}; for (const p of DB.pitchers.values()) { const t = {}; for (const d of p.pitches || []) if (d.type) t[d.name] = d.type; types[p.id] = t; }
  try { r = await learnCall({ type: "hitter", hitter: x, events: evs, level: (team && team.level) || levelOf(), prev: hModel(hid) || null, types }); } catch (e) { console.error(e); return hModel(hid) || null; }
  const m = Object.assign({ id: "h2:" + hid }, r.model);
  DB.models.set(m.id, await dbPut("learned", m));
  return m;
}

// one games record per game. Made at the first pitch for now (the Game plan screen will make it ahead, as planned).
// If the database isn't open yet (it opens a moment after the page, or failed), the record and its pitches wait in the
// saved state and are written once it opens: a pitch is never dropped, because the learner replays games in order and a
// hole would break the replay.
const queue = () => { S.queue = S.queue || { games: [], events: [], packs: [] }; if (!S.queue.packs) S.queue.packs = []; return S.queue; };
function ensureGameRecord() {
  const g = G();
  if (g.dbId) return g.dbId;
  g.dbId = PCDB.uid("gam");
  const rec = PCDB.moveGame({ id: g.dbId, date: todayT(), level: S.setup.level, inputs: S.setup.inputs, logLoc: !!S.setup.logLoc, opponentId: S.setup.opponentId || null,
    catcherId: S.setup.catcherId || null, staffIds: (S.setup.staffIds || []).slice(), lineup: S.setup.lineup.map((b) => ({ hitterId: b.hitterId || null, name: b.name, hand: b.hand })),
    status: "planned", startedAt: Date.now(), deviceId: DB.deviceId || null,
    // v0.8 game inputs (spec 8.3)
    setup: { engine: S.setup.engine || "v09", home: S.setup.home === undefined ? null : S.setup.home, innings: S.setup.innings || null,
      extrasRunner: !!S.setup.extrasRunner, umpSeed: S.setup.umpSeed || "normal" } }, "live");
  if (DB.ready) dbPut("games", rec); else queue().games.push(rec);
  makePack("start");
  return g.dbId;
}
// what the calls are reading right now (D0, spec 16): today's staff with their grades and what the calls are served,
// check-ins, the catcher, the lineup and what's known about every hitter on the opponent's roster. A new version is
// written whenever any of it changes mid-game, and every event after it carries the new version's id, so a game
// replays with exactly what the iPad saw.
function packContents() {
  const ids = S.setup.staffIds || [];
  // before the database has opened (the first pitch at launch), the staff on this page is what the calls read
  const found = ids.map((id) => DB.pitchers.get(id) || (S.setup.staff || []).find((x) => x.id === id)).filter(Boolean);
  const staff = (found.length ? found : (S.setup.staff || [])).map((p) => {
    const m = pModel(p.id), ci = todayCheckin(p.id);
    return { pitcherId: p.id, name: p.name, hand: p.hand, useLearned: p.useLearned !== false, pitchLimit: p.pitchLimit || null,
      pitchCap: p.pitchCap || null, ttp: p.ttp || null,
      pitches: (p.pitches || []).map((d) => ({ id: d.id, name: d.name, kind: d.kind, grade: PCLearner.coachValue(d, "grade"), command: PCLearner.coachValue(d, "command"),
        graded: PCLearner.graded(d, "grade") && PCLearner.graded(d, "command"), feel: +d.feel, active: d.active !== false })),
      served: m && m.served ? JSON.parse(JSON.stringify(m.served.pitches)) : null, checkinId: ci ? ci.id : null,
      checkin: ci ? { arm: ci.arm, sleep: ci.sleep, conf: Object.assign({}, ci.conf) } : null };
  });
  const tid = S.setup.opponentId, roster = tid ? teamHitters(tid) : [];
  const hitters = {};
  for (const x of roster) { const m = hModel(x.id); hitters[x.id] = { name: x.name, bats: x.bats, damage: m ? JSON.parse(JSON.stringify(m.damage)) : null,
    grades: x.grades ? Object.assign({}, x.grades) : null, crowd: !!x.crowd, learnedGrades: m && m.grades ? JSON.parse(JSON.stringify(m.grades)) : null,
    ...(x.scoutTags ? { scoutTags: Object.assign({}, x.scoutTags) } : {}) }; }   // v1.2 Part B: only when set
  const c = S.setup.catcherId && DB.catchers.get(S.setup.catcherId);
  return { staff, catcher: c ? { id: c.id, block: +c.block || 3 } : null, opponentId: tid || null, hitters,
    lineup: S.setup.lineup.map((b) => ({ hitterId: b.hitterId || null, name: b.name, hand: b.hand })),
    level: S.setup.level, versions: { app: APP_VERSION, engine: E.VERSION, data: E.dataVersion(), learn: PCLearn.VERSION, learner: PCLearner.VERSION } };
}
function makePack(reason) {
  const g = G(); if (!g.dbId) return null;
  const v = (g.packV || 0) + 1;
  const rec = Object.assign({ id: PCDB.uid("pak"), gameId: g.dbId, v, reason, at: Date.now(), prevId: g.packId || null }, packContents());
  g.packV = v; g.packId = rec.id;
  if (DB.ready) dbPut("packs", rec); else queue().packs.push(rec);
  return rec;
}
// something the calls read changed: if a game is under way, that's a new pack version from here on
function packChanged(reason) { if (G().dbId) { makePack(reason); save(); } }
// after something changed in the background (learning finished, a sync): a new pack version only if what the calls
// read is now different from the version the game is on
async function refreshPack(reason) {
  const g = G(); if (!g.dbId || !g.packId || !DB.ready) return false;
  const cur = await DB.D.get("packs", g.packId); if (!cur) return false;
  const now = packContents(), strip = (x) => JSON.stringify({ staff: x.staff, catcher: x.catcher, hitters: x.hitters });
  if (strip(now) === strip(cur)) return false;
  makePack(reason); save(); return true;
}
function logEvent(ev) {
  ev.id = PCDB.uid("evt");
  const g = G();
  ev.type = ev.type || "pitch";
  ev.seq = g.seq = (g.seq || 0) + 1;         // one running order for pitches and plays together
  ev.packId = g.packId || null;
  if (!DB.ready) { queue().events.push(ev); return ev.id; }
  DB.D.put("events", ev).catch(dbErr);
  if (PCDB.isPitch(ev)) DB.counts.set(ev.pitcherId, (DB.counts.get(ev.pitcherId) || 0) + 1);
  return ev.id;
}
// a play between pitches (D0): a pitching change, a pinch hitter, a catcher change, a Correct edit, and later steals and
// pickoffs. Logged with the game state after it, so the state can be rebuilt; the learner never reads plays.
function logPlay(play, detail = {}) {
  const g = G();
  if (!PCDB.PLAY_KINDS.includes(play)) throw new Error("unknown play " + play);
  ensureGameRecord();
  const pd = pitcherDef(), b = batterDef() || {};
  const id = logEvent(Object.assign({ type: "play", play, gameId: g.dbId, ts: Date.now(), afterPitch: g.pitchNo, inning: g.inning, outs: g.outs, balls: g.balls, strikes: g.strikes,
    bases: g.bases.slice(), us: g.us, them: g.them, batter: g.batter, slot: slotIdx(), pitcherId: pd.id || null, hitterId: b.hitterId || null,
    catcherId: S.setup.catcherId || null, deviceId: DB.deviceId || null }, detail));
  g.evIds = (g.evIds || []).concat(id);
  // a catcher change or a pinch hitter changes the setup, not the game state Undo steps back through: Undo never
  // deletes these plays (the change itself stays, so the log has to keep saying so)
  if (play === "sub_catcher" || play === "sub_hitter") g.keepEvIds = (g.keepEvIds || []).concat(id);
  return id;
}
async function flushQueued() {
  const q = S.queue; if (!q || (!q.games.length && !q.events.length && !(q.packs || []).length)) return;
  for (const r of q.games) { r.deviceId = r.deviceId || DB.deviceId; await dbPut("games", r); }
  for (const r of q.packs || []) await dbPut("packs", r);
  for (const ev of q.events) { ev.deviceId = ev.deviceId || DB.deviceId; await DB.D.put("events", ev).catch(dbErr); if (PCDB.isPitch(ev)) DB.counts.set(ev.pitcherId, (DB.counts.get(ev.pitcherId) || 0) + 1); }
  const n = q.events.filter(PCDB.isPitch).length; S.queue = { games: [], events: [], packs: [] }; save();
  if (n) toast(`Saved ${n} pitch${n === 1 ? "" : "es"} charted before the database opened`);
}
// an edit to a logged pitch after the fact (where it ended up, contact, a cross-up, a wild pitch). The original values
// are kept in the record's edit history; the game's flow (count, outs, runners) isn't changed, use Undo for that.
// one edit at a time: two quick taps on the same pitch each read the record the other just saved
let editChain = Promise.resolve();
function editEvent(evId, changes) { const run = editChain.then(() => editEventNow(evId, changes)); editChain = run.catch(() => {}); return run; }
async function editEventNow(evId, changes) {
  const q = S.queue && S.queue.events.find((e) => e.id === evId);
  const ev = q || (DB.ready ? await DB.D.get("events", evId) : null);
  if (!ev) return false;
  const before = {}; for (const k of Object.keys(changes)) before[k] = ev[k] === undefined ? null : ev[k];
  ev.edits = (ev.edits || []).concat({ at: Date.now(), before });
  Object.assign(ev, changes);
  if (!q) await DB.D.put("events", ev).catch(dbErr); else save();
  return true;
}
// after an undo: the pitches that are no longer in the game come out of the database too
function syncUndone(before, after) {
  if (!DB.ready) return;
  const keep = new Set((after.evIds || []).concat(after.keepEvIds || []));
  for (const id of before.evIds || []) if (!keep.has(id)) DB.D.del("events", id).catch(dbErr);
}
// how completely a game was charted: the learner only uses locations or contact quality from a game where they were
// logged on at least 90% of pitches (spec 5.5), so a game charted selectively can't bias it
function completeness(g) {
  const L = g.log, n = L.length, plays = L.filter((e) => e.res === "play");
  return { pitches: n, located: n ? L.filter((e) => e.loc).length / n : 0, contact: plays.length ? plays.filter((e) => e.contact).length / plays.length : null,
    engineCalls: n ? L.filter((e) => !e.coach && !e.recall).length / n : 0 };
}
async function finishGameRecord() {
  const g = G();
  if (!g.dbId) return null;
  const comp = completeness(g);
  const close = (r) => Object.assign(PCDB.moveGame(r, "final"), { endedAt: Date.now(), us: g.us, them: g.them, innings: g.inning, pitches: g.pitchNo, completeness: comp, packs: g.packV || 0 });
  if (!DB.ready) { const r = S.queue && S.queue.games.find((x) => x.id === g.dbId); if (r) close(r); save(); return comp; }
  const rec = await DB.D.get("games", g.dbId);
  if (rec) await dbPut("games", close(rec));
  // who to learn from: everyone who pitched and every hitter he faced. Written down before anything is learned (D9), so
  // a page killed mid-learning finishes the job on the next launch instead of losing it.
  const pids = new Set(), hids = new Set();
  for (const e of g.log) { const pid = e.pid || (S.setup.staff[e.p ?? 0] || {}).id; if (pid && DB.pitchers.has(pid)) pids.add(pid); const b = S.setup.lineup[e.slot]; if (b && b.hitterId) hids.add(b.hitterId); }
  // one job per game, so a second game ended while the first is still learning doesn't overwrite it (D9)
  const job = { id: "toLearn:" + g.dbId, pids: [...pids], hids: [...hids], gameId: g.dbId };
  if (pids.size || hids.size) await DB.D.put("meta", job);
  comp.learn = job;
  return comp;
}
// the flywheel, after the game is closed and the next one is up (D9): refit, then sync
async function learnAfterGame(job) {
  if (!DB.ready || !job) return;
  for (const id of job.pids || []) if (DB.pitchers.has(id)) await relearnPitcher(id);
  for (const id of job.hids || []) if (DB.hitters.has(id)) await relearnHitter(id);
  await DB.D.forget("meta", job.id || "toLearn").catch(() => {});
  await refreshPack("learned");   // the next game may be under way: what the calls read changed, so a new pack version
  const names = (job.pids || []).filter((id) => DB.pitchers.has(id)).map((id) => DB.pitchers.get(id).name);
  if (names.length) toast(`Learned from the game: ${names.join(", ")}`);
  if (S.view === "roster") render();
  await refreshOutings().catch(() => {}); logGames = null;   // rest and eligible-on take in the finished game
  if (SYNC.sync) setTimeout(() => syncNow(true), 0);   // the finished game goes up in the background
}

// ------------------------------------------------------------------ roster screen
let rosterTab = "ours", rosterSel = null, teamSel = null, importPreview = null;
const PTYPES = Object.keys(PCDB.PITCH_TYPES || {});
const fmt = (x, d = 1) => (x === null || x === undefined || x === "" ? "–" : (+x).toFixed(d));

function rosterView() {
  if (DB.failed) return h("main", {}, h("div", { class: "head" }, h("div", {}, h("h1", {}, "Roster"),
    h("p", { class: "sub" }, "This browser wouldn't open a database (private browsing can block it). The game screen still works and saves on this device."))));
  if (!DB.ready) return h("main", {}, h("div", { class: "head" }, h("div", {}, h("h1", {}, "Roster"), h("p", { class: "sub" }, "Opening the database…"))));
  const pick = (cur, set, opts, label) => h("div", { class: "seg", role: "group", "aria-label": label },
    opts.map(([v, l]) => h("button", { "aria-pressed": String(cur === v), on: { click: () => { set(v); render(); } } }, l)));
  const nP = DB.pitchers.size, nT = opponents().length;
  return h("main", { class: "roster" },
    h("div", { class: "head" },
      h("div", {}, h("h1", {}, "Roster"), h("p", { class: "sub" }, `${nP} pitcher${nP === 1 ? "" : "s"} and ${nT} opponent${nT === 1 ? "" : "s"}, stored on this device. Every pitch you chart is saved to the pitcher who threw it and the hitter who saw it.`)),
      h("div", { class: "filters" }, pick(rosterTab, (v) => (rosterTab = v), [["ours", "Our pitchers"], ["opp", "Opponents"]], "Which roster"),
        h("div", { class: "row-acts" }, h("button", { class: "btn pill", on: { click: backup } }, "Back up"),
          h("label", { class: "btn pill file" }, "Restore", h("input", { type: "file", accept: ".json,application/json", on: { change: restore } }))))),
    rosterTab === "ours" ? oursView() : oppView());
}

// ---------------------------------------------------------------- our pitchers
function oursView() {
  const list = rosterPitchers();
  if (!rosterSel || !DB.pitchers.has(rosterSel)) rosterSel = (S.setup.staff[0] || list[0] || {}).id;
  const p = DB.pitchers.get(rosterSel);
  return h("div", { class: "grid" },
    h("div", { class: "span-4 col" },
      h("section", { class: "panel glass", "aria-label": "Pitchers" },
        h("div", { class: "panel-head" }, h("h2", {}, "Pitchers"), h("span", { class: "meta" }, `${S.setup.staffIds.length} on today's staff`)),
        h("div", { class: "plist" }, list.map((x) => {
          const n = DB.counts.get(x.id) || 0, today = S.setup.staffIds.includes(x.id), ci = todayCheckin(x.id);
          return h("button", { class: `pcard${x.id === rosterSel ? " sel" : ""}`, "aria-pressed": String(x.id === rosterSel), on: { click: () => { rosterSel = x.id; importPreview = null; render(); } } },
            h("span", { class: "pc-top" }, h("b", {}, (x.number ? `#${x.number} ` : "") + (x.name || "Unnamed")), today ? h("span", { class: "pill ok" }, "Today") : null),
            h("span", { class: "pc-mid" }, (x.pitches || []).filter((d) => d.active !== false).map((d) => chip(d.kind, d.sign))),
            h("span", { class: "pc-sub" }, `${x.hand === "L" ? "Lefty" : "Righty"} ${x.role === "RP" ? "reliever" : "starter"}, ${n ? `${n} pitches charted` : "nothing charted yet"}${ci ? ", checked in" : ""}`),
            (() => { const t = eligibleText(x.id); return t ? h("span", { class: `pc-sub${/today/.test(t) ? "" : " flag"}`, style: /today/.test(t) ? null : { color: "var(--warn)" } }, t[0].toUpperCase() + t.slice(1)) : null; })());
        })),
        h("div", { class: "row-acts" }, h("button", { class: "btn", on: { click: async () => {
          const np = await dbPut("pitchers", PCDB.newPitcher(ourTeam().id, { name: `Pitcher ${DB.pitchers.size + 1}` })); DB.pitchers.set(np.id, np); rosterSel = np.id; render();
        } } }, "Add a pitcher"))),
      catchersPanel()),
    p ? h("div", { class: "span-8 col" }, profilePanel(p), arsenalEditor(p), checkinPanel(p)) : null,
    p ? h("div", { class: "span-12 col" }, learnedPanel(p), importPanel(p)) : null);
}

function savePitcher(p, re = true) { reserve(p); dbPut("pitchers", p); if ((S.setup.staffIds || []).includes(p.id)) packChanged("pitcher"); G().call = null; save(); if (re) render(); }

function profilePanel(p) {
  const today = S.setup.staffIds.includes(p.id);
  const f = (label, key, attrs = {}, w = "1 1 140px") => h("label", { class: "f", style: { flex: w } }, label,
    h("input", Object.assign({ value: p[key] ?? "", autocomplete: "off", on: { change: (e) => { p[key] = attrs.type === "number" ? (e.target.value === "" ? "" : +e.target.value) : e.target.value.trim(); savePitcher(p); } } }, attrs)));
  return h("section", { class: "panel glass", "aria-label": "Profile" },
    h("div", { class: "panel-head" }, h("h2", {}, p.name || "New pitcher"),
      h("div", { class: "row-acts" },
        h("button", { class: today ? "btn pill" : "btn pill primary", on: { click: () => toggleStaff(p.id) } }, today ? "Take off today's staff" : "Add to today's staff"))),
    h("div", { class: "fields" },
      f("Name", "name", {}, "2 1 200px"), f("Number", "number", { inputmode: "numeric" }, "0 1 80px"),
      h("div", { class: "f" }, "Throws", h("div", { class: "hands", role: "group", "aria-label": "Throws" }, ["R", "L"].map((x) => h("button", { "aria-pressed": String(p.hand === x), on: { click: () => { p.hand = x; savePitcher(p); } } }, x)))),
      h("div", { class: "f" }, "Role", h("div", { class: "hands wide", role: "group", "aria-label": "Role" }, [["SP", "Starter"], ["RP", "Reliever"]].map(([v, l]) => h("button", { "aria-pressed": String(p.role === v), on: { click: () => { p.role = v; savePitcher(p); } } }, l)))),
      h("label", { class: "f", style: { flex: "1 1 170px" } }, "Arm slot", h("select", { on: { change: (e) => { p.slot = e.target.value; savePitcher(p); } } }, SLOT_OPTS.map((s) => h("option", { value: s, selected: s === p.slot ? true : null }, s)))),
      f("Height, ft", "height_ft", { type: "number", step: 0.1, min: 4.5, max: 7.5, inputmode: "decimal" }, "0 1 100px"),
      f("Class of", "gradYear", { inputmode: "numeric", placeholder: "2028" }, "0 1 100px"),
      f("Fatigue point", "pitchLimit", { type: "number", min: 20, max: 140, inputmode: "numeric", placeholder: String(FATIGUE[S.setup.level]) }, "0 1 130px"),
      f("Pitch cap", "pitchCap", { type: "number", min: 30, max: 150, inputmode: "numeric", placeholder: "105" }, "0 1 110px"),
      f("Time to plate, s", "ttp", { type: "number", min: 0.9, max: 2.5, step: 0.05, inputmode: "decimal", placeholder: "1.35…" }, "0 1 130px")),
    h("label", { class: "f" }, "Notes", h("input", { value: p.notes || "", placeholder: "Anything a coach should know…", on: { change: (e) => { p.notes = e.target.value; savePitcher(p, false); } } })),
    h("div", { class: "row-acts spread" },
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: p.useLearned !== false ? true : null, on: { change: (e) => { p.useLearned = e.target.checked; savePitcher(p); } } }),
        "Use what it has learned about him in the calls"),
      h("button", { class: "btn text", on: { click: async () => {
        if (S.setup.staffIds.includes(p.id) && S.setup.staffIds.length === 1) { toast("He's the only pitcher on today's staff"); return; }
        if (!confirmTwice(p.id)) { toast(`Tap again to remove ${p.name || "this pitcher"}. His charted pitches stay in the database.`); return; }
        await DB.D.del("pitchers", p.id); DB.pitchers.delete(p.id); S.setup.staffIds = S.setup.staffIds.filter((x) => x !== p.id); attachStaff(); rosterSel = null; save(); render();
      } } }, "Remove pitcher")));
}
let armed = null;
function confirmTwice(key) { if (armed === key) { armed = null; return true; } armed = key; setTimeout(() => { if (armed === key) armed = null; }, 4000); return false; }
function toggleStaff(pid) {
  const ids = S.setup.staffIds;
  if (ids.includes(pid)) { if (ids.length === 1) { toast("Today's staff needs at least one pitcher"); return; } S.setup.staffIds = ids.filter((x) => x !== pid); }
  else {
    S.setup.staffIds = ids.concat(pid);
    const e = eligibility(pid), p = DB.pitchers.get(pid) || {};
    if (e && !e.today) toast(`${p.name || "He"} isn't ${eligibleText(pid).replace(/^eligible/, "eligible until")} under ${teamRule().name}`);
  }
  const cur = pitcherDef(); attachStaff();
  const i = S.setup.staff.indexOf(cur); G().pitcher = i >= 0 ? i : 0;
  G().call = null; save(); render();
}

// every change to a pitch's stuff or command, so the learner can tell an independent re-grade (new evidence) from
// the coach copying what it learned (not evidence). The first entry is the grade before any edit (spec 5.6).
function logGrade(p, d, key, old) {
  const m = pModel(p.id), x = m && m.profile && m.profile.pitches[d.id];
  const now = Date.now();
  if (!d.gradeLog || !d.gradeLog.length) d.gradeLog = [{ ts: d.createdAt || p.createdAt || 0, command: key === "command" ? old : d.command, grade: key === "grade" ? old : d.grade }];
  // a blank box is logged as blank (it used to become 0, which the learner read as a re-grade to 0)
  const val = (v) => (PCLearner.graded({ v }, "v") ? +v : null);
  d.gradeLog.push({ ts: now, command: val(d.command), grade: val(d.grade), sawLearned: !!(x && x.n) });
  // his new number is the centre now: an answer he gave to a flag about the old one no longer applies
  const fk = `${d.id}|${key}`;
  if (p.flagState && p.flagState[fk]) { const fs = Object.assign({}, p.flagState); delete fs[fk]; p.flagState = fs; }
  if (p.accepted && p.accepted[d.id] && p.accepted[d.id][key]) { const a = Object.assign({}, p.accepted[d.id]); delete a[key]; p.accepted = Object.assign({}, p.accepted, { [d.id]: a }); }
}
function markChanged(p, pitchId) {
  p.changes = (p.changes || []).concat({ ts: Date.now(), pitchId: pitchId || null });
  savePitcher(p);
  toast(pitchId ? "Marked: the learner treats games from now on as a fresh start for this pitch" : "Marked: the learner treats games from now on as a fresh start for him");
}
function arsenalEditor(p) {
  const m = pModel(p.id);
  const num = (d, key, step, min, max, ph, label, w = "70px") => h("input", { type: "number", inputmode: "decimal", step, min, max, value: d[key] ?? "", placeholder: ph || "", "aria-label": label, style: { width: w },
    on: { change: (e) => {
      const old = d[key];
      d[key] = e.target.value === "" ? "" : +e.target.value;
      if ((key === "grade" || key === "command") && d[key] !== "" && d[key] !== old) logGrade(p, d, key, old);
      savePitcher(p, false); } } });
  const lab = (t, el, cls = "") => h("label", { class: `af ${cls}` }, h("span", {}, t), el);
  const cards = (p.pitches || []).map((d, i) => {
    const out = h("output", {}, (+d.feel).toFixed(2));
    return h("div", { class: `acard k-${d.kind}` },
      h("div", { class: "arow" },
        lab("Type", h("div", { class: "typ" }, chip(d.kind, d.sign), h("select", { "aria-label": "Pitch type", on: { change: (e) => {
          const t = PCDB.PITCH_TYPES[e.target.value]; d.type = e.target.value; d.kind = t.kind; d.shape = t.shape; delete d.sign; if (!FB_CLASS.includes(d.kind)) delete d.main; savePitcher(p); } } },
          PTYPES.map((t) => h("option", { value: t, selected: t === (d.type || PCDB.DEFAULT_TYPE[d.kind]) ? true : null }, t)))), "a-type"),
        lab("His name for it", h("input", { value: d.name, on: { change: (e) => {
          const nn = e.target.value.trim() || d.type || KINDS[d.kind];
          if (p.pitches.some((x) => x !== d && x.name === nn)) { toast("He already has a pitch with that name"); render(); return; }
          const si = S.setup.staff.indexOf(p); if (si >= 0) renamePitch(si, d.name, nn);
          d.name = nn; savePitcher(p); } } }), "a-name"),
        // D8: a blank grade is "not graded": the calls use the level average (3), nothing is flagged until it's set
        lab("Stuff", h("div", {}, num(d, "grade", 0.5, 1, 5, "3", "Stuff, 1 to 5, compared with other pitches of this profile", "100%"), PCLearner.graded(d, "grade") ? null : h("small", { class: "muted" }, "not graded: calls use 3")), "a-n"),
        lab("Command", h("div", {}, num(d, "command", 0.5, 1, 5, "3", "Command, 1 to 5", "100%"), PCLearner.graded(d, "command") ? null : h("small", { class: "muted" }, "not graded: calls use 3")), "a-n"),
        lab("Usual feel", h("div", { class: "feel" }, h("input", { type: "range", min: 0.3, max: 0.95, step: 0.05, value: d.feel, "aria-label": "Usual bullpen feel",
          on: { input: (e) => { d.feel = +e.target.value; out.textContent = (+d.feel).toFixed(2); }, change: () => savePitcher(p, false) } }), out), "a-feel"),
        // v1.1 Step 5 (plan 2.1): the main fastball mark, fastball-class pitches only, one per pitcher
        FB_CLASS.includes(d.kind) ? lab("Main FB", h("input", { type: "radio", name: `main-${p.id}`, "aria-label": `${d.name} is his main fastball`, checked: mainFbName(p) === d.name ? true : null,
          title: "Every pitch's speed and shape is measured against his main fastball; if none is marked, the one he throws most",
          on: { change: () => { for (const x of p.pitches) delete x.main; d.main = true; savePitcher(p); } } }), "a-n") : null,
        lab("Misses", h("div", {}, missFields(d, () => savePitcher(p)), leanNote(p.id, d.name)), "a-miss"),   // v1.2
        h("button", { class: "x", "aria-label": `Remove ${d.name}`, on: { click: () => { if (p.pitches.length > 1) { if (!confirmTwice("rmp:" + p.id + ":" + d.id)) { toast(`Tap × again to remove ${d.name}`); return; } p.pitches.splice(i, 1); savePitcher(p); } } } }, "×")),
      h("div", { class: "ameas" },
        lab("Velo", num(d, "velo", 0.5, 40, 105, "mph", "Velocity, mph", "100%")), lab("V break", num(d, "ivb", 0.5, -30, 30, "in", "Induced vertical break, inches", "100%")),
        lab("H break", num(d, "hb", 0.5, -30, 30, "in", "Horizontal break toward his arm side, inches", "100%")), lab("Spin", num(d, "spin", 10, 500, 3500, "rpm", "Spin rate", "100%"))));
  });
  return h("section", { class: "panel glass", "aria-label": "Arsenal" },
    h("div", { class: "panel-head" }, h("h2", {}, "Arsenal"), h("span", { class: "meta" }, "Stuff and command 1 to 5; break from TrackMan or Rapsodo")),
    h("div", { class: "acards" }, cards),
    h("div", { class: "row-acts" },
      h("select", { "aria-label": "Add a pitch", style: { width: "auto" }, on: { change: (e) => {
        if (!e.target.value) return; const t = e.target.value; let nm = t === "Four-seam" ? "Fastball" : t, k = 2;
        while (p.pitches.some((x) => x.name === nm)) nm = `${t} ${k++}`;
        p.pitches.push(PCDB.newPitch(t, { name: nm })); savePitcher(p); } } },
        h("option", { value: "" }, "Add a pitch…"), PTYPES.map((t) => h("option", { value: t }, t)))),
    h("p", { class: "note" }, "Horizontal break is positive toward his arm side. The engine models six kinds (four-seam, sinker, cutter, slider, curve, changeup), each with its shapes: sweepers are sliders, splitters are changeups. Stuff is compared with other pitches of the same type: a 3 sweeper is an average sweeper. Every pitch's speed and shape is measured against his main fastball."));
}

function checkinPanel(p) {
  const prev = todayCheckin(p.id);
  const c = prev ? JSON.parse(JSON.stringify(prev)) : { pitcherId: p.id, date: todayT(), arm: 4, sleep: "", conf: {} };
  const dirty = { v: false };
  const shift = PCLearn.todayLimitShift(prev);
  return h("section", { class: "panel glass", "aria-label": "Today's check-in" },
    h("div", { class: "panel-head" }, h("h2", {}, "Today's check-in"), h("span", { class: "meta" }, prev ? `Saved ${new Date(prev.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "He fills this in before the game")),
    h("div", { class: "ci" },
      h("div", { class: "f" }, "How's the arm?", h("div", { class: "seg small", role: "group", "aria-label": "Arm feel" },
        [[1, "Sore"], [2, "Tight"], [3, "OK"], [4, "Good"], [5, "Great"]].map(([v, l]) => h("button", { "aria-pressed": String(+c.arm === v), on: { click: (e) => {
          c.arm = v; dirty.v = true; for (const b of e.currentTarget.parentNode.children) b.setAttribute("aria-pressed", String(b === e.currentTarget)); } } }, l)))),
      h("label", { class: "f", style: { width: "130px" } }, "Hours of sleep", h("input", { type: "number", inputmode: "decimal", step: 0.5, min: 0, max: 14, value: c.sleep, on: { change: (e) => { c.sleep = e.target.value === "" ? "" : +e.target.value; dirty.v = true; } } }))),
    h("div", { class: "ci-conf" }, h("span", { class: "t" }, "How much does he trust each pitch today? 1 to 10"),
      (p.pitches || []).map((d) => {
        const v = c.conf[d.id] ?? "";
        const out = h("output", {}, v === "" ? "–" : String(v));
        return h("div", { class: `ci-row k-${d.kind}` }, chip(d.kind, d.sign), h("span", { class: "nm" }, d.name),
          h("input", { type: "range", min: 1, max: 10, step: 1, value: v === "" ? Math.round((d.feel - 0.3) / 0.65 * 9 + 1) : v, "aria-label": `${d.name} confidence today`,
            on: { input: (e) => { c.conf[d.id] = +e.target.value; out.textContent = e.target.value; dirty.v = true; } } }), out);
      })),
    h("div", { class: "row-acts" },
      h("button", { class: "btn primary", on: { click: async () => {
        const rec = await dbPut("checkins", Object.assign(prev || {}, c)); DB.checkins.set(p.id, rec); if ((S.setup.staffIds || []).includes(p.id)) packChanged("checkin"); G().call = null; save(); render(); toast(`${p.name}'s check-in saved. His starting feel uses it today.`);
      } } }, prev ? "Update check-in" : "Save check-in"),
      shift ? h("span", { class: "note" }, `Today his fatigue point comes down ${shift} pitches.`) : null),
    h("p", { class: "note" }, "A pitch he rates 1 starts the game at feel 0.30; a 10 starts at 0.95. A sore or tight arm, or under six hours of sleep, brings his fatigue point down."));
}

// a grade flag the coach has answered: Accept (phased in over 3 games), Keep mine (quiet until the learned value moves
// another 0.5), or Remind me in 5 games
function flagAnswer(p, f, how) {
  const key = `${f.pitchId}|${f.dim}`, m = pModel(p.id);
  if (how === "accept") {
    const sv = m && m.served && m.served.pitches[f.pitchId];
    // D2: the learned value at this moment is what he accepted; the calls phase in to it, then learn within 1.0 of it
    p.accepted = Object.assign({}, p.accepted, { [f.pitchId]: Object.assign({}, (p.accepted || {})[f.pitchId], { [f.dim]: { ts: Date.now(), from: sv ? sv[f.dim] : +f.coach, to: Math.round(f.learned * 100) / 100 } }) });
    p.flagState = Object.assign({}, p.flagState, { [key]: { how, ts: Date.now() } });
    toast(`Accepted: the calls move to ${fmt(f.learned)} over his next 3 games`);
  } else {
    const games = m && m.profile && m.profile.games ? m.profile.games.length : 0;
    const pd = (p.pitches || []).find((d) => d.id === f.pitchId);
    const accepting = pd && PCLearner.railsFor(pd, p, f.dim).acc;
    // Keep mine retires an earlier accept (his number again); "ask me later" leaves an accept he made standing
    if (how === "keep" && p.accepted && p.accepted[f.pitchId]) { const a = Object.assign({}, p.accepted[f.pitchId]); delete a[f.dim]; p.accepted = Object.assign({}, p.accepted, { [f.pitchId]: a }); }
    p.flagState = Object.assign({}, p.flagState, { [key]: how === "keep" ? { how, learned: f.learned, ts: Date.now() } : { how, untilGames: games + 5, ts: Date.now(), keepAccept: !!accepting } });
    toast(how === "keep" ? "Kept your grade: the calls use your number. It'll only ask again if what it learns moves another half point." : "It'll ask again in 5 games");
  }
  savePitcher(p);
}
function flagShown(p, f, m) {
  if (f.type !== "grade") return true;
  const st = (p.flagState || {})[`${f.pitchId}|${f.dim}`];
  if (!st) return true;
  // after an Accept, a new flag (measured against the accepted value) is shown; the one he answered isn't
  if (st.how === "accept") {
    const a = ((p.accepted || {})[f.pitchId] || {})[f.dim], pd = (p.pitches || []).find((d) => d.id === f.pitchId);
    if (!a || !pd || !PCLearner.railsFor(pd, p, f.dim).acc) return true;   // the accept no longer stands (a re-grade replaced it)
    return a.to !== undefined && f.ref !== undefined && Math.abs(f.ref - a.to) < 1e-6;
  }
  if (st.how === "keep") return Math.abs(f.learned - st.learned) >= 0.5;
  return (m.profile.games || []).length >= st.untilGames;
}

function learnedPanel(p) {
  const m = pModel(p.id), n = DB.counts.get(p.id) || 0, prof = m && m.profile, sv = m && m.served;
  const on = p.useLearned !== false;
  const bar = (entered, fit, use) => h("div", { class: "lbar", title: `Your grade ${entered}, learned ${fit}, calls use ${use}` },
    h("i", { class: "e", style: { left: `${((entered - 1) / 4) * 100}%` } }), h("i", { class: "l", style: { left: `${((Math.min(5, Math.max(1, fit)) - 1) / 4) * 100}%` } }));
  const row = (d) => {
    const x = prof && prof.pitches[d.id], s = sv && sv.pitches[d.id];
    if (!x || !x.n) return h("tr", {}, h("td", {}, h("span", { class: "pname" }, chip(d.kind, d.sign), d.name)), h("td", { colspan: "4", class: "muted" }, "No charted pitches yet"));
    const cell = (dim) => {
      const ent = +d[dim], fit = x.talent[dim], sd = x.sd[dim], use = s && s.learned && on ? s[dim] : ent;
      const enough = dim === "grade" ? x.n >= 150 : x.nLoc >= 60;    // below this, show it as early
      return h("td", {}, h("div", { class: "lcell" }, bar(ent, fit, use),
        h("span", {}, `${fmt(ent)} → `, h("b", {}, fmt(Math.round(fit * 10) / 10)), h("small", { class: "muted" }, ` ±${sd.toFixed(1)}`)),
        h("small", { class: "muted" }, enough ? `calls use ${fmt(use)}` : `early: calls use ${fmt(use)}`)));
    };
    const sc = x.score;
    return h("tr", { class: `k-${d.kind}` },
      h("td", {}, h("span", { class: "pname" }, chip(d.kind, d.sign), d.name)),
      cell("grade"), cell("command"),
      h("td", { class: "num" }, `${x.n}`, x.nLoc ? h("small", { class: "muted" }, ` (${x.nLoc} located)`) : null,
        h("button", { class: "btn text tiny", title: "Injury, new grip, mechanics change: what came before counts less", on: { click: () => markChanged(p, d.id) } }, "Mark changed")),
      h("td", { class: "wrapcell" },
        sc && sc.learned !== null
          ? h("span", { class: "line" }, sc.worse ? "Learning predicted worse than your grades lately, so the calls use your grades"
            : sc.learned < sc.coach - 0.005 ? "Learning predicts his pitches better than your grades" : "Learning and your grades predict about the same")
          : h("span", { class: "line muted" }, "Scoreboard starts after 150 of these pitches"),
        s && s.strike_rate ? h("span", { class: "line muted" }, `Expected strike rate ${Math.round(s.strike_rate * 100)}%`) : null));
  };
  const flags = prof ? (prof.flags || []).filter((f) => flagShown(p, f, m)) : [];
  const pitchName = (id) => ((p.pitches || []).find((d) => d.id === id) || {}).name || "";
  const flagEl = (f) => h("div", { class: `lflag ${f.type}` }, h("p", {}, f.text),
    f.type === "grade" ? h("div", { class: "row-acts" },
      h("button", { class: "btn pill primary", on: { click: () => flagAnswer(p, f, "accept") } }, `Use ${fmt(Math.round(f.learned * 10) / 10)}`),
      h("button", { class: "btn pill", on: { click: () => flagAnswer(p, f, "keep") } }, `Keep my ${fmt(f.coach)}`),
      h("button", { class: "btn text", on: { click: () => flagAnswer(p, f, "remind") } }, "Ask me in 5 games"))
    : f.type === "change" ? h("div", { class: "row-acts" }, h("button", { class: "btn pill", on: { click: () => markChanged(p, f.pitchId) } }, `Mark ${pitchName(f.pitchId)} changed`)) : null);
  return h("section", { class: "panel glass", "aria-label": "What it has learned" },
    h("div", { class: "panel-head" }, h("h2", {}, "What it has learned"),
      h("div", { class: "row-acts" }, h("span", { class: "meta" }, m ? `Updated ${new Date(m.at).toLocaleDateString([], { month: "short", day: "numeric" })}${prof && prof.games ? `, ${prof.games.length} game${prof.games.length === 1 ? "" : "s"}` : ""}` : ""),
        h("button", { class: "btn pill", disabled: !n, on: { click: async (e) => { e.currentTarget.disabled = true; await relearnPitcher(p.id); render(); toast("Relearned from every pitch he's thrown. The calls only move after his next game."); } } }, "Relearn now"))),
    flags.length ? h("div", { class: "lflags" }, flags.map(flagEl)) : null,
    prof && prof.skipped && prof.skipped.n ? h("p", { class: "pstat watch" }, `${prof.skipped.n} logged pitch${prof.skipped.n === 1 ? " was" : "es were"} skipped: learning couldn't read ${prof.skipped.n === 1 ? "it" : "them"}. `,
      h("button", { class: "btn text", on: { click: () => openSkipped(prof) } }, "Fix or leave out")) : null,
    h("div", { class: "tbl-wrap" }, h("table", { class: "ltable" },
      h("thead", {}, h("tr", {}, h("th", {}, "Pitch"), h("th", {}, "Stuff: yours → learned"), h("th", {}, "Command: yours → learned"), h("th", { class: "num" }, "Pitches"), h("th", {}, "Scoreboard"))),
      h("tbody", {}, (p.pitches || []).filter((d) => d.active !== false).map(row)))),
    h("p", { class: "note" }, n
      ? `Each pitch is relearned after every game from what happened against what the engine expected, starting from your grades. ${on ? "The calls move toward what's learned at most 0.15 a game and never more than 1.0 from your grade, or from the value you accepted. Keep mine holds your number." : "Learning is switched off for him: the calls use your grades."} Only the engine's own calls teach it, not yours or re-calls after a shake-off. Command needs "where it ended up" logged (Setup).`
      : "After he pitches in a charted game, this shows how his pitches actually play compared with your grades, and the calls start using it."));
}

function importPanel(p) {
  const P = importPreview && importPreview.pid === p.id ? importPreview : null;
  const sessions = DB.sessions.get(p.id);
  if (!sessions && DB.D) DB.D.byIndex("sessions", "pitcherId", p.id).then((xs) => { DB.sessions.set(p.id, xs.sort((a, b) => b.createdAt - a.createdAt)); if (S.view === "roster" && rosterSel === p.id) render(); });
  const apply = async () => {
    for (const t of P.r.byType) {
      let d = p.pitches.find((x) => x.type === t.type) || p.pitches.find((x) => !x.type && x.kind === t.kind);
      if (!d) { d = PCDB.newPitch(t.type, { name: t.type === "Four-seam" ? "Fastball" : t.type }); if (p.pitches.some((x) => x.name === d.name)) d.name = `${t.type} ${p.pitches.length + 1}`; p.pitches.push(d); }
      d.type = t.type;
      for (const [k, v] of [["velo", t.velo], ["ivb", t.ivb], ["hb", t.hb], ["spin", t.spin]]) if (v !== null) d[k] = v;
      if (t.tag !== null && t.tag !== undefined && E.SHAPE_TAGS[d.kind] && E.SHAPE_TAGS[d.kind].includes(t.tag)) d.shape = t.tag;   // v1.1 Step 5: measured -> its tag
      if (t.releaseOffset) d.relOff = t.releaseOffset;
    }
    savePitcher(p, false);
    const sess = await dbPut("sessions", { pitcherId: p.id, date: todayT(), source: P.r.source, file: P.file, n: P.r.n, byType: P.r.byType, rows: P.r.rows });
    DB.sessions.set(p.id, [sess].concat(DB.sessions.get(p.id) || []));
    importPreview = null; render(); toast(`Applied ${P.r.n} pitches to ${p.name}'s arsenal`);
  };
  return h("section", { class: "panel glass", "aria-label": "TrackMan and Rapsodo" },
    h("div", { class: "panel-head" }, h("h2", {}, "TrackMan or Rapsodo"),
      h("label", { class: "btn pill file" }, "Load a session file", h("input", { type: "file", accept: ".csv,text/csv,.txt", on: { change: (e) => {
        const f = e.target.files[0]; if (!f) return;
        f.text().then((txt) => { try { importPreview = { pid: p.id, file: f.name, r: PCImport.parse(txt, { hand: p.hand, pitcherName: p.name, tagFor: E.tagFor, level: S.setup.level }) }; } catch (err) { importPreview = { pid: p.id, file: f.name, error: err.message }; } render(); });
      } } }))),
    P && P.error ? h("p", { class: "pstat change" }, P.error) : null,
    P && P.r ? h("div", { class: "imp" },
      h("p", { class: "note" }, `${P.file}: ${P.r.n} pitches, read as ${P.r.source}.`),
      h("div", { class: "tbl-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, ["Pitch", "Thrown", "Velo", "Top", "V break", "H break", "Spin", "Shape", "In zone", "Command hint"].map((t, i) => h("th", { class: i && t !== "Shape" ? "num" : "" }, t)))),
        h("tbody", {}, P.r.byType.map((t) => h("tr", { class: `k-${t.kind}` },
          h("td", {}, h("span", { class: "pname" }, chip(t.kind), t.type)), h("td", { class: "num" }, String(t.n)), h("td", { class: "num" }, fmt(t.velo)), h("td", { class: "num" }, fmt(t.veloMax)),
          h("td", { class: "num" }, fmt(t.ivb)), h("td", { class: "num" }, fmt(t.hb)), h("td", { class: "num" }, t.spin ?? "–"),
          h("td", {}, t.tag === null || t.tag === undefined ? "–" : profileLabel(t.kind, t.tag)),
          h("td", { class: "num" }, t.zonePct === null ? "–" : pct(t.zonePct)), h("td", { class: "num" }, t.commandHint ?? "–")))))),
      P.r.warnings.length ? h("ul", { class: "warns" }, P.r.warnings.map((w) => h("li", {}, w))) : null,
      P.r.unused.length ? h("p", { class: "note" }, `Columns not used: ${P.r.unused.slice(0, 12).join(", ")}${P.r.unused.length > 12 ? "…" : ""}`) : null,
      h("div", { class: "row-acts" }, h("button", { class: "btn primary", on: { click: apply } }, "Apply velo, break, spin and shape to his arsenal"), h("button", { class: "btn", on: { click: () => { importPreview = null; render(); } } }, "Cancel")),
      h("p", { class: "note" }, "Command hint is a rough read of his bullpen zone rate (15+ located pitches); it isn't applied. Set command yourself, or let the games teach it.")) : null,
    !P ? h("p", { class: "note" }, "A CSV export from either system. His pitches are pulled out by name, averaged by pitch type, and fill in velo, break, spin and release point. Release points feed the engine's tunneling once you log measured break (Setup).") : null,
    sessions && sessions.length ? h("div", { class: "sess" }, h("span", { class: "t" }, "Sessions"),
      sessions.slice(0, 6).map((s) => h("div", { class: "srow2" }, h("span", {}, s.date), h("span", { class: "muted" }, `${s.source}, ${s.n} pitches`), h("span", { class: "pas" }, s.byType.map((t) => h("span", { class: `mini k-${t.kind}` }, chip(t.kind), fmt(t.velo))))))) : null);
}

function catchersPanel() {
  const list = [...DB.catchers.values()];
  return h("section", { class: "panel glass", "aria-label": "Catchers" },
    h("div", { class: "panel-head" }, h("h2", {}, "Catchers"), h("span", { class: "meta" }, "Blocking changes how often it calls a pitch in the dirt with runners on")),
    list.length ? h("div", { class: "clist" }, list.map((c) => h("div", { class: "crow2" },
      h("input", { value: c.name, "aria-label": "Catcher name", on: { change: (e) => { c.name = e.target.value; dbPut("catchers", c); } } }),
      h("span", { class: "blk" }, "Blocking"),
      h("div", { class: "seg small", role: "group", "aria-label": "Blocking, 1 to 5" }, [1, 2, 3, 4, 5].map((v) => h("button", { "aria-pressed": String(+c.block === v), on: { click: () => { c.block = v; dbPut("catchers", c); if (S.setup.catcherId === c.id) packChanged("catcher"); G().call = null; render(); } } }, String(v)))),
      h("button", { class: "x", "aria-label": `Remove ${c.name}`, on: { click: async () => { if (!confirmTwice("rmc:" + c.id)) { toast(`Tap × again to remove ${c.name}`); return; } await DB.D.del("catchers", c.id); DB.catchers.delete(c.id); if (S.setup.catcherId === c.id) S.setup.catcherId = null; save(); render(); } } }, "×"))))
      : h("p", { class: "note" }, "None yet. Without one, every catcher blocks like an average one (3)."),
    h("div", { class: "row-acts" }, h("button", { class: "btn", on: { click: async () => { const c = await dbPut("catchers", { teamId: ourTeam().id, name: `Catcher ${DB.catchers.size + 1}`, block: 3 }); DB.catchers.set(c.id, c); render(); } } }, "Add a catcher")));
}

// ---------------------------------------------------------------- opponents
function oppView() {
  const teams = opponents();
  if (!teamSel || !DB.teams.has(teamSel)) teamSel = S.setup.opponentId && DB.teams.has(S.setup.opponentId) ? S.setup.opponentId : (teams[0] || {}).id;
  const t = DB.teams.get(teamSel);
  return h("div", { class: "grid" },
    h("section", { class: "panel glass span-4", "aria-label": "Opponents" },
      h("div", { class: "panel-head" }, h("h2", {}, "Opponents"), h("span", { class: "meta" }, `${teams.length}`)),
      h("div", { class: "plist" }, teams.map((x) => {
        const hs = teamHitters(x.id);
        return h("button", { class: `pcard${x.id === teamSel ? " sel" : ""}`, "aria-pressed": String(x.id === teamSel), on: { click: () => { teamSel = x.id; render(); } } },
          h("span", { class: "pc-top" }, h("b", {}, x.name || "Unnamed"), S.setup.opponentId === x.id ? h("span", { class: "pill ok" }, "Today") : null),
          h("span", { class: "pc-sub" }, `${hs.length} hitter${hs.length === 1 ? "" : "s"}, ${LEVELS[x.level] || ""}`));
      })),
      h("div", { class: "row-acts" }, h("button", { class: "btn", on: { click: async () => { const nt = await dbPut("teams", { name: `Opponent ${teams.length + 1}`, isOurs: false, level: S.setup.level, notes: "" }); DB.teams.set(nt.id, nt); teamSel = nt.id; render(); } } }, "Add an opponent"))),
    t ? h("div", { class: "span-8 col" }, teamPanel(t)) : null,
    t ? h("div", { class: "span-12 col" }, hittersEditor(t)) : h("section", { class: "panel glass span-8" }, h("p", { class: "note" }, "Add an opponent to keep their hitters and what you learn about them from game to game.")));
}

function teamPanel(t) {
  const isToday = S.setup.opponentId === t.id;
  return h("section", { class: "panel glass", "aria-label": "Team" },
    h("div", { class: "panel-head" }, h("h2", {}, t.name || "Opponent"),
      h("button", { class: isToday ? "btn pill" : "btn pill primary", on: { click: () => { useOpponent(isToday ? null : t.id); } } }, isToday ? "Not today's opponent" : "Play them today")),
    h("div", { class: "fields" },
      h("label", { class: "f", style: { flex: "2 1 220px" } }, "Name", h("input", { value: t.name, on: { change: (e) => { t.name = e.target.value.trim(); dbPut("teams", t); render(); } } })),
      h("label", { class: "f", style: { flex: "1 1 160px" } }, "Level", h("select", { on: { change: (e) => { t.level = e.target.value; dbPut("teams", t); } } }, Object.entries(LEVELS).map(([k, v]) => h("option", { value: k, selected: k === t.level ? true : null }, v)))),
      h("label", { class: "f", style: { flex: "3 1 260px" } }, "Scouting notes", h("input", { value: t.notes || "", placeholder: "Aggressive early, run a lot…", on: { change: (e) => { t.notes = e.target.value; dbPut("teams", t); } } }))),
    h("div", { class: "row-acts spread" },
      h("label", { class: "btn pill file" }, "Import hitters (CSV)", h("input", { type: "file", accept: ".csv,text/csv,.txt", on: { change: (e) => {
        const f = e.target.files[0]; if (!f) return;
        f.text().then(async (txt) => {
          let list; try { list = PCImport.parseHitters(txt); } catch (err) { toast(err.message); return; }
          let added = 0, updated = 0;
          for (const x of list) {
            const ex = teamHitters(t.id).find((y) => y.name.toLowerCase() === x.name.toLowerCase());
            if (ex) { Object.assign(ex, { number: x.number || ex.number, bats: x.bats, pos: x.pos || ex.pos, stats: Object.assign({}, ex.stats, x.stats) });
              if (x.scoutTags) ex.scoutTags = Object.assign({}, ex.scoutTags, x.scoutTags);   // v1.2 Part B: a sheet's tag columns fill in (blank cells keep his tags)
              await dbPut("hitters", ex); updated++; }
            else { const nh = await dbPut("hitters", PCDB.newHitter(t.id, x)); DB.hitters.set(nh.id, nh); added++; }
          }
          render(); toast(`${added} hitter${added === 1 ? "" : "s"} added, ${updated} updated`);
        });
      } } })),
      h("button", { class: "btn text", on: { click: async () => {
        if (!confirmTwice(t.id)) { toast(`Tap again to remove ${t.name}. Charted pitches against them stay.`); return; }
        await DB.D.del("teams", t.id); DB.teams.delete(t.id); if (S.setup.opponentId === t.id) useOpponent(null); teamSel = null; render();
      } } }, "Remove opponent")),
    h("p", { class: "note" }, "Import a sheet with Name, #, Bats, PA, AVG, OBP, SLG, K or K%, BB or BB% columns (any order), and optional tag columns: Approach (aggressive / patient), Path (lift / flat), Offspeed (hits). Hitters already here are updated by name."));
}

function hittersEditor(t) {
  const hs = teamHitters(t.id);
  const stat = (x, k, step, ph, w = "64px") => h("input", { type: "number", inputmode: "decimal", step, value: (x.stats || {})[k] ?? "", placeholder: ph, "aria-label": k, style: { width: w },
    on: { change: (e) => { x.stats = Object.assign({}, x.stats, { [k]: e.target.value === "" ? "" : +e.target.value }); dbPut("hitters", x); relearnHitter(x.id).then(() => render()); } } });
  const know = (x) => {
    const m = hModel(x.id); if (!m) return h("span", { class: "muted" }, "–");
    const bits = [];
    for (const [k, w] of [["FB", "fastballs"], ["OS", "off-speed"]]) { const d = m.damage[k]; if (d && d[1] >= 2) bits.push(`${d[0] > 0.25 ? "hits" : d[0] < -0.25 ? "struggles with" : "even on"} ${w}`); }
    const src = m.n ? `${m.n} swings over ${m.games} game${m.games === 1 ? "" : "s"}` : m.prior ? "from his stats" : "";
    const lean = bits.filter((b) => !b.startsWith("even"));
    return h("span", { class: lean.length ? "" : "muted" }, lean.length ? lean.join(", ").replace(/^./, (c) => c.toUpperCase()) : bits.length ? "No clear lean" : "No lean yet", src ? h("small", { class: "muted" }, ` (${src})`) : null);
  };
  return h("section", { class: "panel glass", "aria-label": "Hitters" },
    h("div", { class: "panel-head" }, h("h2", {}, "Hitters"), h("span", { class: "meta" }, `${hs.length}`)),
    h("div", { class: "tbl-wrap" }, h("table", { class: "htable" },
      h("thead", {}, h("tr", {}, ["#", "Name", "Bats", "PA", "AVG", "OBP", "SLG", "K%", "BB%", "What we know", ""].map((c) => h("th", {}, c)))),
      h("tbody", {}, hs.length ? hs.map((x) => h("tr", {},
        h("td", {}, h("input", { value: x.number || "", "aria-label": "Number", inputmode: "numeric", style: { width: "52px" }, on: { change: (e) => { x.number = e.target.value.trim(); dbPut("hitters", x); } } })),
        h("td", {}, h("input", { value: x.name, "aria-label": "Name", style: { minWidth: "140px" }, on: { change: (e) => { x.name = e.target.value.trim(); dbPut("hitters", x); } } })),
        h("td", {}, h("div", { class: "hands", role: "group", "aria-label": "Bats" }, ["R", "L", "S"].map((v) => h("button", { "aria-pressed": String(x.bats === v), on: { click: () => { x.bats = v; dbPut("hitters", x); syncLineupHands(); render(); } } }, v)))),
        h("td", {}, stat(x, "pa", 1, "", "68px")), h("td", {}, stat(x, "avg", 0.001, ".280", "76px")), h("td", {}, stat(x, "obp", 0.001, ".380", "76px")), h("td", {}, stat(x, "slg", 0.001, ".420", "76px")),
        h("td", {}, stat(x, "k_pct", 0.1, "18", "68px")), h("td", {}, stat(x, "bb_pct", 0.1, "10", "68px")),
        h("td", { class: "wrapcell" }, know(x), tagInputs(x, x.name || "Hitter", () => dbPut("hitters", x))),   // v1.2 Part B: the coach's tags
        h("td", {}, h("button", { class: "x", "aria-label": `Remove ${x.name}`, on: { click: async () => { if (!confirmTwice("rmh:" + x.id)) { toast(`Tap × again to remove ${x.name}`); return; } await DB.D.del("hitters", x.id); DB.hitters.delete(x.id); render(); } } }, "×"))))
        : h("tr", { class: "empty-row" }, h("td", { colspan: "11" }, "No hitters yet. Add them here, import a sheet, or type names into the lineup in Setup."))))),
    h("div", { class: "row-acts" }, h("button", { class: "btn", on: { click: async () => { const nh = await dbPut("hitters", PCDB.newHitter(t.id, { name: `Hitter ${hs.length + 1}` })); DB.hitters.set(nh.id, nh); render(); } } }, "Add a hitter")),
    h("p", { class: "note" }, "Season stats give each hitter a small starting lean, measured against the level's average and weighted by plate appearances. What he does against your pitchers takes over from there and carries from game to game."));
}

function useOpponent(tid) {
  S.setup.opponentId = tid;
  if (tid) {   // fill empty lineup spots from their roster, in number order
    const hs = teamHitters(tid), used = new Set(S.setup.lineup.map((b) => b.hitterId).filter(Boolean));
    S.setup.lineup.forEach((b) => { if (b.hitterId && DB.hitters.get(b.hitterId)?.teamId !== tid) { b.hitterId = null; b.name = ""; } });
    let i = 0;
    for (const b of S.setup.lineup) { if (b.hitterId) continue; while (i < hs.length && used.has(hs[i].id)) i++; if (i >= hs.length) break; b.hitterId = hs[i].id; b.name = hs[i].name; b.hand = hs[i].bats; used.add(hs[i].id); i++; }
  } else S.setup.lineup.forEach((b) => { b.hitterId = null; });
  G().know = {}; G().call = null; save(); refreshLineupMemory().then(render); render();
}
function syncLineupHands() { for (const b of S.setup.lineup) { const x = b.hitterId && DB.hitters.get(b.hitterId); if (x) { b.hand = x.bats; b.name = x.name; } } }

// ---------------------------------------------------------------- fix a pitch in an earlier game (D11, D7)
// The same fixes as the live log (where it ended up, contact, a cross-up, a wild pitch), on any saved game. Each edit is
// made in place with the original kept (D0); the pitchers in that game are learned again when he's done. A pitch the
// learner couldn't read (D7) is marked here, and can be left out of learning.
const pastFix = { games: null, gameId: null, evs: null, open: null, touched: new Set(), loading: false };
async function pastFixLoad(gameId) {
  if (!DB.ready) return;
  pastFix.loading = true;
  if (!pastFix.games) pastFix.games = (await DB.D.all("games")).filter((g) => g.status !== "planned").sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));
  if (gameId !== undefined) {
    pastFix.gameId = gameId; pastFix.open = null;
    pastFix.evs = gameId ? (await DB.D.byIndex("events", "gameId", gameId)).filter(PCDB.isPitch).sort((a, b) => (a.seq || a.n || 0) - (b.seq || b.n || 0)) : null;
  }
  pastFix.loading = false; render();
}
async function pastFixDone() {
  const pids = [...pastFix.touched]; pastFix.touched.clear(); pastFix.open = null; render();
  for (const id of pids) if (DB.pitchers.has(id)) await relearnPitcher(id);
  if (pids.length) toast(`Fixed and learned again: ${pids.map((id) => DB.pitchers.get(id).name).join(", ")}`);
}
function pastFixPanel() {
  if (!DB.ready) return null;
  if (!pastFix.games && !pastFix.loading) { pastFixLoad(); return null; }
  const games = (pastFix.games || []).filter((g) => g.id !== G().dbId);
  const label = (g) => `${g.date || "?"}${g.opponentId && DB.teams.get(g.opponentId) ? ` vs ${DB.teams.get(g.opponentId).name}` : ""}${g.pitches ? `, ${g.pitches} pitches` : ""}${g.dupOf ? " (charted twice: left out)" : ""}`;
  const cur = games.find((g) => g.id === pastFix.gameId);
  const name = (ev) => (DB.pitchers.get(ev.pitcherId) || {}).name || "Pitcher";
  const set = async (ev, k, v) => {
    const changes = k === "thrown" ? { thrown: ev.thrown === v ? null : v, thrownId: ev.thrown === v ? null : (((DB.pitchers.get(ev.pitcherId) || {}).pitches || []).find((d) => d.name === v) || {}).id || null }
      : { [k]: ev[k] === v ? null : v };
    if (k === "loc") changes.locCell = ev.locCell && changes.loc && cellZone(ev.locCell) === changes.loc ? ev.locCell : null;   // v1.2: keep a cell that agrees
    await editEvent(ev.id, changes); Object.assign(ev, changes); pastFix.touched.add(ev.pitcherId); render();
  };
  // v1.2: correct where it landed at cell resolution (the cell and its zone move together; tapping the same cell clears both)
  const setCell = async (ev, cell) => {
    const changes = cell ? { loc: cellZone(cell), locCell: cell } : { loc: null, locCell: null };
    await editEvent(ev.id, changes); Object.assign(ev, changes); pastFix.touched.add(ev.pitcherId); render();
  };
  const seg = (ev, label, k, opts) => h("div", { class: "fixrow" }, h("span", { class: "t" }, label), h("div", { class: "seg" },
    opts.map(([v, t]) => h("button", { "aria-pressed": String(ev[k] === v), on: { click: () => set(ev, k, v) } }, t))));
  const editor = (ev) => {
    const others = ((DB.pitchers.get(ev.pitcherId) || {}).pitches || []).filter((d) => d.active !== false && d.name !== ev.pitchName);
    const ok = PCLearner.readable(E, ev);
    return h("tr", { class: "fix" }, h("td", { colspan: "6" }, h("div", { class: "fixbox" },
      ok ? null : h("p", { class: "pstat change" }, "Learning couldn't read this pitch (its saved situation or arsenal is broken), so it's skipped. Fix what you can below, or leave it out."),
      seg(ev, "Where it ended up", "loc", [["heart", "Middle"], ["edge", "Edge"], ["off", "Just off"], ["noncomp", "Way off"]]),
      cellGrid("Or tap the cell", ev.locCell || null, (c) => { setCell(ev, c); }, true),
      ev.res === "play" ? seg(ev, "Contact", "contact", [["weak", "Weak"], ["solid", "Solid"], ["hard", "Hard"]]) : null,
      others.length ? seg(ev, "Crossed up? He threw", "thrown", others.map((d) => [d.name, d.name])) : null,
      ["ball", "whiff", "cstrike"].includes(ev.res) ? seg(ev, "Got away?", "wp", [["wp", "Wild pitch"], ["pb", "Passed ball"]]) : null,
      h("div", { class: "row-acts" },
        h("button", { class: "btn", on: { click: () => { pastFix.open = null; render(); } } }, "Close"),
        h("button", { class: "btn text", on: { click: async () => { await DB.D.del("events", ev.id); pastFix.touched.add(ev.pitcherId); pastFix.evs = pastFix.evs.filter((x) => x.id !== ev.id); pastFix.open = null; render(); } } }, "Leave this pitch out of learning")),
      h("p", { class: "note" }, "Saved as you tap, with the original kept. The count and the result can't be changed here."))));
  };
  const rows = pastFix.evs || [];
  return h("section", { class: "panel glass span-12", "aria-label": "Fix a pitch in an earlier game" },
    h("div", { class: "panel-head" }, h("h2", {}, "Fix a pitch in an earlier game"),
      h("div", { class: "row-acts" }, pastFix.touched.size ? h("button", { class: "btn primary", on: { click: () => pastFixDone() } }, "Done: learn again") : null)),
    games.length ? h("label", { class: "f", style: { maxWidth: "420px" } }, "Game", h("select", { id: "pastfix-game", on: { change: (e) => pastFixLoad(e.target.value || null) } },
      [h("option", { value: "" }, "Pick a game")].concat(games.map((g) => h("option", { value: g.id, selected: g.id === pastFix.gameId ? true : null }, label(g))))))
      : h("p", { class: "note" }, "Saved games show up here once you end one."),
    cur && cur.dupOf ? h("p", { class: "pstat watch" }, `This looks like the same game as another iPad's (${Math.round((cur.dupMatch || 0) * 100)}% of pitches line up), so it's left out of learning and the other one counts. `,
      h("button", { class: "btn text", on: { click: () => notDuplicate(cur.id) } }, "They're different games")) : null,
    rows.length ? h("div", { class: "tbl-wrap" }, h("table", { class: "log-tbl" },
      h("thead", {}, h("tr", {}, ["#", "Pitcher", "Count", "Pitch and spot", "Result", ""].map((t) => h("th", {}, t)))),
      h("tbody", {}, rows.flatMap((ev) => {
        const bad = !PCLearner.readable(E, ev);
        const extra = [ev.loc ? { heart: "middle", edge: "edge", off: "just off", noncomp: "way off" }[ev.loc] : null, ev.contact || null, ev.thrown ? `threw ${ev.thrown}` : null, ev.wp ? (ev.wp === "pb" ? "passed ball" : "wild pitch") : null, ev.edits && ev.edits.length ? "fixed" : null].filter(Boolean);
        const tr = h("tr", { class: bad ? "bad-row" : "" }, h("td", { class: "num" }, String(ev.n || "")), h("td", {}, name(ev)),
          h("td", { class: "num" }, ev.sit ? `${ev.sit.balls}-${ev.sit.strikes}` : "?"), h("td", {}, `${ev.pitchName || "?"}, ${SPOT[ev.quad] ? spotLower(ev.quad) : ev.quad ? String(ev.quad) : "no spot saved"}`),
          h("td", {}, ev.res || "?", extra.length ? h("small", { class: "muted" }, ` · ${extra.join(", ")}`) : null, bad ? h("small", { class: "pstat change" }, " · skipped by learning") : null),
          h("td", {}, h("button", { class: "btn text", "aria-expanded": String(pastFix.open === ev.id), on: { click: () => { pastFix.open = pastFix.open === ev.id ? null : ev.id; render(); } } }, pastFix.open === ev.id ? "Close" : "Fix")));
        return pastFix.open === ev.id ? [tr, editor(ev)] : [tr];
      })))) : pastFix.gameId ? h("p", { class: "note" }, "No pitches saved for that game.") : null);
}
// from Roster: open the first game with a pitch learning skipped
function openSkipped(prof) {
  const gid = prof && prof.skipped && prof.skipped.games && prof.skipped.games[0];
  S.view = "data"; save();
  pastFix.games = null; pastFixLoad(gid || null);
}

// ---------------------------------------------------------------- backup
async function backup() {
  if (!DB.D) return;
  const data = await DB.D.exportAll();
  data.appState = { setup: Object.assign({}, S.setup, { staff: undefined }) };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `pitch-caller-backup-${todayT()}.json`;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast(`Backup saved: ${data.stores.events.filter((e) => !e.deletedAt && PCDB.isPitch(e)).length} pitches, ${data.stores.pitchers.length} pitchers`);
}
async function restore(e) {
  const f = e.target.files[0]; if (!f || !DB.D) return;
  try {
    const st = await DB.D.importAll(JSON.parse(await f.text()));
    if (st.games || st.events) await DB.D.put("meta", { id: "checkDups" });   // D12: checked once the app is back up
    toast(`Restored: ${Object.entries(st).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing newer than what's here"}`);
    setTimeout(() => location.reload(), 900);
  } catch (err) { toast(err.message || "That file couldn't be read"); }
}

// ---------------------------------------------------------------- game day (Plan 5, A7): pitch-count rules, rest,
// eligible-on, the pitching log and the sign card. Dates are the team's (its time zone); only game pitches count.
const teamTz = () => (SYNC.cfg && SYNC.cfg.timezone) || null;
const todayT = () => PCDB.today(teamTz());
const teamRule = () => { const t = ourTeam(); return t && t.pitchRule ? PCRules.resolve(t.pitchRule) : null; };
const fmtDay = (d) => new Date(d + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const restWords = (n, unit) => n === 0 ? "no rest" : `${n} ${unit === "nights" ? "night" : "day"}${n === 1 ? "'s" : "s'"} rest`;
// every pitcher's game pitches, by game: [{ pid, gameId, date, n }] (games charted twice count once, D12)
async function refreshOutings() {
  if (!DB.ready) return;
  const games = new Map((await DB.D.all("games")).filter((g) => !g.dupOf && g.date).map((g) => [g.id, g.date]));
  const by = new Map();
  for (const e of await DB.D.all("events")) {
    if (!PCDB.isPitch(e) || e.legacy || !e.pitcherId || !games.has(e.gameId)) continue;
    const k = e.pitcherId + "|" + e.gameId; by.set(k, (by.get(k) || 0) + 1);
  }
  DB.outings = [...by].map(([k, n]) => { const [pid, gameId] = k.split("|"); return { pid, gameId, date: games.get(gameId), n }; });
}
// his days: [{ date, pitches }], leaving out one game (the one being called, counted live instead)
const outingsOf = (pid, exceptGame) => (DB.outings || []).filter((o) => o.pid === pid && o.gameId !== exceptGame).map((o) => ({ date: o.date, pitches: o.n }));
function eligibility(pid) {
  const r = teamRule(); if (!r || !pid) return null;
  return PCRules.eligibleOn(r, outingsOf(pid), todayT());
}
function eligibleText(pid) {
  const e = eligibility(pid); if (!e) return null;
  if (e.today) return "eligible today";
  const w = e.why || {};
  const because = w.kind === "rest" ? ` (${w.pitches} pitches ${fmtDay(w.date).split(",")[0]})` : w.kind === "consecutive" ? " (pitched days in a row)" : w.kind === "window" ? ` (${w.max} in ${w.days} days)` : "";
  return `eligible ${fmtDay(e.date)}${because}`;
}
// the live line under his count: what's left, the next rest tier, and the limit
function countLine() {
  const r = teamRule(), pd = pitcherDef(), g = G();
  if (!r || !pd || !pd.id) return null;
  const d = todayT(), prior = outingsOf(pd.id, g.dbId);
  const earlier = prior.filter((o) => o.date === d).reduce((a, o) => a + o.pitches, 0);
  const count = earlier + (g.pc[pKey()] || 0);
  const st = PCRules.liveStatus(r, count, d, prior.filter((o) => o.date !== d));
  if (st.level === "limit") return { warn: true, text: `At his limit of ${st.max}.${st.finishBatter ? " Finish this batter, then he's done." : ""}` };
  const parts = [`${st.left} left of ${st.max}${earlier ? ` (${earlier} earlier today)` : ""}${st.capped ? ` (${st.capped.before} in the last ${st.capped.days - 1} day${st.capped.days === 2 ? "" : "s"})` : ""}`];
  parts.push(st.nextAt ? `${st.nextAt - count} more: ${restWords(st.nextRest, r.unit)}` : `${restWords(st.rest, r.unit)} after today`);
  return { warn: st.level === "near", text: parts.join(" · ") };
}
// Setup: the team's rule. A preset from the governing body's own page; any number can be changed.
function pitchRulePanel() {
  const t = ourTeam(); if (!t) return null;
  const set = t.pitchRule || null, r = set ? PCRules.resolve(set) : null;
  const keep = async (next) => { const tt = Object.assign({}, ourTeam(), { pitchRule: next }); const saved = await dbPut("teams", tt); DB.teams.set(saved.id, saved); G().call = null; render(); };
  const groups = [...new Set(PCRules.PRESETS.map((x) => x.group))];
  const pick = h("label", { class: "f", style: { flex: "1 1 260px" } }, "Pitch-count rule", h("select", { id: "rule-preset", on: { change: (e) => keep(e.target.value ? { preset: e.target.value } : null) } },
    h("option", { value: "", selected: set ? null : true }, "Pick your league's rule"),
    groups.map((gr) => h("optgroup", { label: gr }, PCRules.PRESETS.filter((x) => x.group === gr).map((x) => h("option", { value: x.id, selected: set && set.preset === x.id ? true : null }, x.name))))));
  if (!r) return [h("div", { class: "fields" }, pick), h("p", { class: "note" }, "Each pitcher's rest and the day he can pitch again come from it, and the Game screen warns as he nears the limit. Pick a preset, then change any number your league does differently.")];
  const lim = PCRules.limits(r, todayT()), unit = r.unit === "nights" ? "Nights of rest" : "Days of rest";
  const tiers = lim.tiers;
  const setTier = (i, k, v) => { const ts = tiers.map((x) => x.slice()); ts[i][k] = v; keep(Object.assign({}, set, { tiers: ts, max: Math.max(r.max || 0, ts[ts.length - 1][0]) })); };
  const table = h("table", { class: "rule-tbl", "aria-label": "Rest by pitch count" },
    h("thead", {}, h("tr", {}, h("th", {}, "Pitches"), h("th", {}, unit))),
    h("tbody", {}, tiers.map(([upTo, rest], i) => h("tr", {},
      h("td", {}, `${i ? tiers[i - 1][0] + 1 : 1} to `, r.byMonth ? String(upTo) : h("input", { type: "number", min: 1, max: 200, value: upTo, "aria-label": `Tier ${i + 1} up to`, on: { change: (e) => setTier(i, 0, +e.target.value) } })),
      h("td", {}, r.byMonth ? String(rest) : h("input", { type: "number", min: 0, max: 10, value: rest, "aria-label": `Tier ${i + 1} rest`, on: { change: (e) => setTier(i, 1, +e.target.value) } }))))));
  return [h("div", { class: "fields" }, pick,
      r.byMonth ? null : h("label", { class: "f", style: { flex: "0 1 130px" } }, "Daily limit", h("input", { id: "rule-max", type: "number", min: 10, max: 200, value: r.max, on: { change: (e) => keep(Object.assign({}, set, { max: +e.target.value })) } }))),
    r.byMonth ? h("p", { class: "note" }, `This month's limit: ${lim.max}. New York's varsity limits change in March, April and May.`) : null,
    table,
    h("p", { class: "note" }, [r.maxConsecutive ? `Not more than ${r.maxConsecutive} days in a row. ` : "", (r.windows || []).map((w) => `Not more than ${w.max} pitches in any ${w.days} days. `).join(""),
      r.finishBatter ? "He may finish the batter he's facing at the limit. " : ""].join("")),
    h("p", { class: "note" }, r.source ? ["From ", h("a", { href: r.source, target: "_blank", rel: "noopener" }, r.group), `, checked ${r.checked}. `, r.sourceNote || "", r.edited ? " You've changed some numbers." : ""] : (r.sourceNote || "")),
    r.edited ? h("div", { class: "row-acts" }, h("button", { class: "btn text", on: { click: () => keep({ preset: set.preset }) } }, "Back to the preset's numbers")) : null];
}
// a printout: the page shows only this while printing (works with no signal)
function printOut(title, nodes) {
  let el = document.getElementById("print-area");
  if (!el) { el = document.createElement("div"); el.id = "print-area"; document.body.append(el); }
  el.replaceChildren(h("h1", {}, title), ...nodes);
  window.print();
}
// the pitching log of one game: each pitcher's pitches, batters faced, rest and the day he can pitch again
async function pitchingLog(gameId) {
  const g = await DB.D.get("games", gameId); if (!g) return null;
  const evs = (await DB.D.byIndex("events", "gameId", gameId)).filter((e) => PCDB.isPitch(e) && !e.legacy);
  const r = teamRule(), rows = [];
  for (const pid of [...new Set(evs.map((e) => e.pitcherId).filter(Boolean))]) {
    const mine = evs.filter((e) => e.pitcherId === pid), p = DB.pitchers.get(pid) || {};
    const day = outingsOf(pid).filter((o) => o.date === g.date).reduce((a, o) => a + o.pitches, 0) || mine.length;
    const rest = r ? PCRules.restFor(r, day, g.date) : null;
    const elig = r ? PCRules.eligibleOn(r, outingsOf(pid).filter((o) => o.date <= g.date), g.date) : null;
    rows.push({ pid, name: (p.number ? `#${p.number} ` : "") + (p.name || "Pitcher"), pitches: mine.length, day, bf: mine.filter((e) => e.end).length,
      first: Math.min(...mine.map((e) => e.inning || 1)), last: Math.max(...mine.map((e) => e.inning || 1)), rest, eligible: elig ? elig.date : null });
  }
  rows.sort((a, b) => a.first - b.first);
  const opp = g.opponentId && DB.teams.get(g.opponentId);
  return { game: g, opponent: opp ? opp.name : "", rule: r, rows };
}
function pitchingLogCsv(L) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Date", "Opponent", "Pitcher", "Pitches", "Pitches that day", "Batters faced", "Innings", L.rule ? (L.rule.unit === "nights" ? "Nights of rest" : "Days of rest") : "Rest", "Eligible on"];
  return [head, ...L.rows.map((x) => [L.game.date, L.opponent, x.name, x.pitches, x.day, x.bf, x.first === x.last ? x.first : `${x.first}-${x.last}`, x.rest ?? "", x.eligible || ""])].map((r) => r.map(q).join(",")).join("\n");
}
async function printPitchingLog(gameId) {
  const L = await pitchingLog(gameId); if (!L) return;
  printOut(`Pitching log, ${fmtDay(L.game.date)}${L.opponent ? ` vs ${L.opponent}` : ""}`, [
    h("p", {}, `${(ourTeam() || {}).name || "Our team"}. ${L.rule ? `Rule: ${L.rule.name}${L.rule.edited ? " (with our own numbers)" : ""}.` : "No pitch-count rule set."}`),
    h("table", {}, h("thead", {}, h("tr", {}, ["Pitcher", "Pitches", "Batters faced", "Innings", L.rule && L.rule.unit === "nights" ? "Nights of rest" : "Days of rest", "Eligible on"].map((x) => h("th", {}, x)))),
      h("tbody", {}, L.rows.map((x) => h("tr", {}, h("td", {}, x.name), h("td", {}, String(x.pitches) + (x.day !== x.pitches ? ` (${x.day} that day)` : "")), h("td", {}, String(x.bf)),
        h("td", {}, x.first === x.last ? String(x.first) : `${x.first}-${x.last}`), h("td", {}, x.rest === null ? "" : String(x.rest)), h("td", {}, x.eligible ? fmtDay(x.eligible) : ""))))),
    h("p", {}, "Signed: ____________________   Opposing coach: ____________________")]);
}
async function downloadPitchingLog(gameId) {
  const L = await pitchingLog(gameId); if (!L) return;
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([pitchingLogCsv(L)], { type: "text/csv" }));
  a.download = `pitching-log-${L.game.date}.csv`; document.body.append(a); a.click(); a.remove();
}
// the catcher's sign card: today's staff, each pitch with its sign (the standard 1 fastball, 2 curve, 3 slider, 4 change)
function printSignCard() {
  const staff = S.setup.staff || [];
  printOut("Signs", [
    h("p", {}, Object.entries(SIGN).sort((a, b) => a[1] - b[1]).map(([k, n]) => `${n} ${KINDS[k]}`).join("   ")),
    h("p", {}, "5 and 6 are card or wristband numbers. A pitch shows its own number when it keeps an older sign."),
    ...staff.map((p) => h("div", { class: "card" }, h("h2", {}, (p.number ? `#${p.number} ` : "") + (p.name || "Pitcher")),
      h("table", {}, h("tbody", {}, (p.pitches || []).filter((d) => d.active !== false).map((d) => h("tr", {}, h("td", { class: "sign" }, signOf(d.kind, d.sign)), h("td", {}, d.name), h("td", {}, KINDS[d.kind]))))))),
  ]);
}
// a game's log, chosen on the Data screen: the last few games, newest first
let logGames = null;
function pitchingLogPanel() {
  if (!DB.ready) return null;
  if (!logGames) { logGames = []; DB.D.all("games").then((gs) => { logGames = gs.filter((g) => !g.dupOf && g.date).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12); render(); }); }
  return h("section", { class: "panel glass", "aria-label": "Pitching log" },
    h("div", { class: "panel-head" }, h("h2", {}, "Pitching log"), h("span", { class: "meta" }, teamRule() ? teamRule().name : "No pitch-count rule set (Setup)")),
    logGames.length ? h("div", { class: "tbl-wrap" }, h("table", { class: "log-tbl" }, h("tbody", {}, logGames.map((g) => h("tr", {},
      h("td", {}, fmtDay(g.date)), h("td", {}, (DB.teams.get(g.opponentId) || {}).name || ""), h("td", {}, g.status || ""),
      h("td", {}, h("button", { class: "btn text", on: { click: () => printPitchingLog(g.id) } }, "Print"), h("button", { class: "btn text", on: { click: () => downloadPitchingLog(g.id) } }, "CSV"))))))) : h("p", { class: "note" }, "Games appear here once they're charted."),
    h("div", { class: "row-acts" }, h("button", { class: "btn", on: { click: printSignCard } }, "Print the sign card")));
}

// ---------------------------------------------------------------- game day prep (Plan 5): one step on Wi-Fi, so the
// game can be called with no signal. Syncs, checks what the calls need is on this iPad, and records when it was done.
let PREP = null;
async function loadPrep() { if (DB.ready) PREP = await DB.D.get("meta", "prep"); }
const prepToday = () => !!(PREP && PREP.date === todayT());
async function prepGame() {
  const checks = [], add = (ok, text, must) => checks.push({ ok: !!ok, text, must: !!must });
  PREP_BUSY = true; render();
  try {
    if (SYNC.sync && SYNC.authSession) {
      const r = navigator.onLine === false ? null : await syncNow(true);
      add(r && !r.locked && !r.error, !r ? "Couldn't reach the server: connect to Wi-Fi and try again" : r.locked ? "The team isn't switched on (billing): nothing synced" : r.error ? "Some changes didn't go up; they'll go next time" : "Synced with the team", true);
    } else add(true, "Not signed in to a team: this iPad calls with its own data");
    const offline = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    add(offline, offline ? "The app opens with no signal" : "Open the app once more with a signal (or add it to the home screen) so it opens offline", true);
    let kept = null; try { kept = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : null; } catch (e) {}
    add(kept !== false, kept ? "The iPad keeps this app's data" : "The iPad may clear this app's data when space runs low: add it to the home screen");
    const rule = teamRule();
    add(rule, rule ? `Pitch counts: ${rule.name}` : "No pitch-count rule (Setup, Pitch counts)");
    const staff = (S.setup.staffIds || []).map((id) => DB.pitchers.get(id)).filter(Boolean);
    const notYet = staff.filter((p) => { const e = eligibility(p.id); return e && !e.today; });
    add(staff.length, `${staff.length} pitcher${staff.length === 1 ? "" : "s"} on today's staff${notYet.length ? `; not eligible: ${notYet.map((p) => p.name).join(", ")}` : ""}`, true);
    const opp = S.setup.opponentId && DB.teams.get(S.setup.opponentId);
    add(opp, opp ? `Opponent: ${opp.name}, ${teamHitters(opp.id).length} hitters` : "No opponent picked: every hitter starts as average");
    PREP = { id: "prep", at: Date.now(), date: todayT(), checks, ready: checks.every((c) => c.ok || !c.must) };
    await DB.D.put("meta", PREP);
    toast(PREP.ready ? "Ready to call this game offline." : "Not ready yet: see what's missing in Setup.");
  } finally { PREP_BUSY = false; render(); }
}
let PREP_BUSY = false;
function prepPanel() {
  const when = PREP && PREP.at ? new Date(PREP.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  return [h("div", { class: "row-acts" }, h("button", { class: "btn primary", id: "prep-game", disabled: PREP_BUSY ? true : null, on: { click: () => prepGame() } }, PREP_BUSY ? "Getting ready…" : "Get ready for offline")),
    PREP ? h("p", { class: prepToday() && PREP.ready ? "note" : "pstat watch" }, prepToday() ? `${PREP.ready ? "Ready" : "Not ready"} as of ${when} today.` : `Last ready ${new Date(PREP.at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}: get ready again for today's game.`) : null,
    PREP ? h("ul", { class: "warns", "aria-label": "Offline checks", style: { color: "inherit" } }, PREP.checks.map((c) => h("li", { style: c.ok ? null : { color: "var(--warn)" } }, `${c.ok ? "✓" : "!"} ${c.text}`))) : null];
}
// the Game screen's one line about it: not ready today (when the iPad is on a team), or an update waiting for the game to end
function prepNotice() {
  if (PORTAL.msg) return h("p", { class: "pstat watch", role: "alert", id: "portal-notice" }, PORTAL.msg, " ", h("button", { class: "btn text", on: { click: () => { PORTAL.msg = null; render(); } } }, "Dismiss"));
  // a game set up on the website for today, offered when no game is going on this device
  const plan = !G().dbId && PORTAL.today.length && may("call_games") ? PORTAL.today[0] : null;
  if (plan) {
    const opp = plan.opponentId && DB.teams.get(plan.opponentId);
    return h("p", { class: "pstat note", role: "status", id: "planned-notice" }, `Today's game${opp ? ` ${plan.setup && plan.setup.home === false ? "at" : "vs"} ${opp.name}` : ""} is set up.`, " ",
      h("button", { class: "btn pill", on: { click: () => startPlanned(plan).catch((e) => { PORTAL.msg = e.message; render(); }) } }, "Start it"));
  }
  if (typeof window !== "undefined" && window.PC_UPDATE_WAITING && G().dbId) return h("p", { class: "pstat note", role: "status" }, "An update is ready. It installs after this game.");
  if (SYNC.cfg && SYNC.cfg.programId && !(prepToday() && PREP.ready)) return h("p", { class: "pstat watch", role: "status", id: "prep-notice" }, "This iPad isn't ready for offline today: Setup, Get ready for offline (on Wi-Fi).");
  return null;
}

// ---------------------------------------------------------------- sync with Supabase (build step 2)
// The device stays the place every pitch is written first; sync copies changes up and down in the background, never
// during a call. Settings and the session live in the device's meta store (not synced).
const SYNC = { cfg: null, auth: null, sync: null, busy: false, last: null, error: null, pending: null, teams: null, invites: null, staff: null, bound: null, locked: false, lastInvite: null, advOpen: new Set() };
const restUrl = () => SYNC.cfg.url.replace(/\/$/, "") + "/rest/v1";
const transportFor = (programId) => PCSync.restTransport({ restUrl: restUrl(), apiKey: SYNC.cfg.apiKey, token: SYNC.auth.token, programId });
// A team's staff: a preset each (the server's list), with toggles on top for the advanced view. A player is linked to
// his own pitcher record and sees only that. The server decides every one of these; the iPad only shows them.
const PRESETS = [["head", "Head coach"], ["pitching", "Pitching coach"], ["caller", "Pitch caller"], ["viewer", "Viewer"], ["player", "Player"]];
const TOGGLES = [["call_games", "Call games"], ["edit_grades", "Edit grades"], ["review_uploads", "Review uploads"], ["manage_opponents", "Opponents"], ["manage_roster", "Roster"], ["manage_staff", "Staff"]];
const PRESET_PERMS = { head: TOGGLES.map((t) => t[0]), pitching: ["call_games", "edit_grades", "review_uploads", "manage_opponents"], caller: ["call_games", "manage_opponents"], viewer: [], player: [] };
const roleName = (r) => (PRESETS.find((x) => x[0] === r) || [r, r || "?"])[1];
const effective = (role, perms) => { const o = {}; for (const [k] of TOGGLES) o[k] = (perms && k in perms) ? !!perms[k] : (PRESET_PERMS[role] || []).includes(k); return o; };
const may = (perm) => !!(SYNC.cfg && SYNC.cfg.perms && SYNC.cfg.perms[perm]);
// an invite code, or a link with one in it
const inviteToken = (s) => { const m = String(s || "").match(/[0-9a-f]{64}/i); return m ? m[0].toLowerCase() : null; };
async function syncSetup() {
  if (!DB.D || typeof PCSync === "undefined") return;
  SYNC.cfg = await DB.D.get("meta", "syncConfig");
  // served by PitchIQ (/app/game/): the project's URL and publishable key come from the site, nobody types them
  if ((!SYNC.cfg || !SYNC.cfg.url) && typeof window !== "undefined" && window.PC_CONFIG_URL && navigator.onLine !== false) {
    try {
      const r = await fetch(window.PC_CONFIG_URL, { cache: "no-cache" });
      const c = r.ok ? await r.json() : null;
      if (c && c.url && c.apiKey) SYNC.cfg = await DB.D.put("meta", Object.assign({ id: "syncConfig" }, SYNC.cfg || {}, { url: c.url, apiKey: c.apiKey, managed: true }));
    } catch (e) {}
  }
  SYNC.bound = await DB.D.get("meta", "boundProgram");
  SYNC.auth = SYNC.sync = null;
  if (!SYNC.cfg || !SYNC.cfg.url || !SYNC.cfg.apiKey) return;
  SYNC.auth = PCSync.supabaseAuth({ url: SYNC.cfg.url, apiKey: SYNC.cfg.apiKey, db: DB.D });
  SYNC.authSession = await SYNC.auth.session();
  const who = SYNC.authSession || {};
  if (SYNC.cfg.programId) {
    // the signed-in account goes with every sync: an iPad another account last synced is handed over only when that
    // account has nothing left waiting to go up (a shared iPad never sends one coach's work as another's)
    SYNC.sync = PCSync.createSync({ db: DB.D, transport: transportFor(SYNC.cfg.programId), programId: SYNC.cfg.programId, programName: SYNC.cfg.programName,
      userId: who.userId || null, userEmail: who.email || null });
    SYNC.pending = await SYNC.sync.pending();
  }
  syncTriggers();
}
async function syncConfig(patch) {
  SYNC.cfg = await DB.D.put("meta", Object.assign({ id: "syncConfig" }, SYNC.cfg || {}, patch));
  await syncSetup();
}
// Sync goes when the iPad comes back online or the app comes back to the front, never in the middle of a game (the
// finished game goes up when it ends). The browser is asked to keep the database even when space runs low.
function syncTriggers() {
  if (SYNC.triggers || typeof window === "undefined" || !window.addEventListener) return;
  SYNC.triggers = true;
  const quietSync = () => { if (SYNC.sync && SYNC.authSession && !G().dbId) syncNow(true); };
  window.addEventListener("online", quietSync);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") quietSync(); });
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then((ok) => { SYNC.persisted = ok; }).catch(() => {}); } catch (e) {}
}
const programTransport = () => transportFor(null);
const syncMessage = (e) => /fetch|network|offline|Failed to fetch|Load failed/i.test(e.message) ? "Couldn't reach the server: everything stays on this iPad and goes up next time." : e.message.replace(/^pc_\w+: /, "");
const LOCKED = "This team isn't switched on (billing). Everything stays on this iPad and goes up once it is.";
// A sync asked for while one is running (a game just ended, the button tapped twice) waits for it and then runs once
// more, and whoever asked gets that second run's result: nothing ends up quietly skipped.
let syncRun = null, syncQueued = null;
function syncNow(quiet) {
  if (!SYNC.sync) return Promise.resolve(null);
  if (SYNC.busy && syncRun) {
    if (!syncQueued) syncQueued = syncRun.catch(() => {}).then(() => { syncQueued = null; return syncNow(quiet); });
    return syncQueued;
  }
  syncRun = syncOnce(quiet).finally(() => { syncRun = null; });
  return syncRun;
}
async function syncOnce(quiet) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) { SYNC.error = "No signal: everything stays on this iPad and goes up next time."; if (S.view === "setup") render(); return null; }
  SYNC.busy = true; SYNC.error = null; if (S.view === "setup") render();
  try {
    const r = await SYNC.sync.syncNow();
    SYNC.last = { at: Date.now(), r };
    SYNC.locked = !!r.locked;
    if (SYNC.staff) SYNC.staff = null;   // who accepted, who left: the staff list is fetched again with the sync
    SYNC.pending = await SYNC.sync.pending();
    if (r.error) SYNC.error = `Some changes couldn't go up: ${r.error}. Everything stays on this iPad and is tried again next time.`;
    if (r.pull.merged || (r.push.skipped && r.push.skipped > 0)) { await reloadFromDb(); if (await checkDuplicates().then((x) => x.length).catch(() => 0)) await SYNC.sync.push().catch(() => {}); }
    if (!quiet) toast(r.locked ? LOCKED : `Synced: ${r.push.applied} up, ${r.pull.merged} down${r.push.rejected.length ? `, ${r.push.rejected.length} kept on this iPad` : ""}`);
    return r;
  } catch (e) {
    if (/refresh token|JWT expired|invalid jwt/i.test(e.message) || e.status === 401) {
      // the sign-in ran out (or was revoked): nothing is lost, the team stays picked, he signs in again
      await SYNC.auth.signOut().catch(() => {}); SYNC.authSession = null;
      SYNC.error = "Your sign-in expired: sign in again. Everything stays on this iPad until then.";
    } else SYNC.error = syncMessage(e);
    return null;
  } finally { SYNC.busy = false; if (S.view === "setup") render(); }
}
// One iPad holds one team. Using it for another means starting it fresh: a backup file first (everything on it,
// to keep or restore later), then the iPad's database and game state are cleared and the app starts over.
async function startFresh() {
  if (!confirmTwice("startfresh")) { toast("Tap again to back up and start this iPad fresh"); return; }
  await backup();
  await new Promise((r) => setTimeout(r, 1200));   // let the download start before the database goes
  try { localStorage.removeItem("pitchcaller.v2"); } catch (e) {}
  await DB.D.destroy();
  location.reload();
}
function otherProgram(name) {
  const b = SYNC.bound;
  return b && b.programId && name && b.programId !== name ? b : null;
}
const teamCfg = (t) => ({ programId: t.team_id, programName: t.team_name, role: t.role, perms: t.perms || {}, isOwner: !!t.is_owner, timezone: t.timezone || null });
// Joining a team that already exists: pull before anything goes up. Every new install makes a placeholder "Our team"
// with default pitchers; once the team's own roster has come down, the placeholder goes, and any of its pitchers or
// catchers that already have work on this iPad (pitches, bullpens, check-ins, velo) move to the team's roster instead
// of being lost. The team is saved as this iPad's only once that has worked, so a join cut off halfway (no signal)
// never leaves the placeholders to go up at the next sync.
async function joinProgram(t) {
  const D = DB.D;
  const b = otherProgram(t.team_id);
  if (b) throw new Error(`This iPad holds the data for ${b.programName || "another team"}. To use it for ${t.team_name}, back it up and start this iPad fresh.`);
  if (navigator.onLine === false) throw new Error("No signal: join the team once this iPad is online.");
  if (!t.role) throw new Error(`You own ${t.team_name} but aren't on its staff. Add yourself as a coach first.`);
  const before = { teams: new Set((await D.all("teams")).map((x) => x.id)) };
  const who = SYNC.authSession || {};
  const sync = PCSync.createSync({ db: D, transport: transportFor(t.team_id), programId: t.team_id, programName: t.team_name, userId: who.userId || null, userEmail: who.email || null });
  SYNC.busy = true; render();
  let moved = 0, dropped = 0, locked = false;
  try {
    locked = (await sync.pull()).locked;
    const ours = (await D.all("teams")).filter((x) => x.isOurs);
    const theirs = ours.find((x) => !before.teams.has(x.id));
    if (theirs) {
      const events = await D.all("events");
      const used = new Set();
      for (const e of events) { if (e.pitcherId) used.add(e.pitcherId); if (e.catcherId) used.add(e.catcherId); }
      for (const st of ["sessions", "checkins", "readings"]) for (const x of await D.all(st)) if (x.pitcherId) used.add(x.pitcherId);
      for (const mine of ours.filter((x) => before.teams.has(x.id))) {
        for (const st of ["pitchers", "catchers"]) for (const x of await D.byIndex(st, "teamId", mine.id)) {
          if (used.has(x.id)) { await D.put(st, Object.assign(x, { teamId: theirs.id })); moved++; }
          else { await D.forget(st, x.id); dropped++; }
        }
        await D.forget("teams", mine.id);
      }
    }
    await reloadFromDb();
    S.setup.staffIds = (S.setup.staffIds || []).filter((id) => DB.pitchers.has(id));
    if (!S.setup.staffIds.length) S.setup.staffIds = rosterPitchers().slice(0, 2).map((x) => x.id);
    if (S.setup.catcherId && !DB.catchers.has(S.setup.catcherId)) S.setup.catcherId = null;
    attachStaff(); save();
  } finally { SYNC.busy = false; }
  await syncConfig(teamCfg(t));
  if (!locked) await syncNow(true);
  toast(locked ? `${t.team_name} isn't switched on yet: nothing syncs until it is.` : `Joined ${t.team_name}${moved ? `: ${moved} pitcher${moved === 1 ? "" : "s"} with work on this iPad kept (check the roster for doubles)` : ""}.`);
  return { moved, dropped, locked };
}
// A new team: an organization (billed per team, per year), and the team in it with this account as head coach. It
// stays switched off until billing is done; until then everything is kept on this iPad and goes up once it's on. An
// organization made by a try that didn't finish (no signal) is used again, not made twice.
async function startProgram() {
  const name = (ourTeam() || {}).name || "Our team";
  if (SYNC.bound) throw new Error(`This iPad holds the data for ${SYNC.bound.programName || "another team"}. To start a new team, back it up and start this iPad fresh.`);
  if (navigator.onLine === false) throw new Error("No signal: start the team once this iPad is online.");
  const tr = programTransport();
  let org = SYNC.cfg.pendingOrg;
  if (!org) { org = await tr.createOrg(name, S.setup.level); await syncConfig({ pendingOrg: org }); }
  let tz = "America/New_York"; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) {}
  const id = await tr.createTeam(org, name, S.setup.level, tz, "head");
  await syncConfig({ pendingOrg: null, programId: id, programName: name, role: "head", perms: effective("head", {}), isOwner: true, timezone: tz });
  await syncNow(true);
  toast(`${name} is set up. It switches on once billing is done; until then everything stays on this iPad.`);
}
// After signing in: the account's teams, and what it is on this iPad's team now (a role changed since, or not on it)
async function refreshTeams() {
  const [teams, invites] = await Promise.all([programTransport().myTeams(), programTransport().myInvites()]);
  SYNC.teams = teams || []; SYNC.invites = invites || [];
  const c = SYNC.cfg || {};
  if (c.programId) {
    const t = SYNC.teams.find((x) => x.team_id === c.programId && x.role);
    if (!t) { await syncConfig({ programId: null, role: null, perms: {} }); SYNC.error = `This account isn't on ${c.programName || "this iPad's team"}'s staff. Pick a team, or sign in as someone who is.`; }
    else if (t.role !== c.role || JSON.stringify(t.perms || {}) !== JSON.stringify(c.perms || {}) || t.team_name !== c.programName) await syncConfig(teamCfg(t));
  }
}
// Players join from the link on their own (or a parent's) phone, where the under-13 question is asked: the iPad
// takes staff invites only.
async function acceptInvite(token, role) {
  const tr = programTransport();
  if (!role) { const info = (await tr.inviteInfo(token) || [])[0]; if (!info) throw new Error("That invite code isn't valid any more. Ask for a new one."); role = info.role; }
  if (role === "player") throw new Error("A player invite is opened from its link on the player's own phone (or a parent's, for a player under 13), not on the team iPad.");
  const r = await tr.acceptInvite(token, false, null);
  if (!r || r.status !== "joined") throw new Error("That invite couldn't be accepted here.");
  await refreshTeams();
  const t = SYNC.teams.find((x) => x.team_id === r.team_id);
  if (t) await joinProgram(t);
}
// Staff and roster: invite by link (a code the person opens; tied to an email if one is given), change a coach's
// preset or its toggles, remove people. A player's invite names his pitcher record, and is marked when he's under 13
// so a parent has to say yes before anything of his is kept.
let staffRole = "caller";
function staffAdder() {
  const tr = () => transportFor(SYNC.cfg.programId);
  const refresh = () => tr().staff().then((x) => { SYNC.staff = x || []; render(); }).catch((e) => { SYNC.error = syncMessage(e); render(); });
  if (!SYNC.staff) { SYNC.staff = []; refresh(); }
  const act = (fn, done) => async () => { try { await fn(); SYNC.error = null; if (done) toast(done); } catch (e) { SYNC.error = syncMessage(e); } refresh(); };
  const pitcherName = (id) => (DB.pitchers.get(id) || {}).name || "a pitcher";
  const roles = PRESETS.filter(([v]) => v === "player" ? may("manage_roster") : may("manage_staff"));
  if (!roles.some(([v]) => v === staffRole) && roles.length) staffRole = roles[0][0];
  const link = SYNC.lastInvite;
  return [h("div", { class: "fields" },
    h("label", { class: "f", style: { flex: "0 1 170px" } }, "Invite as", h("select", { id: "sync-member-role", on: { change: (e) => { staffRole = e.target.value; render(); } } },
      roles.map(([v, l]) => h("option", { value: v, selected: staffRole === v ? true : null }, l)))),
    staffRole === "player" ? h("label", { class: "f", style: { flex: "1 1 160px" } }, "Which pitcher", h("select", { id: "sync-member-pitcher" },
      rosterPitchers().map((p) => h("option", { value: p.id }, p.name || "Pitcher")))) : null,
    h("label", { class: "f", style: { flex: "1 1 200px" } }, staffRole === "player" ? "Email (optional; a parent's for a player under 13)" : "Email (optional)", h("input", { id: "sync-member", type: "email", autocomplete: "off" })),
    staffRole === "player" ? h("label", { class: "f check" }, h("input", { id: "sync-member-u13", type: "checkbox" }), "Under 13") : null,
    h("button", { class: "btn", on: { click: async () => {
      const email = document.getElementById("sync-member").value.trim() || null;
      const pid = staffRole === "player" ? document.getElementById("sync-member-pitcher").value : null;
      const u13 = staffRole === "player" && document.getElementById("sync-member-u13").checked;
      await act(async () => { const token = await tr().invite(staffRole, pid, email, u13); SYNC.lastInvite = { token, role: staffRole, who: email || (pid ? pitcherName(pid) : roleName(staffRole)) }; },
        "Invite made: send the code below")();
      const el = document.getElementById("sync-member"); if (el) el.value = "";
    } } }, "Make invite")),
    link ? h("p", { class: "note", id: "sync-invite-code" }, `Invite for ${link.who} as ${roleName(link.role).toLowerCase()}: `,
      h("code", { class: "invite-code" }, SYNC.cfg.siteUrl ? `${SYNC.cfg.siteUrl.replace(/\/$/, "")}/join/${link.token}` : link.token),
      ". It works once and stops working if you cancel it.") : null,
    SYNC.staff.length ? h("div", { class: "tbl-wrap" }, h("table", { class: "log-tbl", "aria-label": "Staff" },
      h("tbody", {}, SYNC.staff.map((m) => {
        const who = m.email || "(anyone with the code)";
        const coach = !m.pending && m.role !== "player";
        const eff = effective(m.role, m.perms);
        return h("tr", {},
          h("td", {}, who),
          h("td", {}, m.pending && m.needs_approval ? "a parent's email a player gave: is it right?" : m.pending ? `invited as ${roleName(m.role).toLowerCase()}` : !coach || !may("manage_staff") ? roleName(m.role)
            : h("div", {},
              h("select", { "aria-label": `Preset for ${who}`, on: { change: (e) => act(() => tr().setMember(m.user_id, e.target.value, {}), "Preset changed")() } },
                PRESETS.filter(([v]) => v !== "player").map(([v, l]) => h("option", { value: v, selected: m.role === v ? true : null }, l))),
              h("details", { class: "adv", open: SYNC.advOpen.has(m.user_id) ? true : null, on: { toggle: (e) => { if (e.target.open) SYNC.advOpen.add(m.user_id); else SYNC.advOpen.delete(m.user_id); } } },
                h("summary", { "aria-label": `Advanced for ${who}` }, "Advanced"),
                TOGGLES.map(([k, l]) => h("label", { class: "f check" }, h("input", { type: "checkbox", "aria-label": `${l} for ${who}`, checked: eff[k] ? true : null, on: { change: (e) => {
                  const perms = Object.assign({}, m.perms || {});
                  if (e.target.checked === (PRESET_PERMS[m.role] || []).includes(k)) delete perms[k]; else perms[k] = e.target.checked;
                  act(() => tr().setMember(m.user_id, m.role, perms), `${l}: ${e.target.checked ? "on" : "off"} for ${who}`)();
                } } }), l))))),
          h("td", {}, (m.pitcher_ids || []).map(pitcherName).join(", ")),
          h("td", {}, m.pending && m.needs_approval && may("manage_roster") ? h("button", { class: "btn pill", on: { click: act(() => tr().approveInvite(m.token), `Approved: ${who} can now accept for the player`) } }, "Approve") : null,
            h("button", { class: "btn text", on: { click: m.pending ? act(() => tr().cancelInvite(m.token), "Invite cancelled") : act(() => tr().removeMember(m.user_id), `Removed ${who}`) } }, m.pending ? "Cancel invite" : "Remove")));
      })))) : null];
}
// D12: games charted twice (two iPads on one game). Checked whenever games arrive from elsewhere (a sync, a restore).
// The duplicate stays in the database (nothing is deleted) and is left out of learning; the coach can say they're
// different games, and that answer syncs like any other change.
async function dupGameIds() { return new Set((await DB.D.all("games")).filter((g) => g.dupOf).map((g) => g.id)); }
async function checkDuplicates() {
  if (!DB.ready) return [];
  const games = (await DB.D.all("games")).filter((g) => g.status === "final" || g.status === "live" || !g.status);
  const byGame = new Map();
  for (const g of games) byGame.set(g.id, await DB.D.byIndex("events", "gameId", g.id, true));   // left-out pitches too (D12)
  const pairs = PCDB.likelyDuplicates(games, (id) => byGame.get(id));
  const marked = [];
  for (const pr of pairs) {
    const d = games.find((g) => g.id === pr.drop), k = games.find((g) => g.id === pr.keep);
    if (k.dupOf === d.id) { k.dupOf = null; await dbPut("games", k); }   // never both: the kept game is not a copy
    if (d.dupOf === pr.keep) continue;
    d.dupOf = pr.keep; d.dupMatch = pr.match; await dbPut("games", d); marked.push(pr);
  }
  if (marked.length) {
    const pids = new Set();
    for (const pr of marked) for (const e of byGame.get(pr.drop) || []) if (e.pitcherId) pids.add(e.pitcherId);
    for (const id of pids) if (DB.pitchers.has(id)) await relearnPitcher(id);
    toast(`${marked.length} game${marked.length === 1 ? " was" : "s were"} charted on two iPads: counted once. See Data, Fix a pitch.`);
    pastFix.games = null;
  }
  return marked;
}
async function notDuplicate(gameId) {
  const d = await DB.D.get("games", gameId); if (!d || !d.dupOf) return;
  const other = d.dupOf; d.notDup = [...new Set((d.notDup || []).concat(other))]; d.dupOf = null; await dbPut("games", d);
  const pids = new Set((await DB.D.byIndex("events", "gameId", gameId)).map((e) => e.pitcherId).filter(Boolean));
  pastFix.games = null; await pastFixLoad();
  for (const id of pids) if (DB.pitchers.has(id)) await relearnPitcher(id);
  toast("Counted as separate games");
}
// what came down from other devices: refresh the in-memory copies the screens read. Mid-game, a change that reaches
// tonight's calls (another iPad re-graded a pitch, logged a check-in) is a new pack version, the same as an edit made
// here; and a call already showing for a pitch this pitcher no longer has is dropped so the next one is made fresh.
async function reloadFromDb() {
  const live = !!G().dbId, before = live ? JSON.stringify(packContents()) : null;
  const on = live ? pitcherDef() : null;
  // read everything first, then swap it in at once: the screens never see a half-loaded (empty) list
  const fresh = {};
  for (const store of ["teams", "pitchers", "catchers", "hitters", "learned"]) fresh[store] = await DB.D.all(store);
  const checkins = await DB.D.byIndex("checkins", "date", todayT());
  await migrateRosterV11(fresh.pitchers);   // a record synced from a device still on v1.0 arrives in four kinds
  for (const [store, map] of [["teams", DB.teams], ["pitchers", DB.pitchers], ["catchers", DB.catchers], ["hitters", DB.hitters]]) { map.clear(); for (const x of fresh[store]) map.set(x.id, x); }
  for (const x of fresh.learned) DB.models.set(x.id, x);
  for (const x of checkins) DB.checkins.set(x.pitcherId, x);
  // the pitcher in the game stays in the game: removed by another iPad mid-game, he's kept on this page until it ends
  if (on && on.id && !DB.pitchers.has(on.id)) DB.pitchers.set(on.id, on);
  S.setup.staffIds = (S.setup.staffIds || []).filter((id) => DB.pitchers.has(id));
  attachStaff();
  if (on && on.id) { const i = S.setup.staff.findIndex((p) => p.id === on.id); if (i >= 0) G().pitcher = i; }
  pastFix.games = null;
  await refreshOutings().catch(() => {}); logGames = null;
  const c = G().call;
  if (c && typeof arsenal === "function" && !arsenal().some((x) => x.name === c.pitch)) G().call = null;
  if (live && JSON.stringify(packContents()) !== before) packChanged("sync");
  await loadPlanned().catch(() => {});
  save(); render();
}
function syncPanel() {
  const c = SYNC.cfg || {};
  const field = (label, key, attrs = {}) => h("label", { class: "f", style: { flex: attrs.flex || "1 1 220px" } }, label,
    h("input", Object.assign({ value: c[key] || "", autocomplete: "off", spellcheck: "false", on: { change: (e) => syncConfig({ [key]: e.target.value.trim() }).then(render) } }, attrs)));
  const err = SYNC.error ? h("p", { class: "pstat change" }, SYNC.error) : null;
  const fresh = SYNC.bound ? h("button", { class: "btn text", on: { click: () => startFresh() } }, `Back up and start this iPad fresh`) : null;
  if (!c.url || !c.apiKey) return [h("div", { class: "fields" }, field("Project URL", "url", { placeholder: "https://xyzcompany.supabase.co" }), field("Publishable key", "apiKey", { placeholder: "sb_publishable_..." })),
    h("p", { class: "note" }, "From your Supabase project's API keys page: the Project URL and the publishable key (the older anon key works too). Both are safe to keep on the iPad; the server's row rules decide what each account can see. Never paste the secret or service_role key here.")];
  const signIn = h("div", { class: "fields" },
    h("label", { class: "f", style: { flex: "1 1 200px" } }, "Email", h("input", { id: "sync-email", type: "email", autocomplete: "username", value: c.email || "" })),
    h("label", { class: "f", style: { flex: "1 1 160px" } }, "Password", h("input", { id: "sync-pass", type: "password", autocomplete: "current-password" })),
    h("button", { class: "btn primary", on: { click: async () => {
      const email = document.getElementById("sync-email").value.trim(), pw = document.getElementById("sync-pass").value;
      try {
        SYNC.authSession = await SYNC.auth.signIn(email, pw); await syncConfig({ email }); SYNC.error = null; SYNC.teams = SYNC.invites = SYNC.staff = null;
        await refreshTeams();
        if (SYNC.cfg.programId) await syncNow(true);
      } catch (e) { SYNC.error = syncMessage(e); }
      render();
    } } }, "Sign in"));
  const signedIn = SYNC.authSession;
  if (!signedIn) return [c.programId ? h("p", { class: "note" }, `${c.programName || "Team"}: sign in to sync.`) : null, signIn, err];
  const signOut = h("button", { class: "btn text", on: { click: async () => { await SYNC.auth.signOut(); SYNC.authSession = null; SYNC.staff = SYNC.teams = SYNC.invites = SYNC.lastInvite = null; await syncConfig({ programId: null }); render(); } } }, "Sign out");
  if (!c.programId) {
    if (!SYNC.teams) { SYNC.teams = []; SYNC.invites = []; refreshTeams().then(render).catch((e) => { SYNC.error = syncMessage(e); render(); }); }
    const go = (t) => joinProgram(t).catch((e) => { SYNC.error = syncMessage(e); }).then(render);
    const take = (token, role) => acceptInvite(token, role).catch((e) => { SYNC.error = syncMessage(e); }).then(render);
    return [h("p", { class: "note" }, `Signed in as ${signedIn.email || "you"}. ${SYNC.bound ? `This iPad holds the data for ${SYNC.bound.programName || "a team"}.` : "Pick your team, accept an invite, or start a team (you're its head coach)."}`),
      (SYNC.invites || []).length ? h("div", { class: "staffpick" }, SYNC.invites.map((i) => h("div", { class: "choice" },
        h("b", {}, i.team_name), h("span", {}, `invited as ${roleName(i.role).toLowerCase()}`),
        h("button", { class: "btn pill primary", on: { click: () => take(i.token, i.role) } }, "Accept"),
        h("button", { class: "btn text", on: { click: async () => { await programTransport().declineInvite(i.token).catch(() => {}); SYNC.teams = null; render(); } } }, "Decline")))) : null,
      h("div", { class: "staffpick" }, (SYNC.teams || []).map((t) => h("button", { class: "choice", disabled: otherProgram(t.team_id) || !t.role ? true : null, on: { click: () => go(t) } },
        h("b", {}, t.team_name), h("span", {}, `${t.role ? roleName(t.role) : "owner (not on the staff)"}${t.active ? "" : " · not switched on yet"}`)))),
      h("div", { class: "fields" },
        h("label", { class: "f", style: { flex: "1 1 260px" } }, "Have an invite code or link?", h("input", { id: "sync-code", autocomplete: "off", spellcheck: "false" })),
        h("button", { class: "btn", on: { click: () => { const tok = inviteToken(document.getElementById("sync-code").value); if (!tok) { SYNC.error = "That doesn't look like an invite code."; render(); return; } take(tok); } } }, "Join")),
      h("div", { class: "row-acts" }, SYNC.bound ? null : h("button", { class: "btn", on: { click: () => startProgram().catch((e) => { SYNC.error = syncMessage(e); }).then(render) } }, "Start a team"), signOut, fresh),
      err];
  }
  const pend = SYNC.pending ? Object.values(SYNC.pending).reduce((a, n) => a + n, 0) : 0;
  const last = SYNC.last ? new Date(SYNC.last.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  const rej = SYNC.last && SYNC.last.r.push.rejected.filter((x) => x.reason !== "team_locked").length;
  const held = SYNC.last && SYNC.last.r.pull.held;
  return [h("p", { class: "note" }, `${c.programName || "Team"} as ${roleName(c.role).toLowerCase()}, signed in as ${signedIn.email || "you"}. ${pend ? `${pend} change${pend === 1 ? "" : "s"} waiting to go up.` : "Nothing waiting to go up."}${last ? ` Last synced ${last}.` : ""}`),
    SYNC.locked ? h("p", { class: "pstat watch", id: "sync-locked" }, LOCKED) : null,
    rej ? h("p", { class: "pstat watch" }, `${rej} change${rej === 1 ? " wasn't" : "s weren't"} taken by the server (not allowed for your account, or a broken record). ${rej === 1 ? "It stays" : "They stay"} on this iPad and ${rej === 1 ? "is" : "are"} tried again at every sync, so a coach who may make ${rej === 1 ? "it" : "them"} can send ${rej === 1 ? "it" : "them"} from here.`) : null,
    held ? h("p", { class: "note" }, "Some changes are still being saved on the server; they come down at the next sync.") : null,
    err,
    may("manage_staff") || may("manage_roster") ? staffAdder() : null,
    h("div", { class: "row-acts" }, h("button", { class: "btn primary", disabled: SYNC.busy ? true : null, on: { click: () => syncNow() } }, SYNC.busy ? "Syncing…" : "Sync now"), signOut, fresh)];
}

// ---------------------------------------------------------------- games set up on the website (PLAN_portal_2026-11-12)
// The portal saves a games record with status "planned"; its "Start on this device" opens
//   /app/game/?game=<id>&team=<team>&name=<team name>#pq=<single-use sign-in>
// Here: sign in with the hand-off, join or sync the team, then start the game on that very record. A game in progress
// stays on the one device calling it: a game live on another device is refused, and this device's claim goes up as
// soon as the game starts, so another device (and the website) can tell.
async function openFromPortal() {
  if (typeof location === "undefined" || !DB.D) return;
  const q = new URLSearchParams(location.search), hash = new URLSearchParams((location.hash || "").slice(1));
  let open = null;
  if (q.get("game") || hash.get("pq")) open = { gameId: q.get("game"), teamId: q.get("team"), teamName: q.get("name") || "this team", hand: hash.get("pq") || null, at: Date.now() };
  else { try { const c = JSON.parse(sessionStorage.getItem("pq-open") || "null"); if (c && Date.now() - c.at < 120000) open = c; } catch (e) {} }
  if (!open) return;
  // the sign-in link works once: it never stays in the address bar or the history. Until it's used it's kept for this
  // tab only, so a reload (the offline worker taking control of a first visit reloads the page) carries on with it.
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  const keep = () => { try { sessionStorage.setItem("pq-open", JSON.stringify(open)); } catch (e) {} };
  keep();
  // on a first visit, wait for the offline worker to take control before using the one-time sign-in: that reloads
  // the page, and the reloaded page carries on from what's kept above
  try {
    if (navigator.serviceWorker && !navigator.serviceWorker.controller && window.PC_CONFIG_URL) {
      await Promise.race([navigator.serviceWorker.ready.then(() => new Promise((r) => { if (navigator.serviceWorker.controller) r(); else navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }); })), new Promise((r) => setTimeout(r, 5000))]);
      await new Promise((r) => setTimeout(r, 400));   // a reload, if one is coming, starts here
    }
  } catch (e) {}
  try { await openPlannedFrom(open.gameId, open.teamId, open.teamName, open.hand, () => { open.hand = null; keep(); }); }
  finally { try { sessionStorage.removeItem("pq-open"); } catch (e) {} }
}
async function openPlannedFrom(gameId, teamId, teamName, hand, used) {
  if (!/^[a-z]{3}_[0-9a-z]{10,40}$/.test(gameId || "") || !/^[0-9a-f-]{36}$/.test(teamId || "")) { PORTAL.msg = "That link doesn't name a game. Open it again from Game Day on the website."; return; }
  const g = G();
  if (g.dbId === gameId) { S.view = "live"; return; }   // already calling it here (a reload)
  if (g.dbId) { PORTAL.msg = "A game is in progress on this device. End it before starting another one here."; return; }
  if (!SYNC.cfg || !SYNC.auth) { PORTAL.msg = "This device can't reach PitchIQ yet. Connect to Wi-Fi and open the game again from the website."; return; }
  if (navigator.onLine === false) { PORTAL.msg = "No signal: open the game from the website once this device is online, or start it from Setup."; return; }
  if (hand) {
    const was = SYNC.authSession;
    const s = await SYNC.auth.handoff(hand).catch(() => null);
    if (used) used();   // spent either way: a reload from here on never tries it again
    if (s) {
      SYNC.authSession = s;
      if (was && was.userId && was.userId !== s.userId) { SYNC.teams = SYNC.invites = SYNC.staff = null; }
      await syncConfig({ email: s.email });
    } else if (!SYNC.authSession) { PORTAL.msg = "The sign-in from the website has expired. Open the game again from Game Day, or sign in under Setup."; return; }
  }
  if (!SYNC.authSession) { PORTAL.msg = `Sign in under Setup (Sync), then open the game again from the website.`; return; }
  await refreshTeams();
  const t = (SYNC.teams || []).find((x) => x.team_id === teamId && x.role);
  if (!t) { PORTAL.msg = `This account isn't on ${teamName}'s staff on this device.`; return; }
  if (!t.perms || !t.perms.call_games) { PORTAL.msg = `Your role on ${t.team_name} can't call games.`; return; }
  if (!SYNC.cfg.programId || SYNC.cfg.programId !== teamId) await joinProgram(t);   // refuses if this device holds another team
  else if (SYNC.sync) await syncNow(true);
  const rec = await DB.D.get("games", gameId);
  if (!rec || rec.deletedAt) { PORTAL.msg = `That game isn't on ${t.team_name}'s schedule any more.`; return; }
  await startPlanned(rec);
  toast(`Game started. First pitch is up.`);
}
// today's planned games on this device, newest plan first (offered by prepNotice)
async function loadPlanned() {
  if (!DB.D) return;
  const today = todayT();
  PORTAL.today = (await DB.D.byIndex("games", "status", "planned")).filter((x) => !x.deletedAt && x.date === today)
    .sort((a, b) => (a.time || "").localeCompare(b.time || "") || (b.updatedAt || 0) - (a.updatedAt || 0));
}
async function startPlanned(rec) {
  const g = G();
  if (g.dbId === rec.id) { S.view = "live"; save(); render(); return; }
  if (g.dbId) throw new Error("A game is in progress on this device. End it before starting another one here.");
  if (rec.status === "final") throw new Error("That game is over.");
  if ((rec.status === "live" || rec.status === "suspended") && rec.deviceId !== (DB.deviceId || null))
    throw new Error("This game is being called on another device. A game in progress stays on the one device calling it.");
  const staffIds = (rec.staffIds || []).filter((id) => DB.pitchers.has(id));
  if (!staffIds.length) throw new Error("None of this plan's pitchers are on this device's roster yet. Sync under Setup, then try again.");
  const st = S.setup, s = rec.setup || {};
  if (rec.level) st.level = rec.level;
  st.inputs = [1, 2, 3, 4].includes(+rec.inputs) ? +rec.inputs : st.inputs;
  st.logLoc = !!rec.logLoc; st.radar = !!rec.radar;
  st.home = s.home === true || s.home === false ? s.home : null;
  st.innings = s.innings || null; st.extrasRunner = !!s.extrasRunner; st.umpSeed = s.umpSeed || "normal";
  st.opponentId = rec.opponentId && DB.teams.has(rec.opponentId) ? rec.opponentId : null;
  st.catcherId = rec.catcherId && DB.catchers.has(rec.catcherId) ? rec.catcherId : null;
  st.staffIds = staffIds;   // the starter is first: he's the one on the mound
  attachStaff();
  st.lineup = (rec.lineup || []).slice(0, 12).map((b) => ({ hitterId: b.hitterId && DB.hitters.has(b.hitterId) ? b.hitterId : null, name: b.name || "", hand: b.hand === "L" || b.hand === "S" ? b.hand : "R" }));
  while (st.lineup.length < 9) st.lineup.push({ hitterId: null, name: "", hand: "R" });
  S.game = newGame(); S.sample = false; undo = [];
  G().pitcher = 0;
  // start the game on the planned record itself (ensureGameRecord sees dbId and makes no new one)
  G().dbId = rec.id;
  const live = PCDB.moveGame(Object.assign(rec, { startedAt: Date.now(), deviceId: DB.deviceId || null }), rec.status === "planned" ? "live" : rec.status);
  await dbPut("games", live);
  makePack("start");
  PORTAL.today = PORTAL.today.filter((x) => x.id !== rec.id); PORTAL.msg = null;
  S.view = "live"; save();
  await refreshLineupMemory().catch(() => {});
  // claim it now: the record goes up as live on this device (the pitches go up when the game ends, as always)
  if (SYNC.sync && SYNC.authSession && navigator.onLine !== false) await SYNC.sync.push().catch((e) => console.warn("claim", e));
  render();
}
