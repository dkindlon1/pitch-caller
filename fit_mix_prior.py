"""v1.0 3.7: what real pitchers do, as the baseline the engine's costs move the mix away from. Reads the Statcast regular
season files (fetch_statcast.py: 2024 and 2025, every 4th day) and writes mix_prior.json:
  u_T[composition][count][platoon][kind]  pitch-type usage. Kinds from seq_fit.CLASS. A pitcher-season (300+ pitches in
      the sample) has the composition of the kinds he throws 5%+ of the time. Value = the average, over pitcher-seasons
      with that composition, of each one's own share of that kind in that count and platoon cell. A composition with
      fewer than 40 pitcher-seasons gets its table from the ROLE POOL for its arsenal size instead (Drew, Nov 7): every
      qualifying pitcher-season with that many kinds, averaged by role - the fastball, then that pitcher's own
      secondaries ranked by how much he throws them - with the roles then mapped onto this arsenal's kinds, ranked the
      same way across the whole sample. It is stored under the composition's own name, so the engines' u_T[composition]
      lookup is unchanged. Only a composition with no fastball, with one kind, or whose size pool is itself under 40
      still falls back to "all" (all-pitcher kind shares renormalized over the arsenal's kinds). Pooling by size exists
      because "all" is dominated by four-pitch pitchers, so it gave a two-pitch pitcher a four-pitch pitcher's curveball
      rate.
      A kind with no pitches at all in its cell is not stored as 0: a 0 weight deletes that pitch type in the operator
      with no why line, so that one kind is pooled to its count group and then "behind", the way u_L pools a thin cell.
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
        per_kind = defaultdict(int)          # raw pitches per kind, so a kind with none can be spotted
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
                per_kind[kd] += d.get(kd, 0)
        return ({kd: shares[kd] / m for kd in kinds} if m else None), n_pitches, per_kind

    def table_for(members, kinds):
        out, pooled = {}, 0
        for c in COUNTS:
            out[c] = {}
            for pl in ("same", "opp"):
                v, n, pk = u_t(members, kinds, c, pl)
                if v is None or n < MIN_CELL:
                    v, n, pk = u_t(members, kinds, GROUP[c], pl)
                    pooled += 1
                    if v is None or n < MIN_CELL:
                        v, _, pk = u_t(members, kinds, "behind", pl)
                        thin.append(f"u_T {cp_name(kinds)} {c} {pl}")
                # A kind nobody in this group threw in this cell would be stored as exactly 0.0, and a 0 weight
                # deletes that pitch type in the operator with no why line - against plan 3.7's promise that a
                # pitch only reaches 0% when a guard removes it and gives a reason. The cell can be thick overall
                # and still have none of one kind (the same-side curveball at 3-0), because the thin-cell test
                # above is on the cell's total across kinds. So pool that one kind the way u_L pools a thin cell:
                # its count group, then behind. Shares need not sum to 1 (kinds under MIN_SHARE take the rest)
                # and the engine renormalizes over the surviving types, so substituting one kind is safe.
                v = dict(v)
                for kd in kinds:
                    if pk.get(kd, 0):
                        continue
                    for fb in (GROUP[c], "behind"):
                        gv, _, gpk = u_t(members, kinds, fb, pl)
                        if gv is not None and gpk.get(kd, 0):
                            v[kd] = gv[kd]
                            zeroed.append(f"u_T {cp_name(kinds)} {c} {pl} {kd} <- {fb}")
                            break
                out[c][pl] = {kd: round(x, 6) for kd, x in v.items()}
        return out, pooled

    uT, report = {}, []
    thin, zeroed = [], []
    cp_name = lambda kinds: "+".join(kinds) if len(kinds) < 4 or kinds != KINDS else "all"
    allm = list(comp)
    uT["all"], pooled = table_for(allm, KINDS)
    report.append(f"all: {len(allm)} pitcher-seasons, {pooled} pooled cells")

    # --- role tables, pooled by arsenal size (Drew, Nov 7) ---------------------------------------------
    # A composition under MIN_COMP used to fall back to "all": all-pitcher *kind* shares renormalized over
    # its kinds. That hands a two-pitch pitcher a four-pitch pitcher's curveball rate (FB+CB at 3-1 came out
    # FB 98.2% / CB 1.8%, so the engine called the fastball 99.2% and B1/B2/B5 failed on it). Instead pool
    # every qualifying pitcher-season with the same NUMBER of kinds into one table by ROLE - the fastball,
    # then that pitcher's own secondaries ranked by how much he throws them - and map those roles onto the
    # arsenal's kinds, ranked the same way globally. The result is stored under the composition's own name,
    # so both engines' existing u_T[composition] lookup finds it with no engine change.
    kind_tot = defaultdict(int)
    for ps in comp:
        for kd, nn in by_kind[ps].items():
            kind_tot[kd] += nn
    rank = sorted(KINDS, key=lambda kd: (-kind_tot[kd], KINDS.index(kd)))

    role_of, size_of = {}, {}
    for ps, cp in comp.items():
        ks = cp.split("+") if cp else []
        if "FB" not in ks or len(ks) < 2:
            continue
        secs = sorted([k for k in ks if k != "FB"], key=lambda k: (-by_kind[ps][k], KINDS.index(k)))
        role_of[ps] = {"FB": "FB"}
        role_of[ps].update({k: f"S{i + 1}" for i, k in enumerate(secs)})
        size_of[ps] = len(ks)

    rcell = defaultdict(lambda: defaultdict(int))      # (ps, cellkey) -> role -> n, with "_n" the cell total
    for p, y, kd, c, pl, t in rows:
        ps = (p, y)
        if ps not in role_of:
            continue
        r = role_of[ps].get(kd)
        for ckey in ((ps, c, pl), (ps, GROUP[c], pl)):
            rcell[ckey]["_n"] += 1
            if r:
                rcell[ckey][r] += 1

    def u_role(members, roles, ckey, pl):
        shares, n_pitches, per_role, m = defaultdict(float), 0, defaultdict(int), 0
        for ps in members:
            d = rcell.get((ps, ckey, pl))
            if not d or not d["_n"]:
                continue
            n = d["_n"]
            n_pitches += n
            m += 1
            for r in roles:
                shares[r] += d.get(r, 0) / n
                per_role[r] += d.get(r, 0)
        return ({r: shares[r] / m for r in roles} if m else None), n_pitches, per_role

    def role_table(size):
        roles = ["FB"] + [f"S{i + 1}" for i in range(size - 1)]
        members = [ps for ps in role_of if size_of[ps] == size]
        if len(members) < MIN_COMP:
            return None, roles, len(members)
        out = {}
        for c in COUNTS:
            out[c] = {}
            for pl in ("same", "opp"):
                v, n, pr = u_role(members, roles, c, pl)
                if v is None or n < MIN_CELL:
                    v, n, pr = u_role(members, roles, GROUP[c], pl)
                    if v is None or n < MIN_CELL:
                        v, _, pr = u_role(members, roles, "behind", pl)
                        thin.append(f"u_T role{size} {c} {pl}")
                v = dict(v)
                for r in roles:                     # same per-role zero pooling as table_for
                    if pr.get(r, 0):
                        continue
                    for fb in (GROUP[c], "behind"):
                        gv, _, gpr = u_role(members, roles, fb, pl)
                        if gv is not None and gpr.get(r, 0):
                            v[r] = gv[r]
                            zeroed.append(f"u_T role{size} {c} {pl} {r} <- {fb}")
                            break
                out[c][pl] = v
        return out, roles, len(members)

    rtabs = {}
    for size in (2, 3, 4):
        rt, roles, nm = role_table(size)
        rtabs[size] = (rt, roles)
        report.append(f"role pool, {size}-kind arsenals: {nm} pitcher-seasons"
                      + ("" if rt else f" (under {MIN_COMP}: those compositions fall back to 'all')"))

    for cp, n in sorted(n_comp.items(), key=lambda kv: -kv[1]):
        ks = cp.split("+") if cp else []
        if n >= MIN_COMP and cp:
            members = [ps for ps, c in comp.items() if c == cp]
            uT[cp], pooled = table_for(members, ks)
            report.append(f"{cp}: {n} pitcher-seasons, own table, {pooled} pooled cells")
            continue
        rt, roles = rtabs.get(len(ks), (None, None))
        if rt and "FB" in ks and len(ks) >= 2:
            secs = sorted([k for k in ks if k != "FB"], key=lambda k: rank.index(k))
            mp = {"FB": "FB"}
            mp.update({f"S{i + 1}": k for i, k in enumerate(secs)})
            uT[cp] = {c: {pl: {mp[r]: round(rt[c][pl][r], 6) for r in roles} for pl in ("same", "opp")}
                      for c in COUNTS}
            report.append(f"{cp}: {n} pitcher-seasons (under {MIN_COMP}), from the {len(ks)}-kind role pool ("
                          + ", ".join(f"{r}={mp[r]}" for r in roles) + ")")
        else:
            report.append(f"{cp}: {n} pitcher-seasons (under {MIN_COMP}: uses 'all')")
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
    report.append(f"{len(zeroed)} kind/role shares were 0 in their cell and pooled instead"
                  + (": " + ", ".join(zeroed) if zeroed else ""))
    doc = dict(source=f"Statcast regular season 2024-25 (fetch_statcast.py sample: {len(files)} days), {len(rows)} pitches",
               rules=dict(min_pitches=MIN_PITCHES, min_share=MIN_SHARE, min_comp=MIN_COMP, min_cell=MIN_CELL, groups=GROUP),
               pitcher_seasons=len(comp), compositions={cp: n for cp, n in sorted(n_comp.items(), key=lambda kv: -kv[1])},
               thin_cells=thin, pooled_zero_shares=zeroed, u_T=uT, u_L=uL)
    json.dump(doc, open(OUT, "w"), indent=1, sort_keys=True)
    print("\n".join(report))
    mn_t = min(v for t in uT.values() for c in t.values() for p in c.values() for v in p.values())
    mn_l = min(v for t in uL.values() for c in t.values() for p in c.values() for v in p.values())
    print(f"smallest stored u_T {mn_t:.4f}, smallest u_L {mn_l:.4f}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
