"""Compare the netlist KiCad exports from the schematic with design.py. Exit 1 on any difference."""
import re, sys, os
sys.path.insert(0, os.path.dirname(__file__)); import design as D
s = open(sys.argv[1]).read()
sch = {}
for m in re.finditer(r'\(net \(code "?\d+"?\) \(name "([^"]*)"\)([\s\S]*?)(?=\n    \(net |\n  \)\s*\)?\s*$)', s):
    name = m.group(1).lstrip("/")
    nodes = set(re.findall(r'\(node \(ref "([^"]+)"\) \(pin "([^"]+)"\)', m.group(2)))
    if name.startswith("unconnected-"): continue
    sch[name] = nodes
want = {k: set(v) for k, v in D.nets().items()}
bad = 0
for k in sorted(set(sch) | set(want)):
    a, b = sch.get(k, set()), want.get(k, set())
    if a != b: bad += 1; print("DIFF", k, "sch-only:", sorted(a - b), "design-only:", sorted(b - a))
comps = set(re.findall(r'\(comp \(ref "([^"]+)"\)', s))
if comps != set(D.P): bad += 1; print("COMPONENT DIFF", comps ^ set(D.P))
print(f"netlist check: {len(sch)} nets in schematic, {len(want)} in design, {len(comps)} components, differences: {bad}")
sys.exit(1 if bad else 0)
