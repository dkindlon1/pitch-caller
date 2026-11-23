/*
 * PitchIQ watch rev C firmware: the pitch-call display and receiver.  Start-up order matters little; every module reports
 * its own failure and the watch still tries to come up (a dead accelerometer must not stop it showing calls), but the
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
 * halts forever.  The watchdog covers hangs that do not reach here.
 *
 * Reboot-loop guard: fatal_magic holds a tag in its upper 24 bits ("PQF") and the number of CONSECUTIVE fatal resets in its low
 * byte.  The count is cleared only by app_boot_stable() once an image has run 60 s, so a fault that strikes again right after
 * every boot is counted.  At FATAL_MAX the handler does not reboot: it parks the chip (see fatal_park()).  A power cycle (the
 * nPM1300 button-hold reset) clears RAM and so the count; the tag makes random power-up RAM look like "no fatal error" (a 1 in
 * 16 million chance of a false match). */
#define FATAL_TAG 0x50514600U /* "PQF" + count byte */
#define FATAL_TAG_MASK 0xffffff00U
#define FATAL_MAX 3
static uint32_t __noinit fatal_magic;
static uint32_t __noinit fatal_reason;

static uint32_t fatal_count(void) {
  return (fatal_magic & FATAL_TAG_MASK) == FATAL_TAG ? (fatal_magic & 0xffU) : 0U;
}

void app_boot_stable(void) {
  if (fatal_magic != 0U) {
    fatal_magic = 0U;
  }
}

#if defined(CONFIG_SOC_SERIES_NRF52)
#include <nrfx.h>
#endif
#if defined(CONFIG_SOC_SERIES_NRF52) && defined(CONFIG_PQ_HAVE_PMIC)
#define PQ_MOTOR_PIN 11 /* must match PQ_PIN_MOTOR_PWM in pitchiq_watch-pinctrl.dtsi */
#endif

/* Low-power halt: nothing runs and nothing can wake the CPU except the RTC compare event used below.  The nRF52 watchdog cannot
 * be stopped once started (and "pause in sleep" would make it useless in normal operation), so it is fed by register write every
 * 4 s from a WFE loop woken by an RTC1 compare EVENT (no interrupt needed).  The motor pin is forced low first so the motor
 * cannot be left running, the radio and the HF clock are stopped.  ASSUMPTION: written from the nRF52 reference manual, never
 * run on hardware; the display keeps its last picture (its own power is not switched). */
static void fatal_park(void) {
  (void)arch_irq_lock();
#if defined(CONFIG_SOC_SERIES_NRF52)
  for (unsigned i = 0; i < ARRAY_SIZE(NVIC->ICER); i++) {
    NVIC->ICER[i] = 0xffffffffU;
  }
#if defined(PQ_MOTOR_PIN)
  NRF_PWM1->ENABLE = 0;
  NRF_P0->DIRSET = BIT(PQ_MOTOR_PIN);
  NRF_P0->OUTCLR = BIT(PQ_MOTOR_PIN);
#endif
  NRF_RADIO->TASKS_DISABLE = 1;
  NRF_CLOCK->TASKS_HFCLKSTOP = 1;
  NRF_RTC1->EVTENSET = RTC_EVTENSET_COMPARE0_Msk;
  for (;;) {
    NRF_WDT->RR[0] = WDT_RR_RR_Reload;
    NRF_RTC1->EVENTS_COMPARE[0] = 0;
    NRF_RTC1->CC[0] = (NRF_RTC1->COUNTER + 4U * 32768U) & 0xffffffU; /* 4 s on the 32.768 kHz clock */
    while (NRF_RTC1->EVENTS_COMPARE[0] == 0) {
      __WFE();
    }
  }
#else
  for (;;) {
  }
#endif
}

void k_sys_fatal_error_handler(unsigned int reason, const struct arch_esf *esf) {
  ARG_UNUSED(esf);
  uint32_t n = fatal_count() + 1U;
  fatal_reason = reason;
  fatal_magic = FATAL_TAG | (n > 0xffU ? 0xffU : n);
  LOG_PANIC();
  if (n >= FATAL_MAX) {
    fatal_park();
    CODE_UNREACHABLE;
  }
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
  if (fatal_count()) {
    LOG_ERR("previous run ended in a fatal error, reason %u, %u consecutive (halt at %d)", fatal_reason, fatal_count(), FATAL_MAX);
  }
  /* fatal_magic is NOT cleared here: app_boot_stable() clears it after 60 s so the count spans consecutive resets. */
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
    LOG_ERR("sensors_init failed: no motion light");
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
