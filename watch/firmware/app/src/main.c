/*
 * PitchIQ watch rev B firmware: the pitch-call display and receiver.  Start-up order matters little; every module reports
 * its own failure and the watch still tries to come up (a dead heart-rate sensor must not stop it showing calls), but the
 * firmware update is only confirmed when everything essential worked (see app_glue.c).
 */
#include <zephyr/fatal.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/reboot.h>
#include <zephyr/drivers/hwinfo.h>
#include <zephyr/logging/log.h>
#include <zephyr/logging/log_ctrl.h>

#include "pq_app.h"

LOG_MODULE_REGISTER(main, LOG_LEVEL_INF);

void app_glue_init(void);
void app_glue_set_healthy(bool ok);
void app_wdt_init(void);

/* A fatal error (hard fault, stack overflow, assert, kernel panic) must not freeze the watch with a stale screen and a dead
 * radio: note the reason in a RAM word that survives the reset and cold reboot (firmware review 2).  Zephyr's default handler
 * halts forever.  The watchdog covers hangs that do not reach here. */
#define FATAL_MAGIC 0x50514652U /* "PQFR" */
static uint32_t __noinit fatal_magic;
static uint32_t __noinit fatal_reason;

void k_sys_fatal_error_handler(unsigned int reason, const struct arch_esf *esf) {
  ARG_UNUSED(esf);
  fatal_reason = reason;
  fatal_magic = FATAL_MAGIC;
  LOG_PANIC();
  sys_reboot(SYS_REBOOT_COLD);
  CODE_UNREACHABLE;
}

int main(void) {
  app_wdt_init();
  LOG_INF("PitchIQ watch firmware starting");
  uint32_t cause = 0;
  if (hwinfo_get_reset_cause(&cause) == 0) {
    LOG_INF("reset cause 0x%08x (RESETREAS)", cause);
    (void)hwinfo_clear_reset_cause();
  }
  if (fatal_magic == FATAL_MAGIC) {
    LOG_ERR("previous run ended in a fatal error, reason %u", fatal_reason);
  }
  fatal_magic = 0;
  bool essential = true;

  /* The screen, the buzzer and Bluetooth are essential: without them the watch cannot do its job. */
  if (ui_init()) {
    LOG_ERR("ui_init failed");
    essential = false;
  }
  if (haptics_init()) {
    LOG_ERR("haptics_init failed");
    essential = false;
  }
  /* Power and sensors are not: report and carry on. */
  if (power_init()) {
    LOG_ERR("power_init failed: no battery data, no button");
  }
  if (sensors_init()) {
    LOG_ERR("sensors_init failed: no motion light / heart rate");
  }

  /* Start the glue before Bluetooth so the first connection event finds a running core. */
  app_glue_init();
  if (ble_pq_init()) {
    LOG_ERR("ble_pq_init failed");
    essential = false;
  }
  if (!essential) {
    /* The glue keeps running (the image is not confirmed, so an update would roll back on the next reset). */
    LOG_ERR("start-up incomplete");
  }
  app_glue_set_healthy(essential);
  return 0;
}
