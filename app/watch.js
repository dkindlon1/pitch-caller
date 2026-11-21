/*
 * Watch link (prototype, docs/plans/PLAN_watch_prototype_2026-11-15.md rev 3): the call the coach accepts goes to up to two
 * Bangle.js 2 watches running watch/bangle/pitchiq.app.js, over Web Bluetooth (Chrome on a PC, laptop or Android; iPad
 * Safari has none, so nothing here runs there).
 *
 * What goes over the air (docs/PLAN_watch_security_2026-11-18.md), one write of at most 20 bytes, never a name:
 *   K<id><key>        the game's key (18 bytes): a fresh random 128-bit key per game, written to each watch over the
 *                     passkey-bonded link as the first write of every connection while a game is on. Never stored.
 *   <16-byte frame>   a call (sign, location, changed flag), a clear, a heartbeat or "end of game", encrypted and
 *                     authenticated with that inning's key (app/watch_sec.js: AES-CTR + CMAC, keys derived per inning)
 *   H                 plain heartbeat, only while no game key is out (the watch can show nothing without one)
 * The heartbeat (every 3 s) re-sends the newest frame (a repeat: no second buzz), so a watch that missed or dropped it
 * gets it back. Message numbers count up through the game across every watch and connection (never per connection: a
 * number is part of the encryption's counter block and must not repeat under one key).
 * Back from the watch (notifications, only while "Delivery receipt" is on):
 *   A<n>   receipt for message n        B<pct>   battery        K<id>   game key received
 *
 * Rules (plan rev 2 review items 1-4, 10, 12, 13; security plan 2):
 *   - message numbers count up for the whole game; a reload makes a new game key (the watch takes the new key and
 *     starts its count again), so a reload or an undo can't leave the watch ignoring new calls;
 *   - a watch removed from the team (opts.removed) never gets a key: the coach's app forgets it;
 *   - only the newest numbered message matters: a newer one replaces an older one still waiting or unconfirmed;
 *   - one write at a time per watch (Chrome rejects overlapping GATT operations);
 *   - with the receipt on, a message with no receipt after 1 s is "missing" and re-sent every second until it arrives
 *     or is replaced; the watch acknowledges a repeat without buzzing again;
 *   - with the receipt off (one-way game use), each message is written 3 times about 150 ms apart and the watch drops
 *     the repeats; nothing comes back;
 *   - a dropped link reconnects by itself while the page stays open, backing off from 1 s to 10 s; on reconnect the
 *     watch gets what it should show now (the accepted call, or a clear).
 */
(function (root) {
  "use strict";

  const SVC = "7a1d0001-5c3e-4b8f-9a62-2f0c8e4d1b70";   // the watch app's own service (data, not code)
  const RX = "7a1d0002-5c3e-4b8f-9a62-2f0c8e4d1b70";    // we write here
  const TX = "7a1d0003-5c3e-4b8f-9a62-2f0c8e4d1b70";    // the watch notifies here
  const MAX_LEN = 20;
  const MAX_WATCHES = 2;
  const ACK_MS = 1000, RETRY_MS = 1000, HB_MS = 3000, REPEATS = 3, REPEAT_GAP_MS = 150, BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];
  const SETTINGS_KEY = "pitchiq.watch";   // this device only: never in the synced setup or the game plan (review 16)
  const Sec = typeof PQSec !== "undefined" ? PQSec : (typeof require === "function" ? require("./watch_sec.js") : null);

  // the engine's spots as the watch says them (plan rev 3). Chase goes the way the engine aims it: above the zone for
  // fastball-class pitches, below it for the breaking balls and the changeup (engine.js yTarget / targetHeight).
  const LOC = { "up-in": "HI", "up-away": "HO", "down-in": "LI", "down-away": "LO", "down-middle": "L", middle: "M" };
  const OFFSPEED = ["SL", "CB", "CH"];
  const WORDS = { HI: ["HIGH AND", "INSIDE"], HO: ["HIGH AND", "OUTSIDE"], LI: ["LOW AND", "INSIDE"], LO: ["LOW AND", "OUTSIDE"],
    L: ["LOW"], M: [], CH: ["CHASE", "HIGH"], CL: ["CHASE", "LOW"] };
  function locCode(quad, kind) {
    if (quad === "chase") return OFFSPEED.includes(kind) ? "CL" : "CH";
    return LOC[quad] || null;
  }
  const signOk = (s) => /^[1-9]$/.test(String(s));

  // active pitches of one pitcher that share a sign: [{ sign, names }] (the watch shows no pitch type, so they'd look
  // identical; review 11 / plan rev 3)
  function sharedSigns(pitches, signOf) {
    const by = {};
    for (const d of pitches || []) {
      if (!d || d.active === false) continue;
      const s = String(signOf(d.kind, d.sign));
      (by[s] = by[s] || []).push(d.name);
    }
    return Object.keys(by).filter((s) => by[s].length > 1).map((s) => ({ sign: s, names: by[s] }));
  }

  // one sealed frame (16 bytes): what the watch is to show, under that inning's keys
  function seal(game, inning, n, target) {
    const f = Sec.seal(game.keysFor(inning), game.keyId, inning, n, target);
    if (f.length > MAX_LEN) throw new Error("watch message too long");
    return f;
  }
  const randomBytes = (n) => {
    const b = new Uint8Array(n);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(b);
    else if (typeof require === "function") b.set(require("crypto").randomBytes(n));
    else throw new Error("no secure random source");
    return b;
  };

  function create(opts) {
    opts = opts || {};
    const bt = opts.bluetooth || null;
    const T = opts.timers || { now: () => Date.now(), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t),
      setInterval: (f, ms) => setInterval(f, ms), clearInterval: (t) => clearInterval(t) };
    const storage = opts.storage !== undefined ? opts.storage : (typeof localStorage !== "undefined" ? localStorage : null);
    const onChange = opts.onChange || (() => {});
    const enc = new TextEncoder(), dec = new TextDecoder();
    const log = opts.log || (() => {});
    const random = opts.random || randomBytes;
    const removed = opts.removed || (() => false);   // (device) -> true when the coach removed this watch from the team
    // (device id, name, role, { fresh }) on each connection, before any key: the app registers it with the team and may answer
    // { removed: true } (or a promise of it); fresh = picked in the chooser just now (pairing it), so a re-add may be asked
    const onLinked = opts.onLinked || (() => {});
    const LINK_CHECK_MS = opts.linkCheckMs || 2500;   // how long the team's answer may take before this device's own list decides (offline)

    // roles: { deviceId: "pitcher" | "catcher" }. mode: "full" (default: every message sealed with the game's key) or
    // "pairing" (pairing-only, the fallback if AES turns out too slow on the watch: plain messages over the bonded link,
    // message numbers still guarding against replays)
    let settings = { receipt: true, ids: [], roles: {}, mode: "full" };
    try { const s = storage && storage.getItem(SETTINGS_KEY); if (s) settings = Object.assign(settings, JSON.parse(s)); } catch (e) {}
    const saveSettings = () => { try { storage && storage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} };

    const devs = [];
    let target = null;      // what every watch should show now: { kind: "call", sign, loc, chg } or { kind: "clear" }
    let accepted = null;    // the accepted call: { gid, id, pitchNo }
    let lastAcc = null;     // the last accepted call and the at-bat moment it was for (the changed flag)
    let hbTimer = null;
    let lastSig = "";
    // the game key: { gid, keyId, key, seq, inning, keysFor(inning), content: { text: { n, bytes } } } or null. In memory only
    let game = null;
    const soak = { on: false, timer: null, seq: 0, stats: {} };

    const changed = () => { const s = JSON.stringify(summary()); if (s !== lastSig) { lastSig = s; onChange(); } };

    // the heartbeat repeats the newest numbered message (the watch drops a repeat without buzzing): a watch that missed
    // it, or dropped it after a quiet spell (NO LINK), gets it back with no round trip; a plain H only when there's none
    function startHeartbeat() {
      if (hbTimer) return;
      hbTimer = T.setInterval(() => { for (const d of devs) if (d.state === "ok") { d.hbDue = true; pump(d); } }, HB_MS);
    }
    // the frame for this target under the game key: every watch gets the same frame for the same content, and new
    // content always gets a new number (a counter block never repeats under one key)
    function frameFor(tgt) {
      const content = `${game.inning}|${tgt.kind}|${tgt.sign || ""}|${tgt.loc || ""}|${tgt.chg ? 1 : 0}`;
      let f = game.content[content];
      if (!f) { game.seq += 1; f = game.content[content] = { n: game.seq, bytes: game.mode === "pairing" ? enc.encode(plainText(tgt, game.seq)) : seal(game, game.inning, game.seq, tgt) }; }
      return f;
    }
    // pairing-only mode's plain message (at most 13 bytes: C65535,9,CL,1)
    function plainText(tgt, n) {
      return tgt.kind === "call" ? `C${n},${tgt.sign},${tgt.loc},${tgt.chg ? 1 : 0}` : tgt.kind === "end" ? `E${n}` : `X${n}`;
    }
    function startGame(gid) {
      const key = random(16), keyId = random(1)[0];
      const cache = {};
      game = { gid, key, keyId, seq: 0, inning: 1, content: {}, mode: settings.mode === "pairing" ? "pairing" : "full",
        keysFor: (i) => cache[i] || (cache[i] = Sec.inningKeys(key, i)) };
      for (const d of devs) if (d.state === "ok") { pushKey(d); if (target) send(d, target); }
      changed();
    }
    function pushKey(d) {
      if (!game) return;
      if (removed(d.device)) { forget(d.name); return; }
      const kf = game.mode === "pairing" ? enc.encode("P") : Sec.keyFrame(game.keyId, game.key);   // pairing-only: no key, a P
      d.keyed = false;
      d.ops.push(() => (d.rx.writeValueWithResponse ? d.rx.writeValueWithResponse(kf) : d.rx.writeValue(kf)));
      pump(d);
    }
    // the coach ends the game: each watch is told (it wipes the key) and the key is dropped here
    function endGame() {
      if (!game) return;
      game.content = {};
      for (const d of devs) if (d.state === "ok") send(d, { kind: "end" });
      accepted = null; target = null; lastAcc = null;
      const g = game;
      T.setTimeout(() => { if (game === g) { game = null; changed(); } }, 2000);   // after the end frames have gone out
      changed();
    }
    function setInning(i) {
      if (!game || !(i >= 1 && i <= 255) || i === game.inning) return;
      if (i < game.inning) return;   // innings only go forward (an undo across an inning keeps the later inning's keys)
      game.inning = i; game.content = {};
    }

    // ---------------------------------------------------------------- one watch's queue
    function send(d, tgt) {
      if (!tgt || !game) return;
      if (removed(d.device)) { forget(d.name); return; }
      const f = frameFor(tgt);
      if (d.want) clearWantTimers(d.want);
      d.want = { n: f.n, bytes: f.bytes, kind: tgt.kind, soak: !!tgt.soak, writes: 0, done: 0, needWrite: true, firstAt: null, acked: false,
        missing: false, ackArmed: false, ackT: null, retryT: null, repeatT: null, latency: null };
      pump(d);
      changed();
    }
    function clearWantTimers(w) {
      for (const k of ["ackT", "retryT", "repeatT"]) if (w[k]) { T.clearTimeout(w[k]); w[k] = null; }
    }
    function pump(d) {
      if (d.writing || d.state !== "ok") return;
      if (d.ops.length) {
        const op = d.ops.shift(), conn = d.conn;
        d.writing = true;
        Promise.resolve().then(op).catch((e) => log("watch op", e)).then(() => { if (d.conn !== conn) return; d.writing = false; pump(d); });
        return;
      }
      const w = d.want;
      if (w && w.needWrite) { write(d, w.bytes, w); return; }
      if (d.hbDue) {
        d.hbDue = false;
        if (w) write(d, w.bytes, null);
        else if (game && game.mode === "full") { game.seq += 1; game.content = {}; write(d, seal(game, game.inning, game.seq, { kind: "hb" }), null); }
        else write(d, enc.encode("H"), null);
      }
    }
    function write(d, bytes, w) {
      d.writing = true;
      const conn = d.conn;
      if (w) {
        w.needWrite = false; w.writes++;
        if (w.firstAt === null) w.firstAt = T.now();
        if (settings.receipt) armReceipt(d, w);   // from the first attempt, so a write that keeps failing still shows as missing
      }
      const chr = d.rx;
      let go;
      try { go = chr.writeValueWithResponse ? chr.writeValueWithResponse(bytes) : chr.writeValue(bytes); }
      catch (e) { go = Promise.reject(e); }
      Promise.resolve(go).then(() => {
        if (d.conn !== conn) return;   // settled after the link was replaced: the new connection has its own queue
        d.writing = false;
        if (w && d.want === w) { w.done++; afterWrite(d, w); }
        pump(d);
      }, (e) => {
        if (d.conn !== conn) return;
        d.writing = false;
        log("watch write", e && e.message);
        // a failed write: try the message again shortly (a dropped link is handled by the disconnect event)
        if (w && d.want === w && !w.acked && !w.retryT) w.retryT = T.setTimeout(() => { w.retryT = null; if (d.want === w && !w.acked) { w.needWrite = true; pump(d); } }, 200);
        pump(d);
      });
    }
    // one receipt timer per message, however many times it's re-sent
    function armReceipt(d, w) {
      if (w.ackArmed || w.acked) return;
      w.ackArmed = true;
      w.ackT = T.setTimeout(() => {
        w.ackT = null;
        if (d.want !== w || w.acked) return;
        w.missing = true; changed();
        const again = () => { w.retryT = null; if (d.want !== w || w.acked) return; w.needWrite = true; pump(d); w.retryT = T.setTimeout(again, RETRY_MS); };
        if (w.retryT) T.clearTimeout(w.retryT);
        again();
      }, ACK_MS);
    }
    function afterWrite(d, w) {
      if (settings.receipt) return;
      if (w.writes < REPEATS) w.repeatT = T.setTimeout(() => { w.repeatT = null; if (d.want === w) { w.needWrite = true; pump(d); } }, REPEAT_GAP_MS);
      changed();
    }
    function onNotify(d, text) {
      if (text[0] === "A") {
        const n = +text.slice(1);
        const w = d.want;
        if (w && n === w.n && !w.acked) {
          w.acked = true; w.missing = false; w.latency = T.now() - w.firstAt; clearWantTimers(w);
          if (soak.on && w.soak) soakAck(d, w);
          changed();
        }
      } else if (text[0] === "K") {
        if (game && game.mode === "full" && +text.slice(1) === game.keyId) { d.keyed = true; changed(); }
      } else if (text === "P") {
        if (game && game.mode === "pairing") { d.keyed = true; changed(); }
      } else if (text[0] === "B") {
        const b = +text.slice(1);
        if (b >= 0 && b <= 100) { d.battery = b; changed(); }
      }
    }

    // ---------------------------------------------------------------- connecting
    async function link(d) {
      d.conn = (d.conn || 0) + 1;
      const conn = d.conn;
      if (d.want) clearWantTimers(d.want);
      d.state = "connecting"; d.writing = false; d.ops = []; d.want = null; changed();
      const server = await d.device.gatt.connect();
      let svc;
      try { svc = await server.getPrimaryService(SVC); }
      catch (e) { try { d.device.gatt.disconnect(); } catch (e2) {} d.state = "noapp"; changed(); throw new Error("Open the PitchIQ app on the watch, then connect again."); }
      d.rx = await svc.getCharacteristic(RX);
      d.tx = await svc.getCharacteristic(TX);
      if (!d.txListen) d.txListen = (ev) => { try { onNotify(d, dec.decode(ev.target.value)); } catch (e) {} };
      d.tx.addEventListener("characteristicvaluechanged", d.txListen);
      if (settings.receipt) await d.tx.startNotifications();
      if (d.conn !== conn) return;
      d.notifying = !!settings.receipt;
      d.backoff = 0;
      // review fixes (Nov 19): the team's list answers before any key goes out, so a removal made elsewhere wins even when
      // this device's own list is out of date. Offline (no answer in time), the list kept on this device decides. A watch
      // just picked in the chooser (fresh) may be re-added, but only if the team says so.
      const fresh = !!d.fresh; d.fresh = false;
      if (!fresh && removed(d.device)) { forget(d.name); throw new Error(`${d.name} was removed from the team. Pair it again to use it.`); }
      let answer = null;
      try {
        answer = await new Promise((res) => {
          const to = T.setTimeout(() => res(null), LINK_CHECK_MS);
          Promise.resolve(onLinked(d.device.id, d.name, roleOf(d), { fresh })).then((a) => { T.clearTimeout(to); res(a || null); }, () => { T.clearTimeout(to); res(null); });
        });
      } catch (e) {}
      if (d.conn !== conn) return;
      if ((answer && answer.removed) || (removed(d.device) && !(fresh && answer && answer.ok))) {
        forget(d.name); throw new Error(`${d.name} was removed from the team. Pair it again to use it.`);
      }
      d.state = "ok";
      startHeartbeat();
      // the game key first (the watch takes it only over the bonded link), then what it should show now; a watch
      // joining or coming back gets the call as new (one long buzz), never as a change
      if (game) {
        pushKey(d);
        game.content = {};   // a fresh number: the watch shows it as a new call (it took the old one off at the drop)
        send(d, target && target.kind === "call" ? Object.assign({}, target, { chg: false }) : (target || { kind: "clear" }));
      }
      changed();
    }
    function onDisconnect(d) {
      if (d.state === "closed" || d.reT) return;   // closed, or a reconnect is already scheduled
      d.state = "lost"; d.writing = false; d.ops = []; d.conn = (d.conn || 0) + 1;
      if (d.want) clearWantTimers(d.want);
      changed();
      const ms = BACKOFF_MS[Math.min(d.backoff, BACKOFF_MS.length - 1)];
      d.backoff++;
      d.reT = T.setTimeout(() => {
        d.reT = null;
        if (d.state !== "lost") return;
        link(d).catch(() => { if (d.state !== "closed" && d.state !== "noapp") onDisconnect(d); });
      }, ms);
    }
    function addDevice(device) {
      let d = devs.find((x) => x.device === device || (device.id && x.device.id === device.id));
      if (d) return d;
      if (devs.length >= MAX_WATCHES) throw new Error(`Up to ${MAX_WATCHES} watches.`);
      d = { device, name: device.name || "Watch", state: "new", battery: null, keyed: false, want: null, writing: false, hbDue: false, ops: [], backoff: 0, reT: null, conn: 0 };
      device.addEventListener("gattserverdisconnected", () => onDisconnect(d));
      devs.push(d);
      if (device.id && !settings.ids.includes(device.id)) { settings.ids.push(device.id); saveSettings(); }
      return d;
    }
    async function linkOrRetry(d) {
      try { await link(d); }
      catch (e) { if (d.state !== "closed" && d.state !== "noapp") { d.state = "ok"; onDisconnect(d); } throw e; }
    }
    async function connect() {
      if (!bt) throw new Error("This browser has no Bluetooth. Use Chrome on a computer or an Android device.");
      if (devs.filter((x) => x.state !== "closed").length >= MAX_WATCHES) throw new Error(`Up to ${MAX_WATCHES} watches.`);
      const device = await bt.requestDevice({ filters: [{ namePrefix: "Bangle" }], optionalServices: [SVC] });
      const d = addDevice(device);
      if (d.state === "ok") return d;
      d.fresh = true;   // picked in the chooser just now: pairing it, so the team may re-add it if it was removed
      if (d.reT) { T.clearTimeout(d.reT); d.reT = null; }
      await linkOrRetry(d);
      return d;
    }
    // after a reload: watches this browser was already allowed to use, without a tap where Chrome offers getDevices()
    async function restore() {
      if (!bt || typeof bt.getDevices !== "function" || !settings.ids.length) return 0;
      let n = 0;
      for (const device of await bt.getDevices()) {
        if (!settings.ids.includes(device.id) || devs.length >= MAX_WATCHES) continue;
        const d = addDevice(device);
        try { await linkOrRetry(d); n++; } catch (e) {}
      }
      return n;
    }
    async function reconnect(name) {
      const d = devs.find((x) => x.name === name);
      if (!d) return connect();
      if (d.reT) { T.clearTimeout(d.reT); d.reT = null; }
      d.backoff = 0;
      await linkOrRetry(d);
      return d;
    }
    function forget(name) {
      const i = devs.findIndex((x) => x.name === name);
      if (i < 0) return;
      const d = devs[i];
      d.state = "closed";
      if (d.reT) T.clearTimeout(d.reT);
      if (d.want) clearWantTimers(d.want);
      try { d.device.gatt.disconnect(); } catch (e) {}
      // drop this browser's permission for the watch where Chrome allows it, so it can't come back without pairing again
      try { if (typeof d.device.forget === "function") d.device.forget().catch(() => {}); } catch (e) {}
      devs.splice(i, 1);
      settings.ids = settings.ids.filter((x) => x !== d.device.id); saveSettings();
      changed();
    }
    // pitcher's or catcher's watch: the first one paired is the pitcher's, the second the catcher's, until the coach says
    function roleOf(d) { return (settings.roles || {})[d.device.id] || (devs.indexOf(d) === 1 ? "catcher" : "pitcher"); }
    function setRole(name, role) {
      const d = devs.find((x) => x.name === name);
      if (!d || (role !== "pitcher" && role !== "catcher")) return;
      settings.roles = Object.assign({}, settings.roles, { [d.device.id]: role }); saveSettings();
      try { Promise.resolve(onLinked(d.device.id, d.name, role, { fresh: false })).then((a) => { if (a && a.removed) forget(d.name); }, () => {}); } catch (e) {}
      changed();
    }
    // full encryption or pairing-only; a game in progress starts a fresh session in the new mode (the watch takes the
    // new key, or the P, and the call on screen is sent again as new)
    function setMode(mode) {
      if (mode !== "full" && mode !== "pairing") return;
      settings.mode = mode; saveSettings();
      if (game && game.mode !== mode) { if (target && target.kind === "call") target = Object.assign({}, target, { chg: false }); startGame(game.gid); }
      changed();
    }
    function setReceipt(on) {
      settings.receipt = !!on; saveSettings();
      for (const d of devs) {
        if (d.state !== "ok") continue;
        if (d.notifying !== settings.receipt) d.ops.push(() => (settings.receipt ? d.tx.startNotifications() : d.tx.stopNotifications()).then(() => { d.notifying = settings.receipt; }));
        // the message on the watch now is sent again under the new rule (same number: no second buzz)
        const w = d.want;
        if (w) { clearWantTimers(w); Object.assign(w, { writes: 0, done: 0, needWrite: true, acked: false, missing: false, ackArmed: false, firstAt: null }); }
        pump(d);
      }
      changed();
    }

    // ---------------------------------------------------------------- the call
    // accept the call on screen: { gid, id, pitchNo, ab, sign, quad, kind } (ab: the moment in the game, e.g. inning and
    // batter, so the first call of a new inning isn't taken for a change)
    function accept(c) {
      const loc = locCode(c.quad, c.kind);
      if (!signOk(c.sign)) throw new Error(`sign ${c.sign} can't go to the watch (1 to 9)`);
      if (!loc) throw new Error(`unknown spot ${c.quad}`);
      const at = `${c.pitchNo}|${c.ab || ""}`;
      if (!game || game.gid !== c.gid) startGame(c.gid);   // a new game: a new key, to every watch, before its first call
      if (c.inning) setInning(c.inning);
      const chg = !!(lastAcc && lastAcc.gid === c.gid && lastAcc.at === at && lastAcc.id !== c.id);
      accepted = { gid: c.gid, id: c.id, pitchNo: c.pitchNo };
      lastAcc = { gid: c.gid, id: c.id, at };
      target = { kind: "call", sign: String(c.sign), loc, chg, soak: !!c.soak };
      game.content = {};   // a new target: new frames, new numbers
      for (const d of devs) if (d.state === "ok") send(d, target);
      changed();
      return target;
    }
    // run on every render: the watches keep the accepted call only while it's still the call on screen at the same
    // pitch of the same game; anything else (a recorded pitch, a shake-off, a new call, undo, the third out) clears them.
    // A soak test owns the watches while it runs.
    function sync(cur) {
      if (cur && cur.inning) setInning(cur.inning);
      if (!accepted || soak.on) return false;
      if (cur && cur.gid === accepted.gid && cur.id === accepted.id && cur.pitchNo === accepted.pitchNo) return false;
      accepted = null;
      target = { kind: "clear" };
      if (game) game.content = {};
      for (const d of devs) if (d.state === "ok") send(d, target);
      changed();
      return true;
    }
    const isAccepted = (cur) => !!(accepted && cur && cur.gid === accepted.gid && cur.id === accepted.id && cur.pitchNo === accepted.pitchNo);

    // ---------------------------------------------------------------- what the coach sees
    function summary() {
      const list = devs.map((d) => {
        const w = d.want, isCall = !!(accepted && w && w.kind === "call");
        const delivered = d.state === "ok" && !!w && (settings.receipt ? w.acked : w.done >= 1);
        return { name: d.name, id: d.device.id, role: roleOf(d), state: d.state, battery: d.battery, keyed: !!(game && d.keyed), delivered: isCall && delivered, missing: isCall && d.state === "ok" && !!w.missing,
          latency: isCall && w.latency !== null ? w.latency : null };
      });
      return { supported: !!bt, receipt: settings.receipt, mode: settings.mode, accepted: !!accepted, used: settings.ids.length > 0 || devs.length > 0, game: !!game, devices: list };
    }
    // one line for the Game screen's pill: { tone: "ok" | "watch" | "change" | "", text }
    function line() {
      const s = summary(), live = s.devices.filter((d) => d.state !== "closed");
      if (!live.length) return null;
      const down = live.filter((d) => d.state !== "ok");
      if (down.length) return { tone: "change", text: down.length === live.length ? "No link to the watch" + (live.length > 1 ? "es" : "") + ": give the sign" : `No link to ${down[0].name}: give the sign` };
      if (!s.accepted) return { tone: "", text: live.length > 1 ? "Both watches ready" : "Watch ready" };
      const miss = live.filter((d) => d.missing);
      if (miss.length) return { tone: "change", text: `Not on ${miss.map((d) => d.name).join(" or ")}: give the sign` };
      if (live.every((d) => d.delivered)) return { tone: "ok", text: s.receipt ? (live.length > 1 ? "On both watches ✓" : "On the watch ✓") : "Sent (no receipt)" };
      return { tone: "watch", text: "Sending…" };
    }

    // ---------------------------------------------------------------- soak test (dev only)
    const soakRow = (name) => soak.stats[name] || (soak.stats[name] = { sent: 0, ok: 0, late: 0, max: 0 });
    function soakAck(d, w) {
      const st = soakRow(d.name);
      if (w.latency <= ACK_MS) st.ok++; else st.late++;
      st.max = Math.max(st.max, w.latency);
    }
    function soakStart(everyMs) {
      if (soak.on) return;
      soak.on = true; soak.stats = {};
      const quads = ["up-in", "up-away", "down-in", "down-away", "down-middle", "middle", "chase"], kinds = ["FB", "SL", "CB", "CH", "SI", "FC"];
      const tick = () => {
        soak.seq++;
        const k = kinds[Math.floor(Math.random() * kinds.length)];
        accept({ gid: "soak", id: soak.seq, pitchNo: soak.seq, soak: true, sign: 1 + Math.floor(Math.random() * 6), quad: quads[Math.floor(Math.random() * quads.length)], kind: k });
        for (const d of devs) if (d.state === "ok") soakRow(d.name).sent++;
      };
      tick();
      soak.timer = T.setInterval(tick, everyMs || 5000);
    }
    function soakStop() {
      if (soak.timer) T.clearInterval(soak.timer);
      soak.timer = null; soak.on = false;
      accepted = null; target = { kind: "clear" }; if (game) game.content = {};
      for (const d of devs) if (d.state === "ok") send(d, target);
      changed();
      return soakStats();
    }
    function soakStats() {
      const out = {};
      for (const [k, v] of Object.entries(soak.stats)) out[k] = Object.assign({}, v, { missing: Math.max(0, v.sent - v.ok - v.late) });
      return out;
    }

    return { connect, restore, reconnect, forget, setReceipt, setRole, setMode, accept, sync, isAccepted, summary, line, startGame, endGame, setInning,
      get _game() { return game; },
      soakStart, soakStop, soakStats, get soaking() { return soak.on; }, get receipt() { return settings.receipt; }, _devs: devs };
  }

  const PCWatch = { VERSION: "0.3.0", SVC, RX, TX, MAX_LEN, LOC, WORDS, locCode, sharedSigns, create,
    supported: () => typeof navigator !== "undefined" && !!navigator.bluetooth };
  root.PCWatch = PCWatch;
  if (typeof module !== "undefined" && module.exports) module.exports = PCWatch;
})(typeof self !== "undefined" ? self : this);
