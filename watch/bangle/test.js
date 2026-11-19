/*
 * The watch app (pitchiq.app.js) run in Node against stand-ins for the Bangle.js 2 firmware (g, Bangle, NRF, E,
 * require("crypto")): what it registers, its pairing and security settings, what it draws for every spot, the buzzes,
 * the message rules under the game key and NO LINK. It can't show that the real watch draws, buzzes, pairs or links,
 * or how fast its AES is: that's the desk test on the watch (README). Run: node watch/bangle/test.js
 */
const fs = require("fs"), path = require("path"), vm = require("vm"), nodeCrypto = require("crypto");
const Sec = require("../../app/watch_sec.js");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const src = fs.readFileSync(path.join(__dirname, "pitchiq.app.js"), "utf8");

// firmwareAes: "good" (gives OpenSSL's answer), "bad" (wrong answers), or none
function firmware(o = {}) {
  let now = 0;
  const timers = [];
  const fw = { strings: [], rects: 0, circles: [], buzz: [], services: null, serviceOpts: null, updates: [], ui: null, options: null, lcd: 0, handlers: {}, font: 0,
    security: null, whitelist: null, sec: { connected: true, encrypted: true, mitm_protected: true, bonded: true } };
  const g = {
    getWidth: () => 176, getHeight: () => 176,
    reset() { return g; }, setBgColor() { return g; }, clearRect() { fw.strings = []; fw.rects = 0; fw.circles = []; return g; },
    setColor(c) { fw.color = c; return g; }, fillCircle(x, y, r) { fw.circles.push(fw.color); return g; }, setFontAlign() { return g; },
    setFont(n, s) { fw.font = s; return g; }, stringWidth: (t) => Math.round(t.length * fw.font * 0.62),
    drawString(t, x, y) { fw.strings.push({ t: String(t), size: fw.font, y, color: fw.color, w: Math.round(String(t).length * fw.font * 0.62) }); return g; },
    fillRect() { fw.rects++; return g; },
  };
  const aes = (block, key) => { const c = nodeCrypto.createCipheriv("aes-128-ecb", Buffer.from(key), null); c.setAutoPadding(false); return Array.from(c.update(Buffer.from(block))); };
  const ctx = {
    g, global: null, Date: { now: () => now }, Math, parseInt, JSON, String, Promise, Uint8Array,
    setTimeout: (f, ms) => { timers.push({ at: now + ms, f }); return timers.length; },
    setInterval: (f, ms) => { const t = { at: now + ms, f, every: ms }; timers.push(t); return timers.length; },
    clearInterval: () => {},
    E: { toString: (b) => Buffer.from(b).toString("latin1"), getBattery: () => 87 },
    Bangle: { buzz: (ms, s) => { fw.buzz.push(ms); return Promise.resolve(); }, setLCDPower: (v) => { fw.lcd += v; }, setUI: (o) => { fw.ui = o; }, setOptions: (o) => { fw.options = o; } },
    NRF: { setServices: (s, o) => { fw.services = s; fw.serviceOpts = o; }, updateServices: (s) => { fw.updates.push(s); }, on: (ev, f) => { fw.handlers[ev] = f; },
      setConnectionInterval: (v) => { fw.interval = v; }, setSecurity: (s) => { fw.security = s; }, getSecurityStatus: () => fw.sec, setWhitelist: (v) => { fw.whitelist = v; } },
  };
  if (o.firmwareAes) ctx.require = (m) => (m === "crypto" ? { AES: { encrypt: (block, key, opt) => { fw.aesCalls = (fw.aesCalls || 0) + 1; fw.aesMode = opt && opt.mode; const r = aes(block, key); if (o.firmwareAes === "bad") r[0] ^= 1; return r; } } } : undefined);
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  fw.advance = async (ms) => {
    const end = now + ms;
    while (now < end) {
      now += 50;
      for (const t of timers) if (t.at <= now && !t.done) { if (t.every) t.at += t.every; else t.done = true; t.f(); }
      await new Promise((r) => setImmediate(r));
    }
  };
  fw.writeBytes = (b) => fw.services[ctx.PQ_SVC][ctx.PQ_RX].onWrite({ data: Buffer.from(b) });
  fw.write = (text) => fw.services[ctx.PQ_SVC][ctx.PQ_RX].onWrite({ data: Buffer.from(text, "latin1") });
  // the coach's side, with the sender's crypto: a game key, then sealed messages
  fw.gameKey = new Uint8Array(nodeCrypto.randomBytes(16)); fw.keyId = 0x2a;
  fw.sendKey = () => fw.writeBytes(Sec.keyFrame(fw.keyId, fw.gameKey));
  fw.send = (n, m, inning = 1) => { const f = Sec.seal(Sec.inningKeys(fw.gameKey, inning), fw.keyId, inning, n, m); fw.writeBytes(f); return f; };
  fw.call = (n, sign, loc, chg = false, inning = 1) => fw.send(n, { kind: "call", sign: String(sign), loc, chg }, inning);
  fw.texts = () => fw.strings.map((s) => s.t);
  fw.ctx = ctx;
  fw.notifies = () => fw.updates.map((u) => u[ctx.PQ_SVC][ctx.PQ_TX].value);
  return fw;
}

(async () => {
  console.log("1. What the app registers");
  {
    const fw = firmware(), c = fw.ctx;
    const s = fw.services && fw.services[c.PQ_SVC];
    check(!!s && s[c.PQ_RX].writable && s[c.PQ_RX].maxLen === 20 && typeof s[c.PQ_RX].onWrite === "function", "its own service: a writable characteristic, 20 bytes, data handler");
    check(s[c.PQ_TX].notify === true && s[c.PQ_TX].readable === true, "a notify characteristic for receipts");
    check(c.PQ_SVC === require("../../app/watch.js").SVC && c.PQ_RX === require("../../app/watch.js").RX && c.PQ_TX === require("../../app/watch.js").TX, "the same UUIDs as the coach's app");
    check(!/\beval\s*\(|new Function/.test(src), "never runs code it receives (no eval)");
    check(fw.ui && fw.ui.mode === "custom" && typeof fw.ui.btn === "function" && fw.options && fw.options.btnLoadTimeout === 3000, "a short button press does nothing; hold 3 s to leave");
    check(fw.texts().includes("NO LINK"), "before the coach connects: NO LINK");
  }

  console.log("2. Pairing and security settings (what the firmware is asked for; the desk test checks it does it)");
  {
    const fw = firmware(), c = fw.ctx, rx = fw.services[c.PQ_SVC][c.PQ_RX];
    check(fw.security && /^\d{6}$/.test(fw.security.passkey) && fw.security.mitm === 1 && fw.security.display === 1, `passkey pairing: a 6-digit code shown on the watch (${fw.security && fw.security.passkey}), MITM protection`);
    check(rx.security && rx.security.write && rx.security.write.encrypted === true && rx.security.write.mitm === true, "writes need an encrypted, passkey-protected link");
    check(fw.whitelist === true, "once bonded, only bonded devices may connect (whitelist on)");
    fw.sec.bonded = false; fw.handlers.connect(); fw.handlers.disconnect();
    check(fw.texts().includes("Pair " + fw.security.passkey), "not bonded yet: the pair code is on the screen");
    fw.sec.bonded = true; fw.handlers.connect();
    check(!fw.texts().some((t) => /^Pair /.test(t)), "bonded: the code is gone");
    const p2 = firmware().security.passkey;
    check(typeof p2 === "string" && p2.length === 6, "each start makes its own code");
  }

  console.log("3. The game key");
  {
    const fw = firmware();
    fw.handlers.connect();
    check(fw.texts().includes("no key") && fw.rects === 1, "connected, no key yet: — and \"no key\"");
    fw.call(1, 3, "LO");
    check(fw.buzz.length === 0 && fw.texts().includes("no key"), "a call before the key: ignored, no buzz");
    fw.sec.encrypted = false; fw.sec.mitm_protected = false;
    fw.sendKey();
    check(fw.texts().includes("no key") && !fw.notifies().some((t) => t[0] === "K"), "the key over a link that isn't encrypted with the passkey: refused");
    fw.sec.encrypted = true; fw.sec.mitm_protected = true;
    fw.sendKey();
    check(!fw.texts().includes("no key") && fw.notifies().includes("K42"), "the key over the bonded link: taken (K42 back), \"no key\" gone");
    const core = src.slice(src.indexOf("function PQCore"), src.indexOf("// ------------------------------------------------------------------ on the watch"));
    check(!/Storage|writeJSON/.test(core), "the key is kept in memory only (nothing in the core writes to flash)");
  }

  console.log("4. What it shows");
  {
    const fw = firmware();
    fw.handlers.connect(); fw.sendKey();
    const cases = [["HI", ["HIGH AND", "INSIDE"]], ["HO", ["HIGH AND", "OUTSIDE"]], ["LI", ["LOW AND", "INSIDE"]], ["LO", ["LOW AND", "OUTSIDE"]],
      ["L", ["LOW"]], ["CH", ["CHASE", "HIGH"]], ["CL", ["CHASE", "LOW"]], ["M", []]];
    let n = 1;
    for (const [loc, words] of cases) {
      fw.call(n++, 3, loc);
      const t = fw.texts();
      check(t[0] === "3" && JSON.stringify(t.slice(1)) === JSON.stringify(words), `${loc}: ${t.join(" / ")}`);
      check(fw.strings.every((s) => s.w <= 176), `${loc}: every line fits the 176 px width (widest ${Math.max(...fw.strings.map((s) => s.w))} px, estimated)`);
      const tops = fw.strings.map((s) => [s.y - s.size / 2, s.y + s.size / 2]);
      check(tops.every(([a, b]) => a >= 0 && b <= 176) && tops.every((r, i) => i === 0 || r[0] >= tops[i - 1][1] - 1 || i === 1 && r[0] >= tops[0][1] - 1),
        `${loc}: fits the height, no overlap (sign ${fw.strings[0].size}px, ${tops.map(([a, b]) => `${Math.round(a)}-${Math.round(b)}`).join(", ")})`);
    }
    const signSize = fw.strings[0].size;
    check(signSize >= 140, `get it over: the sign alone, larger (${signSize})`);
    fw.send(n++, { kind: "clear" });
    check(!fw.texts().length && fw.rects === 1, "clear: back to — (no \"no key\": the key is held)");
  }

  console.log("5. Buzz, receipts, message rules");
  {
    const fw = firmware();
    fw.handlers.connect(); fw.sendKey();
    const m1 = fw.call(1, 5, "LO");
    check(fw.buzz.join() === "450" && fw.lcd === 1, "new call: one long buzz, backlight on");
    check(fw.notifies().includes("A1") && fw.notifies().includes("B87"), "receipt A1, and the battery once the coach's app is listening");
    fw.writeBytes(m1);
    check(fw.buzz.length === 1 && fw.notifies().slice(-1)[0] === "A1", "the same message again: receipt only, no buzz");
    fw.call(2, 1, "HI", true); await fw.advance(300);
    check(fw.buzz.slice(1).join() === "120,120", "changed call: two short buzzes");
    fw.writeBytes(m1);
    check(fw.texts()[0] === "1", "an older message (a replay of #1) is dropped");
    const before = fw.notifies().length;
    fw.write("C3,6,LO,0"); fw.write("S"); fw.write("X9");
    check(fw.notifies().length === before && fw.texts()[0] === "1", "plain-text calls, sessions and clears (the old format): not shown, no receipt");
    fw.handlers.disconnect();
    check(fw.texts().includes("NO LINK") && !fw.texts().includes("1"), "disconnect: NO LINK, call taken off");
    fw.handlers.connect();
    check(fw.interval === 20, "on connect it asks for a steady 20 ms link");
    fw.call(3, 2, "L");
    check(fw.texts()[0] === "2" && fw.buzz.length === 4, "reconnected: the next message shows and buzzes (the key survives a dropped link)");
    fw.send(4, { kind: "end" });
    check(fw.texts().includes("no key") && !fw.texts().includes("2"), "end of game: the key is wiped, — and \"no key\"");
    fw.call(5, 6, "CL");
    check(!fw.texts().includes("6") && fw.buzz.length === 4, "after the end, a call under the old key is ignored");
  }

  console.log("6. NO LINK without heartbeats");
  {
    const fw = firmware();
    fw.handlers.connect(); fw.sendKey();
    const m1 = fw.call(1, 4, "LI");
    for (let i = 0; i < 3; i++) { await fw.advance(3000); fw.writeBytes(m1); }
    check(fw.texts()[0] === "4", "heartbeats (the newest message repeated) every 3 s: the call stays");
    await fw.advance(7000);
    check(fw.texts().includes("NO LINK") && !fw.texts().includes("4"), "7 s without a message: NO LINK, call taken off");
    fw.write("H");
    check(!fw.texts().includes("4"), "a plain heartbeat while a key is held brings nothing back (it isn't authenticated)");
    const nb = fw.buzz.length;
    fw.writeBytes(m1);
    check(fw.texts()[0] === "4" && fw.buzz.length === nb, "the coach's app repeats the same message: the call goes back up, no buzz");
    await fw.advance(7000);
    fw.call(2, 6, "CL");
    check(fw.texts()[0] === "6" && fw.buzz.length === nb + 1, "after another quiet spell a newer message shows and buzzes as usual");
    fw.handlers.disconnect(); fw.handlers.connect();
    fw.writeBytes(Sec.seal(Sec.inningKeys(fw.gameKey, 1), fw.keyId, 1, 2, { kind: "call", sign: "6", loc: "CL", chg: false }));
    check(!fw.texts().includes("6"), "after a real disconnect nothing is held: the old message number doesn't bring the call back");
    fw.call(3, 6, "CL");
    check(fw.texts()[0] === "6" && fw.buzz.length === nb + 2, "the coach's app sends it again with a new number: shown, it buzzes");
    const f2 = firmware(); f2.handlers.connect(); await f2.advance(4000); f2.write("H"); await f2.advance(4000); f2.write("H");
    check(!f2.texts().includes("NO LINK") && f2.texts().includes("no key"), "with no key yet, a plain heartbeat keeps the link up");
  }

  console.log("7. The firmware's AES");
  {
    const good = firmware({ firmwareAes: "good" });
    check(good.ctx.PQSec.isNative() && good.aesMode === "ECB", "the firmware's AES gives the FIPS-197 answer: it's used (ECB, one block at a time)");
    good.handlers.connect(); good.sendKey(); good.aesCalls = 0; good.call(1, 3, "LO");
    check(good.texts()[0] === "3" && good.aesCalls > 0, `a call opens through the firmware's AES (${good.aesCalls} block operations for the first call of an inning)`);
    good.aesCalls = 0; good.call(2, 4, "HI");
    check(good.aesCalls > 0 && good.aesCalls <= 8, `the next call in the same inning: ${good.aesCalls} block operations (inning keys are cached)`);
    const bad = firmware({ firmwareAes: "bad" });
    check(!bad.ctx.PQSec.isNative(), "a firmware AES that gives the wrong answer isn't used: the app's own AES instead");
    bad.handlers.connect(); bad.sendKey(); bad.call(1, 3, "LO");
    check(bad.texts()[0] === "3", "and calls still open");
    const none = firmware();
    check(!none.ctx.PQSec.isNative(), "no firmware AES: the app's own");
  }

  console.log("8. Pairing-only mode (the fallback if AES is too slow)");
  {
    const fw = firmware();
    fw.handlers.connect();
    fw.sec.encrypted = false; fw.sec.mitm_protected = false;
    fw.write("P");
    check(fw.texts().includes("no key") && !fw.notifies().includes("P"), "P over a link that isn't passkey-bonded: refused");
    fw.sec.encrypted = true; fw.sec.mitm_protected = true;
    fw.write("P");
    check(!fw.texts().includes("no key") && fw.notifies().includes("P"), "P over the bonded link: a pairing-only session (P back), \"no key\" gone");
    fw.write("C1,5,LO,0");
    check(fw.texts()[0] === "5" && fw.texts().slice(1).join(" ") === "LOW AND OUTSIDE" && fw.buzz.join() === "450" && fw.notifies().includes("A1"), "a plain call shows, one long buzz, receipt A1");
    fw.write("C1,5,LO,0");
    check(fw.buzz.length === 1, "the same message again: no second buzz");
    fw.write("C2,1,HI,1"); await fw.advance(300);
    check(fw.texts()[0] === "1" && fw.buzz.slice(1).join() === "120,120", "a changed call: two short buzzes");
    fw.write("C1,6,CL,0");
    check(fw.texts()[0] === "1", "an older number (a replay) is dropped");
    fw.sec.mitm_protected = false; fw.write("C3,6,CL,0"); fw.sec.mitm_protected = true;
    check(fw.texts()[0] === "1", "a plain call over a link that has lost its passkey protection: refused");
    fw.write("X3");
    check(!fw.texts().length && fw.rects === 1, "a plain clear: back to —");
    fw.write("C4,2,L,0"); fw.write("E5");
    check(fw.texts().includes("no key") && !fw.texts().includes("2"), "a plain end of game: the session ends");
    fw.write("C6,3,HI,0");
    check(!fw.texts().includes("3"), "after it, plain calls are refused");
    fw.sendKey(); fw.write("C7,3,HI,0");
    check(!fw.texts().includes("3"), "with a game key (full mode), plain calls are refused");
    fw.write("P"); fw.write("C1,4,LI,0");
    check(fw.texts()[0] === "4", "a new P (a new session) starts the count again");
  }

  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
