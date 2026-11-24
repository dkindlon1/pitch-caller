# E4 fab re-verification (finding C1)
Item 1 CPL vs board (MEASURED, pcbnew 7.0.11): 46 rows compared, all sides match. Origin: CPL X = board absolute X, CPL Y = -(board absolute Y); aux origin is 0,0 (no offset applied; the 100/80 mm is inside absolute coordinates). Worst position diff 0.000 mm.
Rotations differing from raw board orientation (MEASURED; rules FROM FILE gen_bom.py): R17-R20 bottom side, raw 0 -> 180 (bottom convention 180-rot); Q1,Q2 SOT-23 top, raw 0 -> 270 (-90 community JLCPCB table); C8,C11,L2 raw 270 vs CPL -90 (same angle, format only). Whether these JLCPCB rules are right is NOT CHECKED (needs JLCPCB placement preview).
SMD on board not in CPL (MEASURED; flags FROM FILE design.py): U1 hand-fitted; J1 hand-fitted; R12, R21, R22, C24 DNP. None unexplained.
Item 2 (MEASURED): fresh export with export_fab.sh options, 20 files; all 20 identical to out/fab/gerber (0 differing lines; date/software header lines excluded).
Item 3 (MEASURED): no file under out/fab is older than/equal to the .kicad_pcb (pcb 2026-11-23 22:58, CPL 2026-11-24 12:32).
Item 4 (MEASURED): BOM designators == CPL designators (46), all on board. U2 board rot 90, CPL rot 90, Top.
Item 5: check_fab.py takes no path argument (FROM FILE; uses gen_pcb.PCB and its own dir). Ran it on a full copy of revE under /tmp/e4verify/mut/revE (revE untouched). Unmutated: pass, rc0. D4 X +0.5 mm: caught, rc1. Q1 rotation 270->0: caught (rc1).
Not checked: pos.csv vs CPL, drill map content, part LCSC correctness, check.sh actually run.
OVERALL: C1 CLOSED (stale-output defect fixed; JLCPCB rotation correctness still needs preview).
