// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Preferences for GNOME Shell 51

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {
    checkConflicts,
    freeSystemShortcut,
    restoreSystemShortcut,
    isModifierOnlyShortcut,
    normalizeShortcut,
} from './src/hotkeys.js';

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

    _createShortcutRow(group, keyName, title, description, defaultShortcuts) {
        const expander = new Adw.ExpanderRow({
            title,
            subtitle: '',
        });
        group.add(expander);

        // Text entry to view/edit shortcut
        const entryRow = new Adw.EntryRow({
            title: _('Key combination (e.g. <Control><Alt>space)'),
            show_apply_button: true,
        });
        expander.add_row(entryRow);

        // Status row for conflicts or warnings
        const statusRow = new Adw.ActionRow({
            title: '',
            subtitle: '',
            visible: false,
        });
        expander.add_row(statusRow);

        // Action button for conflict resolution (Free / Restore)
        const actionButton = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            visible: false,
        });
        statusRow.add_suffix(actionButton);

        // Reset to default button
        const resetRow = new Adw.ActionRow({
            title: _('Reset to Default'),
            subtitle: defaultShortcuts.length > 0
                ? defaultShortcuts.join(', ')
                : _('Disabled'),
        });
        const resetBtn = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
        });
        resetBtn.connect('clicked', () => {
            this._settings.set_strv(keyName, defaultShortcuts);
            updateUi();
        });
        resetRow.add_suffix(resetBtn);
        expander.add_row(resetRow);

        const updateUi = () => {
            const currentArr = this._settings.get_strv(keyName);
            const currentStr = currentArr.join(', ');
            entryRow.text = currentStr;

            const allConflicts = checkConflicts(this._settings);
            const keyConflicts = allConflicts.filter(c => c.hotkeyKey === keyName);

            // Read backup map to check if any conflicting system shortcut was freed
            let backupMap = {};
            try {
                const bStr = this._settings.get_string('backup-system-shortcuts');
                if (bStr)
                    backupMap = JSON.parse(bStr);
            } catch {
                backupMap = {};
            }

            if (currentArr.length === 0 || !currentArr[0]?.trim()) {
                expander.subtitle = _('Disabled');
                statusRow.visible = false;
                actionButton.visible = false;
                return;
            }

            const shortcut = currentArr[0].trim();

            if (isModifierOnlyShortcut(shortcut)) {
                expander.subtitle = `${shortcut} ⚠️`;
                statusRow.visible = true;
                statusRow.title = _('Modifiers-Only Shortcut Warning');
                statusRow.subtitle = _('GNOME Shell cannot bind pure modifier combinations like Alt+Shift.');
                actionButton.visible = false;
                return;
            }

            if (keyConflicts.length > 0) {
                const conf = keyConflicts[0];
                expander.subtitle = `${shortcut} ⚠️ (${_('System Conflict')})`;
                statusRow.visible = true;
                statusRow.title = _('Conflict Detected');
                statusRow.subtitle = _('Shortcut "%s" is assigned to %s (%s).').format(
                    conf.shortcut,
                    conf.schemaKey,
                    conf.schemaId
                );

                actionButton.visible = true;
                actionButton.label = _('Free in System');
                actionButton.css_classes = ['suggested-action'];

                // Disconnect previous clicks
                actionButton.disconnectByFunc?.();
                actionButton.connect('clicked', () => {
                    freeSystemShortcut(conf, this._settings);
                    this._refreshAllRows();
                });
            } else {
                // Check if this shortcut was previously freed and is stored in backups
                let freedEntry = null;
                const normShort = normalizeShortcut(shortcut);

                for (const [, entry] of Object.entries(backupMap)) {
                    const entryVals = Array.isArray(entry.value) ? entry.value : [entry.value];
                    if (entryVals.some(v => normalizeShortcut(v) === normShort)) {
                        freedEntry = entry;
                        break;
                    }
                }

                if (freedEntry) {
                    expander.subtitle = `${shortcut} (${_('Freed in System')})`;
                    statusRow.visible = true;
                    statusRow.title = _('System Shortcut Freed');
                    statusRow.subtitle = _('Overriding %s (%s).').format(
                        freedEntry.schemaKey,
                        freedEntry.schemaId
                    );

                    actionButton.visible = true;
                    actionButton.label = _('Restore in System');
                    actionButton.css_classes = [];

                    actionButton.disconnectByFunc?.();
                    actionButton.connect('clicked', () => {
                        restoreSystemShortcut(freedEntry.schemaId, freedEntry.schemaKey, this._settings);
                        this._refreshAllRows();
                    });
                } else {
                    expander.subtitle = shortcut;
                    statusRow.visible = false;
                    actionButton.visible = false;
                }
            }
        };

        entryRow.connect('apply', () => {
            const val = entryRow.text.trim();
            this._settings.set_strv(keyName, val ? [val] : []);
            updateUi();
        });

        this._settings.connect(`changed::${keyName}`, updateUi);
        this._rowRefreshCallbacks.push(updateUi);

        updateUi();
    }
}

export default class LiswitchPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.add(new LiswitchGeneralPage(settings));
        window.add(new LiswitchMemoryPage(settings));
        window.add(new LiswitchShortcutsPage(settings));
    }
}
