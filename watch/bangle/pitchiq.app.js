/*
 * PitchIQ watch (prototype, docs/plans/PLAN_watch_prototype_2026-11-15.md rev 3), for Bangle.js 2.
 *
 * Shows only the call the coach accepted: the catcher's sign, large, and the location in words under it ("get it over"
 * shows the sign alone). Both watches, pitcher's and catcher's, look the same: inside and outside are the hitter's.
 * One long buzz = a new call; two short buzzes = the call changed before the pitch. "—" between calls.
 *
 * The coach's app (app/watch.js) writes to this app's own Bluetooth service. It takes data, never code, so the watch's
 * "Programmable" setting can stay off except while uploading this file.
 * Security (docs/PLAN_watch_security_2026-11-18.md): the watch pairs with a passkey it shows (bonded after that); the
 * coach's app writes a fresh game key over the bonded link (K frame, kept in memory only); every call, clear,
 * heartbeat and end-of-game is then a 16-byte frame encrypted and authenticated with that inning's key (PQSec below,
 * the same code as app/watch_sec.js). A frame that fails the check, repeats an older message number, comes from an
 * earlier inning or another game is dropped silently: no buzz, nothing shown. "End of game" or 6 hours wipes the key.
 *   K<id><16 bytes>  game key (only over an encrypted, passkey-bonded link)   <16-byte frame>  call / clear / heartbeat / end
 *   H (plain)        liveness only, and only while the watch holds no key (nothing can be shown without one)
 * Back to the coach, by notification (only while the coach has "Delivery receipt" on): A<n> receipt, B<pct> battery,
 * K<id> key received. Message numbers count up through the game; an older number is dropped; the same number again only
 * gets its receipt again, no second buzz. No message for 6 s, or a disconnect: NO LINK, and the call is taken off the
 * screen. If the link comes back and the coach's app repeats that same message (it's still the call), it goes back up
 * without a buzz; a newer message shows and buzzes as usual.
 * Plan: docs/plans/PLAN_watch_prototype_2026-11-15.md (rev 3).
 */
var PQ_SVC = "7a1d0001-5c3e-4b8f-9a62-2f0c8e4d1b70";
var PQ_RX = "7a1d0002-5c3e-4b8f-9a62-2f0c8e4d1b70";
var PQ_TX = "7a1d0003-5c3e-4b8f-9a62-2f0c8e4d1b70";
var PQ_WORDS = { HI: ["HIGH AND", "INSIDE"], HO: ["HIGH AND", "OUTSIDE"], LI: ["LOW AND", "INSIDE"], LO: ["LOW AND", "OUTSIDE"],
  L: ["LOW"], M: [], CH: ["CHASE", "HIGH"], CL: ["CHASE", "LOW"] };
var PQ_LINK_MS = 6000;
var PQ_KEY_MS = 6 * 3600 * 1000;   // a game key nobody ended expires after 6 hours

/*PQSEC-BEGIN*/
var PQSec = (function () {
  var SBOX = [], INV = [], RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
  (function () {   // the S-box from the GF(2^8) inverse and the affine map (no table to mistype)
    var p = 1, q = 1, i;
    for (i = 0; i < 256; i++) SBOX[i] = 0;
    do {
      p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
      q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09;
      var x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
      SBOX[p] = (x ^ 0x63) & 0xff;
    } while (p !== 1);
    SBOX[0] = 0x63;
    for (i = 0; i < 256; i++) INV[SBOX[i]] = i;
  })();
  function xt(a) { return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff; }
  function expand(key) {   // 176 bytes of round keys
    var w = new Uint8Array(176), i, t0, t1, t2, t3, tt;
    for (i = 0; i < 16; i++) w[i] = key[i];
    for (i = 16; i < 176; i += 4) {
      t0 = w[i - 4]; t1 = w[i - 3]; t2 = w[i - 2]; t3 = w[i - 1];
      if (i % 16 === 0) { tt = t0; t0 = SBOX[t1] ^ RCON[i / 16 - 1]; t1 = SBOX[t2]; t2 = SBOX[t3]; t3 = SBOX[tt]; }
      w[i] = w[i - 16] ^ t0; w[i + 1] = w[i - 15] ^ t1; w[i + 2] = w[i - 14] ^ t2; w[i + 3] = w[i - 13] ^ t3;
    }
    return w;
  }
  function jsBlock(w, input) {   // encrypt one 16-byte block with expanded key w
    var s = new Uint8Array(16), t = new Uint8Array(16), r, c, i;
    for (i = 0; i < 16; i++) s[i] = input[i] ^ w[i];
    for (r = 1; r <= 10; r++) {
      for (i = 0; i < 16; i++) t[i] = SBOX[s[(i + 4 * (i % 4)) % 16]];   // SubBytes + ShiftRows
      if (r < 10) {
        for (c = 0; c < 16; c += 4) {
          var a0 = t[c], a1 = t[c + 1], a2 = t[c + 2], a3 = t[c + 3], all = a0 ^ a1 ^ a2 ^ a3;
          s[c] = a0 ^ all ^ xt(a0 ^ a1); s[c + 1] = a1 ^ all ^ xt(a1 ^ a2); s[c + 2] = a2 ^ all ^ xt(a2 ^ a3); s[c + 3] = a3 ^ all ^ xt(a3 ^ a0);
        }
      } else for (i = 0; i < 16; i++) s[i] = t[i];
      for (i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
    }
    return s;
  }
  var native = null;   // set by useNative() on the watch: function (key, block) -> 16 bytes
  function cipher(key) {
    if (native) return function (b) { return native(key, b); };
    var w = expand(key);
    return function (b) { return jsBlock(w, b); };
  }
  function shl(b) { var o = new Uint8Array(16), i; for (i = 0; i < 16; i++) o[i] = ((b[i] << 1) | (i < 15 ? b[i + 1] >> 7 : 0)) & 0xff; return o; }
  function cmac(key, msg) {   // RFC 4493
    var E = cipher(key), L = E(new Uint8Array(16)), K1 = shl(L), K2, n, i, j, last = new Uint8Array(16), x = new Uint8Array(16), y;
    if (L[0] & 0x80) K1[15] ^= 0x87;
    K2 = shl(K1); if (K1[0] & 0x80) K2[15] ^= 0x87;
    n = Math.ceil(msg.length / 16); var whole = n > 0 && msg.length % 16 === 0; if (n === 0) n = 1;
    for (i = 0; i < 16; i++) {
      var k = (n - 1) * 16 + i;
      if (whole) last[i] = msg[k] ^ K1[i];
      else last[i] = (k < msg.length ? msg[k] : k === msg.length ? 0x80 : 0) ^ K2[i];
    }
    for (j = 0; j < n - 1; j++) { y = new Uint8Array(16); for (i = 0; i < 16; i++) y[i] = x[i] ^ msg[j * 16 + i]; x = E(y); }
    y = new Uint8Array(16); for (i = 0; i < 16; i++) y[i] = x[i] ^ last[i];
    return E(y);
  }
  // SP 800-108 counter mode, one 128-bit block: CMAC(K, [1] || label || 0x00 || context || [0x00, 0x80])
  function kdf(key, label, ctx) {
    var m = new Uint8Array(1 + label.length + 1 + ctx.length + 2), i, o = 0;
    m[o++] = 1; for (i = 0; i < label.length; i++) m[o++] = label.charCodeAt(i); m[o++] = 0;
    for (i = 0; i < ctx.length; i++) m[o++] = ctx[i];
    m[o++] = 0x00; m[o++] = 0x80;
    return cmac(key, m);
  }
  function inningKeys(gameKey, inning) {
    var c = new Uint8Array([inning & 0xff]);
    return { enc: kdf(gameKey, "PQ-ENC", c), mac: kdf(gameKey, "PQ-MAC", c) };
  }
  function same(a, b) { var d = a.length ^ b.length, i; for (i = 0; i < a.length && i < b.length; i++) d |= a[i] ^ b[i]; return d === 0; }
  function ctr(encKey, head, body) {
    var cb = new Uint8Array(16), i; for (i = 0; i < 5; i++) cb[i] = head[i];
    var ks = cipher(encKey)(cb), out = new Uint8Array(body.length);
    for (i = 0; i < body.length; i++) out[i] = body[i] ^ ks[i];
    return out;
  }
  var KIND = { call: 1, clear: 2, hb: 3, end: 4 }, KINDS = ["", "call", "clear", "hb", "end"];
  var LOCS = ["HI", "HO", "LI", "LO", "L", "M", "CH", "CL"];
  /** m: { kind, sign, loc, chg }; keys: inningKeys(); returns 16 bytes */
  function seal(keys, keyId, inning, n, m) {
    var f = new Uint8Array(16), body = new Uint8Array(3), li = m.loc ? LOCS.indexOf(m.loc) : 0, i;
    if (!(n >= 1 && n <= 65535) || !(inning >= 1 && inning <= 255) || !KIND[m.kind] || li < 0) throw new Error("bad message");
    f[0] = 0x51; f[1] = keyId & 0xff; f[2] = inning; f[3] = (n >> 8) & 0xff; f[4] = n & 0xff;
    body[0] = KIND[m.kind]; body[1] = m.kind === "call" ? +m.sign : 0; body[2] = (m.kind === "call" ? li : 0) | (m.chg ? 16 : 0);
    var ct = ctr(keys.enc, f, body); for (i = 0; i < 3; i++) f[5 + i] = ct[i];
    var tag = cmac(keys.mac, f.subarray ? f.subarray(0, 8) : f.slice(0, 8)); for (i = 0; i < 8; i++) f[8 + i] = tag[i];
    return f;
  }
  /** frame: 16 bytes; keysFor(inning) -> inningKeys; returns { keyId, inning, n, kind, sign, loc, chg } or null (forged / malformed) */
  function open(frame, keyId, keysFor) {
    if (!frame || frame.length !== 16 || frame[0] !== 0x51 || frame[1] !== (keyId & 0xff) || frame[2] < 1) return null;
    var keys = keysFor(frame[2]), head = new Uint8Array(8), i;
    for (i = 0; i < 8; i++) head[i] = frame[i];
    var tag = cmac(keys.mac, head), want = new Uint8Array(8), got = new Uint8Array(8);
    for (i = 0; i < 8; i++) { want[i] = tag[i]; got[i] = frame[8 + i]; }
    if (!same(want, got)) return null;
    var body = ctr(keys.enc, head, new Uint8Array([frame[5], frame[6], frame[7]]));
    var n = (frame[3] << 8) | frame[4], kind = KINDS[body[0]];
    if (!kind || n < 1) return null;
    var out = { keyId: frame[1], inning: frame[2], n: n, kind: kind, chg: !!(body[2] & 16) };
    if (kind === "call") { out.sign = String(body[1]); out.loc = LOCS[body[2] & 15]; if (!(body[1] >= 1 && body[1] <= 9) || !out.loc) return null; }
    return out;
  }
  function keyFrame(keyId, key) { var f = new Uint8Array(18), i; f[0] = 0x4b; f[1] = keyId & 0xff; for (i = 0; i < 16; i++) f[2 + i] = key[i]; return f; }
  return { aes: function (key, block) { return cipher(key)(block); }, jsAes: function (key, block) { return jsBlock(expand(key), block); }, cmac: cmac, kdf: kdf,
    inningKeys: inningKeys, seal: seal, open: open, keyFrame: keyFrame, LOCS: LOCS, FRAME: 16, KEY_FRAME: 18,
    useNative: function (f) { native = f; }, isNative: function () { return !!native; } };
})();
/*PQSEC-END*/


// ------------------------------------------------------------------ core: no Bangle calls (watch/bangle/test.js runs it)
// io: { draw(view), buzz("new" | "changed"), light(), notify(text), now(), secure() }   secure(): the link is encrypted
// and bonded with the passkey (NRF.getSecurityStatus on the watch)
function PQCore(io) {
  // held: the call taken off the screen by a quiet spell (NO LINK), with its message number, kept only so the same
  // message repeated can put it back; any other message, or a disconnect, forgets it
  var st = { lastN: 0, show: null, held: null, link: false, lastRx: 0, key: null, keyId: -1, keyAt: 0, inning: 0, keys: null, keysInning: 0, rejected: 0 };
  function view() { return { link: st.link, nokey: !st.key, sign: st.show ? st.show.sign : null, words: st.show ? PQ_WORDS[st.show.loc] : null }; }
  function clearShown() { st.show = null; st.held = null; }
  function wipe() { st.key = null; st.keyId = -1; st.keys = null; st.keysInning = 0; st.lastN = 0; st.inning = 0; clearShown(); }
  function onConnect() { clearShown(); st.link = true; st.lastRx = io.now(); io.draw(view()); }
  function onDisconnect() { st.link = false; clearShown(); io.draw(view()); }
  function keysFor(inning) { if (st.keysInning !== inning) { st.keys = PQSec.inningKeys(st.key, inning); st.keysInning = inning; } return st.keys; }
  function bytesOf(text) { var b = new Uint8Array(text.length); for (var i = 0; i < text.length; i++) b[i] = text.charCodeAt(i) & 0xff; return b; }
  function onWrite(text) {
    st.lastRx = io.now();
    var redraw = false;
    if (!st.link) { st.link = true; redraw = true; }
    var b = bytesOf(text);
    function drop() { st.rejected++; if (redraw) io.draw(view()); }
    if (b.length === PQSec.KEY_FRAME && b[0] === 0x4b) {          // a game key: only over the bonded, encrypted link
      if (!io.secure()) return drop();
      wipe(); st.key = new Uint8Array(16); for (var i = 0; i < 16; i++) st.key[i] = b[2 + i]; st.keyId = b[1]; st.keyAt = io.now();
      io.draw(view()); io.notify("K" + st.keyId);
      return;
    }
    if (b.length === PQSec.FRAME && b[0] === 0x51) {
      if (!st.key || b[2] < st.inning) return drop();                 // no key, or an earlier inning
      var m = PQSec.open(b, st.keyId, keysFor);
      if (!m) return drop();                                          // forged, tampered, another game's
      var n = m.n;
      if (n < st.lastN) return drop();                                // older than what's shown (a replay): dropped
      st.inning = m.inning;
      if (n === st.lastN) {                                           // a repeat: receipt only, no buzz
        if (!st.show && st.held && st.held.n === n) { st.show = st.held.show; st.held = null; redraw = true; }
        if (redraw) io.draw(view());
        io.notify("A" + n);
        return;
      }
      st.held = null; st.lastN = n;
      if (m.kind === "call") {
        st.show = { sign: m.sign, loc: m.loc };
        io.draw(view()); io.light(); io.buzz(m.chg ? "changed" : "new");
      } else if (m.kind === "end") { wipe(); io.draw(view()); return; }
      else { if (m.kind === "clear") st.show = null; io.draw(view()); }
      io.notify("A" + n);
      return;
    }
    if (text === "H" && !st.key) { if (redraw) io.draw(view()); return; }   // liveness while there's no key
    drop();                                                                 // anything else in plain text: ignored
  }
  function tick() {
    if (st.key && io.now() - st.keyAt > PQ_KEY_MS) { wipe(); io.draw(view()); }
    if (st.link && io.now() - st.lastRx > PQ_LINK_MS) { st.link = false; st.held = st.show ? { n: st.lastN, show: st.show } : null; st.show = null; io.draw(view()); }
  }
  return { onConnect: onConnect, onDisconnect: onDisconnect, onWrite: onWrite, tick: tick, view: view, st: st };
}

// ------------------------------------------------------------------ on the watch
function pqFit(text, size, maxW) {
  g.setFont("Vector", size);
  while (size > 12 && g.stringWidth(text) > maxW) { size -= 2; g.setFont("Vector", size); }
  return size;
}
function pqDraw(v) {
  var W = g.getWidth(), H = g.getHeight(), cx = W / 2;
  g.reset();
  g.setBgColor("#fff").clearRect(0, 0, W - 1, H - 1);   // black on white: the most readable in sun on this screen
  g.setColor(v.link ? "#0f0" : "#f00").fillCircle(W - 10, 10, 5);
  g.setFontAlign(0, 0);
  if (!v.link) {
    g.setColor("#f00"); pqFit("NO LINK", 40, W - 16); g.drawString("NO LINK", cx, H / 2 - 16);
    g.setColor("#000"); pqFit("Coach gives the sign", 18, W - 16); g.drawString("Coach gives the sign", cx, H / 2 + 26);
    if (v.pair) { g.setFont("Vector", 22); g.drawString("Pair " + v.pair, cx, H - 20); }
    return;
  }
  g.setColor("#000");
  if (!v.sign) {   // "—": no call; a small "no key" under it until this game's key arrives (and the pair code while unpaired)
    g.fillRect(cx - 30, H / 2 - 4, cx + 30, H / 2 + 4);
    if (v.nokey) { g.setFont("Vector", 18); g.drawString("no key", cx, H / 2 + 30); if (v.pair) { g.setFont("Vector", 22); g.drawString("Pair " + v.pair, cx, H - 20); } }
    return;
  }
  var lines = v.words || [];
  if (!lines.length) { g.setFont("Vector", 150); g.drawString(v.sign, cx, H / 2 + 6); return; }   // get it over: the sign alone
  // the words at the bottom, the sign filling what's left above them (a Vector font's height is about its size)
  var size = 30;
  for (var i = 0; i < lines.length; i++) size = Math.min(size, pqFit(lines[i], 30, W - 10));
  var last = H - 6 - size / 2, first = last - (lines.length - 1) * (size + 4);
  var room = first - size / 2 - 6;
  g.setFont("Vector", Math.min(110, room)); g.drawString(v.sign, cx, room / 2 + 2);
  g.setFont("Vector", size);
  for (var j = 0; j < lines.length; j++) g.drawString(lines[j], cx, first + j * (size + 4));
}
function pqBuzz(kind) {
  if (kind === "changed") Bangle.buzz(120, 1).then(function () { return new Promise(function (r) { setTimeout(r, 120); }); }).then(function () { return Bangle.buzz(120, 1); });
  else Bangle.buzz(450, 1);
}
function pqNotify(text) {
  try { var s = {}; s[PQ_SVC] = {}; s[PQ_SVC][PQ_TX] = { value: text, notify: true }; NRF.updateServices(s); } catch (e) {}
}

if (typeof Bangle !== "undefined") {
  // the firmware's AES, if it has one and it gives the same answer as PQSec's own; otherwise PQSec's (to verify on the watch)
  try {
    var pqC = require("crypto");
    if (pqC && pqC.AES) {
      var pqNat = function (key, block) { return new Uint8Array(pqC.AES.encrypt(block, key, { mode: "ECB" })); };
      var pqK = new Uint8Array(16), pqB = new Uint8Array(16), pqI;
      for (pqI = 0; pqI < 16; pqI++) { pqK[pqI] = pqI; pqB[pqI] = pqI * 0x11; }   // FIPS-197 C.1
      var pqR = pqNat(pqK, pqB), pqW = PQSec.jsAes(pqK, pqB), pqOk = pqR.length >= 16;
      for (pqI = 0; pqI < 16 && pqOk; pqI++) pqOk = pqR[pqI] === pqW[pqI];
      if (pqOk) PQSec.useNative(pqNat);
    }
  } catch (e) {}
  // pairing: a 6-digit passkey the watch shows while it isn't bonded; writes need an encrypted, passkey-protected (MITM)
  // link (to verify on the watch)
  var PQ_PAIR = String(100000 + Math.floor(Math.random() * 900000));
  try { NRF.setSecurity({ passkey: PQ_PAIR, mitm: 1, display: 1 }); } catch (e) {}
  var pqSecure = function () { try { var s = NRF.getSecurityStatus(); return !!(s && s.connected && s.encrypted && s.mitm_protected); } catch (e) { return false; } };
  var pqBonded = function () { try { var s = NRF.getSecurityStatus(); return !!(s && s.bonded); } catch (e) { return false; } };
  var pqDrawV = function (v) { if (!pqBonded()) v.pair = PQ_PAIR; pqDraw(v); };
  var PQ = PQCore({ draw: pqDrawV, buzz: pqBuzz, light: function () { Bangle.setLCDPower(1); }, notify: pqNotify, now: function () { return Date.now(); }, secure: pqSecure });
  global.PQ_CORE = PQ;
  var svc = {};
  svc[PQ_SVC] = {};
  var pqNeedBattery = false;
  svc[PQ_SVC][PQ_RX] = { value: "", maxLen: 20, writable: true, security: { write: { encrypted: true, mitm: true } }, onWrite: function (evt) {
    PQ.onWrite(E.toString(evt.data));
    if (pqNeedBattery) { pqNeedBattery = false; pqNotify("B" + E.getBattery()); }   // the coach's app is subscribed by its first write
  } };
  svc[PQ_SVC][PQ_TX] = { value: "", maxLen: 20, readable: true, notify: true };
  NRF.setServices(svc, {});
  try { NRF.setWhitelist(true); } catch (e) {}   // once bonded, only bonded devices connect (to verify on the watch)
  var pqBattery = null;
  NRF.on("connect", function () {
    PQ.onConnect();
    pqNeedBattery = true;
    try { NRF.setConnectionInterval(20); } catch (e) {}   // a steady 20 ms link instead of the slow idle rate: calls arrive fast
    if (pqBattery) clearInterval(pqBattery);
    pqBattery = setInterval(function () { pqNotify("B" + E.getBattery()); }, 60000);
  });
  NRF.on("disconnect", function () { if (pqBattery) clearInterval(pqBattery); pqBattery = null; PQ.onDisconnect(); });
  // a stray press (a glove) does nothing; hold the button 3 s to leave the app
  Bangle.setUI({ mode: "custom", btn: function () {} });
  Bangle.setOptions({ btnLoadTimeout: 3000 });
  setInterval(function () { PQ.tick(); }, 1000);
  pqDrawV(PQ.view());
}
