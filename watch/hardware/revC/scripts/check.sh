#!/bin/bash
# Goal check for the PitchIQ watch rev C package (hardware files + firmware core tests). Every line below is a real tool run; nothing is assumed.
cd "$(dirname "$0")/.." || exit 2
fail=0
step() { echo "== $1"; }
step "1 schematic parses in KiCad and its netlist equals design.py"
(cd kicad && kicad-cli sch export netlist -o ../out/sch.net pitchiq_watch.kicad_sch >/dev/null 2>&1 && kicad-cli sch export pdf -o ../out/pitchiq_watch_revC_schematic.pdf pitchiq_watch.kicad_sch >/dev/null 2>&1) || { echo "netlist/PDF export FAILED"; fail=1; }
python3 scripts/check_net.py out/sch.net || fail=1
step "1b scripted electrical-rule check (NOT KiCad's ERC: KiCad 7 has no command-line ERC)"
python3 scripts/erc.py || fail=1
step "2 board copper equals design.py (pad nets) and KiCad DRC"
python3 scripts/check_pcb.py kicad/pitchiq_watch.kicad_pcb || fail=1
python3 scripts/drc.py kicad/pitchiq_watch.kicad_pcb out/drc_report.txt || fail=1
python3 scripts/check_antenna.py kicad/pitchiq_watch.kicad_pcb || fail=1
step "3 BOM: every fitted part has an MPN, a source and (if machine-placed) an LCSC number"
python3 scripts/gen_bom.py || fail=1
python3 - <<'PY' || fail=1
import csv, sys
bad = [r["Refs"] for r in csv.DictReader(open("docs/BOM.csv")) if r["Assembly"] != "DNP (not fitted)" and (not r["MPN"] or not r["Buy / source"])]
print("BOM lines missing MPN or source:", bad); sys.exit(1 if bad else 0)
PY
step "4 manufacturing files present"
for f in out/fab/gerber/pitchiq_watch-F_Cu.gtl out/fab/gerber/pitchiq_watch-In1_Cu.g2 out/fab/gerber/pitchiq_watch-In2_Cu.g3 out/fab/gerber/pitchiq_watch-In3_Cu.g4 out/fab/gerber/pitchiq_watch-In4_Cu.g5 out/fab/gerber/pitchiq_watch-B_Cu.gbl out/fab/gerber/pitchiq_watch-Edge_Cuts.gm1 out/fab/gerber/pitchiq_watch-PTH.drl out/fab/gerber/pitchiq_watch-NPTH.drl out/fab/bom_jlcpcb.csv out/fab/cpl_jlcpcb.csv out/pitchiq_watch_revC_schematic.pdf; do [ -s "$f" ] || { echo "MISSING $f"; fail=1; }; done
step "5 firmware: C core tests against the JavaScript app (host build)"
(cd ../../firmware/core && make test 2>&1 | tail -3) || fail=1
[ $fail = 0 ] && echo "CHECK: PASS (design files consistent and rule-clean; this says nothing about a built board)" || echo "CHECK: FAIL"
exit $fail
