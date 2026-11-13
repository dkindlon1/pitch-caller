"""v1.1 Step 2 changes the calls on purpose in five engine places: profile_terms (new), class_terms (replaces v1.0's
KIND_W class weights, the off-speed and fastball lines of shape_fit, the slider / changeup same-side patches, the
"off-speed aimed up or middle" hard line and the off-speed chase +0.2), gb_rate (by profile), movement (the slot
adjustment of default movement), the level shifts the realism gate refit (outcome_params.py) and the "away" coach
read's size. step2_off(engine,
params) sets them back to their Step 1b versions (written out below from engine.py at commit 7b5ebbb) inside a
with-block, for tests_v11.py's exactness check and readthrough/v11_call_changes.py's "before" column. The engine itself
has no switch."""

KIND_W_1B = {"FB": -0.20, "SI": -0.20, "FC": -0.20, "SL": 0.25, "CB": 0.20, "CH": 0.25}


def _ct_1b(e):
    def class_terms(p, q, s):
        f = 0.0
        up = q.startswith("up")
        if e.is_fastball(p.kind):
            if (p.kind, p.shape) == ("FB", "rides"):
                f += 0.5 if up else -0.2
            if (p.kind, p.shape) == ("SI", "run"):
                f += 0.5 if not up else -0.3
        else:
            f += 0.4 if (not up or q == "chase") else -1.0
            if p.kind == "SL" and s.same_side and ("away" in q or q == "chase"):
                f += 0.3
        if p.kind == "CH" and s.same_side:
            f -= 0.3
        os_ = e.is_offspeed(p.kind)
        return {"whiff": (KIND_W_1B[p.kind] - e.W_FB) + 0.25 * f,
                "chase": {"off": 0.2 if os_ else 0.0, "noncomp": 0.0},
                "cstrike": 0.0,
                "hard": -0.3 * f + (0.4 if os_ and (up or q == "middle") else 0.0)}
    return class_terms


def _gb_1b(e):
    def gb_rate(p):
        g = e.TYPED["gb"]
        if p.kind == "SI":
            return g["4-seam"] if p.shape == "two-seam" else g["sink"]
        if p.kind == "FC" or (p.kind == "FB" and p.shape == "cuts"):
            return g["cut"]
        if p.kind == "FB":
            return g["4-seam"]
        return g[p.kind]
    return gb_rate


def _mv_1b(e):
    def movement(p, level=None):
        _, ivb, hb = e.profile(p.kind, p.shape, level)
        if p.ivb is not None:
            ivb = p.ivb
        if p.hb is not None:
            hb = p.hb
        return ivb, hb
    return movement


def params_at(ref="7b5ebbb"):
    """the fitted level shifts (OUTCOME_FIT) and in-play tables (IN_PLAY_FIT) of outcome_params.py at a git ref"""
    import os, subprocess
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src = subprocess.run(["git", "show", f"{ref}:outcome_params.py"], cwd=here, capture_output=True, text=True, check=True).stdout
    ns = {}
    exec(src, ns)
    return ns["OUTCOME_FIT"], ns["IN_PLAY_FIT"]


class step2_off:
    NAMES = ("profile_terms", "class_terms", "gb_rate", "movement")

    def __init__(self, e, params=None):
        self.e, self.params = e, params

    def __enter__(self):
        import copy
        e = self.e
        self.saved = {n: getattr(e, n) for n in self.NAMES}
        e.profile_terms = lambda p, q, s, a: {"whiff": 0.0, "chase": 0.0, "cstrike": 0.0, "hard": 0.0}
        e.class_terms, e.gb_rate, e.movement = _ct_1b(e), _gb_1b(e), _mv_1b(e)
        self.saved_away = e.COACH_RULE["away"]
        e.COACH_RULE["away"] = 0.01                       # Step 2 resized it to 0.012 (engine.py COACH_RULE)
        if self.params is not None:
            self.saved_p = (copy.deepcopy(e.OUTCOME_ADJ), copy.deepcopy(e.IN_PLAY_BY_LEVEL))
            fit, inp = self.params
            for lvl, d in fit.items():
                e.OUTCOME_ADJ[lvl].update(d)
            e.IN_PLAY_BY_LEVEL.update(inp)

    def __exit__(self, *a):
        e = self.e
        for n, f in self.saved.items():
            setattr(e, n, f)
        e.COACH_RULE["away"] = self.saved_away
        if self.params is not None:
            adj, inp = self.saved_p
            for lvl, d in adj.items():
                e.OUTCOME_ADJ[lvl].clear(); e.OUTCOME_ADJ[lvl].update(d)
            e.IN_PLAY_BY_LEVEL.clear(); e.IN_PLAY_BY_LEVEL.update(inp)
