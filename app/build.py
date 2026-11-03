"""Inline the tested engine and its data into one page: dist/pitch-caller.html"""
import json, os
src = open("index.src.html").read()
eng = open("engine.js").read()
data = json.dumps(json.load(open("engine_data.json")), separators=(",", ":"))
assert "/*__ENGINE__*/" in src and "/*__DATA__*/" in src
out = src.replace("/*__ENGINE__*/", eng).replace("/*__DATA__*/", data)
os.makedirs("dist", exist_ok=True)
open("dist/pitch-caller.html", "w").write(out)
print("built", len(out) // 1024, "KB")
