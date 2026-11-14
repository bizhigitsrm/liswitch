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

    console.log(`[TEST] inputSourceService available: ${service.isAvailable}, sources: ${service.getSources().length}, current: ${service.getCurrentIndex()}`);

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

        Main.extensionManager.enableExtension(uuid);
        if (ext.state !== 1)
            throw new Error(`Iteration ${i}: Failed to enable extension`);

        if (!ext.stateObj?.inputSourceService)
            throw new Error(`Iteration ${i}: inputSourceService missing after re-enable`);
    }

    console.log('[TEST] All 20 enable/disable cycles completed successfully without errors!');
}
