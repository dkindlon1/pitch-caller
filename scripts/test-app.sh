#!/usr/bin/env bash
# Engine and app checks that need no database: Python regression, JS/Python parity, a reproducible build,
# the app's Node tests and the browser smoke test. (gate_test.js and d6_test.js are experiments that print a
# decision, not pass/fail checks, so they are not run here.)
set -euo pipefail
cd "$(dirname "$0")/.."
run=scripts/run-check.sh
$run tests.py      python3 tests.py
$run tests_hitter_data python3 tests_hitter_data.py   # v1.3 prework: college play-by-play parser on synthetic lines, the held-out (2026) guard
$run tests_zone_seed python3 tests_zone_seed.py   # v1.3 Part 2: zone seed math on synthetic pitches (not wired into the engine)
$run tests_harness  python3 tests_harness.py       # v1.3 Part 4: scoring harness (held-out + in-sample guards, bootstrap, frozen landing)
$run tests_fit_count python3 tests_fit_count.py    # v1.3 buildout Part 3.1/3.2/3.5: count-layer + run-value fits and candidate scoring on synthetic counts (PROVISIONAL fits; held-out guard)
$run explain       python3 tests_v11_explain.py 60   # v1.1 Step 3 (was tests_v10_explain.py): why line and intent tell the truth, setups included
$run tests_v11     python3 tests_v11.py              # v1.1: six kinds, one migration table, exactly v1.0's calls (Step 1)
$run fast_parity   python3 golden/fast.py 40      # live Python vs JS on 40 golden inputs, plus confidence and grading (v1.0 #18)
$run tests_v12     python3 tests_v12.py              # v1.2 Step 1: miss lean / spread, exactly v1.1 at lean 0 (vs git 14e0ad2), Python = JS
FAST_LEANS=1 $run fast_parity_leans python3 golden/fast.py 40   # v1.2: the same 40 golden inputs with a lean and spread on every pitch
$run tests_v12b    python3 tests_v12b.py             # v1.2 Part B: hitter tags (unknown = untagged, directions, Python = JS)
FAST_TAGS=1 $run fast_parity_tags python3 golden/fast.py 40   # v1.2 Part B: the same 40 golden inputs with hitter tags
$run tests_v121   python3 tests_v121.py             # v1.2.1: the second shake-off is a hard switch, a shake costs 0.05; exactly v1.2 otherwise (vs git 504aaa8), Python = JS
$run tests_v122   python3 tests_v122.py             # v1.2.2: the confidence band under the cutoff (blend), exactly v1.2.1 with no pitch in the band (vs git cb64db1), smooth, Python = JS, speed
$run tests_v123   python3 tests_v123.py             # v1.2.3: the umpire prior (200 takes): one take moves u under 0.1, exactly v1.2.2 with ump_u given (vs git ca6905e), Python = JS
$run tests_v13_d2  python3 tests_v13_d2.py          # v1.3 Part 3: college D2 in both engines on D3's numbers (PLACEHOLDER_D2), Python = JS; release_guard_d2.py trips (the release checklist runs the guard itself, not this suite)
FAST_LEVEL=college_d2 $run fast_parity_d2 python3 golden/fast.py 40   # v1.3 Part 3: the same 40 golden inputs, every case at college D2
$run tests_v13_sim python3 tests_v13_sim.py         # v1.3 Part 5: hidden hitter traits in the simulator; no traits = the e202169 games byte for byte, Python = JS
$run golden_v123  node golden/golden_v11.js v123  # v1.2.3 release reference (JS); golden_v10, v11a, v11, v12a, v12 and v122 (v1.2.2; differs only in the umpire estimate) stay as history
(cd app && python3 build.py)
if ! git diff --quiet -- app/dist; then
  echo "::error::app/dist is out of date: run 'cd app && python3 build.py' and commit the result"; git diff --stat -- app/dist; exit 1
fi
echo "build: app/dist matches the source"
# the website demo loads web/lib/engine.js with web/lib/engine_data.json: both must be the app's copies (v1.0 review)
for f in engine.js engine_data.json peak.js; do   # peak.js: Build 3 (outcome tracking), the same code on the iPad and the site
  if ! cmp -s "app/$f" "web/lib/$f"; then echo "::error::web/lib/$f differs from app/$f: copy it"; exit 1; fi
done
echo "web/lib: engine.js and engine_data.json match the app's"
node --test web/lib/demo.test.ts > /tmp/web_demo.txt 2>&1 || { cat /tmp/web_demo.txt; echo "::error::web demo test failed"; exit 1; }
echo "web_demo: $(grep -E "^# pass" /tmp/web_demo.txt) (the website demo runs the engine with that data)"
for t in learn_test db_test import_test import_opp_test peak_test rails_test schema_test stage2_test worlds_test pitch_rules_test kinds_test v11_fixture_test lean_test hitter_tags_test watch_test watch_sec_test; do   # watch_sec_test: Build 4, the watch crypto on both sides (test vectors, innings 1-255)   # watch_test: the watch prototype's link against fake watches running the real watch app   # lean_test: v1.2 Step 3, the miss-lean estimate   # v11_fixture_test: v1.1 Step 5, a real v1.0 backup migrates and replays
  [ -f "app/$t.js" ] || continue
  (cd app && ../$run "$t" node "$t.js")
done
$run watch_app node watch/bangle/test.js   # watch prototype: the Bangle app against stand-ins for its firmware
node app/smoke.js
echo "smoke: passed"
(cd app && ../$run rules_e2e node rules_e2e.js)
(cd app && ../$run v10_step1_e2e node v10_step1_e2e.js)   # v1.0 Step 1: shake-off by pitch (D2), re-solve on bases/outs (#2)
(cd app && ../$run v10_step3_e2e node v10_step3_e2e.js)   # v1.0 Step 3: chase balls, HBP, landing record, old-format games
(cd app && ../$run v10_step5_e2e node v10_step5_e2e.js)
(cd app && ../$run v11_step5_e2e node v11_step5_e2e.js)   # v1.1 Step 5: profile names, the stuff hint, the main fastball mark
(cd app && ../$run v12_step4_e2e node v12_step4_e2e.js)   # v1.2 Step 4: bullpen mode, way-off direction, ph / bs / glove, fixes at cell resolution
(cd app && ../$run v12_oldapp_test node v12_oldapp_test.js)   # v1.2 Step 4: a v1.1 build (14e0ad2) opens a v1.2 database
(cd app && ../$run v12_tags_e2e node v12_tags_e2e.js)   # v1.2 Part B: hitter tags on the card, the engine, snapshots and the importer
(cd app && ../$run v121_shake_e2e node v121_shake_e2e.js)   # v1.2.1: back after one shake, out after the second, toasts, version line
(cd app && ../$run v123_fixes_e2e node v123_fixes_e2e.js)   # v1.2.3: umpire after one strike, radar box, bullpen faced, bases at the third out, coach call after a shake-off, version line
(cd app && ../$run d2_e2e node d2_e2e.js)   # v1.3 Part 3: the coach picks College D2, a nine-inning game charts at D2 and saves as a D2 game
(cd app && ../$run game_mix_e2e node game_mix_e2e.js)    # v1.1: whole games through the app keep a mix (FINDING_v1.0_game_mix_collapse)   # v1.0 Step 5: look from logged spot (#24), one owner of hitter memory (#7), seed centering (#20)
(cd app && ../$run watch_e2e node watch_e2e.js)   # watch prototype: Accept, clears, shared signs, two watches; nothing changes without Web Bluetooth
(cd app && ../$run fold_e2e node fold_e2e.js)   # app v2: on an iPad in landscape (1180x820 and Safari's 1180x740) the call, Accept and all result keys fit without scrolling
(cd app && ../$run watch_optin_e2e node watch_optin_e2e.js)   # app v2: watch mode (Setup switch or ?watch=1) is kept on the device; the Game Day hand-off respects it; the card only when on
(cd app && ../$run sync_pill_e2e node sync_pill_e2e.js)   # app v2: the offline / syncing pill in the game bar
(cd app && ../$run readout_sessions_e2e node readout_sessions_e2e.js)   # app v2: the line under the call reads his sessions from the device only, after the first render, offline too
(cd app && ../$run logging_exact_test node logging_exact_test.js 2)   # Build 1: logging the full mix changes no call (old build vs new, same seeded games, every event field for field)
(cd app && ../$run opponent_exact_test node opponent_exact_test.js 2)   # Build 2: every new opponent field set = identical calls
(cd app && ../$run peak_sim node peak_sim.js 200)   # Build 3: findings and drift on simulated seasons (false-alarm targets)
(cd app && ../$run drift_exact_test node drift_exact_test.js 2)   # Build 3: drift notes change no call (before vs with outcome tracking, every event field for field)
(cd app && ../$run drift_e2e node drift_e2e.js)   # Build 3: the Notes button's badge, plain-words note, undo, reload; no sound, no pop-up
