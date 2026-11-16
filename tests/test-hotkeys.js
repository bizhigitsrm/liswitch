// SPDX-License-Identifier: GPL-2.0-or-later
// Unit tests for HotkeyManager and shortcut conflict resolution

import {
    HotkeyManager,
    HOTKEY_KEYS,
    normalizeShortcut,
    isModifierOnlyShortcut,
    findDuplicateHotkeyKey,
    checkConflicts,
    freeSystemShortcut,
    restoreSystemShortcut,
    restoreAllSystemShortcuts,
    reapplyFreedSystemShortcuts,
    cleanupUnusedSystemOverrides,
    KeyBindingFlags,
    ActionMode,
} from '../src/hotkeys.js';
import {InputSourceService} from '../src/inputSourceService.js';
import * as Log from '../src/log.js';
import {
    assert,
    assertEqual,
    MockInputSourceManager,
    MockWindowManager,
    MockSettings,
} from './helpers.js';

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

    // --- Test 8: Screen lock / unlock preserves user-freed system shortcuts ---
    console.log('Test 8: Lock/unlock (destroy -> enable) restores system shortcut on lock and re-frees on unlock...');
    {
        const mockWm = new MockWindowManager();
        const mockManager = new MockInputSourceManager();
        const service = new InputSourceService();
        service.enable({manager: mockManager});

        const mockSysWmSettings = new MockSettings({
            'switch-input-source': ['<Super>space', 'XF86Keyboard'],
            'switch-input-source-backward': ['<Shift><Super>space'],
        });
        const mockSysMediaSettings = new MockSettings({});
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
            'freed-system-shortcuts': '{}',
        });

        // 1. User frees <Super>space in prefs
        const conflicts = checkConflicts(settings, {getSettings: mockGetSettings});
        const superConf = conflicts.find(c => c.schemaKey === 'switch-input-source');
        assert(Boolean(superConf), 'Conflict detected initially');
        assert(freeSystemShortcut(superConf, settings, {getSettings: mockGetSettings}), 'Shortcut freed');
        assertEqual(mockSysWmSettings.get_strv('switch-input-source').length, 1, 'System has only XF86Keyboard');

        // 2. Enable HotkeyManager
        const hotkeys1 = new HotkeyManager(settings, service, {wm: mockWm, getSettings: mockGetSettings});
        hotkeys1.enable();
        assert(mockWm.keybindings.has('hotkey-next'), 'hotkey-next bound');

        // 3. Screen lock -> destroy() (must restore system shortcut per E.G.O rules, keeping intent)
        hotkeys1.destroy();
        assertEqual(mockWm.keybindings.size, 0, 'All WM keybindings removed on lock');
        const duringLock = mockSysWmSettings.get_strv('switch-input-source');
        assertEqual(duringLock.length, 2, 'System switch-input-source restored during lock');
        assert(duringLock.includes('<Super>space'), '<Super>space restored to system during lock');
        assertEqual(settings.get_string('backup-system-shortcuts'), '{}', 'Backup cleared while disabled');
        assert(settings.get_string('freed-system-shortcuts').includes('switch-input-source'), 'User override intent preserved');

        // 4. Screen unlock -> enable() (must automatically re-free <Super>space!)
        const hotkeys2 = new HotkeyManager(settings, service, {wm: mockWm, getSettings: mockGetSettings});
        hotkeys2.enable();
        const afterUnlock = mockSysWmSettings.get_strv('switch-input-source');
        assertEqual(afterUnlock.length, 1, 'System <Super>space re-freed on unlock');
        assertEqual(afterUnlock[0], 'XF86Keyboard', 'Only XF86Keyboard remains in system after unlock');
        assert(settings.get_string('backup-system-shortcuts').includes('switch-input-source'), 'Backup recreated on unlock');
        assert(mockWm.keybindings.has('hotkey-next'), 'hotkey-next bound after unlock');

        // 5. Explicit user restore in prefs -> clears intent
        assert(restoreSystemShortcut('org.gnome.desktop.wm.keybindings', 'switch-input-source', settings, {getSettings: mockGetSettings}), 'Explicit restore succeeded');
        assertEqual(settings.get_string('freed-system-shortcuts'), '{}', 'User override intent cleared on explicit restore');

        // 6. Next lock/unlock must NOT steal <Super>space back
        hotkeys2.destroy();
        const hotkeys3 = new HotkeyManager(settings, service, {wm: mockWm, getSettings: mockGetSettings});
        hotkeys3.enable();
        assertEqual(mockSysWmSettings.get_strv('switch-input-source').length, 2, '<Super>space stays with system after explicit restore');

        hotkeys3.destroy();
        service.destroy();
        console.log('  -> PASS');
    }

    // --- Test 9: cleanupUnusedSystemOverrides when user changes hotkey ---
    console.log('Test 9: cleanupUnusedSystemOverrides restores backup and clears intent when hotkey changes...');
    {
        const mockSysWmSettings = new MockSettings({
            'switch-input-source': ['<Super>space'],
        });
        const mockSysMediaSettings = new MockSettings({});
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
            'freed-system-shortcuts': '{}',
        });

        const conflicts = checkConflicts(settings, {getSettings: mockGetSettings});
        freeSystemShortcut(conflicts[0], settings, {getSettings: mockGetSettings});
        assertEqual(mockSysWmSettings.get_strv('switch-input-source').length, 0, 'System shortcut freed');

        // User changes hotkey-next back to default <Control><Alt>space
        settings.set_strv('hotkey-next', ['<Control><Alt>space']);
        const cleaned = cleanupUnusedSystemOverrides(settings, {getSettings: mockGetSettings});
        assertEqual(cleaned, 1, 'Cleaned up 1 unused override');
        assertEqual(mockSysWmSettings.get_strv('switch-input-source')[0], '<Super>space', 'System shortcut restored');
        assertEqual(settings.get_string('freed-system-shortcuts'), '{}', 'Intent map cleared');
        assertEqual(settings.get_string('backup-system-shortcuts'), '{}', 'Backup map cleared');
        console.log('  -> PASS');
    }

    // --- Test 10: convert-hotkey included in HOTKEY_KEYS, checkConflicts, cleanup, and duplicate detection ---
    console.log('Test 10: convert-hotkey conflict checking, override cleanup, and duplicate detection...');
    {
        assert(HOTKEY_KEYS.includes('convert-hotkey'), 'HOTKEY_KEYS must include convert-hotkey');

        const mockSysWmSettings = new MockSettings({
            'switch-input-source': ['<Super>space'],
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
            'hotkey-next': ['<Control><Alt>space'],
            'hotkey-previous': ['<Control><Alt><Shift>space'],
            'hotkey-switch-1': [],
            'hotkey-switch-2': [],
            'hotkey-switch-3': [],
            'hotkey-switch-4': [],
            'convert-hotkey': ['<Super>l'],
            'backup-system-shortcuts': '{}',
            'freed-system-shortcuts': '{}',
        });

        const conflicts = checkConflicts(settings, {getSettings: mockGetSettings});
        const convertConflict = conflicts.find(c => c.hotkeyKey === 'convert-hotkey');
        assert(Boolean(convertConflict), 'Conflict detected for convert-hotkey against media-keys screensaver');
        assertEqual(convertConflict.schemaKey, 'screensaver');

        assert(freeSystemShortcut(convertConflict, settings, {getSettings: mockGetSettings}), 'Freed system shortcut for convert-hotkey');
        assertEqual(mockSysMediaSettings.get_strv('screensaver').length, 0, 'System screensaver cleared');

        // While convert-hotkey still uses <Super>l, cleanupUnusedSystemOverrides must keep it freed
        assertEqual(cleanupUnusedSystemOverrides(settings, {getSettings: mockGetSettings}), 0, 'Override kept while convert-hotkey still uses <Super>l');

        // Duplicate detection between convert-hotkey and switching hotkeys
        assertEqual(
            findDuplicateHotkeyKey(settings, 'hotkey-switch-1', '<Mod4>L'),
            'convert-hotkey',
            'Normalized duplicate against convert-hotkey detected'
        );
        assertEqual(
            findDuplicateHotkeyKey(settings, 'convert-hotkey', '<Ctrl><Alt>space'),
            'hotkey-next',
            'Normalized duplicate against hotkey-next detected from convert-hotkey'
        );
        assertEqual(
            findDuplicateHotkeyKey(settings, 'convert-hotkey', '<Super>l'),
            null,
            'Same key is excluded from duplicate check'
        );

        // Changing convert-hotkey restores the unused system override
        settings.set_strv('convert-hotkey', ['<Shift>Pause']);
        assertEqual(cleanupUnusedSystemOverrides(settings, {getSettings: mockGetSettings}), 1, 'Unused override restored after convert-hotkey changed');
        assertEqual(mockSysMediaSettings.get_strv('screensaver')[0], '<Super>l', 'System screensaver restored');

        // HotkeyManager must NOT register convert-hotkey in WM directly (owned by TextCorrectionManager)
        const mockWm = new MockWindowManager();
        const mockManager = new MockInputSourceManager();
        const service = new InputSourceService();
        service.enable({manager: mockManager});
        const hotkeys = new HotkeyManager(settings, service, {wm: mockWm, getSettings: mockGetSettings});
        hotkeys.enable();
        assert(!mockWm.keybindings.has('convert-hotkey'), 'HotkeyManager must not bind convert-hotkey');
        hotkeys.destroy();
        service.destroy();
        console.log('  -> PASS');
    }

    console.log('\n=== ALL HOTKEY TESTS PASSED SUCCESSFULLY! ===');
}

runTests();
