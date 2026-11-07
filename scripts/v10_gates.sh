#!/usr/bin/env bash
# Phase 9.2: the one v1.0 gate script. Runs every gate and prints PASS / FAIL / SKIP per line.
#
# Exit code: 0 only if nothing FAILed. SKIP never fails the run on its own, but a SKIP means the board
# is incomplete, so the summary says so and `--strict` turns every SKIP into a FAIL.
#
# Usage (repo root):
#   scripts/v10_gates.sh [--strict]
# Environment:
#   PY=python3            the Python to use
#   JOBS=4                parallelism for the slow Python gates
#   TAG=v10               tag for callsheet / exploit outputs
#   PGURL=...             Postgres superuser URL; unset means the SQL gate is skipped
#   V09_RUNS=../pc-v09/runs/readthrough/v09_tw   the v0.9 baseline games for the simulator floor
#   V10_RUNS=runs/readthrough/v10_tw             the matching v1.0 games
#   CALLSHEET_REUSE=1     reuse results/callsheet_$TAG.md if it is newer than the engine inputs
set -uo pipefail
cd "$(dirname "$0")/.."

PY=${PY:-python3}
JOBS=${JOBS:-4}
TAG=${TAG:-v10}
V09_RUNS=${V09_RUNS:-../pc-v09/runs/readthrough/v09_tw}
V10_RUNS=${V10_RUNS:-runs/readthrough/v10_tw}
STRICT=0
[ "${1-}" = "--strict" ] && STRICT=1

fails=0
skips=0
skipped_names=""

pass() { printf 'PASS  %-24s %s\n' "$1" "${2-}"; }
fail() { printf 'FAIL  %-24s %s\n' "$1" "${2-}"; fails=$((fails + 1)); }
skip() {
  if [ "$STRICT" = "1" ]; then
    printf 'FAIL  %-24s %s\n' "$1" "(skipped, --strict) ${2-}"
    fails=$((fails + 1))
  else
    printf 'SKIP  %-24s %s\n' "$1" "${2-}"
    skips=$((skips + 1))
    skipped_names="$skipped_names $1"
  fi
}

# gate <name> <command...> : PASS if the command exits 0, else FAIL with its first telling line.
gate() {
  local name="$1"
  shift
  local log
  log=$(mktemp)
  if "$@" >"$log" 2>&1; then
    pass "$name" "$(tail -n 1 "$log" | tr -d '\r' | cut -c1-88)"
  else
    local why
    why=$(grep -m1 -E '^FAIL|FAIL[:ED]|[0-9]+ differences|Error|error:|Traceback' "$log" | tr -d '\r' | cut -c1-88)
    [ -n "$why" ] || why="$(tail -n 1 "$log" | tr -d '\r' | cut -c1-88)"
    fail "$name" "$why"
  fi
  rm -f "$log"
}

echo "v1.0 gates - $(date -u '+%Y-%m-%d %H:%M:%SZ')  HEAD $(git rev-parse --short HEAD)"
echo

# ---- Python regression suites ------------------------------------------------
gate tests.py              "$PY" tests.py
gate tests_v10.py          "$PY" tests_v10.py
gate tests_v09_followups   "$PY" tests_v09_followups.py

# ---- the frozen reference engine --------------------------------------------
# Phase 9.1 freezes golden_v10 from golden/cases.py once the engine is final. While Phase 5 is paused the
# kappas and GUARD_TYPE are still the starting values, so freezing now would freeze the wrong engine.
if [ -f golden/golden_v10.json ] && [ -f golden/golden_v10.py ]; then
  gate golden_v10_py "$PY" golden/golden_v10.py check
else
  skip golden_v10_py "golden/golden_v10.* not frozen yet (engine not final: Phase 5 paused)"
fi
if [ -f golden/golden_v10.json ] && [ -f golden/golden_v10.js ]; then
  gate golden_v10_js node golden/golden_v10.js
else
  skip golden_v10_js "golden/golden_v10.* not frozen yet (engine not final: Phase 5 paused)"
fi

# ---- Python/JS parity on the shipped call path -------------------------------
if "$PY" app/make_parity_v10.py 200 >/dev/null 2>&1; then
  gate parity_v10 node app/parity_v10.js
else
  fail parity_v10 "app/make_parity_v10.py could not build the cases"
fi

# ---- the call sheet's bands --------------------------------------------------
cs_md="results/callsheet_${TAG}.md"
cs_reuse=0
if [ "${CALLSHEET_REUSE-}" = "1" ] && [ -f "$cs_md" ]; then
  cs_reuse=1
  for dep in engine.py app/engine_data.json mix_prior.json pitcher_side_params.py; do
    [ -f "$dep" ] || continue
    [ "$dep" -nt "$cs_md" ] && cs_reuse=0
  done
fi
if [ "$cs_reuse" = "1" ]; then
  line=$(grep -m1 '^enforced bands failing:' "$cs_md" | tr -d '\r')
  if [ "$line" = "enforced bands failing: none" ]; then
    pass callsheet_full "reused $cs_md"
  else
    fail callsheet_full "reused $cs_md - $line"
  fi
else
  gate callsheet_full "$PY" callsheet.py --tier full --jobs "$JOBS" --tag "$TAG"
fi

# ---- the v1.0 scenarios ------------------------------------------------------
gate scenarios_v10 "$PY" readthrough/scenarios_v10.py

# ---- predictability: must stay at or below v0.9's mean X ---------------------
if [ -f results/exploit_v09.json ]; then
  gate exploit "$PY" tools/exploit.py --tag "$TAG" --jobs "$JOBS" --compare results/exploit_v09.json
else
  skip exploit "results/exploit_v09.json (the v0.9 reference) is missing"
fi

# ---- the simulator floor: +0.25 runs/game against the v0.9 baseline ----------
if [ ! -d "$V09_RUNS" ]; then
  skip sim_floor "the v0.9 baseline games are not here: $V09_RUNS (copy pc-baseline-v09_tw)"
elif [ ! -d "$V10_RUNS" ]; then
  skip sim_floor "the v1.0 games are not here: $V10_RUNS (run readthrough/run_games.py --suffix _tw)"
else
  gate sim_floor "$PY" tools/sim_floor.py "$V09_RUNS" "$V10_RUNS"
fi

# ---- the learner suites ------------------------------------------------------
for t in learn_test stage2_test worlds_test rails_test; do
  gate "$t" node "app/$t.js"
done

# ---- the app and SQL suites, and the web build ------------------------------
gate test-app.sh bash scripts/test-app.sh
if [ -n "${PGURL-}" ]; then
  gate test-sql.sh bash scripts/test-sql.sh
else
  skip test-sql.sh "PGURL is unset (needs a local Postgres superuser URL; never Supabase)"
fi
gate web_build bash -c 'cd web && npm run build'

# ---- summary ----------------------------------------------------------------
echo
if [ "$skips" -gt 0 ]; then
  echo "skipped:$skipped_names"
fi
if [ "$fails" -eq 0 ] && [ "$skips" -eq 0 ]; then
  echo "v1.0 gates: ALL PASS"
  exit 0
fi
if [ "$fails" -eq 0 ]; then
  echo "v1.0 gates: no failures, but $skips gate(s) skipped - the board is INCOMPLETE"
  exit 0
fi
echo "v1.0 gates: $fails gate(s) FAILED, $skips skipped"
exit 1
