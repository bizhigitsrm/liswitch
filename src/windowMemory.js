// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Layout memory service for GNOME Shell 51

import Gio from 'gi://Gio';
import * as Log from './log.js';

/**
 * Maximum number of entries kept in memory before evicting the oldest (LRU).
 */
export const MAX_MEMORY_ENTRIES = 500;

/**
 * LRU (Least Recently Used) cache map.
 * Caps entries to maxSize and evicts the oldest entries first.
 */
export class LruMap {
    /**
     * @param {number} [maxSize=500]
     */
    constructor(maxSize = MAX_MEMORY_ENTRIES) {
        this._maxSize = maxSize;
        this._map = new Map();
    }

    /**
     * Retrieve value and mark key as most recently used.
     *
     * @param {string} key
     * @returns {any}
     */
    get(key) {
        if (!this._map.has(key))
            return undefined;

        const val = this._map.get(key);
        // Move to end (most recently used in JavaScript Map)
        this._map.delete(key);
        this._map.set(key, val);
        return val;
    }

    /**
     * Store key-value pair and evict oldest if limit exceeded.
     *
     * @param {string} key
     * @param {any} val
     */
    set(key, val) {
        if (this._map.has(key))
            this._map.delete(key);

        this._map.set(key, val);

        if (this._map.size > this._maxSize) {
            const oldestKey = this._map.keys().next().value;
            if (oldestKey !== undefined)
                this._map.delete(oldestKey);
        }
    }

    /**
     * Check if key exists in cache.
     *
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
        return this._map.has(key);
    }

    /**
     * Delete key from cache.
     *
     * @param {string} key
     * @returns {boolean}
     */
    delete(key) {
        return this._map.delete(key);
    }

    /**
     * Clear all cached entries.
     */
    clear() {
        this._map.clear();
    }

    /**
     * Return current number of entries.
     *
     * @returns {number}
     */
    get size() {
        return this._map.size;
    }

    /**
     * Return iterator over keys.
     *
     * @returns {IterableIterator<string>}
     */
    keys() {
        return this._map.keys();
    }
}

/**
 * Compute application identifier key for a Meta.Window.
 * Priority: sandboxed_app_id -> gtk_application_id -> wm_class -> null.
 *
 * @param {Meta.Window|object} window
 * @returns {string|null}
 */
export function getAppKey(window) {
    if (!window)
        return null;

    let appId = null;
    if (typeof window.get_sandboxed_app_id === 'function')
        appId = window.get_sandboxed_app_id();

    if (!appId && typeof window.get_gtk_application_id === 'function')
        appId = window.get_gtk_application_id();

    if (!appId && typeof window.get_wm_class === 'function')
        appId = window.get_wm_class();

    if (typeof appId === 'string' && appId.trim().length > 0)
        return appId.trim();

    return null;
}

/**
 * Compute unique window identifier key for a Meta.Window.
 *
 * @param {Meta.Window|object} window
 * @returns {string|null}
 */
export function getWindowKey(window) {
    if (!window)
        return null;

    if (typeof window.get_id === 'function') {
        const id = window.get_id();
        return id !== null && id !== undefined ? String(id) : null;
    }

    return null;
}

/**
 * Check whether a window belongs to an application excluded from layout memory.
 *
 * @param {Meta.Window|object} window
 * @param {string[]} excludedList
 * @returns {boolean}
 */
export function isWindowExcluded(window, excludedList) {
    if (!window || !Array.isArray(excludedList) || excludedList.length === 0)
        return false;

    const identifiers = [];

    if (typeof window.get_sandboxed_app_id === 'function') {
        const id = window.get_sandboxed_app_id();
        if (id)
            identifiers.push(id.toLowerCase());
    }

    if (typeof window.get_gtk_application_id === 'function') {
        const id = window.get_gtk_application_id();
        if (id)
            identifiers.push(id.toLowerCase());
    }

    if (typeof window.get_wm_class === 'function') {
        const id = window.get_wm_class();
        if (id)
            identifiers.push(id.toLowerCase());
    }

    if (typeof window.get_wm_class_instance === 'function') {
        const id = window.get_wm_class_instance();
        if (id)
            identifiers.push(id.toLowerCase());
    }

    const set = new Set(excludedList.map(s => String(s).trim().toLowerCase()).filter(s => s.length > 0));
    return identifiers.some(id => set.has(id));
}

/**
 * WindowMemory
 *
 * Tracks window and application focus changes in GNOME Shell on Wayland,
 * remembers layout per application or window in memory, and restores it silently
 * without disrupting the system MRU order.
 */
export class WindowMemory {
    /**
     * @param {Gio.Settings} settings - liswitch GSettings instance
     * @param {InputSourceService} inputSourceService - active InputSourceService instance
     */
    constructor(settings, inputSourceService) {
        this._settings = settings;
        this._inputSourceService = inputSourceService;

        this._appMemory = new LruMap(MAX_MEMORY_ENTRIES);
        this._windowMemory = new LruMap(MAX_MEMORY_ENTRIES);

        this._trackedWindows = new Map(); // Meta.Window -> signalId
        this._currentWindow = null;

        this._isRestoring = false;
        this._enabled = false;

        this._display = null;
        this._displaySignalId = 0;
        this._inputSourceSignalId = 0;
        this._settingsSignals = [];
        this._desktopSettings = null;
        this._desktopSignalId = 0;
        this._systemPerWindowActive = false;
    }

    /**
     * Enable the memory service and connect to Shell focus notifications.
     *
     * @param {object} [options]
     * @param {Meta.Display|object|null} [options.display] - Display override for testing
     * @param {Gio.Settings|null} [options.desktopSettings] - Desktop settings override for testing
     */
    enable({display = null, desktopSettings = null} = {}) {
        if (this._enabled) {
            Log.debug('WindowMemory: already enabled');
            return;
        }
        this._enabled = true;

        // 1. Obtain display
        if (display) {
            this._display = display;
        } else if (typeof global !== 'undefined' && global.display) {
            this._display = global.display;
        } else {
            Log.warn('WindowMemory: global.display is unavailable');
            this._display = null;
        }

        // 2. Obtain org.gnome.desktop.input-sources to detect system per-window
        if (desktopSettings) {
            this._desktopSettings = desktopSettings;
        } else {
            try {
                this._desktopSettings = new Gio.Settings({
                    schema_id: 'org.gnome.desktop.input-sources',
                });
            } catch (e) {
                Log.warn(`WindowMemory: failed to access org.gnome.desktop.input-sources: ${e.message}`);
                this._desktopSettings = null;
            }
        }

        this._updateSystemPerWindowState();

        if (this._desktopSettings) {
            this._desktopSignalId = this._desktopSettings.connect('changed::per-window', () => {
                this._updateSystemPerWindowState();
            });
        }

        // 3. Connect to focus-window notification
        if (this._display && typeof this._display.connect === 'function') {
            this._displaySignalId = this._display.connect('notify::focus-window', () => {
                this._onFocusWindowChanged();
            });
        }

        // 4. Connect to InputSourceService layout changes
        if (this._inputSourceService && typeof this._inputSourceService.connect === 'function') {
            this._inputSourceSignalId = this._inputSourceService.connect('current-changed', (_service, index) => {
                this._onCurrentChanged(index);
            });
        }

        // 5. Connect to extension settings
        if (this._settings) {
            const modeId = this._settings.connect('changed::memory-mode', () => {
                this._onMemoryModeChanged();
            });
            const appsId = this._settings.connect('changed::memory-excluded-apps', () => {
                Log.debug('WindowMemory: memory-excluded-apps setting changed');
            });
            const defaultId = this._settings.connect('changed::default-layout-mode', () => {
                Log.debug('WindowMemory: default-layout-mode setting changed');
            });
            this._settingsSignals.push(modeId, appsId, defaultId);
        }

        // 6. Check initial focus window
        const initialWindow = this._display?.focus_window ?? null;
        if (initialWindow) {
            this._currentWindow = initialWindow;
            this._trackWindow(initialWindow);

            const mode = this.memoryMode;
            const excluded = this.excludedApps;
            if (mode !== 'off' && !isWindowExcluded(initialWindow, excluded)) {
                // Seed initial window with current layout if not in history
                this._seedInitialWindow(initialWindow, mode);
            }
        }

        Log.debug(`WindowMemory: enabled (mode: ${this.memoryMode}, system per-window: ${this._systemPerWindowActive})`);
    }

    /**
     * Synchronously disconnect all signals, clean up window handlers, and clear memory.
     */
    destroy() {
        if (!this._enabled)
            return;
        this._enabled = false;

        Log.debug('WindowMemory: destroying and clearing memory');

        // Disconnect all tracked window signals
        for (const [window, signalId] of this._trackedWindows) {
            try {
                window.disconnect(signalId);
            } catch {
                // Window may already be finalized
            }
        }
        this._trackedWindows.clear();

        // Disconnect display focus notification
        if (this._display && this._displaySignalId) {
            try {
                this._display.disconnect(this._displaySignalId);
            } catch (e) {
                Log.warn(`WindowMemory: error disconnecting display signal: ${e.message}`);
            }
            this._displaySignalId = 0;
        }
        this._display = null;

        // Disconnect InputSourceService current-changed signal
        if (this._inputSourceService && this._inputSourceSignalId) {
            try {
                this._inputSourceService.disconnect(this._inputSourceSignalId);
            } catch (e) {
                Log.warn(`WindowMemory: error disconnecting inputSourceService signal: ${e.message}`);
            }
            this._inputSourceSignalId = 0;
        }

        // Disconnect extension settings signals
        if (this._settings && this._settingsSignals.length > 0) {
            for (const id of this._settingsSignals) {
                try {
                    this._settings.disconnect(id);
                } catch {
                    // Ignore
                }
            }
            this._settingsSignals = [];
        }

        // Disconnect desktop settings signal
        if (this._desktopSettings && this._desktopSignalId) {
            try {
                this._desktopSettings.disconnect(this._desktopSignalId);
            } catch {
                // Ignore
            }
            this._desktopSignalId = 0;
        }
        this._desktopSettings = null;

        // Clear all memory caches
        this._appMemory.clear();
        this._windowMemory.clear();
        this._currentWindow = null;
        this._isRestoring = false;
        this._systemPerWindowActive = false;
    }

    /**
     * Clear all recorded window and application layouts from memory.
     */
    clearMemory() {
        this._appMemory.clear();
        this._windowMemory.clear();
        Log.debug('WindowMemory: in-memory cache cleared');
    }

    // === Public properties ===

    /**
     * Current persistence mode ('off', 'per-app', 'per-window').
     *
     * @returns {'off'|'per-app'|'per-window'}
     */
    get memoryMode() {
        return this._settings?.get_string('memory-mode') ?? 'per-app';
    }

    /**
     * Default layout policy for new windows ('keep' or 'first').
     *
     * @returns {'keep'|'first'}
     */
    get defaultLayoutMode() {
        return this._settings?.get_string('default-layout-mode') ?? 'keep';
    }

    /**
     * List of application identifiers excluded from layout memory.
     *
     * @returns {string[]}
     */
    get excludedApps() {
        return this._settings?.get_strv('memory-excluded-apps') ?? [];
    }

    /**
     * Whether the GNOME Shell system per-window memory option is active.
     *
     * @returns {boolean}
     */
    get isSystemPerWindowActive() {
        return this._systemPerWindowActive;
    }

    /**
     * Currently focused window tracked by the service.
     *
     * @returns {Meta.Window|null}
     */
    get currentWindow() {
        return this._currentWindow;
    }

    /**
     * Current number of recorded applications in memory.
     *
     * @returns {number}
     */
    get appMemorySize() {
        return this._appMemory.size;
    }

    /**
     * Current number of recorded windows in memory.
     *
     * @returns {number}
     */
    get windowMemorySize() {
        return this._windowMemory.size;
    }

    /**
     * Whether a layout restoration is currently underway.
     *
     * @returns {boolean}
     */
    get isRestoring() {
        return this._isRestoring;
    }

    /**
     * Get saved layout entry for an application key (for inspection / testing).
     *
     * @param {string} appKey
     * @returns {{id: string, index: number}|undefined}
     */
    getSavedAppLayout(appKey) {
        return this._appMemory.get(appKey);
    }

    /**
     * Get saved layout entry for a window key (for inspection / testing).
     *
     * @param {string} windowKey
     * @returns {{id: string, index: number}|undefined}
     */
    getSavedWindowLayout(windowKey) {
        return this._windowMemory.get(windowKey);
    }

    // === Internal logic & signal handlers ===

    _updateSystemPerWindowState() {
        let active = false;
        try {
            active = this._desktopSettings?.get_boolean('per-window') ?? false;
        } catch {
            active = false;
        }

        if (this._systemPerWindowActive !== active) {
            this._systemPerWindowActive = active;
            if (active) {
                Log.warn(
                    'WindowMemory: system per-window layout memory is active in org.gnome.desktop.input-sources; ' +
                    'liswitch window memory is suspended to avoid duplicate switching'
                );
            } else {
                Log.debug('WindowMemory: system per-window layout memory is inactive; liswitch memory active');
            }
        }
    }

    _onMemoryModeChanged() {
        const mode = this.memoryMode;
        Log.debug(`WindowMemory: memory-mode changed to "${mode}"`);

        if (mode === 'off') {
            this.clearMemory();
        } else if (this._currentWindow) {
            this._seedInitialWindow(this._currentWindow, mode);
        }
    }

    _seedInitialWindow(window, mode) {
        const excluded = this.excludedApps;
        if (isWindowExcluded(window, excluded))
            return;

        const currentSource = this._inputSourceService?.getCurrentSource();
        if (!currentSource)
            return;

        if (mode === 'per-app') {
            const appKey = getAppKey(window);
            if (appKey && !this._appMemory.has(appKey))
                this._appMemory.set(appKey, {id: currentSource.id, index: currentSource.index});
        } else if (mode === 'per-window') {
            const windowKey = getWindowKey(window);
            if (windowKey && !this._windowMemory.has(windowKey))
                this._windowMemory.set(windowKey, {id: currentSource.id, index: currentSource.index});
        }
    }

    _onFocusWindowChanged() {
        if (!this._enabled)
            return;

        // If system per-window is enabled, do not duplicate or interfere
        if (this._systemPerWindowActive) {
            Log.debug('WindowMemory: system per-window is active; ignoring focus event');
            return;
        }

        const mode = this.memoryMode;
        if (mode === 'off')
            return;

        const display = this._display;
        const newWindow = display?.focus_window ?? null;

        // Prevent redundant processing if focus hasn't actually shifted to another window
        if (newWindow === this._currentWindow)
            return;

        const previousWindow = this._currentWindow;
        const excludedApps = this.excludedApps;

        // 1. Save layout for the window that is losing focus (if valid and not excluded)
        if (previousWindow && !isWindowExcluded(previousWindow, excludedApps))
            this._saveWindowLayout(previousWindow, mode);

        // 2. Update current active window pointer
        this._currentWindow = newWindow;

        // Focus switched to overview, desktop, top panel or system modal (newWindow is null)
        if (!newWindow) {
            Log.debug('WindowMemory: focus moved to system interface (focus_window is null)');
            return;
        }

        // Attach unmanaged listener to clean up when window is closed
        this._trackWindow(newWindow);

        // Check if focused application is in excluded list
        if (isWindowExcluded(newWindow, excludedApps)) {
            Log.debug('WindowMemory: focused window application is in memory-excluded-apps; skipping');
            return;
        }

        // 3. Restore layout for newly focused window
        this._restoreWindowLayout(newWindow, mode);
    }

    _saveWindowLayout(window, mode) {
        const currentSource = this._inputSourceService?.getCurrentSource();
        if (!currentSource)
            return;

        const entry = {
            id: currentSource.id,
            index: currentSource.index,
        };

        if (mode === 'per-app') {
            const appKey = getAppKey(window);
            if (appKey) {
                this._appMemory.set(appKey, entry);
                Log.debug(`WindowMemory: saved layout "${entry.id}" (index ${entry.index}) for app "${appKey}"`);
            }
        } else if (mode === 'per-window') {
            const windowKey = getWindowKey(window);
            if (windowKey) {
                this._windowMemory.set(windowKey, entry);
                Log.debug(`WindowMemory: saved layout "${entry.id}" (index ${entry.index}) for window "${windowKey}"`);
            }
        }
    }

    _restoreWindowLayout(window, mode) {
        let savedEntry = null;

        if (mode === 'per-app') {
            const appKey = getAppKey(window);
            if (appKey)
                savedEntry = this._appMemory.get(appKey);
        } else if (mode === 'per-window') {
            const windowKey = getWindowKey(window);
            if (windowKey)
                savedEntry = this._windowMemory.get(windowKey);
        }

        const currentIndex = this._inputSourceService.getCurrentIndex();
        const sources = this._inputSourceService.getSources();
        if (sources.length === 0)
            return;

        if (savedEntry) {
            // Locate target source by ID first, fallback to index
            let targetSource = sources.find(s => s.id === savedEntry.id);
            if (!targetSource && typeof savedEntry.index === 'number')
                targetSource = sources.find(s => s.index === savedEntry.index);

            // If layout was removed in OS settings, fallback to first available source
            if (!targetSource)
                targetSource = sources[0];

            // Activate layout silently only if it differs from current
            if (targetSource.index !== currentIndex) {
                Log.debug(`WindowMemory: restoring layout "${targetSource.id}" (index ${targetSource.index})`);
                this._isRestoring = true;
                try {
                    this._inputSourceService.activate(targetSource.index, false);
                } finally {
                    this._isRestoring = false;
                }
            } else {
                Log.debug(`WindowMemory: layout already matches "${targetSource.id}", no activate call needed`);
            }
        } else {
            // First time this window / app received focus
            const defaultMode = this.defaultLayoutMode;
            if (defaultMode === 'first') {
                const firstSource = sources[0];
                if (firstSource.index !== currentIndex) {
                    Log.debug(`WindowMemory: applying default 'first' layout "${firstSource.id}" (index ${firstSource.index})`);
                    this._isRestoring = true;
                    try {
                        this._inputSourceService.activate(firstSource.index, false);
                    } finally {
                        this._isRestoring = false;
                    }
                }
                this._saveWindowLayout(window, mode);
            } else {
                // 'keep': preserve whatever layout is currently active and record it
                Log.debug('WindowMemory: default mode is "keep"; preserving current layout for new window');
                this._saveWindowLayout(window, mode);
            }
        }
    }

    _onCurrentChanged(_index) {
        if (!this._enabled)
            return;

        // If this layout change was triggered by our own restoration, do NOT record it as a user choice
        if (this._isRestoring) {
            Log.debug('WindowMemory: ignoring current-changed event emitted during silent restoration');
            return;
        }

        if (this._systemPerWindowActive)
            return;

        const mode = this.memoryMode;
        if (mode === 'off')
            return;

        const currentWindow = this._currentWindow;
        if (!currentWindow)
            return;

        const excluded = this.excludedApps;
        if (isWindowExcluded(currentWindow, excluded))
            return;

        // Record manual layout switch by the user
        this._saveWindowLayout(currentWindow, mode);
    }

    _trackWindow(window) {
        if (!window || this._trackedWindows.has(window))
            return;

        if (typeof window.connect !== 'function')
            return;

        try {
            const signalId = window.connect('unmanaged', w => {
                this._onWindowUnmanaged(w);
            });
            this._trackedWindows.set(window, signalId);
        } catch (e) {
            Log.debug(`WindowMemory: failed to connect unmanaged on window: ${e.message}`);
        }
    }

    _onWindowUnmanaged(window) {
        Log.debug('WindowMemory: window unmanaged (closed)');

        const windowKey = getWindowKey(window);
        if (windowKey)
            this._windowMemory.delete(windowKey);

        if (this._trackedWindows.has(window)) {
            const signalId = this._trackedWindows.get(window);
            try {
                window.disconnect(signalId);
            } catch {
                // Ignore if already disconnected
            }
            this._trackedWindows.delete(window);
        }

        if (this._currentWindow === window)
            this._currentWindow = null;
    }
}

export {WindowMemory as WindowMemoryService};
export default WindowMemory;
