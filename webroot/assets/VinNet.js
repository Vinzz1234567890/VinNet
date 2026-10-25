const Core = '/data/adb/VinNet';
const LogFile = '/storage/emulated/0/Download/VinNet.log';

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

let LogQueue = Promise.resolve();
const Log = (Tag, Data) => {
    if (Data == null) return;
    const Content = (typeof Data === 'string' ? Data : JSON.stringify(Data, (K, V) => K === 'Timestamp' ? undefined : V)).replace(/\r?\n/g, ' | ');
    if (!Content) return;
    const TagSafe = Tag.replace(/'/g, "'\\''"), Safe = Content.replace(/'/g, "'\\''");
    LogQueue = LogQueue.then(() => exec(
        `F='${LogFile}'; T="$F.tmp.$$"; { grep -vF '] ${TagSafe}: ${Safe}' "$F" 2>/dev/null; printf '[%s] %s: %s\\n' "$(date '+%F %T')" '${TagSafe}' '${Safe}'; } > "$T" 2>/dev/null && mv -f "$T" "$F" 2>/dev/null || rm -f "$T"`
    )).catch(() => { });
};

addEventListener('error', Event => {
    const Target = Event.target, Source = Event.filename || Target?.src || 'unknown';
    const Stack = Event.error?.stack ? `\n${Event.error.stack}` : '';
    Log('Error:window', `${Event.message || 'resource error'} @ ${Source}:${Event.lineno || 0}:${Event.colno || 0}${Stack}`);
});

addEventListener('unhandledrejection', Event => {
    const Reason = Event.reason;
    Log('Error:promise', `${Reason?.stack || Reason || 'unknown'}`);
});

async function FetchJSON(File) {
    let Raw = '';
    try { Raw = await exec(`cat ${Core}/${File} 2>/dev/null`); } catch { return null; }
    if (!Raw) return null;
    try { return JSON.parse(Raw); }
    catch (Err) { Log(`JSON:${File}`, `${Err || 'parse failed'} | ${Raw.slice(0, 200)}`); return null; }
}

function ParseKV(Raw, Lowercase) {
    return Object.fromEntries(
        Raw.split('\n')
            .map(L => L.trim().split('='))
            .filter(P => P.length >= 2)
            .map(([K, ...V]) => [Lowercase ? K.trim().toLowerCase() : K.trim(), V.join('=').trim()])
    );
}

let Root = '', RootReady = null;
const RootCommand = 'command -v ksud >/dev/null 2>&1 && echo KernelSU || (command -v apd >/dev/null 2>&1 && echo APatch || (command -v magisk >/dev/null 2>&1 && echo Magisk || echo Unknown))';

const DetectRoot = () => {
    if (!RootReady) RootReady = exec(RootCommand).then(Name => { Root = Root || Name || 'Unknown'; }, Err => { Log('Root', `${RootCommand} | ${Err || 'failed'}`); });
    return RootReady;
};

const SnackElement = document.getElementById('Snack');
let SnackTimer;

function Toast(Message) {
    SnackElement.textContent = Message;
    SnackElement.classList.add('Show');
    clearTimeout(SnackTimer);
    SnackTimer = setTimeout(() => SnackElement.classList.remove('Show'), 2400);
}

function OpenLink(URL) {
    exec(`am start -a android.intent.action.VIEW -d "${URL}"`).catch(Err => {
        Log('Link', `${URL} | ${Err || 'failed'}`);
        Toast('Unable to open link');
    });
}

const ElementCache = new Map();
function GetElement(ID) {
    if (!ElementCache.has(ID)) ElementCache.set(ID, document.getElementById(ID));
    return ElementCache.get(ID);
}

const LatencyColor = v => v <= 30 ? 'var(--Good)' : v <= 50 ? 'var(--Warn)' : 'var(--Bad)';
const JitterColor = v => v === 0 ? 'var(--Good)' : v <= 10 ? 'var(--Warn)' : 'var(--Bad)';

async function ExecFields(Entries) {
    const Results = await Promise.all(Entries.map(async ([ID, , CMD]) => {
        try { return [ID, await exec(CMD) || '—']; }
        catch (Err) { Log(`Exec:${ID}`, `${CMD} | ${Err || 'failed'}`); return [ID, '—']; }
    }));
    requestAnimationFrame(() => {
        for (const [ID, Text] of Results) document.getElementById(ID).textContent = Text;
    });
}

const Page = {
    Dashboard: { Title: 'VinNet', Description: 'Simple Implementation of Network Optimization' },
    Tweaks: { Title: 'Tweaks', Description: 'Apply Network Optimization Tweaks' },
    Info: { Title: 'Info', Description: 'Details about Module' },
};

const PageList = Object.keys(Page);
const PagesElement = document.querySelector('.Pages');
const PageWidth = () => PagesElement.clientWidth || 0;

const CommitRatio = 0.22, CommitMaxPx = 96, CommitMinPx = 64, EdgeResistance = 3;

let CurrentPageID = PageList[0], CurrentPageIndex = 0;
let DragOffset = 0, PendingOffset = 0, DragFrameID = 0, Dragging = false;
let GestureAxis = null, GestureKind = null, GestureStartX = 0, GestureStartY = 0, GesturePointerID = null;

let NavigationButtons = null, NavigationButtonMap = null, NavigationSVGS = null, NavigationSVGButtonMap = null;
let HeaderTitle = null, HeaderDescription = null;

function RenderPages() {
    PagesElement.style.setProperty('--page-base', `${CurrentPageIndex * -100}%`);
    PagesElement.style.setProperty('--page-drag', `${DragOffset}px`);
}

function SyncPageAttributes() {
    Array.from(PagesElement.children).forEach((Child, I) => {
        const Active = I === CurrentPageIndex;
        Child.toggleAttribute('inert', !Active);
        Child.setAttribute('aria-hidden', Active ? 'false' : 'true');
    });
}

function UpdateNavigationIcons() {
    if (!NavigationSVGS) {
        NavigationSVGS = document.querySelectorAll('.NavigationBar svg[data-fill], .NavigationBarActive svg[data-fill]');
        NavigationSVGButtonMap = new Map([...NavigationSVGS].map(svg => [svg, svg.closest('.NavigationBar, .NavigationBarActive')]));
    }
    NavigationSVGS.forEach(SVG => {
        const Active = NavigationSVGButtonMap.get(SVG)?.classList.contains('NavigationBarActive');
        SVG.querySelector('path')?.setAttribute('d', SVG.dataset[Active ? 'fill' : 'outline']);
    });
}

function UpdateHeader(Meta) {
    if (!Meta) return;
    if (!HeaderTitle) HeaderTitle = document.querySelector('.HeaderTitle');
    if (!HeaderDescription) HeaderDescription = document.querySelector('.HeaderDescription');
    if (!HeaderTitle || !HeaderDescription) return;
    const HeaderText = HeaderTitle.parentElement;
    if (!HeaderText) {
        HeaderTitle.textContent = Meta.Title;
        HeaderDescription.textContent = Meta.Description;
        return;
    }
    HeaderText.style.opacity = '0';
    setTimeout(() => {
        HeaderTitle.textContent = Meta.Title;
        HeaderDescription.textContent = Meta.Description;
        HeaderText.style.opacity = '1';
    }, 160);
}

function SetActivePage(ID) {
    const Index = PageList.indexOf(ID);
    if (Index === -1 || ID === CurrentPageID) return;
    CurrentPageID = ID; CurrentPageIndex = Index;
    RenderPages();
    SyncPageAttributes();
    if (!NavigationButtons) {
        NavigationButtons = document.querySelectorAll('.NavigationBar, .NavigationBarActive');
        NavigationButtonMap = new Map([...NavigationButtons].map(B => [B.dataset.page, B]));
    }
    NavigationButtons.forEach(B => {
        const IsActive = B.dataset.page === ID;
        B.classList.toggle('NavigationBarActive', IsActive);
        B.classList.toggle('NavigationBar', !IsActive);
    });
    UpdateNavigationIcons();
    UpdateHeader(Page[ID]);
    if (ID === 'Dashboard') LoadProcessID();
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
    if (DragFrameID) { cancelAnimationFrame(DragFrameID); DragFrameID = 0; }
    ResetGesture();
    SetActivePage(ID);
    RenderPages();
}

function ResetGesture() {
    Dragging = false;
    GestureAxis = null; GestureKind = null; GesturePointerID = null;
    DragOffset = 0; PendingOffset = 0;
    PagesElement.classList.remove('Dragging');
}

function BeginGesture(X, Y, Kind, PointerID) {
    if (DragFrameID) { cancelAnimationFrame(DragFrameID); DragFrameID = 0; }
    ResetGesture();
    GestureKind = Kind; GesturePointerID = PointerID;
    GestureStartX = X; GestureStartY = Y;
    Dragging = true;
    PagesElement.classList.add('Dragging');
    RenderPages();
}

function MoveGesture(X, Y, Event, OnAxisLock) {
    if (!Dragging) return;
    if (GestureAxis === null) {
        const DeltaX = X - GestureStartX, DeltaY = Y - GestureStartY;
        const AbsX = Math.abs(DeltaX), AbsY = Math.abs(DeltaY);
        if (AbsX < 10 && AbsY < 10) return;
        if (AbsY >= AbsX) { GestureAxis = 'y'; return; }
        GestureAxis = 'x';
        GestureStartX = X;
        if (OnAxisLock) try { OnAxisLock(); } catch { }
    }
    if (GestureAxis !== 'x') return;
    if (Event.cancelable) Event.preventDefault();
    let Offset = X - GestureStartX;
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
    if (DragFrameID) { cancelAnimationFrame(DragFrameID); DragFrameID = 0; DragOffset = PendingOffset; }
    if (Commit && GestureAxis === 'x') SetActivePage(PageList[CommitTargetIndex()]);
    ResetGesture();
    RenderPages();
}

function SetupGestureListeners() {
    PagesElement.addEventListener('pointerdown', E => {
        if (E.pointerType === 'touch' || !E.isPrimary || (E.pointerType === 'mouse' && E.button !== 0)) return;
        if (DropdownOwnsGesture(E.target)) return;
        BeginGesture(E.clientX, E.clientY, 'pointer', E.pointerId);
    });

    PagesElement.addEventListener('pointermove', E => {
        if (GestureKind !== 'pointer' || E.pointerId !== GesturePointerID) return;
        MoveGesture(E.clientX, E.clientY, E, () => {
            if (!E.currentTarget.hasPointerCapture(E.pointerId)) E.currentTarget.setPointerCapture(E.pointerId);
        });
    }, { passive: false });

    PagesElement.addEventListener('pointerup', E => { if (E.pointerId === GesturePointerID) EndGesture(true, E.currentTarget); });
    PagesElement.addEventListener('pointercancel', E => { if (E.pointerId === GesturePointerID) EndGesture(false, E.currentTarget); });

    PagesElement.addEventListener('touchstart', E => {
        if (DropdownOwnsGesture(E.target)) return;
        if (E.touches.length === 1) BeginGesture(E.touches[0].screenX, E.touches[0].screenY, 'touch', null);
    }, { passive: true });

    PagesElement.addEventListener('touchmove', E => {
        if (GestureKind === 'touch' && E.touches.length === 1) MoveGesture(E.touches[0].screenX, E.touches[0].screenY, E, null);
    }, { passive: false });

    PagesElement.addEventListener('touchend', E => { if (GestureKind === 'touch' && E.touches.length === 0) EndGesture(true, E.currentTarget); });
    PagesElement.addEventListener('touchcancel', E => { if (GestureKind === 'touch') EndGesture(false, E.currentTarget); });

    document.addEventListener('dragstart', E => E.preventDefault());

    document.getElementById('Navigation').addEventListener('click', E => {
        const Button = E.target.closest('.NavigationBar, .NavigationBarActive');
        if (Button?.dataset.page) Navigation(Button.dataset.page);
    });
}

const Environment = [
    ['Brand', 'Brand', 'resetprop ro.product.brand'],
    ['Model', 'Model', 'resetprop ro.product.model'],
    ['Android', 'Android', 'resetprop ro.build.version.release'],
    ['Kernel', 'Kernel', 'uname -r'],
    ['Architecture', 'Architecture', 'resetprop ro.product.cpu.abi'],
];

const Vendor = [
    ['Vendor', 'Vendor', '[ "$(resetprop ro.product.device)" = "fog" ] && { grep -q "VinNet" /vendor/etc/wifi/WCNSS_qcom_cfg.ini 2>/dev/null && grep -q "p2p_disabled=1" /vendor/etc/wifi/wpa_supplicant_overlay.conf 2>/dev/null && grep -q "ap_scan=1" /vendor/etc/wifi/wpa_supplicant.conf 2>/dev/null && echo Mounted || echo Unmounted; } || echo Unmounted'],
];

async function LoadEnvironment() {
    const Cached = await FetchJSON('Environment.json');
    if (Cached) {
        Root = Cached.Root || 'Unknown';
        RootReady = Promise.resolve();
        requestAnimationFrame(() => {
            for (const [ID, Key] of Environment) document.getElementById(ID).textContent = Cached[Key] || '—';
        });
    } else {
        await ExecFields(Environment);
        await DetectRoot();
    }
    requestAnimationFrame(() => { const E = document.getElementById('Root'); if (E) E.textContent = Root; });
    await ExecFields(Vendor);
}

let ProcessID = null;
async function LoadProcessID() {
    const Cached = await FetchJSON('ProcessID.json');
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
        } catch (Err) {
            Log('ProcessID', `pgrep | ${Err || 'failed'}`);
            ProcessID.textContent = '—';
        }
    }
}

let LastMonitor = { Latency: null, Jitter: null };

function SetMonitorValue(ID, Value, Color) {
    const Element = GetElement(ID);
    const Next = (Value == null || Value === '—') ? '—' : Value + ' ms';
    if (Element.textContent !== Next) Element.style.opacity = '0.3';
    Element.textContent = Next;
    const NextColor = (Value == null || Value === '—') ? '' : Color(Value);
    if (Element.style.color !== NextColor) Element.style.color = NextColor;
    requestAnimationFrame(() => { Element.style.opacity = '1'; });
}

function ApplyMonitor(Data) {
    if (Data.Latency === LastMonitor.Latency && Data.Jitter === LastMonitor.Jitter) return;
    LastMonitor = { Latency: Data.Latency, Jitter: Data.Jitter };
    SetMonitorValue('Latency', Data.Latency, LatencyColor);
    SetMonitorValue('Jitter', Data.Jitter, JitterColor);
}

async function FetchMonitor() {
    exec(`touch ${Core}/ProcessID.json`).catch(Err => Log('ProcessID', `touch | ${Err || 'failed'}`));
    const Cached = await FetchJSON('Monitor.json');
    if (Cached && Cached.Latency != null) {
        ApplyMonitor(Cached);
        return;
    }
    try {
        const Output = await exec('ping -c 2 -w 2 8.8.8.8 2>/dev/null || ping -c 2 -w 2 1.1.1.1 2>/dev/null');
        const Matches = [...Output.matchAll(/time=([\d.]+)\s*ms/gi)].map(M => parseFloat(M[1]));
        if (Matches.length >= 1) {
            const Latency = Math.round(Matches.reduce((A, B) => A + B, 0) / Matches.length);
            let Jitter = 0;
            for (let I = 1; I < Matches.length; I++) Jitter += Math.abs(Matches[I] - Matches[I - 1]);
            Jitter = Matches.length > 1 ? Math.round(Jitter / (Matches.length - 1)) : 0;
            ApplyMonitor({ Latency, Jitter });
            return;
        }
        Log('MonitorFail', `no time samples | ${Output.slice(0, 200)}`);
    } catch (Err) {
        Log('MonitorFail', `ping | ${Err || 'failed'}`);
    }
    ApplyMonitor({ Latency: '—', Jitter: '—' });
}

let LiveTickInterval = null;
function StartLiveTicker() {
    if (!LiveTickInterval) LiveTickInterval = setInterval(
        () => FetchMonitor().catch(Err => Log('MonitorFail', `tick | ${Err || 'failed'}`)),
        5000
    );
}

function StopLiveTicker() {
    if (LiveTickInterval) { clearInterval(LiveTickInterval); LiveTickInterval = null; }
}

const TuneNet = (Spec, Target = 'all', Ifaces = null) => {
    const Kind = Spec.split(' ')[0];
    if (Target && Target !== 'all') {
        return `tc qdisc replace dev "${Target}" root ${Spec} 2>/dev/null && echo "${Target}" || { echo "interface ${Target} rejected ${Kind}" >&2; exit 1; }`;
    }
    const List = (Ifaces || []).filter(Boolean);
    if (!List.length) return `echo "no interface available" >&2; exit 1`;
    const Devs = List.map(Dev => `"${Dev}"`).join(' ');
    return `N=0\nfor D in ${Devs}; do\n  tc qdisc replace dev "$D" root ${Spec} 2>/dev/null && { echo "$D"; N=$((N+1)); }\ndone\n[ "$N" -gt 0 ] || { echo "no interface accepted ${Kind}" >&2; exit 1; }`;
};

const InterfaceDeny = 'lo|dummy*|tun*|tap*|ip6tnl*|sit*|ifb*|veth*|bond*|p2p*|r_rmnet*|rmnet_ctl|ap*|ncm*|rndis*|usb*|radio*|rmtfs*|swlan*|wlan0h*|wlan0bss*';
const InterfaceAllow = 'wlan*|rmnet*|ccmni*|pdp*|ppp*|wwan*|v4-rmnet*|v6-rmnet*|clat*|eth*|en*';

const Tweaks = {
    "IP Reach Disconnect": {
        Label: 'Disable IP Reach Disconnect', Icon: 'Monitor,IPReachDisconnect',
        Description: 'Preventing Wi-Fi from suddenly disconnecting when network is unstable.',
        ONCommand: 'cmd wifi set-ipreach-disconnect disabled', OFFCommand: 'cmd wifi set-ipreach-disconnect enabled',
        CheckCommand: 'cmd wifi get-ipreach-disconnect', Expect: 'false', ONLabel: 'Disabled', OFFLabel: 'Enabled',
        Warn: 'Reset after reboot',
    },
    "QDISC": {
        Label: 'Optimize QDISC', Icon: 'QDISC',
        Description: 'Split data traffic into multiple paths and prioritize small data packets so they aren\'t held up by large data packets.',
        Type: 'select', HasInterfaces: true,
        Options: {
            pfifo_fast: { Label: 'pfifo_fast', Spec: 'pfifo_fast' },
            fq_codel: { Label: 'fq_codel', Spec: 'fq_codel quantum 300 noecn' },
            cake: { Label: 'cake', Spec: 'cake' },
            fq: { Label: 'fq', Spec: 'fq' },
            sfq: { Label: 'sfq', Spec: 'sfq' },
            codel: { Label: 'codel', Spec: 'codel' },
            pie: { Label: 'pie', Spec: 'pie' },
            fq_pie: { Label: 'fq_pie', Spec: 'fq_pie' },
            prio: { Label: 'prio', Spec: 'prio' },
            pfifo: { Label: 'pfifo', Spec: 'pfifo limit 1000' },
            bfifo: { Label: 'bfifo', Spec: 'bfifo limit 1000000' },
            tbf: { Label: 'tbf', Spec: 'tbf rate 1000mbit burst 100k latency 50ms' },
            red: { Label: 'red', Spec: 'red limit 1000000 min 30000 max 90000 avpkt 1000 burst 55' },
            htb: { Label: 'htb', Spec: 'htb default 1' },
            netem: { Label: 'netem', Spec: 'netem' },
            drr: { Label: 'drr', Spec: 'drr' },
            hhf: { Label: 'hhf', Spec: 'hhf' },
            sfb: { Label: 'sfb', Spec: 'sfb' },
            choke: { Label: 'choke', Spec: 'choke limit 1000000 min 30000 max 90000 avpkt 1000 burst 55' },
        },
        CheckCommand: `Found=0\nfor P in /sys/class/net/*; do\n  D=\${P##*/}\n  case "$D" in\n    ${InterfaceDeny}) continue ;;\n    ${InterfaceAllow}) ;;\n    *) continue ;;\n  esac\n  F=""\n  read -r F < "/sys/class/net/$D/flags" 2>/dev/null\n  [ -n "$F" ] && [ $((F & 1)) -eq 1 ] || continue\n  Found=1\n  tc qdisc show dev "$D" 2>/dev/null | awk -v D="$D" '{R=0; for(i=1;i<=NF;i++) if($i=="root") R=1; if (R) print D, $2; else if ($0 ~ / parent :/ && !seen) { seen=1; print D, $2 }}'\ndone\n[ "$Found" -eq 1 ] || echo "- -"`,
        Warn: 'Reset after reboot',
    },
    "Wi-Fi Force Low Latency Mode": {
        Label: 'Enable Wi-Fi Force Low Latency Mode', Icon: 'Wi-FiForceLowLatencyMode',
        Description: 'Force Android to enable built-in low-latency mode at system level, falling back to hi-perf mode on devices that lack it.',
        ONCommand: 'Out=$(cmd wifi force-low-latency-mode enabled 2>/dev/null); case "$Out" in *"Command execution failed"*) cmd wifi force-hi-perf-mode enabled;; esac',
        OFFCommand: 'Out=$(cmd wifi force-low-latency-mode disabled 2>/dev/null); case "$Out" in *"Command execution failed"*) cmd wifi force-hi-perf-mode disabled;; esac',
        CheckCommand: "dumpsys wifi 2>/dev/null | awk '/Dump of ClientModeImpl/ { quit=0; comp=0; seen=1 } /curState=<QUIT>/ { quit=1 } /Supplicant state: COMPLETED/ { comp=1 } /mPowerSaveDisableRequests/ { if (comp) { cmask=$2; hasc=1 } else if (!quit && !live) { lmask=$2; live=1 } } END { if (hasc) print cmask % 4; else if (live) print lmask % 4; else if (seen) print \"0\" }'",
        Expect: ['2', '3'], ONLabel: 'Enabled', OFFLabel: 'Disabled',
        Warn: 'Reset after interface changes',
    },
    "Network Avoid Bad Wi-Fi & Mobile Data Always ON": {
        Label: 'Disable Network Avoid Bad Wi-Fi & Mobile Data Always ON', Icon: 'NetworkAvoidBadWi-Fi&MobileDataAlwaysON',
        Description: 'Forces system to stay connected to Wi-Fi interface even if signal quality deteriorates, and prevents background cellular data from disrupting transmission stability.',
        ONCommand: 'settings put global network_avoid_bad_wifi 0 && settings put global mobile_data_always_on 0',
        OFFCommand: 'settings put global network_avoid_bad_wifi 1 && settings put global mobile_data_always_on 1',
        CheckCommand: '[ "$(settings get global network_avoid_bad_wifi)" = "0" ] && [ "$(settings get global mobile_data_always_on)" = "0" ] && echo 0 || echo 1',
        Expect: '0', ONLabel: 'Disabled', OFFLabel: 'Enabled',
    },
    "BLE Scan Always Enabled": {
        Label: 'Disable BLE Scan Always Enabled', Icon: 'BLEScanAlwaysEnabled',
        Description: 'Minimize jitter and ping spikes when gaming over 2.4 GHz Wi-Fi network.',
        ONCommand: 'settings put global ble_scan_always_enabled 0', OFFCommand: 'settings put global ble_scan_always_enabled 1',
        CheckCommand: 'settings get global ble_scan_always_enabled', Expect: '0', ONLabel: 'Disabled', OFFLabel: 'Enabled',
    },
    "Wi-Fi Scan Throttle": {
        Label: 'Enable Wi-Fi Scan Throttle', Icon: 'Wi-FiScanThrottle',
        Description: 'Limit background Wi-Fi scanning to conserve battery life and prevent jitter.',
        ONCommand: 'settings put global wifi_scan_throttle_enabled 1', OFFCommand: 'settings put global wifi_scan_throttle_enabled 0',
        CheckCommand: 'settings get global wifi_scan_throttle_enabled', Expect: '1', ONLabel: 'Enabled', OFFLabel: 'Disabled',
    }
};

let TweakQueue = Promise.resolve();
const SelectDevMaps = new Map(), SelectIfaces = new Map();

function ClassifyInterface(Name) {
    if (Name.startsWith('wlan')) return { Label: Name, Icon: 'wifi' };
    if (/^(rmnet|ccmni|pdp|ppp|wwan|v4-rmnet|v6-rmnet|clat)/.test(Name)) return { Label: Name, Icon: 'cellular' };
    if (Name.startsWith('eth') || Name.startsWith('en')) return { Label: Name, Icon: 'ethernet' };
    return { Label: Name, Icon: 'network' };
}

function RenderInterfaceChip(Target, Name, IconName) {
    const Chip = document.createElement('button');
    Chip.type = 'button';
    Chip.className = 'TweakChip' + (Target === 'all' ? ' TweakChipActive' : '');
    Chip.dataset.target = Target;
    let SvgHtml = '';
    if (IconName === 'wifi') SvgHtml = '<svg viewBox="0 0 24 24"><path d="M12 4C7.31 4 3.07 5.9 0 8.98L12 21 24 8.98C20.93 5.9 16.69 4 12 4z"/></svg>';
    else if (IconName === 'cellular') SvgHtml = '<svg viewBox="0 0 24 24"><path d="M2 22h20V2z"/></svg>';
    else if (IconName === 'ethernet') SvgHtml = '<svg viewBox="0 0 24 24"><path d="M3 8h18v8H3zm3 2v4h2v-4zm4 0v4h2v-4zm4 0v4h2v-4z"/></svg>';
    else if (IconName === 'all') SvgHtml = '<svg viewBox="0 0 24 24"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>';
    else SvgHtml = '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>';
    Chip.innerHTML = `${SvgHtml}<span>${Name}</span>`;
    return Chip;
}

async function ProbeSelect(Tweak) {
    const Keys = Object.keys(Tweak.Options);
    try {
        const Probes = Keys.map(K => `tc qdisc replace dev "$D" root ${Tweak.Options[K].Spec} 2>/dev/null && echo "${K}"`).join('\n');
        const Out = await exec(`command -v tc > /dev/null 2>&1 || exit 1\nD="lo"\n${Probes}\ntc qdisc del dev "$D" root 2>/dev/null || true`);
        const Accepted = new Set(Out.split('\n').map(S => S.trim()).filter(Boolean));
        return Keys.filter(K => K === 'pfifo_fast' || Accepted.has(K));
    } catch (Err) {
        Log('Probe', `${Tweak.Label || 'select'} | ${Err || 'failed'}`);
        return Keys;
    }
}

function UpdateSelectDisplay(Select, Tweak, Value) {
    Select.dataset.current = Value;
    const Label = Value === 'custom' ? 'Custom' : (Tweak.Options[Value] ? Tweak.Options[Value].Label : Value);
    Select.querySelector('.TweakSelectValue').textContent = Label;
    for (const Item of Select.querySelectorAll('.TweakSelectItem')) {
        Item.classList.toggle('TweakSelectCurrent', Item.dataset.value === Value);
    }
}

function CloseSelectMenus() {
    for (const Select of document.querySelectorAll('.TweakSelect.TweakSelectOpen')) {
        Select.classList.remove('TweakSelectOpen');
        Select.querySelector('.TweakSelectMenu').hidden = true;
    }
}

function DropdownOwnsGesture(Target) {
    const Open = document.querySelector('.TweakSelect.TweakSelectOpen');
    if (!Open) return false;
    if (Open.contains(Target)) return true;
    CloseSelectMenus();
    return false;
}

function SyncSelectMenu(Select) {
    let Visible = 0;
    for (const Item of Select.querySelectorAll('.TweakSelectItem')) {
        Item.hidden = Item.dataset.value === Select.dataset.current;
        if (!Item.hidden) Visible++;
    }
    return Visible;
}

function ComputeAll(ID, DevMap) {
    const Ifaces = SelectIfaces.get(ID);
    const Names = Ifaces && Ifaces.length ? Ifaces : Object.keys(DevMap).filter(Key => Key !== 'all');
    const Values = Names.map(Name => DevMap[Name] || '');
    if (!Values.length) return '';
    return Values.every(Value => Value === Values[0]) ? Values[0] : 'custom';
}

function ParseSelectOutput(ID, Tweak, Out) {
    const DevMap = {};
    for (const Line of Out.split('\n').map(L => L.trim()).filter(Boolean)) {
        const [Dev, Q] = Line.split(/\s+/);
        if (Dev && Q && Tweak.Options[Q] && !DevMap[Dev]) DevMap[Dev] = Q;
    }
    DevMap.all = ComputeAll(ID, DevMap);
    return DevMap;
}

async function CheckTweaks() {
    const LiveState = new Map(), Unsupported = new Set(), SelectOptions = new Map(), SupportTasks = new Map();
    for (const [ID, Tweak] of Object.entries(Tweaks)) {
        if (Tweak.Type === 'select') SupportTasks.set(ID, ProbeSelect(Tweak));
    }
    await Promise.all(Object.entries(Tweaks).map(async ([ID, Tweak]) => {
        if (!Tweak.CheckCommand) return;
        const Cmd = Tweak.CheckCommand;
        try {
            const Out = await exec(Cmd);
            if (!Out) { Unsupported.add(ID); Log(`Check:${ID}`, `no output | cmd=${Cmd}`); return; }
            if (Tweak.Type === 'select') LiveState.set(ID, ParseSelectOutput(ID, Tweak, Out));
            else LiveState.set(ID, [].concat(Tweak.Expect).some(E => Out.includes(E)));
        } catch (Err) {
            Unsupported.add(ID);
            Log(`Check:${ID}`, `cmd=${Cmd} | ${Err || 'unknown error'}`);
        }
    }));
    await Promise.all(Object.entries(Tweaks).map(async ([ID, Tweak]) => {
        if (Unsupported.has(ID)) return;
        if (Tweak.Type === 'select') {
            try {
                SelectOptions.set(ID, await SupportTasks.get(ID));
                if (Tweak.HasInterfaces) {
                    const DevMap = LiveState.get(ID) || {};
                    SelectIfaces.set(ID, Object.keys(DevMap).filter(Key => Key !== 'all'));
                }
            } catch (Err) {
                Unsupported.add(ID);
                Log(`Support:${ID}`, `${Err || 'unsupported on this device'}`);
            }
            return;
        }
        if (!Tweak.SupportCommand) return;
        const Cmd = Tweak.SupportCommand;
        try { await exec(Cmd); }
        catch (Err) { Unsupported.add(ID); Log(`Support:${ID}`, `cmd=${Cmd} | ${Err || 'unsupported on this device'}`); }
    }));
    return { LiveState, Unsupported, SelectOptions };
}

function RenderTweakCards(State) {
    const Container = document.getElementById('PageTweaks');
    const Template = document.getElementById('TweakCardTemplate');
    const { LiveState, Unsupported, SelectOptions } = State;

    Container.replaceChildren();
    for (const [ID, Tweak] of Object.entries(Tweaks)) {
        const Card = Template.content.cloneNode(true);
        Card.querySelector('.TweakIcon use').setAttribute('href', '#' + Tweak.Icon);
        Card.querySelector('.TweakName').textContent = Tweak.Label || ID;
        Card.querySelector('.TweakDescription').textContent = Tweak.Description;
        const WarnText = Unsupported.has(ID) ? 'Not supported' : Tweak.Warn;
        if (WarnText) {
            const Warn = document.createElement('div');
            Warn.className = Unsupported.has(ID) ? 'TweakWarn TweakUnsupported' : 'TweakWarn';
            Warn.textContent = WarnText;
            Card.querySelector('.TweakBody').appendChild(Warn);
        }
        const Input = Card.querySelector('Input');
        if (Tweak.Type === 'select') {
            Input.closest('.Switch').style.display = 'none';
            const Select = Card.querySelector('.TweakSelect');
            Select.hidden = false;
            Select.id = 'Tweak-' + ID;
            Select.dataset.tweakId = ID;
            Select.dataset.target = 'all';

            const DevMap = (LiveState.get(ID) && typeof LiveState.get(ID) === 'object') ? LiveState.get(ID) : {};
            SelectDevMaps.set(ID, DevMap);

            if (Tweak.HasInterfaces) {
                const ChipsContainer = Card.querySelector('.TweakChips');
                const Ifaces = SelectIfaces.get(ID) || [];
                if (ChipsContainer && Ifaces.length > 0) {
                    ChipsContainer.hidden = false;
                    ChipsContainer.replaceChildren();
                    ChipsContainer.appendChild(RenderInterfaceChip('all', 'All', 'all'));
                    for (const Dev of Ifaces) {
                        const Info = ClassifyInterface(Dev);
                        ChipsContainer.appendChild(RenderInterfaceChip(Dev, Info.Label, Info.Icon));
                    }
                }
            }

            const Menu = Select.querySelector('.TweakSelectMenu');
            Menu.replaceChildren();
            for (const Key of SelectOptions.get(ID) || []) {
                const Item = document.createElement('button');
                Item.type = 'button';
                Item.className = 'TweakSelectItem';
                Item.dataset.value = Key;
                Item.innerHTML = '<span></span><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
                Item.querySelector('span').textContent = Tweak.Options[Key].Label;
                Menu.appendChild(Item);
            }

            UpdateSelectDisplay(Select, Tweak, DevMap.all || '-');
            Select.classList.toggle('TweakSelectDisabled', Unsupported.has(ID));
            Container.appendChild(Card);
            continue;
        }
        Input.id = 'Tweak-' + ID;
        const Known = LiveState.has(ID);
        Input.checked = Known ? LiveState.get(ID) : false;
        Input.indeterminate = !Known;
        Input.disabled = Unsupported.has(ID);
        Input.dataset.tweakId = ID;
        Container.appendChild(Card);
    }
}

async function RenderTweaks() {
    RenderTweakCards(await CheckTweaks());
}

async function ApplyTweak(ID, Payload, Target = 'all') {
    const Tweak = Tweaks[ID];
    if (!Tweak) return;
    const Element = document.getElementById('Tweak-' + ID);
    const IsSelect = Tweak.Type === 'select';
    if (IsSelect) Element.classList.add('TweakSelectDisabled'); else Element.disabled = true;
    TweakQueue = TweakQueue.then(async () => {
        try {
            const Out = await exec(IsSelect ? TuneNet(Tweak.Options[Payload].Spec, Target, SelectIfaces.get(ID) || []) : (Payload ? Tweak.ONCommand : Tweak.OFFCommand));
            if (IsSelect) {
                const Accepted = Out.split('\n').map(S => S.trim()).filter(Boolean);
                if (Target !== 'all' && !Accepted.length) Accepted.push(Target);
                const DevMap = SelectDevMaps.get(ID) || {};
                for (const Dev of Accepted) DevMap[Dev] = Payload;
                DevMap.all = ComputeAll(ID, DevMap);
            }
            const TargetLabel = Target === 'all' ? 'All' : Target;
            Toast(`${Tweak.Label || ID}${IsSelect ? ` (${TargetLabel})` : ''} > ${IsSelect ? Tweak.Options[Payload].Label : (Payload ? Tweak.ONLabel : Tweak.OFFLabel)}`);
            if (IsSelect) {
                const Current = Element.dataset.target || 'all';
                const DevMap = SelectDevMaps.get(ID) || {};
                UpdateSelectDisplay(Element, Tweak, DevMap[Current] || '-');
            }
        } catch (Err) {
            const Detail = IsSelect
                ? ` value=${Payload} spec=${Tweak.Options[Payload] ? Tweak.Options[Payload].Spec : '-'} target=${Target}`
                : ` state=${Payload ? 'ON' : 'OFF'}`;
            Log('TweakFail', `${ID}${Detail} | ${Err || 'unknown error'}`);
            Toast('Unable to apply tweak');
            if (!IsSelect) Element.checked = !Payload;
        } finally {
            if (IsSelect) Element.classList.remove('TweakSelectDisabled'); else Element.disabled = false;
        }
    });
}

const Metadata = [
    ['MetadataID', 'ID'], ['MetadataName', 'Name'],
    ['MetadataAuthor', 'Author'], ['MetadataDescription', 'Description'],
];

async function LoadMetadata() {
    let Cached = await FetchJSON('Metadata.json');
    if (!Cached) {
        try {
            const Raw = await exec('cat /data/adb/modules/VinNet/module.prop 2>/dev/null');
            if (Raw) {
                const Prop = ParseKV(Raw, true);
                Cached = { ID: Prop.id, Name: Prop.name, Version: Prop.version, VersionCode: Prop.versioncode, Author: Prop.author, Description: Prop.description };
            }
        } catch (Err) { Log('Metadata', `module.prop | ${Err || 'failed'}`); }
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

const Links = [
    { Label: 'Repository', Href: 'https://github.com/Vinzz1234567890/VinNet', Icon: 'Repository', IconClass: 'ir-icon-github', Text: 'VinNet' },
    { Label: 'Telegram', Href: 'https://t.me/VinzzRepository', Icon: 'Telegram', IconClass: 'ir-icon-telegram', Text: 'Vinzz Repository' },
    { Label: 'Feedback', Href: 'https://t.me/Vinzz1234567890', Icon: 'Telegram', IconClass: 'ir-icon-telegram', Text: 'Vinzz' },
];

function RenderLinks() {
    const Container = document.getElementById('LinkRows');
    const Template = document.getElementById('LinkRowTemplate');
    Container.replaceChildren();
    for (const Link of Links) {
        const Row = Template.content.cloneNode(true);
        Row.querySelector('.IndexRowlabel').textContent = Link.Label;
        const Anchor = Row.querySelector('.ir-link');
        Anchor.href = Link.Href;
        const Icon = Anchor.querySelector('svg');
        Icon.setAttribute('class', Link.IconClass);
        Icon.querySelector('use').setAttribute('href', '#' + Link.Icon);
        Row.querySelector('.ir-link-label').textContent = Link.Text;
        Container.appendChild(Row);
    }
}

const IndexRowTemplate = document.getElementById('IndexRowTemplate');

function RenderRows(ContainerID, Rows) {
    const Container = document.getElementById(ContainerID);
    for (const [ID, Label] of Rows) {
        const Row = IndexRowTemplate.content.cloneNode(true);
        Row.querySelector('.IndexRowlabel').textContent = Label;
        Row.querySelector('.IndexRowValue').id = ID;
        Container.appendChild(Row);
    }
}

async function DecodeImage(ImageElement) {
    if (!ImageElement) return;
    try {
        if (ImageElement.complete) {
            if (ImageElement.decode) await ImageElement.decode();
        } else {
            await new Promise((resolve) => {
                ImageElement.onload = () => { ImageElement.decode ? ImageElement.decode().then(resolve, resolve) : resolve(); };
                ImageElement.onerror = () => { Log('Image', `${ImageElement.src} | load failed`); resolve(); };
            });
        }
    } catch (Err) {
        Log('Image', `${ImageElement.currentSrc || ImageElement.src || 'unknown'} | ${Err || 'decode failed'}`);
    }
}

function SetupEventListeners() {
    SetupGestureListeners();

    document.addEventListener('change', Event => {
        if (Event.target.matches('#PageTweaks Input[type="checkbox"]')) {
            ApplyTweak(Event.target.dataset.tweakId, Event.target.checked);
        }
    });

    document.addEventListener('click', Event => {
        const Chip = Event.target.closest('.TweakChip');
        if (Chip) {
            const ChipsContainer = Chip.closest('.TweakChips'), Card = Chip.closest('.Card');
            if (!ChipsContainer || !Card) return;
            for (const C of ChipsContainer.querySelectorAll('.TweakChip')) C.classList.toggle('TweakChipActive', C === Chip);
            const Target = Chip.dataset.target, Select = Card.querySelector('.TweakSelect');
            if (Select) {
                Select.dataset.target = Target;
                const TweakID = Select.dataset.tweakId, Tweak = Tweaks[TweakID];
                if (Tweak) {
                    const DevMap = SelectDevMaps.get(TweakID) || {};
                    UpdateSelectDisplay(Select, Tweak, DevMap[Target] || '-');
                }
            }
            return;
        }

        const Field = Event.target.closest('.TweakSelectField');
        if (Field) {
            const Select = Field.closest('.TweakSelect'), WillOpen = !Select.classList.contains('TweakSelectOpen');
            CloseSelectMenus();
            if (WillOpen && SyncSelectMenu(Select)) {
                Select.classList.add('TweakSelectOpen');
                Select.querySelector('.TweakSelectMenu').hidden = false;
            }
            return;
        }
        const Item = Event.target.closest('.TweakSelectItem');
        if (Item) {
            const Select = Item.closest('.TweakSelect');
            CloseSelectMenus();
            const Target = Select.dataset.target || 'all';
            if (Item.dataset.value !== Select.dataset.current) ApplyTweak(Select.dataset.tweakId, Item.dataset.value, Target);
            return;
        }
        CloseSelectMenus();
    });

    document.addEventListener('click', Event => {
        const Link = Event.target.closest('#PageInfo A[href]');
        if (Link) {
            Event.preventDefault();
            OpenLink(Link.href);
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) StopLiveTicker(); else StartLiveTicker();
    });
}

function InitLayout() {
    RenderRows('MonitorRows', [['Latency', 'Latency'], ['Jitter', 'Jitter']]);
    RenderRows('EnvironmentRows', [...Environment, ['Root', 'Root'], ['Vendor', 'Vendor']]);
    RenderRows('MetadataRows', [...Metadata, ['MetadataVersion', 'Version']]);
    RenderPages();
    SyncPageAttributes();
}

async function Load() {
    Log('Session', navigator.userAgent);
    FetchMonitor().catch(Err => Log('MonitorFail', `fetch | ${Err || 'failed'}`));
    const Results = await Promise.allSettled([
        LoadEnvironment(),
        LoadMetadata(),
        LoadProcessID(),
        RenderLinks(),
        RenderTweaks(),
        ...Array.from(document.querySelectorAll('.Banner'), DecodeImage),
        new Promise(r => setTimeout(r, 300)),
    ]);
    for (const Result of Results) {
        if (Result.status === 'rejected') {
            Log('Load', `${Result.reason?.stack || Result.reason || 'failed'}`);
        }
    }

    document.getElementById('WebUI').classList.add('Ready');
    UpdateNavigationIcons();
    const LoadingScreen = document.getElementById('LoadingScreen');
    if (LoadingScreen) {
        LoadingScreen.addEventListener('transitionend', () => LoadingScreen.remove(), { once: true });
        LoadingScreen.classList.add('Hide');
    }
    StartLiveTicker();
}

function Boot() {
    InitLayout();
    SetupEventListeners();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(Load, 100));
    else setTimeout(Load, 100);
}

Boot();