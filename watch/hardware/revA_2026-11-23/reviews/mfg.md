# Manufacturing review (sonnet, read-only) — findings
1 MAJOR U1 LCSC C5118826 out of stock -> consign or hand-place; J1 FH12-10S-0.5SH(55) = LCSC C506791 (jlcpcb.com/partdetail/HRS_Hirose-FH12_10S_0_5SH_55/C506791); empty LCSC cells for 18p,13k,3.3M,47R.
2 MAJOR access after stacking: TP1-4 on back under the battery; J4 on front under LCD; no USB data. -> flash/test before stacking; move test pads; draw battery/motor outlines; check cell vs motor collision.
3 MAJOR antenna near LiPo/motor/LCD metal: keep cell >= ~8 mm below antenna end; model the stack.
4 MAJOR no panel rails/fiducials; parts 0.2-0.7 mm from edges -> panel with 5 mm rails + mouse bites, JLC standard assembly.
5 MAJOR no battery isolation during hand soldering -> add solder jumper/0R in VBAT; order: motor, FPC, battery last.
6 MINOR paste on J2/BT1/M1 hand pads -> remove paste.
7 MINOR mask web on 0.5 mm parts at limit. 8 MINOR CPL rotations need JLC preview check. 9 MINOR SW1 trimmed pads: inspect joints.
11 MINOR B silk text clipped. 13 MINOR no mounting/tooling holes; support ZIF on 0.8 mm board.
OK: all 4-layer files present; PTH 114x0.25 + 4x0.6; NPTH 0.65x2, 0.9x2, 0.991x3; rules within JLC limits; no courtyard overlaps; DNP/hand parts excluded from BOM/CPL.
