import sys, os, random
sys.path.insert(0, os.getcwd())
import engine as _e
from engine import Pitch, Situation, call_v08
from dataclasses import replace
AVG3 = [Pitch("Fastball", "FB", grade=3, command=3, conf=0.80, shape="ride", velo=86),
        Pitch("Slider", "SL", grade=3, command=3, conf=0.75, shape="tight", velo=78),
        Pitch("Changeup", "CH", grade=3, command=3, conf=0.65, shape="fade", velo=78)]
R1=(True,False,False)
def share(ars, s0, pick, b=1, k=1):
    tab=_e.solve_table(ars,s0)
    _,d,_,_=call_v08(ars, replace(s0,balls=b,strikes=k), rng=random.Random(0), tab=tab)
    return sum(pr for pr,_,p,q in d if pick(p,q))
pick=lambda p,q: q in _e.GB_RULE_TARGETS
for lv in ("college_d3","college_d1","hs","mlb"):
    dp=Situation(1,1,0,R1,level=lv)
    on=share(AVG3,dp.__class__(0,0,0,R1,level=lv) if False else replace(dp,balls=0,strikes=0),pick)
    saved=_e.GB_RULE_BONUS
    try:
        _e.GB_RULE_BONUS=0.0
        off=share(AVG3,replace(dp,balls=0,strikes=0),pick)
    finally:
        _e.GB_RULE_BONUS=saved
    print(f"{lv}: off {off:.0%} -> on {on:.0%}")

# ruling 30 (Nov 25): the re-pointed test's condition, D3 row (tests.py: on >= 70% and on - off >= 5 points, plus gb_spots)
dp = Situation(1, 1, 0, R1, level="college_d3")
on3 = share(AVG3, replace(dp, balls=0, strikes=0), pick)
saved = _e.GB_RULE_BONUS
try:
    _e.GB_RULE_BONUS = 0.0
    off3 = share(AVG3, replace(dp, balls=0, strikes=0), pick)
finally:
    _e.GB_RULE_BONUS = saved
R3, E0 = (False, False, True), (False, False, False)
spots = [_e.ground_ball_spot(x) for x in (dp, replace(dp, outs=2), replace(dp, balls=3), replace(dp, strikes=2),
                                          Situation(1, 1, 1, R3), Situation(1, 1, 1, E0))]
print("ruling 30 test condition:", on3 >= 0.70 and on3 - off3 >= 0.05 and spots == [True, False, False, False, True, False],
      f"(on {on3:.1%}, off {off3:.1%}, spots {spots})")
