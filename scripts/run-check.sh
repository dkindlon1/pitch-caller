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
if [ "$code" -ne 0 ]; then echo "::error::$name exited $code"; exit 1; fi
if [ "$failed" -gt 0 ]; then echo "::error::$name printed $failed failing check(s)"; exit 1; fi
if [ "$passed" -eq 0 ]; then echo "::error::$name ran 0 checks"; exit 1; fi
echo "$name: $passed checks passed"
