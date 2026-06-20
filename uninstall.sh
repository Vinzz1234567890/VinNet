#!/system/bin/sh
settings delete global wifi_ipreach_disconnect_enabled
settings delete global wifi_scan_always_enabled
settings delete global data_saver_mode
resetprop -p --delete ro.boot.wificountrycode
resetprop -p --delete persist.sys.radio.force_lte_ca
