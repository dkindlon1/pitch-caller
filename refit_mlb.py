import json, calib
from calib import fit, fit_inplay, show, PA_TARGETS, MLB_PITCH, OUTCOME_ADJ, IN_PLAY_BY_LEVEL
saved = json.load(open("fit_mlb.json"))
OUTCOME_ADJ["mlb"].update(saved["OUT"]["mlb"])
tg = dict(PA_TARGETS["mlb"]); tg.update(MLB_PITCH)
r = fit("mlb", calib.KEYS, tg, {"K": 3, "BB": 3, "HBP": 1}, start=saved["OUT"]["mlb"], rounds=2)
tab, mix, target, model = fit_inplay("mlb", "mlb_check")
show("mlb", "mlb refit")
json.dump({"OUT": {"mlb": r}, "INP": {"mlb": {c: list(v) for c, v in tab.items()}}}, open("fit_mlb.json", "w"), indent=1)
