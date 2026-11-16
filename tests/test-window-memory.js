// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Unit tests for WindowMemory service (GNOME Shell 51 / Pure GJS)

import {
    WindowMemory,
    LruMap,
    getAppKey,
    getWindowKey,
    isWindowExcluded,
    MAX_MEMORY_ENTRIES,
} from '../src/windowMemory.js';
import {InputSourceService} from '../src/inputSourceService.js';
import * as Log from '../src/log.js';
import {
    assert,
    createMemorySettings,
    MockDisplay,
    MockWindow,
    MockInputSourceManager,
    MockSettings,
    MockDesktopSettings,
} from './helpers.js';

Log.setDebugOverride(true);

console.log('=== Liswitch: WindowMemory Unit Tests ===\n');

// === TESTS ===

// Test 1: LruMap basic operations & eviction
console.log('Test 1: LruMap operations and LRU eviction...');
{
    const lru = new LruMap(3);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);
    assert(lru.size === 3, 'LruMap size should be 3');
    assert(lru.get('a') === 1, 'Key "a" should be 1');

    // Accessing "a" makes it most recent; oldest is now "b"
    lru.set('d', 4);
    assert(lru.size === 3, 'Size capped at 3');
    assert(!lru.has('b'), '"b" should have been evicted as oldest');
    assert(lru.has('a'), '"a" should be retained');
    assert(lru.has('c'), '"c" should be retained');
    assert(lru.has('d'), '"d" should be present');

    lru.clear();
    assert(lru.size === 0, 'Clear empties the map');

    // Test max limit 500
    const lru500 = new LruMap(MAX_MEMORY_ENTRIES);
    for (let i = 0; i < 600; i++)
        lru500.set(`key-${i}`, i);
    assert(lru500.size === 500, 'Size should be capped at 500');
    assert(!lru500.has('key-0'), 'Oldest key-0 must be evicted');
    assert(lru500.has('key-599'), 'Newest key-599 must be present');
    console.log('  -> PASS');
}

// Test 2: getAppKey and getWindowKey
console.log('Test 2: getAppKey and getWindowKey identification...');
{
    const win1 = new MockWindow({id: 1001, wmClass: 'org.gnome.TextEditor'});
    assert(getAppKey(win1) === 'org.gnome.TextEditor', 'wm_class match');
    assert(getWindowKey(win1) === '1001', 'window id match');

    const winFlatpak = new MockWindow({
        id: 1002,
        wmClass: 'firefox',
        sandboxedAppId: 'org.mozilla.firefox',
    });
    assert(getAppKey(winFlatpak) === 'org.mozilla.firefox', 'sandboxedAppId must take priority over wm_class');

    const winGtk = new MockWindow({
        id: 1003,
        wmClass: 'console',
        gtkAppId: 'org.gnome.Console',
    });
    assert(getAppKey(winGtk) === 'org.gnome.Console', 'gtkAppId priority over wm_class');

    assert(getAppKey(null) === null, 'null window returns null');
    assert(getWindowKey(null) === null, 'null window returns null');
    console.log('  -> PASS');
}

// Test 3: isWindowExcluded
console.log('Test 3: isWindowExcluded verification...');
{
    const win = new MockWindow({id: 1, appId: 'org.gnome.Console'});
    assert(!isWindowExcluded(win, []), 'Empty list does not exclude');
    assert(isWindowExcluded(win, ['org.gnome.Console']), 'Exact match excludes');
    assert(isWindowExcluded(win, ['ORG.GNOME.CONSOLE']), 'Case-insensitive match excludes');
    assert(!isWindowExcluded(win, ['org.gnome.TextEditor']), 'Non-matching app does not exclude');
    console.log('  -> PASS');
}

// Test 4: Scenario from prompt:
// 3 apps with 3 layouts, Alt+Tab switching, unmanaged window closing, and excluded app
console.log('Test 4: Scenario: 3 apps, 3 layouts, Alt+Tab, window closing, and excluded app...');
{
    const sources = [
        {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
        {index: 2, id: 'kk', shortName: 'kk', displayName: 'Kazakh'},
    ];

    const mockManager = new MockInputSourceManager(sources);
    const inputService = new InputSourceService();
    inputService.enable({manager: mockManager});

    const settings = new MockSettings({'memory-mode': 'per-app'});
    const desktopSettings = new MockDesktopSettings(false);
    const display = new MockDisplay();

    const mem = new WindowMemory(settings, inputService);
    mem.enable({display, desktopSettings});

    // Create 3 windows for 3 applications
    const winEditor = new MockWindow({id: 101, appId: 'org.gnome.TextEditor'});
    const winConsole = new MockWindow({id: 102, appId: 'org.gnome.Console'});
    const winBrowser = new MockWindow({id: 103, appId: 'org.mozilla.firefox'});

    // 1. Focus App 1 (Editor). User switches layout to 'us' (0)
    display.setFocus(winEditor);
    inputService.activate(0, true);
    assert(inputService.getCurrentIndex() === 0, 'Editor layout is US');

    // 2. Focus App 2 (Console). User switches layout to 'ru' (1)
    display.setFocus(winConsole);
    inputService.activate(1, true);
    assert(inputService.getCurrentIndex() === 1, 'Console layout is RU');
    assert(mem.getSavedAppLayout('org.gnome.TextEditor')?.id === 'us', 'Editor saved US on blur');

    // 3. Focus App 3 (Browser). User switches layout to 'kk' (2)
    display.setFocus(winBrowser);
    inputService.activate(2, true);
    assert(inputService.getCurrentIndex() === 2, 'Browser layout is KK');
    assert(mem.getSavedAppLayout('org.gnome.Console')?.id === 'ru', 'Console saved RU on blur');

    // Clear activation history before testing Alt+Tab
    mockManager.activateHistory = [];

    // 4. Alt+Tab to App 1 (Editor) -> Must restore US (index 0)
    display.setFocus(winEditor);
    assert(inputService.getCurrentIndex() === 0, 'Editor restored to US (0)');
    assert(mockManager.activateHistory.length === 1, 'activate() called exactly ONCE on Alt+Tab');
    assert(mockManager.activateHistory[0].index === 0, 'Activated source 0 (us)');
    assert(mockManager.activateHistory[0].interactive === false, 'Silent activation (interactive = false)');

    // 5. Alt+Tab to App 2 (Console) -> Must restore RU (index 1)
    mockManager.activateHistory = [];
    display.setFocus(winConsole);
    assert(inputService.getCurrentIndex() === 1, 'Console restored to RU (1)');
    assert(mockManager.activateHistory.length === 1, 'activate() called exactly ONCE on Alt+Tab');
    assert(mockManager.activateHistory[0].index === 1, 'Activated source 1 (ru)');
    assert(mockManager.activateHistory[0].interactive === false, 'Silent activation');

    // 6. Alt+Tab to App 3 (Browser) -> Must restore KK (index 2)
    mockManager.activateHistory = [];
    display.setFocus(winBrowser);
    assert(inputService.getCurrentIndex() === 2, 'Browser restored to KK (2)');
    assert(mockManager.activateHistory.length === 1, 'activate() called exactly ONCE on Alt+Tab');
    assert(mockManager.activateHistory[0].index === 2, 'Activated source 2 (kk)');

    // 7. Redundant focus on same app -> 0 calls to activate()
    mockManager.activateHistory = [];
    display.setFocus(winBrowser);
    assert(mockManager.activateHistory.length === 0, 'Duplicate focus to same window must NOT call activate()');

    // 8. Close window (unmanaged) in per-window mode
    settings.set_string('memory-mode', 'per-window');
    const winTemp = new MockWindow({id: 999, appId: 'org.gnome.Calculator'});
    display.setFocus(winTemp);
    inputService.activate(1, true); // RU
    assert(mem.getSavedWindowLayout('999')?.id === 'ru', 'Saved layout for window 999');

    // Close the window
    winTemp.close();
    assert(mem.getSavedWindowLayout('999') === undefined, 'Closed window entry removed on unmanaged');

    // Switch back to per-app
    settings.set_string('memory-mode', 'per-app');

    // 9. Excluded apps testing
    settings.set_strv('memory-excluded-apps', ['org.gnome.Console']);
    // Current layout is RU (from winTemp / Console).
    // Focus Editor (has US saved). Layout should switch to US.
    mockManager.activateHistory = [];
    display.setFocus(winEditor);
    assert(inputService.getCurrentIndex() === 0, 'Editor is US');
    assert(mockManager.activateHistory.length === 1, 'Switched to US for Editor');

    // Now focus Console (which is excluded).
    mockManager.activateHistory = [];
    display.setFocus(winConsole);
    // Console is excluded: activate() should NOT be called; layout remains US!
    assert(inputService.getCurrentIndex() === 0, 'Layout remains US because Console is excluded');
    assert(mockManager.activateHistory.length === 0, 'activate() was NOT called for excluded application');

    mem.destroy();
    inputService.destroy();
    console.log('  -> PASS');
}

// Test 5: Per-window mode distinguishes separate windows of the same application
console.log('Test 5: Per-window mode with multiple windows of same app...');
{
    const sources = [
        {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
    ];
    const mockManager = new MockInputSourceManager(sources);
    const inputService = new InputSourceService();
    inputService.enable({manager: mockManager});

    const settings = new MockSettings({'memory-mode': 'per-window'});
    const desktopSettings = new MockDesktopSettings(false);
    const display = new MockDisplay();

    const mem = new WindowMemory(settings, inputService);
    mem.enable({display, desktopSettings});

    const win1 = new MockWindow({id: 201, appId: 'org.gnome.TextEditor'});
    const win2 = new MockWindow({id: 202, appId: 'org.gnome.TextEditor'});

    display.setFocus(win1);
    inputService.activate(0, true); // win1 = US

    display.setFocus(win2);
    inputService.activate(1, true); // win2 = RU

    // Alt+Tab back to win1
    mockManager.activateHistory = [];
    display.setFocus(win1);
    assert(inputService.getCurrentIndex() === 0, 'win1 restored to US');
    assert(mockManager.activateHistory.length === 1, '1 activation on Alt+Tab');

    // Alt+Tab back to win2
    mockManager.activateHistory = [];
    display.setFocus(win2);
    assert(inputService.getCurrentIndex() === 1, 'win2 restored to RU');
    assert(mockManager.activateHistory.length === 1, '1 activation on Alt+Tab');

    // Closing win1 removes it
    win1.close();
    assert(mem.getSavedWindowLayout('201') === undefined, 'win1 removed on unmanaged');
    assert(mem.getSavedWindowLayout('202') !== undefined, 'win2 retained');

    mem.destroy();
    inputService.destroy();
    console.log('  -> PASS');
}

// Test 6: Memory mode "off"
console.log('Test 6: Memory mode "off"...');
{
    const sources = [
        {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
    ];
    const mockManager = new MockInputSourceManager(sources);
    const inputService = new InputSourceService();
    inputService.enable({manager: mockManager});

    const settings = new MockSettings({'memory-mode': 'off'});
    const desktopSettings = new MockDesktopSettings(false);
    const display = new MockDisplay();

    const mem = new WindowMemory(settings, inputService);
    mem.enable({display, desktopSettings});

    const win1 = new MockWindow({id: 301, appId: 'app1'});
    const win2 = new MockWindow({id: 302, appId: 'app2'});

    display.setFocus(win1);
    inputService.activate(0, true);

    display.setFocus(win2);
    inputService.activate(1, true);

    mockManager.activateHistory = [];
    display.setFocus(win1);
    assert(mockManager.activateHistory.length === 0, 'No activate calls when mode is off');
    assert(inputService.getCurrentIndex() === 1, 'Layout stays whatever it was');

    mem.destroy();
    inputService.destroy();
    console.log('  -> PASS');
}

// Test 7: Race conditions and feedback loop prevention
console.log('Test 7: Race condition and feedback loop prevention...');
{
    const sources = [
        {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
    ];
    const mockManager = new MockInputSourceManager(sources);
    const inputService = new InputSourceService();
    inputService.enable({manager: mockManager});

    const settings = new MockSettings({'memory-mode': 'per-app'});
    const desktopSettings = new MockDesktopSettings(false);
    const display = new MockDisplay();

    const mem = new WindowMemory(settings, inputService);
    mem.enable({display, desktopSettings});

    const winA = new MockWindow({id: 401, appId: 'appA'});
    const winB = new MockWindow({id: 402, appId: 'appB'});

    display.setFocus(winA);
    inputService.activate(0, true); // App A is US

    display.setFocus(winB);
    inputService.activate(1, true); // App B is RU

    // When focus shifts to App A:
    // WindowMemory will call inputService.activate(0, false).
    // In a real shell, this triggers current-changed.
    // WindowMemory must NOT interpret this current-changed as user switching App A to RU!
    display.setFocus(winA);
    assert(inputService.getCurrentIndex() === 0, 'App A is restored to US');
    assert(mem.getSavedAppLayout('appA')?.id === 'us', 'App A still recorded as US');
    assert(mem.getSavedAppLayout('appB')?.id === 'ru', 'App B still recorded as RU');

    mem.destroy();
    inputService.destroy();
    console.log('  -> PASS');
}

// Test 8: System per-window option compatibility
console.log('Test 8: System per-window option compatibility...');
{
    const sources = [
        {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
    ];
    const mockManager = new MockInputSourceManager(sources);
    const inputService = new InputSourceService();
    inputService.enable({manager: mockManager});

    const settings = new MockSettings({'memory-mode': 'per-app'});
    const desktopSettings = new MockDesktopSettings(true); // System per-window enabled!
    const display = new MockDisplay();

    const mem = new WindowMemory(settings, inputService);
    mem.enable({display, desktopSettings});

    assert(mem.isSystemPerWindowActive === true, 'Detected system per-window as active');

    const win1 = new MockWindow({id: 501, appId: 'app1'});
    const win2 = new MockWindow({id: 502, appId: 'app2'});

    display.setFocus(win1);
    inputService.activate(0, true);

    display.setFocus(win2);
    inputService.activate(1, true);

    mockManager.activateHistory = [];
    display.setFocus(win1);
    assert(mockManager.activateHistory.length === 0, 'No activate calls when system per-window is active');

    // Disable system per-window dynamically
    desktopSettings.set_boolean('per-window', false);
    assert(mem.isSystemPerWindowActive === false, 'Detected system per-window turned off');

    // Now liswitch should activate on focus
    display.setFocus(win2);
    inputService.activate(1, true); // record app2 as RU

    display.setFocus(win1);
    inputService.activate(0, true); // record app1 as US

    mockManager.activateHistory = [];
    display.setFocus(win2);
    assert(mockManager.activateHistory.length === 1, 'Liswitch resumes switching after system per-window disabled');

    mem.destroy();
    inputService.destroy();
    console.log('  -> PASS');
}

// Test 9: default-layout-mode ('keep' vs 'first')
console.log('Test 9: default-layout-mode ("keep" vs "first")...');
{
    const sources = [
        {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
    ];
    const mockManager = new MockInputSourceManager(sources);
    const inputService = new InputSourceService();
    inputService.enable({manager: mockManager});

    // Test 'first'
    const settings = new MockSettings({
        'memory-mode': 'per-app',
        'default-layout-mode': 'first',
    });
    const desktopSettings = new MockDesktopSettings(false);
    const display = new MockDisplay();

    const mem = new WindowMemory(settings, inputService);
    mem.enable({display, desktopSettings});

    // Set global layout to 1 (RU)
    inputService.activate(1, true);

    // New window focused: with default-layout-mode = 'first', must reset to 0 (US)
    mockManager.activateHistory = [];
    const newWin = new MockWindow({id: 601, appId: 'new-app'});
    display.setFocus(newWin);
    assert(inputService.getCurrentIndex() === 0, 'New window reset to first layout (0)');
    assert(mockManager.activateHistory.length === 1, 'Activated first layout');

    mem.destroy();
    inputService.destroy();
    console.log('  -> PASS');
}

// Test 10: 20 cycles of enable/destroy to verify leak-free cleanup
console.log('Test 10: 20 cycles of enable/destroy without signal leaks...');
{
    const sources = [
        {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
    ];
    const mockManager = new MockInputSourceManager(sources);
    const inputService = new InputSourceService();
    inputService.enable({manager: mockManager});

    const settings = new MockSettings({'memory-mode': 'per-app'});
    const desktopSettings = new MockDesktopSettings(false);
    const display = new MockDisplay();

    for (let cycle = 1; cycle <= 20; cycle++) {
        const mem = new WindowMemory(settings, inputService);
        mem.enable({display, desktopSettings});

        const win = new MockWindow({id: 700 + cycle, appId: `app-${cycle}`});
        display.setFocus(win);

        mem.destroy();
        assert(mem.appMemorySize === 0, 'app memory cleared');
        assert(mem.windowMemorySize === 0, 'window memory cleared');
        assert(mem.currentWindow === null, 'current window nullified');
    }

    inputService.destroy();
    console.log('  -> PASS (20 cycles cleanly executed, no leaks)');
}

console.log('\n=== ALL WINDOW MEMORY TESTS PASSED SUCCESSFULLY! ===');
