"""v1.1 Step 4: which of v1.0's 71 graded read-through rows changed their calls (Drew regrades only those).
Before = the engine with step2_off (exactly v1.0's calls, proven by tests_v11.py); after = the engine as built.
A row "changed" if its top call changed or the call distributions differ by 5+ points (total variation), or if its
pass / fail verdict changed. usage: python3 readthrough/v10_rows_changed.py --suite v11"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import scenarios as S, engine as e
from step2_off import step2_off, params_at

doc, h = S.load()
rows = [r for r in doc["rows"] if r.get("status", "").startswith("graded")]


def dists():
    out = {}
    for r in rows:
        ars, s, ex = S.build(doc, r)
        d = {}
        for pr, name, kind, q in S.call_dist("v09", ars, s, ex):
            d[(name, q)] = d.get((name, q), 0.0) + pr
        out[r["id"]] = (d, S.grade(doc, r, "v09")["passed"])
    return out


with step2_off(e, params_at("7b5ebbb")):
    before = dists()
after = dists()
changed = []
for r in rows:
    (b, pb), (a, pa) = before[r["id"]], after[r["id"]]
    keys = set(b) | set(a)
    tv = 0.5 * sum(abs(b.get(k, 0.0) - a.get(k, 0.0)) for k in keys)
    tb, ta = max(b, key=b.get), max(a, key=a.get)
    if tb != ta or tv >= 0.05 or pb != pa:
        changed.append(dict(id=r["id"], tv=round(tv, 3), top_before=list(tb), top_after=list(ta), pass_before=pb, pass_after=pa,
                            situation=r.get("situation", "")))
print(f"{len(changed)} of {len(rows)} v1.0 rows changed (top call, 5+ points of call mix, or verdict)")
for c in sorted(changed, key=lambda c: -c["tv"]):
    print(f"  {c['id']:6s} TV {c['tv']:.2f}  top {'/'.join(c['top_before'])} -> {'/'.join(c['top_after'])}  "
          f"pass {c['pass_before']} -> {c['pass_after']}")
json.dump(dict(sha256=h, changed=changed, n=len(rows)), open(os.path.join(os.path.dirname(HERE), "results", "v11", "v10_rows_changed.json"), "w"), indent=1)
