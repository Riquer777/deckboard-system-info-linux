'use strict';

const fs = require('fs');
const path = require('path');
const { Extension, InputTypes, Platforms, log } = require('deckboard-kit');

const GPU_PCI = '0000:05:00.0';
const INTERVALS = [200, 500, 1000];
const ENGINE_NAMES = ['rcs', 'vcs', 'vecs', 'bcs', 'ccs'];

const ZERO_VALUES = {
  'b580-monitor': 'OFF',
  'b580-interval': '200 ms',
  'b580-gpu-load': { title: 'GPU Usage', value: '0', suffix: '%' },
  'b580-vram-used': '0 MiB',
  'b580-gpu-temp': '0 °C',
  'b580-vram-temp': '0 °C',
  'b580-cpu-load': { title: 'CPU Usage', value: '0', suffix: '%' },
  'b580-cpu-temp': '0 °C',
  'b580-ram-used': '0 %',
  'b580-download': '0.00 Mbit/s',
  'b580-upload': '0.00 Mbit/s'
};

class B580Monitor extends Extension {
  constructor(props = {}) {
    super(props);

    this.setValue = props.setValue;
    this.name = 'B580 System Monitor';
    this.platforms = [Platforms.linux];

    this.running = false;
    this.intervalIndex = 0;
    this.timer = null;
    this.lastGpu = null;
    this.lastCpu = null;
    this.lastNetwork = null;

    this.inputs = [
      {
        label: 'Monitor: ON / OFF',
        value: 'b580-monitor',
        icon: 'power',
        mode: 'custom-value',
        fontIcon: 'fas',
        color: '#16A085'
      },
      {
        label: 'Measurement interval',
        value: 'b580-interval',
        icon: 'stopwatch',
        mode: 'custom-value',
        fontIcon: 'fas',
        color: '#2980B9'
      },
      {
        label: 'GPU Usage',
        value: 'b580-gpu',
        icon: 'microchip',
        mode: 'graph',
        fontIcon: 'fas',
        color: '#8E44AD',
        input: [
          {
            label: 'Metric',
            type: InputTypes.select,
            items: [
              { value: 'b580-gpu-load', label: 'GPU Usage (busiest engine)' }
            ]
          }
        ],
        display: { type: 'graph', defaultTitle: 'Intel Arc B580' }
      },
      {
        label: 'CPU Usage',
        value: 'b580-cpu',
        icon: 'gauge-high',
        mode: 'graph',
        fontIcon: 'fas',
        color: '#D35400',
        input: [
          {
            label: 'Metric',
            type: InputTypes.select,
            items: [
              { value: 'b580-cpu-load', label: 'CPU Usage' }
            ]
          }
        ],
        display: { type: 'graph', defaultTitle: 'CPU / RAM' }
      },
      {
        label: 'GPU Details',
        value: 'b580-gpu-details',
        icon: 'memory',
        mode: 'custom-value',
        fontIcon: 'fas',
        color: '#8E44AD',
        input: [
          {
            label: 'Metric',
            type: InputTypes.select,
            items: [
              { value: 'b580-vram-used', label: 'VRAM Used (MiB)' },
              { value: 'b580-gpu-temp', label: 'GPU Package Temperature' },
              { value: 'b580-vram-temp', label: 'VRAM Temperature' }
            ]
          }
        ]
      },
      {
        label: 'Network Speed',
        value: 'b580-network',
        icon: 'wifi',
        mode: 'custom-value',
        fontIcon: 'fas',
        color: '#16A085',
        input: [
          {
            label: 'Metric',
            type: InputTypes.select,
            items: [
              { value: 'b580-download', label: 'Download (Mbit/s)' },
              { value: 'b580-upload', label: 'Upload (Mbit/s)' }
            ]
          }
        ]
      },
      {
        label: 'CPU Details',
        value: 'b580-cpu-details',
        icon: 'thermometer-half',
        mode: 'custom-value',
        fontIcon: 'fas',
        color: '#D35400',
        input: [
          {
            label: 'Metric',
            type: InputTypes.select,
            items: [
              { value: 'b580-cpu-temp', label: 'CPU Package Temperature' },
              { value: 'b580-ram-used', label: 'RAM Usage (%)' }
            ]
          }
        ]
      }
    ];

    this.configs = [];
  }

  initExtension() {
    this.publish(ZERO_VALUES);
    log.info('B580 System Monitor initialized. Monitoring is OFF.');
  }

  execute(action) {
    if (action === 'b580-monitor') {
      this.toggleMonitoring();
      return;
    }

    if (action === 'b580-interval') {
      this.changeInterval();
    }
  }

  publish(values) {
    try {
      this.setValue(values);
    } catch (error) {
      log.error('Unable to update Deckboard values:', error);
    }
  }

  toggleMonitoring() {
    if (this.running) {
      this.stopMonitoring();
    } else {
      this.startMonitoring();
    }
  }

  startMonitoring() {
    this.running = true;
    this.lastGpu = null;
    this.lastCpu = null;
    this.lastNetwork = null;

    this.publish({ 'b580-monitor': 'ON' });
    this.sample();

    this.timer = setInterval(() => this.sample(), INTERVALS[this.intervalIndex]);
    log.info('B580 monitoring started at ' + INTERVALS[this.intervalIndex] + ' ms.');
  }

  stopMonitoring() {
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.lastGpu = null;
    this.lastCpu = null;
    this.lastNetwork = null;

    this.publish(ZERO_VALUES);
    log.info('B580 monitoring stopped.');
  }

  changeInterval() {
    this.intervalIndex = (this.intervalIndex + 1) % INTERVALS.length;
    const interval = INTERVALS[this.intervalIndex];

    this.publish({ 'b580-interval': interval + ' ms' });

    if (this.running) {
      if (this.timer) clearInterval(this.timer);
      this.sample();
      this.timer = setInterval(() => this.sample(), interval);
    }

    log.info('B580 measurement interval: ' + interval + ' ms.');
  }

  sample() {
    if (!this.running) return;

    try {
      const now = Date.now();
      const cpu = this.readCpu();
      const memory = this.readMemory();
      const network = this.readNetwork();
      const gpu = this.readGpuClients();
      const temperatures = this.readTemperatures();

      const cpuUsage = this.calculateCpuUsage(cpu);
      const networkRates = this.calculateNetworkRates(network, now);
      const gpuUsage = this.calculateGpuUsage(gpu, now);

      const values = {
        'b580-monitor': 'ON',
        'b580-interval': INTERVALS[this.intervalIndex] + ' ms',
        'b580-gpu-load': {
          title: 'Intel Arc B580',
          description: 'Busiest Xe engine',
          value: gpuUsage.toFixed(1),
          suffix: '%'
        },
        'b580-vram-used': gpu.vramMiB === null ? 'N/A' : gpu.vramMiB.toFixed(0) + ' MiB',
        'b580-gpu-temp': temperatures.gpu === null ? 'N/A' : temperatures.gpu.toFixed(0) + ' °C',
        'b580-vram-temp': temperatures.vram === null ? 'N/A' : temperatures.vram.toFixed(0) + ' °C',
        'b580-cpu-load': {
          title: 'CPU Usage',
          value: cpuUsage.toFixed(1),
          suffix: '%'
        },
        'b580-cpu-temp': temperatures.cpu === null ? 'N/A' : temperatures.cpu.toFixed(0) + ' °C',
        'b580-ram-used': memory.percent.toFixed(1) + ' %',
        'b580-download': networkRates.download.toFixed(2) + ' Mbit/s',
        'b580-upload': networkRates.upload.toFixed(2) + ' Mbit/s'
      };

      this.publish(values);
    } catch (error) {
      log.error('B580 sample failed:', error);
    }
  }

  readCpu() {
    const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
    const values = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = (values[3] || 0) + (values[4] || 0);
    const total = values.reduce((sum, value) => sum + value, 0);
    return { idle, total };
  }

  calculateCpuUsage(current) {
    if (!this.lastCpu) {
      this.lastCpu = current;
      return 0;
    }

    const totalDelta = current.total - this.lastCpu.total;
    const idleDelta = current.idle - this.lastCpu.idle;
    this.lastCpu = current;

    if (totalDelta <= 0) return 0;
    return this.clamp((1 - idleDelta / totalDelta) * 100, 0, 100);
  }

  readMemory() {
    const content = fs.readFileSync('/proc/meminfo', 'utf8');
    const totalMatch = content.match(/^MemTotal:\s+(\d+)/m);
    const availableMatch = content.match(/^MemAvailable:\s+(\d+)/m);

    if (!totalMatch || !availableMatch) return { percent: 0 };

    const total = Number(totalMatch[1]);
    const available = Number(availableMatch[1]);
    return { percent: total > 0 ? this.clamp((total - available) / total * 100, 0, 100) : 0 };
  }

  readNetwork() {
    const lines = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2);
    let rx = 0;
    let tx = 0;

    for (const line of lines) {
      const parts = line.trim().split(/[\s:]+/);
      const interfaceName = parts[0];
      if (!interfaceName || interfaceName === 'lo' || parts.length < 17) continue;

      rx += Number(parts[1]) || 0;
      tx += Number(parts[9]) || 0;
    }

    return { rx, tx };
  }

  calculateNetworkRates(current, now) {
    if (!this.lastNetwork) {
      this.lastNetwork = { stats: current, time: now };
      return { download: 0, upload: 0 };
    }

    const elapsedSeconds = (now - this.lastNetwork.time) / 1000;
    const previous = this.lastNetwork.stats;
    this.lastNetwork = { stats: current, time: now };

    if (elapsedSeconds <= 0) return { download: 0, upload: 0 };

    const download = Math.max(0, current.rx - previous.rx) * 8 / elapsedSeconds / 1000000;
    const upload = Math.max(0, current.tx - previous.tx) * 8 / elapsedSeconds / 1000000;

    return { download, upload };
  }

  readGpuClients() {
    const clients = new Map();
    let globalTotal = 0;

    let pids;
    try {
      pids = fs.readdirSync('/proc');
    } catch (error) {
      return { vramMiB: null, engines: {}, total: 0 };
    }

    for (const pid of pids) {
      if (!/^\d+$/.test(pid)) continue;

      const fdInfoPath = path.join('/proc', pid, 'fdinfo');
      let descriptors;

      try {
        descriptors = fs.readdirSync(fdInfoPath);
      } catch (error) {
        continue;
      }

      for (const descriptor of descriptors) {
        let content;

        try {
          content = fs.readFileSync(path.join(fdInfoPath, descriptor), 'utf8');
        } catch (error) {
          continue;
        }

        if (!/^drm-driver:\s*xe\s*$/m.test(content)) continue;
        if (!new RegExp('^drm-pdev:\\s*' + GPU_PCI.replace(/\./g, '\\.') + '\\s*$', 'm').test(content)) continue;

        const clientMatch = content.match(/^drm-client-id:\s*(\d+)/m);
        const vramMatch = content.match(/^drm-resident-vram0:\s*(\d+)/m);
        const totalMatch = content.match(/^drm-total-cycles-rcs:\s*(\d+)/m);

        if (!clientMatch || !totalMatch) continue;

        const clientId = clientMatch[1];
        const total = Number(totalMatch[1]);
        const record = {
          total,
          vramKiB: vramMatch ? Number(vramMatch[1]) : 0,
          engines: {}
        };

        for (const engine of ENGINE_NAMES) {
          const match = content.match(new RegExp('^drm-cycles-' + engine + ':\\s*(\\d+)', 'm'));
          record.engines[engine] = match ? Number(match[1]) : 0;
        }

        const key = pid + ':' + clientId;
        const existing = clients.get(key);
        if (!existing || record.total >= existing.total) clients.set(key, record);
      }
    }

    let vramKiB = 0;
    const engines = {};

    for (const engine of ENGINE_NAMES) engines[engine] = 0;

    for (const record of clients.values()) {
      vramKiB += record.vramKiB;
      for (const engine of ENGINE_NAMES) engines[engine] += record.engines[engine];
      if (record.total > globalTotal) globalTotal = record.total;
    }

    return {
      vramMiB: clients.size ? vramKiB / 1024 : null,
      engines,
      total: globalTotal
    };
  }

  calculateGpuUsage(current, now) {
    if (!this.lastGpu) {
      this.lastGpu = { stats: current, time: now };
      return 0;
    }

    const previous = this.lastGpu.stats;
    this.lastGpu = { stats: current, time: now };

    const totalDelta = current.total - previous.total;
    if (totalDelta <= 0) return 0;

    let busiestEngine = 0;

    for (const engine of ENGINE_NAMES) {
      const delta = current.engines[engine] - previous.engines[engine];
      const percent = Math.max(0, delta) / totalDelta * 100;
      if (percent > busiestEngine) busiestEngine = percent;
    }

    return this.clamp(busiestEngine, 0, 100);
  }

  readTemperatures() {
    const result = { gpu: null, vram: null, cpu: null };
    const hwmonRoot = '/sys/class/hwmon';

    let devices;
    try {
      devices = fs.readdirSync(hwmonRoot);
    } catch (error) {
      return result;
    }

    for (const device of devices) {
      const base = path.join(hwmonRoot, device);
      let name;

      try {
        name = fs.readFileSync(path.join(base, 'name'), 'utf8').trim();
      } catch (error) {
        continue;
      }

      if (name === 'xe') {
        result.gpu = this.readTemperatureFile(path.join(base, 'temp2_input'));
        result.vram = this.readTemperatureFile(path.join(base, 'temp3_input'));
      } else if (name === 'coretemp') {
        let files;
        try {
          files = fs.readdirSync(base);
        } catch (error) {
          continue;
        }

        for (const file of files) {
          if (!/^temp\d+_input$/.test(file)) continue;
          const labelFile = file.replace('_input', '_label');
          let label = '';

          try {
            label = fs.readFileSync(path.join(base, labelFile), 'utf8').trim();
          } catch (error) {}

          if (label === 'Package id 0' || (!label && file === 'temp1_input')) {
            result.cpu = this.readTemperatureFile(path.join(base, file));
            break;
          }
        }
      }
    }

    return result;
  }

  readTemperatureFile(file) {
    try {
      const value = Number(fs.readFileSync(file, 'utf8').trim());
      return Number.isFinite(value) ? value / 1000 : null;
    } catch (error) {
      return null;
    }
  }

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
}

module.exports = (sendData) => new B580Monitor(sendData);
