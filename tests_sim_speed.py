"""feat/sim-speed: the speed-only caches return exactly the numbers of the uncached paths.

The full proof (same seeds, before vs after engine, every game's JSON and pitch log byte for byte) is
hitter_data/sim_speed.py `compare`; this is the quick guard for the cache keys:
  1 outcome_probs with solve_table's per-solve cache (_pre), across looks and sits, == without it
  2 cost08 with the cache == without it
  3 Table.value with cached interpolation weights == the plain bilinear sum
  4 solve_sit_game's row / column sums == the public sit_response / policy_from_costs on the same M
Run: python tests_sim_speed.py   (golden_v10 cases at each level; a few seconds)
"""
import json
import os
import sys
from dataclasses import replace

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "golden")]
import engine as e          # noqa: E402
import cases as G           # noqa: E402

LEVELS = ("mlb", "college_d1", "college_d2", "college_d3", "hs")


def golden(n):
    return [c for c in json.load(open(os.path.join(HERE, "golden", "golden_v10.json"), encoding="utf-8"))][:n]


def check_outcome_and_cost(level, cs):
    bad = 0
    for c in cs:
        c = json.loads(json.dumps(c))
        c["s"]["level"] = level
        ars, s = G.from_dicts(c)
        s = replace(s, win=e.win_constants(s)) if s.home is not None else s
        s0 = replace(s, balls=0, strikes=0, last=None)
        tab = e.solve_table(ars, s0)
        ks = e.sit_options(ars)
        for (b, k) in ((0, 0), (1, 2), (3, 1), (3, 2)):
            sc = replace(s0, balls=b, strikes=k, pa_log=(), usage_this_count={}, usage_by_call={})
            pre = {}
            sits = [("pure",) + kk for kk in ks[:3]] + [("mix", tab.sigma[(b, k)])]
            looks = [tab.h0] + [tab.bin_look(bn) for bn in tab.bins[::3]]
            for look in looks:
                sl = replace(sc, look=look)
                for (n, q) in e.allowed_calls(ars, sc)[::2]:
                    p = next(x for x in ars if x.name == n)
                    for sit in sits:
                        a = e.outcome_probs(p, q, sl, ars, sit=sit)
                        b_ = e.outcome_probs(p, q, sl, ars, sit=sit, _pre=pre)
                        bad += a != b_ or list(a) != list(b_)
                        ca = e.cost08(p, q, sl, ars, tab, look, sit)
                        cb = e.cost08(p, q, sl, ars, tab, look, sit, _pre=pre)
                        bad += ca[0] != cb[0]
    return bad


def check_value(cs):
    bad = 0
    for c in cs:
        ars, s = G.from_dicts(c)
        tab = e.solve_table(ars, replace(s, balls=0, strikes=0, last=None))
        for look in [tab.h0, (tab.vfb * 1.3, 0.2), (tab.vfb * 0.7, 4.9)] + [tab.bin_look(bn) for bn in tab.bins]:
            for (b, k) in e.COUNTS:
                ref = 0.0
                for iv, wv in e._interp_axis(look[0] / tab.vfb, e.V_CENTERS):
                    for iy, wy in e._interp_axis(look[1], e.Y_CENTERS):
                        ref += wv * wy * tab.V[(b, k)][(iv, iy)]
                bad += tab.value(b, k, look) != ref
    return bad


def check_sit_game(cs):
    """solve_sit_game against the textbook loop with the public sit_response / policy_from_costs"""
    bad = 0
    for c in cs:
        ars, s = G.from_dicts(c)
        tab = e.solve_table(ars, replace(s, balls=0, strikes=0, last=None))
        ks = e.sit_options(ars)
        for (b, k) in ((0, 0), (2, 1), (1, 2)):
            sc = replace(s, balls=b, strikes=k, last=None, pa_log=(), usage_this_count={}, usage_by_call={})
            temp = e.temperature(ars, sc)
            by = {x.name: x for x in ars}
            M = {a: {kk: e.cost08(by[a[0]], a[1], replace(sc, look=tab.h0), ars, tab, tab.h0, ("pure",) + kk)[0]
                     for kk in ks} for a in e.allowed_calls(ars, sc)}
            got = e.solve_sit_game(M, ks, sc, temp, sc.b_h)
            phi = lambda sg: e.policy_from_costs({a: sum(sg[kk] * M[a][kk] for kk in ks) for a in M}, sc, temp, None)
            sg = {kk: 1.0 / len(ks) for kk in ks}
            w, last, ref = 0.3, None, None
            for _ in range(e.QRE_ITERS):
                pi = phi(sg)
                f = e.sit_response(M, ks, pi, temp, sc.b_h)
                res = max(abs(sg[kk] - f[kk]) for kk in ks)
                if res < e.QRE_TOL:
                    ref = (pi, sg, res)
                    break
                if last is not None and res > last:
                    w = max(e.QRE_WMIN, w / 2)
                last = res
                sg = {kk: (1 - w) * sg[kk] + w * f[kk] for kk in ks}
            if ref is None:
                pi = phi(sg)
                f = e.sit_response(M, ks, pi, temp, sc.b_h)
                ref = (pi, sg, max(abs(sg[kk] - f[kk]) for kk in ks))
            bad += repr(got) != repr(ref)
    return bad


def main():
    cs = [c for c in golden(500) if c["full"]][:3]
    fails = 0
    for lv in LEVELS:
        n = check_outcome_and_cost(lv, cs[:2])
        print(f"{lv:<11} outcome_probs / cost08 cached == uncached: {'ok' if not n else f'{n} differ'}")
        fails += n
    n = check_value(cs)
    print(f"Table.value cached weights == bilinear sum: {'ok' if not n else f'{n} differ'}")
    fails += n
    n = check_sit_game(cs)
    print(f"solve_sit_game == reference loop: {'ok' if not n else f'{n} differ'}")
    fails += n
    print("PASS" if not fails else f"FAIL ({fails})")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
