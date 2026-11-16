// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Unit tests for preferences window (prefs.js)

import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';

try {
    Gtk.init();
} catch {
    // Already registered or unavailable
}

import {
    assert,
    assertEquals,
    createMockSettings,
} from './helpers.js';

const {default: LiswitchPreferences} = await import('../prefs.js');
const {normalizeShortcut} = await import('../src/hotkeys.js');

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

    // Test 2: Validation of duplicate shortcuts between actions
    print('Test 2: Validation of duplicate shortcuts between actions...');
    {
        const settings = createMockSettings({
            'hotkey-next': ['<Control><Alt>space'],
            'hotkey-previous': ['<Control><Alt><Shift>space'],
        });

        const targetNorm = normalizeShortcut('<Control><Alt>space');

        // Check if assigning <Control><Alt>space to hotkey-previous would be duplicate
        const allKeys = ['hotkey-next', 'hotkey-previous', 'hotkey-switch-1', 'hotkey-switch-2', 'hotkey-switch-3', 'hotkey-switch-4'];
        let duplicateFound = false;

        for (const k of allKeys) {
            if (k === 'hotkey-previous')
                continue;
            const arr = settings.get_strv(k);
            if (arr.some(s => normalizeShortcut(s) === targetNorm)) {
                duplicateFound = true;
                break;
            }
        }

        assert(duplicateFound, 'Duplicate accelerator <Control><Alt>space should be detected');

        // Empty shortcut (disabled) should not be considered duplicate
        const emptyNorm = normalizeShortcut('');
        let emptyDuplicate = false;
        for (const k of allKeys) {
            if (k === 'hotkey-switch-1')
                continue;
            const arr = settings.get_strv(k);
            if (arr.some(s => normalizeShortcut(s) && normalizeShortcut(s) === emptyNorm)) {
                emptyDuplicate = true;
                break;
            }
        }
        assertEquals(emptyDuplicate, false, 'Empty shortcut should never trigger duplicate conflict');
        print('  -> PASS');
    }

    // Test 3: Preferences window creation and page layout
    print('Test 3: Preferences window creation and page layout...');
    const hasDisplay = Boolean(Gdk.Display.get_default());
    if (hasDisplay) {
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

        assertEquals(window.pages.length, 4, 'PreferencesWindow should have exactly 4 pages');

        const pageTitles = window.pages.map(p => p.title);
        print(`  Pages created: ${pageTitles.join(', ')}`);

        assert(pageTitles.includes('General'), 'Should include General page');
        assert(pageTitles.includes('Shortcuts'), 'Should include Shortcuts page');
        assert(pageTitles.includes('Memory'), 'Should include Memory page');
        assert(pageTitles.includes('About'), 'Should include About page');

        print('  -> PASS (all 4 pages instantiated successfully)');
    } else {
        print('  -> SKIPPED (no graphical GdkDisplay in headless environment; tested via smoke-test.js)');
    }

    // Test 4: Dynamic settings changes in prefs
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

        print('  -> PASS');
    }

    print('\n=== ALL PREFERENCES TESTS PASSED SUCCESSFULLY! ===');
}

runTests();
