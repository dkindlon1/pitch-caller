#!/usr/bin/env bash
# v1.3 Part 8 (W = 32): engine-called sims, refstaff identity check, 400-game core sims. Snapshot = git archive eec6ce7.
set -u
until grep -q ALLDONE /c/dev/pitchiq-data-final/p8/queue.log; do sleep 20; done
export PATH=/c/dev/pitch-caller-logs/shim:$PATH
export PYTHONUTF8=1 KGAP_OUT=C:/dev/pitchiq-data-final/p8 KGAP_WEIGHTED=1 PITCHIQ_DATA=C:/dev/pitchiq-data-final
P=C:/dev/pitchiq-data-final/p8
cd /c/dev/pitchiq-data-final/p8/engine
# 1. refstaff identity check: first 10 seeds per level vs Part 4 (the reference staff never uses the engine's calls)
for lv in hs college_d1 college_d2 college_d3 mlb; do
  echo "start $lv refstaff 10 $(date +%T)"
  python -m hitter_data.kgap_diag run $lv refstaff 10
done
echo REFCHECKDONE $(date +%T)
# 2. engine-called sims
for job in hs:base:900 college_d1:base:480 college_d2:base:480 college_d3:base:480 mlb:base:480; do
  IFS=: read lv v n <<< "$job"
  echo "start $lv $v $n $(date +%T)"
  python -m hitter_data.kgap_diag run $lv $v $n
done
echo BASEDONE $(date +%T)
echo Q2DONE $(date +%T)
