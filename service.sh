#!/system/bin/sh
MODDIR=${0%/*}
WEBROOT="$MODDIR/webroot"

until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 5
done

# Stabilization delay — biar wifi/system service settle dulu
sleep 3

# ── Device Info Cache (sekali per boot) ─────────────
cat >"$WEBROOT/device.json" <<EOF
{
  "brand": "$(getprop ro.product.brand)",
  "model": "$(getprop ro.product.model)",
  "android": "$(getprop ro.build.version.release)",
  "kernel": "$(uname -r)",
  "arch": "$(getprop ro.product.cpu.abi)"
}
EOF

# ── Monet Color Cache (sekali per boot, butuh python3) ──
if command -v python3 >/dev/null 2>&1; then
    FRRO=$(ls /data/resource-cache/ 2>/dev/null | grep "systemui-accent" | head -1)
    if [ -n "$FRRO" ]; then
        python3 -c "
import json, re
def v(d,i):
    r,s=0,0
    while 1:
        b=d[i];i+=1;r|=(b&127)<<s;s+=7
        if not b>>7:return r,i
data=open('/data/resource-cache/$FRRO','rb').read()
colors={}
i=0
while i<len(data)-20:
    if data[i:i+14]==b'system_accent1':
        try:
            e=data.index(b'\x12',i)
            nm=data[i:e].decode()
            c,_=v(data,e+5)
            colors[nm]='#{:02X}{:02X}{:02X}'.format((c>>16)&255,(c>>8)&255,c&255)
            i=e
        except: pass
    i+=1
out={}
for k,vv in colors.items():
    if '_dark' in k:
        m=re.search(r'accent1_(\d+)_dark', k)
        if m: out[m.group(1)]=vv
print(json.dumps(out))
" >"$WEBROOT/monet.json" 2>/dev/null
    fi
fi
# Catatan: kalau python3 tidak ada, monet.json dilewati.
# WebUI otomatis pakai fallback warna statis dari CSS — aman, tidak error.

# ── Network Status Background Loop (siklus ~4-5 detik) ───
# 1 target saja biar ringan & cepat — latency/jitter saja, tanpa loss
(
    while true; do
        OUT=$(ping -c 3 -W 1 1.1.1.1 2>/dev/null)
        LINE=$(echo "$OUT" | grep "min/avg/max")
        if [ -n "$LINE" ]; then
            VALS=$(echo "$LINE" | sed -E 's#.*= ([0-9]+)\.[0-9]+/([0-9]+)\.[0-9]+/([0-9]+)\.[0-9]+.*#\1 \2 \3#')
            MIN=$(echo "$VALS" | cut -d' ' -f1)
            LATENCY=$(echo "$VALS" | cut -d' ' -f2)
            MAX=$(echo "$VALS" | cut -d' ' -f3)
            JITTER=$(((MAX - MIN) / 2))
        else
            LATENCY=null
            JITTER=null
        fi

        cat >"$WEBROOT/network.json.tmp" <<EOF
{"latency":$LATENCY,"jitter":$JITTER,"ts":$(date +%s)}
EOF
        mv -f "$WEBROOT/network.json.tmp" "$WEBROOT/network.json"
        sleep 2
    done
) &

# ── Vendor / Binary Mount Check (logika lama, tidak diubah) ───
if [ "$(getprop ro.product.device)" != "fog" ]; then
    VMS="Vendor: Fail (Not fog)"
elif grep -q "VinNet" "/vendor/etc/wifi/WCNSS_qcom_cfg.ini" 2>/dev/null && grep -q "p2p_disabled=1" "/vendor/etc/wifi/wpa_supplicant_overlay.conf" 2>/dev/null; then
    VMS="Vendor: Success"
else
    VMS="Vendor: Fail (No Meta)"
fi
command -v iw >/dev/null && BMS="Binary: Success" || BMS="Binary: Fail (No Meta)"
su shell -c "cmd notification post -S bigtext -t 'VinNet' 'Mount Status' '$VMS | $BMS'"
