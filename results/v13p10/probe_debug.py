"""Part 10 task 5: which part of the two failing D1 probes fails (cstrike 1-1 +0.5; re 0|000 -> 0.9). Uses the test's own runner."""
import copy, json, os, sys, tempfile
sys.path.insert(0, "C:/dev/pc-final")
os.chdir("C:/dev/pc-final")
import tests_v13_tables as T
e = T.e
P = dict(lv="college_d1", o=0, bases=[False, False, False], same=True, pc=30, a=0)
probes = [dict(P, b=0, k=0, i=0, q="up-in"), dict(P, b=0, k=0, i=0, q="down-in"), dict(P, b=1, k=1, i=1, q="middle"),
          dict(P, lv="college_d3", b=0, k=0, i=0, q="up-in"), dict(P, b=1, k=1, i=2, q="down-away")]
spots = [dict(P, b=1, k=1, inning=3)]
pin = {"ars": T.ARS, "cases": probes, "calls": spots, "levels": ["college_d1", "college_d3"]}
for mp in (None, "v0"):
    env = dict(T.REFIT_ENV, **({"PITCH_MP_TABLE": mp} if mp else {}))
    ref = json.loads(T.run_py(T.HERE, pin, env))
    REF = {k: json.load(open(e.table_path(k, "v13refit"), encoding="utf8")) for k in ("count", "run")}
    tmp = tempfile.mkdtemp()
    t = copy.deepcopy(REF["count"]); t["version"] = "scratch-c"; t["levels"]["college_d1"]["cstrike"]["1-1"] += 0.5
    pc = os.path.join(tmp, "c.json"); json.dump(t, open(pc, "w", encoding="utf8"))
    t = copy.deepcopy(REF["run"]); t["version"] = "scratch-r"; t["levels"]["college_d1"]["re"]["0|000"] = 0.9
    pr = os.path.join(tmp, "r.json"); json.dump(t, open(pr, "w", encoding="utf8"))
    rc = json.loads(T.run_py(T.HERE, pin, dict(env, PITCH_COUNT_TABLE=pc)))
    rr = json.loads(T.run_py(T.HERE, pin, dict(env, PITCH_RUN_TABLE=pr)))
    print("mp", mp or "default(v13)")
    print("  cstrike: edge C", ref["cases"][4]["z"]["edge"]["C"], "->", rc["cases"][4]["z"]["edge"]["C"],
          "| kap1-1", ref["cases"][4]["kap"], "->", rc["cases"][4]["kap"], "| kap0-0", ref["cases"][0]["kap"], "->", rc["cases"][0]["kap"])
    print("    call", ref["calls"][0][:4], "->", rc["calls"][0][:4], "worst", T.worst(rc["calls"][0], ref["calls"][0]))
    print("  run: d1 run_scale", ref["extras"]["college_d1"]["run_scale"], "->", rr["extras"]["college_d1"]["run_scale"],
          "| d3 same", rr["extras"]["college_d3"] == ref["extras"]["college_d3"])
    print("    call", ref["calls"][0][:4], "->", rr["calls"][0][:4], "worst", T.worst(rr["calls"][0], ref["calls"][0]))
print("run probe detail (mp default):")
env = dict(T.REFIT_ENV)
ref = json.loads(T.run_py(T.HERE, pin, env)); rr = json.loads(T.run_py(T.HERE, pin, dict(env, PITCH_RUN_TABLE=pr)))
print("  d1 stakes", ref["extras"]["college_d1"]["stakes"][:4], "->", rr["extras"]["college_d1"]["stakes"][:4])
print("  ipv d1 case0", ref["cases"][0]["ipv"], "->", rr["cases"][0]["ipv"])
print("  ipv d3 case3 same", ref["cases"][3]["ipv"] == rr["cases"][3]["ipv"])
print("  run_scale pin", e.run_scale("college_d1"), e.run_scale("college_d3"), e.run_scale("mlb"), e.run_scale("hs"))
