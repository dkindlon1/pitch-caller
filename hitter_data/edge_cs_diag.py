"""v1.3 full data, addendum ruling 5: diagnose the edge called-strike gap (engine about .32 vs real .630). REPORT ONLY:
no zone, count or offset number is changed; zone numbers are Drew's to rule on.

  1. Where .630 comes from: Single-A 2025 Statcast (the harness_truth season), the engine's own band geometry
     (zone_defs.bands_from_location: edge = 67% to 133% of the half-zone, half-width 10 in. with the ball), called
     strikes over takes. Split into the inner half of the band (inside the rulebook box, 67-100%) and the outer half
     (100-133%, a ball by the rule), and by count.
  2. Which piece drives the engine's number: the engine's edge called strike is
         C = sig(logit(C0["edge"]) + A["cs"] + kappa[count] + ump_u + ct["cstrike"] + pt["cstrike"] + z_cs)
     (engine.outcome_probs). Each piece is reported at D1 settings, and the band rate is recomputed in the harness
     (harness_truth.model_cells, h3 landing) with one piece at a time set to neutral.
  3. What fixing it would change: the rate each variant gives on edge and off (A["cs"] also scales the off band), and
     the count-only log loss (the harness can't see zone shape) vs the zone-conditional one (it can).

    python -m hitter_data.edge_cs_diag      # writes {DATA}/fits/edge_cs_diag.json and .md; variants run in subprocesses
"""
import json, math, os, subprocess, sys

import numpy as np

from . import DATA, assert_not_heldout
from .harness_adapters import CI, COUNTS, ROOT

OUT = os.path.join(DATA, "fits")
SEASON = 2025


def logit(p):
    return math.log(p / (1 - p))


def real_edge(season=SEASON):
    """Single-A edge-band takes and called strikes, inner / outer half, by count (raw Statcast rows)."""
    from .zone_defs import CALLED, DROP, IN_PLAY, SWING, ZONE_HALF_W_IN
    from .zone_load import day_files, read_day
    season = assert_not_heldout(season)
    tot = {}
    for f in day_files("A", season):
        d = read_day(f)
        desc = d["description"].astype(str)
        bunt = d["des"].astype(str).str.contains("bunt", case=False, na=False) & desc.isin(IN_PLAY)
        keep = (~desc.isin(DROP) & ~bunt & d["plate_x"].notna() & d["plate_z"].notna() & d["balls"].between(0, 3)
                & d["strikes"].between(0, 2) & d["pitch_type"].notna())
        d = d[keep]
        desc = d["description"].astype(str)
        top, bot = d["sz_top"].astype(float), d["sz_bot"].astype(float)
        bad = top.isna() | bot.isna() | (top - bot < 1.0) | (top - bot > 3.0)
        top, bot = top.where(~bad, 3.4), bot.where(~bad, 1.6)
        u = np.abs(d["plate_x"].astype(float).values) / (ZONE_HALF_W_IN / 12.0)
        v = (d["plate_z"].astype(float).values - 0.5 * (top.values + bot.values)) / (0.5 * (top.values - bot.values))
        m = np.maximum(u, np.abs(v))
        take = ~desc.isin(SWING).values
        cs = desc.isin(CALLED).values
        for part, sel in (("inner", (m >= 0.67) & (m < 1.0)), ("outer", (m >= 1.0) & (m < 1.33)),
                          ("heart", m < 0.67), ("off", (m >= 1.33) & (m < 2.0))):
            for b, k in COUNTS:
                s = sel & take & (d["balls"].values == b) & (d["strikes"].values == k)
                key = (part, f"{b}-{k}")
                t = tot.setdefault(key, [0, 0, 0])
                t[0] += int(s.sum())
                t[1] += int((s & cs).sum())
                t[2] += int((sel & (d["balls"].values == b) & (d["strikes"].values == k)).sum())
    out = {}
    for part in ("heart", "inner", "outer", "off"):
        takes = sum(tot[(part, c)][0] for c in [f"{b}-{k}" for b, k in COUNTS])
        css = sum(tot[(part, c)][1] for c in [f"{b}-{k}" for b, k in COUNTS])
        out[part] = dict(takes=takes, cs=css, cs_per_take=css / takes,
                         by_count={c: tot[(part, c)][1] / max(tot[(part, c)][0], 1) for c in [f"{b}-{k}" for b, k in COUNTS]})
    e_t = out["inner"]["takes"] + out["outer"]["takes"]
    out["edge"] = dict(takes=e_t, cs_per_take=(out["inner"]["cs"] + out["outer"]["cs"]) / e_t,
                       inner_share_of_takes=out["inner"]["takes"] / e_t)
    return out


def engine_pieces():
    """The logit pieces of the engine's edge called strike at D1 (this process: the tree's defaults)."""
    import engine as e
    lv = "college_d1"
    A = e.OUTCOME_ADJ[lv]
    ct = e._CT[lv]
    kap = {f"{b}-{k}": ct["cstrike"][f"{b}-{k}"] for b, k in COUNTS}
    return dict(table_versions=dict(e.TABLE_VERSIONS), C0_edge=e.C0["edge"], logit_C0_edge=logit(e.C0["edge"]),
                C0_off=e.C0["off"], A_cs=A["cs"], kappa_by_count=kap, kappa_mean=float(np.mean(list(kap.values()))))


VARIANT_CODE = r'''
import json, sys, numpy as np
import engine as e
from hitter_data import harness_truth as T
v = sys.argv[1]
lv = "college_d1"
if v == "A_cs_0":
    for L in e.OUTCOME_ADJ.values(): L["cs"] = 0.0
elif v == "kappa_0":
    for c in e._CT[lv]["cstrike"]: e._CT[lv]["cstrike"][c] = 0.0
elif v == "A_cs_0_kappa_0":
    for L in e.OUTCOME_ADJ.values(): L["cs"] = 0.0
    for c in e._CT[lv]["cstrike"]: e._CT[lv]["cstrike"][c] = 0.0
e._CNT.clear(); e._GBV.clear()
y = T.real_cells(2025)
P, W = T.model_cells()
out = {}
for zi, z in enumerate(("heart", "edge", "off", "noncomp")):
    yy = y[:, :, zi].reshape(-1, 5); n = yy.sum(1)
    q = (P[:, :, zi].reshape(-1, 5) * n[:, None]).sum(0) / n.sum()
    out[z] = dict(swing=float(q[2:].sum()), cs_per_take=float(q[1] / q[:2].sum()))
ok = W > 0
yc = y.sum(axis=(1, 2)); marg = (P * W[..., None]).sum(axis=(1, 2)) / W.sum(axis=(1, 2))[:, None]
out["ll_count_only"] = T.ll(yc, marg)
out["ll_zone_conditional"] = T.ll(y[ok], P[ok])
print("VARIANT " + json.dumps(out))
'''


def variant(name, env_extra=None):
    env = dict(os.environ, PYTHONUTF8="1", **(env_extra or {}))
    p = subprocess.run([sys.executable, "-c", VARIANT_CODE, name], cwd=ROOT, env=env, capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(p.stderr[-3000:])
    return json.loads([l for l in p.stdout.splitlines() if l.startswith("VARIANT ")][-1][8:])


def main():
    res = {"season": SEASON, "real": real_edge(), "pieces": engine_pieces(), "variants": {}}
    for name, env in (("as_built", None), ("A_cs_0", None), ("kappa_0", None), ("A_cs_0_kappa_0", None),
                      ("zone_v13refit", {"PITCH_ZONE_TABLE": "v13refit"}),
                      ("refit_engine (zone + count v13refit)", {"PITCH_ZONE_TABLE": "v13refit", "PITCH_COUNT_TABLE": "v13refit"})):
        res["variants"][name] = variant(name.split(" ")[0] if not env else "as_built", env)
        print(name, json.dumps(res["variants"][name]), flush=True)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "edge_cs_diag.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, indent=1)
    r, pc = res["real"], res["pieces"]
    L = ["# Edge called-strike diagnosis (report only)", "",
         f"Real (Single-A {SEASON}, engine band geometry): edge cs/take {r['edge']['cs_per_take']:.3f} "
         f"({r['edge']['takes']:,} takes; inner half {r['inner']['cs_per_take']:.3f}, outer half {r['outer']['cs_per_take']:.3f}, "
         f"inner share of edge takes {r['edge']['inner_share_of_takes']:.2f}); heart {r['heart']['cs_per_take']:.3f}; "
         f"off {r['off']['cs_per_take']:.3f}.", "",
         f"Engine pieces at D1: C0[edge] {pc['C0_edge']:.2f} (logit {pc['logit_C0_edge']:+.3f}), A[cs] {pc['A_cs']:+.3f}, "
         f"count kappa mean {pc['kappa_mean']:+.3f} (by count {json.dumps({k: round(v, 3) for k, v in pc['kappa_by_count'].items()})}).", "",
         "| variant | edge cs/take | off cs/take | heart swing | edge swing | log loss count only | zone-conditional |",
         "|---|---|---|---|---|---|---|"]
    for nm, v in res["variants"].items():
        L.append(f"| {nm} | {v['edge']['cs_per_take']:.3f} | {v['off']['cs_per_take']:.3f} | {v['heart']['swing']:.3f} | "
                 f"{v['edge']['swing']:.3f} | {v['ll_count_only']:.4f} | {v['ll_zone_conditional']:.4f} |")
    with open(os.path.join(OUT, "edge_cs_diag.md"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
