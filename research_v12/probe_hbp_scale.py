"""v1.2 research probe (no engine change kept): scale one level's HBP price and read row P1 (sinker in, same side) and a
four-seam-in share, at every count 0-0..2-2. usage (repo root): python3 research_v12/probe_hbp_scale.py"""
import sys, json, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "readthrough"))
import scenarios as S
import engine as E
doc, _ = S.load()
rows = {r["id"]: r for r in doc["rows"]}
def share(row, pats, b, k, level=None):
    r = json.loads(json.dumps(row)); r["inputs"]["balls"], r["inputs"]["strikes"] = b, k
    r["inputs"].pop("pa_log", None)
    if level: r["inputs"]["level"] = level
    ars, s, ex = S.build(doc, r)
    d = S.call_dist("v09", ars, s, ex)
    return s.level, sum(pr for pr, _, kind, q in d if any(S.matches(x, kind, q) for x in pats))
counts = [(0, 0), (1, 0), (0, 1), (1, 1), (2, 1), (0, 2), (1, 2), (2, 2)]
base = dict(E.OUTCOME_ADJ["college_d3"])
for f in (1.0, 0.53, 0.35, 0.2026):          # 0.2026 = MLB's hbp / D3's
    E.OUTCOME_ADJ["college_d3"]["hbp"] = base["hbp"] * f
    lv, _ = share(rows["P1"], ["SI:in"], 1, 0)
    a = [share(rows["P1"], ["SI:in"], b, k)[1] for b, k in counts]
    c = [share(rows["P7"], ["FF:in"], b, k)[1] for b, k in counts]
    print(f"{lv} hbp x{f:.2f}: P1 SI:in " + " ".join(f"{v:4.0%}" for v in a) + " | P7 FF:in " + " ".join(f"{v:4.0%}" for v in c))
E.OUTCOME_ADJ["college_d3"].update(base)
print("counts:", " ".join(f"{b}-{k}" for b, k in counts))
