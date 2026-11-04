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
 *   games      one per game, made at Game plan (status planned) index: date, opponentId, status
 *   events     one per pitch thrown (type "pitch"), or one per play between pitches (type "play")
 *                                                                 index: gameId, pitcherId, hitterId, type
 *   packs      what the calls read for a game: a new version each time it changes mid-game   index: gameId
 *   readings   one velo reading per pitch (bullpen log, imports, game gun)    index: pitcherId, sessionId
 *   learned    the learning models, one per pitcher and one per hitter       (id "p:<pitcherId>" / "h:<hitterId>")
 *   meta       schema version, settings
 *
 * Schema versions: 1 (Nov 2) the first database; 2 (Nov 3, D0) events get a type and a play sequence, games get
 * statuses, packs and readings stores. Version 1 events have no type and are pitches: isPitch() treats them so, and the
 * upgrade marks them "pitch" on the device. Edit rule (D0): a fix changes the event in place, keeps the old values in
 * its edits list and moves updatedAt; a sync keeps the newest updatedAt.
 *
 * Works in the browser (window.PCDB) and in Node with fake-indexeddb (module.exports) for tests.
 */
(function (root) {
  "use strict";
  const NAME = "pitchcaller", VERSION = 2;
  const STORES = {
    teams: ["isOurs"], pitchers: ["teamId"], catchers: ["teamId"], hitters: ["teamId"],
    checkins: ["pitcherId", "date"], sessions: ["pitcherId"], games: ["date", "opponentId", "status"],
    events: ["gameId", "pitcherId", "hitterId", "type"], packs: ["gameId"], readings: ["pitcherId", "sessionId"],
    learned: [], meta: [],
  };
  // what each event is. A version 1 event has no type and is always a pitch.
  const isPitch = (ev) => !!ev && (ev.type === undefined || ev.type === null || ev.type === "pitch");
  const isPlay = (ev) => !!ev && ev.type === "play";
  // plays between pitches. They rebuild the game state and are an audit trail; the learner never reads them.
  const PLAY_KINDS = ["sb", "cs", "pickoff", "balk", "advance", "out_on_bases", "sub_hitter", "sub_pitcher", "sub_catcher", "correct"];
  // a game's life: made at Game plan, live from its first pitch, suspended (rain, a doubleheader split), final
  const GAME_STATUS = ["planned", "live", "suspended", "final"];
  const GAME_MOVES = { planned: ["live", "final"], live: ["suspended", "final"], suspended: ["live", "final"], final: [] };
  function moveGame(rec, to) {
    const from = rec.status || "live";
    if (from === to) return rec;
    if (!GAME_STATUS.includes(to)) throw new Error(`Unknown game status "${to}"`);
    if (!(GAME_MOVES[from] || []).includes(to)) throw new Error(`A ${from} game can't become ${to}`);
    rec.status = to;
    rec.statusLog = (rec.statusLog || []).concat({ at: Date.now(), from, to });
    return rec;
  }

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
    r.onupgradeneeded = (e) => {
      const db = r.result, tx = r.transaction, from = e.oldVersion || 0;
      for (const [store, idx] of Object.entries(STORES)) {
        // new stores are made; stores that exist get any index they're missing (an upgrade never drops data)
        const os = db.objectStoreNames.contains(store) ? tx.objectStore(store) : db.createObjectStore(store, { keyPath: "id" });
        for (const i of idx) if (!os.indexNames.contains(i)) os.createIndex(i, i, { unique: false });
      }
      if (from >= 1 && from < 2) {   // 1 -> 2: every event so far is a pitch; mark it so the type index finds it
        const cur = tx.objectStore("events").openCursor();
        cur.onsuccess = () => { const c = cur.result; if (!c) return; if (c.value.type === undefined) { const v = c.value; v.type = "pitch"; c.update(v); } c.continue(); };
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
    // a hard delete, only for records that never left this device (a new iPad's placeholder team and pitchers when it
    // joins a program that already has a roster): a soft delete would send a tombstone for something no one else has
    async function forget(store, id) { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).delete(id); await done(tx); return true; }
    async function count(store) { return (await all(store)).length; }

    // ------------------------------------------------------------ backup
    async function exportAll() {
      const out = { app: "pitch-caller", schema: VERSION, exportedAt: new Date().toISOString(), stores: {} };
      for (const s of Object.keys(STORES)) out.stores[s] = await all(s, true);
      return out;
    }
    // Merge a backup into this device: newer updatedAt wins, so restoring an old backup never overwrites newer work.
    // The backup's schema is checked first: a newer one than this app reads is refused, never half-read (D0).
    async function importAll(data, { replace = false } = {}) {
      if (!data || data.app !== "pitch-caller" || !data.stores) throw new Error("That file isn't a Pitch Caller backup");
      const schema = +data.schema || 1;
      if (schema > VERSION) throw new Error(`That backup is from a newer version of the app (database version ${schema}; this app reads up to ${VERSION}). Update the app, then restore it.`);
      const unknown = Object.keys(data.stores).filter((s) => !(s in STORES));
      if (unknown.length) throw new Error(`That backup has data this app doesn't know (${unknown.join(", ")}), so nothing was restored.`);
      const stores = upgradeBackup(data.stores, schema);
      const stats = {};
      for (const s of Object.keys(STORES)) {
        const incoming = stores[s] || [];
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
    // rows from somewhere else (a sync pull): kept as they are, timestamps included, and only where newer than ours
    async function mergeRows(store, rows) {
      if (!(store in STORES)) throw new Error(`Unknown store ${store}`);
      // every read is issued inside the transaction's own callbacks (no await between them), so it can't close early
      const tx = db.transaction(store, "readwrite"), st = tx.objectStore(store);
      let n = 0;
      for (const x of rows) {
        const g = st.get(x.id);
        g.onsuccess = () => { const cur = g.result; if (!cur || (x.updatedAt || 0) > (cur.updatedAt || 0)) { st.put(x); n++; } };
      }
      await done(tx); return n;
    }
    async function changedSince(t) {   // what a sync would push: everything touched after t, deletes included
      const out = {};
      for (const s of Object.keys(STORES)) out[s] = (await all(s, true)).filter((x) => (x.updatedAt || 0) > t);
      return out;
    }
    function close() { db.close(); }
    async function destroy() { db.close(); await req(factory.deleteDatabase(name)); }

    return { get, all, byIndex, put, putMany, del, forget, count, exportAll, importAll, mergeRows, changedSince, close, destroy, raw: db };
  }

  // a backup's stores brought up to this schema (pure: the backup object isn't changed)
  function upgradeBackup(stores, schema) {
    const out = Object.assign({}, stores);
    if (schema < 2) out.events = (stores.events || []).map((e) => (e.type === undefined ? Object.assign({}, e, { type: "pitch" }) : e));
    return out;
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

  // D12: the same game charted on two iPads. Same date, the opponent not different, two devices, and the two pitch
  // sequences (inning, hitters faced, count, pitch, result) line up by at least `share` (longest common run over the shorter
  // game). A doubleheader doesn't line up like that; the same game charted twice does. The game with fewer pitches is the
  // duplicate (then the later one), so every device that runs this reaches the same answer. Pure: games and their
  // pitches in, pairs out.
  function likelyDuplicates(games, eventsOf, opts = {}) {
    const share = opts.share || 0.8, minPitches = opts.minPitches || 10, out = [];
    const sig = (e) => [e.sit ? e.sit.inning : "", e.sit ? e.sit.batters_faced ?? "" : "", e.sit ? `${e.sit.balls}-${e.sit.strikes}` : "", e.pitchName, e.res].join("|");
    const seq = new Map();
    for (const g of games) seq.set(g.id, (eventsOf(g.id) || []).filter((e) => isPitch(e) && !e.deletedAt).sort((a, b) => (a.seq || a.n || 0) - (b.seq || b.n || 0)).map(sig));
    const lcs = (a, b) => { let prev = new Array(b.length + 1).fill(0); for (let i = 1; i <= a.length; i++) { const cur = [0]; for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev = cur; } return prev[b.length]; };
    const live = games.filter((g) => !g.deletedAt);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const A = live[i], B = live[j];
      if (A.date !== B.date || (A.opponentId && B.opponentId && A.opponentId !== B.opponentId)) continue;
      if (A.deviceId && B.deviceId && A.deviceId === B.deviceId) continue;
      if ((A.notDup || []).includes(B.id) || (B.notDup || []).includes(A.id)) continue;
      const a = seq.get(A.id), b = seq.get(B.id);
      if (Math.min(a.length, b.length) < minPitches) continue;
      const r = lcs(a, b) / Math.min(a.length, b.length);
      if (r < share) continue;
      const [keep, drop] = a.length !== b.length ? (a.length > b.length ? [A, B] : [B, A]) : ((A.startedAt || 0) <= (B.startedAt || 0) ? [A, B] : [B, A]);
      out.push({ keep: keep.id, drop: drop.id, match: Math.round(r * 100) / 100 });
    }
    return out;
  }

  const PCDB = { open, uid, today, STORES, VERSION, likelyDuplicates, PITCH_TYPES, DEFAULT_TYPE, newPitch, newPitcher, newHitter, migrateLegacy,
    isPitch, isPlay, PLAY_KINDS, GAME_STATUS, moveGame, upgradeBackup };
  if (typeof module !== "undefined" && module.exports) module.exports = PCDB;
  else root.PCDB = PCDB;
})(typeof window !== "undefined" ? window : this);
