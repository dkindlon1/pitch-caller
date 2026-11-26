#!/usr/bin/env bash
# v1.3 Part 9 (ruling 33, floor fix): HS only. Snapshot = git archive fae37d2.
set -u
export PATH=/c/dev/pitch-caller-logs/shim:$PATH
export PYTHONUTF8=1 KGAP_OUT=C:/dev/pitchiq-data-final/p9 KGAP_WEIGHTED=1 PITCHIQ_DATA=C:/dev/pitchiq-data-final
P=C:/dev/pitchiq-data-final/p9
cd $P/engine
echo "start hs refstaff 10 $(date +%T)"
python -m hitter_data.kgap_diag run hs refstaff 10
echo REFCHECKDONE $(date +%T)
echo "start hs base 900 $(date +%T)"
python -m hitter_data.kgap_diag run hs base 900
echo BASEDONE $(date +%T)
cd /c/dev/pc-final
python -m hitter_data.sim_pool run $P/engine hs 1001 400 $P/sims400/core_hs
echo ALLDONE $(date +%T)
