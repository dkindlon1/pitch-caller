/*
 * ble_pq.c - the Bluetooth side: the PitchIQ GATT service, pairing and bonding, advertising, and the standard Battery
 * service (from Zephyr).  Rev C has no heart-rate sensor, so there is no Heart Rate Service.
 *
 * Service (same UUIDs as watch/bangle/pitchiq.app.js):
 *   7a1d0001-... service
 *   7a1d0002-... RX  write and write-without-response, up to 20 bytes, needs an encrypted AND authenticated link
 *   7a1d0003-... TX  read + notify, up to 20 bytes (receipts to the coach: K<id>, P, A<n>, B<pct>)
 *
 * Security: LE Secure Connections only, bondable, MITM protected: the watch is a "display only" device, so Zephyr makes the
 * phone ask for a 6-digit passkey that this file hands to the UI (a random one, new for every pairing).  After the first
 * bond the filter accept list is filled with the bonded peers and advertising only accepts connections from them.
 * Clearing the bond (button hold, app_glue.c) empties the list and reopens advertising.
 * ASSUMPTION: a phone/laptop that pairs with a random private address is matched by the controller through the resolving
 * list (CONFIG_BT_PRIVACY); only a test with the real coach app can show it.
 *
 * Nothing here talks to the pq core: events go to app_glue.c through app_post().
 */
#include <stdio.h>
#include <string.h>

#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/hci.h>
#include <zephyr/bluetooth/services/bas.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/net_buf.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/settings/settings.h>
#if IS_ENABLED(CONFIG_MCUMGR_MGMT_NOTIFICATION_HOOKS)
#include <zephyr/mgmt/mcumgr/mgmt/callbacks.h>
#endif

#include "pq_app.h"

LOG_MODULE_REGISTER(ble_pq, LOG_LEVEL_INF);

#define PQ_UUID_SVC BT_UUID_128_ENCODE(0x7a1d0001, 0x5c3e, 0x4b8f, 0x9a62, 0x2f0c8e4d1b70)
#define PQ_UUID_RX BT_UUID_128_ENCODE(0x7a1d0002, 0x5c3e, 0x4b8f, 0x9a62, 0x2f0c8e4d1b70)
#define PQ_UUID_TX BT_UUID_128_ENCODE(0x7a1d0003, 0x5c3e, 0x4b8f, 0x9a62, 0x2f0c8e4d1b70)
#define PQ_MAX_LEN 20

static struct bt_uuid_128 svc_uuid = BT_UUID_INIT_128(PQ_UUID_SVC);
static struct bt_uuid_128 rx_uuid = BT_UUID_INIT_128(PQ_UUID_RX);
static struct bt_uuid_128 tx_uuid = BT_UUID_INIT_128(PQ_UUID_TX);

static struct bt_conn *conn;      /* the one connection (CONFIG_BT_MAX_CONN=1) */
static atomic_t secure_flag;
static atomic_t adv_flag;
static bool tx_notify_on;
static uint8_t tx_val[PQ_MAX_LEN];
static uint8_t tx_len;
static char dev_name[24];
static void adv_work_fn(struct k_work *w);
static K_WORK_DELAYABLE_DEFINE(adv_work, adv_work_fn); /* static: no uninitialised use (firmware review 7) */
static void rssi_work_fn(struct k_work *w);
static K_WORK_DELAYABLE_DEFINE(rssi_work, rssi_work_fn);
#define RSSI_LOG_MS 10000

/* ------------------------------------------------------------------------------------------ GATT */

static ssize_t rx_write(struct bt_conn *c, const struct bt_gatt_attr *attr, const void *buf, uint16_t len, uint16_t offset,
                        uint8_t flags) {
  ARG_UNUSED(c);
  ARG_UNUSED(attr);
  ARG_UNUSED(flags);
  if (offset != 0) {
    return BT_GATT_ERR(BT_ATT_ERR_INVALID_OFFSET);
  }
  if (len > PQ_MAX_LEN) {
    return BT_GATT_ERR(BT_ATT_ERR_INVALID_ATTRIBUTE_LEN);
  }
  struct app_evt e = {.type = EVT_WRITE, .len = (uint8_t)len};
  memcpy(e.data, buf, len);
  app_post(&e);
  return len;
}

static ssize_t tx_read(struct bt_conn *c, const struct bt_gatt_attr *attr, void *buf, uint16_t len, uint16_t offset) {
  ARG_UNUSED(c);
  return bt_gatt_attr_read(c, attr, buf, len, offset, tx_val, tx_len);
}

static void tx_ccc_changed(const struct bt_gatt_attr *attr, uint16_t value) {
  ARG_UNUSED(attr);
  tx_notify_on = value == BT_GATT_CCC_NOTIFY;
}

/* RX write, TX read and the TX CCC all need an encrypted and authenticated link (passkey, LESC): an unbonded peer can neither
 * read sealed frames nor subscribe (firmware review 4).  Receipts are in addition only sent on a secure link (app_glue.c). */
BT_GATT_SERVICE_DEFINE(pq_svc, BT_GATT_PRIMARY_SERVICE(&svc_uuid),
                       BT_GATT_CHARACTERISTIC(&rx_uuid.uuid, BT_GATT_CHRC_WRITE | BT_GATT_CHRC_WRITE_WITHOUT_RESP,
                                              BT_GATT_PERM_WRITE_AUTHEN, NULL, rx_write, NULL),
                       BT_GATT_CHARACTERISTIC(&tx_uuid.uuid, BT_GATT_CHRC_READ | BT_GATT_CHRC_NOTIFY, BT_GATT_PERM_READ_AUTHEN,
                                              tx_read, NULL, NULL),
                       BT_GATT_CCC(tx_ccc_changed, BT_GATT_PERM_READ_AUTHEN | BT_GATT_PERM_WRITE_AUTHEN));

int ble_pq_notify(const uint8_t *data, size_t len) {
  if (len > PQ_MAX_LEN) {
    len = PQ_MAX_LEN;
  }
  memcpy(tx_val, data, len);
  tx_len = (uint8_t)len;
  if (!conn || !tx_notify_on) {
    return -ENOTCONN;
  }
  return bt_gatt_notify_uuid(conn, &tx_uuid.uuid, pq_svc.attrs, tx_val, tx_len);
}

void ble_pq_battery_level(uint8_t pct) {
  (void)bt_bas_set_battery_level(pct);
}

/* ------------------------------------------------------------------------------------------ bonds and advertising */

static void count_bond(const struct bt_bond_info *info, void *user) {
  ARG_UNUSED(info);
  (*(int *)user)++;
}

bool ble_pq_bonded(void) {
  int n = 0;
  bt_foreach_bond(BT_ID_DEFAULT, count_bond, &n);
  return n > 0;
}

static void add_to_accept_list(const struct bt_bond_info *info, void *user) {
  ARG_UNUSED(user);
  int rc = bt_le_filter_accept_list_add(&info->addr);
  if (rc) {
    LOG_ERR("accept list add: %d", rc);
  }
}

static void adv_start(void) {
  uint32_t opts = BT_LE_ADV_OPT_CONN;
  int rc;

  (void)bt_le_adv_stop();
  atomic_clear(&adv_flag);

  /* Once there is a bond only bonded peers may connect: the accept list holds them and the advertiser filters on it. */
  (void)bt_le_filter_accept_list_clear();
  if (ble_pq_bonded()) {
    bt_foreach_bond(BT_ID_DEFAULT, add_to_accept_list, NULL);
    opts |= BT_LE_ADV_OPT_FILTER_CONN;
  }

  const struct bt_data ad[] = {
      BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
      BT_DATA(BT_DATA_NAME_COMPLETE, dev_name, strlen(dev_name)),
  };
  const struct bt_data sd[] = {
      BT_DATA_BYTES(BT_DATA_UUID128_ALL, PQ_UUID_SVC),
  };
  rc = bt_le_adv_start(BT_LE_ADV_PARAM(opts, BT_GAP_ADV_FAST_INT_MIN_2, BT_GAP_ADV_FAST_INT_MAX_2, NULL), ad,
                       ARRAY_SIZE(ad), sd, ARRAY_SIZE(sd));
  if (rc) {
    LOG_ERR("advertising failed: %d (retrying)", rc);
    k_work_schedule(&adv_work, K_SECONDS(2));
    return;
  }
  atomic_set(&adv_flag, 1);
  LOG_INF("advertising as \"%s\"%s", dev_name, (opts & BT_LE_ADV_OPT_FILTER_CONN) ? " (bonded peers only)" : "");
}

static void adv_work_fn(struct k_work *w) {
  ARG_UNUSED(w);
  adv_start();
}

bool ble_pq_adv_running(void) {
  return atomic_get(&adv_flag) != 0;
}

void ble_pq_clear_bonds(void) {
  int rc = bt_unpair(BT_ID_DEFAULT, BT_ADDR_LE_ANY);
  LOG_WRN("bonds cleared: %d", rc);
  atomic_clear(&secure_flag);
  if (conn) {
    (void)bt_conn_disconnect(conn, BT_HCI_ERR_REMOTE_USER_TERM_CONN);
  }
  k_work_schedule(&adv_work, K_MSEC(200));
}

/* ------------------------------------------------------------------------------------------ connection and pairing */

static void update_secure(struct bt_conn *c) {
  bool s = bt_conn_get_security(c) >= BT_SECURITY_L4 && bt_le_bond_exists(BT_ID_DEFAULT, bt_conn_get_dst(c));
  atomic_set(&secure_flag, s);
}

bool ble_pq_link_secure(void) {
  return atomic_get(&secure_flag) != 0;
}

bool ble_pq_connected(void) {
  return conn != NULL;
}

static void on_connected(struct bt_conn *c, uint8_t err) {
  if (err) {
    LOG_ERR("connect failed: 0x%02x", err);
    k_work_schedule(&adv_work, K_MSEC(100)); /* a failed connect must not leave the watch deaf (firmware review 5) */
    return;
  }
  if (conn) {
    return;
  }
  conn = bt_conn_ref(c);
  k_work_schedule(&rssi_work, K_MSEC(RSSI_LOG_MS));
  atomic_clear(&adv_flag);
  /* 20 ms connection interval, no latency, 6 s supervision timeout (RF review 6; matches CONFIG_BT_PERIPHERAL_PREF_*).
   * No PHY is requested: 1M only (CONFIG_BT_CTLR_PHY_2M=n). */
  (void)bt_conn_le_param_update(c, BT_LE_CONN_PARAM(16, 16, 0, 600));
  /* Ask for the secure link right away: a bonded phone encrypts with its stored key, a new one starts pairing and the
   * passkey shows on the screen. */
  (void)bt_conn_set_security(c, BT_SECURITY_L4);
  struct app_evt e = {.type = EVT_CONNECTED};
  app_post(&e);
  LOG_INF("connected");
}

static void on_disconnected(struct bt_conn *c, uint8_t reason) {
  /* Restart advertising on EVERY disconnect, including one for a connection this file never took (firmware review 5). */
  k_work_schedule(&adv_work, K_MSEC(100));
  if (c != conn) {
    return;
  }
  (void)k_work_cancel_delayable(&rssi_work);
  LOG_INF("disconnected (0x%02x)", reason);
  atomic_clear(&secure_flag);
  tx_notify_on = false;
  bt_conn_unref(conn);
  conn = NULL;
  struct app_evt e = {.type = EVT_DISCONNECTED};
  app_post(&e);
}

/* Connection RSSI every 10 s (RF review 8): the standard HCI Read RSSI against the controller's CONFIG_BT_CTLR_CONN_RSSI. */
static void rssi_work_fn(struct k_work *w) {
  ARG_UNUSED(w);
  if (!conn) {
    return;
  }
#if IS_ENABLED(CONFIG_BT_CTLR_CONN_RSSI)
  uint16_t handle;
  struct net_buf *buf = bt_hci_cmd_alloc(K_MSEC(100));
  struct net_buf *rsp = NULL;
  if (buf && bt_hci_get_conn_handle(conn, &handle) == 0) {
    struct bt_hci_cp_read_rssi *cp = net_buf_add(buf, sizeof(*cp));
    cp->handle = sys_cpu_to_le16(handle);
    if (bt_hci_cmd_send_sync(BT_HCI_OP_READ_RSSI, buf, &rsp) == 0 && rsp) {
      struct bt_hci_rp_read_rssi *rp = (void *)rsp->data;
      LOG_INF("connection RSSI %d dBm", rp->rssi);
      net_buf_unref(rsp);
    }
  } else if (buf) {
    net_buf_unref(buf);
  }
#endif
  k_work_schedule(&rssi_work, K_MSEC(RSSI_LOG_MS));
}

static void on_security(struct bt_conn *c, bt_security_t level, enum bt_security_err err) {
  if (c != conn) {
    return;
  }
  LOG_INF("security level %d err %d", level, err);
  update_secure(c);
  struct app_evt e = {.type = EVT_SECURITY};
  app_post(&e);
}

BT_CONN_CB_DEFINE(conn_cb) = {
    .connected = on_connected,
    .disconnected = on_disconnected,
    .security_changed = on_security,
};

static void passkey_display(struct bt_conn *c, unsigned int passkey) {
  ARG_UNUSED(c);
  struct app_evt e = {.type = EVT_PASSKEY, .value = passkey};
  app_post(&e);
  LOG_INF("passkey for pairing is on the screen");
}

static void pair_cancel(struct bt_conn *c) {
  ARG_UNUSED(c);
  struct app_evt e = {.type = EVT_PAIR_END};
  app_post(&e);
}

static struct bt_conn_auth_cb auth_cb = {
    .passkey_display = passkey_display,
    .cancel = pair_cancel,
};

static void pairing_complete(struct bt_conn *c, bool bonded) {
  LOG_INF("pairing complete, bonded %d", bonded);
  update_secure(c);
  struct app_evt e = {.type = EVT_PAIR_END};
  app_post(&e);
  e.type = EVT_SECURITY;
  app_post(&e);
}

static void pairing_failed(struct bt_conn *c, enum bt_security_err reason) {
  ARG_UNUSED(c);
  LOG_WRN("pairing failed: %d", reason);
  struct app_evt e = {.type = EVT_PAIR_END};
  app_post(&e);
}

static struct bt_conn_auth_info_cb auth_info_cb = {
    .pairing_complete = pairing_complete,
    .pairing_failed = pairing_failed,
};

/* ------------------------------------------------------------------------------------------ firmware update guard */

#if IS_ENABLED(CONFIG_MCUMGR_MGMT_NOTIFICATION_HOOKS)
/* mcumgr's Bluetooth service already needs an encrypted, authenticated link (CONFIG_MCUMGR_TRANSPORT_BT_PERM_RW_AUTHEN).
 * This hook adds "and bonded": every SMP command is refused unless the link is secure in the sense of ble_pq_link_secure(). */
static enum mgmt_cb_return smp_guard(uint32_t event, enum mgmt_cb_return prev, int32_t *rc, uint16_t *group, bool *abort_more,
                                     void *data, size_t data_size) {
  ARG_UNUSED(event);
  ARG_UNUSED(prev);
  ARG_UNUSED(group);
  ARG_UNUSED(data);
  ARG_UNUSED(data_size);
  if (ble_pq_link_secure()) {
    return MGMT_CB_OK;
  }
  *rc = MGMT_ERR_EACCESSDENIED;
  *abort_more = true;
  return MGMT_CB_ERROR_RC;
}
static struct mgmt_callback smp_guard_cb = {.callback = smp_guard, .event_id = MGMT_EVT_OP_CMD_RECV};
#endif

/* ------------------------------------------------------------------------------------------ init */

int ble_pq_init(void) {
  int rc = bt_conn_auth_cb_register(&auth_cb);
  if (rc) {
    return rc;
  }
  rc = bt_conn_auth_info_cb_register(&auth_info_cb);
  if (rc) {
    return rc;
  }
  rc = bt_enable(NULL);
  if (rc) {
    LOG_ERR("bt_enable: %d", rc);
    return rc;
  }
  if (IS_ENABLED(CONFIG_SETTINGS)) {
    rc = settings_load(); /* the bonds */
    if (rc) {
      LOG_ERR("settings_load: %d", rc);
    }
    /* Bring-up check (firmware review 1): pair, reset, and this count must still be 1.  Backend: NVS, see prj.conf. */
    int nb = 0;
    bt_foreach_bond(BT_ID_DEFAULT, count_bond, &nb);
    LOG_INF("settings loaded (%s): %d bond(s)", IS_ENABLED(CONFIG_SETTINGS_NVS) ? "NVS" : "NO PERSISTENT BACKEND", nb);
  }

  /* "PitchIQ" + the last 4 hex digits of the address, so two watches can be told apart in the chooser. */
  bt_addr_le_t addrs[CONFIG_BT_ID_MAX];
  size_t count = ARRAY_SIZE(addrs);
  bt_id_get(addrs, &count);
  if (count) {
    snprintf(dev_name, sizeof(dev_name), "PitchIQ %02X%02X", addrs[0].a.val[1], addrs[0].a.val[0]);
  } else {
    snprintf(dev_name, sizeof(dev_name), "PitchIQ");
  }
  (void)bt_set_name(dev_name);

#if IS_ENABLED(CONFIG_MCUMGR_MGMT_NOTIFICATION_HOOKS)
  mgmt_callback_register(&smp_guard_cb);
#endif
  adv_start();
  return ble_pq_adv_running() ? 0 : -EIO;
}
