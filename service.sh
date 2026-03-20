#!/system/bin/sh
(

    until [ "$(getprop sys.boot_completed)" = "1" ]; do
        sleep 5
    done

    sleep 10

    [ -f /proc/sys/net/core/netdev_max_backlog ] && echo "1000" >/proc/sys/net/core/netdev_max_backlog                                  # Default netdev_max_backlog=1000
    [ -f /proc/sys/net/core/rmem_default ] && echo "212992" >/proc/sys/net/core/rmem_default                                            # Default rmem_default=212992
    [ -f /proc/sys/net/core/rmem_max ] && echo "16777216" >/proc/sys/net/core/rmem_max                                                  # Default rmem_max=16777216
    [ -f /proc/sys/net/core/wmem_default ] && echo "212992" >/proc/sys/net/core/wmem_default                                            # Default wmem_default=212992
    [ -f /proc/sys/net/core/wmem_max ] && echo "8388608" >/proc/sys/net/core/wmem_max                                                   # Default wmem_max=8388608
    [ -f /proc/sys/net/core/somaxconn ] && echo "128" >/proc/sys/net/core/somaxconn                                                     # Default somaxconn=128
    [ -f /proc/sys/net/ipv4/tcp_slow_start_after_idle ] && echo "0" >/proc/sys/net/ipv4/tcp_slow_start_after_idle                       # Default tcp_slow_start_after_idle=1
    [ -f /proc/sys/net/ipv4/tcp_low_latency ] && echo "1" >/proc/sys/net/ipv4/tcp_low_latency                                           # Default tcp_low_latency=0
    [ -f /proc/sys/net/ipv4/tcp_sack ] && echo "1" >/proc/sys/net/ipv4/tcp_sack                                                         # Default tcp_sack=1
    [ -f /proc/sys/net/ipv4/tcp_fack ] && echo "1" >/proc/sys/net/ipv4/tcp_fack                                                         # Default tcp_fack=0
    [ -f /proc/sys/net/ipv4/tcp_window_scaling ] && echo "1" >/proc/sys/net/ipv4/tcp_window_scaling                                     # Default tcp_window_scaling=1
    [ -f /proc/sys/net/ipv4/tcp_moderate_rcvbuf ] && echo "1" >/proc/sys/net/ipv4/tcp_moderate_rcvbuf                                   # Default tcp_moderate_rcvbuf=1
    [ -f /proc/sys/net/ipv4/tcp_no_metrics_save ] && echo "1" >/proc/sys/net/ipv4/tcp_no_metrics_save                                   # Default tcp_no_metrics_save=0
    [ -f /proc/sys/net/ipv4/tcp_syn_retries ] && echo "4" >/proc/sys/net/ipv4/tcp_syn_retries                                           # Default tcp_syn_retries=4
    [ -f /proc/sys/net/ipv4/tcp_synack_retries ] && echo "3" >/proc/sys/net/ipv4/tcp_synack_retries                                     # Default tcp_synack_retries=3
    [ -f /proc/sys/net/ipv4/tcp_retries2 ] && echo "8" >/proc/sys/net/ipv4/tcp_retries2                                                 # Default tcp_retries2=8
    [ -f /proc/sys/net/ipv4/tcp_rmem ] && echo "524288 212992 16777216" >/proc/sys/net/ipv4/tcp_rmem                                    # Default tcp_rmem=524288 1048576 2097152
    [ -f /proc/sys/net/ipv4/tcp_wmem ] && echo "262144 212992 8388608" >/proc/sys/net/ipv4/tcp_wmem                                     # Default tcp_wmem=262144 212992 8388608
    [ -f /proc/sys/net/ipv4/udp_rmem_min ] && echo "5000" >/proc/sys/net/ipv4/udp_rmem_min                                              # Default udp_rmem_min=4096
    [ -f /proc/sys/net/ipv4/udp_wmem_min ] && echo "5000" >/proc/sys/net/ipv4/udp_wmem_min                                              # Default udp_wmem_min=4096
    [ -f /proc/sys/net/ipv4/tcp_tw_reuse ] && echo "2" >/proc/sys/net/ipv4/tcp_tw_reuse                                                 # Default tcp_tw_reuse=2
    [ -f /proc/sys/net/ipv4/tcp_max_syn_backlog ] && echo "200" >/proc/sys/net/ipv4/tcp_max_syn_backlog                                 # Default tcp_max_syn_backlog=128
    [ -f /proc/sys/net/ipv4/tcp_fastopen ] && echo "3" >/proc/sys/net/ipv4/tcp_fastopen                                                 # Default tcp_fastopen=1
    [ -f /proc/sys/net/ipv4/neigh/default/delay_first_probe_time ] && echo "5" >/proc/sys/net/ipv4/neigh/default/delay_first_probe_time # Default delay_first_probe_time=5
    [ -f /sys/class/net/wlan0/tx_queue_len ] && echo "2000" >/sys/class/net/wlan0/tx_queue_len                                          # Default tx_queue_len=3000

    [ -f /proc/sys/net/ipv4/tcp_congestion_control ] && echo "bbrplus" >/proc/sys/net/ipv4/tcp_congestion_control
    [ -f /sys/class/net/wlan0/queues/rx-0/rps_cpus ] && echo "ff" >/sys/class/net/wlan0/queues/rx-0/rps_cpus
    iptables -t mangle -A OUTPUT -p udp --dport 5000:6000 -j TOS --set-tos 0x10
    iptables -t mangle -A OUTPUT -p udp --dport 3000:4000 -j TOS --set-tos 0x10
    iptables -t mangle -A OUTPUT -p udp --dport 2702 -j TOS --set-tos 0x10
    iptables -t mangle -A OUTPUT -p udp --dport 3702 -j TOS --set-tos 0x10
    iptables -t mangle -A OUTPUT -p udp --dport 9000:9999 -j TOS --set-tos 0x10
    iptables -t mangle -A OUTPUT -p udp --dport 30000:30300 -j TOS --set-tos 0x10
    iptables -t mangle -A OUTPUT -p tcp --tcp-flags FIN,SYN,RST,ACK ACK -m length --length 40:100 -j TOS --set-tos 0x10
    [ -f /proc/sys/net/core/busy_poll ] && echo "50" >/proc/sys/net/core/busy_poll
    [ -f /proc/sys/net/core/busy_read ] && echo "50" >/proc/sys/net/core/busy_read
    [ -f /proc/sys/net/core/default_qdisc ] && echo "cake" >/proc/sys/net/core/default_qdisc

    # Bonus
    setprop debug.sf.enable_adpf_cpu_hint 1
    [ -f /sys/devices/system/cpu/cpufreq/policy0/scaling_governor ] && echo "performance" >/sys/devices/system/cpu/cpufreq/policy0/scaling_governor
    [ -f /sys/devices/system/cpu/cpufreq/policy4/scaling_governor ] && echo "performance" >/sys/devices/system/cpu/cpufreq/policy4/scaling_governor

) &
