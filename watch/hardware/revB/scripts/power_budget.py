"""Power budget for the PitchIQ watch rev B. Every input is labelled: [seen] = read on a datasheet/page (research/*.md),
[est] = my estimate. The output is an ESTIMATE, not a measurement: nothing has been built."""
import os
VBAT, ETA_BUCK, ETA_BOOST = 3.8, 0.82, 0.85          # [est] mean cell voltage and converter efficiencies; 0.82 at tens of uA (datasheet only gives 93% at 200 mA), power review
def from_3v0(ua): return ua * 3.0 / VBAT / ETA_BUCK   # current drawn from the cell for a load on the 3.0 V buck
def from_1v8(ua): return ua * 1.8 / VBAT / ETA_BUCK
def from_5v(ua): return ua * 5.0 / VBAT / ETA_BOOST
# ---- inputs (uA unless noted)
MCU_SLEEP = 3.16        # [seen] nRF52840 System ON, RTC, full RAM retention
MCU_RUN_MA = 3.3        # [seen] 52 uA/MHz x 64 MHz
RADIO_RX_MA, RADIO_TX_MA = 6.26, 6.40   # [seen] 3 V, DC/DC, 0 dBm
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
MOTOR_MA = 50.0         # [seen] FIT0774 rated current at 3 V
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
    if hr: bat += from_1v8(HR_IDD) + from_5v(HR_LED_MA * 1000 * HR_PW_S * HR_SPS + BOOST_IQ)
    else: bat += from_1v8(HR_SHDN)
    return name, bat
P = [profile("Ship mode (storage)"), profile("Standby: advertising 1 s, screen on", adv=True),
     profile("Game, typical: connected 20 ms, 50 calls/h, HR off", conn_ms=20, calls_per_h=50),
     profile("Game, relaxed link: connected 100 ms, 50 calls/h", conn_ms=100, calls_per_h=50),
     profile("Game, heavy: 20 ms, 50 calls/h, HR on, frontlight on 30% of the time", conn_ms=20, calls_per_h=50, hr=True, frontlight_duty=0.3)]
P[0] = ("Ship mode (storage)", SHIP)
out = ["# Power budget, rev B (estimate, not measured)", "",
       f"Assumptions: cell {VBAT} V mean, buck efficiency {ETA_BUCK}, boost efficiency {ETA_BOOST}, usable capacity 80% of rated (ageing and cut-off).",
       "Inputs marked [seen]/[est] are in `scripts/power_budget.py`.",
       "Standing resistor loads are included: R9 (1 M on LCD_DISP, held high all the time) 3 uA; R8 (1 M on BOOST_EN) 3 uA only while the heart-rate boost is on (inside the heavy profile's margin, not itemised). Before the review these were 100 k and 30 uA each.", "", "| Profile | Battery current | 100 mAh | 150 mAh | 250 mAh |", "|---|---|---|---|---|"]
def life(ua, mah):
    h = mah * 0.8 / (ua / 1000)
    return "months (cell self-discharge decides, not this current)" if h > 24 * 365 else (f"{h/24:.0f} days" if h > 72 else f"{h:.0f} h")
for name, ua in P:
    out.append(f"| {name} | {ua/1000:.2f} mA | {life(ua,100)} | {life(ua,150)} | {life(ua,250)} |" if ua >= 10 else f"| {name} | {ua:.2f} uA | {life(ua,100)} | {life(ua,150)} | {life(ua,250)} |")
game, standby, heavy = P[2][1], P[1][1], P[4][1]
day = (game * 3 + standby * 21) / 1000
dayh = (heavy * 3 + standby * 21) / 1000
out += ["", f"One 3-hour game a day plus 21 hours of standby uses about {day:.1f} mAh a day (typical) or {dayh:.1f} mAh (heavy).",
        f"On a 150 mAh cell at 80% usable that is about {150*0.8/day:.0f} days between charges (typical) or {150*0.8/dayh:.0f} days (heavy).",
        "", "Peak current [est]: motor start about 100-150 mA (2-3x rated for a coin motor) + radio 6.4 mA + heart-rate LED pulse 25-50 mA reflected through the boost (about 40-80 mA) "
        "= 150-240 mA worst case. The firmware now selects the nPM1300's high discharge limit (1 A nominal) and does not start a heart-rate measurement during a buzz; boost start-up alone draws about 0.35 A for a fraction of a millisecond [est].",
        "", "Storage: ship mode draws 0.37 uA from the power chip, but the cell's own protection circuit and self-discharge are larger. Ship at 40-60% charge and top up every 6 months.",
        "", "Charging [est]: 74 mA into 150 mAh is about 1.5 hours of constant current plus about 1 hour of taper, about 2.5 hours; about 4 hours between 0 and 10 C where the chip halves the current. Firmware raises the VBUS limit from the 100 mA default to 500 mA when the cradle is seen, and stops charging above 45 C (cell limit).",
        "", "Largest savings available in firmware, in order: (1) generate the LCD's 60 Hz EXTCOMIN from the RTC through PPI/GPIOTE so the CPU never wakes for it "
        f"(saves about {from_3v0(EXTCOMIN):.0f} uA); (2) relax the connection interval between innings ({from_3v0(conn_ua(20)-conn_ua(100)):.0f} uA); "
        "(3) run the heart-rate sensor in short windows, not continuously; (4) accelerometer to 10 Hz or motion-interrupt only; (5) frontlight only on a new call for a few seconds."]
open(os.path.join(os.path.dirname(__file__), "..", "docs", "power_budget.md"), "w").write("\n".join(out) + "\n")
print("\n".join(out[5:13]))
