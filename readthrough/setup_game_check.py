"""v1.1 Step 3 call-change check (plan Step 3 proof): in simulated games, how often a setup credit changes the engine's top
call, per rule and overall, as a share of the pitches thrown after a qualifying setup (some allowed call carries a setup
credit or the N2 cost). Proposed band 2-10% (Drew confirms at Step 4). Also how often the tie-break moved probability.
usage (repo root): python3 readthrough/setup_game_check.py [games, default 12]   -> results/v11/setup_game_check.json"""
import json, os, sys, random
from collections import Counter
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
os.chdir("/tmp")
import engine as e
import simulate as SIM

N = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 12
st = dict(pitches=0, qualifying=0, changed=0, by_rule=Counter(), tb_fired=0, fired=Counter(), two_k=0, s5_two_k=0, s5_low_cmd=0)
_call = e.call_v08


def top(pi):
    return max(pi, key=lambda a: pi[a])


def spy(ars, s, rng=None, exclude=None, tab=None):
    r = _call(ars, s, rng=rng, exclude=exclude, tab=tab)
    st["pitches"] += 1
    p_, q_ = r[0][0], r[0][1]
    v_, rule_, _x = e.setup_payoff(p_, q_, s, ars) if s.pa_log else (0.0, None, None)
    if v_ != 0:
        st["fired"][rule_] += 1                     # the drawn call carries this rule's credit (or N2's cost)
    if s.strikes == 2:
        st["two_k"] += 1
        if rule_ == "S5" and v_ > 0:
            st["s5_two_k"] += 1
            st["s5_low_cmd"] += p_.command < 4
    if not s.pa_log or s.balls >= 3:
        return r
    tab_ = r[2]
    calls = e.allowed_calls(ars, s, exclude) or e.allowed_calls(ars, s)
    by = {x.name: x for x in ars}
    cred = {a: e.setup_payoff(by[a[0]], a[1], s, ars) for a in calls}
    if not any(v[0] != 0 for v in cred.values()):
        return r
    st["qualifying"] += 1
    pi_on = e.root_call(ars, s, tab_, exclude)[0]
    saved, tb = dict(e.SETUP_RULE), e.tie_break
    try:
        for k in e.SETUP_RULE:
            e.SETUP_RULE[k] = 0.0
        e.tie_break = lambda p_, *a, **kw: p_
        pi_off = e.root_call(ars, s, tab_, exclude)[0]
        e.SETUP_RULE.update(saved)
        pi_notb = e.root_call(ars, s, tab_, exclude)[0]
    finally:
        e.SETUP_RULE.update(saved)
        e.tie_break = tb
    if 0.5 * sum(abs(pi_on.get(a, 0) - pi_notb.get(a, 0)) for a in set(pi_on) | set(pi_notb)) > 1e-9:
        st["tb_fired"] += 1
    a_on, a_off = top(pi_on), top(pi_off)
    if a_on != a_off:
        st["changed"] += 1
        rule = cred.get(a_on, (0, None))[1] if cred.get(a_on, (0,))[0] > 0 else (cred.get(a_off, (0, None))[1] or "tie-break")
        st["by_rule"][rule or "tie-break"] += 1
    return r


e.call_v08 = spy
SIM.CALLER = e
for g in range(N):
    SIM.run(9000 + g, f"/tmp/setup_game_{g}.csv")
    print(f"game {g + 1}: {st['pitches']} pitches, {st['qualifying']} after a qualifying setup, top call changed {st['changed']}", flush=True)
rate = st["changed"] / st["qualifying"] if st["qualifying"] else 0.0
per100 = lambda x: 100.0 * x / st["pitches"] if st["pitches"] else 0.0
out = dict(games=N, staff=SIM.STAFF, pitches=st["pitches"], qualifying=st["qualifying"], changed=st["changed"], rate=rate,
           by_rule=dict(st["by_rule"]), tie_break_fired=st["tb_fired"], band=[0.02, 0.10], in_band=0.02 <= rate <= 0.10,
           fires_per_100={k: round(per100(v), 2) for k, v in st["fired"].items()},
           top_change_per_100={k: round(per100(v), 2) for k, v in st["by_rule"].items()},
           s5_share_of_two_strike_calls=(st["s5_two_k"] / st["two_k"]) if st["two_k"] else 0.0, s5_with_command_under_4=st["s5_low_cmd"])
print(f"fires per 100 pitches {out['fires_per_100']}; top-call changes per 100 {out['top_change_per_100']}; S5 on "
      f"{out['s5_share_of_two_strike_calls']:.1%} of two-strike calls ({st['s5_low_cmd']} with command under 4)")
json.dump(out, open(os.path.join(HERE, "results", "v11", f"setup_game_check{'' if SIM.STAFF == 'default' else '_' + SIM.STAFF}.json"), "w"), indent=1)
print(f"setup credits changed the top call on {st['changed']} of {st['qualifying']} pitches after a qualifying setup ({rate:.1%}; "
      f"band 2-10%: {'in' if out['in_band'] else 'OUT'}); by rule {dict(st['by_rule'])}; tie-break moved probability on {st['tb_fired']}")
