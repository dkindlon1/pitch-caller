#!/usr/bin/env bash
# Part 9: after queue.sh, the full 900 HS refstaff on the fix snapshot (events are W- and floor-independent; the per-count
# expected-rate field P reads the engine's table, which the floor touches, so rerun rather than reuse Part 8's)
set -u
until grep -q ALLDONE /c/dev/pitchiq-data-final/p9/queue.log; do sleep 20; done
export PATH=/c/dev/pitch-caller-logs/shim:$PATH
export PYTHONUTF8=1 KGAP_OUT=C:/dev/pitchiq-data-final/p9 KGAP_WEIGHTED=1 PITCHIQ_DATA=C:/dev/pitchiq-data-final
cd /c/dev/pitchiq-data-final/p9/engine
echo "start hs refstaff 900 $(date +%T)"
python -m hitter_data.kgap_diag run hs refstaff 900
echo Q2DONE $(date +%T)
