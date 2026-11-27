<div align="center">

<img src="webroot/Assets/VinNetBanner1.webp" alt="VinNet banner" width="100%" />

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

VinNet tunes the knobs Android and the kernel already expose. No VPN. No proxy. No made-up "gaming mode". Just AOSP and kernel parameters, tested on device and checked after every apply.

- **Receipts, not vibes.** Live state gets re-read after every apply.
- **Tested, not copy-pasted.** Every tweak was checked for a real effect. Placebo is not the business model.
- **Self-starting daemon.** The Web UI checks it. If dead, it restarts. No babysitting.

## Why this exists

Most "network optimizer" modules are fan fiction with root access. Scripts from a forum dumpster. Random sysctls from 2014. Commands that never existed. Then a green "Enabled" badge doing its best impersonation of truth. Absolutely cooked.

| Mid modules | VinNet |
| :-- | :-- |
| Copied scripts, zero tests | AOSP/kernel knobs, each tested |
| Apply once, pray, done | Apply, re-read live state, report |
| "Enabled" when the tweak is dead | Unsupported = disabled. Unknown = indeterminate |
| One path for every phone. L take | Per-interface QDISC, kernel probe, per-queue |
| Reboot nukes it. Nobody cares | Persistent Tweaks restores it, opt in |
| No logs. Just vibes and screenshots | One log with reasons |

If your module has never once told you something failed, it is not optimized. It is quiet and delulu.

## Tweaks

Eight tweaks. Tested. Zero decorative junk.

| Tweak | Group | What it does |
| :-- | :-- | :-- |
| IP Reach Disconnect | Gaming | Keeps Wi-Fi from dropping on unstable networks |
| QDISC | Gaming | 10 disciplines, all or one interface |
| Wi-Fi Force Low Latency Mode | Gaming | Low-latency mode, hi-perf fallback |
| Network Avoid Bad Wi-Fi + Mobile Data Always ON | Gaming | Keeps Wi-Fi, stops cellular cutting in |
| BLE Scan Always Enabled | Gaming | Fewer jitter spikes on 2.4 GHz |
| Wi-Fi Scan Throttle | Gaming | Less scanning, less jitter, more battery |
| Optimize NetDev | Multitasking | Bigger netdev backlog and NAPI budget under load |
| TCP Slow Start After Idle | Multitasking | Keeps TCP throughput after idle gaps |

Reset-prone tweaks are the ones Persistent Tweaks restores. FAQ has the list.

<details>
<summary>How a switch becomes a system call</summary>
<br />

Tap. Persist. Apply. Verify. Report.

The Web UI saves intent first. `service.sh` applies it, then re-reads live state before saying it is done. If the value cannot be saved, the apply is skipped. No "trust me bro".

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

QDISC specs carry tuned parameters. `cake` measures uplink with two 2 MB uploads to Cloudflare. Strict kernel says no, bare `cake` gets applied. Still works. Still honest.

</details>

<details>
<summary>Settings, not a mid-life crisis</summary>
<br />

**Theme:** Material or MiuiX. Saved in `Tweaks.json` and `localStorage`. Applied before first paint. No flash of the wrong look.

**Log Level:** Off, Error, Info, Debug. Default is Error. Off wipes the log.

**Log Buffer:** 2k, 8k, 32k, 128k, 512k. Default is 32k. Oldest entries drop first.

**Export Log:** Shares `VinNet.log` through Android SEND. No digging through folders.

Diagnostics follow the log level. Debug adds binary paths, dmesg, and Wi-Fi dumps.

</details>

## Compatibility

Magisk module format. No native binaries. No ABI cosplay.

<kbd>Magisk</kbd>&nbsp; <kbd>KernelSU</kbd>&nbsp; <kbd>APatch</kbd>

Only `fog` keeps the bundled `WCNSS_qcom_cfg.ini`. Other devices mount nothing (`skip_mount`). Stock stays stock.

## Install

<a href="https://github.com/Vinzz1234567890/VinNet/releases/latest"><img src="https://img.shields.io/badge/Download-Latest%20release-0E7490?style=for-the-badge&amp;labelColor=1C1B1F&amp;logo=github" alt="Download the latest VinNet release" /></a>

Root required. No PC, no fastboot, no terminal cosplay.

| Do | What actually happens |
| :-- | :-- |
| Flash `VinNet-*.zip` from <kbd>Modules</kbd> &rarr; <kbd>Install from storage</kbd> | Installer reads the device codename. `fog` keeps the vendor Wi-Fi config. Everyone else gets `skip_mount` and zero vendor files |
| Reboot | Service waits for boot, publishes its PID, then starts the watchdog |
| Open the Web UI | Daemon gets checked. If dead, it restarts on the spot |
| Flip one switch | Intent saved to `/data/adb/VinNet`, applied, re-read live |
| Optional: <kbd>Persistent Tweaks</kbd> | Reset-prone tweaks come back after boot and during checks |

> [!IMPORTANT]
> Remove conflicting network modules first. Two modules writing the same `tc` and `settings` values make live state a liar. Not a flex.

## Diagnostics

Receipts live in **`/data/adb/VinNet/VinNet.log`**. Every failure comes with a reason. Or hit **Export Log** in Settings and let Android handle the sharing.

Pull it over ADB:

```sh
adb pull /data/adb/VinNet/VinNet.log
```

<details>
<summary>What to include in a bug report</summary>
<br />

Do not just say "laggy". That is not a bug report. That is a vibe.

- The log
- Root manager + version, device/ROM, Android version
- The tweak. For QDISC, the interface and discipline
- Whether Persistent Tweaks is on

</details>

## FAQ

<details>
<summary>Will this double my bandwidth?</summary>
<br />

No. Anyone promising that is selling you vibes. Expect steadier ping and less jitter. Cope with reality.

</details>

<details>
<summary>What does Persistent Tweaks restore?</summary>
<br />

The reset-prone set: `IP Reach Disconnect`, `QDISC`, `Wi-Fi Force Low Latency Mode`, `Optimize NetDev`, and `TCP Slow Start After Idle`. After boot and during checks. Off by default. No forced behavior.

</details>

<details>
<summary>A tweak says &quot;Not supported&quot;. Why?</summary>
<br />

Your device said no. The switch disables itself and sends no commands. Good modules do not lie. Unlike the rest of that folder.

</details>

<details>
<summary>Does the service drain battery?</summary>
<br />

Nope. Cheap 5 second loop. Ping only while the Web UI is open.

</details>

<details>
<summary>Can I stack it with other network modules?</summary>
<br />

Please do not. Two modules writing `tc` and `settings` is not a flex. It is a clown show. Live checks exist to tell the truth, not referee a turf war.

</details>

<details>
<summary>Why is the Web UI showing a PID out of nowhere?</summary>
<br />

That is the daemon. It starts on demand and the dashboard polls `status` live. If it dies, the next Web UI open brings it back. No ritual required.

</details>

## Safety

> [!WARNING]
> Root can break things. VinNet changes network settings and kernel queue disciplines. Use your brain. Tweaks are opt-in, and some reset after reboot or interface changes. VinNet is not affiliated with Google, Android, Magisk, KernelSU, or APatch.

## Community

- **Repository:** [Vinzz1234567890/VinNet](https://github.com/Vinzz1234567890/VinNet)
- **Telegram:** [Vinzz Repository](https://t.me/VinzzRepository)
- **Feedback:** [@Vinzz1234567890](https://t.me/Vinzz1234567890)
- **Like it?** [Star the repo](https://github.com/Vinzz1234567890/VinNet). If it slapped, say so. If not, file a log, not a vibe check.

## License

Licensed under the [<ins>Apache License 2.0</ins>](LICENSE).

<div align="center">

<sub>Measure the network. Change only what you mean to.</sub>

<br />
<br />

<sub>Built by <a href="https://github.com/Vinzz1234567890">Vinzz</a> · Apache-2.0</sub>

</div>
