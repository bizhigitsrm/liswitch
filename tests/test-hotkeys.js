// SPDX-License-Identifier: GPL-2.0-or-later
// Unit tests for HotkeyManager and shortcut conflict resolution

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
    HotkeyManager,
    normalizeShortcut,
    isModifierOnlyShortcut,
    checkConflicts,
    freeSystemShortcut,
    restoreSystemShortcut,
    restoreAllSystemShortcuts,
    KeyBindingFlags,
    ActionMode,
} from '../src/hotkeys.js';
import {InputSourceService} from '../src/inputSourceService.js';
import * as Log from '../src/log.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`Assertion failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}. ${message}`);
    }
}

// Mock InputSourceManager for test service
class MockInputSourceManager {
    constructor() {
        this.inputSources = {
            0: {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
            1: {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
        };
        this.currentSource = this.inputSources[0];
        this._listeners = new Map();
    }

    connect(signal, callback) {
        if (!this._listeners.has(signal))
            this._listeners.set(signal, new Set());
        this._listeners.get(signal).add(callback);
        return callback;
    }

    disconnect(callback) {
        for (const set of this._listeners.values()) {
            set.delete(callback);
        }
    }

    activateInputSource(is, interactive = true) {
        this.currentSource = is;
        const listeners = this._listeners.get('current-source-changed');
        if (listeners) {
            for (const cb of Array.from(listeners))
                cb(this, is);
        }
    }
}

// Mock WindowManager simulating Main.wm
class MockWindowManager {
    constructor() {
        this.keybindings = new Map();
        this.callLog = [];
    }

    addKeybinding(name, settings, flags, modes, handler) {
        this.callLog.push({action: 'add', name, flags, modes});
        const actionId = this.keybindings.size + 1;
        this.keybindings.set(name, {settings, flags, modes, handler, actionId});
        return actionId;
    }

    removeKeybinding(name) {
        this.callLog.push({action: 'remove', name});
        return this.keybindings.delete(name);
    }

    trigger(name) {
        const binding = this.keybindings.get(name);
        if (binding && typeof binding.handler === 'function') {
            binding.handler(null, null, null, null);
            return true;
        }
        return false;
    }
}

// In-memory mock Gio.Settings
class MockSettings {
    constructor(initial = {}) {
        this._values = new Map(Object.entries(initial));
        this._listeners = new Map();
    }

    get_strv(key) {
        return this._values.get(key) ?? [];
    }

    set_strv(key, arr) {
        this._values.set(key, [...arr]);
        this._emit(`changed::${key}`);
    }

    get_string(key) {
        return this._values.get(key) ?? '';
    }

    set_string(key, str) {
        this._values.set(key, str);
        this._emit(`changed::${key}`);
    }

    connect(signal, callback) {
        if (!this._listeners.has(signal))
            this._listeners.set(signal, new Set());
        this._listeners.get(signal).add(callback);
        return callback;
    }

    disconnect(callback) {
        for (const set of this._listeners.values()) {
            set.delete(callback);
        }
    }

    _emit(signal) {
        const listeners = this._listeners.get(signal);
        if (listeners) {
            for (const cb of Array.from(listeners))
                cb();
        }
    }
}

function runTests() {
    console.log('=== Liswitch: HotkeyManager Unit Tests ===\n');

    Log.setDebugOverride(true);

    // --- Test 1: normalizeShortcut() ---
    console.log('Test 1: normalizeShortcut() modifier sorting and case normalization...');
    {
        assertEqual(normalizeShortcut('<Control><Alt>space'), '<alt><control>space');
        assertEqual(normalizeShortcut('<Alt><Control>space'), '<alt><control>space');
        assertEqual(normalizeShortcut('<Ctrl><Alt>Space'), '<alt><control>space');
        assertEqual(normalizeShortcut('<Primary><Mod1>SPACE'), '<alt><control>space');
        assertEqual(normalizeShortcut('<Super><Shift>space'), '<shift><super>space');
        assertEqual(normalizeShortcut('<Shift><Super>space'), '<shift><super>space');
        assertEqual(normalizeShortcut('<Shift><Control><Alt>space'), '<alt><control><shift>space');
        assertEqual(normalizeShortcut(''), '');
        assertEqual(normalizeShortcut('   '), '');
        console.log('  -> PASS');
    }

    // --- Test 2: isModifierOnlyShortcut() ---
    console.log('Test 2: isModifierOnlyShortcut() detection of pure modifier combinations...');
    {
        assert(isModifierOnlyShortcut('<Alt><Shift>'), 'Alt+Shift is modifier-only');
        assert(isModifierOnlyShortcut('<Alt>Shift_L'), '<Alt>Shift_L is modifier-only');
        assert(isModifierOnlyShortcut('Alt_L'), 'Alt_L is modifier-only');
        assert(isModifierOnlyShortcut('Shift_R'), 'Shift_R is modifier-only');
        assert(isModifierOnlyShortcut('Caps_Lock'), 'Caps_Lock is modifier-only');
        assert(isModifierOnlyShortcut('<Control><Shift>'), 'Control+Shift is modifier-only');

        assert(!isModifierOnlyShortcut('<Control><Alt>space'), '<Control><Alt>space is not modifier-only');
        assert(!isModifierOnlyShortcut('<Super>space'), '<Super>space is not modifier-only');
        assert(!isModifierOnlyShortcut('<Alt>1'), '<Alt>1 is not modifier-only');
        assert(!isModifierOnlyShortcut(''), 'Empty is not modifier-only');
        console.log('  -> PASS');
    }

    // --- Test 3: HotkeyManager registration and flags ---
    console.log('Test 3: HotkeyManager initialization and registration with window manager...');
    {
        const mockWm = new MockWindowManager();
        const mockManager = new MockInputSourceManager();
        const service = new InputSourceService();
        service.enable({manager: mockManager});

        const settings = new MockSettings({
            'hotkey-next': ['<Control><Alt>space'],
            'hotkey-previous': ['<Control><Alt><Shift>space'],
            'hotkey-switch-1': [],
            'hotkey-switch-2': [],
            'hotkey-switch-3': [],
            'hotkey-switch-4': [],
            'backup-system-shortcuts': '{}',
        });

        const hotkeys = new HotkeyManager(settings, service, {wm: mockWm});
        hotkeys.enable();

        assert(mockWm.keybindings.has('hotkey-next'), 'hotkey-next registered in WM');
        assert(mockWm.keybindings.has('hotkey-previous'), 'hotkey-previous registered in WM');
        assert(!mockWm.keybindings.has('hotkey-switch-1'), 'hotkey-switch-1 not registered when empty');

        const nextBinding = mockWm.keybindings.get('hotkey-next');
        assertEqual(nextBinding.flags, KeyBindingFlags.NONE, 'KeyBindingFlags.NONE passed');
        assertEqual(nextBinding.modes, ActionMode.NORMAL | ActionMode.OVERVIEW, 'Modes NORMAL | OVERVIEW passed');

        hotkeys.destroy();
        assertEqual(mockWm.keybindings.size, 0, 'All keybindings unregistered on destroy()');
        service.destroy();
        console.log('  -> PASS');
    }

    // --- Test 4: Triggering hotkeys dispatches to InputSourceService ---
    console.log('Test 4: Triggering hotkey callbacks calls InputSourceService next(), previous(), activate()...');
    {
        const mockWm = new MockWindowManager();
        const mockManager = new MockInputSourceManager();
        const service = new InputSourceService();
        service.enable({manager: mockManager});

        const settings = new MockSettings({
            'hotkey-next': ['<Control><Alt>space'],
            'hotkey-previous': ['<Control><Alt><Shift>space'],
            'hotkey-switch-1': ['<Alt>1'],
            'hotkey-switch-2': ['<Alt>2'],
            'hotkey-switch-3': [],
            'hotkey-switch-4': [],
            'backup-system-shortcuts': '{}',
        });

        const hotkeys = new HotkeyManager(settings, service, {wm: mockWm});
        hotkeys.enable();

        assertEqual(service.getCurrentIndex(), 0, 'Initial layout is 0');

        // Trigger hotkey-next
        mockWm.trigger('hotkey-next');
        assertEqual(service.getCurrentIndex(), 1, 'hotkey-next switched to index 1');

        // Trigger hotkey-previous
        mockWm.trigger('hotkey-previous');
        assertEqual(service.getCurrentIndex(), 0, 'hotkey-previous switched back to index 0');

        // Trigger direct switch 2
        mockWm.trigger('hotkey-switch-2');
        assertEqual(service.getCurrentIndex(), 1, 'hotkey-switch-2 activated index 1');

        // Trigger direct switch 1
        mockWm.trigger('hotkey-switch-1');
        assertEqual(service.getCurrentIndex(), 0, 'hotkey-switch-1 activated index 0');

        hotkeys.destroy();
        service.destroy();
        console.log('  -> PASS');
    }

    // --- Test 5: Dynamic re-binding on GSettings changed without restart ---
    console.log('Test 5: GSettings changed::hotkey-* dynamically re-registers keybindings on the fly...');
    {
        const mockWm = new MockWindowManager();
        const mockManager = new MockInputSourceManager();
        const service = new InputSourceService();
        service.enable({manager: mockManager});

        const settings = new MockSettings({
            'hotkey-next': ['<Control><Alt>space'],
            'hotkey-previous': ['<Control><Alt><Shift>space'],
            'hotkey-switch-1': [],
            'hotkey-switch-2': [],
            'hotkey-switch-3': [],
            'hotkey-switch-4': [],
            'backup-system-shortcuts': '{}',
        });

        const hotkeys = new HotkeyManager(settings, service, {wm: mockWm});
        hotkeys.enable();

        assert(!mockWm.keybindings.has('hotkey-switch-1'), 'hotkey-switch-1 initially empty');

        // Change hotkey-switch-1 to ['<Super>1']
        settings.set_strv('hotkey-switch-1', ['<Super>1']);
        assert(mockWm.keybindings.has('hotkey-switch-1'), 'hotkey-switch-1 now registered after setting change');

        // Trigger it
        service.activate(0);
        mockWm.trigger('hotkey-switch-1');
        assertEqual(service.getCurrentIndex(), 0);

        // Change to empty to disable
        settings.set_strv('hotkey-switch-1', []);
        assert(!mockWm.keybindings.has('hotkey-switch-1'), 'hotkey-switch-1 unregistered when cleared');

        hotkeys.destroy();
        service.destroy();
        console.log('  -> PASS');
    }

    // --- Test 6: Conflict detection and resolution helpers ---
    console.log('Test 6: Conflict detection against system schemas and free/restore cycle...');
    {
        // Mock system WM settings with conflicting switch-input-source: ['<Super>space']
        const mockSysWmSettings = new MockSettings({
            'switch-input-source': ['<Super>space', 'XF86Keyboard'],
            'switch-input-source-backward': ['<Shift><Super>space'],
        });

        const mockSysMediaSettings = new MockSettings({
            'screensaver': ['<Super>l'],
        });

        const mockGetSettings = schemaId => {
            if (schemaId === 'org.gnome.desktop.wm.keybindings')
                return mockSysWmSettings;
            if (schemaId === 'org.gnome.settings-daemon.plugins.media-keys')
                return mockSysMediaSettings;
            throw new Error(`Unknown schema ${schemaId}`);
        };

        const settings = new MockSettings({
            'hotkey-next': ['<Super>space'],
            'hotkey-previous': ['<Control><Alt><Shift>space'],
            'hotkey-switch-1': [],
            'hotkey-switch-2': [],
            'hotkey-switch-3': [],
            'hotkey-switch-4': [],
            'backup-system-shortcuts': '{}',
            'backup-system-switch-keys': [],
            'backup-system-switch-backward-keys': [],
        });

        const conflicts = checkConflicts(settings, {getSettings: mockGetSettings});
        console.log(`  Conflicts detected: ${conflicts.length}`);
        assert(conflicts.length > 0, 'Detected conflict for <Super>space');

        const superConf = conflicts.find(c => c.schemaKey === 'switch-input-source');
        assert(Boolean(superConf), 'Conflict found with switch-input-source');
        assertEqual(superConf.schemaId, 'org.gnome.desktop.wm.keybindings');

        // Free the shortcut
        const freed = freeSystemShortcut(superConf, settings, {getSettings: mockGetSettings});
        assert(freed, 'freeSystemShortcut succeeded');

        // Check system settings: <Super>space was removed, XF86Keyboard remains
        const newSysVals = mockSysWmSettings.get_strv('switch-input-source');
        assertEqual(newSysVals.length, 1, 'Only non-conflicting shortcut remains in system');
        assertEqual(newSysVals[0], 'XF86Keyboard');

        // Check backup was stored in Liswitch settings
        const backupStr = settings.get_string('backup-system-shortcuts');
        assert(backupStr.includes('switch-input-source'), 'Backup recorded in backup-system-shortcuts');
        const backupKeys = settings.get_strv('backup-system-switch-keys');
        assert(backupKeys.includes('<Super>space'), 'Backup recorded in backup-system-switch-keys');

        // Restore the shortcut
        const restored = restoreSystemShortcut('org.gnome.desktop.wm.keybindings', 'switch-input-source', settings, {getSettings: mockGetSettings});
        assert(restored, 'restoreSystemShortcut succeeded');

        // Check system settings restored
        const restoredSysVals = mockSysWmSettings.get_strv('switch-input-source');
        assertEqual(restoredSysVals.length, 2, 'Both shortcuts restored in system settings');
        assert(restoredSysVals.includes('<Super>space'), '<Super>space restored in system');

        const backupAfter = settings.get_string('backup-system-shortcuts');
        assertEqual(backupAfter, '{}', 'Backup cleared after restore');
        assertEqual(settings.get_strv('backup-system-switch-keys').length, 0, 'backup-system-switch-keys cleared');

        console.log('  -> PASS');
    }

    // --- Test 7: 20 cycles of enable/destroy without leaks ---
    console.log('Test 7: 20 cycles of enable() / destroy() to verify leak-free lifecycle...');
    {
        const mockWm = new MockWindowManager();
        const mockManager = new MockInputSourceManager();
        const service = new InputSourceService();
        service.enable({manager: mockManager});

        const settings = new MockSettings({
            'hotkey-next': ['<Control><Alt>space'],
            'hotkey-previous': ['<Control><Alt><Shift>space'],
            'hotkey-switch-1': ['<Alt>1'],
            'hotkey-switch-2': ['<Alt>2'],
            'hotkey-switch-3': [],
            'hotkey-switch-4': [],
            'backup-system-shortcuts': '{}',
        });

        for (let i = 1; i <= 20; i++) {
            const hotkeys = new HotkeyManager(settings, service, {wm: mockWm});
            hotkeys.enable();
            assertEqual(mockWm.keybindings.size, 4, `Cycle ${i}: 4 keybindings active`);
            hotkeys.destroy();
            assertEqual(mockWm.keybindings.size, 0, `Cycle ${i}: 0 keybindings after destroy`);
        }

        service.destroy();
        console.log('  -> PASS (20 cycles cleanly executed, no keybinding leaks)');
    }

    console.log('\n=== ALL HOTKEY TESTS PASSED SUCCESSFULLY! ===');
}

runTests();
