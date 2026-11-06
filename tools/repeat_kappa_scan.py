"""v1.0 3.7 finding: the plain-foul repeat check (3.1 / B9) across Phase 5's kappa grid, 12 contexts at 0-1.
usage (repo root): python3 tools/repeat_kappa_scan.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import json, engine as e
from dataclasses import replace
from concurrent.futures import ProcessPoolExecutor
d=json.load(open('callsheet_arsenals.json'))
class H:
    def random(self): return .5
def one(args):
    kt, kl = args
    e.KAPPA_T, e.KAPPA_L = kt, kl
    worst=-1
    for lv in ("hs","college_d3","college_d1"):
        for an in ("slider_best","plus_changeup"):
            a=[e.Pitch(**x) for x in d[an]]
            for same in (True,False):
                s0=e.Situation(0,1,1,(False,)*3,inning=4,level=lv,same_side=same)
                tab=e.solve_table(a,replace(s0,balls=0,strikes=0))
                def sh(s):
                    s=replace(s,look=tab.h0); s=replace(s,b_h=e.lean_b_h(a,s))
                    _,dist,_,_=e.call_v08(a,s,rng=H(),tab=tab)
                    return {(p.name,q):pr for pr,_,p,q in dist}
                b=sh(s0); X=max(b,key=b.get)
                f=sh(replace(s0,history=(X+('foul',None),),last=X+('foul',)))
                worst=max(worst,f.get(X,0)-b.get(X,0))
    return kt,kl,worst
if __name__=="__main__":
    grid=[(kt,kl) for kt in (1,1.5,2,3,4,6) for kl in (1,1.5,2,3)]
    with ProcessPoolExecutor(4) as ex:
        for kt,kl,w in ex.map(one,grid): print(f"kappa_T {kt} kappa_L {kl}: worst plain-foul change {w:+.4f}", flush=True)
