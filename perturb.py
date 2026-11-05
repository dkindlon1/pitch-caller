"""v0.8 section 6.6: uncertainty floor on the call temperature.
For 30 draws of the model's hand-set numbers (logit noise SD 0.25 on S0, C0, W0, F0, the hard-contact baselines and
KIND_W; x U(0.5, 1.5) on every v0.8 weight), measure the gap between the top two calls at each count, for three
reference arsenals and three levels (bases empty, no outs). T_unc = 0.5 * SD of that gap.
usage: python3 perturb.py v07|v08 [draws]   -> writes T_unc into sim_constants.json (v08) and prints a summary."""
import json, os, random, sys, copy
import engine as e
from metrics import ref_arsenals, LEVELS

BETAS = ["sit_tW", "sit_hW", "sit_tH", "sit_hH", "sit_tS", "sit_hS", "beta_T", "gamma_T", "beta_E", "beta_E_S", "beta_tun",
         "phi_FB", "phi_OS", "crowd", "g_c", "g_w", "g_d"]


def draw(rng, base):
    for n in ("S0", "C0", "W0", "F0"):
        setattr(e, n, {z: (e.sig(e.logit(v) + rng.gauss(0, 0.25)) if 0 < v < 1 else v) for z, v in base[n].items()})
    q = {}
    for z, (w, s_, h) in base["Q0"].items():
        h2 = e.sig(e.logit(h) + rng.gauss(0, 0.25)); sc = (1 - h2) / (w + s_); q[z] = (w * sc, s_ * sc, h2)
    e.Q0 = q
    e.KIND_W = {k: v + rng.gauss(0, 0.25) for k, v in base["KIND_W"].items()}
    for b in BETAS:
        e.P08[b] = base["P08"][b] * rng.uniform(0.5, 1.5)


def restore(base):
    for n in ("S0", "C0", "W0", "F0", "Q0", "KIND_W"):
        setattr(e, n, base[n])
    e.P08.clear(); e.P08.update(base["P08"])


def gaps_for(ars, lvl):
    s0 = e.Situation(0, 0, 0, (False, False, False), level=lvl)
    if e.FLAGS["look_state"]:       # v0.8: the planning table, then each count's root costs (temperature floor off)
        with e.flags(temp_unc=False):
            tab = e.solve_table(ars, s0)
            out = {}
            for (b, k) in e.COUNTS:
                c = sorted(e.root_costs(ars, e.Situation(b, k, 0, (False, False, False), level=lvl), tab).values())
                out[f"{b}-{k}"] = c[1] - c[0] if len(c) > 1 else 0.0
        return out
    cv = e.at_bat_values(ars, s0)[1] if not e.FLAGS["look_state"] else None
    out = {}
    for (b, k) in e.COUNTS:
        c = sorted(e.call_costs(ars, e.Situation(b, k, 0, (False, False, False), level=lvl), cv=cv).values())
        out[f"{b}-{k}"] = c[1] - c[0] if len(c) > 1 else 0.0
    return out


def main():
    mode = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    e.set_flags(**(e.FLAGS_V08 if mode == "v08" else e.FLAGS_V07))
    base = {k: copy.deepcopy(getattr(e, k)) for k in ("S0", "C0", "W0", "F0", "Q0", "KIND_W", "P08")}
    rng = random.Random(606)
    samples = {}
    for i in range(n):
        draw(rng, base)
        for lvl in LEVELS:
            for an, ars in ref_arsenals().items():
                for c, g in gaps_for(ars, lvl).items():
                    samples.setdefault((lvl, an, c), []).append(g)
        restore(base)
        print(f"draw {i + 1}/{n}", flush=True)
    t_unc = {}
    for (lvl, an, c), xs in samples.items():
        m = sum(xs) / len(xs); sd = (sum((x - m) ** 2 for x in xs) / len(xs)) ** 0.5
        t_unc.setdefault(lvl, {}).setdefault(an, {})[c] = 0.5 * sd
    t_unc["travel"] = t_unc["hs"]; t_unc["college"] = t_unc["college_d1"]; t_unc["mlb"] = t_unc["college_d1"]
    if mode == "v08":
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sim_constants.json")
        cons = json.load(open(path)) if os.path.exists(path) else {}
        cons["T_unc"] = t_unc
        json.dump(cons, open(path, "w"), indent=1)
    allv = [v for l in ("hs", "college_d3", "college_d1") for a in t_unc[l].values() for v in a.values()]
    print(f"{mode}: T_unc over {len(allv)} cells: mean {sum(allv)/len(allv):.4f}, max {max(allv):.4f}")
    json.dump(t_unc, open(f"results/t_unc_{mode}.json", "w"), indent=1)


if __name__ == "__main__":
    main()
