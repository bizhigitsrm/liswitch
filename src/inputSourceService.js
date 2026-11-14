// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Input source service for GNOME Shell 51

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import * as Log from './log.js';

let _shellKeyboardModule = null;
try {
    _shellKeyboardModule = await import('resource:///org/gnome/shell/ui/status/keyboard.js');
} catch {
    // Expected in standalone environments (e.g. unit tests outside GNOME Shell)
}

/**
 * FallbackBackend
 *
 * Minimal fallback backend operating exclusively via GSettings (org.gnome.desktop.input-sources).
 *
 * NOTE on GNOME Shell Wayland limitations:
 * In GNOME Shell 50/51 on Wayland, setting the GSettings key 'current' in
 * 'org.gnome.desktop.input-sources' is DEPRECATED and ignored by Mutter's Wayland
 * compositor. Writing to it does NOT switch the active hardware layout.
 * This fallback exists strictly as a safe degradation path when GNOME Shell's
 * InputSourceManager is inaccessible (e.g. standalone test runs or non-standard shells),
 * ensuring the extension can inspect configured sources without crashing.
 */
export const FallbackBackend = GObject.registerClass({
    GTypeName: 'LiswitchFallbackBackend',
    Signals: {
        'sources-changed': {},
        'current-changed': {
            param_types: [GObject.TYPE_INT],
        },
    },
}, class FallbackBackend extends GObject.Object {
    constructor(settings = null) {
        super();
        this._settings = settings;
        this._desktopSettings = null;
        this._signalIds = [];
        this._sources = [];
        this._currentIndex = -1;
        this._enabled = false;
    }

    enable() {
        if (this._enabled)
            return;
        this._enabled = true;

        try {
            this._desktopSettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.input-sources',
            });
        } catch (e) {
            Log.warn('FallbackBackend: failed to access org.gnome.desktop.input-sources:', e.message);
            this._desktopSettings = null;
            return;
        }

        const sourcesId = this._desktopSettings.connect('changed::sources', () => {
            this._reloadSources();
        });
        const currentId = this._desktopSettings.connect('changed::current', () => {
            this._reloadCurrent();
        });
        this._signalIds.push(sourcesId, currentId);

        this._reloadSources();
    }

    _reloadSources() {
        if (!this._desktopSettings) {
            this._sources = [];
            this._currentIndex = -1;
            return;
        }

        try {
            const gvar = this._desktopSettings.get_value('sources');
            const unpacked = gvar.deepUnpack ? gvar.deepUnpack() : gvar.deep_unpack();
            const sources = [];

            if (Array.isArray(unpacked)) {
                for (let i = 0; i < unpacked.length; i++) {
                    const item = unpacked[i];
                    const type = item[0] ?? 'xkb';
                    const id = item[1] ?? '';
                    sources.push({
                        index: i,
                        id,
                        type,
                        shortName: id.slice(0, 2).toLowerCase(),
                        displayName: id,
                    });
                }
            }

            this._sources = sources;
            this._reloadCurrent();
            this.emit('sources-changed');
        } catch (e) {
            Log.warn('FallbackBackend: error reading sources:', e.message);
            this._sources = [];
            this._currentIndex = -1;
        }
    }

    _reloadCurrent() {
        if (!this._desktopSettings || this._sources.length === 0) {
            this._currentIndex = -1;
            return;
        }

        try {
            const current = this._desktopSettings.get_uint('current');
            const valid = this._sources.some(s => s.index === current);
            const newIndex = valid ? current : this._sources[0].index;
            if (this._currentIndex !== newIndex) {
                this._currentIndex = newIndex;
                this.emit('current-changed', this._currentIndex);
            }
        } catch {
            this._currentIndex = this._sources.length > 0 ? 0 : -1;
        }
    }

    getSources() {
        return this._sources;
    }

    getCurrentIndex() {
        return this._currentIndex;
    }

    activate(index) {
        if (!this._desktopSettings || this._sources.length === 0)
            return false;

        const exists = this._sources.some(s => s.index === index);
        if (!exists)
            return false;

        try {
            this._desktopSettings.set_uint('current', index);
            this._currentIndex = index;
            this.emit('current-changed', index);
            return true;
        } catch (e) {
            Log.warn('FallbackBackend: failed to set current:', e.message);
            return false;
        }
    }

    destroy() {
        if (!this._enabled)
            return;
        this._enabled = false;

        if (this._desktopSettings && this._signalIds.length > 0) {
            for (const id of this._signalIds) {
                try {
                    this._desktopSettings.disconnect(id);
                } catch {
                    // Ignore already disconnected signals
                }
            }
            this._signalIds = [];
        }

        this._desktopSettings = null;
        this._sources = [];
        this._currentIndex = -1;
    }
});

/**
 * InputSourceService
 *
 * Unified wrapper around GNOME Shell's InputSourceManager providing
 * layout switching, layout listing, and signal notification for all liswitch modules.
 *
 * === Architectural Notes on GNOME Shell Internal vs Public APIs ===
 *
 * 1. Public Shell APIs used:
 *    - `getInputSourceManager()` (exported from `resource:///org/gnome/shell/ui/status/keyboard.js`).
 *    - `inputSourceManager.inputSources`: public getter returning `{ [index: number]: InputSource }`.
 *    - `inputSourceManager.currentSource`: public getter returning current active `InputSource | null`.
 *    - `inputSourceManager.activateInputSource(source, interactive)`: public method on manager.
 *    - `inputSource.activate(interactive)`: public method on `InputSource` emitting 'activate' to manager.
 *    - `inputSourceManager.connect('sources-changed', ...)`: signal emitted when configured layouts change.
 *    - `inputSourceManager.connect('current-source-changed', ...)`: signal emitted when active layout changes.
 *
 * 2. Non-public / internal fields and architectural rationale:
 *    - GNOME Shell does not provide a formal frozen extension API for input sources; `InputSourceManager`
 *      is an internal UI component located in `ui/status/keyboard.js`.
 *    - The `inputSources` dictionary is an object indexed by numeric keys, not an ordered array.
 *      To guarantee consistent ordering, we sort entries by `source.index`.
 *    - `_mruSources` in `InputSourceManager` is a private array holding the Most Recently Used layout order.
 *      While we do not modify `_mruSources` directly, calling `activate(interactive)` updates or preserves
 *      MRU order depending on the `interactive` boolean flag.
 *    - `shortName` normalization: some input sources (especially IBus or variant-less XKB layouts)
 *      may have empty or sub-indexed short names (e.g. subscript digits like "en₂").
 *      We normalize `shortName` fallbacks using `id.slice(0, 2)`.
 *
 * 3. FallbackBackend and GSettings limitation:
 *    - Why not use GSettings `org.gnome.desktop.input-sources` -> `current` exclusively?
 *      In GNOME Shell on Wayland (GNOME 50/51), the `current` key in `org.gnome.desktop.input-sources`
 *      is DEPRECATED and ignored by Mutter. Setting `current` via GSettings does NOT change the active
 *      hardware keymap in Mutter or IBus. Only `InputSourceManager.activateInputSource()` /
 *      `KeyboardManager.apply(xkbId)` causes Mutter to actually switch the active Wayland keymap.
 *    - When does FallbackBackend turn on?
 *      `FallbackBackend` is activated strictly when `getInputSourceManager()` is unavailable (e.g. in
 *      standalone test runners, CLI environments, or if Shell's keyboard manager failed to initialize).
 *      It provides best-effort tracking via GSettings `org.gnome.desktop.input-sources` so that callers
 *      do not crash and can still query configured layouts.
 */
export const InputSourceService = GObject.registerClass({
    GTypeName: 'LiswitchInputSourceService',
    Signals: {
        'sources-changed': {},
        'current-changed': {
            param_types: [GObject.TYPE_INT],
        },
    },
}, class InputSourceService extends GObject.Object {
    constructor(settings = null) {
        super();

        // Minimal work in constructor as per requirement
        this._settings = settings;
        this._manager = null;
        this._fallback = null;
        this._managerSignals = [];
        this._fallbackSignals = [];
        this._sources = [];
        this._currentIndex = -1;
        this._isAvailable = false;
        this._enabled = false;
    }

    /**
     * Connect signals, obtain the input source manager, and synchronize state.
     *
     * @param {object} [options]
     * @param {object|null} [options.manager] - Explicit manager override (e.g. mock manager for tests)
     */
    enable({manager = null} = {}) {
        if (this._enabled) {
            Log.debug('InputSourceService: already enabled');
            return;
        }
        this._enabled = true;

        if (manager) {
            this._manager = manager;
        } else {
            try {
                if (_shellKeyboardModule?.getInputSourceManager)
                    this._manager = _shellKeyboardModule.getInputSourceManager();
            } catch (e) {
                Log.warn('InputSourceService: failed to obtain InputSourceManager from Shell:', e.message);
                this._manager = null;
            }
        }

        if (this._manager) {
            Log.debug('InputSourceService: connecting to InputSourceManager');
            const sourcesId = this._manager.connect('sources-changed', () => {
                this._onSourcesChanged();
            });
            const currentId = this._manager.connect('current-source-changed', () => {
                this._onCurrentSourceChanged();
            });
            this._managerSignals.push(
                {obj: this._manager, id: sourcesId},
                {obj: this._manager, id: currentId}
            );

            this._syncWithManager();
        } else {
            Log.debug('InputSourceService: InputSourceManager unavailable, attempting FallbackBackend');
            this._fallback = new FallbackBackend(this._settings);
            const sourcesId = this._fallback.connect('sources-changed', () => {
                this._onFallbackSourcesChanged();
            });
            const currentId = this._fallback.connect('current-changed', (_fb, idx) => {
                this._onFallbackCurrentChanged(idx);
            });
            this._fallbackSignals.push(
                {obj: this._fallback, id: sourcesId},
                {obj: this._fallback, id: currentId}
            );
            this._fallback.enable();

            this._syncWithFallback();
        }

        Log.debug(`InputSourceService: enabled (available: ${this._isAvailable}, count: ${this._sources.length}, current: ${this._currentIndex})`);
    }

    /**
     * Disconnect all signals, destroy backends, and nullify references. Strictly synchronous.
     */
    destroy() {
        if (!this._enabled)
            return;
        this._enabled = false;

        Log.debug('InputSourceService: destroying and disconnecting signals');

        if (this._manager && this._managerSignals.length > 0) {
            for (const {obj, id} of this._managerSignals) {
                try {
                    obj.disconnect(id);
                } catch (e) {
                    Log.warn('InputSourceService: error disconnecting manager signal:', e.message);
                }
            }
            this._managerSignals = [];
        }

        if (this._fallback) {
            for (const {obj, id} of this._fallbackSignals) {
                try {
                    obj.disconnect(id);
                } catch {
                    // Ignore
                }
            }
            this._fallbackSignals = [];

            this._fallback.destroy();
            this._fallback = null;
        }

        this._manager = null;
        this._sources = [];
        this._currentIndex = -1;
        this._isAvailable = false;
    }

    /**
     * Whether the input source service is functional and has at least one configured layout.
     *
     * @returns {boolean}
     */
    get isAvailable() {
        return this._isAvailable;
    }

    /**
     * Current service state ('available' or 'unavailable').
     *
     * @returns {'available'|'unavailable'}
     */
    get state() {
        return this._isAvailable ? 'available' : 'unavailable';
    }

    /**
     * Return list of configured input sources.
     *
     * @returns {Array<{index: number, id: string, shortName: string, displayName: string}>}
     */
    getSources() {
        if (!this._isAvailable)
            return [];

        return this._sources.map(s => ({
            index: s.index,
            id: s.id,
            shortName: s.shortName || s.id.slice(0, 2).toLowerCase(),
            displayName: s.displayName || s.id,
        }));
    }

    /**
     * Return current active input source index, or -1 if unavailable.
     *
     * @returns {number}
     */
    getCurrentIndex() {
        if (!this._isAvailable)
            return -1;
        return this._currentIndex;
    }

    /**
     * Return current active input source object, or null if unavailable.
     *
     * @returns {{index: number, id: string, shortName: string, displayName: string}|null}
     */
    getCurrentSource() {
        if (!this._isAvailable || this._currentIndex < 0)
            return null;
        const sources = this.getSources();
        return sources.find(s => s.index === this._currentIndex) ?? null;
    }

    /**
     * Switch to the input source at the given index.
     *
     * @param {number} index - Index of layout to activate
     * @param {boolean} [interactive=true] - Whether activation is interactive (updates MRU)
     * @returns {boolean} - true if switch was dispatched, false on invalid index or error
     */
    activate(index, interactive = true) {
        if (!this._isAvailable) {
            Log.debug('activate: service is currently unavailable');
            return false;
        }

        if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
            Log.debug(`activate: invalid source index: ${index}`);
            return false;
        }

        const source = this._sources.find(s => s.index === index);
        if (!source) {
            Log.debug(`activate: source index ${index} not found in available sources`);
            return false;
        }

        Log.debug(`activate: activating source ${index} (${source.id}), interactive=${interactive}`);

        try {
            if (typeof source.activate === 'function') {
                source.activate(interactive);
            } else if (this._manager && typeof this._manager.activateInputSource === 'function') {
                this._manager.activateInputSource(source, interactive);
            } else if (this._fallback) {
                this._fallback.activate(index);
            }
            return true;
        } catch (e) {
            Log.warn(`activate: failed to switch to index ${index}:`, e.message);
            return false;
        }
    }

    /**
     * Switch to the next input source cyclically.
     *
     * @returns {boolean}
     */
    next() {
        if (!this._isAvailable || this._sources.length === 0) {
            Log.debug('next: service unavailable or sources list is empty');
            return false;
        }

        const count = this._sources.length;
        const currentPos = this._sources.findIndex(s => s.index === this._currentIndex);
        const nextPos = currentPos >= 0 ? (currentPos + 1) % count : 0;
        const targetSource = this._sources[nextPos];

        return this.activate(targetSource.index, true);
    }

    /**
     * Switch to the previous input source cyclically.
     *
     * @returns {boolean}
     */
    previous() {
        if (!this._isAvailable || this._sources.length === 0) {
            Log.debug('previous: service unavailable or sources list is empty');
            return false;
        }

        const count = this._sources.length;
        const currentPos = this._sources.findIndex(s => s.index === this._currentIndex);
        const prevPos = currentPos >= 0 ? (currentPos - 1 + count) % count : count - 1;
        const targetSource = this._sources[prevPos];

        return this.activate(targetSource.index, true);
    }

    // === Private synchronization methods ===

    _syncWithManager() {
        if (!this._manager) {
            this._sources = [];
            this._currentIndex = -1;
            this._isAvailable = false;
            return;
        }

        const inputSourcesDict = this._manager.inputSources ?? {};
        const rawSources = Object.values(inputSourcesDict);
        rawSources.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

        this._sources = rawSources;

        if (this._sources.length === 0) {
            this._isAvailable = false;
            this._currentIndex = -1;
            Log.debug('InputSourceService: manager has 0 configured input sources (state: unavailable)');
        } else {
            this._isAvailable = true;
            const cur = this._manager.currentSource;
            this._currentIndex = cur ? cur.index : this._sources[0].index;
        }
    }

    _onSourcesChanged() {
        if (!this._manager)
            return;

        const previousCount = this._sources.length;
        this._syncWithManager();
        Log.debug(`InputSourceService: sources-changed event received (sources count: ${previousCount} -> ${this._sources.length})`);

        this.emit('sources-changed');

        // Check if current source changed as a result of source list changes
        const cur = this._manager.currentSource;
        const newIndex = cur ? cur.index : (this._sources[0]?.index ?? -1);
        if (this._currentIndex !== newIndex) {
            this._currentIndex = newIndex;
            this.emit('current-changed', this._currentIndex);
        }
    }

    _onCurrentSourceChanged() {
        if (!this._manager)
            return;

        const cur = this._manager.currentSource;
        const newIndex = cur ? cur.index : -1;
        if (this._currentIndex !== newIndex) {
            Log.debug(`InputSourceService: current-source-changed event received (index: ${this._currentIndex} -> ${newIndex})`);
            this._currentIndex = newIndex;
            this.emit('current-changed', this._currentIndex);
        }
    }

    _syncWithFallback() {
        if (!this._fallback) {
            this._sources = [];
            this._currentIndex = -1;
            this._isAvailable = false;
            return;
        }

        this._sources = this._fallback.getSources();
        this._currentIndex = this._fallback.getCurrentIndex();
        this._isAvailable = this._sources.length > 0;
    }

    _onFallbackSourcesChanged() {
        this._syncWithFallback();
        this.emit('sources-changed');
    }

    _onFallbackCurrentChanged(idx) {
        if (this._currentIndex !== idx) {
            this._currentIndex = idx;
            this.emit('current-changed', this._currentIndex);
        }
    }
});
