#!/system/bin/sh
settings delete global wifi_scan_always_enabled
resetprop --delete ro.boot.wificountrycode
resetprop -p --delete persist.sys.radio.force_lte_ca
settings delete global network_avoid_bad_wifi
settings delete global ble_scan_always_enabled
settings delete global mobile_data_always_on
settings delete global wifi_scan_throttle_enabled
rm /storage/emulated/0/Download/VinNet.log
