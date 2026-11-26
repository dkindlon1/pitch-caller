#!/usr/bin/env bash
# v1.3 Part 11 (ruling 41, E-7 fix): HS only. Snapshot = git archive cdaf0eb. Same seeds as Part 9 (kgap_diag's fixed seeds).
set -u
export PATH=/c/dev/pitch-caller-logs/shim:$PATH
export PYTHONUTF8=1 KGAP_OUT=C:/dev/pitchiq-data-final/p11 KGAP_WEIGHTED=1 PITCHIQ_DATA=C:/dev/pitchiq-data-final
cd C:/dev/pitchiq-data-final/p11/engine
echo "start hs base 900 $(date +%T)"
python -m hitter_data.kgap_diag run hs base 900
echo BASEDONE $(date +%T)
echo "start hs refstaff 900 $(date +%T)"
python -m hitter_data.kgap_diag run hs refstaff 900
echo ALLDONE $(date +%T)
