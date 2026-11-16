// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Performance and benchmark tests

import GLib from 'gi://GLib';
import {WindowMemory} from '../src/windowMemory.js';
import * as Log from '../src/log.js';
import {
    assert,
    createMemorySettings,
    MockInputSourceService,
    MockWindow,
    MockDisplay,
    MockDesktopSettings,
} from './helpers.js';

console.log('=== Liswitch: Performance & Timing Benchmarks ===\n');

const settings = createMemorySettings();

// Disable debug logging to measure pure operational latency
Log.setDebugOverride(false);

const mockDisplay = new MockDisplay();
const mockDesktopSettings = new MockDesktopSettings(false);

const inputService = new MockInputSourceService();
const memory = new WindowMemory(settings, inputService);
memory.enable({display: mockDisplay, desktopSettings: mockDesktopSettings});

// Benchmark: 1000 consecutive window focus shifts (Alt+Tab simulation)
console.log('Benchmark: 1,000 focus window transitions measuring execution time...');

const windows = [
    new MockWindow(101, 'org.gnome.TextEditor'),
    new MockWindow(102, 'org.gnome.Console'),
    new MockWindow(103, 'org.mozilla.firefox'),
    new MockWindow(104, 'com.visualstudio.code'),
    new MockWindow(105, 'org.gnome.Nautilus'),
];

const timingsUs = [];
const ITERATIONS = 1000;

for (let i = 0; i < ITERATIONS; i++) {
    const win = windows[i % windows.length];
    mockDisplay.focus_window = win;

    const start = GLib.get_monotonic_time();
    memory._onFocusWindowChanged();
    const end = GLib.get_monotonic_time();

    timingsUs.push(end - start);
}

const totalUs = timingsUs.reduce((a, b) => a + b, 0);
const avgUs = totalUs / ITERATIONS;
const minUs = Math.min(...timingsUs);
const maxUs = Math.max(...timingsUs);

console.log(`  -> Total time for ${ITERATIONS} focus transitions: ${(totalUs / 1000).toFixed(2)} ms`);
console.log(`  -> Average time per transition: ${avgUs.toFixed(3)} µs (${(avgUs / 1000).toFixed(5)} ms)`);
console.log(`  -> Min time: ${minUs} µs, Max time: ${maxUs} µs`);

// Performance threshold requirement: must be well under 1000 µs (1 ms)
assert(avgUs < 500, `Average focus change handler time (${avgUs} µs) must be < 500 µs`);

memory.destroy();
console.log('  -> PASS: Focus handler executes well within performance budget!\n');

console.log('=== PERFORMANCE BENCHMARKS COMPLETE ===');
