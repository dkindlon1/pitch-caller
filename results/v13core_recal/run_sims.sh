#!/usr/bin/env bash
# recalibrated core vs v1.2.3, seed-paired; core seeds 401-440, v1.2.3 seeds 413-440 (401-412 reused from sims_v13core,
# verified byte-identical); D2: 3 core seeds to confirm D2 = D3 pitch for pitch. One batch at a time.
set -u
export PATH=/c/dev/pitch-caller-logs/py3/Scripts:/c/dev/pitch-caller-logs/shim:$PATH PYTHONUTF8=1
O=C:/dev/pitchiq-data/sims_v13core_recal
V=/c/dev/pitchiq-data/core_recal/v123_engine
for lv in hs college_d3 college_d1 mlb; do
  (cd /c/dev/pc-core && LEVEL=$lv python batch.py $O/core_$lv 401 40 > $O/core_$lv.txt 2>&1)
  (cd $V && LEVEL=$lv python batch.py $O/v123_$lv 413 28 > $O/v123_$lv.txt 2>&1)
  echo "done $lv $(date +%T)"
done
(cd /c/dev/pc-core && LEVEL=college_d2 python batch.py $O/core_college_d2 401 3 > $O/core_college_d2.txt 2>&1)
echo ALLDONE
