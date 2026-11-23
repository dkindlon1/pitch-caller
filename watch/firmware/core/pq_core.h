/*
 * pq_core.h - the PitchIQ watch message state machine in portable C99.
 *
 * Port of PQCore(io) from watch/bangle/pitchiq.app.js (lines 151-233): what to show, buzz and
 * acknowledge for each connect, disconnect, write and one-second tick.  All hardware access goes
 * through struct pq_io.  No malloc, no floating point.
 */
#ifndef PQ_CORE_H
#define PQ_CORE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "pq_sec.h"

#define PQ_LINK_MS 6000u                        /* JS L32: no message for this long = NO LINK        */
#define PQ_KEY_MS (6u * 3600u * 1000u)          /* JS L33: a game key nobody ended expires after 6 h */

enum pq_buzz_kind { PQ_BUZZ_NEW = 0, PQ_BUZZ_CHANGED = 1 };

/* What the screen should show (JS view()).  If `sign` is NULL there is no call and `words` / `nwords` are
 * meaningless (JS: words null).  Otherwise sign is "1".."9" and words holds nwords (0, 1 or 2) text lines;
 * nwords == 0 is the "get it over" call, which shows the sign alone (JS: words []).  The pointers are to
 * static strings and stay valid; the struct itself is only valid during the draw callback. */
struct pq_view {
  bool link;
  bool nokey;
  const char *sign;
  const char *words[2];
  uint8_t nwords;
};

/* Hardware access.  Every function gets `user` back as its first argument. */
struct pq_io {
  void *user;
  void (*draw)(void *user, const struct pq_view *view);
  void (*buzz)(void *user, enum pq_buzz_kind kind);
  void (*light)(void *user);
  void (*notify)(void *user, const uint8_t *bytes, size_t len); /* receipts to the coach: "K<id>", "P", "A<n>", "B<pct>" */
  uint64_t (*now_ms)(void *user);                                /* any monotonic millisecond clock */
  bool (*secure)(void *user);                                    /* the link is encrypted and passkey-bonded */
};

enum pq_mode { PQ_MODE_NONE = 0, PQ_MODE_FULL = 1, PQ_MODE_PAIRING = 2 };

struct pq_shown {
  uint8_t sign; /* 1..9 */
  uint8_t loc;  /* index into PQ_LOCS */
};

/* The state (JS `st`).  Fields are public so tests can look at them; do not write to them. */
struct pq_core {
  struct pq_io io;
  uint64_t last_n;         /* JS lastN: highest message number accepted */
  bool has_show;           /* JS show != null */
  struct pq_shown show;
  bool has_held;           /* JS held != null: the call taken off by a quiet spell, kept so a repeat can restore it */
  uint64_t held_n;
  struct pq_shown held;
  bool link;
  uint64_t last_rx;
  uint8_t key[16];         /* valid while mode == PQ_MODE_FULL */
  uint8_t key_id;
  uint64_t key_at;
  uint8_t inning;
  struct pq_inning_keys keys; /* cache for keys_inning */
  uint8_t keys_inning;        /* 0 = nothing cached */
  uint32_t rejected;
  uint8_t mode;               /* enum pq_mode */
};

void pq_core_init(struct pq_core *c, const struct pq_io *io);
void pq_core_on_connect(struct pq_core *c);
void pq_core_on_disconnect(struct pq_core *c);
/* One write from the coach's app (up to 20 bytes on the wire; any length is handled). */
void pq_core_on_write(struct pq_core *c, const uint8_t *data, size_t len);
/* Call about once a second. */
void pq_core_tick(struct pq_core *c);
void pq_core_view(const struct pq_core *c, struct pq_view *out);

#endif
