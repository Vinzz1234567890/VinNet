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

const TuneNet = Spec => {
    const Kind = Spec.split(' ')[0];
    return `N=0
for P in /sys/class/net/*; do
  D=\${P##*/}
  echo "$D" | grep -qE '${NetDeny}' && continue
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
        Options: {
            pfifo_fast: { Label: 'Default (pfifo_fast)', Spec: 'pfifo_fast', Builtin: true },
            cake: { Label: 'CAKE', Spec: 'cake' },
            fq_codel: { Label: 'FQ-CoDel', Spec: 'fq_codel quantum 300 noecn' },
            fq: { Label: 'FQ', Spec: 'fq' },
            sfq: { Label: 'SFQ', Spec: 'sfq' },
        },
        Default: 'pfifo_fast',
        CheckCommand: "tc qdisc show 2>/dev/null | awk '$0 ~ / root / {print $2}'",
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

async function ProbeSelect(Tweak) {
    const Keys = Object.keys(Tweak.Options);
    const Candidates = Keys.filter(K => !Tweak.Options[K].Builtin);
    if (!Candidates.length) return Keys;
    const Out = await exec(`(command -v tc > /dev/null 2>&1 || exit 1)
for Q in ${Candidates.join(' ')}; do tc qdisc replace dev lo root $Q 2>/dev/null && echo $Q; done
tc qdisc del dev lo root 2>/dev/null || true`);
    const Accepted = new Set(Out.split('\n'));
    return Keys.filter(K => Tweak.Options[K].Builtin || Accepted.has(K));
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
                const Lines = Out.split('\n');
                const Found = Object.keys(Tweak.Options).filter(K => K !== Tweak.Default && Lines.includes(K));
                LiveState.set(ID, Found.length ? Found[0] : Tweak.Default);
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
            try { SelectOptions.set(ID, await ProbeSelect(Tweak)); }
            catch (Err) { Unsupported.add(ID); Log(`Support:${ID}`, `${Err || 'unsupported on this device'}`); }
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
            for (const Key of SelectOptions.get(ID) || []) {
                const Option = document.createElement('option');
                Option.value = Key;
                Option.textContent = Tweak.Options[Key].Label;
                Select.appendChild(Option);
            }
            Select.value = LiveState.has(ID) ? LiveState.get(ID)
                : (Tweak.Options[TweakState[ID]] ? TweakState[ID] : Tweak.Default);
            Select.dataset.current = Select.value;
            Select.disabled = Unsupported.has(ID);
            Container.appendChild(Card);
            continue;
        }
        Input.id = 'Tweak-' + ID;
        Input.checked = LiveState.has(ID) ? LiveState.get(ID) : TweakState[ID] === 'ON';
        Input.disabled = Unsupported.has(ID);
        Input.dataset.tweakId = ID;
        Container.appendChild(Card);
    }
}

async function ApplyTweak(ID, Payload) {
    const Tweak = Tweaks[ID];
    if (!Tweak) return;
    const Element = document.getElementById('Tweak-' + ID);
    const IsSelect = Tweak.Type === 'select';
    Element.disabled = true;
    TweakQueue = TweakQueue.then(async () => {
        try {
            await exec(IsSelect ? TuneNet(Tweak.Options[Payload].Spec) : Command(Payload ? Tweak.ONCommand : Tweak.OFFCommand));
            if (!TweakState) TweakState = {};
            TweakState[ID] = IsSelect ? Payload : (Payload ? 'ON' : 'OFF');
            Log('Tweaks', TweakState);
            Toast(`${Tweak.Label || ID} > ${IsSelect ? Tweak.Options[Payload].Label : (Payload ? Tweak.ONLabel : Tweak.OFFLabel)}`);
            const Content = JSON.stringify(TweakState).replace(/"/g, '\\"');
            exec(`echo "${Content}" > ${Core}/Tweaks.json`).catch(Err => Log('TweakSave', `${ID}: ${Err || 'state not persisted'}`));
            if (IsSelect) Element.dataset.current = Payload;
        } catch (Err) {
            Log('TweakFail', `${ID}: ${Err || 'unknown error'}`);
            Toast('Unable to apply tweak');
            if (IsSelect) Element.value = Element.dataset.current; else Element.checked = !Payload;
        } finally {
            Element.disabled = false;
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
        } else if (Event.target.matches('#PageTweaks select.TweakSelect')) {
            ApplyTweak(Event.target.dataset.tweakId, Event.target.value);
        }
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