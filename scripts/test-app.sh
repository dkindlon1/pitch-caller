#!/usr/bin/env bash
# Engine and app checks that need no database: Python regression, JS/Python parity, a reproducible build,
# the app's Node tests and the browser smoke test. (gate_test.js and d6_test.js are experiments that print a
# decision, not pass/fail checks, so they are not run here.)
set -euo pipefail
cd "$(dirname "$0")/.."
run=scripts/run-check.sh
$run tests.py      python3 tests.py
$run explain       python3 tests_v11_explain.py 60   # v1.1 Step 3 (was tests_v10_explain.py): why line and intent tell the truth, setups included
$run tests_v11     python3 tests_v11.py              # v1.1: six kinds, one migration table, exactly v1.0's calls (Step 1)
$run fast_parity   python3 golden/fast.py 40      # live Python vs JS on 40 golden inputs, plus confidence and grading (v1.0 #18)
$run tests_v12     python3 tests_v12.py              # v1.2 Step 1: miss lean / spread, exactly v1.1 at lean 0 (vs git 14e0ad2), Python = JS
FAST_LEANS=1 $run fast_parity_leans python3 golden/fast.py 40   # v1.2: the same 40 golden inputs with a lean and spread on every pitch
$run golden_v11   node golden/golden_v11.js v11   # v1.1 Step 2: the one engine against its frozen reference (JS); golden_v10 and golden_v11a (Step 1b) stay as history
(cd app && python3 build.py)
if ! git diff --quiet -- app/dist; then
  echo "::error::app/dist is out of date: run 'cd app && python3 build.py' and commit the result"; git diff --stat -- app/dist; exit 1
fi
echo "build: app/dist matches the source"
# the website demo loads web/lib/engine.js with web/lib/engine_data.json: both must be the app's copies (v1.0 review)
for f in engine.js engine_data.json; do
  if ! cmp -s "app/$f" "web/lib/$f"; then echo "::error::web/lib/$f differs from app/$f: copy it"; exit 1; fi
done
echo "web/lib: engine.js and engine_data.json match the app's"
node --test web/lib/demo.test.ts > /tmp/web_demo.txt 2>&1 || { cat /tmp/web_demo.txt; echo "::error::web demo test failed"; exit 1; }
echo "web_demo: $(grep -E "^# pass" /tmp/web_demo.txt) (the website demo runs the engine with that data)"
for t in learn_test db_test import_test rails_test schema_test stage2_test worlds_test pitch_rules_test kinds_test v11_fixture_test; do   # v11_fixture_test: v1.1 Step 5, a real v1.0 backup migrates and replays
  [ -f "app/$t.js" ] || continue
  (cd app && ../$run "$t" node "$t.js")
done
node app/smoke.js
echo "smoke: passed"
(cd app && ../$run rules_e2e node rules_e2e.js)
(cd app && ../$run v10_step1_e2e node v10_step1_e2e.js)   # v1.0 Step 1: shake-off by pitch (D2), re-solve on bases/outs (#2)
(cd app && ../$run v10_step3_e2e node v10_step3_e2e.js)   # v1.0 Step 3: chase balls, HBP, landing record, old-format games
(cd app && ../$run v10_step5_e2e node v10_step5_e2e.js)
(cd app && ../$run v11_step5_e2e node v11_step5_e2e.js)   # v1.1 Step 5: profile names, the stuff hint, the main fastball mark
(cd app && ../$run game_mix_e2e node game_mix_e2e.js)    # v1.1: whole games through the app keep a mix (FINDING_v1.0_game_mix_collapse)   # v1.0 Step 5: look from logged spot (#24), one owner of hitter memory (#7), seed centering (#20)
