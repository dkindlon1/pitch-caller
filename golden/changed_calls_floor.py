"""v1.3 Part 9 (ruling 33, the continuous HS fastball floor): the changed-call list, old engine (bb63e33) vs the floor fix.
  python3 golden/changed_calls_floor.py <old golden> <new golden> <old v12 rt> <new v12 rt> <old hg rt> <new hg rt> <out.md>
Goldens: the 500 golden-v11 inputs (old = Part 8's proposed re-pin golden_v13coreW32.json; new = golden_v11.py make on the
fix). Read-throughs: readthrough/scenarios.py --out of the v12 suite (98 rows) and the HG suite (5 rows).
Lists every case whose call mix changed, with the old and new menus (top 5); a pick or top-share change is marked.
HS / travel are listed separately. The only code change is apply_fb_floor (fb_names is None off HS / travel), so every move
is floor-driven by construction; the script checks that no case off HS / travel changed at all (any output, not only the call)
and marks each HS move with the fastball share before and after."""
import json
import os
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
HS = ("hs", "travel")
SIX = (92, 154, 476, 410, 246, 460)      # the 6 HS rows Drew grades (DECISIONS_refit_v13.md section 2)
TINY = 0.0005                            # a menu whose largest share move is under 0.05 points counts as unchanged (ripple)
sys.path[:0] = [HERE]
import cases as G8                       # noqa: E402  (flat())
FBK = ("FB", "SI", "FC")


def shares(call):
    return {k: v[0] for k, v in (call.get("dist") or {}).items()}


def top(d):
    k = max(d, key=d.get)
    return k.replace("|", " "), d[k]


def menu(d, n=5):
    return ", ".join(f"{k.replace('|', ' ')} {v:.1%}" for k, v in sorted(d.items(), key=lambda kv: -kv[1])[:n])


def fbshare(d, ars):
    kinds = {x["name"]: x["kind"] for x in ars}
    return sum(v for k, v in d.items() if kinds.get(k.split("|")[0]) in FBK)


def main(og, ng, orv, nrv, orh, nrh, out_p):
    A = json.load(open(og, encoding="utf-8"))
    B = json.load(open(ng, encoding="utf-8"))
    assert len(A) == len(B)
    rows, n_call, other_off, other_hs, tiny = [], 0, [], [], 0
    keys, kmax = Counter(), {}
    for i, (a, b) in enumerate(zip(A, B)):
        assert a["s"] == b["s"] and a["arsenal"] == b["arsenal"], f"case {i}: inputs differ"
        lv = a["s"]["level"]
        if a["out"] != b["out"]:
            if lv not in HS:
                other_off.append(i)
            elif any(a["out"].get(k) != b["out"].get(k) for k in a["out"] if k not in ("call", "why", "shaken", "intent")):
                other_hs.append(i)
                fa, fb_ = dict(G8.flat(a["out"])), dict(G8.flat(b["out"]))
                for k in fa:
                    if fa[k] != fb_.get(k) and k.split(".")[0].split("[")[0] not in ("call", "why", "shaken", "intent"):
                        t = k.split(".")[0].split("[")[0]
                        keys[t] += 1
                        if isinstance(fa[k], (int, float)) and isinstance(fb_.get(k), (int, float)):
                            kmax[t] = max(kmax.get(t, 0.0), abs(fa[k] - fb_[k]))
        ca, cb = a["out"].get("call"), b["out"].get("call")
        if not ca:
            continue
        n_call += 1
        sa, sb = shares(ca), shares(cb)
        if sa == sb:
            continue
        pa, pb = " ".join(ca["pick"][:2]), " ".join(cb["pick"][:2])
        ta, tb = top(sa), top(sb)
        mv = max(abs(sa.get(k, 0) - sb.get(k, 0)) for k in set(sa) | set(sb))
        if mv < TINY and pa == pb and ta[0] == tb[0]:
            tiny += 1
            continue
        rows.append(dict(case=i, level=lv, count=f"{a['s']['balls']}-{a['s']['strikes']}", use=bool(a["s"].get("usage_by_call")),
                         pick_changed=pa != pb, pick=f"{pa} -> {pb}" if pa != pb else pa,
                         top_changed=ta[0] != tb[0], top=f"{ta[0]} {ta[1]:.0%} -> {tb[0]} {tb[1]:.0%}" if ta[0] != tb[0] else f"{ta[0]} {ta[1]:.1%} -> {tb[1]:.1%}",
                         move=mv,
                         fb=(fbshare(sa, a["arsenal"]), fbshare(sb, a["arsenal"])), old=menu(sa), new=menu(sb)))
    L = ["# Changed calls from the floor fix (ruling 33), bb63e33 -> the fix", "",
         f"Goldens: old `{og}`, new `{ng}` (500 golden-v11 inputs). {n_call} cases carry a call.", "",
         f"- Call mix changed by 0.05 points or more (or pick / top changed): **{len(rows)}** (HS / travel {sum(r['level'] in HS for r in rows)}, other levels {sum(r['level'] not in HS for r in rows)}).",
         f"- Pick (0.5 draw) changed: **{sum(r['pick_changed'] for r in rows)}**; top-share call changed: **{sum(r['top_changed'] for r in rows)}**.",
         f"- Cases off HS / travel with ANY output changed: **{len(other_off)}** {other_off if other_off else ''}",
         f"- Menus that moved by less than 0.05 points (ripple through the PA table; not listed): {tiny}.",
         f"- HS / travel cases with an output outside the call (and why / shaken / intent) changed: **{len(other_hs)}**; which outputs "
         f"(values changed, largest change): {', '.join(f'{k} {v} ({kmax.get(k, 0):.4f})' for k, v in keys.most_common())}. The floor also "
         "applies to the PA table's per-count policies (ruling 8), so the table and the walk estimate move; probs / take / grade / ump do not.",
         "- Every move is **floor-driven**: the only code change is `apply_fb_floor` / `floorArr`. The fastball-class share "
         "before -> after is shown per case (the floor total is unchanged; only where it goes moved).", ""]
    L += ["## HS and travel (floor-driven)", "",
          "| case | level | count | usage | pick | top-share call | largest move | FB share | old menu (top 5) | new menu (top 5) |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        if r["level"] in HS:
            mk = (" **pick**" if r["pick_changed"] else "") + (" **top**" if r["top_changed"] else "")
            L.append(f"| {r['case']}{mk} | {r['level']} | {r['count']} | {'yes' if r['use'] else 'no'} | {r['pick']} | {r['top']} | "
                     f"{r['move']:.1%} | {r['fb'][0]:.1%} -> {r['fb'][1]:.1%} | {r['old']} | {r['new']} |")
    rs = [r for r in rows if r["level"] not in HS]
    L += ["", f"## Other levels: {len(rs)}", ""]
    L += [f"- case {r['case']} {r['level']}" for r in rs]
    L += ["", "## The 6 HS rows Drew grades (golden cases)", "", "| case | level | count | moved? | old menu | new menu |", "|---|---|---|---|---|---|"]
    for i in SIX:
        a, b = A[i], B[i]
        sa, sb = shares(a["out"]["call"]), shares(b["out"]["call"])
        mv = max(abs(sa.get(k, 0) - sb.get(k, 0)) for k in set(sa) | set(sb))
        L.append(f"| #{i} | {a['s']['level']} | {a['s']['balls']}-{a['s']['strikes']} | "
                 f"{'**moved** (largest share move ' + format(mv, '.1%') + ')' if mv >= TINY else ('no' if sa == sb else 'no (under 0.05 points)')} | {menu(sa)} | {menu(sb)} |")
    for title, o, n in (("Read-through, v12 suite (98 rows)", orv, nrv), ("HG-1 to HG-4 (HG suite, 5 rows)", orh, nrh)):
        RO = json.load(open(o, encoding="utf-8"))["results"]["v09"]
        RN = json.load(open(n, encoding="utf-8"))["results"]["v09"]
        L += ["", f"## {title}", "", f"Pass: {sum(r['passed'] for r in RO)} -> {sum(r['passed'] for r in RN)} of {len(RO)}.", "",
              "| row | moved? | passed | old top calls | new top calls |", "|---|---|---|---|---|"]
        nm = 0
        for ro, rn in zip(RO, RN):
            assert ro["id"] == rn["id"]
            moved = ro["calls"] != rn["calls"]
            nm += moved
            if moved or title.startswith("HG"):
                f = lambda r: ", ".join(f"{c[0]} {c[1]} {c[2]:.1%}" for c in r["calls"][:4])
                L.append(f"| {ro['id']} | {'**moved**' if moved else 'no'} | {ro['passed']} -> {rn['passed']} | {f(ro)} | {f(rn)} |")
        L.append(f"\nRows whose menu moved: **{nm}** of {len(RO)}.")
    open(out_p, "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
    print("\n".join(L[:9]))


if __name__ == "__main__":
    main(*sys.argv[1:8])
