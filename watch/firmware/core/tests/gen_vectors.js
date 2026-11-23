#!/usr/bin/env node
/*
 * Writes tests/vectors.json: crypto vectors and PQCore scenario traces, all produced by running the ORIGINAL
 * watch/bangle/pitchiq.app.js (loaded the way watch/bangle/test.js loads it: vm, no Bangle global, so only the
 * pure PQSec and PQCore are defined).  The C code is then checked against these answers by tests/test_core.c.
 *
 *   node tests/gen_vectors.js [out.json]        PQ_JS=/path/to/pitchiq.app.js overrides the source path.
 *
 * Deterministic: a fixed seed, no clock, no Math.random, no system randomness.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm"), nodeCrypto = require("crypto"), assert = require("assert");

const JS_PATH = process.env.PQ_JS || "/home/claude/dkindlon1/pitch-caller/watch/bangle/pitchiq.app.js";
const OUT = process.argv[2] || path.join(__dirname, "vectors.json");
const src = fs.readFileSync(JS_PATH, "utf8");
const ctx = { Uint8Array, Math, parseInt, String, Error };
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const PQSec = ctx.PQSec, PQCore = ctx.PQCore;
assert(PQSec && PQCore && typeof ctx.Bangle === "undefined", "pitchiq.app.js did not load as expected");

// ---------------------------------------------------------------- helpers
const hex = (u) => Buffer.from(u).toString("hex");
const unhex = (h) => new Uint8Array(Buffer.from(h, "hex"));
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const R = rng(0x50495451); // "PITQ"
const rint = (n) => Math.floor(R() * n);
const rbytes = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = rint(256); return b; };
const pick = (a) => a[rint(a.length)];
const LOCS = PQSec.LOCS;

// ---------------------------------------------------------------- crypto vectors
const crypto_v = { aes: [], cmac: [], kdf: [], inning_keys: [], seal: [], open: [], keyframe: [] };
const nodeAes = (key, block) => { const c = nodeCrypto.createCipheriv("aes-128-ecb", Buffer.from(key), null); c.setAutoPadding(false); return new Uint8Array(c.update(Buffer.from(block))); };

function addAes(key, block) {
  const out = PQSec.jsAes(key, block);
  assert.strictEqual(hex(out), hex(nodeAes(key, block)), "JS AES disagrees with OpenSSL");
  crypto_v.aes.push({ key: hex(key), in: hex(block), out: hex(out) });
}
{
  const k = new Uint8Array(16), b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) { k[i] = i; b[i] = i * 0x11; }
  addAes(k, b);                                                  // FIPS-197 C.1
  addAes(unhex("2b7e151628aed2a6abf7158809cf4f3c"), unhex("3243f6a8885a308d313198a2e0370734")); // FIPS-197 appendix B
  addAes(new Uint8Array(16), new Uint8Array(16));
  addAes(new Uint8Array(16).fill(0xff), new Uint8Array(16).fill(0xff));
  for (let i = 0; i < 40; i++) addAes(rbytes(16), rbytes(16));
}

const RFC_KEY = unhex("2b7e151628aed2a6abf7158809cf4f3c");
const RFC_MSG = unhex("6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710");
const RFC_MAC = { 0: "bb1d6929e95937287fa37d129b756746", 16: "070a16b46b4d4144f79bdd9dd04a287c", 40: "dfa66747de9ae63030ca32611497c827", 64: "51f0bebf7e3b9d92fc49741779363cfe" };
for (const len of Object.keys(RFC_MAC)) assert.strictEqual(hex(PQSec.cmac(RFC_KEY, RFC_MSG.subarray(0, +len))), RFC_MAC[len], "JS CMAC disagrees with RFC 4493 at " + len);

function addCmac(key, msg) { crypto_v.cmac.push({ key: hex(key), msg: hex(msg), mac: hex(PQSec.cmac(key, msg)) }); }
for (const len of [0, 16, 40, 64]) addCmac(RFC_KEY, RFC_MSG.subarray(0, len));
for (const len of [0, 1, 8, 15, 16, 17, 20, 31, 32, 33, 40, 47, 48, 64, 65, 100]) { addCmac(rbytes(16), rbytes(len)); addCmac(rbytes(16), rbytes(len)); }

function addKdf(key, label, ctxb) { crypto_v.kdf.push({ key: hex(key), label, ctx: hex(ctxb), out: hex(PQSec.kdf(key, label, ctxb)) }); }
for (const label of ["PQ-ENC", "PQ-MAC", "X", "", "SIXTEEN-CHARS-LAB"].slice(0, 4)) for (const cl of [0, 1, 2, 16]) addKdf(rbytes(16), label, rbytes(cl));
addKdf(rbytes(16), "ABCDEFGHIJKLMNOP", rbytes(16)); // the longest label and context the C buffers take

const KEYS = [rbytes(16), rbytes(16), rbytes(16)];
for (const gk of KEYS) for (const inning of [1, 2, 3, 9, 10, 127, 128, 254, 255]) {
  const k = PQSec.inningKeys(gk, inning);
  crypto_v.inning_keys.push({ game_key: hex(gk), inning, enc: hex(k.enc), mac: hex(k.mac) });
}
crypto_v.inning_keys.push({ game_key: hex(KEYS[0]), inning: 0, enc: hex(PQSec.inningKeys(KEYS[0], 0).enc), mac: hex(PQSec.inningKeys(KEYS[0], 0).mac) });

// sealed frames for a spread of messages
function addSeal(gk, keyId, inning, n, m) {
  const keys = PQSec.inningKeys(gk, inning);
  const f = PQSec.seal(keys, keyId, inning, n, m);
  const o = PQSec.open(f, keyId, () => keys);
  crypto_v.seal.push({ game_key: hex(gk), key_id: keyId, inning, n, msg: { kind: m.kind, sign: m.sign === undefined ? 0 : +m.sign, loc: m.loc ? LOCS.indexOf(m.loc) : 0, chg: !!m.chg },
    frame: hex(f), open: o ? { key_id: o.keyId, inning: o.inning, n: o.n, kind: o.kind, sign: o.sign === undefined ? 0 : +o.sign, loc: o.loc === undefined ? 0 : LOCS.indexOf(o.loc), chg: o.chg } : null });
}
for (const loc of LOCS) for (const chg of [false, true]) addSeal(KEYS[0], 42, 1, 1 + rint(300), { kind: "call", sign: String(1 + rint(9)), loc, chg });
for (let s = 1; s <= 9; s++) addSeal(KEYS[1], 7, 1 + rint(255), 1 + rint(65535), { kind: "call", sign: String(s), loc: pick(LOCS), chg: R() < 0.5 });
for (const kind of ["clear", "hb", "end"]) for (const chg of [false, true]) addSeal(KEYS[2], 255, 3, 1000, { kind, chg });
for (const n of [1, 255, 256, 257, 65534, 65535]) addSeal(KEYS[0], 0, 255, n, { kind: "call", sign: "9", loc: "CL", chg: true });
addSeal(KEYS[0], 42, 255, 1, { kind: "hb" });
addSeal(KEYS[0], 42, 1, 1, { kind: "call", sign: "0", loc: "HI" });   // a valid seal, but open() rejects the sign
addSeal(KEYS[0], 42, 1, 1, { kind: "call", sign: "10", loc: "HI" });
for (let i = 0; i < 20; i++) addSeal(rbytes(16), rint(256), 1 + rint(255), 1 + rint(65535), { kind: pick(["call", "call", "clear", "hb", "end"]), sign: String(1 + rint(9)), loc: pick(LOCS), chg: R() < 0.5 });

// frames that PQSec.seal refuses (the JS throws): the C returns an error for the same inputs
crypto_v.seal_bad = [];
for (const [inning, n, m] of [[1, 0, { kind: "call", sign: "1", loc: "HI" }], [1, 65536, { kind: "call", sign: "1", loc: "HI" }], [0, 1, { kind: "call", sign: "1", loc: "HI" }],
  [256, 1, { kind: "call", sign: "1", loc: "HI" }], [1, 1, { kind: "nope" }]]) {
  let threw = false; try { PQSec.seal(PQSec.inningKeys(KEYS[0], 1), 1, inning, n, m); } catch (e) { threw = true; }
  assert(threw);
  crypto_v.seal_bad.push({ game_key: hex(KEYS[0]), key_id: 1, inning, n, kind: m.kind === "nope" ? 0 : 1 });
}

// open(): good frames, every byte flipped, the wrong key id, and frames with a valid tag but an invalid body
function rawSeal(gk, keyId, inning, n, b0, b1, b2) { // a frame with ANY body bytes, built the same way as seal()
  const keys = PQSec.inningKeys(gk, inning), f = new Uint8Array(16);
  f[0] = 0x51; f[1] = keyId; f[2] = inning; f[3] = (n >> 8) & 255; f[4] = n & 255;
  const cb = new Uint8Array(16); cb.set(f.subarray(0, 5));
  const ks = PQSec.aes(keys.enc, cb);
  f[5] = b0 ^ ks[0]; f[6] = b1 ^ ks[1]; f[7] = b2 ^ ks[2];
  f.set(PQSec.cmac(keys.mac, f.subarray(0, 8)).subarray(0, 8), 8);
  return f;
}
function addOpen(gk, keyId, frame, note) {
  const o = PQSec.open(frame, keyId, (i) => PQSec.inningKeys(gk, i));
  crypto_v.open.push({ note, game_key: hex(gk), key_id: keyId, frame: hex(frame),
    result: o ? { key_id: o.keyId, inning: o.inning, n: o.n, kind: o.kind, sign: o.sign === undefined ? 0 : +o.sign, loc: o.loc === undefined ? 0 : LOCS.indexOf(o.loc), chg: o.chg } : null });
}
{
  const gk = KEYS[0], keys = PQSec.inningKeys(gk, 2);
  const good = PQSec.seal(keys, 42, 2, 77, { kind: "call", sign: "4", loc: "LO", chg: true });
  addOpen(gk, 42, good, "good");
  for (let i = 0; i < 16; i++) { const f = good.slice(); f[i] ^= 1 << rint(8); addOpen(gk, 42, f, "flip byte " + i); }
  addOpen(gk, 43, good, "wrong key id");
  addOpen(gk, 42, PQSec.seal(PQSec.inningKeys(KEYS[1], 2), 42, 2, 77, { kind: "call", sign: "4", loc: "LO" }), "other game's key");
  const body = [[0, 1, 0, "kind 0"], [5, 1, 0, "kind 5"], [255, 1, 0, "kind 255"], [1, 0, 0, "sign 0"], [1, 10, 0, "sign 10"], [1, 255, 0, "sign 255"], [1, 5, 8, "loc 8"], [1, 5, 15, "loc 15"],
    [1, 5, 31, "loc 15 + chg"], [1, 9, 7, "ok call 9 CL"], [1, 1, 16, "ok call chg"], [2, 99, 99, "clear with junk body"], [3, 0, 255, "hb with junk body"], [4, 200, 17, "end with junk body"]];
  for (const [b0, b1, b2, note] of body) addOpen(gk, 42, rawSeal(gk, 42, 3, 5, b0, b1, b2), "raw body: " + note);
  addOpen(gk, 42, rawSeal(gk, 42, 3, 0, 3, 0, 0), "n = 0");
  addOpen(gk, 42, rawSeal(gk, 42, 0, 5, 3, 0, 0), "inning 0");
  addOpen(gk, 42, rawSeal(gk, 42, 255, 65535, 1, 3, 2), "inning 255, n 65535");
  const nomagic = good.slice(); nomagic[0] = 0x50; addOpen(gk, 42, nomagic, "bad magic");
}
for (let i = 0; i < 4; i++) { const k = rbytes(16), id = rint(256); const f = PQSec.keyFrame(id, k); crypto_v.keyframe.push({ key_id: id, key: hex(k), frame: hex(f) }); }

// ---------------------------------------------------------------- scenarios
// One scenario = a fresh PQCore, then steps; the JS runs each step and the output is recorded.
function runJs(sc) {
  let now = sc.clock0, secure = sc.secure0, events = [];
  const io = {
    draw: (v) => events.push({ e: "draw", link: v.link, nokey: v.nokey, sign: v.sign, words: v.words === null ? null : v.words.slice() }),
    buzz: (k) => events.push({ e: "buzz", kind: k }), light: () => events.push({ e: "light" }),
    notify: (t) => events.push({ e: "notify", text: t }), now: () => now, secure: () => secure,
  };
  const core = PQCore(io), st = core.st;
  const steps = sc.steps.map((s) => {
    events = [];
    if (s.op === "connect") core.onConnect();
    else if (s.op === "disconnect") core.onDisconnect();
    else if (s.op === "write") core.onWrite(Buffer.from(s.hex, "hex").toString("latin1"));
    else if (s.op === "tick") core.tick();
    else if (s.op === "advance") now += s.ms;
    else if (s.op === "secure") secure = s.value;
    else throw new Error("bad op " + s.op);
    const v = core.view();
    return Object.assign({}, s, { expect: { events, view: { link: v.link, nokey: v.nokey, sign: v.sign, words: v.words === null ? null : v.words.slice() },
      rejected: st.rejected, last_n: st.lastN, inning: st.inning, mode: st.mode === null ? "none" : st.mode, link: st.link } });
  });
  return { name: sc.name, clock0: sc.clock0, secure0: sc.secure0, steps, final_rejected: st.rejected };
}

const GK1 = rbytes(16), GK2 = rbytes(16);
class Scn {
  constructor(name, opts = {}) { this.name = name; this.clock0 = opts.clock0 === undefined ? 1000 : opts.clock0; this.secure0 = opts.secure0 === undefined ? true : opts.secure0; this.steps = []; this.gk = GK1; this.keyId = 42; }
  connect() { this.steps.push({ op: "connect" }); return this; }
  disconnect() { this.steps.push({ op: "disconnect" }); return this; }
  tick() { this.steps.push({ op: "tick" }); return this; }
  adv(ms) { this.steps.push({ op: "advance", ms }); return this; }
  secure(v) { this.steps.push({ op: "secure", value: v }); return this; }
  raw(u8) { this.steps.push({ op: "write", hex: hex(u8) }); return this; }
  text(t) { return this.raw(Buffer.from(t, "latin1")); }
  key(id = this.keyId, gk = this.gk) { return this.raw(PQSec.keyFrame(id, gk)); }
  seal(n, m, inning = 1, id = this.keyId, gk = this.gk) { return PQSec.seal(PQSec.inningKeys(gk, inning), id, inning, n, m); }
  call(n, sign, loc, chg = false, inning = 1) { return this.raw(this.seal(n, { kind: "call", sign: String(sign), loc, chg }, inning)); }
  clear(n, inning = 1) { return this.raw(this.seal(n, { kind: "clear" }, inning)); }
  hb(n, inning = 1) { return this.raw(this.seal(n, { kind: "hb" }, inning)); }
  end(n, inning = 1) { return this.raw(this.seal(n, { kind: "end" }, inning)); }
  tick6() { return this.adv(6001).tick(); }
}
const scenarios = [];
const add = (sc) => { scenarios.push(sc); return sc; };

add(new Scn("full_happy_path").connect().key().call(1, 3, "HI").call(2, 5, "LO").clear(3).hb(4).call(5, 9, "CL").end(6));
add(new Scn("full_all_locs_and_signs").connect().key().adv(100).call(1, 1, "HI").call(2, 2, "HO").call(3, 3, "LI").call(4, 4, "LO").call(5, 5, "L").call(6, 6, "M").call(7, 7, "CH").call(8, 8, "CL").call(9, 9, "M"));
add(new Scn("full_changed_call").connect().key().call(1, 2, "HI").call(2, 4, "LO", true).call(3, 4, "LO", true).call(4, 1, "M", false));
add(new Scn("full_clear_then_call").connect().key().call(1, 2, "L").clear(2).call(3, 6, "CH").clear(4).clear(4).clear(5));
add(new Scn("full_end_wipes_everything").connect().key().call(1, 2, "L").end(2).call(3, 1, "HI").hb(4).key().call(1, 7, "HO").tick());
add(new Scn("full_end_then_old_number_replay").connect().key().call(5, 2, "L").end(6).call(5, 2, "L").call(7, 2, "L"));
add(new Scn("full_replay_older_number").connect().key().call(5, 3, "HI").call(3, 4, "LO").call(4, 4, "LO", true).clear(2).call(5, 3, "HI").call(6, 5, "L"));
add(new Scn("full_repeat_same_number").connect().key().call(5, 3, "HI").call(5, 3, "HI").call(5, 3, "HI").call(6, 7, "CH", true).call(6, 7, "CH", true));
add(new Scn("full_repeat_number_other_content").connect().key().call(5, 3, "HI").clear(5).call(5, 9, "LO").hb(5).end(5).call(6, 1, "M"));
{
  const s = new Scn("full_forged_tag").connect().key().call(1, 3, "HI");
  for (let i = 8; i < 16; i += 3) { const f = s.seal(2, { kind: "call", sign: "5", loc: "LO" }); f[i] ^= 0x80; s.raw(f); }
  s.call(2, 5, "LO"); add(s);
}
{
  const s = new Scn("full_tampered_every_byte").connect().key().call(1, 3, "HI");
  for (let i = 0; i < 16; i++) { const f = s.seal(2, { kind: "call", sign: "5", loc: "LO" }); f[i] ^= 1 << (i % 8); s.raw(f); }
  s.call(2, 5, "LO"); add(s);
}
{
  const t = new Scn("full_forged_write_restores_link_draw").connect().key().call(1, 3, "HI").tick6(); // link lost, call held
  const f = t.seal(2, { kind: "call", sign: "5", loc: "LO" }); f[9] ^= 1; t.raw(f).call(1, 3, "HI"); add(t);
}
add(new Scn("full_wrong_key_id").connect().key().call(1, 3, "HI").raw(new Scn("x").seal(2, { kind: "call", sign: "4", loc: "L" }, 1, 43)).call(2, 4, "L"));
add(new Scn("full_other_games_key_same_id").connect().key().raw(new Scn("x").seal(1, { kind: "call", sign: "4", loc: "L" }, 1, 42, GK2)).call(1, 4, "L"));
add(new Scn("full_earlier_inning").connect().key().call(1, 3, "HI", false, 2).call(2, 4, "LO", false, 1).call(3, 4, "LO", false, 2).call(4, 6, "M", false, 3).call(5, 6, "M", false, 2));
add(new Scn("full_inning_255").connect().key().call(1, 1, "HI", false, 255).call(2, 2, "HO", false, 254).call(3, 3, "LI", false, 255).clear(4, 255).end(5, 255));
add(new Scn("full_inning_zero_frames").connect().key().raw(rawSeal(GK1, 42, 0, 1, 3, 0, 0)).raw(rawSeal(GK1, 42, 0, 2, 2, 0, 0)).call(1, 4, "L"));
{
  const s = new Scn("full_valid_tag_bad_body").connect().key().call(1, 2, "L");
  const bodies = [[0, 1, 0], [5, 1, 0], [1, 0, 0], [1, 10, 0], [1, 5, 8], [1, 5, 15], [1, 5, 31]];
  bodies.forEach((b, i) => s.raw(rawSeal(GK1, 42, 1, 2 + i, b[0], b[1], b[2])));
  s.raw(rawSeal(GK1, 42, 1, 0, 3, 0, 0)).raw(rawSeal(GK1, 42, 1, 9, 2, 77, 99)).raw(rawSeal(GK1, 42, 1, 10, 3, 1, 255)).raw(rawSeal(GK1, 42, 1, 11, 1, 6, 16 | 4)); add(s);
}
add(new Scn("full_repeat_higher_inning_advances_inning").connect().key().call(5, 3, "HI", false, 1).call(5, 3, "HI", false, 2).call(6, 4, "LO", false, 1).call(6, 4, "LO", false, 2));
add(new Scn("full_older_number_does_not_advance_inning").connect().key().call(5, 3, "HI", false, 1).call(3, 4, "LO", false, 2).call(6, 4, "LO", false, 1).call(7, 5, "L", false, 2));
add(new Scn("key_frame_over_insecure_link").secure(false).connect().key().call(1, 3, "HI").secure(true).key().call(1, 3, "HI"));
add(new Scn("key_frame_insecure_replaces_nothing").connect().key().call(1, 3, "HI").secure(false).key(43, GK2).key().call(2, 5, "L").secure(true).call(3, 5, "L"));
add(new Scn("key_same_resent_after_reconnect").connect().key().call(5, 3, "HI", false, 2).disconnect().connect().key().call(5, 3, "HI", false, 2).call(4, 1, "L", false, 2).call(6, 2, "L", false, 2).call(7, 2, "L", false, 1));
add(new Scn("key_same_resent_while_showing").connect().key().call(5, 3, "HI").key().call(5, 3, "HI").key().call(6, 3, "LO"));
add(new Scn("key_new_key_starts_over").connect().key().call(9, 3, "HI", false, 2).key(42, GK2).call(1, 4, "LO", false, 1).raw(new Scn("x").seal(2, { kind: "call", sign: "1", loc: "M" }, 1, 42, GK1)).call(2, 5, "L"));
add(new Scn("key_new_key_id_same_bytes").connect().key().call(9, 3, "HI").key(43, GK1).call(1, 4, "LO").raw(new Scn("x").seal(10, { kind: "call", sign: "1", loc: "M" }, 1, 42, GK1)));
add(new Scn("key_wrong_length_frames").connect().raw(Buffer.concat([PQSec.keyFrame(42, GK1), Buffer.from([0])])).raw(PQSec.keyFrame(42, GK1).subarray(0, 17)).raw(Buffer.concat([Buffer.from([0x4c]), PQSec.keyFrame(42, GK1).subarray(1)])).key().call(1, 2, "M"));
add(new Scn("key_refresh_extends_expiry").connect().key().call(1, 2, "M").adv(5 * 3600e3).tick().key().adv(5 * 3600e3).tick().call(2, 2, "M").adv(2 * 3600e3).tick().call(3, 2, "M"));
add(new Scn("key_expiry_6h").connect().key().call(1, 2, "M").adv(6 * 3600e3).hb(2).tick().call(2, 3, "L").adv(1).tick().call(3, 3, "L").hb(3).text("H"));
add(new Scn("key_expiry_with_stale_link").connect().key().call(1, 2, "M").adv(6 * 3600e3 + 1).tick().tick().connect().call(1, 2, "M"));
add(new Scn("key_expiry_pairing_mode").connect().text("P").text("C1,4,HI,0").adv(6 * 3600e3).tick().adv(1).tick().text("C2,4,HI,0").text("H"));
add(new Scn("n_65535").connect().key().call(65534, 3, "HI").call(65535, 4, "LO", true).call(65535, 4, "LO", true).call(1, 1, "L").call(65534, 3, "HI").hb(65535).clear(65535).end(65535).call(65535, 4, "LO"));
add(new Scn("n_256_boundary").connect().key().call(255, 3, "HI").call(256, 4, "LO").call(257, 1, "M").call(256, 2, "L").clear(258));
add(new Scn("pairing_valid").connect().text("P").text("C1,5,HI,0").text("C2,6,LO,1").text("C3,1,M,0").text("X4").text("C5,9,CL,0").text("E6").text("C7,1,L,0"));
add(new Scn("pairing_all_locs").connect().text("P").text("C1,1,HI,0").text("C2,2,HO,1").text("C3,3,LI,0").text("C4,4,LO,1").text("C5,5,L,0").text("C6,6,M,1").text("C7,7,CH,0").text("C8,8,CL,1").text("C9,9,M,0"));
{
  const s = new Scn("pairing_malformed").connect().text("P");
  for (const t of ["C1,5,HI", "C1,0,HI,0", "C1,10,HI,0", "C1,5,XX,0", "C1,5,hi,0", "C1,5,HI,2", "C1,5,HI,", "C01,5,HI,0", "C0,5,HI,0", "C1,5,HI,0,", "C1,5,HI,0,0", "C1,,HI,0", "C1,5,,0",
    "C 1,5,HI,0", "C+1,5,HI,0", "C1.5,5,HI,0", "C1e1,5,HI,0", "C-1,5,HI,0", "Cx,5,HI,0", "C", "C1", "C1,5,HI,0\n", "C1,5,HI,0 ", "C1,5,HI,00", "C1,55,HI,0", "X", "X1,", "X1,2", "Xa", "X 1", "X01", "X0", "E1,0", "E-1", "Ea", "E1x", "Y1", "c1,5,HI,0", "x1", "e1", "H1", "HH", "h", "p", "PP", "K", "Q", "1", "",
    "C99999999999999999999,5,HI,0", "X9007199254740993", "C1,5,__proto__,0", "C1,5,hasOwnProperty,0", "C1,5,constructor,0", "C1,5,HIL,0", "C1,5,H,0"]) s.text(t);
  s.text("C2,5,HI,0").raw(Buffer.from("C3,5,HI,0\0", "latin1")).raw(Buffer.from("C3\0,5,HI,0", "latin1")).raw(Buffer.from([0x43, 0x34, 0x2c, 0xe9, 0x2c, 0x48, 0x49, 0x2c, 0x30])).text("C4,5,HI,0"); add(s);
}
add(new Scn("pairing_big_numbers").connect().text("P").text("C9007199254740991,1,L,0").text("C9007199254740992,2,L,0").text("C9007199254740993,3,L,0").text("C4294967296,4,L,0").text("X9007199254740992").text("X1").text("C123456789012345678901234567890,1,L,0"));
add(new Scn("pairing_insecure_link").connect().text("P").secure(false).text("P").text("C1,5,HI,0").text("X2").text("E3").text("H").secure(true).text("C1,5,HI,0").text("P").text("C2,5,HI,0"));
add(new Scn("pairing_replay_and_repeat").connect().text("P").text("C5,3,HI,0").text("C5,3,HI,0").text("C4,2,LO,1").text("C6,2,LO,1").text("X6").text("X5").text("C6,9,L,0").text("E6"));
add(new Scn("pairing_end_then_text_dropped").connect().text("P").text("C1,5,HI,0").text("E2").text("C3,5,HI,0").text("X4").text("H").text("P").text("C1,5,HI,0"));
add(new Scn("pairing_P_again_resets_count").connect().text("P").text("C5,5,HI,0").text("P").text("C1,6,LO,0").text("C1,6,LO,0"));
add(new Scn("pairing_sealed_frame_dropped").connect().text("P").call(1, 3, "HI").key().call(1, 3, "HI").text("P").call(2, 3, "HI").text("C1,4,L,0"));
add(new Scn("pairing_to_full_and_back").connect().text("P").text("C1,5,HI,0").key().text("C2,5,HI,0").call(1, 2, "L").text("P").call(2, 2, "L").text("C1,1,M,0"));
add(new Scn("pairing_heartbeat").text("P").text("H").connect().text("H").text("H").adv(7000).tick().text("H").text("C1,2,M,0").adv(7000).tick().text("C1,2,M,0").text("H").text("C2,2,M,1"));
add(new Scn("plain_text_in_full_mode").connect().key().text("C1,5,HI,0").text("X1").text("E1").text("H").text("P").call(1, 5, "HI"));
add(new Scn("plain_text_without_key").connect().text("C1,5,HI,0").text("X1").text("E1").text("hello").raw(new Uint8Array(0)));
add(new Scn("heartbeat_no_key").text("H").connect().text("H").adv(5000).text("H").adv(5000).tick().adv(2000).tick().text("H").tick());
add(new Scn("heartbeat_with_key_plain_dropped").connect().key().text("H").text("H").call(1, 3, "HI").text("H").hb(2).hb(2).hb(3));
add(new Scn("heartbeat_sealed_keeps_screen").connect().key().call(1, 3, "HI").hb(2).hb(3).adv(4000).hb(4).adv(4000).tick().call(1, 3, "HI"));
add(new Scn("heartbeat_after_timeout_forgets_held").connect().key().call(1, 3, "HI").tick6().hb(2).call(1, 3, "HI").call(2, 3, "HI").call(3, 3, "HI"));
add(new Scn("link_timeout_boundary").connect().key().call(1, 3, "HI").adv(6000).tick().adv(1).tick().tick());
add(new Scn("link_timeout_repeat_restores_call").connect().key().call(1, 3, "HI", true).tick6().call(1, 3, "HI", true).call(1, 3, "HI", true).tick6().call(1, 3, "HI", true));
add(new Scn("link_timeout_newer_message").connect().key().call(1, 3, "HI").tick6().call(2, 4, "LO").tick6().call(2, 4, "LO").call(3, 4, "LO").tick6().clear(4).call(3, 4, "LO"));
add(new Scn("link_timeout_older_message").connect().key().call(5, 3, "HI").tick6().call(4, 3, "HI").call(5, 3, "HI").tick6().hb(5));
add(new Scn("link_timeout_nothing_shown_no_hold").connect().key().tick6().call(1, 3, "HI").clear(2).tick6().clear(2).call(2, 3, "HI").call(3, 1, "M").tick6().clear(3));
add(new Scn("link_timeout_then_other_n_same_content").connect().key().call(1, 3, "HI").tick6().call(2, 3, "HI").tick6().call(2, 3, "HI"));
add(new Scn("link_timeout_then_connect_clears_held").connect().key().call(1, 3, "HI").tick6().connect().call(1, 3, "HI").call(2, 3, "HI"));
add(new Scn("link_timeout_then_disconnect").connect().key().call(1, 3, "HI").tick6().disconnect().connect().call(1, 3, "HI").tick6().disconnect().call(1, 3, "HI"));
add(new Scn("link_garbage_write_revives_link").connect().key().call(1, 3, "HI").tick6().text("zzz").call(1, 3, "HI").tick6().raw(rbytes(16)).tick());
add(new Scn("link_restored_by_key_resend").connect().key().call(1, 3, "HI").tick6().key().call(1, 3, "HI"));
add(new Scn("disconnect_clears").connect().key().call(1, 3, "HI").disconnect().tick().connect().call(1, 3, "HI").call(2, 5, "LO").disconnect().disconnect().connect().call(2, 5, "LO"));
add(new Scn("disconnect_keeps_key").connect().key().call(3, 3, "HI", false, 2).disconnect().connect().call(4, 4, "L", false, 2).call(3, 3, "HI", false, 2).call(5, 4, "L", false, 1));
add(new Scn("connect_connect_draws").connect().connect().disconnect().connect().tick().adv(7000).tick().tick());
add(new Scn("write_before_connect").key().call(1, 3, "HI").tick().adv(3000).call(2, 3, "LO").adv(7000).tick());
add(new Scn("write_before_connect_garbage").text("junk").text("junk").tick().adv(6001).tick());
add(new Scn("garbage_lengths_and_magics").connect().key().raw(new Uint8Array(0)).raw(rbytes(1)).raw(rbytes(15)).raw(rbytes(17)).raw(rbytes(19)).raw(rbytes(20)).raw(new Uint8Array(16)).raw(new Uint8Array(18)).raw(new Uint8Array(16).fill(0x51)).raw(new Uint8Array(16).fill(0x4b)).raw(new Uint8Array(18).fill(0x51)).call(1, 3, "HI"));
add(new Scn("tick_idle_no_effects").tick().adv(100000).tick().connect().tick().tick());
add(new Scn("clock_start_large", { clock0: 1700000000000 }).connect().key().call(1, 3, "HI").adv(5000).hb(2).adv(6001).tick().call(2, 3, "HI").adv(21600001).tick());
add(new Scn("clock_start_zero", { clock0: 0 }).connect().key().call(1, 3, "HI").tick6().call(1, 3, "HI"));
add(new Scn("insecure_start_full_flow", { secure0: false }).connect().key().text("P").text("H").secure(true).key().call(1, 2, "L").secure(false).call(2, 2, "L").text("P").secure(true).text("P").text("C1,1,M,0"));

// randomized scenarios from the fixed seed
function randomScenario(idx) {
  const s = new Scn("random_" + (idx + 1), { clock0: 1000 + rint(100000), secure0: R() < 0.8 });
  const pairingBias = idx % 3 === 2;
  const keys = [[42, GK1], [43, GK2], [7, rbytes(16)]];
  let k = keys[0], n = 0, inning = 1;
  const nextN = () => (R() < 0.15 ? Math.max(1, n - rint(4)) : R() < 0.1 ? n : (n += 1 + (R() < 0.1 ? rint(5) : 0)));
  const frame = (kind, bad) => {
    const m = { kind, sign: String(1 + rint(9)), loc: pick(LOCS), chg: R() < 0.3 };
    let inn = R() < 0.1 ? Math.max(1, inning - 1 - rint(2)) : R() < 0.1 ? Math.min(255, inning + 1) : inning;
    const f = s.seal(Math.max(1, Math.min(65535, nextN())), m, inn, k[0], k[1]);
    if (bad === "tag") f[8 + rint(8)] ^= 1 << rint(8);
    if (bad === "any") f[rint(16)] ^= 1 << rint(8);
    if (R() < 0.3 && !bad) inning = Math.max(inning, f[2]);
    return f;
  };
  const plainText = () => {
    const c = pick(["C", "C", "C", "X", "E"]);
    const nn = R() < 0.1 ? "0" + (n + 1) : String(R() < 0.2 ? Math.max(1, n - rint(3)) : (n += 1));
    if (c === "C") return "C" + nn + "," + (R() < 0.05 ? "0" : 1 + rint(9)) + "," + (R() < 0.05 ? "ZZ" : pick(LOCS)) + "," + (R() < 0.05 ? "2" : rint(2));
    return c + nn + (R() < 0.05 ? "," : "");
  };
  const steps = 60 + rint(60);
  s.connect();
  for (let i = 0; i < steps; i++) {
    const r = R();
    if (r < 0.04) s.connect();
    else if (r < 0.07) s.disconnect();
    else if (r < 0.17) s.adv(pick([1, 50, 500, 1000, 3000, 5999, 6000, 6001, 9000, R() < 0.02 ? 6 * 3600e3 + 1 : 20]));
    else if (r < 0.27) s.tick();
    else if (r < 0.31) s.secure(R() < 0.7);
    else if (r < 0.37) { if (R() < 0.3) k = pick(keys); s.key(k[0], k[1]); if (R() < 0.5) { n = R() < 0.5 ? 0 : n; inning = 1; } }
    else if (r < 0.40) s.text(pairingBias || R() < 0.3 ? "P" : "H");
    else if (r < 0.43) s.text("H");
    else if (r < 0.47) s.raw(rbytes(rint(25)));                                   // garbage
    else if (r < 0.50) s.raw(Buffer.concat([Buffer.from([0x51]), rbytes(15)]));    // garbage that looks like a frame
    else if (r < 0.53) s.raw(frame(pick(["call", "clear", "hb", "end"]), "any"));  // tampered
    else if (r < 0.57) s.raw(frame("call", "tag"));                                // forged tag
    else if (r < 0.60) s.raw(s.seal(Math.min(65535, ++n), { kind: "call", sign: "3", loc: "HI" }, 1, k[0] + 1 & 255, k[1])); // wrong key id
    else if (r < 0.64) s.raw(rawSeal(k[1], k[0], inning, Math.min(65535, ++n), rint(7), rint(12), rint(40)));   // valid tag, random body
    else if (pairingBias ? r < 0.85 : r < 0.67) s.text(plainText());
    else s.raw(frame(pick(["call", "call", "call", "clear", "hb", "hb", "end"]), null));
    if (R() < 0.05) { n = Math.max(0, n - rint(3)); }
    if (R() < 0.04 && s.steps.length) s.raw(s.steps.filter((x) => x.op === "write").slice(-1).map((x) => unhex(x.hex))[0] || new Uint8Array(0)); // an exact repeat of the last write
  }
  return s;
}
for (let i = 0; i < 12; i++) add(randomScenario(i));

// ---------------------------------------------------------------- run the JS, write the file
const run = scenarios.map(runJs);
const names = new Set(); for (const r of run) { assert(!names.has(r.name), "duplicate scenario " + r.name); names.add(r.name); }

console.log("scenarios:", run.length, "(random:", run.filter((r) => r.name.startsWith("random_")).length + ")", "steps:", run.reduce((a, r) => a + r.steps.length, 0), "events:",
  run.reduce((a, r) => a + r.steps.reduce((b, s) => b + s.expect.events.length, 0), 0), "rejected total:", run.reduce((a, r) => a + r.final_rejected, 0));
console.log("crypto:", Object.entries(crypto_v).map(([k, v]) => k + "=" + v.length).join(" "));
assert(run.length >= 40, "need at least 40 scenarios");
assert(run.filter((r) => r.name.startsWith("random_")).length >= 10, "need at least 10 randomized scenarios");
fs.writeFileSync(OUT, JSON.stringify({ source: path.basename(JS_PATH), loc_names: LOCS, crypto: crypto_v, scenarios: run }, null, 1) + "\n");
console.log("wrote", OUT);
