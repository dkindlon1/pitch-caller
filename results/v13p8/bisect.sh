#!/usr/bin/env bash
# Part 8 task 6 (ruling 31, report only): default 2-2 / 3-2 robustness at W = 4 on each commit (its own hard_checks_v13.py /
# scenarios.py), plus the HS four_cut 3-2 cell at W = 32 (literal 4 -> 32 in the scratch copy; robust_diag sweep).
set -u
export PATH=/c/dev/pitch-caller-logs/shim:$PATH PYTHONUTF8=1 PITCHIQ_DATA=C:/dev/pitchiq-data-final
unset PITCH_ZONE_TABLE PITCH_COUNT_TABLE PITCH_RUN_TABLE PITCH_MP_TABLE
B=C:/dev/pitchiq-data-final/p8/bisect
mkdir -p $B
RD=/c/dev/pc-final/readthrough/robust_diag_v13.py
for c in 629c553 5613ab6 99b22fb 15ef1c6 24d4f66 c393047 c3e21be e00cfe5 938fc4e bd71234 2adf88e 510e617 1bc1cca 7b72080 2cf56d9 b58ede5 598c96a 5731b39; do
  T=$B/t_$c
  rm -rf $T; mkdir -p $T; (cd /c/dev/pc-final && git archive $c | tar -x -C $T)
  (cd $T && python readthrough/hard_checks_v13.py --out $B/hc_$c.json > $B/hc_$c.log 2>&1); echo "hc $c $? $(date +%T)"
  # W = 32 copy for the HS floor cell
  sed -i 's/(4 \* p_.get(a, 0.0) + usage.get(a, 0)) \/ (4 + n_u)/(32 * p_.get(a, 0.0) + usage.get(a, 0)) \/ (32 + n_u)/' $T/engine.py
  grep -c "(32 \* p_.get(a, 0.0)" $T/engine.py
  cp $RD $T/readthrough/
  (cd $T && python readthrough/robust_diag_v13.py --mode sweep --levels hs --arsenals four_cut,four --counts 3-2,2-2 --out $B/hs_$c.json > $B/hs_$c.log 2>&1); echo "hs $c $? $(date +%T)"
  rm -rf $T
done
echo BISECTDONE
