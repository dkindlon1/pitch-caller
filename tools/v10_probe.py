"""v1.0 Phase 0.6: re-measure the root causes in PLAN_v1.0.md section 0 on the shipped engine.
  python3 tools/v10_probe.py            -> prints the numbers (and writes results/v10_probe_<tag>.json with --tag)
R2 cost range across the hitter's sits; R3 HBP per pitch inside vs away; R5 wild-pitch chance with runners on;
R6 in-play values for up vs down targets. Read-only: it calls the engine, changes nothing."""
import json, os, sys
from dataclasses import replace

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import engine as e

P = e.Pitch
# the Nov 6 sweep's three-pitch arsenal (PLAN_v1.0.md appendix)
ARS = lambda: [P("Fastball", "FB", grade=3, command=3, conf=0.80, shape="ride", velo=88),
               P("Slider", "SL", grade=4, command=3, conf=0.80, shape="tight", velo=80),
               P("Changeup", "CH", grade=3, command=3, conf=0.70, shape="fade", velo=80)]
LEVEL = "college_d3"
EMPTY, ON1 = (False, False, False), (True, False, False)


def sit0(bases=EMPTY, outs=0, same=True, level=LEVEL):
    return e.Situation(balls=0, strikes=0, outs=outs, bases=bases, inning=4, level=level, same_side=same)


def table(ars, s):
    return e.solve_table(ars, replace(s, balls=0, strikes=0, last=None))


def r2(out):
    """Cost of each call across every pure sit at 2-0, 1-1 and 0-2 (D3, three pitches, bases empty, 0 outs)."""
    ars = arsenal = ARS()
    by = {x.name: x for x in ars}
    res = {}
    for same in (True, False):
        s = sit0(same=same)
        tab = table(ars, s)
        ks = e.sit_options(ars)
        for (b, k) in ((2, 0), (1, 1), (0, 2)):
            sc = replace(s, balls=b, strikes=k, look=tab.h0)
            rows = {}
            for a in e.allowed_calls(ars, sc):
                cs, hard = {}, {}
                for kk in ks:
                    c, Pr = e.cost08(by[a[0]], a[1], sc, arsenal, tab, tab.h0, ("pure",) + kk)
                    cs[kk], hard[kk] = c, Pr["hard"]
                rows[a] = (max(cs.values()) - min(cs.values()), hard)
            fbm = rows[("Fastball", "middle")]
            ranges = sorted(v[0] for v in rows.values())
            key = f"{'same' if same else 'opp'} {b}-{k}"
            ipv = e._ipv_cached(tab, by["Fastball"], "middle", sc)
            res[key] = dict(fb_middle_range=fbm[0],
                            fb_middle_hard_sitFB=fbm[1][("Fastball", "middle")],
                            fb_middle_hard_sitSL=fbm[1][("Slider", "middle")],
                            median_range_all_calls=ranges[len(ranges) // 2], max_range_all_calls=ranges[-1],
                            ipv_hard_fb_middle=ipv[2], V_count=tab.value(b, k, tab.h0), run_scale=e.run_scale(LEVEL),
                            base=e.v_end(sc, sc.outs, sc.bases, 0))
    out["R2"] = res


def r3(out):
    """HBP chance per pitch for inside vs away fastballs at D3 (the table's sit mix, bases empty, 0 outs)."""
    ars = ARS()
    by = {x.name: x for x in ars}
    res = {"hbp_scale": e.OUTCOME_ADJ[LEVEL]["hbp"], "HBP_LOC": dict(e.HBP_LOC)}
    for same in (True, False):
        s = sit0(same=same)
        tab = table(ars, s)
        for (b, k) in ((0, 0), (1, 1), (2, 0), (0, 2)):
            sc = replace(s, balls=b, strikes=k, look=tab.h0)
            sg = tab.sigma[(b, k)]
            row = {}
            for q in ("up-in", "down-in", "up-away", "down-away", "middle"):
                row[q] = e.cost08(by["Fastball"], q, sc, ars, tab, tab.h0, ("mix", sg))[1]["hbp"]
            row["inside_mean"] = (row["up-in"] + row["down-in"]) / 2
            row["away_mean"] = (row["up-away"] + row["down-away"]) / 2
            row["ratio"] = row["inside_mean"] / row["away_mean"]
            res[f"{'same' if same else 'opp'} {b}-{k}"] = row
    out["R3"] = res


def r5(out):
    """Wild-pitch chance per pitch with a runner on 1st (D3), off-speed vs fastball, averaged over allowed targets."""
    ars = ARS()
    by = {x.name: x for x in ars}
    res = {"constants": {"offspeed": 0.12, "fastball": 0.04}}
    for same in (True, False):
        s = sit0(bases=ON1, same=same)
        tab = table(ars, s)
        for (b, k) in ((0, 0), (1, 1), (0, 2), (1, 2)):
            sc = replace(s, balls=b, strikes=k, look=tab.h0)
            sg = tab.sigma[(b, k)]
            row = {}
            for n in by:
                wps = {q: e.cost08(by[n], q, sc, ars, tab, tab.h0, ("mix", sg))[1]["wp_ball"] for q in e.targets(b, k)}
                row[n] = dict(mean=sum(wps.values()) / len(wps), chase=wps.get("chase"),
                              down_away=wps["down-away"], up_away=wps["up-away"])
            os_ = [row[n]["mean"] for n in by if by[n].kind != "FB"]
            row["os_mean"] = sum(os_) / len(os_)
            row["fb_mean"] = row["Fastball"]["mean"]
            row["os_to_fb"] = row["os_mean"] / row["fb_mean"]
            res[f"{'same' if same else 'opp'} {b}-{k}"] = row
    out["R5"] = res


def r6(out):
    """In-play value (runs, higher = worse for the pitcher) of weak/solid/hard contact, up vs down targets."""
    ars = ARS()
    res = {}
    for label, bases in (("empty", EMPTY), ("on1", ON1)):
        for outs in (0, 1):
            s = replace(sit0(bases=bases, outs=outs), balls=1, strikes=1)
            for p in ars:
                row = {}
                for q in ("up-away", "down-away", "up-in", "down-in"):
                    row[q] = {c: e.in_play_value_typed(c, p, q, s) for c in ("weak", "solid", "hard")}
                    row[q]["GB_share_weak"] = e.type_mix(p, q, "weak")["GB"]
                row["down_minus_up_away"] = {c: row["down-away"][c] - row["up-away"][c] for c in ("weak", "solid", "hard")}
                res[f"{label} {outs} out {p.name}"] = row
    out["R6"] = res


def main():
    tag = sys.argv[sys.argv.index("--tag") + 1] if "--tag" in sys.argv else None
    out = {}
    r2(out); r3(out); r5(out); r6(out)
    f = lambda x: f"{x:.4f}"
    print("R2 cost range across sits (runs), D3 slider_best, bases empty 0 out:")
    for k, v in out["R2"].items():
        print(f"  {k}: FB middle range {f(v['fb_middle_range'])} | hard sit FB {v['fb_middle_hard_sitFB']:.3f} vs sit SL "
              f"{v['fb_middle_hard_sitSL']:.3f} | all calls median {f(v['median_range_all_calls'])} max "
              f"{f(v['max_range_all_calls'])} | net of base-out value: hard contact {f(v['ipv_hard_fb_middle'] - v['base'])} "
              f"vs the count {f(v['V_count'] - v['base'])}")
    print(f"R3 HBP per FB pitch, D3 (hbp scale {out['R3']['hbp_scale']}):")
    for k, v in out["R3"].items():
        if isinstance(v, dict) and "ratio" in v:
            print(f"  {k}: inside {v['inside_mean']:.4f} away {v['away_mean']:.4f} ratio {v['ratio']:.2f} middle {v['middle']:.4f}")
    print("R5 wild-pitch chance per pitch, runner on 1st, D3 (mean over allowed targets):")
    for k, v in out["R5"].items():
        if k != "constants":
            print(f"  {k}: off-speed {v['os_mean']:.4f} fastball {v['fb_mean']:.4f} ratio {v['os_to_fb']:.2f} | "
                  f"SL chase {v['Slider']['chase'] if v['Slider']['chase'] is None else round(v['Slider']['chase'], 4)}")
    print("R6 in-play value down-away minus up-away (runs; negative = down is better for the pitcher):")
    for k, v in out["R6"].items():
        d = v["down_minus_up_away"]
        print(f"  {k}: weak {d['weak']:+.4f} solid {d['solid']:+.4f} hard {d['hard']:+.4f} | weak GB share up "
              f"{v['up-away']['GB_share_weak']:.3f} down {v['down-away']['GB_share_weak']:.3f}")
    if tag:
        os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
        path = os.path.join(ROOT, "results", f"v10_probe_{tag}.json")
        json.dump(out, open(path, "w"), indent=1, default=str)
        print("wrote", path)


if __name__ == "__main__":
    main()
