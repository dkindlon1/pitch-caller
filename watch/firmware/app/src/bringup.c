/*
 * bringup.c - rev E bring-up diagnostics.  Compiled only with CONFIG_PQ_BRINGUP (app/bringup.conf), so the normal build is
 * unchanged.  Needs neither the display nor a phone: everything goes to the log (UART on P0.05/P0.08 and RTT).
 *   boot line, nPM1300 state every 5 s, LIS2DH12 WHO_AM_I once then x/y/z every 1 s, motor buzz 3 s after boot and on a
 *   short button press, the BLE passkey, the LCD init result.
 * Compiles; not run on hardware.
 */
#include <stdio.h>

#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/hwinfo.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/dfu/mcuboot.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include "pq_app.h"

LOG_MODULE_REGISTER(bringup, LOG_LEVEL_INF);

#define BUZZ_MS 300
#define BUZZ_AFTER_BOOT_MS 3000
#define TICK_MS 1000
#define PMIC_EVERY 5 /* ticks */

#if IS_ENABLED(CONFIG_PQ_HAVE_PMIC)
#include <zephyr/drivers/mfd/npm13xx.h>
static const struct device *const pmic = DEVICE_DT_GET(DT_NODELABEL(npm1300_pmic));
/* Same offsets as power.c and the stock driver (npm13xx_charger.c): charger base 0x03, ISET 0x08/0x09, status 0x34, error
 * reason 0x36; VBUSIN base 0x02, status 0x07. */
#define CHGR_BASE 0x03U
#define VBUS_BASE 0x02U
#define CHGR_ISET 0x08U
#define CHGR_CHG_STAT 0x34U
#define CHGR_ERR_REASON 0x36U
#define VBUS_STATUS 0x07U
#endif

#if IS_ENABLED(CONFIG_PQ_HAVE_ACCEL)
static const struct device *const accel = DEVICE_DT_GET(DT_NODELABEL(accel));
static const struct i2c_dt_spec accel_i2c = I2C_DT_SPEC_GET(DT_NODELABEL(accel));
#define LIS_WHO_AM_I 0x0f
#endif

static void tick(struct k_work *w);
static void boot_buzz(struct k_work *w);
static K_WORK_DELAYABLE_DEFINE(tick_work, tick);
static K_WORK_DELAYABLE_DEFINE(buzz_work, boot_buzz);
static unsigned int ticks;

static const struct {
  uint32_t flag;
  const char *name;
} RESET_NAMES[] = {{RESET_PIN, "PIN"},           {RESET_SOFTWARE, "SOFTWARE"}, {RESET_BROWNOUT, "BROWNOUT"},
                   {RESET_POR, "POR"},           {RESET_WATCHDOG, "WATCHDOG"}, {RESET_DEBUG, "DEBUG"},
                   {RESET_CPU_LOCKUP, "LOCKUP"}, {RESET_LOW_POWER_WAKE, "LPWAKE"}};

void bringup_boot(bool have_cause, uint32_t cause) {
  char names[64] = "";
  size_t n = 0;
  for (size_t i = 0; i < ARRAY_SIZE(RESET_NAMES); i++) {
    if (cause & RESET_NAMES[i].flag) {
      n += snprintf(names + n, sizeof(names) - n, "%s%s", n ? "|" : "", RESET_NAMES[i].name);
    }
  }
  LOG_INF("BOOT fw %s reset 0x%08x %s confirmed %d", CONFIG_PQ_FW_VERSION, (unsigned)cause,
          have_cause ? (names[0] ? names : "none") : "unknown", boot_is_img_confirmed() ? 1 : 0);
}

void bringup_lcd(bool ok) {
  if (ok) {
    LOG_INF("LCD init ok");
  } else {
    LOG_ERR("LCD init failed");
  }
}

void bringup_passkey(uint32_t passkey) {
  LOG_INF("PASSKEY %06u", (unsigned)(passkey % 1000000U));
}

void bringup_button_short(void) {
  LOG_INF("button short press");
  haptics_buzz_ms(BUZZ_MS);
}

static void boot_buzz(struct k_work *w) {
  ARG_UNUSED(w);
  LOG_INF("boot buzz");
  haptics_buzz_ms(BUZZ_MS);
}

static void pmic_line(void) {
#if IS_ENABLED(CONFIG_PQ_HAVE_PMIC)
  uint8_t stat = 0, err = 0, vbs = 0, iset[2] = {0, 0};
  int rc = mfd_npm13xx_reg_read(pmic, CHGR_BASE, CHGR_CHG_STAT, &stat);
  rc |= mfd_npm13xx_reg_read(pmic, CHGR_BASE, CHGR_ERR_REASON, &err);
  rc |= mfd_npm13xx_reg_read(pmic, VBUS_BASE, VBUS_STATUS, &vbs);
  rc |= mfd_npm13xx_reg_read_burst(pmic, CHGR_BASE, CHGR_ISET, iset, 2U);
  struct power_status ps;
  int prc = power_sample(&ps);
  /* ISET index = msb * 2 + lsb bit 0; current = 32 mA + (index - 16) * 2 mA (the inverse of power.c ISET_IDX). */
  unsigned int idx = (unsigned int)iset[0] * 2U + (iset[1] & 1U);
  unsigned int ma = idx >= 16U ? 32U + (idx - 16U) * 2U : 0U;
  LOG_INF("PMIC vbus %d chg_stat 0x%02x chg_err 0x%02x vbus_stat 0x%02x vbat %u mV iset %u mA (idx %u) rc %d/%d",
          prc == 0 ? (int)ps.vbus : -1, stat, err, vbs, prc == 0 ? ps.mv : 0U, ma, idx, rc, prc);
#else
  LOG_WRN("PMIC: not on this board");
#endif
}

static void accel_line(void) {
#if IS_ENABLED(CONFIG_PQ_HAVE_ACCEL)
  struct sensor_value v[3];
  int rc = sensor_sample_fetch(accel);
  if (rc == 0) {
    rc = sensor_channel_get(accel, SENSOR_CHAN_ACCEL_XYZ, v);
  }
  if (rc) {
    LOG_ERR("ACCEL read failed %d", rc);
    return;
  }
  /* m/s^2 (milli) to milli-g: x / 9.80665 */
  int32_t mg[3];
  for (int i = 0; i < 3; i++) {
    mg[i] = (int32_t)(((int64_t)sensor_value_to_milli(&v[i]) * 100000) / 980665);
  }
  LOG_INF("ACCEL mg x %d y %d z %d", (int)mg[0], (int)mg[1], (int)mg[2]);
#endif
}

static void tick(struct k_work *w) {
  ARG_UNUSED(w);
  if (ticks % PMIC_EVERY == 0) {
    pmic_line();
  }
  accel_line();
  ticks++;
  k_work_schedule(&tick_work, K_MSEC(TICK_MS));
}

void bringup_start(void) {
#if IS_ENABLED(CONFIG_PQ_HAVE_ACCEL)
  uint8_t id = 0;
  int rc = i2c_reg_read_byte_dt(&accel_i2c, LIS_WHO_AM_I, &id);
  LOG_INF("ACCEL WHO_AM_I 0x%02x at I2C 0x%02x rc %d (expect 0x33 at 0x19)%s", id, accel_i2c.addr, rc,
          (rc == 0 && id == 0x33) ? " OK" : " MISMATCH");
#endif
  k_work_schedule(&tick_work, K_MSEC(TICK_MS));
  /* "3 s after boot" counted from kernel start (k_uptime), not from this call. */
  int64_t left = BUZZ_AFTER_BOOT_MS - k_uptime_get();
  k_work_schedule(&buzz_work, K_MSEC(left > 0 ? left : 0));
}
