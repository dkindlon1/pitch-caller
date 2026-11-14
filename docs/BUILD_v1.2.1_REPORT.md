# v1.2.1 build report (second shake-off is a hard switch)

Branch `v1.2.1` from `main @ 504aaa8` (v1.2 as released). Every result below was run in this session and is as printed.
**This session can read the GitHub repo but not push to it**, so CI hasn't run on the branch.

## What Drew decided (Nov 14)
From the game-readiness review (`docs/REVIEW_v1.2_game_readiness_2026-11-14.md`):
- A pitch shaken off **once** can still come back when nothing else he trusts is left (a strong pitch may be re-called).
- Shaken off a **second time in the same at-bat**, it's a hard switch: out until the next batter.
- A shake-off is mostly about this hitter, count or sequence, so it costs **0.05 confidence** (was 0.20, for the whole game).

## What changed
- **Both engines** (`engine.py`, `app/engine.js`, copied to `web/lib/engine.js`):
  - `CONF_DELTA["shakeoff"]` -0.20 → -0.05.
  - `hard_shaken` / `hardShaken`: the pitches named twice or more in the exclude list (names or older (pitch, spot) pairs).
  - `root_call` / `rootCall`: when the shake list leaves nothing to call, a pitch shaken twice stays out and the call goes to
    the rest of his pitches (trusted first, else his most-trusted of them, the engine's existing fallback). Only if every pitch
    is shaken twice are the shake-offs set aside, so there's always a call. Before: every shake-off was set aside.
  - Engine `VERSION` 1.2 → 1.2.1.
- **App:**
  - `shakeOff()` adds one entry per shake (it used to add a pitch once), so the engine can see a second shake.
  - The toast reads "Shook off the fastball." the first time, and "Shook off the fastball again. It's out until the next
    batter." on the second.
  - `APP_VERSION` 1.2.1. The setup screen reads "PitchIQ 1.2.1 · engine 1.2.1".
- **Simulator:** the shake list is a list (one entry per shake), as the app.
- **Tests:** `tests_v121.py` and `app/v121_shake_e2e.js` added to `scripts/test-app.sh`.
  - `v08_e2e` / `v09_matchup_e2e` (not in CI) expect version 1.2.1.
  - `v11_fixture_test` replays the v1.0 backup's games at the shake-off cost they were logged under (below).
- No database change. The event's `shaken` field keeps its shape.

## Proof
| Check | Result |
|---|---|
| `tests_v121.py` | **11/11**. With no pitch shaken twice, calls are **bit for bit v1.2's** (`git archive 504aaa8`; 40 random cases, 0 to every pitch shaken once, names and pairs). Fastball 0.85, others under the D3 cutoff: back after one shake, out after two, slider called. Pairs count by pitch. Fastball shaken twice with a trusted slider shaken once: slider. Every pitch shaken twice: still a call. Other trusted pitches left: one shake takes it out (as v1.2). The why line and intent work. Shake cost 0.05. App sequence: fastball → fastball → slider. **Python = JS** on 8 rule cases, largest difference 3.6e-14 |
| `app/v121_shake_e2e.js` (the built app in a browser) | **9/9**: version line; only trusted pitch back after one shake; 0.90 → 0.85 → 0.80; both toasts; out for the next three calls of the at-bat after the second shake; one entry per shake; the next hitter starts clean; no page errors |
| `scripts/test-app.sh` | **Every suite passes.** Run in two parts. The first run went through `kinds_test` on `e3ad100`, then stopped at `v11_fixture_test` (below). The rest ran on `78f0e67`, where only that test file changed. Results: tests.py 45, explain 7, tests_v11 41, fast parity (incl. the shake-off confidence, Python = JS), tests_v12 22, lean parity, tests_v12b 12, tag parity, tests_v121 11, golden_v12 (JS), build matches source, web copies, web demo 2, learn 27, db 18, import 14, rails 31, schema 24, stage2 21, worlds 31, pitch_rules 41, kinds 23, v11_fixture 8, lean 8, hitter_tags 3, smoke, rules 20, v10 step 1/3/5 e2e 6/7/10, v11_step5 14, v12_step4 35, v12_oldapp 15, v12_tags 9, v121_shake 9, **game_mix 44 (average top pitch 49.5%, one game over 70%; v1.2 released at 49.5%)** |
| `v09_matchup_e2e` / `v08_e2e` (not in CI) | v09 passes (engine 1.2.1). v08: the version check passes; its only failure is the known phone width (441 px at 390), the same as v1.2 |

### The one test that moved: `v11_fixture_test`
- The v1.0 backup holds **20 shake-offs** logged at 0.20.
- Replayed with today's 0.05, confidence moved by up to 0.175, so the exact-replay check failed.
- Replayed with the 0.20 they were logged under, confidence is **exact (largest difference 0)**. So the whole difference is the
  shake-off cost.
- The test now replays at the logged cost and reports the 0.05 difference.

## For Drew
- **The learner replays confidence with today's shake cost.** A game logged before v1.2.1 that has shake-offs is
  re-scored with 0.05, not the 0.20 it was played under. Every game in the repo is a test fixture; no real games are logged
  yet, so nothing real moves.
- **Release** (each step needs Drew):
  1. Push branch `v1.2.1` from `pitch-caller-v1.2.1.bundle` and let CI run.
  2. Fast-forward `main` (`504aaa8` → the branch). No migration.
  3. Open the game app on each iPad and check "PitchIQ 1.2.1 · engine 1.2.1" under Game.
  4. Tag `v1.2` (still not pushed) and `v1.2.1`.
