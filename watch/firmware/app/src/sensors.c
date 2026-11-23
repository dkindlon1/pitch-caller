/*
 * sensors.c - accelerometer (LIS2DH12).  Rev C has no heart-rate sensor (MAX30101 and its 5 V boost were removed).
 *
 * Accelerometer: the Zephyr lis2dh driver, any-motion interrupt on INT1.  A move wakes the frontlight (PQ_LIGHT_ON_MOTION)
 * and restarts the idle timer that sensors_idle() answers from (the input for an idle power policy).
 *
 */
#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

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

int sensors_init(void) {
  last_motion = k_uptime_get();
  return accel_init();
}
