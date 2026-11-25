# Sim speed (feat/sim-speed), Nov 24 2026

Scope: the kgap_diag base game (`simulate.play_game` through `kgap_diag.worker`, `KGAP_WEIGHTED=1`), the job the v1.3
sim queues run. Outputs: `C:/dev/pitchiq-data/speed/` (profiles `prof/`, captured solves `capture/`, proof `proof/`,
JS timing `js_vs_py.jsonl`). Tool: `python -m hitter_data.sim_speed {profile|capture|bench|jsvspy|compare}`.
Everything ran with at most 2 compute processes, next to a 22-worker queue, so absolute times are under load.

## Where the time per pitch goes (cProfile, one game per level)

Before: ~0.6 s per pitch (about 95–113 s per game of ~160–175 pitches).

| piece | share of game time |
|---|---|
| `solve_table` (the caller's PA table: 12 counts × up to 10 sweeps × look bins, a sit game per count), ~1 per PA, 37 per D1 game | **96%** |
|  ↳ `outcome_probs` inside it (~16,600 calls per solve, 615k per game) | 59% |
|  ↳ rest of `cost08` (PA-end values, in-play values, table reads, coaching credit) | 21% |
|  ↳ sit game (`solve_sit_game`: phi / sit_response sums) | 18% |
| root call per pitch (`call_v08` → `_root_solve`) | 4% |
| the world's own draws, the logging and the kgap instrumentation | <1% |

Most of `outcome_probs`' work inside a solve gets recomputed for nothing: within one solve only the hitter's look and
sit change, but every call rebuilt the landing, profile and class terms, the count / zone cells, the side shifts and so on.

## Options, measured

| option | sim speedup | same results as the Python sims? | verdict |
|---|---|---|---|
| (c) cache / restructure the hot spots (built, commit 1bc1cca) | **3.39× overall** (MLB 3.01, D1 3.49, D2 3.07, D3 3.77, HS 3.70) | **yes, byte-identical**: 20 seeded games per level, 200 files (game JSON + pitch log) | **use** |
| (a) the sim loop on app/engine.js under Node | solves 13× faster than the old Python, 3.6× faster than the new (golden full-solve cases, D1 and HS) | **no**: 22–39% of table values match Python exactly (max diff 3e-14, inside the 1e-9 parity tolerance, but not bitwise). Python 3.12+ `sum()` uses compensated summation and V8 / MSVC libm `exp` differ in the last bit; a 1e-14 shift moves policy probabilities that `rng.random()` is compared against, so games would drift. There is also no JS sim loop: the world, the hidden hitters and CPython's Mersenne Twister draws (`gauss`, `choice`, ...) would all need a bit-exact port | not built |
| (b) diagnosis rows from the count chain instead of by simulation | **none available** | n/a | not built |

(b) in detail: the rows that only need per-count rates (`chain_P`, `chain_Ps`, the count-chain K split, probe / mix
rows, the landing effect) are already analytic: they chain the per-pitch *expected* probabilities through the count
chain and don't use the dice. But the per-count rates themselves depend on which pitches the engine calls in which states,
and only the games give that. Every other row the summaries publish (K / BB / HBP vs target, runs, paired K and runs
vs the fixed core, the per-count fastball share) is realized from games. No queued run exists only for per-count rows,
so no run can be dropped. An analytic version (policy-weighted rates from each PA's table, no in-game learning) would be
a different estimand, not the same numbers.

## What (c) changed (engine.py only, numbers unchanged)

- `outcome_probs` = `_op_const` (everything independent of the look and the sit, built by the same expressions in the
  same order) + the look / sit part. `solve_table` and `_root_solve` keep the constants per (pitch, target, count) for one
  solve. Subtraction became addition of the negated term where the term moved into a list (exact in IEEE).
- `cost08`: PA-end values, in-play values, the mashed / ground-ball / coaching terms and `look_update` cached the same way;
  `Table.value` caches its interpolation weights (`wv * wy`, as before) per look.
- `solve_sit_game`: phi and the hitter's response sum over precomputed rows / columns (same products, same `sum()`).
- Every `sum()` stays a `sum()` and every `+=` chain stays a `+=` chain, in the original order.

Checks: the proof (`compare`, 200 files identical); `tests_sim_speed.py` (cached == uncached for `outcome_probs` and
`cost08` at all five levels, `Table.value`, `solve_sit_game` against the textbook loop); `golden/fast.py 60` and
`FAST_LEVEL=hs golden/fast.py 40` (Python/JS parity) pass. Isolated solves (captured from real games): D1 1.50 → 0.41 s,
HS 1.94 → 0.62 s.

## Recommendation

Use (c) from the next run on. It is a drop-in engine change with the same seeds giving the same games, so a 480-game
level at 22 workers drops from ~31 min to ~9–10 min. After (c), `outcome_probs`' own arithmetic is the largest piece
(~25% of a solve), close to the pure-Python floor. A bigger gain would need the JS route, which means giving up
bit-identity with the Python history (results would have to be re-baselined), so it is a ruling, not a speed fix.
