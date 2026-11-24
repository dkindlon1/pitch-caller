/*
 * ui.c - puts ui_render()'s picture on the panel through the Zephyr display API, and runs the frontlight.
 * Without a display (DK build, PQ_HAVE_DISPLAY off) the same information goes to the log as text.
 * All calls come from the app_glue thread; there is no locking.
 */
#include <stdio.h>
#include <string.h>

#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/display.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/pwm.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include "pq_app.h"
#include "ui_render.h"

LOG_MODULE_REGISTER(ui, LOG_LEVEL_INF);

#define USER DT_PATH(zephyr_user)
#define LIGHT_ON_MS 3000
/* ASSUMPTION: 60 % duty is a comfortable frontlight level for this LED and the 150 mAh cell; tune on the wrist. */
#define LIGHT_DUTY_PERCENT 60

#if DT_PROP_HAS_NAME(USER, pwms, light)
#define LIGHT_PWM 1
static const struct pwm_dt_spec light = PWM_DT_SPEC_GET_BY_NAME(USER, light);
#elif DT_NODE_EXISTS(DT_ALIAS(pq_light))
#define LIGHT_PWM 0
static const struct gpio_dt_spec light_led = GPIO_DT_SPEC_GET(DT_ALIAS(pq_light), gpios);
#else
#error "No frontlight (zephyr,user pwms \"light\") and no pq-light alias"
#endif

static struct ui_scene scene;
static void light_off(struct k_work *w);
static K_WORK_DELAYABLE_DEFINE(light_off_work, light_off); /* static: safe from any early caller */

#if IS_ENABLED(CONFIG_PQ_HAVE_DISPLAY)
static const struct device *const lcd = DEVICE_DT_GET(DT_CHOSEN(zephyr_display));
static uint8_t fb[UI_FB_SIZE];
#if DT_NODE_HAS_PROP(USER, lcd_disp_gpios)
static const struct gpio_dt_spec disp = GPIO_DT_SPEC_GET(USER, lcd_disp_gpios);
#endif
#endif

static void light_set(bool on) {
#if LIGHT_PWM
  (void)pwm_set_dt(&light, light.period, on ? (light.period / 100) * LIGHT_DUTY_PERCENT : 0);
#else
  (void)gpio_pin_set_dt(&light_led, on);
#endif
}

static void light_off(struct k_work *w) {
  ARG_UNUSED(w);
  light_set(false);
}

static void refresh(void) {
#if IS_ENABLED(CONFIG_PQ_HAVE_DISPLAY)
  ui_render(fb, &scene);
  struct display_buffer_descriptor d = {.buf_size = sizeof(fb), .width = UI_W, .height = UI_H, .pitch = UI_W};
  int rc = display_write(lcd, 0, 0, &d, fb);
  if (rc) {
    LOG_ERR("display_write %d", rc);
  }
#else
  /* No panel: say what it would show. */
  const struct pq_view *v = &scene.view;
  if (scene.notice[0]) {
    LOG_INF("SCREEN notice: %s %s", scene.notice[0], scene.notice[1] ? scene.notice[1] : "");
  } else if (scene.pair[0]) {
    LOG_INF("SCREEN Pair %s", scene.pair);
  } else if (!v->link) {
    LOG_INF("SCREEN NO LINK");
  } else if (!v->sign) {
    LOG_INF("SCREEN - %s", v->nokey ? "(no key)" : "");
  } else {
    LOG_INF("SCREEN CALL sign %s | %s | %s", v->sign, v->nwords > 0 ? v->words[0] : "", v->nwords > 1 ? v->words[1] : "");
  }
#endif
}

int ui_init(void) {
#if LIGHT_PWM
  if (!pwm_is_ready_dt(&light)) {
    return -ENODEV;
  }
#else
  if (!gpio_is_ready_dt(&light_led) || gpio_pin_configure_dt(&light_led, GPIO_OUTPUT_INACTIVE)) {
    return -ENODEV;
  }
#endif
  light_set(false);
  memset(&scene, 0, sizeof(scene));
#if IS_ENABLED(CONFIG_PQ_HAVE_DISPLAY)
  if (!device_is_ready(lcd)) {
    LOG_ERR("display not ready");
    if (IS_ENABLED(CONFIG_PQ_BRINGUP)) {
      bringup_lcd(false);
    }
    return -ENODEV;
  }
  /* The ls0xx driver has already sent the all-clear at its init.  Draw the first picture into panel memory, and only
   * then raise DISP so the panel never shows power-on garbage. */
  refresh();
#if DT_NODE_HAS_PROP(USER, lcd_disp_gpios)
  if (!gpio_is_ready_dt(&disp) || gpio_pin_configure_dt(&disp, GPIO_OUTPUT_ACTIVE)) {
    if (IS_ENABLED(CONFIG_PQ_BRINGUP)) {
      bringup_lcd(false);
    }
    return -ENODEV;
  }
#endif
  if (IS_ENABLED(CONFIG_PQ_BRINGUP)) {
    bringup_lcd(true);
  }
#else
  LOG_WRN("no display: STUB, the screen is described in the log");
#endif
  return 0;
}

void ui_show(const struct pq_view *v) {
  scene.view = *v;
  refresh();
}

void ui_set_pair_code(uint32_t code) {
  if (code) {
    snprintf(scene.pair, sizeof(scene.pair), "%06u", (unsigned)(code % 1000000u));
  } else {
    scene.pair[0] = 0;
  }
  refresh();
}

void ui_notice(const char *a, const char *b) {
  scene.notice[0] = a;
  scene.notice[1] = b;
  refresh();
}

void ui_notice_clear(void) {
  scene.notice[0] = scene.notice[1] = NULL;
  refresh();
}

void ui_light(void) {
  light_set(true);
  k_work_reschedule(&light_off_work, K_MSEC(LIGHT_ON_MS));
}
