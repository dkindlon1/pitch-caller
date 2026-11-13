"""v1.1 Step 2 changes the calls on purpose in exactly three engine functions: profile_terms (new), shape_fit (the v1.0
fastball lines and the slider / changeup same-side patches removed) and gb_rate (by profile). step2_off(engine) sets those
three back to their Step 1b versions (copied from engine.py at commit 7b5ebbb) inside a with-block, and with params
(params_at()) also the level shifts the realism gate refit, for tests_v11.py's
exactness check and readthrough/v11_call_changes.py's "before" column. The engine itself has no switch."""


def _sf_1b(e):
    def shape_fit(p, q, s):
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
        return f
    return shape_fit


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


def params_at(ref="7b5ebbb"):
    """the fitted level shifts (OUTCOME_FIT) and in-play tables (IN_PLAY_FIT) of outcome_params.py at a git ref: Step 2's
    realism gate refit them (fit_all.py, refit_mlb.py), so the Step 1b engine is those three functions plus these"""
    import os, subprocess
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src = subprocess.run(["git", "show", f"{ref}:outcome_params.py"], cwd=here, capture_output=True, text=True, check=True).stdout
    ns = {}
    exec(src, ns)
    return ns["OUTCOME_FIT"], ns["IN_PLAY_FIT"]


class step2_off:
    def __init__(self, e, params=None):
        self.e, self.params = e, params

    def __enter__(self):
        import copy
        e = self.e
        self.saved = (e.profile_terms, e.shape_fit, e.gb_rate)
        e.profile_terms = lambda p, q, s, a: {"whiff": 0.0, "chase": 0.0, "cstrike": 0.0, "hard": 0.0}
        e.shape_fit, e.gb_rate = _sf_1b(e), _gb_1b(e)
        if self.params is not None:
            self.saved_p = (copy.deepcopy(e.OUTCOME_ADJ), copy.deepcopy(e.IN_PLAY_BY_LEVEL))
            fit, inp = self.params
            for lvl, d in fit.items():
                e.OUTCOME_ADJ[lvl].update(d)
            e.IN_PLAY_BY_LEVEL.update(inp)

    def __exit__(self, *a):
        e = self.e
        e.profile_terms, e.shape_fit, e.gb_rate = self.saved
        if self.params is not None:
            adj, inp = self.saved_p
            for lvl, d in adj.items():
                e.OUTCOME_ADJ[lvl].clear(); e.OUTCOME_ADJ[lvl].update(d)
            e.IN_PLAY_BY_LEVEL.clear(); e.IN_PLAY_BY_LEVEL.update(inp)
