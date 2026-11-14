// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Keyboard layout switcher for GNOME Shell 51

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class LiswitchExtension extends Extension {
    enable() {
        console.log(`[${this.uuid}] Enabling extension (version ${this.metadata['version-name'] ?? 'dev'})`);

        this._settings = this.getSettings();

        if (this._settings.get_boolean('debug'))
            console.log(`[${this.uuid}] Debug logging is enabled`);
    }

    disable() {
        console.log(`[${this.uuid}] Disabling extension`);

        this._settings = null;
    }
}
