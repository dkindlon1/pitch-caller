/*
 * power.c - battery, charger, button and shutdown.
 *
 * Watch: the nPM1300 (Zephyr drivers: mfd + regulator; charger: see below).  Charging is configured and enabled at every boot
 * from the devicetree charger node's values (the chip itself comes up with charging off, 32 mA, 100 mA VBUS limit).
 *
 * CHARGER: the stock Zephyr nPM13xx charger driver calls logf(), so it needs a full C library; the toolchain this firmware was
 * built with here (Ubuntu gcc-arm-none-eabi 13.2) has no picolibc and a newlib without retargetable locking, which Zephyr
 * cannot use.  So by default (CONFIG_PQ_NPM1300_STOCK_CHARGER=n, CONFIG_NPM13XX_CHARGER=n in boards/pitchiq_watch.conf) this
 * file does the same register writes itself through the mfd driver ("lite" charger: values from the same devicetree node,
 * battery voltage, charge status and VBUS from the same registers; NO battery temperature, which needs logf).  With the Zephyr
 * SDK (picolibc) turn the option on and the stock driver is used instead.  The stock path has NOT been compiled here.  The
 * user button is wired to the chip's SHPHLD pin, so a press arrives as NPM13XX_EVENT_SHIPHOLD_PRESS / _RELEASE on the
 * interrupt line.  A flat battery recovers because VBUS powers VSYS through the chip's power path: the MCU boots from
 * cable power and this code then starts the charge.
 * DK: the fixed-level stub (PQ_BATTERY_STUB) and DK button 1 (alias sw0).
 */
#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include "pq_app.h"

LOG_MODULE_REGISTER(power, LOG_LEVEL_INF);

#if IS_ENABLED(CONFIG_PQ_HAVE_PMIC)
/* Battery voltage (mV, open circuit) to percent, a typical single-cell Li-ion/LiPo discharge curve.  ASSUMPTION: the
 * fitted 150 mAh cell follows this curve; it ignores load sag and temperature, and while charging the terminal voltage
 * reads high.  Replace with a measured table (or a fuel-gauge model) once the cell is characterised.  Sorted by
 * voltage, descending. */
static const struct {
  uint16_t mv;
  uint8_t pct;
} OCV[] = {{4200, 100}, {4150, 95}, {4110, 90}, {4080, 85}, {4020, 80}, {3980, 75}, {3950, 70}, {3910, 65}, {3870, 60},
           {3850, 55},  {3840, 50}, {3820, 45}, {3800, 40}, {3790, 35}, {3770, 30}, {3750, 25}, {3730, 20}, {3710, 15},
           {3690, 10},  {3610, 5},  {3270, 0}};

static uint8_t mv_to_pct(uint16_t mv) {
  if (mv >= OCV[0].mv) {
    return 100;
  }
  for (size_t i = 1; i < ARRAY_SIZE(OCV); i++) {
    if (mv >= OCV[i].mv) {
      uint32_t span = OCV[i - 1].mv - OCV[i].mv, off = mv - OCV[i].mv;
      uint32_t dp = OCV[i - 1].pct - OCV[i].pct;
      return (uint8_t)(OCV[i].pct + (off * dp + span / 2) / span);
    }
  }
  return 0;
}

#include <zephyr/drivers/mfd/npm13xx.h>
#include <zephyr/drivers/regulator.h>
#include <zephyr/drivers/sensor.h>
#if IS_ENABLED(CONFIG_PQ_NPM1300_STOCK_CHARGER)
#include <zephyr/drivers/sensor/npm13xx_charger.h>
#endif

static const struct device *const pmic = DEVICE_DT_GET(DT_NODELABEL(npm1300_pmic));

/* Every PMIC register access retries 3 times with an I2C bus recovery between tries (QA review 4/10). */
static int __maybe_unused pm_wr(uint8_t base, uint8_t off, uint8_t v) { return PQ_I2C_RETRY(mfd_npm13xx_reg_write(pmic, base, off, v)); }
static int __maybe_unused pm_wr_burst(uint8_t base, uint8_t off, const uint8_t *d, size_t n) { return PQ_I2C_RETRY(mfd_npm13xx_reg_write_burst(pmic, base, off, (void *)d, n)); }
static int __maybe_unused pm_rd(uint8_t base, uint8_t off, uint8_t *v) { return PQ_I2C_RETRY(mfd_npm13xx_reg_read(pmic, base, off, v)); }
static int __maybe_unused pm_rd_burst(uint8_t base, uint8_t off, uint8_t *d, size_t n) { return PQ_I2C_RETRY(mfd_npm13xx_reg_read_burst(pmic, base, off, d, n)); }

static const struct device *const regulators = DEVICE_DT_GET(DT_NODELABEL(npm1300_regulators));
static struct gpio_callback pmic_cb;
static volatile uint16_t last_mv;
static volatile bool last_vbus;
static bool vbus_limit_set;

/* nPM1300 charger status register bits.
 * ASSUMPTION (nPM1300 datasheet, BCHGCHARGESTATUS): bit0 battery detected, bit1 charge complete, bit2 trickle, bit3
 * constant current, bit4 constant voltage, bit5 recharge needed, bit6 die temp high, bit7 supplement mode.  Confirm. */
#define CHG_TRICKLE BIT(2)
#define CHG_CC BIT(3)
#define CHG_CV BIT(4)
#define VBUS_PRESENT BIT(0)

#if IS_ENABLED(CONFIG_PQ_NPM1300_STOCK_CHARGER)
static const struct device *const charger = DEVICE_DT_GET(DT_NODELABEL(npm1300_charger));
#else
/* ---- "lite" charger: the stock driver's register sequence, values taken from the devicetree charger node ---- */
#define CHG DT_NODELABEL(npm1300_charger)
#define CHGR_BASE 0x03U
#define ADC_BASE 0x05U
#define VBUS_BASE 0x02U
#define CHGR_EN_SET 0x04U
#define CHGR_DIS_SET 0x06U
#define CHGR_ISET 0x08U
#define CHGR_ISET_DISCHG 0x0AU
#define CHGR_VTERM 0x0CU
#define CHGR_VTERM_R 0x0DU
#define CHGR_TRICKLE_SEL 0x0EU
#define CHGR_ITERM_SEL 0x0FU
#define CHGR_CHG_STAT 0x34U
#define CHGR_VBATLOW_EN 0x50U /* BCHGVBATLOWCHARGE: allow charging when VBAT is below VBATLOW (2.1 V). Reset value 0 = a flat cell never charges. */
#define ADC_TASK_VBAT 0x00U
#define ADC_NTCR_SEL 0x0AU
#define ADC_TASK_AUTO 0x0CU
#define ADC_RESULTS 0x10U
#define ADC_IBAT_EN 0x24U
#define VBUS_ILIMUPDATE 0x00U
#define VBUS_ILIM 0x01U
#define VBUS_ILIMSTARTUP 0x02U
/* USB-C detect status (VBUSIN block 0x02, offset 0x05; stock driver npm13xx_charger.c VBUS_OFFSET_DETECT).  Two 2-bit fields,
 * CC1 in bits 1:0 and CC2 in bits 3:2.  The stock driver tests mask 0x0A and calls the result "CC1 or CC2 indicate 1.5A or 3A
 * capability" (DETECT_HI_MASK, DETECT_HI_CURRENT 1.5 A) and treats any other nonzero value as the 500 mA default-USB case; this
 * code uses the same mask.  The field values themselves (2 = 1.5 A, 3 = 3 A) are not spelled out in the Zephyr tree or in
 * hardware/revB/research/datasheets.md: they follow from that mask and from the nPM1300 product specification (USBCDETECTSTATUS). */
#define VBUS_DETECT 0x05U
#define VBUS_DETECT_HI_MASK 0x0AU
/* Input limit once the source has advertised 1.5 A or 3 A.  The cell charges at about 75 mA, so 500 mA is ample. */
#define VBUS_ILIM_HI_UA 500000U
BUILD_ASSERT(DT_PROP(CHG, vbus_limit_microamp) == 100000, "rev C: the start-up VBUS limit must stay 100 mA (default USB), see power.c");
/* Charger temperature registers (offsets in the CHGR block, as the stock driver's CHGR_OFFSET_NTC_TEMPS 0x10 / _DIE_TEMPS 0x18:
 * NTCCOLD 0x10, NTCCOOL 0x12, NTCWARM 0x14, NTCHOT 0x16, DIETEMPSTOP 0x18, DIETEMPRESUME 0x1A; each is msb = code >> 2 then
 * lsb = code & 3).  Checked against npm13xx_charger.c set_ntc_thresholds()/set_dietemp_thresholds() in the Zephyr tree. */
#define CHGR_NTCHOT 0x16U
#define CHGR_DIETEMPSTOP 0x18U
#define CHGR_DIETEMPRESUME 0x1AU
/* The cell allows charging only 0-45 C (power review 1).  The NTC code is 1024 * R / (R + R25) with R from the beta equation:
 * 10 k, beta 3380, 45 C: R = 10000 * exp(3380 * (1/318.15 - 1/298.15)) = 4904 ohm, code 1024 * 4904 / 14904 = 337 (the
 * reviewer's value, same as the stock driver's formula).  Setting NTCHOT to the warm code (also 45 C, the default NTCWARM)
 * makes the warm region empty: charging stops above 45 C.  The 0 C cold limit is already the chip default. */
#define NTC_45C_CODE 337U
BUILD_ASSERT(DT_PROP(CHG, thermistor_ohms) == 10000 && DT_PROP(CHG, thermistor_beta) == 3380,
             "NTC_45C_CODE is for the 10 k, beta 3380 thermistor: recompute it");
/* Die temperature: code = (394.67 C - T) * 5000 / 3963 (stock driver constants).  Stop charging at 70 C (chip default 110 C,
 * too hot against skin) and resume at 60 C: codes 410 and 422.  [estimate, tune on the bench] */
#define DIE_STOP_CODE 410U
#define DIE_RESUME_CODE 422U
#define VBUS_STATUS 0x07U

/* Encodings, as the stock driver uses them (nPM1300 product specification). */
#define TERM_IDX(uv) ((uv) < 3700000 ? ((uv) - 3500000) / 50000 : 4 + ((uv) - 4000000) / 50000) /* 3.5-3.65 V: 0..3, 4.0-4.45 V: 4..13 */
#define ISET_IDX(ua) (16 + ((ua) - 32000) / 2000)       /* 32 mA..800 mA in 2 mA steps; written as idx/2 and idx&1 */
#define VBUS_IDX(ua) ((ua) / 100000)                    /* 100 mA steps */
/* Discharge limit: the nPM1300 has two settings, 200 mA (index 84) and 1 A (index 415), as in the stock driver. */
BUILD_ASSERT(DT_PROP(CHG, dischg_limit_microamp) == 200000 || DT_PROP(CHG, dischg_limit_microamp) == 1000000,
             "charger dischg-limit-microamp must be 200000 or 1000000");
#define DISCHG_LIMIT (DT_PROP(CHG, dischg_limit_microamp) == 1000000 ? 415 : 84)
BUILD_ASSERT(DT_PROP(CHG, term_microvolt) >= 3500000 && DT_PROP(CHG, term_microvolt) <= 4450000, "charger term-microvolt out of range");
BUILD_ASSERT(DT_PROP(CHG, current_microamp) >= 32000 && DT_PROP(CHG, current_microamp) <= 800000, "charger current-microamp out of range");
BUILD_ASSERT(DT_PROP(CHG, vbus_limit_microamp) >= 100000 && DT_PROP(CHG, vbus_limit_microamp) <= 1500000, "vbus limit out of range");

static int charger_lite_init(void) {
  const uint32_t term = DT_PROP(CHG, term_microvolt);
  const uint32_t warm = DT_PROP_OR(CHG, term_warm_microvolt, DT_PROP(CHG, term_microvolt));
  const uint32_t iset = ISET_IDX(DT_PROP(CHG, current_microamp));
  int rc = 0;
  /* NTC type (index into 0, 10 k, 47 k, 100 k) */
  rc |= pm_wr(ADC_BASE, ADC_NTCR_SEL, DT_ENUM_IDX(CHG, thermistor_ohms));
  rc |= pm_wr(CHGR_BASE, CHGR_VTERM, TERM_IDX(term));
  rc |= pm_wr(CHGR_BASE, CHGR_VTERM_R, TERM_IDX(warm));
  rc |= pm_wr_burst(CHGR_BASE, CHGR_ISET, (uint8_t[]){iset / 2U, iset & 1U}, 2U);
  rc |= pm_wr_burst(CHGR_BASE, CHGR_ISET_DISCHG, (uint8_t[]){DISCHG_LIMIT / 2U, DISCHG_LIMIT & 1U}, 2U);
  rc |= pm_wr(VBUS_BASE, VBUS_ILIMSTARTUP, VBUS_IDX(DT_PROP(CHG, vbus_limit_microamp)));
  rc |= pm_wr_burst(CHGR_BASE, CHGR_NTCHOT, (uint8_t[]){NTC_45C_CODE >> 2, NTC_45C_CODE & 3U}, 2U);
  rc |= pm_wr_burst(CHGR_BASE, CHGR_DIETEMPSTOP, (uint8_t[]){DIE_STOP_CODE >> 2, DIE_STOP_CODE & 3U}, 2U);
  rc |= pm_wr_burst(CHGR_BASE, CHGR_DIETEMPRESUME, (uint8_t[]){DIE_RESUME_CODE >> 2, DIE_RESUME_CODE & 3U}, 2U);
  rc |= pm_wr(CHGR_BASE, CHGR_TRICKLE_SEL, DT_ENUM_IDX(CHG, trickle_microvolt));
  rc |= pm_wr(CHGR_BASE, CHGR_ITERM_SEL, DT_ENUM_IDX(CHG, term_current_percent));
  rc |= pm_wr(ADC_BASE, ADC_IBAT_EN, 1U);
  rc |= pm_wr(ADC_BASE, ADC_TASK_AUTO, 1U);
  /* bit 0: no automatic recharge, bit 1: NTC disabled.  Neither: the NTC is fitted. */
  rc |= pm_wr(CHGR_BASE, CHGR_DIS_SET, (DT_PROP(CHG, disable_recharge) ? 1U : 0U) | (DT_ENUM_IDX(CHG, thermistor_ohms) == 0 ? 2U : 0U));
  /* A cell run flat (or whose protection circuit has opened: 0 V at the pads) must still be allowed to charge. The chip
   * then trickle-charges at 10 % of the set current until VBAT passes the trickle threshold (nPM1300 PS v1.3, 6.2.1).
   * Same register and value as Zephyr's own driver (CHGR_OFFSET_VBATLOW_EN).  Compiles; not run on hardware. */
  rc |= pm_wr(CHGR_BASE, CHGR_VBATLOW_EN, 1U);
  if (DT_PROP(CHG, charging_enable)) {
    rc |= pm_wr(CHGR_BASE, CHGR_EN_SET, 1U);
  }
  return rc ? -EIO : 0;
}
#endif

static void pmic_event(const struct device *dev, struct gpio_callback *cb, uint32_t pins) {
  ARG_UNUSED(dev);
  ARG_UNUSED(cb);
  struct app_evt e = {0};
  if (pins & BIT(NPM13XX_EVENT_SHIPHOLD_PRESS)) {
    e.type = EVT_BTN_PRESS;
    app_post(&e);
  }
  if (pins & BIT(NPM13XX_EVENT_SHIPHOLD_RELEASE)) {
    e.type = EVT_BTN_RELEASE;
    app_post(&e);
  }
  if (pins & (BIT(NPM13XX_EVENT_VBUS_DETECTED) | BIT(NPM13XX_EVENT_VBUS_REMOVED) | BIT(NPM13XX_EVENT_CHG_COMPLETED) |
              BIT(NPM13XX_EVENT_CHG_ERROR) | BIT(NPM13XX_EVENT_BATTERY_DETECTED) | BIT(NPM13XX_EVENT_BATTERY_REMOVED))) {
    e.type = EVT_CHARGER;
    app_post(&e);
  }
}

int power_init(void) {
  bool ok = device_is_ready(pmic) && device_is_ready(regulators);
#if IS_ENABLED(CONFIG_PQ_NPM1300_STOCK_CHARGER)
  ok = ok && device_is_ready(charger);
#endif
  if (!ok) {
    LOG_ERR("nPM1300 not ready");
    return -ENODEV;
  }
#if !IS_ENABLED(CONFIG_PQ_NPM1300_STOCK_CHARGER)
  int rc = charger_lite_init();
  if (rc) {
    LOG_ERR("charger setup failed: %d", rc);
    return rc;
  }
#endif
  gpio_init_callback(&pmic_cb, pmic_event,
                     BIT(NPM13XX_EVENT_SHIPHOLD_PRESS) | BIT(NPM13XX_EVENT_SHIPHOLD_RELEASE) |
                         BIT(NPM13XX_EVENT_VBUS_DETECTED) | BIT(NPM13XX_EVENT_VBUS_REMOVED) |
                         BIT(NPM13XX_EVENT_CHG_COMPLETED) | BIT(NPM13XX_EVENT_CHG_ERROR) |
                         BIT(NPM13XX_EVENT_BATTERY_DETECTED) | BIT(NPM13XX_EVENT_BATTERY_REMOVED));
  return mfd_npm13xx_add_callback(pmic, &pmic_cb);
}

int power_sample(struct power_status *o) {
  o->stub = false;
  o->valid = false;
  o->temp_c10 = INT16_MIN;
#if IS_ENABLED(CONFIG_PQ_NPM1300_STOCK_CHARGER)
  struct sensor_value v, st, vb, t;
  int rc = sensor_sample_fetch(charger);
  if (rc) {
    return rc;
  }
  if (sensor_channel_get(charger, SENSOR_CHAN_GAUGE_VOLTAGE, &v) ||
      sensor_channel_get(charger, (enum sensor_channel)SENSOR_CHAN_NPM13XX_CHARGER_STATUS, &st) ||
      sensor_channel_get(charger, (enum sensor_channel)SENSOR_CHAN_NPM13XX_CHARGER_VBUS_STATUS, &vb)) {
    return -EIO;
  }
  o->mv = (uint16_t)(v.val1 * 1000 + v.val2 / 1000);
  o->charging = (st.val1 & (CHG_TRICKLE | CHG_CC | CHG_CV)) != 0;
  o->vbus = (vb.val1 & VBUS_PRESENT) != 0;
  if (sensor_channel_get(charger, SENSOR_CHAN_GAUGE_TEMP, &t) == 0) {
    o->temp_c10 = (int16_t)(t.val1 * 10 + t.val2 / 100000);
  }
#else
  uint8_t st = 0, vb = 0, res[6];
  /* Trigger VBAT, NTC and die-temp conversions (three tasks; ~250 us each), read status meanwhile. */
  int rc = pm_wr_burst(ADC_BASE, ADC_TASK_VBAT, (uint8_t[]){1U, 1U, 1U}, 3U);
  rc |= pm_rd(CHGR_BASE, CHGR_CHG_STAT, &st);
  rc |= pm_rd(VBUS_BASE, VBUS_STATUS, &vb);
  k_sleep(K_MSEC(2));
  rc |= pm_rd_burst(ADC_BASE, ADC_RESULTS, res, sizeof(res));
  if (rc) {
    return -EIO;
  }
  /* res[1] = VBAT msb, res[5] = lsb byte A (VBAT in bits 1:0); 10-bit code, full scale 5 V. */
  uint32_t code = ((uint32_t)res[1] << 2) | (res[5] & 0x03U);
  o->mv = (uint16_t)(code * 5000U / 1024U);
  o->charging = (st & (CHG_TRICKLE | CHG_CC | CHG_CV)) != 0;
  o->vbus = (vb & VBUS_PRESENT) != 0;
  /* VBUS input limit (rev C, USB Type-C).  The chip starts at 100 mA (default USB) and goes back to 100 mA when the cable is
   * removed (stock driver comment).  CC1/CC2 go straight to the nPM1300, which has its own 5.1 k pull-downs and reports what the
   * source advertises in the USB-C detect status register.  Only if CC1 or CC2 shows 1.5 A or 3 A is VBUSINILIM raised to
   * 500 mA; a source that advertises default USB power (or nothing the chip could read) leaves 100 mA.  The detect result needs
   * a moment after the plug-in, so this is retried on every sample (60 s, and on charger events) until it has been applied. */
  if (o->vbus && !vbus_limit_set) {
    uint8_t det = 0;
    int r = pm_rd(VBUS_BASE, VBUS_DETECT, &det);
    if (r == 0 && (det & VBUS_DETECT_HI_MASK)) {
      r = pm_wr(VBUS_BASE, VBUS_ILIM, VBUS_IDX(VBUS_ILIM_HI_UA));
      r |= pm_wr(VBUS_BASE, VBUS_ILIMUPDATE, 1U);
      vbus_limit_set = r == 0;
      LOG_INF("USB-C detect 0x%02x: source offers 1.5/3 A, VBUS input limit %u mA: %d", det, VBUS_ILIM_HI_UA / 1000U, r);
    } else if (r) {
      LOG_WRN("USB-C detect read failed: %d (VBUS limit stays 100 mA)", r);
    }
  } else if (!o->vbus) {
    vbus_limit_set = false;
  }
#endif
  o->pct = mv_to_pct(o->mv);
  o->valid = true;
  last_mv = o->mv;
  last_vbus = o->vbus;
  return 0;
}

/* VSYS is the battery voltage less a small drop on battery, about 5 V docked.  Estimated from the last battery sample (taken
 * every 60 s and on charger events) because the motor duty cap (haptics.c) only needs a rough figure.  Conservative:
 * unknown reads as 4.2 V, which gives the lowest duty on battery. */
uint16_t power_vsys_mv_estimate(void) {
  if (last_vbus) {
    return 5000;
  }
  if (last_mv == 0 || last_mv > 4200) {
    return 4200;
  }
  return last_mv < 3100 ? 3100 : last_mv;
}

/* Board identity for the image-confirm test: the nPM1300 has no ID register, so a successful read of its VBUS status
 * register on the expected address is the check. */
bool power_identity_ok(void) {
  uint8_t vb = 0;
  int rc = pm_rd(VBUS_BASE, VBUS_STATUS, &vb);
  if (rc) {
    LOG_ERR("identity: nPM1300 read failed: %d", rc);
  }
  return rc == 0;
}

void power_ship(void) {
  /* Ship mode cuts the system rail (BUCK2 included) until SHPHLD is held for ship-to-active-time-ms (1 s). */
  int rc = regulator_parent_ship_mode(regulators);
  LOG_ERR("ship mode returned %d (the watch should be off)", rc);
}

#else /* ---------------------------------------------------------- no PMIC: DK path */

#if DT_NODE_EXISTS(DT_ALIAS(sw0))
static const struct gpio_dt_spec btn = GPIO_DT_SPEC_GET(DT_ALIAS(sw0), gpios);
static struct gpio_callback btn_cb;
static void btn_isr(const struct device *d, struct gpio_callback *cb, uint32_t pins) {
  ARG_UNUSED(d);
  ARG_UNUSED(cb);
  ARG_UNUSED(pins);
  struct app_evt e = {.type = gpio_pin_get_dt(&btn) > 0 ? EVT_BTN_PRESS : EVT_BTN_RELEASE};
  app_post(&e);
}
#endif

int power_init(void) {
  LOG_WRN("no nPM1300: STUB battery (fixed %d %%), no ship mode", 100);
#if DT_NODE_EXISTS(DT_ALIAS(sw0))
  if (!gpio_is_ready_dt(&btn) || gpio_pin_configure_dt(&btn, GPIO_INPUT) ||
      gpio_pin_interrupt_configure_dt(&btn, GPIO_INT_EDGE_BOTH)) {
    return -ENODEV;
  }
  gpio_init_callback(&btn_cb, btn_isr, BIT(btn.pin));
  return gpio_add_callback(btn.port, &btn_cb);
#else
  return 0;
#endif
}

int power_sample(struct power_status *o) {
  o->valid = true;
  o->stub = true;
  o->charging = false;
  o->vbus = false;
  o->mv = 4000;
  o->pct = 100;
  o->temp_c10 = INT16_MIN;
  return 0;
}

uint16_t power_vsys_mv_estimate(void) {
  return 3000; /* DK motor stand-in is an LED on a GPIO */
}

bool power_identity_ok(void) {
  return true;
}

void power_ship(void) {
  LOG_WRN("STUB: ship mode requested, ignored on this board");
}

#endif
