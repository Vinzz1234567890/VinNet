<div align="center">

<img src="webroot/assets/VinNetBanner5.webp" alt="VinNet banner" width="100%" />

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

VinNet tunes knobs Android and the kernel already give you. No VPN. No proxy. No "gaming mode" theater. Just AOSP and kernel parameters, tested and checked on device.

- **Receipts over vibes.** Live state gets re-read after every apply.
- **Tested, not pasted.** Every tweak was tested for a real effect. Placebo is not the business model.
- **Your call.** Persistent Tweaks restores reset-prone tweaks after boot. Opt in or don't.

## Why this exists

Most "network optimizer" modules are fan fiction with root access. Copied scripts. Random sysctls from old forum threads. Commands that never did anything. Then a green "Enabled" badge that means absolutely nothing.

VinNet does the boring part properly:

| Mid modules | VinNet |
| :-- | :-- |
| Scripts and vibes | AOSP/kernel knobs, each tested |
| Apply once, hope it sticks | Apply, re-read live state, report |
| "Enabled" even when unsupported | Unsupported = disabled. Unknown = indeterminate |
| One path for every phone | Per-interface QDISC, kernel probe, per-queue |
| System resets it. Nobody cares | Persistent Tweaks restores it, opt in |
| No logs, just screenshots | One log with reasons |

If your module has never told you something failed, it is not optimized. It is just quiet.

## Tweaks

Eight tweaks. All tested. None decorative.

| Tweak | Group | What it does | Reset |
| :-- | :-- | :-- | :-- |
| 📶 IP Reach Disconnect | Gaming | Keeps Wi-Fi from dropping on unstable networks | Reboot |
| 🚦 QDISC | Gaming | 10 disciplines, all or one interface | Reboot |
| ⚡ Wi-Fi Force Low Latency Mode | Gaming | Low-latency mode, hi-perf fallback | Interface changes |
| 🌐 Network Avoid Bad Wi-Fi + Mobile Data Always ON | Gaming | Keeps Wi-Fi, stops cellular cutting in | Persists |
| 📡 BLE Scan Always Enabled | Gaming | Fewer jitter spikes on 2.4 GHz | Persists |
| 🔍 Wi-Fi Scan Throttle | Gaming | Less scanning, less jitter, more battery | Persists |
| 🆕 🧠 Optimize NetDev | Multitasking | Bigger netdev backlog and NAPI budget under load | Reboot |
| 🆕 🧠 TCP Slow Start After Idle | Multitasking | Keeps TCP throughput after idle gaps | Reboot |

<details>
<summary>How a switch becomes a system call</summary>
<br />

Tap. Persist. Apply. Verify. Report.

The Web UI saves your intent first. `service.sh` applies it, then re-reads live state before saying it is done. If the value cannot be saved, the apply is skipped. No "trust me bro".

</details>

<details>
<summary>The 10 disciplines, decoded</summary>
<br />

| Discipline | What it is |
| :-- | :-- |
| `pfifo_fast` | Classless FIFO, common kernel default |
| `fq_codel` | Fair queue + CoDel, the bufferbloat fix |
| `cake` | Fairer than `fq_codel`, handles overhead |
| `fq` | Fair queuing per flow |
| `sfq` | Stochastic fair queueing, the classic |
| `codel` | Controlled delay AQM, no per-flow queues |
| `pie` | Proportional integral AQM, CoDel cousin |
| `fq_pie` | `fq` plus PIE |
| `hhf` | Heavy-hitter filter, isolates fat flows |
| `sfb` | Stochastic fair blue, fairness when congested |

QDISC specs carry tuned parameters. `cake` measures your uplink first with two 2 MB uploads to Cloudflare, then sets bandwidth. If the measurement fails, the tweak still applies.

</details>

<details>
<summary>Settings that don't waste your time</summary>
<br />

**Log Level:** Off, Error, Info, Debug. Default is Error. Off wipes the log.

**Log Buffer:** 2k, 8k, 32k, 128k, 512k. Default is 32k. Oldest entries drop first.

Diagnostics follow the log level. Debug adds binary paths, dmesg, and Wi-Fi dumps.

</details>

## Compatibility

Magisk module format. No native binaries. No ABI cosplay.

<kbd>Magisk</kbd>&nbsp; <kbd>KernelSU</kbd>&nbsp; <kbd>APatch</kbd>

Only `fog` keeps the bundled `WCNSS_qcom_cfg.ini`. Other devices mount nothing (`skip_mount`). Stock stays stock.

## Install

<a href="https://github.com/Vinzz1234567890/VinNet/releases/latest"><img src="https://img.shields.io/badge/Download-Latest%20release-0E7490?style=for-the-badge&amp;labelColor=1C1B1F&amp;logo=github" alt="Download the latest VinNet release" /></a>

Rooted Android, supported manager. That is the whole requirement.

- [ ] Grab the latest `VinNet-*.zip` from [<ins>Releases</ins>](https://github.com/Vinzz1234567890/VinNet/releases)
- [ ] Open your root manager &rarr; <kbd>Modules</kbd> &rarr; <kbd>Install from storage</kbd>
- [ ] Reboot
- [ ] Open the Web UI. Turn on <kbd>Persistent Tweaks</kbd> if you hate re-doing work

> [!IMPORTANT]
> Remove conflicting network modules first. Two writers fighting over `tc` is a skill issue you do not need.

## Diagnostics

Receipts live in **`/data/adb/VinNet/VinNet.log`** (or share via Web UI Settings). Every failure comes with a reason. Level and buffer size are yours to set.

Pull it over ADB:

```sh
adb pull /data/adb/VinNet/VinNet.log
```

<details>
<summary>What to include in a bug report</summary>
<br />

Do not just say "laggy". Include:

- The log
- Root manager + version, device/ROM, Android version
- The tweak. For QDISC, the interface and discipline
- Whether Persistent Tweaks is on

</details>

## FAQ

<details>
<summary>Will this double my bandwidth?</summary>
<br />

No. Anyone promising that is selling you vibes. Expect steadier ping and less jitter. That is it.

</details>

<details>
<summary>What does Persistent Tweaks restore?</summary>
<br />

The reset-prone trio: `IP Reach Disconnect`, `QDISC`, and `Wi-Fi Force Low Latency Mode`. After boot and during checks. Off by default. No forced behavior.

</details>

<details>
<summary>A tweak says &quot;Not supported&quot;. Why?</summary>
<br />

Your device said no. The switch disables itself and sends no commands. Good modules do not lie.

</details>

<details>
<summary>Does the service drain battery?</summary>
<br />

Nope. Cheap 5 second loop. Ping only while the Web UI is open.

</details>

<details>
<summary>Can I stack it with other network modules?</summary>
<br />

Please do not. Two modules writing `tc` and `settings` is not a flex. Live checks exist to tell the truth, not referee a turf war.

</details>

## Safety

> [!WARNING]
> Root can break things. VinNet changes network settings and kernel queue disciplines. Use your brain. Tweaks are opt-in, and some reset after reboot or interface changes. VinNet is not affiliated with Google, Android, Magisk, KernelSU, or APatch.

## Community

- **Repository:** [Vinzz1234567890/VinNet](https://github.com/Vinzz1234567890/VinNet)
- **Telegram:** [Vinzz Repository](https://t.me/VinzzRepository)
- **Feedback:** [@Vinzz1234567890](https://t.me/Vinzz1234567890)
- **Like it?** [Star the repo](https://github.com/Vinzz1234567890/VinNet). If it slapped, say so.

## License

Licensed under the [<ins>Apache License 2.0</ins>](LICENSE).

<div align="center">

<sub>Measure the network. Change only what you mean to.</sub>

<br />
<br />

<sub>Built by <a href="https://github.com/Vinzz1234567890">Vinzz</a> · Apache-2.0</sub>

</div>
