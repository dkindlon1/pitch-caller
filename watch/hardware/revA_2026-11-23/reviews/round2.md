# Second-round review (sonnet, read-only) after fixes
FIXED (measured): C1/C2 now 2.5/2.3 mm from U1 pads 30/28; antenna strip 0 mm2 copper on all 4 layers; JP1 is the only path BT1+ -> VBAT; polarity silk on the correct pads; no paste on BT1/M1/J2/JP1; mask expansion 0.05.
PARTLY: crystal (XL1 5.4 mm / 2 vias, XL2 8.3 mm / 3 vias); test access (J4 on front under display: flash before display).
NOT FIXED / accepted: no reverse-battery or fuse; no panel rails/fiducials; no UVLO; battery scale via firmware setting; U1 out of stock at LCSC; firmware hex.
NEW 1 MAJOR: M1 motor pads ~1.5 mm below keep-out, ~2.9 mm from the antenna corner -> move M1 to y >= 10 mm. (Boss: fixed in round 5, M1 moved to (29.3,16.3), R10 removed.)
NEW 2 MINOR: USB with JP1 open is safe (charger holds VBAT 4.2 V, cell not charged). 3 OK: 3V0 capacitance 12.4 uF within TPS7A02 1-22 uF; MCP73832 with 20 uF on VBAT not verified vs datasheet (bring-up item). 5 MINOR: 0.1 mm mask web on J1/J2; C14 0.75 mm from edge.
check.sh: PASS (0 net diffs, 0 pad diffs, DRC 0 errors / 0 unconnected, antenna 0).
