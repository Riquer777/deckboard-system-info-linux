# B580 System Monitor for Deckboard

Linux system monitor focused on the Intel Arc B580 using the Xe driver's kernel telemetry. It is implemented in JavaScript and does not require shell scripts, `sudo`, `perf`, or external monitoring utilities.

## Features

- Toggle monitoring ON/OFF from a Deckboard button.
- When OFF, all displayed metrics return to zero and sampling stops.
- Sampling interval button cycles through **200 ms → 500 ms → 1000 ms**.
- Intel Arc B580 GPU usage (busiest Xe engine), VRAM use, GPU package temperature and VRAM temperature.
- CPU usage and package temperature.
- RAM usage.
- Network download and upload in Mbit/s.

## How to use

1. Install the extension in Deckboard.
2. Add the **Monitor: ON / OFF** action to a Deckboard button. Press it to start or stop sampling.
3. Add the **Measurement interval** action to another button. Each press advances to the next interval.
4. Add the GPU Usage, CPU Usage, GPU Details, Network Speed, and CPU Temperature actions as needed. The metric selector appears where an action offers more than one metric.

The extension starts with monitoring OFF. The default interval is 500 ms.

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

The extension aggregates RX/TX byte counters from `/proc/net/dev`, excluding the loopback interface. Rates are calculated from the elapsed time between samples and displayed in decimal Mbit/s.

## Requirements

- Deckboard 3.1.1 or newer with JavaScript extension support.
- Linux with readable `/proc` and `/sys/class/hwmon` telemetry.
- Intel Xe GPU driver for Arc B580 GPU/VRAM telemetry.

## Notes

- The GPU telemetry target is currently set to PCI device `0000:05:00.0` (the Arc B580 in the original development system).
- If the GPU driver does not expose DRM client counters, GPU usage and VRAM usage may show zero or N/A depending on the available data.
- The 200 ms interval increases sampling frequency and may use more CPU than 500 ms or 1000 ms.
