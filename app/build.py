"""Inline the tested engine, its data, the database/learning/import modules, the roster screen and the learning worker into one page:
dist/pitch-caller.html"""
import json, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
src = open("index.src.html").read()
eng = open("engine.js").read()
data = json.dumps(json.load(open("engine_data.json")), separators=(",", ":"))
modules = "\n".join(open(f).read() for f in ("db.js", "learn.js", "learner.js", "import.js", "sync.js", "grade_all.js", "worker.js"))
# the learning worker's source: the engine, learner v2 and the message handler, started from a blob by roster.js
worker = "\n".join(open(f).read() for f in ("engine.js", "learner.js", "worker.js"))
roster = open("roster.js").read()
for mark in ("/*__ENGINE__*/", "/*__DATA__*/", "/*__MODULES__*/", "/*__ROSTER__*/", "/*__WORKER__*/"):
    assert src.count(mark) == 1, mark
# the inlined code goes in as plain text: a "</script" inside it would end the script tag early
for name, code in (("engine.js", eng), ("modules", modules), ("roster.js", roster), ("worker", worker)):
    assert "</script" not in code.lower(), name
out = src.replace("/*__ENGINE__*/", eng).replace("/*__DATA__*/", data).replace("/*__MODULES__*/", modules).replace("/*__ROSTER__*/", roster).replace("/*__WORKER__*/", worker)
os.makedirs("dist", exist_ok=True)
open("dist/pitch-caller.html", "w").write(out)
print("built", len(out) // 1024, "KB")
