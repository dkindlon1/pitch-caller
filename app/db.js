/*
 * Pitch Caller database: IndexedDB on the device, built to sync later.
 *
 * Every record has a string id (random, unique across devices), createdAt, updatedAt, and deletedAt for soft deletes,
 * so a future sync (Supabase or anything else) can upsert by id and resolve conflicts by updatedAt.
 *
 * Stores
 *   teams      our team and opponents                          index: isOurs
 *   pitchers   our pitchers, with their arsenal inline           index: teamId
 *   catchers   our catchers (blocking grade feeds the engine)    index: teamId
 *   hitters    opponent hitters with season stats                index: teamId
 *   checkins   a pitcher's pre-game check-in                     index: pitcherId, date
 *   sessions   TrackMan / Rapsodo bullpen sessions               index: pitcherId
 *   games      one per game charted                              index: date, opponentId
 *   events     one per pitch thrown, with what the engine predicted for it   index: gameId, pitcherId, hitterId
 *   learned    the learning models, one per pitcher and one per hitter       (id "p:<pitcherId>" / "h:<hitterId>")
 *   meta       schema version, settings
 *
 * Works in the browser (window.PCDB) and in Node with fake-indexeddb (module.exports) for tests.
 */
(function (root) {
  "use strict";
  const NAME = "pitchcaller", VERSION = 1;
  const STORES = {
    teams: ["isOurs"], pitchers: ["teamId"], catchers: ["teamId"], hitters: ["teamId"],
    checkins: ["pitcherId", "date"], sessions: ["pitcherId"], games: ["date", "opponentId"],
    events: ["gameId", "pitcherId", "hitterId"], learned: [], meta: [],
  };

  function uid(prefix) {
    const c = (typeof crypto !== "undefined" && crypto.getRandomValues) ? crypto : null;
    let s = "";
    if (c) { const a = new Uint8Array(10); c.getRandomValues(a); for (const x of a) s += x.toString(36).padStart(2, "0").slice(-2); }
    else for (let i = 0; i < 20; i++) s += Math.floor(Math.random() * 36).toString(36);
    return (prefix ? prefix + "_" : "") + Date.now().toString(36) + s;
  }
  const now = () => Date.now();
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error("transaction aborted")); });

  async function open(opts = {}) {
    const factory = opts.indexedDB || (typeof indexedDB !== "undefined" ? indexedDB : null);
    if (!factory) throw new Error("This browser has no IndexedDB");
    const name = opts.name || NAME;
    const r = factory.open(name, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const [store, idx] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(store)) continue;
        const os = db.createObjectStore(store, { keyPath: "id" });
        for (const i of idx) os.createIndex(i, i, { unique: false });
      }
    };
    const db = await req(r);
    return api(db, factory, name);
  }

  function api(db, factory, name) {
    const os = (store, mode = "readonly") => db.transaction(store, mode).objectStore(store);
    const live = (x) => x && !x.deletedAt;

    async function get(store, id) { const x = await req(os(store).get(id)); return live(x) ? x : null; }
    async function all(store, withDeleted = false) { const xs = await req(os(store).getAll()); return withDeleted ? xs : xs.filter(live); }
    async function byIndex(store, index, value) { const xs = await req(os(store).index(index).getAll(value)); return xs.filter(live); }
    function stamp(store, o) {
      const t = now();
      const x = Object.assign({}, o);
      if (!x.id) x.id = uid(store.slice(0, 3));
      if (!x.createdAt) x.createdAt = t;
      x.updatedAt = t;
      return x;
    }
    async function put(store, o) { const x = stamp(store, o); const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put(x); await done(tx); return x; }
    async function putMany(store, list) {
      const tx = db.transaction(store, "readwrite"), s = tx.objectStore(store), out = list.map((o) => stamp(store, o));
      for (const x of out) s.put(x);
      await done(tx); return out;
    }
    async function del(store, id) {   // soft delete, so a later sync can carry the delete to other devices
      const x = await req(os(store).get(id)); if (!x) return false;
      x.deletedAt = now(); x.updatedAt = x.deletedAt;
      const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put(x); await done(tx); return true;
    }
    async function count(store) { return (await all(store)).length; }

    // ------------------------------------------------------------ backup
    async function exportAll() {
      const out = { app: "pitch-caller", schema: VERSION, exportedAt: new Date().toISOString(), stores: {} };
      for (const s of Object.keys(STORES)) out.stores[s] = await all(s, true);
      return out;
    }
    // Merge a backup into this device: newer updatedAt wins, so restoring an old backup never overwrites newer work.
    async function importAll(data, { replace = false } = {}) {
      if (!data || data.app !== "pitch-caller" || !data.stores) throw new Error("That file isn't a Pitch Caller backup");
      const stats = {};
      for (const s of Object.keys(STORES)) {
        const incoming = data.stores[s] || [];
        const tx = db.transaction(s, "readwrite"), st = tx.objectStore(s);
        if (replace) st.clear();
        const have = replace ? new Map() : new Map((await new Promise((res, rej) => { const r = st.getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })).map((x) => [x.id, x]));
        let n = 0;
        for (const x of incoming) {
          const cur = have.get(x.id);
          if (!cur || (x.updatedAt || 0) > (cur.updatedAt || 0)) { st.put(x); n++; }
        }
        await done(tx); stats[s] = n;
      }
      return stats;
    }
    async function changedSince(t) {   // what a sync would push: everything touched after t, deletes included
      const out = {};
      for (const s of Object.keys(STORES)) out[s] = (await all(s, true)).filter((x) => (x.updatedAt || 0) > t);
      return out;
    }
    function close() { db.close(); }
    async function destroy() { db.close(); await req(factory.deleteDatabase(name)); }

    return { get, all, byIndex, put, putMany, del, count, exportAll, importAll, changedSince, close, destroy, raw: db };
  }

  // ------------------------------------------------------------ pitch types
  // Real pitch names, and how each maps onto the four families the engine models.
  const PITCH_TYPES = {
    "Four-seam": { kind: "FB", shape: "ride" }, "Two-seam": { kind: "FB", shape: "run" }, "Sinker": { kind: "FB", shape: "sink" },
    "Cutter": { kind: "FB", shape: "cut" }, "Slider": { kind: "SL", shape: "tight" }, "Sweeper": { kind: "SL", shape: "sweeper" },
    "Slurve": { kind: "SL", shape: "" }, "Curveball": { kind: "CB", shape: "loopy" }, "Knuckle curve": { kind: "CB", shape: "sharp" },
    "12-6 curve": { kind: "CB", shape: "sharp" }, "Changeup": { kind: "CH", shape: "fade" }, "Splitter": { kind: "CH", shape: "drop" },
    "Forkball": { kind: "CH", shape: "drop" },
  };
  const DEFAULT_TYPE = { FB: "Four-seam", SL: "Slider", CB: "Curveball", CH: "Changeup" };

  function newPitch(type, extra = {}) {
    const t = PITCH_TYPES[type] || PITCH_TYPES["Four-seam"];
    return Object.assign({ id: uid("pt"), type, name: type === "Four-seam" ? "Fastball" : type, kind: t.kind, shape: t.shape,
      grade: 3, command: 3, feel: 0.7, velo: "", ivb: "", hb: "", spin: "", active: true }, extra);
  }
  function newPitcher(teamId, extra = {}) {
    return Object.assign({ teamId, name: "", number: "", hand: "R", slot: "three-quarter", height_ft: 6.1, role: "SP", gradYear: "",
      pitchLimit: "", useLearned: true, notes: "", pitches: [newPitch("Four-seam", { feel: 0.75 }), newPitch("Changeup", { feel: 0.6 })] }, extra);
  }
  function newHitter(teamId, extra = {}) {
    return Object.assign({ teamId, name: "", number: "", bats: "R", pos: "", stats: {}, tags: [], notes: "" }, extra);
  }

  // ------------------------------------------------------------ the old localStorage state -> database
  // Moves the staff, any named lineup and the saved games from the prototype's single saved blob into real records.
  async function migrateLegacy(D, S) {
    if (await D.get("meta", "migrated")) return null;
    const ours = await D.put("teams", { name: "Our team", isOurs: true, level: (S && S.setup && S.setup.level) || "college_d3" });
    const staffIds = [];
    if (S && S.setup && Array.isArray(S.setup.staff)) {
      for (const pd of S.setup.staff) {
        const pitches = (pd.pitches || []).map((d) => Object.assign(newPitch(DEFAULT_TYPE[d.kind] || "Four-seam"), {
          name: d.name, kind: d.kind, shape: d.shape || "", grade: +d.grade || 3, command: +d.command || 3, feel: +d.feel || 0.7,
          velo: d.velo ?? "", ivb: d.ivb ?? "", hb: d.hb ?? "" }));
        const p = await D.put("pitchers", newPitcher(ours.id, { name: pd.name, hand: pd.hand || "R", slot: pd.slot || "three-quarter", height_ft: +pd.height_ft || 6.1, pitches }));
        staffIds.push(p.id);
      }
    }
    let opp = null;
    const lineup = (S && S.setup && S.setup.lineup) || [];
    if (lineup.some((b) => b.name)) {
      opp = await D.put("teams", { name: "Opponent", isOurs: false, level: ours.level });
      for (const b of lineup) if (b.name) b.hitterId = (await D.put("hitters", newHitter(opp.id, { name: b.name, bats: b.hand }))).id;
    }
    // saved games: their pitch logs become events (no engine predictions were stored back then, so learning skips them)
    let games = 0, events = 0;
    for (const hist of (S && S.history) || []) {
      const g = await D.put("games", { date: new Date(hist.when || now()).toISOString().slice(0, 10), level: hist.level, opponentId: null, legacy: true, status: "final" });
      const evs = (hist.log || []).slice().reverse().map((e) => ({ gameId: g.id, n: e.n, pitcherId: staffIds[e.p ?? 0] || null, pitchName: e.pitch, kind: e.kind,
        quad: e.quad, slot: e.slot, inning: e.inning, count: e.count, res: e.res, out: e.out, contact: e.contact, read: e.read, end: e.end,
        coach: !!e.coach, text: e.text, legacy: true }));
      await D.putMany("events", evs); games++; events += evs.length;
    }
    await D.put("meta", { id: "migrated", at: now() });
    return { ourTeamId: ours.id, staffIds, opponentId: opp && opp.id, games, events };
  }

  const PCDB = { open, uid, today, STORES, VERSION, PITCH_TYPES, DEFAULT_TYPE, newPitch, newPitcher, newHitter, migrateLegacy };
  if (typeof module !== "undefined" && module.exports) module.exports = PCDB;
  else root.PCDB = PCDB;
})(typeof window !== "undefined" ? window : this);
