#!/usr/bin/env bash
# Part 8 task 5: 2025 scoring with W = 4 (git archive 5731b39) vs W = 32 (eec6ce7), same inputs, own output dirs
set -u
export PATH=/c/dev/pitch-caller-logs/shim:$PATH PYTHONUTF8=1 PITCHIQ_DATA=C:/dev/pitchiq-data-final
P=C:/dev/pitchiq-data-final/p8
mkdir -p $P/w4tree && (cd /c/dev/pc-final && git archive 5731b39 | tar -x -C $P/w4tree)
grep -n "^LEARN_PRIOR_W\|(4 \* p_.get" $P/w4tree/engine.py $P/engine/engine.py
for t in w4:$P/w4tree w32:$P/engine; do
  IFS=: read nm dir <<< "$t"
  dir=$P/$( [ $nm = w4 ] && echo w4tree || echo engine )
  (cd $dir && SCORE_CORE_OUT=$P/score_$nm python -m hitter_data.score_core --all --v123-dir C:/dev/pitchiq-data/sims_fd/v123_engine > $P/score_$nm.log 2>&1); echo "score $nm $? $(date +%T)"
done
echo SCORECHECKDONE
