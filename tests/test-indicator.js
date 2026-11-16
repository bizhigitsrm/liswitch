// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Unit tests for indicator.js

import Clutter from 'gi://Clutter';

import {
    Indicator,
    formatLayoutLabel,
    getAccessibleLayoutLabel,
    resolveIndicatorPlacement,
} from '../src/indicator.js';
import {InputSourceService} from '../src/inputSourceService.js';
import * as Log from '../src/log.js';
import {
    assert,
    assertEquals,
    MockInputSource,
    MockInputSourceManager,
    createMockSettings,
} from './helpers.js';

Log.setDebugOverride(true);

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

    const settings = createMockSettings();
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

    const settings = createMockSettings();
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

    const settings = createMockSettings({'indicator-format': 'short'});
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

    const settings = createMockSettings({'scroll-switch': true});
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

    const settings = createMockSettings();
    const indicator = new Indicator(settings, service);

    assertEquals(indicator.menuItems.size, 1, 'Initially 1 layout in menu');

    // Dynamically add a second layout
    const newSpecs = [
        {id: 'us', displayName: 'English (US)', shortName: 'en', index: 0},
        {id: 'kz', displayName: 'Kazakh', shortName: 'kk', index: 1},
    ];
    mockManager.setSources(newSpecs);

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
    const settings = createMockSettings();

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

// ---------------------------------------------------------
console.log('Test 8: hide-system-indicator re-syncs on sources-changed and restores on destroy...');
{
    const initialSources = [
        new MockInputSource('us', 'English (US)', 'en', 0),
        new MockInputSource('ru', 'Russian', 'ru', 1),
    ];
    const mockManager = new MockInputSourceManager(initialSources);
    const service = new InputSourceService();
    service.enable({manager: mockManager});

    const systemKeyboard = {
        visible: true,
        hide() {
            this.visible = false;
        },
        show() {
            this.visible = true;
        },
    };
    const mockPanel = {
        statusArea: {
            keyboard: systemKeyboard,
        },
    };

    const settings = createMockSettings({'hide-system-indicator': true});
    const indicator = new Indicator(settings, service, null, {panel: mockPanel});

    assertEquals(systemKeyboard.visible, false, 'System indicator hidden on init');

    // Simulate GNOME Shell re-showing statusArea['keyboard'] during sources-changed
    systemKeyboard.show();
    assertEquals(systemKeyboard.visible, true, 'System indicator became visible before re-sync');

    mockManager.setSources([
        {id: 'us', displayName: 'English (US)', shortName: 'en', index: 0},
        {id: 'ru', displayName: 'Russian', shortName: 'ru', index: 1},
        {id: 'kz', displayName: 'Kazakh', shortName: 'kk', index: 2},
    ]);
    assertEquals(systemKeyboard.visible, false, 'System indicator re-hidden on sources-changed');

    settings.set_boolean('hide-system-indicator', false);
    assertEquals(systemKeyboard.visible, true, 'System indicator shown when setting disabled');

    settings.set_boolean('hide-system-indicator', true);
    assertEquals(systemKeyboard.visible, false, 'System indicator hidden when setting re-enabled');

    indicator.destroy();
    assertEquals(systemKeyboard.visible, true, 'System indicator restored on destroy()');

    service.destroy();
    console.log('  -> PASS');
}

// ---------------------------------------------------------
console.log('Test 9: resolveIndicatorPlacement resolves system/left/center/right boxes...');
{
    const kbContainer = {id: 'kb'};
    const mockPanel = {
        statusArea: {
            keyboard: {container: kbContainer},
        },
        _leftBox: {
            get_children: () => [{id: 'activities'}],
        },
        _centerBox: {
            get_children: () => [{id: 'dateMenu'}],
        },
        _rightBox: {
            get_children: () => [{id: 'a11y'}, {id: 'dwell'}, kbContainer, {id: 'aggregate'}],
        },
    };

    const sysPlacement = resolveIndicatorPlacement('system', mockPanel);
    assertEquals(sysPlacement.box, 'right', 'system places indicator in right box');
    assertEquals(sysPlacement.position, 2, 'system places indicator right next to keyboard container');

    const sysFallback = resolveIndicatorPlacement('system', null);
    assertEquals(sysFallback.box, 'right', 'system fallback uses right box');
    assertEquals(sysFallback.position, 0, 'system fallback uses index 0 without panel');

    const rightPlacement = resolveIndicatorPlacement('right', mockPanel);
    assertEquals(rightPlacement.box, 'right', 'right uses right box');
    assertEquals(rightPlacement.position, 0, 'right uses position 0');

    const centerPlacement = resolveIndicatorPlacement('center', mockPanel);
    assertEquals(centerPlacement.box, 'center', 'center uses center box');
    assertEquals(centerPlacement.position, 1, 'center appends after existing center items');

    const leftPlacement = resolveIndicatorPlacement('left', mockPanel);
    assertEquals(leftPlacement.box, 'left', 'left uses left box');
    assertEquals(leftPlacement.position, 1, 'left appends after Activities button');

    const leftNoPanel = resolveIndicatorPlacement('left', null);
    assertEquals(leftNoPanel.box, 'left', 'left without panel uses left box');
    assertEquals(leftNoPanel.position, -1, 'left without panel uses -1');

    console.log('  -> PASS');
}

console.log('\n=== ALL INDICATOR TESTS PASSED SUCCESSFULLY! ===');
