/*
 * pq_sec.c - see pq_sec.h.  Port of PQSec from watch/bangle/pitchiq.app.js (lines 35-148).
 * "JS Lnn" in a comment points at the line of that file the code follows.
 */
#include "pq_sec.h"

#include <string.h>

/* The AES S-box.  The JS builds it at start-up from the GF(2^8) inverse (JS L38-49); here it is a
 * const table (it lives in flash, no start-up work).  tests/test_core.c checks FIPS-197. */
static const uint8_t SBOX[256] = {
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
    0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
    0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
    0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
    0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,

};

static const uint8_t RCON[10] = {0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36};

const char *const PQ_LOCS[PQ_LOC_COUNT] = {"HI", "HO", "LI", "LO", "L", "M", "CH", "CL"}; /* JS L117 */

static pq_aes_fn g_hook = NULL; /* JS L76: `native` */

void pq_sec_set_aes(pq_aes_fn fn) { g_hook = fn; }
bool pq_sec_aes_is_hook(void) { return g_hook != NULL; }

/* multiply by x in GF(2^8)   (JS L50) */
static uint8_t xt(uint8_t a) { return (uint8_t)((a << 1) ^ ((a & 0x80) ? 0x1b : 0)); }

/* 176 bytes of round keys   (JS L51-60) */
static void expand(const uint8_t key[16], uint8_t w[176]) {
  unsigned i;
  uint8_t t0, t1, t2, t3, tt;
  for (i = 0; i < 16; i++) w[i] = key[i];
  for (i = 16; i < 176; i += 4) {
    t0 = w[i - 4];
    t1 = w[i - 3];
    t2 = w[i - 2];
    t3 = w[i - 1];
    if (i % 16 == 0) {
      tt = t0;
      t0 = (uint8_t)(SBOX[t1] ^ RCON[i / 16 - 1]);
      t1 = SBOX[t2];
      t2 = SBOX[t3];
      t3 = SBOX[tt];
    }
    w[i] = (uint8_t)(w[i - 16] ^ t0);
    w[i + 1] = (uint8_t)(w[i - 15] ^ t1);
    w[i + 2] = (uint8_t)(w[i - 14] ^ t2);
    w[i + 3] = (uint8_t)(w[i - 13] ^ t3);
  }
}

/* one block with expanded key w   (JS L61-75) */
static void block_sw(const uint8_t w[176], const uint8_t in[16], uint8_t out[16]) {
  uint8_t s[16], t[16];
  unsigned r, c, i;
  for (i = 0; i < 16; i++) s[i] = (uint8_t)(in[i] ^ w[i]);
  for (r = 1; r <= 10; r++) {
    for (i = 0; i < 16; i++) t[i] = SBOX[s[(i + 4 * (i % 4)) % 16]]; /* SubBytes + ShiftRows */
    if (r < 10) {
      for (c = 0; c < 16; c += 4) { /* MixColumns */
        uint8_t a0 = t[c], a1 = t[c + 1], a2 = t[c + 2], a3 = t[c + 3];
        uint8_t all = (uint8_t)(a0 ^ a1 ^ a2 ^ a3);
        s[c] = (uint8_t)(a0 ^ all ^ xt((uint8_t)(a0 ^ a1)));
        s[c + 1] = (uint8_t)(a1 ^ all ^ xt((uint8_t)(a1 ^ a2)));
        s[c + 2] = (uint8_t)(a2 ^ all ^ xt((uint8_t)(a2 ^ a3)));
        s[c + 3] = (uint8_t)(a3 ^ all ^ xt((uint8_t)(a3 ^ a0)));
      }
    } else {
      for (i = 0; i < 16; i++) s[i] = t[i];
    }
    for (i = 0; i < 16; i++) s[i] = (uint8_t)(s[i] ^ w[r * 16 + i]);
  }
  memcpy(out, s, 16);
}

void pq_aes128_sw(const uint8_t key[16], const uint8_t in[16], uint8_t out[16]) {
  uint8_t w[176];
  expand(key, w);
  block_sw(w, in, out);
  memset(w, 0, sizeof w);
}

void pq_aes128(const uint8_t key[16], const uint8_t in[16], uint8_t out[16]) {
  if (g_hook) {
    uint8_t tmp[16];
    g_hook(key, in, tmp);
    memcpy(out, tmp, 16);
  } else {
    pq_aes128_sw(key, in, out);
  }
}

/* A key bound to one cipher.  With the software cipher the key is expanded once and reused for every block of a
 * CMAC; with a hook each block goes through the hook (JS L77-81: cipher(key)). */
struct cipher {
  const uint8_t *key;
  bool sw;
  uint8_t rk[176];
};

static void cipher_init(struct cipher *c, const uint8_t key[16]) {
  c->key = key;
  c->sw = (g_hook == NULL);
  if (c->sw) expand(key, c->rk);
}

static void cipher_block(const struct cipher *c, const uint8_t in[16], uint8_t out[16]) {
  if (c->sw) {
    block_sw(c->rk, in, out);
  } else {
    uint8_t tmp[16];
    g_hook(c->key, in, tmp);
    memcpy(out, tmp, 16);
  }
}

static void cipher_wipe(struct cipher *c) { memset(c->rk, 0, sizeof c->rk); }

/* shift a 128-bit block left one bit   (JS L82) */
static void shl(const uint8_t b[16], uint8_t o[16]) {
  unsigned i;
  for (i = 0; i < 16; i++) o[i] = (uint8_t)((b[i] << 1) | (i < 15 ? (b[i + 1] >> 7) : 0));
}

/* RFC 4493   (JS L83-96) */
void pq_cmac(const uint8_t key[16], const uint8_t *msg, size_t len, uint8_t out[16]) {
  struct cipher E;
  uint8_t L[16], K1[16], K2[16], last[16], x[16], y[16];
  size_t n, j, k;
  unsigned i;
  bool whole;

  cipher_init(&E, key);
  memset(x, 0, 16);
  memset(y, 0, 16);
  cipher_block(&E, y, L); /* L = E(0) */
  shl(L, K1);
  if (L[0] & 0x80) K1[15] ^= 0x87;
  shl(K1, K2);
  if (K1[0] & 0x80) K2[15] ^= 0x87;

  n = (len + 15) / 16;
  whole = n > 0 && len % 16 == 0;
  if (n == 0) n = 1;
  for (i = 0; i < 16; i++) {
    k = (n - 1) * 16 + i;
    if (whole)
      last[i] = (uint8_t)(msg[k] ^ K1[i]);
    else
      last[i] = (uint8_t)((k < len ? msg[k] : (k == len ? 0x80 : 0)) ^ K2[i]);
  }
  for (j = 0; j + 1 < n; j++) {
    for (i = 0; i < 16; i++) y[i] = (uint8_t)(x[i] ^ msg[j * 16 + i]);
    cipher_block(&E, y, x);
  }
  for (i = 0; i < 16; i++) y[i] = (uint8_t)(x[i] ^ last[i]);
  cipher_block(&E, y, out);
  cipher_wipe(&E);
}

/* SP 800-108 counter mode, one block   (JS L97-104) */
int pq_kdf(const uint8_t key[16], const char *label, const uint8_t *ctx, size_t ctx_len, uint8_t out[16]) {
  uint8_t m[1 + PQ_KDF_MAX_LABEL + 1 + PQ_KDF_MAX_CTX + 2];
  size_t o = 0, i, ll = strlen(label);
  if (ll > PQ_KDF_MAX_LABEL || ctx_len > PQ_KDF_MAX_CTX) return -1;
  m[o++] = 1;
  for (i = 0; i < ll; i++) m[o++] = (uint8_t)label[i];
  m[o++] = 0;
  for (i = 0; i < ctx_len; i++) m[o++] = ctx[i];
  m[o++] = 0x00;
  m[o++] = 0x80;
  pq_cmac(key, m, o, out);
  return 0;
}

/* JS L105-108 */
void pq_inning_keys_derive(const uint8_t game_key[16], uint8_t inning, struct pq_inning_keys *out) {
  uint8_t c[1];
  c[0] = inning;
  (void)pq_kdf(game_key, "PQ-ENC", c, 1, out->enc);
  (void)pq_kdf(game_key, "PQ-MAC", c, 1, out->mac);
}

/* JS L109: the JS also compares lengths first; both are always 8 here. */
bool pq_ct_equal(const uint8_t *a, const uint8_t *b, size_t n) {
  uint8_t d = 0;
  size_t i;
  for (i = 0; i < n; i++) d |= (uint8_t)(a[i] ^ b[i]);
  return d == 0;
}

/* Counter-mode keystream for the 3 body bytes: the block is head[0..5) then zeros, encrypted under the
 * inning's enc key; the body is XORed with its first bytes (JS L110-115).  Same call encrypts and decrypts. */
static void ctr3(const uint8_t enc_key[16], const uint8_t head[5], const uint8_t body[3], uint8_t out[3]) {
  uint8_t cb[16], ks[16];
  unsigned i;
  memset(cb, 0, 16);
  for (i = 0; i < 5; i++) cb[i] = head[i];
  pq_aes128(enc_key, cb, ks);
  for (i = 0; i < 3; i++) out[i] = (uint8_t)(body[i] ^ ks[i]);
}

/* JS L119-127.  Layout: 0x51 | key id | inning | n hi | n lo | 3 encrypted body bytes | 8-byte CMAC tag of bytes 0..7.
 * Body: [kind, sign (calls), loc code (calls) | 16 if "changed"]. */
int pq_seal(const struct pq_inning_keys *keys, uint8_t key_id, uint8_t inning, uint32_t n, const struct pq_msg *m,
            uint8_t frame[PQ_FRAME_LEN]) {
  uint8_t body[3], ct[3], tag[16];
  unsigned i;
  bool is_call;
  if (!(n >= 1 && n <= 65535) || inning < 1 || m->kind < PQ_KIND_CALL || m->kind > PQ_KIND_END || m->loc >= PQ_LOC_COUNT)
    return -1;
  is_call = (m->kind == PQ_KIND_CALL);
  frame[0] = PQ_FRAME_MAGIC;
  frame[1] = key_id;
  frame[2] = inning;
  frame[3] = (uint8_t)((n >> 8) & 0xff);
  frame[4] = (uint8_t)(n & 0xff);
  body[0] = m->kind;
  body[1] = is_call ? m->sign : 0;
  body[2] = (uint8_t)((is_call ? m->loc : 0) | (m->chg ? 16 : 0));
  ctr3(keys->enc, frame, body, ct);
  for (i = 0; i < 3; i++) frame[5 + i] = ct[i];
  pq_cmac(keys->mac, frame, 8, tag);
  for (i = 0; i < 8; i++) frame[8 + i] = tag[i];
  return 0;
}

/* JS L129-142 */
bool pq_open(const uint8_t frame[PQ_FRAME_LEN], uint8_t key_id, pq_keys_for_fn keys_for, void *user, struct pq_msg *out) {
  const struct pq_inning_keys *keys;
  uint8_t tag[16], body[3], ct[3];
  uint32_t n;
  uint8_t kind;
  if (frame[0] != PQ_FRAME_MAGIC || frame[1] != key_id || frame[2] < 1) return false;
  keys = keys_for(user, frame[2]);
  pq_cmac(keys->mac, frame, 8, tag);
  if (!pq_ct_equal(tag, frame + 8, PQ_TAG_LEN)) return false; /* forged / tampered / another game's */
  ct[0] = frame[5];
  ct[1] = frame[6];
  ct[2] = frame[7];
  ctr3(keys->enc, frame, ct, body);
  n = ((uint32_t)frame[3] << 8) | frame[4];
  kind = body[0];
  if (kind < PQ_KIND_CALL || kind > PQ_KIND_END || n < 1) return false;
  out->key_id = frame[1];
  out->inning = frame[2];
  out->n = n;
  out->kind = kind;
  out->chg = (body[2] & 16) != 0;
  out->sign = 0;
  out->loc = 0;
  if (kind == PQ_KIND_CALL) {
    out->sign = body[1];
    out->loc = (uint8_t)(body[2] & 15);
    if (!(body[1] >= 1 && body[1] <= 9) || out->loc >= PQ_LOC_COUNT) return false;
  }
  return true;
}

/* JS L143 */
void pq_keyframe_build(uint8_t key_id, const uint8_t key[16], uint8_t frame[PQ_KEY_FRAME_LEN]) {
  unsigned i;
  frame[0] = PQ_KEY_MAGIC;
  frame[1] = key_id;
  for (i = 0; i < 16; i++) frame[2 + i] = key[i];
}

bool pq_keyframe_parse(const uint8_t *data, size_t len, uint8_t *key_id, uint8_t key[16]) {
  unsigned i;
  if (len != PQ_KEY_FRAME_LEN || data[0] != PQ_KEY_MAGIC) return false;
  *key_id = data[1];
  for (i = 0; i < 16; i++) key[i] = data[2 + i];
  return true;
}
