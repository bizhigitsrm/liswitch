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
        window.add(new LiswitchShortcutsPage(settings));
    }
}
