const Core = '/data/adb/modules/VinNet/webroot/Core';
const LogPath = '/storage/emulated/0/Download/VinNet.log';
const LogCache = new Map();
const Log = (Tag, Data) => {
    const Content = JSON.stringify(Data);
    if (LogCache.get(Tag) === Content) return;
    LogCache.set(Tag, Content);
    exec(`grep -v "^\\[.*\\] ${Tag}:" ${LogPath} 2>/dev/null > ${LogPath}.tmp; echo "[$(date +%T)] ${Tag}: ${Content}" >> ${LogPath}.tmp; mv ${LogPath}.tmp ${LogPath}`).catch(() => { });
};

const Page = {
    Dashboard: { Title: 'VinNet', Description: 'Simple Implementation of Network Optimization' },
    Tweaks: { Title: 'Tweaks', Description: 'Apply Network Optimization Tweaks' },
    Info: { Title: 'Info', Description: 'Details about Module' },
};

const CommitRatio = 0.22;
const CommitMaxPx = 96;
const CommitMinPx = 64;
const EdgeResistance = 3;

let CurrentPageID = null;
let CurrentPageIndex = 0;
let DragOffset = 0;
let PendingOffset = 0;
let DragFrameID = 0;
let Dragging = false;
let GestureAxis = null;
let GestureKind = null;
let GestureStartX = 0;
let GestureStartY = 0;
let GesturePointerID = null;

let NavigationButtons = null;
let TableName = null;
let TableSubordinate = null;
const PagesElement = document.querySelector('.Pages');
let NavigationButtonMap = null;
let NavigationSVGS = null;
let NavigationSVGButtonMap = null;
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

const PageList = ['Dashboard', 'Tweaks', 'Info'];

function PageWidth() {
    return PagesElement.clientWidth || 0;
}

function RenderPages() {
    PagesElement.style.setProperty('--page-base', `${CurrentPageIndex * -100}%`);
    PagesElement.style.setProperty('--page-drag', `${DragOffset}px`);
    const Pages = PagesElement.children;
    for (let I = 0; I < Pages.length; I++) {
        const Active = I === CurrentPageIndex;
        Pages[I].toggleAttribute('inert', !Active);
        Pages[I].setAttribute('aria-hidden', Active ? 'false' : 'true');
    }
}

function SetActivePage(ID) {
    const Index = PageList.indexOf(ID);
    if (Index === -1 || ID === CurrentPageID) return;
    CurrentPageID = ID;
    CurrentPageIndex = Index;
    RenderPages();
    if (!NavigationButtons) {
        NavigationButtons = document.querySelectorAll('.NavigationBar, .NavigationBarActive');
        NavigationButtonMap = new Map([...NavigationButtons].map(B => [B.dataset.page, B]));
    }
    NavigationButtons.forEach(B => {
        const IsActive = B.dataset.page === ID;
        if (IsActive) {
            B.classList.remove('NavigationBar');
            B.classList.add('NavigationBarActive');
        } else {
            B.classList.remove('NavigationBarActive');
            B.classList.add('NavigationBar');
        }
    });
    UpdateNavigationIcons();
    const Meta = Page[ID];
    if (Meta) {
        if (!TableName) TableName = document.querySelector('.HeaderTitle');
        if (!TableSubordinate) TableSubordinate = document.querySelector('.HeaderDescription');
        if (TableName && TableSubordinate) {
            const HeaderTextEl = TableName.parentElement;
            if (HeaderTextEl) {
                HeaderTextEl.style.opacity = '0';
                setTimeout(() => {
                    TableName.textContent = Meta.Title;
                    TableSubordinate.textContent = Meta.Description;
                    HeaderTextEl.style.opacity = '1';
                }, 160);
            } else {
                TableName.textContent = Meta.Title;
                TableSubordinate.textContent = Meta.Description;
            }
        }
    }
    if (ID === 'Dashboard') {
        LoadProcessID();
    }
}

function CommitTargetIndex() {
    const Width = PageWidth();
    const Threshold = Width ? Math.min(Width * CommitRatio, CommitMaxPx) : CommitMinPx;
    const LastIndex = PageList.length - 1;
    if (DragOffset < -Threshold && CurrentPageIndex < LastIndex) return CurrentPageIndex + 1;
    if (DragOffset > Threshold && CurrentPageIndex > 0) return CurrentPageIndex - 1;
    return CurrentPageIndex;
}

function Navigation(ID) {
    if (PageList.indexOf(ID) === -1) return;
    if (DragFrameID) {
        cancelAnimationFrame(DragFrameID);
        DragFrameID = 0;
    }
    ResetGesture();
    SetActivePage(ID);
    RenderPages();
}

function ResetGesture() {
    Dragging = false;
    GestureAxis = null;
    GestureKind = null;
    GesturePointerID = null;
    DragOffset = 0;
    PendingOffset = 0;
    PagesElement.classList.remove('Dragging');
}

function BeginGesture(X, Y, Kind, PointerID) {
    if (DragFrameID) {
        cancelAnimationFrame(DragFrameID);
        DragFrameID = 0;
    }
    ResetGesture();
    GestureKind = Kind;
    GesturePointerID = PointerID;
    GestureStartX = X;
    GestureStartY = Y;
    Dragging = true;
    PagesElement.classList.add('Dragging');
    RenderPages();
}

function MoveGesture(X, Y, Event, OnAxisLock) {
    if (!Dragging) return;
    const DeltaX = X - GestureStartX;
    const DeltaY = Y - GestureStartY;
    if (GestureAxis === null) {
        const AbsX = Math.abs(DeltaX);
        if (AbsX === 0 || AbsX < Math.abs(DeltaY)) return;
        GestureAxis = 'x';
        if (OnAxisLock) {
            try { OnAxisLock(); } catch { }
        }
    }
    if (Event.cancelable) Event.preventDefault();
    let Offset = DeltaX;
    if ((CurrentPageIndex === 0 && Offset > 0) || (CurrentPageIndex === PageList.length - 1 && Offset < 0)) {
        Offset /= EdgeResistance;
    }
    PendingOffset = Offset;
    if (!DragFrameID) {
        DragFrameID = requestAnimationFrame(() => {
            DragFrameID = 0;
            if (!Dragging) return;
            DragOffset = PendingOffset;
            RenderPages();
        });
    }
}

function EndGesture(Commit, Element) {
    if (!Dragging) return;
    Dragging = false;
    PagesElement.classList.remove('Dragging');
    if (Element && GesturePointerID !== null && Element.hasPointerCapture(GesturePointerID)) {
        Element.releasePointerCapture(GesturePointerID);
    }
    if (DragFrameID) {
        cancelAnimationFrame(DragFrameID);
        DragFrameID = 0;
        DragOffset = PendingOffset;
    }
    if (Commit && GestureAxis === 'x') SetActivePage(PageList[CommitTargetIndex()]);
    ResetGesture();
    RenderPages();
}

PagesElement.addEventListener('pointerdown', E => {
    if (E.pointerType === 'touch' || !E.isPrimary || (E.pointerType === 'mouse' && E.button !== 0)) return;
    BeginGesture(E.clientX, E.clientY, 'pointer', E.pointerId);
});

PagesElement.addEventListener('pointermove', E => {
    if (GestureKind !== 'pointer' || E.pointerId !== GesturePointerID) return;
    MoveGesture(E.clientX, E.clientY, E, () => {
        if (E.currentTarget.hasPointerCapture(E.pointerId)) return;
        E.currentTarget.setPointerCapture(E.pointerId);
    });
}, { passive: false });

PagesElement.addEventListener('pointerup', E => {
    if (E.pointerId !== GesturePointerID) return;
    EndGesture(true, E.currentTarget);
});

PagesElement.addEventListener('pointercancel', E => {
    if (E.pointerId !== GesturePointerID) return;
    EndGesture(false, E.currentTarget);
});

PagesElement.addEventListener('touchstart', E => {
    if (E.touches.length !== 1) return;
    BeginGesture(E.touches[0].screenX, E.touches[0].screenY, 'touch', null);
}, { passive: true });

PagesElement.addEventListener('touchmove', E => {
    if (GestureKind !== 'touch' || E.touches.length !== 1) return;
    MoveGesture(E.touches[0].screenX, E.touches[0].screenY, E, null);
}, { passive: false });

PagesElement.addEventListener('touchend', E => {
    if (GestureKind !== 'touch' || E.touches.length > 0) return;
    EndGesture(true, E.currentTarget);
});

PagesElement.addEventListener('touchcancel', E => {
    if (GestureKind !== 'touch') return;
    EndGesture(false, E.currentTarget);
});

document.addEventListener('dragstart', E => E.preventDefault());

document.getElementById('Navigation').addEventListener('click', E => {
    const Button = E.target.closest('.NavigationBar, .NavigationBarActive');
    if (Button && Button.dataset.page) Navigation(Button.dataset.page);
});

CurrentPageID = PageList[0];
RenderPages();


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
                'resetprop ro.product.brand': '—',
                'resetprop ro.product.model': '—',
                'resetprop ro.build.version.release': '—',
                'uname -r': '—',
                'resetprop ro.product.cpu.abi': '—',
            };
            if (MOCK[cmd] !== undefined) { resolve(MOCK[cmd]); return; }
            if (cmd.toLowerCase().startsWith('ping')) { resolve('—'); return; }
            resolve('');
        }
    });
}

const Environment = [
    ['Brand', 'Brand', 'resetprop ro.product.brand'],
    ['Model', 'Model', 'resetprop ro.product.model'],
    ['Android', 'Android', 'resetprop ro.build.version.release'],
    ['Kernel', 'Kernel', 'uname -r'],
    ['Architecture', 'Architecture', 'resetprop ro.product.cpu.abi'],
    ['Root', 'Root', 'command -v ksud >/dev/null 2>&1 && echo KernelSU || (command -v apd >/dev/null 2>&1 && echo APatch || (command -v magisk >/dev/null 2>&1 && echo Magisk || echo Unknown))'],
];

const VendorBinary = [
    ['Vendor', '[ "$(resetprop ro.product.device)" = "fog" ] && { grep -q "VinNet" /vendor/etc/wifi/WCNSS_qcom_cfg.ini 2>/dev/null && grep -q "p2p_disabled=1" /vendor/etc/wifi/wpa_supplicant_overlay.conf 2>/dev/null && grep -q "ap_scan=1" /vendor/etc/wifi/wpa_supplicant.conf 2>/dev/null && echo Mounted || echo Unmounted; } || echo Unmounted'],
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
    let Cached = await FetchJSON('Core/Metadata.json');
    Log('Metadata', Cached);
    if (!Cached) {
        try {
            const Raw = await exec('cat /data/adb/modules/VinNet/module.prop 2>/dev/null');
            if (Raw) {
                const Prop = Object.fromEntries(
                    Raw.split('\n')
                        .map(L => L.trim().split('='))
                        .filter(P => P.length >= 2)
                        .map(([K, ...V]) => [K.trim().toLowerCase(), V.join('=').trim()])
                );
                Cached = {
                    ID: Prop.id,
                    Name: Prop.name,
                    Version: Prop.version,
                    VersionCode: Prop.versioncode,
                    Author: Prop.author,
                    Description: Prop.description,
                };
            }
        } catch { }
    }
    if (!Cached) return;
    requestAnimationFrame(() => {
        for (const [ID, Key] of Metadata) {
            const Element = document.getElementById(ID);
            if (Element && Cached[Key]) Element.textContent = Cached[Key];
        }
        const VersionElement = document.getElementById('MetadataVersion');
        if (VersionElement && Cached.Version) {
            VersionElement.textContent = Cached.VersionCode ? `${Cached.Version} (${Cached.VersionCode})` : Cached.Version;
        }
    });
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
    if (Cached && Cached.Latency != null) {
        ApplyMonitor(Cached);
    } else {
        try {
            const Output = await exec('ping -c 2 -w 2 8.8.8.8 2>/dev/null || ping -c 2 -w 2 1.1.1.1 2>/dev/null');
            const Matches = [...Output.matchAll(/time=([\d.]+)\s*ms/gi)].map(M => parseFloat(M[1]));
            if (Matches.length >= 1) {
                const Latency = Math.round(Matches.reduce((A, B) => A + B, 0) / Matches.length);
                let Jitter = 0;
                for (let I = 1; I < Matches.length; I++) Jitter += Math.abs(Matches[I] - Matches[I - 1]);
                Jitter = Matches.length > 1 ? Math.round(Jitter / (Matches.length - 1)) : 0;
                ApplyMonitor({ Latency, Jitter });
            } else {
                ApplyMonitor({ Latency: '—', Jitter: '—' });
            }
        } catch {
            ApplyMonitor({ Latency: '—', Jitter: '—' });
        }
    }
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
    if (Cached && Cached.PID != null) {
        ProcessID.textContent = Cached.PID;
    } else {
        try {
            const PID = await exec('pgrep -f "VinNet/service.sh" | head -n 1');
            ProcessID.textContent = PID || '—';
        } catch {
            ProcessID.textContent = '—';
        }
    }
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
        Description: 'Force Android to enable built-in low-latency mode at system level, falling back to hi-perf mode on devices that lack it.',
        ONCommand: 'cmd wifi force-low-latency-mode enabled 2>/dev/null || cmd wifi force-hi-perf-mode enabled',
        OFFCommand: 'cmd wifi force-low-latency-mode disabled 2>/dev/null || cmd wifi force-hi-perf-mode disabled',
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
    "Wi-Fi Scan Throttle": {
        Label: 'Enable Wi-Fi Scan Throttle',
        Icon: 'Wi-FiScanThrottle',
        Description: 'Limit background Wi-Fi scanning to conserve battery life and prevent jitter.',
        ONCommand: 'settings put global wifi_scan_throttle_enabled 1',
        OFFCommand: 'settings put global wifi_scan_throttle_enabled 0',
        ONLabel: 'Enabled', OFFLabel: 'Disabled',
    }
};

async function RenderTweaks() {
    const Container = document.getElementById('PageTweaks');
    const Template = document.getElementById('TweakCardTemplate');
    TweakState = await FetchJSON('Core/Tweaks.json');
    if (!TweakState) {
        try {
            const RawConf = await exec('cat /data/adb/modules/VinNet/webroot/Core/VinNet.conf 2>/dev/null');
            if (RawConf) {
                TweakState = Object.fromEntries(
                    RawConf.split('\n')
                        .map(L => L.trim().split('='))
                        .filter(P => P.length >= 2)
                        .map(([K, ...V]) => [K.trim(), V.join('=').trim()])
                );
            }
        } catch { }
        TweakState = TweakState || {};
    }
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
        Input.checked = TweakState[ID] === 'ON';
        Input.dataset.tweakId = ID;
        Container.appendChild(Card);
    }
}

document.addEventListener('change', Event => {
    if (Event.target.matches('#PageTweaks input[type="checkbox"]')) {
        ApplyTweak(Event.target.dataset.tweakId, Event.target.checked);
    }
});

document.addEventListener('click', Event => {
    const Link = Event.target.closest('#PageInfo a[href]');
    if (Link) {
        Event.preventDefault();
        OpenLink(Link.href);
    }
});

let TweakQueue = Promise.resolve();

async function ApplyTweak(ID, Enabled) {
    const Tweak = Tweaks[ID];
    if (!Tweak) return;
    const Element = document.getElementById('Tweak-' + ID);
    Element.disabled = true;
    TweakQueue = TweakQueue.then(async () => {
        try {
            await exec(Enabled ? Tweak.ONCommand : Tweak.OFFCommand);
            if (!TweakState) TweakState = {};
            TweakState[ID] = Enabled ? 'ON' : 'OFF';
            const Value = Enabled ? 'ON' : 'OFF';
            const Content = JSON.stringify(TweakState).replace(/"/g, '\\"');
            await Promise.all([
                exec(`echo "${Content}" > ${Core}/Tweaks.json`),
                exec(`grep -v "^${ID}=" ${Core}/VinNet.conf 2>/dev/null > ${Core}/VinNet.conf.tmp; echo "${ID}=${Value}" >> ${Core}/VinNet.conf.tmp; mv ${Core}/VinNet.conf.tmp ${Core}/VinNet.conf`),
            ]);
            Log('Tweaks', TweakState);
            Toast(`${Tweak.Label || ID} > ${Enabled ? Tweak.ONLabel : Tweak.OFFLabel}`);
        } catch {
            Toast('Unable to apply tweak');
            Element.checked = !Enabled;
        } finally {
            Element.disabled = false;
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

async function Load() {
    await Promise.allSettled([
        LoadEnvironment(),
        FetchMonitor(),
        LoadMetadata(),
        LoadProcessID(),
        RenderTweaks(),
        ...Array.from(document.querySelectorAll('.Banner'), DecodeImage),
        new Promise(r => setTimeout(r, 300)),
    ]);

    document.getElementById('WebUI').classList.add('Ready');
    UpdateNavigationIcons();
    const LoadingScreen = document.getElementById('LoadingScreen');
    if (LoadingScreen) {
        LoadingScreen.addEventListener('transitionend', () => LoadingScreen.remove(), { once: true });
        LoadingScreen.classList.add('Hide');
    }
    StartLiveTicker();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(Load, 100));
else setTimeout(Load, 100);