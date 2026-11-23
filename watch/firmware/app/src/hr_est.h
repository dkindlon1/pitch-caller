/*
 * hr_est.h - heart rate from a stream of green PPG samples, by peak-to-peak interval, in integer math (no floats, no
 * allocation, no Zephyr).
 *
 * How it works, per sample:
 *   1. contact check: a raw value below HR_EST_MIN_RAW means no skin under the sensor; the state is cleared.
 *   2. the signal is (full scale - raw): blood absorbing light (a heartbeat) makes it go UP.  A short smoothing filter
 *      (alpha 1/2) takes the edge off sample noise.  There is no DC removal: baseline wander (breathing, arm movement) is
 *      slower than a beat, and the peak finder below only looks at rises, so it moves hi and lo together.
 *   3. a beat is a rise from a trough (lo) to a crest (hi) followed by a fall of a quarter of the rise.  Whenever a new lowest
 *      value appears, the crest candidate restarts from it, so a crest always comes after its own trough.
 *   4. a rise is only a beat if it is at least HR_EST_MIN_AMP and at least half of the recent average rise.
 *   5. beats closer than 300 ms are ignored (more than 200 bpm); the interval between beats is kept if it is
 *      300..1500 ms (40..200 bpm).  The last five are kept; the median is found, the ones within 25 % of it are
 *      averaged, and the rate is 60000 / that mean.  A reading needs at least four valid intervals.
 *
 * It is a simple estimator for a wrist sensor at rest.  Motion makes it wrong (the accelerometer could gate it; not done
 * here).  It was checked on a host against synthetic signals only (see README), not on a wrist.
 */
#ifndef HR_EST_H
#define HR_EST_H

#include <stdbool.h>
#include <stdint.h>

/* ASSUMPTION: an 18-bit green reading below this is "no skin".  A guess from the part's range; read real values on a
 * wrist and a table and set it from them. */
#define HR_EST_MIN_RAW 4000u
/* ASSUMPTION: the smallest beat amplitude (counts of the 18-bit raw value) worth believing; below it is noise. */
#define HR_EST_MIN_AMP 40
#define HR_EST_RING 5

struct hr_est {
  bool started;
  int32_t lp;             /* smoothed signal */
  int32_t lo;             /* lowest value since the last beat */
  int32_t hi;             /* highest value since that trough */
  uint32_t hi_t;          /* time of hi (ms) */
  int32_t amp;            /* average rise of recent beats */
  bool have_last;
  uint32_t last_t;        /* time of the previous accepted beat */
  uint16_t ring[HR_EST_RING]; /* recent intervals, ms */
  uint8_t ring_n;
  uint8_t ring_pos;
  uint8_t bpm;            /* last good rate, 0 = none */
};

void hr_est_init(struct hr_est *e);
/* Feed one sample.  t_ms is any millisecond clock that does not run backwards.  Returns the current rate in beats per
 * minute, or 0 while there is no good reading (no contact, too few beats, or the signal is lost). */
uint8_t hr_est_feed(struct hr_est *e, uint32_t raw, uint32_t t_ms);

#endif
