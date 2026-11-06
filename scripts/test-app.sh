#!/usr/bin/env bash
# Engine and app checks that need no database: Python regression, JS/Python parity, a reproducible build,
# the app's Node tests and the browser smoke test. (gate_test.js and d6_test.js are experiments that print a
# decision, not pass/fail checks, so they are not run here.)
set -euo pipefail
cd "$(dirname "$0")/.."
run=scripts/run-check.sh
$run tests.py      python3 tests.py
python3 app/make_parity.py 150 > /dev/null
$run parity        node app/parity.js
$run golden_v09    node golden/golden_v09.js     # the one engine against its frozen v0.9 reference (JS)
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
