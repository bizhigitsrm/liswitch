// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Shared test helpers, assertions, and mock objects for pure GJS tests

import Gio from 'gi://Gio';

/**
 * Assert that a condition is truthy.
 *
 * @param {boolean} condition - Condition to check
 * @param {string} message - Error message on failure
 */
export function assert(condition, message) {
    if (!condition)
        throw new Error(`Assertion failed: ${message}`);
}

/**
 * Assert strict equality between actual and expected values.
 *
 * @param {*} actual - Actual value
 * @param {*} expected - Expected value
 * @param {string} [message=''] - Optional context message
 */
export function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        const suffix = message ? ` ${message}` : '';
        throw new Error(`Assertion failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.${suffix}`);
    }
}

export const assertEquals = assertEqual;

/**
 * Assert deep JSON equality between actual and expected values.
 *
 * @param {*} actual - Actual value
 * @param {*} expected - Expected value
 * @param {string} [message=''] - Optional context message
 */
export function assertDeepEqual(actual, expected, message = '') {
    const actStr = JSON.stringify(actual);
    const expStr = JSON.stringify(expected);
    if (actStr !== expStr)
        throw new Error(`Assertion failed: ${message}\nExpected: ${expStr}\nGot:      ${actStr}`);
}

export const assertDeepEquals = assertDeepEqual;

/**
 * Create an in-memory Gio.Settings instance backed by the project schema.
 * Compiles schemas/ if gschemas.compiled is missing (e.g. after `make clean`).
 *
 * @returns {Gio.Settings} In-memory GSettings instance
 */
export function createMemorySettings() {
    if (!Gio.File.new_for_path('schemas/gschemas.compiled').query_exists(null)) {
        const proc = Gio.Subprocess.new(
            ['glib-compile-schemas', 'schemas/'],
            Gio.SubprocessFlags.NONE
        );
        proc.wait_check(null);
    }
    const settingsSource = Gio.SettingsSchemaSource.new_from_directory(
        'schemas',
        Gio.SettingsSchemaSource.get_default(),
        false
    );
    const schema = settingsSource.lookup('org.gnome.shell.extensions.liswitch', false);
    return new Gio.Settings({
        settings_schema: schema,
        backend: Gio.memory_settings_backend_new(),
    });
}

/**
 * Lightweight signal emitter mock compatible with GObject/Gio connect/disconnect semantics.
 */
export class MockEmitter {
    constructor() {
        this._listeners = new Map();
        this._nextHandlerId = 1;
    }

    connect(signal, callback) {
        const id = this._nextHandlerId++;
        if (!this._listeners.has(signal))
            this._listeners.set(signal, new Map());
        this._listeners.get(signal).set(id, callback);
        return id;
    }

    disconnect(handlerId) {
        for (const map of this._listeners.values()) {
            if (map.delete(handlerId))
                return;
        }
    }

    emit(signal, ...args) {
        const map = this._listeners.get(signal);
        if (!map)
            return;
        for (const cb of Array.from(map.values()))
            cb(this, ...args);
    }

    emitSignal(signal, ...args) {
        this.emit(signal, ...args);
    }

    getListenerCount(signal = null) {
        if (signal !== null)
            return this._listeners.get(signal)?.size ?? 0;
        let total = 0;
        for (const map of this._listeners.values())
            total += map.size;
        return total;
    }

    listenerCount(signal = null) {
        return this.getListenerCount(signal);
    }
}

export const DEFAULT_LISWITCH_SETTINGS = {
    'indicator-enabled': true,
    'hide-system-indicator': false,
    'indicator-format': 'short',
    'indicator-position': 'system',
    'scroll-switch': true,
    'show-osd': true,
    'osd-duration-ms': 1000,
    'osd-show-on-auto-switch': false,
    'osd-position': 'center',
    'debug': false,
    'memory-mode': 'per-app',
    'default-layout-mode': 'keep',
    'memory-excluded-apps': [],
    'app-default-layouts': '{}',
    'hotkey-next': ['<Control><Alt>space'],
    'hotkey-previous': ['<Control><Alt><Shift>space'],
    'hotkey-switch-1': [],
    'hotkey-switch-2': [],
    'hotkey-switch-3': [],
    'hotkey-switch-4': [],
    'backup-system-shortcuts': '{}',
    'backup-system-switch-keys': [],
    'backup-system-switch-backward-keys': [],
    'freed-system-shortcuts': '{}',
    'convert-text-enabled': false,
    'convert-double-shift': true,
    'convert-hotkey': ['<Shift>Pause'],
    'convert-selection-enabled': false,
    'convert-terminal-apps': [
        'org.gnome.Console',
        'kgx',
        'org.gnome.Ptyxis',
        'app.devsuite.Ptyxis',
        'ptyxis',
        'org.gnome.Terminal',
        'gnome-terminal',
        'gnome-terminal-server',
        'Alacritty',
        'kitty',
        'foot',
        'org.wezfurlong.wezterm',
        'com.mitchellh.ghostty',
        'com.raggesilver.BlackBox',
        'com.gexperts.Tilix',
        'org.kde.konsole',
    ],
};

/**
 * In-memory Gio.Settings mock supporting boolean, string, uint, strv, and bind().
 */
export class MockSettings extends MockEmitter {
    constructor(initial = {}) {
        super();
        this._values = {...initial};
        this.settings_schema = {
            has_key: k => Object.prototype.hasOwnProperty.call(this._values, k),
        };
    }

    get_boolean(key) {
        return Boolean(this._values[key]);
    }

    set_boolean(key, val) {
        this._values[key] = Boolean(val);
        this.emit(`changed::${key}`, key);
        this.emit('changed', key);
    }

    get_string(key) {
        return String(this._values[key] ?? '');
    }

    set_string(key, val) {
        this._values[key] = String(val);
        this.emit(`changed::${key}`, key);
        this.emit('changed', key);
    }

    get_uint(key) {
        return Number(this._values[key]) || 0;
    }

    set_uint(key, val) {
        this._values[key] = Number(val);
        this.emit(`changed::${key}`, key);
        this.emit('changed', key);
    }

    get_strv(key) {
        return Array.isArray(this._values[key]) ? this._values[key].slice() : [];
    }

    set_strv(key, val) {
        this._values[key] = Array.isArray(val) ? val.slice() : [];
        this.emit(`changed::${key}`, key);
        this.emit('changed', key);
    }

    bind(key, target, property, _flags) {
        if (typeof this._values[key] === 'boolean') {
            target[property] = this._values[key];
            target.connect?.(`notify::${property}`, () => {
                this.set_boolean(key, target[property]);
            });
            this.connect(`changed::${key}`, () => {
                target[property] = this._values[key];
            });
        }
    }
}

/**
 * Create a MockSettings instance pre-populated with all Liswitch schema defaults.
 *
 * @param {object} [overrides={}] - Override values
 * @returns {MockSettings} Pre-populated mock settings
 */
export function createMockSettings(overrides = {}) {
    return new MockSettings({...DEFAULT_LISWITCH_SETTINGS, ...overrides});
}

export const DEFAULT_INPUT_SOURCES = [
    {type: 'xkb', id: 'us', displayName: 'English (US)', shortName: 'en', index: 0},
    {type: 'xkb', id: 'ru', displayName: 'Russian', shortName: 'ru', index: 1},
    {type: 'xkb', id: 'kz', displayName: 'Kazakh', shortName: 'kk', index: 2},
];

/**
 * Mock GNOME Shell InputSource object.
 */
export class MockInputSource extends MockEmitter {
    constructor(managerOrId, typeOrDisplayName, idOrShortName, displayNameOrIndex, shortNameOrManager = null, index = null) {
        super();
        if (typeof managerOrId === 'object' && managerOrId !== null && !('id' in managerOrId)) {
            // Signature: (manager, type, id, displayName, shortName, index)
            this._manager = managerOrId;
            this.type = typeOrDisplayName;
            this.id = idOrShortName;
            this.displayName = displayNameOrIndex;
            this.shortName = shortNameOrManager;
            this.index = index;
        } else {
            // Signature: (id, displayName, shortName, index, manager = null)
            this.type = 'xkb';
            this.id = managerOrId;
            this.displayName = typeOrDisplayName;
            this.shortName = idOrShortName;
            this.index = displayNameOrIndex;
            this._manager = shortNameOrManager;
        }
    }

    activate(interactive = true) {
        if (this._manager)
            this._manager.activateInputSource(this, interactive);
        this.emit('activate', interactive);
    }
}

/**
 * Mock GNOME Shell InputSourceManager supporting array specs, dict specs, or defaults.
 */
export class MockInputSourceManager extends MockEmitter {
    constructor(sourcesOrDict = null, currentIndex = null) {
        super();
        this.inputSources = {};
        this.currentSource = null;
        this.activateHistory = [];

        if (sourcesOrDict === null || sourcesOrDict === undefined)
            this._applySources(DEFAULT_INPUT_SOURCES, currentIndex);
        else
            this._applySources(sourcesOrDict, currentIndex);
    }

    _applySources(sourcesOrDict, currentIndex = null) {
        this.inputSources = {};

        if (Array.isArray(sourcesOrDict)) {
            for (const s of sourcesOrDict) {
                if (s instanceof MockInputSource) {
                    s._manager = this;
                    this.inputSources[s.index] = s;
                } else {
                    this.inputSources[s.index] = new MockInputSource(
                        this,
                        s.type ?? 'xkb',
                        s.id,
                        s.displayName,
                        s.shortName,
                        s.index
                    );
                }
            }
        } else if (sourcesOrDict && typeof sourcesOrDict === 'object') {
            for (const [key, s] of Object.entries(sourcesOrDict)) {
                const idx = s.index ?? Number(key);
                if (s instanceof MockInputSource) {
                    s._manager = this;
                    this.inputSources[idx] = s;
                } else {
                    this.inputSources[idx] = new MockInputSource(
                        this,
                        s.type ?? 'xkb',
                        s.id,
                        s.displayName,
                        s.shortName,
                        idx
                    );
                }
            }
        }

        const keys = Object.keys(this.inputSources);
        if (keys.length === 0) {
            this.currentSource = null;
        } else if (currentIndex !== null && currentIndex !== undefined) {
            this.currentSource = this.inputSources[currentIndex] ?? null;
        } else if (!this.currentSource || !this.inputSources[this.currentSource.index]) {
            this.currentSource = this.inputSources[keys[0]];
        }
    }

    setSources(sourcesOrDict, currentIndex = null) {
        this._applySources(sourcesOrDict, currentIndex);
        this.emit('sources-changed');
    }

    setCurrent(idx) {
        this.currentSource = this.inputSources[idx] ?? null;
        this.emit('current-source-changed');
    }

    activateInputSource(source, interactive = true) {
        this.activateHistory.push({
            index: source.index,
            id: source.id,
            interactive,
        });
        const oldSource = this.currentSource;
        this.currentSource = source;
        if (!oldSource || oldSource.index !== source.index)
            this.emit('current-source-changed', oldSource);
    }
}

/**
 * Mock InputSourceService for modules consuming the service wrapper directly.
 */
export class MockInputSourceService extends MockEmitter {
    constructor(sources = null, currentIndex = null) {
        super();
        this._sources = sources ? sources.map(s => ({...s})) : DEFAULT_INPUT_SOURCES.map(s => ({...s}));
        this._currentIndex = currentIndex ?? (this._sources[0]?.index ?? 0);
        this.activatedIndices = [];
        this.activateCount = 0;
    }

    get isAvailable() {
        return this._sources.length > 0;
    }

    getSources() {
        return this._sources;
    }

    getCurrentIndex() {
        return this._currentIndex;
    }

    getCurrentSource() {
        return this._sources.find(s => s.index === this._currentIndex) ?? null;
    }

    getSourceByIndex(index) {
        return this._sources.find(s => s.index === index) ?? null;
    }

    activate(index, interactive = true) {
        if (!this._sources.some(s => s.index === index))
            return false;
        this.activatedIndices.push({index, interactive});
        this.activateCount++;
        this._currentIndex = index;
        this.emit('current-changed', index);
        return true;
    }

    emitCurrentChanged(index) {
        this._currentIndex = index;
        this.emit('current-changed', index);
    }
}

/**
 * Mock GNOME Shell WindowManager simulating Main.wm keybinding API.
 */
export class MockWindowManager {
    constructor() {
        this.keybindings = new Map();
        this.callLog = [];
    }

    get _bindings() {
        return this.keybindings;
    }

    addKeybinding(name, settings, flags, modes, handler) {
        this.callLog.push({action: 'add', name, flags, modes});
        const actionId = this.keybindings.size + 1;
        this.keybindings.set(name, {settings, flags, modes, handler, actionId});
        return actionId;
    }

    removeKeybinding(name) {
        this.callLog.push({action: 'remove', name});
        return this.keybindings.delete(name);
    }

    trigger(name) {
        const binding = this.keybindings.get(name);
        if (binding && typeof binding.handler === 'function') {
            binding.handler(null, null, null, null);
            return true;
        }
        return false;
    }
}

/**
 * Mock Meta.Display tracking focus_window changes.
 */
export class MockDisplay extends MockEmitter {
    constructor() {
        super();
        this.focus_window = null;
    }

    setFocus(win) {
        this.focus_window = win;
        this.emit('notify::focus-window');
    }
}

/**
 * Mock Meta.Window supporting both options-object and (id, appId) constructor forms.
 */
export class MockWindow extends MockEmitter {
    constructor(idOrOpts = {}, appId = null) {
        super();
        if (typeof idOrOpts === 'object' && idOrOpts !== null) {
            this._id = idOrOpts.id;
            this._appId = idOrOpts.appId ?? null;
            this._wmClass = idOrOpts.wmClass ?? this._appId;
            this._gtkAppId = idOrOpts.gtkAppId ?? null;
            this._sandboxedAppId = idOrOpts.sandboxedAppId ?? null;
        } else {
            this._id = idOrOpts;
            this._appId = appId;
            this._wmClass = appId;
            this._gtkAppId = appId;
            this._sandboxedAppId = appId;
        }
    }

    get_id() {
        return this._id;
    }

    get_wm_class() {
        return this._wmClass;
    }

    get_gtk_application_id() {
        return this._gtkAppId;
    }

    get_sandboxed_app_id() {
        return this._sandboxedAppId;
    }

    get_wm_class_instance() {
        return this._wmClass;
    }

    close() {
        this.emit('unmanaged');
    }
}

/**
 * Mock GNOME desktop input-sources GSettings (per-window flag).
 */
export class MockDesktopSettings extends MockEmitter {
    constructor(perWindow = false) {
        super();
        this._perWindow = perWindow;
    }

    get_boolean(key) {
        if (key === 'per-window')
            return this._perWindow;
        return false;
    }

    set_boolean(key, val) {
        if (key === 'per-window') {
            this._perWindow = Boolean(val);
            this.emit('changed::per-window');
        }
    }
}
