"""v1.1 Step 3: Statcast direction checks for the setup rules (docs/PLAN_v1.1_2026-11-12.md 2.4, the decision rule written
before running them; research doc Part 3).

  python3 setup_checks.py   -> results/v11/step3_checks.txt, results/v11/step3_checks.json

For each rule: the payoff pitch (its kinds, tags and location) thrown after the rule's setup earlier in the same plate
appearance, vs the same payoff pitch after anything else. Logistic with pitcher and batter random intercepts on the
Step 2 controls (count, base-out, margin, times through, pitch count, previous result, usage, location splines, class x
location; profile_terms_fit.features) plus the previous pitch's class x height x side (a stand-in for the engine's pair
terms: eye level, tunnel, timing). The rule's coefficient on whiff | swing, chase | out of the zone, called strike | take
and hard | ball in play, 2024 and 2025 pooled (a direction check, not a held-out ship test), with a game-clustered 95%
interval. Decision rule (2.4): right direction and the interval excludes 0 -> sized normally; interval includes 0 ->
smallest size that passes its rows; wrong direction with the interval excluding 0 -> dropped unless Drew keeps it. N1 / N2
are built only if the check supports them.
"""
import json, os, sys
from collections import defaultdict
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import seq_fit as SF
import profile_terms_fit as PT

OUT = os.path.join(HERE, "results", "v11")
lines = []


def say(*a):
    t = " ".join(str(x) for x in a)
    print(t, flush=True)
    lines.append(t)


def main():
    d = PT.load()
    Xc, xs, zn = PT.features(d)
    n = len(d)
    yr = d.game_year.values
    pits = {q: j for j, q in enumerate(sorted(set(d.pitcher)))}
    bats = {q: j for j, q in enumerate(sorted(set(d.batter)))}
    pid = np.array([pits[q] for q in d.pitcher]); bid = np.array([bats[q] for q in d.batter])
    gid = pd.factorize(d.game_pk)[0]
    desc = d.description.values
    swing = np.isin(desc, list(PT.SWING)); whiff = np.isin(desc, list(PT.WHIFF)).astype(float)
    take = np.isin(desc, list(PT.TAKE)); cs = (desc == "called_strike").astype(float)
    zout = d.zone.isin([11, 12, 13, 14]).values
    ls = pd.to_numeric(d.launch_speed, errors="coerce").values.astype(float)
    bip = (desc == "hit_into_play") & ~np.isnan(ls); hard = (np.nan_to_num(ls) >= 95).astype(float)
    same = (d.stand.values == d.p_throws.values)
    kind, tag = d.kind.values, d.tag.values
    strikes, balls = d.strikes.values, d.balls.values
    up, top = (zn > 0.67) & (zn <= 1.0), zn > 0.67
    bottom, below = zn < 0.33, zn < 0.0
    inside, away = xs > 0, xs < 0
    in_zone = (zn >= 0) & (zn <= 1) & (np.abs(xs) <= 0.83)
    strike_res = np.isin(desc, ["called_strike", "swinging_strike", "swinging_strike_blocked", "foul", "foul_tip"])
    not_contact = np.isin(desc, ["called_strike", "ball", "blocked_ball", "swinging_strike", "swinging_strike_blocked"])
    # previous-pitch controls (the pair-term stand-in): class x height x side of the previous pitch in this PA
    pa = d.game_pk.astype(str).values + ":" + d.at_bat_number.astype(str).values
    prev_ok = np.r_[False, pa[1:] == pa[:-1]]
    pcls = np.where(np.isin(kind, ["FB", "SI", "FC"]), "F", "O")
    ph = np.where(top, "u", np.where(bottom, "d", "m")); psd = np.where(inside, "i", "a")
    key = np.char.add(np.char.add(pcls, ph), psd)
    pk = np.r_[["none"], key[:-1]]; pk[~prev_ok] = "none"
    levels = sorted(set(pk) - {"none"})
    Xp = np.column_stack([(pk == lv).astype(float) for lv in levels])
    X = np.hstack([Xc, Xp])

    def seen_before(setup_mask):
        """True for a pitch if a setup pitch came earlier in the same PA"""
        out = np.zeros(n, bool)
        flag, cur = False, None
        for i in range(n):
            if pa[i] != cur:
                cur, flag = pa[i], False
            out[i] = flag
            if setup_mask[i]:
                flag = True
        return out

    def prev_was(setup_mask):
        out = np.r_[False, setup_mask[:-1]]
        return out & prev_ok

    rules = {}
    rides = (kind == "FB") & (tag == "rides") | (kind == "FC") & (tag == "ride")
    # S1 up, then down
    rules["S1"] = dict(setup=seen_before(rides & up & strike_res),
                       payoff=(((kind == "CB") & np.isin(tag, ["12-6", "power"])) | ((kind == "CH") & np.isin(tag, ["drop", "split"])))
                       & bottom & (strikes >= 1) & (balls <= 2),
                       sign={"whiff": +1, "chase": +1, "hard": -1},
                       what="riding fastball top of the zone (strike, foul or whiff) -> 12-6 / power curve or drop / split change at the bottom, 0-1 to 2-2")
    # S2 in, then away, same-side
    rules["S2"] = dict(setup=seen_before(((kind == "SI") | ((kind == "FB") & (tag == "runs"))) & inside & same & not_contact),
                       payoff=(kind == "SL") & bottom & away & same,
                       sign={"whiff": +1, "chase": +1, "hard": -1}, what="sinker / running fastball inside (not fouled or put in play) -> slider down-away, same-side hitter")
    # S3 hard in, soft away, opposite side
    rules["S3"] = dict(setup=seen_before((((kind == "FC") & (tag == "hard")) | (kind == "FB")) & inside & ~same & not_contact),
                       payoff=(kind == "CH") & np.isin(tag, ["fade", "split", ""]) & bottom & away & ~same,
                       sign={"whiff": +1, "chase": +1, "hard": -1}, what="hard cutter / fastball inside (not fouled or put in play) -> fade / split change down-away, opposite-side hitter")
    # S4 same lane, slower
    rules["S4"] = dict(setup=prev_was(np.isin(kind, ["FB", "SI"]) & away & in_zone),
                       payoff=((kind == "CH") & (tag != "firm") | (kind == "CB")) & away & bottom,
                       sign={"whiff": +1, "chase": +1, "hard": -1}, what="fastball on the outer third -> changeup (not firm) / curve away and lower, next pitch")
    # S6 steal strike one with a breaking ball, then fastball at 0-1
    first_bb = (balls == 0) & (strikes == 0) & (((kind == "CB")) | ((kind == "SL") & (tag == "gyro"))) & (desc == "called_strike")
    rules["S6"] = dict(setup=prev_was(first_bb), payoff=np.isin(kind, ["FB", "SI", "FC"]) & (balls == 0) & (strikes == 1),
                       sign={"whiff": +1, "hard": -1}, what="first-pitch curve / gyro slider called strike -> fastball at 0-1")
    # S7 climb the ladder
    rules["S7"] = dict(setup=seen_before(rides & up & np.isin(desc, ["swinging_strike", "swinging_strike_blocked"])),
                       payoff=rides & (zn > 1.0) & (strikes == 2), sign={"whiff": +1, "chase": +1},
                       what="riding fastball top of the zone, whiff -> riding fastball above the zone, two strikes")
    # S8 strike, then bury the same pitch
    bb = np.isin(kind, ["SL", "CB"])
    s8 = np.zeros(n, bool)
    setup8 = bb & bottom & in_zone & np.isin(desc, ["called_strike", "swinging_strike", "swinging_strike_blocked"])
    cur, seen8_cur = None, set()
    for i in range(n):
        if pa[i] != cur:
            cur = pa[i]; seen8_cur = set()
        s8[i] = d.pitch_type.values[i] in seen8_cur
        if setup8[i]:
            seen8_cur.add(d.pitch_type.values[i])
    rules["S8"] = dict(setup=s8, payoff=bb & below & (strikes == 2), sign={"whiff": +1, "chase": +1},
                       what="slider / curve strike at the bottom edge -> the same pitch below the zone, two strikes")
    # S9 work the edge, then expand off it (approximate: early edge fastball, two-strike chase on that side)
    edge_in = inside & (np.abs(xs) > 0.55) & (np.abs(xs) <= 0.83) & (zn >= 0) & (zn <= 1)
    edge_away = away & (np.abs(xs) > 0.55) & (np.abs(xs) <= 0.83) & (zn >= 0) & (zn <= 1)
    early = strikes < 2
    s9in = seen_before(np.isin(kind, ["FB", "FC"]) & edge_in & early)
    s9aw = seen_before(np.isin(kind, ["FB", "FC"]) & edge_away & early)
    rules["S9"] = dict(setup=np.where(inside, s9in, s9aw), payoff=(np.abs(xs) > 0.83) & (strikes == 2) & ~np.isin(kind, ["SI"]),
                       sign={"whiff": +1, "chase": +1}, what="early fastball / cutter on an edge -> two-strike pitch off that same edge")
    # S10 sinker, then cutter
    rules["S10"] = dict(setup=seen_before(kind == "SI"), payoff=(kind == "FC") & (tag == "hard"),
                        sign={"whiff": +1, "chase": +1, "hard": -1}, what="sinker -> hard cutter")
    # anti-setups
    rules["N1"] = dict(setup=prev_was(kind == "SL") & (kind == "CB") | prev_was(kind == "CB") & (kind == "SL"),
                       payoff=np.isin(kind, ["SL", "CB"]), sign={"whiff": -1, "chase": -1, "hard": +1},
                       what="slider right after a curve, or curve right after a slider (vs the same pitch after anything else)")
    rules["N2"] = dict(setup=prev_was(kind == "CH"), payoff=(kind == "SI"), sign={"whiff": -1, "chase": -1, "hard": +1},
                       what="sinker right after a changeup")
    targets = {"whiff": (swing, whiff), "chase": (zout, swing.astype(float)), "cstrike": (take, cs), "hard": (bip, hard)}
    res = {}
    say(f"v1.1 Step 3 setup checks: {n:,} pitches, 2024 + 2025; controls {X.shape[1]} columns (Step 2 controls + previous "
        f"pitch class x height x side)")
    for r, spec in rules.items():
        pay, setup = spec["payoff"], spec["setup"]
        res[r] = dict(what=spec["what"], n_payoff=int(pay.sum()), n_after_setup=int((pay & setup).sum()), fits={})
        say(f"\n{r}: {spec['what']}. Payoff pitches {int(pay.sum()):,}, after the setup {int((pay & setup).sum()):,}")
        for tg, (mask, y) in targets.items():
            m = mask & pay
            k = int((m & setup).sum())
            if k < 40 or (m & ~setup).sum() < 40:
                say(f"  {tg:7s} too few ({k} after the setup)")
                continue
            F = SF.Fit(X[m], y[m], pid[m], bid[m], gid[m], len(pits), len(bats))
            fit = F.run(setup[m].astype(float)[:, None])
            b, se = float(fit["b_raw"][-1]), float(fit["se_raw"][-1])
            lo, hi = b - 1.96 * se, b + 1.96 * se
            want = spec["sign"].get(tg)
            if want is None:
                verdict = "reported"
            elif lo * hi > 0:
                verdict = "right way" if np.sign(b) == want else "WRONG WAY"
            else:
                verdict = "interval includes 0"
            res[r]["fits"][tg] = dict(beta=b, se=se, lo=lo, hi=hi, n=int(m.sum()), n_setup=k, verdict=verdict,
                                      raw_after=float(y[m & setup].mean()), raw_else=float(y[m & ~setup].mean()))
            say(f"  {tg:7s} {b:+.3f} (95% {lo:+.3f} to {hi:+.3f}; n {int(m.sum()):,}, {k:,} after the setup; raw "
                f"{y[m & setup].mean():.3f} vs {y[m & ~setup].mean():.3f}) -> {verdict}")
        vs = [f["verdict"] for f in res[r]["fits"].values()]
        res[r]["decision"] = ("dropped unless Drew keeps it" if any(v == "WRONG WAY" for v in vs) and not any(v == "right way" for v in vs)
                              else "sized normally" if any(v == "right way" for v in vs) and not any(v == "WRONG WAY" for v in vs)
                              else "mixed: smallest size, flagged" if any(v == "WRONG WAY" for v in vs)
                              else "smallest size that passes its rows")
        say(f"  -> {res[r]['decision']}")
    os.makedirs(OUT, exist_ok=True)
    json.dump(res, open(os.path.join(OUT, "step3_checks.json"), "w"), indent=1)
    open(os.path.join(OUT, "step3_checks.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
