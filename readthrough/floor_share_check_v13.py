"""Part 9 (ruling 33): the engine's root fastball-class share by count against the HS floor, at HS and travel, over the
robustness arsenals (10) x 12 counts, default situation (no history). Report only; run in each engine snapshot and compare.
usage (repo root, PITCHIQ_DATA set): floor_share_check_v13.py --out PATH"""
import json, os, sys
a = sys.argv[1:]
OUT = a[a.index("--out") + 1]
sys.argv = [sys.argv[0], "--suite", "v12"]
sys.path.insert(0, os.path.join(os.getcwd(), "readthrough"))
import scenarios as R   # noqa: E402
e = R.e
DOC, _ = R.load()
ARS = ["cut_ch", "deadzone", "fd", "four", "four_cut", "hs_two", "ride126", "sink_sweep", "three", "two"]
res = {}
for lv in ("hs", "travel"):
    for ak in ARS:
        for b in range(4):
            for k in range(3):
                inp = {"level": lv, "arsenal": ak, "balls": b, "strikes": k, "batters_faced": 19, "pitch_count": 70}
                ars, s, ex = R.build(DOC, {"inputs": inp, "pitch_edits": {}, "exclude": [], "matchup": []})
                fbn = {x.name for x in ars if e.is_fastball(x.kind)}
                d = R.call_dist("v09", ars, s, ex)
                m = {}
                for pr, name, kind, q in d:
                    m[f"{name} {q}"] = m.get(f"{name} {q}", 0.0) + pr
                res[f"{lv}|{ak}|{b}-{k}"] = {"floor": e.fb_floor(s), "fb": sum(pr for pr, name, kind, q in d if name in fbn),
                                             "top": max(m, key=m.get), "top_share": max(m.values())}
json.dump(res, open(OUT, "w"), indent=1)
print("ok", len(res))
