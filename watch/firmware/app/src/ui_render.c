/*
 * ui_render.c - the watch screen.  Black on white, like the JS (most readable in sun).
 *
 *   linked, a call:  the sign as large as fits, up to two lines of words under it, a link icon top right.
 *   linked, no call: a dash; "no key" under it until the game key arrives.
 *   no link:         "NO LINK" and the broken-link icon.
 *   pairing:         "Pair" and the 6-digit passkey, nothing else.
 *   notice:          one or two short lines, nothing else.
 *
 * Text is a 5x7 pixel font (the classic one, only the characters this screen needs) drawn at an integer scale.
 */
#include "ui_render.h"

#include <string.h>

#define MARGIN 4
#define ICON_H 12 /* height reserved at the top for the link icon */

struct glyph {
  char c;
  uint8_t col[5]; /* five columns, bit 0 = top row */
};

static const struct glyph FONT[] = {
    {' ', {0x00, 0x00, 0x00, 0x00, 0x00}}, {'-', {0x08, 0x08, 0x08, 0x08, 0x08}},
    {':', {0x00, 0x36, 0x36, 0x00, 0x00}}, {'0', {0x3E, 0x51, 0x49, 0x45, 0x3E}},
    {'1', {0x00, 0x42, 0x7F, 0x40, 0x00}}, {'2', {0x42, 0x61, 0x51, 0x49, 0x46}},
    {'3', {0x21, 0x41, 0x45, 0x4B, 0x31}}, {'4', {0x18, 0x14, 0x12, 0x7F, 0x10}},
    {'5', {0x27, 0x45, 0x45, 0x45, 0x39}}, {'6', {0x3C, 0x4A, 0x49, 0x49, 0x30}},
    {'7', {0x01, 0x71, 0x09, 0x05, 0x03}}, {'8', {0x36, 0x49, 0x49, 0x49, 0x36}},
    {'9', {0x06, 0x49, 0x49, 0x29, 0x1E}}, {'A', {0x7E, 0x11, 0x11, 0x11, 0x7E}},
    {'B', {0x7F, 0x49, 0x49, 0x49, 0x36}}, {'C', {0x3E, 0x41, 0x41, 0x41, 0x22}},
    {'D', {0x7F, 0x41, 0x41, 0x22, 0x1C}}, {'E', {0x7F, 0x49, 0x49, 0x49, 0x41}},
    {'F', {0x7F, 0x09, 0x09, 0x09, 0x01}}, {'G', {0x3E, 0x41, 0x49, 0x49, 0x7A}},
    {'H', {0x7F, 0x08, 0x08, 0x08, 0x7F}}, {'I', {0x00, 0x41, 0x7F, 0x41, 0x00}},
    {'J', {0x20, 0x40, 0x41, 0x3F, 0x01}}, {'K', {0x7F, 0x08, 0x14, 0x22, 0x41}},
    {'L', {0x7F, 0x40, 0x40, 0x40, 0x40}}, {'M', {0x7F, 0x02, 0x0C, 0x02, 0x7F}},
    {'N', {0x7F, 0x04, 0x08, 0x10, 0x7F}}, {'O', {0x3E, 0x41, 0x41, 0x41, 0x3E}},
    {'P', {0x7F, 0x09, 0x09, 0x09, 0x06}}, {'Q', {0x3E, 0x41, 0x51, 0x21, 0x5E}},
    {'R', {0x7F, 0x09, 0x19, 0x29, 0x46}}, {'S', {0x46, 0x49, 0x49, 0x49, 0x31}},
    {'T', {0x01, 0x01, 0x7F, 0x01, 0x01}}, {'U', {0x3F, 0x40, 0x40, 0x40, 0x3F}},
    {'V', {0x1F, 0x20, 0x40, 0x20, 0x1F}}, {'W', {0x3F, 0x40, 0x38, 0x40, 0x3F}},
    {'X', {0x63, 0x14, 0x08, 0x14, 0x63}}, {'Y', {0x07, 0x08, 0x70, 0x08, 0x07}},
    {'Z', {0x61, 0x51, 0x49, 0x45, 0x43}}, {'a', {0x20, 0x54, 0x54, 0x54, 0x78}},
    {'e', {0x38, 0x54, 0x54, 0x54, 0x18}}, {'i', {0x00, 0x44, 0x7D, 0x40, 0x00}},
    {'k', {0x7F, 0x10, 0x28, 0x44, 0x00}}, {'n', {0x7C, 0x08, 0x04, 0x04, 0x78}},
    {'o', {0x38, 0x44, 0x44, 0x44, 0x38}}, {'r', {0x7C, 0x08, 0x04, 0x04, 0x08}},
    {'y', {0x0C, 0x50, 0x50, 0x50, 0x3C}},
};

static void black(uint8_t *fb, int x, int y) {
  if (x < 0 || y < 0 || x >= UI_W || y >= UI_H) {
    return;
  }
#ifdef PQ_UI_MSB_FIRST
  fb[y * UI_STRIDE + x / 8] &= (uint8_t)~(0x80u >> (x & 7));
#else
  fb[y * UI_STRIDE + x / 8] &= (uint8_t)~(1u << (x & 7));
#endif
}

static void fill_rect(uint8_t *fb, int x, int y, int w, int h) {
  for (int j = 0; j < h; j++) {
    for (int i = 0; i < w; i++) {
      black(fb, x + i, y + j);
    }
  }
}

static const uint8_t *glyph(char c) {
  for (size_t i = 0; i < sizeof(FONT) / sizeof(FONT[0]); i++) {
    if (FONT[i].c == c) {
      return FONT[i].col;
    }
  }
  return FONT[0].col; /* a character the font lacks draws as a space */
}

static int text_w(const char *s, int scale) {
  int n = (int)strlen(s);
  return n ? (n * 6 - 1) * scale : 0;
}

/* Largest scale (1..max) at which s fits in maxw pixels. */
static int fit(const char *s, int maxw, int max) {
  int sc = max;
  while (sc > 1 && text_w(s, sc) > maxw) {
    sc--;
  }
  return sc;
}

static void draw_char(uint8_t *fb, int x, int y, int scale, char c) {
  const uint8_t *g = glyph(c);
  for (int cx = 0; cx < 5; cx++) {
    for (int cy = 0; cy < 7; cy++) {
      if (g[cx] & (1u << cy)) {
        fill_rect(fb, x + cx * scale, y + cy * scale, scale, scale);
      }
    }
  }
}

/* Centred horizontally, top edge at y. */
static void draw_text(uint8_t *fb, int y, int scale, const char *s) {
  int x = (UI_W - text_w(s, scale)) / 2;
  for (; *s; s++) {
    draw_char(fb, x, y, scale, *s);
    x += 6 * scale;
  }
}

static void line(uint8_t *fb, int x0, int y0, int x1, int y1) {
  int dx = x1 > x0 ? x1 - x0 : x0 - x1, dy = y1 > y0 ? y0 - y1 : y1 - y0; /* dy <= 0 */
  int sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
  for (;;) {
    black(fb, x0, y0);
    if (x0 == x1 && y0 == y1) {
      break;
    }
    int e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

static void rect_outline(uint8_t *fb, int x, int y, int w, int h) {
  fill_rect(fb, x, y, w, 2);
  fill_rect(fb, x, y + h - 2, w, 2);
  fill_rect(fb, x, y, 2, h);
  fill_rect(fb, x + w - 2, y, 2, h);
}

/* 24x12 icon, top right: two chain links locked together, or the same two apart with a slash through them. */
static void draw_link_icon(uint8_t *fb, bool linked) {
  const int x = UI_W - 24 - 3, y = 3;
  if (linked) {
    rect_outline(fb, x, y, 14, 10);
    rect_outline(fb, x + 10, y, 14, 10);
    fill_rect(fb, x + 6, y + 4, 12, 2); /* the bar through both */
  } else {
    rect_outline(fb, x, y, 10, 10);
    rect_outline(fb, x + 14, y, 10, 10);
    line(fb, x + 2, y + 11, x + 21, y - 1);
    line(fb, x + 3, y + 11, x + 22, y - 1);
  }
}

static void draw_pairing(uint8_t *fb, const char *code) {
  draw_text(fb, 14, 5, "Pair");                      /* 4 chars at scale 5 = 115 px wide */
  draw_text(fb, 14 + 7 * 5 + 16, fit(code, UI_W - 2 * MARGIN, 3), code); /* 6 digits at scale 3 = 105 px */
}

static void draw_notice(uint8_t *fb, const char *a, const char *b) {
  int sa = fit(a, UI_W - 2 * MARGIN, 4);
  if (!b) {
    draw_text(fb, (UI_H - 7 * sa) / 2, sa, a);
    return;
  }
  int sb = fit(b, UI_W - 2 * MARGIN, 4);
  int sc = sa < sb ? sa : sb;
  int total = 14 * sc + 8;
  int y = (UI_H - total) / 2;
  draw_text(fb, y, sc, a);
  draw_text(fb, y + 7 * sc + 8, sc, b);
}

void ui_render(uint8_t fb[UI_FB_SIZE], const struct ui_scene *s) {
  const struct pq_view *v = &s->view;
  memset(fb, 0xff, UI_FB_SIZE);

  if (s->notice[0]) {
    draw_notice(fb, s->notice[0], s->notice[1]);
    return;
  }
  if (s->pair[0]) {
    draw_pairing(fb, s->pair);
    return;
  }

  draw_link_icon(fb, v->link);

  if (!v->link) {
    int sc = fit("NO LINK", UI_W - 2 * MARGIN, 6);
    draw_text(fb, (UI_H - 7 * sc) / 2, sc, "NO LINK");
    return;
  }
  if (!v->sign) { /* "-": no call; a small "no key" under it until this game's key arrives */
    fill_rect(fb, UI_W / 2 - 30, UI_H / 2 - 4, 60, 8);
    if (v->nokey) {
      draw_text(fb, UI_H / 2 + 22, 3, "no key");
    }
    return;
  }

  /* A call. The words sit at the bottom, one size for all lines (the largest at which the longest fits); the sign takes
   * what is left above them, as large as that height allows. */
  int nw = v->nwords > 2 ? 2 : v->nwords;
  int wscale = 0, words_h = 0;
  if (nw > 0) {
    wscale = 4;
    for (int i = 0; i < nw; i++) {
      int f = fit(v->words[i], UI_W - 2 * MARGIN, 4);
      if (f < wscale) {
        wscale = f;
      }
    }
    words_h = nw * 7 * wscale + (nw - 1) * wscale * 2;
  }
  int bottom = UI_H - MARGIN;
  int top = ICON_H + 6;
  int avail = bottom - top - (nw ? words_h + MARGIN * 2 : 0);
  int ss = avail / 7;
  if (ss * 5 > UI_W - 2 * MARGIN) {
    ss = (UI_W - 2 * MARGIN) / 5;
  }
  if (ss < 1) {
    ss = 1;
  }
  char sign[2] = {v->sign[0], 0};
  draw_text(fb, top + (avail - 7 * ss) / 2, ss, sign);
  for (int i = 0; i < nw; i++) {
    draw_text(fb, bottom - words_h + i * (7 * wscale + 2 * wscale), wscale, v->words[i]);
  }
}

int ui_render_ascii(const uint8_t fb[UI_FB_SIZE], char *out, int cap) {
  int n = 0;
  for (int y = 0; y < UI_H && n + UI_W + 2 < cap; y++) {
    for (int x = 0; x < UI_W; x++) {
#ifdef PQ_UI_MSB_FIRST
      bool white = fb[y * UI_STRIDE + x / 8] & (0x80u >> (x & 7));
#else
      bool white = fb[y * UI_STRIDE + x / 8] & (1u << (x & 7));
#endif
      out[n++] = white ? '.' : '#';
    }
    out[n++] = '\n';
  }
  out[n] = 0;
  return n;
}
