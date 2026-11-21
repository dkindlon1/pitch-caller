/*
 * Build 4 proof 1 and 3 (docs/PLAN_watch_security_2026-11-18.md 4): the watch crypto on both sides.
 *   - the block in watch/bangle/pitchiq.app.js is byte for byte app/watch_sec.js's (the sender's);
 *   - both copies give the published answers: AES-128 FIPS-197 C.1, CMAC RFC 4493 examples 1-4;
 *   - an independent build of CMAC, the inning-key derivation and the frame from Node's own AES (OpenSSL) agrees with
 *     both copies for every inning 1-255 and a spread of messages; pinned vectors (computed once, checked by that
 *     independent build) catch any later change on either side;
 *   - a frame sealed by the sender opens on the watch's copy and the other way round, for every inning including extras.
 * Run: node watch_sec_test.js
 */
const fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");
const Sender = require("./watch_sec.js");
let fails = 0, checks = 0;
const check = (ok, msg) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const h = (x) => new Uint8Array(Buffer.from(x, "hex")), hx = (u) => Buffer.from(u).toString("hex");

const appSrc = fs.readFileSync(path.join(__dirname, "../watch/bangle/pitchiq.app.js"), "utf8");
const secSrc = fs.readFileSync(path.join(__dirname, "watch_sec.js"), "utf8");
const block = (src) => { const a = src.indexOf("/*PQSEC-BEGIN*/"), b = src.indexOf("/*PQSEC-END*/"); return a >= 0 && b > a ? src.slice(a, b) : null; };
const ctx = {}; vm.createContext(ctx); vm.runInContext(appSrc, ctx);
const Watch = ctx.PQSec;

// ---------------------------------------------------------------- an independent build on OpenSSL's AES
const aesECB = (key, b) => { const c = crypto.createCipheriv("aes-128-ecb", Buffer.from(key), null); c.setAutoPadding(false); return new Uint8Array(c.update(Buffer.from(b))); };
function dbl(b) { const o = Buffer.alloc(16); let carry = 0; for (let i = 15; i >= 0; i--) { o[i] = ((b[i] << 1) | carry) & 0xff; carry = b[i] >> 7; } if (b[0] & 0x80) o[15] ^= 0x87; return o; }
function refCmac(key, msg) {
  const k1 = dbl(aesECB(key, Buffer.alloc(16))), k2 = dbl(k1), m = Buffer.from(msg);
  const blocks = Math.max(1, Math.ceil(m.length / 16)), complete = m.length > 0 && m.length % 16 === 0;
  const last = Buffer.alloc(16); m.copy(last, 0, (blocks - 1) * 16);
  if (!complete) { last[m.length - (blocks - 1) * 16] = 0x80; for (let i = 0; i < 16; i++) last[i] ^= k2[i]; } else for (let i = 0; i < 16; i++) last[i] ^= k1[i];
  let x = Buffer.alloc(16);
  for (let j = 0; j < blocks - 1; j++) { const y = Buffer.alloc(16); for (let i = 0; i < 16; i++) y[i] = x[i] ^ m[j * 16 + i]; x = Buffer.from(aesECB(key, y)); }
  const y = Buffer.alloc(16); for (let i = 0; i < 16; i++) y[i] = x[i] ^ last[i];
  return aesECB(key, y);
}
const refKdf = (key, label, inning) => refCmac(key, Buffer.concat([Buffer.from([1]), Buffer.from(label, "latin1"), Buffer.from([0, inning]), Buffer.from([0x00, 0x80])]));
const LOCS = ["HI", "HO", "LI", "LO", "L", "M", "CH", "CL"], KIND = { call: 1, clear: 2, hb: 3, end: 4 };
function refSeal(gameKey, keyId, inning, n, m) {
  const enc = refKdf(gameKey, "PQ-ENC", inning), mac = refKdf(gameKey, "PQ-MAC", inning);
  const head = Buffer.from([0x51, keyId, inning, n >> 8, n & 0xff]);
  // AES-CTR from OpenSSL itself, counter block = the 5 header bytes then zeros
  const c = crypto.createCipheriv("aes-128-ctr", Buffer.from(enc), Buffer.concat([head, Buffer.alloc(11)]));
  const body = Buffer.from([KIND[m.kind], m.kind === "call" ? +m.sign : 0, (m.kind === "call" ? LOCS.indexOf(m.loc) : 0) | (m.chg ? 16 : 0)]);
  const first8 = Buffer.concat([head, c.update(body)]);
  return new Uint8Array(Buffer.concat([first8, Buffer.from(refCmac(mac, first8)).subarray(0, 8)]));
}

console.log("1. One code on both sides");
check(block(secSrc) && block(secSrc) === block(appSrc), "the watch app's crypto block is byte for byte the sender's (app/watch_sec.js)");
check(typeof Watch === "object" && typeof Watch.seal === "function" && typeof Watch.open === "function", "the watch app's copy loads on its own (no Bangle needed)");

console.log("2. Published test vectors, on the sender and on the watch");
const fipsK = h("000102030405060708090a0b0c0d0e0f"), fipsP = h("00112233445566778899aabbccddeeff"), fipsC = "69c4e0d86a7b0430d8cdb78070b4c55a";
const K = h("2b7e151628aed2a6abf7158809cf4f3c");
const RFC4493 = [["", "bb1d6929e95937287fa37d129b756746"], ["6bc1bee22e409f96e93d7e117393172a", "070a16b46b4d4144f79bdd9dd04a287c"],
  ["6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411", "dfa66747de9ae63030ca32611497c827"],
  ["6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710", "51f0bebf7e3b9d92fc49741779363cfe"]];
for (const [name, S] of [["sender", Sender], ["watch", Watch]]) {
  check(hx(S.aes(fipsK, fipsP)) === fipsC && hx(S.jsAes(fipsK, fipsP)) === fipsC, `${name}: AES-128 FIPS-197 C.1`);
  check(RFC4493.every(([m, t]) => hx(S.cmac(K, h(m))) === t), `${name}: CMAC, RFC 4493 examples 1-4 (0, 16, 40 and 64 bytes)`);
  check(RFC4493.every(([m, t]) => hx(refCmac(K, h(m))) === t), `the independent CMAC agrees with RFC 4493 too (${name} round)`);
}
let rnd = 0; for (let i = 0; i < 300; i++) { const k = crypto.randomBytes(16), b = crypto.randomBytes(16); if (hx(Sender.aes(k, b)) === hx(aesECB(k, b)) && hx(Watch.aes(k, b)) === hx(aesECB(k, b))) rnd++; }
check(rnd === 300, `AES on 300 random keys and blocks matches OpenSSL on both sides (${rnd}/300)`);

console.log("3. Inning keys: the same on both sides for every inning, extras included");
const gk = h("000102030405060708090a0b0c0d0e0f");
const PINNED_KEYS = { 1: ["e4a9df31a985cd9ad9d4bcc78b04fe37", "e89e528f7e6d498b87c0c401e1156284"], 2: ["e7f7766cd9737c150589f60208c2eb13", "3ebc09b84c110f638f38f105848fc934"],
  9: ["9743a69bc01cc09dc2a8dac43821978e", "939355d66485e7c0bcfaade636b1b0d9"], 10: ["bf16df2a6b41fe4c909b0740f6db0bea", "3fcfec9cd07da00c4be4ab689a4f5a3b"],
  255: ["bff8ab580dfdda88558876277bb848be", "929d3a2bc2b62f2da8e22a5b0c35f7a0"] };
let agree = 0, distinct = new Set();
for (let i = 1; i <= 255; i++) {
  const a = Sender.inningKeys(gk, i), b = Watch.inningKeys(gk, i), re = refKdf(gk, "PQ-ENC", i), rm = refKdf(gk, "PQ-MAC", i);
  if (hx(a.enc) === hx(b.enc) && hx(a.mac) === hx(b.mac) && hx(a.enc) === hx(re) && hx(a.mac) === hx(rm)) agree++;
  distinct.add(hx(a.enc)); distinct.add(hx(a.mac));
}
check(agree === 255, `innings 1-255: sender, watch and the independent build derive the same keys (${agree}/255)`);
check(distinct.size === 510, "every inning's two keys differ from each other and from every other inning's");
check(Object.entries(PINNED_KEYS).every(([i, [e, m]]) => hx(Sender.inningKeys(gk, +i).enc) === e && hx(Sender.inningKeys(gk, +i).mac) === m), "pinned inning keys (1, 2, 9, 10, 255) unchanged");
const gk2 = h("ffeeddccbbaa99887766554433221100");
check(hx(Sender.inningKeys(gk2, 1).enc) !== hx(Sender.inningKeys(gk, 1).enc), "another game key gives other inning keys");

console.log("4. Messages: sealed the same everywhere, opened across sides");
const PINNED = [[1, 1, { kind: "call", sign: "3", loc: "LO", chg: false }, "512a010001d3cea6d82b0bb52c8510f5"], [1, 2, { kind: "call", sign: "6", loc: "CL", chg: true }, "512a010002fe6159e5c9fcb9a0200c89"],
  [7, 300, { kind: "clear" }, "512a07012c21ad489489ad9aeae175f0"], [12, 65535, { kind: "end" }, "512a0cffffde5af90b3d3f682c515a75"]];
for (const [inn, n, m, want] of PINNED) {
  const s1 = hx(Sender.seal(Sender.inningKeys(gk, inn), 0x2a, inn, n, m)), s2 = hx(Watch.seal(Watch.inningKeys(gk, inn), 0x2a, inn, n, m)), r = hx(refSeal(gk, 0x2a, inn, n, m));
  check(s1 === want && s2 === want && r === want, `pinned ${m.kind}${m.sign ? " " + m.sign + "/" + m.loc : ""} inning ${inn} #${n}: sender, watch and the independent build all give ${want}`);
}
let cross = 0, total = 0;
for (let i = 0; i < 400; i++) {
  const key = crypto.randomBytes(16), id = crypto.randomBytes(1)[0], inn = 1 + (i % 255), n = 1 + crypto.randomBytes(2).readUInt16BE(0) % 65535;
  const kinds = ["call", "clear", "hb", "end"], kind = kinds[i % 4];
  const m = kind === "call" ? { kind, sign: String(1 + (i % 9)), loc: LOCS[i % 8], chg: i % 3 === 0 } : { kind };
  const a = Sender.seal(Sender.inningKeys(key, inn), id, inn, n, m), b = Watch.seal(Watch.inningKeys(key, inn), id, inn, n, m), r = refSeal(key, id, inn, n, m);
  const oa = Watch.open(a, id, (x) => Watch.inningKeys(key, x)), ob = Sender.open(b, id, (x) => Sender.inningKeys(key, x));
  total++;
  if (hx(a) === hx(b) && hx(a) === hx(r) && oa && ob && oa.kind === kind && oa.n === n && oa.inning === inn && (kind !== "call" || (oa.sign === m.sign && oa.loc === m.loc && oa.chg === m.chg)) && JSON.stringify(oa) === JSON.stringify(ob)) cross++;
}
check(cross === total, `400 random messages (every kind, innings 1-255, random keys): identical on both sides and the independent build, and each opens on the other side (${cross}/${total})`);
const one = Sender.seal(Sender.inningKeys(gk, 3), 1, 3, 5, { kind: "call", sign: "2", loc: "HI", chg: false });
check(Watch.open(one, 2, (x) => Watch.inningKeys(gk, x)) === null, "the wrong game key id: not opened");
check(Watch.open(one, 1, (x) => Watch.inningKeys(gk2, x)) === null, "the wrong game key: not opened");
check(Watch.open(one.slice(0, 15), 1, (x) => Watch.inningKeys(gk, x)) === null, "a short frame: not opened");
check(one.length === 16 && Sender.keyFrame(1, gk).length === 18, "sizes: a message 16 bytes, the key 18 (one 20-byte write each)");

console.log(fails ? `${fails} of ${checks} watch crypto checks FAILED` : `all ${checks} watch crypto checks passed`);
process.exit(fails ? 1 : 0);
