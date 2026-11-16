// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Hotkey management and keybinding conflict resolution for GNOME Shell 51

import Gio from 'gi://Gio';
import * as Log from './log.js';

let Main = null;
let Meta = null;
let Shell = null;

try {
    Main = await import('resource:///org/gnome/shell/ui/main.js');
} catch {
    // Standalone / test environment
}

try {
    Meta = (await import('gi://Meta')).default;
} catch {
    // Standalone / test environment
}

try {
    Shell = (await import('gi://Shell')).default;
} catch {
    // Standalone / test environment
}

// Fallback constants when running in pure GJS outside GNOME Shell
export const KeyBindingFlags = Meta?.KeyBindingFlags ?? {
    NONE: 0,
    PER_WINDOW: 1,
    BUILTIN: 2,
    IS_REVERSED: 4,
    NON_MASKABLE: 8,
    IGNORE_AUTOREPEAT: 16,
};

export const ActionMode = Shell?.ActionMode ?? {
    NONE: 0,
    NORMAL: 1,
    OVERVIEW: 2,
    LOCK_SCREEN: 4,
    UNLOCK_SCREEN: 8,
    LOGIN_SCREEN: 16,
    SYSTEM_MODAL: 32,
    LOOKING_GLASS: 64,
    POPUP: 128,
    ALL: 4294967295,
};

export const HOTKEY_KEYS = [
    'hotkey-next',
    'hotkey-previous',
    'hotkey-switch-1',
    'hotkey-switch-2',
    'hotkey-switch-3',
    'hotkey-switch-4',
    'convert-hotkey',
];

const MODIFIER_KEY_NAMES = new Set([
    'shift_l', 'shift_r', 'shift',
    'control_l', 'control_r', 'ctrl_l', 'ctrl_r', 'control', 'ctrl',
    'alt_l', 'alt_r', 'alt', 'mod1',
    'super_l', 'super_r', 'super', 'mod4',
    'meta_l', 'meta_r', 'meta',
    'hyper_l', 'hyper_r', 'hyper',
    'caps_lock', 'capslock',
    'iso_next_group', 'iso_group_shift', 'mode_switch',
]);

/**
 * Normalize an accelerator shortcut string for robust conflict comparison.
 * Maps synonyms (e.g. <Ctrl> -> <control>, <Mod4> -> <super>), sorts modifier tags,
 * and converts the base key to lowercase.
 *
 * @param {string} shortcut - Raw accelerator string (e.g. '<Alt><Control>space')
 * @returns {string} Normalized string (e.g. '<alt><control>space')
 */
export function normalizeShortcut(shortcut) {
    if (!shortcut || typeof shortcut !== 'string')
        return '';

    const s = shortcut.trim();
    if (!s)
        return '';

    const modifiers = new Set();
    const modRegex = /<(Control|Ctrl|Primary|Alt|Mod1|Shift|Super|Mod4|Meta|Hyper)>/gi;
    let match;
    while ((match = modRegex.exec(s)) !== null) {
        let m = match[1].toLowerCase();
        if (m === 'ctrl' || m === 'primary')
            m = 'control';
        if (m === 'mod1')
            m = 'alt';
        if (m === 'mod4')
            m = 'super';
        modifiers.add(m);
    }

    const key = s.replace(modRegex, '').trim().toLowerCase();
    const sortedMods = Array.from(modifiers).sort();
    return sortedMods.map(m => `<${m}>`).join('') + key;
}

/**
 * Check whether a shortcut consists solely of modifier keys (e.g. Alt+Shift, Super).
 *
 * NOTE on GNOME Shell / Mutter Wayland architecture:
 * Main.wm.addKeybinding() requires a valid non-modifier keysym to grab.
 * If a shortcut consists only of modifiers (like <Alt><Shift>), Mutter cannot bind it
 * via addKeybinding() (keysym is 0, returning Meta.KeyBindingAction.NONE).
 * Pure modifier switching in GNOME is handled exclusively at the libxkbcommon level via
 * xkb-options ('grp:alt_shift_toggle', etc.) emitting 'modifiers-accelerator-activated'.
 *
 * @param {string} shortcut - Shortcut string
 * @returns {boolean} True if the shortcut has no non-modifier key
 */
export function isModifierOnlyShortcut(shortcut) {
    if (!shortcut || typeof shortcut !== 'string')
        return false;

    const s = shortcut.trim();
    if (!s)
        return false;

    const modTagRegex = /<(Control|Ctrl|Primary|Alt|Mod1|Shift|Super|Mod4|Meta|Hyper)>/gi;
    const remainingKey = s.replace(modTagRegex, '').trim().toLowerCase();

    if (!remainingKey)
        return true;

    return MODIFIER_KEY_NAMES.has(remainingKey);
}

/**
 * Scan system schemas for conflicts with Liswitch hotkeys.
 *
 * Checks:
 * 1. org.gnome.desktop.wm.keybindings (including switch-input-source, switch-input-source-backward)
 * 2. org.gnome.settings-daemon.plugins.media-keys
 *
 * @param {Gio.Settings} settings - Liswitch GSettings instance
 * @param {object} [options]
 * @param {object|null} [options.schemaSource] - Schema source override
 * @param {Function|null} [options.getSettings] - Settings factory override
 * @returns {Array<object>} List of detected conflicts
 */
export function checkConflicts(settings, {schemaSource = null, getSettings = null} = {}) {
    if (!settings)
        return [];

    const ourShortcuts = [];
    for (const key of HOTKEY_KEYS) {
        try {
            const arr = settings.get_strv(key);
            for (const sc of arr) {
                if (sc && sc.trim()) {
                    ourShortcuts.push({
                        hotkeyKey: key,
                        raw: sc,
                        normalized: normalizeShortcut(sc),
                    });
                }
            }
        } catch {
            // Ignore schema reading errors
        }
    }

    if (ourShortcuts.length === 0)
        return [];

    const conflicts = [];
    const sSource = schemaSource || Gio.SettingsSchemaSource.get_default();
    if (!sSource)
        return [];

    const systemSchemasToCheck = [
        'org.gnome.desktop.wm.keybindings',
        'org.gnome.settings-daemon.plugins.media-keys',
    ];

    const createSettings = getSettings || (id => new Gio.Settings({schema_id: id}));

    for (const schemaId of systemSchemasToCheck) {
        const schema = sSource.lookup(schemaId, true);
        if (!schema)
            continue;

        let sysSettings = null;
        try {
            sysSettings = createSettings(schemaId);
        } catch {
            continue;
        }

        const keys = schema.list_keys();
        for (const sysKey of keys) {
            const keyInfo = schema.get_key(sysKey);
            const typeStr = keyInfo.get_value_type().dup_string();
            if (typeStr !== 'as' && typeStr !== 's')
                continue;

            let sysVals = [];
            try {
                if (typeStr === 'as')
                    sysVals = sysSettings.get_strv(sysKey);
                else
                    sysVals = [sysSettings.get_string(sysKey)];
            } catch {
                continue;
            }

            for (const sysVal of sysVals) {
                if (!sysVal || !sysVal.trim())
                    continue;

                const sysNorm = normalizeShortcut(sysVal);
                for (const our of ourShortcuts) {
                    if (our.normalized === sysNorm) {
                        conflicts.push({
                            hotkeyKey: our.hotkeyKey,
                            shortcut: our.raw,
                            normalized: our.normalized,
                            schemaId,
                            schemaKey: sysKey,
                            schemaType: typeStr,
                            currentValue: typeStr === 'as' ? sysVals : sysVal,
                        });
                    }
                }
            }
        }
    }

    return conflicts;
}

/**
 * Find another Liswitch hotkey key that already uses the given accelerator shortcut.
 *
 * @param {Gio.Settings|object} settings - Liswitch GSettings instance
 * @param {string} currentKeyName - Key being assigned (excluded from comparison)
 * @param {string} newShortcut - Accelerator string to test
 * @returns {string|null} Conflicting GSettings key name, or null
 */
export function findDuplicateHotkeyKey(settings, currentKeyName, newShortcut) {
    if (!settings || !newShortcut || typeof newShortcut !== 'string' || !newShortcut.trim())
        return null;

    const targetNorm = normalizeShortcut(newShortcut);
    if (!targetNorm)
        return null;

    for (const otherKey of HOTKEY_KEYS) {
        if (otherKey === currentKeyName)
            continue;

        try {
            const otherArr = settings.get_strv(otherKey);
            for (const item of otherArr) {
                if (normalizeShortcut(item) === targetNorm)
                    return otherKey;
            }
        } catch {
            // Ignore schema reading errors
        }
    }

    return null;
}

/**
 * Safely check whether a GSettings key exists on the settings instance
 * (handles both real Gio.Settings and test mocks).
 *
 * @param {Gio.Settings|object} settings
 * @param {string} key
 * @returns {boolean}
 */
function _hasSettingsKey(settings, key) {
    if (!settings)
        return false;
    if (settings.settings_schema && typeof settings.settings_schema.has_key === 'function')
        return settings.settings_schema.has_key(key);
    return true;
}

/**
 * Safely read and parse a JSON dictionary from a GSettings string key.
 *
 * @param {Gio.Settings|object} settings
 * @param {string} key
 * @returns {object}
 */
function _readJsonMap(settings, key) {
    if (!_hasSettingsKey(settings, key) || typeof settings.get_string !== 'function')
        return {};
    try {
        const raw = settings.get_string(key);
        if (raw && raw.trim()) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
                return parsed;
        }
    } catch {
        // Ignore malformed JSON
    }
    return {};
}

/**
 * Safely serialize and store a JSON dictionary in a GSettings string key.
 *
 * @param {Gio.Settings|object} settings
 * @param {string} key
 * @param {object} map
 */
function _writeJsonMap(settings, key, map) {
    if (!_hasSettingsKey(settings, key) || typeof settings.set_string !== 'function')
        return;
    settings.set_string(key, JSON.stringify(map));
}

/**
 * Free a conflicting shortcut in the system GSettings schema after backing up
 * the original value into Liswitch's GSettings schema and recording user override intent.
 *
 * @param {object} conflict - Conflict descriptor from checkConflicts()
 * @param {Gio.Settings} settings - Liswitch GSettings instance
 * @param {object} [options]
 * @param {Function|null} [options.getSettings] - Settings factory override
 * @returns {boolean} True on success
 */
export function freeSystemShortcut(conflict, settings, {getSettings = null} = {}) {
    if (!conflict || !settings)
        return false;

    const {schemaId, schemaKey, schemaType, normalized} = conflict;
    const createSettings = getSettings || (id => new Gio.Settings({schema_id: id}));

    try {
        const sysSettings = createSettings(schemaId);

        // 1. Read current system value
        let originalValue;
        if (schemaType === 'as')
            originalValue = sysSettings.get_strv(schemaKey);
        else
            originalValue = sysSettings.get_string(schemaKey);

        // 2. Save into Liswitch backup JSON map (preserve earliest original value if already backed up)
        const backupMap = _readJsonMap(settings, 'backup-system-shortcuts');
        const backupKey = `${schemaId}:${schemaKey}`;

        if (!backupMap[backupKey]) {
            backupMap[backupKey] = {
                schemaId,
                schemaKey,
                schemaType,
                value: originalValue,
            };
            _writeJsonMap(settings, 'backup-system-shortcuts', backupMap);

            // Also update dedicated backup keys for switch-input-source if applicable
            if (schemaId === 'org.gnome.desktop.wm.keybindings') {
                if (schemaKey === 'switch-input-source' && Array.isArray(originalValue))
                    settings.set_strv('backup-system-switch-keys', originalValue);
                else if (schemaKey === 'switch-input-source-backward' && Array.isArray(originalValue))
                    settings.set_strv('backup-system-switch-backward-keys', originalValue);
            }
        }

        // 3. Persist user's explicit override intent so lock/unlock cycles re-apply it
        const freedMap = _readJsonMap(settings, 'freed-system-shortcuts');
        const existingIntent = freedMap[backupKey];
        const intentShortcuts = Array.isArray(existingIntent?.shortcuts)
            ? [...existingIntent.shortcuts]
            : [];
        if (normalized && !intentShortcuts.includes(normalized))
            intentShortcuts.push(normalized);

        freedMap[backupKey] = {
            schemaId,
            schemaKey,
            schemaType,
            shortcuts: intentShortcuts,
        };
        _writeJsonMap(settings, 'freed-system-shortcuts', freedMap);

        // 4. Modify system settings to release the shortcut
        if (schemaType === 'as') {
            const filtered = (originalValue || []).filter(item => normalizeShortcut(item) !== normalized);
            sysSettings.set_strv(schemaKey, filtered);
        } else {
            sysSettings.set_string(schemaKey, '');
        }

        Log.info(`HotkeyManager: freed conflicting shortcut "${conflict.shortcut}" in ${schemaId} -> ${schemaKey}`);
        return true;
    } catch (e) {
        Log.warn(`HotkeyManager: failed to free shortcut in ${schemaId} -> ${schemaKey}:`, e.message);
        return false;
    }
}

/**
 * Restore a previously freed system shortcut from Liswitch's backup into the system schema,
 * and clear the user's explicit override intent for that system key.
 *
 * @param {string} schemaId - System schema ID
 * @param {string} schemaKey - System key name
 * @param {Gio.Settings} settings - Liswitch GSettings instance
 * @param {object} [options]
 * @param {Function|null} [options.getSettings] - Settings factory override
 * @returns {boolean} True on success
 */
export function restoreSystemShortcut(schemaId, schemaKey, settings, {getSettings = null} = {}) {
    if (!schemaId || !schemaKey || !settings)
        return false;

    const backupKey = `${schemaId}:${schemaKey}`;
    const createSettings = getSettings || (id => new Gio.Settings({schema_id: id}));

    try {
        // Always remove explicit user intent on manual restore
        const freedMap = _readJsonMap(settings, 'freed-system-shortcuts');
        if (Object.prototype.hasOwnProperty.call(freedMap, backupKey)) {
            delete freedMap[backupKey];
            _writeJsonMap(settings, 'freed-system-shortcuts', freedMap);
        }

        const backupMap = _readJsonMap(settings, 'backup-system-shortcuts');
        const entry = backupMap[backupKey];
        if (!entry) {
            Log.debug(`restoreSystemShortcut: no backup entry found for ${backupKey}`);
            return false;
        }

        const sysSettings = createSettings(schemaId);
        if (entry.schemaType === 'as')
            sysSettings.set_strv(schemaKey, entry.value || []);
        else
            sysSettings.set_string(schemaKey, entry.value || '');

        delete backupMap[backupKey];
        _writeJsonMap(settings, 'backup-system-shortcuts', backupMap);

        // Clear dedicated backup keys if applicable
        if (schemaId === 'org.gnome.desktop.wm.keybindings') {
            if (schemaKey === 'switch-input-source')
                settings.set_strv('backup-system-switch-keys', []);
            else if (schemaKey === 'switch-input-source-backward')
                settings.set_strv('backup-system-switch-backward-keys', []);
        }

        Log.info(`HotkeyManager: restored system shortcut in ${schemaId} -> ${schemaKey}`);
        return true;
    } catch (e) {
        Log.warn(`HotkeyManager: failed to restore shortcut in ${schemaId} -> ${schemaKey}:`, e.message);
        return false;
    }
}

/**
 * Restore all system shortcuts currently recorded in Liswitch's backup storage.
 * Called upon disable() and extension removal (preserving freed-system-shortcuts
 * unless clearIntent is true so temporary disables such as screen lock restore
 * cleanly on unlock).
 *
 * @param {Gio.Settings} settings - Liswitch GSettings instance
 * @param {object} [options]
 * @param {Function|null} [options.getSettings] - Settings factory override
 * @param {boolean} [options.clearIntent=false] - Also clear freed-system-shortcuts intent
 * @returns {number} Number of restored settings
 */
export function restoreAllSystemShortcuts(settings, {getSettings = null, clearIntent = false} = {}) {
    if (!settings)
        return 0;

    let restoredCount = 0;
    const createSettings = getSettings || (id => new Gio.Settings({schema_id: id}));

    try {
        const backupMap = _readJsonMap(settings, 'backup-system-shortcuts');

        for (const [key, entry] of Object.entries(backupMap)) {
            try {
                const sysSettings = createSettings(entry.schemaId);
                if (entry.schemaType === 'as')
                    sysSettings.set_strv(entry.schemaKey, entry.value || []);
                else
                    sysSettings.set_string(entry.schemaKey, entry.value || '');

                restoredCount++;
                Log.debug(`HotkeyManager: restored system shortcut ${entry.schemaId} -> ${entry.schemaKey}`);
            } catch (e) {
                Log.warn(`HotkeyManager: error restoring ${key}:`, e.message);
            }
        }

        if (Object.keys(backupMap).length > 0) {
            _writeJsonMap(settings, 'backup-system-shortcuts', {});
            settings.set_strv('backup-system-switch-keys', []);
            settings.set_strv('backup-system-switch-backward-keys', []);
        }

        if (clearIntent) {
            const freedMap = _readJsonMap(settings, 'freed-system-shortcuts');
            if (Object.keys(freedMap).length > 0)
                _writeJsonMap(settings, 'freed-system-shortcuts', {});
        }
    } catch (e) {
        Log.warn('HotkeyManager: error in restoreAllSystemShortcuts:', e.message);
    }

    return restoredCount;
}

/**
 * Re-apply user-approved system shortcut overrides after temporary disable() (e.g. screen lock).
 * Only frees conflicts that both match an active Liswitch hotkey and are listed in
 * `freed-system-shortcuts`.
 *
 * @param {Gio.Settings} settings - Liswitch GSettings instance
 * @param {object} [options]
 * @param {object|null} [options.schemaSource] - Schema source override
 * @param {Function|null} [options.getSettings] - Settings factory override
 * @returns {number} Number of re-applied overrides
 */
export function reapplyFreedSystemShortcuts(settings, {schemaSource = null, getSettings = null} = {}) {
    if (!settings)
        return 0;

    const freedMap = _readJsonMap(settings, 'freed-system-shortcuts');
    if (Object.keys(freedMap).length === 0)
        return 0;

    const conflicts = checkConflicts(settings, {schemaSource, getSettings});
    if (conflicts.length === 0)
        return 0;

    let reappliedCount = 0;
    for (const conflict of conflicts) {
        const backupKey = `${conflict.schemaId}:${conflict.schemaKey}`;
        const intent = freedMap[backupKey];
        if (!intent || !Array.isArray(intent.shortcuts))
            continue;

        if (intent.shortcuts.includes(conflict.normalized)) {
            if (freeSystemShortcut(conflict, settings, {getSettings}))
                reappliedCount++;
        }
    }

    return reappliedCount;
}

/**
 * Remove stale system override intents (and restore their backups if active) when
 * none of Liswitch's configured hotkeys use the overridden shortcut anymore.
 *
 * @param {Gio.Settings} settings - Liswitch GSettings instance
 * @param {object} [options]
 * @param {Function|null} [options.getSettings] - Settings factory override
 * @returns {number} Number of cleaned-up override entries
 */
export function cleanupUnusedSystemOverrides(settings, {getSettings = null} = {}) {
    if (!settings)
        return 0;

    const freedMap = _readJsonMap(settings, 'freed-system-shortcuts');
    const freedKeys = Object.keys(freedMap);
    if (freedKeys.length === 0)
        return 0;

    const activeShortcuts = new Set();
    for (const key of HOTKEY_KEYS) {
        try {
            const arr = settings.get_strv(key);
            for (const sc of arr) {
                const norm = normalizeShortcut(sc);
                if (norm)
                    activeShortcuts.add(norm);
            }
        } catch {
            // Ignore
        }
    }

    const backupMap = _readJsonMap(settings, 'backup-system-shortcuts');
    let cleanedCount = 0;
    let freedModified = false;

    for (const backupKey of freedKeys) {
        const entry = freedMap[backupKey];
        const shortcuts = Array.isArray(entry?.shortcuts) ? entry.shortcuts : [];
        const remaining = shortcuts.filter(s => activeShortcuts.has(s));

        if (remaining.length === 0) {
            if (backupMap[backupKey]) {
                restoreSystemShortcut(entry.schemaId, entry.schemaKey, settings, {getSettings});
                // restoreSystemShortcut already updated freed-system-shortcuts on disk; sync local copy
                delete freedMap[backupKey];
            } else {
                delete freedMap[backupKey];
                freedModified = true;
            }
            cleanedCount++;
        } else if (remaining.length !== shortcuts.length) {
            freedMap[backupKey] = {
                ...entry,
                shortcuts: remaining,
            };
            freedModified = true;
        }
    }

    if (freedModified)
        _writeJsonMap(settings, 'freed-system-shortcuts', freedMap);

    return cleanedCount;
}

/**
 * HotkeyManager
 *
 * Manages registration, unregistration, dynamic re-binding, and conflict handling
 * for custom layout switching shortcuts in GNOME Shell 51.
 */
export class HotkeyManager {
    /**
     * @param {Gio.Settings} settings - Liswitch GSettings instance
     * @param {InputSourceService} inputSourceService - Service for switching input sources
     * @param {object} [options]
     * @param {object|null} [options.wm] - Window manager override (e.g. mock WM for testing)
     * @param {Function|null} [options.getSettings] - System settings factory override (for testing)
     * @param {object|null} [options.schemaSource] - Schema source override (for testing)
     */
    constructor(settings, inputSourceService, {wm = null, getSettings = null, schemaSource = null} = {}) {
        this._settings = settings;
        this._inputSourceService = inputSourceService;
        this._wm = wm || Main?.wm || null;
        this._getSettings = getSettings;
        this._schemaSource = schemaSource;

        this._boundHotkeys = new Set();
        this._settingsSignals = [];
        this._enabled = false;
    }

    /**
     * Enable hotkey manager: re-apply user-approved overrides, check conflicts,
     * register keybindings, and listen for changes.
     */
    enable() {
        if (this._enabled)
            return;
        this._enabled = true;

        if (!this._wm && Main?.wm)
            this._wm = Main.wm;

        const checkOpts = {
            schemaSource: this._schemaSource,
            getSettings: this._getSettings,
        };

        // Re-apply system shortcut overrides explicitly approved by the user
        // (e.g. after a temporary disable() from screen lock / session mode switch)
        const reapplied = reapplyFreedSystemShortcuts(this._settings, checkOpts);
        if (reapplied > 0)
            Log.debug(`HotkeyManager: re-applied ${reapplied} user-approved system shortcut override(s)`);

        // Audit remaining conflicts with system keybindings
        const conflicts = checkConflicts(this._settings, checkOpts);
        for (const c of conflicts) {
            Log.warn(`Hotkey conflict detected: shortcut "${c.shortcut}" (${c.hotkeyKey}) is currently assigned to ${c.schemaId} -> ${c.schemaKey}`);
        }

        // Register initial keybindings
        this._registerAll();

        // Listen for GSettings changes to dynamically update keybindings without restarting Shell
        if (this._settings) {
            for (const key of HOTKEY_KEYS) {
                if (key === 'convert-hotkey')
                    continue;
                const id = this._settings.connect(`changed::${key}`, () => {
                    this._onHotkeySettingChanged(key);
                });
                this._settingsSignals.push({obj: this._settings, id});
            }

            if (_hasSettingsKey(this._settings, 'freed-system-shortcuts')) {
                const freedId = this._settings.connect('changed::freed-system-shortcuts', () => {
                    if (this._enabled)
                        this._registerAll();
                });
                this._settingsSignals.push({obj: this._settings, id: freedId});
            }
        }

        Log.debug(`HotkeyManager: enabled (registered keys: ${Array.from(this._boundHotkeys).join(', ') || 'none'})`);
    }

    /**
     * Register all configured hotkeys with Main.wm.
     */
    _registerAll() {
        this._bindKey('hotkey-next', () => this._onHotkeyNext());
        this._bindKey('hotkey-previous', () => this._onHotkeyPrevious());
        this._bindKey('hotkey-switch-1', () => this._onHotkeySwitch(0));
        this._bindKey('hotkey-switch-2', () => this._onHotkeySwitch(1));
        this._bindKey('hotkey-switch-3', () => this._onHotkeySwitch(2));
        this._bindKey('hotkey-switch-4', () => this._onHotkeySwitch(3));
    }

    /**
     * Bind a single shortcut key with the window manager.
     *
     * @param {string} name - GSettings key name
     * @param {Function} handler - Keybinding handler function
     */
    _bindKey(name, handler) {
        if (!this._wm || !this._settings)
            return;

        // Unbind any previous binding for this name first
        this._unbindKey(name);

        const shortcuts = this._settings.get_strv(name);
        const hasValidShortcut = shortcuts.some(s => s && s.trim().length > 0);
        if (!hasValidShortcut)
            return;

        // Warn if user attempted a modifier-only binding
        for (const s of shortcuts) {
            if (isModifierOnlyShortcut(s)) {
                Log.warn(`HotkeyManager: shortcut "${s}" for "${name}" consists only of modifiers. GNOME Shell cannot bind modifier-only shortcuts via addKeybinding().`);
            }
        }

        try {
            // Register with Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW
            // This enables switching in standard windows and inside the Activities Overview,
            // while blocking in the lock screen / modal password dialogs.
            const modes = ActionMode.NORMAL | ActionMode.OVERVIEW;
            const flags = KeyBindingFlags.NONE;

            const action = this._wm.addKeybinding(
                name,
                this._settings,
                flags,
                modes,
                handler
            );

            if (action !== 0) { // Meta.KeyBindingAction.NONE = 0
                this._boundHotkeys.add(name);
                Log.debug(`HotkeyManager: registered keybinding "${name}" (action: ${action})`);
            } else {
                Log.warn(`HotkeyManager: addKeybinding returned NONE for "${name}"`);
            }
        } catch (e) {
            Log.warn(`HotkeyManager: failed to register keybinding "${name}":`, e.message);
        }
    }

    /**
     * Unbind a single shortcut key from the window manager.
     *
     * @param {string} name - GSettings key name
     */
    _unbindKey(name) {
        if (!this._wm)
            return;

        if (this._boundHotkeys.has(name)) {
            try {
                this._wm.removeKeybinding(name);
                this._boundHotkeys.delete(name);
                Log.debug(`HotkeyManager: removed keybinding "${name}"`);
            } catch (e) {
                Log.warn(`HotkeyManager: error removing keybinding "${name}":`, e.message);
            }
        }
    }

    /**
     * Handler invoked when a hotkey GSettings key changes.
     * Re-binds the updated shortcut immediately without restarting Shell.
     *
     * @param {string} name - Key name
     */
    _onHotkeySettingChanged(name) {
        Log.debug(`HotkeyManager: setting "${name}" changed, re-registering binding`);

        switch (name) {
        case 'hotkey-next':
            this._bindKey(name, () => this._onHotkeyNext());
            break;
        case 'hotkey-previous':
            this._bindKey(name, () => this._onHotkeyPrevious());
            break;
        case 'hotkey-switch-1':
            this._bindKey(name, () => this._onHotkeySwitch(0));
            break;
        case 'hotkey-switch-2':
            this._bindKey(name, () => this._onHotkeySwitch(1));
            break;
        case 'hotkey-switch-3':
            this._bindKey(name, () => this._onHotkeySwitch(2));
            break;
        case 'hotkey-switch-4':
            this._bindKey(name, () => this._onHotkeySwitch(3));
            break;
        default:
            break;
        }
    }

    /**
     * Action handler for cyclic next layout.
     */
    _onHotkeyNext() {
        Log.debug('HotkeyManager: hotkey-next triggered');
        if (this._inputSourceService)
            this._inputSourceService.next();
    }

    /**
     * Action handler for cyclic previous layout.
     */
    _onHotkeyPrevious() {
        Log.debug('HotkeyManager: hotkey-previous triggered');
        if (this._inputSourceService)
            this._inputSourceService.previous();
    }

    /**
     * Action handler for direct layout activation.
     *
     * @param {number} index - Layout index (0..3)
     */
    _onHotkeySwitch(index) {
        Log.debug(`HotkeyManager: hotkey-switch-${index + 1} triggered (activating index ${index})`);
        if (this._inputSourceService)
            this._inputSourceService.activate(index, true);
    }

    /**
     * Destroy hotkey manager: unbind all keybindings, disconnect signals, and restore
     * any user-freed system shortcuts. Strictly synchronous.
     */
    destroy() {
        if (!this._enabled)
            return;
        this._enabled = false;

        Log.debug('HotkeyManager: destroying and releasing all keybindings');

        // Disconnect GSettings listeners
        for (const {obj, id} of this._settingsSignals) {
            try {
                obj.disconnect(id);
            } catch {
                // Ignore
            }
        }
        this._settingsSignals = [];

        // Unbind all registered keybindings
        for (const name of Array.from(this._boundHotkeys)) {
            this._unbindKey(name);
        }
        this._boundHotkeys.clear();

        // Restore any system shortcuts freed during user configuration
        // (preserving freed-system-shortcuts intent for temporary disables such as screen lock)
        restoreAllSystemShortcuts(this._settings, {getSettings: this._getSettings});

        this._settings = null;
        this._inputSourceService = null;
        this._wm = null;
        this._getSettings = null;
        this._schemaSource = null;
    }

    /**
     * Currently active registered key names.
     *
     * @returns {Set<string>}
     */
    get boundHotkeys() {
        return this._boundHotkeys;
    }
}
