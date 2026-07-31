const CORE_PATH = '/data/adb/modules/VinNet/webroot/Core';

const PAGE_META = {
    dashboard: { name: 'VinNet', sub: 'Enhanced Implementation of Network Optimization' },
    tweaks: { name: 'Tweaks', sub: 'Apply Network Optimization Tweaks' },
    info: { name: 'Info', sub: 'Details about Module' },
};

let currentPageId = null;
let activePageTimer = null;
let navOperationId = 0;

function movePill(btn, instant) {
    const pill = document.getElementById('nbPill');
    if (!pill || !btn) return;
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

const PAGE_ORDER = ['dashboard', 'tweaks', 'info'];

let programmaticScroll = false;

function setActivePage(id) {
    if (id === currentPageId) return;
    clearTimeout(activePageTimer);
    activePageTimer = setTimeout(() => {
        currentPageId = id;
        document.querySelectorAll('.nb').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.nb[data-page="${id}"]`);
        if (!btn) return;
        btn.classList.add('active');
        movePill(btn);
        updateNavIcons();
        const meta = PAGE_META[id];
        if (meta) {
            document.querySelector('.tb-name').textContent = meta.name;
            document.querySelector('.tb-sub').textContent = meta.sub;
        }
        if (id === 'dashboard') {
            loadEnvironment();
            loadMonitor();
            loadProcess();
        }
    }, 100);
}

function nav(id) {
    const thisOp = ++navOperationId;
    programmaticScroll = true;
    document.getElementById('pg-' + id).scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    setActivePage(id);
    const el = document.querySelector('.pages');
    if ('onscrollend' in el) {
        el.addEventListener('scrollend', () => {
            if (thisOp === navOperationId) programmaticScroll = false;
        }, { once: true });
    } else {
        setTimeout(() => {
            if (thisOp === navOperationId) programmaticScroll = false;
        }, 400);
    }
}

const pageObserver = new IntersectionObserver((entries) => {
    if (programmaticScroll) return;
    entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.75) {
            setActivePage(entry.target.id.replace('pg-', ''));
        }
    });
}, { root: document.querySelector('.pages'), threshold: [0.5, 0.75, 1.0] });

document.querySelectorAll('.page').forEach(page => pageObserver.observe(page));

(() => {
    const pagesEl = document.querySelector('.pages');
    let touchStartX = 0;
    let touchStartY = 0;

    pagesEl.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    pagesEl.addEventListener('touchmove', (e) => {
        const deltaX = e.touches[0].clientX - touchStartX;
        const deltaY = e.touches[0].clientY - touchStartY;
        if (Math.abs(deltaY) > Math.abs(deltaX)) return;
        const atStart = pagesEl.scrollLeft <= 0;
        const atEnd = pagesEl.scrollLeft >= pagesEl.scrollWidth - pagesEl.clientWidth - 1;
        if ((atStart && deltaX > 0) || (atEnd && deltaX < 0)) {
            e.preventDefault();
        }
    }, { passive: false });
})();

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

let cbCounter = 0;
function exec(cmd) {
    return new Promise((resolve, reject) => {
        if (window.ksu && typeof ksu.exec === 'function') {
            const cbName = `__exec_cb_${++cbCounter}`;
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
    ['di-brand', 'Brand', 'getprop ro.product.brand'],
    ['di-model', 'Model', 'getprop ro.product.model'],
    ['di-android', 'Android', 'getprop ro.build.version.release'],
    ['di-kernel', 'Kernel', 'uname -r'],
    ['di-arch', 'Architecture', 'getprop ro.product.cpu.abi'],
    ['di-root', 'Root', 'command -v ksud >/dev/null 2>&1 && echo KernelSU || (command -v apd >/dev/null 2>&1 && echo APatch || (command -v magisk >/dev/null 2>&1 && echo Magisk || echo Unknown))'],
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
    ['meta-id', 'ID'], ['meta-name', 'Name'],
    ['meta-author', 'Author'], ['meta-desc', 'Description'],
];

async function loadMetadata() {
    const cached = await fetchJSON('Core/Metadata.json');
    if (!cached) return;
    for (const [id, key] of META_ROWS) {
        const el = document.getElementById(id);
        if (el && cached[key]) el.textContent = cached[key];
    }
    const vEl = document.getElementById('meta-version');
    if (vEl && cached.Version) {
        vEl.textContent = cached.VersionCode ? `${cached.Version} (${cached.VersionCode})` : cached.Version;
    }
}

const elCache = {};
function getEl(id) {
    return elCache[id] || (elCache[id] = document.getElementById(id));
}

function setNetVal(id, val, colorFn) {
    const el = getEl(id);
    const next = (val == null || val === '—') ? '—' : val + ' ms';
    const changed = el.textContent !== next;
    if (changed) el.style.opacity = '0.3';
    el.textContent = next;
    el.style.color = (val == null || val === '—') ? '' : colorFn(val);
    if (changed) requestAnimationFrame(() => { el.style.opacity = '1'; });
}

function applyNetworkData(data) {
    setNetVal('v-lat', data.Latency,
        v => v <= 30 ? 'var(--good)' : v <= 50 ? 'var(--warn)' : 'var(--bad)');
    setNetVal('v-jit', data.Jitter,
        v => v === 0 ? 'var(--good)' : v <= 10 ? 'var(--warn)' : 'var(--bad)');
}

function sendDetect() {
    exec(`date +%s > ${CORE_PATH}/Detect.txt`).catch(() => { });
}

async function loadMonitor() {
    sendDetect();
    const cached = await fetchJSON('Core/Monitor.json');
    if (cached && cached.Latency != null && cached.Latency !== undefined) {
        applyNetworkData(cached);
    }
}

async function loadProcess() {
    const cached = await fetchJSON('Core/Process.json');
    const pidEl = getEl('proc-pid');
    if (!pidEl) return;
    if (cached && cached.PID != null) {
        pidEl.textContent = cached.PID;
    }
}

let liveTickInterval = null;
function startLiveTicker() {
    if (liveTickInterval) return;
    liveTickInterval = setInterval(async () => {
        sendDetect();
        const cached = await fetchJSON('Core/Monitor.json');
        if (cached && cached.Latency != null && cached.Latency !== undefined) applyNetworkData(cached);
        loadProcess();
    }, 4000);
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
        onCmd: 'settings put global network_avoid_bad_wifi 0',
        offCmd: 'settings put global network_avoid_bad_wifi 1',
        onLabel: 'Disabled', offLabel: 'Enabled',
    },
    "BLE Scan Always Enabled": {
        onCmd: 'settings put global ble_scan_always_enabled 0',
        offCmd: 'settings put global ble_scan_always_enabled 1',
        onLabel: 'Disabled', offLabel: 'Enabled',
    },
    "Mobile Data Always ON": {
        onCmd: 'settings put global mobile_data_always_on 0',
        offCmd: 'settings put global mobile_data_always_on 1',
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

let tweakQueue = Promise.resolve();

async function applyTweak(id, enabled) {
    const t = TWEAKS[id];
    if (!t) return;
    const el = document.getElementById(id);
    el.disabled = true;
    tweakQueue = tweakQueue.then(async () => {
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
    });
}

async function boot() {
    await Promise.allSettled([
        loadEnvironment(),
        loadMonitor(),
        loadMetadata(),
        loadProcess(),
        loadTweaks(),
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