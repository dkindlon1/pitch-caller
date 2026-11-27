#!/usr/bin/env bash
# Part 13 ruling 48: 2025 rescore on the tip (b775f01), the same command as Part 8 (results/v13p8/score_check.sh)
set -u
export PATH=/c/dev/pitch-caller-logs/shim:$PATH PYTHONUTF8=1 PITCHIQ_DATA=C:/dev/pitchiq-data-final
P=C:/dev/pitchiq-data-final/p13
mkdir -p $P/engine && (cd /c/dev/pc-final && git archive b775f01 | tar -x -C $P/engine)
(cd $P/engine && SCORE_CORE_OUT=$P/score_tip python -m hitter_data.score_core --all --v123-dir C:/dev/pitchiq-data/sims_fd/v123_engine > $P/score_tip.log 2>&1); echo "score tip $? $(date +%T)"
echo RESCOREDONE
