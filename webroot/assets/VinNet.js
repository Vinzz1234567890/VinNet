const Core = '/data/adb/VinNet';
const LogPath = '/storage/emulated/0/Download/VinNet.log';
const LogCache = new Map();

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
    const Content = typeof Data === 'string'
        ? Data
        : JSON.stringify(Data, (K, V) => K === 'Timestamp' ? undefined : V);
    if (!Content || LogCache.get(Tag) === Content) return;
    LogCache.set(Tag, Content);
    const Safe = Content.replace(/'/g, "'\\''");
    LogQueue = LogQueue.then(() => exec(
        `R=$(grep -v "^\\[.*\\] ${Tag}:" "${LogPath}" 2>/dev/null); { [ -n "$R" ] && printf '%s\\n' "$R"; printf '[%s] %s: %s\\n' "$(date +%T)" "${Tag}" '${Safe}'; } > "${LogPath}"`
    )).catch(() => { });
};

async function FetchJSON(File) {
    try {
        const Raw = await exec(`cat ${Core}/${File} 2>/dev/null`);
        return Raw ? JSON.parse(Raw) : null;
    } catch { return null; }
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
const Daemon = { KernelSU: 'ksud', APatch: 'apd', Magisk: 'magisk' };
const RootCommand = 'command -v ksud >/dev/null 2>&1 && echo KernelSU || (command -v apd >/dev/null 2>&1 && echo APatch || (command -v magisk >/dev/null 2>&1 && echo Magisk || echo Unknown))';

const DetectRoot = () => {
    if (!RootReady) RootReady = exec(RootCommand).then(Name => {
        Root = Root || Name || 'Unknown';
    }, () => { });
    return RootReady;
};

let PropInvoker = null, PropReady = null;
const DetectProp = () => {
    if (PropReady) return PropReady;
    PropReady = (async () => {
        const Candidates = [].concat(Daemon[Root] ? `${Daemon[Root]} resetprop` : []);
        try {
            const Path = (await exec('command -v resetprop')).trim();
            if (Path) Candidates.push(Path);
        } catch (Err) { Log('PropProbe:command -v', `${Err || 'not found'}`); }
        for (const Invoke of Candidates) {
            try {
                await exec(`${Invoke} ro.build.version.release`);
                PropInvoker = Invoke;
                Log('PropInvoker', Invoke);
                return;
            } catch (Err) { Log(`PropProbe:${Invoke}`, `${Err || 'unsupported'}`); }
        }
        Log('PropInvoker', 'unavailable');
    })();
    return PropReady;
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
    exec(`am start -a android.intent.action.VIEW -d "${URL}"`).catch(() => Toast('Unable to open link'));
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
        try { return [ID, await exec(CMD) || '—']; } catch { return [ID, '—']; }
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

let CurrentPageID = PageList[0];
let CurrentPageIndex = 0;
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
    CurrentPageID = ID;
    CurrentPageIndex = Index;
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
        if (E.target.closest('.TweakChips, .TweakSelect, .TweakSelectMenu')) return;
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
        if (E.target.closest('.TweakChips, .TweakSelect, .TweakSelectMenu')) return;
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
        Log('Environment', Cached);
        Root = Cached.Root || 'Unknown';
        RootReady = Promise.resolve();
        requestAnimationFrame(() => {
            for (const [ID, Key] of Environment) document.getElementById(ID).textContent = Cached[Key] || '—';
        });
    } else {
        await ExecFields(Environment);
        await DetectRoot();
        const LiveEnv = Object.fromEntries(Environment.map(([ID]) => [ID, document.getElementById(ID)?.textContent || '—']));
        LiveEnv.Root = Root;
        Log('Environment', LiveEnv);
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
        Log('ProcessID', Cached);
    } else {
        try {
            const PID = await exec('pgrep -f "VinNet/service.sh" | head -n 1');
            ProcessID.textContent = PID || '—';
            if (PID) Log('ProcessID', { PID });
        } catch {
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
    exec(`touch ${Core}/ProcessID.json`).catch(() => { });
    const Cached = await FetchJSON('Monitor.json');
    if (Cached && Cached.Latency != null) {
        ApplyMonitor(Cached);
        Log('Monitor', Cached);
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
            const LiveMetrics = { Latency, Jitter };
            ApplyMonitor(LiveMetrics);
            Log('Monitor', LiveMetrics);
            return;
        }
    } catch { }
    ApplyMonitor({ Latency: '—', Jitter: '—' });
}

let LiveTickInterval = null;
function StartLiveTicker() {
    if (!LiveTickInterval) LiveTickInterval = setInterval(FetchMonitor, 4000);
}

function StopLiveTicker() {
    if (LiveTickInterval) { clearInterval(LiveTickInterval); LiveTickInterval = null; }
}

const ResetProp = (...Args) => PropInvoker
    ? `${PropInvoker} ${Args.join(' ')}`
    : 'echo "resetprop unavailable on this device" >&2; exit 1';

const Command = C => typeof C === 'function' ? C() : C;

const NetDeny = '^(lo|dummy[0-9]*|tun[0-9]*|tap[0-9]*|ip6tnl[0-9]*|sit[0-9]*|ifb[0-9]*|veth.*|rmnet_mux[0-9]*|rmnet_ctl|rmtfs[0-9]*|radio[0-9]*|wlan0h.*|wlan0bss.*)$';
const MainInterfaceRegex = '^(wlan[0-9]+|rmnet_data[0-1]|rmnet_ipa0|rmnet[0-1]|ccmni[0-9]+|rndis[0-9]+|usb[0-9]+|eth[0-9]+)$';

const TuneNet = (Spec, Target = 'all') => {
    const Kind = Spec.split(' ')[0];
    if (Target && Target !== 'all') {
        return `tc qdisc replace dev "${Target}" root ${Spec} 2>/dev/null || { echo "interface ${Target} rejected ${Kind}" >&2; exit 1; }`;
    }
    return `N=0
for P in /sys/class/net/*; do
  D=\${P##*/}
  echo "$D" | grep -qE '${NetDeny}' && continue
  echo "$D" | grep -qE '${MainInterfaceRegex}' || continue
  tc qdisc replace dev "$D" root ${Spec} 2>/dev/null && N=$((N+1))
done
[ "$N" -gt 0 ] || { echo "no interface accepted ${Kind}" >&2; exit 1; }`;
};

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
        Type: 'select',
        HasInterfaces: true,
        Options: {
            pfifo_fast: { Label: 'Default (pfifo_fast)', Spec: 'pfifo_fast', Builtin: true },
            fq_codel: { Label: 'FQ-CoDel', Spec: 'fq_codel quantum 300 noecn' },
            cake: { Label: 'CAKE', Spec: 'cake' },
            fq: { Label: 'FQ', Spec: 'fq' },
            sfq: { Label: 'SFQ', Spec: 'sfq' },
            codel: { Label: 'CoDel', Spec: 'codel' },
            pie: { Label: 'PIE', Spec: 'pie' },
            fq_pie: { Label: 'FQ-PIE', Spec: 'fq_pie' },
            prio: { Label: 'PRIO', Spec: 'prio' },
            pfifo: { Label: 'PFIFO', Spec: 'pfifo limit 1000' },
            bfifo: { Label: 'BFIFO', Spec: 'bfifo limit 1000000' },
            tbf: { Label: 'TBF', Spec: 'tbf rate 1000mbit burst 100k latency 50ms' },
            red: { Label: 'RED', Spec: 'red limit 1000000 min 30000 max 90000 avpkt 1000 burst 55' },
            htb: { Label: 'HTB', Spec: 'htb default 1' },
            netem: { Label: 'NETEM', Spec: 'netem' },
            drr: { Label: 'DRR', Spec: 'drr' },
            hhf: { Label: 'HHF', Spec: 'hhf' },
            sfb: { Label: 'SFB', Spec: 'sfb' },
            choke: { Label: 'CHOKe', Spec: 'choke limit 1000000 min 30000 max 90000 avpkt 1000 burst 55' },
        },
        Default: 'pfifo_fast',
        CheckCommand: `tc qdisc show 2>/dev/null | awk '{D=""; R=0; for(i=1;i<=NF;i++){ if($i=="dev") D=$(i+1); if($i=="root") R=1 } if (D !~ /${MainInterfaceRegex}/) next; if (R) print D, $2; else if ($0 ~ / parent :/ && !(D in Seen)) { Seen[D]=1; print D, $2 }}'`,
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

let TweakState = null;
let TweakQueue = Promise.resolve();
const SelectDevMaps = new Map();
const SelectIfaces = new Map();

async function FetchInterfaces() {
    try {
        const Out = await exec(`for Dev in $( { tc qdisc show 2>/dev/null | awk '$0 ~ / root / {for(i=1;i<=NF;i++) if($i=="dev") print $(i+1)}'; ls -1 /sys/class/net 2>/dev/null; } | sort -u ); do
  echo "$Dev" | grep -qE '${NetDeny}' && continue
  echo "$Dev" | grep -qE '${MainInterfaceRegex}' || continue
  tc qdisc show dev "$Dev" 2>/dev/null | grep -qE 'root|qdisc' || continue
  echo "$Dev"
done`);
        return Out ? Out.split('\n').map(S => S.trim()).filter(Boolean) : [];
    } catch {
        return [];
    }
}

function ClassifyInterface(Name) {
    if (Name.startsWith('wlan') || Name.startsWith('swlan')) return { Label: Name, Icon: 'wifi' };
    if (Name.startsWith('rmnet') || Name.startsWith('ccmni') || Name.startsWith('pdp')) return { Label: Name, Icon: 'cellular' };
    if (Name.startsWith('rndis') || Name.startsWith('usb')) return { Label: Name, Icon: 'usb' };
    if (Name.startsWith('eth')) return { Label: Name, Icon: 'ethernet' };
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
    else if (IconName === 'all') SvgHtml = '<svg viewBox="0 0 24 24"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>';
    else SvgHtml = '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>';
    Chip.innerHTML = `${SvgHtml}<span>${Name}</span>`;
    return Chip;
}

async function ProbeSelect(Tweak) {
    const Keys = Object.keys(Tweak.Options);
    const Candidates = Keys.filter(K => !Tweak.Options[K].Builtin);
    if (!Candidates.length) return Keys;
    const Probes = Candidates.map(K =>
        `tc qdisc replace dev "$D" root ${Tweak.Options[K].Spec} 2>/dev/null && echo "${K}"`
    ).join('\n');
    const Out = await exec(`command -v tc > /dev/null 2>&1 || exit 1
D="lo"
${Probes}
tc qdisc del dev "$D" root 2>/dev/null || true`);
    const Accepted = new Set(Out.split('\n').map(S => S.trim()).filter(Boolean));
    return Keys.filter(K => Tweak.Options[K].Builtin || Accepted.has(K));
}

function UpdateSelectDisplay(Select, Tweak, Value) {
    Select.dataset.current = Value;
    Select.querySelector('.TweakSelectValue').textContent = Tweak.Options[Value] ? Tweak.Options[Value].Label : Value;
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

async function CheckTweaks() {
    const LiveState = new Map();
    const Unsupported = new Set();
    const SelectOptions = new Map();
    await Promise.all(Object.entries(Tweaks).map(async ([ID, Tweak]) => {
        if (!Tweak.CheckCommand) return;
        try {
            const Out = await exec(Command(Tweak.CheckCommand));
            if (!Out) { Unsupported.add(ID); Log(`Check:${ID}`, 'no output - unsupported on this device'); return; }
            Log(`Check:${ID}`, Out);
            if (Tweak.Type === 'select') {
                const Lines = Out.split('\n').map(L => L.trim()).filter(Boolean);
                const DevMap = {};
                for (const Line of Lines) {
                    const [Dev, Q] = Line.split(/\s+/);
                    if (Dev && Q && Tweak.Options[Q] && !DevMap[Dev]) DevMap[Dev] = Q;
                }
                const Values = Object.values(DevMap);
                DevMap.all = Values[0] || '';
                LiveState.set(ID, DevMap);
            } else {
                LiveState.set(ID, [].concat(Tweak.Expect).some(E => Out.includes(E)));
            }
        } catch (Err) {
            Unsupported.add(ID);
            Log(`Check:${ID}`, `${Err || 'unknown error'}`);
        }
    }));
    await Promise.all(Object.entries(Tweaks).map(async ([ID, Tweak]) => {
        if (Unsupported.has(ID)) return;
        if (Tweak.Type === 'select') {
            try {
                SelectOptions.set(ID, await ProbeSelect(Tweak));
                if (Tweak.HasInterfaces) {
                    SelectIfaces.set(ID, await FetchInterfaces());
                }
            } catch (Err) {
                Unsupported.add(ID);
                Log(`Support:${ID}`, `${Err || 'unsupported on this device'}`);
            }
            return;
        }
        if (!Tweak.SupportCommand) return;
        try { await exec(Command(Tweak.SupportCommand)); }
        catch (Err) { Unsupported.add(ID); Log(`Support:${ID}`, `${Err || 'unsupported on this device'}`); }
    }));
    return { LiveState, Unsupported, SelectOptions };
}

async function RenderTweaks() {
    const Container = document.getElementById('PageTweaks');
    const Template = document.getElementById('TweakCardTemplate');
    TweakState = await FetchJSON('Tweaks.json') || {};
    if (Object.keys(TweakState).length > 0) Log('Tweaks', TweakState);

    await DetectRoot();
    await DetectProp();
    const { LiveState, Unsupported, SelectOptions } = await CheckTweaks();

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

            const InitialVal = DevMap.all || '-';
            UpdateSelectDisplay(Select, Tweak, InitialVal);
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

async function ApplyTweak(ID, Payload, Target = 'all') {
    const Tweak = Tweaks[ID];
    if (!Tweak) return;
    const Element = document.getElementById('Tweak-' + ID);
    const IsSelect = Tweak.Type === 'select';
    if (IsSelect) Element.classList.add('TweakSelectDisabled'); else Element.disabled = true;
    TweakQueue = TweakQueue.then(async () => {
        try {
            await exec(IsSelect ? TuneNet(Tweak.Options[Payload].Spec, Target) : Command(Payload ? Tweak.ONCommand : Tweak.OFFCommand));
            if (!TweakState) TweakState = {};
            if (IsSelect) {
                if (typeof TweakState[ID] !== 'object' || TweakState[ID] === null) {
                    TweakState[ID] = {};
                }
                TweakState[ID][Target] = Payload;
                const DevMap = SelectDevMaps.get(ID) || {};
                DevMap[Target] = Payload;
                if (Target === 'all') {
                    for (const Dev of (SelectIfaces.get(ID) || [])) {
                        TweakState[ID][Dev] = Payload;
                        DevMap[Dev] = Payload;
                    }
                    DevMap.all = Payload;
                }
            } else {
                TweakState[ID] = Payload ? 'ON' : 'OFF';
            }
            Log('Tweaks', TweakState);
            const TargetLabel = Target === 'all' ? 'All' : Target;
            Toast(`${Tweak.Label || ID}${IsSelect ? ` (${TargetLabel})` : ''} > ${IsSelect ? Tweak.Options[Payload].Label : (Payload ? Tweak.ONLabel : Tweak.OFFLabel)}`);
            const Content = JSON.stringify(TweakState).replace(/"/g, '\\"');
            exec(`echo "${Content}" > ${Core}/Tweaks.json`).catch(Err => Log('TweakSave', `${ID}: ${Err || 'state not persisted'}`));
            if (IsSelect) UpdateSelectDisplay(Element, Tweak, Payload);
        } catch (Err) {
            Log('TweakFail', `${ID}: ${Err || 'unknown error'}`);
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
        } catch { }
    }
    if (!Cached) return;
    Log('Metadata', Cached);
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
                ImageElement.onerror = resolve;
            });
        }
    } catch { }
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
            const ChipsContainer = Chip.closest('.TweakChips');
            const Card = Chip.closest('.Card');
            if (!ChipsContainer || !Card) return;
            for (const C of ChipsContainer.querySelectorAll('.TweakChip')) {
                C.classList.toggle('TweakChipActive', C === Chip);
            }
            const Target = Chip.dataset.target;
            const Select = Card.querySelector('.TweakSelect');
            if (Select) {
                Select.dataset.target = Target;
                const TweakID = Select.dataset.tweakId;
                const Tweak = Tweaks[TweakID];
                if (Tweak) {
                    const DevMap = SelectDevMaps.get(TweakID) || {};
                    const CurrentVal = DevMap[Target] || '-';
                    UpdateSelectDisplay(Select, Tweak, CurrentVal);
                }
            }
            return;
        }

        const Field = Event.target.closest('.TweakSelectField');
        if (Field) {
            const Select = Field.closest('.TweakSelect');
            const WillOpen = !Select.classList.contains('TweakSelectOpen');
            CloseSelectMenus();
            if (WillOpen) {
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
        if (document.hidden) StopLiveTicker();
        else StartLiveTicker();
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
    await Promise.allSettled([
        LoadEnvironment(),
        FetchMonitor(),
        LoadMetadata(),
        LoadProcessID(),
        RenderLinks(),
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

function Boot() {
    InitLayout();
    SetupEventListeners();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(Load, 100));
    } else {
        setTimeout(Load, 100);
    }
}

Boot();