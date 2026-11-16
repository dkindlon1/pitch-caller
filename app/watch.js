/*
 * Watch link (prototype, docs/PLAN_watch_prototype_2026-11-15.md rev 3): the call the coach accepts goes to up to two
 * Bangle.js 2 watches running watch/bangle/pitchiq.app.js, over Web Bluetooth (Chrome on a PC, laptop or Android; iPad
 * Safari has none, so nothing here runs there).
 *
 * What goes over the air is codes only, one write of at most 20 bytes per message, never a name:
 *   C<n>,<sign>,<loc>,<chg>   a call: message number, the catcher's sign, the location code, 1 if it replaces a call
 *                             already on the watch before a pitch was recorded (two short buzzes) else 0 (one long buzz)
 *   X<n>                      clear: the watch shows "—"
 *   H                         heartbeat (no number), every 3 s
 * and back from the watch (notifications, only while "Delivery receipt" is on):
 *   A<n>                      receipt for message n        B<pct>   battery
 *
 * Rules (plan rev 2 review items 1-4, 10, 12, 13):
 *   - every message number counts up per watch and restarts at 1 on each new connection (the watch resets too), so a
 *     reload or an undo can't leave the watch ignoring new calls;
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

  function encode(target, n) {
    const t = target.kind === "call" ? `C${n},${target.sign},${target.loc},${target.chg ? 1 : 0}` : `X${n}`;
    if (t.length > MAX_LEN) throw new Error(`watch message too long: ${t}`);
    return t;
  }

  function create(opts) {
    opts = opts || {};
    const bt = opts.bluetooth || null;
    const T = opts.timers || { now: () => Date.now(), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t),
      setInterval: (f, ms) => setInterval(f, ms), clearInterval: (t) => clearInterval(t) };
    const storage = opts.storage !== undefined ? opts.storage : (typeof localStorage !== "undefined" ? localStorage : null);
    const onChange = opts.onChange || (() => {});
    const enc = new TextEncoder(), dec = new TextDecoder();
    const log = opts.log || (() => {});

    let settings = { receipt: true, ids: [] };
    try { const s = storage && storage.getItem(SETTINGS_KEY); if (s) settings = Object.assign(settings, JSON.parse(s)); } catch (e) {}
    const saveSettings = () => { try { storage && storage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} };

    const devs = [];
    let target = null;      // what every watch should show now: { kind: "call", sign, loc, chg } or { kind: "clear" }
    let accepted = null;    // the accepted call: { gid, id, pitchNo }
    let lastAcc = null;     // the last accepted call, for the changed flag
    let hbTimer = null;
    let lastSig = "";
    const soak = { on: false, timer: null, seq: 0, stats: {} };

    const changed = () => { const s = JSON.stringify(summary()); if (s !== lastSig) { lastSig = s; onChange(); } };

    function startHeartbeat() {
      if (hbTimer) return;
      hbTimer = T.setInterval(() => { for (const d of devs) if (d.state === "ok") { d.hbDue = true; pump(d); } }, HB_MS);
    }

    // ---------------------------------------------------------------- one watch's queue
    function send(d, tgt) {
      if (!tgt) return;
      d.n += 1;
      if (d.want) clearWantTimers(d.want);
      d.want = { n: d.n, text: encode(tgt, d.n), kind: tgt.kind, writes: 0, needWrite: true, firstAt: null, acked: false,
        missing: false, ackT: null, retryT: null, repeatT: null, latency: null };
      pump(d);
      changed();
    }
    function clearWantTimers(w) {
      for (const k of ["ackT", "retryT", "repeatT"]) if (w[k]) { T.clearTimeout(w[k]); w[k] = null; }
    }
    function pump(d) {
      if (d.writing || d.state !== "ok") return;
      if (d.ops.length) {
        const op = d.ops.shift();
        d.writing = true;
        Promise.resolve().then(op).catch((e) => log("watch op", e)).then(() => { d.writing = false; pump(d); });
        return;
      }
      const w = d.want;
      if (w && w.needWrite) { write(d, w.text, w); return; }
      if (d.hbDue) { d.hbDue = false; write(d, "H", null); }
    }
    function write(d, text, w) {
      d.writing = true;
      if (w) { w.needWrite = false; w.writes++; if (w.firstAt === null) w.firstAt = T.now(); }
      const bytes = enc.encode(text);
      const chr = d.rx;
      const go = chr.writeValueWithResponse ? chr.writeValueWithResponse(bytes) : chr.writeValue(bytes);
      Promise.resolve(go).then(() => {
        d.writing = false;
        if (w && d.want === w) afterWrite(d, w);
        pump(d);
      }, (e) => {
        d.writing = false;
        log("watch write", e && e.message);
        // a failed write: try the message again shortly (a dropped link is handled by the disconnect event)
        if (w && d.want === w && !w.acked) { w.retryT = T.setTimeout(() => { w.retryT = null; if (d.want === w && !w.acked) { w.needWrite = true; pump(d); } }, 200); }
        pump(d);
      });
    }
    function afterWrite(d, w) {
      if (settings.receipt) {
        if (!w.ackArmed && !w.acked) {
          w.ackArmed = true;   // one receipt timer per message, however many times it's re-sent
          w.ackT = T.setTimeout(() => {
            w.ackT = null;
            if (d.want !== w || w.acked) return;
            w.missing = true; changed();
            const again = () => { w.retryT = null; if (d.want !== w || w.acked) return; w.needWrite = true; pump(d); w.retryT = T.setTimeout(again, RETRY_MS); };
            again();
          }, ACK_MS);
        }
      } else if (w.writes < REPEATS) {
        w.repeatT = T.setTimeout(() => { w.repeatT = null; if (d.want === w) { w.needWrite = true; pump(d); } }, REPEAT_GAP_MS);
      } else changed();
    }
    function onNotify(d, text) {
      if (text[0] === "A") {
        const n = +text.slice(1);
        const w = d.want;
        if (w && n === w.n && !w.acked) {
          w.acked = true; w.missing = false; w.latency = T.now() - w.firstAt; clearWantTimers(w);
          if (soak.on && w.kind === "call") soakAck(d, w);
          changed();
        }
      } else if (text[0] === "B") {
        const b = +text.slice(1);
        if (b >= 0 && b <= 100) { d.battery = b; changed(); }
      }
    }

    // ---------------------------------------------------------------- connecting
    async function link(d) {
      d.state = "connecting"; changed();
      const server = await d.device.gatt.connect();
      let svc;
      try { svc = await server.getPrimaryService(SVC); }
      catch (e) { try { d.device.gatt.disconnect(); } catch (e2) {} d.state = "noapp"; changed(); throw new Error("Open the PitchIQ app on the watch, then connect again."); }
      d.rx = await svc.getCharacteristic(RX);
      d.tx = await svc.getCharacteristic(TX);
      if (!d.txListen) {
        d.txListen = (ev) => { try { onNotify(d, dec.decode(ev.target.value)); } catch (e) {} };
        d.tx.addEventListener("characteristicvaluechanged", d.txListen);
      } else d.tx.addEventListener("characteristicvaluechanged", d.txListen);
      if (settings.receipt) await d.tx.startNotifications();
      d.notifying = !!settings.receipt;
      d.n = 0; d.want = null; d.writing = false; d.ops = []; d.backoff = 0;
      d.state = "ok";
      startHeartbeat();
      send(d, target || { kind: "clear" });
      changed();
    }
    function onDisconnect(d) {
      if (d.state === "closed") return;
      d.state = "lost"; d.writing = false; d.ops = [];
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
      d = { device, name: device.name || "Watch", state: "new", battery: null, n: 0, want: null, writing: false, hbDue: false, ops: [], backoff: 0, reT: null };
      device.addEventListener("gattserverdisconnected", () => onDisconnect(d));
      devs.push(d);
      if (device.id && !settings.ids.includes(device.id)) { settings.ids.push(device.id); saveSettings(); }
      return d;
    }
    async function connect() {
      if (!bt) throw new Error("This browser has no Bluetooth. Use Chrome on a computer or an Android device.");
      if (devs.filter((x) => x.state !== "closed").length >= MAX_WATCHES) throw new Error(`Up to ${MAX_WATCHES} watches.`);
      const device = await bt.requestDevice({ filters: [{ namePrefix: "Bangle" }], optionalServices: [SVC] });
      const d = addDevice(device);
      if (d.state === "ok") return d;
      await link(d);
      return d;
    }
    // after a reload: watches this browser was already allowed to use, without a tap where Chrome offers getDevices()
    async function restore() {
      if (!bt || typeof bt.getDevices !== "function" || !settings.ids.length) return 0;
      let n = 0;
      for (const device of await bt.getDevices()) {
        if (!settings.ids.includes(device.id) || devs.length >= MAX_WATCHES) continue;
        const d = addDevice(device);
        try { await link(d); n++; } catch (e) { onDisconnect(d); }
      }
      return n;
    }
    async function reconnect(name) {
      const d = devs.find((x) => x.name === name);
      if (!d) return connect();
      if (d.reT) { T.clearTimeout(d.reT); d.reT = null; }
      d.backoff = 0;
      await link(d);
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
      devs.splice(i, 1);
      settings.ids = settings.ids.filter((x) => x !== d.device.id); saveSettings();
      changed();
    }
    function setReceipt(on) {
      settings.receipt = !!on; saveSettings();
      for (const d of devs) {
        if (d.state !== "ok" || d.notifying === settings.receipt) continue;
        d.ops.push(() => (settings.receipt ? d.tx.startNotifications() : d.tx.stopNotifications()).then(() => { d.notifying = settings.receipt; }));
        pump(d);
      }
      changed();
    }

    // ---------------------------------------------------------------- the call
    // accept the call on screen: { gid, id, pitchNo, sign, quad, kind }
    function accept(c) {
      const loc = locCode(c.quad, c.kind);
      if (!signOk(c.sign)) throw new Error(`sign ${c.sign} can't go to the watch (1 to 9)`);
      if (!loc) throw new Error(`unknown spot ${c.quad}`);
      const chg = !!(lastAcc && lastAcc.gid === c.gid && lastAcc.pitchNo === c.pitchNo && lastAcc.id !== c.id);
      accepted = { gid: c.gid, id: c.id, pitchNo: c.pitchNo };
      lastAcc = accepted;
      target = { kind: "call", sign: String(c.sign), loc, chg };
      for (const d of devs) if (d.state === "ok") send(d, target);
      changed();
      return target;
    }
    // run on every render: the watches keep the accepted call only while it's still the call on screen at the same
    // pitch of the same game; anything else (a recorded pitch, a shake-off, a new call, undo, the third out) clears them
    function sync(cur) {
      if (!accepted) return false;
      if (cur && cur.gid === accepted.gid && cur.id === accepted.id && cur.pitchNo === accepted.pitchNo) return false;
      accepted = null;
      target = { kind: "clear" };
      for (const d of devs) if (d.state === "ok") send(d, target);
      changed();
      return true;
    }
    const isAccepted = (cur) => !!(accepted && cur && cur.gid === accepted.gid && cur.id === accepted.id && cur.pitchNo === accepted.pitchNo);

    // ---------------------------------------------------------------- what the coach sees
    function summary() {
      const list = devs.map((d) => {
        const w = d.want, isCall = !!(accepted && w && w.kind === "call");
        const delivered = d.state === "ok" && !!w && (settings.receipt ? w.acked : (!w.needWrite && w.writes >= 1));
        return { name: d.name, state: d.state, battery: d.battery, delivered: isCall && delivered, missing: isCall && d.state === "ok" && !!w.missing,
          latency: isCall && w.latency !== null ? w.latency : null };
      });
      return { supported: !!bt, receipt: settings.receipt, accepted: !!accepted, devices: list };
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
    function soakAck(d, w) {
      const st = soak.stats[d.name] || (soak.stats[d.name] = { sent: 0, ok: 0, late: 0, max: 0 });
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
        accept({ gid: "soak", id: soak.seq, pitchNo: soak.seq, sign: 1 + Math.floor(Math.random() * 6), quad: quads[Math.floor(Math.random() * quads.length)], kind: k });
        for (const d of devs) if (d.state === "ok") { const st = soak.stats[d.name] || (soak.stats[d.name] = { sent: 0, ok: 0, late: 0, max: 0 }); st.sent++; }
      };
      tick();
      soak.timer = T.setInterval(tick, everyMs || 5000);
    }
    function soakStop() { if (soak.timer) T.clearInterval(soak.timer); soak.timer = null; soak.on = false; return soakStats(); }
    function soakStats() {
      const out = {};
      for (const [k, v] of Object.entries(soak.stats)) out[k] = Object.assign({}, v, { missing: Math.max(0, v.sent - v.ok - v.late) });
      return out;
    }

    return { connect, restore, reconnect, forget, setReceipt, accept, sync, isAccepted, summary, line,
      soakStart, soakStop, soakStats, get receipt() { return settings.receipt; }, _devs: devs };
  }

  const PCWatch = { VERSION: "0.1.0", SVC, RX, TX, MAX_LEN, LOC, WORDS, locCode, sharedSigns, encode, create,
    supported: () => typeof navigator !== "undefined" && !!navigator.bluetooth };
  root.PCWatch = PCWatch;
  if (typeof module !== "undefined" && module.exports) module.exports = PCWatch;
})(typeof self !== "undefined" ? self : this);
