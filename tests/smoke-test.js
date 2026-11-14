// SPDX-License-Identifier: GPL-2.0-or-later
// Smoke test for liswitch extension via gnome-shell-test-tool

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export async function run() {
    console.log('[TEST] Checking liswitch extension registration...');
    const uuid = 'liswitch@local';
    const ext = Main.extensionManager.lookup(uuid);

    if (!ext) {
        throw new Error(`Extension ${uuid} not found in ExtensionManager!`);
    }

    console.log(`[TEST] Extension ${uuid} found, initial state: ${ext.state}`);

    // If not active yet, enable it
    if (ext.state !== 1) { // 1 = ExtensionState.ACTIVE
        console.log(`[TEST] Enabling ${uuid}...`);
        const enabled = Main.extensionManager.enableExtension(uuid);
        if (!enabled)
            throw new Error(`Failed to enable ${uuid}`);
        console.log(`[TEST] Enabled successfully, state: ${ext.state}`);
    }

    // Verify InputSourceService is accessible on stateObj
    const extObj = ext.stateObj;
    if (!extObj)
        throw new Error('Extension stateObj is null!');

    const service = extObj.inputSourceService;
    if (!service)
        throw new Error('inputSourceService is not initialized on extension!');

    const indicator = extObj.indicator;
    if (!indicator)
        throw new Error('indicator is not initialized on extension!');

    const hotkeyManager = extObj.hotkeyManager;
    if (!hotkeyManager)
        throw new Error('hotkeyManager is not initialized on extension!');

    const windowMemory = extObj.windowMemory;
    if (!windowMemory)
        throw new Error('windowMemory is not initialized on extension!');

    console.log(`[TEST] inputSourceService available: ${service.isAvailable}, sources: ${service.getSources().length}, current: ${service.getCurrentIndex()}`);
    console.log(`[TEST] indicator label: "${indicator.label?.text ?? ''}", statusArea registered: ${Boolean(Main.panel.statusArea[uuid])}`);
    console.log(`[TEST] hotkeyManager bound hotkeys: ${Array.from(hotkeyManager.boundHotkeys).join(', ')}`);
    console.log(`[TEST] windowMemory mode: ${windowMemory.memoryMode}, system per-window: ${windowMemory.isSystemPerWindowActive}`);

    // Verify default hotkeys are bound in window manager
    if (!hotkeyManager.boundHotkeys.has('hotkey-next'))
        throw new Error('hotkey-next is not registered in hotkeyManager!');
    if (!hotkeyManager.boundHotkeys.has('hotkey-previous'))
        throw new Error('hotkey-previous is not registered in hotkeyManager!');

    // Test dynamic GSettings update without restart
    const extSettings = extObj._settings;
    if (extSettings) {
        extSettings.set_strv('hotkey-switch-1', ['<Control><Alt>1']);
        if (!hotkeyManager.boundHotkeys.has('hotkey-switch-1'))
            throw new Error('hotkey-switch-1 was not dynamically registered after GSettings change!');
        console.log('[TEST] Dynamic GSettings update verified: hotkey-switch-1 registered live');

        // Reset it back
        extSettings.set_strv('hotkey-switch-1', []);
        if (hotkeyManager.boundHotkeys.has('hotkey-switch-1'))
            throw new Error('hotkey-switch-1 was not dynamically unregistered after GSettings reset!');
        console.log('[TEST] Dynamic GSettings unbind verified: hotkey-switch-1 removed live');

        // Test dynamic memory-mode change
        extSettings.set_string('memory-mode', 'per-window');
        if (windowMemory.memoryMode !== 'per-window')
            throw new Error('memory-mode was not dynamically updated!');
        extSettings.set_string('memory-mode', 'per-app');
        if (windowMemory.memoryMode !== 'per-app')
            throw new Error('memory-mode was not dynamically restored!');
        console.log('[TEST] Dynamic GSettings memory-mode verified');
    }

    // Test basic operations in headless session
    if (service.isAvailable && service.getSources().length > 1) {
        const curBefore = service.getCurrentIndex();
        service.next();
        console.log(`[TEST] next() switched index: ${curBefore} -> ${service.getCurrentIndex()}`);
        service.previous();
        console.log(`[TEST] previous() restored index: ${service.getCurrentIndex()}`);
    }

    // Perform 20 enable/disable cycles to verify leak-free and error-free transitions
    console.log('[TEST] Performing 20 enable/disable cycles...');
    for (let i = 1; i <= 20; i++) {
        Main.extensionManager.disableExtension(uuid);
        if (ext.state === 1)
            throw new Error(`Iteration ${i}: Failed to disable extension`);

        if (Main.panel.statusArea[uuid])
            throw new Error(`Iteration ${i}: Status area indicator leaked after disable`);

        Main.extensionManager.enableExtension(uuid);
        if (ext.state !== 1)
            throw new Error(`Iteration ${i}: Failed to enable extension`);

        if (!ext.stateObj?.inputSourceService)
            throw new Error(`Iteration ${i}: inputSourceService missing after re-enable`);

        if (!ext.stateObj?.indicator)
            throw new Error(`Iteration ${i}: indicator missing after re-enable`);

        if (!ext.stateObj?.hotkeyManager)
            throw new Error(`Iteration ${i}: hotkeyManager missing after re-enable`);

        if (!ext.stateObj?.windowMemory)
            throw new Error(`Iteration ${i}: windowMemory missing after re-enable`);

        if (!ext.stateObj?.hotkeyManager.boundHotkeys.has('hotkey-next'))
            throw new Error(`Iteration ${i}: hotkey-next missing after re-enable`);

        if (!Main.panel.statusArea[uuid])
            throw new Error(`Iteration ${i}: Status area indicator not registered after re-enable`);
    }

    console.log('[TEST] All 20 enable/disable cycles completed successfully without errors!');
}
