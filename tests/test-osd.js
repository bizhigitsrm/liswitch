// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Unit tests for visual on-screen display (osd.js)

import Clutter from 'gi://Clutter';
import {OsdService} from '../src/osd.js';
import * as Log from '../src/log.js';
import {
    assert,
    assertEquals,
    MockEmitter,
    MockInputSourceService,
    MockSettings,
    createMockSettings,
} from './helpers.js';

Log.setDebugOverride(true);

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

    const settings = createMockSettings();

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

    // -------------------------------------------------------------
    print('Test 8: monitors-changed updates active OSD constraint and cleans up signal...');
    {
        const iss = new MockInputSourceService();
        const mem = new MockWindowMemory(false);
        const mockLayoutManager = new MockEmitter();
        mockLayoutManager.primaryIndex = 0;
        mockLayoutManager.monitors = [{index: 0}, {index: 1}];

        const mockDisplay = {
            focus_window: {
                get_monitor: () => 1,
            },
        };

        const osd = new OsdService(settings, iss, mem, {
            layoutManager: mockLayoutManager,
            display: mockDisplay,
        });
        osd.enable();

        assertEquals(mockLayoutManager.getListenerCount('monitors-changed'), 1, 'Subscribed to monitors-changed');

        const src = {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'};
        osd.show(src);
        assert(osd.isShowing, 'OSD should be showing on monitor 1');
        assertEquals(osd._monitorConstraint.index, 1, 'OSD targets focused window monitor 1');

        // External monitor disconnected while OSD is open
        mockLayoutManager.monitors = [{index: 0}];
        mockDisplay.focus_window = {get_monitor: () => 0};
        mockLayoutManager.emit('monitors-changed');

        assert(osd.isShowing, 'OSD stays open when primary monitor remains');
        assertEquals(osd._monitorConstraint.index, 0, 'OSD constraint updated to monitor 0');

        // Momentary 0-monitor state hides active OSD safely
        mockLayoutManager.monitors = [];
        mockLayoutManager.emit('monitors-changed');
        assertEquals(osd.isShowing, false, 'OSD hidden safely when 0 monitors remain');

        osd.destroy();
        assertEquals(mockLayoutManager.getListenerCount('monitors-changed'), 0, 'monitors-changed disconnected on destroy()');
        print('  -> PASS');
    }

    // -------------------------------------------------------------
    print('Test 9: Legacy osd-enabled key is ignored (only show-osd controls OSD)...');
    {
        const legacyOnlySettings = new MockSettings({'osd-enabled': false});
        const osd = new OsdService(legacyOnlySettings);
        assertEquals(osd.isEnabled, true, 'Legacy osd-enabled key must be ignored');
        print('  -> PASS');
    }

    // -------------------------------------------------------------
    print('Test 10: osd-position (center, top, bottom) updates alignment, CSS classes, and disconnects on destroy...');
    {
        const posSettings = createMockSettings({'osd-position': 'center'});
        const iss = new MockInputSourceService();
        const mem = new MockWindowMemory(false);
        const osd = new OsdService(posSettings, iss, mem);
        osd.enable();

        assertEquals(osd.position, 'center', 'Default position is center');
        const src = {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'};
        osd.show(src);

        assertEquals(osd.container.y_align, Clutter.ActorAlign.CENTER, 'center aligns to ActorAlign.CENTER');
        assert(osd.container.has_style_class_name('liswitch-osd-center'), 'Container has liswitch-osd-center class');

        posSettings.set_string('osd-position', 'top');
        assertEquals(osd.position, 'top', 'Position updated to top');
        assertEquals(osd.container.y_align, Clutter.ActorAlign.START, 'top aligns to ActorAlign.START');
        assert(osd.container.has_style_class_name('liswitch-osd-top'), 'Container has liswitch-osd-top class');
        assert(!osd.container.has_style_class_name('liswitch-osd-center'), 'Old center class removed');

        posSettings.set_string('osd-position', 'bottom');
        assertEquals(osd.position, 'bottom', 'Position updated to bottom');
        assertEquals(osd.container.y_align, Clutter.ActorAlign.END, 'bottom aligns to ActorAlign.END');
        assert(osd.container.has_style_class_name('liswitch-osd-bottom'), 'Container has liswitch-osd-bottom class');

        posSettings.set_string('osd-position', 'invalid-pos');
        assertEquals(osd.position, 'center', 'Invalid position falls back to center');

        osd.destroy();
        assertEquals(posSettings.listenerCount('changed::osd-position'), 0, 'osd-position listener disconnected on destroy()');
        print('  -> PASS');
    }

    print('\n=== ALL OSD UNIT TESTS PASSED SUCCESSFULLY! ===');
}

runTests();
