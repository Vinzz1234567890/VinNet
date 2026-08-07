const CORE_PATH = '/data/adb/modules/VinNet/webroot/Core';
let programmaticScroll = false;

const PAGE_META = {
    Dashboard: { name: 'VinNet', sub: 'Enhanced Implementation of Network Optimization' },
    Tweaks: { name: 'Tweaks', sub: 'Apply Network Optimization Tweaks' },
    Info: { name: 'Info', sub: 'Details about Module' },
};

const INFO_LINKS = [
    { label: 'Repository', href: 'https://github.com/Vinzz1234567890/VinNet', icon: 'Repository', text: 'Vinnet' },
    { label: 'Telegram', href: 'https://t.me/VinzzRepository', icon: 'Telegram', text: 'Vinzz Repository' },
];

const CONTRIBUTORS = [
    { label: 'Developer', href: 'https://github.com/Vinzz1234567890', avatar: 'assets/Vinzz1234567890.png', name: 'Vinzz' },
];

let currentPageId = null;
let activePageTimer = null;
let navOperationId = 0;

let navBtns = null;
let tbName = null;
let tbSub = null;

function updateNavIcons() {
    document.querySelectorAll('.NavigationBar svg[data-fill], .NavigationBarActive svg[data-fill]').forEach(svg => {
        const active = svg.closest('.NavigationBar, .NavigationBarActive').classList.contains('NavigationBarActive');
        svg.querySelector('path').setAttribute('d', svg.dataset[active ? 'fill' : 'outline']);
    });
}

function setActivePage(id) {
    if (id === currentPageId) return;
    clearTimeout(activePageTimer);
    activePageTimer = setTimeout(() => {
        currentPageId = id;
        if (!navBtns) navBtns = document.querySelectorAll('.NavigationBar, .NavigationBarActive');
        navBtns.forEach(b => { b.classList.remove('NavigationBarActive'); b.classList.add('NavigationBar'); });
        const btn = document.querySelector(`.NavigationBar[data-page="${id}"], .NavigationBarActive[data-page="${id}"]`);
        if (!btn) return;
        btn.classList.remove('NavigationBar');
        btn.classList.add('NavigationBarActive');
        updateNavIcons();
        const meta = PAGE_META[id];
        if (meta) {
            if (!tbName) tbName = document.querySelector('.HeaderTitle');
            if (!tbSub) tbSub = document.querySelector('.HeaderDescription');
            if (tbName) tbName.textContent = meta.name;
            if (tbSub) tbSub.textContent = meta.sub;
        }
        if (id === 'Dashboard') {
            loadProcess();
        }
    }, 100);
}

function nav(id) {
    const thisOp = ++navOperationId;
    programmaticScroll = true;
    document.getElementById('Page' + id).scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    setActivePage(id);
    const el = document.querySelector('.Pages');
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
            setActivePage(entry.target.id.replace('Page', ''));
        }
    });
}, { root: document.querySelector('.Pages'), threshold: [0.5, 0.75, 1.0] });

document.querySelectorAll('.Page, .ActivePage').forEach(page => pageObserver.observe(page));

(() => {
    const pagesEl = document.querySelector('.Pages');
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
    const el = document.getElementById('Snack');
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
    ['Brand', 'Brand', 'getprop ro.product.brand'],
    ['Model', 'Model', 'getprop ro.product.model'],
    ['Android', 'Android', 'getprop ro.build.version.release'],
    ['Kernel', 'Kernel', 'uname -r'],
    ['Architecture', 'Architecture', 'getprop ro.product.cpu.abi'],
    ['Root', 'Root', 'command -v ksud >/dev/null 2>&1 && echo KernelSU || (command -v apd >/dev/null 2>&1 && echo APatch || (command -v magisk >/dev/null 2>&1 && echo Magisk || echo Unknown))'],
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
    setNetVal('Latency', data.Latency,
        v => v <= 30 ? 'var(--good)' : v <= 50 ? 'var(--warn)' : 'var(--bad)');
    setNetVal('Jitter', data.Jitter,
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
    const cached = await fetchJSON('Core/ProcessID.json');
    const bannerWrap = document.querySelector('#PageDashboard .BannerWrap');
    if (!bannerWrap) return;

    let overlay = bannerWrap.querySelector('.proc-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'proc-overlay';
        overlay.innerHTML = `<span class="proc-label">PID</span><span class="proc-value" id="proc-pid">—</span>`;
        bannerWrap.appendChild(overlay);
    }
    const pidEl = overlay.querySelector('#proc-pid');
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
        label: 'Disable IP Reach Disconnect',
        icon: 'Monitor,IPReachDisconnect',
        desc: 'Preventing Wi-Fi from suddenly disconnecting when network is unstable.',
        onCmd: 'cmd wifi set-ipreach-disconnect disabled',
        offCmd: 'cmd wifi set-ipreach-disconnect enabled',
        onLabel: 'Disabled', offLabel: 'Enabled',
    },
    "Scan Always Available": {
        label: 'Disable Scan Always Available',
        icon: 'ScanAlwaysAvailable',
        desc: 'Reduces jitter, especially when playing over Wi-Fi connection.',
        onCmd: 'cmd wifi set-scan-always-available disabled ; settings put global wifi_scan_always_enabled 0',
        offCmd: 'cmd wifi set-scan-always-available enabled ; settings put global wifi_scan_always_enabled 1',
        onLabel: 'Disabled', offLabel: 'Enabled',
    },
    "Restrict Background": {
        label: 'Disable Restrict Background',
        icon: 'RestrictBackground',
        desc: 'Maintain ping stability and prevent jitter.',
        onCmd: 'cmd netpolicy set restrict-background false',
        offCmd: 'cmd netpolicy set restrict-background true',
        onLabel: 'Disabled', offLabel: 'Enabled',
    },
    "Power Save": {
        label: 'Disable Power Save',
        icon: 'PowerSave',
        desc: 'Eliminate jitter and maintain stable ping while gaming over Wi-Fi connection.',
        onCmd: 'iw dev wlan0 set power_save off',
        offCmd: 'iw dev wlan0 set power_save on',
        onLabel: 'Disabled', offLabel: 'Enabled',
    },
    "QDISC": {
        label: 'Optimize QDISC',
        icon: 'QDISC',
        desc: 'Split data traffic into multiple paths and prioritize small data packets so they aren\'t held up by large data packets.',
        onCmd: 'tc qdisc replace dev wlan0 root fq_codel quantum 300 noecn ; tc qdisc replace dev rmnet_data0 root fq_codel quantum 300 noecn ; tc qdisc replace dev rmnet_ipa0 root fq_codel quantum 300 noecn',
        offCmd: 'tc qdisc replace dev wlan0 root pfifo_fast ; tc qdisc replace dev rmnet_data0 root pfifo_fast ; tc qdisc replace dev rmnet_ipa0 root pfifo_fast',
        onLabel: 'Optimized', offLabel: 'Unoptimized',
    },
    "Wi-Fi Force Low Latency Mode": {
        label: 'Enable Wi-Fi Force Low Latency Mode',
        icon: 'Wi-FiForceLowLatencyMode',
        desc: 'Force Android to enable built-in low-latency mode at system level.',
        onCmd: 'cmd wifi force-low-latency-mode enabled ; cmd wifi force-hi-perf-mode enabled',
        offCmd: 'cmd wifi force-low-latency-mode disabled ; cmd wifi force-hi-perf-mode disabled',
        onLabel: 'Enabled', offLabel: 'Disabled',
    },
    "Network Avoid Bad Wi-Fi": {
        label: 'Disable Network Avoid Bad Wi-Fi',
        icon: 'NetworkAvoidBadWi-Fi',
        desc: 'Forces system to stay connected to Wi-Fi interface even if signal quality deteriorates.',
        onCmd: 'settings put global network_avoid_bad_wifi 0',
        offCmd: 'settings put global network_avoid_bad_wifi 1',
        onLabel: 'Disabled', offLabel: 'Enabled',
    },
    "BLE Scan Always Enabled": {
        label: 'Disable BLE Scan Always Enabled',
        icon: 'BLEScanAlwaysEnabled',
        desc: 'Minimize jitter and ping spikes when gaming over 2.4 GHz Wi-Fi network.',
        onCmd: 'settings put global ble_scan_always_enabled 0',
        offCmd: 'settings put global ble_scan_always_enabled 1',
        onLabel: 'Disabled', offLabel: 'Enabled',
    },
    "Mobile Data Always ON": {
        label: 'Disable Mobile Data Always ON',
        icon: 'MobileDataAlwaysON',
        desc: 'Disable functions that are likely to disrupt transmission stability.',
        onCmd: 'settings put global mobile_data_always_on 0',
        offCmd: 'settings put global mobile_data_always_on 1',
        onLabel: 'Disabled', offLabel: 'Enabled',
    },
};

function renderTweaks() {
    const container = document.getElementById('PageTweaks');
    container.innerHTML = '';
    for (const [id, t] of Object.entries(TWEAKS)) {
        const card = document.createElement('div');
        card.className = 'Card';
        card.innerHTML = `<div class="tweak">
            <svg class="tw-icon" viewBox="0 0 24 24"><use href="#${t.icon}"/></svg>
            <div class="tw-body">
                <div class="tw-name">${t.label || id}</div>
                <div class="tw-desc">${t.desc}</div>
            </div>
            <label class="sw">
                <input type="checkbox" id="tw-${id}" onchange="applyTweak('${id.replace(/'/g, "\\'")}', this.checked)">
                <div class="sw-track"><div class="sw-thumb"></div></div>
            </label>
        </div>`;
        container.appendChild(card);
    }
}

function renderInfo() {
    const container = document.getElementById('PageInfo');
    container.innerHTML = '';

    const metaCard = document.createElement('div');
    metaCard.className = 'Card';
    metaCard.innerHTML = `<div class="CardLabel">
        <svg viewBox="0 0 24 24"><use href="#Metadata"/></svg>
        Metadata
    </div>
    <div class="IndexRow"><span class="IndexRowlabel">ID</span><span class="IndexRowValue" id="meta-id">—</span></div>
    <div class="IndexRow"><span class="IndexRowlabel">Name</span><span class="IndexRowValue" id="meta-name">—</span></div>
    <div class="IndexRow"><span class="IndexRowlabel">Version</span><span class="IndexRowValue" id="meta-version">—</span></div>
    <div class="IndexRow"><span class="IndexRowlabel">Author</span><span class="IndexRowValue" id="meta-author">—</span></div>
    <div class="IndexRow"><span class="IndexRowlabel">Description</span><span class="IndexRowValue" id="meta-desc">—</span></div>`;
    container.appendChild(metaCard);

    const linksCard = document.createElement('div');
    linksCard.className = 'Card';
    let linksHTML = `<div class="CardLabel">
        <svg viewBox="0 0 24 24"><use href="#Links"/></svg>
        Links
    </div>`;
    for (const link of INFO_LINKS) {
        linksHTML += `<div class="IndexRow">
            <span class="IndexRowlabel">${link.label}</span>
            <a class="ir-link" href="${link.href}" onclick="return openExternal(this.href)">
                <svg viewBox="0 0 24 24" width="14" height="14" class="ir-icon-${link.icon === 'Repository' ? 'github' : 'telegram'}">
                    <use href="#${link.icon}"></use>
                </svg>
                ${link.text}
                <svg viewBox="0 0 24 24" width="14" height="14" class="ir-chevron">
                    <use href="#Chevron"></use>
                </svg>
            </a>
        </div>`;
    }
    linksCard.innerHTML = linksHTML;
    container.appendChild(linksCard);

    const contribCard = document.createElement('div');
    contribCard.className = 'Card';
    let contribHTML = `<div class="CardLabel">
        <svg viewBox="0 0 24 24"><use href="#Contributors"/></svg>
        Contributors
    </div>`;
    for (const c of CONTRIBUTORS) {
        contribHTML += `<div class="IndexRow">
            <span class="IndexRowlabel">${c.label}</span>
            <a class="chip" href="${c.href}" onclick="return openExternal(this.href)">
                <img src="${c.avatar}" class="chip-avatar" alt="${c.name} Avatar" width="18" height="18" loading="lazy" decoding="async" onerror="this.remove()">
                ${c.name}
            </a>
        </div>`;
    }
    contribCard.innerHTML = contribHTML;
    container.appendChild(contribCard);
}

async function loadTweaks() {
    const cached = await fetchJSON('Core/Tweaks.json') || {};
    for (const id of Object.keys(TWEAKS)) {
        const el = document.getElementById('tw-' + id);
        if (el && cached[id] !== undefined) el.checked = cached[id] === 'on';
    }
}

let tweakQueue = Promise.resolve();

async function applyTweak(id, enabled) {
    const t = TWEAKS[id];
    if (!t) return;
    const el = document.getElementById('tw-' + id);
    el.disabled = true;
    tweakQueue = tweakQueue.then(async () => {
        try {
            await exec(enabled ? t.onCmd : t.offCmd);
            const state = await fetchJSON('Core/Tweaks.json') || {};
            state[id] = enabled ? 'on' : 'off';
            const json = JSON.stringify(state).replace(/"/g, '\\"');
            await exec(`echo "${json}" > ${CORE_PATH}/Tweaks.json`);
            await exec(`grep -v "^${id}=" ${CORE_PATH}/VinNet.conf 2>/dev/null > ${CORE_PATH}/VinNet.conf.tmp; echo "${id}=${enabled ? 'on' : 'off'}" >> ${CORE_PATH}/VinNet.conf.tmp; mv ${CORE_PATH}/VinNet.conf.tmp ${CORE_PATH}/VinNet.conf`);
            toast(`${t.label || id} > ${enabled ? t.onLabel : t.offLabel}`);
        } catch {
            toast('Unable to apply tweak');
            el.checked = !enabled;
        } finally {
            el.disabled = false;
        }
    });
}

async function boot() {
    renderTweaks();
    renderInfo();
    await Promise.allSettled([
        loadEnvironment(),
        loadMonitor(),
        loadMetadata(),
        loadProcess(),
        loadTweaks(),
        new Promise(r => setTimeout(r, 300)),
    ]);

    document.getElementById('WebUI').classList.add('ready');
    updateNavIcons();
    const ls = document.getElementById('LoadingScreen');
    if (ls) {
        ls.addEventListener('transitionend', () => ls.remove(), { once: true });
        ls.classList.add('hide');
    }
    startLiveTicker();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100));
else setTimeout(boot, 100);