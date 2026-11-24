/*
 * pq_app.h - the small interfaces between the modules.  Every hardware module has a stub path for the nRF52840 DK
 * (selected by the PQ_HAVE_* Kconfig symbols, which follow the devicetree), so the same app_glue.c runs on both boards.
 */
#ifndef PQ_APP_H
#define PQ_APP_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <errno.h>

#include "pq_core.h"

/* ---- events: everything that touches the core goes through one queue and one thread (app_glue.c) ---- */
enum app_evt_type {
  EVT_WRITE,        /* data from the coach's app (RX characteristic) */
  EVT_CONNECTED,
  EVT_DISCONNECTED,
  EVT_SECURITY,     /* the link's security or bond state changed */
  EVT_PASSKEY,      /* show this passkey (value) */
  EVT_PAIR_END,     /* pairing finished or failed: stop showing the passkey */
  EVT_BTN_PRESS,
  EVT_BTN_RELEASE,
  EVT_CHARGER,      /* charger or USB state changed: send a fresh battery receipt */
  EVT_MOTION,
};

struct app_evt {
  uint8_t type;
  uint8_t len;
  uint32_t value;
  uint8_t data[20];
};

/* Safe from any thread or from an ISR-deferred context; drops the event (and counts it) if the queue is full. */
void app_post(const struct app_evt *e);

/* ---- ble_pq.c ---- */
int ble_pq_init(void);
bool ble_pq_link_secure(void);   /* encrypted, LE Secure Connections authenticated, bonded */
bool ble_pq_connected(void);
bool ble_pq_bonded(void);        /* at least one bond is stored */
bool ble_pq_adv_running(void);
int ble_pq_notify(const uint8_t *data, size_t len); /* TX characteristic */
void ble_pq_clear_bonds(void);
void ble_pq_battery_level(uint8_t pct);             /* standard Battery Service */

/* ---- ui.c ---- */
int ui_init(void);
void ui_show(const struct pq_view *v);  /* redraw with this call state (also remembers it) */
void ui_set_pair_code(uint32_t code);   /* 0 = none; redraws */
void ui_notice(const char *a, const char *b); /* takes the screen over until ui_notice_clear() */
void ui_notice_clear(void);
void ui_light(void);                    /* frontlight on for a few seconds */

/* ---- haptics.c ---- */
int haptics_init(void);
void haptics_buzz(enum pq_buzz_kind kind); /* returns at once; the motor is run from a k_work */
void haptics_buzz_ms(uint16_t ms);         /* bring-up only (CONFIG_PQ_BRINGUP): one buzz of this length, same motor path */

/* ---- power.c ---- */
struct power_status {
  bool valid;
  bool stub;
  bool charging;
  bool vbus;
  uint16_t mv;
  uint8_t pct;
  int16_t temp_c10; /* battery temperature, tenths of a degree C; INT16_MIN = unknown */
};
int power_init(void);
int power_sample(struct power_status *out); /* reads the chip now */
uint16_t power_vsys_mv_estimate(void);      /* about 5000 docked, else last battery mV (4200 if unknown) */
bool power_identity_ok(void);               /* the PMIC answers on the bus (DK: true) */
void power_ship(void);                      /* low-battery / commanded shutdown: does not return on hardware */

/* ---- sensors.c ---- */
int sensors_init(void);
bool sensors_idle(void);                    /* no motion for a while (idle power policy input) */
bool sensors_identity_ok(void);             /* accelerometer WHO_AM_I answers 0x33 (DK: true) */

/* ---- bringup.c (compiled only with CONFIG_PQ_BRINGUP; every call site is guarded by IS_ENABLED) ---- */
void bringup_boot(bool have_cause, uint32_t cause); /* boot line; call once, early in main() */
void bringup_start(void);                           /* start the periodic logs and the 3 s motor buzz */
void bringup_lcd(bool ok);                          /* "LCD init ok/failed" */
void bringup_passkey(uint32_t passkey);             /* log the pairing passkey */
void bringup_button_short(void);                    /* short press: buzz 300 ms */

/* ---- main.c / app_glue.c ---- */
void app_wdt_feed(void);   /* feed the watchdog (no-op until it is armed) */
void app_boot_stable(void); /* the image has run long enough: forget the fatal-error count (main.c) */

/* ---- i2c_util.c: retry with bus recovery (QA review 4/10) ---- */
/* Recover the shared I2C bus (the driver clocks SCL until SDA is released); 0 if done or nothing to recover. */
int pq_i2c_recover(void);
/* Evaluate expr (an I2C transfer returning 0 or -errno) up to 3 times, recovering the bus after each failed try. */
#define PQ_I2C_RETRY(expr)                                                                                                 \
  ({                                                                                                                       \
    int _rc = -EIO;                                                                                                        \
    for (int _try = 0; _try < 3; _try++) {                                                                                 \
      _rc = (expr);                                                                                                        \
      if (_rc == 0) {                                                                                                      \
        break;                                                                                                             \
      }                                                                                                                    \
      (void)pq_i2c_recover();                                                                                              \
    }                                                                                                                      \
    _rc;                                                                                                                   \
  })

#endif
