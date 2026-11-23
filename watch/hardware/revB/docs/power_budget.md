# Power budget, rev B (estimate, not measured)

Assumptions: cell 3.8 V mean, buck efficiency 0.82, boost efficiency 0.85, usable capacity 80% of rated (ageing and cut-off).
Inputs marked [seen]/[est] are in `scripts/power_budget.py`.
Standing resistor loads are included: R9 (1 M on LCD_DISP, held high all the time) 3 uA; R8 (1 M on BOOST_EN) 3 uA only while the heart-rate boost is on (inside the heavy profile's margin, not itemised). Before the review these were 100 k and 30 uA each.

| Profile | Battery current | 100 mAh | 150 mAh | 250 mAh |
|---|---|---|---|---|
| Ship mode (storage) | 0.37 uA | months (cell self-discharge decides, not this current) | months (cell self-discharge decides, not this current) | months (cell self-discharge decides, not this current) |
| Standby: advertising 1 s, screen on | 0.06 mA | 58 days | 87 days | 145 days |
| Game, typical: connected 20 ms, 50 calls/h, HR off | 0.78 mA | 4 days | 6 days | 11 days |
| Game, relaxed link: connected 100 ms, 50 calls/h | 0.48 mA | 7 days | 10 days | 17 days |
| Game, heavy: 20 ms, 50 calls/h, HR on, frontlight on 30% of the time | 3.82 mA | 21 h | 31 h | 52 h |

One 3-hour game a day plus 21 hours of standby uses about 3.5 mAh a day (typical) or 12.7 mAh (heavy).
On a 150 mAh cell at 80% usable that is about 34 days between charges (typical) or 9 days (heavy).

Peak current [est]: motor start about 100-150 mA (2-3x rated for a coin motor) + radio 6.4 mA + heart-rate LED pulse 25-50 mA reflected through the boost (about 40-80 mA) = 150-240 mA worst case. The firmware now selects the nPM1300's high discharge limit (1 A nominal) and does not start a heart-rate measurement during a buzz; boost start-up alone draws about 0.35 A for a fraction of a millisecond [est].

Storage: ship mode draws 0.37 uA from the power chip, but the cell's own protection circuit and self-discharge are larger. Ship at 40-60% charge and top up every 6 months.

Charging [est]: 74 mA into 150 mAh is about 1.5 hours of constant current plus about 1 hour of taper, about 2.5 hours; about 4 hours between 0 and 10 C where the chip halves the current. Firmware raises the VBUS limit from the 100 mA default to 500 mA when the cradle is seen, and stops charging above 45 C (cell limit).

Largest savings available in firmware, in order: (1) generate the LCD's 60 Hz EXTCOMIN from the RTC through PPI/GPIOTE so the CPU never wakes for it (saves about 19 uA); (2) relax the connection interval between innings (298 uA); (3) run the heart-rate sensor in short windows, not continuously; (4) accelerometer to 10 Hz or motion-interrupt only; (5) frontlight only on a new call for a few seconds.
