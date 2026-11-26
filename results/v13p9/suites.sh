#!/usr/bin/env bash
# Part 9: test-app then test-sql, alone, keep-going copies inside scripts/
set -u
export PATH=/c/dev/pitch-caller-logs/py3/Scripts:/c/dev/pitch-caller-logs/shim:$PATH PYTHONUTF8=1
export NODE_OPTIONS=--require=C:/dev/pitch-caller-logs/shim/npxshim.js
export PGURL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
export PITCHIQ_DATA=C:/dev/pitchiq-data-final
cd /c/dev/pc-final
L=/c/dev/pitchiq-data-final/p9/suites
mkdir -p $L
sed "s/^set -euo pipefail/set -uo pipefail/" scripts/test-app.sh > scripts/_kg_test-app.sh
sed "s/^set -euo pipefail/set -uo pipefail/" scripts/test-sql.sh > scripts/_kg_test-sql.sh
s=$(date +%s); bash scripts/_kg_test-app.sh > $L/test_app.log 2>&1; echo "test_app $(( $(date +%s)-s ))s" >> $L/summary.txt
s=$(date +%s); bash scripts/_kg_test-sql.sh > $L/test_sql.log 2>&1; echo "test_sql $(( $(date +%s)-s ))s" >> $L/summary.txt
rm -f scripts/_kg_test-app.sh scripts/_kg_test-sql.sh
echo SUITESDONE >> $L/summary.txt
