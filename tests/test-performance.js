// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Performance and benchmark tests

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import {WindowMemory} from '../src/windowMemory.js';
import * as Log from '../src/log.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`Assertion failed: ${message}`);
}

console.log('=== Liswitch: Performance & Timing Benchmarks ===\n');

// 1. Setup mock Gio.Settings
const settingsSource = Gio.SettingsSchemaSource.new_from_directory(
    'schemas',
    Gio.SettingsSchemaSource.get_default(),
    false
);
const schema = settingsSource.lookup('org.gnome.shell.extensions.liswitch', false);
const settings = new Gio.Settings({settings_schema: schema});

// Disable debug logging to measure pure operational latency
Log.setDebugOverride(false);

const MockInputSourceService = GObject.registerClass({
    GTypeName: 'MockPerfInputSourceService',
    Signals: {
        'sources-changed': {},
        'current-changed': {param_types: [GObject.TYPE_INT]},
    },
}, class MockPerfInputSourceService extends GObject.Object {
    constructor() {
        super();
        this._sources = [
            {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
            {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
            {index: 2, id: 'kz', shortName: 'kz', displayName: 'Kazakh'},
        ];
        this._currentIndex = 0;
        this.activateCount = 0;
    }

    get isAvailable() { return true; }
    getSources() { return this._sources; }
    getCurrentIndex() { return this._currentIndex; }
    getCurrentSource() { return this._sources[this._currentIndex]; }

    activate(index, interactive = true) {
        this.activateCount++;
        this._currentIndex = index;
        this.emit('current-changed', index);
        return true;
    }
});

class MockWindow {
    constructor(id, appId) {
        this._id = id;
        this._appId = appId;
    }
    get_id() { return this._id; }
    get_sandboxed_app_id() { return this._appId; }
    get_gtk_application_id() { return this._appId; }
    get_wm_class() { return this._appId; }
    connect() { return 1; }
    disconnect() {}
}

const mockDisplay = {
    focus_window: null,
    connect: () => 1,
    disconnect: () => {},
};

const mockDesktopSettings = {
    get_boolean: () => false,
    connect: () => 1,
    disconnect: () => {},
};

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
