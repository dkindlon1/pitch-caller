"""v0.8 step 2: Statcast fits of the new terms (docs/SPEC_v0.8.md section 10). Independent of the engine.

Data: data/statcast/sc_*.csv (fetch_statcast.py; every 4th day, Apr 5 - Sep 25; 2024 train, 2025 test).
Models: logistic, with pitcher and batter random intercepts fitted as penalized intercepts (MAP with prior SD 0.25 logits;
players new in the test season get 0), fixed controls as the spec lists, and the term under test.
Ship rule (spec): held-out (2025) log-loss gain > 2 bootstrap SDs (1,000 resamples clustered on game) AND the term's
coefficient interval excludes 0 (cluster-robust by game, 95%). Shape parameters are chosen on TRAIN log likelihood only.
usage: python3 seq_fit.py   ->  results/seq_fit_report.txt, fit_v08.json
"""
import csv, glob, json, math, os, sys
from collections import defaultdict
import numpy as np
from scipy.optimize import minimize

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_TXT = os.path.join(HERE, "results", "seq_fit_report.txt")
OUT_JSON = os.path.join(HERE, "fit_v08.json")
RE_SD = 0.25
CLASS = {"FF": "FB", "SI": "FB", "FC": "FB", "SL": "SL", "ST": "SL", "SV": "SL", "CU": "CB", "KC": "CB", "CS": "CB",
         "CH": "CH", "FS": "CH", "FO": "CH"}
EV_ADJ = {"up-in": 3.0, "up-away": 0.0, "down-in": 0.0, "down-away": -3.0, "middle": 0.0, "chase": -3.0}
SWING = {"swinging_strike", "swinging_strike_blocked", "foul", "foul_tip", "hit_into_play"}
WHIFF = {"swinging_strike", "swinging_strike_blocked"}
TAKE = {"ball", "called_strike", "blocked_ball"}
lines = []


def say(*a):
    t = " ".join(str(x) for x in a)
    print(t, flush=True)
    lines.append(t)


def f(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return float("nan")


# ---------------------------------------------------------------------------------------------- load
def load():
    rows = []
    for fn in sorted(glob.glob(os.path.join(HERE, "data", "statcast", "sc_*.csv"))):
        with open(fn, encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                c = CLASS.get(r["pitch_type"])
                if c is None or r["game_type"] != "R":
                    continue
                if "bunt" in r["description"]:
                    continue
                rows.append(dict(
                    yr=int(r["game_year"]), g=int(r["game_pk"]), ab=int(r["at_bat_number"]), pn=int(r["pitch_number"]),
                    pit=int(r["pitcher"]), bat=int(r["batter"]), pt=r["pitch_type"], c=c, desc=r["description"],
                    b=int(r["balls"]), k=int(r["strikes"]), o=int(r["outs_when_up"]),
                    r1=r["on_1b"] != "", r2=r["on_2b"] != "", r3=r["on_3b"] != "",
                    marg=int(f(r["fld_score"]) - f(r["bat_score"])) if r["fld_score"] != "" else 0,
                    tto=int(f(r["n_thruorder_pitcher"]) if r["n_thruorder_pitcher"] != "" else 1),
                    v=f(r["release_speed"]), spin=f(r["release_spin_rate"]), px=f(r["pfx_x"]), pz=f(r["pfx_z"]),
                    ext=f(r["release_extension"]), x=f(r["plate_x"]), z=f(r["plate_z"]), top=f(r["sz_top"]),
                    bot=f(r["sz_bot"]), stand=r["stand"], thr=r["p_throws"], zone=int(f(r["zone"])) if r["zone"] else 0,
                    vx0=f(r["vx0"]), vy0=f(r["vy0"]), vz0=f(r["vz0"]), ax=f(r["ax"]), ay=f(r["ay"]), az=f(r["az"]),
                    rx=f(r["release_pos_x"]), rz=f(r["release_pos_z"]), ls=f(r["launch_speed"]), bb=r["bb_type"],
                    shape_sink=r["pitch_type"] == "SI", shape_cut=r["pitch_type"] == "FC"))
    rows.sort(key=lambda r: (r["g"], r["ab"], r["pn"]))
    return rows


def quad(r):
    zn = (r["z"] - r["bot"]) / max(0.5, r["top"] - r["bot"])
    xin = -r["x"] if r["stand"] == "R" else r["x"]
    if r["zone"] in (11, 12, 13, 14) and zn < 0:
        return "chase"
    if abs(r["x"]) < 0.28 and 0.33 < zn < 0.67:
        return "middle"
    return ("up" if zn > 0.5 else "down") + ("-in" if xin > 0 else "-away")


def g_mod(d, dstar):
    return (d / dstar) * math.exp(1 - d / dstar) if d > 0 else 0.0


def timing_B(r_, kind):
    sr = min(1.0, max(0.0, (abs(r_) - 0.03) / 0.05))
    if r_ < 0:
        return 0.6 * sr
    if kind == "CH" and r_ > 0.12:
        return sr * math.exp(-(r_ - 0.12) / 0.08)
    return sr


def traj(r):
    """Positions (ft) at release, the decision point (0.175 s before the plate) and the plate, from Statcast's
    constant-acceleration fit (velocities and accelerations at y = 50 ft; position at y = 50 back-solved from the plate)."""
    yp = 17 / 12
    a, bq, cq = 0.5 * r["ay"], r["vy0"], 50 - yp
    disc = bq * bq - 4 * a * cq
    if not (disc > 0) or a == 0:
        return None
    tp = (-bq - math.sqrt(disc)) / (2 * a)
    if not (0.2 < tp < 1.0):
        return None
    x50 = r["x"] - r["vx0"] * tp - 0.5 * r["ax"] * tp * tp
    z50 = r["z"] - r["vz0"] * tp - 0.5 * r["az"] * tp * tp
    td = tp - 0.175
    xd = x50 + r["vx0"] * td + 0.5 * r["ax"] * td * td
    zd = z50 + r["vz0"] * td + 0.5 * r["az"] * td * td
    return (r["rx"], r["rz"]), (xd, zd), (r["x"], r["z"])


# ---------------------------------------------------------------------------------------------- features
def season_tables(rows):
    """Per season: pitcher x pitch-type usage share; pitcher mean speed per pitch type; pitcher usage per count."""
    use = defaultdict(lambda: defaultdict(float))
    spd = defaultdict(list)
    cnt = defaultdict(lambda: defaultdict(float))
    for r in rows:
        use[(r["yr"], r["pit"])][r["pt"]] += 1
        if r["v"] == r["v"]:
            spd[(r["yr"], r["pit"], r["pt"])].append(r["v"])
        cnt[(r["yr"], r["pit"], r["b"], r["k"])][r["pt"]] += 1
    mspd = {k: sum(v) / len(v) for k, v in spd.items()}

    def mix_speed(yr, pit, mix):
        t = sum(mix.values())
        return sum(n * mspd.get((yr, pit, pt), 0) for pt, n in mix.items()) / t if t else float("nan")

    return use, mspd, cnt, mix_speed


def sequence(rows, lam, alpha, tabs):
    """Look (v_hat, y_hat) before each pitch, timing B, eye level input, previous pitch, familiarity n by class."""
    use, mspd, cnt, mix_speed = tabs
    out = [None] * len(rows)
    seen = defaultdict(lambda: {"FB": 0, "OS": 0})        # (game, pitcher, batter) earlier-PA counts
    bf = defaultdict(set)
    cur_pa = None
    for i, r in enumerate(rows):
        pa = (r["g"], r["ab"])
        if pa != cur_pa:
            if cur_pa is not None and prev_pa_rows:
                for pr in prev_pa_rows:
                    seen[(pr["g"], pr["pit"], pr["bat"])]["FB" if pr["c"] == "FB" else "OS"] += 1
            cur_pa = pa
            prev_pa_rows = []
            v0 = mix_speed(r["yr"], r["pit"], cnt.get((r["yr"], r["pit"], 0, 0), {}) or use[(r["yr"], r["pit"])])
            vh, yh = v0, 2.5
            prev = None
        bf[(r["g"], r["pit"])].add(r["ab"])
        vsit = mix_speed(r["yr"], r["pit"], cnt.get((r["yr"], r["pit"], r["b"], r["k"]), {}) or use[(r["yr"], r["pit"])])
        q = quad(r)
        vp = r["v"] + 0.5 * EV_ADJ[q]
        vt = (1 - alpha) * vh + alpha * vsit
        rr = (vt - vp) / vt if vt == vt and vt > 0 else 0.0
        kind = "FB" if r["c"] == "FB" else r["c"]
        fam = seen[(r["g"], r["pit"], r["bat"])]
        out[i] = dict(B=timing_B(rr, kind) if rr == rr else 0.0, r=rr, yh=yh, prev=prev, q=q,
                      n_fb=fam["FB"], n_os=fam["OS"], pa_idx=len(bf[(r["g"], r["pit"])]))
        if r["v"] == r["v"]:
            vh = lam * vh + (1 - lam) * vp
        if r["z"] == r["z"]:
            yh = lam * yh + (1 - lam) * r["z"]
        prev = i
        prev_pa_rows.append(r)
    return out


def hinge(v, knots):
    return [max(0.0, v - kk) for kk in knots]


def controls(r, seq_i, tabs, prev_row):
    """Fixed controls (spec 10): count, base-out, margin bucket, times through, pitch-count bucket, previous result,
    season usage share, pitch quality by class, location splines (tensor hinge basis)."""
    use = tabs[0]
    u = use[(r["yr"], r["pit"])]
    share = u[r["pt"]] / sum(u.values())
    x = []
    for (b, k) in [(b, k) for b in range(4) for k in range(3)][1:]:
        x.append(1.0 if (r["b"], r["k"]) == (b, k) else 0.0)
    x += [r["o"] == 1, r["o"] == 2, r["r1"], r["r2"], r["r3"]]
    m = max(-3, min(3, r["marg"]))
    x += [m == j for j in (-3, -2, -1, 1, 2, 3)]
    x += [r["tto"] == 2, r["tto"] >= 3]
    pc = seq_i["pc"]
    x += [26 <= pc < 51, 51 <= pc < 76, 76 <= pc < 101, pc >= 101]
    pd = prev_row["desc"] if prev_row else "none"
    x += [pd == "ball", pd == "called_strike", pd in WHIFF, pd.startswith("foul")]
    x += [share]
    sgn = -1 if r["thr"] == "L" else 1
    for c in ("FB", "SL", "CB", "CH"):
        on = 1.0 if r["c"] == c else 0.0
        vals = [(r["v"] - 89) / 5, ((r["v"] - 89) / 5) ** 2, (r["spin"] - 2300) / 400, sgn * r["px"], r["pz"], r["ext"] - 6.3]
        x += [on] + [on * (0.0 if vv != vv else vv) for vv in vals]
    xs = -r["x"] if r["stand"] == "R" else r["x"]
    zn = (r["z"] - r["bot"]) / max(0.5, r["top"] - r["bot"])
    hx = [xs] + hinge(xs, (-1.0, -0.5, 0.0, 0.5, 1.0))
    hz = [zn] + hinge(zn, (-0.25, 0.25, 0.5, 0.75, 1.25))
    x += hx + hz + [a * b for a in hx[:3] for b in hz[:3]]
    for c in ("SL", "CB", "CH"):
        on = 1.0 if r["c"] == c else 0.0
        x += [on * xs, on * zn, on * zn * zn]
    return [float(v) for v in x]


# ---------------------------------------------------------------------------------------------- penalized logistic
class Fit:
    def __init__(self, X, y, pid, bid, games, npit, nbat):
        self.X, self.y, self.pid, self.bid, self.g = X, y, pid, bid, games
        self.np_, self.nb = npit, nbat

    def run(self, extra=None):
        X = self.X if extra is None else np.hstack([self.X, extra])
        n, d = X.shape
        mu = X.mean(0); sd = X.std(0); sd[sd == 0] = 1
        Z = (X - mu) / sd
        Z = np.hstack([np.ones((n, 1)), Z])
        y, pid, bid = self.y, self.pid, self.bid
        lam_re = 1 / RE_SD ** 2
        D = d + 1

        def fg(w):
            beta, up, ub = w[:D], w[D:D + self.np_], w[D + self.np_:]
            eta = Z @ beta + up[pid] + ub[bid]
            p = 1 / (1 + np.exp(-eta))
            ll = np.sum(y * eta - np.logaddexp(0, eta))
            res = y - p
            gb = Z.T @ res - 1e-4 * np.r_[0, beta[1:]]
            gp = np.bincount(pid, res, self.np_) - lam_re * up
            gu = np.bincount(bid, res, self.nb) - lam_re * ub
            obj = -(ll - 0.5e-4 * beta[1:] @ beta[1:] - 0.5 * lam_re * (up @ up + ub @ ub))
            return obj, -np.r_[gb, gp, gu]

        w0 = np.zeros(D + self.np_ + self.nb)
        w0[0] = math.log(y.mean() / (1 - y.mean()))
        r = minimize(fg, w0, jac=True, method="L-BFGS-B", options=dict(maxiter=3000))
        w = r.x
        beta, up, ub = w[:D], w[D:D + self.np_], w[D + self.np_:]
        eta = Z @ beta + up[pid] + ub[bid]
        p = 1 / (1 + np.exp(-eta))
        # cluster-robust covariance for the fixed effects (random intercepts held at their estimates)
        Wd = p * (1 - p)
        H = (Z * Wd[:, None]).T @ Z + 1e-4 * np.diag(np.r_[0, np.ones(D - 1)])
        S = Z * (y - p)[:, None]
        G = np.zeros((self.g.max() + 1, D))
        np.add.at(G, self.g, S)
        Hi = np.linalg.pinv(H)
        cov = Hi @ (G.T @ G) @ Hi
        # back to raw units
        b_raw = beta[1:] / sd
        se_raw = np.sqrt(np.diag(cov)[1:]) / sd
        corr_raw = cov[1:, 1:] / np.outer(np.sqrt(np.diag(cov)[1:]), np.sqrt(np.diag(cov)[1:]))
        return dict(beta=beta, mu=mu, sd=sd, up=up, ub=ub, b_raw=b_raw, se_raw=se_raw, corr=corr_raw,
                    ll=float(np.sum(y * eta - np.logaddexp(0, eta))), n=n)

    @staticmethod
    def predict(m, X, pid, bid, extra=None):
        X = X if extra is None else np.hstack([X, extra])
        Z = np.hstack([np.ones((X.shape[0], 1)), (X - m["mu"]) / m["sd"]])
        up = np.r_[m["up"], 0.0]; ub = np.r_[m["ub"], 0.0]
        eta = Z @ m["beta"] + up[pid] + ub[bid]
        return 1 / (1 + np.exp(-eta))


def logloss_by_game(y, p, g):
    p = np.clip(p, 1e-9, 1 - 1e-9)
    ll = -(y * np.log(p) + (1 - y) * np.log(1 - p))
    G = g.max() + 1
    return np.bincount(g, ll, G), np.bincount(g, None, G)


def boot_gain(y, p0, p1, g, B=1000, seed=0):
    """Held-out gain in mean log loss (base minus term), with a game-clustered bootstrap SD."""
    l0, n = logloss_by_game(y, p0, g)
    l1, _ = logloss_by_game(y, p1, g)
    keep = n > 0
    d, n = (l0 - l1)[keep], n[keep]
    gain = d.sum() / n.sum()
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(d), (B, len(d)))
    bs = d[idx].sum(1) / n[idx].sum(1)
    return gain, bs.std()


# ---------------------------------------------------------------------------------------------- main
def main():
    rows = load()
    say(f"Statcast rows (classified pitches, no bunts): {len(rows)}; games {len({r['g'] for r in rows})}")
    tabs = season_tables(rows)
    # pitch count within the game for each pitcher, and the previous row in the same PA
    pc = defaultdict(int)
    pcs, prev_rows = [], []
    last_pa, last_i = None, None
    for i, r in enumerate(rows):
        key = (r["g"], r["pit"])
        pcs.append(pc[key]); pc[key] += 1
        pa = (r["g"], r["ab"])
        prev_rows.append(rows[last_i] if (last_pa == pa and last_i is not None) else None)
        last_pa, last_i = pa, i
    pits = {p: j for j, p in enumerate(sorted({r["pit"] for r in rows if r["yr"] == 2024}))}
    bats = {p: j for j, p in enumerate(sorted({r["bat"] for r in rows if r["yr"] == 2024}))}
    gmap = {g: j for j, g in enumerate(sorted({r["g"] for r in rows}))}
    base_seq = sequence(rows, 0.6, 0.4, tabs)
    for i, s in enumerate(base_seq):
        s["pc"] = pcs[i]
    ok = [all(v == v for v in (r["v"], r["x"], r["z"], r["top"], r["bot"])) for r in rows]
    Xc = np.array([controls(r, base_seq[i], tabs, prev_rows[i]) if ok[i] else [0.0] * 0 for i, r in enumerate(rows) if ok[i]])
    idx = np.array([i for i in range(len(rows)) if ok[i]])
    Xc = np.nan_to_num(Xc)
    yr = np.array([rows[i]["yr"] for i in idx])
    pid = np.array([pits.get(rows[i]["pit"], len(pits)) for i in idx])
    bid = np.array([bats.get(rows[i]["bat"], len(bats)) for i in idx])
    gid = np.array([gmap[rows[i]["g"]] for i in idx])
    desc = [rows[i]["desc"] for i in idx]
    pos = {i: j for j, i in enumerate(idx)}
    say(f"usable pitches {len(idx)} (train 2024 {int((yr == 2024).sum())}, test 2025 {int((yr == 2025).sum())}); "
        f"controls {Xc.shape[1]} columns; pitchers {len(pits)}, batters {len(bats)} in train")

    def subset(mask):
        return mask & (yr == 2024), mask & (yr == 2025)

    def model(name, mask, yv, feats, label):
        """Base vs base + feats. feats: (n_all, m) array aligned with idx. Returns summary dict."""
        tr, te = subset(mask)
        fit = Fit(Xc[tr], yv[tr], pid[tr], bid[tr], gid[tr], len(pits) + 1, len(bats) + 1)
        m0 = fit.run()
        m1 = fit.run(feats[tr])
        p0 = Fit.predict(m0, Xc[te], pid[te], bid[te])
        p1 = Fit.predict(m1, Xc[te], pid[te], bid[te], feats[te])
        gain, sd = boot_gain(yv[te], p0, p1, gid[te])
        k = feats.shape[1]
        b = m1["b_raw"][-k:]; se = m1["se_raw"][-k:]
        excl = all(abs(bb) > 1.96 * ss for bb, ss in zip(b, se))
        ship = gain > 2 * sd and excl
        say(f"  [{name}] {label}: train n={m1['n']}, test n={int(te.sum())}; beta={np.round(b, 4).tolist()} "
            f"se={np.round(se, 4).tolist()}; held-out gain {gain:.2e} (boot sd {sd:.2e}) -> {'SHIP' if ship else 'no ship'}")
        return dict(beta=b.tolist(), se=se.tolist(), gain=float(gain), sd=float(sd), ship=bool(ship),
                    ll_train=m1["ll"], corr=m1["corr"][-k:, -k:].tolist(), m1=m1)

    is_sw = np.array([d in SWING for d in desc])
    whiff = np.array([1.0 if d in WHIFF else 0.0 for d in desc])
    bip = np.array([d == "hit_into_play" for d in desc])
    ls = np.array([rows[i]["ls"] for i in idx])
    hard = np.where(ls >= 95, 1.0, 0.0)
    bipv = bip & (ls == ls)
    zone_out = np.array([rows[i]["zone"] in (11, 12, 13, 14) for i in idx])
    swing_v = is_sw.astype(float)
    kinds = [rows[i]["c"] for i in idx]
    is_fb = np.array([k_ == "FB" for k_ in kinds])
    res = {}

    # --- B(r): lambda x alpha grid, chosen on train log likelihood (whiff | swing)
    say("\n1. Timing B(r) on whiff | swing (spec beta_T = 0.5), grid lambda x alpha, chosen on train")
    best = None
    grid = {}
    for lam in (0.4, 0.5, 0.6, 0.7, 0.8):
        for alpha in (0.2, 0.4, 0.6):
            sq = sequence(rows, lam, alpha, tabs)
            Bv = np.array([[sq[i]["B"]] for i in idx])
            tr, _ = subset(is_sw)
            fit = Fit(Xc[tr], whiff[tr], pid[tr], bid[tr], gid[tr], len(pits) + 1, len(bats) + 1)
            m = fit.run(Bv[tr])
            grid[(lam, alpha)] = (m["ll"], m["b_raw"][-1], m["se_raw"][-1])
            say(f"    lambda {lam} alpha {alpha}: train ll {m['ll']:.1f} beta_T {m['b_raw'][-1]:+.3f} (se {m['se_raw'][-1]:.3f})")
            if best is None or m["ll"] > best[0]:
                best = (m["ll"], lam, alpha, Bv)
    _, lam_b, alpha_b, Bbest = best
    say(f"  best on train: lambda {lam_b}, alpha {alpha_b}")
    res["B_whiff"] = model("B", is_sw, whiff, Bbest, f"beta_T at lambda {lam_b}, alpha {alpha_b}")
    res["B_hard"] = model("B", bipv, hard, Bbest, "gamma_T on hard | ball in play (enters with a minus sign)")
    # alpha-beta_T correlation from the observed information of the (alpha, beta_T) profile, others fixed at optimum
    lls = {a: grid[(lam_b, a)] for a in (0.2, 0.4, 0.6)}
    if all(lls[a][0] == lls[a][0] for a in lls):
        # numerical: curvature in alpha of the profile vs curvature in beta (from se)
        l2, l4, l6 = lls[0.2][0], lls[0.4][0], lls[0.6][0]
        curv_a = -(l2 - 2 * l4 + l6) / 0.2 ** 2
        say(f"  profile curvature in alpha {curv_a:.2f}; beta_T across alpha: " +
            ", ".join(f"{a}: {lls[a][1]:+.3f}" for a in lls))
        slope = (lls[0.6][1] - lls[0.2][1]) / 0.4
        # beta_hat(alpha) slope relates to the correlation: corr ~ -slope * sd(alpha) / sd(beta)
        sd_a = 1 / math.sqrt(curv_a) if curv_a > 0 else float("inf")
        sd_b = lls[0.4][2]
        corr = max(-1.0, min(1.0, -slope * sd_a / sd_b)) if sd_b > 0 and sd_a < float("inf") else float("nan")
        say(f"  approx corr(alpha, beta_T) = {corr:+.2f} (rule: |corr| > 0.8 -> alpha fixed at 0.4)")
        res["corr_alpha_betaT"] = corr

    # --- Eye level E_y on whiff | swing, d* grid (lambda for y_hat shares the timing grid's best)
    say("\n2. Eye level E_y on whiff | swing (spec 0.25, d* 1.5), d* grid chosen on train; also on swing | off-zone")
    sq = sequence(rows, lam_b, alpha_b, tabs)
    best = None
    for ds in (1.0, 1.5, 2.0):
        E = np.array([[g_mod((1 if rows[i]["c"] == "FB" else -1) * (rows[i]["z"] - sq[i]["yh"]), ds) if sq[i]["prev"] is not None else 0.0] for i in idx])
        tr, _ = subset(is_sw)
        m = Fit(Xc[tr], whiff[tr], pid[tr], bid[tr], gid[tr], len(pits) + 1, len(bats) + 1).run(E[tr])
        say(f"    d* {ds}: train ll {m['ll']:.1f} beta_E {m['b_raw'][-1]:+.3f} (se {m['se_raw'][-1]:.3f})")
        if best is None or m["ll"] > best[0]:
            best = (m["ll"], ds, E)
    _, ds_b, Ebest = best
    res["E_whiff"] = model("E_y", is_sw, whiff, Ebest, f"beta_E at d* {ds_b}")
    res["E_chase"] = model("E_y", zone_out, swing_v, Ebest, "beta_E on swing | pitch outside the zone")

    # --- Tunneling from Statcast trajectories
    say("\n3. Tunneling tau_tun on whiff | swing (spec 0.15 x kappa_p), trajectories from Statcast's fit")
    T = np.zeros((len(idx), 1))
    n_t = 0
    for j, i in enumerate(idx):
        pv = sq[i]["prev"]
        if pv is None or rows[pv]["pt"] == rows[i]["pt"]:
            continue
        a, b_ = traj(rows[i]), traj(rows[pv])
        if a is None or b_ is None:
            continue
        dist = lambda u, v: 12 * math.hypot(u[0] - v[0], u[1] - v[1])
        d_rel, d_tun, d_pl = dist(a[0], b_[0]), dist(a[1], b_[1]), dist(a[2], b_[2])
        tau = max(-1.0, min(1.0, math.exp(-d_tun / 6) * g_mod(d_pl, 18) - d_rel / 8))
        T[j, 0] = tau * (1.5 if rows[i]["c"] in ("SL", "CB") else 1.0)
        n_t += 1
    say(f"  pitches with a different previous pitch and both trajectories: {n_t}")
    res["tun_whiff"] = model("tau_tun", is_sw, whiff, T, "beta_tun (kappa_p included in the feature)")
    res["tun_chase"] = model("tau_tun", zone_out, swing_v, T, "beta_tun on swing | outside the zone")

    # --- Familiarity by class on hard | ball in play
    say("\n4. Familiarity: n of this class seen from this pitcher in earlier PAs today, on hard | ball in play")
    say("   (spec phi_FB 0.058, phi_OS 0.116, cap 0.5; features clipped at the cap's n)")
    Fm = np.array([[min(sq[i]["n_fb"], 0.5 / 0.058) * (rows[i]["c"] == "FB"),
                    min(sq[i]["n_os"], 0.5 / 0.116) * (rows[i]["c"] != "FB")] for i in idx])
    res["fam_all"] = model("familiarity", bipv, hard, Fm, "phi_FB, phi_OS, all starts (TTO control kept)")
    bf = defaultdict(set)
    for r in rows:
        bf[(r["g"], r["pit"])].add(r["ab"])
    long_ = np.array([len(bf[(rows[i]["g"], rows[i]["pit"])]) >= 18 for i in idx])
    res["fam_long"] = model("familiarity", bipv & long_, hard, Fm, "phi_FB, phi_OS, starts reaching >= 18 batters")
    # without the TTO control (TTO and n are collinear by construction)
    tto_cols = [11 + 5 + 6, 11 + 5 + 6 + 1]
    keep = [c for c in range(Xc.shape[1]) if c not in tto_cols]
    Xsave = Xc
    Xc = Xsave[:, keep]
    res["fam_noTTO"] = model("familiarity", bipv, hard, Fm, "phi_FB, phi_OS, all starts, TTO control dropped")
    Xc = Xsave

    # --- Ground balls: GB_p by type and beta_y
    say("\n5. Ground ball | ball in play: beta_y per ft of height (spec -0.8), gamma by contact; GB_p by type")
    gb = np.array([1.0 if rows[i]["bb"] == "ground_ball" else 0.0 for i in idx])
    bipt = bip & np.array([rows[i]["bb"] != "" for i in idx])
    Yh = np.array([[rows[i]["z"] - 2.5] for i in idx])
    res["gb_y"] = model("beta_y", bipt, gb, Yh, "beta_y (plate height - 2.5 ft)")
    types = defaultdict(lambda: [0, 0])
    for j, i in enumerate(idx):
        if bipt[j] and yr[j] == 2024:
            key = "sink" if rows[i]["pt"] == "SI" else ("cut" if rows[i]["pt"] == "FC" else ("4-seam" if rows[i]["pt"] == "FF" else rows[i]["c"]))
            types[key][0] += gb[j]; types[key][1] += 1
    spec_gb = {"4-seam": 0.379, "sink": 0.495, "cut": 0.430, "SL": 0.439, "CB": 0.487, "CH": 0.478}
    say("  raw 2024 GB rate by type (data vs spec): " + ", ".join(f"{k}: {v[0] / v[1]:.3f} vs {spec_gb[k]}" for k, v in types.items()))
    res["gb_types"] = {k: v[0] / v[1] for k, v in types.items()}

    # --- Count zone kappa(b,k) on called pitches near the edge
    say("\n6. Count zone kappa(b,k): called strike | take, edge pitches (base location model p in 0.1..0.9)")
    take = np.array([d in TAKE for d in desc])
    cs = np.array([1.0 if d == "called_strike" else 0.0 for d in desc])
    tr, te = subset(take)
    nc = 11
    m_loc = Fit(Xc[:, nc:][tr], cs[tr], pid[tr], bid[tr], gid[tr], len(pits) + 1, len(bats) + 1).run()
    pl = Fit.predict(m_loc, Xc[:, nc:], pid, bid)
    edge = take & (pl > 0.1) & (pl < 0.9)
    cnt_feats = Xc[:, :nc]
    Xsave = Xc
    Xc = Xsave[:, nc:]
    res["kappa"] = model("kappa", edge, cs, cnt_feats, "count dummies (vs 0-0) on edge takes")
    Xc = Xsave
    counts = [(b, k) for b in range(4) for k in range(3)][1:]
    A = lambda b, k: 3.03 + 0.22 * b - 0.30 * k
    say("  fitted kappa vs spec log(A/A00): " + ", ".join(
        f"{b}-{k}: {res['kappa']['beta'][j]:+.2f} vs {math.log(A(b, k) / A(0, 0)):+.2f}" for j, (b, k) in enumerate(counts)))

    clean = {k: {kk: vv for kk, vv in v.items() if kk != "m1"} if isinstance(v, dict) and "m1" in v else v for k, v in res.items()}
    clean["shape"] = dict(lam=lam_b, alpha=alpha_b, dstar_E=ds_b)
    say(f"\nCorrelation of the fitted term coefficients (cluster-robust): familiarity (FB, OS) "
        f"{np.round(fam_corr(res), 2).tolist()}")
    say("\nNotes: random intercepts are MAP-penalized (prior SD 0.25), not integrated out; coefficient intervals are\n"
        "cluster-robust with the intercepts held fixed. Data are every 4th day of each season (about 1/4 of games).\n"
        "MLB effects transfer to college unchanged and to HS/travel scaled by 0.6 (untestable assumption).")
    json.dump(dict(results=clean, grid={f"{a},{b}": v[:2] for (a, b), v in grid.items()}), open(OUT_JSON, "w"), indent=1, default=float)
    decide()
    open(OUT_TXT, "w").write("\n".join(lines) + "\n")


def fam_corr(res):
    return np.array(res["fam_all"]["corr"])


SPEC = dict(B_whiff=[0.5], B_hard=[-0.3], E_whiff=[0.25], E_chase=[0.25], tun_whiff=[0.15], tun_chase=[0.15],
            fam_all=[0.058, 0.116], gb_y=[-0.8])


def decide():
    """Ship rule (spec 10) plus amendment A3. A block of coefficients (count zone, familiarity) ships on the held-out
    gain and a joint 95% Wald test. A term that does not ship keeps the spec's guess if its 95% interval includes it;
    if the interval excludes the guess, the fitted value is used when its interval also excludes 0, else the term is 0."""
    d = json.load(open(OUT_JSON))
    res, shape = d["results"], d["results"]["shape"]
    out, why = {}, {}

    def joint_excludes_zero(r):
        b = np.array(r["beta"]); se = np.array(r["se"]); C = np.array(r["corr"])
        cov = np.outer(se, se) * C
        w = float(b @ np.linalg.solve(cov, b))
        from scipy.stats import chi2
        return w > chi2.ppf(0.95, len(b)), w

    def ships(r):
        if len(r["beta"]) > 1:
            return r["gain"] > 2 * r["sd"] and joint_excludes_zero(r)[0]
        return r["ship"]

    def one(key, j=0):
        r = res[key]
        b, se, g = r["beta"][j], r["se"][j], SPEC[key][j]
        lo, hi = b - 1.96 * se, b + 1.96 * se
        if ships(r):
            return b, f"ships at {b:+.3f} (spec {g:+.3f})"
        if lo <= g <= hi:
            return g, f"no ship; interval {lo:+.3f}..{hi:+.3f} includes the spec {g:+.3f} -> keep spec"
        if lo > 0 or hi < 0:
            return b, f"no ship; interval {lo:+.3f}..{hi:+.3f} excludes the spec {g:+.3f} and 0 -> fitted {b:+.3f}"
        return 0.0, f"no ship; interval {lo:+.3f}..{hi:+.3f} excludes the spec {g:+.3f}, includes 0 -> off (0)"

    out["beta_T"], why["beta_T"] = one("B_whiff")
    v, why["gamma_T"] = one("B_hard"); out["gamma_T"] = -v
    if res["B_whiff"]["ship"] or res["B_hard"]["ship"]:
        c = res.get("corr_alpha_betaT", float("nan"))
        out["lam"] = shape["lam"]
        out["alpha"] = 0.4 if (c == c and abs(c) > 0.8) else shape["alpha"]
        why["lam/alpha"] = (f"best grid values (lambda {shape['lam']}, alpha {shape['alpha']}); corr(alpha, beta_T) "
                            f"{'not computable: the train likelihood rises to the grid edge in alpha' if c != c else f'{c:+.2f}'}")
    out["beta_E"], why["beta_E"] = one("E_whiff")
    out["beta_E_S"], why["beta_E_S"] = one("E_chase")
    if res["E_whiff"]["ship"]:
        out["dstar_E"] = shape["dstar_E"]
    # v1.0 D5: tunneling on whiffs and on chase swings ship from their own fits (previously one beta_tun from tun_whiff
    # only, so the chase fit's +0.310 never reached the engine)
    out["beta_tun_whiff"], why["beta_tun_whiff"] = one("tun_whiff")
    out["beta_tun_chase"], why["beta_tun_chase"] = one("tun_chase")
    for j, nm in enumerate(("phi_FB", "phi_OS")):
        out[nm], why[nm] = one("fam_all", j)
        out[nm] = max(0.0, out[nm])
    v, why["beta_y"] = one("gb_y")
    out["beta_y"] = v
    counts = [(b, k) for b in range(4) for k in range(3)][1:]
    if ships(res["kappa"]):
        out["kappa"] = {f"{b}-{k}": res["kappa"]["beta"][j] for j, (b, k) in enumerate(counts)}
        why["kappa"] = (f"ships (held-out gain {res['kappa']['gain']:.2e}, {res['kappa']['gain'] / res['kappa']['sd']:.1f} boot SD; "
                        f"joint Wald {joint_excludes_zero(res['kappa'])[1]:.0f} on 11 df): fitted count zone replaces the linear area rule")
    else:
        why["kappa"] = "no ship: keep the linear area rule"
    say("\nDecisions (spec 10 ship rule; A3 for terms that do not ship)")
    for k_ in why:
        say(f"  {k_}: {why[k_]}")
    d["ship"] = out
    d["why"] = why
    json.dump(d, open(OUT_JSON, "w"), indent=1, default=float)
    return out


if __name__ == "__main__":
    if "--decide" in sys.argv:
        decide()
        open(OUT_TXT, "a").write("\n".join(lines) + "\n")
    else:
        main()
