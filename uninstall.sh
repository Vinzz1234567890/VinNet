#!/system/bin/sh
Status=0
rm -rf /data/adb/VinNet || Status=1
settings delete global network_avoid_bad_wifi || Status=1
settings delete global ble_scan_always_enabled || Status=1
settings delete global mobile_data_always_on || Status=1
settings delete global wifi_scan_throttle_enabled || Status=1
rm -f /storage/emulated/0/Download/VinNet.log || Status=1
exit "$Status"
