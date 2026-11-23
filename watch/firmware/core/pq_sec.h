/*
 * pq_sec.h - PitchIQ watch security layer in portable C99.
 *
 * A line-for-line port of the PQSec block (between PQSEC-BEGIN and PQSEC-END) of
 * watch/bangle/pitchiq.app.js: AES-128 block encrypt, CMAC (RFC 4493), the SP 800-108
 * counter-mode KDF, per-inning keys, sealing and opening of 16-byte frames, and the
 * 18-byte key frame.  No dynamic allocation, no floating point, nothing from libc
 * beyond string.h.
 */
#ifndef PQ_SEC_H
#define PQ_SEC_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define PQ_KEY_LEN 16
#define PQ_FRAME_LEN 16      /* a sealed call / clear / heartbeat / end   (JS: PQSec.FRAME)     */
#define PQ_KEY_FRAME_LEN 18  /* 'K' + key id + 16 key bytes               (JS: PQSec.KEY_FRAME) */
#define PQ_TAG_LEN 8
#define PQ_FRAME_MAGIC 0x51  /* 'Q', first byte of a sealed frame */
#define PQ_KEY_MAGIC 0x4b    /* 'K', first byte of a key frame    */
#define PQ_KDF_MAX_LABEL 16
#define PQ_KDF_MAX_CTX 16

/* ---- AES-128 ------------------------------------------------------------------------ */

/* One ECB block encrypt: out = AES-128(key, in).  `out` may alias `in`. */
typedef void (*pq_aes_fn)(const uint8_t key[16], const uint8_t in[16], uint8_t out[16]);

/* Replace the software block cipher (for example with the chip's AES-ECB engine).
 * NULL puts the software one back.  Mirrors PQSec.useNative() in the JS.            */
void pq_sec_set_aes(pq_aes_fn fn);
bool pq_sec_aes_is_hook(void);

/* The software cipher itself (always available, handy for checking a hardware one). */
void pq_aes128_sw(const uint8_t key[16], const uint8_t in[16], uint8_t out[16]);
/* The cipher currently in use (hook if set, else software). */
void pq_aes128(const uint8_t key[16], const uint8_t in[16], uint8_t out[16]);

/* ---- CMAC / KDF / inning keys ------------------------------------------------------- */

/* RFC 4493 AES-CMAC over msg[0..len).  msg may be NULL when len is 0. */
void pq_cmac(const uint8_t key[16], const uint8_t *msg, size_t len, uint8_t out[16]);

/* SP 800-108 counter mode, one 128-bit block:
 *   CMAC(key, [1] || label || 0x00 || ctx || [0x00, 0x80])
 * Returns 0 on success, -1 if label or ctx is longer than the fixed buffers allow.   */
int pq_kdf(const uint8_t key[16], const char *label, const uint8_t *ctx, size_t ctx_len, uint8_t out[16]);

struct pq_inning_keys {
  uint8_t enc[16];
  uint8_t mac[16];
};

/* enc = KDF(game_key, "PQ-ENC", [inning]),  mac = KDF(game_key, "PQ-MAC", [inning]) */
void pq_inning_keys_derive(const uint8_t game_key[16], uint8_t inning, struct pq_inning_keys *out);

/* ---- frames ------------------------------------------------------------------------- */

enum pq_kind { PQ_KIND_CALL = 1, PQ_KIND_CLEAR = 2, PQ_KIND_HB = 3, PQ_KIND_END = 4 };

#define PQ_LOC_COUNT 8
/* Location codes in wire order: HI HO LI LO L M CH CL (index = the 4-bit code in a frame). */
extern const char *const PQ_LOCS[PQ_LOC_COUNT];

struct pq_msg {
  uint8_t key_id;
  uint8_t inning;
  uint32_t n;      /* message number, 1..65535 in a sealed frame */
  uint8_t kind;    /* enum pq_kind */
  uint8_t sign;    /* call only: 1..9 after pq_open; pq_seal copies whatever it is given */
  uint8_t loc;     /* call only: index into PQ_LOCS, 0..7 */
  bool chg;        /* the "changed" bit (frame body bit 4); carried for every kind, as in the JS */
};

/* Build the 16-byte frame.  Returns 0, or -1 for a bad message (JS: throws "bad message"):
 * n outside 1..65535, inning 0, kind not 1..4, loc outside 0..7.  Sign is not checked here,
 * exactly as in the JS seal(). */
int pq_seal(const struct pq_inning_keys *keys, uint8_t key_id, uint8_t inning, uint32_t n, const struct pq_msg *m,
            uint8_t frame[PQ_FRAME_LEN]);

/* Supplies the keys for an inning; called only after the cheap header checks pass (JS: keysFor). */
typedef const struct pq_inning_keys *(*pq_keys_for_fn)(void *user, uint8_t inning);

/* Check and decrypt a 16-byte frame.  Returns true and fills *out, or false for anything
 * forged, tampered, from another game, or malformed.  The tag compare is constant time. */
bool pq_open(const uint8_t frame[PQ_FRAME_LEN], uint8_t key_id, pq_keys_for_fn keys_for, void *user, struct pq_msg *out);

/* 18-byte key frame: 'K', key id, 16 key bytes. */
void pq_keyframe_build(uint8_t key_id, const uint8_t key[16], uint8_t frame[PQ_KEY_FRAME_LEN]);
/* True (and fills id/key) when data is exactly an 18-byte frame starting with 'K'. */
bool pq_keyframe_parse(const uint8_t *data, size_t len, uint8_t *key_id, uint8_t key[16]);

/* Constant-time equality of n bytes. */
bool pq_ct_equal(const uint8_t *a, const uint8_t *b, size_t n);

#endif
