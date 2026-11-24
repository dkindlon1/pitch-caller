"""Power budget for the PitchIQ watch rev C. Every input is labelled: [seen] = read on a datasheet/page (research/*.md),
[est] = my estimate. The output is an ESTIMATE, not a measurement: nothing has been built."""
import os
VBAT, ETA_BUCK, ETA_BOOST = 3.8, 0.82, 0.85          # [est] mean cell voltage and converter efficiencies; 0.82 at tens of uA (datasheet only gives 93% at 200 mA), power review
def from_3v0(ua): return ua * 3.0 / VBAT / ETA_BUCK   # current drawn from the cell for a load on the 3.0 V buck
def from_1v8(ua): return ua * 1.8 / VBAT / ETA_BUCK
def from_5v(ua): return ua * 5.0 / VBAT / ETA_BOOST
# ---- inputs (uA unless noted)
MCU_SLEEP = 3.16        # [seen] nRF52840 System ON, RTC, full RAM retention
MCU_RUN_MA = 3.3        # [seen] 52 uA/MHz x 64 MHz
RADIO_RX_MA, RADIO_TX_MA = 6.26, 14.8   # RX [seen] 3 V DC/DC; TX at +8 dBm, which the firmware now uses [est from memory of the nRF52840 table: 14.8 mA; 6.4 mA at 0 dBm was seen]
LCD_STATIC = 12 / 3.0   # [seen] 12 uW typ at 3.0 V
LCD_UPDATE_UW = 50      # [seen] at 1 Hz update
ACCEL_25HZ, ACCEL_OFF = 4.0, 0.5   # [seen] LIS2DH12 low-power 25 Hz, power-down
HR_IDD = 600.0          # [seen] MAX30101 typ at 50 sps
HR_LED_MA, HR_PW_S, HR_SPS = 9.6, 411e-6, 200    # what the firmware sets (pitchiq_watch.dts): 9.6 mA green, 411 us, 100 samples/s x averaging 2 [200 pulses/s is the reviewer's reading, not confirmed in the datasheet]
HR_SHDN = 0.7           # [seen]
BOOST_IQ = 20.0         # [seen] TPS61023 quiescent into VOUT when on; 0.1 uA when off
PMIC_IQ = 1.1           # [seen] nPM1300 with two bucks in auto mode (0.8 uA with one)
CELL_SELF = 6.0         # [est] cell protection circuit + self-discharge
PULLDOWN = 3.0          # 1 M on LCD_DISP held at 3.0 V (was 30 uA with 100 k before the review fix)
SHIP = 0.37             # [seen] nPM1300 ship mode
MOTOR_MA = 35.0         # [seen] Vybronics VCLP0820B004L maximum at 3 V (30 mA typical)
FL_MA = 5.0             # [seen] Azumo frontlight LED typ
def conn_ua(interval_ms):   # [est] one empty connection event as a peripheral: 0.5 ms RX window, 0.1 ms TX, 1.2 ms CPU/ramp
    q = RADIO_RX_MA * 0.5 + RADIO_TX_MA * 0.1 + MCU_RUN_MA * 1.2   # uC per event
    return q / interval_ms * 1000
ADV_1S = (RADIO_TX_MA * 0.4 * 3 + MCU_RUN_MA * 1.5)                # [est] uC per 3-channel advertising event = uA at 1 s interval
EXTCOMIN = 20.0         # [est] waking 120 times/s to toggle the LCD's 60 Hz EXTCOMIN line (removable: see optimisations)
MISC = 5.0 + PULLDOWN   # [est] kernel tick, pull-ups, leakage
def profile(name, conn_ms=None, adv=False, calls_per_h=0, hr=False, frontlight_duty=0.0, accel=True):
    i3 = MCU_SLEEP + LCD_STATIC + EXTCOMIN + MISC + (ACCEL_25HZ if accel else ACCEL_OFF)
    if conn_ms: i3 += conn_ua(conn_ms)
    if adv: i3 += ADV_1S
    i3 += calls_per_h / 3600 * (LCD_UPDATE_UW / 3.0 + MCU_RUN_MA * 1000 * 0.05)   # one redraw + ~50 ms of CPU per call
    i3 += frontlight_duty * FL_MA * 1000
    bat = from_3v0(i3) + PMIC_IQ + CELL_SELF
    motor = calls_per_h / 3600 * 0.45 * MOTOR_MA * 1.15 * 1000   # 450 ms buzz per call from VSYS, duty capped by firmware to about 3 V effective; +15% for start current [est]
    bat += motor
    return name, bat
P = [profile("Ship mode (storage)"), profile("Standby, no phone: advertising at 1.0-1.2 s (firmware drops to this 30 s after each start), screen on", adv=True),
     profile("Game, typical: connected 20 ms, 50 calls/h", conn_ms=20, calls_per_h=50),
     profile("Connected but idle (phone left connected, 20 ms interval, no calls)", conn_ms=20),
     profile("Game at night with the optional frontlight on 30% of the time", conn_ms=20, calls_per_h=50, frontlight_duty=0.3)]
P[0] = ("Ship mode (storage)", SHIP)
out = ["# Power budget, rev C (estimate, not measured)", "",
       f"Assumptions: cell {VBAT} V mean, buck efficiency {ETA_BUCK}, boost efficiency {ETA_BOOST}, usable capacity 80% of rated (ageing and cut-off).",
       "Inputs marked [seen]/[est] are in `scripts/power_budget.py`.",
       "Standing resistor load included: R9 (1 M on LCD_DISP, held high all the time) 3 uA. Rev C has no heart-rate sensor and no boost converter.", "", "| Profile | Battery current | 100 mAh | 150 mAh | 250 mAh |", "|---|---|---|---|---|"]
def life(ua, mah):
    h = mah * 0.8 / (ua / 1000)
    return "months (cell self-discharge decides, not this current)" if h > 24 * 365 else (f"{h/24:.0f} days" if h > 72 else f"{h:.0f} h")
for name, ua in P:
    out.append(f"| {name} | {ua/1000:.2f} mA | {life(ua,100)} | {life(ua,150)} | {life(ua,250)} |" if ua >= 10 else f"| {name} | {ua:.2f} uA | {life(ua,100)} | {life(ua,150)} | {life(ua,250)} |")
game, standby, heavy = P[2][1], P[1][1], P[4][1]
day = (game * 3 + standby * 21) / 1000
dayh = (heavy * 3 + standby * 21) / 1000
out += ["", f"One 3-hour game a day plus 21 hours of standby uses about {day:.1f} mAh a day (typical) or {dayh:.1f} mAh (night games with the optional frontlight).",
        f"On a 150 mAh cell at 80% usable that is about {150*0.8/day:.0f} days between charges (typical) or {150*0.8/dayh:.0f} days (night games with the frontlight).",
        f"If the phone stays connected all day at the firmware's fixed 20 ms interval, use is about {P[3][1] * 24 / 1000:.1f} mAh a day: about {150*0.8/(P[3][1] * 24 / 1000):.0f} days. A slower interval while idle would need a firmware change (not made).",
        "", "Peak current [est]: motor start about 70-105 mA (2-3x its 35 mA rating; start current is not on the data sheet) + radio 15 mA at +8 dBm = about 90-120 mA worst case. The firmware selects the nPM1300's high discharge limit (1 A nominal).",
        "", "Storage: ship mode draws 0.37 uA from the power chip, but the cell's own protection circuit and self-discharge are larger. Ship at 40-60% charge and top up every 6 months.",
        "", "Charging [est]: 74 mA into 150 mAh is about 1.5 hours of constant current plus about 1 hour of taper, about 2.5 hours; about 4 hours between 0 and 10 C where the chip halves the current. Firmware raises the VBUS limit from the 100 mA default to 500 mA when a 1.5 A or 3 A USB-C source is detected, and stops charging above 45 C (cell limit).",
        "", "Largest savings available in firmware, in order: (1) generate the LCD's 60 Hz EXTCOMIN from the RTC through PPI/GPIOTE so the CPU never wakes for it "
        f"(saves about {from_3v0(EXTCOMIN):.0f} uA); (2) relax the connection interval between innings ({from_3v0(conn_ua(20)-conn_ua(100)):.0f} uA); "
        "(3) accelerometer to 10 Hz or motion-interrupt only; (4) frontlight, if fitted, only on a new call for a few seconds."]
open(os.path.join(os.path.dirname(__file__), "..", "docs", "power_budget.md"), "w").write("\n".join(out) + "\n")
print("\n".join(out[5:13]))
