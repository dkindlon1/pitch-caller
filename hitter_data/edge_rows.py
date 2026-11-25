"""v1.3 Part 3 (Drew's Nov 25 ruling 17): the two-strike graded rows behind the calling edge, DRAFTED (grades PROPOSED).

For each level and two-strike count, the engine's call menu (call_v08's distribution, summed by pitch and target) for the
sim staff the edge was measured on (college / MLB: the default starter FB / SL / CH and reliever FB / CB / CH; HS: the
data staff's median pitchers q5 / q7, ruling 4), bases empty, 1 out, inning 3, tied, pitch count 40, first look at the
count (no at-bat so far), same- and opposite-side hitter. Plus each menu's class shares and the share in the zone
targets / chase. The rows to grade are picked from edge_summary.json (the counts carrying the most K / BB edge).

    python -m hitter_data.edge_rows      # -> {EDGE16}/edge_rows.json
"""
import json
import os
import sys

EDGE16 = os.environ.get("EDGE16", "C:/dev/pitchiq-data/edge16")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEVELS = ("mlb", "college_d1", "college_d2", "college_d3", "hs")
COUNTS2 = ((0, 2), (1, 2), (2, 2), (3, 2))


def staffs(sim, e, level):
    if level == "hs":
        st = sim.hs_data_staff()
        return {"starter (HS q5, FB / SL / CH)": st[2]["arsenal"], "reliever (HS q7, FB / CB / CH)": st[3]["arsenal"]}
    a, b = sim._default_staff()
    return {"starter (FB / SL / CH)": a["arsenal"], "reliever (FB / CB / CH)": b["arsenal"]}


def menu(e, ars, s):
    tab = e.solve_table(ars, e.replace(s, balls=0, strikes=0, last=None))
    _, dist, _, _ = e.call_v08(ars, s, rng=None, tab=tab)
    m = {}
    for pr, _, p, q in dist:
        m[(p.name, p.kind, q)] = m.get((p.name, p.kind, q), 0.0) + pr
    rows = sorted(m.items(), key=lambda kv: -kv[1])
    fb = sum(v for (n, k, q), v in m.items() if e.is_fastball(k))
    chase = sum(v for (n, k, q), v in m.items() if q == "chase")
    mid = sum(v for (n, k, q), v in m.items() if q == "middle")
    return dict(menu=[[f"{n} {q}", round(v, 4)] for (n, k, q), v in rows], fastball=fb, chase=chase, middle=mid)


def main():
    sys.path.insert(0, ROOT)
    out = {}
    for lv in LEVELS:
        os.environ["LEVEL"] = lv
        import engine as e
        import simulate as sim
        L = {}
        for name, ars in staffs(sim, e, lv).items():
            e.resolve_speeds(ars)
            for b, k in COUNTS2:
                for same in (True, False):
                    s = e.Situation(b, k, 1, (False, False, False), level=lv, same_side=same, pitch_count=40, inning=3,
                                    margin=0, batters_faced=10)
                    L[f"{b}-{k}|{name}|{'same' if same else 'opp'}"] = menu(e, ars, s)
        out[lv] = L
        print(lv, "done", flush=True)
    json.dump(out, open(os.path.join(EDGE16, "edge_rows.json"), "w", encoding="utf-8"), indent=1)


if __name__ == "__main__":
    main()
