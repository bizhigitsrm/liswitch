// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Unit tests for indicator.js

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import {
    Indicator,
    formatLayoutLabel,
    getAccessibleLayoutLabel,
} from '../src/indicator.js';
import {InputSourceService} from '../src/inputSourceService.js';
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

// Mock InputSourceManager matching GNOME Shell 51
const MockInputSource = GObject.registerClass({
    GTypeName: 'MockInputSourceIndicator',
    Signals: {
        'activate': {param_types: [GObject.TYPE_BOOLEAN]},
        'changed': {},
    },
}, class MockInputSource extends GObject.Object {
    constructor(id, displayName, shortName, index, manager = null) {
        super();
        this.id = id;
        this.displayName = displayName;
        this.shortName = shortName;
        this.index = index;
        this._manager = manager;
    }

    activate(interactive = true) {
        if (this._manager)
            this._manager.activateInputSource(this, interactive);
        this.emit('activate', interactive);
    }
});

const MockInputSourceManager = GObject.registerClass({
    GTypeName: 'MockInputSourceManagerIndicator',
    Signals: {
        'sources-changed': {},
        'current-source-changed': {},
    },
}, class MockInputSourceManager extends GObject.Object {
    constructor(sourceSpecs = []) {
        super();
        this._sources = {};
        for (const s of sourceSpecs) {
            if (s instanceof MockInputSource) {
                s._manager = this;
                this._sources[s.index] = s;
            } else {
                const is = new MockInputSource(s.id, s.displayName, s.shortName, s.index, this);
                this._sources[s.index] = is;
            }
        }
        this._current = this._sources[0] ?? null;
    }

    get inputSources() {
        return this._sources;
    }

    get currentSource() {
        return this._current;
    }

    activateInputSource(source, interactive = true) {
        this._current = source;
        this.emit('current-source-changed');
    }
});

// Mock Gio.Settings backed by in-memory key-value dictionary
const MockSettings = GObject.registerClass({
    GTypeName: 'MockSettingsIndicator',
    Signals: {
        'changed': {
            flags: GObject.SignalFlags.RUN_LAST | GObject.SignalFlags.DETAILED,
            param_types: [GObject.TYPE_STRING],
        },
    },
}, class MockSettings extends GObject.Object {
    constructor(initial = {}) {
        super();
        this._data = {
            'indicator-enabled': true,
            'hide-system-indicator': false,
            'indicator-format': 'short',
            'scroll-switch': true,
            ...initial,
        };
    }

    get_boolean(key) {
        return Boolean(this._data[key]);
    }

    set_boolean(key, val) {
        this._data[key] = Boolean(val);
        this.emit(`changed::${key}`, key);
        this.emit('changed', key);
    }

    get_string(key) {
        return String(this._data[key] ?? '');
    }

    set_string(key, val) {
        this._data[key] = String(val);
        this.emit(`changed::${key}`, key);
        this.emit('changed', key);
    }
});

console.log('=== Liswitch: Indicator Unit Tests ===\n');

// ---------------------------------------------------------
console.log('Test 1: formatLayoutLabel and getAccessibleLayoutLabel formatting...');
{
    const sourceUs = {id: 'us', shortName: 'en', displayName: 'English (US)'};
    const sourceRu = {id: 'ru', shortName: 'ru', displayName: 'Russian'};
    const sourceNoShort = {id: 'de', shortName: '', displayName: 'German'};

    assertEquals(formatLayoutLabel(sourceUs, 'short'), 'EN', 'Default/short uppercase format');
    assertEquals(formatLayoutLabel(sourceRu, 'short'), 'RU', 'Default/short uppercase format RU');
    assertEquals(formatLayoutLabel(sourceUs, 'lowercase'), 'en', 'Lowercase format');
    assertEquals(formatLayoutLabel(sourceUs, 'full'), 'English (US)', 'Full format');
    assertEquals(formatLayoutLabel(sourceNoShort, 'short'), 'DE', 'Fallback shortName from id');
    assertEquals(formatLayoutLabel(null, 'short'), '--', 'Null source produces fallback placeholder');

    assert(getAccessibleLayoutLabel(sourceUs).includes('English (US)'), 'Accessible name contains displayName');
    assert(getAccessibleLayoutLabel(null).includes('none configured'), 'Accessible name for null source');
    console.log('  -> PASS');
}

// ---------------------------------------------------------
console.log('Test 2: Indicator initialization, label and menu state...');
{
    const sources = [
        new MockInputSource('us', 'English (US)', 'en', 0),
        new MockInputSource('ru', 'Russian', 'ru', 1),
    ];
    const mockManager = new MockInputSourceManager(sources);
    const service = new InputSourceService();
    service.enable({manager: mockManager});

    const settings = new MockSettings();
    let prefsOpened = false;

    const indicator = new Indicator(settings, service, () => {
        prefsOpened = true;
    });

    assertEquals(indicator.label.text, 'EN', 'Initial label matches active source');
    assertEquals(indicator.menuItems.size, 2, 'Menu has 2 layout items');
    assertEquals(indicator.menuItems.get(0).ornament, 1, 'Source 0 is active (DOT ornament)');
    assertEquals(indicator.menuItems.get(1).ornament, 4, 'Source 1 is inactive (NO_DOT ornament)');

    indicator.destroy();
    service.destroy();
    console.log('  -> PASS');
}

// ---------------------------------------------------------
console.log('Test 3: Layout switching updates label and menu dot ornament...');
{
    const sources = [
        new MockInputSource('us', 'English (US)', 'en', 0),
        new MockInputSource('ru', 'Russian', 'ru', 1),
    ];
    const mockManager = new MockInputSourceManager(sources);
    const service = new InputSourceService();
    service.enable({manager: mockManager});

    const settings = new MockSettings();
    const indicator = new Indicator(settings, service);

    assertEquals(indicator.label.text, 'EN', 'Before switch: EN');
    assertEquals(indicator.menuItems.get(0).ornament, 1, 'Before switch: index 0 is active');

    // Switch to Russian
    service.activate(1);
    assertEquals(indicator.label.text, 'RU', 'After switch: RU');
    assertEquals(indicator.menuItems.get(0).ornament, 4, 'Index 0 is inactive');
    assertEquals(indicator.menuItems.get(1).ornament, 1, 'Index 1 is active');

    indicator.destroy();
    service.destroy();
    console.log('  -> PASS');
}

// ---------------------------------------------------------
console.log('Test 4: GSettings indicator-format changes update label dynamically...');
{
    const sources = [
        new MockInputSource('us', 'English (US)', 'en', 0),
    ];
    const mockManager = new MockInputSourceManager(sources);
    const service = new InputSourceService();
    service.enable({manager: mockManager});

    const settings = new MockSettings({ 'indicator-format': 'short' });
    const indicator = new Indicator(settings, service);

    assertEquals(indicator.label.text, 'EN', 'Format short: EN');

    settings.set_string('indicator-format', 'lowercase');
    assertEquals(indicator.label.text, 'en', 'Format lowercase: en');

    settings.set_string('indicator-format', 'full');
    assertEquals(indicator.label.text, 'English (US)', 'Format full: English (US)');

    indicator.destroy();
    service.destroy();
    console.log('  -> PASS');
}

// ---------------------------------------------------------
console.log('Test 5: Mouse scroll switches layout (UP/DOWN/SMOOTH)...');
{
    const sources = [
        new MockInputSource('us', 'English (US)', 'en', 0),
        new MockInputSource('ru', 'Russian', 'ru', 1),
    ];
    const mockManager = new MockInputSourceManager(sources);
    const service = new InputSourceService();
    service.enable({manager: mockManager});

    const settings = new MockSettings({ 'scroll-switch': true });
    const indicator = new Indicator(settings, service);

    // Mock scroll event: DOWN -> next()
    const scrollDownEvent = {
        get_scroll_direction: () => Clutter.ScrollDirection.DOWN,
    };
    const res1 = indicator.handleScroll(scrollDownEvent);
    assertEquals(res1, Clutter.EVENT_STOP, 'Scroll event handled and stopped');
    assertEquals(service.getCurrentIndex(), 1, 'Switched to next layout (index 1)');

    // Mock scroll event: UP -> previous()
    const scrollUpEvent = {
        get_scroll_direction: () => Clutter.ScrollDirection.UP,
    };
    const res2 = indicator.handleScroll(scrollUpEvent);
    assertEquals(res2, Clutter.EVENT_STOP, 'Scroll event handled and stopped');
    assertEquals(service.getCurrentIndex(), 0, 'Switched to previous layout (index 0)');

    // Mock smooth scroll: dy > 0.2 -> next()
    const smoothDownEvent = {
        get_scroll_direction: () => Clutter.ScrollDirection.SMOOTH,
        get_scroll_delta: () => [0, 0.5],
    };
    const res3 = indicator.handleScroll(smoothDownEvent);
    assertEquals(res3, Clutter.EVENT_STOP, 'Smooth scroll down handled');
    assertEquals(service.getCurrentIndex(), 1, 'Switched to next layout (index 1)');

    // Disable scroll switch in settings
    settings.set_boolean('scroll-switch', false);
    const res4 = indicator.handleScroll(scrollDownEvent);
    assertEquals(res4, Clutter.EVENT_PROPAGATE, 'Disabled scroll propagates');
    assertEquals(service.getCurrentIndex(), 1, 'Layout did not change when scroll-switch is false');

    indicator.destroy();
    service.destroy();
    console.log('  -> PASS');
}

// ---------------------------------------------------------
console.log('Test 6: sources-changed dynamically updates menu...');
{
    const initialSources = [
        new MockInputSource('us', 'English (US)', 'en', 0),
    ];
    const mockManager = new MockInputSourceManager(initialSources);
    const service = new InputSourceService();
    service.enable({manager: mockManager});

    const settings = new MockSettings();
    const indicator = new Indicator(settings, service);

    assertEquals(indicator.menuItems.size, 1, 'Initially 1 layout in menu');

    // Dynamically add a second layout
    const newSpecs = [
        {id: 'us', displayName: 'English (US)', shortName: 'en', index: 0},
        {id: 'kz', displayName: 'Kazakh', shortName: 'kk', index: 1},
    ];
    mockManager._sources = {};
    for (const s of newSpecs)
        mockManager._sources[s.index] = new MockInputSource(s.id, s.displayName, s.shortName, s.index, mockManager);
    mockManager.emit('sources-changed');

    assertEquals(indicator.menuItems.size, 2, 'Menu rebuilt with 2 layouts after sources-changed');
    assertEquals(indicator.label.text, 'EN', 'Current layout preserved');

    indicator.destroy();
    service.destroy();
    console.log('  -> PASS');
}

// ---------------------------------------------------------
console.log('Test 7: 20 cycles of create/destroy to verify leak-free cleanup...');
{
    const sources = [
        new MockInputSource('us', 'English (US)', 'en', 0),
        new MockInputSource('ru', 'Russian', 'ru', 1),
    ];
    const mockManager = new MockInputSourceManager(sources);
    const service = new InputSourceService();
    service.enable({manager: mockManager});
    const settings = new MockSettings();

    for (let i = 1; i <= 20; i++) {
        const ind = new Indicator(settings, service);
        assertEquals(ind.label.text, 'EN', `Iteration ${i}: label initialized`);
        ind.destroy();
        assertEquals(ind.label, null, `Iteration ${i}: label nullified`);
        assertEquals(ind.menuItems.size, 0, `Iteration ${i}: menu items cleared`);
    }

    service.destroy();
    console.log('  -> PASS (20 cycles cleanly executed, all resources released)');
}

console.log('\n=== ALL INDICATOR TESTS PASSED SUCCESSFULLY! ===');
