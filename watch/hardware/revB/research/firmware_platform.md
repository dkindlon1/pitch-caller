# Firmware platform research: nRF52 / nRF54L15 wrist device

Scope: facts seen on fetched pages only. Every fact has its URL. "NOT FOUND" means the page or file was not reached or did not state it. Access notes are at the end.

Dates: research run 2026-11-23.

---

## 0. Access problems (read first)

- `gh api` on zephyrproject-rtos/zephyr returned HTTP 403 ("GitHub access to this repository is not enabled for this session"). Zephyr files were read with raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/... URLs instead.
- github.com `tree` pages (drivers/display, dts/bindings/accel) are blocked by robots.txt. No directory listing of the Zephyr tree was possible.
- docs.nordicsemi.com/bundle/ncs-latest/page/nrf/index.html is blocked by robots.txt. NCS overview content (what NCS contains, its licence) is NOT FOUND from that URL.
- nordicsemi.com/Products/Development-tools/nRF52840-DK/Download returned a client error. nRF52840 DK price NOT FOUND.
- Several guessed Zephyr binding and driver paths returned 404. Those are listed as NOT FOUND in section 2 rather than guessed.

---

## 1. Platform options

### 1a. Upstream Zephyr RTOS

- Licence: Zephyr LICENSE file is Apache License 2.0. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/LICENSE
- Bluetooth stack description: "Zephyr includes a complete Bluetooth Low Energy stack from application to radio hardware, as well as portions of a Classical Bluetooth (BR/EDR) Host layer." Source: https://docs.zephyrproject.org/latest/services/connectivity/bluetooth/index.html (the older URL https://docs.zephyrproject.org/latest/connectivity/bluetooth/index.html redirects here).
- Qualification page covers the Host only. It calls the host "pre-qualified Bluetooth host stack" and says it "can be qualified using Bluetooth's PTS (Profile Tuning Suite) software." Qualified releases table: v4.4, Design Number Q385945, listing 332380; v4.5, Design Number Q399832, listing 353725. The page says "Last generated: Nov 22, 2026. Last source update: Nov 05, 2026." Source: https://docs.zephyrproject.org/latest/services/connectivity/bluetooth/bluetooth-qual.html
- Qualification page names no SoC or board as qualified. Its only hardware mention is "AutoPTS on Windows 10 with nRF52 board", which is a test setup, not a qualified-platform list. Same URL.
- Controller qualification: NOT FOUND in the Zephyr qualification page. It does not mention the Controller. Same URL.
- Zephyr LE Controller page: "The Nordic Semiconductor Bluetooth Low Energy Controller implementation requires the following hardware peripherals." It lists radio, timers, PPI/DPPI. The radio is described as a "2.4 GHz radio transceiver with multiple radio standards." It names no other SoCs or radios. Open-source status: NOT FOUND on the page. Footprint: NOT FOUND. Qualification: NOT FOUND. Source: https://docs.zephyrproject.org/latest/services/connectivity/bluetooth/bluetooth-ctlr-arch.html
- Left navigation links seen: "LE Controller" (bluetooth-ctlr-arch.html), "Qualification" (bluetooth-qual.html), "LE Host" (bluetooth-le-host.html). Source: https://docs.zephyrproject.org/latest/services/connectivity/bluetooth/index.html
- Minimum footprint of a BLE peripheral in Zephyr: NOT FOUND.
- Supported SoCs for the open-source controller: NOT FOUND beyond the Nordic-peripheral statement above.

### 1b. Nordic nRF Connect SDK (NCS: Zephyr + SoftDevice Controller + nrfxlib)

- Overview page not retrievable (robots). Content of NCS, its licence, and the nRF54L support statement: NOT FOUND from the overview page itself.
- Licence of Nordic-owned parts: the sdk-nrf and sdk-nrfxlib LICENSE files are "LicenseID: LicenseRef-Nordic-5-Clause" (copyright Nordic Semiconductor ASA, 2018). Sources:
  - https://raw.githubusercontent.com/nrfconnect/sdk-nrf/main/LICENSE
  - https://raw.githubusercontent.com/nrfconnect/sdk-nrfxlib/main/LICENSE
- Clause 2: binary redistribution is permitted "except as embedded into a Nordic Semiconductor ASA integrated circuit in a product or a software update for such product". Clause 4: "must only be used with a Nordic Semiconductor ASA integrated circuit." Clause 5: binary "must not be reverse engineered, decompiled, modified and/or disassembled." Same URLs.
- Nordic licence blog (2017): "Most software from Nordic uses this license agreement, including nRF5 SDK and nRF5 BLE SoftDevices." Under the 4- and 5-clause licences "you may only target Nordic Semiconductor microcontrollers with the software." Source: https://devzone.nordicsemi.com/nordic/nordic-blog/b/blog/posts/introducing-nordics-new-software-licensing-schemes
- Qualification, SoftDevice Controller for nRF54L15 (NCS design numbers): the matrix maps NCS versions to Design Numbers. SoftDevice Controller DN per row: NCS 2.8.0 to 2.9.3 = Q331118; NCS 3.2.0 to 3.2.5 = Q380588; NCS 3.0.x, 3.1.x, 3.3.x = "Not listed"; NCS 3.4.0 LTS and 3.4.1 LTS = "Not listed." Host subsystem DNs are also listed per version (e.g. Q322804, Q378879, Q397276). SoftDevice S115/S145 DNs: Q381541 (v9.0.0), Q381345 (v10.0.0, v10.0.1). The page gives no listing dates. Source: https://docs.nordicsemi.com/r/bundle/comp_matrix_nrf54l15/page/comp/nrf54l15/nrf54l15_ble_qdid_qual_matrix.html
- Implication: the qualified-design path for nRF54L15 in this matrix is the SoftDevice Controller / Host DN per NCS version, not a Zephyr-only controller listing. Whether a given NCS 3.4 LTS build is covered: NOT FOUND (table shows "Not listed" for 3.4.0 LTS and 3.4.1 LTS for the SoftDevice Controller column).
- SoftDevice Controller docs (nrfxlib): https://nrfconnectdocs.nordicsemi.com/ncs/latest/nrfxlib/softdevice_controller/README.html (not read; appeared in search only).

### 1c. Legacy nRF5 SDK + SoftDevice (S140/S132), bare metal C

- Status: "The nRF5 SDK is in maintenance mode." Source: https://www.nordicsemi.com/Products/Development-software/nRF5-SDK
- Recommendation on same page: "For new projects, we recommend the nRF Connect SDK." It names Zephyr RTOS or "Bare Metal for the nRF54L Series." Same URL.
- No end-of-life date and no maintenance-mode start date on the page. Same URL.
- Supported SoCs: "Software development kit for the nRF52 Series and nRF51 Series SoCs." nRF52 devices listed: nRF52840, nRF52833, nRF52811, nRF52810, nRF52832. Same URL.
- Licence: page states no licence. Only: "is delivered as a plain .zip-archive." Same URL. Licence text for the SDK comes from the 5-clause Nordic licence (see 1b and devzone blog).
- S140 download page: no licence terms or redistribution statement fetched. Says release notes inside download contain more information. Source: https://www.nordicsemi.com/Products/Development-software/S140/download
- Bluetooth qualification for S140/S132 individually: NOT FOUND in this session. The QDID matrix above lists S115/S145 DNs only.

### 1d. Apache Mynewt / NimBLE

- NimBLE licence: Apache License 2.0. Source: https://raw.githubusercontent.com/apache/mynewt-nimble/master/LICENSE
- Mynewt-core licence: Apache License 2.0. Source: https://raw.githubusercontent.com/apache/mynewt-core/master/LICENSE (URL as fetched in session: apache/mynewt-core/master/LICENSE)
- Nordic-supported or qualified status of NimBLE: NOT FOUND.
- Supported SoCs/footprint for NimBLE: NOT FOUND.

### 1e. Arduino cores

- Not researched in this session. Licence, qualification, and SoC list: NOT FOUND.

### 1f. JavaScript engines (in place of Espruino)

- Espruino: LICENSE file covers "All files in this package are Copyright 2019 Gordon Williams, Pur3 Ltd unless otherwise noted." and the text names "Mozilla Public License Version 2.0". Source: https://raw.githubusercontent.com/espruino/Espruino/master/LICENSE
- JerryScript: LICENSE file header "Copyright JS Foundation and other contributors" then "Apache License" text. Source: https://raw.githubusercontent.com/jerryscript-project/jerryscript/master/LICENSE
- QuickJS-ng: "The MIT License (MIT) Copyright (c) 2017-2026 Fabrice Bellard." Source: https://raw.githubusercontent.com/quickjs-ng/quickjs/master/LICENSE
- Moddable SDK licences page: "The majority of software in the Moddable SDK is provided under the GPL 3.0 or LGPL 3.0." Runtime software is LGPL 3.0 and build tools GPL 3.0. "Moddable also offers a conventional commercial software license for the Moddable SDK." XS engine: "XS is licensed by Marvell under the Apache 2.0 license", with Moddable modifications carrying GPL/LGPL. Source: https://github.com/dckc/moddable/blob/public/licenses/readme.md (mirror found by search; the Moddable-OpenSource repo licence path returned 404 in session). Official licence page: https://moddable.com/license (not fetched).
- Note: the JS engines do not themselves provide BLE, SMP, or qualification. Their qualification status: NOT FOUND.

---

## 2. Zephyr drivers and bindings (paths confirmed by raw fetch)

Method: each file below was fetched with HTTP 200 from raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/<path>. "NOT FOUND" = probed paths returned 404.

### 2a. Display

- Sharp memory LCD driver: `drivers/display/ls0xx.c` (HTTP 200). `#define DT_DRV_COMPAT sharp_ls0xx`. Pixel formats: `caps->supported_pixel_formats = PIXEL_FORMAT_MONO01;` only. Colour: NOT supported in the driver. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/drivers/display/ls0xx.c
- Kconfig: `drivers/display/Kconfig.ls0xx` (HTTP 200): `config LS0XX` depends on `DT_HAS_SHARP_LS0XX_ENABLED`, selects SPI. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/drivers/display/Kconfig.ls0xx
- Binding: `dts/bindings/display/sharp,ls0xx.yaml`: "compatible: sharp,ls0xx". Panels listed as examples: LS012B7DD01, LS013B7DH03, LS013B7DH05, LS027B7DH01A, LS032B7DD02, LS044Q7DH01. Description: "mostly monochrome TFT-LCD controller up to 400x240 resolution." Properties: extcomin-gpios, extcomin-frequency, disp-en-gpios, serial-vcom-inversion, serial-vcom-interval (default 1000 ms). Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/dts/bindings/display/sharp,ls0xx.yaml
- Note on names: binding uses `sharp,ls0xx` and the driver macro uses `sharp_ls0xx`. This is the dts-to-C name mapping; not separately verified here.
- JDI LPM013M126 driver: `drivers/display/display_lpm013m126.c` (HTTP 200). `#define DT_DRV_COMPAT jdi_lpm013m126`. Pixel format: `caps->supported_pixel_formats = PIXEL_FORMAT_RGB_565;` and a function returns `-ENOTSUP` for other formats. Converts RGB565 to 3-bit RGB for the panel (`rgb565_to_rgb3`). Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/drivers/display/display_lpm013m126.c
- JDI binding: `dts/bindings/display/jdi,lpm013m126.yaml`: "JDI LPM013M126 176x176 Color Memory LCD". Properties disp-gpios, extcomin-gpios, extcomin-frequency. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/dts/bindings/display/jdi,lpm013m126.yaml
- LVGL display integration: `modules/lvgl/Kconfig` exists (HTTP 200). Monochrome handling in LVGL: NOT verified.

### 2b. Accelerometers

- LIS2DH driver: `drivers/sensor/st/lis2dh/lis2dh.c` (HTTP 200). `#define DT_DRV_COMPAT st_lis2dh`. Channels: SENSOR_CHAN_ACCEL_X, SENSOR_CHAN_ACCEL_XYZ. Runtime ODR option `CONFIG_LIS2DH_ODR_RUNTIME` with ODR table {0, 1, 10, 25, 50, 100, 200, 400, 1620, ...}. Temperature option `CONFIG_LIS2DH_MEASURE_TEMPERATURE`. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/drivers/sensor/st/lis2dh/lis2dh.c
- LIS2DH binding: `dts/bindings/sensor/st,lis2dh.yaml` and `dts/bindings/accel/st,lis2dh.yaml` both NOT FOUND (404). A common binding exists: `dts/bindings/sensor/st,lis2dh-common.yaml` (HTTP 200, not read). Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/dts/bindings/sensor/st,lis2dh-common.yaml
- LIS2DW12 driver: `drivers/sensor/st/lis2dw12/lis2dw12.c` (HTTP 200). `#define DT_DRV_COMPAT st_lis2dw12`. Channels: SENSOR_CHAN_ACCEL_X and SENSOR_CHAN_ACCEL_XYZ. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/drivers/sensor/st/lis2dw12/lis2dw12.c
- LIS2DW12 binding: `dts/bindings/sensor/st,lis2dw12-common.yaml` exists (HTTP 200, not read). `dts/bindings/sensor/st,lis2dw12.yaml` NOT FOUND (404).
- BMA400 driver: `drivers/sensor/bosch/bma400/bma400.c` (HTTP 200), `#define DT_DRV_COMPAT bosch_bma400`. Channels ACCEL_X / ACCEL_XYZ. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/drivers/sensor/bosch/bma400/bma400.c
- BMA4xx driver: `drivers/sensor/bosch/bma4xx/bma4xx.c` (HTTP 200), `#define DT_DRV_COMPAT bosch_bma4xx`. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/drivers/sensor/bosch/bma4xx/bma4xx.c
- BMA400 / BMA4xx bindings: `dts/bindings/sensor/bosch,bma400.yaml`, `dts/bindings/accel/bosch,bma400.yaml`, `dts/bindings/sensor/bosch,bma4xx.yaml`, `dts/bindings/accel/bosch,bma4xx.yaml` all NOT FOUND (404).

### 2c. Heart-rate sensor

- MAX30101 driver: `drivers/sensor/maxim/max30101/max30101.c` (HTTP 200). `#define DT_DRV_COMPAT maxim_max30101`. Sensor channels include SENSOR_CHAN_RED, SENSOR_CHAN_IR, SENSOR_CHAN_GREEN (`MAX30101_SENSOR_PPG_CHANNEL_MAX SENSOR_CHAN_GREEN`). Modes in header: `MAX30101_MODE_HEART_RATE = 2`, `MAX30101_MODE_SPO2 = 3`, `MAX30101_MODE_MULTI_LED = 7`. Slot assignment includes `MAX30101_SLOT_GREEN_LED = 3`. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/drivers/sensor/maxim/max30101/max30101.c and .../max30101.h
- Heart-rate algorithm: grep for algorithm/heart/HR/algo in driver shows only register configuration and mode selection. No HR-computation algorithm found in the driver file. Raw samples only, as far as seen.
- MAX30101 binding: `dts/bindings/sensor/maxim,max30101.yaml`: `led-pa` default [0xff, 0xff, 0xff] with [0]=Red, [1]=IR, [2]=Green. `led-slot` default [1, 2, 3, 0]. Includes `maxim,max3010x-common.yaml`. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/dts/bindings/sensor/maxim,max30101.yaml
- Common binding `dts/bindings/sensor/maxim,max3010x-common.yaml`: irq-gpios ("Active low interrupt signal... open drain"), fifo-rollover-en, fifo-watermark. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/dts/bindings/sensor/maxim,max3010x-common.yaml
- MAX86141 / MAXM86161 (binding and driver): `dts/bindings/sensor/maxim,max86141.yaml` and `maxim,max86161.yaml` NOT FOUND (404). Driver: not probed beyond that. Treat as no driver found.

### 2d. Haptics and PWM

- DRV2605 driver: `drivers/haptics/ti/drv2605.c` (HTTP 200). `#define DT_DRV_COMPAT ti_drv2605`. Defines ERM and LRA actuator modes (`DRV2605_ACTUATOR_MODE_ERM 0`, `DRV2605_ACTUATOR_MODE_LRA 1`). Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/drivers/haptics/ti/drv2605.c
- DRV2605 Kconfig: `drivers/haptics/ti/Kconfig` sources `drivers/haptics/ti/Kconfig.drv2605` (HTTP 200 for the parent). `HAPTICS_DRV2605` depends on `DT_HAS_TI_DRV2605_ENABLED`, selects I2C. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/drivers/haptics/ti/Kconfig
- DRV2605 binding: `dts/bindings/haptics/ti,drv2605.yaml`: `actuator-mode` (required, ERM or LRA), feedback-brake-factor, loop-gain, vib-rated-mv, vib-overdrive-mv, en-gpios, in-trig-gpios. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/dts/bindings/haptics/ti,drv2605.yaml
- nRF PWM driver: `drivers/pwm/pwm_nrfx.c` and `drivers/pwm/Kconfig.nrfx` (both HTTP 200). Usable for a PWM vibration motor path. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/drivers/pwm/pwm_nrfx.c
- nRF GPIO driver: `drivers/gpio/gpio_nrfx.c` (HTTP 200).

### 2e. Power, battery measurement

- nPM1300 regulator binding: `dts/bindings/regulator/nordic,npm1300-regulator.yaml` (HTTP 200): compatible "nordic,npm1300-regulator". Description: "The PMIC has two buck converters and two LDOs." Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/dts/bindings/regulator/nordic,npm1300-regulator.yaml
- nPM1300 charger and fuel-gauge: bindings/drivers at tried paths NOT FOUND (404): `dts/bindings/power/nordic,npm1300.yaml`, `dts/bindings/charger/nordic,npm1300-charger.yaml`, `dts/bindings/regulator/nordic,npm1300-charger.yaml`, `dts/bindings/fuel-gauge/nordic,npm1300-fuel-gauge.yaml`, `drivers/mfd/mfd_npm1300.c`, `drivers/charger/npm1300_charger.c`, `drivers/fuel_gauge/npm1300_fuel_gauge.c`. Charger/fuel-gauge support: NOT CONFIRMED.
- Voltage divider: `dts/bindings/adc/voltage-divider.yaml` NOT FOUND (404). Battery measurement path that is confirmed: nRF SAADC driver `drivers/adc/adc_nrfx_saadc.c` (HTTP 200). Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/drivers/adc/adc_nrfx_saadc.c

### 2f. GATT services (HRS, BAS) and SMP

- Heart Rate Service: `subsys/bluetooth/services/hrs.c` (HTTP 200). `BT_GATT_SERVICE_DEFINE(hrs_svc, BT_GATT_PRIMARY_SERVICE(BT_UUID_HRS), ...)` with HRS measurement (notify), body sensor location (read), and control point (write). API: `int bt_hrs_notify(uint16_t heartrate)`, `bt_hrs_cb_register`, `bt_hrs_cb_unregister`. Header `include/zephyr/bluetooth/services/hrs.h` (HTTP 200). Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/subsys/bluetooth/services/hrs.c
- Battery Service: header `include/zephyr/bluetooth/services/bas.h` (HTTP 200) defines `@defgroup bt_bas Battery Service (BAS)`. Source file `subsys/bluetooth/services/bas.c` NOT FOUND at that path (404). Battery-level setter name: not confirmed from text read.
- Sample using HRS and BAS: `samples/bluetooth/peripheral_hr/prj.conf` (HTTP 200) with `CONFIG_BT=y`, `CONFIG_BT_SMP=y`, `CONFIG_BT_PERIPHERAL=y`, `CONFIG_BT_DIS=y`, `CONFIG_BT_BAS=y`, `CONFIG_BT_HRS=y`, `CONFIG_BT_DEVICE_APPEARANCE=833`. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/samples/bluetooth/peripheral_hr/prj.conf
- SMP (mcumgr) over BLE transport: `subsys/mgmt/mcumgr/transport/src/smp_bt.c` (HTTP 200). Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/subsys/mgmt/mcumgr/transport/src/smp_bt.c
- Custom GATT service: the same `BT_GATT_SERVICE_DEFINE` macro used by hrs.c is the expected mechanism. Not separately verified with a custom-UUID sample.
- AES-128 CTR and CMAC: Zephyr crypto options (tinycrypt, mbedtls) NOT VERIFIED in this session.

---

## 3. Bootloader and update

### 3a. MCUboot with Zephyr

- Slots: "`boot_partition`: for MCUboot itself", "`slot0_partition`: the primary slot of Image 0", "`slot1_partition`: the secondary slot of Image 0", "`scratch_partition`: the scratch slot". "Currently, the two image slots must be contiguous." Source: https://docs.mcuboot.com/readme-zephyr.html
- Swap-using-scratch: "It is not recommended to use the swap-using-scratch algorithm of MCUboot." "swap-using-offset or swap-using-move are recommended instead." "Swap-using-scratch is required to be used if the primary and secondary slots have different sector sizes." Same URL.
- Design doc on swap modes:
  - Swap using scratch: "the bootloader requires a scratch area to allow for reliable image swapping." Also "the swap-using-scratch algorithm may be removed in the coming future."
  - Swap using move (`MCUBOOT_SWAP_USING_MOVE`): "uses an additional sector in the primary slot to make swap possible." "the swap-using-offset algorithm is preferred over swap-using-move except when building for existing products already using the latter."
  - Swap using offset (`MCUBOOT_SWAP_USING_OFFSET`): "uses an additional sector in the secondary slot to make swap possible."
  - Overwrite (`MCUBOOT_OVERWRITE_ONLY`): "must be configured at build time to choose one of these two strategies" (swap or overwrite). "downgrade prevention is only available when the overwrite-based image update strategy is used." Source: https://docs.mcuboot.com/design.html
- Image trailer: "located at the end of the image flash areas, and is called an image trailer." Image OK flag: "A single byte indicating whether the image in this slot has been confirmed as good by the user" (0x01 confirmed, 0xff not). Same URL.
- Confirmation and revert: "It is up to the image to mark the primary slot as 'image ok' before the next reboot, otherwise the bootloader will revert the application." (readme-zephyr.html). Test swaps "are supported to provide a rollback mechanism to prevent devices from becoming 'bricked' by bad firmware." BOOT_SWAP_TYPE_REVERT: "A previous test swap was not made permanent; swap back to the old image whose data are now in the secondary slot." (design.html).
- Signature TLVs (design.html): RSA2048_PSS 0x20, RSA3072_PSS 0x23, ECDSA_SIG 0x22 ("ECDSA224 ... Not supported anymore"), ED25519 0x24. Readme example key type: `rsa-2048`.
- Bootloader size: NOT FOUND as a general figure. Only example: nRF52832 "application size 220KB and scratch size 24KB" (readme-zephyr.html).
- Flash layout for a 1 MB part and a 512 kB part: NOT FOUND.
- External SPI flash as secondary slot: NOT FOUND in fetched pages.
- Serial recovery mode: NOT FOUND.
- MCUboot licence: Apache License 2.0. Source: https://raw.githubusercontent.com/mcu-tools/mcuboot/main/LICENSE

### 3b. Recovery over SWD and readback protection

- nrfutil device recover (nRF52, nRF54L, nRF91): "the nrfutil device recover command erases the flash memory and then writes a small binary into the recovered flash memory." The binary "stops readback protection from turning back on after a pin reset or power cycle." Source: https://docs.nordicsemi.com/r/bundle/nrfutil/page/nrfutil-device/guides/programming_recovery.html/recovering-nrf52-nrf54l-and-nrf91-series-devices
- Protected-device recovery: command `nrfutil device recover --serial-number <serial_number>`. "To restore full debug access, you need to recover the device, which erases all flash memory contents." Source: https://docs.nordicsemi.com/r/bundle/nrfutil/page/nrfutil-device/guides/programming_readback_protection.html/recovering-a-protected-device
- Multi-device recover syntax and J-Link/nRESET requirements for nRF52: NOT FOUND (page cut off).
- nRF54L15 DK board runner: `boards/nordic/nrf54l15dk/board.yml` has runners `'--recover'` (nrfjprog, nrfutil), `'--erase'` (nrfjprog, jlink, nrfutil), `'--reset'`. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/boards/nordic/nrf54l15dk/board.yml
- APPROTECT enable/handling for production: NOT FOUND. nRF Connect SDK page "Managing access port protection" (https://nrfconnectdocs.nordicsemi.com/ncs/latest/nrf/security/ap_protect.html) returned navigation text only. Community thread (not authoritative) says recovery may be impossible without nRESET: https://devzone.nordicsemi.com/f/nordic-q-a/128196/nrf52840-locked-with-approtect-unable-to-recover-flash-without-nreset-pin/567298

---

## 4. Tooling

### 4a. Install and workspace

- Supported OS (Getting Started): "This guide covers Ubuntu version 24.04 LTS and later." Windows 10+ via Windows Terminal. macOS: Homebrew instructions, no version. Source: https://docs.zephyrproject.org/latest/develop/getting_started/index.html
- Toolchain: "The SDK ... contains toolchains for each of Zephyr's supported architectures." Install with `west sdk install`. Same URL.
- GNU Arm Embedded and `ZEPHYR_TOOLCHAIN_VARIANT=gnuarmemb`: NOT FOUND on the getting-started page.
- Minimum disk and RAM: NOT FOUND.
- Workspace init, exact commands from the page:
  ```
  west init -m https://github.com/zephyrproject-rtos/zephyr ~/zephyrproject
  cd ~/zephyrproject
  west update
  ```
  Same URL.
- Narrow workspace via group filter (west manifest docs): "This skips projects that belong only to disabled groups." Commands given: `west config manifest.group-filter -- "-stm32,-optional"` then `west update`. Manifest groups per project: `groups: - nordic` on `hal_nordic`. "By default, `west update` fetches all active projects defined in the manifest." "Changing `manifest.group-filter` does not automatically remove repositories already cloned into the workspace." Source: https://docs.zephyrproject.org/latest/develop/west/manifest.html
- `west init --mr`, `west update --narrow`: NOT FOUND in the pages read.
- Minimal workspace with only hal_nordic, cmsis, mbedtls/tinycrypt, mcuboot: the group mechanism is documented. The real group names in Zephyr's manifest for these modules: NOT VERIFIED (the manifest file was not fetched; the example uses placeholder names).

### 4b. Custom board

- Hardware model v2: "requires modifications to all existing board and SoC definitions." Zephyr chose not to provide "direct backwards compatibility for the previous model." Docs for the previous model are in Zephyr v3.6.0 or earlier. Source: https://docs.zephyrproject.org/latest/hardware/porting/board_porting.html
- Mandatory files for a board directory (example `boards/<VENDOR>/plank`): `board.yml`, `plank_<qualifiers>.dts`, `Kconfig.plank`. Optional: `Kconfig`, `Kconfig.defconfig`, `plank_defconfig` or `plank_<qualifiers>_defconfig`, `board.cmake`, `CMakeLists.txt`, `doc/index.rst`, `plank_<qualifiers>.yaml`. Same URL.
- Out-of-tree boards: "any folder structure under `<your-repo>/boards` is permitted" (local repo). Same URL.
- BOARD_ROOT: NOT FOUND on the porting page. Exact build command for an out-of-tree board: NOT FOUND in pages read.
- Real example, nRF54L15 DK files (HTTP 200): `boards/nordic/nrf54l15dk/board.yml`, `nrf54l15dk_nrf54l15_cpuapp.dts`, `Kconfig.nrf54l15dk`, `nrf54l15dk_nrf54l15_cpuapp_defconfig`, `nrf54l15dk_nrf54l15_cpuapp.yaml`. The board.yml lists SoCs nrf54l05, nrf54l10, nrf54l15 with cpuapp, cpuflpr, and ns variants. Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/boards/nordic/nrf54l15dk/board.yml
- Its defconfig enables serial, console, GPIO and MPU only (no CONFIG_BT line in the file read). Source: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/boards/nordic/nrf54l15dk/nrf54l15dk_nrf54l15_cpuapp_defconfig
- nRF54L15 DK doc page: "The nRF54L15 Development Kit hardware provides support for the Nordic Semiconductor nRF54L15 Arm Cortex-M33 CPU." Lists "Nordic nRF family RADIO peripheral" and "Nordic nRF IEEE 802.15.4 node." Bluetooth LE support on this page: NOT FOUND. Source: https://docs.zephyrproject.org/latest/boards/nordic/nrf54l15dk/doc/index.html

### 4c. Flashing and programmers

- J-Link flashing commands with an nRF52840-DK as programmer: NOT FOUND.
- Programmer prices:
  - SEGGER J-Link EDU Mini: "$76.00". Licence/usage: "For hobbyists and educational use only" and "can only be used for non-commercial education purposes." Interfaces: "It is JTAG and SWD supported." Source: https://shop-us.segger.com/product/j-link-edu-mini-8-08-91/
  - Raspberry Pi Debug Probe: "priced at just $12". RP2040-based. Bridges USB to SWD and USB-to-serial. Works with "any Arm-based microcontroller that provides an SWD port with 3V3 I/O." Source: https://www.raspberrypi.com/news/raspberry-pi-debug-probe-a-plug-and-play-debug-kit-for-12/
  - nRF52840-DK price: NOT FOUND (page fetch failed).

---

## 5. BLE security configuration (Zephyr host Kconfig)

Source for all items below: https://raw.githubusercontent.com/zephyrproject-rtos/zephyr/main/subsys/bluetooth/host/Kconfig (HTTP 200). Line numbers as seen in the file.

- `config BT_SMP` (line 475): SMP enable.
- `config BT_SMP_SC_PAIR_ONLY` (line 526): "Disable legacy pairing"; `default y`. "This option disables LE legacy pairing and forces LE secure connection pairing."
- `config BT_SMP_SC_ONLY` (line 536): "Secure Connections Only Mode"; `select BT_SMP_SC_PAIR_ONLY`. "In this mode device shall only use Security Mode 1 Level 4 with exception for services that only require Security Mode 1 Level 1." "Enabling this option disables legacy pairing." This matches the "LE Secure Connections only" requirement.
- `config BT_SMP_LEGACY_PAIR_ONLY` (line 1216): depends on not SC pair-only.
- `config BT_SMP_OOB_LEGACY_PAIR_ONLY` (line 546), `config BT_SMP_DISABLE_LEGACY_JW_PASSKEY` (line 552): both depend on SC pair-only being off.
- `config BT_SMP_APP_PAIRING_ACCEPT` (line 516): "Accept or reject pairing initiative": application is queried on pairing request/response over SMP. Does not affect SSP.
- `config BT_PASSKEY_KEYPRESS` (line 502): passkey keypress option. Exact display callback names: NOT FOUND in this session.
- `config BT_BONDABLE` (line 690), `config BT_BONDABLE_PER_CONNECTION` (line 710), `config BT_SETTINGS` (line 195): bonding keys stored via settings (`BT_SETTINGS_*` options follow).
- `config BT_SMP_ENFORCE_MITM` (line 727): MITM enforcement.
- `config BT_SMP_MIN_ENC_KEY_SIZE` (line 761): minimum encryption key size.
- `config BT_FILTER_ACCEPT_LIST` (line 281): "Filter accept list support." "This option enables the filter accept list API." "The filter accept list cannot be modified while it is in use." Used by advertiser and scanner.
- `config BT_SHELL` (line 414 in host Kconfig): present. Help text and production default: NOT READ. Treat as needing an explicit disable in production; the exact default was not verified.
- `config BT_DEVICE_NAME` (line 1005) and `BT_DEVICE_NAME_DYNAMIC` (line 990): present.
- GATT permissions requiring authenticated encryption (for example BT_GATT_PERM_READ_AUTHEN): NOT VERIFIED. `subsys/bluetooth/host/Kconfig.gatt` exists (HTTP 200), not read.
- Disabling debug console over BLE in production: the BT_SHELL option above is the only related option seen. Full set NOT FOUND.

---

## 6. Qualification status summary

| Stack | Evidence seen | Source |
|---|---|---|
| Zephyr Host (LE) | Pre-qualified host; qualified releases v4.4 (Q385945, listing 332380) and v4.5 (Q399832, listing 353725) | https://docs.zephyrproject.org/latest/services/connectivity/bluetooth/bluetooth-qual.html |
| Zephyr Controller (open source) | No qualification statement on controller page | https://docs.zephyrproject.org/latest/services/connectivity/bluetooth/bluetooth-ctlr-arch.html |
| Nordic SoftDevice Controller (in NCS) | SoftDevice Controller DNs per NCS version: Q331118 (NCS 2.8.0-2.9.3), Q380588 (NCS 3.2.0-3.2.5); not listed for 3.4 LTS | https://docs.nordicsemi.com/r/bundle/comp_matrix_nrf54l15/page/comp/nrf54l15/nrf54l15_ble_qdid_qual_matrix.html |
| Nordic SoftDevice S115/S145 | DNs Q381541 (v9.0.0), Q381345 (v10.0.0, v10.0.1) | same URL |
| nRF5 SDK / S140 | No DN on the pages read | https://www.nordicsemi.com/Products/Development-software/nRF5-SDK |

Listing dates: NOT FOUND on the Nordic matrix page. Check the Bluetooth SIG QDID database with these DNs.

---

## 7. Open questions and not-found list

1. Zephyr open-source controller: licence file path, supported SoCs (nRF52 and nRF54L), footprint, and qualification status. Not found.
2. Does Zephyr support BLE on nRF54L15 (not only 802.15.4)? Not confirmed. The nRF54L15 DK page lists radio and 802.15.4, not BLE.
3. NCS overview page (content, licence, nRF54L statement): blocked by robots.
4. APPROTECT production guidance: nRF Connect SDK page body not retrieved.
5. Sharp driver: monochrome only (MONO01). Colour panels are not supported by `ls0xx.c`.
6. MAX30101: raw data driver only in the file read. No heart-rate algorithm in the driver.
7. MAX86141 / MAXM86161 driver and binding: not found.
8. BMA400 / BMA4xx / LIS2DH / LIS2DW12 bindings: only the -common LIS2DH and LIS2DW12 bindings were found.
9. nPM1300 charger and fuel gauge drivers and bindings: not found at tried paths.
10. Battery voltage divider binding: not found.
11. BAS source file path: not found. Header found.
12. MCUboot bootloader size, flash layout for 1 MB and 512 kB parts, external SPI secondary slot, serial recovery: not found.
13. Zephyr getting started: no minimum disk or RAM figure; no GNU Arm Embedded variant.
14. Board flashing with nRF52840-DK and J-Link command lines: not found.
15. nRF52840-DK price: not found.
16. Minimum BLE peripheral flash and RAM in Zephyr or NimBLE: not found.
17. AES-128 CTR and CMAC support in Zephyr: not verified.
18. Arduino core licence and qualification: not researched.
19. Moddable official licence page (moddable.com/license) not fetched. The licence text used is from a repository mirror of the Moddable licences readme.
