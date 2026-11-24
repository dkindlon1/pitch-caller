> SUPERSEDED IN PART (rev D/E). Section 2's inference that the stock FH12 footprint opens toward -y is wrong: two independent sections of KiCad's own 3D model (reviews/reaudit_after_corrections.md section 4) show the actuator and cable slot on the footprint's +y side. J1 at rotation 0 therefore faces the lower board edge, as the fold needs, and the nets stay pad n = terminal 11 - n. Rev E also moved J1 to the glass centre line and to where the 13.63 mm tail ends (Sharp fig. 8-1). The contact-face and pin-order reading of Sharp's drawing below still stands.

# P1: LS013B7DH03 FPC connector, contact side and pin order (evidence review)

Date 2026-11-23. Read-only review. Clones in /tmp/lcdrefs (nothing run).

## 1. Primary evidence: Sharp spec LCP-1112045 (SparkFun-hosted copy, cdn.sparkfun.com/assets/d/e/8/9/7/LS013B7DH03_datasheet.pdf, 10-page extract)
- Table 4: 1 SCLK, 2 SI, 3 SCS, 4 EXTCOMIN, 5 DISP, 6 VDDA, 7 VDD, 8 EXTMODE, 9 VSS, 10 VSSA (matches our J1 net list order).
- Fig 4-1 (rendered and read): FRONT view (left drawing), tail at 6 o'clock, centred; terminal "10" at LEFT, "1" at RIGHT. The hatched stiffener block is drawn on the front view, and the contact fingers are drawn on the BACK view (right drawing, pin 1 at left there = mirror). So the exposed contacts are on the tail face that points AWAY from the viewer (the back, polarizer-opposite side).
- p.23 (text): Fig 8-1 flat tail: "Recommended Connector SMK FP12 CFP-4610-0150F (Bottom side contact), Molex 51441-1093 (Bottom side contact)".
- p.24 (text): Fig 8-2 FPC bend: bend zone 0.8-6.0 mm from glass edge, min inner R0.45, "Do not bend backward (toward polarizer film side)", max 3 bends; "Recommended Connector SMK FP12 series CFP-4510-0150F (Top side contact)".
- So Sharp itself: flat = bottom contact; folded 180 deg under the panel = TOP contact. Tail length/width/stiffener dimensions are in the drawing image only (not in the 10-page extract). Other repos quote: tail centred ~13.3 mm from panel edge, width step ~5.6-6.1 mm, stiffener 4.5 mm (Eigentime decisions.md, JRWatch D-025: secondhand, not read from the Sharp drawing by me).

## 2. Hirose FH12 vs FH12A
- FH12-10S-0.5SH(55) = bottom contact, flip lock (JLC C506791 page and RS listing 1664899 say "ZIF Bottom Contact / Bottom Contact Flip-Top").
- FH12A-10S-0.5SH(55) = TOP contact (RS 1722481 "Contact Position: Top"; Future Electronics "Top Contact"; JLC C5139870 per JRWatch, 91 pcs in stock when logged).
- Same pitch, flip lock, max height 2 mm (Future page). I could NOT retrieve the Hirose drawing, so "same land pattern / depth / body height" is NOT verified; KiCad stock has only the FH12 footprint (Hirose_FH12-10S-0.5SH_1x10-1MP_P0.50mm_Horizontal). In that footprint (local coords): signal pads y=-1.85 (pin 1 at x=-2.25), MP stakes at x=+-4.15, y=+1.4, fab body y=-1.2..+4.4, courtyard y -3..+4.9. Pads sit just outside the front edge of the body, so the FPC opening (and flip actuator at the rear) is: opening toward -y at rotation 0. (Inference from geometry, ~85% sure; Hirose drawing not read.)

## 3. Reference boards (per-board)
| Board | Connector (quote) | Pin order | Geometry | Built/worked? |
|---|---|---|---|---|
| martinberlin/H-spi-adapters 1.54-sharp-lcd (LS013B7DH03 "128x128 1 bit LCD") | Hirose FH52-10S-0.5SH(99), footprint FH5210S05SH99_LCD, ki_description "CONN, FFC/FPC, RCPT, 10POS, 0.5MM, SMT" (contact side not stated in repo; FH52 contact side NOT verified) | pad1 LCD_CLK, 2 MOSI, 3 CS, 4 RTC_SQW(EXTCOMIN), 5 DISP, 6,7 3V3, 8 EXTMODE, 9,10 GND = Sharp order, NOT reversed | J1 at (111.79,46) rot 90 on F.Cu, pads on the board interior side, silk "<- LCD" outside the right edge: display lies FLAT beside the board, tail enters from the edge, no fold | Production files + "Rel 1.1", sold on Lectronz; no photo of the Sharp board seen |
| FlickerPlatform display_reva (PERSISTLab, Eagle) | Molex 52892-1095 (package FPC_10PIN_52892-1095; contact side not stated) | P$1 SCLK ... P$10 VSSA = Sharp order | not determined (Eagle .brd not parsed) | research platform, built; no mention of display photo checked |
| BitMasher-Hardware (superkittens) | Hirose FH12-10S-0.5SH, KiCad stock footprint, F.Cu at (150,78) rot 0 | REVERSED: pad1 GND(VSSA), 2 GND(VSS), 3-6 3V0 (EXTMODE, VDD, VDDA, DISP), 7 EXTCOMIN, 8 CS, 9 MOSI, 10 SCK | rot 0, i.e. opening toward -y; display position not extractable; 3D/BOM not present | repo says design "subject to change, no guarantees"; no photos found. The only board that reversed with FH12 (bottom contact) |
| Eigentime32 (captainchapster) | Panasonic AYF531035 "top and bottom contact", Sharp-recommended per its notes | pad n = LCD pin n, pad 1 = SCLK at +X (east), NOT reversed | front side J2, pad row at y=+7.55, opening toward 6 o'clock (the fold edge); tail leaves glass at 6 o'clock and folds 180 deg UNDER the glass into J2 (our geometry exactly); "FPC pin 1 (right, display side up) stays at +X" | design notes only; "TODO" style records, no evidence built; dual contact avoids the question |
| JRWatch (jadenrhee) | FH12A-10S-0.5SH(55) "top-contact right for this mounting" (D-025) | claims reversed (pad k = terminal 11-k) | pass at "fold between USB legs", unresolved layout; log says plain FH12 "cannot mate the folded-under tail" | NOT built (log: "Ordering is blocked"). Its reversal claim contradicts Sharp Fig 4-1 + a pure E-W fold unless the connector is left at rot 0 with opening facing the wrong way (see sec 4); treat as a derivation, not evidence |
| alx-alexpark/watch display.kicad_sch | LS013B7DH03 symbol, no connector found in the file | symbol pin 1 = VSSA (reversed symbol) | n/a | schematic text: "TODO: Validate FPC before ordering this!!" - unvalidated |
| NanoCodeBug/pawpet | custom through-hole footprint "Sharp_128x128_LS013B7DH03" (B.Cu, "Foldable FPC" fab text), no connector | n/a | tail soldered/foldable | working virtual pet shown in README |
| worxpad | different panel (24-pin ST7789), but its research note makes the same point: Adafruit says unfolded = bottom contact; after 180-degree fold contacts face the other way; chose dual-contact FH34SRJ | n/a | fold under module | not built |
| OTM-02 | no FPC connector found (EFM32 board, schematic only) | n/a | n/a | n/a |
Net: NO fully verified, built, FOLDED-under-glass board with a single-sided connector was found. The only folded designs (Eigentime32, JRWatch, worxpad-analog) are unbuilt, and the only ones that use a single-contact part (JRWatch) did so for the same reason as this review (top contact after fold). The two flat boards (Berlin, Flicker) use Sharp-order pins.

## 4. Our geometry (board y down; display face up above the top side; tail leaves the glass lower edge, folds 180 deg backward under the glass)
Steps in board plan view (looking down on top side):
1. Flat tail: exits glass at south edge, contacts on the face away from viewer = down (matches Sharp "bottom contact" for flat).
2. 180 deg fold about an east-west axis, away from polarizer: the tail now runs NORTH under the glass; its contact face flips to UP. East stays east, so terminal 1 (east at the glass, front view) stays EAST.
3. Therefore: contacts face up => TOP-contact connector. If instead the real tail has contacts facing the viewer (contrary to Fig 4-1) it would be bottom contact; Fig 4-1 and Sharp's own p.24 line (top for bent) both say TOP.
4. Opening direction: the tail arrives traveling north from the fold at the south edge, so the connector opening must face SOUTH (toward the board edge/fold). Our J1 is at (14.0, 31.0) rot 0, board H = 36.0, top side. At rot 0 the stock FH12 footprint has pads at local y=-1.85 and body to +4.4, opening toward -y = NORTH = inward, away from the lower edge. That is the OPPOSITE of what the fold needs (tail would have to come from the north). Rot 180 gives opening south, body toward the north, and pad 1 (local x=-2.25) at +x = EAST, which is exactly where terminal 1 lands after the fold. Reversal of pin order is therefore not a netlist change but a consequence of rotating the connector 180 deg; at rot 180 the nets 1..10 stay as in design.py (pad 1 = SCLK).
5. Compare with references: Eigentime32 (same fold) places pad 1 = SCLK at +X (east) with opening toward the fold edge: consistent with step 4. Berlin/Flicker (flat) use pad n = terminal n.

## 5. Conclusion
- Our J1 as built (FH12-10S-0.5SH(55), bottom contact, rot 0, pad 1 west) is inconsistent with a 180-degree under-glass fold on TWO counts: contact side (needs TOP: FH12A-10S-0.5SH(55), or a dual-contact part such as Panasonic AYF531035 / Hirose FH12 alternative) and orientation (opening faces inward; needs rot 180 so the opening faces the lower edge and pad 1 is east).
- Pin order: KEEP nets pad n = Sharp terminal n, but ROTATE J1 by 180 degrees (equivalently, with J1 left at rot 0 you would have to reverse the net order AND the opening would still face the wrong way). Do not do the net reversal alone.
- Safest part choice: a dual-contact 0.5 mm 10-pos connector (e.g. Panasonic AYF531035, the one Eigentime32 uses; Hirose FH34SRJ-10S-0.5SH(50) analog of worxpad's choice) removes the contact-side risk completely; otherwise FH12A (top). Check its footprint/MP stakes before swapping (FH12A land pattern not verified identical to FH12).
- Confidence: contact side TOP for the folded case 90% (Sharp text + Fig 4-1 + two independent notes); pin 1 east after fold 90%; J1 opening direction at rot 0 = north 85% (inferred from KiCad footprint geometry, not Hirose drawing); consistency with a built folded board: none exists in the set.

## 6. Unverifiable without the part / drawing
- Hirose FH12/FH12A drawing: opening side relative to pads, equal land pattern, depth, body height (<2.0 mm vs 2.7 mm LCD spacing OK either way).
- Actual contact-face orientation on the physical tail (Fig 4-1 drawing interpretation; confirm by looking at the part, paper mock-up).
- Whether the stiffener overlaps the connector depth (4.5 mm stiffener vs FH12 depth ~5.6 mm) and the bend position vs J1 y.
- FH52 and Molex 52892 contact sides (not stated in either repo).
- Tail length/width/offset values (drawing image page 23, not extracted here).
