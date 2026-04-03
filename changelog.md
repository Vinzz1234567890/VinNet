# 📜Changelog - VinNet

---

## v1.0.8-EVE - 2026-04-02 - Latest

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

- `Wi-Fi ipreach-disconnect` via CMD to minimize sudden disconnections
- Wi-Fi background scanning when screen is on and when screen is off via CMD to minimize ping spikes
- `Wi-Fi scan-always-available` setting via CMD to minimize ping spikes

### ✅Enabled

- `p2p_disabled` via `wpa_supplicant_overlay.conf` file to minimize ping spikes
- `wlan0 power_save` via iw to minimize ping spikes
