#!/system/bin/sh
until [ "$(getprop sys.boot_completed)" = "1" ]; do sleep 3; done
sleep 3

apply_tweak() {
  case "$1" in
    "IP Reach Disconnect")
      if [ "$2" = "on" ]; then
        cmd wifi set-ipreach-disconnect disabled
      else
        cmd wifi set-ipreach-disconnect enabled
      fi
      ;;
    "Scan Always Available")
      if [ "$2" = "on" ]; then
        cmd wifi set-scan-always-available disabled
        settings put global wifi_scan_always_enabled 0
      else
        cmd wifi set-scan-always-available enabled
        settings put global wifi_scan_always_enabled 1
      fi
      ;;
    "Restrict Background")
      if [ "$2" = "on" ]; then
        cmd netpolicy set restrict-background false
      else
        cmd netpolicy set restrict-background true
      fi
      ;;
    "Power Save")
      if [ "$2" = "on" ]; then
        iw dev wlan0 set power_save off
      else
        iw dev wlan0 set power_save on
      fi
      ;;
    "QDISC")
      if [ "$2" = "on" ]; then
        /system/bin/tc qdisc replace dev wlan0 root fq_codel quantum 300 noecn
        /system/bin/tc qdisc replace dev rmnet_data0 root fq_codel quantum 300 noecn
        /system/bin/tc qdisc replace dev rmnet_ipa0 root fq_codel quantum 300 noecn
      else
        /system/bin/tc qdisc replace dev wlan0 root pfifo_fast
        /system/bin/tc qdisc replace dev rmnet_data0 root pfifo_fast
        /system/bin/tc qdisc replace dev rmnet_ipa0 root pfifo_fast
      fi
      ;;
    "Wi-Fi Force Low Latency Mode")
      if [ "$2" = "on" ]; then
        cmd wifi force-low-latency-mode enabled
        cmd wifi force-hi-perf-mode enabled
      else
        cmd wifi force-low-latency-mode disabled
        cmd wifi force-hi-perf-mode disabled
      fi
      ;;
    "Network Avoid Bad Wi-Fi")
      if [ "$2" = "on" ]; then
        settings put global network_avoid_bad_wifi 0
        settings put system wifi_assistant 0
      else
        settings put global network_avoid_bad_wifi 1
        settings put system wifi_assistant 1
      fi
      ;;
    "BLE Scan Always Enabled")
      if [ "$2" = "on" ]; then
        settings put global ble_scan_always_enabled 0
      else
        settings put global ble_scan_always_enabled 1
      fi
      ;;
  esac
}

if [ -f "/data/adb/modules/VinNet/webroot/Core/VinNet.conf" ]; then
  while IFS='=' read -r TweakParameter TweakValue; do
    [ -n "$TweakParameter" ] && apply_tweak "$TweakParameter" "$TweakValue"
  done < "/data/adb/modules/VinNet/webroot/Core/VinNet.conf"

  {
    echo -n "{"
    awk -F= 'BEGIN { first=1 } { if (NF==2 && $1!="") { if (!first) printf ","; printf "\"%s\":\"%s\"", $1, $2; first=0 } }' "/data/adb/modules/VinNet/webroot/Core/VinNet.conf"
    echo "}"
  } > "/data/adb/modules/VinNet/webroot/Core/Tweaks.json"
fi

(
  while true; do
    sleep 30
    [ -f "/data/adb/modules/VinNet/webroot/Core/VinNet.conf" ] && {
      grep -q "^Power Save=on" "/data/adb/modules/VinNet/webroot/Core/VinNet.conf" && iw dev wlan0 set power_save off 2> /dev/null
    }
  done
) &

if [ -f "/data/adb/modules/VinNet/module.prop" ]; then
  cat > "/data/adb/modules/VinNet/webroot/Core/Metadata.json" << EOF
{
  "id": "$(grep "^id=" "/data/adb/modules/VinNet/module.prop" | cut -d'=' -f2-)",
  "name": "$(grep "^name=" "/data/adb/modules/VinNet/module.prop" | cut -d'=' -f2-)",
  "version": "$(grep "^version=" "/data/adb/modules/VinNet/module.prop" | cut -d'=' -f2-)",
  "versionCode": "$(grep "^versionCode=" "/data/adb/modules/VinNet/module.prop" | cut -d'=' -f2-)",
  "author": "$(grep "^author=" "/data/adb/modules/VinNet/module.prop" | cut -d'=' -f2-)",
  "description": "$(grep "^description=" "/data/adb/modules/VinNet/module.prop" | cut -d'=' -f2-)"
}
EOF
fi

cat > "/data/adb/modules/VinNet/webroot/Core/Environment.json" << EOF
{
  "brand": "$(getprop ro.product.brand)",
  "model": "$(getprop ro.product.model)",
  "android": "$(getprop ro.build.version.release)",
  "kernel": "$(uname -r)",
  "arch": "$(getprop ro.product.cpu.abi)",
  "root": "$(if command -v ksud > /dev/null 2>&1; then echo KernelSU; elif command -v apd > /dev/null 2>&1; then echo APatch; elif command -v magisk > /dev/null 2>&1; then echo Magisk; else echo Unknown; fi)"
}
EOF

(
  while true; do
    DetectFile="/data/adb/modules/VinNet/webroot/Core/Detect.txt"
    if [ -f "$DetectFile" ]; then
      LastDetect=$(cat "$DetectFile" 2> /dev/null)
      Now=$(date +%s)
      Age=$((Now - LastDetect))
    else
      Age=999
    fi

    if [ "$Age" -le 5 ]; then
      Start=$(date +%s)
      Finish=$(ping -c 3 -W 1 1.1.1.1 2> /dev/null)
      Line=$(echo "$Finish" | grep "min/avg/max")
      if [ -n "$Line" ]; then
        set -- $(echo "$Line" | sed -E 's#.*= ([0-9]+)\.[0-9]+/([0-9]+)\.[0-9]+/([0-9]+)\.[0-9]+.*#\1 \2 \3#')
        Minimum=$1
        Latency=$2
        Maximum=$3
        Jitter=$(((Maximum - Minimum) / 2))
      else
        Latency=null
        Jitter=null
      fi
      cat > "/data/adb/modules/VinNet/webroot/Core/Monitor.json.tmp" << EOF
{"latency":$Latency,"jitter":$Jitter,"ts":$(date +%s)}
EOF
      mv -f "/data/adb/modules/VinNet/webroot/Core/Monitor.json.tmp" "/data/adb/modules/VinNet/webroot/Core/Monitor.json"

      Elapsed=$(($(date +%s) - Start))
      Remain=$((3 - Elapsed))
      [ "$Remain" -gt 0 ] && sleep "$Remain"
    else
      sleep 3
    fi
  done
) &

if [ "$(getprop ro.product.device)" != "fog" ]; then
  VMS="Vendor: Fail (Not fog)"
elif grep -q "VinNet" "/vendor/etc/wifi/WCNSS_qcom_cfg.ini" 2> /dev/null && grep -q "p2p_disabled=1" "/vendor/etc/wifi/wpa_supplicant_overlay.conf" 2> /dev/null && grep -q "ap_scan=1" "/vendor/etc/wifi/wpa_supplicant.conf" 2> /dev/null; then
  VMS="Vendor: Success"
else
  VMS="Vendor: Fail (No Meta)"
fi
command -v iw > /dev/null && BMS="Binary: Success" || BMS="Binary: Fail (No Meta)"
su shell -c "cmd notification post -S bigtext -t 'VinNet' 'Mount Status' '$VMS | $BMS'"
