/* ─────────────────────────────────────
   NAVIGATION
───────────────────────────────────── */
const PAGE_META = {
    dashboard: { name: 'VinNet', sub: 'Standalone Implementation of Network Optimization' },
    tweaks: { name: 'Tweaks', sub: 'Apply Network Optimization Tweaks' },
    info: { name: 'Info', sub: 'Details about Module' },
};

function nav(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nb').forEach(b => b.classList.remove('active'));
    document.getElementById('pg-' + id).classList.add('active');
    btn.classList.add('active');
    const meta = PAGE_META[id];
    if (meta) {
        document.querySelector('.tb-name').textContent = meta.name;
        document.querySelector('.tb-sub').textContent = meta.sub;
    }
    id === 'dashboard' ? startLiveTicker() : stopLiveTicker();
}

/* ─────────────────────────────────────
   SNACKBAR
───────────────────────────────────── */
let snackTimer;
function toast(msg) {
    const el = document.getElementById('snack');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ─────────────────────────────────────
   OPEN LINK DI BROWSER SISTEM
   target="_blank" cuma buka tab di dalam WebView KSU.
   Pakai Intent ACTION_VIEW via shell agar buka browser default.
───────────────────────────────────── */
function openExternal(url) {
    exec(`am start -a android.intent.action.VIEW -d "${url}"`).catch(() => {
        toast('Gagal membuka link');
    });
    return false; // cegah navigasi default WebView
}

/* ─────────────────────────────────────
   JSON CACHE READER (ditulis service.sh)
───────────────────────────────────── */
async function fetchJSON(path) {
    try {
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

/* ─────────────────────────────────────
   SHELL BRIDGE (KSU / APatch / Magisk)
───────────────────────────────────── */
function exec(cmd) {
    return new Promise((resolve, reject) => {
        if (window.ksu && typeof ksu.exec === 'function') {
            const cbName = `__exec_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            window[cbName] = (code, out, err) => {
                delete window[cbName];
                code === 0 ? resolve((out || '').trim()) : reject((err || '').trim());
            };
            try {
                ksu.exec(cmd, JSON.stringify({}), cbName);
            } catch (e) {
                delete window[cbName];
                reject(String(e));
            }
        } else {
            const MOCK = {
                'getprop ro.product.brand': 'Samsung',
                'getprop ro.product.model': 'Galaxy S24',
                'getprop ro.build.version.release': '14',
                'uname -r': '5.15.167-android14',
                'getprop ro.product.cpu.abi': 'arm64-v8a',
                'cmd wifi get-ipreach-disconnect': 'WifiInfo: ipreach enabled',
            };
            const val = MOCK[cmd];
            if (val !== undefined) { resolve(val); return; }
            if (cmd.startsWith('ping')) {
                const avg = 20 + Math.random() * 15;
                const min = avg - 4;
                const max = avg + 8;
                resolve(`5 packets transmitted, 5 received, 0% packet loss\nrtt min/avg/max/mdev = ${min.toFixed(2)}/${avg.toFixed(2)}/${max.toFixed(2)}/3.0 ms`);
                return;
            }
            resolve('');
        }
    });
}

/* ─────────────────────────────────────
   DEVICE INFO
   fetch device.json (instan) → fallback exec() jika belum ada
───────────────────────────────────── */
const DEVICE_ROWS = [
    ['di-brand', 'brand', 'getprop ro.product.brand'],
    ['di-model', 'model', 'getprop ro.product.model'],
    ['di-android', 'android', 'getprop ro.build.version.release'],
    ['di-kernel', 'kernel', 'uname -r'],
    ['di-arch', 'arch', 'getprop ro.product.cpu.abi'],
];

async function loadDeviceLive() {
    await Promise.all(DEVICE_ROWS.map(async ([id, , cmd]) => {
        try {
            const v = await exec(cmd);
            document.getElementById(id).textContent = v || '—';
        } catch {
            document.getElementById(id).textContent = '—';
        }
    }));
}

async function loadDevice() {
    const cached = await fetchJSON('device.json');
    if (cached) {
        for (const [id, key] of DEVICE_ROWS) {
            document.getElementById(id).textContent = cached[key] || '—';
        }
        return;
    }
    await loadDeviceLive(); // fallback: belum ada cache (mis. baru install)
}

/* ─────────────────────────────────────
   METADATA (dari module.prop via metadata.json)
───────────────────────────────────── */
const META_ROWS = [
    ['meta-id', 'id'],
    ['meta-name', 'name'],
    ['meta-version', 'version'],
    ['meta-vcode', 'versionCode'],
    ['meta-author', 'author'],
    ['meta-desc', 'description'],
];

async function loadMetadata() {
    const cached = await fetchJSON('metadata.json');
    if (!cached) return; // belum ada cache, HTML tetap tampil apa adanya
    for (const [id, key] of META_ROWS) {
        const el = document.getElementById(id);
        if (el && cached[key]) el.textContent = cached[key];
    }
}

/* ─────────────────────────────────────
   NETWORK MEASUREMENT
───────────────────────────────────── */
const PING_TARGETS = ['1.1.1.1', '8.8.8.8', '114.114.114.114'];

function setNetVal(id, val, colorFn) {
    const el = document.getElementById(id);
    if (val === null || val === undefined) {
        el.textContent = '—';
        el.style.color = '';
        return;
    }
    el.textContent = val + ' ms';
    el.style.color = colorFn(val);
}

function applyNetworkData(data) {
    setNetVal('v-lat', data.latency,
        v => v <= 30 ? 'var(--good)' : v <= 50 ? 'var(--warn)' : 'var(--bad)');
    setNetVal('v-jit', data.jitter,
        v => v === 0 ? 'var(--good)' : v <= 10 ? 'var(--warn)' : 'var(--bad)');
}

// Pengukuran live langsung via exec() — dipakai tombol refresh manual
async function measureNetworkLive() {
    const pings = await Promise.allSettled(
        PING_TARGETS.map(t => exec(`ping -c 3 -W 1 ${t}`))
    );
    const results = [];
    for (const p of pings) {
        if (p.status === 'fulfilled') {
            const out = p.value;
            const m = out.match(/(\d+\.?\d*)\/(\d+\.?\d*)\/(\d+\.?\d*)/);
            if (m) results.push({ min: +m[1], avg: +m[2], max: +m[3] });
        }
    }
    if (!results.length) return;
    applyNetworkData({
        latency: Math.round(results.reduce((s, r) => s + r.avg, 0) / results.length),
        jitter: Math.round(results.reduce((s, r) => s + (r.max - r.min), 0) / results.length / 2),
    });
}

// Load awal: fetch cache dari background loop service.sh (instan)
async function loadNetwork() {
    const cached = await fetchJSON('network.json');
    if (cached && cached.latency !== null && cached.latency !== undefined) {
        applyNetworkData(cached);
        return;
    }
    await measureNetworkLive(); // fallback: cache belum ada
}

/* ─────────────────────────────────────
   LIVE TICKER
   Fetch network.json tiap 2s selagi di Dashboard.
   Ringan: cuma baca file kecil, nol exec().
───────────────────────────────────── */
let liveTickInterval = null;

function startLiveTicker() {
    stopLiveTicker();
    liveTickInterval = setInterval(async () => {
        const cached = await fetchJSON('network.json');
        if (cached && cached.latency !== null && cached.latency !== undefined) {
            applyNetworkData(cached);
        }
        // kalau gagal/null, biarkan nilai terakhir tetap tampil (anti-flicker)
    }, 2000);
}

function stopLiveTicker() {
    if (liveTickInterval) {
        clearInterval(liveTickInterval);
        liveTickInterval = null;
    }
}

/* ─────────────────────────────────────
   TWEAKS REGISTRY
   Tambah tweak baru → 3 langkah:
   1. Tambah blok HTML .tweak baru (lihat contoh ipreach)
   2. Tambah 1 entry di object TWEAKS di bawah ini
   3. Tambah 1 baris case di service.sh (apply_tweak)
   id, key HTML (sw-id), dan key TWEAKS harus sama persis.
───────────────────────────────────── */
const TWEAKS = {
    "IP Reach Disconnect": {
        onCmd: 'cmd wifi set-ipreach-disconnect disabled ; settings put global wifi_ipreach_disconnect_enabled 0',
        offCmd: 'cmd wifi set-ipreach-disconnect enabled ; settings put global wifi_ipreach_disconnect_enabled 1',
    },
    "Scan Always Available": {
        onCmd: 'cmd wifi set-scan-always-available disabled ; settings put global wifi_scan_always_enabled 0',
        offCmd: 'cmd wifi set-scan-always-available enabled ; settings put global wifi_scan_always_enabled 1',
    },
    "Restrict Background": {
        onCmd: 'cmd netpolicy set restrict-background false ; settings put global data_saver_mode 0',
        offCmd: 'cmd netpolicy set restrict-background true ; settings put global data_saver_mode 1',
    },
    "Power Save": {
        onCmd: 'iw wlan0 set power_save off',
        offCmd: 'iw wlan0 set power_save on',
    },
    "QDISC": {
        onCmd: 'tc qdisc replace dev wlan0 root fq_codel quantum 300 noecn',
        offCmd: 'tc qdisc replace dev wlan0 root pfifo_fast',
    },
    "Wi-Fi Force Low Latency Mode": {
        onCmd: 'cmd wifi force-low-latency-mode enabled ; cmd wifi force-hi-perf-mode enabled',
        offCmd: 'cmd wifi force-low-latency-mode disabled ; cmd wifi force-hi-perf-mode disabled',
    },
    // contoh tweak baru:
    // tweakbaru: {
    //     onCmd:  'perintah saat toggle ON',
    //     offCmd: 'perintah saat toggle OFF',
    // },
};

async function loadTweaks() {
    const cached = await fetchJSON('tweaks.json') || {};
    for (const id of Object.keys(TWEAKS)) {
        const el = document.getElementById('sw-' + id);
        if (el && cached[id] !== undefined) {
            el.checked = cached[id] === 'on';
        }
    }
}

async function applyTweak(id, enabled) {
    const t = TWEAKS[id];
    if (!t) return;
    try {
        const cmd = enabled ? t.onCmd : t.offCmd;
        await exec(cmd);

        const state = await fetchJSON('tweaks.json') || {};
        state[id] = enabled ? 'on' : 'off';
        const json = JSON.stringify(state).replace(/"/g, '\\"');
        await exec(`echo "${json}" > /data/adb/modules/VinNet/webroot/tweaks.json`);

        await exec(`grep -v "^${id}=" /data/adb/modules/VinNet/tweaks.conf 2>/dev/null > /data/adb/modules/VinNet/tweaks.conf.tmp; echo "${id}=${enabled ? 'on' : 'off'}" >> /data/adb/modules/VinNet/tweaks.conf.tmp; mv /data/adb/modules/VinNet/tweaks.conf.tmp /data/adb/modules/VinNet/tweaks.conf`);

        // Ambil kata "disabled"/"enabled" langsung dari command asli, fallback On/Off
        const label = cmd.includes('disabled') ? 'Disabled'
            : cmd.includes('enabled') ? 'Enabled'
                : (enabled ? 'On' : 'Off');
        toast(`${id} → ${label}`);
    } catch {
        toast('Gagal menerapkan tweak');
        document.getElementById('sw-' + id).checked = !enabled;
    }
}

/* ─────────────────────────────────────
   MONET COLORS
   fetch monet.json (instan) → fallback exec()+python3 jika belum ada
───────────────────────────────────── */
function hexToRgba(hex, a) {
    hex = hex.replace('#', '');
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function applyMonetColors(a1) {
    const css = document.documentElement.style;
    if (a1['200']) css.setProperty('--pri', a1['200']);
    if (a1['800']) css.setProperty('--on-pri', a1['800']);
    if (a1['700']) css.setProperty('--pri-con', a1['700']);
    if (a1['100']) css.setProperty('--on-pri-con', a1['100']);
    const pri = a1['200'] || '#AACAE9';
    const con = a1['700'] || '#2A4964';
    const dark = a1['900'] || '#07192A';
    const hero = document.querySelector('.hero');
    if (hero) hero.style.background =
        `linear-gradient(145deg,${dark} 0%,${a1['800'] || '#10334C'} 50%,${con} 100%)`;
    const ico = document.querySelector('.hero-ico');
    if (ico) {
        ico.style.background = hexToRgba(pri, 0.14);
        ico.style.borderColor = hexToRgba(pri, 0.25);
    }
}

async function findFrroFile() {
    try {
        const ls = await exec('ls /data/resource-cache/ 2>/dev/null | grep "systemui-accent"');
        const name = ls.split('\n').find(l => l.trim());
        return name ? `/data/resource-cache/${name.trim()}` : null;
    } catch { return null; }
}

async function parseFrroColors(path) {
    const cmd = `python3 -c "
def v(d,i):
    r,s=0,0
    while 1:
        b=d[i];i+=1;r|=(b&127)<<s;s+=7
        if not b>>7:return r,i
data=open('${path}','rb').read()
colors={}
i=0
while i<len(data)-20:
    if data[i:i+14]==b'system_accent1':
        try:
            e=data.index(b'\\x12',i)
            nm=data[i:e].decode()
            c,_=v(data,e+5)
            colors[nm]='#{:02X}{:02X}{:02X}'.format((c>>16)&255,(c>>8)&255,c&255)
            i=e
        except:pass
    i+=1
print('\\n'.join(k+'='+vv for k,vv in sorted(colors.items()) if '_dark' in k))
" 2>/dev/null`;
    try {
        const out = await exec(cmd);
        if (!out || out.startsWith('python3: not found')) return null;
        const map = {};
        for (const line of out.split('\n')) {
            const [name, hex] = line.split('=');
            if (!name || !hex) continue;
            const m = name.match(/accent1_(\d+)_dark/);
            if (m) map[m[1]] = hex.trim();
        }
        return Object.keys(map).length >= 4 ? map : null;
    } catch { return null; }
}

async function loadMonetColorsLive() {
    const path = await findFrroFile();
    if (!path) return;
    const colors = await parseFrroColors(path);
    if (colors) applyMonetColors(colors);
}

async function loadMonetColors() {
    const cached = await fetchJSON('monet.json');
    if (cached && Object.keys(cached).length >= 4) {
        applyMonetColors(cached);
        return;
    }
    await loadMonetColorsLive(); // fallback: cache belum ada
}

/* ─────────────────────────────────────
   BOOT
───────────────────────────────────── */
async function boot() {
    const ksuReady = (async () => {
        for (let i = 0; i < 10 && !window.ksu; i++) {
            await new Promise(r => setTimeout(r, 200));
        }
    })();

    // loadMonetColors/loadDevice/loadNetwork cek cache JSON dulu (tidak butuh ksu).
    // loadTweaks satu-satunya yang wajib tunggu bridge siap.
    await Promise.all([
        loadMonetColors(),
        loadDevice(),
        loadNetwork(),
        loadMetadata(),
        ksuReady.then(loadTweaks),
    ]);

    document.getElementById('app').classList.add('ready');

    const ls = document.getElementById('loading-screen');
    if (ls) {
        ls.classList.add('hide');
        setTimeout(() => ls.remove(), 350);
    }

    startLiveTicker(); // dashboard adalah halaman default saat boot
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100));
} else {
    setTimeout(boot, 100);
}