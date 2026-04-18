#!/system/bin/sh
until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 5
done
sleep 10
[ -f /proc/sys/net/core/netdev_max_backlog ] && echo "300" >/proc/sys/net/core/netdev_max_backlog                                   # Default netdev_max_backlog=1000, Check via "cat /proc/sys/net/core/netdev_max_backlog"
[ -f /proc/sys/net/core/rmem_default ] && echo "262144" >/proc/sys/net/core/rmem_default                                            # Default rmem_default=212992, Check via "cat /proc/sys/net/core/rmem_default"
[ -f /proc/sys/net/core/rmem_max ] && echo "4194304" >/proc/sys/net/core/rmem_max                                                   # Default rmem_max=16777216, Check via "cat /proc/sys/net/core/rmem_max"
[ -f /proc/sys/net/core/wmem_default ] && echo "262144" >/proc/sys/net/core/wmem_default                                            # Default wmem_default=212992, Check via "cat /proc/sys/net/core/wmem_default"
[ -f /proc/sys/net/core/wmem_max ] && echo "4194304" >/proc/sys/net/core/wmem_max                                                   # Default wmem_max=8388608, Check via "cat /proc/sys/net/core/wmem_max"
[ -f /proc/sys/net/core/somaxconn ] && echo "1024" >/proc/sys/net/core/somaxconn                                                    # Default somaxconn=128, Check via "cat /proc/sys/net/core/somaxconn"
[ -f /proc/sys/net/ipv4/tcp_slow_start_after_idle ] && echo "0" >/proc/sys/net/ipv4/tcp_slow_start_after_idle                       # Default tcp_slow_start_after_idle=1, Check via "cat /proc/sys/net/ipv4/tcp_slow_start_after_idle"
[ -f /proc/sys/net/ipv4/tcp_low_latency ] && echo "1" >/proc/sys/net/ipv4/tcp_low_latency                                           # Default tcp_low_latency=0, Check via "cat /proc/sys/net/ipv4/tcp_low_latency"
[ -f /proc/sys/net/ipv4/tcp_sack ] && echo "1" >/proc/sys/net/ipv4/tcp_sack                                                         # Default tcp_sack=1, Check via "cat /proc/sys/net/ipv4/tcp_sack"
[ -f /proc/sys/net/ipv4/tcp_fack ] && echo "1" >/proc/sys/net/ipv4/tcp_fack                                                         # Default tcp_fack=0, Check via "cat /proc/sys/net/ipv4/tcp_fack"
[ -f /proc/sys/net/ipv4/tcp_window_scaling ] && echo "1" >/proc/sys/net/ipv4/tcp_window_scaling                                     # Default tcp_window_scaling=1, Check via "cat /proc/sys/net/ipv4/tcp_window_scaling"
[ -f /proc/sys/net/ipv4/tcp_moderate_rcvbuf ] && echo "1" >/proc/sys/net/ipv4/tcp_moderate_rcvbuf                                   # Default tcp_moderate_rcvbuf=1, Check via "cat /proc/sys/net/ipv4/tcp_moderate_rcvbuf"
[ -f /proc/sys/net/ipv4/tcp_no_metrics_save ] && echo "1" >/proc/sys/net/ipv4/tcp_no_metrics_save                                   # Default tcp_no_metrics_save=0, Check via "cat /proc/sys/net/ipv4/tcp_no_metrics_save"
[ -f /proc/sys/net/ipv4/tcp_syn_retries ] && echo "2" >/proc/sys/net/ipv4/tcp_syn_retries                                           # Default tcp_syn_retries=4, Check via "cat /proc/sys/net/ipv4/tcp_syn_retries"
[ -f /proc/sys/net/ipv4/tcp_synack_retries ] && echo "2" >/proc/sys/net/ipv4/tcp_synack_retries                                     # Default tcp_synack_retries=3, Check via "cat /proc/sys/net/ipv4/tcp_synack_retries"
[ -f /proc/sys/net/ipv4/tcp_retries2 ] && echo "3" >/proc/sys/net/ipv4/tcp_retries2                                                 # Default tcp_retries2=8, Check via "cat /proc/sys/net/ipv4/tcp_retries2"
[ -f /proc/sys/net/ipv4/tcp_rmem ] && echo "4096 262144 4194304" >/proc/sys/net/ipv4/tcp_rmem                                       # Default tcp_rmem=524288 1048576 2097152, Check via "cat /proc/sys/net/ipv4/tcp_rmem"
[ -f /proc/sys/net/ipv4/tcp_wmem ] && echo "4096 262144 4194304" >/proc/sys/net/ipv4/tcp_wmem                                       # Default tcp_wmem=262144 212992 8388608, Check via "cat /proc/sys/net/ipv4/tcp_wmem"
[ -f /proc/sys/net/ipv4/udp_rmem_min ] && echo "8192" >/proc/sys/net/ipv4/udp_rmem_min                                              # Default udp_rmem_min=4096, Check via "cat /proc/sys/net/ipv4/udp_rmem_min"
[ -f /proc/sys/net/ipv4/udp_wmem_min ] && echo "8192" >/proc/sys/net/ipv4/udp_wmem_min                                              # Default udp_wmem_min=4096, Check via "cat /proc/sys/net/ipv4/udp_wmem_min"
[ -f /proc/sys/net/ipv4/tcp_tw_reuse ] && echo "2" >/proc/sys/net/ipv4/tcp_tw_reuse                                                 # Default tcp_tw_reuse=2, Check via "cat /proc/sys/net/ipv4/tcp_tw_reuse"
[ -f /proc/sys/net/ipv4/tcp_max_syn_backlog ] && echo "1024" >/proc/sys/net/ipv4/tcp_max_syn_backlog                                # Default tcp_max_syn_backlog=128, Check via "cat /proc/sys/net/ipv4/tcp_max_syn_backlog"
[ -f /proc/sys/net/ipv4/tcp_fastopen ] && echo "3" >/proc/sys/net/ipv4/tcp_fastopen                                                 # Default tcp_fastopen=1, Check via "cat /proc/sys/net/ipv4/tcp_fastopen"
[ -f /proc/sys/net/ipv4/neigh/default/delay_first_probe_time ] && echo "1" >/proc/sys/net/ipv4/neigh/default/delay_first_probe_time # Default delay_first_probe_time=5, Check via "cat /proc/sys/net/ipv4/neigh/default/delay_first_probe_time"
[ -f /sys/class/net/wlan0/tx_queue_len ] && echo "1024" >/sys/class/net/wlan0/tx_queue_len                                          # Default tx_queue_len=3000, Check via "cat /sys/class/net/wlan0/tx_queue_len"
[ -f /sys/class/net/rmnet_data0/tx_queue_len ] && echo "1024" >/sys/class/net/rmnet_data0/tx_queue_len                              # Default tx_queue_len=1000, Check via "cat /sys/class/net/rmnet_data0/tx_queue_len"
[ -f /sys/class/net/rmnet_ipa0/tx_queue_len ] && echo "1024" >/sys/class/net/rmnet_ipa0/tx_queue_len                                # Default tx_queue_len=1000, Check via "cat /sys/class/net/rmnet_ipa0/tx_queue_len"

command -v cmd >/dev/null && cmd wifi remove-all-suggestions                              # Default all-suggestions=No suggestions on this device, Check via "cmd wifi list-suggestions"
command -v cmd >/dev/null && cmd wifi set-ipreach-disconnect disabled                     # Default ipreach-disconnect=true, Check via "cmd wifi get-ipreach-disconnect"
command -v cmd >/dev/null && cmd wifi set-network-selection-config disabled disabled -a 0 # Check via "dumpsys wifi | grep -i 'mSufficiencyCheckEnabledWhenScreen'"
command -v cmd >/dev/null && cmd wifi set-scan-always-available disabled                  # Risky script (may reduce GPS accuracy), Default scan-always-available=null, Check via "settings get global wifi_scan_always_enabled"
command -v cmd >/dev/null && cmd wifi force-low-latency-mode enabled
command -v cmd >/dev/null && cmd activity set-ignore-delivery-group-policy com.mobile.legends
command -v cmd >/dev/null && cmd activity set-ignore-delivery-group-policy com.dts.freefiremax
command -v cmd >/dev/null && cmd activity set-ignore-delivery-group-policy com.supercell.clashofclans
command -v cmd >/dev/null && cmd activity set-ignore-delivery-group-policy com.supercell.clashroyale

(
    while [ -d /sys/class/net/wlan0 ]; do
        if command -v iw >/dev/null; then
            iw wlan0 get power_save | grep -q on && iw wlan0 set power_save off # Default power_save=on, Check via "iw wlan0 get power_save"
        fi
        sleep 300
    done
) &

tc qdisc replace dev wlan0 root fq_codel       # Default qdisc=pfifo_fast, Check via "tc qdisc show"
tc qdisc replace dev rmnet_data0 root fq_codel # Default qdisc=pfifo_fast, Check via "tc qdisc show"
tc qdisc replace dev rmnet_ipa0 root fq_codel  # Default qdisc=pfifo_fast, Check via "tc qdisc show"

if [ "$(getprop ro.product.device)" != "fog" ]; then
    VMS="Vendor: Fail (Not fog)"
elif grep -q "VinNet" "/vendor/etc/wifi/WCNSS_qcom_cfg.ini" 2>/dev/null && grep -q "p2p_disabled=1" "/vendor/etc/wifi/wpa_supplicant_overlay.conf" 2>/dev/null; then
    VMS="Vendor: Success"
else
    VMS="Vendor: Fail (No Meta)"
fi
command -v iw >/dev/null && BMS="Binary: Success" || BMS="Binary: Fail (No Meta)"
su shell -c "cmd notification post -S bigtext -t 'VinNet' 'Mount Status' '$VMS | $BMS'"
