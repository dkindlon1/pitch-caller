#!/bin/bash
# Run every setup in matrix/configs.txt: 10 games each, two at a time. Run from anywhere.
cd "$(dirname "$0")/.."
run_one() { tag=$1; shift; env "$@" python3 batch.py matrix/$tag 401 10 > matrix/$tag.txt 2>&1 && echo "done $tag $(date +%T)" || echo "FAILED $tag $(date +%T)"; }
export -f run_one
xargs -P 2 -L 1 bash -c 'run_one "$@"' _ < matrix/configs.txt
echo "ALL DONE $(date +%T)"
