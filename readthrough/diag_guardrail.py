"""v0.9 Step 2 diagnostic (items 10 and 7): what v0.8's setup guardrail does to the mix. No engine change: the engine's
root call is swapped in memory for a copy with the guardrail varied, and v0.8 is restored afterwards.
usage (repo root): python3 readthrough/diag_guardrail.py [--out results/step2]

Variants (all v0.8 flags; only the guardrail differs):
  v08    shipped: every call must be within delta = 0.010 x run scale of the cheapest myopic cost
  d030   the same rule at 0.030 x run scale (v0.7c's never-pick pitch window)
  setup  the rule as the spec describes its purpose: it removes only setups, calls that cost more now and win on future
         value (look value C - c_my < 0); calls with no look benefit are left to the full-cost windows
  off    no guardrail (reference only)
Measures, per variant: the engine-level mix in every count and side (levels HS/D3/D1, 2/3/4-pitch starters), and the
frozen scenario suite."""
import json, os, sys
from collections import defaultdict
from dataclasses import replace
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.dirname(HERE)]
import engine as e
import baseline_reports as B
import scenarios as SC

ORIG = e.root_call


def make_root(variant):
    def root_call(arsenal, s, tab, exclude=None, look_value=True):
        by = {x.name: x for x in arsenal}
        ks = e.sit_options(arsenal)
        look = s.look or tab.h0
        temp = e.temperature(arsenal, s)
        calls = e.allowed_calls(arsenal, s, exclude) or e.allowed_calls(arsenal, s)
        sL = replace(s, look=look)
        M = {a: {kk: e.cost08(by[a[0]], a[1], sL, arsenal, tab, look, ("pure",) + kk)[0] for kk in ks} for a in calls}
        sg_tab = tab.sigma.get((s.balls, s.strikes))
        if e.FLAGS["look_state"]:
            Mmy = {a: {kk: e.cost08(by[a[0]], a[1], sL, arsenal, tab, look, ("pure",) + kk, myopic=True)[0] for kk in ks} for a in calls}
            cmy = {a: sum(sg_tab[kk] * Mmy[a][kk] for kk in ks) for a in calls}
            cfull = {a: sum(sg_tab[kk] * M[a][kk] for kk in ks) for a in calls}
            best = min(cmy.values())
            scale = e.run_scale(s.level)
            if variant == "v08":
                keep = [a for a in calls if cmy[a] - best <= 0.010 * scale]
            elif variant == "d030":
                keep = [a for a in calls if cmy[a] - best <= 0.030 * scale]
            elif variant == "setup":
                keep = [a for a in calls if cmy[a] - best <= 0.010 * scale or cfull[a] >= cmy[a] - 1e-12]
            else:
                keep = list(calls)
            if s.balls == 3 or not look_value:
                M = {a: Mmy[a] for a in keep}
            else:
                M = {a: M[a] for a in keep}
        pi, sg, res = e.solve_sit_game(M, ks, s, temp, s.b_h, s.usage_by_call)
        full = {a: sum(sg[kk] * M[a][kk] for kk in ks) for a in M}
        return pi, sg, full, res, M
    return root_call


def mix_metrics(variant):
    e.root_call = ORIG if variant == "v08" else make_root(variant)
    out = {}
    try:
        for lv in B.LEVELS:
            for st in B.STAFFS:
                G = B.grid("v08", lv, st)
                allowed = defaultdict(int)
                use = defaultdict(float)
                for v in G.values():
                    for n, g in v["gap"].items():
                        pass
                    names = {n for (n, q) in v["dist"]}
                    for n in v["kind"]:
                        allowed[n] += n in names
                    for (n, q), p in v["dist"].items():
                        use[v["kind"][n]] += p / len(G)
                single = [v for (b, k, sd), v in G.items() if (b, k) in ((2, 0), (3, 0), (3, 1)) and max(v["dist"].values()) > 0.999]
                hc = [v for (b, k, sd), v in G.items() if (b, k) in ((2, 0), (3, 0), (3, 1))]
                two = [v for (b, k, sd), v in G.items() if k == 2 and b < 2]
                chase2 = sum(p for v in two for (n, q), p in v["dist"].items() if q == "chase") / len(two)
                pl = B.platoon(G)
                out[f"{lv}|{st}"] = dict(fb_share=round(use["FB"], 3), ch_share=round(use.get("CH", 0.0), 3),
                                         ch_in_mix=f"{allowed.get('Changeup', 0)}/{len(G)}" if any("Changeup" == n for n in G[(0, 0, True)]["kind"]) else "—",
                                         single_call_hitters_counts=round(len(single) / len(hc), 3), chase_0_2_1_2=round(chase2, 3),
                                         ch_opp_vs_same=pl.get("changeup_share"))
    finally:
        e.root_call = ORIG
    return out


def scenario_metrics(variant):
    e.root_call = ORIG if variant == "v08" else make_root(variant)
    try:
        doc, _ = SC.load()
        res = SC.run("v08", doc)
    finally:
        e.root_call = ORIG
    return res


def main():
    outdir = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else os.path.join(os.path.dirname(HERE), "results", "step2")
    os.makedirs(outdir, exist_ok=True)
    allres = {}
    base_sc = None
    for var in ("v08", "d030", "setup", "off"):
        mm = mix_metrics(var)
        sc = scenario_metrics(var)
        if var == "v08":
            base_sc = {r["id"]: r for r in sc}
        passed = sum(r["passed"] for r in sc)
        hard = [r["id"] for r in sc if r["hard"] and r["shares"]["not"] > 0]
        notf = [r["id"] for r in sc if any(f.startswith("not") for f in r["fails"])]
        fixed = [r["id"] for r in sc if r["passed"] and not base_sc[r["id"]]["passed"]]
        broke = [r["id"] for r in sc if not r["passed"] and base_sc[r["id"]]["passed"]]
        allres[var] = dict(mix=mm, scenarios=dict(passed=passed, hard_rule_rows_with_not=hard, not_acceptable_fails=notf,
                                                  fixed_vs_v08=fixed, broke_vs_v08=broke,
                                                  rows={r["id"]: r for r in sc}))
        avg = lambda k: sum(v[k] for v in mm.values()) / len(mm)
        print(f"== {var}: scenarios {passed}/64 (fixed {fixed}, broke {broke}); hard-rule rows with a Not call {hard or 'none'}; "
              f"Not-acceptable fails {notf}")
        print(f"   mix (avg over 9 setups): FB {avg('fb_share'):.0%}, CH {avg('ch_share'):.1%}, single call in 2-0/3-0/3-1 "
              f"{avg('single_call_hitters_counts'):.0%}, chase in 0-2/1-2 {avg('chase_0_2_1_2'):.1%}")
        for k, v in mm.items():
            if "default" in k:
                print(f"     {k}: CH in mix {v['ch_in_mix']} cells, CH {v['ch_share']:.1%}, FB {v['fb_share']:.0%}, CH opp/same {v['ch_opp_vs_same']}")
    json.dump(allres, open(os.path.join(outdir, "guardrail_diag.json"), "w"), indent=1)
    print("wrote", os.path.join(outdir, "guardrail_diag.json"))


if __name__ == "__main__":
    main()
