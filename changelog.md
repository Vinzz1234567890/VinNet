# 📜Changelog - VinNet

---

## v1.1.5-Kurst - 2026-08-01 - Latest

### ✨Added
- Dynamic rendering system for Web UI tweaks
- Dynamic rendering system for Web UI information page
- Centralized metadata for Web UI navigation pages
- Centralized links configuration for Web UI information page
- Centralized contributors configuration for Web UI information page
- Dynamic process ID overlay on Web UI dashboard banner
- Reusable SVG icon system for Web UI components
- CSS color-mix variables for primary color transparency
- Cursor feedback for navigation bars, switches, and contributor chips
- Other additions

### 🔄️Changed
- Module version from `1.1.4-Syrica` to `1.1.5-Kurst`
- Module version code from `20260705` to `20260801`
- Process state file from `Process.json` to `ProcessID.json`
- Service lock mechanism to use `ProcessID.json`
- Process generation function from `GenerateProcess()` to `ProcessID()`
- Web UI navigation state class from `.nb` to `.NavigationBar` and `.NavigationBarActive`
- Web UI page identifiers to PascalCase naming
- Web UI DOM identifiers and CSS classes to PascalCase naming
- Navigation icon identifiers to descriptive names
- Navigation icon rendering to use shared SVG symbols
- Web UI tweaks from static HTML elements to dynamically generated components
- Web UI information page from static HTML elements to dynamically generated components
- Tweak configuration to include display labels, icons, and descriptions
- Tweak element IDs to use the `tw-` prefix
- Tweak status notifications to use the configured display label
- Process monitor loading to create the PID overlay dynamically when required
- Process monitor refresh handling to separate process loading from network monitor updates
- Web UI boot sequence to render dynamic content before loading module data
- Web UI loading sequence to use `Promise.allSettled()`
- Google Sans Flex font path to load directly from the `webroot/assets` directory
- Primary color transparency handling to use reusable CSS variables
- Toggle switch animation from `left` positioning to `transform`
- Tweak icon size from `20px` to `36px`
- Web UI layout containment added to the header and navigation components
- CSS logical properties used for selected spacing and positioning rules
- Process ID storage and cleanup logic to use the new process state file
- `gEnableDFSChnlScan` from `0` to `1` in `WCNSS_qcom_cfg.ini`
- DFS channel scanning is now enabled in the Qualcomm Wi-Fi configuration
- Other changes

### 📈Improved
- Web UI maintainability by separating data configuration from HTML markup
- Web UI scalability through dynamic rendering of tweaks, links, and contributors
- Reduce duplicated HTML markup in `index.html`
- Reduce repeated SVG markup through reusable SVG symbols
- Navigation state management and synchronization
- Dashboard process monitoring behavior
- Web UI initialization reliability
- Tweak element lookup consistency
- CSS organization through reusable color-mix variables
- Toggle animation implementation
- General Web UI code structure, refactoring, and naming consistency
- Other improvements

### 🔧Fixed
- Process state handling by replacing the dedicated `.service.lock` file with `ProcessID.json`
- Dynamic Web UI elements no longer depend on hardcoded tweak and information-page markup
- PID monitor overlay is now recreated when required instead of relying on permanently embedded markup
- Bug related to an incorrect path definition that caused GoogleSansFlex.woff2 to never be used
- Other fixes

---

## v1.1.4-Syrica - 2026-07-05

### ✨Added
- `Mobile Data Always ON` tweak to Web UI
- Process monitor (PID) on Web UI banner
- Horizontal swipe navigation between Web UI pages
- Scroll-based page detection with automatic navigation synchronization
- `Vinzz1234567890.png` local contributor avatar asset
- `GoogleSansFlex.woff2` font for improved loading performance

### 🔄️Changed
- Replace `GoogleSansFlex.ttf` with `GoogleSansFlex.woff2`
- Navigation logic from button state switching to scroll-driven navigation
- Web UI page layout from stacked pages to horizontal snap scrolling
- Navigation icons to use reusable SVG symbols (`<use>`)
- Local contributor avatar instead of GitHub image request
- Device and metadata labels use proper title case
- Monitor JSON keys to PascalCase
- Toggle execution process is now queued to prevent race conditions
- Dashboard automatically refreshes process information
- Network monitor refresh interval from 3 seconds to 4 seconds
- `Disable Network Avoid Bad Wi-Fi` tweak no longer modifies `wifi_assistant`
- Navigation icon highlight from filled pill background to accent-colored icon with glow
- Top bar and bottom navigation background from frosted glass to solid surface
- Banner structure to support process overlay

### 📈Improved
- Reduce DOM lookups by caching frequently accessed elements
- Improve Web UI responsiveness with scroll snapping and overscroll prevention
- Improve font rendering using `font-display: swap`
- Improve callback generation efficiency for KernelSU execution
- Improve boot sequence reliability using `Promise.allSettled()`
- Improve process monitoring integration
- Improve touch handling to prevent overscroll and accidental gestures
- General UI optimization, refactoring, and code cleanup

### 🔥Deleted
- `GoogleSansFlex.ttf`
- Live ping measurement fallback from Web UI
- Pill background indicator on bottom navigation
- Dependency on remote GitHub avatar image

---

## v1.1.3-ORIGIN - 2026-07-01

### 🔥Deleted
- Hard border on web UI navigation bar
- `[‘meta-version’, ‘version’]` from array in `VinNet.js`

### ✨Added
- Frosted glass effect to web UI navigation bar
- Pop effect to icon when it's active in web UI navigation bar
- Radius of pill navbar in web UI
- Tap feedback to web UI navigation bar
- Fade-in effect to navbar labels in web UI
- Consistent radius to expressive scale on web UI banner
- Soft shadow to web UI banner
- Animation for changing numbers on web UI monitor
- Icon for each tweak in web UI
- Tonal container icon to tweak in web UI
- Tap feedback links to links on web UI
- Icon to each link on web UI
- Brand's original colored icon to links in web UI
- Chips tappable for contributors in web UI
- Tap feedback button for contributors in web UI
- Mini avatar to chip in web UI for contributors

### 🔄️Changed
- Jump animation with slide animation on pill indicator in web UI navigation bar
- Split navbar icons into two states: active state uses filled icons, and inactive state uses outline icons
- Solid color to gradient color on pill navbar in web UI
- Loading screen ring design with conic gradient spinner in web UI
- All values in `WCNSS_qcom_cfg.ini` tweak
- Checked switch with gradient in toggle tweak on web UI
- Navbar tweaks icon from tune to gear
- Arrow with chevron SVG on links in web UI
- Banner

### 📈Improved
- Synchronize transition duration of web UI loading screen in VinNet.js with transition duration of loading screen in VinNet.css
- Other iterations, modernizations, and refactorings
- Combine version and version code in Web UI metadata

### 🚫Disabled
- State during process on toggle tweak in web UI

---

## v1.1.2-CRYOSTASIS - 2026-06-22

### 🔄️Changed
- Module description
- Variable name in `service.sh`
- Variable name in `customize`
- Variable name in `VinNet.js`
- Variable name in `index.html`
- Variable name in `VinNet.css`
- Hard border with a faint shadow blur on web UI header
- Avatar radius in web UI header
- Script from `iw wlan0 set power_save` to `iw dev wlan0 set power_save` in `Disable Power Save` tweak to ensure better compatibility with other devices
- UI web banner

### 📈Improved
- Monitor accuracy by reducing refresh interval to 3 seconds
- Device efficiency by reducing resource usage when executing monitor logic

### ✨Added
- Root detection to web UI
- Frosted glass to web UI header
- Soft glow to avatar in web UI header
- `Disable Network Avoid Bad Wi-Fi` tweak, which contains scripts `settings put global network_avoid_bad_wifi`, `settings put system wifi_assistant`, and add removal script to `uninstall.sh`
- `Disable BLE Scan Always Enabled` tweak, which contains scripts `settings put global ble_scan_always_enabled`, and add removal script to `uninstall.sh`

### 🔥Deleted
- Junk code in `service.sh` and `VinNet.js`
- `.tb-badge` from `VinNet.css`
- Gimmick `settings put global wifi_ipreach_disconnect_enabled` script from `Disable IP Reach Disconnect` tweak
- Gimmick settings script that sets data_saver_mode to global in `Disable Restrict Background` tweak

---

## v1.1.1-INGALL - 2026-04-24

### ✨Added
- `index.html`
- `VinNet.css`
- `VinNet.js`
- `VinNet.jpg`
- `VinNetBanner.webp`
- `GoogleSansFlex.ttf`
- `customize`
- `wpa_supplicant.conf`
- `wifi_ipreach_disconnect_enabled`, `wifi_scan_always_enabled`, `data_saver_mode` parameter to global table
- `restrict-background` tweak via netpolicy command
- `force-hi-perf-mode` Wi-Fi tweak via CMD
- Scripts for removing database tweaks and property tweaks to `uninstall.sh`

### 🔄️Changed
- Structure and logic of `customize.sh` script to make it more concise and straightforward
- Quantum and noecn qdisc configurations for fq_codel
- Regulatory region for device's Wi-Fi chip to 'US' in `system.prop`

### 📈Improved
- Speed up module installation by removing all sleep commands from `customize.sh`

---

## v1.1.0-JIRASD - 2026-04-17

### 🔥Deleted
- All experimental scripts from `service.sh`
- `debug.sf.enable_adpf_cpu_hint` script from `service.sh`
- CPU governor script from `service.sh` and restore default settings

### 🔄️Changed
- Method for modifying qdisc values from using sysctl to using tc

### ✨Added
- `set-ignore-delivery-group-policy` setting for the Mobile Legends, Free Fire Max, Clash of Clans, and Clash Royale packages via cmd in `service.sh`

### ✅Enabled
- Aggregation for 4G mobile data via property in `system.prop`

### 📈Improved
- Efficiency and simplicity of all scripts in `service.sh`

---

## v1.0.9-ZENITH - 2026-04-11

### 🔧Fixed
- Installation error using Magisk manager **(Hopefully)**
- Binary detection error during module installation process via manager

### ✨Added
- Logic to check `wpa_supplicant_overlay.conf` after system boot
- Validation and looping logic to `wlan0 power_save`

### 🔄️Changed
- Mobile data `tx_queue_len` from default to 1024 via sysfs

### ✅Enabled
- `Wi-Fi force-low-latency-mode` setting via cmd to minimize jitter

---

## v1.0.8-EVE - 2026-04-02

### 🔧Fixed
- Installation error using Magisk manager **(Hopefully)**

### 🔄️Changed
- Interface Installation process using manager
- `updates.txt` to `changelog.md`
- Notification logic

### ✨Added
- Code name to version
- Script to detect binary dependencies during installation process via manager
- Binary mount status notification after booting into system

### 🚫Disabled
- `Wi-Fi ipreach-disconnect` via cmd to minimize sudden disconnections
- Wi-Fi background scanning when screen is on and when screen is off via cmd to minimize ping spikes
- `Wi-Fi scan-always-available` setting via cmd to minimize ping spikes
- `wlan0 power_save` via iw to minimize ping spikes

### ✅Enabled
- `p2p_disabled` via `wpa_supplicant_overlay.conf` file to minimize ping spikes
