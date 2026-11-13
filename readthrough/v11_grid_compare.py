"""v1.1: the predictability grid now vs the v1.0 baseline (results/v11/grid_v10_baseline.json); writes results/v11/grid_v11a.json.
usage (repo root): python3 readthrough/v11_grid_compare.py [out.json]   (Step 2: results/v11/grid_v11_step2.json)"""
import json, sys
import os; sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import grid_v10 as g
G = g.grid()
base = json.load(open("results/v11/grid_v10_baseline.json"))
now = {'|'.join([k[0], k[1], k[2], f'{k[3][0]}-{k[3][1]}']): {'types': {n: round(v, 4) for n, v in c['types'].items()}, 'top': list(c['top']), 'top_share': round(c['top_share'], 4)} for k, c in G.items()}
OUTF = sys.argv[1] if len(sys.argv) > 1 else "results/v11/grid_v11a.json"
json.dump(now, open(OUTF, "w"), indent=0, sort_keys=True)
moves = []
for k in base:
    b, n = base[k]["types"], now[k]["types"]
    for p in set(b) | set(n):
        moves.append((abs(n.get(p, 0) - b.get(p, 0)), k, p, b.get(p, 0), n.get(p, 0)))
moves.sort(reverse=True)
import statistics
print("cells", len(base), "pitch-type share changes: median %.4f, mean %.4f, 95th pct %.4f, max %.4f" % (
    statistics.median(m[0] for m in moves), statistics.mean(m[0] for m in moves), sorted(m[0] for m in moves)[int(0.95 * len(moves))], moves[0][0]))
for m in moves[:10]: print("  %-40s %-10s %.3f -> %.3f" % (m[1], m[2], m[3], m[4]))
top_changed = sum(base[k]["top"] != now[k]["top"] for k in base)
print("top call changed in", top_changed, "of", len(base), "cells")
for name, ok, detail, hard in g.checks(G): print('PASS' if ok else 'FAIL', name, '|', detail)
