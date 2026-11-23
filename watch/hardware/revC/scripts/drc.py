"""Run KiCad's own design-rule check (pcbnew.WriteDRCReport) on the board and print the counts. Exit 1 unless clean."""
import sys, re, os, pcbnew
pcb = sys.argv[1]; rpt = sys.argv[2]
b = pcbnew.LoadBoard(pcb)
pcbnew.WriteDRCReport(b, rpt, pcbnew.EDA_UNITS_MILLIMETRES, True)
s = open(rpt).read()
v = int(re.search(r"Found (\d+) DRC violations", s).group(1)); u = int(re.search(r"Found (\d+) unconnected pads", s).group(1))
f = re.search(r"Found (\d+) Footprint errors", s); f = int(f.group(1)) if f else 0
err, warn = {}, {}
for m in re.finditer(r"^\[(\w+)\]: [^\n]*\n[^\n]*Severity: (\w+)", s, re.M):
    d = err if m.group(2) == "error" else warn; d[m.group(1)] = d.get(m.group(1), 0) + 1
print(f"DRC (KiCad {pcbnew.Version()}): errors {sum(err.values())} {err}, unconnected {u}, warnings {sum(warn.values())} {warn}")
sys.exit(0 if not err and u == 0 else 1)
