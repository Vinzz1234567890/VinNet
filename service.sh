#!/system/bin/sh
until [ "$(resetprop sys.boot_completed)" = "1" ]; do sleep 3; done
sleep 3

ModuleDirectory="${0%/*}"
Core="$ModuleDirectory/webroot/Core"
LogPath="/storage/emulated/0/Download/VinNet.log"

Log() { echo "[$(date +%T)] $1: $2" >> "$LogPath" 2> /dev/null; }
ProbeWrite() { : > "$Core/.WriteProbe" 2> /dev/null && rm -f "$Core/.WriteProbe"; }

[ -d "$Core" ] || mkdir -p "$Core" 2> /dev/null
if ! ProbeWrite; then
    mount -o remount,rw "$ModuleDirectory" 2> /dev/null || mount -o remount,rw /data/adb/modules 2> /dev/null
    if ! ProbeWrite; then
        if mount -t tmpfs -o size=2M tmpfs "$Core" 2> /dev/null && ProbeWrite; then
            Log CoreMountedTmpfs "webroot/Core read-only, mounted tmpfs on $Core"
        else
            Core="/data/local/tmp/VinNetCore"
            mkdir -p "$Core" 2> /dev/null
            Log CoreFallback "webroot/Core not writable, using $Core"
        fi
    fi
fi

Configuration="$Core/VinNet.conf"
Detect="$Core/Detect.txt"
Monitor="$Core/Monitor.json"
Environment="$Core/Environment.json"
Metadata="$Core/Metadata.json"
Tweaks="$Core/Tweaks.json"
ProcessID="$Core/ProcessID.json"
LockFile="$Core/service.pid"
Identity="$ModuleDirectory/module.prop"
CoreWritable=1

Write() {
    [ "$CoreWritable" -eq 0 ] && return 1
    local Destination="$1" Temporary="${Destination}.tmp.$$" ErrorOutput
    ErrorOutput=$({ cat > "$Temporary" && mv -f "$Temporary" "$Destination"; } 2>&1)
    [ $? -eq 0 ] && return 0

    Log WriteFail "$Destination : ${ErrorOutput:-unknown error}"
    rm -f "$Temporary" 2> /dev/null
    case "$ErrorOutput" in
        *"Read-only file system"*)
            CoreWritable=0
            Log CoreReadOnly "$Core read-only, stopping further write attempts this session"
            ;;
    esac
}

Diagnose() {
    local ABI Arch="Unsupported"
    ABI=$(resetprop ro.product.cpu.abi)
    case "$ABI" in arm64*) Arch="Supported (arm64)" ;; armeabi*) Arch="Supported (arm)" ;; esac
    Log Diagnose "ABI=$ABI Architecture=$Arch"
    for Bin in ping awk tc resetprop; do
        if command -v "$Bin" > /dev/null 2>&1; then
            Log Diagnose "$Bin found at $(command -v "$Bin")"
        else
            Log Diagnose "$Bin MISSING"
        fi
    done
    [ -w "$Core" ] && Log Diagnose "$Core writable" || Log Diagnose "$Core NOT writable"
    DmesgLines=$(dmesg 2> /dev/null | grep -iE "f2fs|erofs|remount" | tail -5)
    [ -n "$DmesgLines" ] && Log Diagnose "dmesg -- $DmesgLines"
}
Diagnose

ProcessID() { printf '{"PID":%s,"Timestamp":%s}\n' "$$" "$(date +%s)" | Write "$ProcessID"; }

if [ -f "$LockFile" ]; then
    read -r OldPID < "$LockFile" 2> /dev/null
    [ -n "$OldPID" ] && kill -0 "$OldPID" 2> /dev/null && exit 0
fi
printf '%s\n' "$$" > "$LockFile"
ProcessID

Cleanup() {
    rm -f "$ProcessID" "$LockFile" "$Detect" "$Core"/*.tmp.$$ 2> /dev/null
    exit 0
}
trap Cleanup TERM EXIT INT

ApplyTweaks() {
    local State=$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')
    local On=$([ "$State" = "on" ] && echo 1 || echo 0)

    case "$1" in
        "IP Reach Disconnect") cmd wifi set-ipreach-disconnect $([ "$On" -eq 1 ] && echo disabled || echo enabled) ;;
        "QDISC")
            local QDISC=$([ "$On" -eq 1 ] && echo "fq_codel quantum 300 noecn" || echo "pfifo_fast")
            for Interface in wlan0 rmnet_data0 rmnet_ipa0; do tc qdisc replace dev "$Interface" root $QDISC 2> /dev/null; done
            ;;
        "Wi-Fi Force Low Latency Mode")
            local Mode=$([ "$On" -eq 1 ] && echo enabled || echo disabled)
            local Out=$(cmd wifi force-low-latency-mode "$Mode" 2> /dev/null)
            case "$Out" in *"Command execution failed"*) cmd wifi force-hi-perf-mode "$Mode" 2> /dev/null ;; esac
            ;;
        "Network Avoid Bad Wi-Fi") settings put global network_avoid_bad_wifi $([ "$On" -eq 1 ] && echo 0 || echo 1) ;;
        "BLE Scan Always Enabled") settings put global ble_scan_always_enabled $([ "$On" -eq 1 ] && echo 0 || echo 1) ;;
        "Mobile Data Always ON") settings put global mobile_data_always_on $([ "$On" -eq 1 ] && echo 0 || echo 1) ;;
        "Wi-Fi Country Code") resetprop ro.boot.wificountrycode $([ "$On" -eq 1 ] && echo US || echo 00) ;;
        "Force LTE CA") resetprop -p persist.sys.radio.force_lte_ca $([ "$On" -eq 1 ] && echo true || echo false) ;;
        "Wi-Fi Scan Throttle") settings put global wifi_scan_throttle_enabled "$On" ;;
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
    printf '%s}\n' "$JSON" | Write "$Tweaks"
}

Metadata() {
    [ -f "$Identity" ] || return
    local Key Value ID Name Version VersionCode Author Description
    while IFS='=' read -r Key Value; do
        case "$Key" in
            id) ID=$Value ;; name) Name=$Value ;; version) Version=$Value ;;
            versionCode) VersionCode=$Value ;; author) Author=$Value ;; description) Description=$Value ;;
        esac
    done < "$Identity"

    printf '{"ID":"%s","Name":"%s","Version":"%s","VersionCode":"%s","Author":"%s","Description":"%s"}\n' \
        "$ID" "$Name" "$Version" "$VersionCode" "$Author" "$Description" | Write "$Metadata"
}

Environment() {
    local Root="Unknown"
    command -v ksud > /dev/null 2>&1 && Root="KernelSU" || {
        command -v apd > /dev/null 2>&1 && Root="APatch" || {
            command -v magisk > /dev/null 2>&1 && Root="Magisk"
        }
    }

    printf '{"Brand":"%s","Model":"%s","Android":"%s","Kernel":"%s","Architecture":"%s","Root":"%s"}\n' \
        "$(resetprop ro.product.brand)" "$(resetprop ro.product.model)" "$(resetprop ro.build.version.release)" \
        "$(uname -r)" "$(resetprop ro.product.cpu.abi)" "$Root" | Write "$Environment"
}

LastLatency="x" LastJitter="x" LastMonitorWrite=0 FailCount=0

Monitor() {
    local Timestamp="$1" Output Latency Jitter Host RawOutput="" LastError=""

    for Host in 8.8.8.8 1.1.1.1 8.8.4.4 1.0.0.1; do
        Output=$(ping -c 1 -W 1 -w 1 "$Host" 2>&1)
        [ $? -eq 0 ] && RawOutput="$RawOutput $Output" || LastError="$Output"
    done

    if [ -n "$RawOutput" ]; then
        set -- $(printf '%s\n' "$RawOutput" | awk -F'time=' '
            NF > 1 { gsub(/[^0-9.].*$/, "", $2); t[++n] = $2 }
            END {
                if (n >= 1) {
                    s = 0; for (i = 1; i <= n; i++) s += t[i]
                    lat = int(s / n)
                    j = 0
                    for (i = 2; i <= n; i++) { d = t[i] - t[i-1]; if (d < 0) d = -d; j += d }
                    div = (n > 1) ? (n - 1) : 1
                    print lat, int(j / div)
                }
            }
        ')
        Latency="$1" Jitter="$2"

        if [ -n "$Latency" ]; then
            FailCount=0
            if [ "$Latency" != "$LastLatency" ] || [ "$Jitter" != "$LastJitter" ] || [ $((Timestamp - LastMonitorWrite)) -ge 20 ]; then
                LastLatency="$Latency" LastJitter="$Jitter" LastMonitorWrite="$Timestamp"
                printf '{"Latency":%s,"Jitter":%s,"Timestamp":%s}\n' "$Latency" "$Jitter" "$Timestamp" | Write "$Monitor"
            fi
            return
        fi
    fi

    FailCount=$((FailCount + 1))
    if [ "$FailCount" -ge 3 ] && { [ "$LastLatency" != "—" ] || [ $((Timestamp - LastMonitorWrite)) -ge 20 ]; }; then
        LastLatency="—" LastJitter="—" LastMonitorWrite="$Timestamp"
        printf '{"Latency":"—","Jitter":"—","Timestamp":%s}\n' "$Timestamp" | Write "$Monitor"
        Log MonitorFail "${LastError:-no output from ping}"
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

WebUIActive() {
    [ -f "$Detect" ] || return 1
    read -r DetectTimestamp < "$Detect" 2> /dev/null
    [ -n "$DetectTimestamp" ] || return 1
    local Age=$(($(date +%s) - DetectTimestamp))
    [ "$Age" -gt 45 ] && rm -f "$Detect"
    [ "$Age" -le 15 ]
}

while true; do
    Now=$(date +%s)
    if WebUIActive; then
        ProcessID
        GenerateTweaks
        Monitor "$Now"
        sleep 4
    else
        sleep 5
    fi
done
