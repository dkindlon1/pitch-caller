/*
 * app_glue.c - binds the portable core (struct pq_io) to the hardware modules and runs it.
 *
 * ONE THREAD touches the core: everything (writes, connect/disconnect, buttons, the 1 s tick) is queued by app_post() and
 * handled on the system work queue, so the core needs no locking and its callbacks (draw, buzz, notify) may block briefly.
 *
 * Also here: the button gestures, the battery receipts, the low-battery shutdown, the idle policy hook and the MCUboot
 * image confirmation.
 *
 * Firmware update and rollback: images are written to slot 1 by mcumgr over the bonded Bluetooth link.  MCUboot swaps them
 * (swap-using-move) at the next reset as a TEST: the new image is not permanent until it calls boot_write_img_confirmed().
 * This file calls it only when the image has run 15 s and its own start-up (screen, Bluetooth advertising) all worked.  If
 * the new image crashes, hangs or cannot start Bluetooth, nobody confirms it, and the next reset (the 8 s watchdog resets a hung
 * image by itself; otherwise the button hold reset of the nPM1300 or a power cycle) makes MCUboot swap the old image back.
 */
#include <stdio.h>
#include <string.h>

#include <zephyr/dfu/mcuboot.h>
#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/watchdog.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include "pq_app.h"
#include "pq_core.h"

LOG_MODULE_REGISTER(glue, LOG_LEVEL_INF);

#define TICK_MS 1000
#define BATTERY_MS 60000
#define CONFIRM_AFTER_MS 15000
#define NOTICE_MS 3000

K_MSGQ_DEFINE(evt_q, sizeof(struct app_evt), 16, 4);

static struct pq_core core;
static struct pq_io core_io;
static atomic_t glue_ready; /* the core is initialised: events queued earlier wait until then (firmware review 7) */

/* All work items are defined statically so no interrupt, callback or early event can submit an uninitialised one. */
static void drain(struct k_work *w);
static void tick(struct k_work *w);
static void hold_fired(struct k_work *w);
static void notice_done(struct k_work *w);
#if defined(CONFIG_PQ_LOW_BATTERY_PCT)
static void lowbat_fired(struct k_work *w);
#endif
static K_WORK_DEFINE(evt_work, drain);
static K_WORK_DELAYABLE_DEFINE(tick_work, tick);
static K_WORK_DELAYABLE_DEFINE(hold_work, hold_fired);
static K_WORK_DELAYABLE_DEFINE(notice_work, notice_done);
#if defined(CONFIG_PQ_LOW_BATTERY_PCT)
static K_WORK_DELAYABLE_DEFINE(lowbat_work, lowbat_fired);
#endif
static atomic_t dropped;
static bool need_battery; /* the coach's app is subscribed by its first write: answer it with a battery receipt */
static uint32_t since_battery;
static bool healthy;
static bool confirmed;
static bool identity_warned;
static bool was_idle;
#if defined(CONFIG_PQ_LOW_BATTERY_PCT)
static uint8_t low_count;
#endif

/* ------------------------------------------------------------------------------------------ watchdog */

#define WDT_TIMEOUT_MS 8000
#if DT_NODE_HAS_STATUS_OKAY(DT_ALIAS(watchdog0))
static const struct device *const wdt = DEVICE_DT_GET(DT_ALIAS(watchdog0));
static int wdt_chan = -1;

/* Called first thing in main().  Fed from tick() on the system work queue: a hung work queue (the thread that runs the core,
 * the radio callbacks' consumer and mcumgr's confirm) lets it expire and the chip resets (firmware review 2). */
void app_wdt_init(void) {
  if (!device_is_ready(wdt)) {
    LOG_ERR("watchdog not ready");
    return;
  }
  struct wdt_timeout_cfg cfg = {
      .window = {.min = 0, .max = WDT_TIMEOUT_MS},
      .callback = NULL,
      .flags = WDT_FLAG_RESET_SOC,
  };
  wdt_chan = wdt_install_timeout(wdt, &cfg);
  if (wdt_chan < 0 || wdt_setup(wdt, WDT_OPT_PAUSE_HALTED_BY_DBG)) {
    LOG_ERR("watchdog setup failed (%d)", wdt_chan);
    wdt_chan = -1;
    return;
  }
  LOG_INF("watchdog armed: %d ms", WDT_TIMEOUT_MS);
}
static void wdt_kick(void) {
  if (wdt_chan >= 0) {
    (void)wdt_feed(wdt, wdt_chan);
  }
}
/* Also fed by pq_i2c_recover() after every failed I2C try: the boot-time I2C set-up (charger registers, accelerometer) can take
 * longer than 8 s when the bus is stuck (each access is 3 tries with a bus recovery between, and there are about 15 of them),
 * and a stuck bus must not turn into a reset loop.  Every one of those loops is bounded, so a real hang still trips the dog. */
void app_wdt_feed(void) {
  wdt_kick();
}
#else
void app_wdt_init(void) {}
void app_wdt_feed(void) {}
static void wdt_kick(void) {}
#endif

/* ------------------------------------------------------------------------------------------ io for the core */

static void io_draw(void *u, const struct pq_view *v) {
  ARG_UNUSED(u);
  ui_show(v);
}
static void io_buzz(void *u, enum pq_buzz_kind k) {
  ARG_UNUSED(u);
  haptics_buzz(k);
}
static void io_light(void *u) {
  ARG_UNUSED(u);
  ui_light();
}
static void io_notify(void *u, const uint8_t *b, size_t n) {
  ARG_UNUSED(u);
  /* Receipts go only to a secure link: nothing is sent to a peer that is not the paired coach. */
  if (ble_pq_link_secure()) {
    (void)ble_pq_notify(b, n);
  }
}
static uint64_t io_now(void *u) {
  ARG_UNUSED(u);
  return (uint64_t)k_uptime_get();
}
static bool io_secure(void *u) {
  ARG_UNUSED(u);
  return ble_pq_link_secure();
}

/* ------------------------------------------------------------------------------------------ battery */

static void battery_report(bool send) {
  struct power_status p;
  if (power_sample(&p) || !p.valid) {
    LOG_WRN("battery not readable");
    return;
  }
  ble_pq_battery_level(p.pct);
  LOG_INF("battery %u mV %u %%%s%s%s", p.mv, p.pct, p.charging ? " charging" : "", p.vbus ? " vbus" : "", p.stub ? " (STUB)" : "");
  if (send) {
    char t[8];
    int n = snprintf(t, sizeof(t), "B%u", p.pct);
    io_notify(NULL, (const uint8_t *)t, (size_t)n);
  }
#if defined(CONFIG_PQ_LOW_BATTERY_PCT)
  if (!p.stub && !p.charging && !p.vbus && p.pct <= CONFIG_PQ_LOW_BATTERY_PCT) {
    if (++low_count >= 3) { /* three readings in a row, a minute apart: not a load dip */
      LOG_ERR("battery empty: shutting down");
      ui_notice("LOW", "BATTERY");
      /* Not k_sleep(): that would block the system work queue (events, notify, mcumgr, the tick) for 2 s. */
      k_work_schedule(&lowbat_work, K_SECONDS(2));
    }
  } else {
    low_count = 0;
  }
#endif
}

#if defined(CONFIG_PQ_LOW_BATTERY_PCT)
static void lowbat_fired(struct k_work *w) {
  ARG_UNUSED(w);
  power_ship();
}
#endif

/* ------------------------------------------------------------------------------------------ policy hook */

/* Called when the wrist has been still for 30 s (idle = true) and when it moves again.  v1 only logs; a power policy
 * (dim the panel, slow the connection interval) would go here.  Override by defining it elsewhere. */
__weak void pq_policy_idle_changed(bool idle) {
  LOG_INF("idle policy hook: %s", idle ? "idle" : "active");
}

/* ------------------------------------------------------------------------------------------ work */

#define STABLE_AFTER_MS 60000 /* a boot that survives this long is not part of a fatal-error loop (main.c) */

static void tick(struct k_work *w) {
  ARG_UNUSED(w);
  wdt_kick();
  if (k_uptime_get() > STABLE_AFTER_MS) {
    app_boot_stable();
  }
  pq_core_tick(&core);

  since_battery += TICK_MS;
  if (since_battery >= BATTERY_MS) {
    since_battery = 0;
    battery_report(ble_pq_connected());
  }

  bool idle = sensors_idle();
  if (idle != was_idle) {
    was_idle = idle;
    pq_policy_idle_changed(idle);
  }

  if (!confirmed && healthy && k_uptime_get() > CONFIRM_AFTER_MS && (ble_pq_adv_running() || ble_pq_connected())) {
    /* Board identity (QA review 6): the PMIC and the accelerometer must answer on the bus.  A wrong-board image (the DK
     * image on a watch, a watch image on other hardware) is not confirmed and MCUboot reverts it at the next reset. */
    if (!power_identity_ok() || !sensors_identity_ok()) {
      if (!identity_warned) {
        identity_warned = true;
        LOG_ERR("board identity check failed: image NOT confirmed");
      }
    } else {
      int rc = boot_write_img_confirmed();
      LOG_INF("image confirmed: %d", rc);
      confirmed = rc == 0 || rc == -EALREADY;
    }
  }
  k_work_schedule(&tick_work, K_MSEC(TICK_MS));
}

static void hold_fired(struct k_work *w) {
  ARG_UNUSED(w);
  LOG_WRN("button held: forgetting the pairing");
  ble_pq_clear_bonds();
  /* End the session AND the key: the core has no separate wipe call, so re-initialise it (memset, key gone) and redraw. */
  pq_core_init(&core, &core_io);
  struct pq_view v;
  pq_core_view(&core, &v);
  ui_show(&v);
  ui_notice("PAIRING", "CLEARED");
  haptics_buzz(PQ_BUZZ_CHANGED);
  k_work_reschedule(&notice_work, K_MSEC(NOTICE_MS));
}

static void notice_done(struct k_work *w) {
  ARG_UNUSED(w);
  ui_notice_clear();
}

static void handle(const struct app_evt *e) {
  switch (e->type) {
  case EVT_WRITE:
    pq_core_on_write(&core, e->data, e->len);
    if (need_battery) {
      need_battery = false;
      battery_report(true);
    }
    break;
  case EVT_CONNECTED:
    pq_core_on_connect(&core);
    need_battery = true;
    since_battery = 0;
    break;
  case EVT_DISCONNECTED:
    pq_core_on_disconnect(&core);
    need_battery = false;
    break;
  case EVT_SECURITY:
    break;
  case EVT_PASSKEY:
    ui_set_pair_code(e->value);
    ui_light();
    break;
  case EVT_PAIR_END:
    ui_set_pair_code(0);
    break;
  case EVT_BTN_PRESS:
    ui_light();
    k_work_reschedule(&hold_work, K_MSEC(CONFIG_PQ_BOND_CLEAR_HOLD_MS));
    break;
  case EVT_BTN_RELEASE:
    (void)k_work_cancel_delayable(&hold_work);
    break;
  case EVT_CHARGER:
    battery_report(ble_pq_connected());
    break;
  case EVT_MOTION:
    if (IS_ENABLED(CONFIG_PQ_LIGHT_ON_MOTION)) {
      ui_light();
    }
    break;
  default:
    break;
  }
}

static void drain(struct k_work *w) {
  ARG_UNUSED(w);
  if (!atomic_get(&glue_ready)) {
    return; /* app_glue_init() submits this item again once the core exists; the events stay queued */
  }
  struct app_evt e;
  while (k_msgq_get(&evt_q, &e, K_NO_WAIT) == 0) {
    handle(&e);
  }
}

void app_post(const struct app_evt *e) {
  if (k_msgq_put(&evt_q, e, K_NO_WAIT)) {
    atomic_inc(&dropped);
    LOG_WRN("event %u dropped (queue full)", e->type);
    return;
  }
  k_work_submit(&evt_work);
}

/* Called by main() once the other modules are up, before Bluetooth starts. */
void app_glue_init(void) {
  struct pq_io io = {
      .user = NULL,
      .draw = io_draw,
      .buzz = io_buzz,
      .light = io_light,
      .notify = io_notify,
      .now_ms = io_now,
      .secure = io_secure,
  };
  core_io = io;
  pq_core_init(&core, &io);
  struct pq_view v;
  pq_core_view(&core, &v);
  ui_show(&v);
  battery_report(false);
  atomic_set(&glue_ready, 1);
  k_work_submit(&evt_work); /* events that arrived during start-up */
  k_work_schedule(&tick_work, K_MSEC(TICK_MS));
}

/* Called by main() at the end of start-up: the image may be confirmed only if everything essential worked. */
void app_glue_set_healthy(bool ok) {
  healthy = ok;
}
