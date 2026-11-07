"""Inline the tested engine, its data, the database/learning/import modules, the roster screen and the learning worker into one page:
dist/pitch-caller.html"""
import json, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
# Read and write with an explicit encoding and newline, so the build is byte-identical on every platform and
# scripts/test-app.sh's "app/dist is out of date" gate means what it says. Without newline="\n" below, Python's
# text mode on Windows turns every \n into \r\n, which rewrites all ~9000 lines against a Linux/macOS build;
# without encoding="utf-8" the reads use the platform default (cp1252 on Windows) and can fail outright.
rd = lambda f: open(f, encoding="utf-8").read()
src = rd("index.src.html")
eng = rd("engine.js")
data = json.dumps(json.loads(rd("engine_data.json")), separators=(",", ":"))
modules = "\n".join(rd(f) for f in ("db.js", "learn.js", "learner.js", "import.js", "sync.js", "pitch_rules.js", "worker.js"))
# the learning worker's source: the engine, learner v2 and the message handler, started from a blob by roster.js
worker = "\n".join(rd(f) for f in ("engine.js", "learner.js", "worker.js"))
roster = rd("roster.js")
for mark in ("/*__ENGINE__*/", "/*__DATA__*/", "/*__MODULES__*/", "/*__ROSTER__*/", "/*__WORKER__*/"):
    assert src.count(mark) == 1, mark
# the inlined code goes in as plain text: a "</script" inside it would end the script tag early
for name, code in (("engine.js", eng), ("modules", modules), ("roster.js", roster), ("worker", worker)):
    assert "</script" not in code.lower(), name
out = src.replace("/*__ENGINE__*/", eng).replace("/*__DATA__*/", data).replace("/*__MODULES__*/", modules).replace("/*__ROSTER__*/", roster).replace("/*__WORKER__*/", worker)
os.makedirs("dist", exist_ok=True)
open("dist/pitch-caller.html", "w", encoding="utf-8", newline="\n").write(out)
print("built", len(out) // 1024, "KB")
