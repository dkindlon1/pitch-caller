/*
 * haptics.c - the buzz patterns, as in the JS pqBuzz(): one 450 ms buzz for a new call, two 120 ms buzzes 120 ms apart
 * for a changed one.  haptics_buzz() returns at once; a delayable work item walks the pattern.
 *
 * Watch: the motor is on PWM1 (zephyr,user pwms \"motor\").  DK: LED 1 stands in (alias pq-buzz).
 */
#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/pwm.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include "pq_app.h"

LOG_MODULE_REGISTER(haptics, LOG_LEVEL_INF);

#define USER DT_PATH(zephyr_user)

#if DT_PROP_HAS_NAME(USER, pwms, motor)
#define HAVE_MOTOR 1
static const struct pwm_dt_spec motor = PWM_DT_SPEC_GET_BY_NAME(USER, motor);
#elif DT_NODE_EXISTS(DT_ALIAS(pq_buzz))
#define HAVE_MOTOR 0
static const struct gpio_dt_spec motor_led = GPIO_DT_SPEC_GET(DT_ALIAS(pq_buzz), gpios);
#else
#error "No vibration motor (zephyr,user pwms \"motor\") and no pq-buzz alias: the board needs one of them"
#endif

#define MOTOR_TARGET_MV 3000U

struct step {
  uint16_t ms;
  bool on;
};
static const struct step PAT_NEW[] = {{450, true}, {0, false}};
static const struct step PAT_CHANGED[] = {{120, true}, {120, false}, {120, true}, {0, false}};

static void run(struct k_work *w);
/* Static definition: no interrupt or caller can submit an uninitialised work item (firmware review 7). */
static K_WORK_DELAYABLE_DEFINE(work, run);
static bool ready; /* set by haptics_init once the motor driver answered */
static atomic_t busy; /* a pattern is running: sensors/app_glue do not start the heart-rate LEDs meanwhile (firmware review 6) */
static const struct step *pat;
static uint8_t pos;
static struct k_spinlock lock;

static void motor_set(bool on) {
#if HAVE_MOTOR
  /* The motor hangs on VSYS (3.1-4.2 V on battery, about 5 V docked) but is a 3 V part (electrical review 10): cap the duty
   * so the effective voltage is about 3.0 V, from the last battery sample / VBUS state.  0 = off. */
  uint32_t duty = 0;
  if (on) {
    uint32_t vsys = power_vsys_mv_estimate();
    uint32_t permille = vsys <= MOTOR_TARGET_MV ? 1000U : (MOTOR_TARGET_MV * 1000U) / vsys;
    duty = (uint32_t)(((uint64_t)motor.period * permille) / 1000U);
  }
  (void)pwm_set_dt(&motor, motor.period, duty);
#else
  (void)gpio_pin_set_dt(&motor_led, on);
#endif
}

static void run(struct k_work *w) {
  ARG_UNUSED(w);
  k_spinlock_key_t k = k_spin_lock(&lock);
  const struct step *s = &pat[pos++];
  k_spin_unlock(&lock, k);
  motor_set(s->on);
  if (s->ms) {
    k_work_schedule(&work, K_MSEC(s->ms));
  } else {
    atomic_clear(&busy);
  }
}

int haptics_init(void) {
#if HAVE_MOTOR
  if (!pwm_is_ready_dt(&motor)) {
    LOG_ERR("motor PWM not ready");
    return -ENODEV;
  }
#else
  if (!gpio_is_ready_dt(&motor_led) || gpio_pin_configure_dt(&motor_led, GPIO_OUTPUT_INACTIVE)) {
    return -ENODEV;
  }
#endif
  motor_set(false);
  ready = true;
  return 0;
}

void haptics_buzz(enum pq_buzz_kind kind) {
  if (!ready) {
    LOG_WRN("buzz ignored: motor not initialised");
    return;
  }
  /* A new buzz restarts whatever was running. */
  (void)k_work_cancel_delayable(&work);
  k_spinlock_key_t k = k_spin_lock(&lock);
  pat = kind == PQ_BUZZ_CHANGED ? PAT_CHANGED : PAT_NEW;
  pos = 0;
  k_spin_unlock(&lock, k);
  atomic_set(&busy, 1);
  LOG_INF("buzz %s", kind == PQ_BUZZ_CHANGED ? "changed" : "new");
  k_work_schedule(&work, K_NO_WAIT);
}

bool haptics_busy(void) {
  return atomic_get(&busy) != 0;
}
