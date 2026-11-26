"""v1.3 Part 11 (ruling 41, the E-7 fix: J7 plus_opp x RHO_L at HS / travel): the changed-call list, b74abdb vs cdaf0eb.
  python3 golden/changed_calls_e7.py <old golden> <new golden> <old v12 rt> <new v12 rt> <old hg rt> <new hg rt> <out.md> [<old edge_rows> <new edge_rows>]
Goldens: the 500 golden-v11 inputs (old = golden/golden_v13core.json as re-pinned in Part 10; new = golden_v11.py make on the
fix). Read-throughs: readthrough/scenarios.py --out of the v12 suite (98 rows) and the HG suite (5 rows); E rows: edge_rows.json.
Built from changed_calls_floor.py. The only code change is coach_credit's plus_opp term at HS / travel, so the script checks
that no case off HS / travel changed at all (any output) and marks each HS / travel move with its side and whether the case
is J7-eligible (opposite side, a grade-4+ slider or changeup in the arsenal); same-side moves are counted separately."""
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


def elig(case):
    return (not case["s"].get("same_side", True)) and any(x["grade"] >= 4 and x["kind"] in ("SL", "CH") for x in case["arsenal"])


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


def main(og, ng, orv, nrv, orh, nrh, out_p, oer=None, ner=None):
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
                         side="same" if a["s"].get("same_side", True) else "opp", elig=elig(a), old=menu(sa), new=menu(sb)))
    L = ["# Changed calls from the E-7 fix (ruling 41: J7 plus_opp x RHO_L at HS / travel), b74abdb -> cdaf0eb", "",
         f"Goldens: old `{og}`, new `{ng}` (500 golden-v11 inputs). {n_call} cases carry a call.", "",
         f"- Call mix changed by 0.05 points or more (or pick / top changed): **{len(rows)}** (HS / travel {sum(r['level'] in HS for r in rows)}, other levels {sum(r['level'] not in HS for r in rows)}).",
         f"- Pick (0.5 draw) changed: **{sum(r['pick_changed'] for r in rows)}**; top-share call changed: **{sum(r['top_changed'] for r in rows)}**.",
         f"- Cases off HS / travel with ANY output changed: **{len(other_off)}** {other_off if other_off else ''}",
         f"- Menus that moved by less than 0.05 points (ripple through the PA table; not listed): {tiny}.",
         f"- HS / travel cases with an output outside the call (and why / shaken / intent) changed: **{len(other_hs)}**; which outputs "
         f"(values changed, largest change): {', '.join(f'{k} {v} ({kmax.get(k, 0):.4f})' for k, v in keys.most_common())}. The credit is a "
         "cost term, so in eligible cases the PA table's per-count policies (and the table / walk estimate) move with it.",
         f"- Listed HS / travel moves on the **same side: {sum(r['level'] in HS and r['side'] == 'same' for r in rows)}**; opposite side but not "
         f"J7-eligible: {sum(r['level'] in HS and r['side'] == 'opp' and not r['elig'] for r in rows)}; J7-eligible: "
         f"{sum(r['level'] in HS and r['elig'] for r in rows)}.",
         "- The only code change is `coach_credit` / `coachCredit`'s plus_opp term (x RHO_L: 0.6 at HS / travel, 1 elsewhere).", ""]
    L += ["## HS and travel", "",
          "| case | level | count | usage | pick | top-share call | largest move | side / J7-eligible | old menu (top 5) | new menu (top 5) |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        if r["level"] in HS:
            mk = (" **pick**" if r["pick_changed"] else "") + (" **top**" if r["top_changed"] else "")
            L.append(f"| {r['case']}{mk} | {r['level']} | {r['count']} | {'yes' if r['use'] else 'no'} | {r['pick']} | {r['top']} | "
                     f"{r['move']:.1%} | {r['side']} / {'yes' if r['elig'] else 'no'} | {r['old']} | {r['new']} |")
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
    if oer and ner:
        EO, EN = json.load(open(oer, encoding="utf-8")), json.load(open(ner, encoding="utf-8"))
        L += ["", "## E rows (edge_rows.json: two-strike menus, every level, starter / reliever, same / opposite side)", "",
              "| level | row | moved? | old menu (top 5) | new menu (top 5) |", "|---|---|---|---|---|"]
        f = lambda m: ", ".join(f"{x} {v:.1%}" for x, v in sorted(m.items(), key=lambda kv: -kv[1])[:5])
        nm = 0
        for lv in EO:
            for k in EO[lv]:
                mo, mn = dict(map(tuple, EO[lv][k]["menu"])), dict(map(tuple, EN[lv][k]["menu"]))
                mv = max(abs(mo.get(x, 0) - mn.get(x, 0)) for x in set(mo) | set(mn))
                if mv > 0:
                    nm += 1
                    L.append(f"| {lv} | {k} | **moved** ({mv:.1%}) | {f(mo)} | {f(mn)} |")
        L.append(f"\nE rows that moved: **{nm}** of {sum(len(EO[lv]) for lv in EO)}.")
    open(out_p, "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
    print("\n".join(L[:9]))


if __name__ == "__main__":
    main(*sys.argv[1:10])
