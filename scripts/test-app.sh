#!/usr/bin/env bash
# Engine and app checks that need no database: Python regression, JS/Python parity, a reproducible build,
# the app's Node tests and the browser smoke test. (gate_test.js and d6_test.js are experiments that print a
# decision, not pass/fail checks, so they are not run here.)
set -euo pipefail
cd "$(dirname "$0")/.."
run=scripts/run-check.sh
$run tests.py      python3 tests.py
python3 app/make_parity_v10.py 200 > /dev/null 2>&1
$run parity_v10    node app/parity_v10.js        # v1.0: the shipped call path, Python vs JS within 1e-9
(cd app && python3 build.py)
if ! git diff --quiet -- app/dist; then
  echo "::error::app/dist is out of date: run 'cd app && python3 build.py' and commit the result"; git diff --stat -- app/dist; exit 1
fi
echo "build: app/dist matches the source"
for t in learn_test db_test import_test rails_test schema_test stage2_test worlds_test pitch_rules_test; do
  [ -f "app/$t.js" ] || continue
  (cd app && ../$run "$t" node "$t.js")
done
node app/smoke.js
echo "smoke: passed"
(cd app && ../$run rules_e2e node rules_e2e.js)
(cd app && ../$run v10_e2e node v10_e2e.js)        # v1.0: history, RP2, plan line, re-solve on a steal, fallback flag

# The frozen reference engine, run LAST on purpose. v1.0 changes the calls, so golden_v09 fails by design
# until Phase 9.1 freezes golden_v10 and replaces it here. It used to run second, and with `set -e` that
# meant everything below it - parity_v10, the app/dist build gate and every app suite - never executed,
# which is how a stale app/dist reached the branch unnoticed. Running it last keeps the suite's exit code
# honest (still non-zero) while the rest of the checks actually report.
$run golden_v09    node golden/golden_v09.js
