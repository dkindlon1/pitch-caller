/*
 * pq_core.c - see pq_core.h.  Port of PQCore from watch/bangle/pitchiq.app.js.
 * "JS Lnn" points at the line of that file whose rule the code follows.
 */
#include "pq_core.h"

#include <string.h>

/* JS L30: the words under the sign, indexed like PQ_LOCS (HI HO LI LO L M CH CL). "M" has none. */
static const struct {
  uint8_t n;
  const char *w[2];
} WORDS[PQ_LOC_COUNT] = {
    {2, {"HIGH AND", "INSIDE"}}, {2, {"HIGH AND", "OUTSIDE"}}, {2, {"LOW AND", "INSIDE"}}, {2, {"LOW AND", "OUTSIDE"}},
    {1, {"LOW", NULL}},          {0, {NULL, NULL}},            {2, {"CHASE", "HIGH"}},    {2, {"CHASE", "LOW"}},
};

static const char *const SIGNS[10] = {"0", "1", "2", "3", "4", "5", "6", "7", "8", "9"};

/* the message after it is decoded, whichever way it arrived */
struct msg {
  uint64_t n;
  uint8_t kind;
  uint8_t sign;
  uint8_t loc;
  bool chg;
};

/* JS L160 view() */
void pq_core_view(const struct pq_core *c, struct pq_view *v) {
  v->link = c->link;
  v->nokey = (c->mode == PQ_MODE_NONE);
  if (c->has_show) {
    v->sign = SIGNS[c->show.sign];
    v->nwords = WORDS[c->show.loc].n;
    v->words[0] = WORDS[c->show.loc].w[0];
    v->words[1] = WORDS[c->show.loc].w[1];
  } else {
    v->sign = NULL;
    v->nwords = 0;
    v->words[0] = v->words[1] = NULL;
  }
}

static void draw(struct pq_core *c) {
  struct pq_view v;
  pq_core_view(c, &v);
  c->io.draw(c->io.user, &v);
}

static void notify_num(struct pq_core *c, char prefix, uint64_t n) {
  uint8_t buf[24];
  size_t len = 0, i;
  uint8_t digits[20];
  size_t nd = 0;
  buf[len++] = (uint8_t)prefix;
  do {
    digits[nd++] = (uint8_t)('0' + (n % 10));
    n /= 10;
  } while (n);
  for (i = nd; i > 0; i--) buf[len++] = digits[i - 1];
  c->io.notify(c->io.user, buf, len);
}

/* JS L161 */
static void clear_shown(struct pq_core *c) {
  c->has_show = false;
  c->has_held = false;
}

/* JS L162: forget the key, the count, the inning, the mode and anything shown */
static void wipe(struct pq_core *c) {
  memset(c->key, 0, sizeof c->key);
  c->key_id = 0;
  memset(&c->keys, 0, sizeof c->keys);
  c->keys_inning = 0;
  c->last_n = 0;
  c->inning = 0;
  c->mode = PQ_MODE_NONE;
  clear_shown(c);
}

void pq_core_init(struct pq_core *c, const struct pq_io *io) {
  memset(c, 0, sizeof *c);
  c->io = *io;
}

/* JS L163 */
void pq_core_on_connect(struct pq_core *c) {
  clear_shown(c);
  c->link = true;
  c->last_rx = c->io.now_ms(c->io.user);
  draw(c);
}

/* JS L164 */
void pq_core_on_disconnect(struct pq_core *c) {
  c->link = false;
  clear_shown(c);
  draw(c);
}

/* JS L165: the keys of the inning a frame claims, derived once and kept */
static const struct pq_inning_keys *keys_for(void *user, uint8_t inning) {
  struct pq_core *c = (struct pq_core *)user;
  if (c->keys_inning != inning) {
    pq_inning_keys_derive(c->key, inning, &c->keys);
    c->keys_inning = inning;
  }
  return &c->keys;
}

static bool is_digit(uint8_t ch) { return ch >= '0' && ch <= '9'; }

/* The message number of a plain message: the JS needs parseInt(p) > 0 and String(n) === p, i.e. plain decimal digits,
 * no sign, no leading zero, not zero.  Limit: up to 2^53 (the JS also accepts a few larger, exactly representable
 * values; see README). */
static bool parse_n(const uint8_t *p, size_t len, uint64_t *out) {
  uint64_t n = 0;
  size_t i;
  if (len == 0 || len > 16 || p[0] < '1' || p[0] > '9') return false;
  for (i = 0; i < len; i++) {
    if (!is_digit(p[i])) return false;
    n = n * 10 + (uint64_t)(p[i] - '0');
  }
  if (n > 9007199254740992ull) return false;
  *out = n;
  return true;
}

/* a field (between commas) is exactly this loc code? */
static int loc_index(const uint8_t *p, size_t len) {
  int i;
  for (i = 0; i < PQ_LOC_COUNT; i++) {
    size_t l = strlen(PQ_LOCS[i]);
    if (l == len && memcmp(p, PQ_LOCS[i], len) == 0) return i;
  }
  return -1;
}

/* JS L168-177: a plain message (pairing-only mode): C<n>,<sign>,<loc>,<chg>   X<n>   E<n>.  data[0] is C, X or E. */
static bool plain(const uint8_t *data, size_t len, struct msg *m) {
  const uint8_t *p = data + 1;
  size_t plen = len - 1, i, nparts = 1, start[4], end[4];
  uint8_t c = data[0];
  int li;

  start[0] = 0;
  for (i = 0; i < plen; i++) {
    if (p[i] == ',') {
      if (nparts == 4) { /* more than 4 parts is wrong for every kind; stop splitting */
        nparts = 5;
        break;
      }
      end[nparts - 1] = i;
      start[nparts] = i + 1;
      nparts++;
    }
  }
  if (nparts > 4) return false;
  end[nparts - 1] = plen;

  if (!parse_n(p + start[0], end[0] - start[0], &m->n)) return false; /* JS L170 */
  if (c == 'C') {                                                      /* JS L171-172 */
    if (nparts != 4) return false;
    if (end[1] - start[1] != 1 || p[start[1]] < '1' || p[start[1]] > '9') return false;
    li = loc_index(p + start[2], end[2] - start[2]);
    if (li < 0) return false;
    if (end[3] - start[3] != 1 || (p[start[3]] != '0' && p[start[3]] != '1')) return false;
    m->kind = PQ_KIND_CALL;
    m->sign = (uint8_t)(p[start[1]] - '0');
    m->loc = (uint8_t)li;
    m->chg = (p[start[3]] == '1');
    return true;
  }
  if (nparts != 1) return false; /* JS L173 */
  m->sign = 0;
  m->loc = 0;
  m->chg = false;
  if (c == 'X') {
    m->kind = PQ_KIND_CLEAR;
    return true;
  }
  if (c == 'E') {
    m->kind = PQ_KIND_END;
    return true;
  }
  return false;
}

/* JS L178-227.  Every path here is one of: key frame, "P", sealed frame, plain pairing-mode message, "H", or ignored. */
void pq_core_on_write(struct pq_core *c, const uint8_t *data, size_t len) {
  bool redraw = false;
  struct msg m;
  uint8_t kid, newkey[16];
  uint64_t n;

  /* JS L179-181: any write counts as the coach being there, even one that is then dropped */
  c->last_rx = c->io.now_ms(c->io.user);
  if (!c->link) {
    c->link = true;
    redraw = true;
  }
/* JS L183: drop = count it, say nothing, (redraw only if the write itself brought the link back) */
#define DROP()                         \
  do {                                 \
    c->rejected++;                     \
    if (redraw) draw(c);               \
    return;                            \
  } while (0)

  if (len == PQ_KEY_FRAME_LEN && data[0] == PQ_KEY_MAGIC) { /* JS L184: a game key (full mode) */
    bool same;
    if (!c->io.secure(c->io.user)) DROP();                   /* only over the bonded, encrypted link (JS L185) */
    (void)pq_keyframe_parse(data, len, &kid, newkey);
    /* JS L186-190: the same game key again (the coach's app sends it on every reconnect) keeps the message count and
     * the inning, so nothing captured before it can replay; only a different key (a new game) starts over. */
    same = (c->mode == PQ_MODE_FULL) && c->key_id == kid && pq_ct_equal(c->key, newkey, 16);
    if (same) {
      c->key_at = c->io.now_ms(c->io.user);
    } else {
      wipe(c);
      memcpy(c->key, newkey, 16);
      c->key_id = kid;
      c->key_at = c->io.now_ms(c->io.user);
      c->mode = PQ_MODE_FULL;
    }
    draw(c);
    notify_num(c, 'K', c->key_id);
    memset(newkey, 0, sizeof newkey);
    return;
  }
  if (len == 1 && data[0] == 'P') { /* JS L195: a pairing-only game, only over the bonded link */
    if (!c->io.secure(c->io.user)) DROP();
    wipe(c);
    c->mode = PQ_MODE_PAIRING;
    c->key_at = c->io.now_ms(c->io.user);
    draw(c);
    c->io.notify(c->io.user, (const uint8_t *)"P", 1);
    return;
  }
  if (len == PQ_FRAME_LEN && data[0] == PQ_FRAME_MAGIC) { /* JS L201: a sealed frame */
    struct pq_msg om;
    if (c->mode != PQ_MODE_FULL || data[2] < c->inning) DROP(); /* no key, or an earlier inning (JS L202) */
    if (!pq_open(data, c->key_id, keys_for, c, &om)) DROP();    /* forged, tampered, another game's (JS L204) */
    m.n = om.n;
    m.kind = om.kind;
    m.sign = om.sign;
    m.loc = om.loc;
    m.chg = om.chg;
    if (om.n >= c->last_n) c->inning = om.inning; /* JS L205 */
  } else if (c->mode == PQ_MODE_PAIRING && len >= 2 && (data[0] == 'C' || data[0] == 'X' || data[0] == 'E') &&
             is_digit(data[1])) { /* JS L206: the plain text rule */
    if (!c->io.secure(c->io.user)) DROP(); /* pairing-only trusts the bonded link, so only over it (JS L207) */
    if (!plain(data, len, &m)) DROP();
  } else if (len == 1 && data[0] == 'H' && c->mode != PQ_MODE_FULL) { /* JS L210: plain liveness, unless a key is held */
    if (redraw) draw(c);
    return;
  } else {
    DROP(); /* anything else (plain text in full mode included) */
  }
#undef DROP

  n = m.n;
  if (n < c->last_n) { /* JS L213: older than what's shown (a replay) */
    c->rejected++;
    if (redraw) draw(c);
    return;
  }
  if (n == c->last_n) { /* JS L214: a repeat, receipt only, no buzz */
    /* JS L215: the same message again right after a quiet spell puts the held call back up */
    if (!c->has_show && c->has_held && c->held_n == n) {
      c->show = c->held;
      c->has_show = true;
      c->has_held = false;
      redraw = true;
    }
    if (redraw) draw(c);
    notify_num(c, 'A', n);
    return;
  }
  c->has_held = false; /* JS L220 */
  c->last_n = n;
  if (m.kind == PQ_KIND_CALL) {
    c->show.sign = m.sign;
    c->show.loc = m.loc;
    c->has_show = true;
    draw(c);
    c->io.light(c->io.user);
    c->io.buzz(c->io.user, m.chg ? PQ_BUZZ_CHANGED : PQ_BUZZ_NEW);
  } else if (m.kind == PQ_KIND_END) {
    wipe(c); /* JS L224: no receipt for the end */
    draw(c);
    return;
  } else {
    if (m.kind == PQ_KIND_CLEAR) c->has_show = false; /* a heartbeat leaves the screen alone */
    draw(c);
  }
  notify_num(c, 'A', n);
}

/* JS L228-231 */
void pq_core_tick(struct pq_core *c) {
  uint64_t now = c->io.now_ms(c->io.user);
  /* the signed difference mirrors the JS's plain subtraction (a clock that went backwards is not "expired") */
  if (c->mode != PQ_MODE_NONE && (int64_t)(now - c->key_at) > (int64_t)PQ_KEY_MS) {
    wipe(c);
    draw(c);
  }
  if (c->link && (int64_t)(now - c->last_rx) > (int64_t)PQ_LINK_MS) {
    c->link = false;
    if (c->has_show) { /* JS L230: keep the call, with its number, so the same message repeated can put it back */
      c->has_held = true;
      c->held_n = c->last_n;
      c->held = c->show;
    } else {
      c->has_held = false;
    }
    c->has_show = false;
    draw(c);
  }
}
