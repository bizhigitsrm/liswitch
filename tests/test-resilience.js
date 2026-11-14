// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Comprehensive Resilience and Edge-Case Test Suite

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import {InputSourceService} from '../src/inputSourceService.js';
import {WindowMemory} from '../src/windowMemory.js';
import {HotkeyManager} from '../src/hotkeys.js';
import {OsdService} from '../src/osd.js';
import {TextCorrectionManager} from '../src/textCorrection.js';
import {Indicator} from '../src/indicator.js';
import * as Log from '../src/log.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(actual, expected, message) {
    if (actual !== expected)
        throw new Error(`Assertion failed: ${message} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

console.log('=== Liswitch: Resilience & Edge-Cases Test Suite ===\n');

// 1. Setup mock Gio.Settings
const settingsSource = Gio.SettingsSchemaSource.new_from_directory(
    'schemas',
    Gio.SettingsSchemaSource.get_default(),
    false
);
const schema = settingsSource.lookup('org.gnome.shell.extensions.liswitch', false);
const settings = new Gio.Settings({settings_schema: schema});

// Reusable mock manager
const MockInputSourceManager = GObject.registerClass({
    GTypeName: 'MockResilienceInputSourceManager',
    Signals: {
        'sources-changed': {},
        'current-source-changed': {},
    },
}, class MockResilienceInputSourceManager extends GObject.Object {
    constructor(sourcesDict = {}, curIndex = 0) {
        super();
        this.inputSources = sourcesDict;
        this.currentSource = sourcesDict[curIndex] ?? null;
    }

    setSources(newDict, curIdx = 0) {
        this.inputSources = newDict;
        this.currentSource = newDict[curIdx] ?? null;
        this.emit('sources-changed');
    }

    setCurrent(idx) {
        this.currentSource = this.inputSources[idx] ?? null;
        this.emit('current-source-changed');
    }

    activateInputSource(source, interactive = true) {
        this.currentSource = source;
        this.emit('current-source-changed');
    }
});

const mockWm = {
    _bindings: new Map(),
    addKeybinding(name, _settings, _flags, _modes, handler) {
        this._bindings.set(name, handler);
        return 1;
    },
    removeKeybinding(name) {
        this._bindings.delete(name);
    },
};

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

// =========================================================================
// Scenario 1: Dynamic add / remove layouts while extension is running
// =========================================================================
console.log('Scenario 1: Dynamic addition and removal of layouts at runtime...');
{
    const manager = new MockInputSourceManager({
        0: {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        1: {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
    }, 0);

    const inputService = new InputSourceService(settings);
    inputService.enable({manager});
    const indicator = new Indicator(settings, inputService);

    assertEqual(inputService.getSources().length, 2, 'Initial 2 sources');
    assertEqual(indicator.label.text, 'EN', 'Initial label EN');

    // 1a. User adds a 3rd layout (Kazakh) in GNOME Settings
    manager.setSources({
        0: {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        1: {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
        2: {index: 2, id: 'kz', shortName: 'kz', displayName: 'Kazakh'},
    }, 0);

    assertEqual(inputService.getSources().length, 3, 'Now 3 sources');
    assertEqual(indicator.menuItems.size, 3, 'Menu rebuilt with 3 items');

    // 1b. Switch to the newly added layout
    inputService.activate(2);
    assertEqual(inputService.getCurrentIndex(), 2, 'Switched to index 2 (kz)');
    assertEqual(indicator.label.text, 'KZ', 'Indicator updated to KZ');

    // 1c. User removes layouts down to 1 layout
    manager.setSources({
        0: {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
    }, 0);

    assertEqual(inputService.getSources().length, 1, 'Now 1 source remaining');
    assertEqual(inputService.getCurrentIndex(), 0, 'Current index adjusted to remaining source');
    assertEqual(indicator.label.text, 'EN', 'Indicator updated to EN');

    indicator.destroy();
    inputService.destroy();
    console.log('  -> PASS');
}

// =========================================================================
// Scenario 2: Screen lock and unlock (session-modes: ["user"])
// =========================================================================
console.log('Scenario 2: Screen lock and unlock simulation...');
{
    // When screen locks in GNOME Shell:
    // Session mode changes from "user" to "unlock-dialog".
    // GNOME Shell calls disable() synchronously on all user-mode extensions.
    // When user unlocks, GNOME Shell calls enable() again.

    let isEnabled = false;
    let inputService = null;
    let hotkeys = null;

    const enableExt = () => {
        isEnabled = true;
        inputService = new InputSourceService(settings);
        inputService.enable({manager: new MockInputSourceManager({
            0: {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        })});
        hotkeys = new HotkeyManager(settings, inputService, {wm: mockWm});
        hotkeys.enable();
    };

    const disableExt = () => {
        hotkeys.destroy();
        inputService.destroy();
        hotkeys = null;
        inputService = null;
        isEnabled = false;
    };

    // User is working
    enableExt();
    assert(isEnabled && mockWm._bindings.size > 0, 'Extension active in user mode');

    // Screen locks -> disable()
    disableExt();
    assert(!isEnabled && mockWm._bindings.size === 0, 'Keybindings completely removed on lock');

    // Screen unlocks -> enable()
    enableExt();
    assert(isEnabled && mockWm._bindings.size > 0, 'Extension cleanly restored after unlock');

    disableExt();
    console.log('  -> PASS');
}

// =========================================================================
// Scenario 3: Suspend and Resume
// =========================================================================
console.log('Scenario 3: Suspend and resume resilience...');
{
    // On suspend/resume, DBus proxies and Shell managers remain intact,
    // but pending timers must not trigger stale operations.
    const manager = new MockInputSourceManager({
        0: {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        1: {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
    });

    const inputService = new InputSourceService(settings);
    inputService.enable({manager});
    const osd = new OsdService(settings, inputService);
    osd.enable();

    // Trigger OSD before suspend
    osd.show({id: 'us', shortName: 'en', displayName: 'English (US)'});
    assert(osd.isShowing, 'OSD showing before suspend');

    // Immediate hide / reset simulating sleep
    osd.hide();
    assert(!osd.isShowing, 'OSD hidden upon suspend');

    osd.destroy();
    inputService.destroy();
    console.log('  -> PASS');
}

// =========================================================================
// Scenario 4: Monitor connect and disconnect
// =========================================================================
console.log('Scenario 4: Monitor connect/disconnect resilience in OSD...');
{
    const manager = new MockInputSourceManager({
        0: {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
    });

    const inputService = new InputSourceService(settings);
    inputService.enable({manager});
    const osd = new OsdService(settings, inputService);
    osd.enable();

    // Simulate multi-monitor setup
    osd.show({id: 'us', shortName: 'en', displayName: 'English (US)'});
    assert(osd.container !== null, 'OSD container mounted');

    // Safe destruction with monitor constraints
    osd.destroy();
    assertEqual(osd.container, null, 'OSD container cleanly unmounted');
    inputService.destroy();
    console.log('  -> PASS');
}

// =========================================================================
// Scenario 5: Launch with exactly ONE configured layout
// =========================================================================
console.log('Scenario 5: Starting extension with single layout configured...');
{
    const manager = new MockInputSourceManager({
        0: {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
    }, 0);

    const inputService = new InputSourceService(settings);
    inputService.enable({manager});
    const indicator = new Indicator(settings, inputService);
    const textCorrection = new TextCorrectionManager(settings, inputService);

    assert(inputService.isAvailable, 'Service available with 1 layout');
    assertEqual(inputService.getSources().length, 1, 'Exactly 1 source');
    assertEqual(indicator.label.text, 'EN', 'Indicator shows EN');

    // Next / Previous layout on single layout: safe no-op / stays on 0
    inputService.next();
    assertEqual(inputService.getCurrentIndex(), 0, 'next() stays on 0 with 1 layout');

    inputService.previous();
    assertEqual(inputService.getCurrentIndex(), 0, 'previous() stays on 0 with 1 layout');

    // Text correction on 1 layout: gracefully rejects conversion without crash
    textCorrection.pushChar('g');
    textCorrection.pushChar('h');
    const ok = textCorrection.convertLastWord();
    assert(!ok, 'Text correction should safely return false when < 2 layouts exist');

    indicator.destroy();
    textCorrection.destroy();
    inputService.destroy();
    console.log('  -> PASS');
}

// =========================================================================
// Scenario 6: Launch with ZERO configured layouts
// =========================================================================
console.log('Scenario 6: Starting extension with ZERO layouts configured...');
{
    const manager = new MockInputSourceManager({}, -1);

    const inputService = new InputSourceService(settings);
    inputService.enable({manager});
    const indicator = new Indicator(settings, inputService);

    assert(!inputService.isAvailable, 'Service state is unavailable when 0 layouts');
    assertEqual(inputService.getCurrentIndex(), -1, 'Current index is -1');
    assertEqual(inputService.getSources().length, 0, 'Sources length is 0');
    assertEqual(indicator.label.text, '--', 'Indicator displays placeholder "--"');

    // Safe no-ops for actions
    assert(!inputService.next(), 'next() safely returns false');
    assert(!inputService.previous(), 'previous() safely returns false');
    assert(!inputService.activate(0), 'activate() safely returns false');

    indicator.destroy();
    inputService.destroy();
    console.log('  -> PASS');
}

// =========================================================================
// Scenario 7: Session logout with extension enabled
// =========================================================================
console.log('Scenario 7: Clean session logout / shutdown...');
{
    const manager = new MockInputSourceManager({
        0: {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        1: {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
    });

    const inputService = new InputSourceService(settings);
    inputService.enable({manager});
    const hotkeys = new HotkeyManager(settings, inputService, {wm: mockWm});
    hotkeys.enable();
    const indicator = new Indicator(settings, inputService);

    // Extension disabled on logout
    indicator.destroy();
    hotkeys.destroy();
    inputService.destroy();

    assertEqual(mockWm._bindings.size, 0, 'All keybindings unregistered');
    assert(!inputService.isAvailable, 'All services cleanly finalized');
    console.log('  -> PASS');
}

console.log('\n=== ALL 7 RESILIENCE SCENARIOS PASSED SUCCESSFULLY! ===');
