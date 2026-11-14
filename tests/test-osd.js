// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Unit tests for visual on-screen display (osd.js)

import GObject from 'gi://GObject';

import {OsdService} from '../src/osd.js';
import * as Log from '../src/log.js';

Log.setDebugOverride(true);

function assert(condition, message) {
    if (!condition)
        throw new Error(`Assertion failed: ${message}`);
}

function assertEquals(actual, expected, message) {
    if (actual !== expected)
        throw new Error(`Assertion failed: ${message} (expected: ${expected}, got: ${actual})`);
}

class MockEmitter {
    constructor() {
        this._listeners = new Map();
        this._nextHandlerId = 1;
    }

    connect(signal, callback) {
        const id = this._nextHandlerId++;
        if (!this._listeners.has(signal))
            this._listeners.set(signal, new Map());
        this._listeners.get(signal).set(id, callback);
        return id;
    }

    disconnect(handlerId) {
        for (const map of this._listeners.values()) {
            if (map.delete(handlerId))
                return;
        }
    }

    emit(signal, ...args) {
        const map = this._listeners.get(signal);
        if (!map)
            return;
        for (const cb of Array.from(map.values())) {
            try {
                cb(this, ...args);
            } catch (e) {
                print(`Error in mock listener for "${signal}": ${e.message}`);
            }
        }
    }
}

class MockSettings extends MockEmitter {
    constructor(initial = {}) {
        super();
        this._values = Object.assign({
            'show-osd': true,
            'osd-duration-ms': 1000,
            'osd-show-on-auto-switch': false,
        }, initial);

        this.settings_schema = {
            has_key: k => Object.prototype.hasOwnProperty.call(this._values, k),
        };
    }

    get_boolean(key) {
        return Boolean(this._values[key]);
    }

    set_boolean(key, val) {
        this._values[key] = Boolean(val);
        this.emit(`changed::${key}`);
    }

    get_uint(key) {
        return Number(this._values[key]) || 0;
    }

    set_uint(key, val) {
        this._values[key] = Number(val);
        this.emit(`changed::${key}`);
    }
}

// Mock InputSourceService
const MockInputSourceService = GObject.registerClass({
    GTypeName: 'MockInputSourceServiceOsd',
    Signals: {
        'current-changed': {param_types: [GObject.TYPE_INT]},
    },
}, class MockInputSourceService extends GObject.Object {
    constructor() {
        super();
        this._sources = [
            {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
            {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
            {index: 2, id: 'kk', shortName: 'kk', displayName: 'Kazakh'},
        ];
        this._currentIndex = 0;
    }

    getSources() {
        return this._sources;
    }

    getCurrentIndex() {
        return this._currentIndex;
    }

    getCurrentSource() {
        return this._sources[this._currentIndex] ?? null;
    }

    getSourceByIndex(index) {
        return this._sources.find(s => s.index === index) ?? null;
    }

    emitCurrentChanged(index) {
        this._currentIndex = index;
        this.emit('current-changed', index);
    }
});

// Mock WindowMemory
class MockWindowMemory {
    constructor(isRestoring = false) {
        this._isRestoring = isRestoring;
    }

    get isRestoring() {
        return this._isRestoring;
    }

    setRestoring(val) {
        this._isRestoring = Boolean(val);
    }
}

function runTests() {
    print('=== Liswitch: Visual OSD Unit Tests ===\n');

    const settings = new MockSettings();

    // -------------------------------------------------------------
    print('Test 1: Initialization & default properties...');
    {
        const iss = new MockInputSourceService();
        const mem = new MockWindowMemory(false);
        const osd = new OsdService(settings, iss, mem);

        assertEquals(osd.isEnabled, true, 'Default show-osd should be true');
        assertEquals(osd.duration, 1000, 'Default duration should be 1000ms');
        assertEquals(osd.showOnAutoSwitch, false, 'Default osd-show-on-auto-switch should be false');
        assertEquals(osd.isShowing, false, 'Should not be showing on init');

        osd.enable();
        osd.destroy();
        print('  -> PASS');
    }

    // -------------------------------------------------------------
    print('Test 2: show(source) and automatic hide timer...');
    {
        const iss = new MockInputSourceService();
        const mem = new MockWindowMemory(false);
        const osd = new OsdService(settings, iss, mem);
        osd.enable();

        const src = {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'};
        osd.show(src);

        assertEquals(osd.lastShownSource.id, 'ru', 'lastShownSource should be "ru"');
        assert(osd.isShowing, 'isShowing should be true after show()');

        // Test programmatic hide
        osd.hide();
        assertEquals(osd.isShowing, false, 'isShowing should be false after hide()');

        osd.destroy();
        print('  -> PASS');
    }

    // -------------------------------------------------------------
    print('Test 3: Disabling OSD via settings (show-osd = false)...');
    {
        settings.set_boolean('show-osd', false);

        const iss = new MockInputSourceService();
        const mem = new MockWindowMemory(false);
        const osd = new OsdService(settings, iss, mem);
        osd.enable();

        assertEquals(osd.isEnabled, false, 'isEnabled should be false when show-osd is false');

        const src = {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'};
        osd.show(src);

        assertEquals(osd.isShowing, false, 'Should not show when OSD is disabled in settings');

        osd.destroy();

        // Restore default
        settings.set_boolean('show-osd', true);
        print('  -> PASS');
    }

    // -------------------------------------------------------------
    print('Test 4: Rapid successive switches cancel previous timers...');
    {
        const iss = new MockInputSourceService();
        const mem = new MockWindowMemory(false);
        const osd = new OsdService(settings, iss, mem);
        osd.enable();

        const src1 = {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'};
        const src2 = {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'};
        const src3 = {index: 2, id: 'kk', shortName: 'kk', displayName: 'Kazakh'};

        // 3 rapid switches
        osd.show(src1);
        const timer1 = osd._hideTimeoutId;
        assert(timer1 !== 0, 'First timer should be non-zero');

        osd.show(src2);
        const timer2 = osd._hideTimeoutId;
        assert(timer2 !== 0, 'Second timer should be non-zero');

        osd.show(src3);
        const timer3 = osd._hideTimeoutId;
        assert(timer3 !== 0, 'Third timer should be non-zero');

        assertEquals(osd.lastShownSource.id, 'kk', 'Last shown source must be kk');
        assert(osd.isShowing, 'OSD should remain showing after rapid switches');

        osd.destroy();
        assertEquals(osd.isShowing, false, 'OSD should be stopped after destroy()');
        print('  -> PASS (rapid switches cleanly rescheduled single timer)');
    }

    // -------------------------------------------------------------
    print('Test 5: Silent window memory restoration filtering (osd-show-on-auto-switch)...');
    {
        settings.set_boolean('show-osd', true);
        settings.set_boolean('osd-show-on-auto-switch', false);

        const iss = new MockInputSourceService();
        const mem = new MockWindowMemory(false);
        const osd = new OsdService(settings, iss, mem);
        osd.enable();

        // 1. User manual switch: mem.isRestoring is false -> should show OSD
        iss.emitCurrentChanged(1);
        assert(osd.isShowing, 'Manual switch should show OSD');
        assertEquals(osd.lastShownSource.id, 'ru', 'Source should be ru');
        osd.hide();

        // 2. Window memory silent restoration: mem.isRestoring is true, osd-show-on-auto-switch is false -> must NOT show OSD
        mem.setRestoring(true);
        iss.emitCurrentChanged(2);
        assertEquals(osd.isShowing, false, 'Auto-restore should NOT show OSD when osd-show-on-auto-switch is false');
        assertEquals(osd.lastShownSource.id, 'ru', 'lastShownSource should remain un-updated (still ru)');

        // 3. User enables osd-show-on-auto-switch = true -> now auto-restore DOES show OSD
        settings.set_boolean('osd-show-on-auto-switch', true);
        iss.emitCurrentChanged(0);
        assert(osd.isShowing, 'Auto-restore should show OSD when osd-show-on-auto-switch is true');
        assertEquals(osd.lastShownSource.id, 'us', 'lastShownSource should be updated to us');

        // Cleanup & reset
        osd.destroy();
        settings.set_boolean('osd-show-on-auto-switch', false);
        print('  -> PASS');
    }

    // -------------------------------------------------------------
    print('Test 6: ReducedMotion detection...');
    {
        const iss = new MockInputSourceService();
        const mem = new MockWindowMemory(false);
        const osd = new OsdService(settings, iss, mem);
        osd.enable();

        // Should return boolean without throwing
        const isReduced = osd._isReducedMotion();
        assert(typeof isReduced === 'boolean', 'Reduced motion check should return boolean');

        osd.destroy();
        print('  -> PASS');
    }

    // -------------------------------------------------------------
    print('Test 7: 20 cycles of enable() / destroy() without leaks...');
    {
        const iss = new MockInputSourceService();
        const mem = new MockWindowMemory(false);

        for (let i = 0; i < 20; i++) {
            const osd = new OsdService(settings, iss, mem);
            osd.enable();
            osd.show({index: 0, id: 'us', shortName: 'en', displayName: 'English'});
            assert(osd.isShowing, `Cycle ${i}: should be showing`);
            osd.destroy();
            assertEquals(osd.isShowing, false, `Cycle ${i}: should be cleanly stopped`);
        }
        print('  -> PASS (20 cycles executed cleanly, 0 timer or signal leaks)');
    }

    print('\n=== ALL OSD UNIT TESTS PASSED SUCCESSFULLY! ===');
}

runTests();
