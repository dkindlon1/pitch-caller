/*
 * Host tests for pq_sec / pq_core.  Reads tests/vectors.json (written by tests/gen_vectors.js from the ORIGINAL
 * pitchiq.app.js) and replays every crypto vector and every scenario step against the C code, comparing every
 * observable output.  Also checks FIPS-197 C.1 and the RFC 4493 examples directly, with literals typed in here.
 * The whole thing runs twice: with the software AES, and with the pq_sec_set_aes() hook installed.
 *
 * This file is test code and may use malloc/stdio; the code under test (pq_sec.c, pq_core.c) does not.
 *
 *   usage: test_core [path/to/vectors.json]
 */
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../pq_core.h"
#include "../pq_sec.h"

/* ------------------------------------------------------------------ a tiny JSON reader (just enough for vectors.json) */
enum { J_NULL, J_BOOL, J_NUM, J_STR, J_ARR, J_OBJ };
typedef struct J {
  int t;
  long long num;
  int b;
  char *s;
  size_t n;
  struct J **v;
  char **k;
} J;

static void die(const char *msg) {
  fprintf(stderr, "test_core: %s\n", msg);
  exit(2);
}
static void *xrealloc(void *p, size_t n) {
  p = realloc(p, n);
  if (!p) die("out of memory");
  return p;
}
static void skip_ws(const char **p) {
  while (**p == ' ' || **p == '\n' || **p == '\r' || **p == '\t') (*p)++;
}
static char *parse_string(const char **p) {
  size_t cap = 16, n = 0;
  char *out = (char *)xrealloc(NULL, cap);
  if (**p != '"') die("json: string expected");
  (*p)++;
  while (**p != '"') {
    unsigned c = (unsigned char)**p;
    if (c == 0) die("json: unterminated string");
    (*p)++;
    if (c == '\\') {
      c = (unsigned char)**p;
      (*p)++;
      switch (c) {
        case 'n': c = '\n'; break;
        case 'r': c = '\r'; break;
        case 't': c = '\t'; break;
        case 'b': c = '\b'; break;
        case 'f': c = '\f'; break;
        case 'u': {
          unsigned u = 0;
          int i;
          for (i = 0; i < 4; i++) {
            char h = **p;
            (*p)++;
            u = u * 16 + (unsigned)(h <= '9' ? h - '0' : (h | 32) - 'a' + 10);
          }
          if (u > 0x7f) die("json: non-ASCII escape not expected");
          c = u;
          break;
        }
        default: break; /* \" \\ \/ */
      }
    }
    if (n + 2 > cap) {
      cap *= 2;
      out = (char *)xrealloc(out, cap);
    }
    out[n++] = (char)c;
  }
  (*p)++;
  out[n] = 0;
  return out;
}
static J *parse_value(const char **p) {
  J *j = (J *)calloc(1, sizeof *j);
  if (!j) die("out of memory");
  skip_ws(p);
  if (**p == '{' || **p == '[') {
    int obj = (**p == '{');
    char close = obj ? '}' : ']';
    j->t = obj ? J_OBJ : J_ARR;
    (*p)++;
    skip_ws(p);
    if (**p == close) {
      (*p)++;
      return j;
    }
    for (;;) {
      char *key = NULL;
      skip_ws(p);
      if (obj) {
        key = parse_string(p);
        skip_ws(p);
        if (**p != ':') die("json: ':' expected");
        (*p)++;
      }
      j->v = (J **)xrealloc(j->v, (j->n + 1) * sizeof *j->v);
      if (obj) j->k = (char **)xrealloc(j->k, (j->n + 1) * sizeof *j->k);
      j->v[j->n] = parse_value(p);
      if (obj) j->k[j->n] = key;
      j->n++;
      skip_ws(p);
      if (**p == ',') {
        (*p)++;
        continue;
      }
      if (**p == close) {
        (*p)++;
        break;
      }
      die("json: ',' or close expected");
    }
  } else if (**p == '"') {
    j->t = J_STR;
    j->s = parse_string(p);
  } else if (strncmp(*p, "true", 4) == 0) {
    j->t = J_BOOL, j->b = 1, *p += 4;
  } else if (strncmp(*p, "false", 5) == 0) {
    j->t = J_BOOL, j->b = 0, *p += 5;
  } else if (strncmp(*p, "null", 4) == 0) {
    j->t = J_NULL, *p += 4;
  } else if (**p == '-' || (**p >= '0' && **p <= '9')) {
    int neg = 0;
    j->t = J_NUM;
    if (**p == '-') neg = 1, (*p)++;
    while (**p >= '0' && **p <= '9') j->num = j->num * 10 + (**p - '0'), (*p)++;
    if (**p == '.' || **p == 'e' || **p == 'E') die("json: only integers expected");
    if (neg) j->num = -j->num;
  } else {
    die("json: unexpected character");
  }
  return j;
}
static void jfree(J *j) {
  size_t i;
  for (i = 0; i < j->n; i++) {
    jfree(j->v[i]);
    if (j->k) free(j->k[i]);
  }
  free(j->v);
  free(j->k);
  free(j->s);
  free(j);
}
static J *jget(const J *o, const char *key) {
  size_t i;
  if (o->t != J_OBJ) die("json: object expected");
  for (i = 0; i < o->n; i++)
    if (strcmp(o->k[i], key) == 0) return o->v[i];
  fprintf(stderr, "test_core: json key missing: %s\n", key);
  exit(2);
}
static const char *jstr(const J *o, const char *key) {
  J *v = jget(o, key);
  if (v->t != J_STR) die("json: string expected");
  return v->s;
}
static long long jnum(const J *o, const char *key) {
  J *v = jget(o, key);
  if (v->t != J_NUM) die("json: number expected");
  return v->num;
}
static int jbool(const J *o, const char *key) {
  J *v = jget(o, key);
  if (v->t != J_BOOL) die("json: bool expected");
  return v->b;
}

/* ------------------------------------------------------------------ helpers */
static unsigned nibble(char c) {
  if (c >= '0' && c <= '9') return (unsigned)(c - '0');
  if (c >= 'a' && c <= 'f') return (unsigned)(c - 'a' + 10);
  die("bad hex");
  return 0;
}
static size_t unhex(const char *h, uint8_t *out, size_t cap) {
  size_t n = strlen(h) / 2, i;
  if (n > cap) die("hex too long");
  for (i = 0; i < n; i++) out[i] = (uint8_t)(nibble(h[2 * i]) * 16 + nibble(h[2 * i + 1]));
  return n;
}
static void tohex(const uint8_t *b, size_t n, char *out) {
  size_t i;
  for (i = 0; i < n; i++) sprintf(out + 2 * i, "%02x", b[i]);
  out[2 * n] = 0;
}

static unsigned long g_fails = 0;
static void fail(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
static void fail(const char *fmt, ...) {
  va_list ap;
  g_fails++;
  if (g_fails > 40) return; /* enough to diagnose; keep counting */
  va_start(ap, fmt);
  fprintf(stderr, "FAIL: ");
  vfprintf(stderr, fmt, ap);
  fprintf(stderr, "\n");
  va_end(ap);
}

static void expect_hex(const char *what, const uint8_t *got, size_t n, const char *want) {
  char h[512];
  tohex(got, n, h);
  if (strcmp(h, want) != 0) fail("%s: got %s want %s", what, h, want);
}

/* the AES hook used for the second pass: counts calls, otherwise the software cipher */
static unsigned long g_hook_calls = 0;
static void hook_aes(const uint8_t key[16], const uint8_t in[16], uint8_t out[16]) {
  g_hook_calls++;
  pq_aes128_sw(key, in, out);
}

/* ------------------------------------------------------------------ direct known-answer tests */
static unsigned long direct_checks(void) {
  unsigned long n = 0;
  uint8_t key[16], in[16], out[16], msg[64], mac[16];
  char h[64];
  size_t i;
  static const char *const rfc_len[4] = {"", "", "", ""};
  static const size_t rfc_n[4] = {0, 16, 40, 64};
  static const char *const rfc_mac[4] = {"bb1d6929e95937287fa37d129b756746", "070a16b46b4d4144f79bdd9dd04a287c", "dfa66747de9ae63030ca32611497c827",
                                         "51f0bebf7e3b9d92fc49741779363cfe"};
  (void)rfc_len;

  /* FIPS-197 C.1: key 000102..0f, plaintext 00112233..ff */
  for (i = 0; i < 16; i++) key[i] = (uint8_t)i, in[i] = (uint8_t)(i * 0x11);
  pq_aes128(key, in, out);
  expect_hex("FIPS-197 C.1", out, 16, "69c4e0d86a7b0430d8cdb78070b4c55a");
  n++;
  memcpy(out, in, 16); /* in-place use */
  pq_aes128(key, out, out);
  expect_hex("FIPS-197 C.1 in place", out, 16, "69c4e0d86a7b0430d8cdb78070b4c55a");
  n++;
  /* FIPS-197 appendix B */
  unhex("2b7e151628aed2a6abf7158809cf4f3c", key, 16);
  unhex("3243f6a8885a308d313198a2e0370734", in, 16);
  pq_aes128(key, in, out);
  expect_hex("FIPS-197 appendix B", out, 16, "3925841d02dc09fbdc118597196a0b32");
  n++;

  /* RFC 4493 section 4: key 2b7e..., messages are prefixes of the 64-byte example message */
  unhex("2b7e151628aed2a6abf7158809cf4f3c", key, 16);
  unhex("6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710", msg, 64);
  for (i = 0; i < 4; i++) {
    pq_cmac(key, msg, rfc_n[i], mac);
    snprintf(h, sizeof h, "RFC 4493 example, %u bytes", (unsigned)rfc_n[i]);
    expect_hex(h, mac, 16, rfc_mac[i]);
    n++;
  }
  pq_cmac(key, NULL, 0, mac);
  expect_hex("RFC 4493 empty message with NULL pointer", mac, 16, rfc_mac[0]);
  n++;

  /* constant-time compare and the sizes the header promises */
  {
    uint8_t a[8] = {1, 2, 3, 4, 5, 6, 7, 8}, b[8] = {1, 2, 3, 4, 5, 6, 7, 8};
    if (!pq_ct_equal(a, b, 8)) fail("pq_ct_equal equal");
    for (i = 0; i < 8; i++) {
      b[i] ^= 0x80;
      if (pq_ct_equal(a, b, 8)) fail("pq_ct_equal differs at %u", (unsigned)i);
      b[i] ^= 0x80;
    }
    n += 9;
  }
  /* kdf refuses what does not fit its buffers */
  if (pq_kdf(key, "ABCDEFGHIJKLMNOPQ", msg, 0, mac) != -1) fail("kdf long label accepted");
  if (pq_kdf(key, "L", msg, 17, mac) != -1) fail("kdf long ctx accepted");
  n += 2;
  return n;
}

/* ------------------------------------------------------------------ crypto vectors */
struct kf {
  uint8_t gk[16];
  struct pq_inning_keys k;
};
static const struct pq_inning_keys *kf_keys(void *user, uint8_t inning) {
  struct kf *f = (struct kf *)user;
  pq_inning_keys_derive(f->gk, inning, &f->k);
  return &f->k;
}

static int kind_num(const char *k) {
  if (strcmp(k, "call") == 0) return PQ_KIND_CALL;
  if (strcmp(k, "clear") == 0) return PQ_KIND_CLEAR;
  if (strcmp(k, "hb") == 0) return PQ_KIND_HB;
  if (strcmp(k, "end") == 0) return PQ_KIND_END;
  return 0;
}
static void check_open_result(const char *what, bool ok, const struct pq_msg *got, const J *want) {
  if (want->t == J_NULL) {
    if (ok) fail("%s: opened but JS rejected", what);
    return;
  }
  if (!ok) {
    fail("%s: rejected but JS opened", what);
    return;
  }
  if (got->key_id != jnum(want, "key_id") || got->inning != jnum(want, "inning") || got->n != (uint32_t)jnum(want, "n") ||
      kind_num(jstr(want, "kind")) != got->kind || got->chg != (jbool(want, "chg") != 0) ||
      (got->kind == PQ_KIND_CALL && (got->sign != jnum(want, "sign") || got->loc != jnum(want, "loc"))))
    fail("%s: opened fields differ", what);
}

static unsigned long crypto_vectors(const J *c) {
  unsigned long n = 0;
  size_t i;
  uint8_t key[16], in[16], out[16], msg[256], frame[16];
  char h[64];
  const J *a;

  a = jget(c, "aes");
  for (i = 0; i < a->n; i++, n++) {
    unhex(jstr(a->v[i], "key"), key, 16);
    unhex(jstr(a->v[i], "in"), in, 16);
    pq_aes128(key, in, out);
    expect_hex("aes", out, 16, jstr(a->v[i], "out"));
  }
  a = jget(c, "cmac");
  for (i = 0; i < a->n; i++, n++) {
    size_t len = unhex(jstr(a->v[i], "msg"), msg, sizeof msg);
    unhex(jstr(a->v[i], "key"), key, 16);
    pq_cmac(key, msg, len, out);
    snprintf(h, sizeof h, "cmac len %u", (unsigned)len);
    expect_hex(h, out, 16, jstr(a->v[i], "mac"));
  }
  a = jget(c, "kdf");
  for (i = 0; i < a->n; i++, n++) {
    size_t len = unhex(jstr(a->v[i], "ctx"), msg, sizeof msg);
    unhex(jstr(a->v[i], "key"), key, 16);
    if (pq_kdf(key, jstr(a->v[i], "label"), msg, len, out) != 0) fail("kdf refused");
    expect_hex("kdf", out, 16, jstr(a->v[i], "out"));
  }
  a = jget(c, "inning_keys");
  for (i = 0; i < a->n; i++, n++) {
    struct pq_inning_keys k;
    unhex(jstr(a->v[i], "game_key"), key, 16);
    pq_inning_keys_derive(key, (uint8_t)jnum(a->v[i], "inning"), &k);
    expect_hex("inning enc", k.enc, 16, jstr(a->v[i], "enc"));
    expect_hex("inning mac", k.mac, 16, jstr(a->v[i], "mac"));
  }
  a = jget(c, "seal");
  for (i = 0; i < a->n; i++, n++) {
    const J *v = a->v[i], *m = jget(v, "msg");
    struct pq_inning_keys k;
    struct pq_msg pm, opened;
    struct kf f;
    bool ok;
    unhex(jstr(v, "game_key"), key, 16);
    pq_inning_keys_derive(key, (uint8_t)jnum(v, "inning"), &k);
    pm.key_id = 0;
    pm.inning = 0;
    pm.n = 0;
    pm.kind = (uint8_t)kind_num(jstr(m, "kind"));
    pm.sign = (uint8_t)jnum(m, "sign");
    pm.loc = (uint8_t)jnum(m, "loc");
    pm.chg = jbool(m, "chg") != 0;
    if (pq_seal(&k, (uint8_t)jnum(v, "key_id"), (uint8_t)jnum(v, "inning"), (uint32_t)jnum(v, "n"), &pm, frame) != 0) {
      fail("seal refused a frame the JS sealed");
      continue;
    }
    expect_hex("seal", frame, 16, jstr(v, "frame"));
    memcpy(f.gk, key, 16);
    ok = pq_open(frame, (uint8_t)jnum(v, "key_id"), kf_keys, &f, &opened);
    check_open_result("open(seal)", ok, &opened, jget(v, "open"));
  }
  a = jget(c, "seal_bad");
  for (i = 0; i < a->n; i++, n++) {
    const J *v = a->v[i];
    struct pq_inning_keys k;
    struct pq_msg pm;
    memset(&pm, 0, sizeof pm);
    pm.kind = (uint8_t)jnum(v, "kind");
    pm.sign = 1;
    unhex(jstr(v, "game_key"), key, 16);
    pq_inning_keys_derive(key, 1, &k);
    /* inning 256 does not fit the byte parameter; it wraps to 0, which is refused as well */
    if (pq_seal(&k, 1, (uint8_t)jnum(v, "inning"), (uint32_t)jnum(v, "n"), &pm, frame) != -1) fail("seal accepted a bad message (inning %lld n %lld kind %lld)", jnum(v, "inning"), jnum(v, "n"), jnum(v, "kind"));
  }
  a = jget(c, "open");
  for (i = 0; i < a->n; i++, n++) {
    const J *v = a->v[i];
    struct pq_msg opened;
    struct kf f;
    bool ok;
    unhex(jstr(v, "game_key"), f.gk, 16);
    unhex(jstr(v, "frame"), frame, 16);
    ok = pq_open(frame, (uint8_t)jnum(v, "key_id"), kf_keys, &f, &opened);
    snprintf(h, sizeof h, "open [%s]", jstr(v, "note"));
    check_open_result(h, ok, &opened, jget(v, "result"));
  }
  a = jget(c, "keyframe");
  for (i = 0; i < a->n; i++, n++) {
    const J *v = a->v[i];
    uint8_t kfm[18], id, k2[16];
    unhex(jstr(v, "key"), key, 16);
    pq_keyframe_build((uint8_t)jnum(v, "key_id"), key, kfm);
    expect_hex("keyframe build", kfm, 18, jstr(v, "frame"));
    if (!pq_keyframe_parse(kfm, 18, &id, k2) || id != jnum(v, "key_id") || memcmp(k2, key, 16) != 0) fail("keyframe parse");
    if (pq_keyframe_parse(kfm, 17, &id, k2) || pq_keyframe_parse(kfm, 19, &id, k2)) fail("keyframe parse wrong length");
    kfm[0] = 0x4c;
    if (pq_keyframe_parse(kfm, 18, &id, k2)) fail("keyframe parse wrong magic");
  }
  return n;
}

/* ------------------------------------------------------------------ scenarios */
#define MAX_EV 64
#define EV_LEN 200
struct harness {
  uint64_t now;
  bool secure;
  char ev[MAX_EV][EV_LEN];
  int nev;
};
static void ev_add(struct harness *h, const char *fmt, ...) __attribute__((format(printf, 2, 3)));
static void ev_add(struct harness *h, const char *fmt, ...) {
  va_list ap;
  if (h->nev >= MAX_EV) die("too many events in one step");
  va_start(ap, fmt);
  vsnprintf(h->ev[h->nev++], EV_LEN, fmt, ap);
  va_end(ap);
}
static void view_text(const struct pq_view *v, char *out, size_t cap) {
  char words[120] = "null";
  if (v->sign) {
    unsigned i;
    size_t o = 0;
    words[o++] = '[';
    for (i = 0; i < v->nwords; i++) o += (size_t)snprintf(words + o, sizeof words - o, "%s%s", i ? "|" : "", v->words[i]);
    words[o++] = ']';
    words[o] = 0;
  }
  snprintf(out, cap, "link=%d nokey=%d sign=%s words=%s", v->link, v->nokey, v->sign ? v->sign : "null", words);
}
static void h_draw(void *u, const struct pq_view *v) {
  char t[160];
  view_text(v, t, sizeof t);
  ev_add((struct harness *)u, "draw %s", t);
}
static void h_buzz(void *u, enum pq_buzz_kind k) { ev_add((struct harness *)u, "buzz %s", k == PQ_BUZZ_CHANGED ? "changed" : "new"); }
static void h_light(void *u) { ev_add((struct harness *)u, "light"); }
static void h_notify(void *u, const uint8_t *b, size_t len) { ev_add((struct harness *)u, "notify %.*s", (int)len, (const char *)b); }
static uint64_t h_now(void *u) { return ((struct harness *)u)->now; }
static bool h_secure(void *u) { return ((struct harness *)u)->secure; }

/* the "link= nokey= sign= words=" text of a JSON {link,nokey,sign,words} object */
static void json_view_text(const J *e, char *out, size_t cap) {
  char words[120] = "null";
  const J *sign = jget(e, "sign"), *w = jget(e, "words");
  if (w->t == J_ARR) {
    size_t i, o = 0;
    words[o++] = '[';
    for (i = 0; i < w->n; i++) o += (size_t)snprintf(words + o, sizeof words - o, "%s%s", i ? "|" : "", w->v[i]->s);
    words[o++] = ']';
    words[o] = 0;
  }
  snprintf(out, cap, "link=%d nokey=%d sign=%s words=%s", jbool(e, "link"), jbool(e, "nokey"), sign->t == J_STR ? sign->s : "null", words);
}

/* the expected event, from the JSON, in the same text form */
static void json_event_text(const J *e, char *out, size_t cap) {
  const char *kind = jstr(e, "e");
  if (strcmp(kind, "draw") == 0) {
    char t[160];
    json_view_text(e, t, sizeof t);
    snprintf(out, cap, "draw %s", t);
  } else if (strcmp(kind, "buzz") == 0) {
    snprintf(out, cap, "buzz %s", jstr(e, "kind"));
  } else if (strcmp(kind, "light") == 0) {
    snprintf(out, cap, "light");
  } else if (strcmp(kind, "notify") == 0) {
    snprintf(out, cap, "notify %s", jstr(e, "text"));
  } else {
    die("unknown event kind in vectors");
  }
}

struct totals {
  unsigned long scenarios, steps, events;
};

static void scenarios_run(const J *list, struct totals *t) {
  size_t si, i, k;
  for (si = 0; si < list->n; si++) {
    const J *sc = list->v[si], *steps = jget(sc, "steps");
    const char *name = jstr(sc, "name");
    struct harness h;
    struct pq_core core;
    struct pq_io io;
    memset(&h, 0, sizeof h);
    h.now = (uint64_t)jnum(sc, "clock0");
    h.secure = jbool(sc, "secure0") != 0;
    io.user = &h;
    io.draw = h_draw;
    io.buzz = h_buzz;
    io.light = h_light;
    io.notify = h_notify;
    io.now_ms = h_now;
    io.secure = h_secure;
    pq_core_init(&core, &io);
    for (i = 0; i < steps->n; i++) {
      const J *st = steps->v[i], *ex = jget(st, "expect"), *evs = jget(ex, "events"), *vw = jget(ex, "view");
      const char *op = jstr(st, "op");
      char want[EV_LEN], got_view[160], want_view[160];
      const char *mode_s;
      struct pq_view v;
      h.nev = 0;
      if (strcmp(op, "connect") == 0) {
        pq_core_on_connect(&core);
      } else if (strcmp(op, "disconnect") == 0) {
        pq_core_on_disconnect(&core);
      } else if (strcmp(op, "write") == 0) {
        uint8_t buf[64];
        size_t len = unhex(jstr(st, "hex"), buf, sizeof buf);
        pq_core_on_write(&core, buf, len);
      } else if (strcmp(op, "tick") == 0) {
        pq_core_tick(&core);
      } else if (strcmp(op, "advance") == 0) {
        h.now += (uint64_t)jnum(st, "ms");
      } else if (strcmp(op, "secure") == 0) {
        h.secure = jbool(st, "value") != 0;
      } else {
        die("unknown op in vectors");
      }
      /* every event, in order */
      if ((size_t)h.nev != evs->n) fail("%s step %u (%s): %d events, JS had %u", name, (unsigned)i, op, h.nev, (unsigned)evs->n);
      for (k = 0; k < evs->n && k < (size_t)h.nev; k++) {
        json_event_text(evs->v[k], want, sizeof want);
        if (strcmp(want, h.ev[k]) != 0) fail("%s step %u (%s) event %u:\n   C : %s\n   JS: %s", name, (unsigned)i, op, (unsigned)k, h.ev[k], want);
      }
      t->events += evs->n;
      /* the view and the internal state afterwards */
      pq_core_view(&core, &v);
      view_text(&v, got_view, sizeof got_view);
      json_view_text(vw, want_view, sizeof want_view);
      if (strcmp(got_view, want_view) != 0) fail("%s step %u (%s) view:\n   C : %s\n   JS: %s", name, (unsigned)i, op, got_view, want_view);
      if (core.rejected != (uint32_t)jnum(ex, "rejected")) fail("%s step %u (%s) rejected: C %u, JS %lld", name, (unsigned)i, op, (unsigned)core.rejected, jnum(ex, "rejected"));
      if (core.last_n != (uint64_t)jnum(ex, "last_n")) fail("%s step %u (%s) last_n: C %llu, JS %lld", name, (unsigned)i, op, (unsigned long long)core.last_n, jnum(ex, "last_n"));
      if (core.inning != jnum(ex, "inning")) fail("%s step %u (%s) inning: C %u, JS %lld", name, (unsigned)i, op, (unsigned)core.inning, jnum(ex, "inning"));
      if (core.link != (jbool(ex, "link") != 0)) fail("%s step %u (%s) link flag", name, (unsigned)i, op);
      mode_s = core.mode == PQ_MODE_FULL ? "full" : core.mode == PQ_MODE_PAIRING ? "pairing" : "none";
      if (strcmp(mode_s, jstr(ex, "mode")) != 0) fail("%s step %u (%s) mode: C %s, JS %s", name, (unsigned)i, op, mode_s, jstr(ex, "mode"));
      t->steps++;
    }
    if (core.rejected != (uint32_t)jnum(sc, "final_rejected")) fail("%s final rejected: C %u, JS %lld", name, (unsigned)core.rejected, jnum(sc, "final_rejected"));
    t->scenarios++;
  }
}

/* ------------------------------------------------------------------ main */
static char *slurp(const char *path) {
  FILE *f = fopen(path, "rb");
  long n;
  char *buf;
  if (!f) {
    fprintf(stderr, "test_core: cannot open %s (run `make vectors` first)\n", path);
    exit(2);
  }
  fseek(f, 0, SEEK_END);
  n = ftell(f);
  fseek(f, 0, SEEK_SET);
  buf = (char *)xrealloc(NULL, (size_t)n + 1);
  if (fread(buf, 1, (size_t)n, f) != (size_t)n) die("read failed");
  buf[n] = 0;
  fclose(f);
  return buf;
}

int main(int argc, char **argv) {
  const char *path = argc > 1 ? argv[1] : "tests/vectors.json";
  char *text = slurp(path);
  const char *p = text;
  J *root = parse_value(&p);
  const J *crypto = jget(root, "crypto"), *scen = jget(root, "scenarios");
  int pass;
  for (pass = 0; pass < 2; pass++) {
    struct totals t = {0, 0, 0};
    unsigned long direct, cv;
    unsigned long before = g_fails;
    pq_sec_set_aes(pass ? hook_aes : NULL);
    g_hook_calls = 0;
    direct = direct_checks();
    cv = crypto_vectors(crypto);
    scenarios_run(scen, &t);
    printf("[%s AES] %lu known-answer checks, %lu crypto vectors, %lu scenarios (%lu steps, %lu events) compared: %s\n", pass ? "hook" : "software", direct, cv,
           t.scenarios, t.steps, t.events, g_fails == before ? "all identical to the JS" : "MISMATCHES");
    if (pass && g_hook_calls == 0) fail("the AES hook was never called");
    if (pass) printf("[hook AES] the hook was called %lu times\n", g_hook_calls);
  }
  pq_sec_set_aes(NULL);
  jfree(root);
  free(text);
  if (g_fails) {
    printf("FAILED: %lu mismatches\n", g_fails);
    return 1;
  }
  printf("ALL PASS\n");
  return 0;
}
