const CORE_PATH = '/data/adb/modules/VinNet/webroot/Core';

const PAGE_META = {
    dashboard: { name: 'VinNet', sub: 'Enhanced Implementation of Network Optimization' },
    tweaks: { name: 'Tweaks', sub: 'Apply Network Optimization Tweaks' },
    info: { name: 'Info', sub: 'Details about Module' },
};

function movePill(btn, instant) {
    const pill = document.getElementById('nbPill');
    if (!pill) return;
    if (instant) pill.style.transition = 'none';
    const pillWidth = pill.offsetWidth;
    const centerX = btn.offsetLeft + btn.offsetWidth / 2;
    pill.style.transform = `translateX(${centerX - pillWidth / 2}px)`;
    if (instant) requestAnimationFrame(() => { pill.style.transition = ''; });
}

function updateNavIcons() {
    document.querySelectorAll('.nb svg[data-fill]').forEach(svg => {
        const active = svg.closest('.nb').classList.contains('active');
        svg.querySelector('path').setAttribute('d', svg.dataset[active ? 'fill' : 'outline']);
    });
}

function nav(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nb').forEach(b => b.classList.remove('active'));
    document.getElementById('pg-' + id).classList.add('active');
    btn.classList.add('active');
    movePill(btn);
    updateNavIcons();
    const meta = PAGE_META[id];
    if (meta) {
        document.querySelector('.tb-name').textContent = meta.name;
        document.querySelector('.tb-sub').textContent = meta.sub;
    }
}

let snackTimer;
function toast(msg) {
    const el = document.getElementById('snack');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function openExternal(url) {
    exec(`am start -a android.intent.action.VIEW -d "${url}"`).catch(() => toast('Unable to open link'));
    return false;
}

async function fetchJSON(path) {
    try {
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}

function exec(cmd) {
    return new Promise((resolve, reject) => {
        if (window.ksu && typeof ksu.exec === 'function') {
            const cbName = `__exec_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            window[cbName] = (code, out, err) => {
                delete window[cbName];
                code === 0 ? resolve((out || '').trim()) : reject((err || '').trim());
            };
            try { ksu.exec(cmd, JSON.stringify({}), cbName); } catch (e) { delete window[cbName]; reject(String(e)); }
        } else {
            const MOCK = {
                'getprop ro.product.brand': '—',
                'getprop ro.product.model': '—',
                'getprop ro.build.version.release': '—',
                'uname -r': '—',
                'getprop ro.product.cpu.abi': '—',
            };
            if (MOCK[cmd] !== undefined) { resolve(MOCK[cmd]); return; }
            if (cmd.startsWith('ping')) { resolve('—'); return; }
            resolve('');
        }
    });
}

const DEVICE_ROWS = [
    ['di-brand', 'brand', 'getprop ro.product.brand'],
    ['di-model', 'model', 'getprop ro.product.model'],
    ['di-android', 'android', 'getprop ro.build.version.release'],
    ['di-kernel', 'kernel', 'uname -r'],
    ['di-arch', 'arch', 'getprop ro.product.cpu.abi'],
    ['di-root', 'root', 'command -v ksud >/dev/null 2>&1 && echo KernelSU || (command -v apd >/dev/null 2>&1 && echo APatch || (command -v magisk >/dev/null 2>&1 && echo Magisk || echo Unknown))'],
];

async function loadEnvironment() {
    const cached = await fetchJSON('Core/Environment.json');
    if (cached) {
        for (const [id, key] of DEVICE_ROWS) document.getElementById(id).textContent = cached[key] || '—';
        return;
    }
    await Promise.all(DEVICE_ROWS.map(async ([id, , cmd]) => {
        try { document.getElementById(id).textContent = await exec(cmd) || '—'; } catch { document.getElementById(id).textContent = '—'; }
    }));
}

const META_ROWS = [
    ['meta-id', 'id'], ['meta-name', 'name'],
    ['meta-author', 'author'], ['meta-desc', 'description'],
];

async function loadMetadata() {
    const cached = await fetchJSON('Core/Metadata.json');
    if (!cached) return;
    for (const [id, key] of META_ROWS) {
        const el = document.getElementById(id);
        if (el && cached[key]) el.textContent = cached[key];
    }
    const vEl = document.getElementById('meta-version');
    if (vEl && cached.version) {
        vEl.textContent = cached.versionCode ? `${cached.version} (${cached.versionCode})` : cached.version;
    }
}

const PING_TARGETS = ['1.1.1.1'];

function setNetVal(id, val, colorFn) {
    const el = document.getElementById(id);
    const next = val == null ? '—' : val + ' ms';
    const changed = el.textContent !== next;
    if (changed) el.style.opacity = '0.3';
    el.textContent = next;
    el.style.color = val == null ? '' : colorFn(val);
    if (changed) requestAnimationFrame(() => { el.style.opacity = '1'; });
}

function applyNetworkData(data) {
    setNetVal('v-lat', data.latency,
        v => v <= 30 ? 'var(--good)' : v <= 50 ? 'var(--warn)' : 'var(--bad)');
    setNetVal('v-jit', data.jitter,
        v => v === 0 ? 'var(--good)' : v <= 10 ? 'var(--warn)' : 'var(--bad)');
}

async function measureNetworkLive() {
    const pings = await Promise.allSettled(PING_TARGETS.map(t => exec(`ping -c 3 -W 1 ${t}`)));
    const results = [];
    for (const p of pings) {
        if (p.status === 'fulfilled') {
            const m = p.value.match(/(\d+\.?\d*)\/(\d+\.?\d*)\/(\d+\.?\d*)/);
            if (m) results.push({ min: +m[1], avg: +m[2], max: +m[3] });
        }
    }
    if (!results.length) return;
    applyNetworkData({
        latency: Math.round(results.reduce((s, r) => s + r.avg, 0) / results.length),
        jitter: Math.round(results.reduce((s, r) => s + (r.max - r.min), 0) / results.length / 2),
    });
}

function sendDetect() {
    exec(`date +%s > ${CORE_PATH}/Detect.txt`).catch(() => { });
}

async function loadMonitor() {
    sendDetect();
    const cached = await fetchJSON('Core/Monitor.json');
    if (cached && cached.latency != null && cached.latency !== undefined) {
        applyNetworkData(cached);
        return;
    }
    await measureNetworkLive();
}

let liveTickInterval = null;
function startLiveTicker() {
    if (liveTickInterval) return;
    liveTickInterval = setInterval(async () => {
        sendDetect();
        const cached = await fetchJSON('Core/Monitor.json');
        if (cached && cached.latency != null && cached.latency !== undefined) applyNetworkData(cached);
    }, 3000);
}

function stopLiveTicker() {
    if (liveTickInterval) {
        clearInterval(liveTickInterval);
        liveTickInterval = null;
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopLiveTicker();
    } else {
        sendDetect();
        startLiveTicker();
    }
});

const TWEAKS = {
    "IP Reach Disconnect": {
        onCmd: 'cmd wifi set-ipreach-disconnect disabled',
        offCmd: 'cmd wifi set-ipreach-disconnect enabled',
        onLabel: 'Disabled', offLabel: 'Enabled',
    },
    "Scan Always Available": {
        onCmd: 'cmd wifi set-scan-always-available disabled ; settings put global wifi_scan_always_enabled 0',
        offCmd: 'cmd wifi set-scan-always-available enabled ; settings put global wifi_scan_always_enabled 1',
        onLabel: 'Disabled', offLabel: 'Enabled',
    },
    "Restrict Background": {
        onCmd: 'cmd netpolicy set restrict-background false',
        offCmd: 'cmd netpolicy set restrict-background true',
        onLabel: 'Disabled', offLabel: 'Enabled',
    },
    "Power Save": {
        onCmd: 'iw dev wlan0 set power_save off',
        offCmd: 'iw dev wlan0 set power_save on',
        onLabel: 'Disabled', offLabel: 'Enabled',
    },
    "QDISC": {
        onCmd: 'tc qdisc replace dev wlan0 root fq_codel quantum 300 noecn ; tc qdisc replace dev rmnet_data0 root fq_codel quantum 300 noecn ; tc qdisc replace dev rmnet_ipa0 root fq_codel quantum 300 noecn',
        offCmd: 'tc qdisc replace dev wlan0 root pfifo_fast ; tc qdisc replace dev rmnet_data0 root pfifo_fast ; tc qdisc replace dev rmnet_ipa0 root pfifo_fast',
        onLabel: 'Optimized', offLabel: 'Unoptimized',
    },
    "Wi-Fi Force Low Latency Mode": {
        onCmd: 'cmd wifi force-low-latency-mode enabled ; cmd wifi force-hi-perf-mode enabled',
        offCmd: 'cmd wifi force-low-latency-mode disabled ; cmd wifi force-hi-perf-mode disabled',
        onLabel: 'Enabled', offLabel: 'Disabled',
    },
    "Network Avoid Bad Wi-Fi": {
        onCmd: 'settings put global network_avoid_bad_wifi 0 ; settings put system wifi_assistant 0',
        offCmd: 'settings put global network_avoid_bad_wifi 1 ; settings put system wifi_assistant 1',
        onLabel: 'Disabled', offLabel: 'Enabled',
    },
    "BLE Scan Always Enabled": {
        onCmd: 'settings put global ble_scan_always_enabled 0',
        offCmd: 'settings put global ble_scan_always_enabled 1',
        onLabel: 'Disabled', offLabel: 'Enabled',
    },
};

async function loadTweaks() {
    const cached = await fetchJSON('Core/Tweaks.json') || {};
    for (const id of Object.keys(TWEAKS)) {
        const el = document.getElementById(id);
        if (el && cached[id] !== undefined) el.checked = cached[id] === 'on';
    }
}

async function applyTweak(id, enabled) {
    const t = TWEAKS[id];
    if (!t) return;
    const el = document.getElementById(id);
    el.disabled = true;
    try {
        await exec(enabled ? t.onCmd : t.offCmd);
        const state = await fetchJSON('Core/Tweaks.json') || {};
        state[id] = enabled ? 'on' : 'off';
        const json = JSON.stringify(state).replace(/"/g, '\\"');
        await exec(`echo "${json}" > ${CORE_PATH}/Tweaks.json`);
        await exec(`grep -v "^${id}=" ${CORE_PATH}/VinNet.conf 2>/dev/null > ${CORE_PATH}/VinNet.conf.tmp; echo "${id}=${enabled ? 'on' : 'off'}" >> ${CORE_PATH}/VinNet.conf.tmp; mv ${CORE_PATH}/VinNet.conf.tmp ${CORE_PATH}/VinNet.conf`);
        toast(`${id} > ${enabled ? t.onLabel : t.offLabel}`);
    } catch {
        toast('Unable to apply tweak');
        el.checked = !enabled;
    } finally {
        el.disabled = false;
    }
}

async function boot() {
    const ksuReady = (async () => {
        for (let i = 0; i < 10 && !window.ksu; i++) await new Promise(r => setTimeout(r, 200));
    })();

    await Promise.all([
        loadEnvironment(),
        loadMonitor(),
        loadMetadata(),
        ksuReady.then(loadTweaks),
        new Promise(r => setTimeout(r, 300)),
    ]);

    document.getElementById('app').classList.add('ready');
    const activeNb = document.querySelector('.nb.active');
    if (activeNb) movePill(activeNb, true);
    updateNavIcons();
    const ls = document.getElementById('loading-screen');
    if (ls) {
        ls.addEventListener('transitionend', () => ls.remove(), { once: true });
        ls.classList.add('hide');
    }
    startLiveTicker();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100));
else setTimeout(boot, 100);