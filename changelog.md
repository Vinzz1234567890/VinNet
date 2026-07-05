# 📜Changelog - VinNet

---

## v1.1.3-ORIGIN - 2026-07-01 - Latest

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
