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
LockFile="$Core/service.pid"
Identity="$Directory/module.prop"

[ -d "$Core" ] || mkdir -p "$Core"

Write() {
    local Destination="$1" Temporary="${Destination}.tmp.$$"
    cat > "$Temporary" && mv -f "$Temporary" "$Destination"
}

ProcessID() {
    printf '{"PID":%s,"Timestamp":%s}\n' "$$" "$(date +%s)" | Write "$ProcessID"
}

if [ -f "$LockFile" ]; then
    read -r OldPID < "$LockFile" 2> /dev/null
    [ -n "$OldPID" ] && kill -0 "$OldPID" 2> /dev/null && exit 0
fi
printf '%s\n' "$$" > "$LockFile"
ProcessID

until [ "$(getprop sys.boot_completed)" = "1" ]; do sleep 3; done
sleep 3

Cleanup() {
    rm -f "$ProcessID" "$LockFile" "$Detect" "$Core"/*.tmp.$$ 2> /dev/null
    exit 0
}
trap Cleanup TERM EXIT INT

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
        "Wi-Fi Country Code")
            if [ "$2" = "on" ]; then
                resetprop ro.boot.wificountrycode US
            else
                resetprop ro.boot.wificountrycode 00
            fi
            ;;
        "Force LTE CA")
            if [ "$2" = "on" ]; then
                resetprop -p persist.sys.radio.force_lte_ca true
            else
                resetprop -p persist.sys.radio.force_lte_ca false
            fi
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

LastLatency="x"
LastJitter="x"
LastMonitorWrite=0
FailCount=0

Monitor() {
    local Timestamp="$1" Output Latency Jitter Host RawOutput=""

    for Host in 8.8.8.8 1.1.1.1 8.8.4.4 1.0.0.1; do
        Output=$(ping -c 1 -W 1 -w 1 "$Host" 2> /dev/null)
        [ $? -eq 0 ] && RawOutput="$RawOutput $Output"
    done

    if [ -n "$RawOutput" ]; then
        set -- $(printf '%s\n' "$RawOutput" | awk -F'time=' '
            NF > 1 {
                gsub(/[^0-9.].*$/, "", $2)
                t[++n] = $2
            }
            END {
                if (n >= 1) {
                    s = 0
                    for (i = 1; i <= n; i++) s += t[i]
                    lat = int(s / n)
                    j = 0
                    for (i = 2; i <= n; i++) {
                        d = t[i] - t[i-1]
                        if (d < 0) d = -d
                        j += d
                    }
                    div = (n > 1) ? (n - 1) : 1
                    print lat, int(j / div)
                }
            }
        ')
        Latency="$1"
        Jitter="$2"

        if [ -n "$Latency" ]; then
            FailCount=0
            if [ "$Latency" != "$LastLatency" ] || [ "$Jitter" != "$LastJitter" ] || [ $((Timestamp - LastMonitorWrite)) -ge 20 ]; then
                LastLatency="$Latency"
                LastJitter="$Jitter"
                LastMonitorWrite="$Timestamp"
                printf '{"Latency":%s,"Jitter":%s,"Timestamp":%s}\n' "$Latency" "$Jitter" "$Timestamp" | Write "$Monitor"
            fi
            return
        fi
    fi

    FailCount=$((FailCount + 1))
    if [ "$FailCount" -ge 3 ] && { [ "$LastLatency" != "—" ] || [ $((Timestamp - LastMonitorWrite)) -ge 20 ]; }; then
        LastLatency="—"
        LastJitter="—"
        LastMonitorWrite="$Timestamp"
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

LastMonitorSave=0

while true; do
    Now=$(date +%s)

    WebUI=0
    if [ -f "$Detect" ]; then
        read -r DetectTimestamp < "$Detect" 2> /dev/null
        if [ -n "$DetectTimestamp" ]; then
            Age=$((Now - DetectTimestamp))
            if [ "$Age" -le 15 ]; then
                WebUI=1
            elif [ "$Age" -gt 45 ]; then
                rm -f "$Detect"
            fi
        fi
    fi

    if [ "$WebUI" -eq 1 ]; then
        ProcessID
        GenerateTweaks
        Monitor "$Now"
        sleep 4
    else
        sleep 30
    fi

    if [ $((Now - LastMonitorSave)) -ge 60 ]; then
        [ -f "$Configuration" ] && grep -q "^Power Save=on" "$Configuration" 2> /dev/null \
            && iw dev wlan0 set power_save off 2> /dev/null
        LastMonitorSave=$Now
    fi
done
