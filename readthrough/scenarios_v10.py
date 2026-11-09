"""v1.0 Phase 1.2: grade an engine against the v1.0 scenario suite (readthrough/scenarios_v10.json).

usage (repo root): python3 readthrough/scenarios_v10.py [--out results/scenarios_v10_<tag>.json] [--allow-unfrozen]

Same pass rule and the same output format as readthrough/scenarios.py, with two additions from the plan:

  - Rows marked "tracked" are graded and printed but do not count toward the gate. A row may only be tracked if
    passing it depends on the hitter model, which this plan may not touch; each one carries its reason in the file.
  - The v1.0 gate: no enforced row may put more than 5% of its calls in Not acceptable (0% on a hard row), and at
    most 6 enforced rows may fail on the Acceptable share alone. Those six are listed.

It refuses to run if the suite's sha256 no longer matches readthrough/scenarios_v10.sha256, exactly as the v0.9
grader does. --allow-unfrozen is for grading a draft before Drew approves it; it prints a warning and is never used
by CI.
"""
import hashlib, json, os, sys
from dataclasses import replace

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import engine as e                                            # noqa: E402

PATH = os.path.join(HERE, "scenarios_v10.json")
SHA = os.path.join(HERE, "scenarios_v10.sha256")
CORNERS = ["up-in", "up-away", "down-in", "down-away"]
GROUPS = {"zone": CORNERS + ["middle"], "corners": CORNERS, "down": ["down-in", "down-away"],
          "up": ["up-in", "up-away"], "away": ["up-away", "down-away"], "in": ["up-in", "down-in"],
          "any": CORNERS + ["middle", "chase"]}
MAX_ACC_FAILS = 6                                             # the v1.0 gate


class Half:
    def random(self):
        return 0.5


def load(path=PATH, sha=SHA, allow_unfrozen=False):
    blob = open(path, "rb").read()
    got = hashlib.sha256(blob).hexdigest()
    want = open(sha).read().strip() if os.path.exists(sha) else None
    if want is None or got != want:
        msg = (f"scenario file changed since it was frozen (sha256 {got[:12]} vs "
               f"{(want or 'missing')[:12]}); refusing to grade")
        if not allow_unfrozen:
            raise SystemExit(msg)
        print(f"WARNING: {msg} -- continuing because --allow-unfrozen was passed", flush=True)
    return json.loads(blob), got


def matches(pattern, kind, q):
    p, t = pattern.split(":")
    if not (p == "ANY" or p == kind or (p == "OS" and kind != "FB")):
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
    sd.pop("arsenal", None)
    sd["bases"] = tuple(sd["bases"])
    if sd.get("last"):
        sd["last"] = tuple(sd["last"])        # may be 4 long in v1.0: (pitch, target, result, read)
    for k in ("hitter_damage", "landing_today"):
        if k in sd:
            sd[k] = {a: tuple(v) for a, v in sd[k].items()}
    kind = {x.name: x.kind for x in ars}
    mm = {}
    for ev in row.get("matchup", []):
        if ev["result"] in ("whiff", "cstrike"):
            key = "succ|" + kind[ev["pitch"]]
        elif ev["result"] == "hard":
            key = "hard|" + kind[ev["pitch"]] + "|" + ev["target"]
        else:
            continue
        mm[key] = mm.get(key, 0) + 1
    if mm:
        sd["matchup"] = mm
    s = e.Situation(**sd)
    return ars, s, {tuple(x) for x in row["exclude"]}


def call_dist(ars, s, exclude):
    s_w = replace(s, win=e.win_constants(s)) if s.home is not None else s
    _, dist, _, _ = e.call_v08(ars, s_w, rng=Half(), exclude=exclude or None)
    return [(pr, p.name, p.kind, q) for pr, _, p, q in dist]


def grade(doc, row):
    ars, s, exclude = build(doc, row)
    dist = call_dist(ars, s, exclude)
    sh = {"acc": 0.0, "arg": 0.0, "not": 0.0}
    calls = []
    for pr, name, kind, q in dist:
        b = classify(row, kind, q)
        sh[b] += pr
        calls.append([name, q, round(pr, 4), b])
    rule = doc["pass_rule"]
    cap = rule["not_max_hard"] if row["hard"] else rule["not_max"]
    fails, kinds = [], set()
    if sh["not"] > cap + 1e-9:
        fails.append(f"not {sh['not']:.1%} > {cap:.0%}")
        kinds.add("not")
    if sh["acc"] < rule["acc_min"] - 1e-9:
        fails.append(f"acceptable {sh['acc']:.1%} < {rule['acc_min']:.0%}")
        kinds.add("acc")
    return dict(id=row["id"], hard=row["hard"], tracked=bool(row.get("tracked")),
                shares={k: round(v, 4) for k, v in sh.items()}, passed=not fails, fails=fails,
                fail_kinds=sorted(kinds), calls=sorted(calls, key=lambda c: -c[2]))


def run(doc):
    return [grade(doc, r) for r in doc["rows"]]


def report(res):
    enforced = [r for r in res if not r["tracked"]]
    tracked = [r for r in res if r["tracked"]]
    ok = sum(r["passed"] for r in enforced)
    not_bad = [r["id"] for r in enforced if "not" in r["fail_kinds"]]
    acc_only = [r["id"] for r in enforced if r["fail_kinds"] == ["acc"]]
    gate_ok = not not_bad and len(acc_only) <= MAX_ACC_FAILS
    L = [f"== v1.0 suite: {ok}/{len(enforced)} enforced rows pass "
         f"({sum(r['passed'] for r in tracked)}/{len(tracked)} tracked)",
         f"   gate: {'PASS' if gate_ok else 'FAIL'} -- "
         f"{len(not_bad)} row(s) over the Not-acceptable cap (must be 0)"
         + (f": {', '.join(not_bad)}" if not_bad else "")
         + f"; {len(acc_only)} row(s) fail on Acceptable alone (allowed {MAX_ACC_FAILS})"]
    if acc_only:
        L.append(f"   Acceptable-only failures: {', '.join(acc_only)}")
    for r in res:
        if r["passed"]:
            continue
        top = ", ".join(f"{c[0][:2].upper()} {c[1]} {c[2]:.0%} ({c[3]})" for c in r["calls"][:4])
        tag = "TRACK" if r["tracked"] else "FAIL "
        L.append(f"  {tag}{r['id']:4s} {'; '.join(r['fails'])} | top: {top}")
    return "\n".join(L), gate_ok


def main():
    argv = sys.argv[1:]
    out_path = argv[argv.index("--out") + 1] if "--out" in argv else None
    doc, h = load(allow_unfrozen="--allow-unfrozen" in argv)
    n_tr = sum(1 for r in doc["rows"] if r.get("tracked"))
    print(f"v1.0 scenario suite sha256 {h} ({len(doc['rows'])} rows, {n_tr} tracked)")
    res = run(doc)
    txt, gate_ok = report(res)
    print(txt)
    if out_path:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        json.dump({"sha256": h, "gate_ok": gate_ok, "results": res},
                  open(out_path, "w", encoding="utf-8"), indent=1)
        print("wrote", out_path)
    sys.exit(0 if gate_ok else 1)


if __name__ == "__main__":
    main()
