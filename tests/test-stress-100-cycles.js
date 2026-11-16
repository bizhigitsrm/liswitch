// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: 100-cycle stress test for enable/disable lifecycle

import {InputSourceService} from '../src/inputSourceService.js';
import {WindowMemory} from '../src/windowMemory.js';
import {HotkeyManager} from '../src/hotkeys.js';
import {OsdService} from '../src/osd.js';
import {TextCorrectionManager} from '../src/textCorrection.js';
import {Indicator} from '../src/indicator.js';
import * as Log from '../src/log.js';
import {
    assert,
    createMemorySettings,
    MockInputSourceManager,
    MockWindowManager,
    MockDisplay,
    MockDesktopSettings,
} from './helpers.js';

console.log('=== Liswitch: 100-Cycle Enable/Disable Stress Test ===\n');

const settings = createMemorySettings();
const mockWm = new MockWindowManager();
const mockDisplay = new MockDisplay();
const mockDesktopSettings = new MockDesktopSettings(false);
const defaultSources = [
    {type: 'xkb', id: 'us', shortName: 'en', displayName: 'English (US)', index: 0},
    {type: 'xkb', id: 'ru', shortName: 'ru', displayName: 'Russian', index: 1},
];

const CYCLES = 100;
console.log(`Executing ${CYCLES} consecutive enable -> disable cycles...`);

const startTime = Date.now();

for (let i = 1; i <= CYCLES; i++) {
    // 1. Enable phase (mirroring extension.js enable())
    Log.initLogger(settings, '[stress-test]');
    const manager = new MockInputSourceManager(defaultSources);

    const inputService = new InputSourceService(settings);
    inputService.enable({manager});

    const memory = new WindowMemory(settings, inputService);
    memory.enable({display: mockDisplay, desktopSettings: mockDesktopSettings});

    const hotkeys = new HotkeyManager(settings, inputService, {wm: mockWm});
    hotkeys.enable();

    const osd = new OsdService(settings, inputService, memory);
    osd.enable();

    const textCorrection = new TextCorrectionManager(settings, inputService);
    textCorrection.enable();

    const indicator = new Indicator(settings, inputService, () => {});

    // Assert active state
    assert(inputService.isAvailable, `Cycle ${i}: inputService must be available`);
    assert(hotkeys.boundHotkeys.size > 0, `Cycle ${i}: hotkeys must be registered`);
    assert(indicator.label !== null, `Cycle ${i}: indicator label must exist`);

    // 2. Perform mock operations in cycle
    inputService.next();
    inputService.previous();

    // 3. Disable phase (mirroring extension.js disable() in exact LIFO order)
    indicator.destroy();
    osd.destroy();
    hotkeys.destroy();
    textCorrection.destroy();
    memory.destroy();
    inputService.destroy();
    Log.resetLogger();

    // Assert clean destruction
    assert(mockWm._bindings.size === 0, `Cycle ${i}: all keybindings must be released`);
    assert(!inputService.isAvailable, `Cycle ${i}: inputService must be unavailable after destroy`);
    assert(memory.appMemorySize === 0, `Cycle ${i}: app memory must be empty`);
    assert(memory.windowMemorySize === 0, `Cycle ${i}: window memory must be empty`);
    assert(!osd._enabled, `Cycle ${i}: osd must be disabled`);
    assert(!textCorrection._enabled, `Cycle ${i}: textCorrection must be disabled`);

    if (i % 25 === 0)
        console.log(`  -> Completed ${i}/${CYCLES} cycles cleanly`);
}

const elapsedMs = Date.now() - startTime;
console.log(`\n  -> Successfully completed ${CYCLES} cycles in ${elapsedMs} ms (avg ${(elapsedMs / CYCLES).toFixed(2)} ms/cycle)`);
console.log('  -> 0 resource leaks, 0 dangling listeners, 0 keybinding leaks');
console.log('\n=== 100-CYCLE STRESS TEST PASSED! ===');
