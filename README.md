# B580 System Monitor for Deckboard

Linux system monitor focused on the Intel Arc B580 using the Xe driver's kernel telemetry. Implemented in JavaScript without shell scripts, `sudo`, `perf`, or external monitoring utilities.

## Extension identity

- Deckboard name: `B580 System Monitor (Riquer777)`
- Package ID: `riquer777-b580-system-monitor-linux`
- Generated file: `riquer777-b580-system-monitor-linux.asar`

The `package` field in `extension.yml` and the `name` field in `package.json` must remain identical.

## Features

- Toggle monitoring ON/OFF from a Deckboard button.
- When OFF, all displayed metrics return to zero and sampling stops.
- Sampling interval button cycles through **200 ms → 500 ms → 1000 ms**.
- Intel Arc B580 GPU usage (busiest Xe engine), VRAM use, GPU package temperature and VRAM temperature.
- CPU usage and package temperature.
- RAM usage.
- Network download and upload in Mbit/s.

## Installation

Requirements:
- Deckboard 3.1.1 or newer with extension support.
- Linux with readable `/proc` and `/sys/class/hwmon` telemetry.
- Node.js 18+ and npm.

Clone and install dependencies:

```bash
git clone https://github.com/Riquer777/deckboard-system-info-linux.git
cd deckboard-system-info-linux
npm install
npm run check
```

Build the extension:

```bash
npm run build
```

The generated file is:

```text
dist/riquer777-b580-system-monitor-linux.asar
```

To build and install automatically:

```bash
npm run install:deckboard
```

Or copy manually:

```bash
mkdir -p ~/deckboard/extensions
cp dist/riquer777-b580-system-monitor-linux.asar ~/deckboard/extensions/
```

Remove the previous package `deckboard-system-info-linux.asar` from the extensions folder to avoid loading an old duplicate. Fully close and reopen Deckboard.

## How to use

1. Add **Monitor: ON / OFF** to a Deckboard button to start or stop sampling.
2. Add **Measurement interval** to another button. Each press advances to the next interval.
3. Add the GPU Usage, CPU Usage, GPU Details, Network Speed, and CPU Details actions as needed. Select the metric in the action's selector.

Monitoring starts OFF. The default interval is 200 ms.

## Telemetry details

### Intel Arc B580

The extension reads DRM client statistics from `/proc/<pid>/fdinfo/*` for the Xe device at PCI address `0000:05:00.0`. Duplicate file descriptors are deduplicated by process ID and DRM client ID before VRAM and engine counters are aggregated.

GPU usage is shown as the busiest engine's share of the global GT cycle delta, rather than adding engine percentages that can overlap. VRAM is the sum of resident VRAM reported by unique DRM clients.

Temperatures are read from the Xe hwmon device:
- `temp2_input`: GPU package temperature.
- `temp3_input`: VRAM temperature.

### CPU and memory

CPU usage is calculated from deltas in `/proc/stat`. RAM usage is calculated from `MemTotal` and `MemAvailable` in `/proc/meminfo`. CPU package temperature is read from the `coretemp` hwmon device when the `Package id 0` label is available.

### Network

The extension aggregates RX/TX byte counters from `/proc/net/dev`, excluding loopback. Rates are calculated from elapsed time and displayed in decimal Mbit/s.
