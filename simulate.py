"""
Full-game simulation for the pitch-calling engine.

- Opponent: 9 hitters with HIDDEN true traits (skill, fastball/off-speed damage, timing bias).
  The engine never sees these. It only learns from what the logger would record.
- Outcomes: drawn from the outcome model run with the hitter's TRUE traits, so the engine
  has to learn the hitters as the game goes.
- Our pitchers: a starter (FB/SL/CH) and a reliever (FB/CB/CH) who comes in at ~95 pitches.
- Shake-offs: the pitcher shakes off low-confidence calls at random.
- Everything random is seeded per run, so each run is a different, unpredictable game.

Writes a pitch-by-pitch log (CSV) and prints a compact log for review.
"""
import contextlib
import csv
import math
import random
import sys
from collections import Counter, defaultdict
from dataclasses import replace

import os
import engine
from engine import (Pitch, Situation, outcome_probs, landing, IN_PLAY,
                    LEVEL, is_offspeed, mixed_policy, QUADS)

# One engine (v0.9) makes the calls, and the simulated world is the same model plus the hidden truth.
SEED = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 2026
rng = random.Random(SEED)
LEVEL_NAME = os.environ.get("LEVEL", "college")
# v0.6 input levels (what the coach actually logs):
#   1 results only: ball, called strike, swinging strike, foul, in play (hit or out)
#   2 + contact quality on balls in play (weak / solid / hard)
#   3 + hitter reads: whiff type, foul direction (timing)      <- default, what earlier runs used
#   4 + measured pitch movement (Trackman/Rapsodo) instead of shape tags
INPUTS = int(os.environ.get("INPUTS", "3"))
NOISE = float(os.environ.get("NOISE", "0"))          # share of optional entries logged wrong
TRUE_MOVE = os.environ.get("TRUE_MOVE", "0") == "1"  # pitches' real movement differs from their shape tag
# v0.6d test matrix presets
STAFF = os.environ.get("STAFF", "default")        # default, power, finesse, two_pitch, lefty, four_pitch, shaky
LINEUP = os.environ.get("LINEUP", "default")      # default, strong, weak, lefty_heavy, switch, fb_mashers, os_killers, late
SHAKE = float(os.environ.get("SHAKE", "1"))       # shake-off rate multiplier
OVERRIDE = float(os.environ.get("OVERRIDE", "0")) # share of pitches where the coach calls his own (random) pitch
UMP_SD = float(os.environ.get("UMP_SD", "0"))     # v0.8: each game's umpire zone shift ~ N(0, UMP_SD) logits (0 = v0.7c)
# TRUTH_TAB=world also scores every call against a table solved with the hidden truth (log only: no rng draw, no
# change to calls or outcomes): the regret_w_* columns. The plain regret columns use the engine's own table.
TRUTH_TAB = os.environ.get("TRUTH_TAB", "")
# World settings (off by default; they describe the opposing hitters, not the engine):
#   TRUE_POWER=1      each opposing hitter gets a hidden true power grade w ~ N(3, 1) clipped to 1..5 (8.2 assumes hitters
#                     spread like pitchers: one grade point = one SD), drawn from its own random stream so lineups and every
#                     other draw match the runs without it. The world's model uses it the way the engine's model would:
#                     the 8.2 hard-contact term and item 8's home-run effect, in the truth values and in the batted-ball
#                     draw (run_ball_in_play_typed).
#   SEE_POWER=1       (with TRUE_POWER) the engine is told a coach's power grade: the true grade rounded to a whole number.
TRUE_POWER = os.environ.get("TRUE_POWER", "") == "1"
SEE_POWER = TRUE_POWER and os.environ.get("SEE_POWER", "") == "1"

# ---------------------------------------------------------------------------
# Yardstick hook (v1.0 Step 0d): CALL_ENGINE=<path to an engine.py> makes THAT engine call the pitches inside THIS
# tree's world. The caller supplies the table, the policy, the call and its explanation; the world (outcome_probs, the
# hitters, the in-play draw) and the truth judge (the regret columns, which score every call against a table solved on
# the hidden truth) always stay this tree's, so two callers are measured by the same ruler.
#   CALL_ENGINE=../pitch-caller-v09/engine.py python3 readthrough/run_games.py ...
# The frozen engine is loaded with its OWN sibling data modules (run_tables, outcome_params, spread_params,
# inplay_typed_params, hitter_spread_params), so it calls with the parameters it shipped with, not today's.
# It is handed this tree's Situation/Pitch objects, so a frozen caller must still read the fields it knows about.
# ---------------------------------------------------------------------------
CALL_ENGINE = os.environ.get("CALL_ENGINE", "")
_CALL_DEPS = ("run_tables", "outcome_params", "spread_params", "inplay_typed_params", "hitter_spread_params")


def _load_call_engine(path):
    """Import an engine.py from another tree, resolving its sibling data modules against that tree."""
    import importlib.util
    path = os.path.abspath(path)
    if not os.path.isfile(path):
        raise SystemExit(f"CALL_ENGINE: no such file: {path}")
    home = os.path.dirname(path)
    saved_path = list(sys.path)
    saved_mods = {k: sys.modules.pop(k, None) for k in _CALL_DEPS}
    sys.path.insert(0, home)
    try:
        spec = importlib.util.spec_from_file_location("_call_engine_frozen", path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules["_call_engine_frozen"] = mod
        spec.loader.exec_module(mod)
        took = {k: sys.modules.get(k) for k in _CALL_DEPS}
    finally:
        sys.path[:] = saved_path
        for k, m in saved_mods.items():
            if m is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = m
    wrong = sorted(k for k, m in took.items()
                   if m is not None and getattr(m, "__file__", None)
                   and os.path.dirname(os.path.abspath(m.__file__)) != home)
    if wrong:
        raise SystemExit(f"CALL_ENGINE: {path} picked up this tree's {', '.join(wrong)}; its own copies must be loadable")
    return mod


CALLER = _load_call_engine(CALL_ENGINE) if CALL_ENGINE else engine
CALLER_NAME = (os.path.abspath(CALL_ENGINE) if CALL_ENGINE else "this tree")



# ---------------------------------------------------------------------------
# Teams
# ---------------------------------------------------------------------------

def our_staff():
    P = lambda n, k, g, c, cf, sh, v: Pitch(n, k, grade=g, command=c, conf=cf, shape=sh, velo=v)
    presets = {
        "power": ([P("Fastball", "FB", 5, 2, .80, "ride", 93), P("Slider", "SL", 4, 2, .70, "sweeper", 82), P("Changeup", "CH", 2, 2, .50, "fade", 84)],
                  [P("Fastball", "FB", 5, 2, .80, "ride", 94), P("Curveball", "CB", 4, 2, .65, "sharp", 78), P("Changeup", "CH", 2, 3, .50, "fade", 85)]),
        "finesse": ([P("Fastball", "FB", 2, 5, .80, "sink", 82), P("Curveball", "CB", 3, 4, .75, "loopy", 70), P("Changeup", "CH", 4, 5, .80, "fade", 74)],
                    [P("Fastball", "FB", 3, 4, .80, "run", 85), P("Slider", "SL", 3, 4, .70, "tight", 77), P("Changeup", "CH", 3, 4, .70, "fade", 77)]),
        "two_pitch": ([P("Fastball", "FB", 3, 3, .75, "", 80), P("Curveball", "CB", 3, 2, .60, "loopy", 66)],
                      [P("Fastball", "FB", 3, 3, .75, "", 81), P("Slider", "SL", 3, 3, .65, "tight", 72)]),
        "four_pitch": ([P("Fastball", "FB", 3, 4, .80, "ride", 86), P("Slider", "SL", 4, 3, .70, "tight", 79), P("Curveball", "CB", 3, 3, .65, "loopy", 73), P("Changeup", "CH", 3, 3, .60, "fade", 78)],
                       None),
    }
    if STAFF in presets:
        st_, rl_ = presets[STAFF]
        if rl_ is None:
            rl_ = [P("Fastball", "FB", 4, 3, .80, "ride", 89), P("Curveball", "CB", 3, 3, .70, "loopy", 72), P("Changeup", "CH", 2, 3, .55, "fade", 80)]
        return {"name": "Starter (R)", "arsenal": st_, "hand": "R"}, {"name": "Reliever (R)", "arsenal": rl_, "hand": "R"}
    return _default_staff()


def _default_staff():
    starter = [
        Pitch("Fastball", "FB", grade=3, command=4, conf=0.80, shape="ride", velo=86),
        Pitch("Slider", "SL", grade=4, command=3, conf=0.75, shape="tight", velo=78),
        Pitch("Changeup", "CH", grade=3, command=2, conf=0.60, shape="fade", velo=77),
    ]
    reliever = [
        Pitch("Fastball", "FB", grade=4, command=3, conf=0.80, shape="ride", velo=89),
        Pitch("Curveball", "CB", grade=3, command=3, conf=0.70, shape="loopy", velo=72),
        Pitch("Changeup", "CH", grade=2, command=3, conf=0.55, shape="fade", velo=80),
    ]
    if STAFF == "shaky":   # a bad-feel day: every pitch starts 0.2 lower in the bullpen
        starter = [replace(p, conf=round(p.conf - 0.2, 2), base_conf=round(p.conf - 0.2, 2)) for p in starter]
        reliever = [replace(p, conf=round(p.conf - 0.2, 2), base_conf=round(p.conf - 0.2, 2)) for p in reliever]
    hand = "L" if STAFF == "lefty" else "R"
    return {"name": f"Starter ({hand})", "arsenal": starter, "hand": hand}, {"name": f"Reliever ({hand})", "arsenal": reliever, "hand": hand}


def their_lineup():
    """Hidden truth. skill shifts damage on everything; fb/os add to it; timing < 0 early, > 0 late."""
    hitters = []
    for i in range(9):
        spot = i + 1
        base = 0.35 if spot in (3, 4, 5) else (0.0 if spot in (1, 2, 6) else -0.35)
        base += {"strong": 0.4, "weak": -0.4}.get(LINEUP, 0.0)
        skill = max(-1, min(1, base + rng.gauss(0, 0.25)))
        hand = rng.choice(["R", "R", "L"])
        if LINEUP == "lefty_heavy":
            hand = "L" if rng.random() < 0.75 else "R"
        if LINEUP == "switch":
            hand = "S" if rng.random() < 0.6 else hand
        fb = max(-1, min(1, skill + (0.6 if LINEUP == "fb_mashers" else 0.0) + rng.gauss(0, 0.35)))
        os_ = max(-1, min(1, skill - 0.2 + (0.6 if LINEUP == "os_killers" else 0.0) + rng.gauss(0, 0.35)))
        tim = max(-1, min(1, (0.6 if LINEUP == "late" else 0.0) + rng.gauss(0, 0.4 if LINEUP != "late" else 0.2)))
        hitters.append({"name": f"#{spot}", "hand": hand, "fb": fb, "os": os_, "timing": tim})
    return hitters


# ---------------------------------------------------------------------------
# What the engine knows (learned from logged events only)
# ---------------------------------------------------------------------------

class Knowledge:
    def __init__(self):
        self.timing = defaultdict(lambda: {"FB": 0.0, "OS": 0.0})
        self.damage = defaultdict(dict)          # hitter -> key -> (score, n)
        self.seen = defaultdict(Counter)         # hitter -> pitch name -> count
        self.usage = defaultdict(Counter)        # (b,k) -> pitch name -> count (whole game)
        self.usage_call = defaultdict(Counter)   # v0.8 (2.3): (pitcher, b, k) -> (pitch, target) -> count today

    def update_timing(self, h, cls, signal):
        t = self.timing[h][cls]
        self.timing[h][cls] = t + 0.35 * (signal - t)

    def decay_timing(self, h):
        for cls in ("FB", "OS"):
            self.timing[h][cls] *= 0.5

    def update_damage(self, h, cls, outcome):
        val = {"hard": 1.0, "solid": 0.3, "weak": -0.3, "whiff": -0.6, "foul": 0.0,
               "hit": 0.5, "out": -0.2}.get(outcome)          # hit/out: results-only logging
        if val is None:
            return
        score, n = self.damage[h].get(cls, (0.0, 0))
        self.damage[h][cls] = ((score * n + val) / (n + 1), n + 1)


# ---------------------------------------------------------------------------
# Truth: sample what actually happens
# ---------------------------------------------------------------------------

CURRENT_OFF = {}     # pitch name -> true off-day wildness for the pitcher on the mound (v0.6f)
OFF_P, OFF_LO, OFF_HI = 0.2, 0.15, 0.35   # 1 day in 5 a pitch is off by 15-35% of its strikes


def draw_off(r, arsenal):
    return {x.name: (r.uniform(OFF_LO, OFF_HI) if r.random() < OFF_P else 0.0) for x in arsenal}


def true_situation(s, hitter):
    ts = replace(s, landing_today={}, wild_true=dict(CURRENT_OFF) or {"__none__": 0.0}, hitter_damage={"FB": (hitter["fb"], 10_000), "OS": (hitter["os"], 10_000)},
                 timing={"FB": hitter["timing"], "OS": hitter["timing"]})
    return replace(ts, grades={"w": hitter["w"]}) if "w" in hitter else ts      # TRUE_POWER: the hidden true power grade


def sample(dist):
    r, acc = rng.random(), 0.0
    for k, v in dist.items():
        acc += v
        if r <= acc:
            return k
    return k


def foul_direction(tau):
    # early (tau<0) -> pull side; late (tau>0) -> opposite / behind
    p_pull = min(0.8, max(0.1, 0.4 - 0.3 * tau))
    p_opp = min(0.8, max(0.1, 0.3 + 0.3 * tau))
    return sample({"pull": p_pull, "opposite": p_opp, "straight back": max(0.05, 1 - p_pull - p_opp)})


def whiff_type(tau, offspeed):
    p_front = min(0.7, max(0.05, 0.33 - 0.3 * tau + (0.1 if offspeed else 0)))
    p_late = min(0.7, max(0.05, 0.33 + 0.3 * tau - (0.1 if offspeed else 0)))
    return sample({"out in front": p_front, "late": p_late, "fooled": max(0.05, 1 - p_front - p_late)})


# v0.6b baserunning from the same per-PA rates as the run tables (college_rates.py / hs_rates.py)
import json as _json
import college_rates as _cr
_RV = _json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "college_run_values.json")))
_RKEY = {"mlb": "mlb_check", "college": "college_d1", "college_d1": "college_d1", "college_d3": "college_d3", "hs": "hs"}


def level_rates():
    r = dict(_RV[_RKEY.get(LEVEL_NAME, "college_d1")])
    _cr.calibrate_out_rates(r)
    return r


def pre_pa(outs, bases, R):
    """Before the PA: a fielding error moves runners up, or a steal attempt of 2nd.
    (Wild pitches are already in the pitch model.)  Returns (outs_added, runs, bases, label)."""
    b1, b2, b3 = bases
    if any(bases) and rng.random() < 0.45 * R["E"]:
        return 0, (1 if b3 else 0), (False, b1, b2), "error, runners move up"
    if b1 and not b2:
        att = min(0.6, (R["SB"] + R["CS"]) / 0.22)
        if rng.random() < att:
            if rng.random() < R["SB"] / (R["SB"] + R["CS"]):
                return 0, 0, (False, True, b3), "stolen base"
            return 1, 0, (False, False, b3), "caught stealing"
    return 0, 0, bases, ""


def run_ball_in_play_v6b(contact, outs, bases, R):
    """Same outcome draw as before; runners move by the run-table model's rules."""
    po, p1, p2, p3, phr, pe = engine.IN_PLAY_BY_LEVEL[LEVEL_NAME][contact]
    ev = sample({"out": po, "single": p1, "double": p2, "triple": p3, "homer": phr, "error": pe})
    b1, b2, b3 = bases
    if ev == "out":
        if outs + 1 >= 3:
            return 1, 0, bases, "out"
        if b1 and outs < 2 and rng.random() < R["_gdp_rate"]:
            if outs + 2 >= 3:
                return 2, 0, (False, False, False), "double play"
            return 2, (1 if b3 else 0), (False, False, b2), "double play"
        if b3 and outs < 2 and rng.random() < R["_sf_rate"]:
            return 1, 1, (b1, b2, False), "sac fly"
        if b3 and outs < 2 and rng.random() < 0.25:
            return 1, 1, (b1, b2, False), "out, run scores"
        if b2 and not b3 and rng.random() < 0.30:
            return 1, 0, (b1, False, True), "out, runner to 3rd"
        return 1, 0, bases, "out"
    if ev in ("single", "error"):
        runs = 1 if b3 else 0
        r2_scores = b2 and rng.random() < 0.60
        runs += 1 if r2_scores else 0
        third = (b2 and not r2_scores)
        if b1 and not third and rng.random() < 0.25:
            return 0, runs, (True, False, True), ev          # R1 to 3rd
        return 0, runs, (True, b1, third), ev
    if ev == "double":
        runs = (1 if b2 else 0) + (1 if b3 else 0)
        if b1 and rng.random() < 0.45:
            return 0, runs + 1, (False, True, False), ev
        return 0, runs, (False, True, b1), ev
    if ev == "triple":
        return 0, b1 + b2 + b3, (False, False, True), ev
    return 0, b1 + b2 + b3 + 1, (False, False, False), "home run"


def run_ball_in_play_typed(contact, outs, bases, p, q, infield_in=False, dh=0.0):
    """v0.8 (spec 7.3): batted-ball type, then the typed outcome table and runner rules the engine uses.
    dh (TRUE_POWER): item 8's logit shift on HR, applied exactly as engine.in_play_value_typed does (out of that type's outs)."""
    L = LEVEL_NAME
    t = sample(engine.type_mix(p, q, contact))
    po, p1, p2, p3, phr, pe = engine.OUT_TABLE[L][contact][t]
    if dh and 0 < phr < 1:
        nhr = engine.sig(engine.logit(phr) + dh)
        po, phr = max(0.0, po - (nhr - phr)), nhr
    rf = engine.RUNNER_FIT[L]
    ev = sample({"out": po, "single": p1, "double": p2, "triple": p3, "homer": phr, "error": pe})
    b1, b2, b3 = bases
    if ev != "out":
        return hit_advance(ev, bases) + (t,)
    if outs + 1 >= 3:
        return 1, 0, bases, f"{t} out", t
    if t == "GB" and b1 and rng.random() < min(0.95, engine.TYPED["dp"][contact] * rf["S_DP"]):
        if outs + 2 >= 3:
            return 2, 0, (False, False, False), "double play", t
        return 2, (1 if b3 else 0), (False, False, b2), "double play", t
    psc = (engine.TYPED["gb_infield_in"] if infield_in else rf["p_GB"]) if t == "GB" else (rf["p_FB"] if t == "FB" else 0.01)
    scored = b3 and rng.random() < psc
    adv = engine.TYPED["r2_to_3rd"].get(t, 0.0)
    nb3 = b3 and not scored
    if b2 and not nb3 and rng.random() < adv:
        return 1, (1 if scored else 0), (b1, False, True), (f"{t} out, run scores, runner to 3rd" if scored else f"{t} out, runner to 3rd"), t
    return 1, (1 if scored else 0), (b1, b2, nb3), (f"{t} out, run scores" if scored else f"{t} out"), t


def hit_advance(ev, bases):
    """Runner moves on a hit or error (same rules as run_ball_in_play_v6b)."""
    b1, b2, b3 = bases
    if ev in ("single", "error"):
        runs = 1 if b3 else 0
        r2_scores = b2 and rng.random() < 0.60
        runs += 1 if r2_scores else 0
        third = (b2 and not r2_scores)
        if b1 and not third and rng.random() < 0.25:
            return 0, runs, (True, False, True), ev
        return 0, runs, (True, b1, third), ev
    if ev == "double":
        runs = (1 if b2 else 0) + (1 if b3 else 0)
        if b1 and rng.random() < 0.45:
            return 0, runs + 1, (False, True, False), ev
        return 0, runs, (False, True, b1), ev
    if ev == "triple":
        return 0, b1 + b2 + b3, (False, False, True), ev
    return 0, b1 + b2 + b3 + 1, (False, False, False), "home run"


def run_ball_in_play(contact, outs, bases):
    """Returns (outs_added, runs, new_bases, label)."""
    po, p1, p2, p3, phr, pe = engine.IN_PLAY_BY_LEVEL[LEVEL_NAME][contact] if hasattr(engine, "IN_PLAY_BY_LEVEL") else IN_PLAY[contact]
    ev = sample({"out": po, "single": p1, "double": p2, "triple": p3, "homer": phr, "error": pe})
    b1, b2, b3 = bases
    if ev == "out":
        if b1 and contact == "weak" and outs < 2 and rng.random() < 0.20:
            return 2, 0, (False, b2, b3), "double play"
        if b3 and outs < 2 and rng.random() < 0.40:
            return 1, 1, (b1, b2, False), "out, run scores"
        return 1, 0, bases, "out"
    if ev in ("single", "error"):
        runs = 1 if b3 else 0
        if b2 and rng.random() < 0.55:
            return 0, runs + 1, (True, b1, False), ev
        return 0, runs, (True, b1, b2), ev
    if ev == "double":
        runs = (1 if b2 else 0) + (1 if b3 else 0)
        if b1 and rng.random() < 0.4:
            return 0, runs + 1, (False, True, False), ev
        return 0, runs, (False, True, b1), ev
    if ev == "triple":
        return 0, b1 + b2 + b3, (False, False, True), ev
    return 0, b1 + b2 + b3 + 1, (False, False, False), "home run"


# ---------------------------------------------------------------------------
# The game
# ---------------------------------------------------------------------------

def conf_event(p, event):
    if hasattr(engine, "update_confidence"):
        engine.update_confidence(p, event)
        return
    delta = {"ball": -0.02, "cstrike": 0.04, "whiff": 0.08 if p.kind == "FB" else 0.04,
             "hard": -0.08, "shakeoff": -0.20}[event]
    p.conf = max(0.0, min(1.0, p.conf + delta))


def new_batter_conf(arsenal):
    if hasattr(engine, "regress_confidence"):
        for p in arsenal:
            engine.regress_confidence(p)


def our_half_inning_runs():
    # v0.6: our offense scores the level's average runs per inning (run table, bases empty, 0 outs)
    shape = {1: 0.17, 2: 0.09, 3: 0.05, 4: 0.03}                   # relative odds of 1-4 runs
    m = sum(r * v for r, v in shape.items()) / sum(shape.values())   # mean runs when we score
    target = engine.re(0, (False, False, False), LEVEL_NAME) if hasattr(engine, "run_scale") else 0.48
    p_score = min(0.7, target / m)
    t = sum(shape.values())
    return sample({0: 1 - p_score, **{r: p_score * v / t for r, v in shape.items()}})


def noisy(value, options):
    """An optional entry, logged wrong NOISE of the time."""
    return rng.choice(options) if NOISE and rng.random() < NOISE else value


def play_game(log_path):
    starter, reliever = our_staff()
    # hidden true movement: shape tag +/- a few inches (own rng so it's the same across input levels)
    mrng = random.Random(SEED_FOR_MOVE[0])
    true_move = {}
    for who in (starter, reliever):
        for x in who["arsenal"]:
            ivb, hb = engine.movement(x)
            true_move[(who["name"], x.name)] = ((ivb + mrng.gauss(0, 3), hb + mrng.gauss(0, 3)) if TRUE_MOVE else (ivb, hb))
            if INPUTS >= 4:   # measured: the engine sees the real numbers
                x.ivb, x.hb = true_move[(who["name"], x.name)]
    pitcher = starter
    lineup = their_lineup()
    if TRUE_POWER:                                   # own stream: the main rng sequence is untouched
        prng = random.Random(SEED_FOR_MOVE[0] * 1_000_003 + 17)
        for hh in lineup:
            hh["w"] = max(1.0, min(5.0, 3.0 + prng.gauss(0, 1)))
    K = Knowledge()
    land = defaultdict(lambda: [0, 0])          # (pitcher, pitch name) -> [strikes, thrown] today
    orng = random.Random(SEED_FOR_MOVE[0] * 31 + 7)
    offs = {starter["name"]: draw_off(orng, starter["arsenal"]), reliever["name"]: draw_off(orng, reliever["arsenal"])}
    CURRENT_OFF.clear(); CURRENT_OFF.update(offs[starter["name"]])
    R = level_rates()
    log = []
    our_runs = their_runs = 0
    line_us, line_them = [], []
    pitch_count = 0
    batters_faced = 0
    batter_idx = 0
    pitch_no = 0
    fam = defaultdict(lambda: {"FB": 0, "OS": 0})   # v0.8 (5): (pitcher, hitter) -> class -> pitches seen in earlier PAs
    mm = defaultdict(lambda: defaultdict(int))      # v0.9 (item 6): (pitcher, hitter) -> 'succ|KIND' / 'hard|KIND|target' -> n
    ump_true = rng.gauss(0, UMP_SD) if UMP_SD > 0 else 0.0
    takes = []                                       # v0.8 (7.5): (called strike?, p_i, d_i) for the umpire learner

    for inning in range(1, 10):
        # We are the home team: they bat first (we pitch), then we bat.
        outs, bases, runs_inn = 0, (False, False, False), 0
        while outs < 3:
            if pitcher is starter and pitch_count >= 95:
                pitcher = reliever
                CURRENT_OFF.clear(); CURRENT_OFF.update(offs[reliever["name"]])
                pitch_count, batters_faced = 0, 0
                log.append({"event": f"PITCHING CHANGE: {reliever['name']} in, inning {inning}"})
            hitter = lineup[batter_idx % 9]
            batter_idx += 1
            batters_faced += 1
            h = hitter["name"]
            K.decay_timing(h)
            new_batter_conf(pitcher["arsenal"])
            balls = strikes = 0
            last = None
            pa_done = False
            fam_prev = dict(fam[(pitcher["name"], h)])
            mm_prev = dict(mm[(pitcher["name"], h)])     # earlier trips only: this PA's pitches count from his next PA
            tab, frozen, look, fooled = None, None, None, []      # v0.8 (6): this PA's table, its inputs, the look
            _tw = [None, None, None]                                # TRUTH_TAB=world: the world's table for this PA
            win_pa = None                                         # v0.8 (7.2): objective constants, fixed at PA start
            o_add, r_pre, bases, pre_label = pre_pa(outs, bases, R)
            if pre_label:
                outs += o_add
                their_runs += r_pre
                runs_inn += r_pre
                log.append({"event": f"{pre_label} (inning {inning})"})
                if outs >= 3:
                    batter_idx -= 1          # inning over before he batted; he leads off next inning
                    batters_faced -= 1
                    break
            while not pa_done:
                pitch_no += 1
                pitch_count += 1
                margin = our_runs - their_runs
                s = Situation(balls, strikes, outs, bases, inning=inning, margin=margin,
                              pitch_count=pitch_count, batters_faced=batters_faced, level=LEVEL_NAME,
                              same_side=(hitter["hand"] == pitcher["hand"]), last=last,
                              hitter_seen=dict(K.seen[h]), usage_this_count=dict(K.usage[(balls, strikes)]),
                              timing=dict(K.timing[h]), hitter_damage=dict(K.damage[h]),
                              landing_today={x.name: tuple(land[(pitcher["name"], x.name)]) for x in pitcher["arsenal"]
                                             if land[(pitcher["name"], x.name)][1]},
                              familiar=fam_prev, matchup=mm_prev,
                              ump_u=CALLER.ump_estimate(takes, LEVEL_NAME),
                              home=True, sched_innings=9,
                              grades=({"w": max(1, min(5, round(hitter["w"])))} if SEE_POWER else None))
                if win_pa is None:
                    win_pa = CALLER.win_constants(s)
                s = replace(s, win=win_pa)
                ars = pitcher["arsenal"]
                if tab is None or CALLER.needs_resolve(frozen, ars, s):
                    tab = CALLER.solve_table(ars, replace(s, balls=0, strikes=0, last=None))
                    frozen = CALLER.frozen_inputs(ars, s)
                    if look is None:
                        look = tab.h0
                s = replace(s, look=look, b_h=CALLER.lean_b_h(ars, s, fooled),
                            usage_by_call=dict(K.usage_call[(pitcher["name"], balls, strikes)]))
                # engine call, with possible shake-offs
                shakes = []
                shaken = set()
                for attempt in range(3):
                    (p, q, prob, cst), dist, tab, _info = CALLER.call_v08(ars, s, rng=rng, exclude=shaken, tab=tab)
                    p_shake = min(0.9, SHAKE * max(0.0, 0.35 * (0.75 - p.conf))) if attempt < 2 else 0.0
                    if rng.random() < p_shake:
                        shakes.append(f"{p.name} {q}")
                        shaken.add((p.name, q))
                        conf_event(p, "shakeoff")
                        continue
                    break
                override = 0
                if OVERRIDE and rng.random() < OVERRIDE:   # the coach calls his own pitch instead
                    cands_ = CALLER.candidates(ars, s)
                    p = rng.choice(cands_); q = rng.choice(QUADS); override = 1
                    prob = next((d[0] for d in dist if d[2].name == p.name and d[3] == q), 0.0)
                    cst = CALLER.root_costs(ars, s, tab)[(p.name, q)]
                best_cost = min(d[1] for d in dist)
                top3 = "; ".join(f"{d[2].name} {d[3]} {d[0]:.0%}" for d in dist[:3])
                # read-through, log-only (no rng draw, no change to the call): the why line, the intent and the hitter's
                # most likely sit
                why_txt, guess_txt, intent_txt = "", "", ""
                if not override:
                    why_txt = CALLER.why_line(ars, s, tab, (p, q), _info)[0]
                    intent_txt = CALLER.intent_label(ars, s, tab, (p, q), _info, exclude=shaken)[0]     # v0.9 item 4
                    sg = _info["sigma"]
                    gk = max(sg, key=sg.get)
                    guess_txt = f"{gk[0]} {gk[1]} {sg[gk]:.0%}"
                pitch_mix = Counter()
                for d in dist:
                    pitch_mix[d[2].name] += d[0]

                pre_conf = p.conf
                cls0 = "OS" if is_offspeed(p.kind) else "FB"
                pre_dmg, pre_n = K.damage[h].get(cls0, (0.0, 0))
                pre_tau = K.timing[h][cls0]
                # what actually happens (truth)
                ts = replace(true_situation(s, hitter), ump_u=ump_true)
                ars_true = [replace(x, ivb=true_move[(pitcher["name"], x.name)][0],
                                    hb=true_move[(pitcher["name"], x.name)][1]) for x in ars]
                p_true = next(x for x in ars_true if x.name == p.name)
                P = outcome_probs(p_true, q, ts, ars_true)
                # decision quality: true run cost of the engine's mix vs a caller who knows the hidden truth
                tc = engine.root_costs(ars_true, ts, tab)
                tcw = None
                if TRUTH_TAB == "world":
                    if _tw[0] is not tab or _tw[1] != h:
                        _tw[:] = [tab, h, engine.solve_table(ars_true, replace(ts, balls=0, strikes=0, last=None))]
                    tcw = engine.root_costs(ars_true, ts, _tw[2])
                t_best = min(tc.values())
                regret_exp = sum(d[0] * (tc.get((d[2].name, d[3]), t_best) - t_best) for d in dist)
                regret_pick = tc.get((p.name, q), t_best) - t_best
                est_best = min(dist, key=lambda d: d[1])            # the engine's own best guess
                regret_info = tc.get((est_best[2].name, est_best[3]), t_best) - t_best
                regret_mix = regret_exp - regret_info
                rw = {}
                if tcw is not None:
                    wb = min(tcw.values())
                    rw = {"regret_w_exp": round(sum(d[0] * (tcw.get((d[2].name, d[3]), wb) - wb) for d in dist), 5),
                          "regret_w_pick": round(tcw.get((p.name, q), wb) - wb, 5),
                          "regret_w_info": round(tcw.get((est_best[2].name, est_best[3]), wb) - wb, 5)}
                ev = sample(P)
                tau = hitter["timing"]
                cls = "OS" if is_offspeed(p.kind) else "FB"
                tau_cls = tau if cls == "FB" else -tau
                detail, runs_scored = "", 0
                K.seen[h][p.name] += 1
                fam[(pitcher["name"], h)][cls] += 1
                if ev in ("whiff", "cstrike"):
                    mm[(pitcher["name"], h)]["succ|" + p.kind] += 1
                elif ev == "hard":
                    mm[(pitcher["name"], h)]["hard|" + p.kind + "|" + q] += 1
                if ev in ("ball", "wp_ball", "cstrike", "hbp"):
                    p0, d0 = CALLER.take_stats(p, q, replace(s, ump_u=0.0), ars)
                    takes.append((1 if ev == "cstrike" else 0, p0, d0))
                land[(pitcher["name"], p.name)][1] += 1
                land[(pitcher["name"], p.name)][0] += ev in ("cstrike", "whiff", "foul", "weak", "solid", "hard")
                K.usage[(balls, strikes)][p.name] += 1
                K.usage_call[(pitcher["name"], balls, strikes)][(p.name, q)] += 1
                look = CALLER.look_update(look, p, q, s)
                result = ev

                if ev in ("ball", "wp_ball"):
                    if ev == "wp_ball":
                        b1, b2, b3 = bases
                        runs_scored = 1 if b3 else 0
                        bases = (False, b1, b2)
                        detail = "wild pitch, runners move up"
                        result = "ball"
                    balls += 1
                    conf_event(p, "ball")
                    if balls == 4:
                        b1, b2, b3 = bases
                        runs_scored += 1 if (b1 and b2 and b3) else 0
                        bases = (True, b1 or b2, b3 or (b1 and b2))
                        detail = (detail + "; " if detail else "") + "WALK"
                        pa_done = True
                elif ev == "hbp":
                    b1, b2, b3 = bases
                    runs_scored += 1 if (b1 and b2 and b3) else 0
                    bases = (True, b1 or b2, b3 or (b1 and b2))
                    detail = "HIT BY PITCH"
                    conf_event(p, "ball")
                    pa_done = True
                elif ev in ("cstrike", "whiff"):
                    strikes += 1
                    if ev == "whiff":
                        wt = whiff_type(tau_cls, cls == "OS")
                        detail = f"whiff ({wt})"
                        if INPUTS >= 3:
                            wt_log = noisy(wt, ["out in front", "late", "fooled"])
                            K.update_timing(h, cls, {"out in front": -0.8, "late": 0.8, "fooled": 0.0}[wt_log])
                            if wt_log == "fooled":
                                fooled.append(cls)      # v0.8 (2.5) sit evidence for the rest of this at-bat
                        K.update_damage(h, cls, "whiff")
                        conf_event(p, "whiff")
                    else:
                        conf_event(p, "cstrike")
                    if strikes == 3:
                        outs += 1
                        detail = (detail + "; " if detail else "") + "STRIKEOUT"
                        pa_done = True
                elif ev == "foul":
                    fd = foul_direction(tau_cls)
                    detail = f"foul {fd}"
                    # read against location: an away pitch fouled opposite is normal contact
                    fd_log = noisy(fd, ["pull", "opposite", "straight back"]) if INPUTS >= 3 else None
                    if fd_log == "pull":
                        K.update_timing(h, cls, -0.6)
                    elif fd_log == "opposite" and "away" not in q and q != "chase":
                        K.update_timing(h, cls, 0.6)
                    K.update_damage(h, cls, "foul")
                    if strikes < 2:
                        strikes += 1
                else:   # in play
                    dh = engine.power_hr_shift(ts, ts.grades) if (TRUE_POWER and ev == "hard" and ts.grades) else 0.0
                    o_add, runs_scored, bases, label, _bt = run_ball_in_play_typed(ev, outs, bases, p_true, q, dh=dh)
                    outs += o_add
                    detail = f"{ev} contact: {label.upper()}"
                    if INPUTS >= 2:
                        ev_log = noisy(ev, ["weak", "solid", "hard"])
                        K.update_damage(h, cls, ev_log)
                        if ev_log == "hard":
                            conf_event(p, "hard")
                    else:   # results only: the coach knows hit or out, not how hard
                        hit = label in ("single", "double", "triple", "home run")
                        K.update_damage(h, cls, "hit" if hit else "out")
                        if label in ("double", "triple", "home run"):
                            conf_event(p, "hard")
                    pa_done = True

                their_runs += runs_scored
                runs_inn += runs_scored
                log.append({
                    "pitch": pitch_no, "inning": inning, "pitcher": pitcher["name"], "pc": pitch_count,
                    "batter": h, "hand": hitter["hand"], "count": f"{s.balls}-{s.strikes}", "outs": s.outs,
                    "bases": "".join(str(i + 1) if b else "-" for i, b in enumerate(s.bases)),
                    "score": f"{our_runs}-{their_runs - runs_scored}",
                    "call": f"{p.name} {q}", "kind": p.kind, "quad": q, "pick_prob": round(prob, 3),
                    "runs_vs_best": round(cst - best_cost, 4), "conf": round(pre_conf, 2),
                    "mix": ", ".join(f"{k} {v:.0%}" for k, v in pitch_mix.most_common()),
                    "top3": top3, "shakeoffs": " | ".join(shakes), "guess": guess_txt, "why": why_txt, "intent": intent_txt,
                    "last": f"{last[0]} {last[1]} ({last[2]})" if last else "",
                    "result": result, "detail": detail, "runs": runs_scored,
                    "est_timing": round(pre_tau, 2),
                    "est_dmg": round(pre_dmg, 2), "est_n": pre_n,
                    "true_dmg": round(hitter["fb" if cls == "FB" else "os"], 2),
                    "cutoff": LEVEL[LEVEL_NAME]["cutoff"], "level": LEVEL_NAME, "override": override,
                    "trusted": sum(x.conf >= LEVEL[LEVEL_NAME]["cutoff"] for x in ars),
                    "off_today": round(CURRENT_OFF.get(p.name, 0.0), 2), "inputs": INPUTS, "noise": NOISE,
                    "regret_exp": round(regret_exp, 5), "regret_pick": round(regret_pick, 5),
                    "regret_info": round(regret_info, 5), "regret_mix": round(regret_mix, 5), "big_spot": int(s.inning >= 7 and abs(margin) <= 2 and (s.bases[1] or s.bases[2])),
                    **rw, **({"true_w": round(hitter["w"], 2)} if TRUE_POWER else {}),
                })
                last = (p.name, q, "whiff" if ev == "whiff" else result)
                if outs >= 3:
                    pa_done = True
        line_them.append(runs_inn)
        if inning == 9 and our_runs > their_runs:
            line_us.append("x")
            break
        r = our_half_inning_runs()
        our_runs += r
        line_us.append(r)
        if inning == 9 and our_runs > their_runs:
            break
    # extra innings not simulated: tie after 9 counts as a tie

    rows = [r for r in log if "pitch" in r]
    with open(log_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    return log, lineup, (line_them, line_us, their_runs, our_runs), (starter, reliever)


def pregame_plan(staff):
    """The engine's attack plan with zero scouting: mix by count vs a generic same-side hitter."""
    starter = staff[0]
    out = []
    for (b, k) in [(0, 0), (1, 0), (0, 1), (1, 1), (2, 1), (1, 2), (0, 2), (3, 1), (2, 2), (3, 2)]:
        for same in (True, False):
            s = Situation(b, k, 0, (False, False, False), same_side=same, level=LEVEL_NAME)
            pol, costs, _ = mixed_policy(starter["arsenal"], s)
            best_q = {}
            for name in pol:
                if pol[name] > 0.005:
                    best_q[name] = min(QUADS, key=lambda q: costs[(name, q)])
            mix = ", ".join(f"{n} {v:.0%} ({best_q[n]})" for n, v in sorted(pol.items(), key=lambda t: -t[1]) if v > 0.005)
            out.append((f"{b}-{k}", "same side" if same else "opposite side", mix))
    return out


SEED_FOR_MOVE = [SEED]


def run(seed, path):
    global rng
    rng = random.Random(seed)
    SEED_FOR_MOVE[0] = seed
    return play_game(path)


if __name__ == "__main__":
    staff = our_staff()
    plan = pregame_plan(staff)
    print("PREGAME PLAN (starter, no scouting)")
    for c, side, mix in plan:
        print(f"  {c:4} {side:14} {mix}")
    log, lineup, (them, us, tr, ur), _ = play_game(f"game_{SEED}.csv")
    print("\nHIDDEN LINEUP TRUTH")
    for h in lineup:
        print(f"  {h['name']} {h['hand']}  fb {h['fb']:+.2f}  os {h['os']:+.2f}  timing {h['timing']:+.2f}")
    print(f"\nLINE  them {them} = {tr}   us {us} = {ur}")
    print(f"pitches: {len([r for r in log if 'pitch' in r])}")
