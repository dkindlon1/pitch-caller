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
for t in db_test import_test rails_test schema_test stage2_test worlds_test pitch_rules_test; do
  [ -f "app/$t.js" ] || continue
  (cd app && ../$run "$t" node "$t.js")
done
node app/smoke.js
echo "smoke: passed"
(cd app && ../$run rules_e2e node rules_e2e.js)
(cd app && ../$run v10_e2e node v10_e2e.js)        # v1.0: history, RP2, plan line, re-solve on a steal, fallback flag

# ---------------------------------------------------------------------------
# The checks that are known to fail while v1.0 is paused, run LAST on purpose and each allowed to report
# before the next one starts. With bare `set -e` the first failure here aborts the script, which is how a
# stale app/dist once reached the branch unnoticed; collecting the failures instead keeps every check
# visible AND keeps the suite's exit code honest (still non-zero at the end).
#   callsheet_ci   plan 9.2. Ten of the enforced bands fail: see docs/V1.0_REPORT.md.
#   scenarios_v10  plan 9.2. F1 is over its Not-acceptable cap (a hitter-model timing effect).
#   learn_test     check 8 ("fewer fastballs to the masher", 38% unknown vs 41% masher) is a damage() effect.
#   golden_v09     fails by design: v1.0 changes the calls. Phase 9.1 freezes golden_v10 and replaces it here,
#                  and that freeze must be generated and checked in the pc-py313 Linux container - Windows and
#                  macOS libm differ from Linux by 1-2 ULP, which the iterated value table amplifies.
known_fail=""
$run callsheet_ci  python3 callsheet.py --tier ci --jobs 4 --tag ci   || known_fail="$known_fail callsheet_ci"
$run scenarios_v10 python3 readthrough/scenarios_v10.py              || known_fail="$known_fail scenarios_v10"
(cd app && ../$run learn_test node learn_test.js)                    || known_fail="$known_fail learn_test"
$run golden_v09    node golden/golden_v09.js                         || known_fail="$known_fail golden_v09"

if [ -n "$known_fail" ]; then
  echo "::error::failing checks:$known_fail"
  exit 1
fi
echo "test-app.sh: every check passed"
