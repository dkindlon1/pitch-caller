"""v0.8 step 7 (spec 7.1): win expectancy and leverage tables from the corrected, calibrated chain (we_rates.json).
1. Run distribution P(r | o, B) for the rest of the half-inning (r = 0..RMAX, last bin = RMAX or more).
2. WE for the HOME team by backward recursion over half-innings, both teams level-average; the game ends after N
   innings if not tied (bottom half skipped when home leads; walk-off the moment home leads); extras to N + 6, then 0.5;
   optional runner on 2nd to start each extra half. Margin (home minus away) clamped to +-15.
3. LI(state) = E|dWE over the plate appearance| / its frequency-weighted mean over an average game's plate appearances.
Stored per level, N in {7, 9}, extras runner {0, 1}: we_tables.json.
The engine reads the pitching team's WE: home pitches in the top half, away in the bottom.
usage: python3 we_tables.py   (also prints the step-7 checks)"""
import json, os
import college_rates as cr
from run_tables import RE_BY_LEVEL

HERE = os.path.dirname(os.path.abspath(__file__))
RMAX = 15
MCAP = 15
STATES = [(o, b) for o in range(3) for b in range(8)]


def chain(level):
    return json.load(open(os.path.join(HERE, "we_rates.json")))[level]["rates"]


def trans_table(r):
    """(o, b) -> list of (p, runs, o', b'); o' = 3 ends the half."""
    return {s: [(p, min(runs, RMAX), min(no, 3), nb if no < 3 else 0) for p, runs, no, nb in cr.transitions(r, *s) if p > 0]
            for s in STATES}


def run_dist(T):
    """P(r more runs this half | o, b), by iteration of the expected-runs-to-go distribution to a fixed point."""
    D = {s: [0.0] * (RMAX + 1) for s in STATES}
    for _ in range(200):
        nd = {}
        for s in STATES:
            v = [0.0] * (RMAX + 1)
            for p, runs, no, nb in T[s]:
                if no >= 3:
                    v[runs] += p
                else:
                    for k, q in enumerate(D[(no, nb)]):
                        if q:
                            v[min(RMAX, runs + k)] += p * q
            nd[s] = v
        delta = max(abs(a - b) for s in STATES for a, b in zip(nd[s], D[s]))
        D = nd
        if delta < 1e-12:
            break
    return D


def clampm(m):
    return max(-MCAP, min(MCAP, m))


def build(level, N, xr, win=1.0, loss=0.0):
    """win/loss: payoff when home wins/loses (1, 0 = home WE; 0, 1 = away WE as an independent check)."""
    r = chain(level)
    T = trans_table(r)
    D = run_dist(T)
    last = N + 6
    halves = [(i, h) for i in range(1, last + 1) for h in (0, 1)]       # h 0 = top (away bats), 1 = bottom (home bats)
    M = range(-MCAP, MCAP + 1)
    start = lambda i: (0, 2) if (xr and i > N) else (0, 0)

    S = {}          # S[(i, h)][m] = home WE at the start of half (i, h), home margin m (before any runner placed)
    E = {}          # E[(i, h)][m] = home WE at the end of half (i, h) with home margin m (after the 3rd out)
    W = {}          # W[(i, h)][(o, b, m)] = home WE inside the half

    def after(i, h, m):
        """Home WE when half (i, h) has ended with home margin m."""
        if h == 0:                              # top over: home bats next unless already ahead in the last inning(s)
            if i >= N and m > 0:
                return win
            return S[(i, 1)][m] if (i, 1) in S else 0.5
        if i >= N:                              # bottom over in regulation or extras
            if m > 0:
                return win
            if m < 0:
                return loss
            return S[(i + 1, 0)][0] if i + 1 <= last else 0.5
        return S[(i + 1, 0)][m]

    for (i, h) in reversed(halves):
        E[(i, h)] = {m: after(i, h, m) for m in M}
        Wi = {}
        for (o, b) in STATES:
            for m in M:
                if h == 1 and i >= N and m > 0:
                    Wi[(o, b, m)] = win          # walk-off already happened
                    continue
                v = 0.0
                for k, q in enumerate(D[(o, b)]):
                    if not q:
                        continue
                    if h == 0:
                        v += q * E[(i, h)][clampm(m - k)]
                    else:
                        mm = clampm(m + k)
                        if i >= N and mm > 0:
                            v += q * win         # walk-off: the game ends the moment home leads
                        else:
                            v += q * E[(i, h)][mm]
                Wi[(o, b, m)] = v
        W[(i, h)] = Wi
        so, sb = start(i)
        S[(i, h)] = {m: Wi[(so, sb, m)] for m in M}
        if h == 1 and i >= N:
            S[(i, h)] = {m: (win if m > 0 else Wi[(so, sb, m)]) for m in M}
    return T, D, W, E, S


def leverage(level, N, xr, T, W, E):
    """LI by forward propagation through an average game (start: top 1st, 0 out, empty, tied)."""
    last = N + 6

    def we(i, h, o, b, m):
        return E[(i, h)][clampm(m)] if o >= 3 else W[(i, h)][(o, b, clampm(m))]

    def dWE(i, h, o, b, m):
        v = we(i, h, o, b, m)
        tot = 0.0
        for p, runs, no, nb in T[(o, b)]:
            mm = m - runs if h == 0 else m + runs
            if h == 1 and i >= N and mm > 0:
                nv = 1.0
            else:
                nv = we(i, h, no, nb, mm)
            tot += p * abs(nv - v)
        return tot

    dist = {(1, 0, 0, 0, 0): 1.0}
    visits = {}
    for _ in range(4000):
        if not dist:
            break
        nd = {}
        for (i, h, o, b, m), pm in dist.items():
            if pm < 1e-10:
                continue
            visits[(i, h, o, b, m)] = visits.get((i, h, o, b, m), 0.0) + pm
            for p, runs, no, nb in T[(o, b)]:
                mm = clampm(m - runs if h == 0 else m + runs)
                if h == 1 and i >= N and mm > 0:
                    continue                      # walk-off
                if no < 3:
                    key = (i, h, no, nb, mm)
                else:                             # next half
                    if h == 0:
                        if i >= N and mm > 0:
                            continue
                        key = (i, 1, 0, 2 if (xr and i > N) else 0, mm)
                    else:
                        if i >= N and mm != 0:
                            continue
                        if i + 1 > last:
                            continue
                        key = (i + 1, 0, 0, 2 if (xr and i + 1 > N) else 0, mm)
                nd[key] = nd.get(key, 0.0) + pm * p
        dist = nd
    num = sum(v * dWE(*k) for k, v in visits.items())
    den = sum(visits.values())
    mean = num / den
    li_mean = sum(v * dWE(*k) / mean for k, v in visits.items()) / den
    LI = {(i, h): {(o, b): [dWE(i, h, o, b, m) / mean for m in range(-MCAP, MCAP + 1)] for (o, b) in STATES}
          for (i, h) in W if i <= N + 1}
    return mean, visits, li_mean, den, LI


def main():
    out = {}
    lines = []
    for level in ("hs", "college_d3", "college_d1", "mlb"):
        for N in (7, 9):
            for xr in (0, 1):
                T, D, W, E, S = build(level, N, xr)
                mean_d, visits, li_mean, pa_per_game, LI = leverage(level, N, xr, T, W, E)
                _, _, Wa, Ea, Sa = build(level, N, xr, win=0.0, loss=1.0)
                sum_err = max(abs(W[k][st] + Wa[k][st] - 1) for k in W for st in W[k])
                key = f"{level}|{N}|{xr}"
                # store innings 1..N+1 (later extras reuse N+1, which differs from them by < 0.005: see check)
                tab = {}
                for (i, h), Wi in W.items():
                    if i > N + 1:
                        continue
                    tab[f"{i}{'tb'[h]}"] = {"W": {f"{o}{b}": [round(Wi[(o, b, m)], 4) for m in range(-MCAP, MCAP + 1)]
                                                 for (o, b) in STATES},
                                            "L": {f"{o}{b}": [round(x, 3) for x in LI[(i, h)][(o, b)]] for (o, b) in STATES},
                                            "E": [round(E[(i, h)][m], 4) for m in range(-MCAP, MCAP + 1)]}
                out[key] = dict(tab=tab, mean_dwe=mean_d, N=N, xr=xr)
                if xr == 0:
                    mean_runs = sum(k * q for k, q in enumerate(D[(0, 0)]))
                    re0 = RE_BY_LEVEL[level][(0, "000")]
                    we_home = S[(1, 0)][0]
                    drift = max(abs(W[(N + 1, h)][(o, b, m)] - W[(N + 2, h)][(o, b, m)]) for h in (0, 1) for (o, b) in STATES for m in range(-3, 4))
                    lines.append(f"{key}: mean runs/half {mean_runs:.4f} vs RE(0,empty) {re0:.4f} ({100 * (mean_runs / re0 - 1):+.2f}%, "
                                 f"limit 2%) {'PASS' if abs(mean_runs / re0 - 1) <= 0.02 else 'FAIL'}; home WE at start, tied "
                                 f"{we_home:.4f} {'PASS' if abs(we_home - 0.5) <= 0.005 else 'FAIL'}; home+away WE max |sum-1| {sum_err:.1e} "
                                 f"{'PASS' if sum_err < 1e-9 else 'FAIL'}; LI mean {li_mean:.4f}; PA/game {pa_per_game:.1f}; "
                                 f"extras N+1 vs N+2 max diff {drift:.4f}")
    path = os.path.join(HERE, "we_tables.json")
    json.dump(out, open(path, "w"), separators=(",", ":"))
    print("\n".join(lines))
    print(f"wrote {path} ({os.path.getsize(path) / 1e6:.2f} MB)")
    open(os.path.join(HERE, "results", "v08_step7_we_checks.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
