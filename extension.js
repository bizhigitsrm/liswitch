// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Keyboard layout switcher for GNOME Shell 51

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {InputSourceService} from './src/inputSourceService.js';
import {Indicator} from './src/indicator.js';
import {HotkeyManager} from './src/hotkeys.js';
import {WindowMemory} from './src/windowMemory.js';
import {OsdService} from './src/osd.js';
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

        this._windowMemory = new WindowMemory(this._settings, this._inputSourceService);
        this._windowMemory.enable();

        this._hotkeyManager = new HotkeyManager(this._settings, this._inputSourceService);
        this._hotkeyManager.enable();

        this._osd = new OsdService(this._settings, this._inputSourceService, this._windowMemory);
        this._osd.enable();

        this._indicator = null;
        this._syncIndicator();

        this._indicatorSettingId = this._settings.connect('changed::indicator-enabled', () => {
            this._syncIndicator();
        });
    }

    _syncIndicator() {
        const isEnabled = this._settings?.get_boolean('indicator-enabled') ?? true;

        if (isEnabled && !this._indicator) {
            this._indicator = new Indicator(
                this._settings,
                this._inputSourceService,
                () => this.openPreferences()
            );

            // Position right next to system keyboard indicator if present
            let position = 0;
            if (Main?.panel?.statusArea?.keyboard?.container) {
                const children = Main.panel._rightBox?.get_children?.() ?? [];
                const idx = children.indexOf(Main.panel.statusArea['keyboard'].container);
                if (idx >= 0)
                    position = idx;
            }

            if (Main?.panel?.addToStatusArea) {
                Main.panel.addToStatusArea(this.uuid, this._indicator, position, 'right');
                Log.debug(`Indicator added to status area (role: ${this.uuid}, position: ${position})`);
            }
        } else if (!isEnabled && this._indicator) {
            Log.debug('Indicator disabled in settings: destroying indicator button');
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    disable() {
        Log.info('Disabling extension');

        if (this._indicatorSettingId) {
            this._settings?.disconnect(this._indicatorSettingId);
            this._indicatorSettingId = 0;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        if (this._osd) {
            this._osd.destroy();
            this._osd = null;
        }

        if (this._hotkeyManager) {
            this._hotkeyManager.destroy();
            this._hotkeyManager = null;
        }

        if (this._windowMemory) {
            this._windowMemory.destroy();
            this._windowMemory = null;
        }

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

    /**
     * Public accessor for the layout memory service (accessible from Looking Glass or test harness)
     *
     * @returns {WindowMemory|null}
     */
    get windowMemory() {
        return this._windowMemory;
    }

    /**
     * Public alias accessor for the layout memory service
     *
     * @returns {WindowMemory|null}
     */
    get windowMemoryService() {
        return this._windowMemory;
    }

    /**
     * Public accessor for the panel indicator (accessible from Looking Glass or test harness)
     *
     * @returns {Indicator|null}
     */
    get indicator() {
        return this._indicator;
    }

    /**
     * Public accessor for the hotkey manager (accessible from Looking Glass or test harness)
     *
     * @returns {HotkeyManager|null}
     */
    get hotkeyManager() {
        return this._hotkeyManager;
    }

    /**
     * Public accessor for the visual OSD service (accessible from Looking Glass or test harness)
     *
     * @returns {OsdService|null}
     */
    get osd() {
        return this._osd;
    }

    /**
     * Public alias accessor for the visual OSD service
     *
     * @returns {OsdService|null}
     */
    get osdService() {
        return this._osd;
    }
}
