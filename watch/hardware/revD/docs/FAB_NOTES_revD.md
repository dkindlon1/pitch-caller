# Fabrication and assembly notes, rev D (to paste into the order; nothing has been ordered)

Board
- 6 layers, 0.8 mm finished thickness, FR-4 TG150 or better, 1 oz outer / 0.5 oz inner copper.
- Layer order: F.Cu, In1.Cu (ground plane), In2.Cu, In3.Cu, In4.Cu (3.0 V plane), B.Cu.
- No controlled impedance (the radio is inside the certified module).
- Finish: ENIG. Solder mask both sides, any colour. Silkscreen both sides.
- Vias 0.5 mm pad / 0.2 mm drill, tented both sides. The four vias inside U2's exposed pad: plug or tent from the bottom.
- Board outline includes a 10.3 x 6.3 mm notch in the left edge with 0.5 mm relief circles at its two inside corners: route as drawn.
- The four USB-C shell stakes (J3 pads S1-S4) are plated slots.
- Four 1.6 mm unplated holes.
- Size 30.6 x 36.0 mm. Double-sided assembly needs a panel with rails and fiducials: use the fabricator's panelisation, 2 x 2 or larger, V-cut or mouse-bites on the two long edges only (the left edge has the notch, the top edge is the antenna end).

Assembly
- Machine-placed: 48 parts (39 top, 9 bottom), files `out/fab/bom_jlcpcb.csv` and `out/fab/cpl_jlcpcb.csv`.
- Bottom-side rotations in the placement file use (180 - KiCad rotation). No per-part corrections are applied: check every polarised part in the placement preview before paying (U1, U2, U4, Q1, Q2, D1-D6, J3).
- Supplied by us or fitted by hand: U1 (Raytac module), J3 (USB-C, then hand-solder its four shell stakes), J1 (Hirose FH12A-10S-0.5SH(55), top contact), battery leads, motor leads, battery jumper JP1 (bridge last).
- Not fitted: C24, R12 (see the parts list for the alternatives they cover).
