"""v1.1 Step 4: the profile rows' shares at every count 0-0 to 2-2 (pa_log dropped), to tell a count choice from a real gap.
usage (repo root): python3 readthrough/profile_counts.py --suite v11"""
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scenarios as S
doc, _ = S.load()
rows = {r["id"]: r for r in doc["rows"]}
def share(row, pats, b, k):
    r = json.loads(json.dumps(row)); r["inputs"]["balls"], r["inputs"]["strikes"] = b, k
    r["inputs"].pop("pa_log", None)
    ars, s, ex = S.build(doc, r)
    d = S.call_dist("v09", ars, s, ex)
    return sum(pr for pr, _, kind, q in d if any(S.matches(x, kind, q) for x in pats))
tests = [("P1 SI:in same side", "P1", ["SI:in"]), ("P1 SI:any same side", "P1", ["SI:any"]),
         ("P2 SL:any opp side", "P2", ["SL:any"]), ("P3 SL:zone", "P3", ["SL:zone"]), ("P3 SL:any", "P3", ["SL:any"]),
         ("P4 CB:zone opp", "P4", ["CB:zone"]), ("P5 CH:down|chase opp", "P5", ["CH:down", "CH:chase"]),
         ("P7 FF:down", "P7", ["FF:down"]), ("P7 FF:up", "P7", ["FF:up"]), ("P7 SI:down", "P7", ["SI:down"])]
counts = [(0,0),(1,0),(0,1),(1,1),(2,1),(0,2),(1,2),(2,2)]
print("%-24s" % "" + " ".join(f"{b}-{k}" .rjust(5) for b, k in counts))
for lab, rid, pats in tests:
    print("%-24s" % lab + " ".join(f"{share(rows[rid], pats, b, k):5.0%}" for b, k in counts))
