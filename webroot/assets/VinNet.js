const Core = '/data/adb/modules/VinNet/webroot/Core';
const LogPath = '/storage/emulated/0/Download/VinNet.log';
const LogCache = new Map();
const Log = (Tag, Data) => {
    const Content = JSON.stringify(Data);
    if (LogCache.get(Tag) === Content) return;
    LogCache.set(Tag, Content);
    exec(`grep -v "^\\[.*\\] ${Tag}:" ${LogPath} 2>/dev/null > ${LogPath}.tmp; echo "[$(date +%T)] ${Tag}: ${Content}" >> ${LogPath}.tmp; mv ${LogPath}.tmp ${LogPath}`).catch(() => { });
};
let ProgrammaticScroll = false;

const Page = {
    Dashboard: { Title: 'VinNet', Description: 'Enhanced Implementation of Network Optimization' },
    Tweaks: { Title: 'Tweaks', Description: 'Apply Network Optimization Tweaks' },
    Info: { Title: 'Info', Description: 'Details about Module' },
};

let CurrentPageID = null;
let ActivePageTimer = null;
let NavigationOperationID = 0;

let NavigationButtons = null;
let TableName = null;
let TableSubordinate = null;
const PagesElement = document.querySelector('.Pages');
let NavigationButtonMap = null;
let NavigationSVGS = null;
let NavigationSVGButtonMap = null;
let PageElementMap = null;
let LastMonitor = { Latency: null, Jitter: null };

const LatencyColor = v => v <= 30 ? 'var(--Good)' : v <= 50 ? 'var(--Warn)' : 'var(--Bad)';
const JitterColor = v => v === 0 ? 'var(--Good)' : v <= 10 ? 'var(--Warn)' : 'var(--Bad)';

function UpdateNavigationIcons() {
    if (!NavigationSVGS) {
        NavigationSVGS = document.querySelectorAll('.NavigationBar svg[data-fill], .NavigationBarActive svg[data-fill]');
        NavigationSVGButtonMap = new Map([...NavigationSVGS].map(svg => [svg, svg.closest('.NavigationBar, .NavigationBarActive')]));
    }
    NavigationSVGS.forEach(SVG => {
        const Button = NavigationSVGButtonMap.get(SVG);
        const Active = Button.classList.contains('NavigationBarActive');
        SVG.querySelector('path').setAttribute('d', SVG.dataset[Active ? 'fill' : 'outline']);
    });
}

function SetActivePage(ID) {
    if (ID === CurrentPageID) return;
    clearTimeout(ActivePageTimer);
    ActivePageTimer = setTimeout(() => {
        const Previous = CurrentPageID;
        CurrentPageID = ID;
        if (!NavigationButtons) {
            NavigationButtons = document.querySelectorAll('.NavigationBar, .NavigationBarActive');
            NavigationButtonMap = new Map([...NavigationButtons].map(B => [B.dataset.page, B]));
        }
        if (Previous) { const P = NavigationButtonMap.get(Previous); if (P) { P.classList.replace('NavigationBarActive', 'NavigationBar'); } }
        const Button = NavigationButtonMap.get(ID);
        if (!Button) return;
        Button.classList.replace('NavigationBar', 'NavigationBarActive');
        UpdateNavigationIcons();
        const Meta = Page[ID];
        if (Meta) {
            if (!TableName) TableName = document.querySelector('.HeaderTitle');
            if (!TableSubordinate) TableSubordinate = document.querySelector('.HeaderDescription');
            if (TableName) TableName.textContent = Meta.Title;
            if (TableSubordinate) TableSubordinate.textContent = Meta.Description;
        }
        if (ID === 'Dashboard') {
            LoadProcessID();
        }
    }, 100);
}

function Navigation(ID) {
    const ThisOperation = ++NavigationOperationID;
    ProgrammaticScroll = true;
    if (!PageElementMap) {
        PageElementMap = new Map([
            ['Dashboard', document.getElementById('PageDashboard')],
            ['Tweaks', document.getElementById('PageTweaks')],
            ['Info', document.getElementById('PageInfo')]
        ]);
    }
    PageElementMap.get(ID).scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    SetActivePage(ID);
    if ('onscrollend' in PagesElement) {
        PagesElement.addEventListener('scrollend', () => {
            if (ThisOperation === NavigationOperationID) ProgrammaticScroll = false;
        }, { once: true });
    } else {
        setTimeout(() => {
            if (ThisOperation === NavigationOperationID) ProgrammaticScroll = false;
        }, 400);
    }
}

const PageObserver = new IntersectionObserver((Entries) => {
    if (ProgrammaticScroll) return;
    Entries.forEach(Entry => {
        if (Entry.isIntersecting && Entry.intersectionRatio >= 0.75) {
            SetActivePage(Entry.target.id.replace('Page', ''));
        }
    });
}, { root: PagesElement, threshold: 0.75 });

document.addEventListener('dragstart', E => E.preventDefault());

document.getElementById('Navigation').addEventListener('click', E => {
    const Button = E.target.closest('.NavigationBar, .NavigationBarActive');
    if (Button && Button.dataset.page) Navigation(Button.dataset.page);
});

document.querySelectorAll('.Page, .ActivePage').forEach(Page => PageObserver.observe(Page));

(() => {
    let TouchStartX = 0;
    let TouchStartY = 0;

    PagesElement.addEventListener('touchstart', (E) => {
        if (E.touches.length > 1) {
            const Pages = ['Dashboard', 'Tweaks', 'Info'];
            const Nearest = Math.round(PagesElement.scrollLeft / PagesElement.clientWidth);
            Navigation(Pages[Math.max(0, Math.min(Nearest, Pages.length - 1))]);
            return;
        }
        TouchStartX = E.touches[0].clientX;
        TouchStartY = E.touches[0].clientY;
    }, { passive: true });

    PagesElement.addEventListener('touchmove', (E) => {
        const DeltaX = E.touches[0].clientX - TouchStartX;
        const DeltaY = E.touches[0].clientY - TouchStartY;
        if (Math.abs(DeltaY) > Math.abs(DeltaX)) return;
        const AtStart = PagesElement.scrollLeft <= 0;
        const AtEnd = PagesElement.scrollLeft >= PagesElement.scrollWidth - PagesElement.clientWidth - 1;
        if ((AtStart && DeltaX > 0) || (AtEnd && DeltaX < 0)) {
            E.preventDefault();
        }
    }, { passive: false });
})();

const SnackElement = document.getElementById('Snack');
let SnackTimer;
function Toast(Message) {
    SnackElement.textContent = Message;
    SnackElement.classList.add('Show');
    clearTimeout(SnackTimer);
    SnackTimer = setTimeout(() => SnackElement.classList.remove('Show'), 2400);
}

function OpenLink(URL) {
    exec(`am start -a android.intent.action.VIEW -d "${URL}"`).catch(() => Toast('Unable to open link'));
    return false;
}

async function FetchJSON(Path) {
    try {
        const Response = await fetch(Path, { cache: 'no-store' });
        if (!Response.ok) return null;
        return await Response.json();
    } catch { return null; }
}

let CallbackCounter = 0;
function exec(cmd) {
    return new Promise((resolve, reject) => {
        if (window.ksu && typeof ksu.exec === 'function') {
            const CallbackName = `__exec_cb_${++CallbackCounter}`;
            window[CallbackName] = (Code, Output, Error) => {
                delete window[CallbackName];
                Code === 0 ? resolve((Output || '').trim()) : reject((Error || '').trim());
            };
            try { ksu.exec(cmd, JSON.stringify({}), CallbackName); } catch (e) { delete window[CallbackName]; reject(String(e)); }
        } else {
            const MOCK = {
                'getprop ro.product.brand': '—',
                'getprop ro.product.model': '—',
                'getprop ro.build.version.release': '—',
                'uname -r': '—',
                'getprop ro.product.cpu.abi': '—',
            };
            if (MOCK[cmd] !== undefined) { resolve(MOCK[cmd]); return; }
            if (cmd.toLowerCase().startsWith('ping')) { resolve('—'); return; }
            resolve('');
        }
    });
}

const Environment = [
    ['Brand', 'Brand', 'getprop ro.product.brand'],
    ['Model', 'Model', 'getprop ro.product.model'],
    ['Android', 'Android', 'getprop ro.build.version.release'],
    ['Kernel', 'Kernel', 'uname -r'],
    ['Architecture', 'Architecture', 'getprop ro.product.cpu.abi'],
    ['Root', 'Root', 'command -v ksud >/dev/null 2>&1 && echo KernelSU || (command -v apd >/dev/null 2>&1 && echo APatch || (command -v magisk >/dev/null 2>&1 && echo Magisk || echo Unknown))'],
];

const VendorBinary = [
    ['Vendor', '[ "$(getprop ro.product.device)" = "fog" ] && { grep -q "VinNet" /vendor/etc/wifi/WCNSS_qcom_cfg.ini 2>/dev/null && grep -q "p2p_disabled=1" /vendor/etc/wifi/wpa_supplicant_overlay.conf 2>/dev/null && grep -q "ap_scan=1" /vendor/etc/wifi/wpa_supplicant.conf 2>/dev/null && echo Mounted || echo Unmounted; } || echo Unmounted'],
    ['Binary', 'command -v iw >/dev/null 2>&1 && echo Mounted || echo Unmounted'],
];

async function LoadEnvironment() {
    const Cached = await FetchJSON('Core/Environment.json');
    Log('Environment', Cached);
    if (Cached) {
        requestAnimationFrame(() => {
            for (const [ID, Key] of Environment) document.getElementById(ID).textContent = Cached[Key] || '—';
        });
    } else {
        const Results = await Promise.all(Environment.map(async ([ID, Key, CMD]) => {
            try { return [ID, await exec(CMD) || '—']; } catch { return [ID, '—']; }
        }));
        requestAnimationFrame(() => {
            for (const [ID, text] of Results) document.getElementById(ID).textContent = text;
        });
    }
    const VendorBinaryResults = await Promise.all(VendorBinary.map(async ([ID, CMD]) => {
        try { return [ID, await exec(CMD) || '—']; } catch { return [ID, '—']; }
    }));
    requestAnimationFrame(() => {
        for (const [ID, Text] of VendorBinaryResults) document.getElementById(ID).textContent = Text;
    });
}

const Metadata = [
    ['MetadataID', 'ID'], ['MetadataName', 'Name'],
    ['MetadataAuthor', 'Author'], ['MetadataDescription', 'Description'],
];

async function LoadMetadata() {
    const Cached = await FetchJSON('Core/Metadata.json');
    Log('Metadata', Cached);
    if (!Cached) return;
    for (const [ID, Key] of Metadata) {
        const Element = document.getElementById(ID);
        if (Element && Cached[Key]) Element.textContent = Cached[Key];
    }
    const VersionElement = document.getElementById('MetadataVersion');
    if (VersionElement && Cached.Version) {
        VersionElement.textContent = Cached.VersionCode ? `${Cached.Version} (${Cached.VersionCode})` : Cached.Version;
    }
}

const ElementCache = new Map();
function GetElement(ID) {
    if (!ElementCache.has(ID)) ElementCache.set(ID, document.getElementById(ID));
    return ElementCache.get(ID);
}

function SetMonitorValue(ID, Value, Color) {
    const Element = GetElement(ID);
    const Next = (Value == null || Value === '—') ? '—' : Value + ' ms';
    const Changed = Element.textContent !== Next;
    if (Changed) Element.style.opacity = '0.3';
    Element.textContent = Next;
    const NextColor = (Value == null || Value === '—') ? '' : Color(Value);
    if (Element.style.color !== NextColor) Element.style.color = NextColor;
    if (Changed) requestAnimationFrame(() => { Element.style.opacity = '1'; });
}

function ApplyMonitor(Data) {
    if (Data.Latency === LastMonitor.Latency && Data.Jitter === LastMonitor.Jitter) return;
    LastMonitor = { Latency: Data.Latency, Jitter: Data.Jitter };
    SetMonitorValue('Latency', Data.Latency, LatencyColor);
    SetMonitorValue('Jitter', Data.Jitter, JitterColor);
}

function Detect() {
    exec(`date +%s > ${Core}/Detect.txt`).catch(() => { });
}

async function FetchMonitor() {
    Detect();
    const Cached = await FetchJSON('Core/Monitor.json');
    Log('Monitor', Cached);
    if (Cached && Cached.Latency != null) ApplyMonitor(Cached);
}

let ProcessID = null;

async function LoadProcessID() {
    const Cached = await FetchJSON('Core/ProcessID.json');
    Log('ProcessID', Cached);
    if (!ProcessID) {
        const BannerWrap = document.querySelector('#PageDashboard .BannerWrap');
        if (!BannerWrap) return;
        let Overlay = BannerWrap.querySelector('.ProcessOverlay');
        if (!Overlay) {
            Overlay = document.createElement('div');
            Overlay.className = 'ProcessOverlay';
            Overlay.innerHTML = `<span class="ProcessLabel">PID</span><span class="ProcessValue" id="ProcessID">—</span>`;
            BannerWrap.appendChild(Overlay);
        }
        ProcessID = Overlay.querySelector('#ProcessID');
    }
    if (Cached && Cached.PID != null) ProcessID.textContent = Cached.PID;
}

let TweakState = null;

let LiveTickInterval = null;
function StartLiveTicker() {
    if (LiveTickInterval) return;
    LiveTickInterval = setInterval(FetchMonitor, 4000);
}

function StopLiveTicker() {
    if (LiveTickInterval) {
        clearInterval(LiveTickInterval);
        LiveTickInterval = null;
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        StopLiveTicker();
    } else {
        Detect();
        StartLiveTicker();
    }
});

const Tweaks = {
    "IP Reach Disconnect": {
        Label: 'Disable IP Reach Disconnect',
        Icon: 'Monitor,IPReachDisconnect',
        Description: 'Preventing Wi-Fi from suddenly disconnecting when network is unstable.',
        ONCommand: 'cmd wifi set-ipreach-disconnect disabled',
        OFFCommand: 'cmd wifi set-ipreach-disconnect enabled',
        ONLabel: 'Disabled', OFFLabel: 'Enabled',
    },
    "Scan Always Available": {
        Label: 'Disable Scan Always Available',
        Icon: 'ScanAlwaysAvailable',
        Description: 'Reduces jitter, especially when playing over Wi-Fi connection.',
        Warn: 'May cause location services to not function properly',
        ONCommand: 'cmd wifi set-scan-always-available disabled ; settings put global wifi_scan_always_enabled 0',
        OFFCommand: 'cmd wifi set-scan-always-available enabled ; settings put global wifi_scan_always_enabled 1',
        ONLabel: 'Disabled', OFFLabel: 'Enabled',
    },
    "Restrict Background": {
        Label: 'Disable Restrict Background',
        Icon: 'RestrictBackground',
        Description: 'Maintain ping stability and prevent jitter.',
        ONCommand: 'cmd netpolicy set restrict-background false',
        OFFCommand: 'cmd netpolicy set restrict-background true',
        ONLabel: 'Disabled', OFFLabel: 'Enabled',
    },
    "Power Save": {
        Label: 'Disable Power Save',
        Icon: 'PowerSave',
        Description: 'Eliminate jitter and maintain stable ping while gaming over Wi-Fi connection.',
        ONCommand: 'iw dev wlan0 set power_save off',
        OFFCommand: 'iw dev wlan0 set power_save on',
        ONLabel: 'Disabled', OFFLabel: 'Enabled',
    },
    "QDISC": {
        Label: 'Optimize QDISC',
        Icon: 'QDISC',
        Description: 'Split data traffic into multiple paths and prioritize small data packets so they aren\'t held up by large data packets.',
        ONCommand: 'tc qdisc replace dev wlan0 root fq_codel quantum 300 noecn ; tc qdisc replace dev rmnet_data0 root fq_codel quantum 300 noecn ; tc qdisc replace dev rmnet_ipa0 root fq_codel quantum 300 noecn',
        OFFCommand: 'tc qdisc replace dev wlan0 root pfifo_fast ; tc qdisc replace dev rmnet_data0 root pfifo_fast ; tc qdisc replace dev rmnet_ipa0 root pfifo_fast',
        ONLabel: 'Optimized', OFFLabel: 'Unoptimized',
    },
    "Wi-Fi Force Low Latency Mode": {
        Label: 'Enable Wi-Fi Force Low Latency Mode',
        Icon: 'Wi-FiForceLowLatencyMode',
        Description: 'Force Android to enable built-in low-latency mode at system level.',
        ONCommand: 'cmd wifi force-low-latency-mode enabled ; cmd wifi force-hi-perf-mode enabled',
        OFFCommand: 'cmd wifi force-low-latency-mode disabled ; cmd wifi force-hi-perf-mode disabled',
        ONLabel: 'Enabled', OFFLabel: 'Disabled',
    },
    "Network Avoid Bad Wi-Fi": {
        Label: 'Disable Network Avoid Bad Wi-Fi',
        Icon: 'NetworkAvoidBadWi-Fi',
        Description: 'Forces system to stay connected to Wi-Fi interface even if signal quality deteriorates.',
        ONCommand: 'settings put global network_avoid_bad_wifi 0',
        OFFCommand: 'settings put global network_avoid_bad_wifi 1',
        ONLabel: 'Disabled', OFFLabel: 'Enabled',
    },
    "BLE Scan Always Enabled": {
        Label: 'Disable BLE Scan Always Enabled',
        Icon: 'BLEScanAlwaysEnabled',
        Description: 'Minimize jitter and ping spikes when gaming over 2.4 GHz Wi-Fi network.',
        ONCommand: 'settings put global ble_scan_always_enabled 0',
        OFFCommand: 'settings put global ble_scan_always_enabled 1',
        ONLabel: 'Disabled', OFFLabel: 'Enabled',
    },
    "Mobile Data Always ON": {
        Label: 'Disable Mobile Data Always ON',
        Icon: 'MobileDataAlwaysON',
        Description: 'Disable functions that are likely to disrupt transmission stability.',
        ONCommand: 'settings put global mobile_data_always_on 0',
        OFFCommand: 'settings put global mobile_data_always_on 1',
        ONLabel: 'Disabled', OFFLabel: 'Enabled',
    },
    "Wi-Fi Country Code": {
        Label: 'Change Wi-Fi Country Code',
        Icon: 'Wi-FiCountryCode',
        Description: 'Change country code to “US” to bypass certain restrictions on Wi-Fi.',
        ONCommand: 'resetprop ro.boot.wificountrycode US',
        OFFCommand: 'resetprop ro.boot.wificountrycode 00',
        ONLabel: 'Changed', OFFLabel: 'Unchanged',
    },
    "Force LTE CA": {
        Label: 'Enable Force LTE CA',
        Icon: 'ForceLTECA',
        Description: 'Combines two or more cellular frequency bands simultaneously, resulting in significantly faster internet speeds and more stable connection on 4G or 4G+ networks.',
        ONCommand: 'resetprop -p persist.sys.radio.force_lte_ca true',
        OFFCommand: 'resetprop -p persist.sys.radio.force_lte_ca false',
        ONLabel: 'Enabled', OFFLabel: 'Disabled',
    },
};

async function RenderTweaks() {
    const Container = document.getElementById('PageTweaks');
    const Template = document.getElementById('TweakCardTemplate');
    TweakState = await FetchJSON('Core/Tweaks.json') || {};
    Log('Tweaks', TweakState);

    Container.replaceChildren();
    for (const [ID, Tweak] of Object.entries(Tweaks)) {
        const Card = Template.content.cloneNode(true);
        Card.querySelector('.TweakIcon use').setAttribute('href', '#' + Tweak.Icon);
        Card.querySelector('.TweakName').textContent = Tweak.Label || ID;
        Card.querySelector('.TweakDescription').textContent = Tweak.Description;
        if (Tweak.Warn) {
            const Warn = document.createElement('div');
            Warn.className = 'TweakWarn';
            Warn.textContent = Tweak.Warn;
            Card.querySelector('.TweakBody').appendChild(Warn);
        }
        const Input = Card.querySelector('Input');
        Input.id = 'Tweak-' + ID;
        Input.checked = TweakState[ID] === 'on';
        Input.dataset.tweakId = ID;
        Container.appendChild(Card);
    }
}

document.addEventListener('change', e => {
    if (e.target.matches('#PageTweaks input[type="checkbox"]')) {
        applyTweak(e.target.dataset.tweakId, e.target.checked);
    }
});

document.addEventListener('click', e => {
    const link = e.target.closest('#PageInfo a[href]');
    if (link) {
        e.preventDefault();
        OpenLink(link.href);
    }
});

let tweakQueue = Promise.resolve();

async function applyTweak(ID, enabled) {
    const t = Tweaks[ID];
    if (!t) return;
    const el = document.getElementById('Tweak-' + ID);
    el.disabled = true;
    tweakQueue = tweakQueue.then(async () => {
        try {
            await exec(enabled ? t.ONCommand : t.OFFCommand);
            if (!TweakState) TweakState = {};
            TweakState[ID] = enabled ? 'on' : 'off';
            const val = enabled ? 'on' : 'off';
            const json = JSON.stringify(TweakState).replace(/"/g, '\\"');
            await Promise.all([
                exec(`echo "${json}" > ${Core}/Tweaks.json`),
                exec(`grep -v "^${ID}=" ${Core}/VinNet.conf 2>/dev/null > ${Core}/VinNet.conf.tmp; echo "${ID}=${val}" >> ${Core}/VinNet.conf.tmp; mv ${Core}/VinNet.conf.tmp ${Core}/VinNet.conf`),
            ]);
            Log('Tweaks', TweakState);
            Toast(`${t.Label || ID} > ${enabled ? t.ONLabel : t.OFFLabel}`);
        } catch {
            Toast('Unable to apply tweak');
            el.checked = !enabled;
        } finally {
            el.disabled = false;
        }
    });
}

async function DecodeImage(ImageElement) {
    if (!ImageElement) return;
    try {
        if (ImageElement.complete) {
            if (ImageElement.decode) await ImageElement.decode();
        } else {
            await new Promise((resolve) => {
                ImageElement.onload = () => { ImageElement.decode ? ImageElement.decode().then(resolve, resolve) : resolve(); };
                ImageElement.onerror = resolve;
            });
        }
    } catch { }
}

async function boot() {
    await Promise.allSettled([
        LoadEnvironment(),
        FetchMonitor(),
        LoadMetadata(),
        LoadProcessID(),
        RenderTweaks(),
        DecodeImage(document.querySelector('.HeaderLogo img')),
        DecodeImage(document.querySelector('.Banner')),
        new Promise(r => setTimeout(r, 300)),
    ]);

    document.getElementById('WebUI').classList.add('ready');
    UpdateNavigationIcons();
    const ls = document.getElementById('LoadingScreen');
    if (ls) {
        ls.addEventListener('transitionend', () => ls.remove(), { once: true });
        ls.classList.add('hide');
    }
    startLiveTicker();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100));
else setTimeout(boot, 100);
