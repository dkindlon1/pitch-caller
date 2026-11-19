/*
 * Watch sign security (docs/PLAN_watch_security_2026-11-18.md): the crypto shared by the coach's sender (app/watch.js) and
 * the watch app (watch/bangle/pitchiq.app.js). The block between the PQSEC markers is copied byte for byte into the
 * watch app (Espruino uploads one file); app/watch_sec_test.js checks the copies are identical and runs the same test
 * vectors on both. ES5 only (Espruino).
 *
 *   AES-128 (FIPS-197), one block. On the watch the firmware's own AES is used when it's there and gives the FIPS-197
 *     answer at start-up (to verify on the watch); otherwise this pure JS one.
 *   CMAC (RFC 4493 / NIST SP 800-38B) on that block.
 *   Inning keys: NIST SP 800-108 counter-mode KDF with CMAC as the PRF, from the game key and the inning number; one key
 *     to encrypt and one to authenticate, per inning.
 *   Each message: 16 bytes, one Bluetooth write (the watch's characteristic takes 20):
 *     [0] 0x51 version   [1] game key id   [2] inning (1-255)   [3..4] message number (big-endian, 1-65535)
 *     [5..7] the call, AES-CTR encrypted   [8..15] CMAC over bytes 0-7, first 8 bytes
 *   The call (3 bytes before encryption): kind (1 call, 2 clear, 3 heartbeat, 4 end of game), sign (1-9 or 0),
 *   location index (0-7) + 16 if the call replaces one on the watch.
 *   The counter block for CTR is the 5 header bytes then zeros: unique while a game key never reuses an (inning, number)
 *   pair; the sender counts message numbers up through the whole game (not per connection) and keeps the count on the
 *   device, so a reconnect or a reload never repeats one.
 *   Game key: 16 random bytes, written once per game as  [0] 0x4B 'K'  [1] key id  [2..17] key  (18 bytes), only over a
 *   bonded, encrypted link (the watch checks).
 */
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
if (typeof module !== "undefined" && module.exports) module.exports = PQSec;
else if (typeof self !== "undefined") self.PQSec = PQSec;
