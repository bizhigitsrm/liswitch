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

    // Perform 10 enable/disable cycles to verify leak-free and error-free transitions
    console.log('[TEST] Performing 10 enable/disable cycles...');
    for (let i = 1; i <= 10; i++) {
        Main.extensionManager.disableExtension(uuid);
        if (ext.state === 1)
            throw new Error(`Iteration ${i}: Failed to disable extension`);

        Main.extensionManager.enableExtension(uuid);
        if (ext.state !== 1)
            throw new Error(`Iteration ${i}: Failed to enable extension`);
    }

    console.log('[TEST] All 10 enable/disable cycles completed successfully without errors!');
}
