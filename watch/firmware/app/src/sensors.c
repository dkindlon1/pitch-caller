/*
 * sensors.c - accelerometer (LIS2DH12) and heart-rate sensor (MAX30101).
 *
 * Accelerometer: the Zephyr lis2dh driver, any-motion interrupt on INT1.  A move wakes the frontlight (PQ_LIGHT_ON_MOTION)
 * and restarts the idle timer that sensors_idle() answers from (the input for an idle power policy).
 *
 * Heart rate: OFF by default.  sensors_hr_start() runs this power sequence (MAX30101 datasheet order: logic first, LED
 * supply after):
 *     BUCK1 (1.8 V, the sensor core) on  ->  sensor configured over I2C, held in shutdown  ->  BOOST_EN high (the
 *     TI TPS61023 5 V boost for the LED anode, true output disconnect)  ->  sensor mode set = LEDs run.
 * and sensors_hr_stop() the reverse:  boost off -> sensor shutdown -> BUCK1 off.
 * The stock Zephyr max30101 driver is not used (it configures the chip once at boot and cannot survive the rail being cut);
 * this file talks to the chip over I2C using the properties of the devicetree node (CONFIG_MAX30101 is off in prj.conf).
 * It polls the FIFO every 100 ms instead of using the INT pin (wired, unused in v1).  Samples go to hr_est and the result to
 * the standard Bluetooth Heart Rate Service.
 */
#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/drivers/regulator.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include "hr_est.h"
#include "pq_app.h"

LOG_MODULE_REGISTER(sensors, LOG_LEVEL_INF);

#define IDLE_MS 30000

static int64_t last_motion;

bool sensors_idle(void) {
  return (k_uptime_get() - last_motion) > IDLE_MS;
}

/* ===================================================================== accelerometer */
#if IS_ENABLED(CONFIG_PQ_HAVE_ACCEL)

static const struct device *const accel = DEVICE_DT_GET(DT_NODELABEL(accel));
static const struct i2c_dt_spec accel_i2c = I2C_DT_SPEC_GET(DT_NODELABEL(accel));
#define LIS_WHO_AM_I 0x0f
#define LIS_WHO_AM_I_VAL 0x33
#define LIS_CTRL_REG2 0x21
#define LIS_REFERENCE 0x26
#define LIS_INT1_SRC 0x31
/* CTRL_REG2: HPM[7:6]=00 normal mode (reset by reading REFERENCE), HPCF=00, FDS=0 (output stays unfiltered), HPIS1=1 (the
 * high-pass filter feeds the INT1 generator).  Without it the INT1 threshold compares raw data, gravity (about 1 g on one
 * axis) is always above it and the interrupt never clears (firmware review 3). */
#define LIS_CTRL2_HPIS1 0x01
static struct sensor_trigger motion_trig = {.type = SENSOR_TRIG_DELTA, .chan = SENSOR_CHAN_ACCEL_XYZ};

static void on_motion(const struct device *dev, const struct sensor_trigger *t) {
  ARG_UNUSED(dev);
  ARG_UNUSED(t);
  last_motion = k_uptime_get();
  struct app_evt e = {.type = EVT_MOTION};
  app_post(&e);
}

static int accel_init(void) {
  if (!device_is_ready(accel)) {
    LOG_ERR("LIS2DH12 not ready");
    return -ENODEV;
  }
  struct sensor_value v;
  /* 10 Hz is enough to see a wrist move and costs a few microamps.  ASSUMPTION: the driver was built with a runtime ODR
   * (default); the values below are starting points to tune on the wrist: ~1.5 m/s^2 change, held for 2 samples. */
  v.val1 = 10;
  v.val2 = 0;
  (void)sensor_attr_set(accel, SENSOR_CHAN_ACCEL_XYZ, SENSOR_ATTR_SAMPLING_FREQUENCY, &v);
  sensor_value_from_milli(&v, 1500);
  (void)sensor_attr_set(accel, SENSOR_CHAN_ACCEL_XYZ, SENSOR_ATTR_SLOPE_TH, &v);
  v.val1 = 2;
  v.val2 = 0;
  (void)sensor_attr_set(accel, SENSOR_CHAN_ACCEL_XYZ, SENSOR_ATTR_SLOPE_DUR, &v);
  int rc = sensor_trigger_set(accel, &motion_trig, on_motion);
  /* High-pass filter on the INT1 path.  The driver never writes CTRL_REG2, so this stays.  Then read REFERENCE once: in
   * normal mode that read sets the filter's reference to the current (gravity) sample. */
  uint8_t ref = 0, src = 0;
  int hp = PQ_I2C_RETRY(i2c_reg_write_byte_dt(&accel_i2c, LIS_CTRL_REG2, LIS_CTRL2_HPIS1));
  hp |= PQ_I2C_RETRY(i2c_reg_read_byte_dt(&accel_i2c, LIS_REFERENCE, &ref));
  (void)PQ_I2C_RETRY(i2c_reg_read_byte_dt(&accel_i2c, LIS_INT1_SRC, &src));
  LOG_INF("accel high-pass on INT1: rc %d, REFERENCE 0x%02x, INT1_SRC 0x%02x (bring-up: expect IA=0 when still)", hp, ref, src);
  return rc ? rc : hp;
}

bool sensors_identity_ok(void) {
  uint8_t id = 0;
  int rc = PQ_I2C_RETRY(i2c_reg_read_byte_dt(&accel_i2c, LIS_WHO_AM_I, &id));
  if (rc || id != LIS_WHO_AM_I_VAL) {
    LOG_ERR("identity: LIS2DH12 WHO_AM_I rc %d id 0x%02x (want 0x33)", rc, id);
    return false;
  }
  return true;
}

#else
static int accel_init(void) {
  LOG_WRN("no accelerometer: STUB, no motion events, never idle-detected from motion");
  return 0;
}
bool sensors_identity_ok(void) {
  return true;
}
#endif

/* ===================================================================== heart rate */
#if IS_ENABLED(CONFIG_PQ_HAVE_PPG)

#define PPG DT_NODELABEL(ppg)
#define USER DT_PATH(zephyr_user)

#define REG_FIFO_WR 0x04
#define REG_FIFO_OVF 0x05
#define REG_FIFO_RD 0x06
#define REG_FIFO_DATA 0x07
#define REG_FIFO_CFG 0x08
#define REG_MODE 0x09
#define REG_SPO2 0x0a
#define REG_LED1_PA 0x0c /* LED2 = 0x0d, LED3 (green) = 0x0e */
#define REG_MULTI_LED 0x11 /* slots 1/2; slots 3/4 at 0x12 */
#define REG_PART_ID 0xff
#define PART_ID 0x15
#define MODE_SHDN 0x80
#define MODE_RESET 0x40
#define MODE_MULTI_LED 0x07

/* Register values from the devicetree node, the same encodings the stock driver uses. */
#define SPO2_VAL ((DT_ENUM_IDX(PPG, adc_rge) << 5) | (DT_ENUM_IDX(PPG, smp_sr) << 2) | DT_ENUM_IDX(PPG, led_pw))
#define FIFO_VAL ((DT_ENUM_IDX(PPG, smp_ave) << 5) | (DT_PROP(PPG, fifo_rollover_en) << 4) | DT_PROP(PPG, fifo_watermark))
#define SLOT(i) DT_PROP_BY_IDX(PPG, led_slot, i)
#define PA(i) DT_PROP_BY_IDX(PPG, led_pa, i)
#define DATA_SHIFT (3 - DT_ENUM_IDX(PPG, led_pw))
/* Samples the chip puts in the FIFO per second after averaging, and the period between them. */
#define FIFO_RATE_HZ (DT_PROP(PPG, smp_sr) / DT_PROP(PPG, smp_ave))
#define SAMPLE_MS (1000 / FIFO_RATE_HZ)
#define POLL_MS 100
#define SAMPLES_PER_BYTES 3
BUILD_ASSERT(DT_PROP_LEN(PPG, led_slot) == 4 && DT_PROP_LEN(PPG, led_pa) == 3, "ppg node: led-slot needs 4 and led-pa 3 entries");
BUILD_ASSERT(DT_ENUM_HAS_VALUE(PPG, acq_mode, multi_led), "sensors.c is written for multi-led acquisition");
BUILD_ASSERT(SLOT(0) == 3 && SLOT(1) == 0 && SLOT(2) == 0 && SLOT(3) == 0, "ppg node: slot 1 green only (one 3-byte sample per FIFO entry)");

static const struct i2c_dt_spec ppg_i2c = I2C_DT_SPEC_GET(PPG);
static const struct gpio_dt_spec boost = GPIO_DT_SPEC_GET(USER, boost_en_gpios);
static const struct device *const core_rail = DEVICE_DT_GET(DT_NODELABEL(buck1));

static void hr_poll(struct k_work *w);
static K_WORK_DELAYABLE_DEFINE(hr_work, hr_poll); /* static: usable from the first interrupt (firmware review 7) */
static uint32_t last_notify;
static struct hr_est est;
static bool hr_on;
static uint8_t last_bpm;

static int wr(uint8_t reg, uint8_t v) {
  return PQ_I2C_RETRY(i2c_reg_write_byte_dt(&ppg_i2c, reg, v));
}

static void hr_poll(struct k_work *w) {
  ARG_UNUSED(w);
  if (!hr_on) {
    return;
  }
  uint8_t ptr[3];
  /* FIFO_WR, FIFO_OVF, FIFO_RD are consecutive registers. */
  if (PQ_I2C_RETRY(i2c_burst_read_dt(&ppg_i2c, REG_FIFO_WR, ptr, 3))) {
    LOG_ERR("PPG pointer read failed");
    k_work_schedule(&hr_work, K_MSEC(POLL_MS));
    return;
  }
  unsigned n = (ptr[0] - ptr[2]) & 0x1f;
  if (n == 0 && ptr[1]) {
    n = 32; /* overflowed: everything is new */
  }
  uint8_t buf[32 * SAMPLES_PER_BYTES];
  if (n) {
    if (PQ_I2C_RETRY(i2c_burst_read_dt(&ppg_i2c, REG_FIFO_DATA, buf, n * SAMPLES_PER_BYTES))) {
      LOG_ERR("PPG data read failed");
    } else {
      uint32_t now = (uint32_t)k_uptime_get();
      for (unsigned i = 0; i < n; i++) {
        uint32_t raw = (((uint32_t)buf[i * 3] << 16 | (uint32_t)buf[i * 3 + 1] << 8 | buf[i * 3 + 2]) & 0x3ffff) >> DATA_SHIFT;
        /* Samples are evenly spaced; the newest is "now". */
        last_bpm = hr_est_feed(&est, raw, now - (n - 1 - i) * SAMPLE_MS);
      }
      LOG_DBG("ppg %u samples, bpm %u", n, last_bpm);
      /* The estimate is notified at 1 Hz, not per FIFO read (firmware review 12). */
      if (last_bpm && (now - last_notify) >= 1000U) {
        last_notify = now;
        ble_pq_heart_rate(last_bpm);
      }
    }
  }
  k_work_schedule(&hr_work, K_MSEC(POLL_MS));
}

static int hr_hw_init(void) {
  if (!device_is_ready(core_rail) || !device_is_ready(ppg_i2c.bus) || !gpio_is_ready_dt(&boost)) {
    LOG_ERR("heart-rate hardware not ready");
    return -ENODEV;
  }
  /* The boost must be off before anything else: ASSUMPTION: the chip's LED anode has no other supply. */
  int rc = gpio_pin_configure_dt(&boost, GPIO_OUTPUT_INACTIVE);
  return rc;
}

int sensors_hr_start(void) {
  if (hr_on) {
    return 0;
  }
  /* 1. sensor core rail.  The chip needs a moment after VDD before its I2C answers. */
  int rc = regulator_enable(core_rail);
  if (rc) {
    LOG_ERR("BUCK1 on: %d", rc);
    return rc;
  }
  k_msleep(20);
  uint8_t id = 0;
  rc = PQ_I2C_RETRY(i2c_reg_read_byte_dt(&ppg_i2c, REG_PART_ID, &id));
  if (rc || id != PART_ID) {
    LOG_ERR("MAX30101 part id read rc %d id 0x%02x (want 0x%02x)", rc, id, PART_ID);
    (void)regulator_disable(core_rail);
    return rc ? rc : -ENODEV;
  }
  /* 2. configure while held in shutdown, LEDs not yet powered. */
  rc = wr(REG_MODE, MODE_RESET);
  k_msleep(5);
  rc |= wr(REG_MODE, MODE_SHDN | MODE_MULTI_LED);
  rc |= wr(REG_FIFO_CFG, FIFO_VAL);
  rc |= wr(REG_SPO2, SPO2_VAL);
  rc |= wr(REG_LED1_PA, PA(0));
  rc |= wr(REG_LED1_PA + 1, PA(1));
  rc |= wr(REG_LED1_PA + 2, PA(2));
  rc |= wr(REG_LED1_PA + 3, PA(2));
  rc |= wr(REG_MULTI_LED, (SLOT(1) << 4) | SLOT(0));
  rc |= wr(REG_MULTI_LED + 1, (SLOT(3) << 4) | SLOT(2));
  if (rc) {
    LOG_ERR("MAX30101 configuration failed");
    (void)regulator_disable(core_rail);
    return -EIO;
  }
  /* 3. LED supply, 4. run. */
  (void)gpio_pin_set_dt(&boost, 1);
  k_msleep(5); /* ASSUMPTION: 5 ms is enough for the boost output to settle; check on a scope. */
  rc = wr(REG_FIFO_WR, 0) | wr(REG_FIFO_OVF, 0) | wr(REG_FIFO_RD, 0) | wr(REG_MODE, MODE_MULTI_LED);
  if (rc) {
    (void)gpio_pin_set_dt(&boost, 0);
    (void)regulator_disable(core_rail);
    return -EIO;
  }
  hr_est_init(&est);
  last_bpm = 0;
  last_notify = 0;
  hr_on = true;
  k_work_schedule(&hr_work, K_MSEC(POLL_MS));
  LOG_INF("heart rate on");
  return 0;
}

void sensors_hr_stop(void) {
  if (!hr_on) {
    return;
  }
  hr_on = false;
  (void)k_work_cancel_delayable(&hr_work);
  (void)gpio_pin_set_dt(&boost, 0);       /* LED supply off first */
  (void)wr(REG_MODE, MODE_SHDN | MODE_MULTI_LED); /* then the sensor */
  (void)regulator_disable(core_rail);     /* then its core */
  LOG_INF("heart rate off");
}

bool sensors_hr_active(void) {
  return hr_on;
}

#else
static int hr_hw_init(void) {
  LOG_WRN("no heart-rate sensor: STUB, sensors_hr_start() reports -ENOTSUP");
  return 0;
}
int sensors_hr_start(void) {
  return -ENOTSUP;
}
void sensors_hr_stop(void) {}
bool sensors_hr_active(void) {
  return false;
}
#endif

int sensors_init(void) {
  last_motion = k_uptime_get();
  int a = accel_init();
  int h = hr_hw_init();
  return a ? a : h;
}
