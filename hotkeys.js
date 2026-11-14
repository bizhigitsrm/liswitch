// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Root re-export for hotkey management

export {
    HotkeyManager,
    HotkeyManager as default,
    HOTKEY_KEYS,
    KeyBindingFlags,
    ActionMode,
    normalizeShortcut,
    isModifierOnlyShortcut,
    checkConflicts,
    freeSystemShortcut,
    restoreSystemShortcut,
    restoreAllSystemShortcuts,
} from './src/hotkeys.js';
