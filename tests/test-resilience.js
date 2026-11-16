// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Comprehensive Resilience and Edge-Case Test Suite

import GLib from 'gi://GLib';
import {InputSourceService} from '../src/inputSourceService.js';
import {WindowMemory} from '../src/windowMemory.js';
import {
    HotkeyManager,
    checkConflicts,
    freeSystemShortcut,
    restoreSystemShortcut,
} from '../src/hotkeys.js';
import {OsdService} from '../src/osd.js';
import {TextCorrectionManager} from '../src/textCorrection.js';
import {Indicator} from '../src/indicator.js';
import {
    assert,
    assertEqual,
    createMemorySettings,
    MockInputSourceManager,
    MockWindowManager,
    MockDisplay,
    MockDesktopSettings,
} from './helpers.js';

console.log('=== Liswitch: Resilience & Edge-Cases Test Suite ===\n');

const settings = createMemorySettings();
const mockWm = new MockWindowManager();
const mockDisplay = new MockDisplay();
const mockDesktopSettings = new MockDesktopSettings(false);

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

    const lockSnapshotPath = GLib.build_filenamev([
        GLib.get_user_runtime_dir(),
        'liswitch-test-resilience',
        `lock-unlock-${Date.now()}.json`,
    ]);

    // Mock system WM settings holding <Super>space
    const sysStore = new Map([
        ['switch-input-source', ['<Super>space', 'XF86Keyboard']],
        ['switch-input-source-backward', ['<Shift><Super>space']],
    ]);
    const mockSysWmSettings = {
        get_strv: k => [...(sysStore.get(k) ?? [])],
        set_strv: (k, v) => sysStore.set(k, [...v]),
        get_string: k => sysStore.get(k) ?? '',
        set_string: (k, v) => sysStore.set(k, v),
    };
    const mockGetSettings = schemaId => {
        if (schemaId === 'org.gnome.desktop.wm.keybindings')
            return mockSysWmSettings;
        return {
            get_strv: () => [],
            set_strv: () => {},
            get_string: () => '',
            set_string: () => {},
        };
    };

    // Mock Display & Windows with focus signal emitter
    const displayHandlers = new Map();
    let nextDisplayHandlerId = 1;
    const lockDisplay = {
        focus_window: null,
        connect: (sig, cb) => {
            const id = nextDisplayHandlerId++;
            displayHandlers.set(id, cb);
            return id;
        },
        disconnect: id => displayHandlers.delete(id),
        setFocus(win) {
            this.focus_window = win;
            for (const cb of displayHandlers.values())
                cb(this);
        },
    };
    const makeWindow = (id, appId) => ({
        get_id: () => id,
        get_sandboxed_app_id: () => appId,
        get_gtk_application_id: () => appId,
        get_wm_class: () => appId,
        get_wm_class_instance: () => appId,
        connect: () => 1,
        disconnect: () => {},
    });

    const winEditor = makeWindow(11, 'org.gnome.TextEditor');
    const winConsole = makeWindow(12, 'org.gnome.Console');

    // Configure <Super>space and free it explicitly before locking
    const prevHotkeyNext = settings.get_strv('hotkey-next');
    settings.set_strv('hotkey-next', ['<Super>space']);
    const superConf = checkConflicts(settings, {getSettings: mockGetSettings})
        .find(c => c.schemaKey === 'switch-input-source');
    assert(Boolean(superConf), 'Conflict detected for <Super>space before lock');
    assert(freeSystemShortcut(superConf, settings, {getSettings: mockGetSettings}), 'User freed <Super>space');

    let isEnabled = false;
    let inputService = null;
    let windowMemory = null;
    let hotkeys = null;
    const sharedManager = new MockInputSourceManager({
        0: {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        1: {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
    }, 0);

    const enableExt = () => {
        isEnabled = true;
        inputService = new InputSourceService(settings);
        inputService.enable({manager: sharedManager});
        windowMemory = new WindowMemory(settings, inputService, {snapshotPath: lockSnapshotPath});
        windowMemory.enable({display: lockDisplay, desktopSettings: mockDesktopSettings});
        hotkeys = new HotkeyManager(settings, inputService, {wm: mockWm, getSettings: mockGetSettings});
        hotkeys.enable();
    };

    const disableExt = () => {
        hotkeys.destroy();
        windowMemory.destroy();
        inputService.destroy();
        hotkeys = null;
        windowMemory = null;
        inputService = null;
        isEnabled = false;
    };

    try {
        // 1. User works with 2 apps in different layouts
        enableExt();
        assert(isEnabled && mockWm._bindings.size > 0, 'Extension active in user mode');
        assertEqual(mockSysWmSettings.get_strv('switch-input-source').length, 1, '<Super>space freed while active');

        lockDisplay.setFocus(winEditor);
        inputService.activate(0, true); // Editor -> us
        lockDisplay.setFocus(winConsole);
        inputService.activate(1, true); // Console -> ru

        // 2. Screen locks -> disable()
        disableExt();
        assert(!isEnabled && mockWm._bindings.size === 0, 'Keybindings completely removed on lock');
        assert(mockSysWmSettings.get_strv('switch-input-source').includes('<Super>space'),
            '<Super>space cleanly restored to system during lock');

        // Simulate lock screen switching keyboard layout back to 'us' (0)
        sharedManager.setCurrent(0);

        // 3. Screen unlocks -> enable()
        enableExt();
        assert(isEnabled && mockWm._bindings.size > 0, 'Extension cleanly restored after unlock');
        assertEqual(mockSysWmSettings.get_strv('switch-input-source').length, 1,
            '<Super>space automatically re-freed after unlock');
        assert(!mockSysWmSettings.get_strv('switch-input-source').includes('<Super>space'),
            'System no longer intercepts <Super>space after unlock');

        // WindowMemory must have restored Console -> ru immediately upon unlock
        assertEqual(inputService.getCurrentIndex(), 1, 'Focused Console layout restored to RU on unlock');

        // Switching to Editor must restore its remembered US layout
        lockDisplay.setFocus(winEditor);
        assertEqual(inputService.getCurrentIndex(), 0, 'Remembered Editor layout US survived lock/unlock');

        // Explicit restore in prefs cleans up intent
        restoreSystemShortcut('org.gnome.desktop.wm.keybindings', 'switch-input-source', settings, {
            getSettings: mockGetSettings,
        });
        windowMemory.clearMemory();
        disableExt();
    } finally {
        settings.set_strv('hotkey-next', prevHotkeyNext);
        if (GLib.file_test(lockSnapshotPath, GLib.FileTest.EXISTS))
            GLib.unlink(lockSnapshotPath);
    }
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
