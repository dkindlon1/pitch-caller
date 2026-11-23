/*
 * ui_render.h - draws a pq_view into a 1-bit 128x128 frame buffer.  Pure C, no Zephyr, so it also builds on a host
 * (the layout was checked there by printing it as text).
 *
 * Buffer layout is what the Zephyr ls0xx driver sends: UI_STRIDE bytes per row, 1 = white (PIXEL_FORMAT_MONO01),
 * 0 = black.  Which bit is the leftmost pixel of a byte depends on the driver's bit order: by default bit 0 is the
 * leftmost pixel (the panel is clocked LSB first and the driver sends bytes as they are, the same layout the Adafruit
 * library uses); define PQ_UI_MSB_FIRST to flip it.  ASSUMPTION: needs the real panel to confirm (a mirrored picture
 * means flip it).
 */
#ifndef UI_RENDER_H
#define UI_RENDER_H

#include <stdint.h>

#include "pq_core.h"

#define UI_W 128
#define UI_H 128
#define UI_STRIDE (UI_W / 8)
#define UI_FB_SIZE (UI_STRIDE * UI_H)

struct ui_scene {
  struct pq_view view;
  char pair[8];                /* the 6-digit passkey being shown, "" when none */
  const char *notice[2];       /* a short message that takes over the screen; NULL = none */
};

void ui_render(uint8_t fb[UI_FB_SIZE], const struct ui_scene *scene);
/* The same picture as text (one character per pixel, '#' = black), for the host check.  Returns bytes written. */
int ui_render_ascii(const uint8_t fb[UI_FB_SIZE], char *out, int cap);

#endif
