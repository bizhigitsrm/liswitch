// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Preferences for GNOME Shell 51

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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

export default class LiswitchPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.add(new LiswitchGeneralPage(settings));
    }
}
