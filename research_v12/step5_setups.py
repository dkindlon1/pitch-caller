"""v1.2 Step 5 (plan 2.7, L7): resize S2 / S4 / S5 after the location model, S4 already narrowed (a fastball away for a
strike, payoff 8+ mph slower). For each rule, on its fire row in readthrough/scenarios_v11.json: the payoff's share with
the rule at 0 (everything else stays on), then the smallest size on the grid that lifts it 5+ points with the fire row
and the no-fire row passing their grades. Also S5's lean gate: the same fire row with the sinker's lean running toward
the opposite-side hitter (arm side), so its new HBP cost shows.
usage (repo root): python3 research_v12/step5_setups.py  -> results/v12/step5_setups.json (+ printed)"""
import json, os, sys
from dataclasses import replace
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path[:0] = [HERE, os.path.join(HERE, "readthrough")]
import engine as e
import scenarios as SC

GRID = [0.002, 0.003, 0.004, 0.005, 0.006, 0.008, 0.010, 0.012, 0.015, 0.02]
LIFT = 0.05
PAYOFF = {"S2": ["SL:down-away", "SL:chase"], "S4": ["CH:down-away", "CH:chase", "CB:down-away", "CB:chase"], "S5": ["SI:up-in", "SI:down-in"]}


def share(doc, row, pats, ars_edit=None):
    ars, s, ex = SC.build(doc, row)
    if ars_edit:
        ars = [ars_edit(x) for x in ars]
    dist = SC.call_dist("v09", ars, s, ex)
    return sum(pr for pr, _, kind, q in dist if any(SC.matches(x, kind, q) for x in pats))


def main():
    doc = json.loads(open(os.path.join(HERE, "readthrough", "scenarios_v11.json")).read())
    rows = {r["id"]: r for r in doc["rows"]}
    saved = dict(e.SETUP_RULE)
    out = {"grid": GRID, "lift": LIFT, "start": {k: saved[k] for k in PAYOFF}, "rules": {}}
    for rule, pats in PAYOFF.items():
        fr, nr = rows[rule + "f"], rows[rule + "n"]
        e.SETUP_RULE.update(saved); e.SETUP_RULE[rule] = 0.0
        base = share(doc, fr, pats)
        tried, pick = [], None
        for v in GRID:
            e.SETUP_RULE[rule] = v
            sh = share(doc, fr, pats)
            g_f = SC.grade(dict(doc, rows=[fr]), dict(fr, floor=None, ceiling=None), "v09")
            g_n = SC.grade(dict(doc, rows=[nr]), nr, "v09")
            # the no-fire row: the rule must not move it (its payoff share with the rule on vs off)
            sh_n_on = share(doc, nr, pats); e.SETUP_RULE[rule] = 0.0; sh_n_off = share(doc, nr, pats); e.SETUP_RULE[rule] = v
            tried.append(dict(size=v, share=round(sh, 4), moved=round(sh - base, 4), fire_row=g_f["passed"], nofire_row=g_n["passed"],
                              nofire_moved=round(sh_n_on - sh_n_off, 4)))
            print(f"  {rule} {v:.3f}: payoff {sh:.1%} (base {base:.1%}, {sh - base:+.1%}); fire row {'pass' if g_f['passed'] else 'FAIL'}; "
                  f"no-fire row {'pass' if g_n['passed'] else 'FAIL'} (payoff moved {sh_n_on - sh_n_off:+.1%})", flush=True)
            if sh - base >= LIFT - 1e-9 and g_f["passed"] and g_n["passed"] and abs(sh_n_on - sh_n_off) < 1e-9:
                pick = v
                break
        out["rules"][rule] = dict(base=round(base, 4), size=pick, tried=tried,
                                  note=None if pick else f"no size up to {GRID[-1]} lifts the payoff {LIFT:.0%} with both rows passing")
        print(f"{rule}: size {pick} (base {base:.1%})", flush=True)
    e.SETUP_RULE.update(saved)
    # S5's lean gate: the sinker leaning arm side (toward an opposite-side hitter's front hip) pays the HBP cost
    s5 = out["rules"]["S5"]
    if s5["size"]:
        e.SETUP_RULE["S5"] = s5["size"]
    fr = rows["S5f"]
    # a righty's arm side runs away from a lefty hitter, so a lean toward an opposite-side hitter is glove side (lean_x < 0)
    lean = lambda v: (lambda x: replace(x, lean_x=v) if x.kind == "SI" else x)
    sh0, sh_t, sh_a = share(doc, fr, PAYOFF["S5"]), share(doc, fr, PAYOFF["S5"], lean(-3.0)), share(doc, fr, PAYOFF["S5"], lean(3.0))
    out["s5_lean_gate"] = dict(sinker_in_no_lean=round(sh0, 4), lean_toward_hitter_3in=round(sh_t, 4), lean_away_3in=round(sh_a, 4))
    print(f"S5 lean gate: sinker in {sh0:.1%} with no lean, {sh_t:.1%} leaning 3 in. toward the opposite-side hitter (glove side), "
          f"{sh_a:.1%} leaning 3 in. away (arm side)")
    e.SETUP_RULE.update(saved)
    json.dump(out, open(os.path.join(HERE, "results", "v12", "step5_setups.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
