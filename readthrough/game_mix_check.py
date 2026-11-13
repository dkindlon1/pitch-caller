"""v1.1 Step 4: does Step 3 (the setup credits and the tie-break) narrow a game's pitch mix? app/game_mix_e2e.js checks a
few seeds through the app (no pitch over 70% of a game); single games are path-dependent, so this runs many simulated
games with the setup rules on or off (same seeds) and reports the top pitch's share per game.
usage (repo root): python3 readthrough/game_mix_check.py on|off [games, default 20] [first seed, default 5000]"""
import json, os, sys
from collections import Counter
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
os.chdir("/tmp")
import engine as e
import simulate as SIM

mode = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 20
S0 = int(sys.argv[3]) if len(sys.argv) > 3 else 5000
if mode == "off":
    for k in e.SETUP_RULE:
        e.SETUP_RULE[k] = 0.0
    e.tie_break = lambda p_, *a, **kw: p_
cnt = Counter()
_call = e.call_v08


def spy(ars, s, rng=None, exclude=None, tab=None):
    r = _call(ars, s, rng=rng, exclude=exclude, tab=tab)
    cnt[(tuple(sorted(x.name for x in ars)), r[0][0].name)] += 1
    return r


e.call_v08 = spy
SIM.CALLER = e
games = []
for g in range(N):
    cnt.clear()
    SIM.run(S0 + g, f"/tmp/game_mix_{mode}_{g}.csv")
    by_staff = {}
    for (staff, name), n in cnt.items():
        by_staff.setdefault(staff, Counter())[name] += n
    for staff, c in by_staff.items():
        tot = sum(c.values())
        if tot >= 40:             # the starter (relievers' short outings say little about a mix)
            nm, top = c.most_common(1)[0]
            games.append(dict(seed=S0 + g, pitches=tot, top=nm, share=top / tot, mix=dict(c)))
            print(f"seed {S0 + g}: {tot} pitches, {dict(c)}, top {nm} {top / tot:.0%}", flush=True)
sh = sorted(x["share"] for x in games)
out = dict(mode=mode, staff=SIM.STAFF, games=games, over70=sum(x > 0.70 for x in sh), n=len(sh),
           median=sh[len(sh) // 2] if sh else None, mean=sum(sh) / len(sh) if sh else None)
print(f"{mode}: {out['over70']} of {out['n']} starter games over 70% on one pitch; top share median {out['median']:.0%}, mean {out['mean']:.0%}")
json.dump(out, open(os.path.join(HERE, "results", "v11", f"game_mix_{mode}.json"), "w"), indent=1)
