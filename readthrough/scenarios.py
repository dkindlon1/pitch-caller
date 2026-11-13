"""Grade the engine against a frozen coaching read-through: readthrough/scenarios_v10.json (v1.0, the default),
scenarios_v11.json (--suite v11: v1.0's rows plus the v1.1 setup rows) or the historical v0.9 suite (--suite v09).
usage (repo root): python3 readthrough/scenarios.py [--suite v10|v09] [--out results/scenarios_<tag>.json]
Every row's full call spread is sorted into Acceptable / Arguable / Not acceptable (see make_scenarios_v09.py) and
graded by the frozen pass rule. Refuses to run if the scenario file no longer matches its recorded sha256."""
import hashlib, json, os, sys
from dataclasses import replace
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import engine as e

SUITE = sys.argv[sys.argv.index("--suite") + 1] if "--suite" in sys.argv else "v10"
PATH = os.path.join(HERE, f"scenarios_{SUITE}.json")
SHA = os.path.join(HERE, f"scenarios_{SUITE}.sha256")
CORNERS = ["up-in", "up-away", "down-in", "down-away"]
# v1.0 Step 7: down-middle (knee-high over the plate) is in the zone and down; it is not a corner, not in or away
GROUPS = {"zone": CORNERS + ["middle", "down-middle"], "corners": CORNERS, "down": ["down-in", "down-away", "down-middle"],
          "up": ["up-in", "up-away"], "away": ["up-away", "down-away"], "in": ["up-in", "down-in"],
          "any": CORNERS + ["middle", "chase", "down-middle"]}
MODES = ("v09",)        # one engine (Nov 6); the name is kept so saved results read the same


class Half:
    def random(self):
        return 0.5


def load(path=PATH, sha=SHA):
    blob = open(path, "rb").read()
    got, want = hashlib.sha256(blob).hexdigest(), open(sha).read().strip()
    if got != want:
        raise SystemExit(f"scenario file changed since it was frozen (sha256 {got[:12]} vs {want[:12]}); refusing to grade")
    return json.loads(blob), got


def matches(pattern, kind, q):
    p, t = pattern.split(":")
    if not (p == "ANY" or p == kind or (p == "OS" and not e.is_fastball(kind)) or (p == "FB" and e.is_fastball(kind))
            or (p == "FF" and kind == "FB")):        # v1.1 Step 4: FF = the four-seam alone (FB matches the whole fastball class)
        return False
    return q in GROUPS[t] if t in GROUPS else q == t


def classify(row, kind, q):
    if any(matches(x, kind, q) for x in row["not_acceptable"]):
        return "not"
    if any(matches(x, kind, q) for x in row["acceptable"]):
        return "acc"
    return "arg"


def build(doc, row):
    ars = []
    for d in doc["arsenals"][row["inputs"].get("arsenal", doc["defaults"]["arsenal"])]:
        d = dict(d, **row["pitch_edits"].get(d["name"], {}))
        ars.append(e.Pitch(**d))
    sd = dict(doc["defaults"], **row["inputs"])
    sd.pop("arsenal")
    sd["bases"] = tuple(sd["bases"])
    if sd.get("last"):
        sd["last"] = tuple(sd["last"])
    if sd.get("pa_log"):     # v1.1 Step 3: this at-bat so far
        sd["pa_log"] = tuple(tuple(tuple(v) if isinstance(v, list) else v for v in x) for x in sd["pa_log"])
        if not sd.get("last"):
            sd["last"] = sd["pa_log"][-1][:3] + ((sd["pa_log"][-1][5],) if sd["pa_log"][-1][5] == "back" else ())
    for k in ("hitter_damage", "landing_today"):
        if k in sd:
            sd[k] = {a: tuple(v) for a, v in sd[k].items()}
    # v0.9 item 6: the row's earlier-trip events as the engine's matchup input
    kind = {x.name: e.key_kind(x.kind) for x in ars}     # v1.1: stored keys by fastball class
    mm = {}
    for ev in row.get("matchup", []):
        if ev["result"] in ("whiff", "cstrike"):
            key = "succ|" + kind[ev["pitch"]]
            k2 = key + "|" + ev["target"]              # v1.0 Step 7: and at which spot (the went-back rule)
            mm[k2] = mm.get(k2, 0) + 1
        elif ev["result"] == "hard":
            key = "hard|" + kind[ev["pitch"]] + "|" + ev["target"]
        else:
            continue
        mm[key] = mm.get(key, 0) + 1
    if mm:
        sd["matchup"] = mm
    s = e.Situation(**sd)
    return ars, s, {tuple(x) for x in row["exclude"]}


def call_dist(mode, ars, s, exclude):
    s_w = replace(s, win=e.win_constants(s)) if s.home is not None else s
    _, dist, _, _ = e.call_v08(ars, s_w, rng=Half(), exclude=exclude or None)
    return [(pr, p.name, p.kind, q) for pr, _, p, q in dist]


def grade(doc, row, mode):
    ars, s, exclude = build(doc, row)
    dist = call_dist(mode, ars, s, exclude)
    sh = {"acc": 0.0, "arg": 0.0, "not": 0.0}
    calls = []
    for pr, name, kind, q in dist:
        b = classify(row, kind, q)
        sh[b] += pr
        calls.append([name, q, round(pr, 4), b])
    rule = doc["pass_rule"]
    cap = rule["not_max_hard"] if row["hard"] else rule["not_max"]
    fails = []
    if sh["not"] > cap + 1e-9:
        fails.append(f"not {sh['not']:.1%} > {cap:.0%}")
    if sh["acc"] < rule["acc_min"] - 1e-9:
        fails.append(f"acceptable {sh['acc']:.1%} < {rule['acc_min']:.0%}")
    if row.get("floor"):          # v1.0 Step 7 (Drew, F2): a share of calls that must stay on the table
        pats, mn = row["floor"]
        fl = sum(pr for pr, _, kind, q in dist if any(matches(x, kind, q) for x in pats))
        if fl < mn - 1e-9:
            fails.append(f"{'/'.join(pats)} {fl:.1%} < floor {mn:.0%}")
    if row.get("ceiling"):        # v1.1 Step 3 (N2, an anti-setup): a share of calls that must stay under a cap
        pats, mx = row["ceiling"]
        cl = sum(pr for pr, _, kind, q in dist if any(matches(x, kind, q) for x in pats))
        if cl > mx + 1e-9:
            fails.append(f"{'/'.join(pats)} {cl:.1%} > ceiling {mx:.0%}")
    return dict(id=row["id"], hard=row["hard"], shares={k: round(v, 4) for k, v in sh.items()}, passed=not fails,
                fails=fails, calls=sorted(calls, key=lambda c: -c[2]))


def run(mode, doc):
    return [grade(doc, r, mode) for r in doc["rows"]]


def report(mode, res):
    n = len(res)
    ok = sum(r["passed"] for r in res)
    hard_bad = [r["id"] for r in res if r["hard"] and r["shares"]["not"] > 0]
    lines = [f"== {mode}: {ok}/{n} scenarios pass; hard-rule rows with any Not-acceptable share: {hard_bad or 'none'}"]
    for r in res:
        if not r["passed"]:
            top = ", ".join(f"{c[0][:2].upper()} {c[1]} {c[2]:.0%} ({c[3]})" for c in r["calls"][:4])
            lines.append(f"  FAIL {r['id']:4s} {'; '.join(r['fails'])} | top: {top}")
    return "\n".join(lines)


def main():
    argv = sys.argv[1:]
    out_path = argv[argv.index("--out") + 1] if "--out" in argv else None
    modes = [a for a in argv if not a.startswith("--") and a not in (out_path, SUITE)] or ["v09"]
    bad = [m for m in modes if m not in MODES]
    if bad:
        raise SystemExit(f"unknown engine mode(s) {bad}; expected {list(MODES)}")
    doc, h = load()
    print(f"scenario suite {SUITE}, sha256 {h} ({len(doc['rows'])} rows)")
    out = {"sha256": h, "results": {}}
    for m in modes:
        res = run(m, doc)
        out["results"][m] = res
        print(report(m, res))
    if out_path:
        json.dump(out, open(out_path, "w"), indent=1)
        print("wrote", out_path)


if __name__ == "__main__":
    main()
