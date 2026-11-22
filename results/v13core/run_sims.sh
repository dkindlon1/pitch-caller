#!/usr/bin/env bash
# v1.3 core Task C step 5: seed-paired simulated games, core (C:/dev/pc-core) vs v1.2.3 (git archive main), per level,
# one batch at a time. batch.py also runs review.py on each game (the checker's clean / wrong share = the no-scouting
# full-game check). v1.2.3 has no college_d2: its D2 pair runs at college_d3 (the D2 placeholder level).
set -u
export PATH=/c/dev/pitch-caller-logs/py3/Scripts:/c/dev/pitch-caller-logs/shim:$PATH PYTHONUTF8=1
OUT=C:/dev/pitchiq-data/sims_v13core
V123=$1
N=${2:-20}
for lv in hs college_d3 college_d2 college_d1 mlb; do
  (cd /c/dev/pc-core && LEVEL=$lv python batch.py $OUT/core_$lv 401 $N > $OUT/core_$lv.txt 2>&1)
  v=$lv; [ $lv = college_d2 ] && v=college_d3
  (cd $V123 && LEVEL=$v python batch.py $OUT/v123_$lv 401 $N > $OUT/v123_$lv.txt 2>&1)
  echo "done $lv $(date +%T)"
done
echo ALLDONE
