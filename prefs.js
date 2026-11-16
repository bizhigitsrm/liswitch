// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Preferences for GNOME Shell 47–51+

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as shellGettext} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {
    checkConflicts,
    freeSystemShortcut,
    restoreSystemShortcut,
    cleanupUnusedSystemOverrides,
    findDuplicateHotkeyKey,
    isModifierOnlyShortcut,
    normalizeShortcut,
    XKB_SWITCH_PRESETS,
    getXkbGroupToggleOption,
    getOtherXkbOptions,
    applyXkbGroupToggleSetting,
    getSystemInputSourceSwitchInfo,
} from './src/hotkeys.js';
import {
    normalizeAppId,
    parseAppDefaultLayouts,
    serializeAppDefaultLayouts,
} from './src/windowMemory.js';
import {DEFAULT_TERMINAL_APPS} from './src/textCorrection.js';

let _GnomeDesktop = null;
try {
    const mod = await import('gi://GnomeDesktop?version=4.0');
    _GnomeDesktop = mod.default;
} catch {
    _GnomeDesktop = null;
}

export const COMMON_APP_SUGGESTIONS = [
    {appId: 'org.gnome.Console', displayName: 'Console', wmClass: 'kgx', icon: null},
    {appId: 'org.gnome.Terminal', displayName: 'Terminal', wmClass: 'gnome-terminal-server', icon: null},
    {appId: 'org.gnome.TextEditor', displayName: 'Text Editor', wmClass: 'org.gnome.TextEditor', icon: null},
    {appId: 'org.gnome.Nautilus', displayName: 'Files', wmClass: 'org.gnome.Nautilus', icon: null},
    {appId: 'org.mozilla.firefox', displayName: 'Firefox', wmClass: 'firefox', icon: null},
    {appId: 'code', displayName: 'Visual Studio Code', wmClass: 'Code', icon: null},
];

/**
 * Collect visible installed desktop applications via Gio.AppInfo.get_all().
 * Falls back to COMMON_APP_SUGGESTIONS when no desktop entries are available.
 *
 * @param {Array<Gio.AppInfo|object>|null} [appInfosOverride=null]
 * @returns {Array<{appId: string, displayName: string, wmClass: string|null, icon: Gio.Icon|null}>}
 */
export function getInstalledApplications(appInfosOverride = null) {
    let rawList = [];
    try {
        rawList = Array.isArray(appInfosOverride) ? appInfosOverride : Gio.AppInfo.get_all();
    } catch {
        rawList = [];
    }

    const dedup = new Map();
    for (const info of rawList) {
        if (!info)
            continue;
        try {
            if (typeof info.should_show === 'function' && !info.should_show())
                continue;
            const rawId = typeof info.get_id === 'function' ? info.get_id() : '';
            const appId = normalizeAppId(rawId);
            if (!appId)
                continue;

            const key = appId.toLowerCase();
            if (dedup.has(key))
                continue;

            const displayName = (typeof info.get_display_name === 'function' && info.get_display_name()) ||
                (typeof info.get_name === 'function' && info.get_name()) ||
                appId;
            const wmClass = (typeof info.get_startup_wm_class === 'function' && info.get_startup_wm_class()) || null;
            const icon = (typeof info.get_icon === 'function' && info.get_icon()) || null;

            dedup.set(key, {
                appId,
                displayName: String(displayName),
                wmClass: wmClass ? String(wmClass) : null,
                icon,
            });
        } catch {
            // Skip malformed desktop entry
        }
    }

    if (dedup.size === 0)
        return COMMON_APP_SUGGESTIONS.map(item => ({...item}));

    return Array.from(dedup.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Build a case-insensitive lookup map from appId (and wmClass) to app metadata.
 *
 * @param {Array<{appId: string, displayName: string, wmClass: string|null, icon: Gio.Icon|null}>} apps
 * @returns {Map<string, {appId: string, displayName: string, wmClass: string|null, icon: Gio.Icon|null}>}
 */
export function buildAppLookupMap(apps) {
    const map = new Map();
    if (!Array.isArray(apps))
        return map;

    for (const app of apps) {
        if (!app?.appId)
            continue;
        map.set(app.appId.toLowerCase(), app);
        if (app.wmClass) {
            const wmKey = app.wmClass.toLowerCase();
            if (!map.has(wmKey))
                map.set(wmKey, app);
        }
    }
    return map;
}

/**
 * Read configured GNOME input sources from org.gnome.desktop.input-sources.
 *
 * @param {Gio.Settings|object|null} desktopSettings
 * @param {object|null} [xkbInfoOverride=undefined]
 * @returns {Array<{id: string, type: string, shortName: string, displayName: string, label: string}>}
 */
export function getConfiguredInputSources(desktopSettings, xkbInfoOverride = undefined) {
    if (!desktopSettings || typeof desktopSettings.get_value !== 'function')
        return [];

    let xkbInfo = xkbInfoOverride;
    if (xkbInfo === undefined) {
        try {
            xkbInfo = _GnomeDesktop?.XkbInfo ? new _GnomeDesktop.XkbInfo() : null;
        } catch {
            xkbInfo = null;
        }
    }

    try {
        const gvar = desktopSettings.get_value('sources');
        const unpacked = gvar?.deepUnpack ? gvar.deepUnpack() : gvar?.deep_unpack?.();
        if (!Array.isArray(unpacked))
            return [];

        const sources = [];
        const seen = new Set();
        for (const item of unpacked) {
            if (!Array.isArray(item) || item.length < 2)
                continue;
            const type = String(item[0] ?? 'xkb');
            const id = String(item[1] ?? '').trim();
            if (!id || seen.has(id))
                continue;
            seen.add(id);

            let displayName = id;
            let shortName = id.slice(0, 2).toLowerCase();

            if (type === 'xkb' && xkbInfo && typeof xkbInfo.get_layout_info === 'function') {
                try {
                    const info = xkbInfo.get_layout_info(id);
                    if (Array.isArray(info) && info[0]) {
                        if (info[1])
                            displayName = String(info[1]);
                        if (info[2])
                            shortName = String(info[2]);
                    }
                } catch {
                    // Fallback to id
                }
            }

            const label = displayName !== id ? `${displayName} (${id})` : id;
            sources.push({id, type, shortName, displayName, label});
        }
        return sources;
    } catch {
        return [];
    }
}

function _(str) {
    try {
        return shellGettext(str);
    } catch {
        return str;
    }
}

/**
 * Tracks GObject/GSettings signal handler IDs and cleanup callbacks
 * so pages release all external listeners and controllers on teardown.
 */
export class SignalTracker {
    constructor() {
        this._signals = [];
        this._cleanups = [];
    }

    /**
     * Connect a signal on an object and record its handler ID for disposal.
     *
     * @param {object|null} obj - GObject or emitter supporting connect/disconnect
     * @param {string} signalName - Signal name
     * @param {Function} callback - Signal handler
     * @returns {number} Handler ID (or 0 if not connected)
     */
    connect(obj, signalName, callback) {
        if (!obj || typeof obj.connect !== 'function')
            return 0;
        const id = obj.connect(signalName, callback);
        this._signals.push({obj, id});
        return id;
    }

    /**
     * Register a synchronous cleanup callback to run on disposal.
     *
     * @param {Function} fn - Cleanup callback
     */
    addCleanup(fn) {
        if (typeof fn === 'function')
            this._cleanups.push(fn);
    }

    /**
     * Run all registered cleanups and disconnect all tracked signals.
     * Idempotent: subsequent calls are safe no-ops.
     */
    dispose() {
        while (this._cleanups.length > 0) {
            const fn = this._cleanups.pop();
            try {
                fn();
            } catch {
                // Ignore cleanup errors
            }
        }

        while (this._signals.length > 0) {
            const {obj, id} = this._signals.pop();
            if (obj && id && typeof obj.disconnect === 'function') {
                try {
                    obj.disconnect(id);
                } catch {
                    // Ignore if already disconnected or disposed
                }
            }
        }
    }
}

/**
 * Build default human-readable action titles for all Liswitch hotkey keys.
 *
 * @returns {Map<string, string>}
 */
export function getDefaultHotkeyTitles() {
    return new Map([
        ['hotkey-next', _('Next Layout')],
        ['hotkey-previous', _('Previous Layout')],
        ['hotkey-switch-1', _('Switch to Layout %d').format(1)],
        ['hotkey-switch-2', _('Switch to Layout %d').format(2)],
        ['hotkey-switch-3', _('Switch to Layout %d').format(3)],
        ['hotkey-switch-4', _('Switch to Layout %d').format(4)],
        ['convert-hotkey', _('Convert Last Word')],
    ]);
}

/**
 * Create shared shortcut coordination state across preference pages.
 *
 * @returns {{activeRecorderStop: Function|null, actionTitles: Map<string, string>}}
 */
export function createShortcutContext() {
    return {
        activeRecorderStop: null,
        actionTitles: getDefaultHotkeyTitles(),
    };
}

/**
 * Find if another Liswitch action already uses the given accelerator.
 *
 * @param {Gio.Settings|object} settings - Liswitch GSettings instance
 * @param {string} currentKeyName - Key being assigned
 * @param {string} newShortcut - Accelerator to check
 * @param {Map<string, string>|null} [actionTitles] - Optional title lookup map
 * @returns {string|null} Title of conflicting action, or null
 */
export function findDuplicateAction(settings, currentKeyName, newShortcut, actionTitles = null) {
    const conflictKey = findDuplicateHotkeyKey(settings, currentKeyName, newShortcut);
    if (!conflictKey)
        return null;

    const titles = actionTitles ?? getDefaultHotkeyTitles();
    return titles.get(conflictKey) ?? conflictKey;
}

/**
 * Format a key accelerator string into a human-readable label.
 *
 * @param {string} shortcut - Raw shortcut, e.g. '<Control><Alt>space'
 * @returns {string} - Human-readable label, e.g. 'Ctrl+Alt+Space' or 'Disabled'
 */
function formatShortcutLabel(shortcut) {
    if (!shortcut || !shortcut.trim())
        return _('Disabled');

    const [ok, keyval, mods] = Gtk.accelerator_parse(shortcut.trim());
    if (ok && keyval !== 0) {
        const label = Gtk.accelerator_get_label(keyval, mods);
        if (label)
            return label;
    }

    return shortcut.trim();
}

/**
 * Reusable shortcut row builder & conflict refresh coordinator.
 * Shares Gtk.EventControllerKey recording, duplicate checking, system conflict
 * detection/resolution, and batched checkConflicts() scans across pages.
 */
export class ShortcutRowGroup {
    /**
     * @param {Gio.Settings} settings - Liswitch GSettings instance
     * @param {SignalTracker} tracker - Page signal/cleanup tracker
     * @param {{activeRecorderStop: Function|null, actionTitles: Map<string, string>}|null} [context]
     */
    constructor(settings, tracker, context = null) {
        this._settings = settings;
        this._tracker = tracker;
        this._context = context ?? createShortcutContext();
        this._rowRefreshCallbacks = [];
        this._suppressSignalDepth = 0;

        this._tracker.connect(this._settings, 'changed::backup-system-shortcuts', () => {
            if (this._suppressSignalDepth === 0)
                this.refreshAllRows();
        });
        if (this._settings.settings_schema?.has_key?.('freed-system-shortcuts')) {
            this._tracker.connect(this._settings, 'changed::freed-system-shortcuts', () => {
                if (this._suppressSignalDepth === 0)
                    this.refreshAllRows();
            });
        }
    }

    /**
     * Execute a settings mutation without triggering redundant intermediate
     * signal-driven conflict scans.
     *
     * @param {Function} fn
     * @returns {*}
     */
    withSuppressedSignals(fn) {
        this._suppressSignalDepth++;
        try {
            return fn();
        } finally {
            this._suppressSignalDepth--;
        }
    }

    /**
     * Scan system conflicts once and update all shortcut rows in this group.
     */
    refreshAllRows() {
        const allConflicts = checkConflicts(this._settings);
        for (const cb of this._rowRefreshCallbacks) {
            try {
                cb(allConflicts);
            } catch {
                // Ignore
            }
        }
    }

    /**
     * Create an interactive shortcut row with conflict badge, reset button,
     * and Gtk.EventControllerKey capture.
     *
     * @param {Adw.PreferencesGroup} group
     * @param {object} config
     * @param {string} config.keyName - GSettings strv key name
     * @param {string} config.title - Human-readable action title
     * @param {string} config.defaultDescription - Row subtitle when idle
     * @param {string[]} config.defaultShortcuts - Default shortcut array for reset
     * @param {boolean} [config.autoRefresh=false] - Whether to refresh immediately
     * @returns {Adw.ActionRow}
     */
    createRow(group, {keyName, title, defaultDescription, defaultShortcuts, autoRefresh = false}) {
        this._context.actionTitles.set(keyName, title);

        const row = new Adw.ActionRow({
            title,
            subtitle: defaultDescription,
        });
        group.add(row);

        // Conflict action button (Free / Restore in System)
        const conflictBtn = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            visible: false,
        });
        row.add_suffix(conflictBtn);

        // Current conflict action for this row; refreshed by updateUi().
        // The 'clicked' handler is connected exactly once and reads this
        // slot, so repeated updateUi() calls never accumulate handlers.
        let conflictAction = null;
        conflictBtn.connect('clicked', () => {
            const action = conflictAction;
            if (!action)
                return;
            this.withSuppressedSignals(() => {
                action();
            });
            this.refreshAllRows();
        });

        // Reset to default button
        const resetBtn = new Gtk.Button({
            icon_name: 'edit-undo-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: _('Reset to default shortcut (%s)').format(
                defaultShortcuts.length > 0 ? defaultShortcuts.join(', ') : _('Disabled')
            ),
        });
        resetBtn.connect('clicked', () => {
            this.withSuppressedSignals(() => {
                this._settings.set_strv(keyName, defaultShortcuts);
                cleanupUnusedSystemOverrides(this._settings);
            });
            this.refreshAllRows();
        });
        row.add_suffix(resetBtn);

        // Record / Display button
        const recordBtn = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        row.add_suffix(recordBtn);

        let isRecording = false;
        let controller = null;
        let controllerTarget = null;
        let controllerSignalId = 0;

        const updateUi = (conflicts = null) => {
            if (isRecording)
                return;

            const currentArr = this._settings.get_strv(keyName);
            const currentStr = currentArr[0]?.trim() ?? '';

            recordBtn.label = formatShortcutLabel(currentStr);

            const allConflicts = Array.isArray(conflicts)
                ? conflicts
                : checkConflicts(this._settings);
            const keyConflicts = allConflicts.filter(c => c.hotkeyKey === keyName);

            let backupMap = {};
            try {
                const bStr = this._settings.get_string('backup-system-shortcuts');
                if (bStr)
                    backupMap = JSON.parse(bStr);
            } catch {
                backupMap = {};
            }

            conflictAction = null;

            if (!currentStr) {
                row.subtitle = `${defaultDescription} (${_('Disabled')})`;
                conflictBtn.visible = false;
                return;
            }

            if (isModifierOnlyShortcut(currentStr)) {
                row.subtitle = `⚠️ ${_('Modifier-only shortcut cannot be bound in GNOME Shell: %s').format(currentStr)}`;
                conflictBtn.visible = false;
                return;
            }

            if (keyConflicts.length > 0) {
                const conf = keyConflicts[0];
                row.subtitle = `⚠️ ${_('Conflict: shortcut "%s" is assigned to %s (%s)').format(
                    conf.shortcut,
                    conf.schemaKey,
                    conf.schemaId
                )}`;

                conflictBtn.visible = true;
                conflictBtn.label = _('Free in System');
                conflictBtn.css_classes = ['suggested-action'];

                conflictAction = () => freeSystemShortcut(conf, this._settings);
            } else {
                // Check if this shortcut was previously freed and is stored in backups
                let freedEntry = null;
                const normShort = normalizeShortcut(currentStr);

                for (const [, entry] of Object.entries(backupMap)) {
                    const entryVals = Array.isArray(entry.value) ? entry.value : [entry.value];
                    if (entryVals.some(v => normalizeShortcut(v) === normShort)) {
                        freedEntry = entry;
                        break;
                    }
                }

                if (freedEntry) {
                    row.subtitle = _('Overriding system shortcut: %s (%s)').format(
                        freedEntry.schemaKey,
                        freedEntry.schemaId
                    );

                    conflictBtn.visible = true;
                    conflictBtn.label = _('Restore in System');
                    conflictBtn.css_classes = [];

                    conflictAction = () => restoreSystemShortcut(
                        freedEntry.schemaId,
                        freedEntry.schemaKey,
                        this._settings
                    );
                } else {
                    row.subtitle = defaultDescription;
                    conflictBtn.visible = false;
                }
            }
        };

        const stopRecording = (refresh = true) => {
            if (!isRecording)
                return;
            isRecording = false;
            if (this._context.activeRecorderStop === stopRecording)
                this._context.activeRecorderStop = null;

            if (controller) {
                if (controllerSignalId) {
                    try {
                        controller.disconnect(controllerSignalId);
                    } catch {
                        // Ignore
                    }
                    controllerSignalId = 0;
                }

                const target = controllerTarget ?? recordBtn.get_root() ?? recordBtn;
                try {
                    target.remove_controller(controller);
                } catch {
                    // Ignore
                }
                controller = null;
                controllerTarget = null;
            }

            recordBtn.remove_css_class('suggested-action');
            if (refresh)
                updateUi();
        };

        const startRecording = () => {
            if (this._context.activeRecorderStop)
                this._context.activeRecorderStop(true);

            isRecording = true;
            this._context.activeRecorderStop = stopRecording;

            recordBtn.add_css_class('suggested-action');
            recordBtn.label = _('Press keys…');
            row.subtitle = _('Press keys now — Escape to cancel, Backspace to disable');

            controller = new Gtk.EventControllerKey();
            controller.set_propagation_phase(Gtk.PropagationPhase.CAPTURE);

            controllerSignalId = controller.connect('key-pressed', (_c, keyval, _keycode, state) => {
                // 1. Escape: Cancel recording without modifying settings
                if (keyval === Gdk.KEY_Escape) {
                    stopRecording(true);
                    return Gdk.EVENT_STOP;
                }

                const mask = state & Gtk.accelerator_get_default_mod_mask();

                // 2. Backspace (unmodified): Clear shortcut (empty is valid, means Disabled)
                if (keyval === Gdk.KEY_BackSpace && mask === 0) {
                    this.withSuppressedSignals(() => {
                        this._settings.set_strv(keyName, []);
                        cleanupUnusedSystemOverrides(this._settings);
                    });
                    stopRecording(false);
                    this.refreshAllRows();
                    return Gdk.EVENT_STOP;
                }

                // 3. Modifier-only keys: Wait for a non-modifier key
                if (!Gtk.accelerator_valid(keyval, mask))
                    return Gdk.EVENT_STOP;

                // 4. Form valid accelerator name
                const accel = Gtk.accelerator_name(keyval, mask);
                if (!accel)
                    return Gdk.EVENT_STOP;

                // 5. Validation: check duplicates among all Liswitch actions
                const duplicateActionTitle = findDuplicateAction(
                    this._settings,
                    keyName,
                    accel,
                    this._context.actionTitles
                );
                if (duplicateActionTitle) {
                    stopRecording(true);
                    row.subtitle = `⚠️ ${_('Shortcut "%s" is already assigned to "%s".').format(accel, duplicateActionTitle)}`;
                    return Gdk.EVENT_STOP;
                }

                // 6. Save valid combination
                this.withSuppressedSignals(() => {
                    this._settings.set_strv(keyName, [accel]);
                    cleanupUnusedSystemOverrides(this._settings);
                });
                stopRecording(false);
                this.refreshAllRows();
                return Gdk.EVENT_STOP;
            });

            controllerTarget = recordBtn.get_root() ?? recordBtn;
            controllerTarget.add_controller(controller);
        };

        recordBtn.connect('clicked', () => {
            if (isRecording)
                stopRecording(true);
            else
                startRecording();
        });

        this._tracker.addCleanup(() => stopRecording(false));
        this._tracker.connect(this._settings, `changed::${keyName}`, () => {
            if (this._suppressSignalDepth === 0)
                updateUi();
        });
        this._rowRefreshCallbacks.push(updateUi);

        if (autoRefresh)
            updateUi();

        return row;
    }
}

/**
 * Page 1: General Preferences («Основное»)
 *
 * Configures the top panel indicator, mouse scroll switching, and visual OSD overlay.
 */
class LiswitchGeneralPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor(settings) {
        super({
            title: _('General'),
            icon_name: 'preferences-other-symbolic',
        });

        this._settings = settings;
        this._tracker = new SignalTracker();
        this._destroyId = this.connect('destroy', () => this.cleanup());

        // --- Panel Indicator Group ---
        const indicatorGroup = new Adw.PreferencesGroup({
            title: _('Panel Indicator'),
            description: _('Configure the layout indicator in the top panel'),
        });
        this.add(indicatorGroup);

        const indicatorRow = new Adw.SwitchRow({
            title: _('Show Indicator'),
            subtitle: _('Display the keyboard layout indicator in the top panel'),
        });
        indicatorGroup.add(indicatorRow);
        this._settings.bind(
            'indicator-enabled',
            indicatorRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const hideSystemRow = new Adw.SwitchRow({
            title: _('Hide System Indicator'),
            subtitle: _('Hide standard GNOME keyboard indicator to prevent duplicates'),
        });
        indicatorGroup.add(hideSystemRow);
        this._settings.bind(
            'hide-system-indicator',
            hideSystemRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const scrollRow = new Adw.SwitchRow({
            title: _('Scroll to Switch Layout'),
            subtitle: _('Switch layouts by scrolling the mouse wheel over the indicator'),
        });
        indicatorGroup.add(scrollRow);
        this._settings.bind(
            'scroll-switch',
            scrollRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const formatModel = new Gtk.StringList();
        formatModel.append(_('Short (uppercase, e.g. EN)'));
        formatModel.append(_('Full Name (e.g. English)'));
        formatModel.append(_('Lowercase (e.g. en)'));

        const formatValues = ['short', 'full', 'lowercase'];

        const formatRow = new Adw.ComboRow({
            title: _('Label Format'),
            subtitle: _('Choose how layout names appear in the panel'),
            model: formatModel,
        });
        indicatorGroup.add(formatRow);

        const currentFormat = this._settings.get_string('indicator-format');
        const initialIndex = formatValues.indexOf(currentFormat);
        formatRow.selected = initialIndex >= 0 ? initialIndex : 0;

        formatRow.connect('notify::selected', () => {
            const idx = formatRow.selected;
            if (idx >= 0 && idx < formatValues.length)
                this._settings.set_string('indicator-format', formatValues[idx]);
        });

        const positionModel = new Gtk.StringList();
        positionModel.append(_('Next to System Indicator'));
        positionModel.append(_('Right Panel Box'));
        positionModel.append(_('Center Panel Box'));
        positionModel.append(_('Left Panel Box'));

        const positionValues = ['system', 'right', 'center', 'left'];

        const positionRow = new Adw.ComboRow({
            title: _('Indicator Position'),
            subtitle: _('Choose where the layout indicator appears in the top panel'),
            model: positionModel,
        });
        indicatorGroup.add(positionRow);

        if (this._settings.settings_schema?.has_key?.('indicator-position') !== false) {
            const currentPos = this._settings.get_string('indicator-position');
            const posIdx = positionValues.indexOf(currentPos);
            positionRow.selected = posIdx >= 0 ? posIdx : 0;

            positionRow.connect('notify::selected', () => {
                const idx = positionRow.selected;
                if (idx >= 0 && idx < positionValues.length)
                    this._settings.set_string('indicator-position', positionValues[idx]);
            });

            this._tracker.connect(this._settings, 'changed::indicator-position', () => {
                const val = this._settings.get_string('indicator-position');
                const idx = positionValues.indexOf(val);
                if (idx >= 0 && positionRow.selected !== idx)
                    positionRow.selected = idx;
            });
        }

        indicatorRow.bind_property(
            'active',
            hideSystemRow,
            'sensitive',
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE
        );
        indicatorRow.bind_property(
            'active',
            scrollRow,
            'sensitive',
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE
        );
        indicatorRow.bind_property(
            'active',
            formatRow,
            'sensitive',
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE
        );
        indicatorRow.bind_property(
            'active',
            positionRow,
            'sensitive',
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE
        );

        // --- On-Screen Display (OSD) Group ---
        const osdGroup = new Adw.PreferencesGroup({
            title: _('On-Screen Display (OSD)'),
            description: _('Visual notification popup when switching layouts'),
        });
        this.add(osdGroup);

        const osdRow = new Adw.SwitchRow({
            title: _('Show OSD Pop-up'),
            subtitle: _('Display a brief notification when layout changes'),
        });
        osdGroup.add(osdRow);

        if (this._settings.settings_schema?.has_key('show-osd')) {
            this._settings.bind(
                'show-osd',
                osdRow,
                'active',
                Gio.SettingsBindFlags.DEFAULT
            );
        }

        const osdPositionModel = new Gtk.StringList();
        osdPositionModel.append(_('Center of Screen'));
        osdPositionModel.append(_('Top of Screen'));
        osdPositionModel.append(_('Bottom of Screen'));

        const osdPositionValues = ['center', 'top', 'bottom'];

        const osdPositionRow = new Adw.ComboRow({
            title: _('OSD Position'),
            subtitle: _('Vertical placement of the OSD notification on the active monitor'),
            model: osdPositionModel,
        });
        osdGroup.add(osdPositionRow);

        if (this._settings.settings_schema?.has_key?.('osd-position') !== false) {
            const currentOsdPos = this._settings.get_string('osd-position');
            const osdPosIdx = osdPositionValues.indexOf(currentOsdPos);
            osdPositionRow.selected = osdPosIdx >= 0 ? osdPosIdx : 0;

            osdPositionRow.connect('notify::selected', () => {
                const idx = osdPositionRow.selected;
                if (idx >= 0 && idx < osdPositionValues.length)
                    this._settings.set_string('osd-position', osdPositionValues[idx]);
            });

            this._tracker.connect(this._settings, 'changed::osd-position', () => {
                const val = this._settings.get_string('osd-position');
                const idx = osdPositionValues.indexOf(val);
                if (idx >= 0 && osdPositionRow.selected !== idx)
                    osdPositionRow.selected = idx;
            });
        }

        const durationRow = new Adw.SpinRow({
            title: _('OSD Duration'),
            subtitle: _('How long the OSD stays visible (in milliseconds)'),
            adjustment: new Gtk.Adjustment({
                lower: 300,
                upper: 3000,
                step_increment: 100,
                page_increment: 500,
            }),
        });
        osdGroup.add(durationRow);

        if (this._settings.settings_schema?.has_key('osd-duration-ms')) {
            const currentDuration = this._settings.get_uint('osd-duration-ms') || 1000;
            durationRow.set_value(currentDuration);

            durationRow.connect('notify::value', () => {
                const val = Math.round(durationRow.get_value());
                this._settings.set_uint('osd-duration-ms', val);
            });

            this._tracker.connect(this._settings, 'changed::osd-duration-ms', () => {
                const val = this._settings.get_uint('osd-duration-ms') || 1000;
                if (Math.round(durationRow.get_value()) !== val)
                    durationRow.set_value(val);
            });
        }

        const autoSwitchRow = new Adw.SwitchRow({
            title: _('Show OSD on Window Restore'),
            subtitle: _('Display notification when layout is restored automatically by window memory'),
        });
        osdGroup.add(autoSwitchRow);

        if (this._settings.settings_schema?.has_key('osd-show-on-auto-switch')) {
            this._settings.bind(
                'osd-show-on-auto-switch',
                autoSwitchRow,
                'active',
                Gio.SettingsBindFlags.DEFAULT
            );
        }

        osdRow.bind_property(
            'active',
            osdPositionRow,
            'sensitive',
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE
        );
        osdRow.bind_property(
            'active',
            durationRow,
            'sensitive',
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE
        );
        osdRow.bind_property(
            'active',
            autoSwitchRow,
            'sensitive',
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE
        );

        // --- Diagnostics Group ---
        const debugGroup = new Adw.PreferencesGroup({
            title: _('Diagnostics'),
            description: _('Options for troubleshooting liswitch'),
        });
        this.add(debugGroup);

        const debugRow = new Adw.SwitchRow({
            title: _('Debug Logging'),
            subtitle: _('Output detailed diagnostic messages to the system journal'),
        });
        debugGroup.add(debugRow);

        this._settings.bind(
            'debug',
            debugRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
    }

    cleanup() {
        const destroyId = this._destroyId;
        this._destroyId = 0;
        if (destroyId) {
            try {
                this.disconnect(destroyId);
            } catch {
                // Ignore
            }
        }
        this._tracker.dispose();
    }
}

/**
 * Page 2: Shortcuts Preferences («Горячие клавиши»)
 *
 * Interactive shortcut recorder using Gtk.EventControllerKey, Escape cancellation,
 * Backspace clearing, conflict detection, duplicate validation, and reset to defaults.
 */
class LiswitchShortcutsPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor(settings, shortcutContext = null) {
        super({
            title: _('Shortcuts'),
            icon_name: 'input-keyboard-symbolic',
        });

        this._settings = settings;
        this._tracker = new SignalTracker();
        this._destroyId = this.connect('destroy', () => this.cleanup());
        this._shortcutGroup = new ShortcutRowGroup(this._settings, this._tracker, shortcutContext);

        this._inputSourcesSettings = null;
        try {
            this._inputSourcesSettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.input-sources',
            });
        } catch {
            this._inputSourcesSettings = null;
        }

        this._wmKeybindingsSettings = null;
        try {
            this._wmKeybindingsSettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.wm.keybindings',
            });
        } catch {
            this._wmKeybindingsSettings = null;
        }

        this._buildUi();
    }

    _buildUi() {
        // --- Cyclic Switching Group ---
        const switchGroup = new Adw.PreferencesGroup({
            title: _('Layout Switching Shortcuts'),
            description: _('Configure keybindings to switch between configured input sources'),
        });
        this.add(switchGroup);

        this._shortcutGroup.createRow(switchGroup, {
            keyName: 'hotkey-next',
            title: _('Next Layout'),
            defaultDescription: _('Cycle forward through available input sources'),
            defaultShortcuts: ['<Control><Alt>space'],
        });

        this._shortcutGroup.createRow(switchGroup, {
            keyName: 'hotkey-previous',
            title: _('Previous Layout'),
            defaultDescription: _('Cycle backward through available input sources'),
            defaultShortcuts: ['<Control><Alt><Shift>space'],
        });

        // --- Modifier-Only Switching (System XKB) ---
        this._buildModifierSwitchingGroup();

        // --- Direct Selection Group ---
        const directGroup = new Adw.PreferencesGroup({
            title: _('Direct Layout Selection'),
            description: _('Jump directly to a specific layout by number (1 to 4)'),
        });
        this.add(directGroup);

        for (let i = 1; i <= 4; i++) {
            this._shortcutGroup.createRow(directGroup, {
                keyName: `hotkey-switch-${i}`,
                title: _('Switch to Layout %d').format(i),
                defaultDescription: _('Directly activate layout at index %d').format(i - 1),
                defaultShortcuts: [],
            });
        }

        // Single batched conflict check across all 6 rows
        this._shortcutGroup.refreshAllRows();
    }

    _buildModifierSwitchingGroup() {
        const xkbGroup = new Adw.PreferencesGroup({
            title: _('Modifier-Only Switching (System XKB)'),
            description: _(
                'GNOME Shell keybindings require a non-modifier key. Pure modifier combinations ' +
                'are configured at the system XKB level via org.gnome.desktop.input-sources xkb-options ' +
                '(other XKB options such as compose:* or lv3:* are preserved).'
            ),
        });
        this.add(xkbGroup);

        const presetLabels = {
            none: _('None (system default)'),
            alt_shift: _('Alt+Shift (grp:alt_shift_toggle)'),
            ctrl_shift: _('Ctrl+Shift (grp:ctrl_shift_toggle)'),
            caps: _('Caps Lock (grp:caps_toggle)'),
        };

        let xkbValues = [];
        let isSyncingXkb = false;

        const xkbRow = new Adw.ComboRow({
            title: _('XKB Modifier Toggle'),
            subtitle: _('Configure system XKB modifier-only layout switching'),
        });
        xkbGroup.add(xkbRow);

        const winSpaceStatusLabel = new Gtk.Label({
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        });

        const winSpaceRow = new Adw.ActionRow({
            title: _('Win+Space (System switch-input-source)'),
            subtitle: _('Indicates the built-in GNOME input-source switching shortcut'),
        });
        winSpaceRow.add_suffix(winSpaceStatusLabel);
        xkbGroup.add(winSpaceRow);

        const syncXkbUi = () => {
            if (!this._inputSourcesSettings) {
                const fallbackModel = new Gtk.StringList();
                for (const preset of XKB_SWITCH_PRESETS)
                    fallbackModel.append(presetLabels[preset.id]);
                isSyncingXkb = true;
                try {
                    xkbValues = XKB_SWITCH_PRESETS.map(p => p.option);
                    xkbRow.model = fallbackModel;
                    xkbRow.selected = 0;
                    xkbRow.sensitive = false;
                    xkbRow.subtitle = _('System schema org.gnome.desktop.input-sources is unavailable');
                } finally {
                    isSyncingXkb = false;
                }
                return;
            }

            const currentOpts = this._inputSourcesSettings.get_strv('xkb-options');
            const activeGrp = getXkbGroupToggleOption(currentOpts);
            const otherOpts = getOtherXkbOptions(currentOpts);

            const model = new Gtk.StringList();
            const nextValues = [];
            for (const preset of XKB_SWITCH_PRESETS) {
                model.append(presetLabels[preset.id]);
                nextValues.push(preset.option);
            }

            let selectedIdx = nextValues.indexOf(activeGrp);
            if (activeGrp && selectedIdx < 0) {
                model.append(_('Custom (%s)').format(activeGrp));
                nextValues.push(activeGrp);
                selectedIdx = nextValues.length - 1;
            } else if (selectedIdx < 0) {
                selectedIdx = 0;
            }

            const modelChanged =
                xkbValues.length !== nextValues.length ||
                xkbValues.some((val, i) => val !== nextValues[i]);

            isSyncingXkb = true;
            try {
                if (modelChanged) {
                    xkbValues = nextValues;
                    xkbRow.model = model;
                }
                if (xkbRow.selected !== selectedIdx)
                    xkbRow.selected = selectedIdx;
                xkbRow.sensitive = true;
            } finally {
                isSyncingXkb = false;
            }

            if (otherOpts.length > 0)
                xkbRow.subtitle = _('Preserved XKB options: %s').format(otherOpts.join(', '));
            else
                xkbRow.subtitle = _('Configure system XKB modifier-only layout switching');
        };

        const syncWinSpaceUi = () => {
            const info = getSystemInputSourceSwitchInfo({
                wmSettings: this._wmKeybindingsSettings,
            });

            if (!info.available) {
                winSpaceRow.subtitle = _('System schema org.gnome.desktop.wm.keybindings is unavailable');
                winSpaceStatusLabel.label = _('Unavailable');
                winSpaceStatusLabel.css_classes = ['dim-label'];
                return;
            }

            if (info.hasWinSpace) {
                const labels = info.shortcuts.map(formatShortcutLabel).join(', ');
                winSpaceRow.subtitle = _('Active in system keybindings: %s').format(labels);
                winSpaceStatusLabel.label = _('Active');
                winSpaceStatusLabel.css_classes = ['accent'];
                return;
            }

            if (info.shortcuts.length > 0) {
                const labels = info.shortcuts.map(formatShortcutLabel).join(', ');
                winSpaceRow.subtitle = _('Current system switch-input-source: %s (Win+Space not assigned)').format(labels);
                winSpaceStatusLabel.label = _('Custom');
                winSpaceStatusLabel.css_classes = ['dim-label'];
                return;
            }

            let isOverridden = false;
            try {
                const rawBackup = this._settings.get_string('backup-system-shortcuts');
                if (rawBackup) {
                    const backupMap = JSON.parse(rawBackup);
                    isOverridden = Boolean(backupMap?.['org.gnome.desktop.wm.keybindings:switch-input-source']);
                }
            } catch {
                isOverridden = false;
            }

            if (isOverridden) {
                winSpaceRow.subtitle = _('Overridden by a Liswitch shortcut above');
                winSpaceStatusLabel.label = _('Overridden');
                winSpaceStatusLabel.css_classes = ['warning'];
            } else {
                winSpaceRow.subtitle = _('Disabled in system keybindings');
                winSpaceStatusLabel.label = _('Disabled');
                winSpaceStatusLabel.css_classes = ['dim-label'];
            }
        };

        const selectedSignalId = xkbRow.connect('notify::selected', () => {
            if (isSyncingXkb || !this._inputSourcesSettings)
                return;
            const idx = xkbRow.selected;
            if (idx < 0 || idx >= xkbValues.length)
                return;
            applyXkbGroupToggleSetting(this._inputSourcesSettings, xkbValues[idx]);
        });
        this._tracker.addCleanup(() => {
            try {
                xkbRow.disconnect(selectedSignalId);
            } catch {
                // Ignore
            }
        });

        if (this._inputSourcesSettings)
            this._tracker.connect(this._inputSourcesSettings, 'changed::xkb-options', syncXkbUi);
        if (this._wmKeybindingsSettings)
            this._tracker.connect(this._wmKeybindingsSettings, 'changed::switch-input-source', syncWinSpaceUi);
        this._tracker.connect(this._settings, 'changed::backup-system-shortcuts', syncWinSpaceUi);

        syncXkbUi();
        syncWinSpaceUi();
    }

    cleanup() {
        const destroyId = this._destroyId;
        this._destroyId = 0;
        if (destroyId) {
            try {
                this.disconnect(destroyId);
            } catch {
                // Ignore
            }
        }
        this._tracker.dispose();
        this._inputSourcesSettings = null;
        this._wmKeybindingsSettings = null;
    }
}

/**
 * Page 3: Memory Preferences («Запоминание»)
 *
 * Configures per-window/per-app layout memory and excluded applications list.
 */
class LiswitchMemoryPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor(settings) {
        super({
            title: _('Memory'),
            icon_name: 'view-restore-symbolic',
        });

        this._settings = settings;
        this._tracker = new SignalTracker();
        this._destroyId = this.connect('destroy', () => this.cleanup());
        this._desktopSettings = null;
        try {
            this._desktopSettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.input-sources',
            });
        } catch {
            this._desktopSettings = null;
        }

        this._buildUi();
    }

    _buildUi() {
        // --- System Conflict Warning Group ---
        const systemConflictGroup = new Adw.PreferencesGroup({
            title: _('System Setting Conflict'),
            description: _('Notice regarding GNOME desktop input settings'),
        });
        this.add(systemConflictGroup);

        const warningRow = new Adw.ActionRow({
            title: _('System "Per-Window" Switching Active ⚠️'),
            subtitle: _(
                'GNOME Settings has "Switch input sources individually for each window" enabled. ' +
                'To avoid duplicate switching conflicts, liswitch layout memory is suspended.'
            ),
        });
        systemConflictGroup.add(warningRow);

        const disableBtn = new Gtk.Button({
            label: _('Disable in System'),
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        disableBtn.connect('clicked', () => {
            if (this._desktopSettings) {
                this._desktopSettings.set_boolean('per-window', false);
                updateWarningState();
            }
        });
        warningRow.add_suffix(disableBtn);

        const updateWarningState = () => {
            let isSystemActive = false;
            try {
                isSystemActive = this._desktopSettings?.get_boolean('per-window') ?? false;
            } catch {
                isSystemActive = false;
            }
            systemConflictGroup.visible = isSystemActive;
        };

        if (this._desktopSettings)
            this._tracker.connect(this._desktopSettings, 'changed::per-window', updateWarningState);
        updateWarningState();

        // --- Memory Mode Group ---
        const modeGroup = new Adw.PreferencesGroup({
            title: _('Layout Memory Mode'),
            description: _('Remember and restore keyboard layout when switching between windows'),
        });
        this.add(modeGroup);

        const modeModel = new Gtk.StringList();
        modeModel.append(_('Per-Application (recommended)'));
        modeModel.append(_('Per-Window'));
        modeModel.append(_('Disabled'));
        const modeValues = ['per-app', 'per-window', 'off'];

        const modeRow = new Adw.ComboRow({
            title: _('Memory Mode'),
            subtitle: _('Choose how layouts are tracked across applications and windows'),
            model: modeModel,
        });
        modeGroup.add(modeRow);

        const currentMode = this._settings.get_string('memory-mode');
        const modeIdx = modeValues.indexOf(currentMode);
        modeRow.selected = modeIdx >= 0 ? modeIdx : 0;

        modeRow.connect('notify::selected', () => {
            const idx = modeRow.selected;
            if (idx >= 0 && idx < modeValues.length)
                this._settings.set_string('memory-mode', modeValues[idx]);
        });

        this._tracker.connect(this._settings, 'changed::memory-mode', () => {
            const val = this._settings.get_string('memory-mode');
            const i = modeValues.indexOf(val);
            if (i >= 0 && modeRow.selected !== i)
                modeRow.selected = i;
        });

        const defaultLayoutModel = new Gtk.StringList();
        defaultLayoutModel.append(_('Keep active layout'));
        defaultLayoutModel.append(_('Reset to first layout'));
        const defaultLayoutValues = ['keep', 'first'];

        const defaultRow = new Adw.ComboRow({
            title: _('New Windows Initial Layout'),
            subtitle: _('Action when focusing a window that has no saved layout'),
            model: defaultLayoutModel,
        });
        modeGroup.add(defaultRow);

        const currentDefault = this._settings.get_string('default-layout-mode');
        const defaultIdx = defaultLayoutValues.indexOf(currentDefault);
        defaultRow.selected = defaultIdx >= 0 ? defaultIdx : 0;

        defaultRow.connect('notify::selected', () => {
            const idx = defaultRow.selected;
            if (idx >= 0 && idx < defaultLayoutValues.length)
                this._settings.set_string('default-layout-mode', defaultLayoutValues[idx]);
        });

        this._tracker.connect(this._settings, 'changed::default-layout-mode', () => {
            const val = this._settings.get_string('default-layout-mode');
            const i = defaultLayoutValues.indexOf(val);
            if (i >= 0 && defaultRow.selected !== i)
                defaultRow.selected = i;
        });

        this._installedApps = getInstalledApplications();
        this._appLookup = buildAppLookupMap(this._installedApps);
        this._activePickerDialog = null;
        this._tracker.addCleanup(() => {
            if (this._activePickerDialog) {
                try {
                    this._activePickerDialog.close();
                } catch {
                    // Ignore
                }
                this._activePickerDialog = null;
            }
        });

        this._buildPerAppDefaultsGroup();
        this._buildExcludedAppsGroup();
    }

    _createAppIcon(appInfo, pixelSize = 24) {
        if (appInfo?.icon) {
            return new Gtk.Image({
                gicon: appInfo.icon,
                pixel_size: pixelSize,
                valign: Gtk.Align.CENTER,
            });
        }
        return new Gtk.Image({
            icon_name: 'application-x-executable-symbolic',
            pixel_size: pixelSize,
            valign: Gtk.Align.CENTER,
        });
    }

    _openAppPickerDialog({title, configuredIds = new Set(), onSelect}) {
        if (this._activePickerDialog) {
            try {
                this._activePickerDialog.close();
            } catch {
                // Ignore
            }
            this._activePickerDialog = null;
        }

        // Refresh installed apps list on open in case user installed new apps
        this._installedApps = getInstalledApplications();
        this._appLookup = buildAppLookupMap(this._installedApps);

        const dialog = new Adw.Dialog({
            title,
            content_width: 440,
            content_height: 520,
        });
        this._activePickerDialog = dialog;

        const toolbarView = new Adw.ToolbarView();
        toolbarView.add_top_bar(new Adw.HeaderBar());

        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: _('Search applications by name or ID…'),
            hexpand: true,
        });
        contentBox.append(searchEntry);

        const listBox = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list'],
        });
        listBox.set_placeholder(new Gtk.Label({
            label: _('No matching applications found'),
            css_classes: ['dim-label'],
            margin_top: 24,
            margin_bottom: 24,
        }));

        const rowMetadata = new Map();
        for (const app of this._installedApps) {
            const subtitle = app.wmClass && app.wmClass.toLowerCase() !== app.appId.toLowerCase()
                ? `${app.appId} (${app.wmClass})`
                : app.appId;

            const row = new Adw.ActionRow({
                title: app.displayName,
                subtitle,
                activatable: true,
            });
            row.add_prefix(this._createAppIcon(app, 32));

            if (configuredIds.has(app.appId.toLowerCase())) {
                row.add_suffix(new Gtk.Label({
                    label: _('Added'),
                    css_classes: ['dim-label'],
                    valign: Gtk.Align.CENTER,
                }));
            }

            row.connect('activated', () => {
                if (this._activePickerDialog === dialog)
                    this._activePickerDialog = null;
                dialog.close();
                onSelect(app);
            });

            rowMetadata.set(row, `${app.displayName} ${app.appId} ${app.wmClass ?? ''}`.toLowerCase());
            listBox.append(row);
        }

        listBox.set_filter_func(row => {
            const query = searchEntry.get_text().trim().toLowerCase();
            if (!query)
                return true;
            const hay = rowMetadata.get(row) ?? '';
            return hay.includes(query);
        });

        searchEntry.connect('search-changed', () => {
            listBox.invalidate_filter();
        });

        const scrolled = new Gtk.ScrolledWindow({
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            child: listBox,
        });
        contentBox.append(scrolled);

        toolbarView.set_content(contentBox);
        dialog.set_child(toolbarView);

        dialog.connect('closed', () => {
            if (this._activePickerDialog === dialog)
                this._activePickerDialog = null;
        });

        const parent = this.get_root();
        if (parent)
            dialog.present(parent);
    }

    _readAppDefaultLayouts() {
        try {
            if (this._settings.settings_schema?.has_key?.('app-default-layouts') === false)
                return {};
            return parseAppDefaultLayouts(this._settings.get_string('app-default-layouts'));
        } catch {
            return {};
        }
    }

    _writeAppDefaultLayouts(map) {
        if (this._settings.settings_schema?.has_key?.('app-default-layouts') === false)
            return;
        this._settings.set_string('app-default-layouts', serializeAppDefaultLayouts(map));
    }

    _buildPerAppDefaultsGroup() {
        const perAppGroup = new Adw.PreferencesGroup({
            title: _('Per-App Starting Layout'),
            description: _('Force a specific layout when an application is focused for the first time'),
        });
        this.add(perAppGroup);

        const appEntryRow = new Adw.EntryRow({
            title: _('Application ID (e.g. org.gnome.Console)'),
            show_apply_button: false,
        });
        perAppGroup.add(appEntryRow);

        const browseBtn = new Gtk.Button({
            icon_name: 'view-app-grid-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: _('Choose from installed applications'),
        });
        appEntryRow.add_suffix(browseBtn);

        const layoutRow = new Adw.ComboRow({
            title: _('Starting Layout'),
            subtitle: _('Layout activated on first focus of this application'),
        });
        perAppGroup.add(layoutRow);

        const addRuleBtn = new Gtk.Button({
            label: _('Add'),
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
            tooltip_text: _('Assign starting layout for this application'),
        });
        layoutRow.add_suffix(addRuleBtn);

        const rulesExpander = new Adw.ExpanderRow({
            title: _('Configured Rules'),
            subtitle: '',
        });
        perAppGroup.add(rulesExpander);

        let configuredSources = [];
        const ruleRows = [];

        const updateAddSensitivity = () => {
            const hasText = normalizeAppId(appEntryRow.text).length > 0;
            addRuleBtn.sensitive = hasText && configuredSources.length > 0;
        };

        const refreshRulesList = () => {
            for (const r of ruleRows) {
                try {
                    rulesExpander.remove(r);
                } catch {
                    // Ignore
                }
            }
            ruleRows.length = 0;

            const map = this._readAppDefaultLayouts();
            const entries = Object.entries(map);
            if (entries.length === 0) {
                rulesExpander.subtitle = _('No per-app starting layouts configured');
                rulesExpander.expanded = false;
                return;
            }

            rulesExpander.subtitle = _('%d application rule(s) configured').format(entries.length);
            rulesExpander.expanded = true;

            entries.sort(([a], [b]) => {
                const nameA = this._appLookup.get(a.toLowerCase())?.displayName ?? a;
                const nameB = this._appLookup.get(b.toLowerCase())?.displayName ?? b;
                return nameA.localeCompare(nameB);
            });

            for (const [appId, sourceId] of entries) {
                const appInfo = this._appLookup.get(appId.toLowerCase()) ?? null;
                const sourceIdx = configuredSources.findIndex(s => s.id === sourceId);
                const isMissingSource = sourceIdx < 0;

                const row = new Adw.ActionRow({
                    title: appInfo ? appInfo.displayName : appId,
                    subtitle: isMissingSource
                        ? `⚠️ ${_('Layout "%s" is not configured in system').format(sourceId)}`
                        : (appInfo ? appId : _('Custom application ID')),
                });
                row.add_prefix(this._createAppIcon(appInfo, 24));

                const optionLabels = configuredSources.map(s => s.label);
                const optionIds = configuredSources.map(s => s.id);
                if (isMissingSource) {
                    optionLabels.push(`${sourceId} (${_('Missing')})`);
                    optionIds.push(sourceId);
                }

                if (optionLabels.length > 0) {
                    const dropDown = Gtk.DropDown.new_from_strings(optionLabels);
                    dropDown.valign = Gtk.Align.CENTER;
                    dropDown.selected = isMissingSource ? optionIds.length - 1 : sourceIdx;
                    dropDown.connect('notify::selected', () => {
                        const selIdx = dropDown.selected;
                        const nextSourceId = optionIds[selIdx];
                        if (!nextSourceId || nextSourceId === sourceId)
                            return;
                        const updated = this._readAppDefaultLayouts();
                        updated[appId] = nextSourceId;
                        this._writeAppDefaultLayouts(updated);
                    });
                    row.add_suffix(dropDown);
                }

                const delBtn = new Gtk.Button({
                    icon_name: 'user-trash-symbolic',
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat'],
                    tooltip_text: _('Remove starting layout rule'),
                });
                delBtn.connect('clicked', () => {
                    const updated = this._readAppDefaultLayouts();
                    delete updated[appId];
                    this._writeAppDefaultLayouts(updated);
                    refreshRulesList();
                });
                row.add_suffix(delBtn);

                rulesExpander.add_row(row);
                ruleRows.push(row);
            }
        };

        const syncSourcesUi = () => {
            configuredSources = getConfiguredInputSources(this._desktopSettings);
            const model = new Gtk.StringList();

            if (configuredSources.length === 0) {
                model.append(_('No system layouts configured'));
                layoutRow.model = model;
                layoutRow.selected = 0;
                layoutRow.sensitive = false;
            } else {
                for (const src of configuredSources)
                    model.append(src.label);
                layoutRow.model = model;
                layoutRow.selected = 0;
                layoutRow.sensitive = true;
            }

            updateAddSensitivity();
            refreshRulesList();
        };

        const submitRule = () => {
            const appId = normalizeAppId(appEntryRow.text);
            if (!appId || configuredSources.length === 0)
                return;

            const selectedSource = configuredSources[layoutRow.selected] ?? configuredSources[0];
            if (!selectedSource)
                return;

            const updated = this._readAppDefaultLayouts();
            for (const existingKey of Object.keys(updated)) {
                if (existingKey.toLowerCase() === appId.toLowerCase())
                    delete updated[existingKey];
            }
            updated[appId] = selectedSource.id;
            this._writeAppDefaultLayouts(updated);
            appEntryRow.text = '';
            updateAddSensitivity();
            refreshRulesList();
        };

        browseBtn.connect('clicked', () => {
            const currentMap = this._readAppDefaultLayouts();
            const configuredIds = new Set(Object.keys(currentMap).map(k => k.toLowerCase()));
            this._openAppPickerDialog({
                title: _('Select Application'),
                configuredIds,
                onSelect: app => {
                    appEntryRow.text = app.appId;
                    updateAddSensitivity();
                },
            });
        });

        appEntryRow.connect('notify::text', updateAddSensitivity);
        appEntryRow.connect('entry-activated', submitRule);
        addRuleBtn.connect('clicked', submitRule);

        if (this._settings.settings_schema?.has_key?.('app-default-layouts') !== false)
            this._tracker.connect(this._settings, 'changed::app-default-layouts', refreshRulesList);
        if (this._desktopSettings)
            this._tracker.connect(this._desktopSettings, 'changed::sources', syncSourcesUi);

        syncSourcesUi();
    }

    _buildExcludedAppsGroup() {
        // --- Excluded Applications Group ---
        const excludedGroup = new Adw.PreferencesGroup({
            title: _('Excluded Applications'),
            description: _('Applications that should be ignored by layout memory'),
        });
        this.add(excludedGroup);

        const addEntryRow = new Adw.EntryRow({
            title: _('Add application ID (e.g. org.gnome.Console)'),
            show_apply_button: true,
        });
        excludedGroup.add(addEntryRow);

        const browseBtn = new Gtk.Button({
            icon_name: 'view-app-grid-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: _('Choose from installed applications'),
        });
        addEntryRow.add_suffix(browseBtn);

        const excludedExpander = new Adw.ExpanderRow({
            title: _('Excluded List'),
            subtitle: '',
        });
        excludedGroup.add(excludedExpander);

        const itemRows = [];

        const refreshExcludedList = () => {
            for (const r of itemRows) {
                try {
                    excludedExpander.remove(r);
                } catch {
                    // Ignore
                }
            }
            itemRows.length = 0;

            const list = this._settings.get_strv('memory-excluded-apps');
            if (list.length === 0) {
                excludedExpander.subtitle = _('No applications excluded');
                return;
            }

            excludedExpander.subtitle = _('%d application(s) excluded').format(list.length);

            for (const app of list) {
                const appInfo = this._appLookup.get(normalizeAppId(app).toLowerCase()) ?? null;
                const row = new Adw.ActionRow({
                    title: appInfo ? appInfo.displayName : app,
                    subtitle: appInfo ? app : '',
                });
                row.add_prefix(this._createAppIcon(appInfo, 24));

                const delBtn = new Gtk.Button({
                    icon_name: 'user-trash-symbolic',
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat'],
                    tooltip_text: _('Remove from excluded list'),
                });
                delBtn.connect('clicked', () => {
                    const currentList = this._settings.get_strv('memory-excluded-apps');
                    const updated = currentList.filter(item => item !== app);
                    this._settings.set_strv('memory-excluded-apps', updated);
                    refreshExcludedList();
                });
                row.add_suffix(delBtn);

                excludedExpander.add_row(row);
                itemRows.push(row);
            }
        };

        const addExcludedApp = rawAppId => {
            const val = normalizeAppId(rawAppId);
            if (!val)
                return;

            const list = this._settings.get_strv('memory-excluded-apps');
            const alreadyExists = list.some(
                item => normalizeAppId(item).toLowerCase() === val.toLowerCase()
            );
            if (!alreadyExists) {
                list.push(val);
                this._settings.set_strv('memory-excluded-apps', list);
            }
            refreshExcludedList();
        };

        browseBtn.connect('clicked', () => {
            const list = this._settings.get_strv('memory-excluded-apps');
            const configuredIds = new Set(list.map(item => normalizeAppId(item).toLowerCase()));
            this._openAppPickerDialog({
                title: _('Exclude Application'),
                configuredIds,
                onSelect: app => {
                    addExcludedApp(app.appId);
                },
            });
        });

        addEntryRow.connect('apply', () => {
            addExcludedApp(addEntryRow.text);
            addEntryRow.text = '';
        });

        this._tracker.connect(this._settings, 'changed::memory-excluded-apps', refreshExcludedList);
        refreshExcludedList();
    }

    cleanup() {
        const destroyId = this._destroyId;
        this._destroyId = 0;
        if (destroyId) {
            try {
                this.disconnect(destroyId);
            } catch {
                // Ignore
            }
        }
        this._tracker.dispose();
        this._desktopSettings = null;
        this._installedApps = [];
        this._appLookup = null;
        this._activePickerDialog = null;
    }
}

/**
 * Page 4: About Preferences («О расширении»)
 *
 * Information about Liswitch, developer, license, and links.
 */
class LiswitchAboutPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor(_settings, metadata = null) {
        super({
            title: _('About'),
            icon_name: 'help-about-symbolic',
        });

        // App Branding Group
        const headerGroup = new Adw.PreferencesGroup();
        this.add(headerGroup);

        const bannerBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 18,
            margin_bottom: 18,
            halign: Gtk.Align.CENTER,
        });

        const icon = new Gtk.Image({
            icon_name: 'input-keyboard-symbolic',
            pixel_size: 64,
            halign: Gtk.Align.CENTER,
        });
        bannerBox.append(icon);

        const titleLabel = new Gtk.Label({
            label: '<span size="xx-large" weight="bold">Liswitch</span>',
            use_markup: true,
            halign: Gtk.Align.CENTER,
        });
        bannerBox.append(titleLabel);

        const subtitleLabel = new Gtk.Label({
            label: _('Advanced keyboard layout switcher for GNOME Shell'),
            halign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        });
        bannerBox.append(subtitleLabel);

        const versionText = metadata?.['version-name'] ?? String(metadata?.version ?? 'dev');
        const versionLabel = new Gtk.Label({
            label: _('Version %s').format(versionText),
            halign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        });
        bannerBox.append(versionLabel);

        headerGroup.add(bannerBox);

        // Details Group
        const detailsGroup = new Adw.PreferencesGroup({
            title: _('Information'),
        });
        this.add(detailsGroup);

        const devRow = new Adw.ActionRow({
            title: _('Developer'),
            subtitle: 'Liswitch Project',
        });
        detailsGroup.add(devRow);

        const licenseRow = new Adw.ActionRow({
            title: _('License'),
            subtitle: 'GNU General Public License v2.0 or later (GPL-2.0-or-later)',
        });
        detailsGroup.add(licenseRow);

        const platformRow = new Adw.ActionRow({
            title: _('Platform'),
            subtitle: 'GNOME Shell 47–51+ (Wayland)',
        });
        detailsGroup.add(platformRow);

        // Links Group
        const linksGroup = new Adw.PreferencesGroup({
            title: _('Links & Support'),
        });
        this.add(linksGroup);

        const sourceRow = new Adw.ActionRow({
            title: _('Source Code'),
            subtitle: 'https://github.com/liswitch/liswitch',
        });
        const openLinkBtn = new Gtk.Button({
            icon_name: 'external-link-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: _('Open project repository'),
        });
        openLinkBtn.connect('clicked', () => {
            try {
                Gio.AppInfo.launch_default_for_uri('https://github.com/liswitch/liswitch', null);
            } catch {
                // Ignore if in restricted environment
            }
        });
        sourceRow.add_suffix(openLinkBtn);
        linksGroup.add(sourceRow);
    }

    cleanup() {}
}

/**
 * Page 5: Text Correction Preferences («Исправление текста»)
 *
 * Configures wrong-layout text correction (F6), double Left Shift trigger,
 * and security disclosures.
 */
class LiswitchCorrectionPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor(settings, shortcutContext = null) {
        super({
            title: _('Correction'),
            icon_name: 'edit-find-replace-symbolic',
        });

        this._settings = settings;
        this._tracker = new SignalTracker();
        this._destroyId = this.connect('destroy', () => this.cleanup());
        this._shortcutGroup = new ShortcutRowGroup(this._settings, this._tracker, shortcutContext);

        // Security / Privacy Warning Group
        const infoGroup = new Adw.PreferencesGroup({
            title: _('Security & Privacy'),
        });
        this.add(infoGroup);

        const bannerRow = new Adw.ActionRow({
            title: _('In-Memory Keystroke Buffer Notice'),
            subtitle: _('When enabled, the extension maintains a temporary buffer of recent keystrokes (up to 64 chars) strictly in memory to convert text typed in the wrong layout (e.g. "ghbdtn" → "привет"). The buffer is automatically cleared on window focus changes, Enter, Tab, Esc, any modifier, or after 3 seconds of inactivity. Keystrokes are NEVER written to disk or logs.\n\n⚠️ Important: Wayland protocol isolates application surfaces. Extensions cannot detect password fields inside web browsers or third-party apps. Do not use this feature when entering sensitive passwords.'),
        });
        infoGroup.add(bannerRow);

        // Settings Group
        const configGroup = new Adw.PreferencesGroup({
            title: _('Configuration'),
        });
        this.add(configGroup);

        const enableRow = new Adw.SwitchRow({
            title: _('Enable Text Correction'),
            subtitle: _('Convert text typed in the wrong layout into the alternate language'),
        });
        configGroup.add(enableRow);
        this._settings.bind(
            'convert-text-enabled',
            enableRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const doubleShiftRow = new Adw.SwitchRow({
            title: _('Double Left Shift Trigger'),
            subtitle: _('Press Left Shift twice quickly to convert the last typed word'),
        });
        configGroup.add(doubleShiftRow);
        this._settings.bind(
            'convert-double-shift',
            doubleShiftRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        const selectionRow = new Adw.SwitchRow({
            title: _('Convert Selected Text'),
            subtitle: _('When the typing buffer is empty, the manual hotkey copies, converts, and replaces selected text'),
        });
        configGroup.add(selectionRow);
        if (this._settings.settings_schema?.has_key?.('convert-selection-enabled') !== false) {
            this._settings.bind(
                'convert-selection-enabled',
                selectionRow,
                'active',
                Gio.SettingsBindFlags.DEFAULT
            );
        }

        enableRow.bind_property(
            'active',
            selectionRow,
            'sensitive',
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE
        );

        // Manual Shortcut Group
        const shortcutGroup = new Adw.PreferencesGroup({
            title: _('Manual Hotkey'),
            description: _('Keyboard shortcut to manually trigger text conversion'),
        });
        this.add(shortcutGroup);

        this._shortcutGroup.createRow(shortcutGroup, {
            keyName: 'convert-hotkey',
            title: _('Convert Last Word'),
            defaultDescription: _('Shortcut to trigger conversion of the most recently typed word'),
            defaultShortcuts: ['<Shift>Pause'],
        });
        this._shortcutGroup.refreshAllRows();

        // Terminal Applications Group (Ctrl+Shift+V / Ctrl+Shift+C)
        this._buildTerminalAppsGroup();
    }

    _buildTerminalAppsGroup() {
        const terminalGroup = new Adw.PreferencesGroup({
            title: _('Terminal Applications'),
            description: _('Applications where Ctrl+Shift+V and Ctrl+Shift+C are used instead of Ctrl+V and Ctrl+C'),
        });

        const resetBtn = new Gtk.Button({
            icon_name: 'edit-undo-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: _('Reset terminal list to defaults'),
        });
        resetBtn.connect('clicked', () => {
            if (this._settings.settings_schema?.has_key?.('convert-terminal-apps') !== false)
                this._settings.set_strv('convert-terminal-apps', [...DEFAULT_TERMINAL_APPS]);
        });
        terminalGroup.set_header_suffix(resetBtn);
        this.add(terminalGroup);

        const addEntryRow = new Adw.EntryRow({
            title: _('Add terminal app ID or WM_CLASS (e.g. org.gnome.Console)'),
            show_apply_button: true,
        });
        terminalGroup.add(addEntryRow);

        const terminalExpander = new Adw.ExpanderRow({
            title: _('Configured Terminals'),
            subtitle: '',
        });
        terminalGroup.add(terminalExpander);

        const itemRows = [];

        const refreshTerminalList = () => {
            for (const r of itemRows) {
                try {
                    terminalExpander.remove(r);
                } catch {
                    // Ignore
                }
            }
            itemRows.length = 0;

            const list = this._settings.settings_schema?.has_key?.('convert-terminal-apps') !== false
                ? this._settings.get_strv('convert-terminal-apps')
                : [...DEFAULT_TERMINAL_APPS];

            if (list.length === 0) {
                terminalExpander.subtitle = _('No terminal applications configured');
                return;
            }

            terminalExpander.subtitle = _('%d terminal(s) configured').format(list.length);

            for (const appId of list) {
                const row = new Adw.ActionRow({
                    title: appId,
                });

                const delBtn = new Gtk.Button({
                    icon_name: 'user-trash-symbolic',
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat'],
                    tooltip_text: _('Remove from terminal list'),
                });
                delBtn.connect('clicked', () => {
                    const currentList = this._settings.get_strv('convert-terminal-apps');
                    const updated = currentList.filter(item => item !== appId);
                    this._settings.set_strv('convert-terminal-apps', updated);
                });
                row.add_suffix(delBtn);

                terminalExpander.add_row(row);
                itemRows.push(row);
            }
        };

        addEntryRow.connect('apply', () => {
            const val = normalizeAppId(addEntryRow.text);
            if (val && this._settings.settings_schema?.has_key?.('convert-terminal-apps') !== false) {
                const list = this._settings.get_strv('convert-terminal-apps');
                const exists = list.some(item => item.trim().toLowerCase() === val.toLowerCase());
                if (!exists) {
                    list.push(val);
                    this._settings.set_strv('convert-terminal-apps', list);
                }
            }
            addEntryRow.text = '';
        });

        if (this._settings.settings_schema?.has_key?.('convert-terminal-apps') !== false)
            this._tracker.connect(this._settings, 'changed::convert-terminal-apps', refreshTerminalList);

        refreshTerminalList();
    }

    cleanup() {
        const destroyId = this._destroyId;
        this._destroyId = 0;
        if (destroyId) {
            try {
                this.disconnect(destroyId);
            } catch {
                // Ignore
            }
        }
        this._tracker.dispose();
    }
}

export default class LiswitchPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const shortcutContext = createShortcutContext();

        const pages = [
            new LiswitchGeneralPage(settings),
            new LiswitchShortcutsPage(settings, shortcutContext),
            new LiswitchMemoryPage(settings),
            new LiswitchCorrectionPage(settings, shortcutContext),
            new LiswitchAboutPage(settings, this.metadata),
        ];

        for (const page of pages)
            window.add(page);

        if (typeof window.connect === 'function') {
            const cleanupAll = () => {
                for (const page of pages)
                    page.cleanup?.();
            };
            const closeId = window.connect('close-request', () => {
                cleanupAll();
                return false;
            });
            const destroyId = window.connect('destroy', () => {
                cleanupAll();
                try {
                    if (closeId)
                        window.disconnect(closeId);
                    if (destroyId)
                        window.disconnect(destroyId);
                } catch {
                    // Ignore
                }
            });
        }
    }
}
