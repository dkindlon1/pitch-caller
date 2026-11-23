/*
 * i2c_util.c - bus recovery for the one shared I2C bus (nPM1300, LIS2DH12 on TWIM0).  A sensor that holds SDA low
 * after an ESD hit or a reset in mid-transfer would otherwise stop the charger set-up, the button and every sensor.  The
 * retry macro PQ_I2C_RETRY (pq_app.h) calls this between tries.
 */
#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/logging/log.h>

#include "pq_app.h"

LOG_MODULE_REGISTER(i2c_util, LOG_LEVEL_INF);

#if DT_NODE_HAS_STATUS_OKAY(DT_NODELABEL(i2c0))
int pq_i2c_recover(void) {
  const struct device *bus = DEVICE_DT_GET(DT_NODELABEL(i2c0));
  if (!device_is_ready(bus)) {
    return -ENODEV;
  }
  int rc = i2c_recover_bus(bus);
  LOG_WRN("I2C bus recovery: %d", rc);
  app_wdt_feed(); /* a stuck bus at boot must not outlast the 8 s watchdog (see app_glue.c) */
  return rc;
}
#else
int pq_i2c_recover(void) {
  return 0;
}
#endif
