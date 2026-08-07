#!/system/bin/sh
Directory="${0%/*}"
Core="$Directory/webroot/Core"
Configuration="$Core/VinNet.conf"
Detect="$Core/Detect.txt"
Monitor="$Core/Monitor.json"
Environment="$Core/Environment.json"
Metadata="$Core/Metadata.json"
Tweaks="$Core/Tweaks.json"
ProcessID="$Core/ProcessID.json"
Identity="$Directory/module.prop"

if [ -f "$ProcessID" ]; then
    read -r OldPID < "$ProcessID" 2> /dev/null
    [ -n "$OldPID" ] && kill -0 "$OldPID" 2> /dev/null && exit 0
fi
printf '%s\n' $$ > "$ProcessID"

until [ "$(getprop sys.boot_completed)" = "1" ]; do sleep 3; done
sleep 3

Cleanup() {
    rm -f "$ProcessID" "$Detect" "$Core"/*.tmp.$$ 2> /dev/null
    exit 0
}
trap Cleanup TERM EXIT INT

[ -d "$Core" ] || mkdir -p "$Core"

Write() {
    local Destination="$1" Temporary="${Destination}.tmp.$$"
    cat > "$Temporary" && mv -f "$Temporary" "$Destination"
}

ApplyTweaks() {
    case "$1" in
        "IP Reach Disconnect")
            cmd wifi set-ipreach-disconnect $([ "$2" = "on" ] && echo disabled || echo enabled)
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
            cmd netpolicy set restrict-background $([ "$2" = "on" ] && echo false || echo true)
            ;;
        "Power Save")
            iw dev wlan0 set power_save $([ "$2" = "on" ] && echo off || echo on) 2> /dev/null
            ;;
        "QDISC")
            local QDISC=$([ "$2" = "on" ] && echo "fq_codel quantum 300 noecn" || echo "pfifo_fast")
            for Interface in wlan0 rmnet_data0 rmnet_ipa0; do
                tc qdisc replace dev "$Interface" root $QDISC 2> /dev/null
            done
            ;;
        "Wi-Fi Force Low Latency Mode")
            local Mode=$([ "$2" = "on" ] && echo enabled || echo disabled)
            cmd wifi force-low-latency-mode $Mode
            cmd wifi force-hi-perf-mode $Mode
            ;;
        "Network Avoid Bad Wi-Fi")
            if [ "$2" = "on" ]; then
                settings put global network_avoid_bad_wifi 0
            else
                settings put global network_avoid_bad_wifi 1
            fi
            ;;
        "BLE Scan Always Enabled")
            settings put global ble_scan_always_enabled $([ "$2" = "on" ] && echo 0 || echo 1)
            ;;
        "Mobile Data Always ON")
            settings put global mobile_data_always_on $([ "$2" = "on" ] && echo 0 || echo 1)
            ;;
    esac
}

GenerateTweaks() {
    [ -f "$Configuration" ] || return
    local JSON="{" First=1
    while IFS='=' read -r Key Value; do
        [ -z "$Key" ] && continue
        [ "$First" -eq 1 ] || JSON="$JSON,"
        JSON="$JSON\"$Key\":\"$Value\""
        First=0
    done < "$Configuration"
    JSON="$JSON}"
    printf '%s\n' "$JSON" | Write "$Tweaks"
}

Metadata() {
    [ -f "$Identity" ] || return
    local ID Name Version VersionCode Author Description
    ID=$(grep "^id=" "$Identity" | cut -d'=' -f2-)
    Name=$(grep "^name=" "$Identity" | cut -d'=' -f2-)
    Version=$(grep "^version=" "$Identity" | cut -d'=' -f2-)
    VersionCode=$(grep "^versionCode=" "$Identity" | cut -d'=' -f2-)
    Author=$(grep "^author=" "$Identity" | cut -d'=' -f2-)
    Description=$(grep "^description=" "$Identity" | cut -d'=' -f2-)

    printf '{"ID":"%s","Name":"%s","Version":"%s","VersionCode":"%s","Author":"%s","Description":"%s"}\n' \
        "$ID" "$Name" "$Version" "$VersionCode" "$Author" "$Description" | Write "$Metadata"
}

Environment() {
    local RootImplementation="Unknown"
    command -v ksud > /dev/null 2>&1 && RootImplementation="KernelSU"
    [ "$RootImplementation" = "Unknown" ] && command -v apd > /dev/null 2>&1 && RootImplementation="APatch"
    [ "$RootImplementation" = "Unknown" ] && command -v magisk > /dev/null 2>&1 && RootImplementation="Magisk"

    printf '{"Brand":"%s","Model":"%s","Android":"%s","Kernel":"%s","Architecture":"%s","Root":"%s"}\n' \
        "$(getprop ro.product.brand)" "$(getprop ro.product.model)" "$(getprop ro.build.version.release)" \
        "$(uname -r)" "$(getprop ro.product.cpu.abi)" "$RootImplementation" | Write "$Environment"
}

ProcessID() {
    printf '{"PID":%s,"Timestamp":%s}\n' "$$" "$(date +%s)" | Write "$ProcessID"
}

LastLatency="x"
LastJitter="x"
FailCount=0

Monitor() {
    local Timestamp="$1" Output Latency Jitter
    Output=$(ping -c 3 -i 0.2 -W 1 -w 2 1.1.1.1 2> /dev/null)

    if [ $? -eq 0 ]; then
        set -- $(printf '%s\n' "$Output" | awk -F'time=' '
            NF > 1 {
                gsub(/[^0-9.].*$/, "", $2)
                t[++n] = $2
            }
            END {
                if (n >= 2) {
                    s = 0
                    for (i = 1; i <= n; i++) s += t[i]
                    lat = int(s / n)
                    j = 0
                    for (i = 2; i <= n; i++) {
                        d = t[i] - t[i-1]
                        if (d < 0) d = -d
                        j += d
                    }
                    print lat, int(j / (n - 1))
                }
            }
        ')
        Latency="$1"
        Jitter="$2"

        if [ -n "$Latency" ]; then
            FailCount=0
            if [ "$Latency" != "$LastLatency" ] || [ "$Jitter" != "$LastJitter" ]; then
                LastLatency="$Latency"
                LastJitter="$Jitter"
                printf '{"Latency":%s,"Jitter":%s,"Timestamp":%s}\n' "$Latency" "$Jitter" "$Timestamp" | Write "$Monitor"
            fi
            return
        fi
    fi

    FailCount=$((FailCount + 1))
    if [ "$FailCount" -ge 3 ] && [ "$LastLatency" != "—" ]; then
        LastLatency="—"
        LastJitter="—"
        printf '{"Latency":"—","Jitter":"—","Timestamp":%s}\n' "$Timestamp" | Write "$Monitor"
    fi
}

if [ -f "$Configuration" ]; then
    while IFS='=' read -r Key Value; do
        [ -n "$Key" ] && ApplyTweaks "$Key" "$Value"
    done < "$Configuration"
fi

GenerateTweaks
Metadata
Environment
ProcessID
Monitor "$(date +%s)"

VMS="Vendor: Fail (Not fog)"
if [ "$(getprop ro.product.device)" = "fog" ]; then
    if grep -q "VinNet" "/vendor/etc/wifi/WCNSS_qcom_cfg.ini" 2> /dev/null \
        && grep -q "p2p_disabled=1" "/vendor/etc/wifi/wpa_supplicant_overlay.conf" 2> /dev/null \
        && grep -q "ap_scan=1" "/vendor/etc/wifi/wpa_supplicant.conf" 2> /dev/null; then
        VMS="Vendor: Success"
    else
        VMS="Vendor: Fail (No Meta)"
    fi
fi

if command -v iw > /dev/null 2>&1; then
    BMS="Binary: Success"
else
    BMS="Binary: Fail (No Meta)"
fi

su shell -c "cmd notification post -S bigtext -t 'VinNet' 'Mount Status' '$VMS | $BMS'" > /dev/null 2>&1

LastMonitorSave=0

while true; do
    Now=$(date +%s)

    WebUI=0
    if [ -f "$Detect" ]; then
        read -r DetectTimestamp < "$Detect" 2> /dev/null
        if [ -n "$DetectTimestamp" ]; then
            Age=$((Now - DetectTimestamp))
            if [ "$Age" -le 5 ]; then
                WebUI=1
            elif [ "$Age" -gt 30 ]; then
                rm -f "$Detect"
            fi
        fi
    fi

    if [ "$WebUI" -eq 1 ]; then
        ProcessID
        GenerateTweaks
        Monitor "$Now"
        sleep 5
    else
        sleep 30
    fi

    if [ $((Now - LastMonitorSave)) -ge 60 ]; then
        [ -f "$Configuration" ] && grep -q "^Power Save=on" "$Configuration" 2> /dev/null \
            && iw dev wlan0 set power_save off 2> /dev/null
        LastMonitorSave=$Now
    fi
done
