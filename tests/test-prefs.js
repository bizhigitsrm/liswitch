// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Unit tests for preferences window (prefs.js)

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';

// Register Shell Extensions gresource for standalone testing if available
try {
    const resPath = '/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource';
    const res = Gio.Resource.load(resPath);
    Gio.resources_register(res);
} catch {
    // Already registered or unavailable
}

// GNOME Shell's environment provides String.prototype.format; polyfill it for standalone GJS.
if (typeof String.prototype.format !== 'function') {
    String.prototype.format = function (...args) {
        let idx = 0;
        return this.replace(/%([%sd])/g, (_m, spec) => {
            if (spec === '%')
                return '%';
            return idx < args.length ? String(args[idx++]) : '';
        });
    };
}

import {
    assert,
    assertEquals,
    MockSettings,
    createMockSettings,
} from './helpers.js';

const {
    default: LiswitchPreferences,
    SignalTracker,
    ShortcutRowGroup,
    findDuplicateAction,
    getDefaultHotkeyTitles,
    createShortcutContext,
} = await import('../prefs.js');
const {HOTKEY_KEYS} = await import('../src/hotkeys.js');

class MockPreferencesWindow {
    constructor() {
        this.pages = [];
    }

    add(page) {
        this.pages.push(page);
    }
}

function runTests() {
    print('=== Liswitch: Preferences Unit Tests ===\n');

    // Test 1: Accelerator parsing & human readable labels
    print('Test 1: Shortcut parsing & human-readable formatting...');
    {
        const [ok, keyval, mods] = Gtk.accelerator_parse('<Control><Alt>space');
        assert(ok && keyval !== 0, 'Parsing <Control><Alt>space should succeed');
        const label = Gtk.accelerator_get_label(keyval, mods);
        assertEquals(label, 'Ctrl+Alt+Space', 'Label should match Ctrl+Alt+Space');

        const [ok2, keyval2, mods2] = Gtk.accelerator_parse('<Control><Alt><Shift>space');
        assert(ok2 && keyval2 !== 0, 'Parsing <Control><Alt><Shift>space should succeed');
        const label2 = Gtk.accelerator_get_label(keyval2, mods2);
        assertEquals(label2, 'Shift+Ctrl+Alt+Space', 'Label should match Shift+Ctrl+Alt+Space');
        print('  -> PASS');
    }

    // Test 2: Validation of duplicate shortcuts between actions (including convert-hotkey)
    print('Test 2: Validation of duplicate shortcuts between actions...');
    {
        assert(HOTKEY_KEYS.includes('convert-hotkey'), 'HOTKEY_KEYS should include convert-hotkey');

        const settings = createMockSettings({
            'hotkey-next': ['<Control><Alt>space'],
            'hotkey-previous': ['<Control><Alt><Shift>space'],
            'convert-hotkey': ['<Shift>Pause'],
        });
        const titles = getDefaultHotkeyTitles();

        assertEquals(
            findDuplicateAction(settings, 'hotkey-previous', '<Control><Alt>space', titles),
            'Next Layout',
            'Duplicate against hotkey-next should be detected'
        );

        assertEquals(
            findDuplicateAction(settings, 'hotkey-switch-1', '<Shift>Pause', titles),
            'Convert Last Word',
            'Duplicate against convert-hotkey should be detected from layout shortcut'
        );

        assertEquals(
            findDuplicateAction(settings, 'convert-hotkey', '<Ctrl><Alt>space', titles),
            'Next Layout',
            'Duplicate against hotkey-next should be detected from convert-hotkey'
        );

        assertEquals(
            findDuplicateAction(settings, 'hotkey-switch-1', '', titles),
            null,
            'Empty shortcut should never trigger duplicate conflict'
        );
        print('  -> PASS');
    }

    // Test 3: Preferences window creation and page layout
    print('Test 3: Preferences window creation and page layout...');
    const hasDisplay = Gtk.init_check() && Boolean(Gdk.Display.get_default());
    if (hasDisplay) {
        Adw.init();

        const metadata = {
            uuid: 'liswitch@local',
            name: 'Liswitch',
            path: '.',
            dir: Gio.File.new_for_path('.'),
        };
        const prefs = new LiswitchPreferences(metadata);
        const settings = createMockSettings();
        prefs.getSettings = () => settings;

        const window = new MockPreferencesWindow();
        prefs.fillPreferencesWindow(window);

        assertEquals(window.pages.length, 5, 'PreferencesWindow should have exactly 5 pages');

        const pageTitles = window.pages.map(p => p.title);
        print(`  Pages created: ${pageTitles.join(', ')}`);

        assert(pageTitles.includes('General'), 'Should include General page');
        assert(pageTitles.includes('Shortcuts'), 'Should include Shortcuts page');
        assert(pageTitles.includes('Memory'), 'Should include Memory page');
        assert(pageTitles.includes('Correction'), 'Should include Correction page');
        assert(pageTitles.includes('About'), 'Should include About page');

        print('  -> PASS (all 5 pages instantiated successfully)');
    } else {
        print('  -> SKIPPED (no graphical GdkDisplay in headless environment; tested via smoke-test.js)');
    }

    // Test 4: Settings schema and key reactivity...
    print('Test 4: Settings schema and key reactivity...');
    {
        const settings = createMockSettings();

        // Change memory mode
        settings.set_string('memory-mode', 'per-window');
        assertEquals(settings.get_string('memory-mode'), 'per-window', 'Settings memory-mode updated');

        // Change OSD duration
        settings.set_uint('osd-duration-ms', 1500);
        assertEquals(settings.get_uint('osd-duration-ms'), 1500, 'Settings osd-duration-ms updated');

        // Change OSD toggle
        settings.set_boolean('show-osd', false);
        assertEquals(settings.get_boolean('show-osd'), false, 'Settings show-osd toggled');

        settings.set_string('indicator-position', 'center');
        assertEquals(settings.get_string('indicator-position'), 'center', 'Settings indicator-position updated');

        settings.set_string('osd-position', 'top');
        assertEquals(settings.get_string('osd-position'), 'top', 'Settings osd-position updated');

        // Change text correction keys
        settings.set_boolean('convert-text-enabled', true);
        assertEquals(settings.get_boolean('convert-text-enabled'), true, 'Settings convert-text-enabled toggled');

        settings.set_boolean('convert-double-shift', false);
        assertEquals(settings.get_boolean('convert-double-shift'), false, 'Settings convert-double-shift toggled');

        settings.set_strv('convert-hotkey', ['<Control><Shift>space']);
        assertEquals(settings.get_strv('convert-hotkey')[0], '<Control><Shift>space', 'Settings convert-hotkey updated');

        print('  -> PASS');
    }

    // Test 5: SignalTracker and ShortcutRowGroup batching & cleanup
    print('Test 5: SignalTracker disposal and ShortcutRowGroup batched refresh...');
    {
        const settings = createMockSettings();
        const desktopSettings = new MockSettings({'per-window': false});
        const tracker = new SignalTracker();
        const context = createShortcutContext();
        let recorderStopped = 0;

        tracker.addCleanup(() => {
            recorderStopped++;
        });
        tracker.connect(settings, 'changed::osd-duration-ms', () => {});
        tracker.connect(desktopSettings, 'changed::per-window', () => {});

        const groupMgr = new ShortcutRowGroup(settings, tracker, context);
        assertEquals(
            settings.listenerCount('changed::backup-system-shortcuts'),
            1,
            'backup-system-shortcuts listener connected'
        );
        assertEquals(
            settings.listenerCount('changed::freed-system-shortcuts'),
            1,
            'freed-system-shortcuts listener connected'
        );

        // Verify batched refresh passes the same computed conflicts array to all rows
        const receivedConflicts = [];
        groupMgr._rowRefreshCallbacks.push(c => receivedConflicts.push(c));
        groupMgr._rowRefreshCallbacks.push(c => receivedConflicts.push(c));
        groupMgr.refreshAllRows();
        assertEquals(receivedConflicts.length, 2, 'Both row callbacks invoked');
        assert(Array.isArray(receivedConflicts[0]), 'Conflicts array passed to row 1');
        assert(receivedConflicts[0] === receivedConflicts[1], 'Same conflicts array instance shared across all rows');

        // Verify withSuppressedSignals suppresses redundant intermediate refreshes
        let suppressedCalls = 0;
        groupMgr._rowRefreshCallbacks.push(() => {
            suppressedCalls++;
        });
        groupMgr.withSuppressedSignals(() => {
            settings.set_string('backup-system-shortcuts', '{"a":1}');
            settings.set_string('freed-system-shortcuts', '{"b":2}');
        });
        assertEquals(suppressedCalls, 0, 'Intermediate signal refreshes suppressed during batch mutation');

        // Verify idempotent disposal disconnects all GSettings and desktopSettings listeners
        tracker.dispose();
        tracker.dispose();
        assertEquals(recorderStopped, 1, 'Cleanup callback executed exactly once');
        assertEquals(settings.listenerCount(), 0, 'All Liswitch settings listeners disconnected on dispose');
        assertEquals(desktopSettings.listenerCount(), 0, 'All desktopSettings listeners disconnected on dispose');

        print('  -> PASS');
    }

    print('\n=== ALL PREFERENCES TESTS PASSED SUCCESSFULLY! ===');
}

runTests();
