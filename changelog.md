# 📜Changelog - VinNet

---

## v1.0.9-ZENITH - 2026-04-11 - Latest

### 🔧Fixed

- Installation error using Magisk manager **(Hopefully)**

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
