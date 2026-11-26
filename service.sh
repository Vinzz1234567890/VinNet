#!/system/bin/sh
ModuleDirectory="${0%/*}"
Core="/data/adb/VinNet"
LogPath="$Core/VinNet.log"
LogLevel=Error
LogBuffer=32k
LogBufferBytes=32768
NL='
'

LogAllows() {
    case "$LogLevel:$1" in
        Off:* | Error:[ID]* | Info:D*) return 1 ;;
    esac
}

LogAdd() {
    local Message="$3"
    [ -n "$Message" ] && LogAllows "$1" || return 0
    case "$Message" in
        *"$NL"*) Message=$(printf '%s\n' "$Message" | awk 'NF { printf "%s%s", S, $0; S = " | " }') ;;
    esac
    [ -n "$LogStamp" ] || LogStamp=$(date '+%F %T')
    LogBatch="$LogBatch${LogBatch:+$NL}[$LogStamp] ${1%"${1#?}"} $2: $Message"
}

Log() {
    local LogBatch="" LogStamp=""
    LogAdd "${3:-Error}" "$1" "$2"
    [ -z "$LogBatch" ] || LogWrite "$LogBatch"
    return 0
}

LogLock() {
    local Waited=0
    while ! mkdir "$LogPath.lock" 2> /dev/null; do
        Waited=$((Waited + 1))
        if [ "$Waited" -gt 100 ]; then rm -rf "$LogPath.lock"; mkdir "$LogPath.lock" 2> /dev/null; break; fi
        sleep 0.1
    done
}

LogWrite() {
    local Lines="$1" Pending="$Core/.Diagnose.tmp" Input="$LogPath" Temp="$LogPath.tmp.$$.$RANDOM" Status=0
    if [ ! -w "${LogPath%/*}" ]; then
        [ -z "$Lines" ] || printf '%s\n' "$Lines" >> "$Pending" 2> /dev/null
        return 1
    fi
    LogLock
    [ -f "$Pending" ] && Lines="$(cat "$Pending" 2> /dev/null)${Lines:+$NL$Lines}"
    if [ -z "$Lines" ]; then
        :
    else
        [ -f "$Input" ] || Input=/dev/null
        L="$Lines" awk '
            BEGIN { N = split(ENVIRON["L"], New, "\n"); for (I = 1; I <= N; I++) Last[substr(New[I], index(New[I], "] ") + 2)] = I }
            { K = substr($0, index($0, "] ") + 2); if (!(K in Last)) print }
            END { for (I = 1; I <= N; I++) if (New[I] != "" && Last[substr(New[I], index(New[I], "] ") + 2)] == I) print New[I] }
        ' "$Input" > "$Temp" 2> /dev/null && mv -f "$Temp" "$LogPath" 2> /dev/null || { rm -f "$Temp"; Status=1; }
    fi
    [ "$Status" -ne 0 ] || [ ! -f "$Pending" ] || rm -f "$Pending"
    rm -rf "$LogPath.lock"
    return "$Status"
}

LogTrim() {
    local Temp="$LogPath.tmp.$$.$RANDOM"
    LogLock
    tail -c "$LogBufferBytes" "$LogPath" 2> /dev/null | sed 1d > "$Temp" 2> /dev/null && mv -f "$Temp" "$LogPath" 2> /dev/null || rm -f "$Temp"
    rm -rf "$LogPath.lock"
}

LogFilter() {
    [ -f "$LogPath" ] || return 0
    local Temp="$LogPath.tmp.$$.$RANDOM"
    LogLock
    awk -v lvl="$LogLevel" '
        BEGIN { r["E"] = 1; r["I"] = 2; r["D"] = 3; m = (lvl == "Error" ? 1 : (lvl == "Info" ? 2 : 3)) }
        /^\[/ { L = substr($0, index($0, "] ") + 2, 1); if (L in r && r[L] > m) next }
        { K = substr($0, index($0, "] ") + 2); Lines[++N] = $0; Last[K] = N }
        END { for (I = 1; I <= N; I++) if (Last[substr(Lines[I], index(Lines[I], "] ") + 2)] == I) print Lines[I] }
    ' "$LogPath" > "$Temp" 2> /dev/null && mv -f "$Temp" "$LogPath" 2> /dev/null || rm -f "$Temp"
    rm -rf "$LogPath.lock"
}

ProbeWrite() { ( : > "$1/.WriteProbe" ) 2> /dev/null && rm -f "$1/.WriteProbe"; }

mkdir -p "$Core" 2> /dev/null

Monitor="$Core/Monitor.json"
Environment="$Core/Environment.json"
Metadata="$Core/Metadata.json"
ProcessID="$Core/ProcessID.json"
Tweaks="$Core/Tweaks.json"
Identity="$ModuleDirectory/module.prop"
CoreWritable=1

ResolveTC() {
    local T
    TC=$(command -v tc)
    for T in /sbin/tc /product/bin/tc /system_ext/bin/tc /system/bin/tc /system/xbin/tc /odm/bin/tc /vendor/bin/tc; do
        [ -x "$T" ] && "$T" -V > /dev/null 2>&1 && TC="$T" && break
    done
}
ResolveTC
BootRestored=0

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
    return 1
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

ReadLogLevel() {
    LogLevel=$(ReadTweak LogLevel)
    case "$LogLevel" in Off | Info | Debug) ;; *) LogLevel=Error ;; esac
}

ReadLogBuffer() {
    local V
    V=$(ReadTweak LogBuffer)
    case "$V" in 2k | 8k | 32k | 128k | 512k) LogBuffer=$V ;; *) LogBuffer=32k ;; esac
    case "$LogBuffer" in
        2k) LogBufferBytes=2048 ;;
        8k) LogBufferBytes=8192 ;;
        32k) LogBufferBytes=32768 ;;
        128k) LogBufferBytes=131072 ;;
        512k) LogBufferBytes=524288 ;;
    esac
}

ReadLogLevel
ReadLogBuffer

TxQueueLen() {
    local L=""
    [ -n "$1" ] && read -r L 2> /dev/null < "/sys/class/net/$1/tx_queue_len"
    printf '%s\n' "$L"
}

QDISCSpec() {
    case "$1" in
        pfifo_fast) printf 'pfifo_fast\n' ;;
        fq_codel) printf 'fq_codel limit 1024 quantum 314\n' ;;
        cake)
            local Up
            Up=$(ReadTweak UpMbit)
            case "$Up" in
                '' | *[!0-9]*) printf 'cake besteffort\n' ;;
                *) printf 'cake bandwidth %skbit besteffort\n' "$((Up * 900))" ;;
            esac
            ;;
        fq) printf 'fq limit 1000 flow_limit 50\n' ;;
        sfq) printf 'sfq divisor 4096 headdrop\n' ;;
        codel) printf 'codel\n' ;;
        pie) printf 'pie bytemode\n' ;;
        fq_pie) printf 'fq_pie limit 1024 quantum 314b\n' ;;
        hhf) printf 'hhf admit_bytes 32768 non_hh_weight 4\n' ;;
        sfb)
            local L
            L=$(TxQueueLen "$2")
            if [ -n "$L" ]; then
                L=$((L / 5))
                printf 'sfb limit %s penalty_rate 500 penalty_burst 100\n' "$L"
            else
                printf 'sfb penalty_rate 500 penalty_burst 100\n'
            fi
            ;;
        *) return 1 ;;
    esac
}

Interfaces() {
    local P D F
    for P in /sys/class/net/*; do
        [ -e "$P" ] || continue
        D=${P##*/}
        case "$D" in
            lo | dummy* | tun* | tap* | sit* | ip6tnl* | veth* | bond* | bridge* | vxlan* | geneve* | gre* | gretap* | erspan* | ipsec* | xfrm* | wg* | ifb*) continue ;;
            v4-* | v6-* | clat* | 464*) continue ;;
            p2p* | ap* | swlan* | wlan0h* | wlan0bss* | aware* | nan* | ccmni-lan* | ccmni_lan*) continue ;;
            r_rmnet* | rmnet_ctl | ncm* | rndis* | usb* | radio* | rmtfs*) continue ;;
            wlan* | rmnet* | ccmni* | seth_lte* | sipa* | pdp* | gprs | ppp* | wwan* | eth* | enp* | ens* | eno*) ;;
            *) continue ;;
        esac
        F=""
        read -r F 2> /dev/null < "$P/flags"
        [ -n "$F" ] && [ $((F & 1)) -eq 1 ] || continue
        printf '%s\n' "$D"
    done
}

QDISCLeaf() {
    case "$1" in
        pfifo_fast | fq_codel | cake | fq | sfq | codel | pie | fq_pie | hhf | sfb) return 0 ;;
    esac
    return 1
}

EgressLines() {
    awk '
        {
            Kind = $2; Where = ""
            for (I = 3; I <= NF; I++) {
                if ($I == "parent") { Where = $(I + 1); break }
                if ($I == "root") { Where = "root"; break }
            }
        }
        Where == "root" { print Kind, "root"; next }
        Where == "" { next }
        Kind == "clsact" || Kind == "ingress" { next }
        Where ~ /^ffff:/ { next }
        Where !~ /^[0-9A-Fa-f]+:/ { print Kind, "lossy"; next }
        { print Kind, Where }
    '
}

ApplyInterface() {
    local D="$1" Key="$2" Spec="$3" Kind Handle Output Lines Kids RootKind Lossy Changed=0 ErrorOutput Done=""
    if ! Output=$("$TC" qdisc show dev "$D" 2> /dev/null); then
        Log ApplyFail "QDISC:$D : $Key | structure unreadable"
        return 1
    fi
    Lines=$(printf '%s\n' "$Output" | EgressLines)
    Kids=$(printf '%s\n' "$Lines" | awk '$2 != "root" && $2 != "lossy"')
    RootKind=$(printf '%s\n' "$Lines" | awk '$2 == "root" { print $1; exit }')
    printf '%s\n' "$Lines" | grep -q ' lossy$' && Lossy=1
    if QDISCLeaf "$Key" && { [ -n "$Kids" ] || [ -n "$Lossy" ]; }; then
        if [ -z "$Kids" ] && [ "$RootKind" = "mq" ]; then
            ErrorOutput=$("$TC" qdisc replace dev "$D" root $RootKind 2>&1)
            if [ $? -eq 0 ]; then
                Log QDISC "$D | $RootKind root rebuilt to expose its queues" Debug
                Output=$("$TC" qdisc show dev "$D" 2> /dev/null)
                Lines=$(printf '%s\n' "$Output" | EgressLines)
                Kids=$(printf '%s\n' "$Lines" | awk '$2 != "root" && $2 != "lossy"')
            else
                Log ApplyFail "QDISC:$D : $Key | $RootKind rebuild failed | ${ErrorOutput:-tc failed}"
            fi
        fi
        if [ -z "$Kids" ]; then
            Log ApplyFail "QDISC:$D : $Key | queues unaddressable | root $RootKind"
            return 1
        fi
        while read -r Kind Handle; do
            [ -n "$Handle" ] || continue
            if ErrorOutput=$("$TC" qdisc replace dev "$D" parent "$Handle" $Spec 2>&1); then
                Changed=1
                Done="$Done $Handle"
            else
                Log ApplyFail "QDISC:$D : $Key | parent $Handle | ${ErrorOutput:-tc failed}"
            fi
        done <<EOF
$Kids
EOF
        [ "$Changed" -eq 1 ] || return 1
        Log QDISC "$D | root ${RootKind:-none} kept | parents$Done -> $Spec" Debug
        return 0
    fi
    ErrorOutput=$("$TC" qdisc replace dev "$D" root $Spec 2>&1) || {
        Log ApplyFail "QDISC:$D : $Key | ${ErrorOutput:-tc failed}"
        return 1
    }
    Log QDISC "$D | root ${RootKind:-none} -> $Spec" Debug
    return 0
}

ApplyLeaf() {
    ApplyInterface "$1" "$2" "$3" && return 0
    [ "$2" = cake ] || return 1
    ApplyInterface "$1" "$2" cake || return 1
    Log QDISC "$1 | cake tuned spec unsupported, applied bare cake" Info
}

ApplyQDISC() {
    local Key="$1" Target="${2:-all}" Spec D Seen=0 Changed=0
    QDISCSpec "$Key" > /dev/null || { Log ApplyFail "QDISC : $Key is not a supported value"; return 1; }
    if [ "$Target" != "all" ]; then
        Spec=$(QDISCSpec "$Key" "$Target")
        ApplyLeaf "$Target" "$Key" "$Spec" || return
        Log Apply "QDISC:$Target : $Key" Info
        printf '%s\n' "$Target"
        return 0
    fi
    for D in $(Interfaces); do
        Seen=$((Seen + 1))
        Spec=$(QDISCSpec "$Key" "$D")
        if ApplyLeaf "$D" "$Key" "$Spec"; then
            Changed=1
            Log Apply "QDISC:$D : $Key" Info
        fi
    done
    [ "$Seen" -gt 0 ] || Log ApplyFail "QDISC:all : $Key | no eligible interface"
    [ "$Changed" -eq 1 ]
}

ListQDISC() {
    local D Found=0
    for D in $(Interfaces); do
        Found=1
        (
            local Output Lines Kids Kind
            if Output=$("$TC" qdisc show dev "$D" 2> /dev/null); then
                Lines=$(printf '%s\n' "$Output" | EgressLines)
                Kids=$(printf '%s\n' "$Lines" | awk '$2 != "root"')
                if [ -n "$Kids" ]; then
                    Kind=$(printf '%s\n' "$Kids" | awk '{ if (First == "") First = $1; if ($1 != First) Diff = 1 } END { print (Diff ? "custom" : First) }')
                else
                    Kind=$(printf '%s\n' "$Lines" | awk '$2 == "root" { print $1; exit }')
                fi
                printf '%s %s\n' "$D" "${Kind:-none}"
            else
                printf '%s %s\n' "$D" unknown
            fi
        ) &
    done
    wait
    [ "$Found" -eq 1 ] || printf '%s\n' '- -'
}

ProbeQDISC() {
    command -v "$TC" > /dev/null 2>&1 || return 1
    local Key Accepted="" Rejected=""
    for Key in pfifo_fast fq_codel cake fq sfq codel pie fq_pie hhf sfb; do
        if "$TC" qdisc replace dev lo root $Key 2> /dev/null; then
            printf '%s\n' "$Key"
            Accepted="$Accepted $Key"
        else
            Rejected="$Rejected $Key"
        fi
    done
    "$TC" qdisc del dev lo root 2> /dev/null
    Log Probe "QDISC on lo | accepted:${Accepted:- none} | rejected:${Rejected:- none}" Debug
    return 0
}

RunTweak() {
    local Out HiOut Status HiStatus Set W B1 B2 B3
    case "$1:$2" in
        "IP Reach Disconnect:ON" | "IP Reach Disconnect:OFF")
            Set=$([ "$2" = "ON" ] && echo disabled || echo enabled)
            Out=$(cmd wifi set-ipreach-disconnect "$Set" 2>&1)
            Status=$?
            case "$Out" in *"Command execution failed"*) Status=1 ;; esac
            if [ "$Status" -ne 0 ]; then
                Log ApplyFail "$1 : $2 | ${Out:-cmd failed}"
                return 1
            fi
            ;;
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
                Log Apply "Wi-Fi Force Low Latency Mode : ON | low-latency rejected, hi-perf used | ${Out:-no output}" Debug
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
        "QDISC:"*)
            W=0
            while ! mkdir "$Core/.qdisc.lock" 2> /dev/null; do
                W=$((W + 1))
                if [ "$W" -gt 100 ]; then rm -rf "$Core/.qdisc.lock"; mkdir "$Core/.qdisc.lock" 2> /dev/null; break; fi
                sleep 0.1
            done
            ApplyQDISC "$2" "${3:-all}"
            W=$?
            rm -rf "$Core/.qdisc.lock"
            return "$W"
            ;;
        "TCP Slow Start After Idle:ON")
            Out=$(sysctl -w net.ipv4.tcp_slow_start_after_idle=0 2>&1)
            Status=$?
            if [ "$Status" -ne 0 ]; then
                Log ApplyFail "$1 : $2 | ${Out:-sysctl failed}"
                return 1
            fi
            ;;
        "TCP Slow Start After Idle:OFF")
            Out=$(sysctl -w net.ipv4.tcp_slow_start_after_idle=1 2>&1)
            Status=$?
            if [ "$Status" -ne 0 ]; then
                Log ApplyFail "$1 : $2 | ${Out:-sysctl failed}"
                return 1
            fi
            ;;
        "Optimize NetDev:ON")
            if [ -z "$(ReadTweak NetDevDefault)" ]; then
                SaveTweak NetDevDefault "$(sysctl -n net.core.netdev_max_backlog 2> /dev/null) $(sysctl -n net.core.netdev_budget 2> /dev/null) $(sysctl -n net.core.netdev_budget_usecs 2> /dev/null)"
            fi
            Out=$(sysctl -w net.core.netdev_max_backlog=1000 net.core.netdev_budget=900 net.core.netdev_budget_usecs=6000 2>&1)
            Status=$?
            if [ "$Status" -ne 0 ]; then
                Log ApplyFail "$1 : $2 | ${Out:-sysctl failed}"
                return 1
            fi
            ;;
        "Optimize NetDev:OFF")
            read -r B1 B2 B3 <<EOF
$(ReadTweak NetDevDefault)
EOF
            Out=$(sysctl -w net.core.netdev_max_backlog="${B1:-1000}" net.core.netdev_budget="${B2:-300}" net.core.netdev_budget_usecs="${B3:-2000}" 2>&1)
            Status=$?
            if [ "$Status" -ne 0 ]; then
                Log ApplyFail "$1 : $2 | ${Out:-sysctl failed}"
                return 1
            fi
            ;;
        *) return 1 ;;
    esac
}

ApplyLowLatency() {
    local Last="" Desired Err Output
    while :; do
        Desired=$(ReadTweak "Wi-Fi Force Low Latency Mode")
        case "$Desired" in ON | OFF) ;; *) return ;; esac
        [ "$Desired" = "$Last" ] && return
        if Err=$(RunTweak "Wi-Fi Force Low Latency Mode" "$Desired" 2>&1); then
            Output=$(LiveTweak "Wi-Fi Force Low Latency Mode")
            if [ -z "$Output" ]; then
                Log Apply "Wi-Fi Force Low Latency Mode : $Desired | live state unreadable" Info
            elif [ "$(TweakState "Wi-Fi Force Low Latency Mode" "$Output")" != "$Desired" ]; then
                Log TweakFail "Wi-Fi Force Low Latency Mode : $Desired | live mask $Output"
            else
                Log Apply "Wi-Fi Force Low Latency Mode : $Desired" Info
            fi
        else
            Log TweakFail "Wi-Fi Force Low Latency Mode : $Desired | ${Err:-apply failed}"
        fi
        Last="$Desired"
    done
}

ApplyTweak() {
    local Output Live SaveFailed=0
    case "$1:$2" in
        "Wi-Fi Force Low Latency Mode:ON" | "Wi-Fi Force Low Latency Mode:OFF")
            SaveTweak "$1" "$2" || {
                Log TweakSave "$1 : $2 | apply skipped, intent not persisted"
                return 1
            }
            if [ -n "$VINNET_TEST_SYNC" ]; then
                ApplyLowLatency
            else
                (ApplyLowLatency) < /dev/null > /dev/null 2>&1 &
            fi
            ;;
        *)
            if [ "$1" = "QDISC" ]; then
                SaveTweak "QDISC:${3:-all}" "$2" || {
                    Log TweakSave "QDISC:${3:-all} : $2 | apply skipped, intent not persisted"
                    return 1
                }
                if [ -n "$VINNET_TEST_SYNC" ]; then
                    RunTweak "$@"
                else
                    (RunTweak "$@") < /dev/null > /dev/null 2>&1 &
                fi
            else
                RunTweak "$@" || return
                Output=$(LiveTweak "$1") || {
                    Log VerifyFail "$1 : $2 | live state unreadable"
                    return 1
                }
                Live=$(TweakState "$1" "$Output") || {
                    Log VerifyFail "$1 : $2 | unexpected live value [$Output]"
                    return 1
                }
                [ "$Live" = "$2" ] || {
                    Log VerifyFail "$1 : $2 | system reports $Live"
                    return 1
                }
                Log Apply "$1 : $2" Info
                SaveTweak "$1" "$2" || SaveFailed=1
            fi
            ;;
    esac
    if [ "$SaveFailed" -eq 1 ]; then
        Log TweakSave "$1 : $2${3:+ | target $3} | applied, but state not persisted"
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
        "TCP Slow Start After Idle")
            printf '%s\n' "$(sysctl -n net.ipv4.tcp_slow_start_after_idle 2> /dev/null)"
            ;;
        "Optimize NetDev")
            if [ "$(sysctl -n net.core.netdev_max_backlog 2> /dev/null)" = "1000" ] && [ "$(sysctl -n net.core.netdev_budget 2> /dev/null)" = "900" ] && [ "$(sysctl -n net.core.netdev_budget_usecs 2> /dev/null)" = "6000" ]; then
                printf '0\n'
            else
                printf '1\n'
            fi
            ;;
        *) return 1 ;;
    esac
}

TweakState() {
    case "$1" in
        "IP Reach Disconnect") case "$2" in *false*) printf 'ON\n' ;; *) printf 'OFF\n' ;; esac ;;
        "Wi-Fi Force Low Latency Mode") case "$2" in 2 | 3) printf 'ON\n' ;; *) printf 'OFF\n' ;; esac ;;
        "TCP Slow Start After Idle") case "$2" in 0) printf 'ON\n' ;; *) printf 'OFF\n' ;; esac ;;
        "Optimize NetDev") case "$2" in 0) printf 'ON\n' ;; *) printf 'OFF\n' ;; esac ;;
        *) return 1 ;;
    esac
}

CheckTweak() {
    local ID="$1" Output Live="" Desired=""
    [ "$ID" != "QDISC" ] || { CheckQDISC; return; }
    Output=$(LiveTweak "$ID") || return
    [ -n "$Output" ] || return 0
    if [ "$(ReadTweak Persistent)" = "ON" ]; then
        Live=$(TweakState "$ID" "$Output") || return
        Desired=$(ReadTweak "$ID")
        case "$Desired" in
            ON | OFF)
                if [ "$Live" != "$Desired" ]; then
                    Log Check "$ID | live $Live, desired $Desired, re-applying" Debug
                    RunTweak "$ID" "$Desired" || Log RestoreFail "$ID : $Desired re-apply failed"
                    Output=$(LiveTweak "$ID") || return
                    Live=$(TweakState "$ID" "$Output")
                    if [ "$Live" = "$Desired" ]; then
                        Log Apply "$ID : $Desired | re-applied by check" Info
                    else
                        Log RestoreFail "$ID : $Desired | system still reports $Live"
                    fi
                fi
                ;;
        esac
    fi
    LogAllows Debug && Log Check "$ID | live ${Live:-$(TweakState "$ID" "$Output")}${Desired:+, desired $Desired}" Debug
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
            case "$Current" in none | unknown) continue ;; esac
            if [ "$Current" != "$Desired" ]; then
                Log Check "QDISC:$D | live $Current, desired $Desired, re-applying" Debug
                RunTweak QDISC "$Desired" "$D" > /dev/null || Log RestoreFail "QDISC:$D : $Desired re-apply failed"
                Changed=1
            fi
        done <<EOF
$Output
EOF
        if [ "$Changed" -eq 1 ]; then
            Output=$(ListQDISC) || return
        fi
    fi
    Log Check "QDISC | live $Output" Debug
    printf '%s\n' "$Output"
}

RestoreTweaks() {
    if [ "$(ReadTweak Persistent)" != "ON" ]; then
        Log Restore "boot restore skipped | Persistent Tweaks OFF" Debug
        return 0
    fi
    local Key Value Target
    for Key in "IP Reach Disconnect" "Wi-Fi Force Low Latency Mode" "TCP Slow Start After Idle" "Optimize NetDev"; do
        Value=$(ReadTweak "$Key")
        case "$Value" in
            ON | OFF)
                if RunTweak "$Key" "$Value"; then
                    Log Apply "$Key : $Value | boot restore" Info
                else
                    Log RestoreFail "$Key : $Value | boot restore failed"
                fi
                ;;
        esac
    done

    Value=$(ReadTweak "QDISC:all")
    [ -z "$Value" ] || RunTweak QDISC "$Value" all || Log RestoreFail "QDISC:all : $Value | boot restore failed"
    [ -f "$Tweaks" ] || return 0
    awk -F'"' '{ for (I = 2; I <= NF; I += 4) print $I "=" $(I + 2) }' "$Tweaks" 2> /dev/null | while IFS='=' read -r Key Value; do
        case "$Key" in
            QDISC:*)
                Target=${Key#QDISC:}
                [ "$Target" = "all" ] && continue
                RunTweak QDISC "$Value" "$Target" || Log RestoreFail "$Key : $Value | boot restore failed"
                ;;
        esac
    done
}

Diagnose() {
    local Arch="Unsupported" Bin Line Lines LogBatch="" LogStamp=""
    LogAllows Error || return 0
    case "$ABI" in arm64*) Arch="Supported (arm64)" ;; armeabi*) Arch="Supported (arm)" ;; esac
    if LogAllows Info; then
        LogAdd Info Diagnose "ABI=$ABI Architecture=$Arch"
        LogAdd Info Diagnose "device=$Brand $Model android=$Android kernel=$Kernel"
        LogAdd Info Diagnose "module=$(sed -n 's/^version=//p' "$Identity" 2> /dev/null)"
    fi
    for Bin in ping awk tc resetprop; do
        if ! command -v "$Bin" > /dev/null 2>&1; then
            LogAdd Error Diagnose "$Bin MISSING"
        elif LogAllows Debug; then
            LogAdd Debug Diagnose "$Bin found at $(command -v "$Bin")"
        fi
    done
    if ProbeWrite "$Core"; then
        LogAdd Debug Diagnose "$Core writable"
    else
        LogAdd Error Diagnose "$Core NOT writable | mount -- $(mount 2> /dev/null | grep -E ' /data |modules')"
    fi
    if LogAllows Debug; then
        Lines=$(dmesg 2> /dev/null | grep -iE "f2fs|erofs|remount" | tail -5)
        while IFS= read -r Line; do [ -z "$Line" ] || LogAdd Debug Diagnose "dmesg -- $Line"; done <<EOF
$Lines
EOF
        Lines=$(dumpsys wifi 2> /dev/null | grep -E 'Wi-Fi is|Dump of ClientModeImpl|curState=|Supplicant state|mPowerSaveDisableRequests' | head -20)
        while IFS= read -r Line; do [ -z "$Line" ] || LogAdd Debug Diagnose "wifi -- $Line"; done <<EOF
$Lines
EOF
    fi
    [ -z "$LogBatch" ] || LogWrite "$LogBatch"
}

ProcessID() { Write "$ProcessID" "$(printf '{"PID":%s,"Timestamp":%s}\n' "$$" "$(date +%s)")"; }

IsDaemon() {
    local C
    [ -n "$1" ] && kill -0 "$1" 2> /dev/null || return 1
    C=$(tr '\0' ' ' 2> /dev/null < "/proc/$1/cmdline")
    [ -z "$C" ] || case "$C" in *service.sh*) return 0 ;; *) return 1 ;; esac
}

RecordedPID() {
    [ -f "$ProcessID" ] || return 1
    local Line
    read -r Line 2> /dev/null < "$ProcessID"
    Line="${Line#*\"PID\":}"
    Line="${Line%%[!0-9]*}"
    IsDaemon "$Line" || return 1
    printf '%s\n' "$Line"
}

StartDaemon() {
    if command -v setsid > /dev/null 2>&1; then
        setsid sh "$0" < /dev/null > /dev/null 2>&1 &
    else
        ( trap '' HUP; sh "$0" ) < /dev/null > /dev/null 2>&1 &
    fi
}

Cleanup() {
    local T P
    rm -f "$ProcessID" "$Core"/*.tmp.$$ "$Core/.Diagnose.tmp" "$LogPath".tmp.* 2> /dev/null
    for T in "$Core"/*.tmp.*; do
        [ -e "$T" ] || continue
        P=${T##*.tmp.}
        case "$P" in *[!0-9]* | "") continue ;; esac
        kill -0 "$P" 2> /dev/null || rm -f "$T" 2> /dev/null
    done
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
                Log Monitor "latency $Latency ms, jitter $Jitter ms" Debug
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
            ON | OFF)
                SaveTweak Persistent "$2" || exit 1
                Log Settings "Persistent Tweaks : $2" Info
                exit 0
                ;;
            *) exit 1 ;;
        esac
        exit
        ;;
    log_level)
        case "${2:-}" in
            "") printf '%s\n' "$LogLevel" ;;
            Off)
                SaveTweak LogLevel Off || exit 1
                rm -f "$LogPath" "$LogPath".tmp.* "$Core/.Diagnose.tmp" 2> /dev/null
                ;;
            Error | Info | Debug)
                SaveTweak LogLevel "$2" || exit 1
                LogLevel="$2"
                (LogFilter; Log Settings "Log Level : $2" Info) < /dev/null > /dev/null 2>&1 &
                ;;
            *) exit 1 ;;
        esac
        exit 0
        ;;
    log_buffer)
        case "${2:-}" in
            "") printf '%s\n' "$LogBuffer" ;;
            2k | 8k | 32k | 128k | 512k) SaveTweak LogBuffer "$2" || exit 1 ;;
            *) exit 1 ;;
        esac
        exit 0
        ;;
    theme)
        case "${2:-}" in
            "") Theme=$(ReadTweak Theme)
                printf '%s\n' "${Theme:-Material}"
                ;;
            Material | MiuiX) SaveTweak Theme "$2" || exit 1 ;;
            *) exit 1 ;;
        esac
        exit 0
        ;;
    export_log)
        [ -f "$LogPath" ] && [ -s "$LogPath" ] || { printf 'EMPTY\n' >&2; exit 2; }
        Content=$(cat "$LogPath" 2> /dev/null)
        [ -n "$Content" ] || { printf 'EMPTY\n' >&2; exit 2; }
        am start --user 0 -a android.intent.action.SEND -t "text/plain" --es android.intent.extra.TEXT "$Content" > /dev/null 2>&1 || exit 1
        exit 0
        ;;
    log)
        shift
        LogBatch="" LogStamp=""
        for Line in "$@"; do
            Level=${Line%% *}
            Line=${Line#* }
            LogAdd "$Level" "${Line%%: *}" "${Line#*: }"
        done
        [ -z "$LogBatch" ] || LogWrite "$LogBatch"
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
    status)
        RecordedPID && exit 0
        rm -f "$ProcessID" 2> /dev/null
        exit 1
        ;;
    start)
        RecordedPID > /dev/null && exit 0
        W=0
        until mkdir "$Core/.start.lock" 2> /dev/null; do
            RecordedPID > /dev/null && exit 0
            W=$((W + 1))
            if [ "$W" -gt 50 ]; then rm -rf "$Core/.start.lock"; mkdir "$Core/.start.lock" 2> /dev/null; break; fi
            sleep 0.1
        done
        StartDaemon
        for I in 1 2 3 4 5 6 7 8 9 10; do
            sleep 0.2
            RecordedPID && { rm -rf "$Core/.start.lock"; Log Daemon "restarted on demand" Info; exit 0; }
        done
        rm -rf "$Core/.start.lock"
        Log Daemon "restart failed | spawned process published no PID"
        exit 1
        ;;
    probe-qdisc)
        ProbeQDISC
        exit
        ;;
    restore)
        RestoreTweaks
        exit
        ;;
    uplink)
        case "${2:-}" in
            '' | *[!0-9]*) exit 1 ;;
        esac
        SaveTweak UpMbit "$2" || exit 1
        Log Uplink "$2 Mbps saved for cake bandwidth" Info
        exit 0
        ;;
esac

until [ "$(resetprop sys.boot_completed)" = "1" ]; do sleep 3; done

RecordedPID > /dev/null && exit 0
{ echo -1000 > "/proc/$$/oom_score_adj" || echo 0 > "/proc/$$/oom_score_adj"; } 2> /dev/null
ProcessID
trap Cleanup TERM EXIT INT

sleep 3

Brand=$(resetprop ro.product.brand)
Model=$(resetprop ro.product.model)
Android=$(resetprop ro.build.version.release)
Kernel=$(uname -r)
ABI=$(resetprop ro.product.cpu.abi)

Diagnose

[ "$LogLevel" != Off ] && LogFilter
if [ "$LogLevel" != Off ] && [ -w "${LogPath%/*}" ] && [ -f "$LogPath" ] && [ "$(wc -c 2> /dev/null < "$LogPath")" -gt "$LogBufferBytes" ]; then
    LogTrim
    Log LogTrim "log trimmed to $LogBuffer" Info
fi

if "$TC" -V > /dev/null 2>&1; then
    RestoreTweaks
    BootRestored=1
else
    Log Restore "boot restore deferred | tc not ready" Debug
fi
Metadata
Environment

while true; do
    Now=$(date +%s)
    [ -d "$Core" ] || mkdir -p "$Core" 2> /dev/null
    [ -f "$Core/.Diagnose.tmp" ] && LogWrite ""
    [ -s "$ProcessID" ] || ProcessID
    [ -f "$Metadata" ] || Metadata
    [ -f "$Environment" ] || Environment
    if [ "$BootRestored" -eq 0 ]; then
        ResolveTC
        if "$TC" -V > /dev/null 2>&1; then
            RestoreTweaks
            BootRestored=1
        fi
    fi
    if WebUIActive "$Now"; then
        ReadLogLevel
        ReadLogBuffer
        Monitor "$Now"
        if [ "$LogLevel" != Off ] && [ -f "$LogPath" ] && [ "$(wc -c 2> /dev/null < "$LogPath")" -gt "$LogBufferBytes" ]; then
            LogTrim
        fi
    fi
    sleep 5
done
