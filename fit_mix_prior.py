"""v1.0 3.7: what real pitchers do, as the baseline the engine's costs move the mix away from. Reads the Statcast regular
season files (fetch_statcast.py: 2024 and 2025, every 4th day) and writes mix_prior.json:
  u_T[composition][count][platoon][kind]  pitch-type usage. Kinds from seq_fit.CLASS. A pitcher-season (300+ pitches in
      the sample) has the composition of the kinds he throws 5%+ of the time. Value = the average, over pitcher-seasons
      with that composition, of each one's own share of that kind in that count and platoon cell. Compositions with fewer
      than 40 pitcher-seasons are not stored: the engine uses "all" (every qualifying pitcher-season) renormalized over
      the arsenal's kinds.
  u_L[kind][count][platoon][target]       target usage, from pitch locations with statcast_check's attack zones:
      Statcast zone 5 -> middle; other heart and shadow pitches -> the four corners by quadrant (inside/away by plate_x,
      flipped for right-handed batters; up/down by plate_z against the middle of that batter's zone); chase region ->
      chase; waste dropped. Normalized over the targets allowed in that count (engine.targets).
  Cells with fewer than 200 pitches use their count group (ahead 0-1/0-2/1-2, even 0-0/1-1/2-2, behind 1-0/2-0/2-1/3-1,
  3-0, full 3-2). 3-0 is its own group, so a 3-0 cell still under 200 (off-speed at 3-0 is rare: the same-side curveball
  has none in the sample) uses the nearest group, behind, over the targets allowed at 3-0 (v1.0 log, 3.7).
  Two pitches of one kind split that kind's usage evenly (done in the engine).
usage: python3 fit_mix_prior.py"""
import csv, glob, json, os, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
import engine as e

CLASS = {"FF": "FB", "SI": "FB", "FC": "FB", "SL": "SL", "ST": "SL", "SV": "SL", "CU": "CB", "KC": "CB", "CS": "CB",
         "CH": "CH", "FS": "CH", "FO": "CH"}          # = seq_fit.CLASS (seq_fit runs a fit on import, so it is copied)
KINDS = ("FB", "SL", "CB", "CH")
COUNTS = [f"{b}-{k}" for (b, k) in e.COUNTS]
GROUP = {"0-1": "ahead", "0-2": "ahead", "1-2": "ahead", "0-0": "even", "1-1": "even", "2-2": "even", "1-0": "behind",
         "2-0": "behind", "2-1": "behind", "3-1": "behind", "3-0": "3-0", "3-2": "full"}
MIN_PITCHES, MIN_SHARE, MIN_COMP, MIN_CELL = 300, 0.05, 40, 200
OUT = os.path.join(ROOT, "mix_prior.json")


def zone(r):
    """statcast_check.zone: attack zone by the larger of the normalized horizontal / vertical distances."""
    try:
        x, z, top, bot = float(r["plate_x"]), float(r["plate_z"]), float(r["sz_top"]), float(r["sz_bot"])
    except ValueError:
        return None
    nx = x / 0.83
    nz = (z - (top + bot) / 2) / ((top - bot) / 2 + 0.121)
    m = max(abs(nx), abs(nz))
    return "heart" if m < 0.67 else "edge" if m < 1.33 else "off" if m < 2.0 else "noncomp"


def target(r):
    zn = zone(r)
    if zn is None or zn == "noncomp":
        return None
    if zn == "off":
        return "chase"
    if r.get("zone") == "5":
        return "middle"
    x, z = float(r["plate_x"]), float(r["plate_z"])
    inside = (-x if r["stand"] == "R" else x) > 0
    up = z > (float(r["sz_top"]) + float(r["sz_bot"])) / 2
    return ("up-" if up else "down-") + ("in" if inside else "away")


def main():
    files = sorted(glob.glob(os.path.join(ROOT, "data", "statcast", "sc_*.csv")))
    if not files:
        raise SystemExit("no Statcast files: run python3 fetch_statcast.py first")
    rows = []
    for fn in files:
        for r in csv.DictReader(open(fn, encoding="utf-8-sig")):
            if r.get("game_type") != "R":
                continue
            kd = CLASS.get(r["pitch_type"])
            b, k = r["balls"], r["strikes"]
            if kd is None or f"{b}-{k}" not in GROUP or r["stand"] not in "LR" or r["p_throws"] not in "LR":
                continue
            rows.append((r["pitcher"], r["game_year"], kd, f"{b}-{k}", "same" if r["stand"] == r["p_throws"] else "opp", target(r)))
    # pitcher-seasons and their compositions
    tot = defaultdict(int)
    by_kind = defaultdict(lambda: defaultdict(int))
    for p, y, kd, c, pl, t in rows:
        tot[(p, y)] += 1
        by_kind[(p, y)][kd] += 1
    comp = {}
    for ps, n in tot.items():
        if n >= MIN_PITCHES:
            comp[ps] = "+".join(kd for kd in KINDS if by_kind[ps][kd] / n >= MIN_SHARE)
    n_comp = defaultdict(int)
    for ps, cp in comp.items():
        n_comp[cp] += 1
    # per pitcher-season cell counts: (count, platoon) and (group, platoon)
    cell = defaultdict(lambda: defaultdict(int))        # (ps, cellkey) -> kind -> n
    for p, y, kd, c, pl, t in rows:
        ps = (p, y)
        if ps in comp:
            cell[(ps, c, pl)][kd] += 1
            cell[(ps, GROUP[c], pl)][kd] += 1

    def u_t(members, kinds, ckey, pl):
        shares, n_pitches = defaultdict(float), 0
        m = 0
        for ps in members:
            d = cell.get((ps, ckey, pl))
            if not d:
                continue
            n = sum(d.values())
            n_pitches += n
            m += 1
            for kd in kinds:
                shares[kd] += d.get(kd, 0) / n
        return ({kd: shares[kd] / m for kd in kinds} if m else None), n_pitches

    def table_for(members, kinds):
        out, pooled = {}, 0
        for c in COUNTS:
            out[c] = {}
            for pl in ("same", "opp"):
                v, n = u_t(members, kinds, c, pl)
                if v is None or n < MIN_CELL:
                    v, n = u_t(members, kinds, GROUP[c], pl)
                    pooled += 1
                    if v is None or n < MIN_CELL:
                        v, _ = u_t(members, kinds, "behind", pl)
                        thin.append(f"u_T {cp_name(kinds)} {c} {pl}")
                out[c][pl] = {kd: round(x, 6) for kd, x in v.items()}
        return out, pooled

    uT, report = {}, []
    thin = []
    cp_name = lambda kinds: "+".join(kinds) if len(kinds) < 4 or kinds != KINDS else "all"
    allm = list(comp)
    uT["all"], pooled = table_for(allm, KINDS)
    report.append(f"all: {len(allm)} pitcher-seasons, {pooled} pooled cells")
    for cp, n in sorted(n_comp.items(), key=lambda kv: -kv[1]):
        report.append(f"{cp}: {n} pitcher-seasons" + ("" if n >= MIN_COMP else " (under 40: uses 'all')"))
        if n >= MIN_COMP and cp:
            members = [ps for ps, c in comp.items() if c == cp]
            uT[cp], pooled = table_for(members, cp.split("+"))
            report[-1] += f", {pooled} pooled cells"
    # target usage
    tl = defaultdict(lambda: defaultdict(int))
    for p, y, kd, c, pl, t in rows:
        if t is None:
            continue
        tl[(kd, c, pl)][t] += 1
        tl[(kd, GROUP[c], pl)][t] += 1
    uL, pooled_l = {}, 0
    for kd in KINDS:
        uL[kd] = {}
        for c in COUNTS:
            b, k = (int(x) for x in c.split("-"))
            allowed = e.targets(b, k)
            uL[kd][c] = {}
            for pl in ("same", "opp"):
                d = tl[(kd, c, pl)]
                n = sum(d[q] for q in allowed)
                if n < MIN_CELL:
                    d = tl[(kd, GROUP[c], pl)]
                    n = sum(d[q] for q in allowed)
                    pooled_l += 1
                    if n < MIN_CELL:
                        d = tl[(kd, "behind", pl)]
                        n = sum(d[q] for q in allowed)
                        thin.append(f"u_L {kd} {c} {pl}")
                uL[kd][c][pl] = {q: round(d[q] / n, 6) for q in allowed}
    report.append(f"u_L: {pooled_l} of {len(KINDS) * len(COUNTS) * 2} cells pooled to their count group")
    report.append(f"{len(thin)} cells still under {MIN_CELL} after that, using the behind group: " + ", ".join(thin))
    doc = dict(source=f"Statcast regular season 2024-25 (fetch_statcast.py sample: {len(files)} days), {len(rows)} pitches",
               rules=dict(min_pitches=MIN_PITCHES, min_share=MIN_SHARE, min_comp=MIN_COMP, min_cell=MIN_CELL, groups=GROUP),
               pitcher_seasons=len(comp), compositions={cp: n for cp, n in sorted(n_comp.items(), key=lambda kv: -kv[1])},
               thin_cells=thin, u_T=uT, u_L=uL)
    json.dump(doc, open(OUT, "w"), indent=1, sort_keys=True)
    print("\n".join(report))
    mn_t = min(v for t in uT.values() for c in t.values() for p in c.values() for v in p.values())
    mn_l = min(v for t in uL.values() for c in t.values() for p in c.values() for v in p.values())
    print(f"smallest stored u_T {mn_t:.4f}, smallest u_L {mn_l:.4f}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
