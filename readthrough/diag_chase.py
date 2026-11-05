"""v0.9 Step 2 diagnostic (item 7): why v0.8 calls so few chases with two strikes. No engine change: each v0.8 change is
switched back to its v0.7c setting one at a time (flags), or a fitted weight back to the spec's starting value, and the
chase share in 0-2 and 1-2 is measured with the engine queried directly.
usage (repo root): python3 readthrough/diag_chase.py [--out results/step2]
Setups: D3 and HS, default (FB/SL/CH) and four-pitch starters, both sides, counts 0-2 and 1-2, bases empty, no outs."""
import json, os, sys
from dataclasses import replace
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.dirname(HERE)]
import engine as e
import simulate

SETUPS = [("college_d3", "default"), ("college_d3", "four_pitch"), ("hs", "default"), ("hs", "four_pitch")]
SPEC_P08 = dict(beta_T=0.5, lam=0.6, alpha=0.4, beta_E=0.25, beta_E_S=0.25, dstar_E=1.5, beta_tun=0.15, phi_FB=0.058)


class Half:
    def random(self):
        return 0.5


def chase_share(mode_flags, p08=None):
    e.set_flags(**mode_flags)
    saved = dict(e.P08)
    if p08:
        e.P08.update(p08)
    try:
        tot, n = 0.0, 0
        for lv, st in SETUPS:
            simulate.STAFF = st
            ars = simulate.our_staff()[0]["arsenal"]
            for same in (True, False):
                s0 = e.Situation(0, 0, 0, (False, False, False), inning=4, level=lv, same_side=same, home=True, sched_innings=9,
                                 pitch_count=40, batters_faced=4)
                if e.FLAGS["look_state"]:
                    if e.FLAGS["objective_win"]:
                        s0 = replace(s0, win=e.win_constants(s0))
                    tab = e.solve_table(ars, s0)
                for b, k in ((0, 2), (1, 2)):
                    s = replace(s0, balls=b, strikes=k)
                    if e.FLAGS["look_state"]:
                        _, dist, _, _ = e.call_v08(ars, replace(s, look=tab.h0), rng=Half(), tab=tab)
                    else:
                        _, dist = e.call_mixed(ars, s, rng=Half())
                    tot += sum(d[0] for d in dist if d[3] == "chase")
                    n += 1
        return tot / n
    finally:
        e.P08.clear()
        e.P08.update(saved)


def main():
    outdir = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else os.path.join(os.path.dirname(HERE), "results", "step2")
    os.makedirs(outdir, exist_ok=True)
    res = {}
    res["v0.7c"] = chase_share(e.FLAGS_V07)
    res["v0.8"] = chase_share(e.FLAGS_V08)
    print(f"v0.7c {res['v0.7c']:.1%} | v0.8 {res['v0.8']:.1%}", flush=True)
    for f in e.FLAGS_V08:
        if e.FLAGS_V08[f] == e.FLAGS_V07[f]:
            continue
        key = f"v0.8 with {f} at its v0.7c setting"
        try:
            res[key] = chase_share(dict(e.FLAGS_V08, **{f: e.FLAGS_V07[f]}))
            print(f"{key}: {res[key]:.1%}", flush=True)
        except Exception as ex:
            res[key] = f"not runnable alone: {type(ex).__name__}: {ex}"
            print(f"{key}: {res[key]}", flush=True)
    for k, v in SPEC_P08.items():
        key = f"v0.8 with {k} at the spec's starting value {v} (shipped {e.P08[k]:.3f})"
        res[key] = chase_share(e.FLAGS_V08, {k: v})
        print(f"{key}: {res[key]:.1%}", flush=True)
    key = "v0.8 with every fitted weight at the spec's starting values"
    res[key] = chase_share(e.FLAGS_V08, SPEC_P08)
    print(f"{key}: {res[key]:.1%}", flush=True)
    json.dump(res, open(os.path.join(outdir, "chase_diag.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
