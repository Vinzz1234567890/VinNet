#!/system/bin/sh
MODDIR=${0%/*}
WEBROOT="$MODDIR/webroot"

until [ "$(getprop sys.boot_completed)" = "1" ]; do sleep 5; done
sleep 3

TWEAKS_CONF="$MODDIR/tweaks.conf"

apply_tweak() {
    case "$1" in
    "IP Reach Disconnect")
        if [ "$2" = "on" ]; then
            cmd wifi set-ipreach-disconnect disabled
            settings put global wifi_ipreach_disconnect_enabled 0
        else
            cmd wifi set-ipreach-disconnect enabled
            settings put global wifi_ipreach_disconnect_enabled 1
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
            settings put global data_saver_mode 0
        else
            cmd netpolicy set restrict-background true
            settings put global data_saver_mode 1
        fi
        ;;
    "Power Save")
        if [ "$2" = "on" ]; then
            iw wlan0 set power_save off
        else iw wlan0 set power_save on; fi
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
    esac
}

if [ -f "$TWEAKS_CONF" ]; then
    while IFS='=' read -r TKEY TVAL; do
        [ -n "$TKEY" ] && apply_tweak "$TKEY" "$TVAL"
    done <"$TWEAKS_CONF"

    {
        echo -n "{"
        awk -F= 'BEGIN { first=1 } { if (NF==2 && $1!="") { if (!first) printf ","; printf "\"%s\":\"%s\"", $1, $2; first=0 } }' "$TWEAKS_CONF"
        echo "}"
    } >"$WEBROOT/tweaks.json"
fi

(
    while true; do
        sleep 10
        [ -f "$TWEAKS_CONF" ] && {
            grep -q "^Power Save=on" "$TWEAKS_CONF" && iw wlan0 set power_save off 2>/dev/null
        }
    done
) &

if [ -f "$MODDIR/module.prop" ]; then
    cat >"$WEBROOT/metadata.json" <<EOF
{
  "id": "$(grep "^id=" "$MODDIR/module.prop" | cut -d'=' -f2-)",
  "name": "$(grep "^name=" "$MODDIR/module.prop" | cut -d'=' -f2-)",
  "version": "$(grep "^version=" "$MODDIR/module.prop" | cut -d'=' -f2-)",
  "versionCode": "$(grep "^versionCode=" "$MODDIR/module.prop" | cut -d'=' -f2-)",
  "author": "$(grep "^author=" "$MODDIR/module.prop" | cut -d'=' -f2-)",
  "description": "$(grep "^description=" "$MODDIR/module.prop" | cut -d'=' -f2-)"
}
EOF
fi

cat >"$WEBROOT/device.json" <<EOF
{
  "brand": "$(getprop ro.product.brand)",
  "model": "$(getprop ro.product.model)",
  "android": "$(getprop ro.build.version.release)",
  "kernel": "$(uname -r)",
  "arch": "$(getprop ro.product.cpu.abi)"
}
EOF

if command -v python3 >/dev/null 2>&1; then
    FRRO=$(ls /data/resource-cache/ 2>/dev/null | grep "systemui-accent" | head -1)
    if [ -n "$FRRO" ]; then
        python3 -c "
import json, re
def v(d,i):
    r,s=0,0
    while 1:
        b=d[i];i+=1;r|=(b&127)<<s;s+=7
        if not b>>7:return r,i
data=open('/data/resource-cache/$FRRO','rb').read()
colors={}
i=0
while i<len(data)-20:
    if data[i:i+14]==b'system_accent1':
        try:
            e=data.index(b'\x12',i)
            nm=data[i:e].decode()
            c,_=v(data,e+5)
            colors[nm]='#{:02X}{:02X}{:02X}'.format((c>>16)&255,(c>>8)&255,c&255)
            i=e
        except: pass
    i+=1
out={}
for k,vv in colors.items():
    if '_dark' in k:
        m=re.search(r'accent1_(\d+)_dark', k)
        if m: out[m.group(1)]=vv
print(json.dumps(out))
" >"$WEBROOT/monet.json" 2>/dev/null
    fi
fi

(
    while true; do
        OUT=$(ping -c 3 -W 1 1.1.1.1 2>/dev/null)
        LINE=$(echo "$OUT" | grep "min/avg/max")
        if [ -n "$LINE" ]; then
            set -- $(echo "$LINE" | sed -E 's#.*= ([0-9]+)\.[0-9]+/([0-9]+)\.[0-9]+/([0-9]+)\.[0-9]+.*#\1 \2 \3#')
            MIN=$1
            LATENCY=$2
            MAX=$3
            JITTER=$(((MAX - MIN) / 2))
        else
            LATENCY=null
            JITTER=null
        fi
        cat >"$WEBROOT/network.json.tmp" <<EOF
{"latency":$LATENCY,"jitter":$JITTER,"ts":$(date +%s)}
EOF
        mv -f "$WEBROOT/network.json.tmp" "$WEBROOT/network.json"
        sleep 2
    done
) &

if [ "$(getprop ro.product.device)" != "fog" ]; then
    VMS="Vendor: Fail (Not fog)"
elif grep -q "VinNet" "/vendor/etc/wifi/WCNSS_qcom_cfg.ini" 2>/dev/null && grep -q "p2p_disabled=1" "/vendor/etc/wifi/wpa_supplicant_overlay.conf" 2>/dev/null; then
    VMS="Vendor: Success"
else
    VMS="Vendor: Fail (No Meta)"
fi
command -v iw >/dev/null && BMS="Binary: Success" || BMS="Binary: Fail (No Meta)"
su shell -c "cmd notification post -S bigtext -t 'VinNet' 'Mount Status' '$VMS | $BMS'"
