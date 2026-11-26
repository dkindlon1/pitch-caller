"""v1.3 Part 8 (ruling 32): the short changed-call list between two goldens on the same inputs (W = 4 -> 32).
  python3 golden/changed_calls_w32.py <old golden .json> <new golden .json> <out.md>
Lists every case whose pick (call.pick, the 0.5 draw) or top-share call changed; marks whether the case carries a
usage_by_call (the only input the learning weight reads, so the only cases that can move). HS / travel in their own table."""
import json
import sys

HS = ("hs", "travel")
CALL_DERIVED = ("call", "why", "shaken", "intent")     # the call, its explanation, the call after a shake-off, the intent line


def shares(call):
    return {k: v[0] for k, v in (call.get("dist") or {}).items()}


def top(call):
    d = shares(call)
    k = max(d, key=d.get)
    return k.replace("|", " "), d[k]


def main(old_p, new_p, out_p):
    A = json.load(open(old_p, encoding="utf-8"))
    B = json.load(open(new_p, encoding="utf-8"))
    assert len(A) == len(B)
    rows, n_call, n_use, n_mix, n_other = [], 0, 0, 0, 0
    for i, (a, b) in enumerate(zip(A, B)):
        assert a["s"] == b["s"] and a["arsenal"] == b["arsenal"], f"case {i}: inputs differ"
        ca, cb = a["out"].get("call"), b["out"].get("call")
        if any(a["out"].get(k) != b["out"].get(k) for k in a["out"] if k not in CALL_DERIVED):
            n_other += 1
        if not ca:
            continue
        n_call += 1
        use = bool(a["s"].get("usage_by_call"))
        n_use += use
        if shares(ca) != shares(cb):
            n_mix += 1
        pa, pb = tuple(ca["pick"][:2]), tuple(cb["pick"][:2])
        ta, tb = top(ca), top(cb)
        if pa != pb or ta[0] != tb[0]:
            sa, sb = shares(ca), shares(cb)
            mv = max(abs(sa.get(k, 0) - sb.get(k, 0)) for k in set(sa) | set(sb))
            rows.append(dict(case=i, level=a["s"]["level"], count=f"{a['s']['balls']}-{a['s']['strikes']}", use=use,
                             pick=f"{' '.join(pa)} -> {' '.join(pb)}" if pa != pb else "same",
                             top=f"{ta[0]} {ta[1]:.0%} -> {tb[0]} {tb[1]:.0%}" if ta[0] != tb[0] else "same",
                             move=mv))
    L = ["# Changed calls, W = 4 -> 32 (ruling 32), from the proposed re-pin golden", "",
         f"Old `{old_p}`, new `{new_p}` (500 golden-v11 inputs, same engine except `LEARN_PRIOR_W`). "
         f"{n_call} cases carry a call; {n_use} carry `usage_by_call`. Call mix changed in {n_mix}; outputs outside the call and its derived fields (why, shaken, intent), i.e. probabilities, table, take, grade, ump, "
         f"changed in {n_other} cases.", "",
         f"- Pick changed: **{sum(r['pick'] != 'same' for r in rows)}**; top-share call changed: "
         f"**{sum(r['top'] != 'same' for r in rows)}**; every changed case carries usage (learning-driven): "
         f"**{all(r['use'] for r in rows)}**.", ""]
    for title, sel in (("College and MLB", lambda r: r["level"] not in HS), ("HS and travel (separate)", lambda r: r["level"] in HS)):
        rs = [r for r in rows if sel(r)]
        L += [f"## {title}: {len(rs)}", "", "| case | level | count | learning | pick (0.5 draw) | top-share call | largest share move |",
              "|---|---|---|---|---|---|---|"]
        L += [f"| {r['case']} | {r['level']} | {r['count']} | {'yes' if r['use'] else 'no'} | {r['pick']} | {r['top']} | {r['move']:.1%} |"
              for r in rs]
        L.append("")
    open(out_p, "w", encoding="utf-8", newline="\n").write("\n".join(L))
    print("\n".join(L[:8]))


if __name__ == "__main__":
    main(*sys.argv[1:4])
