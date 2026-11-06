"""v1.0: grade the engine against the frozen v1.0 scenario suite (readthrough/scenarios_v10.json). Same pass rule and
output format as scenarios.py, plus the v1.0 gate (PLAN_v1.0.md 1.2):
  no enforced row over its Not-acceptable cap (5%, 0% on hard rows), and at most 6 enforced rows failing on the
  acceptable share alone, each listed. Tracked rows (hitter model) are graded and reported, never gated.
usage (repo root): python3 readthrough/scenarios_v10.py [--out results/scenarios_v10_<tag>.json] [--draft]
Grades any engine: when the engine has no `history` input, a row's history still sets `last` (its newest pitch).
Refuses to run if the scenario file no longer matches its recorded sha256 (--draft grades the unfrozen review copy).
Exit code 1 if the gate fails."""
import hashlib, json, os, sys
from dataclasses import fields, replace
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
import engine as e
import scenarios as S09

PATH = os.path.join(HERE, "scenarios_v10.json")
SHA = os.path.join(HERE, "scenarios_v10.sha256")
DRAFT = os.path.join(HERE, "scenarios_v10_draft.json")
HAS_HISTORY = "history" in {f.name for f in fields(e.Situation)}


def load(draft=False):
    if draft:
        blob = open(DRAFT, "rb").read()
        return json.loads(blob), "DRAFT-" + hashlib.sha256(blob).hexdigest()[:12]
    return S09.load(PATH, SHA)


def build(doc, row):
    r = json.loads(json.dumps(row))
    inp = r["inputs"]
    hist = inp.pop("history", None)
    last = inp.get("last")
    if last and len(last) == 4:          # a four-field last is a one-pitch history
        hist = hist or [last]
        inp["last"] = last[:3]
    if hist:
        inp["last"] = list(hist[-1][:3])
    ars, s, exclude = S09.build(doc, r)
    if hist and HAS_HISTORY:
        s = replace(s, history=tuple(tuple(h) for h in hist))
    return ars, s, exclude


def grade(doc, row):
    ars, s, exclude = build(doc, row)
    return grade_dist(doc, row, S09.call_dist("v09", ars, s, exclude))


def grade_dist(doc, row, dist):
    """Grade one row from its call spread [(share, pitch name, kind, target)]."""
    sh = {"acc": 0.0, "arg": 0.0, "not": 0.0}
    calls = []
    for pr, name, kind, q in dist:
        b = S09.classify(row, kind, q)
        sh[b] += pr
        calls.append([name, q, round(pr, 4), b])
    rule = doc["pass_rule"]
    cap = rule["not_max_hard"] if row["hard"] else rule["not_max"]
    fails, not_fail = [], sh["not"] > cap + 1e-9
    if not_fail:
        fails.append(f"not {sh['not']:.1%} > {cap:.0%}")
    if sh["acc"] < rule["acc_min"] - 1e-9:
        fails.append(f"acceptable {sh['acc']:.1%} < {rule['acc_min']:.0%}")
    return dict(id=row["id"], hard=row["hard"], tracked=row.get("tracked", False), new=row.get("new_in") == "v1.0",
                shares={k: round(v, 4) for k, v in sh.items()}, passed=not fails, not_fail=not_fail,
                acc_only_fail=bool(fails) and not not_fail, fails=fails, calls=sorted(calls, key=lambda c: -c[2]))


def gate(doc, res):
    g = doc["gate"]
    enf = [r for r in res if not r["tracked"]]
    not_bad = [r["id"] for r in enf if r["not_fail"]]
    acc_only = [r["id"] for r in enf if r["acc_only_fail"]]
    ok = not not_bad and len(acc_only) <= g["max_acc_only_fails"]
    return dict(passed=ok, enforced=len(enf), not_fails=not_bad, acc_only_fails=acc_only,
                tracked=[r["id"] for r in res if r["tracked"]], tracked_failing=[r["id"] for r in res if r["tracked"] and not r["passed"]])


def report(res, gt):
    n = len(res)
    ok = sum(r["passed"] for r in res)
    hard_bad = [r["id"] for r in res if r["hard"] and r["shares"]["not"] > 0]
    lines = [f"== v10: {ok}/{n} scenarios pass; hard-rule rows with any Not-acceptable share: {hard_bad or 'none'}"]
    for r in res:
        if not r["passed"]:
            top = ", ".join(f"{c[0][:2].upper()} {c[1]} {c[2]:.0%} ({c[3]})" for c in r["calls"][:4])
            tag = " [tracked]" if r["tracked"] else ""
            lines.append(f"  FAIL {r['id']:4s}{tag} {'; '.join(r['fails'])} | top: {top}")
    lines.append(f"gate: {'PASS' if gt['passed'] else 'FAIL'} | enforced rows {gt['enforced']} | over the Not cap: "
                 f"{gt['not_fails'] or 'none'} | failing on acceptable share alone ({len(gt['acc_only_fails'])}, max 6): "
                 f"{gt['acc_only_fails'] or 'none'} | tracked failing: {gt['tracked_failing'] or 'none'}")
    return "\n".join(lines)


def main():
    argv = sys.argv[1:]
    out_path = argv[argv.index("--out") + 1] if "--out" in argv else None
    doc, h = load("--draft" in argv)
    print(f"scenario suite sha256 {h} ({len(doc['rows'])} rows; engine history input: {HAS_HISTORY})")
    res = [grade(doc, r) for r in doc["rows"]]
    gt = gate(doc, res)
    txt = report(res, gt)
    print(txt)
    if out_path:
        json.dump({"sha256": h, "results": {"v10": res}, "gate": gt}, open(out_path, "w"), indent=1)
        open(out_path.rsplit(".", 1)[0] + ".txt", "w").write(f"scenario suite sha256 {h}\n" + txt + "\n")
        print("wrote", out_path)
    sys.exit(0 if gt["passed"] else 1)


if __name__ == "__main__":
    main()
