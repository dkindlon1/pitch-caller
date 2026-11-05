"""Tests of the scenario grader itself (no engine calls). python3 readthrough/test_scenarios.py"""
import json, os, shutil, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.dirname(HERE)]
import scenarios as S

fails = 0


def check(ok, msg):
    global fails
    print(("  ok   " if ok else "  FAIL ") + msg)
    fails += not ok


row = dict(acceptable=["FB:zone", "SL:chase"], arguable=["OS:middle"], not_acceptable=["ANY:chase", "CH:any"])
check(S.classify(row, "FB", "middle") == "acc", "FB middle matches FB:zone -> Acceptable")
check(S.classify(row, "SL", "chase") == "not", "Not acceptable wins over Acceptable (SL chase)")
check(S.classify(row, "CH", "up-in") == "not", "CH:any catches every changeup target")
check(S.classify(row, "SL", "middle") == "arg", "SL middle -> Arguable")
check(S.classify(row, "SL", "up-in") == "arg", "unlisted calls default to Arguable")
check(S.matches("OS:down", "CB", "down-in") and not S.matches("OS:down", "FB", "down-in"), "OS means every pitch but the fastball")
check(S.matches("ANY:away", "FB", "up-away") and not S.matches("ANY:away", "FB", "up-in"), "away = up-away, down-away")
check(not S.matches("ANY:corners", "FB", "middle") and S.matches("ANY:zone", "FB", "middle"), "corners exclude middle; zone includes it")

doc, h = S.load()
check(len(doc["rows"]) == 64 and len({r["id"] for r in doc["rows"]}) == 64, "64 rows, unique ids")
check(all(r["acceptable"] for r in doc["rows"]), "every row has an Acceptable bin")

tmp = tempfile.mkdtemp()
try:
    p, q = os.path.join(tmp, "s.json"), os.path.join(tmp, "s.sha256")
    shutil.copy(S.PATH, p); shutil.copy(S.SHA, q)
    S.load(p, q)
    blob = open(p).read().replace('"acc_min": 0.7', '"acc_min": 0.5')
    open(p, "w").write(blob)
    try:
        S.load(p, q)
        check(False, "an edited scenario file is refused")
    except SystemExit:
        check(True, "an edited scenario file is refused")
finally:
    shutil.rmtree(tmp)

print(f"{'all grader checks passed' if not fails else f'{fails} FAILED'}")
sys.exit(1 if fails else 0)
