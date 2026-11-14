// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Keyboard layout switcher for GNOME Shell 51

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {InputSourceService} from './src/inputSourceService.js';
import * as Log from './src/log.js';

export default class LiswitchExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        Log.initLogger(this._settings, `[${this.uuid}]`);

        Log.info(`Enabling extension (version ${this.metadata['version-name'] ?? 'dev'})`);

        this._inputSourceService = new InputSourceService(this._settings);
        this._inputSourceService.enable();

        if (this._inputSourceService.isAvailable) {
            const sources = this._inputSourceService.getSources();
            const current = this._inputSourceService.getCurrentIndex();
            Log.debug(`InputSourceService ready: ${sources.length} sources, current index ${current}`);
        } else {
            Log.warn('InputSourceService is unavailable (no input sources configured or manager unavailable)');
        }
    }

    disable() {
        Log.info('Disabling extension');

        if (this._inputSourceService) {
            this._inputSourceService.destroy();
            this._inputSourceService = null;
        }

        Log.resetLogger();
        this._settings = null;
    }

    /**
     * Public accessor for the input source service (accessible from Looking Glass or test harness)
     *
     * @returns {InputSourceService|null}
     */
    get inputSourceService() {
        return this._inputSourceService;
    }
}
