#!/system/bin/sh
(

until [ "$(getprop sys.boot_completed)" = "1" ]; do
sleep 5
done

sleep 10

[ -f /proc/sys/net/core/netdev_max_backlog ] && echo "5000" > /proc/sys/net/core/netdev_max_backlog
[ -f /proc/sys/net/core/rmem_default ] && echo "262144" > /proc/sys/net/core/rmem_default
[ -f /proc/sys/net/core/rmem_max ] && echo "4194304" > /proc/sys/net/core/rmem_max
[ -f /proc/sys/net/core/wmem_default ] && echo "262144" > /proc/sys/net/core/wmem_default
[ -f /proc/sys/net/core/wmem_max ] && echo "4194304" > /proc/sys/net/core/wmem_max
[ -f /proc/sys/net/core/somaxconn ] && echo "4096" > /proc/sys/net/core/somaxconn
[ -f /proc/sys/net/core/optmem_max ] && echo "65536" > /proc/sys/net/core/optmem_max
[ -f /proc/sys/net/ipv4/tcp_slow_start_after_idle ] && echo "0" > /proc/sys/net/ipv4/tcp_slow_start_after_idle
[ -f /proc/sys/net/ipv4/tcp_low_latency ] && echo "1" > /proc/sys/net/ipv4/tcp_low_latency
[ -f /proc/sys/net/ipv4/tcp_timestamps ] && echo "1" > /proc/sys/net/ipv4/tcp_timestamps
[ -f /proc/sys/net/ipv4/tcp_sack ] && echo "1" > /proc/sys/net/ipv4/tcp_sack
[ -f /proc/sys/net/ipv4/tcp_fack ] && echo "1" > /proc/sys/net/ipv4/tcp_fack
[ -f /proc/sys/net/ipv4/tcp_window_scaling ] && echo "1" > /proc/sys/net/ipv4/tcp_window_scaling
[ -f /proc/sys/net/ipv4/tcp_moderate_rcvbuf ] && echo "1" > /proc/sys/net/ipv4/tcp_moderate_rcvbuf
[ -f /proc/sys/net/ipv4/tcp_no_metrics_save ] && echo "1" > /proc/sys/net/ipv4/tcp_no_metrics_save
[ -f /proc/sys/net/ipv4/tcp_syn_retries ] && echo "2" > /proc/sys/net/ipv4/tcp_syn_retries
[ -f /proc/sys/net/ipv4/tcp_synack_retries ] && echo "2" > /proc/sys/net/ipv4/tcp_synack_retries
[ -f /proc/sys/net/ipv4/tcp_retries2 ] && echo "8" > /proc/sys/net/ipv4/tcp_retries2
[ -f /proc/sys/net/ipv4/tcp_fin_timeout ] && echo "15" > /proc/sys/net/ipv4/tcp_fin_timeout
[ -f /proc/sys/net/ipv4/tcp_rmem ] && echo "4096 87380 4194304" > /proc/sys/net/ipv4/tcp_rmem
[ -f /proc/sys/net/ipv4/tcp_wmem ] && echo "4096 87380 4194304" > /proc/sys/net/ipv4/tcp_wmem
[ -f /proc/sys/net/ipv4/udp_rmem_min ] && echo "131072" > /proc/sys/net/ipv4/udp_rmem_min
[ -f /proc/sys/net/ipv4/udp_wmem_min ] && echo "131072" > /proc/sys/net/ipv4/udp_wmem_min
[ -f /proc/sys/net/ipv4/tcp_tw_reuse ] && echo "1" > /proc/sys/net/ipv4/tcp_tw_reuse
[ -f /proc/sys/net/ipv4/tcp_max_tw_buckets ] && echo "4096" > /proc/sys/net/ipv4/tcp_max_tw_buckets
[ -f /proc/sys/net/ipv4/tcp_max_syn_backlog ] && echo "1024" > /proc/sys/net/ipv4/tcp_max_syn_backlog
[ -f /proc/sys/net/ipv4/tcp_fastopen ] && echo "3" > /proc/sys/net/ipv4/tcp_fastopen
[ -f /proc/sys/net/ipv4/neigh/default/gc_thresh1 ] && echo "128" > /proc/sys/net/ipv4/neigh/default/gc_thresh1
[ -f /proc/sys/net/ipv4/neigh/default/gc_thresh2 ] && echo "1024" > /proc/sys/net/ipv4/neigh/default/gc_thresh2
[ -f /proc/sys/net/ipv4/neigh/default/gc_thresh3 ] && echo "2048" > /proc/sys/net/ipv4/neigh/default/gc_thresh3
[ -f /proc/sys/net/ipv4/neigh/default/delay_first_probe_time ] && echo "1" > /proc/sys/net/ipv4/neigh/default/delay_first_probe_time
[ -f /proc/sys/net/ipv6/neigh/default/delay_first_probe_time ] && echo "1" > /proc/sys/net/ipv6/neigh/default/delay_first_probe_time
[ -f /proc/sys/net/ipv4/neigh/default/proxy_delay ] && echo "0" > /proc/sys/net/ipv4/neigh/default/proxy_delay
[ -f /proc/sys/net/ipv6/neigh/default/proxy_delay ] && echo "0" > /proc/sys/net/ipv6/neigh/default/proxy_delay
[ -f /proc/sys/net/ipv6/conf/all/router_solicitation_delay ] && echo "1" > /proc/sys/net/ipv6/conf/all/router_solicitation_delay
[ -f /proc/sys/net/ipv6/conf/default/router_solicitation_delay ] && echo "1" > /proc/sys/net/ipv6/conf/default/router_solicitation_delay
[ -f /proc/sys/net/ipv6/conf/wlan0/router_solicitation_delay ] && echo "1" > /proc/sys/net/ipv6/conf/wlan0/router_solicitation_delay
[ -f /sys/class/net/wlan0/tx_queue_len ] && echo "1200" > /sys/class/net/wlan0/tx_queue_len

[ -f /proc/sys/net/ipv4/tcp_congestion_control ] && echo "westwood" > /proc/sys/net/ipv4/tcp_congestion_control
[ -f /sys/module/wlan/parameters/con_mode ] && echo "1" > /sys/module/wlan/parameters/con_mode
[ -f /sys/class/net/wlan0/queues/rx-0/rps_cpus ] && echo "ff" > /sys/class/net/wlan0/queues/rx-0/rps_cpus

) &
