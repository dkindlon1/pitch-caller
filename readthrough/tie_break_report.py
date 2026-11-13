"""v1.1 Step 3 (plan 2.4): the tie-break report. On the predictability grid (grid_v10 arsenals, hs / D3 / D1, bases empty /
R1 / R3, every count): how often the tie-break moves probability, how much, and the hitter's best-response gain against the
shifted mix (it should be within the solver's own noise, INTENT_E x run scale).
usage (repo root): python3 readthrough/tie_break_report.py   -> results/v11/tie_break_report.json"""
import json, os, sys
from dataclasses import replace
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import engine as e
import grid_v10 as G


def br(pi, M):
    """the hitter's best response value against the pitcher's mix pi: max over his sit options of the expected cost"""
    ks = next(iter(M.values())).keys()
    return max(sum(pi.get(a, 0.0) * M[a][k] for a in M) for k in ks)


def main():
    out, fired, moved, gains, n = [], 0, [], [], 0
    for lvl in G.LEVELS:
        for an, ars in G.ARSENALS.items():
            for bn, bs in G.BASES.items():
                s0 = e.Situation(0, 0, 1, bs, inning=3, margin=0, level=lvl)
                tab = e.solve_table(ars, s0)
                for (b, k) in G.COUNTS:
                    s = replace(s0, balls=b, strikes=k)
                    pi, sg, full, res, M = e.root_call(ars, s, tab)
                    tb = e.tie_break
                    e.tie_break = lambda p_, *a, **kw: p_
                    try:
                        pi0 = e.root_call(ars, s, tab)[0]
                    finally:
                        e.tie_break = tb
                    n += 1
                    mv = 0.5 * sum(abs(pi.get(a, 0) - pi0.get(a, 0)) for a in set(pi) | set(pi0))
                    if mv > 1e-9:
                        fired += 1
                        moved.append(mv)
                        g = br(pi, M) - br(pi0, M)
                        gains.append(g)
                        out.append(dict(cell=f"{lvl}|{an}|{bn}|{b}-{k}", moved=round(mv, 4), br_gain=g,
                                        eps=e.INTENT_E * e.run_scale(lvl)))
    rep = dict(cells=n, fired=fired, fire_rate=fired / n, mean_moved=(sum(moved) / len(moved)) if moved else 0.0,
               max_moved=max(moved) if moved else 0.0, max_br_gain=max(gains) if gains else 0.0,
               eps_by_level={l: e.INTENT_E * e.run_scale(l) for l in G.LEVELS}, cells_fired=out)
    json.dump(rep, open(os.path.join(HERE, "results", "v11", "tie_break_report.json"), "w"), indent=1)
    print(f"tie-break: fires in {fired} of {n} grid cells ({fired / n:.0%}); moves {rep['mean_moved']:.1%} on average when it "
          f"fires, at most {rep['max_moved']:.1%}; hitter's best-response gain at most {rep['max_br_gain']:.2e} runs "
          f"(noise margin {min(rep['eps_by_level'].values()):.2e} to {max(rep['eps_by_level'].values()):.2e})")


if __name__ == "__main__":
    main()
