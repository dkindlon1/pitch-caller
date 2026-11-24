# SPDX-License-Identifier: Apache-2.0
cmake_minimum_required(VERSION 3.20.0)

find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(pitchiq_watch)

# The message logic is portable C that lives next to this app and is tested on a host: compiled in unchanged.
set(PQ_CORE ${CMAKE_CURRENT_SOURCE_DIR}/../core)

target_sources(app PRIVATE
  src/main.c
  src/app_glue.c
  src/ble_pq.c
  src/ui.c
  src/ui_render.c
  src/haptics.c
  src/power.c
  src/sensors.c
  src/i2c_util.c
  ${PQ_CORE}/pq_sec.c
  ${PQ_CORE}/pq_core.c
)
target_sources_ifdef(CONFIG_PQ_BRINGUP app PRIVATE src/bringup.c)
target_include_directories(app PRIVATE src ${PQ_CORE})
