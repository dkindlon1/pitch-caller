"""v1.0 Phase 3.7: the real-usage mixing prior.

Reads the Baseball Savant pitch-level CSVs (2024 + 2025 regular season, downloaded by fetch_statcast.py) and writes
mix_prior.json with two tables of what real pitchers actually do. The engine's own costs then move the mix away from
this baseline, as far as kappa_T and kappa_L allow: the prior is the hedge against the engine's model error being
larger than its cost differences (plan section 3.7).

  u_T[composition][count][platoon][kind]   pitch-type usage
      Kinds are seq_fit.CLASS (FB, SL, CB, CH). A pitcher's composition is the set of kinds he throws at least
      MIN_SHARE of the time in that season (pitcher-seasons of at least MIN_PITCHES pitches). The value is the
      unweighted average of each pitcher's own share of that kind in that count/platoon cell. Only compositions with
      at least MIN_SEASONS pitcher-seasons are written; for anything rarer the engine falls back to u_T_all,
      renormalized over the arsenal's kinds.
  u_L[kind][count][platoon][target]        target usage, from real pitch locations
      Zones follow statcast_check.zone (heart < 67%, shadow < 133%, chase < 200% of the half-zone, waste beyond), so
      the definitions match the earlier Statcast check. Statcast zone 5 is `middle`; the other heart and shadow
      pitches go to the four corners by quadrant (inside/away by plate_x, flipped for right-handed batters; up/down
      by plate_z against the middle of that batter's zone); the chase region is `chase`; waste pitches are dropped as
      misses. Normalized over engine.targets() for that count, so there is no chase share at 3-0, 3-1 or 2-2.

Count pooling: a cell with fewer than MIN_CELL pitches takes its count group's value instead (ahead / even / behind /
3-0 / full). The pooling is resolved here, so both engines do a plain lookup of all 12 counts and cannot disagree.

usage (repo root; the raw CSVs are untrusted downloads, so run isolated):
  python3 -I fit_mix_prior.py data/statcast .        -> writes ./mix_prior.json
"""
import csv, glob, json, os, sys
from collections import defaultdict

RAW = sys.argv[1] if len(sys.argv) > 1 else "data/statcast"
ENG = sys.argv[2] if len(sys.argv) > 2 else "."
sys.path.insert(0, os.path.abspath(ENG))
import engine as e                                               # noqa: E402
from seq_fit import CLASS                                        # noqa: E402

# The plan says "pitcher-seasons with at least 300 pitches", written for a full-season pull. data/statcast is a
# 1-in-4-day sample (fetch_statcast.py takes every 4th day), so 300 SAMPLED pitches is about 1,200 over a full
# season -- four times what the plan asked, and it starves three of the five real compositions: at 300 only
# FB+SL+CB+CH and FB+SL+CH clear MIN_SEASONS, while FB+SL, FB+SL+CB and FB+CB+CH fall back to u_T_all. 150
# sampled pitches is about 600 full-season pitches, still stricter than the plan, and all five clear the gate.
MIN_PITCHES = 150        # a pitcher-season has to be this big to count at all
MIN_SHARE = 0.05         # a kind is in his composition if it is at least this share of his season
MIN_SEASONS = 40         # a composition needs this many pitcher-seasons for its own table
MIN_CELL = 200           # a cell smaller than this pools its count into the group
KINDS = ("FB", "SL", "CB", "CH")
COUNTS = [(b, k) for b in range(4) for k in range(3)]
SKIP = {"pitchout", "automatic_ball", "automatic_strike"}        # not a chosen pitch to a chosen spot


def group(b, k):
    """The five count groups a thin cell pools into. Matches statcast_check.BUCKETS, with 0-0 in `even`."""
    if (b, k) == (3, 0):
        return "3-0"
    if (b, k) == (3, 2):
        return "full"
    return "ahead" if k > b else "behind" if b > k else "even"


def zone_nz(r):
    """statcast_check.zone, plus the normalized height it used, so the zone and up/down always agree."""
    try:
        x, zz, top, bot = float(r["plate_x"]), float(r["plate_z"]), float(r["sz_top"]), float(r["sz_bot"])
    except (ValueError, KeyError):
        return None, 0.0
    nx = x / 0.83
    nz = (zz - (top + bot) / 2) / ((top - bot) / 2 + 0.121)
    m = max(abs(nx), abs(nz))
    return ("heart" if m < 0.67 else "edge" if m < 1.33 else "off" if m < 2.0 else "noncomp"), nz


def target_of(r, z, nz):
    """The engine target a real pitch landed on, or None for a miss we drop."""
    if z == "noncomp":
        return None
    if z == "off":
        return "chase"
    if r.get("zone") == "5":
        return "middle"
    # inside is negative plate_x to a right-handed batter (checked against this data: hit_by_pitch averages
    # plate_x -2.03 for stand R and +2.03 for stand L)
    inside = (-float(r["plate_x"]) if r["stand"] == "R" else float(r["plate_x"])) > 0
    return ("up-" if nz > 0 else "down-") + ("in" if inside else "away")


def read():
    """One pass over the CSVs: per-pitcher-season kind counts, and the raw cell tallies for both tables."""
    season = defaultdict(lambda: defaultdict(int))               # (year, pitcher) -> kind -> pitches
    tcell = defaultdict(lambda: defaultdict(int))                # (year, pitcher, count, platoon) -> kind -> n
    lcell = defaultdict(lambda: defaultdict(int))                # (kind, count, platoon) -> target -> n
    files = sorted(glob.glob(os.path.join(RAW, "sc_*.csv")))
    if not files:
        sys.exit(f"no sc_*.csv in {RAW}; run fetch_statcast.py first")
    n = 0
    for f in files:
        for r in csv.DictReader(open(f, encoding="utf-8-sig")):
            if r["game_type"] != "R" or r["description"] in SKIP:
                continue
            kind = CLASS.get(r["pitch_type"])
            if not kind:
                continue
            try:
                b, k, year = int(r["balls"]), int(r["strikes"]), int(r["game_year"])
            except ValueError:
                continue
            if b > 3 or k > 2:
                continue
            n += 1
            pid, plat = r["pitcher"], ("same" if r["stand"] == r["p_throws"] else "opp")
            season[(year, pid)][kind] += 1
            tcell[(year, pid, (b, k), plat)][kind] += 1
            z, nz = zone_nz(r)
            if z:
                q = target_of(r, z, nz)
                if q and q in e.targets(b, k):
                    lcell[(kind, (b, k), plat)][q] += 1
    print(f"{len(files)} files, {n:,} pitches, {len(season):,} pitcher-seasons", flush=True)
    return season, tcell, lcell


FLOOR = 0.005            # no emitted cell is exactly zero (see floored())


def floored(d):
    """A hard zero in the prior would make the engine unable EVER to call that spot, and only a guard may do that
    (plan 3.7: "an average pitch can't go to 0% unless a guard removes it, and the guard gives a reason"). So every
    key keeps at least FLOOR of the cell. Five of 547 target cells and one of the pitch-type cells need it, all at
    3-0, where real pitchers simply never threw that pitch to that spot in this sample."""
    if not d:
        return d
    x = {k: max(v, FLOOR) for k, v in d.items()}
    t = sum(x.values())
    return {k: round(v / t, 6) for k, v in x.items()}


def share(d, keys):
    t = sum(d.get(x, 0) for x in keys)
    return {x: d.get(x, 0) / t for x in keys} if t else None


def resolve(cells, keys_of):
    """cells: count -> (n, distribution). A count under MIN_CELL takes its group's pitch-weighted average instead.
    keys_of(count) gives that count's key set, because the target set depends on the count."""
    gr = defaultdict(lambda: defaultdict(float))
    gn = defaultdict(float)
    for c, (n, dist) in cells.items():
        if dist:
            for x, v in dist.items():
                gr[group(*c)][x] += n * v
            gn[group(*c)] += n
    out = {}
    for c in COUNTS:
        n, dist = cells.get(c, (0, None))
        ks = keys_of(c)
        if dist is not None and n >= MIN_CELL:
            out[f"{c[0]}-{c[1]}"] = floored({x: dist.get(x, 0.0) for x in ks})
            continue
        g = group(*c)
        if gn.get(g):
            # the group average may carry a share of a key this count forbids (chase at 3-0), so renormalize
            raw = {x: gr[g].get(x, 0.0) for x in ks}
            t = sum(raw.values())
            if t:
                out[f"{c[0]}-{c[1]}"] = floored({x: v / t for x, v in raw.items()})
                continue
        if dist is not None:
            out[f"{c[0]}-{c[1]}"] = floored({x: dist.get(x, 0.0) for x in ks})
    return out


def main():
    season, tcell, lcell = read()
    qual = {ps: d for ps, d in season.items() if sum(d.values()) >= MIN_PITCHES}
    comp = {}
    for ps, d in qual.items():
        t = sum(d.values())
        comp[ps] = "+".join(k for k in KINDS if d.get(k, 0) / t >= MIN_SHARE)
    by_comp = defaultdict(list)
    for ps, c in comp.items():
        by_comp[c].append(ps)
    print(f"{len(qual):,} qualifying pitcher-seasons, {len(by_comp)} compositions", flush=True)

    # u_T: per composition, the unweighted average of each pitcher's own share in that cell
    u_T, nseasons = {}, {}
    for c, pss in by_comp.items():
        ks = tuple(c.split("+")) if c else ()
        if len(pss) < MIN_SEASONS or len(ks) < 2:
            continue
        per_plat = {}
        for plat in ("same", "opp"):
            cells = {}
            for cnt in COUNTS:
                tot, acc, m = 0, {x: 0.0 for x in ks}, 0
                for (yr, pid) in pss:
                    d = tcell.get((yr, pid, cnt, plat))
                    sh = share(d, ks) if d else None
                    if sh:
                        m += 1
                        tot += sum(d.get(x, 0) for x in ks)
                        for x in ks:
                            acc[x] += sh[x]
                cells[cnt] = (tot, {x: acc[x] / m for x in ks} if m else None)
            per_plat[plat] = resolve(cells, lambda _c, ks=ks: ks)
        u_T[c] = per_plat
        nseasons[c] = len(pss)

    # u_T_all: the all-pitcher kind shares, for an arsenal whose composition is too rare to have its own table
    all_plat = {}
    for plat in ("same", "opp"):
        cells = {}
        for cnt in COUNTS:
            agg = defaultdict(int)
            for (yr, pid) in qual:
                d = tcell.get((yr, pid, cnt, plat))
                if d:
                    for x, v in d.items():
                        agg[x] += v
            cells[cnt] = (sum(agg.values()), share(agg, KINDS))
        all_plat[plat] = resolve(cells, lambda _c: KINDS)

    # u_L: target usage per kind, normalized over the targets that count allows
    u_L = {}
    for kind in KINDS:
        per_plat = {}
        for plat in ("same", "opp"):
            cells = {}
            for cnt in COUNTS:
                d = lcell.get((kind, cnt, plat), {})
                qs = tuple(e.targets(*cnt))
                cells[cnt] = (sum(d.get(q, 0) for q in qs), share(d, qs))
            per_plat[plat] = resolve(cells, lambda c: tuple(e.targets(*c)))
        u_L[kind] = per_plat

    out = {
        "meta": {
            "source": "Baseball Savant, 2024 + 2025 regular season (fetch_statcast.py)",
            "min_pitches": MIN_PITCHES, "min_share": MIN_SHARE, "min_seasons": MIN_SEASONS, "min_cell": MIN_CELL,
            "seasons_by_composition": dict(sorted(nseasons.items(), key=lambda kv: -kv[1])),
        },
        "u_T": u_T, "u_T_all": all_plat, "u_L": u_L,
    }
    path = os.path.join(os.path.abspath(ENG), "mix_prior.json")
    json.dump(out, open(path, "w", encoding="utf-8"), indent=1, sort_keys=True)
    print("wrote", path)
    for c in sorted(u_T, key=lambda x: -nseasons[x]):
        d = u_T[c]["same"]["0-0"]
        print(f"  {c:16} {nseasons[c]:4d} seasons   0-0 same " + " ".join(f"{k} {v:.3f}" for k, v in sorted(d.items())))
    print("  all-pitcher 0-0 same " + " ".join(f"{k} {v:.3f}" for k, v in sorted(all_plat["same"]["0-0"].items())))
    for kind in KINDS:
        d = u_L[kind]["same"]["0-0"]
        print(f"  u_L {kind} 0-0 same " + " ".join(f"{k} {v:.3f}" for k, v in sorted(d.items())))


if __name__ == "__main__":
    main()
