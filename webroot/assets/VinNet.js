const Core = '/data/adb/VinNet';
const Service = '/data/adb/modules/VinNet/service.sh';
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
}, true);

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
    Settings: { Title: 'Settings', Description: 'Configure Module Behavior' },
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
        if (IsActive) B.setAttribute('aria-current', 'page'); else B.removeAttribute('aria-current');
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
        if (AbsY >= AbsX) {
            GestureAxis = 'y';
            Dragging = false;
            PagesElement.classList.remove('Dragging');
            DragOffset = 0;
            PendingOffset = 0;
            RenderPages();
            return;
        }
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

    document.getElementById('Navigation').addEventListener('keydown', E => {
        if (E.key !== 'Enter' && E.key !== ' ') return;
        const Button = E.target.closest('.NavigationBar, .NavigationBarActive');
        if (Button?.dataset.page) { E.preventDefault(); Navigation(Button.dataset.page); }
    });
}

const Environment = [
    ['Brand', 'Brand'],
    ['Model', 'Model'],
    ['Android', 'Android'],
    ['Kernel', 'Kernel'],
    ['Architecture', 'Architecture'],
];

const Vendor = [
    ['Vendor', 'Vendor', '[ "$(resetprop ro.product.device)" = "fog" ] && { grep -q "VinNet" /vendor/etc/wifi/WCNSS_qcom_cfg.ini 2>/dev/null && grep -q "p2p_disabled=1" /vendor/etc/wifi/wpa_supplicant_overlay.conf 2>/dev/null && grep -q "ap_scan=1" /vendor/etc/wifi/wpa_supplicant.conf 2>/dev/null && echo Mounted || echo Unmounted; } || echo "Unsupported"'],
];

async function LoadEnvironment() {
    const Cached = await FetchJSON('Environment.json');
    requestAnimationFrame(() => {
        for (const [ID, Key] of [...Environment, ['Root', 'Root']]) {
            const Value = (Cached && Cached[Key]) || '—';
            document.getElementById(ID).textContent = ID === 'Root' && Value === 'Unknown' ? '—' : Value;
        }
    });
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
    ProcessID.textContent = Cached && Cached.PID != null ? Cached.PID : '—';
}

let LastMonitor = { Latency: null, Jitter: null };
let MonitorUnusable = false;

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
    const Age = Cached && Cached.Timestamp ? Date.now() / 1000 - Cached.Timestamp : null;
    if (Cached && Cached.Latency != null && Cached.Latency !== '—' && Age != null && Age >= 0 && Age <= 30) {
        MonitorUnusable = false;
        ApplyMonitor(Cached);
        return;
    }
    if (!MonitorUnusable) {
        MonitorUnusable = true;
        Log('MonitorFail', Cached
            ? `Monitor.json unusable | latency=${Cached.Latency} age=${Age == null ? 'unknown' : `${Math.round(Age)}s`}`
            : 'Monitor.json missing');
    }
    ApplyMonitor({ Latency: '—', Jitter: '—' });
}

let LiveTickInterval = null;
function LiveTick() {
    FetchMonitor().catch(Err => Log('MonitorFail', `tick | ${Err || 'failed'}`));
    if (SelectDirty) {
        const ID = SelectDirty; SelectDirty = null;
        RefreshSelect(ID).catch(Err => Log(`Refresh:${ID}`, `${Err || 're-read failed'}`));
    }
}
function StartLiveTicker() {
    if (!LiveTickInterval) LiveTickInterval = setInterval(LiveTick, 5000);
}

function StopLiveTicker() {
    if (LiveTickInterval) { clearInterval(LiveTickInterval); LiveTickInterval = null; }
}

const Tweaks = {
    "IP Reach Disconnect": {
        Label: 'Disable IP Reach Disconnect', Icon: 'Monitor,IPReachDisconnect',
        Description: 'Preventing Wi-Fi from suddenly disconnecting when network is unstable.',
        CheckCommand: `sh ${Service} check 'IP Reach Disconnect'`, Expect: 'false', ONLabel: 'Disabled', OFFLabel: 'Enabled',
        Warn: 'Reset after reboot',
    },
    "QDISC": {
        Label: 'Optimize QDISC', Icon: 'QDISC',
        Description: 'Split data traffic into multiple paths and prioritize small data packets so they aren\'t held up by large data packets.',
        Type: 'select', HasInterfaces: true,
        Options: {
            pfifo_fast: { Label: 'pfifo_fast' },
            fq_codel: { Label: 'fq_codel' },
            cake: { Label: 'cake' },
            fq: { Label: 'fq' },
            sfq: { Label: 'sfq' },
            codel: { Label: 'codel' },
            pie: { Label: 'pie' },
            fq_pie: { Label: 'fq_pie' },
            hhf: { Label: 'hhf' },
            sfb: { Label: 'sfb' },
        },
        CheckCommand: `sh ${Service} check QDISC`,
        Warn: 'Reset after reboot',
    },
    "Wi-Fi Force Low Latency Mode": {
        Label: 'Enable Wi-Fi Force Low Latency Mode', Icon: 'Wi-FiForceLowLatencyMode',
        Description: 'Force Android to enable built-in low-latency mode at system level, falling back to hi-perf mode on devices that lack it.',
        CheckCommand: `sh ${Service} check 'Wi-Fi Force Low Latency Mode'`,
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
const SelectDevMaps = new Map(), SelectIfaces = new Map(), SelectChoices = new Map();
let SelectDirty = null;

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
        const Out = await exec(`sh ${Service} probe-qdisc`);
        const Accepted = new Set(Out.split('\n').map(S => S.trim()).filter(Boolean));
        if (!Accepted.size) return [];
        return Keys.filter(K => K === 'pfifo_fast' || Accepted.has(K));
    } catch (Err) {
        Log('Probe', `${Tweak.Label || 'select'} | ${Err || 'failed'}`);
        return [];
    }
}

function UpdateSelectDisplay(Select, Tweak, Value) {
    Select.dataset.current = Value;
    const Choices = SelectChoices.get(Select.dataset.tweakId) || [];
    Select.classList.toggle('TweakSelectStatic', Choices.filter(Key => Key !== Value).length === 0);
    const Label = Value === 'custom' ? 'Custom' : (Tweak.Options[Value] ? Tweak.Options[Value].Label : Value);
    Select.querySelector('.TweakSelectValue').textContent = Label;
    for (const Item of Select.querySelectorAll('.TweakSelectItem')) {
        Item.classList.toggle('TweakSelectCurrent', Item.dataset.value === Value);
    }
    SyncSelectMenu(Select);
}

function CloseSelectMenus() {
    for (const Select of document.querySelectorAll('.TweakSelect.TweakSelectOpen')) {
        Select.classList.remove('TweakSelectOpen');
        Select.querySelector('.TweakSelectMenu').hidden = true;
        Select.querySelector('.TweakSelectField').setAttribute('aria-expanded', 'false');
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
    const Names = (Ifaces && Ifaces.length ? Ifaces : Object.keys(DevMap).filter(Key => Key !== 'all')).filter(Name => DevMap[Name]);
    const Values = Names.map(Name => DevMap[Name]);
    if (!Values.length) return '';
    return Values.every(Value => Value === Values[0]) ? Values[0] : 'custom';
}

function ParseSelectOutput(ID, Out) {
    const DevMap = {};
    for (const Line of Out.split('\n').map(L => L.trim()).filter(Boolean)) {
        const [Dev, Q] = Line.split(/\s+/);
        if (Dev && Q && Dev !== '-' && !DevMap[Dev]) DevMap[Dev] = Q;
    }
    SelectIfaces.set(ID, Object.keys(DevMap));
    DevMap.all = ComputeAll(ID, DevMap);
    return DevMap;
}

async function RefreshSelect(ID) {
    const Tweak = Tweaks[ID];
    const DevMap = ParseSelectOutput(ID, await exec(Tweak.CheckCommand));
    SelectDevMaps.set(ID, DevMap);
    const Element = document.getElementById('Tweak-' + ID);
    if (Element) UpdateSelectDisplay(Element, Tweak, DevMap[Element.dataset.target || 'all'] || '—');
}

let PersistentOn = false;
let PersistentReady = null;

const ReadPersistent = () => {
    if (!PersistentReady) {
        PersistentReady = exec(`sh ${Service} persistent`).then(State => {
            if (State && State !== 'ON' && State !== 'OFF') throw new Error('Invalid persistent setting');
            PersistentOn = State === 'ON';
        }).catch(Err => {
            PersistentReady = null;
            throw Err;
        });
    }
    return PersistentReady;
};

function WarnFor(ID, UnsupportedNow) {
    if (UnsupportedNow) return 'Unsupported';
    return PersistentOn ? '' : (Tweaks[ID] && Tweaks[ID].Warn) || '';
}

function RefreshWarnings() {
    for (const Warn of document.querySelectorAll('.TweakWarn')) {
        const Text = WarnFor(Warn.dataset.tweak, Warn.classList.contains('TweakUnsupported'));
        Warn.hidden = !Text;
        Warn.textContent = Text;
    }
}

async function CheckTweaks() {
    const LiveState = new Map(), Unsupported = new Set(), SelectOptions = new Map(), SupportTasks = new Map();
    await ReadPersistent().catch(() => { });
    for (const [ID, Tweak] of Object.entries(Tweaks)) {
        if (Tweak.Type === 'select') SupportTasks.set(ID, ProbeSelect(Tweak));
    }
    await Promise.all(Object.entries(Tweaks).map(async ([ID, Tweak]) => {
        if (!Tweak.CheckCommand) return;
        const Cmd = Tweak.CheckCommand;
        try {
            const Out = await exec(Cmd);
            if (!Out) { Unsupported.add(ID); Log(`Check:${ID}`, `no output | cmd=${Cmd}`); return; }
            if (Tweak.Type === 'select') LiveState.set(ID, ParseSelectOutput(ID, Out));
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
                const Choices = await SupportTasks.get(ID);
                if (!Choices.length) throw new Error('no supported value');
                if (Tweak.HasInterfaces && !(SelectIfaces.get(ID) || []).length) throw new Error('no eligible interface');
                SelectOptions.set(ID, Choices);
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
        const WarnText = WarnFor(ID, Unsupported.has(ID));
        if (WarnText || Tweak.Warn) {
            const Warn = document.createElement('div');
            Warn.className = Unsupported.has(ID) ? 'TweakWarn TweakUnsupported' : 'TweakWarn';
            Warn.dataset.tweak = ID;
            Warn.hidden = !WarnText;
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

            SelectChoices.set(ID, SelectOptions.get(ID) || []);
            UpdateSelectDisplay(Select, Tweak, DevMap.all || '—');
            Select.classList.toggle('TweakSelectDisabled', Unsupported.has(ID));
            Select.querySelector('.TweakSelectField').disabled = Unsupported.has(ID);
            Container.appendChild(Card);
            continue;
        }
        Input.id = 'Tweak-' + ID;
        Input.setAttribute('aria-label', Tweak.Label || ID);
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
    const Control = IsSelect ? Element.querySelector('.TweakSelectField') : Element;
    let PrevDevMap = null;
    if (IsSelect) {
        const DevMap = SelectDevMaps.get(ID) || {};
        PrevDevMap = { ...DevMap };
        const Ifaces = SelectIfaces.get(ID) || Object.keys(DevMap).filter(Key => Key !== 'all');
        if (Target === 'all') {
            for (const Dev of Ifaces) DevMap[Dev] = Payload;
            DevMap.all = Payload;
        } else {
            DevMap[Target] = Payload;
            DevMap.all = ComputeAll(ID, DevMap);
        }
        UpdateSelectDisplay(Element, Tweak, DevMap[Target] || Payload);
    }
    Control.disabled = true;
    TweakQueue = TweakQueue.then(async () => {
        try {
            const Command = Tweak.ONCommand
                ? (Payload ? Tweak.ONCommand : Tweak.OFFCommand)
                : `sh ${Service} apply '${ID}' '${IsSelect ? Payload : (Payload ? 'ON' : 'OFF')}' '${Target}'`;
            const Out = await exec(Command);
            const SaveFailed = Out.split('\n').includes('SAVE_FAILED');
            if (IsSelect) SelectDirty = ID;
            const TargetLabel = Target === 'all' ? 'All' : Target;
            Toast(SaveFailed ? 'Applied, but unable to save state' : `${Tweak.Label || ID}${IsSelect ? ` (${TargetLabel})` : ''} > ${IsSelect ? Tweak.Options[Payload].Label : (Payload ? Tweak.ONLabel : Tweak.OFFLabel)}`);
        } catch (Err) {
            const Detail = IsSelect
                ? ` value=${Payload} target=${Target}`
                : ` state=${Payload ? 'ON' : 'OFF'}`;
            Log('TweakFail', `${ID}${Detail} | ${Err || 'unknown error'}`);
            Toast('Unable to apply tweak');
            if (IsSelect) {
                if (PrevDevMap) {
                    SelectDevMaps.set(ID, PrevDevMap);
                    UpdateSelectDisplay(Element, Tweak, PrevDevMap[Target] || '—');
                }
            } else {
                Element.checked = !Payload;
            }
        } finally {
            Control.disabled = false;
            if (IsSelect) Control.focus();
        }
    }).catch(() => { });
}

async function LoadSettings() {
    const Input = document.getElementById('PersistentTweaks');
    if (typeof window.ksu?.exec !== 'function') {
        Input.indeterminate = true;
        Input.disabled = true;
        Log('Persistent', 'Root bridge unavailable');
        return;
    }
    try {
        await ReadPersistent();
        Input.checked = PersistentOn;
        Input.indeterminate = false;
    } catch (Err) {
        Input.indeterminate = true;
        Log('Persistent', `${Err || 'unable to read setting'}`);
    }
}

const Metadata = [
    ['MetadataID', 'ID'], ['MetadataName', 'Name'],
    ['MetadataAuthor', 'Author'], ['MetadataDescription', 'Description'],
];

async function LoadMetadata() {
    const Cached = await FetchJSON('Metadata.json');
    requestAnimationFrame(() => {
        for (const [ID, Key] of Metadata) {
            const Element = document.getElementById(ID);
            if (Element) Element.textContent = (Cached && Cached[Key]) || '—';
        }
        const VersionElement = document.getElementById('MetadataVersion');
        if (VersionElement) {
            VersionElement.textContent = Cached && Cached.Version
                ? (Cached.VersionCode ? `${Cached.Version} (${Cached.VersionCode})` : Cached.Version)
                : '—';
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
        if (Event.target.id === 'PersistentTweaks') {
            const Input = Event.target, Enabled = Input.checked;
            Input.disabled = true;
            TweakQueue = TweakQueue.then(async () => {
                try {
                    await exec(`sh ${Service} persistent ${Enabled ? 'ON' : 'OFF'}`);
                    PersistentOn = Enabled;
                    PersistentReady = Promise.resolve();
                    RefreshWarnings();
                    Toast(`Persistent Tweaks > ${Enabled ? 'Enabled' : 'Disabled'}`);
                } catch (Err) {
                    Input.checked = !Enabled;
                    Log('Persistent', `${Err || 'failed'}`);
                    Toast('Unable to save setting');
                } finally {
                    Input.disabled = false;
                }
            }).catch(() => { });
            return;
        }
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
                    UpdateSelectDisplay(Select, Tweak, DevMap[Target] || '—');
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
                Field.setAttribute('aria-expanded', 'true');
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

let Revealed = false;
function Reveal() {
    if (Revealed) return;
    Revealed = true;
    document.getElementById('WebUI').classList.add('Ready');
    UpdateNavigationIcons();
    const LoadingScreen = document.getElementById('LoadingScreen');
    if (LoadingScreen) {
        LoadingScreen.addEventListener('transitionend', () => LoadingScreen.remove(), { once: true });
        setTimeout(() => LoadingScreen.remove(), 400);
        LoadingScreen.classList.add('Hide');
    }
    StartLiveTicker();
}

async function Load() {
    Log('Session', navigator.userAgent);
    setTimeout(() => { if (!Revealed) Log('Load', 'watchdog: data still pending after 8s'); Reveal(); }, 8000);
    FetchMonitor().catch(Err => Log('MonitorFail', `fetch | ${Err || 'failed'}`));
    const Results = await Promise.allSettled([
        LoadEnvironment(),
        LoadMetadata(),
        LoadProcessID(),
        RenderLinks(),
        RenderTweaks(),
        LoadSettings(),
        ...Array.from(document.querySelectorAll('.Banner'), DecodeImage),
        new Promise(r => setTimeout(r, 300)),
    ]);
    for (const Result of Results) {
        if (Result.status === 'rejected') {
            Log('Load', `${Result.reason?.stack || Result.reason || 'failed'}`);
        }
    }
    Reveal();
}

function Boot() {
    InitLayout();
    SetupEventListeners();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(Load, 100));
    else setTimeout(Load, 100);
}

Boot();