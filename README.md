<div align="center">

<img src="webroot/assets/VinNetBanner4.webp" alt="VinNet banner" width="100%" />

<br />
<br />

<h1>VinNet</h1>

<p><b>Simple Implementation of Network Optimization</b></p>

<p>
  <a href="https://github.com/Vinzz1234567890/VinNet"><img src="https://img.shields.io/github/stars/Vinzz1234567890/VinNet?style=for-the-badge&amp;color=3E5C76&amp;labelColor=1C1B1F&amp;logo=github" alt="VinNet stars" /></a>
  <a href="https://github.com/Vinzz1234567890/VinNet/releases"><img src="https://img.shields.io/github/downloads/Vinzz1234567890/VinNet/total?style=for-the-badge&amp;label=downloads&amp;color=3E5C76&amp;labelColor=1C1B1F&amp;logo=github" alt="Total VinNet downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache--2.0-4B5563?style=for-the-badge&amp;labelColor=1C1B1F" alt="Apache 2.0 license" /></a>
</p>

<p>
  <kbd><a href="#overview">Overview</a></kbd>&nbsp;
  <kbd><a href="#why-this-exists">Why</a></kbd>&nbsp;
  <kbd><a href="#tweaks">Tweaks</a></kbd>&nbsp;
  <kbd><a href="#install">Install</a></kbd>&nbsp;
  <kbd><a href="#diagnostics">Diagnostics</a></kbd>&nbsp;
  <kbd><a href="#faq">FAQ</a></kbd>&nbsp;
  <kbd><a href="changelog.md">Changelog</a></kbd>
</p>

</div>

---

## Overview

VinNet is a root module for one thing only: network optimization on Android. It tunes parameters that Android and the kernel already expose: `cmd wifi`, global `settings`, `resetprop`, and the kernel's queueing discipline layer (`tc`). It does not install a VPN, a proxy, a fake "gaming mode", or a hidden bandwidth profile. Every change is opt-in, checked live, and verified after it is applied.

- **Built to be measured.** Every tweak in this module was personally tested for its real effect before it shipped. Placebo is not on the menu.
- **Honest state.** The Web UI reads live state after every apply. Unsupported tweaks disable themselves; unknown states show an indeterminate switch.
- **Opt-in, opt-out.** Persistent Tweaks restores the reset-prone trio after boot and during checks, only if you turn it on.

## Why this exists

Most "network optimization" modules floating around are not built, they are assembled. Random scripts copied from a forum post, tweaks that have nothing to do with networking at all, and sometimes commands that never did anything in the first place. Apply them once at boot, get a nice "Enabled" toast, and never check whether the thing actually stuck. On some devices it silently didn't: the AOSP service reset it, the path the script fired at doesn't match your ROM, your interfaces are laid out differently, and the module has no idea. It applied the same way on every phone in existence, and reported the same success on every phone that failed.

VinNet was built as the opposite of that:

| The usual network module | VinNet |
| :-- | :-- |
| Scripts copied from somewhere, tweaks with no real relation to networking, sometimes pure hallucination | Only real, built-in AOSP and kernel parameters, each one personally tested for effect |
| Applies once, never checks again | Applies, then re-reads live state and reports the truth |
| Says "Enabled" even when the tweak was unsupported or didn't stick | Unsupported means disabled. Unknown means indeterminate. Failures come with a reason in the log |
| One path for every device, regardless of ROM or interface layout | Per-interface QDISC, kernel probing on `lo`, an interface whitelist, per-queue handling on multi-queue setups |
| Tweak gets reset by the system, gone forever | Persistent Tweaks re-applies the reset-prone trio after boot and during Web UI checks (opt-in) |
| Zero way to see what actually happened | One log: `/storage/emulated/0/Download/VinNet.log` |

If a module never told you anything went wrong, ask yourself why.

## Tweaks

Every tweak below is short, each one tested to do something real before it shipped.

| Tweak | What it changes | Reset |
| :-- | :-- | :-- |
| 📶 **IP Reach Disconnect** | Keeps Wi-Fi from dropping when the network gets unstable. | After reboot |
| 🚦 **QDISC** | One of 10 queue disciplines for all eligible interfaces or one interface; `Custom` when they differ. | After reboot |
| ⚡ **Wi-Fi Force Low Latency Mode** | Android's low-latency mode, with hi-perf fallback. | After interface changes |
| 🌐 **Network Avoid Bad Wi-Fi & Mobile Data Always ON** | Keeps Wi-Fi connected as signal degrades; stops background cellular data from disrupting transmission. | Persists |
| 📡 **BLE Scan Always Enabled** | Reduces jitter and ping spikes on 2.4 GHz Wi-Fi. | Persists |
| 🔍 **Wi-Fi Scan Throttle** | Limits background Wi-Fi scanning to cut jitter and save battery. | Persists |

<details>
<summary>How a switch becomes a system call</summary>
<br />

Nothing applies until you tap the switch. The Web UI persists your desired value to `/data/adb/VinNet` first; `service.sh` applies it, then re-reads live state to verify before saying it's done. If the value cannot be persisted, the apply is skipped, because applying something the system will forget is just placebo.

Displayed status always comes from live reads. `Tweaks.json` stores desired values for Persistent Tweaks only.

</details>

<details>
<summary>The 10 disciplines, decoded</summary>
<br />

| Discipline | What it is |
| :-- | :-- |
| `pfifo_fast` | Classless FIFO, the kernel default on many builds |
| `fq_codel` | Fair queue + CoDel AQM, the "just works" fix for bufferbloat |
| `cake` | `fq_codel` on steroids, better per-host fairness and overhead handling |
| `fq` | Fair queuing per flow |
| `sfq` | Stochastic fair queueing, older flow-fairness discipline |
| `codel` | Controlled delay AQM, kills bufferbloat without per-flow queues |
| `pie` | Proportional integral controller AQM, same goal as CoDel |
| `fq_pie` | `fq` + PIE AQM combo |
| `hhf` | Heavy-hitter filter, isolates few fat flows (video, game) from mice flows |
| `sfb` | Stochastic fair blue, fairness under persistent congestion |

Probed on `lo` against your running kernel; only what it accepts is offered. Multi-queue interfaces get the discipline per queue.

</details>

## Compatibility

Standard Magisk module format. No native binaries, no ABI drama.

| Environment | Module | Web UI |
| :-- | :--: | :-- |
| **Magisk** | Supported | Requires a Web UI-capable host |
| **KernelSU** | Supported | Module screen |
| **APatch** | Supported | Module screen |

- On `fog`, the installer keeps the bundled `WCNSS_qcom_cfg.ini`. Other devices keep stock vendor files and mount nothing (`skip_mount`).
- KernelSU/APatch forks on the standard module format should work, but are not individually tested. APatch itself targets ARM64.
- Every tweak still needs your device to actually have the knob. What is supported on your hardware is what you get to toggle.

## Install

<a href="https://github.com/Vinzz1234567890/VinNet/releases/latest"><img src="https://img.shields.io/badge/Download-Latest%20release-0E7490?style=for-the-badge&amp;labelColor=1C1B1F&amp;logo=github" alt="Download the latest VinNet release" /></a>

Requires a rooted Android device and a supported module manager.

- [ ] Grab the latest `VinNet-*.zip` from [<ins>Releases</ins>](https://github.com/Vinzz1234567890/VinNet/releases)
- [ ] Open your root manager &rarr; <kbd>Modules</kbd> &rarr; <kbd>Install from storage</kbd>
- [ ] Reboot
- [ ] Open the Web UI and enable <kbd>Persistent Tweaks</kbd> in Settings, unless you like re-applying stuff by hand

> [!IMPORTANT]
> Remove conflicting network-tuning modules first. Two modules writing the same `tc`, `settings`, or `resetprop` values, and live state will happily lie to you.

## Diagnostics

One log: **`/storage/emulated/0/Download/VinNet.log`**. Device/kernel/ABI, module version, tool paths, core writability, filtered Wi-Fi state, and the reason behind every tweak failure. The service truncates it at 128 KiB on startup, so it never eats your storage.

Pull it over ADB:

```sh
adb pull /storage/emulated/0/Download/VinNet.log
```

<details>
<summary>What to include in a bug report</summary>
<br />

Please don't just say "Wi-Fi is laggy". Include:

- The log
- Root manager + version, device/ROM, Android version
- Which tweak; for QDISC, the interface and the discipline
- Whether Persistent Tweaks is enabled

</details>

## FAQ

<details>
<summary>Will this double my bandwidth or fix my Wi-Fi forever?</summary>
<br />

No. It is tuning, not magic. Expect fewer bufferbloat spikes, steadier latency, lower jitter, especially on 2.4 GHz Wi-Fi and cellular. Anyone promising "1000% faster internet" is selling placebo.

</details>

<details>
<summary>What does Persistent Tweaks restore?</summary>
<br />

The reset-prone trio: `IP Reach Disconnect`, `QDISC` (all and per-interface), and `Wi-Fi Force Low Latency Mode`. Re-applied after boot and during Web UI checks. Off by default, because VinNet doesn't touch your settings without a tap.

</details>

<details>
<summary>A tweak says &quot;Not supported&quot;, why?</summary>
<br />

Short answer: its live check failed or returned nothing. The control disables itself and sends no commands. For QDISC this means no eligible interface on the device, or a kernel that accepted none of the 10 disciplines on the `lo` probe.

</details>

<details>
<summary>Does the service drain battery?</summary>
<br />

Nope. It wakes every 5 seconds for a cheap state check, and only pings `1.1.1.1` and `1.0.0.1` while the Web UI is open.

</details>

<details>
<summary>Why does the installer skip the vendor config on my device?</summary>
<br />

The bundled `WCNSS_qcom_cfg.ini` is `fog`-only. Everywhere else the bundled `system` tree is removed at install time and a `skip_mount` flag is set, so the module mounts nothing and only manages runtime state.

</details>

<details>
<summary>Can I run VinNet alongside other network modules?</summary>
<br />

Technically yes, practically please don't. If something else writes the same `tc`/`settings` values, yours wins only when it applies last, and neither of you can tell who owns `fq_codel`. Live state checks exist to tell the truth, not to referee a turf war.

</details>

## Safety

> [!WARNING]
> Root access can break things. VinNet changes network settings and kernel queue disciplines; use it at your own risk. Tweaks are opt-in, and some reset after reboot or interface changes. Do not stack conflicting network modules. VinNet is not affiliated with Google, Android, Magisk, KernelSU, or APatch.

## Community

- **Repository:** [Vinzz1234567890/VinNet](https://github.com/Vinzz1234567890/VinNet)
- **Telegram:** [Vinzz Repository](https://t.me/VinzzRepository)
- **Feedback:** [@Vinzz1234567890](https://t.me/Vinzz1234567890)
- **Like it?** [Star the repo](https://github.com/Vinzz1234567890/VinNet), it genuinely helps

## License

Licensed under the [<ins>Apache License 2.0</ins>](LICENSE).

<div align="center">

<sub>Measure the network. Change only what you mean to.</sub>

<br />
<br />

<sub>Built by <a href="https://github.com/Vinzz1234567890">Vinzz</a> · Apache-2.0</sub>

</div>
