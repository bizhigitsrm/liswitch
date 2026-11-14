// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Preferences for GNOME Shell 51

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
    isModifierOnlyShortcut,
    normalizeShortcut,
} from './src/hotkeys.js';

function _(str) {
    try {
        return shellGettext(str);
    } catch {
        return str;
    }
}

const ALL_HOTKEY_KEYS = [
    'hotkey-next',
    'hotkey-previous',
    'hotkey-switch-1',
    'hotkey-switch-2',
    'hotkey-switch-3',
    'hotkey-switch-4',
];

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

        // --- On-Screen Display (OSD) Group ---
        const osdGroup = new Adw.PreferencesGroup({
            title: _('On-Screen Display (OSD)'),
            description: _('Visual notification popup when switching layouts'),
        });
        this.add(osdGroup);

        const osdRow = new Adw.SwitchRow({
            title: _('Show OSD Pop-up'),
            subtitle: _('Display a brief centered notification when layout changes'),
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

            this._settings.connect('changed::osd-duration-ms', () => {
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

    constructor(settings) {
        super({
            title: _('Shortcuts'),
            icon_name: 'input-keyboard-symbolic',
        });

        this._settings = settings;
        this._rowRefreshCallbacks = [];
        this._activeRecorderStop = null;
        this._actionTitles = new Map();

        this._buildUi();

        // Refresh rows when backup settings change
        this._settings.connect('changed::backup-system-shortcuts', () => {
            this._refreshAllRows();
        });
    }

    _refreshAllRows() {
        for (const cb of this._rowRefreshCallbacks) {
            try {
                cb();
            } catch {
                // Ignore
            }
        }
    }

    _buildUi() {
        // --- Cyclic Switching Group ---
        const switchGroup = new Adw.PreferencesGroup({
            title: _('Layout Switching Shortcuts'),
            description: _('Configure keybindings to switch between configured input sources'),
        });
        this.add(switchGroup);

        this._createShortcutRow(
            switchGroup,
            'hotkey-next',
            _('Next Layout'),
            _('Cycle forward through available input sources'),
            ['<Control><Alt>space']
        );

        this._createShortcutRow(
            switchGroup,
            'hotkey-previous',
            _('Previous Layout'),
            _('Cycle backward through available input sources'),
            ['<Control><Alt><Shift>space']
        );

        // --- Direct Selection Group ---
        const directGroup = new Adw.PreferencesGroup({
            title: _('Direct Layout Selection'),
            description: _('Jump directly to a specific layout by number (1 to 4)'),
        });
        this.add(directGroup);

        for (let i = 1; i <= 4; i++) {
            this._createShortcutRow(
                directGroup,
                `hotkey-switch-${i}`,
                _('Switch to Layout %d').format(i),
                _('Directly activate layout at index %d').format(i - 1),
                []
            );
        }

        // --- Modifiers & System Architecture Notice ---
        const noticeGroup = new Adw.PreferencesGroup({
            title: _('Modifier-Only Shortcuts Note'),
            description: _(
                'GNOME Shell keybindings require a non-modifier key (like Space, Letter, or Digit). ' +
                'Pure modifier combinations (such as Alt+Shift or Caps Lock) cannot be assigned via extension keybindings; ' +
                'they are managed at the system XKB level in Settings → Keyboard → Special Character Entry or GNOME Tweaks.'
            ),
        });
        this.add(noticeGroup);
    }

    /**
     * Find if another Liswitch action already uses the given accelerator.
     *
     * @param {string} currentKeyName - Key being assigned
     * @param {string} newShortcut - Accelerator to check
     * @returns {string|null} - Title of conflicting action, or null
     */
    _findDuplicateAction(currentKeyName, newShortcut) {
        if (!newShortcut || !newShortcut.trim())
            return null;

        const targetNorm = normalizeShortcut(newShortcut);

        for (const otherKey of ALL_HOTKEY_KEYS) {
            if (otherKey === currentKeyName)
                continue;

            const otherArr = this._settings.get_strv(otherKey);
            for (const item of otherArr) {
                if (normalizeShortcut(item) === targetNorm)
                    return this._actionTitles.get(otherKey) ?? otherKey;
            }
        }

        return null;
    }

    _createShortcutRow(group, keyName, title, defaultDescription, defaultShortcuts) {
        this._actionTitles.set(keyName, title);

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
            this._settings.set_strv(keyName, defaultShortcuts);
            this._refreshAllRows();
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

        const stopRecording = () => {
            if (!isRecording)
                return;
            isRecording = false;
            this._activeRecorderStop = null;

            if (controller) {
                const root = recordBtn.get_root();
                const target = root ?? recordBtn;
                try {
                    target.remove_controller(controller);
                } catch {
                    // Ignore
                }
                controller = null;
            }

            recordBtn.remove_css_class('suggested-action');
            updateUi();
        };

        const startRecording = () => {
            if (this._activeRecorderStop)
                this._activeRecorderStop();

            isRecording = true;
            this._activeRecorderStop = stopRecording;

            recordBtn.add_css_class('suggested-action');
            recordBtn.label = _('Press keys…');
            row.subtitle = _('Press keys now — Escape to cancel, Backspace to disable');

            controller = new Gtk.EventControllerKey();
            controller.set_propagation_phase(Gtk.PropagationPhase.CAPTURE);

            controller.connect('key-pressed', (_c, keyval, _keycode, state) => {
                // 1. Escape: Cancel recording without modifying settings
                if (keyval === Gdk.KEY_Escape) {
                    stopRecording();
                    return Gdk.EVENT_STOP;
                }

                // 2. Backspace: Clear shortcut (empty is valid, means Disabled)
                if (keyval === Gdk.KEY_BackSpace) {
                    this._settings.set_strv(keyName, []);
                    stopRecording();
                    this._refreshAllRows();
                    return Gdk.EVENT_STOP;
                }

                // 3. Modifier-only keys: Wait for a non-modifier key
                const mask = state & Gtk.accelerator_get_default_mod_mask();
                if (!Gtk.accelerator_valid(keyval, mask))
                    return Gdk.EVENT_STOP;

                // 4. Form valid accelerator name
                const accel = Gtk.accelerator_name(keyval, mask);
                if (!accel)
                    return Gdk.EVENT_STOP;

                // 5. Validation: check duplicates among Liswitch actions
                const duplicateActionTitle = this._findDuplicateAction(keyName, accel);
                if (duplicateActionTitle) {
                    stopRecording();
                    row.subtitle = `⚠️ ${_('Shortcut "%s" is already assigned to "%s".').format(accel, duplicateActionTitle)}`;
                    return Gdk.EVENT_STOP;
                }

                // 6. Save valid combination
                this._settings.set_strv(keyName, [accel]);
                stopRecording();
                this._refreshAllRows();
                return Gdk.EVENT_STOP;
            });

            const root = recordBtn.get_root();
            const target = root ?? recordBtn;
            target.add_controller(controller);
        };

        recordBtn.connect('clicked', () => {
            if (isRecording)
                stopRecording();
            else
                startRecording();
        });

        const updateUi = () => {
            if (isRecording)
                return;

            const currentArr = this._settings.get_strv(keyName);
            const currentStr = currentArr[0]?.trim() ?? '';

            recordBtn.label = formatShortcutLabel(currentStr);

            const allConflicts = checkConflicts(this._settings);
            const keyConflicts = allConflicts.filter(c => c.hotkeyKey === keyName);

            let backupMap = {};
            try {
                const bStr = this._settings.get_string('backup-system-shortcuts');
                if (bStr)
                    backupMap = JSON.parse(bStr);
            } catch {
                backupMap = {};
            }

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

                conflictBtn.disconnectByFunc?.();
                conflictBtn.connect('clicked', () => {
                    freeSystemShortcut(conf, this._settings);
                    this._refreshAllRows();
                });
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

                    conflictBtn.disconnectByFunc?.();
                    conflictBtn.connect('clicked', () => {
                        restoreSystemShortcut(freedEntry.schemaId, freedEntry.schemaKey, this._settings);
                        this._refreshAllRows();
                    });
                } else {
                    row.subtitle = defaultDescription;
                    conflictBtn.visible = false;
                }
            }
        };

        this._settings.connect(`changed::${keyName}`, updateUi);
        this._rowRefreshCallbacks.push(updateUi);

        updateUi();
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
            this._desktopSettings.connect('changed::per-window', updateWarningState);
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

        this._settings.connect('changed::memory-mode', () => {
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

        this._settings.connect('changed::default-layout-mode', () => {
            const val = this._settings.get_string('default-layout-mode');
            const i = defaultLayoutValues.indexOf(val);
            if (i >= 0 && defaultRow.selected !== i)
                defaultRow.selected = i;
        });

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
                const row = new Adw.ActionRow({
                    title: app,
                });

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

        addEntryRow.connect('apply', () => {
            const val = addEntryRow.text.trim();
            if (!val)
                return;

            const list = this._settings.get_strv('memory-excluded-apps');
            if (!list.includes(val)) {
                list.push(val);
                this._settings.set_strv('memory-excluded-apps', list);
            }
            addEntryRow.text = '';
            refreshExcludedList();
        });

        this._settings.connect('changed::memory-excluded-apps', refreshExcludedList);
        refreshExcludedList();
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

    constructor(_settings) {
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
            label: _('Advanced keyboard layout switcher for GNOME Shell 51'),
            halign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        });
        bannerBox.append(subtitleLabel);

        const versionLabel = new Gtk.Label({
            label: _('Version %s').format('51.0'),
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
            subtitle: 'GNOME Shell 51 (Wayland)',
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
}

/**
 * Page 4: Text Correction Preferences («Исправление текста»)
 *
 * Configures wrong-layout text correction (F6), double Left Shift trigger,
 * and security disclosures.
 */
class LiswitchCorrectionPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor(settings) {
        super({
            title: _('Correction'),
            icon_name: 'edit-find-replace-symbolic',
        });

        this._settings = settings;

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

        // Manual Shortcut Group
        const shortcutGroup = new Adw.PreferencesGroup({
            title: _('Manual Hotkey'),
            description: _('Keyboard shortcut to manually trigger text conversion'),
        });
        this.add(shortcutGroup);

        this._createShortcutRow(shortcutGroup);
    }

    _createShortcutRow(group) {
        const row = new Adw.ActionRow({
            title: _('Convert Last Word'),
            subtitle: _('Shortcut to trigger conversion of the most recently typed word'),
        });
        group.add(row);

        const resetBtn = new Gtk.Button({
            icon_name: 'edit-undo-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: _('Reset to default shortcut (<Shift>Pause)'),
        });
        resetBtn.connect('clicked', () => {
            this._settings.set_strv('convert-hotkey', ['<Shift>Pause']);
            updateBtn();
        });
        row.add_suffix(resetBtn);

        const recordBtn = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        row.add_suffix(recordBtn);

        const updateBtn = () => {
            const arr = this._settings.get_strv('convert-hotkey');
            const val = arr[0] || '';
            recordBtn.label = formatShortcutLabel(val);
        };
        updateBtn();

        let isRecording = false;
        let controller = null;

        const stopRecording = () => {
            if (!isRecording)
                return;
            isRecording = false;
            if (controller) {
                const root = recordBtn.get_root();
                const target = root ?? recordBtn;
                try {
                    target.remove_controller(controller);
                } catch {
                    // Ignore
                }
                controller = null;
            }
            recordBtn.css_classes = ['flat'];
            updateBtn();
        };

        recordBtn.connect('clicked', () => {
            if (isRecording) {
                stopRecording();
                return;
            }

            isRecording = true;
            recordBtn.label = _('Press keys… (Esc: cancel, Backspace: disable)');
            recordBtn.css_classes = ['suggested-action'];

            controller = new Gtk.EventControllerKey({
                propagation_phase: Gtk.PropagationPhase.CAPTURE,
            });

            controller.connect('key-pressed', (_ctrl, keyval, _keycode, state) => {
                const cleanState = state & Gtk.accelerator_get_default_mod_mask();
                if (keyval === Gdk.KEY_Escape) {
                    stopRecording();
                    return Gdk.EVENT_STOP;
                }
                if (keyval === Gdk.KEY_BackSpace && cleanState === 0) {
                    this._settings.set_strv('convert-hotkey', []);
                    stopRecording();
                    return Gdk.EVENT_STOP;
                }
                const accelName = Gtk.accelerator_name(keyval, cleanState);
                if (accelName && !isModifierOnlyShortcut(accelName)) {
                    this._settings.set_strv('convert-hotkey', [accelName]);
                    stopRecording();
                    return Gdk.EVENT_STOP;
                }
                return Gdk.EVENT_PROPAGATE;
            });

            const root = recordBtn.get_root();
            const target = root ?? recordBtn;
            target.add_controller(controller);
        });

        this._settings.connect('changed::convert-hotkey', () => updateBtn());
    }
}

export default class LiswitchPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.add(new LiswitchGeneralPage(settings));
        window.add(new LiswitchShortcutsPage(settings));
        window.add(new LiswitchMemoryPage(settings));
        window.add(new LiswitchCorrectionPage(settings));
        window.add(new LiswitchAboutPage(settings));
    }
}
