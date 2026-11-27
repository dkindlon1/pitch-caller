#!/usr/bin/env bash
# Run one test command. It passes only if the command exits 0 AND printed at least one passing check,
# so a test that silently runs nothing fails CI instead of looking green.
# Usage: scripts/run-check.sh <name> <command...>
set -uo pipefail
name="$1"; shift
log="$(mktemp)"
"$@" 2>&1 | tee "$log"
code=${PIPESTATUS[0]}
passed=$(grep -cE '^[[:space:]]+ok[[:space:]]|\[PASS\]|^PASS:' "$log" || true)
failed=$(grep -cE '^[[:space:]]+FAIL[[:space:]]|\[FAIL\]|^FAIL:' "$log" || true)
rm -f "$log"
echo "::group::summary"; echo "$name: exit=$code passed=$passed failed=$failed"; echo "::endgroup::"
# Audit (Nov 27): suites Drew ruled "history" (ruling 44, docs/DECISIONS_refit_v13.md) are listed in PITCHIQ_KNOWN_RED by
# scripts/test-app.sh. They still run and print every failure, as a warning, but no longer stop the script, so the gates
# after them (parity, goldens, dist, web/lib, app e2e) actually run in CI. Before this, set -e ended CI at tests.py.
if [[ " ${PITCHIQ_KNOWN_RED:-} " == *" $name "* ]] && { [ "$code" -ne 0 ] || [ "$failed" -gt 0 ]; }; then
  echo "::warning::$name is a known-red suite (ruling 44): exit=$code, $failed failing check(s), $passed passing"
  exit 0
fi
if [ "$code" -ne 0 ]; then echo "::error::$name exited $code"; exit 1; fi
if [ "$failed" -gt 0 ]; then echo "::error::$name printed $failed failing check(s)"; exit 1; fi
if [ "$passed" -eq 0 ]; then echo "::error::$name ran 0 checks"; exit 1; fi
echo "$name: $passed checks passed"
