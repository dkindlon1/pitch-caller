# Fabrication and assembly notes, rev D (to paste into the order; nothing has been ordered)

Board
- 6 layers, 0.8 mm finished thickness, FR-4 TG150 or better, 1 oz outer / 0.5 oz inner copper.
- Layer order: F.Cu, In1.Cu (ground plane), In2.Cu, In3.Cu, In4.Cu (3.0 V plane), B.Cu.
- No controlled impedance (the radio is inside the certified module).
- Finish: ENIG. Solder mask both sides, any colour. Silkscreen both sides.
- Vias 0.5 mm pad / 0.2 mm drill, tented both sides. The four vias inside U2's exposed pad must be epoxy-filled and capped (via-in-pad); otherwise solder paste wicks down them. Select the fabricator's filled-and-capped via option for the whole board.
- Outline routing tolerance +/-0.1 mm (precision routing): the USB-C pads start 0.20 mm from the notch edge.
- Board outline includes a 10.3 x 6.3 mm notch in the left edge with 0.5 mm relief circles at its two inside corners: route as drawn.
- The four USB-C shell stakes (J3 pads S1-S4) are plated slots.
- Four 1.6 mm unplated holes.
- Size 30.6 x 36.0 mm. Double-sided assembly needs a panel with rails and fiducials: use the fabricator's panelisation, 2 x 2 or larger, V-cut or mouse-bites on the two long edges only (the left edge has the notch, the top edge is the antenna end).

Assembly
- Machine-placed parts: files `out/fab/bom_jlcpcb.csv` and `out/fab/cpl_jlcpcb.csv` (counts in `out/check_output.txt`).
- JLCPCB's double-sided assembly needs at least 70 x 70 mm with rails and fiducials (read on their site 2026-11-23). This is a single 30.6 x 36 mm board: choose their panelisation option in the quote and confirm it there, or build a panel. Not done here.
- Before paying, get the fabricator's answer on: 6 layers at 0.8 mm, the notch's inside-corner relief circles (0.5 mm radius), filled vias, the panel, and whether they accept customer-supplied parts.
- Bottom-side rotations in the placement file use (180 - KiCad rotation). No per-part corrections are applied: check every polarised part in the placement preview before paying (U1, U2, U4, Q1, Q2, D1-D6, J3).
- Not in the assembler's files, fitted by us afterwards: U1 (Raytac module: hot air or hot plate), J3 (USB-C: solder the six contacts and the four shell stakes), J1 (Hirose FH12A-10S-0.5SH(55), top contact), battery leads, motor leads, battery jumper JP1 (bridge last).
- SOT-23 parts (Q1, Q2) carry a -90 degree correction in the placement file, from the community rotation table. Top-side rotations for U2, U4, D1, D2 and the bottom-side parts are NOT verified.
- Not fitted: C24, R12 (see the parts list for the alternatives they cover).
