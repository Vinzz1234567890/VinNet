#!/system/bin/sh
until [ "$(resetprop sys.boot_completed)" = "1" ]; do sleep 3; done
sleep 3

ModuleDirectory="${0%/*}"
Core="/data/adb/VinNet"
LogPath="/storage/emulated/0/Download/VinNet.log"

Log() {
    local Tag="$1" Message="$2" Temp
    [ -n "$Message" ] || return 0
    Message=$(printf '%s' "$Message" | tr '\n' ' ')
    [ -w "${LogPath%/*}" ] || return 1
    Temp="$LogPath.tmp.$$"
    {
        grep -vF "] $Tag: $Message" "$LogPath" 2> /dev/null
        printf '[%s] %s: %s\n' "$(date '+%F %T')" "$Tag" "$Message"
    } > "$Temp" 2> /dev/null && mv -f "$Temp" "$LogPath" 2> /dev/null || {
        rm -f "$Temp"
        return 1
    }
}
ProbeWrite() { : > "$1/.WriteProbe" 2> /dev/null && rm -f "$1/.WriteProbe"; }

if [ -f "$LogPath" ] && [ "$(wc -c < "$LogPath" 2> /dev/null)" -gt 131072 ]; then
    : > "$LogPath" 2> /dev/null
    Log LogRotate "previous log exceeded 128K, truncated"
fi

mkdir -p "$Core" 2> /dev/null

Monitor="$Core/Monitor.json"
Environment="$Core/Environment.json"
Metadata="$Core/Metadata.json"
ProcessID="$Core/ProcessID.json"
Identity="$ModuleDirectory/module.prop"
CoreWritable=1

Write() {
    [ "$CoreWritable" -eq 0 ] && return 1
    local Destination="$1"
    local Temporary="${Destination}.tmp.$$"
    local ErrorOutput
    ErrorOutput=$({ printf '%s\n' "$2" > "$Temporary" && mv -f "$Temporary" "$Destination"; } 2>&1)
    [ $? -eq 0 ] && return 0

    Log WriteFail "$Destination : ${ErrorOutput:-unknown error}"
    rm -f "$Temporary" 2> /dev/null
    case "$ErrorOutput" in
        *"Read-only file system"* | *"No space left on device"*)
            CoreWritable=0
            Log CoreReadOnly "$Core unwritable, runtime state disabled this session"
            ;;
    esac
}

Diagnose() {
    local ABI Arch="Unsupported" DmesgLines WifiLines Pending="$Core/.Diagnose.tmp" Stamp BinPath
    ABI=$(resetprop ro.product.cpu.abi)
    case "$ABI" in arm64*) Arch="Supported (arm64)" ;; armeabi*) Arch="Supported (arm)" ;; esac
    Stamp=$(date '+%F %T')

    {
        echo "[$Stamp] Diagnose: ABI=$ABI Architecture=$Arch"
        echo "[$Stamp] Diagnose: device=$(resetprop ro.product.brand) $(resetprop ro.product.model) android=$(resetprop ro.build.version.release) kernel=$(uname -r)"
        echo "[$Stamp] Diagnose: module=$(sed -n 's/^version=//p' "$Identity" 2> /dev/null)"
        for Bin in ping awk tc resetprop; do
            BinPath=$(command -v "$Bin" 2> /dev/null)
            if [ -n "$BinPath" ]; then
                echo "[$Stamp] Diagnose: $Bin found at $BinPath"
            else
                echo "[$Stamp] Diagnose: $Bin MISSING"
            fi
        done
        if ProbeWrite "$Core"; then
            echo "[$Stamp] Diagnose: $Core writable"
        else
            echo "[$Stamp] Diagnose: $Core NOT writable"
            echo "[$Stamp] Diagnose: mount -- $(mount 2> /dev/null | grep -E ' /data |modules' | tr '\n' ' ')"
        fi
        DmesgLines=$(dmesg 2> /dev/null | grep -iE "f2fs|erofs|remount" | tail -5)
        if [ -n "$DmesgLines" ]; then
            printf '%s\n' "$DmesgLines" | while IFS= read -r Line; do
                [ -n "$Line" ] && echo "[$Stamp] Diagnose: dmesg -- $Line"
            done
        fi
        WifiLines=$(dumpsys wifi 2> /dev/null | grep -E 'Wi-Fi is|Dump of ClientModeImpl|curState=|Supplicant state|mPowerSaveDisableRequests' | head -20)
        if [ -n "$WifiLines" ]; then
            printf '%s\n' "$WifiLines" | while IFS= read -r Line; do
                [ -n "$Line" ] && echo "[$Stamp] Diagnose: wifi -- $Line"
            done
        fi
    } > "$Pending" 2> /dev/null

    FlushDiagnose
}

FlushDiagnose() {
    local Pending="$Core/.Diagnose.tmp" ExistingLines
    [ -f "$Pending" ] || return 0
    [ -w "${LogPath%/*}" ] || return 1

    ExistingLines=""
    if [ -f "$LogPath" ]; then
        ExistingLines=$(grep -v "Diagnose:" "$LogPath" 2> /dev/null | grep -vE '^\s*\[\s*[0-9]+\.[0-9]+\]')
    fi

    {
        cat "$Pending"
        [ -z "$ExistingLines" ] || printf '%s\n' "$ExistingLines"
    } > "$LogPath" 2> /dev/null && rm -f "$Pending"
}

ProcessID() { Write "$ProcessID" "$(printf '{"PID":%s,"Timestamp":%s}\n' "$$" "$(date +%s)")"; }

Cleanup() {
    rm -f "$ProcessID" "$Core"/*.tmp.$$ "$Core/.Diagnose.tmp" 2> /dev/null
    exit 0
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

    Write "$Metadata" "$(printf '{"ID":"%s","Name":"%s","Version":"%s","VersionCode":"%s","Author":"%s","Description":"%s"}\n' \
        "$ID" "$Name" "$Version" "$VersionCode" "$Author" "$Description")"
}

Environment() {
    local Root="Unknown"
    command -v ksud > /dev/null 2>&1 && Root="KernelSU" || {
        command -v apd > /dev/null 2>&1 && Root="APatch" || {
            command -v magisk > /dev/null 2>&1 && Root="Magisk"
        }
    }

    Write "$Environment" "$(printf '{"Brand":"%s","Model":"%s","Android":"%s","Kernel":"%s","Architecture":"%s","Root":"%s"}\n' \
        "$(resetprop ro.product.brand)" "$(resetprop ro.product.model)" "$(resetprop ro.build.version.release)" \
        "$(uname -r)" "$(resetprop ro.product.cpu.abi)" "$Root")"
}

LastLatency="x" LastJitter="x" LastMonitorWrite=0 FailCount=0

Monitor() {
    local Timestamp="$1" Output Latency Jitter Host RawOutput="" LastError=""

    for Host in 1.1.1.1 1.0.0.1; do
        Output=$(ping -c 1 -W 1 "$Host" 2>&1)
        case "$Output" in
            *"time="*) RawOutput="$RawOutput$Output"$'\n' ;;
            *) LastError="$Output" ;;
        esac
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
                Write "$Monitor" "$(printf '{"Latency":%s,"Jitter":%s,"Timestamp":%s}\n' "$Latency" "$Jitter" "$Timestamp")"
            fi
            return
        fi
    fi

    FailCount=$((FailCount + 1))
    if [ "$FailCount" -ge 3 ] && { [ "$LastLatency" != "—" ] || [ $((Timestamp - LastMonitorWrite)) -ge 20 ]; }; then
        LastLatency="—" LastJitter="—" LastMonitorWrite="$Timestamp"
        Write "$Monitor" "$(printf '{"Latency":"—","Jitter":"—","Timestamp":%s}\n' "$Timestamp")"
        Log MonitorFail "${LastError:-no output from ping}"
    fi
}

WebUIActive() {
    [ -f "$ProcessID" ] || return 1
    local MTime
    MTime=$(date -r "$ProcessID" +%s 2> /dev/null)
    [ -n "$MTime" ] || return 1
    [ $(($1 - MTime)) -le 12 ]
}

Diagnose

if [ -f "$ProcessID" ]; then
    read -r Line < "$ProcessID" 2> /dev/null
    OldPID="${Line#*\"PID\":}"
    OldPID="${OldPID%%[!0-9]*}"
    [ -n "$OldPID" ] && kill -0 "$OldPID" 2> /dev/null && exit 0
fi
ProcessID
trap Cleanup TERM EXIT INT

Metadata
Environment

while true; do
    Now=$(date +%s)
    [ -d "$Core" ] || mkdir -p "$Core" 2> /dev/null
    [ -f "$Core/.Diagnose.tmp" ] && FlushDiagnose
    [ -s "$ProcessID" ] || ProcessID
    [ -f "$Metadata" ] || Metadata
    [ -f "$Environment" ] || Environment
    if WebUIActive "$Now"; then
        Monitor "$Now"
    fi
    sleep 5
done
