#!/system/bin/sh
Directory="${0%/*}"
Core="$Directory/webroot/Core"
LogPath="/storage/emulated/0/Download/VinNet.log"

[ -d "$Core" ] || mkdir -p "$Core" 2> /dev/null
if ! { : > "$Core/.WriteProbe" 2> /dev/null && rm -f "$Core/.WriteProbe"; }; then
    mount -o remount,rw "$Directory" 2> /dev/null || mount -o remount,rw /data/adb/modules 2> /dev/null
    if ! { : > "$Core/.WriteProbe" 2> /dev/null && rm -f "$Core/.WriteProbe"; }; then
        mount -t tmpfs -o size=2M tmpfs "$Core" 2> /dev/null
        if { : > "$Core/.WriteProbe" 2> /dev/null && rm -f "$Core/.WriteProbe"; }; then
            echo "[$(date +%T)] CoreMountedTmpfs: webroot/Core read-only, mounted tmpfs on $Core" >> "$LogPath"
        else
            Core="/data/local/tmp/VinNetCore"
            mkdir -p "$Core" 2> /dev/null
            echo "[$(date +%T)] CoreFallback: webroot/Core not writable, using $Core" >> "$LogPath"
        fi
    fi
fi

Configuration="$Core/VinNet.conf"
BaselineFile="$Core/Baseline.conf"
UnsetMarker="@@Unset@@"
Detect="$Core/Detect.txt"
Monitor="$Core/Monitor.json"
Environment="$Core/Environment.json"
Metadata="$Core/Metadata.json"
Tweaks="$Core/Tweaks.json"
ProcessID="$Core/ProcessID.json"
LockFile="$Core/service.pid"
Identity="$Directory/module.prop"
CoreWritable=1

[ -d "$Core" ] || mkdir -p "$Core"

Write() {
    [ "$CoreWritable" -eq 0 ] && return 1
    local Destination="$1" Temporary="${Destination}.tmp.$$" ErrorOutput
    ErrorOutput=$({ cat > "$Temporary" && mv -f "$Temporary" "$Destination"; } 2>&1)
    [ $? -eq 0 ] && return 0
    echo "[$(date +%T)] WriteFail: $Destination : ${ErrorOutput:-unknown error}" >> "$LogPath"
    rm -f "$Temporary" 2> /dev/null
    case "$ErrorOutput" in
        *"Read-only file system"*)
            CoreWritable=0
            echo "[$(date +%T)] CoreReadOnly: $Core read-only, stopping further write attempts this session" >> "$LogPath"
            ;;
    esac
}

Diagnose() {
    local ABI Arch="Unsupported"
    ABI=$(resetprop ro.product.cpu.abi)
    case "$ABI" in arm64*) Arch="Supported (arm64)" ;; armeabi*) Arch="Supported (arm)" ;; esac
    {
        echo "[$(date +%T)] Diagnose: ABI=$ABI Architecture=$Arch"
        for Bin in ping awk tc resetprop; do
            if command -v "$Bin" > /dev/null 2>&1; then
                echo "[$(date +%T)] Diagnose: $Bin found at $(command -v "$Bin")"
            else
                echo "[$(date +%T)] Diagnose: $Bin MISSING"
            fi
        done
        if [ -w "$Core" ]; then
            echo "[$(date +%T)] Diagnose: $Core writable"
        else
            echo "[$(date +%T)] Diagnose: $Core NOT writable"
        fi
        DmesgLines=$(dmesg 2> /dev/null | grep -iE "f2fs|erofs|remount" | tail -5)
        if [ -n "$DmesgLines" ]; then
            echo "[$(date +%T)] Diagnose: dmesg --"
            echo "$DmesgLines"
        fi
    } >> "$LogPath" 2> /dev/null
}
Diagnose

ProcessID() {
    printf '{"PID":%s,"Timestamp":%s}\n' "$$" "$(date +%s)" | Write "$ProcessID"
}

if [ -f "$LockFile" ]; then
    read -r OldPID < "$LockFile" 2> /dev/null
    [ -n "$OldPID" ] && kill -0 "$OldPID" 2> /dev/null && exit 0
fi
printf '%s\n' "$$" > "$LockFile"
ProcessID

until [ "$(resetprop sys.boot_completed)" = "1" ]; do sleep 3; done
sleep 3

Cleanup() {
    rm -f "$ProcessID" "$LockFile" "$Detect" "$Core"/*.tmp.$$ 2> /dev/null
    exit 0
}
trap Cleanup TERM EXIT INT

Normalize() {
    printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

# State stored for a tweak in VinNet.conf, empty when it was never saved.
ConfValue() {
    [ -f "$Configuration" ] || return 1
    awk -F= -v Key="$1" '$1 == Key { print substr($0, index($0, "=") + 1); exit }' "$Configuration" 2> /dev/null
}

# Stock value recorded for a managed property, captured before the module first wrote it.
StockValue() {
    [ -f "$BaselineFile" ] || return 1
    local Name Value
    while IFS='=' read -r Name Value; do
        [ "$Name" = "$1" ] && { printf '%s' "$Value"; return 0; }
    done < "$BaselineFile"
    return 1
}

# Values of managed properties are read back with the same tool that writes them, so a tweak
# is applied and verified through one implementation. Only a missing resetprop counts as a
# failure; an empty result means the property is not set.
PropValue() {
    command -v resetprop > /dev/null 2>&1 || return 1
    resetprop $1 "$2" 2> /dev/null
    return 0
}

# Records the stock value once, read the same way the tweak writes it later.
RecordStock() {
    local Name="$1" Flags="$2" Value
    StockValue "$Name" > /dev/null && return 0
    Value=$(PropValue "$Flags" "$Name") || return 1
    [ -n "$Value" ] || Value="$UnsetMarker"
    {
        [ -f "$BaselineFile" ] && cat "$BaselineFile"
        printf '%s=%s\n' "$Name" "$Value"
    } | Write "$BaselineFile"
    echo "[$(date +%T)] Stock:$Name=$Value" >> "$LogPath"
}

# ON writes the value a tweak injects; OFF restores the stock value instead of a placeholder.
# The fallback is only used when no stock value could be captured, keeping the old behaviour.
ApplyProp() {
    local Name="$1" OnValue="$2" Flags="$3" State="$4" Fallback="$5" Value
    if [ "$State" = "on" ]; then
        Value="$OnValue"
    else
        Value=$(StockValue "$Name")
        [ -n "$Value" ] || Value="$Fallback"
        [ "$Value" = "$UnsetMarker" ] && Value=""
        if [ -z "$Value" ]; then
            resetprop $Flags --delete "$Name"
            return
        fi
    fi
    resetprop $Flags "$Name" "$Value"
}

ApplyTweaks() {
    local State=$(Normalize "$2")
    case "$1" in
        "IP Reach Disconnect")
            cmd wifi set-ipreach-disconnect $([ "$State" = "on" ] && echo disabled || echo enabled)
            ;;
        "QDISC")
            local QDISC=$([ "$State" = "on" ] && echo "fq_codel quantum 300 noecn" || echo "pfifo_fast")
            for Interface in wlan0 rmnet_data0 rmnet_ipa0; do
                tc qdisc replace dev "$Interface" root $QDISC 2> /dev/null
            done
            ;;
        "Wi-Fi Force Low Latency Mode")
            local Mode=$([ "$State" = "on" ] && echo enabled || echo disabled)
            cmd wifi force-low-latency-mode "$Mode" 2> /dev/null || cmd wifi force-hi-perf-mode "$Mode" 2> /dev/null
            ;;
        "Network Avoid Bad Wi-Fi")
            if [ "$State" = "on" ]; then
                settings put global network_avoid_bad_wifi 0
            else
                settings put global network_avoid_bad_wifi 1
            fi
            ;;
        "BLE Scan Always Enabled")
            settings put global ble_scan_always_enabled $([ "$State" = "on" ] && echo 0 || echo 1)
            ;;
        "Mobile Data Always ON")
            settings put global mobile_data_always_on $([ "$State" = "on" ] && echo 0 || echo 1)
            ;;
        "Wi-Fi Country Code") ApplyProp ro.boot.wificountrycode US "" "$State" 00 ;;
        "Force LTE CA") ApplyProp persist.sys.radio.force_lte_ca true "-p" "$State" false ;;
        "Wi-Fi Scan Throttle")
            if [ "$State" = "on" ]; then
                settings put global wifi_scan_throttle_enabled 1
            else
                settings put global wifi_scan_throttle_enabled 0
            fi
            ;;
    esac
}

# Tweak that only lives in the Wi-Fi stack, so it has to be re-applied on every Wi-Fi up.
WifiVolatile="Wi-Fi Force Low Latency Mode QDISC"

# Wi-Fi stack signature: down, or up:<ifindex>:<connected>. The ifindex marks a newly
# initialised interface, the connected flag marks a fresh attach on the same interface.
ReadWifiState() {
    local Status Enabled Connected=0
    Status=$(cmd wifi status 2> /dev/null)
    Enabled=$(printf '%s\n' "$Status" | grep -m 1 -E "is enabled|is disabled")
    case "$Enabled" in
        *"is disabled"*) printf 'down'; return ;;
        *"is enabled"*) ;;
        *)
            [ "$(settings get global wifi_on 2> /dev/null)" = "1" ] || { printf 'down'; return; }
            ;;
    esac
    case "$Status" in *"is connected to"*) Connected=1 ;; esac
    printf 'up:%s:%s' "$(cat /sys/class/net/wlan0/ifindex 2> /dev/null)" "$Connected"
}

ReapplyWifiTweaks() {
    [ -f "$Configuration" ] || return
    local Key Value Reapplied=""
    while IFS='=' read -r Key Value; do
        case " $WifiVolatile " in
            *" $Key "*) ApplyTweaks "$Key" "$Value"; Reapplied="$Reapplied $Key" ;;
        esac
    done < "$Configuration"
    [ -n "$Reapplied" ] && echo "[$(date +%T)] WifiReapply:$Reapplied" >> "$LogPath"
}

VerifySetting() {
    local Expected="$4"
    [ "$2" = "on" ] && Expected="$3"
    [ "$(settings get global "$1" 2> /dev/null)" = "$Expected" ]
}

# ON is judged against the value the tweak injects, OFF against the stock value recorded
# before the first write, so a device whose stock value is not the old placeholder is still
# reported correctly instead of being repaired on every pass. A state that cannot be judged,
# because no stock value was recorded or no resetprop is available to read with, is reported
# as unknown so that Reconcile leaves the tweak alone.
VerifyProp() {
    local OnValue="$3" Flags="$4" Expected Actual
    if [ "$2" = "on" ]; then
        Expected="$OnValue"
    else
        StockValue "$1" > /dev/null || return 2
        Expected=$(StockValue "$1")
        [ "$Expected" = "$UnsetMarker" ] && Expected=""
    fi
    Actual=$(PropValue "$Flags" "$1") || return 2
    [ "$Actual" = "$Expected" ]
}

VerifyIpReach() {
    local Expected=true Output
    [ "$1" = "on" ] && Expected=false
    Output=$(cmd wifi get-ipreach-disconnect 2> /dev/null)
    case "$Output" in
        *"state is true"*) [ "$Expected" = "true" ] ;;
        *"state is false"*) [ "$Expected" = "false" ] ;;
        *) return 2 ;;
    esac
}

# Low-latency/hi-perf mode has no getter, but forcing it drops wlan0 power save, and the
# framework applies the mode only while connected.
VerifyPowerSave() {
    local Output
    [ "$WifiOnline" = "1" ] || return 2
    Output=$(iw dev wlan0 get power_save 2> /dev/null)
    case "$Output" in
        *"Power save: off"*) [ "$1" = "on" ] ;;
        *"Power save: on"*) [ "$1" = "off" ] ;;
        *) return 2 ;;
    esac
}

VerifyQdisc() {
    local Interface Current Found=0
    for Interface in wlan0 rmnet_data0 rmnet_ipa0; do
        Current=$(tc qdisc show dev "$Interface" 2> /dev/null)
        [ -n "$Current" ] || continue
        Found=1
        case "$Current" in
            *fq_codel*) [ "$1" = "on" ] || return 1 ;;
            *) [ "$1" = "off" ] || return 1 ;;
        esac
    done
    [ "$Found" -eq 1 ] || return 2
    return 0
}

TweakVerify() {
    case "$1" in
        "Network Avoid Bad Wi-Fi") VerifySetting network_avoid_bad_wifi "$2" 0 1 ;;
        "BLE Scan Always Enabled") VerifySetting ble_scan_always_enabled "$2" 0 1 ;;
        "Mobile Data Always ON") VerifySetting mobile_data_always_on "$2" 0 1 ;;
        "Wi-Fi Scan Throttle") VerifySetting wifi_scan_throttle_enabled "$2" 1 0 ;;
        "Wi-Fi Country Code") VerifyProp ro.boot.wificountrycode "$2" US "" ;;
        "Force LTE CA") VerifyProp persist.sys.radio.force_lte_ca "$2" true "-p" ;;
        "QDISC") VerifyQdisc "$2" ;;
        "IP Reach Disconnect") VerifyIpReach "$2" ;;
        "Wi-Fi Force Low Latency Mode") VerifyPowerSave "$2" ;;
        *) return 2 ;;
    esac
}

InList() {
    [ -n "$1" ] || return 1
    printf '%s\n' "$1" | grep -Fxq "$2"
}

AddToList() {
    InList "$1" "$2" && printf '%s' "$1" || printf '%s\n%s' "$1" "$2"
}

DropFromList() {
    [ -n "$1" ] || return 0
    printf '%s\n' "$1" | grep -Fxv "$2"
}

# Keys repaired in the previous pass, and keys that failed to hold a repair twice in a row.
LastRepaired=""
Stubborn=""

Reconcile() {
    [ -f "$Configuration" ] || return
    local Key Value State Status Repaired="" ThisPass=""
    while IFS='=' read -r Key Value; do
        [ -z "$Key" ] && continue
        State=$(Normalize "$Value")
        case "$State" in on | off) ;; *) continue ;; esac
        TweakVerify "$Key" "$State"
        Status=$?
        if InList "$Stubborn" "$Key"; then
            [ "$Status" -eq 0 ] && Stubborn=$(DropFromList "$Stubborn" "$Key")
            continue
        fi
        [ "$Status" -eq 1 ] || continue
        ApplyTweaks "$Key" "$State"
        ThisPass=$(AddToList "$ThisPass" "$Key")
        if InList "$LastRepaired" "$Key"; then
            Stubborn=$(AddToList "$Stubborn" "$Key")
            echo "[$(date +%T)] Stubborn:$Key does not hold a repair, backing off" >> "$LogPath"
        fi
        Repaired="$Repaired $Key=$State"
    done < "$Configuration"
    LastRepaired="$ThisPass"
    [ -n "$Repaired" ] && echo "[$(date +%T)] Reconcile:$Repaired" >> "$LogPath"
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
        "$(resetprop ro.product.brand)" "$(resetprop ro.product.model)" "$(resetprop ro.build.version.release)" \
        "$(uname -r)" "$(resetprop ro.product.cpu.abi)" "$RootImplementation" | Write "$Environment"
}

LastLatency="x"
LastJitter="x"
LastMonitorWrite=0
FailCount=0
WifiState=""
WifiOnline=0
WifiRounds=0
LastReconcile=0
ReconcileInterval=30

Monitor() {
    local Timestamp="$1" Output Latency Jitter Host RawOutput="" LastError=""

    for Host in 8.8.8.8 1.1.1.1 8.8.4.4 1.0.0.1; do
        Output=$(ping -c 1 -W 1 -w 1 "$Host" 2>&1)
        if [ $? -eq 0 ]; then RawOutput="$RawOutput $Output"; else LastError="$Output"; fi
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
        echo "[$(date +%T)] MonitorFail: ${LastError:-no output from ping}" >> "$LogPath"
    fi
}

# Stock values have to be read before this session writes anything, and are read with the
# same resetprop flags the tweak uses. Properties coming from the kernel command line
# (ro.boot.*) are recreated by init on every boot, so the value here is always the device's
# own; persist.* properties survive reboots, so they are only captured while the stored
# configuration does not say the tweak is on, because an enabled tweak may still hold the
# value this module wrote in a previous session.
RecordStock ro.boot.wificountrycode ""
LteCaState=$(ConfValue "Force LTE CA")
[ "$LteCaState" = "ON" ] || RecordStock persist.sys.radio.force_lte_ca "-p"

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

while true; do
    Now=$(date +%s)

    CurrentWifi=$(ReadWifiState)
    if [ "$CurrentWifi" != "$WifiState" ]; then
        WifiState="$CurrentWifi"
        case "$CurrentWifi" in
            up:*)
                WifiRounds=3
                WifiOnline=${CurrentWifi##*:}
                Stubborn=""
                LastRepaired=""
                ;;
            *) WifiOnline=0 ;;
        esac
    fi
    if [ "$WifiRounds" -gt 0 ]; then
        WifiRounds=$((WifiRounds - 1))
        LastReconcile=$Now
        ReapplyWifiTweaks
        Reconcile
    elif [ $((Now - LastReconcile)) -ge "$ReconcileInterval" ]; then
        LastReconcile=$Now
        Reconcile
    fi

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
        sleep 5
    fi
done
