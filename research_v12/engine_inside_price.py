"""v1.2 research: what the v1.1 engine charges for a fastball aimed inside vs away, by level (HBP per pitch, ball rate).
usage: python3 research_v12/engine_inside_price.py"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import engine as E
from engine import Situation
ars = [E.Pitch("Sinker", "SI", grade=3, command=3, conf=0.7, shape="run", velo=None),
       E.Pitch("Slider", "SL", grade=3, command=3, conf=0.7, shape="tight", velo=None),
       E.Pitch("Change", "CH", grade=3, command=3, conf=0.7, shape="fade", velo=None)]
print(f"{'level':11}{'target':10}{'HBP/pitch':>10}{'ball':>7}{'noncomp share':>14}{'A_hbp':>7}{'wild':>6}")
for lvl in ("mlb", "college_d1", "college_d3", "hs"):
    for q in ("up-in", "down-in", "middle", "down-away"):
        s = Situation(1, 0, 0, (False, False, False), level=lvl, same_side=True)
        z = {}
        P = E.outcome_probs(ars[0], q, s, ars, zout=z)
        nc = z.get("noncomp", {}).get("L", float("nan"))
        print(f"{lvl:11}{q:10}{P['hbp']:10.4f}{P['ball']:7.3f}{nc:14.3f}{E.OUTCOME_ADJ[lvl]['hbp']:7.3f}{E.OUTCOME_ADJ[lvl]['wild']:6.3f}")
