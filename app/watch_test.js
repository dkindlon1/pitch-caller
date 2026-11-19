/*
 * The watch link (app/watch.js) against fake Bluetooth watches that run the real watch app's core
 * (watch/bangle/pitchiq.app.js, PQCore), on a fake clock. Chrome's rule is copied: a write while another GATT operation
 * is in progress is rejected. Plan: docs/plans/PLAN_watch_prototype_2026-11-15.md (rev 3). Run: node watch_test.js
 */
const W = require("./watch.js");
const Sec = require("./watch_sec.js");
const fs = require("fs"), path = require("path"), vm = require("vm");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };

// ---------------------------------------------------------------- the real watch core, loaded without Bangle
const appSrc = fs.readFileSync(path.join(__dirname, "../watch/bangle/pitchiq.app.js"), "utf8");
const appCtx = {}; vm.createContext(appCtx); vm.runInContext(appSrc, appCtx);
const PQCore = appCtx.PQCore;
// a write as the watch would read it, for the checks: K<id>, H, C<n>,<sign>,<loc>,<chg>, X<n>, HB<n>, E<n>, or "?" (fails)
function desc(core, bytes) {
  if (bytes.length === 18 && bytes[0] === 0x4b) return "K" + bytes[1];
  if (bytes.length === 16 && bytes[0] === 0x51) {
    if (!core.st.key) return "?nokey";
    const m = Sec.open(bytes, core.st.keyId, (i) => Sec.inningKeys(core.st.key, i));
    if (!m) return "?bad";
    return m.kind === "call" ? `C${m.n},${m.sign},${m.loc},${m.chg ? 1 : 0}` : m.kind === "clear" ? `X${m.n}` : m.kind === "hb" ? `HB${m.n}` : `E${m.n}`;
  }
  return String.fromCharCode.apply(null, bytes);
}
const bin = (bytes) => String.fromCharCode.apply(null, bytes);   // what E.toString(evt.data) gives the watch app

// ---------------------------------------------------------------- fake clock
function clock() {
  let now = 0, id = 0; const ts = new Map();
  const T = {
    now: () => now,
    setTimeout: (f, ms) => { const i = ++id; ts.set(i, { at: now + Math.max(0, ms), f, every: 0 }); return i; },
    clearTimeout: (i) => ts.delete(i),
    setInterval: (f, ms) => { const i = ++id; ts.set(i, { at: now + ms, f, every: ms }); return i; },
    clearInterval: (i) => ts.delete(i),
  };
  const flush = () => new Promise((r) => setImmediate(r));
  async function advance(ms, step = 5) {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + step);
      for (;;) {
        const due = [...ts.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [i, t] = due;
        if (t.every) t.at += t.every; else ts.delete(i);
        t.f();
        await flush(); await flush();
      }
      await flush(); await flush();
    }
  }
  return { T, advance, flush };
}

// ---------------------------------------------------------------- fake watch + Web Bluetooth
const enc = new TextEncoder(), dec = new TextDecoder();
function fakeWatch(T, name, o = {}) {
  const w = { name, writes: [], shown: [], buzzes: [], overlaps: 0, dropAcks: 0, inRange: true, hasApp: o.hasApp !== false, connected: false, notifying: false,
    silentConnect: false,   // the watch doesn't notice the reconnect (a reload where the radio link never dropped)
    blackhole: false,       // writes "succeed" but never arrive (a stalled link with no disconnect)
    failWrites: false,      // writes are refused
    bonded: o.bonded !== false,   // paired with the passkey: the link is encrypted and MITM-protected
    raw: [] };              // every write's bytes, for the replay and tamper checks
  const listeners = { disc: [] };
  w.core = PQCore({ draw: (v) => { w.view = v; }, buzz: (k) => w.buzzes.push(k), light: () => {}, now: T.now, secure: () => w.connected && w.bonded,
    notify: (t) => {
      if (!w.connected || !w.notifying) return;
      if (t[0] === "A" && w.dropAcks > 0) { w.dropAcks--; return; }
      T.setTimeout(() => { if (w.connected && w.notifying && tx.listener) tx.listener({ target: { value: new DataView(enc.encode(t).buffer) } }); }, 15);
    } });
  let busy = false;
  const op = (fn, ms = 20) => {
    if (busy) { w.overlaps++; return Promise.reject(new Error("GATT operation already in progress.")); }
    busy = true;
    return new Promise((res, rej) => T.setTimeout(() => { busy = false; if (!w.connected) return rej(new Error("GATT Server is disconnected.")); fn(); res(); }, ms));
  };
  const rx = { writeValueWithResponse: (bytes) => {
    if (w.failWrites) return Promise.reject(new Error("GATT Error: write failed"));
    return op(() => { const b = new Uint8Array(bytes); w.raw.push(b); w.writes.push(desc(w.core, b)); if (b.length > 20) w.tooLong = true; if (w.blackhole) return; w.core.onWrite(bin(b)); if (w.core.view().sign) w.shown.push(w.core.st.lastN + ":" + w.core.view().sign); }, o.writeMs || 20); } };
  const tx = { listener: null, addEventListener: (ev, f) => { tx.listener = f; },
    startNotifications: () => op(() => { w.notifying = true; }), stopNotifications: () => op(() => { w.notifying = false; }) };
  const svc = { getCharacteristic: async (u) => (u === W.RX ? rx : u === W.TX ? tx : Promise.reject(new Error("no such characteristic"))) };
  const server = { getPrimaryService: async (u) => { if (u !== W.SVC || !w.hasApp) throw new Error("No Services matching UUID found in Device."); return svc; } };
  w.device = {
    id: "id-" + name, name,
    addEventListener: (ev, f) => { if (ev === "gattserverdisconnected") listeners.disc.push(f); },
    gatt: {
      connect: () => new Promise((res, rej) => T.setTimeout(() => { if (!w.inRange) return rej(new Error("out of range")); w.connected = true; busy = false; if (!w.silentConnect) w.core.onConnect(); res(server); }, 30)),
      disconnect: () => { if (w.connected) { w.connected = false; w.notifying = false; w.core.onDisconnect(); listeners.disc.forEach((f) => f()); } },
    },
  };
  w.drop = () => { w.connected = false; w.notifying = false; busy = false; w.core.onDisconnect(); listeners.disc.forEach((f) => f()); };
  return w;
}
function fakeBluetooth(watches) {
  let next = 0;
  return { requestDevice: async (o) => {
    if (!o || !o.optionalServices || !o.optionalServices.includes(W.SVC)) throw new Error("service not requested");
    return watches[next++].device;
  } };
}
const mem = () => { const m = {}; return { getItem: (k) => m[k] || null, setItem: (k, v) => { m[k] = v; } }; };

(async () => {
  console.log("1. Location codes, signs, encoding");
  {
    const want = { "up-in": "HI", "up-away": "HO", "down-in": "LI", "down-away": "LO", "down-middle": "L", middle: "M" };
    check(Object.entries(want).every(([q, c]) => W.locCode(q, "FB") === c && W.locCode(q, "SL") === c), "the six zone spots map to HI HO LI LO L M for any pitch");
    check(["FB", "SI", "FC"].every((k) => W.locCode("chase", k) === "CH") && ["SL", "CB", "CH"].every((k) => W.locCode("chase", k) === "CL"),
      "chase is high for FB/SI/FC and low for SL/CB/CH (engine.js yTarget: 3.8 ft vs 1.2 ft)");
    const eng = fs.readFileSync(path.join(__dirname, "engine.js"), "utf8");
    check(/yTarget = \(q, kind\) => \(q === "chase" \? \(kind === "SL" \|\| kind === "CB" \|\| kind === "CH" \? 1\.2 : 3\.8\)/.test(eng), "the engine's own chase heights are still that rule");
    check(Sec.FRAME === 16 && Sec.KEY_FRAME === 18 && Sec.FRAME <= W.MAX_LEN && Sec.KEY_FRAME <= W.MAX_LEN, "a sealed message (16 bytes) and the game key (18) each fit one 20-byte write");
    check(Sec.LOCS.every((l) => l in W.WORDS) && Object.keys(W.WORDS).every((l) => Sec.LOCS.includes(l)), "every location code has a slot in the sealed message");
    check(Object.keys(W.WORDS).every((k) => k in appCtx.PQ_WORDS && JSON.stringify(W.WORDS[k]) === JSON.stringify(appCtx.PQ_WORDS[k])), "the sender's and the watch's words match");
    check(W.WORDS.M.length === 0 && W.WORDS.LO.join(" ") === "LOW AND OUTSIDE" && W.WORDS.L.join(" ") === "LOW", "get it over says nothing; low and outside; keep it down = LOW");
    const SIGN = { FB: 1, CB: 2, SL: 3, CH: 4, SI: 5, FC: 6 }, signOf = (k, s) => String(s || SIGN[k]);
    const sh = W.sharedSigns([{ name: "Slider", kind: "SL" }, { name: "Sweeper", kind: "SL" }, { name: "Fastball", kind: "FB" }, { name: "Old", kind: "SL", active: false }], signOf);
    check(sh.length === 1 && sh[0].sign === "3" && sh[0].names.join() === "Slider,Sweeper", "two active sliders share sign 3 (an inactive one doesn't count)");
    check(W.sharedSigns([{ name: "Slider", kind: "SL" }, { name: "Sweeper", kind: "SL", sign: 7 }], signOf).length === 0, "giving one its own number clears it");
  }

  console.log("2. One watch: connect, accept, clear");
  {
    const { T, advance } = clock();
    const a = fakeWatch(T, "Bangle.js a1"), bt = fakeBluetooth([a]);
    const L = W.create({ bluetooth: bt, timers: T, storage: mem() });
    const p = L.connect(); await advance(200); await p;
    check(L.summary().devices[0].state === "ok" && a.writes.length === 0 && a.view.link && !a.view.sign && a.view.nokey, "connected before a game: nothing sent; the watch shows — and \"no key\"");
    await advance(3100);
    check(a.writes.join() === "H" && a.view.link, "no game key yet: a plain heartbeat keeps the link up (nothing can be shown without a key)");
    check(L.line().text === "Watch ready", `line before a call: "${L.line().text}"`);
    const cur = { gid: "g", id: 1, pitchNo: 0 };
    L.accept(Object.assign({ sign: 3, quad: "down-away", kind: "SL" }, cur)); await advance(300);
    check(a.view.sign === "3" && a.view.words.join(" ") === "LOW AND OUTSIDE" && a.buzzes.join() === "new", "accepted: 3 / LOW AND OUTSIDE, one long buzz");
    check(/^K\d+$/.test(a.writes[1]) && a.writes[2] === "C1,3,LO,0" && !a.view.nokey && L.summary().devices[0].keyed, `the first accept of a game sends the game key first, then the sealed call (${a.writes.slice(1, 3).join(" ")})`);
    check(a.raw.slice(2).every((b) => b.length === 16 && !/LO|C1/.test(bin(b))), "nothing readable on the air: every message after the key is a 16-byte sealed frame");
    check(L.line().text === "On the watch ✓" && L.isAccepted(cur), `line after the receipt: "${L.line().text}"`);
    check(!L.sync(cur), "same call on screen: nothing sent");
    // the pitch is recorded and the next call is the same pitch and spot: it must still reach the watch (review 1)
    L.sync({ gid: "g", id: 2, pitchNo: 1 }); await advance(200);
    check(!a.view.sign, "recorded pitch: the watch is cleared");
    L.accept({ gid: "g", id: 2, pitchNo: 1, sign: 3, quad: "down-away", kind: "SL" }); await advance(300);
    check(a.view.sign === "3" && a.buzzes.join() === "new,new", "the same call again after a pitch is sent and buzzes again");
    // shake-off: a new call at the same pitch number is a change (review 10)
    L.sync({ gid: "g", id: 3, pitchNo: 1 }); await advance(200);
    L.accept({ gid: "g", id: 3, pitchNo: 1, sign: 1, quad: "middle", kind: "FB" }); await advance(300);
    check(a.view.sign === "1" && a.view.words.length === 0 && a.buzzes.slice(-1)[0] === "changed", "shake-off then accept: 1 alone (get it over), two short buzzes");
    // undo: an older call comes back on screen; it needs Accept again
    L.sync({ gid: "g", id: 4, pitchNo: 2 }); await advance(200);
    L.sync({ gid: "g", id: 3, pitchNo: 1 });
    check(!L.isAccepted({ gid: "g", id: 3, pitchNo: 1 }) && !a.view.sign, "after undo the restored call isn't on the watch until it's accepted again");
    L.accept({ gid: "g", id: 3, pitchNo: 1, sign: 1, quad: "middle", kind: "FB" }); await advance(300);
    check(a.view.sign === "1", "accepted again after undo");
    // inning over: the call is gone
    L.sync(null); await advance(200);
    check(!a.view.sign && a.overlaps === 0, `third out (no call): cleared; overlapping writes ${a.overlaps}`);
    check(!a.tooLong, "no write over 20 bytes");
    let bad = false; try { L.accept({ gid: "g", id: 9, pitchNo: 3, sign: 0, quad: "middle", kind: "FB" }); } catch (e) { bad = true; }
    check(bad, "a sign outside 1-9 isn't sent");
  }

  console.log("3. Lost receipts, retries and the write queue");
  {
    const { T, advance } = clock();
    const a = fakeWatch(T, "Bangle.js a1", { writeMs: 40 }), bt = fakeBluetooth([a]);
    const L = W.create({ bluetooth: bt, timers: T, storage: mem() });
    const p = L.connect(); await advance(200); await p;
    a.dropAcks = 2;   // the next two receipts are lost
    L.accept({ gid: "g", id: 1, pitchNo: 0, sign: 2, quad: "up-in", kind: "CB" });
    await advance(1100);
    check(L.line().tone === "change" && /Not on Bangle\.js a1/.test(L.line().text), `no receipt after 1 s: "${L.line().text}"`);
    await advance(2500);
    check(L.line().text === "On the watch ✓", `re-sent until the receipt came: "${L.line().text}"`);
    const c2 = a.writes.filter((t) => /^C\d+,2,HI,0$/.test(t)).length;
    check(a.buzzes.length === 1 && c2 >= 2, `re-sent ${c2} times, buzzed ${a.buzzes.length} time (repeats only get a receipt)`);
    // rapid calls while heartbeats run: no overlapping writes, the watch ends on the newest and never goes backwards
    for (let i = 2; i <= 8; i++) { L.sync({ gid: "g", id: i, pitchNo: i }); L.accept({ gid: "g", id: i, pitchNo: i, sign: 1 + (i % 6), quad: "up-away", kind: "FB" }); await advance(10); }
    await advance(4000);
    const ns = a.shown.map((s) => +s.split(":")[0]);
    check(a.overlaps === 0, `overlapping writes under rapid calls and heartbeats: ${a.overlaps}`);
    check(ns.length > 0 && ns.every((n, i) => i === 0 || n >= ns[i - 1]), `the watch never shows an older call after a newer one (${[...new Set(ns)].join(" ")})`);
    check(a.view.sign === String(1 + (8 % 6)) && L.line().text === "On the watch ✓", `ends on the newest call (${a.view.sign})`);
    const lastMsg = a.writes.filter((t) => t[0] === "C").slice(-1)[0];
    check(a.writes.filter((t) => t === lastMsg).length >= 2 && a.buzzes.length === 1 + new Set(a.writes.filter((t) => t[0] === "C").map((t) => t.split(",")[0])).size - 1,
      "heartbeats repeat the newest message, and a repeat never buzzes again");
  }

  console.log("4. Dropped link, reconnect, reload");
  {
    const { T, advance } = clock();
    const a = fakeWatch(T, "Bangle.js a1"), bt = fakeBluetooth([a]);
    const L = W.create({ bluetooth: bt, timers: T, storage: mem() });
    const p = L.connect(); await advance(200); await p;
    L.accept({ gid: "g", id: 1, pitchNo: 0, sign: 4, quad: "down-in", kind: "CH" }); await advance(300);
    const before = a.core.st.lastN;
    a.inRange = false; a.drop();
    check(!a.view.link && !a.view.sign, "the watch shows NO LINK at once and takes the call off");
    check(L.line().tone === "change" && /No link/.test(L.line().text), `coach: "${L.line().text}"`);
    await advance(5000);
    check(L.summary().devices[0].state === "lost", "out of range: still lost, retrying");
    a.inRange = true; await advance(11000);
    check(L.summary().devices[0].state === "ok", "back in range: reconnected by itself, no tap");
    const back = a.writes.filter((t) => /^C\d+,4,LI,0$/.test(t)).map((t) => +t.slice(1).split(",")[0]);
    check(back.length >= 2 && Math.max(...back) > before && a.view.sign === "4" && a.buzzes.slice(-1)[0] === "new", `message numbers carry on (was ${before}, now ${Math.max(...back)}: never repeated under the key); the watch shows the accepted call again as new`);
    // a page reload: a new sender with fresh numbers, the watch last saw a higher number
    a.core.st.lastN = 9;
    const L2 = W.create({ bluetooth: fakeBluetooth([a]), timers: T, storage: mem() });
    a.device.gatt.disconnect(); L.forget("Bangle.js a1");
    const p2 = L2.connect(); await advance(300); await p2;
    L2.accept({ gid: "g2", id: 1, pitchNo: 0, sign: 6, quad: "chase", kind: "FC" }); await advance(300);
    check(a.view.sign === "6" && a.view.words.join(" ") === "CHASE HIGH", "after a reload a new game key resets the watch's count: 6 / CHASE HIGH");
    // the watch app isn't open
    const b = fakeWatch(T, "Bangle.js b2", { hasApp: false });
    const L3 = W.create({ bluetooth: fakeBluetooth([b]), timers: T, storage: mem() });
    let msg = ""; const p3 = L3.connect().catch((e) => { msg = e.message; }); await advance(300); await p3;
    check(/Open the PitchIQ app on the watch/.test(msg), `watch app not open: "${msg}"`);
  }

  console.log("5. Receipt off (one-way)");
  {
    const { T, advance } = clock();
    const a = fakeWatch(T, "Bangle.js a1"), bt = fakeBluetooth([a]);
    const L = W.create({ bluetooth: bt, timers: T, storage: mem() });
    L.setReceipt(false);
    const p = L.connect(); await advance(200); await p;
    check(!a.notifying, "no notifications subscribed: nothing comes back from the watch");
    L.accept({ gid: "g", id: 1, pitchNo: 0, sign: 3, quad: "up-in", kind: "SL" }); await advance(800);
    check(a.writes.filter((t) => /^C\d+,3,HI,0$/.test(t)).length >= 3 && a.buzzes.length === 1, "written 3 times (plus heartbeat repeats), buzzed once");
    check(L.line().text === "Sent (no receipt)", `line: "${L.line().text}"`);
    L.setReceipt(true); await advance(300);
    check(a.notifying && a.overlaps === 0, "turned back on: notifications start through the same queue");
  }

  console.log("6. Two watches");
  {
    const { T, advance } = clock();
    const a = fakeWatch(T, "Bangle.js a1"), b = fakeWatch(T, "Bangle.js b2"), c = fakeWatch(T, "Bangle.js c3");
    const L = W.create({ bluetooth: fakeBluetooth([a, b, c]), timers: T, storage: mem() });
    let p = L.connect(); await advance(200); await p; p = L.connect(); await advance(200); await p;
    let third = ""; await L.connect().catch((e) => { third = e.message; });
    check(/Up to 2/.test(third), "a third watch is refused");
    L.accept({ gid: "g", id: 1, pitchNo: 0, sign: 2, quad: "down-middle", kind: "CB" }); await advance(300);
    check(a.view.sign === "2" && b.view.sign === "2" && a.view.words.join() === "LOW" && JSON.stringify(a.view) === JSON.stringify(b.view), "both watches show the same: 2 / LOW");
    check(L.line().text === "On both watches ✓", `line: "${L.line().text}"`);
    L.sync({ gid: "g", id: 2, pitchNo: 1 }); await advance(200);
    b.dropAcks = 2;   // the call's receipt from b2 is lost, and the first re-send's too
    L.accept({ gid: "g", id: 2, pitchNo: 1, sign: 1, quad: "up-away", kind: "FB" }); await advance(1100);
    check(/Not on Bangle\.js b2/.test(L.line().text) && !/a1/.test(L.line().text), `one watch missed: "${L.line().text}"`);
    b.drop(); b.inRange = false;
    check(/No link to Bangle\.js b2/.test(L.line().text), `one watch lost: "${L.line().text}"`);
  }

  console.log("7. A quiet link, a silent reconnect, failures");
  {
    const { T, advance } = clock();
    const a = fakeWatch(T, "Bangle.js a1"), bt = fakeBluetooth([a]);
    const L = W.create({ bluetooth: bt, timers: T, storage: mem() });
    const p = L.connect(); await advance(200); await p;
    L.accept({ gid: "g", id: 1, pitchNo: 0, ab: "1|0", sign: 2, quad: "up-in", kind: "CB" }); await advance(300);
    // review I3: a stalled link with no disconnect: the watch goes NO LINK and takes the call off, the coach's screen
    // still says delivered; when the link comes back the heartbeat repeats the message and the call goes back up
    a.blackhole = true;
    for (let t = 0; t < 8; t++) { await advance(1000); a.core.tick(); }
    check(!a.view.link && !a.view.sign, "8 s with nothing arriving: the watch shows NO LINK, call off");
    a.blackhole = false; await advance(3500);
    check(a.view.link && a.view.sign === "2" && a.buzzes.length === 1, "link back: the heartbeat repeats the message and the call goes back up, no second buzz");
    // review I5: a reload where the watch never noticed the link drop: the new page's game key resets its count
    a.core.st.lastN = 40;
    L._devs[0].state = "closed";   // the old page is gone (no disconnect reaches the watch)
    const L2 = W.create({ bluetooth: fakeBluetooth([a]), timers: T, storage: mem() });
    a.silentConnect = true;
    const p2 = L2.connect(); await advance(300); await p2;
    L2.accept({ gid: "g2", id: 1, pitchNo: 0, ab: "1|0", sign: 5, quad: "down-away", kind: "SI" }); await advance(300);
    check(a.view.sign === "5" && a.view.words.join(" ") === "LOW AND OUTSIDE", "the watch never saw a disconnect: the new game key reset it, the new page's call shows");
    a.silentConnect = false;
    // a reconnect re-sends the call as new (one long buzz), never as a change
    L2.sync({ gid: "g2", id: 2, pitchNo: 0 }); await advance(200);
    L2.accept({ gid: "g2", id: 2, pitchNo: 0, ab: "1|0", sign: 1, quad: "up-away", kind: "FB" }); await advance(300);
    check(a.buzzes.slice(-1)[0] === "changed", "a changed call before the pitch: two short buzzes");
    a.inRange = false; a.drop(); a.inRange = true; await advance(3000);
    check(a.view.sign === "1" && a.buzzes.slice(-1)[0] === "new" && a.writes.some((t) => /^C\d+,1,HO,0$/.test(t)), "after a reconnect the same call comes back as new (chg 0), not as a change");
    // the first call of a new inning after a third out with no pitch (same pitch number) isn't a change
    L2.sync(null); await advance(200);
    L2.accept({ gid: "g2", id: 3, pitchNo: 0, ab: "2|0", sign: 3, quad: "middle", kind: "SL" }); await advance(300);
    check(a.buzzes.slice(-1)[0] === "new", "a new inning at the same pitch number: one long buzz");
    // a write that keeps failing still shows as missing after 1 s
    a.failWrites = true;
    L2.sync({ gid: "g2", id: 4, pitchNo: 1 }); L2.accept({ gid: "g2", id: 4, pitchNo: 1, ab: "2|0", sign: 4, quad: "down-in", kind: "CH" }); await advance(1300);
    check(/Not on Bangle\.js a1/.test(L2.line().text), `writes refused: "${L2.line().text}"`);
    a.failWrites = false; await advance(1500);
    check(L2.line().text === "On the watch ✓" && a.view.sign === "4", "writes accepted again: delivered");
    // turning the receipt off while a call is unconfirmed doesn't leave "Not on" behind
    a.dropAcks = 99;
    L2.sync({ gid: "g2", id: 5, pitchNo: 2 }); L2.accept({ gid: "g2", id: 5, pitchNo: 2, ab: "2|1", sign: 6, quad: "chase", kind: "FC" }); await advance(1300);
    check(/Not on/.test(L2.line().text), "receipts lost: Not on…");
    L2.setReceipt(false); await advance(800);
    check(L2.line().text === "Sent (no receipt)", `receipt switched off: "${L2.line().text}"`);
    a.dropAcks = 0; L2.setReceipt(true); await advance(1500);
    check(L2.line().text === "On the watch ✓" && a.overlaps === 0, `receipt back on: the call is sent again and confirmed ("${L2.line().text}"); overlaps ${a.overlaps}`);
    // a reconnect tap that fails keeps retrying by itself, and one disconnect schedules one retry
    a.inRange = false; a.drop(); a.drop();
    const pending = L2._devs[0].reT;
    check(!!pending, "two disconnect events: one retry scheduled");
    let err = ""; const rp = L2.reconnect("Bangle.js a1").catch((e) => { err = e.message; });
    await advance(100); await rp;
    check(err && L2.summary().devices[0].state === "lost" && !!L2._devs[0].reT, `Reconnect while out of range fails ("${err}") and automatic retries carry on`);
    a.inRange = true; await advance(12000);
    check(L2.summary().devices[0].state === "ok", "back in range: reconnected");
  }

  console.log("8. Soak mode");
  {
    const { T, advance } = clock();
    const a = fakeWatch(T, "Bangle.js a1"), bt = fakeBluetooth([a]);
    const L = W.create({ bluetooth: bt, timers: T, storage: mem() });
    const p = L.connect(); await advance(200); await p;
    L.soakStart(5000);
    for (let i = 0; i < 60; i++) { await advance(5000 - (i === 59 ? 1 : 0), 20); L.sync({ gid: "g", id: i, pitchNo: i }); }   // renders during the soak don't clear its calls (review I4)
    const st = L.soakStop()["Bangle.js a1"];
    check(st && st.sent === 60 && st.ok === 60 && st.missing === 0 && a.overlaps === 0, `60 calls in 5 minutes: ${JSON.stringify(st)}`);
  }

  console.log("9. Security (docs/PLAN_watch_security_2026-11-18.md proof 2, 4, 5)");
  {
    const { T, advance } = clock();
    const a = fakeWatch(T, "Bangle.js a1"), bt = fakeBluetooth([a]);
    const L = W.create({ bluetooth: bt, timers: T, storage: mem() });
    const p = L.connect(); await advance(200); await p;
    L.accept({ gid: "s1", id: 1, pitchNo: 0, inning: 1, ab: "1|0", sign: 2, quad: "up-in", kind: "CB" }); await advance(300);
    const call1 = a.raw[a.raw.length - 1];
    L.sync({ gid: "s1", id: 2, pitchNo: 1, inning: 1 }); await advance(200);
    L.accept({ gid: "s1", id: 2, pitchNo: 1, inning: 1, ab: "1|1", sign: 4, quad: "down-away", kind: "CH" }); await advance(300);
    const call2 = a.raw[a.raw.length - 1];
    check(a.view.sign === "4", "the watch shows the newest call (4)");
    const inject = (bytes) => { const before = { buzz: a.buzzes.length, sign: a.view.sign, rej: a.core.st.rejected }; a.core.onWrite(bin(bytes)); return { buzzed: a.buzzes.length > before.buzz, changed: a.view.sign !== before.sign, rejected: a.core.st.rejected > before.rej }; };
    // tampered: every single bit of the frame flipped in turn
    let tamperOk = 0;
    for (let i = 0; i < 16; i++) for (let bit = 0; bit < 8; bit++) {
      const t = new Uint8Array(call2); t[i] ^= 1 << bit;
      const r = inject(t); if (r.rejected && !r.buzzed && !r.changed) tamperOk++;
    }
    check(tamperOk === 128, `tampered: all 128 one-bit changes of a captured call are rejected, no buzz, nothing shown (${tamperOk}/128)`);
    // replayed: an older captured call, and the current one again
    let r = inject(call1);
    check(r.rejected && !r.buzzed && a.view.sign === "4", "replayed: an older captured call is rejected (the watch keeps 4, no buzz)");
    r = inject(call2);
    check(!r.buzzed && a.view.sign === "4", "the current call written again is only a repeat: no second buzz");
    // a forged call: right header, made-up body and tag
    const forged = new Uint8Array(call2); forged[4] = (forged[4] + 1) & 0xff; for (let i = 5; i < 16; i++) forged[i] = (i * 37) & 0xff;
    r = inject(forged);
    check(r.rejected && !r.buzzed, "forged: a newer message number with a made-up tag is rejected");
    // plain text: the old prototype's call format is ignored
    r = inject(enc.encode("C99,6,CL,0"));
    check(r.rejected && !r.buzzed && a.view.sign === "4", "a plain-text call (the old format) is ignored");
    // inning rotation: inning 2 then 3 work with nothing new sent between innings; an inning-2 message after inning 3 is rejected
    L.sync({ gid: "s1", id: 3, pitchNo: 2, inning: 2 }); await advance(200);
    L.accept({ gid: "s1", id: 3, pitchNo: 2, inning: 2, ab: "2|0", sign: 1, quad: "middle", kind: "FB" }); await advance(300);
    const inn2 = a.raw[a.raw.length - 1];
    const keysBefore = a.writes.filter((t) => t[0] === "K").length;
    L.sync({ gid: "s1", id: 4, pitchNo: 3, inning: 3 }); await advance(200);
    L.accept({ gid: "s1", id: 4, pitchNo: 3, inning: 3, ab: "3|0", sign: 5, quad: "down-in", kind: "SI" }); await advance(300);
    check(a.view.sign === "5" && a.core.st.inning === 3 && inn2[2] === 2 && a.raw[a.raw.length - 1][2] === 3 && a.writes.filter((t) => t[0] === "K").length === keysBefore,
      "innings 2 and 3: each call under its own inning's key, no new key sent between innings");
    r = inject(inn2);
    check(r.rejected && a.view.sign === "5", "wrong inning: a captured inning-2 call after inning 3 is rejected");
    // the same body sealed under inning 3's keys but labelled inning 4: the tag doesn't hold
    const relabel = new Uint8Array(a.raw[a.raw.length - 1]); relabel[2] = 4; relabel[4] = (relabel[4] + 5) & 0xff;
    r = inject(relabel);
    check(r.rejected && !r.buzzed, "a frame relabelled to a later inning fails its check");
    // extra innings: 10 through 12 derive the same keys on both sides
    for (const inn of [10, 11, 12]) {
      L.sync({ gid: "s1", id: 10 + inn, pitchNo: 10 + inn, inning: inn }); await advance(200);
      L.accept({ gid: "s1", id: 10 + inn, pitchNo: 10 + inn, inning: inn, ab: `${inn}|0`, sign: 1 + (inn % 6), quad: "up-away", kind: "FB" }); await advance(300);
    }
    check(a.view.sign === String(1 + (12 % 6)) && a.core.st.inning === 12, "extra innings (10, 11, 12): the watch follows");
    // wrong game: the next game gets a new key; a call captured from the last game is rejected
    const oldGame = a.raw[a.raw.length - 1];
    L.sync(null); await advance(200);
    L.accept({ gid: "s2", id: 1, pitchNo: 0, inning: 1, ab: "1|0", sign: 3, quad: "up-in", kind: "SL" }); await advance(300);
    check(a.view.sign === "3" && a.writes.filter((t) => t[0] === "K").length === keysBefore + 1, "a new game: a new key goes to the watch before its first call");
    r = inject(oldGame);
    check(r.rejected && !r.buzzed && a.view.sign === "3", "wrong game: a call captured in the last game is rejected");
    // end of game: the watch wipes the key; a captured call from the ended game is rejected
    const lastCall = a.raw[a.raw.length - 1];
    L.endGame(); await advance(300);
    check(a.view.nokey && !a.view.sign && a.core.st.key === null, "end game: the watch wipes the key (— and \"no key\")");
    r = inject(lastCall);
    check(r.rejected && !r.buzzed && !a.view.sign, "after the end of the game a captured call is rejected");
    await advance(2500);
    check(!L.summary().game, "the coach's app drops the key too");
    // the key only over a bonded link
    a.bonded = false;
    const stolenKey = Sec.keyFrame(7, new Uint8Array(16).fill(9));
    r = inject(stolenKey);
    check(r.rejected && a.core.st.key === null, "a game key written over a link that isn't passkey-bonded is refused");
    a.bonded = true;
    // expiry: a key nobody ended is wiped after 6 hours (fake clock)
    L.accept({ gid: "s3", id: 1, pitchNo: 0, inning: 1, ab: "1|0", sign: 2, quad: "up-in", kind: "CB" }); await advance(300);
    check(a.core.st.key !== null && a.view.sign === "2", "a third game: keyed, call shown");
    // the coach's laptop goes away without ending the game (the watch keeps the key over a dropped link); the fake clock
    // runs on, the watch's own once-a-second tick doing the checking
    const keyedAt = a.core.st.keyAt;
    L.forget("Bangle.js a1"); await advance(100);
    check(a.core.st.key !== null, "the link dropped without an end-of-game: the key is still held");
    const tickT = T.setInterval(() => a.core.tick(), 1000);
    await advance(keyedAt + 6 * 3600 * 1000 - 1000 - T.now(), 1000);
    check(a.core.st.key !== null, `5 h 59 m 59 s on the fake clock: the key is still there`);
    await advance(2000, 1000);
    check(a.core.st.key === null, "past 6 hours with no end-of-game: the key is wiped");
    T.clearInterval(tickT);
    // size: every write this whole section fit one Bluetooth write
    check(!a.tooLong && a.raw.every((b) => b.length <= 20) && a.raw.filter((b) => b[0] === 0x51).every((b) => b.length === 16), `every write fits 20 bytes (largest ${Math.max(...a.raw.map((b) => b.length))})`);
    check(a.overlaps === 0, "no overlapping writes");
    // a removed watch gets no key, and the coach's app forgets it
    const b = fakeWatch(T, "Bangle.js r9");
    let gone = false;
    const L2 = W.create({ bluetooth: fakeBluetooth([b]), timers: T, storage: mem(), removed: (dev) => gone && dev.id === b.device.id });
    const p2 = L2.connect(); await advance(200); await p2;
    gone = true;
    L2.accept({ gid: "r", id: 1, pitchNo: 0, inning: 1, sign: 2, quad: "up-in", kind: "CB" }); await advance(300);
    check(!b.writes.some((t) => t[0] === "K") && !b.view.sign && L2.summary().devices.length === 0, "a watch removed from the team gets no key and is forgotten");
  }

  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
