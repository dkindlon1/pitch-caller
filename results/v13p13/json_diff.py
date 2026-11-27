"""Part 13 ruling 48: every differing leaf between two score dirs' JSON files (scores.json, tables_*.json)."""
import json, os, sys
def leaves(o, p=""):
    if isinstance(o, dict):
        for k, v in o.items(): yield from leaves(v, f"{p}/{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o): yield from leaves(v, f"{p}[{i}]")
    else: yield p, o
a, b = sys.argv[1:3]
for fn in sorted(f for f in os.listdir(a) if f.endswith(".json")):
    A = dict(leaves(json.load(open(os.path.join(a, fn), encoding="utf-8"))))
    B = dict(leaves(json.load(open(os.path.join(b, fn), encoding="utf-8"))))
    d = [(k, A.get(k), B.get(k)) for k in sorted(set(A) | set(B)) if A.get(k) != B.get(k)]
    print(f"== {fn}: {len(A)} leaves, {len(d)} differ")
    for k, x, y in d: print(f"   {k}: {x!r} -> {y!r}")
