// ------------------------------------------------------------------ database glue
// The database is the source of truth for the roster, opponents, games, every pitch and what's been learned.
// Reads during a game come from an in-memory copy (the engine needs answers instantly); writes go straight through.
const DB = { D: null, ready: false, failed: null, teams: new Map(), pitchers: new Map(), catchers: new Map(), hitters: new Map(),
  checkins: new Map(), models: new Map(), sessions: new Map(), counts: new Map() };
const FATIGUE = { hs: 60, travel: 60, college_d3: 75, college_d1: 80, mlb: 90 };   // the engine's fatigue points (engine_data.json, LEVEL)
const LOCZ = ["heart", "edge", "off", "noncomp"];
let pendingLoc = null;
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
const todayCheckin = (pid) => { const c = DB.checkins.get(pid); return c && c.date === PCDB.today() ? c : null; };
// what's been learned (learner v2): per pitcher { profile, served }, per hitter the hitter model
const pModel = (pid) => DB.models.get("v2:" + pid);
const hModel = (hid) => DB.models.get("h2:" + hid);

async function boot() {
  if (typeof PCDB === "undefined") return;
  try {
    const D = await PCDB.open();
    DB.D = D;
    const mig = await PCDB.migrateLegacy(D, S);
    for (const [store, map] of [["teams", DB.teams], ["pitchers", DB.pitchers], ["catchers", DB.catchers], ["hitters", DB.hitters]]) for (const x of await D.all(store)) map.set(x.id, x);
    for (const x of await D.all("learned")) DB.models.set(x.id, x);
    for (const x of await D.byIndex("checkins", "date", PCDB.today())) DB.checkins.set(x.pitcherId, x);
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
    save(); render();
    // pitch counts per pitcher for the roster cards, and hitter memory for tonight's lineup, without holding up the screen
    setTimeout(async () => {
      for (const p of DB.pitchers.values()) DB.counts.set(p.id, (await D.byIndex("events", "pitcherId", p.id)).filter((e) => !e.legacy).length);
      for (const p of S.setup.staff) if (!pModel(p.id) && DB.counts.get(p.id)) await relearnPitcher(p.id);
      await refreshLineupMemory();
      if (S.view === "roster") render();
    }, 50);
  } catch (e) {
    DB.failed = e; console.warn("Database unavailable, running without it:", e && e.message); render();
  }
}

// today's staff: the roster records themselves, so edits on the Roster screen show up in the game right away
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
    if (e && m && !Object.keys(e.seen).length) { e.damage = PCLearner.seedDamage(m); if (i === slotIdx()) redo = true; }
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
async function relearnPitcher(pid) {
  const p = DB.pitchers.get(pid); if (!p || !DB.D) return null;
  const evs = (await DB.D.byIndex("events", "pitcherId", pid)).filter((e) => !e.legacy && !e.deletedAt);
  DB.counts.set(pid, evs.length);
  const was = pModel(pid);
  let r;
  try { r = await learnCall({ type: "pitcher", pitcher: p, events: evs, level: levelOf(), prev: was ? was.served : null }); }
  catch (e) { console.error(e); toast("Couldn't learn from his games just now; the calls keep using what they had"); return was || null; }
  const m = { id: "v2:" + pid, pitcherId: pid, profile: r.profile, served: r.served, at: Date.now() };
  DB.models.set(m.id, await dbPut("learned", m));
  return m;
}
// a re-grade, an accepted flag or the learning switch takes effect now, without waiting for a game (no step is taken)
function reserve(p) {
  const m = pModel(p.id); if (!m || !m.profile) return;
  m.served = PCLearner.finishServe(E, PCLearner.serve(m.profile, p, m.served), p, levelOf());
  dbPut("learned", m);
}
async function relearnHitter(hid) {
  const x = DB.hitters.get(hid); if (!x || !DB.D) return null;
  const evs = (await DB.D.byIndex("events", "hitterId", hid)).filter((e) => !e.deletedAt);
  const team = DB.teams.get(x.teamId);
  let r;
  try { r = await learnCall({ type: "hitter", hitter: x, events: evs, level: (team && team.level) || levelOf() }); } catch (e) { console.error(e); return hModel(hid) || null; }
  const m = Object.assign({ id: "h2:" + hid }, r.model);
  DB.models.set(m.id, await dbPut("learned", m));
  return m;
}

// one games record per game, made when the first pitch is logged. If the database isn't open yet (it opens a moment
// after the page, or failed), the record and its pitches wait in the saved state and are written once it opens:
// a pitch is never dropped, because the learner replays games in order and a hole would break the replay.
function ensureGameRecord() {
  const g = G();
  if (g.dbId) return g.dbId;
  g.dbId = PCDB.uid("gam");
  const rec = { id: g.dbId, date: PCDB.today(), level: S.setup.level, inputs: S.setup.inputs, logLoc: !!S.setup.logLoc, opponentId: S.setup.opponentId || null,
    catcherId: S.setup.catcherId || null, staffIds: (S.setup.staffIds || []).slice(), lineup: S.setup.lineup.map((b) => ({ hitterId: b.hitterId || null, name: b.name, hand: b.hand })),
    status: "live", startedAt: Date.now(), deviceId: DB.deviceId || null };
  if (DB.ready) dbPut("games", rec); else (S.queue = S.queue || { games: [], events: [] }).games.push(rec);
  return g.dbId;
}
function logEvent(ev) {
  ev.id = PCDB.uid("evt");
  if (!DB.ready) { (S.queue = S.queue || { games: [], events: [] }).events.push(ev); return ev.id; }
  DB.D.put("events", ev).catch(dbErr);
  DB.counts.set(ev.pitcherId, (DB.counts.get(ev.pitcherId) || 0) + 1);
  return ev.id;
}
async function flushQueued() {
  const q = S.queue; if (!q || (!q.games.length && !q.events.length)) return;
  for (const r of q.games) { r.deviceId = r.deviceId || DB.deviceId; await dbPut("games", r); }
  for (const ev of q.events) { ev.deviceId = ev.deviceId || DB.deviceId; await DB.D.put("events", ev).catch(dbErr); DB.counts.set(ev.pitcherId, (DB.counts.get(ev.pitcherId) || 0) + 1); }
  const n = q.events.length; S.queue = { games: [], events: [] }; save();
  if (n) toast(`Saved ${n} pitch${n === 1 ? "" : "es"} charted before the database opened`);
}
// an edit to a logged pitch after the fact (where it ended up, contact, a cross-up, a wild pitch). The original values
// are kept in the record's edit history; the game's flow (count, outs, runners) isn't changed, use Undo for that.
async function editEvent(evId, changes) {
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
  const keep = new Set(after.evIds || []);
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
  if (!DB.ready) { const r = S.queue && S.queue.games.find((x) => x.id === g.dbId); if (r) Object.assign(r, { status: "final", endedAt: Date.now(), us: g.us, them: g.them, innings: g.inning, pitches: g.pitchNo, completeness: comp }); save(); return comp; }
  const rec = await DB.D.get("games", g.dbId);
  if (rec) await dbPut("games", Object.assign(rec, { status: "final", endedAt: Date.now(), us: g.us, them: g.them, innings: g.inning, pitches: g.pitchNo, completeness: comp }));
  // the flywheel: refit everyone who pitched and every hitter he faced
  const pids = new Set(), hids = new Set();
  for (const e of g.log) { const pid = e.pid || (S.setup.staff[e.p ?? 0] || {}).id; if (pid && DB.pitchers.has(pid)) pids.add(pid); const b = S.setup.lineup[e.slot]; if (b && b.hitterId) hids.add(b.hitterId); }
  for (const id of pids) await relearnPitcher(id);
  for (const id of hids) await relearnHitter(id);
  if (pids.size) toast(`Learned from the game: ${[...pids].map((id) => DB.pitchers.get(id).name).join(", ")}`);
  return comp;
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
            h("span", { class: "pc-mid" }, (x.pitches || []).filter((d) => d.active !== false).map((d) => chip(d.kind))),
            h("span", { class: "pc-sub" }, `${x.hand === "L" ? "Lefty" : "Righty"} ${x.role === "RP" ? "reliever" : "starter"}, ${n ? `${n} pitches charted` : "nothing charted yet"}${ci ? ", checked in" : ""}`));
        })),
        h("div", { class: "row-acts" }, h("button", { class: "btn", on: { click: async () => {
          const np = await dbPut("pitchers", PCDB.newPitcher(ourTeam().id, { name: `Pitcher ${DB.pitchers.size + 1}` })); DB.pitchers.set(np.id, np); rosterSel = np.id; render();
        } } }, "Add a pitcher"))),
      catchersPanel()),
    p ? h("div", { class: "span-8 col" }, profilePanel(p), arsenalEditor(p), checkinPanel(p)) : null,
    p ? h("div", { class: "span-12 col" }, learnedPanel(p), importPanel(p)) : null);
}

function savePitcher(p, re = true) { reserve(p); dbPut("pitchers", p); G().call = null; save(); if (re) render(); }

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
      f("Fatigue point", "pitchLimit", { type: "number", min: 20, max: 140, inputmode: "numeric", placeholder: String(FATIGUE[S.setup.level]) }, "0 1 130px")),
    h("label", { class: "f" }, "Notes", h("input", { value: p.notes || "", placeholder: "Anything a coach should know", on: { change: (e) => { p.notes = e.target.value; savePitcher(p, false); } } })),
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
  else S.setup.staffIds = ids.concat(pid);
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
  d.gradeLog.push({ ts: now, command: +d.command, grade: +d.grade, sawLearned: !!(x && x.n) });
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
        lab("Type", h("div", { class: "typ" }, chip(d.kind), h("select", { "aria-label": "Pitch type", on: { change: (e) => {
          const t = PCDB.PITCH_TYPES[e.target.value]; d.type = e.target.value; d.kind = t.kind; d.shape = t.shape; savePitcher(p); } } },
          PTYPES.map((t) => h("option", { value: t, selected: t === (d.type || PCDB.DEFAULT_TYPE[d.kind]) ? true : null }, t)))), "a-type"),
        lab("His name for it", h("input", { value: d.name, on: { change: (e) => {
          const nn = e.target.value.trim() || d.type || KINDS[d.kind];
          if (p.pitches.some((x) => x !== d && x.name === nn)) { toast("He already has a pitch with that name"); render(); return; }
          const si = S.setup.staff.indexOf(p); if (si >= 0) renamePitch(si, d.name, nn);
          d.name = nn; savePitcher(p); } } }), "a-name"),
        lab("Stuff", num(d, "grade", 0.5, 1, 5, "", "Stuff, 1 to 5", "100%"), "a-n"),
        lab("Command", num(d, "command", 0.5, 1, 5, "", "Command, 1 to 5", "100%"), "a-n"),
        lab("Usual feel", h("div", { class: "feel" }, h("input", { type: "range", min: 0.3, max: 0.95, step: 0.05, value: d.feel, "aria-label": "Usual bullpen feel",
          on: { input: (e) => { d.feel = +e.target.value; out.textContent = (+d.feel).toFixed(2); }, change: () => savePitcher(p, false) } }), out), "a-feel"),
        h("button", { class: "x", "aria-label": `Remove ${d.name}`, on: { click: () => { if (p.pitches.length > 1) { p.pitches.splice(i, 1); savePitcher(p); } } } }, "×")),
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
    h("p", { class: "note" }, "Horizontal break is positive toward his arm side. The engine models four families (fastball, slider, curve, change); cutters and sinkers are fastballs with their own shape, sweepers are sliders, splitters are changeups."));
}

function checkinPanel(p) {
  const prev = todayCheckin(p.id);
  const c = prev ? JSON.parse(JSON.stringify(prev)) : { pitcherId: p.id, date: PCDB.today(), arm: 4, sleep: "", conf: {} };
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
        return h("div", { class: `ci-row k-${d.kind}` }, chip(d.kind), h("span", { class: "nm" }, d.name),
          h("input", { type: "range", min: 1, max: 10, step: 1, value: v === "" ? Math.round((d.feel - 0.3) / 0.65 * 9 + 1) : v, "aria-label": `${d.name} confidence today`,
            on: { input: (e) => { c.conf[d.id] = +e.target.value; out.textContent = e.target.value; dirty.v = true; } } }), out);
      })),
    h("div", { class: "row-acts" },
      h("button", { class: "btn primary", on: { click: async () => {
        const rec = await dbPut("checkins", Object.assign(prev || {}, c)); DB.checkins.set(p.id, rec); G().call = null; save(); render(); toast(`${p.name}'s check-in saved. His starting feel uses it today.`);
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
    p.accepted = Object.assign({}, p.accepted, { [f.pitchId]: Object.assign({}, (p.accepted || {})[f.pitchId], { [f.dim]: { ts: Date.now(), from: sv ? sv[f.dim] : +f.coach } }) });
    p.flagState = Object.assign({}, p.flagState, { [key]: { how, ts: Date.now() } });
    toast(`Accepted: the calls move to ${fmt(f.learned)} over his next 3 games`);
  } else {
    const games = m && m.profile && m.profile.games ? m.profile.games.length : 0;
    p.flagState = Object.assign({}, p.flagState, { [key]: how === "keep" ? { how, learned: f.learned, ts: Date.now() } : { how, untilGames: games + 5, ts: Date.now() } });
    toast(how === "keep" ? "Kept your grade. It'll only ask again if what it learns moves another half point." : "It'll ask again in 5 games");
  }
  savePitcher(p);
}
function flagShown(p, f, m) {
  if (f.type !== "grade") return true;
  const st = (p.flagState || {})[`${f.pitchId}|${f.dim}`];
  if (!st) return true;
  if (st.how === "accept") return false;
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
    if (!x || !x.n) return h("tr", {}, h("td", {}, h("span", { class: "pname" }, chip(d.kind), d.name)), h("td", { colspan: "4", class: "muted" }, "No charted pitches yet"));
    const cell = (dim) => {
      const ent = +d[dim], fit = x.talent[dim], sd = x.sd[dim], use = s && s.learned && on ? s[dim] : ent;
      const enough = dim === "grade" ? x.n >= 150 : x.nLoc >= 60;    // below this, show it as early
      return h("td", {}, h("div", { class: "lcell" }, bar(ent, fit, use),
        h("span", {}, `${fmt(ent)} → `, h("b", {}, fmt(Math.round(fit * 10) / 10)), h("small", { class: "muted" }, ` ±${sd.toFixed(1)}`)),
        h("small", { class: "muted" }, enough ? `calls use ${fmt(use)}` : `early: calls use ${fmt(use)}`)));
    };
    const sc = x.score;
    return h("tr", { class: `k-${d.kind}` },
      h("td", {}, h("span", { class: "pname" }, chip(d.kind), d.name)),
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
    h("div", { class: "tbl-wrap" }, h("table", { class: "ltable" },
      h("thead", {}, h("tr", {}, h("th", {}, "Pitch"), h("th", {}, "Stuff: yours → learned"), h("th", {}, "Command: yours → learned"), h("th", { class: "num" }, "Pitches"), h("th", {}, "Scoreboard"))),
      h("tbody", {}, (p.pitches || []).filter((d) => d.active !== false).map(row)))),
    h("p", { class: "note" }, n
      ? `Each pitch is relearned after every game from what happened against what the engine expected, starting from your grades. ${on ? "The calls move toward what's learned at most 0.15 a game and never more than 1.0 from your grade unless you accept a flag." : "Learning is switched off for him: the calls use your grades."} Only the engine's own calls teach it, not yours or re-calls after a shake-off. Command needs "where it ended up" logged (Setup).`
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
      if (t.releaseOffset) d.relOff = t.releaseOffset;
    }
    savePitcher(p, false);
    const sess = await dbPut("sessions", { pitcherId: p.id, date: PCDB.today(), source: P.r.source, file: P.file, n: P.r.n, byType: P.r.byType, rows: P.r.rows });
    DB.sessions.set(p.id, [sess].concat(DB.sessions.get(p.id) || []));
    importPreview = null; render(); toast(`Applied ${P.r.n} pitches to ${p.name}'s arsenal`);
  };
  return h("section", { class: "panel glass", "aria-label": "TrackMan and Rapsodo" },
    h("div", { class: "panel-head" }, h("h2", {}, "TrackMan or Rapsodo"),
      h("label", { class: "btn pill file" }, "Load a session file", h("input", { type: "file", accept: ".csv,text/csv,.txt", on: { change: (e) => {
        const f = e.target.files[0]; if (!f) return;
        f.text().then((txt) => { try { importPreview = { pid: p.id, file: f.name, r: PCImport.parse(txt, { hand: p.hand, pitcherName: p.name }) }; } catch (err) { importPreview = { pid: p.id, file: f.name, error: err.message }; } render(); });
      } } }))),
    P && P.error ? h("p", { class: "pstat change" }, P.error) : null,
    P && P.r ? h("div", { class: "imp" },
      h("p", { class: "note" }, `${P.file}: ${P.r.n} pitches, read as ${P.r.source}.`),
      h("div", { class: "tbl-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, ["Pitch", "Thrown", "Velo", "Top", "V break", "H break", "Spin", "In zone", "Command hint"].map((t, i) => h("th", { class: i ? "num" : "" }, t)))),
        h("tbody", {}, P.r.byType.map((t) => h("tr", { class: `k-${t.kind}` },
          h("td", {}, h("span", { class: "pname" }, chip(t.kind), t.type)), h("td", { class: "num" }, String(t.n)), h("td", { class: "num" }, fmt(t.velo)), h("td", { class: "num" }, fmt(t.veloMax)),
          h("td", { class: "num" }, fmt(t.ivb)), h("td", { class: "num" }, fmt(t.hb)), h("td", { class: "num" }, t.spin ?? "–"),
          h("td", { class: "num" }, t.zonePct === null ? "–" : pct(t.zonePct)), h("td", { class: "num" }, t.commandHint ?? "–")))))),
      P.r.warnings.length ? h("ul", { class: "warns" }, P.r.warnings.map((w) => h("li", {}, w))) : null,
      P.r.unused.length ? h("p", { class: "note" }, `Columns not used: ${P.r.unused.slice(0, 12).join(", ")}${P.r.unused.length > 12 ? "…" : ""}`) : null,
      h("div", { class: "row-acts" }, h("button", { class: "btn primary", on: { click: apply } }, "Apply velo, break and spin to his arsenal"), h("button", { class: "btn", on: { click: () => { importPreview = null; render(); } } }, "Cancel")),
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
      h("div", { class: "seg small", role: "group", "aria-label": "Blocking, 1 to 5" }, [1, 2, 3, 4, 5].map((v) => h("button", { "aria-pressed": String(+c.block === v), on: { click: () => { c.block = v; dbPut("catchers", c); G().call = null; render(); } } }, String(v)))),
      h("button", { class: "x", "aria-label": `Remove ${c.name}`, on: { click: async () => { await DB.D.del("catchers", c.id); DB.catchers.delete(c.id); if (S.setup.catcherId === c.id) S.setup.catcherId = null; save(); render(); } } }, "×"))))
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
            if (ex) { Object.assign(ex, { number: x.number || ex.number, bats: x.bats, pos: x.pos || ex.pos, stats: Object.assign({}, ex.stats, x.stats) }); await dbPut("hitters", ex); updated++; }
            else { const nh = await dbPut("hitters", PCDB.newHitter(t.id, x)); DB.hitters.set(nh.id, nh); added++; }
          }
          render(); toast(`${added} hitter${added === 1 ? "" : "s"} added, ${updated} updated`);
        });
      } } })),
      h("button", { class: "btn text", on: { click: async () => {
        if (!confirmTwice(t.id)) { toast(`Tap again to remove ${t.name}. Charted pitches against them stay.`); return; }
        await DB.D.del("teams", t.id); DB.teams.delete(t.id); if (S.setup.opponentId === t.id) useOpponent(null); teamSel = null; render();
      } } }, "Remove opponent")),
    h("p", { class: "note" }, "Import a sheet with Name, #, Bats, PA, AVG, OBP, SLG, K or K%, BB or BB% columns (any order). Hitters already here are updated by name."));
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
        h("td", { class: "wrapcell" }, know(x)),
        h("td", {}, h("button", { class: "x", "aria-label": `Remove ${x.name}`, on: { click: async () => { await DB.D.del("hitters", x.id); DB.hitters.delete(x.id); render(); } } }, "×"))))
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

// ---------------------------------------------------------------- backup
async function backup() {
  if (!DB.D) return;
  const data = await DB.D.exportAll();
  data.appState = { setup: Object.assign({}, S.setup, { staff: undefined }) };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `pitch-caller-backup-${PCDB.today()}.json`;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast(`Backup saved: ${data.stores.events.length} pitches, ${data.stores.pitchers.length} pitchers`);
}
async function restore(e) {
  const f = e.target.files[0]; if (!f || !DB.D) return;
  try {
    const st = await DB.D.importAll(JSON.parse(await f.text()));
    toast(`Restored: ${Object.entries(st).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing newer than what's here"}`);
    setTimeout(() => location.reload(), 900);
  } catch (err) { toast(err.message || "That file couldn't be read"); }
}
