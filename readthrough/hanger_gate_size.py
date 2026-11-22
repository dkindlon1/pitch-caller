"""v1.3 core, Task C step 3: size the hanger gate H (Drew's ruling 3, docs/DECISIONS_refit_v13.md section 4).

Rule (section 4): the smallest H at which every gated row passes and every control row keeps its off-speed share; 0 if
the rows pass at H = 0.
  gated rows   (v12 suite): A5, B7, E2, C7, D3, B8, E8 (off-speed not landing; it shouldn't be the call)
  control rows (v12 suite): E1, E3, A4 (landing well; no penalty): off-speed share unchanged from H = 0 (to 0.1 point)
  HG-1 to HG-4 (readthrough/scenarios_hg_v13.json, PROPOSED): the frozen pass rule plus their 'relation' rules
    HG-1a: SL middle share >= its share at H = 0 (to 0.1 point); HG-1b: SL middle share <= 0.5 x HG-1a's at the same H;
    HG-3: CH middle share equal to its share at H = 0 (to 0.1 point).
Each H runs in a fresh process on a scratch copy of data_tables/zone_v13.json with class.hanger_gate = H
(PITCH_ZONE_TABLE=<path>), so nothing in the repo changes.

usage (repo root): python3 readthrough/hanger_gate_size.py [--grid 0,0.1,...] [--out results/hanger_gate_size.json]"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GATED = ("A5", "B7", "E2", "C7", "D3", "B8", "E8")
CONTROLS = ("E1", "E3", "A4")
GRID = (0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1.0)
TOL = 0.0005             # "to 0.1 point" (shares compared after rounding to 0.001)


def worker():
    """In a process whose PITCH_ZONE_TABLE carries H: grade the rows; print JSON."""
    sys.argv = [sys.argv[0], "--suite", "v12"]
    sys.path.insert(0, HERE)
    import scenarios as R
    e = R.e
    out = {"H": e.HANGER_GATE, "versions": e.TABLE_VERSIONS, "rows": {}}
    for suite, ids in (("v12", GATED + CONTROLS), ("hg_v13", None)):
        doc, _ = R.load(os.path.join(HERE, f"scenarios_{suite}.json"), os.path.join(HERE, f"scenarios_{suite}.sha256"))
        for row in doc["rows"]:
            if ids and row["id"] not in ids:
                continue
            g = R.grade(doc, row, "v09")
            ars, s, _ = R.build(doc, row)
            os_share = sum(c[2] for c in g["calls"] if not e.is_fastball(next(p.kind for p in ars if p.name == c[0])))
            kinds = {p.name: p.kind for p in ars}
            mid = {}
            for pat in ("SL:middle", "CH:middle", "CB:middle"):
                mid[pat] = sum(c[2] for c in g["calls"] if R.matches(pat, kinds[c[0]], c[1]))
            wt = {p.name: round(e.wild_today(p, s), 3) for p in ars if not e.is_fastball(p.kind)}
            out["rows"][row["id"]] = dict(suite=suite, passed=g["passed"], fails=g["fails"], shares=g["shares"],
                                          os_share=os_share, middle=mid, wild_today=wt, relation=row.get("relation"),
                                          top=g["calls"][:5])
    print(json.dumps(out))


def run_h(h, zone_path):
    z = json.load(open(zone_path, encoding="utf8"))
    z["class"]["hanger_gate"] = h
    fd, p = tempfile.mkstemp(suffix=".json", prefix=f"zone_h{h}_")
    with os.fdopen(fd, "w", encoding="utf8", newline="\n") as f:
        json.dump(z, f)
    try:
        r = subprocess.run([sys.executable, os.path.abspath(__file__), "--worker"], cwd=ROOT, capture_output=True, text=True,
                           env=dict(os.environ, PYTHONUTF8="1", PITCH_ZONE_TABLE=p))
        if r.returncode:
            raise SystemExit(r.stderr[-3000:])
        return json.loads(r.stdout.strip().splitlines()[-1])
    finally:
        os.remove(p)


def judge(res, base):
    """-> (all_ok, per-row verdicts) for one H given the H = 0 run."""
    rows, b = res["rows"], base["rows"]
    v = {}
    for rid in GATED:
        v[rid] = dict(kind="gated", ok=rows[rid]["passed"], why="; ".join(rows[rid]["fails"]) or "passes")
    for rid in CONTROLS:
        d = rows[rid]["os_share"] - b[rid]["os_share"]
        v[rid] = dict(kind="control", ok=abs(d) <= TOL, why=f"off-speed {rows[rid]['os_share']:.3f} vs {b[rid]['os_share']:.3f} at H=0")
    for rid, r in rows.items():
        if r["suite"] != "hg_v13":
            continue
        ok, why = r["passed"], ["; ".join(r["fails"]) or "pass rule ok"]
        rel = r.get("relation")
        if rel:
            pat = rel["pattern"]
            x = r["middle"][pat]
            if rel["type"] == "not_below_h0":
                good = x >= b[rid]["middle"][pat] - TOL
                why.append(f"{pat} {x:.3f} vs H=0 {b[rid]['middle'][pat]:.3f}")
            elif rel["type"] == "equal_h0":
                good = abs(x - b[rid]["middle"][pat]) <= TOL
                why.append(f"{pat} {x:.3f} vs H=0 {b[rid]['middle'][pat]:.3f}")
            else:
                y = rows[rel["of"]]["middle"][pat]
                good = x <= 0.5 * y + TOL
                why.append(f"{pat} {x:.3f} vs half of {rel['of']}'s {y:.3f} = {0.5 * y:.3f}")
            ok = ok and good
        v[rid] = dict(kind="HG (PROPOSED)", ok=ok, why="; ".join(why))
    return all(x["ok"] for x in v.values()), v


def main():
    if "--worker" in sys.argv:
        worker()
        return
    argv = sys.argv[1:]
    grid = [float(x) for x in argv[argv.index("--grid") + 1].split(",")] if "--grid" in argv else list(GRID)
    out_path = argv[argv.index("--out") + 1] if "--out" in argv else None
    zone = os.path.join(ROOT, "data_tables", "zone_v13.json")
    runs = {h: run_h(h, zone) for h in grid}
    base = runs[0.0] if 0.0 in runs else run_h(0.0, zone)
    table, chosen = [], None
    for h in grid:
        ok, v = judge(runs[h], base)
        table.append(dict(H=h, all_ok=ok, rows=v))
        if ok and chosen is None:
            chosen = h
        print(f"H = {h:<5}: {'ALL PASS' if ok else 'fails: ' + ', '.join(k for k, x in v.items() if not x['ok'])}")
        for k, x in v.items():
            print(f"     {k:6s} {x['kind']:13s} {'ok ' if x['ok'] else 'NO '} {x['why']}")
    print(f"smallest passing H on the grid: {chosen}")
    if out_path:
        with open(out_path, "w", encoding="utf8", newline="\n") as f:
            json.dump(dict(grid=grid, chosen=chosen, table=table, runs={str(h): r for h, r in runs.items()}), f, indent=1)
        print("wrote", out_path)


if __name__ == "__main__":
    main()
