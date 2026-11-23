#include "hr_est.h"

#include <string.h>

#define MIN_IV_MS 300u
#define MAX_IV_MS 1500u
#define LOST_MS 3000u /* no beat for this long: the reading is dropped */

static uint16_t median(const uint16_t *v, uint8_t n) {
  uint16_t s[HR_EST_RING];
  for (uint8_t i = 0; i < n; i++) {
    s[i] = v[i];
  }
  for (uint8_t i = 1; i < n; i++) { /* insertion sort, n <= 5 */
    uint16_t k = s[i];
    int j = (int)i - 1;
    while (j >= 0 && s[j] > k) {
      s[j + 1] = s[j];
      j--;
    }
    s[j + 1] = k;
  }
  return s[n / 2];
}

void hr_est_init(struct hr_est *e) {
  memset(e, 0, sizeof(*e));
}

static void clear(struct hr_est *e) {
  hr_est_init(e);
}

uint8_t hr_est_feed(struct hr_est *e, uint32_t raw, uint32_t t_ms) {
  if (raw < HR_EST_MIN_RAW) {
    clear(e);
    return 0;
  }
  int32_t v = (int32_t)(262143u - (raw > 262143u ? 262143u : raw));
  if (!e->started) {
    e->started = true;
    e->lp = e->lo = e->hi = v;
    e->hi_t = t_ms;
  }
  e->lp += (v - e->lp) >> 1;

  if (e->lp < e->lo) { /* a new trough: a crest has to come after it */
    e->lo = e->lp;
    e->hi = e->lp;
    e->hi_t = t_ms;
  } else if (e->lp > e->hi) {
    e->hi = e->lp;
    e->hi_t = t_ms;
  }
  int32_t rise = e->hi - e->lo;
  if (rise >= HR_EST_MIN_AMP && rise * 2 >= e->amp && e->lp <= e->hi - rise / 4) { /* the crest is over: a beat at hi_t */
    uint32_t bt = e->hi_t;
    e->amp = e->amp ? (e->amp * 3 + rise) / 4 : rise;
    e->lo = e->hi = e->lp;
    e->hi_t = t_ms;
    if (!e->have_last) {
      e->have_last = true;
      e->last_t = bt;
    } else if (bt - e->last_t >= MIN_IV_MS) {
      uint32_t iv = bt - e->last_t;
      e->last_t = bt;
      if (iv <= MAX_IV_MS) {
        e->ring[e->ring_pos] = (uint16_t)iv;
        e->ring_pos = (uint8_t)((e->ring_pos + 1) % HR_EST_RING);
        if (e->ring_n < HR_EST_RING) {
          e->ring_n++;
        }
      } else { /* a long gap: the beats before it say nothing about now */
        e->ring_n = 0;
        e->ring_pos = 0;
        e->bpm = 0;
      }
      if (e->ring_n >= 4) {
        /* median first, then the mean of the intervals within 25 % of it: the mean of several intervals is the
         * distance between two beats ~4 apart, so the 20 ms sample step is spread over them (a single interval at
         * 180 bpm would be off by 6 %). */
        uint16_t m = median(e->ring, e->ring_n);
        uint32_t sum = 0, cnt = 0;
        for (uint8_t i = 0; i < e->ring_n; i++) {
          uint32_t d = e->ring[i] > m ? e->ring[i] - m : m - e->ring[i];
          if (d * 4u <= m) {
            sum += e->ring[i];
            cnt++;
          }
        }
        e->bpm = (uint8_t)((60000u * cnt + sum / 2u) / sum);
      }
    }
  }
  if (e->have_last && t_ms - e->last_t > LOST_MS) {
    e->ring_n = 0;
    e->ring_pos = 0;
    e->bpm = 0;
    e->amp = 0;
  }
  return e->bpm;
}
