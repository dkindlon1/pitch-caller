"""v1.1 Step 3: size each setup rule on its read-through rows (plan 2.4: "the smallest round value that passes its graded
rows on top of" what the engine already gives the call). usage (repo root): python3 readthrough/setup_sizes.py

For each built rule, on its fire row in scenarios_v11.json (grades PROPOSED until Drew grades them at Step 4): the payoff's
share with the rule at 0 (everything else the engine gives the call stays on), then the smallest size on the grid that
lifts the payoff by at least LIFT (N2, a cost: lowers the sinker by at least DROP) with the fire row and the no-fire row
both passing their grades. Rules whose check intervals include 0 or point mixed (setup_checks.py) stop at the smallest
size that passes; N2 (right way on Statcast) uses the same rule. Prints the sizes and writes results/v11/step3_sizes.json;
the floors in scenarios_v11.json are then set to base + LIFT (rounded down) so the rows test what the size buys.
"""
import json, os, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path[:0] = [HERE, os.path.join(HERE, "readthrough")]
import engine as e
import scenarios as SC

GRID = [0.002, 0.004, 0.006, 0.008, 0.010, 0.012, 0.015, 0.02]
LIFT, DROP = 0.05, 0.03


def share(doc, row, pats):
    ars, s, ex = SC.build(doc, row)
    dist = SC.call_dist("v09", ars, s, ex)
    return sum(pr for pr, _, kind, q in dist if any(SC.matches(x, kind, q) for x in pats))


def main():
    doc = json.loads(open(os.path.join(HERE, "readthrough", "scenarios_v11.json")).read())
    rows = {r["id"]: r for r in doc["rows"]}
    saved = dict(e.SETUP_RULE)
    out = {}
    for rule in [k for k in e.SETUP_RULE]:
        fr, nr = rows.get(rule + "f"), rows.get(rule + "n")
        if not fr:
            continue
        pats = (fr.get("floor") or fr.get("ceiling"))[0]
        e.SETUP_RULE.update(saved); e.SETUP_RULE[rule] = 0.0
        base = share(doc, fr, pats)
        pick = None
        for v in GRID:
            e.SETUP_RULE[rule] = v
            sh = share(doc, fr, pats)
            moved = (sh - base) if rule != "N2" else (base - sh)
            g_f = SC.grade(dict(doc, rows=[fr]), dict(fr, floor=None, ceiling=None), "v09")
            g_n = SC.grade(dict(doc, rows=[nr]), nr, "v09") if nr else {"passed": True}
            print(f"  {rule} {v:.3f}: payoff {sh:.1%} (base {base:.1%}, moved {moved:+.1%}); fire row grades "
                  f"{'pass' if g_f['passed'] else 'FAIL ' + '; '.join(g_f['fails'])}; no-fire row "
                  f"{'pass' if g_n['passed'] else 'FAIL'}", flush=True)
            if moved >= (LIFT if rule != "N2" else DROP) - 1e-9 and g_f["passed"] and g_n["passed"]:
                pick = v
                out[rule] = dict(size=v, base=round(base, 4), share=round(sh, 4), moved=round(moved, 4))
                break
        if pick is None:
            out[rule] = dict(size=None, base=round(base, 4), note="no grid size lifts the payoff enough with both rows passing")
        print(f"{rule}: {out[rule]}", flush=True)
    e.SETUP_RULE.update(saved)
    json.dump(out, open(os.path.join(HERE, "results", "v11", "step3_sizes.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
