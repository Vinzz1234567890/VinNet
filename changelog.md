# 📜Changelog - VinNet

---

## v1.1.1-INGALL - 2026-04-24 - Latest

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
