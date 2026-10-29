#!/system/bin/sh
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
Tweaks="$Core/Tweaks.json"
Identity="$ModuleDirectory/module.prop"
CoreWritable=1

Write() {
    [ "$CoreWritable" -eq 0 ] && return 1
    local Destination="$1" ErrorOutput
    local Temporary="${Destination}.tmp.$$"
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

ReadTweak() {
    [ -f "$Tweaks" ] || return 0
    awk -F'"' -v Key="$1" '{ for (I = 2; I <= NF; I += 4) if ($I == Key) { print $(I + 2); exit } }' "$Tweaks" 2> /dev/null
}

SaveTweak() {
    local Content Input="$Tweaks"
    [ -f "$Input" ] || Input=/dev/null
    Content=$(awk -F'"' -v Key="$1" -v Value="$2" '
        {
            for (I = 2; I <= NF; I += 4) {
                K = $I
                if (K == Key || (Key == "QDISC:all" && K ~ /^QDISC:/)) continue
                if (!(K in Seen)) { Keys[++N] = K; Seen[K] = 1 }
                Values[K] = $(I + 2)
            }
        }
        END {
            Keys[++N] = Key
            Values[Key] = Value
            printf "{"
            for (I = 1; I <= N; I++) {
                if (I > 1) printf ","
                printf "\"%s\":\"%s\"", Keys[I], Values[Keys[I]]
            }
            printf "}\n"
        }
    ' "$Input" 2> /dev/null) || return
    case "$Content" in
        \{*\}) ;;
        *) return 1 ;;
    esac
    Write "$Tweaks" "$Content"
}

QDISCSpec() {
    case "$1" in
        pfifo_fast) printf 'pfifo_fast\n' ;;
        fq_codel) printf 'fq_codel\n' ;;
        cake) printf 'cake\n' ;;
        fq) printf 'fq\n' ;;
        sfq) printf 'sfq\n' ;;
        codel) printf 'codel\n' ;;
        pie) printf 'pie\n' ;;
        fq_pie) printf 'fq_pie\n' ;;
        prio) printf 'prio\n' ;;
        pfifo) printf 'pfifo\n' ;;
        bfifo) printf 'bfifo\n' ;;
        tbf) printf 'tbf rate 1000mbit burst 100k latency 50ms\n' ;;
        red) printf 'red limit 1000000 min 30000 max 90000 avpkt 1000 burst 55\n' ;;
        htb) printf 'htb default 1\n' ;;
        netem) printf 'netem\n' ;;
        drr) printf 'drr\n' ;;
        hhf) printf 'hhf\n' ;;
        sfb) printf 'sfb\n' ;;
        choke) printf 'choke limit 1000000 min 30000 max 90000 avpkt 1000 burst 55\n' ;;
        qfq) printf 'handle 1: qfq\n' ;;
        cbq) printf 'handle 1: cbq bandwidth 1000mbit avpkt 1000\n' ;;
        hfsc) printf 'handle 1: hfsc default 1\n' ;;
        ets) printf 'handle 1: ets bands 3\n' ;;
        mqprio) printf 'handle 1: mqprio num_tc 1 map 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 queues 1@0\n' ;;
        *) return 1 ;;
    esac
}

Interfaces() {
    local P D F
    for P in /sys/class/net/*; do
        [ -e "$P" ] || continue
        D=${P##*/}
        case "$D" in
            lo | dummy* | tun* | tap* | ip6tnl* | sit* | ifb* | veth* | bond* | p2p* | r_rmnet* | rmnet_ctl | ap* | ncm* | rndis* | usb* | radio* | rmtfs* | swlan* | wlan0h* | wlan0bss*) continue ;;
            wlan* | rmnet* | ccmni* | pdp* | ppp* | wwan* | v4-rmnet* | v6-rmnet* | clat* | eth* | en*) ;;
            *) continue ;;
        esac
        F=""
        read -r F < "$P/flags" 2> /dev/null
        [ -n "$F" ] && [ $((F & 1)) -eq 1 ] || continue
        printf '%s\n' "$D"
    done
}

ApplyQDISC() {
    local Key="$1" Target="${2:-all}" Spec D N=0
    Spec=$(QDISCSpec "$Key") || return
    if [ "$Target" != "all" ]; then
        tc qdisc replace dev "$Target" root $Spec 2> /dev/null || return
        printf '%s\n' "$Target"
        return 0
    fi
    for D in $(Interfaces); do
        if tc qdisc replace dev "$D" root $Spec 2> /dev/null; then
            printf '%s\n' "$D"
            N=$((N + 1))
        fi
    done
    [ "$N" -gt 0 ]
}

ListQDISC() {
    local D Found=0
    for D in $(Interfaces); do
        Found=1
        tc qdisc show dev "$D" 2> /dev/null | awk -v D="$D" '{ R = 0; for (i = 1; i <= NF; i++) if ($i == "root") R = 1; if (R) print D, $2; else if ($0 ~ / parent :/ && !seen) { seen = 1; print D, $2 } }'
    done
    [ "$Found" -eq 1 ] || printf '%s\n' '- -'
}

ProbeQDISC() {
    command -v tc > /dev/null 2>&1 || return 1
    local Key Spec
    for Key in pfifo_fast fq_codel cake fq sfq codel pie fq_pie prio pfifo bfifo tbf red htb netem drr hhf sfb choke qfq cbq hfsc ets mqprio; do
        Spec=$(QDISCSpec "$Key") || continue
        tc qdisc replace dev lo root $Spec 2> /dev/null && printf '%s\n' "$Key"
    done
    tc qdisc del dev lo root 2> /dev/null || true
}

RunTweak() {
    local Out HiOut Status HiStatus
    case "$1:$2" in
        "IP Reach Disconnect:ON") cmd wifi set-ipreach-disconnect disabled ;;
        "IP Reach Disconnect:OFF") cmd wifi set-ipreach-disconnect enabled ;;
        "Wi-Fi Force Low Latency Mode:ON")
            cmd wifi force-low-latency-mode disabled 2> /dev/null
            Out=$(cmd wifi force-low-latency-mode enabled 2>&1)
            Status=$?
            case "$Out" in *"Command execution failed"*) Status=1 ;; esac
            if [ "$Status" -ne 0 ]; then
                cmd wifi force-hi-perf-mode disabled 2> /dev/null
                HiOut=$(cmd wifi force-hi-perf-mode enabled 2>&1)
                HiStatus=$?
                case "$HiOut" in *"Command execution failed"*) HiStatus=1 ;; esac
                if [ "$HiStatus" -ne 0 ]; then
                    printf '%s\n%s\n' "$Out" "$HiOut" >&2
                    return 1
                fi
            fi
            ;;
        "Wi-Fi Force Low Latency Mode:OFF")
            Out=$(cmd wifi force-low-latency-mode disabled 2>&1)
            Status=$?
            case "$Out" in *"Command execution failed"*) Status=1 ;; esac
            HiOut=$(cmd wifi force-hi-perf-mode disabled 2>&1)
            HiStatus=$?
            case "$HiOut" in *"Command execution failed"*) HiStatus=1 ;; esac
            if [ "$Status" -ne 0 ] && [ "$HiStatus" -ne 0 ]; then
                printf '%s\n%s\n' "$Out" "$HiOut" >&2
                return 1
            fi
            ;;
        "QDISC:"*) ApplyQDISC "$2" "${3:-all}" ;;
        *) return 1 ;;
    esac
}

ApplyTweak() {
    local Output SaveFailed=0
    RunTweak "$@" || return
    if [ "$1" != "QDISC" ]; then
        Output=$(LiveTweak "$1") || return
        [ "$(TweakState "$1" "$Output")" = "$2" ] || return
        SaveTweak "$1" "$2" || SaveFailed=1
    else
        SaveTweak "QDISC:${3:-all}" "$2" || SaveFailed=1
    fi
    if [ "$SaveFailed" -eq 1 ]; then
        Log TweakSave "$1 : state not persisted"
        printf 'SAVE_FAILED\n'
    fi
    return 0
}

LiveTweak() {
    case "$1" in
        "IP Reach Disconnect") cmd wifi get-ipreach-disconnect ;;
        "Wi-Fi Force Low Latency Mode")
            dumpsys wifi 2> /dev/null | awk -v RS='Dump of ClientModeImpl' '
                NR == 1 { next }
                {
                    quit = ($0 ~ /curState=<QUIT>/)
                    comp = ($0 ~ /Supplicant state: COMPLETED/)
                    mask = ""
                    n = split($0, L, "\n")
                    for (i = 1; i <= n; i++) {
                        if (L[i] ~ /mPowerSaveDisableRequests/) {
                            sub(/^[[:space:]]+/, "", L[i])
                            split(L[i], F, /[[:space:]:=]+/)
                            if (F[2] != "") mask = F[2]
                        }
                    }
                    if (mask != "" && !quit && comp && completed_mask == "") completed_mask = mask
                }
                END {
                    if (completed_mask != "") print completed_mask % 4
                }
            '
            ;;
        *) return 1 ;;
    esac
}

TweakState() {
    case "$1" in
        "IP Reach Disconnect") case "$2" in *false*) printf 'ON\n' ;; *) printf 'OFF\n' ;; esac ;;
        "Wi-Fi Force Low Latency Mode") case "$2" in 2 | 3) printf 'ON\n' ;; *) printf 'OFF\n' ;; esac ;;
        *) return 1 ;;
    esac
}

CheckTweak() {
    local ID="$1" Output Live Desired
    [ "$ID" != "QDISC" ] || { CheckQDISC; return; }
    Output=$(LiveTweak "$ID") || return
    [ -n "$Output" ] || return 0
    if [ "$(ReadTweak Persistent)" = "ON" ]; then
        Live=$(TweakState "$ID" "$Output") || return
        Desired=$(ReadTweak "$ID")
        case "$Desired" in
            ON | OFF)
                if [ "$Live" != "$Desired" ]; then
                    RunTweak "$ID" "$Desired" || return
                    Output=$(LiveTweak "$ID") || return
                fi
                ;;
        esac
    fi
    printf '%s\n' "$Output"
}

CheckQDISC() {
    local Output D Current Desired Changed=0
    Output=$(ListQDISC) || return
    [ -n "$Output" ] || return 0
    if [ "$(ReadTweak Persistent)" = "ON" ]; then
        while read -r D Current; do
            [ "$D" = "-" ] && continue
            Desired=$(ReadTweak "QDISC:$D")
            [ -n "$Desired" ] || Desired=$(ReadTweak "QDISC:all")
            [ -n "$Desired" ] || continue
            if [ "$Current" != "$Desired" ]; then
                RunTweak QDISC "$Desired" "$D" > /dev/null || return
                Changed=1
            fi
        done <<EOF
$Output
EOF
        if [ "$Changed" -eq 1 ]; then
            Output=$(ListQDISC) || return
        fi
    fi
    printf '%s\n' "$Output"
}

RestoreTweaks() {
    [ "$(ReadTweak Persistent)" = "ON" ] || return 0
    local Key Value Target
    for Key in "IP Reach Disconnect" "Wi-Fi Force Low Latency Mode"; do
        Value=$(ReadTweak "$Key")
        case "$Value" in
            ON | OFF) RunTweak "$Key" "$Value" || Log RestoreFail "$Key : apply failed" ;;
        esac
    done

    Value=$(ReadTweak "QDISC:all")
    [ -z "$Value" ] || RunTweak QDISC "$Value" all || Log RestoreFail "QDISC:all : apply failed"
    [ -f "$Tweaks" ] || return 0
    awk -F'"' '{ for (I = 2; I <= NF; I += 4) print $I "=" $(I + 2) }' "$Tweaks" 2> /dev/null | while IFS='=' read -r Key Value; do
        case "$Key" in
            QDISC:*)
                Target=${Key#QDISC:}
                [ "$Target" = "all" ] && continue
                RunTweak QDISC "$Value" "$Target" || Log RestoreFail "$Key : apply failed"
                ;;
        esac
    done
}

Diagnose() {
    local Arch="Unsupported" DmesgLines WifiLines Pending="$Core/.Diagnose.tmp" Stamp BinPath
    case "$ABI" in arm64*) Arch="Supported (arm64)" ;; armeabi*) Arch="Supported (arm)" ;; esac
    Stamp=$(date '+%F %T')

    {
        echo "[$Stamp] Diagnose: ABI=$ABI Architecture=$Arch"
        printf '[%s] Diagnose: device=%s %s android=%s kernel=%s\n' "$Stamp" "$Brand" "$Model" "$Android" "$Kernel"
        echo "[$Stamp] Diagnose: module=$(sed -n 's/^version=//p' "$Identity" 2> /dev/null)"
        for Bin in ping awk tc resetprop; do
            BinPath=$(command -v "$Bin" 2> /dev/null)
            [ -n "$BinPath" ] && echo "[$Stamp] Diagnose: $Bin found at $BinPath" || echo "[$Stamp] Diagnose: $Bin MISSING"
        done
        if ProbeWrite "$Core"; then
            echo "[$Stamp] Diagnose: $Core writable"
        else
            echo "[$Stamp] Diagnose: $Core NOT writable"
            echo "[$Stamp] Diagnose: mount -- $(mount 2> /dev/null | grep -E ' /data |modules' | tr '\n' ' ')"
        fi
        DmesgLines=$(dmesg 2> /dev/null | grep -iE "f2fs|erofs|remount" | tail -5)
        [ -n "$DmesgLines" ] && printf '%s\n' "$DmesgLines" | while IFS= read -r Line; do [ -n "$Line" ] && echo "[$Stamp] Diagnose: dmesg -- $Line"; done
        WifiLines=$(dumpsys wifi 2> /dev/null | grep -E 'Wi-Fi is|Dump of ClientModeImpl|curState=|Supplicant state|mPowerSaveDisableRequests' | head -20)
        [ -n "$WifiLines" ] && printf '%s\n' "$WifiLines" | while IFS= read -r Line; do [ -n "$Line" ] && echo "[$Stamp] Diagnose: wifi -- $Line"; done
    } > "$Pending" 2> /dev/null

    FlushDiagnose
}

FlushDiagnose() {
    local Pending="$Core/.Diagnose.tmp" ExistingLines=""
    [ -f "$Pending" ] || return 0
    [ -w "${LogPath%/*}" ] || return 1

    [ -f "$LogPath" ] && ExistingLines=$(grep -v "Diagnose:" "$LogPath" 2> /dev/null | grep -vE '^\s*\[\s*[0-9]+\.[0-9]+\]')

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
        "$Brand" "$Model" "$Android" "$Kernel" "$ABI" "$Root")"
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

case "${1:-}" in
    persistent)
        case "${2:-}" in
            "") ReadTweak Persistent ;;
            ON | OFF) SaveTweak Persistent "$2" ;;
            *) exit 1 ;;
        esac
        exit
        ;;
    apply)
        shift
        ApplyTweak "$@"
        exit
        ;;
    check)
        shift
        CheckTweak "$@"
        exit
        ;;
    probe-qdisc)
        ProbeQDISC
        exit
        ;;
    restore)
        RestoreTweaks
        exit
        ;;
esac

until [ "$(resetprop sys.boot_completed)" = "1" ]; do sleep 3; done
sleep 3

Brand=$(resetprop ro.product.brand)
Model=$(resetprop ro.product.model)
Android=$(resetprop ro.build.version.release)
Kernel=$(uname -r)
ABI=$(resetprop ro.product.cpu.abi)

Diagnose

if [ -f "$ProcessID" ]; then
    read -r Line < "$ProcessID" 2> /dev/null
    OldPID="${Line#*\"PID\":}"
    OldPID="${OldPID%%[!0-9]*}"
    [ -n "$OldPID" ] && kill -0 "$OldPID" 2> /dev/null && exit 0
fi
ProcessID
trap Cleanup TERM EXIT INT

RestoreTweaks
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
