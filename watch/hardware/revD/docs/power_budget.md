# Power budget, rev C (estimate, not measured)

Assumptions: cell 3.8 V mean, buck efficiency 0.82, boost efficiency 0.85, usable capacity 80% of rated (ageing and cut-off).
Inputs marked [seen]/[est] are in `scripts/power_budget.py`.
Standing resistor load included: R9 (1 M on LCD_DISP, held high all the time) 3 uA. Rev C has no heart-rate sensor and no boost converter.

| Profile | Battery current | 100 mAh | 150 mAh | 250 mAh |
|---|---|---|---|---|
| Ship mode (storage) | 0.37 uA | months (cell self-discharge decides, not this current) | months (cell self-discharge decides, not this current) | months (cell self-discharge decides, not this current) |
| Standby, no phone: advertising at 1.0-1.2 s (firmware drops to this 30 s after each start), screen on | 0.07 mA | 50 days | 75 days | 125 days |
| Game, typical: connected 20 ms, 50 calls/h | 0.71 mA | 5 days | 7 days | 12 days |
| Connected but idle (phone left connected, 20 ms interval, no calls) | 0.46 mA | 7 days | 11 days | 18 days |
| Game at night with the optional frontlight on 30% of the time | 2.16 mA | 37 h | 56 h | 4 days |

One 3-hour game a day plus 21 hours of standby uses about 3.5 mAh a day (typical) or 7.9 mAh (night games with the optional frontlight).
On a 150 mAh cell at 80% usable that is about 34 days between charges (typical) or 15 days (night games with the frontlight).
If the phone stays connected all day at the firmware's fixed 20 ms interval, use is about 11.0 mAh a day: about 11 days. A slower interval while idle would need a firmware change (not made).

Peak current [est]: motor start about 70-105 mA (2-3x its 35 mA rating; start current is not on the data sheet) + radio 15 mA at +8 dBm = about 90-120 mA worst case. The firmware selects the nPM1300's high discharge limit (1 A nominal).

Storage: ship mode draws 0.37 uA from the power chip, but the cell's own protection circuit and self-discharge are larger. Ship at 40-60% charge and top up every 6 months.

Charging [est]: 74 mA into 150 mAh is about 1.5 hours of constant current plus about 1 hour of taper, about 2.5 hours; about 4 hours between 0 and 10 C where the chip halves the current. Firmware raises the VBUS limit from the 100 mA default to 500 mA when a 1.5 A or 3 A USB-C source is detected, and stops charging above 45 C (cell limit).

Largest savings available in firmware, in order: (1) generate the LCD's 60 Hz EXTCOMIN from the RTC through PPI/GPIOTE so the CPU never wakes for it (saves about 19 uA); (2) relax the connection interval between innings (330 uA); (3) accelerometer to 10 Hz or motion-interrupt only; (4) frontlight, if fitted, only on a new call for a few seconds.
