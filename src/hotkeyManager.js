// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Compatibility re-export for HotkeyManager

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
} from './hotkeys.js';
