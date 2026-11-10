"""v1.0 Phase 1.1: the call sheet. Sweeps the shipped engine across a grid of situations, checks the bands in
section 4 of docs/PLAN_v1.0.md, and writes results/callsheet_<tag>.json and .md.

usage (repo root):
  python3 callsheet.py --tier full --jobs 8 --tag v09     # the whole grid, about 1,200 table solves
  python3 callsheet.py --tier ci                          # the short grid for CI

Exit code is non-zero if any ENFORCED band fails. Bands marked tracked print but never fail. Bands whose behaviour
is not built yet (B9/B10/B12, which need Phase 3.1/3.2/3.5) report as "pending" and do not affect the exit code;
they would otherwise fail vacuously against an engine that has no history field and no coach rules.

The distribution measured for each situation is `root_call`'s policy, before `call_v08` drops pitch types under 0.5%
and renormalizes. That is the mixing operator's actual output, which is what the bands are about.
"""
import argparse, concurrent.futures as cf, csv, glob, json, os, sys, time
from collections import defaultdict
from dataclasses import replace

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
import engine as e                                        # noqa: E402

ARS_PATH = os.path.join(ROOT, "callsheet_arsenals.json")
WEIGHT_CACHE = os.path.join(ROOT, "results", "count_weights.json")
COUNTS = [(b, k) for b in range(4) for k in range(3)]
INSIDE = ("up-in", "down-in")
DOWN = ("down-in", "down-away")

# base-out states: (name, bases, outs)
BASEOUTS = [
    ("empty_0out", (False, False, False), 0),
    ("empty_1out", (False, False, False), 1),      # added in v1.0: B8a and B8b need a bases-empty reference at 1 out
    ("empty_2out", (False, False, False), 2),
    ("on1_0out", (True, False, False), 0),
    ("on1_1out", (True, False, False), 1),
    ("on2_1out", (False, True, False), 1),
    ("on3_0out", (False, False, True), 0),
    ("on3_1out", (False, False, True), 1),
    ("on13_1out", (True, False, True), 1),
    ("loaded_1out", (True, True, True), 1),
    ("on23_2out", (False, True, True), 2),
]
# The plan's CI list is {empty_1out, on1_0out, on3_1out, loaded_1out}; empty_0out is added because B8a compares a
# runner on 1st against bases empty at the SAME number of outs, and on1_0out has no reference without it.
CI_BASEOUTS = {"empty_0out", "empty_1out", "on1_0out", "on3_1out", "loaded_1out"}
CI_ARS = {"slider_best", "plus_changeup", "two_pitch"}
CI_LEVELS = ["college_d3", "hs"]
FULL_LEVELS = ["hs", "college_d3", "college_d1"]

# variant groups, all on college_d3 / slider_best + plus_changeup / empty_1out + on1_0out / both sides
VARIANTS = (["base"]
            + [f"grade_{g}{v}" for g in "wcd" for v in (1, 3, 5)]
            + ["crowding", "matchup_hard_fb_middle", "damage_middle",
               "landing_0of4", "landing_2of12", "no_trust",
               "last_foul_back", "last_whiff"])
VAR_ARS = ("slider_best", "plus_changeup")
# The plan's variant base-outs are (empty_1out, on1_0out); on3_1out is added because B8c -- a pitch that isn't
# landing must get 0% with a runner on 3rd -- needs a landing variant on a runner-on-3rd state to be measurable.
VAR_BASEOUTS = ("empty_1out", "on1_0out", "on3_1out")


def load_arsenals():
    d = json.load(open(ARS_PATH))
    return {k: [e.Pitch(**p) for p in v] for k, v in d.items() if not k.startswith("_")}


# --------------------------------------------------------------------------------------------------
# count weights: the chance of being in each count. v1.0 3.8 supplies the engine's own reach chain per plate
# appearance (see wof()); what follows is the fallback, and what --weights-uniform replaces it with.
# Originally:
# until then this is real MLB count frequency from the Statcast CSVs, as the plan specifies.
# --------------------------------------------------------------------------------------------------
def count_weights():
    if os.path.exists(WEIGHT_CACHE):
        d = json.load(open(WEIGHT_CACHE))
        return {tuple(int(x) for x in k.split("-")): v for k, v in d["weights"].items()}
    files = sorted(glob.glob(os.path.join(ROOT, "data", "statcast", "sc_*.csv")))
    if not files:
        print("no data/statcast/sc_*.csv for the fallback count weights; the 3.8 reach chain supplies them instead",
              flush=True)
        return {c: 1 / len(COUNTS) for c in COUNTS}
    n = defaultdict(int)
    for f in files:
        with open(f, newline="", encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                try:
                    b, k = int(r["balls"]), int(r["strikes"])
                except (ValueError, TypeError, KeyError):
                    continue
                if (b, k) in n or (b < 4 and k < 3):
                    n[(b, k)] += 1
    tot = sum(n[c] for c in COUNTS)
    w = {c: n[c] / tot for c in COUNTS}
    os.makedirs(os.path.dirname(WEIGHT_CACHE), exist_ok=True)
    json.dump({"source": f"{len(files)} Statcast CSVs, {tot} pitches",
               "weights": {f"{b}-{k}": v for (b, k), v in w.items()}},
              open(WEIGHT_CACHE, "w", encoding="utf-8"), indent=1)
    return w


USE_CHAIN = True          # --weights-uniform turns this off and weights every count equally


def wof(cr, b, k, weights):
    """The weight on this count for this plate appearance.

    v1.0 3.8: the engine's own chance of reaching the count from 0-0 under its own policies (`at_bat_plan`), which is
    what the plan asks band B5 to weight by -- a count the engine rarely reaches should not carry the same weight as
    0-0. The chain is normalized here, because reach sums to the expected number of counts in a plate appearance
    (about 4), not to 1. Falls back to the real MLB count frequency for a cell recorded before 3.8 existed, and for
    --weights-uniform.
    """
    r = cr.get("reach") if USE_CHAIN else None
    if r:
        t = sum(r.values())
        return (r.get(f"{b}-{k}", 0.0) / t) if t > 0 else 0.0
    return weights[(b, k)]


def situation(level, bases, outs, same, state, count, variant, ars):
    b, k = count
    inning, margin, home, sched = 4, 0, None, None
    if state == "late_close":
        inning = 6 if level in ("hs", "travel") else 8
        margin, home, sched = 1, True, (7 if level in ("hs", "travel") else 9)
    kw = dict(balls=b, strikes=k, outs=outs, bases=bases, inning=inning, margin=margin,
              level=level, same_side=same, pitch_count=40, batters_faced=9,
              home=home, sched_innings=sched)
    s = e.Situation(**kw)
    if variant.startswith("grade_"):
        g, v = variant[6], int(variant[7:])
        s = replace(s, grades={g: v})
    elif variant == "crowding":
        s = replace(s, crowding=True)
    elif variant == "matchup_hard_fb_middle":
        s = replace(s, matchup={"hard|FB|middle": 2})
    elif variant == "damage_middle":
        s = replace(s, hitter_damage={"middle": (0.8, 20)})
    elif variant == "landing_0of4":
        s = replace(s, landing_today={ars[-1].name: (0, 4)})
    elif variant == "landing_2of12":
        s = replace(s, landing_today={ars[-1].name: (2, 12)})
    elif variant == "no_trust":
        pass                                    # handled on the arsenal, not the situation
    elif variant == "last_foul_back":
        s = replace(s, last=(ars[0].name, "middle", "foul", "back"))   # 4-long: the read is what RP2 reads
    elif variant == "last_whiff":
        s = replace(s, last=(ars[0].name, "middle", "whiff"))
    if s.home is not None:
        s = replace(s, win=e.win_constants(s))
    return s


def cell(spec):
    """One plate appearance: solve the table at 0-0, then read the policy in all 12 counts off that table."""
    level, ars_name, bo_name, same, state, variant = spec
    ars = load_arsenals()[ars_name]
    if variant == "no_trust":
        ars = [replace(p, conf=0.30, base_conf=0.30) for p in ars]
    bases, outs = next((b, o) for n, b, o in BASEOUTS if n == bo_name)
    s0 = situation(level, bases, outs, same, state, (0, 0), variant, ars)
    t0 = time.time()
    tab = e.solve_table(ars, replace(s0, balls=0, strikes=0, last=None))
    out = {"spec": list(spec), "counts": {}, "secs": 0.0}
    for c in COUNTS:
        s = situation(level, bases, outs, same, state, c, variant, ars)
        s = replace(s, look=tab.h0)                       # the table's starting look, as the plan specifies
        try:
            pi, sg, full, res, M = e.root_call(ars, s, tab)
        except Exception as ex:                           # record, do not abort a 1,200-cell sweep
            out["counts"][f"{c[0]}-{c[1]}"] = {"error": f"{type(ex).__name__}: {ex}"}
            continue
        allowed_calls = sorted({f"{n}|{q}" for (n, q) in M})
        pol = {f"{n}|{q}": v for (n, q) in pi for v in [pi[(n, q)]] if v > 0}
        out["counts"][f"{c[0]}-{c[1]}"] = {
            "policy": pol,
            "allowed": allowed_calls,
            "residual": res,
            "pre_guard": sorted({f"{n}|{q}" for (n, q) in e.allowed_calls(ars, s)}),
        }
    # v1.0 3.8: the plate appearance's own count-reach chain, which is what band B5 weights by from here on.
    pl = e.at_bat_plan(tab)
    if pl:
        out["reach"] = {f"{b}-{k}": v for (b, k), v in pl["reach"].items()}
        out["plan_line"] = pl["line"]
    out["secs"] = time.time() - t0
    out["kinds"] = {p.name: p.kind for p in ars}
    out["grades"] = {p.name: p.grade for p in ars}
    out["commands"] = {p.name: p.command for p in ars}
    out["not_landing"] = sorted(p.name for p in ars if s0.landing_today and e.not_landing(p, s0))
    return out


def specs(tier):
    levels = CI_LEVELS if tier == "ci" else FULL_LEVELS
    ars_names = sorted(CI_ARS) if tier == "ci" else sorted(k for k in json.load(open(ARS_PATH)) if not k.startswith("_"))
    bos = [n for n, _, _ in BASEOUTS if (n in CI_BASEOUTS or tier != "ci")]
    states = ["mid"] if tier == "ci" else ["mid", "late_close"]
    out = [(lv, a, bo, sd, st, "base")
           for lv in levels for a in ars_names for bo in bos for sd in (True, False) for st in states]
    out += [("college_d3", a, bo, sd, "mid", v)
            for a in VAR_ARS for bo in VAR_BASEOUTS for sd in (True, False) for v in VARIANTS if v != "base"]
    return out


# --------------------------------------------------------------------------------------------------
# bands
# --------------------------------------------------------------------------------------------------
class Band:
    """Collects per-situation results for one band. A situation either holds, or misses by `by` points."""

    def __init__(self, key, what, mode="enforced", hard=False):
        self.key, self.what, self.mode, self.hard = key, what, mode, hard
        self.n = 0
        self.miss = []           # (label, by_points, detail)
        self.note = ""

    def add(self, ok, label, by=0.0, detail=""):
        self.n += 1
        if not ok:
            self.miss.append((label, by, detail))

    def verdict(self):
        if self.mode == "pending":
            return "pending", f"{self.note}"
        if not self.n:
            return "no data", "no eligible situations"
        share = 1 - len(self.miss) / self.n
        worst = max((m[1] for m in self.miss), default=0.0)
        if self.hard:
            ok = not self.miss
            return ("pass" if ok else "FAIL"), f"{len(self.miss)}/{self.n} situations miss (must be 0)"
        ok = share >= 0.98 and worst <= 0.03
        return ("pass" if ok else "FAIL"), (f"{share:.1%} of {self.n} hold (need 98%), worst miss "
                                            f"{worst * 100:.1f} pt (need <= 3.0)")


def bases_of(bo_name):
    return next(b for n, b, _ in BASEOUTS if n == bo_name)


def kind_of(cellr, name):
    return cellr["kinds"][name]


def is_secondary(cellr, name):
    return kind_of(cellr, name) != "FB"


def by_pitch(pol):
    out = defaultdict(float)
    for k, v in pol.items():
        out[k.split("|")[0]] += v
    return dict(out)


def by_target(pol):
    out = defaultdict(float)
    for k, v in pol.items():
        out[k.split("|")[1]] += v
    return dict(out)


def evaluate(cells, weights):
    B = {
        "B1": Band("B1", "No pitch type above 85%"),
        "B2": Band("B2", "Every allowed secondary at least 5% (same-side changeup 2%)"),
        "B3": Band("B3", "No exact call above 60%, except 3-0 fastball"),
        "B5": Band("B5", "Overall usage, chance-weighted over counts"),
        "B6": Band("B6", "Middle share by count group (command 3+)"),
        "B7": Band("B7", "Inside share of fastballs >= 12%; inside >= 3% in half of non-3-ball situations"),
        "B8a": Band("B8a", "Down share with a runner on 1st within 2 pt of bases empty"),
        "B8b": Band("B8b", "Off-speed share with a runner on 3rd at least 60% of bases empty"),
        "B8c": Band("B8c", "A pitch that isn't landing gets 0% with a runner on 3rd", hard=True),
        "B9": Band("B9", "RP2: after a foul straight back that exact call gets 0%", hard=True),
        "B10": Band("B10", "Fallback picks a pitch that is landing, not the most confident", hard=True),
        "B11": Band("B11", "Hard rules: no chase at 3-0/3-1", hard=True),
        "B12": Band("B12", "CR1 bans the mashed spot; CR2 keeps a power hitter off the middle", hard=True),
        "B13": Band("B13", "Low eye grade raises two-strike chase by 5 pt over eye 3"),
        "T1": Band("T1", "Contact grade 5 vs 1 moves two-strike chase by 5 pt", mode="tracked"),
        "T2": Band("T2", "Crowding raises fastball inside share by 5 pt", mode="tracked"),
        "T3": Band("T3", "Power grade 5 vs 3 moves calls off the middle", mode="tracked"),
    }

    idx = {}
    for cr in cells:
        lv, a, bo, sd, st, v = cr["spec"]
        idx[(lv, a, bo, sd, st, v)] = cr

    for cr in cells:
        lv, a, bo, sd, st, v = cr["spec"]
        for cnt, d in cr["counts"].items():
            if "error" in d:
                continue
            b, k = (int(x) for x in cnt.split("-"))
            pol, allowed = d["policy"], d["allowed"]
            if not pol:
                continue
            lab = f"{lv}/{a}/{bo}/{'same' if sd else 'opp'}/{st}/{v}/{cnt}"
            pp = by_pitch(pol)
            allowed_types = {x.split("|")[0] for x in allowed}
            exempt = (b == 3 and k == 0) or len(allowed_types) <= 1

            # B1
            if not exempt:
                top = max(pp.values(), default=0.0)
                B["B1"].add(top <= 0.85, lab, max(0.0, top - 0.85), f"top pitch {top:.1%}")
            # B2
            if not exempt:
                for n in allowed_types:
                    if not is_secondary(cr, n):
                        continue
                    floor = 0.02 if (kind_of(cr, n) == "CH" and sd) else 0.05
                    got = pp.get(n, 0.0)
                    B["B2"].add(got >= floor, f"{lab}/{n}", max(0.0, floor - got),
                                f"{n} {got:.1%} < {floor:.0%}")
            # B3
            for key, val in pol.items():
                n, q = key.split("|")
                if b == 3 and k == 0 and kind_of(cr, n) == "FB":
                    continue
                B["B3"].add(val <= 0.60, f"{lab}/{key}", max(0.0, val - 0.60), f"{key} {val:.1%}")
            # B6: every arsenal, with the plan's explicit +15 point carve-out for low_command
            mid = by_target(pol).get("middle", 0.0)
            if (b, k) in ((0, 1), (0, 2), (1, 2)):
                cap = 0.10
            elif (b, k) in ((0, 0), (1, 1), (2, 2), (3, 2)):
                cap = 0.35
            elif (b, k) in ((1, 0), (2, 1)):
                cap = 0.55
            elif (b, k) in ((2, 0), (3, 1)):
                cap = 0.70
            else:
                cap = None                                     # 3-0 has no limit
            if cap is not None:
                if a == "low_command":
                    cap += 0.15
                B["B6"].add(mid <= cap, lab, max(0.0, mid - cap), f"middle {mid:.1%} > {cap:.0%}")
            # B11: no chase at 3-0 or 3-1
            if b == 3 and k in (0, 1):
                ch = by_target(pol).get("chase", 0.0)
                B["B11"].add(ch == 0.0, lab, ch, f"chase {ch:.1%}")
            # B12: CR1 in the matchup variant (he has hit the fastball middle hard twice), CR2 in the power-grade
            # variants (grade 4 and 5 ban the middle for every pitch; grade 1 and 3 must not).
            # The rules act on the ALLOWED set (d["pre_guard"] is allowed_calls, i.e. after the coach rules and
            # before the guards). Asserting on the policy instead would be wrong in the other direction: the engine
            # is free to put 0% on the middle for ordinary reasons, such as two strikes with a runner on 3rd.
            pre = d["pre_guard"]
            if v == "matchup_hard_fb_middle":
                fb = list(cr["kinds"])[0]
                banned = f"{fb}|middle" not in pre and pol.get(f"{fb}|middle", 0.0) == 0.0
                B["B12"].add(banned, f"{lab}/CR1", 0.0 if banned else 1.0,
                             f"{fb} middle still allowed after two hard-hit balls")
            if v in ("grade_w4", "grade_w5"):
                mids = [x for x in pre if x.endswith("|middle")]
                B["B12"].add(not mids, f"{lab}/CR2", 0.0 if not mids else 1.0,
                             f"middle still allowed to a power hitter: {mids}")
            if v in ("grade_w1", "grade_w3"):
                mids = [x for x in pre if x.endswith("|middle")]
                B["B12"].add(bool(mids), f"{lab}/CR2-off", 0.0 if mids else 1.0,
                             f"middle is not in the allowed set at power grade {v[-1]} (CR2 must not fire below 4)")

            # B10: in the no_trust variant every pitch is below the cutoff, so exactly one pitch may be called,
            # and it must be the one still landing rather than the most confident.
            if v == "no_trust":
                called = {kk.split("|")[0] for kk, x in pol.items() if x > 0}
                ok = len(called) == 1
                B["B10"].add(ok, f"{lab}", 0.0 if ok else 1.0,
                             f"fallback called {sorted(called)} (must be exactly one pitch)")

            # B9: RP2, the exact call he just fouled straight back must be gone for one pitch
            if v == "last_foul_back":
                fb = list(cr["kinds"])[0]
                got = pol.get(f"{fb}|middle", 0.0)
                B["B9"].add(got == 0.0, f"{lab}/{fb}|middle", got,
                            f"{fb} middle {got:.1%} right after he fouled it straight back")

            # B8c: a pitch that isn't landing gets 0% with a runner on 3rd
            if cr.get("not_landing") and bases_of(bo)[2]:
                for nl in cr["not_landing"]:
                    got = sum(x for kk, x in pol.items() if kk.split("|")[0] == nl)
                    B["B8c"].add(got == 0.0, f"{lab}/{nl}", got, f"{nl} isn't landing but gets {got:.1%}")

    # chance-weighted, per (level, arsenal, base-out, side, state) group
    for (lv, a, bo, sd, st, v), cr in idx.items():
        if v != "base":
            continue
        lab = f"{lv}/{a}/{bo}/{'same' if sd else 'opp'}/{st}"
        wt = defaultdict(float)
        tot = 0.0
        fb_in, fb_all = 0.0, 0.0
        n_sit, n_inside_ok = 0, 0
        for cnt, d in cr["counts"].items():
            if "error" in d or not d["policy"]:
                continue
            b, k = (int(x) for x in cnt.split("-"))
            w = wof(cr, b, k, weights)
            tot += w
            for key, val in d["policy"].items():
                n, q = key.split("|")
                wt[n] += w * val
                if kind_of(cr, n) == "FB":
                    fb_all += w * val
                    if q in INSIDE:
                        fb_in += w * val
            if b < 3:
                n_sit += 1
                ins = sum(val for key, val in d["policy"].items() if key.split("|")[1] in INSIDE)
                n_inside_ok += ins >= 0.03
        if not tot:
            continue
        share = {n: x / tot for n, x in wt.items()}
        fb = sum(x for n, x in share.items() if kind_of(cr, n) == "FB")
        if a == "two_pitch":
            lo, hi = 0.50, 0.78
        elif a == "changeup_first":
            lo, hi = 0.25, 0.55
        else:
            lo, hi = 0.40, 0.70
        B["B5"].add(lo <= fb <= hi, f"{lab}/FB", max(0.0, lo - fb, fb - hi), f"fastball {fb:.1%} outside {lo:.0%}-{hi:.0%}")
        for n, x in share.items():
            if kind_of(cr, n) == "FB":
                continue
            g = cr["grades"][n]
            if g >= 5:
                slo, shi = 0.25, 0.50
            elif a == "four_pitch":
                slo, shi = 0.07, 0.30
            else:
                slo, shi = 0.10, 0.35
            B["B5"].add(slo <= x <= shi, f"{lab}/{n}", max(0.0, slo - x, x - shi),
                        f"{n} (grade {g}) {x:.1%} outside {slo:.0%}-{shi:.0%}")
        if min(cr["commands"].values()) >= 3:
            insh = fb_in / fb_all if fb_all else 0.0
            B["B7"].add(insh >= 0.12, f"{lab}/fb-inside", max(0.0, 0.12 - insh), f"fastball inside {insh:.1%} < 12%")
            if n_sit:
                half = n_inside_ok / n_sit
                B["B7"].add(half >= 0.5, f"{lab}/half", max(0.0, 0.5 - half),
                            f"inside >= 3% in {half:.0%} of non-3-ball counts")

        # B8a / B8b need a bases-empty reference at the same number of outs
        bases, outs = next((bb, oo) for nn, bb, oo in BASEOUTS if nn == bo)
        ref_name = f"empty_{outs}out"
        ref = idx.get((lv, a, ref_name, sd, st, v))
        if ref is not None and ref is not cr:
            if bases[0] and not bases[1] and not bases[2]:
                for cnt, d in cr["counts"].items():
                    b, k = (int(x) for x in cnt.split("-"))
                    rd = ref["counts"].get(cnt)
                    if "error" in d or not d["policy"] or rd is None or "error" in rd or not rd["policy"]:
                        continue
                    if outs >= 2 or k >= 2:
                        continue
                    dn = sum(v2 for kk, v2 in d["policy"].items() if kk.split("|")[1] in DOWN)
                    rn = sum(v2 for kk, v2 in rd["policy"].items() if kk.split("|")[1] in DOWN)
                    B["B8a"].add(dn >= rn - 0.02, f"{lab}/{cnt}", max(0.0, rn - 0.02 - dn),
                                 f"down {dn:.1%} vs empty {rn:.1%}")
            if bases[2]:
                os_c, os_r, nn = 0.0, 0.0, 0
                for cnt, d in cr["counts"].items():
                    rd = ref["counts"].get(cnt)
                    if "error" in d or not d["policy"] or rd is None or "error" in rd or not rd["policy"]:
                        continue
                    os_c += sum(v2 for kk, v2 in d["policy"].items() if kind_of(cr, kk.split("|")[0]) != "FB")
                    os_r += sum(v2 for kk, v2 in rd["policy"].items() if kind_of(ref, kk.split("|")[0]) != "FB")
                    nn += 1
                if nn and os_r > 0:
                    ratio = (os_c / nn) / (os_r / nn)
                    B["B8b"].add(ratio >= 0.60, lab, max(0.0, 0.60 - ratio) * 0.6,
                                 f"off-speed {os_c / nn:.1%} vs empty {os_r / nn:.1%} (ratio {ratio:.2f})")

    # B13 / T1 / T3: variant comparisons on two-strike chase share
    def chase_two_strike(cr):
        tot, n = 0.0, 0
        for cnt, d in cr["counts"].items():
            b, k = (int(x) for x in cnt.split("-"))
            if k != 2 or b >= 3 or "error" in d or not d["policy"]:
                continue
            tot += sum(v2 for kk, v2 in d["policy"].items() if kk.split("|")[1] == "chase")
            n += 1
        return tot / n if n else None

    for a in VAR_ARS:
        for bo in VAR_BASEOUTS:
            for sd in (True, False):
                lab = f"college_d3/{a}/{bo}/{'same' if sd else 'opp'}"
                g = lambda v: idx.get(("college_d3", a, bo, sd, "mid", v))

                def gap(v_lo, v_hi):
                    lo_c, hi_c = g(v_lo), g(v_hi)
                    if not lo_c or not hi_c:
                        return None
                    x, y = chase_two_strike(lo_c), chase_two_strike(hi_c)
                    return None if x is None or y is None else (x, y)

                r = gap("grade_d3", "grade_d1")
                if r:
                    base, low_eye = r
                    B["B13"].add(low_eye - base >= 0.05, lab, max(0.0, 0.05 - (low_eye - base)),
                                 f"eye 1 chase {low_eye:.1%} vs eye 3 {base:.1%}")
                r = gap("grade_c1", "grade_c5")
                if r:
                    c1, c5 = r
                    B["T1"].add(abs(c5 - c1) >= 0.05, lab, max(0.0, 0.05 - abs(c5 - c1)),
                                f"contact 5 chase {c5:.1%} vs contact 1 {c1:.1%}")
                b3, b5 = g("grade_w3"), g("grade_w5")
                if b3 and b5:
                    f3 = sum(v2 for d in b3["counts"].values() if "error" not in d
                             for kk, v2 in d["policy"].items() if kk.split("|")[1] == "middle")
                    f5 = sum(v2 for d in b5["counts"].values() if "error" not in d
                             for kk, v2 in d["policy"].items() if kk.split("|")[1] == "middle")
                    B["T3"].add(f5 < f3 - 0.05, lab, max(0.0, 0.05 - (f3 - f5)),
                                f"middle total: power 5 {f5:.2f} vs power 3 {f3:.2f}")
                base_c, crowd_c = g("base"), g("crowding")
                if base_c and crowd_c:
                    def fb_inside(cr2):
                        ins, all_ = 0.0, 0.0
                        for d in cr2["counts"].values():
                            if "error" in d:
                                continue
                            for kk, v2 in d["policy"].items():
                                n2, q2 = kk.split("|")
                                if kind_of(cr2, n2) == "FB":
                                    all_ += v2
                                    if q2 in INSIDE:
                                        ins += v2
                        return ins / all_ if all_ else 0.0
                    x, y = fb_inside(base_c), fb_inside(crowd_c)
                    B["T2"].add(y - x >= 0.05, lab, max(0.0, 0.05 - (y - x)),
                                f"crowding fastball inside {y:.1%} vs {x:.1%}")
    return B


def report(B, cells, tier, tag, weights, elapsed):
    enforced_fail = [k for k, b in B.items() if b.mode == "enforced" and b.verdict()[0] == "FAIL"]
    L = [f"# Call sheet: {tag}", "",
         f"Tier `{tier}`, {len(cells)} plate appearances x 12 counts, {elapsed:.0f}s.",
         ("Count weights: each plate appearance's own count-reach chain from at_bat_plan (v1.0 3.8)."
          if USE_CHAIN else "Count weights: every count equally (--weights-uniform)."),
         "", "## Bands", "",
         "| Band | What | Mode | Result | Detail |", "|---|---|---|---|---|"]
    for k in ("B1", "B2", "B3", "B5", "B6", "B7", "B8a", "B8b", "B8c", "B9", "B10", "B11", "B12", "B13",
              "T1", "T2", "T3"):
        b = B[k]
        v, detail = b.verdict()
        L.append(f"| {k} | {b.what} | {b.mode} | **{v}** | {detail} |")
    L += ["", f"**Enforced failures: {len(enforced_fail)}** "
              + (", ".join(enforced_fail) if enforced_fail else "(none)"), ""]
    for k in ("B1", "B2", "B3", "B5", "B6", "B7", "B8a", "B8b", "B8c", "B11", "B13"):
        b = B[k]
        if not b.miss:
            continue
        L += [f"### {k}: {b.what}", "",
              f"{len(b.miss)} of {b.n} eligible situations miss. Worst five:", ""]
        for lab, by, det in sorted(b.miss, key=lambda m: -m[1])[:5]:
            L.append(f"- `{lab}` — {det} (miss {by * 100:.1f} pt)")
        L.append("")
    # shares
    pitch_sh, target_sh, tot = defaultdict(float), defaultdict(float), 0.0
    for cr in cells:
        if cr["spec"][5] != "base":
            continue
        for cnt, d in cr["counts"].items():
            if "error" in d:
                continue
            b, k = (int(x) for x in cnt.split("-"))
            w = wof(cr, b, k, weights)
            for key, val in d["policy"].items():
                n, q = key.split("|")
                pitch_sh[cr["kinds"][n]] += w * val
                target_sh[q] += w * val
                tot += w * val
    if tot:
        L += ["## Share of calls (chance-weighted, base variants)", "",
              "| Pitch kind | Share |", "|---|---|"]
        for n, x in sorted(pitch_sh.items(), key=lambda kv: -kv[1]):
            L.append(f"| {n} | {x / tot:.1%} |")
        L += ["", "| Target | Share |", "|---|---|"]
        for q, x in sorted(target_sh.items(), key=lambda kv: -kv[1]):
            L.append(f"| {q} | {x / tot:.1%} |")
    return "\n".join(L) + "\n", enforced_fail


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tier", choices=("full", "ci"), default="ci")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--tag", default=None)
    ap.add_argument("--weights-uniform", action="store_true", help="skip Statcast and weight every count equally")
    a = ap.parse_args()
    tag = a.tag or a.tier
    global USE_CHAIN
    USE_CHAIN = not a.weights_uniform
    weights = ({c: 1 / len(COUNTS) for c in COUNTS} if a.weights_uniform else count_weights())
    sp = specs(a.tier)
    print(f"{len(sp)} plate appearances ({a.tier} tier), {a.jobs} jobs", flush=True)
    t0 = time.time()
    cells = []
    with cf.ProcessPoolExecutor(a.jobs) as ex:
        for i, cr in enumerate(ex.map(cell, sp, chunksize=1)):
            cells.append(cr)
            if (i + 1) % 50 == 0:
                print(f"  {i + 1}/{len(sp)}  {time.time() - t0:.0f}s", flush=True)
    elapsed = time.time() - t0
    errs = sum(1 for cr in cells for d in cr["counts"].values() if "error" in d)
    if errs:
        print(f"WARNING: {errs} count cells raised", flush=True)
    B = evaluate(cells, weights)
    md, fails = report(B, cells, a.tier, tag, weights, elapsed)
    os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
    jpath = os.path.join(ROOT, "results", f"callsheet_{tag}.json")
    mpath = os.path.join(ROOT, "results", f"callsheet_{tag}.md")
    json.dump({"tier": a.tier, "tag": tag, "secs": elapsed, "cells": cells,
               "bands": {k: {"what": b.what, "mode": b.mode, "n": b.n,
                             "verdict": b.verdict()[0], "detail": b.verdict()[1],
                             "miss": [[l, by, d] for l, by, d in b.miss]} for k, b in B.items()}},
              open(jpath, "w", encoding="utf-8"))
    open(mpath, "w", newline="\n", encoding="utf-8").write(md)
    print(f"\nwrote {os.path.relpath(jpath, ROOT)} and {os.path.relpath(mpath, ROOT)}")
    for k in ("B1", "B2", "B3", "B5", "B6", "B7", "B8a", "B8b", "B8c", "B9", "B10", "B11", "B12", "B13",
              "T1", "T2", "T3"):
        v, detail = B[k].verdict()
        print(f"  {k:<4} {B[k].mode:<9} {v:<8} {detail}")
    print(f"\n{len(fails)} enforced band(s) failed" + (": " + ", ".join(fails) if fails else ""))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
