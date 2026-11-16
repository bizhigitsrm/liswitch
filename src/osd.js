// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Visual on-screen display (OSD) overlay for GNOME Shell 47–51+

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Compat from './compat.js';
import * as Log from './log.js';

let Main = null;
let Layout = null;

try {
    Main = await import('resource:///org/gnome/shell/ui/main.js');
    Layout = await import('resource:///org/gnome/shell/ui/layout.js');
} catch {
    Main = null;
    Layout = null;
}

// Check whether we are executing inside the GNOME Shell compositor environment
const isInsideShell = typeof global !== 'undefined' && Boolean(global.stage);

class MockWidget {
    constructor(params = {}) {
        this.visible = false;
        this.opacity = 255;
        this.style_class = params.style_class ?? '';
        this.text = '';
    }

    show() {
        this.visible = true;
    }

    hide() {
        this.visible = false;
    }

    destroy() {
        this.visible = false;
    }

    add_child() {}

    add_constraint() {}

    remove_all_transitions() {}

    ease(params = {}) {
        if (params.opacity !== undefined)
            this.opacity = params.opacity;
        if (params.opacity === 0 && params.onComplete)
            params.onComplete();
    }
}

/**
 * Visual on-screen display (OSD) service for layout switching notifications.
 *
 * Architecture note regarding Main.osdWindowManager vs custom St.Widget:
 * GNOME Shell's standard Main.osdWindowManager (ui/osdWindow.js) has:
 * 1. A hardcoded hide timeout (const HIDE_TIMEOUT = 1500ms) without API to set custom duration.
 * 2. Hardcoded bottom alignment (Clutter.ActorAlign.END) rather than center placement.
 * 3. Hardcoded ease transitions without explicit St.ReducedMotion bypass.
 * 4. Internal timers not exposed for cancellation on extension disable().
 *
 * Therefore, Liswitch uses a dedicated St.Widget placed on Main.layoutManager.uiGroup (Main.uiGroup),
 * respecting user-configured duration (osd-duration-ms), centered placement,
 * St.ReducedMotion compliance, and strict GLib.Source cancellation in destroy().
 */
export const OsdService = GObject.registerClass({
    GTypeName: 'LiswitchOsdService',
}, class OsdService extends GObject.Object {
    constructor(settings = null, inputSourceService = null, windowMemory = null) {
        super();

        this._settings = settings;
        this._inputSourceService = inputSourceService;
        this._windowMemory = windowMemory;

        this._container = null;
        this._box = null;
        this._icon = null;
        this._vbox = null;
        this._label = null;
        this._sublabel = null;
        this._monitorConstraint = null;

        this._hideTimeoutId = 0;
        this._currentChangedId = 0;
        this._enabled = false;
        this._lastShownSource = null;
    }

    /**
     * Enable the OSD service and connect to layout change events.
     */
    enable() {
        if (this._enabled)
            return;
        this._enabled = true;

        if (this._inputSourceService) {
            this._currentChangedId = this._inputSourceService.connect(
                'current-changed',
                (_service, index) => {
                    this._onCurrentChanged(index);
                }
            );
        }

        Log.debug(`OsdService: enabled (show-osd: ${this.isEnabled}, duration: ${this.duration}ms)`);
    }

    /**
     * Whether the OSD popup is enabled in settings.
     *
     * @returns {boolean}
     */
    get isEnabled() {
        if (!this._settings)
            return true;
        try {
            if (this._settings.settings_schema?.has_key('show-osd'))
                return this._settings.get_boolean('show-osd');
            if (this._settings.settings_schema?.has_key('osd-enabled'))
                return this._settings.get_boolean('osd-enabled');
        } catch {
            return true;
        }
        return true;
    }

    /**
     * Configured duration in milliseconds for OSD display.
     *
     * @returns {number}
     */
    get duration() {
        if (!this._settings)
            return 1000;
        try {
            if (this._settings.settings_schema?.has_key('osd-duration-ms'))
                return this._settings.get_uint('osd-duration-ms') || 1000;
        } catch {
            return 1000;
        }
        return 1000;
    }

    /**
     * Whether to show OSD when layout is restored automatically by window memory.
     *
     * @returns {boolean}
     */
    get showOnAutoSwitch() {
        if (!this._settings)
            return false;
        try {
            if (this._settings.settings_schema?.has_key('osd-show-on-auto-switch'))
                return this._settings.get_boolean('osd-show-on-auto-switch');
        } catch {
            return false;
        }
        return false;
    }

    /**
     * Public accessor to the container widget (for testing / inspection).
     *
     * @returns {St.Widget|null}
     */
    get container() {
        return this._container;
    }

    /**
     * Last shown input source.
     *
     * @returns {object|null}
     */
    get lastShownSource() {
        return this._lastShownSource;
    }

    /**
     * Whether OSD is currently showing on screen.
     *
     * @returns {boolean}
     */
    get isShowing() {
        return Boolean(this._container?.visible && this._hideTimeoutId !== 0);
    }

    /**
     * Handle current-changed signal from InputSourceService.
     *
     * @param {number} index - Index of newly active layout
     */
    _onCurrentChanged(index) {
        if (!this._enabled)
            return;

        // Skip OSD when layout change was triggered by WindowMemory silent restoration,
        // unless the user explicitly enabled osd-show-on-auto-switch.
        if (this._windowMemory?.isRestoring) {
            if (!this.showOnAutoSwitch) {
                Log.debug('OsdService: ignoring current-changed event emitted during window memory restoration');
                return;
            }
        }

        if (!this.isEnabled)
            return;

        const source = this._inputSourceService?.getSourceByIndex?.(index) ||
            this._inputSourceService?.getCurrentSource?.() ||
            this._inputSourceService?.getSources?.()?.find?.(s => s.index === index);

        if (source)
            this.show(source);
    }

    /**
     * Ensure the OSD widget hierarchy is created and mounted to Main.uiGroup.
     */
    _ensureContainer() {
        if (this._container)
            return;

        if (!isInsideShell) {
            this._container = new MockWidget({style_class: 'liswitch-osd-container'});
            this._box = new MockWidget({style_class: 'osd-window liswitch-osd'});
            this._icon = new MockWidget({style_class: 'liswitch-osd-icon'});
            this._vbox = new MockWidget();
            this._label = new MockWidget({style_class: 'liswitch-osd-label'});
            this._sublabel = new MockWidget({style_class: 'liswitch-osd-sublabel'});
            return;
        }

        const uiGroup = Compat.getUiGroup({mainModule: Main});

        // Outer full-screen anchor container
        this._container = new St.Widget({
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: false,
            can_focus: false,
            visible: false,
            style_class: 'liswitch-osd-container',
        });

        const primary = Main?.layoutManager?.primaryIndex ?? 0;
        this._monitorConstraint = Compat.createMonitorConstraint(Layout, primary);
        if (this._monitorConstraint)
            this._container.add_constraint(this._monitorConstraint);

        // Inner styled OSD window
        this._box = Compat.createBoxLayout({
            style_class: 'osd-window liswitch-osd',
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._container.add_child(this._box);

        this._icon = new St.Icon({
            icon_name: 'input-keyboard-symbolic',
            style_class: 'liswitch-osd-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.add_child(this._icon);

        this._vbox = Compat.createBoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.add_child(this._vbox);

        this._label = new St.Label({
            style_class: 'liswitch-osd-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._vbox.add_child(this._label);

        this._sublabel = new St.Label({
            style_class: 'liswitch-osd-sublabel',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._vbox.add_child(this._sublabel);

        if (uiGroup?.add_child)
            uiGroup.add_child(this._container);
    }

    /**
     * Check if motion reduction is requested by system accessibility settings.
     *
     * @returns {boolean}
     */
    _isReducedMotion() {
        return Compat.isReducedMotion(St);
    }

    /**
     * Show the OSD notification with layout information.
     *
     * @param {{id: string, shortName: string, displayName: string, index?: number}} source
     */
    show(source) {
        if (!source || !this.isEnabled)
            return;

        this._lastShownSource = source;
        this._ensureContainer();

        const title = (source.shortName || source.id || '').toUpperCase();
        const subtitle = source.displayName || '';

        if (this._label)
            this._label.text = title;

        if (this._sublabel) {
            this._sublabel.text = subtitle;
            this._sublabel.visible = Boolean(subtitle && subtitle.toLowerCase() !== title.toLowerCase());
        }

        // Target monitor where the focused window currently resides
        if (this._monitorConstraint && Main?.layoutManager) {
            let targetMonitor = Main.layoutManager.primaryIndex ?? 0;
            const focusWindow = global.display?.focus_window;
            if (focusWindow) {
                try {
                    const winMon = focusWindow.get_monitor();
                    if (winMon >= 0 && winMon < (Main.layoutManager.monitors?.length ?? 1))
                        targetMonitor = winMon;
                } catch {
                    // Fallback to primary monitor
                }
            }
            this._monitorConstraint.index = targetMonitor;
        }

        // Cancel any pending hide timeout from previous switch
        if (this._hideTimeoutId) {
            GLib.Source.remove(this._hideTimeoutId);
            this._hideTimeoutId = 0;
        }

        const isReduced = this._isReducedMotion();
        const uiGroup = Compat.getUiGroup({mainModule: Main});

        if (this._container) {
            if (uiGroup?.set_child_above_sibling)
                uiGroup.set_child_above_sibling(this._container, null);

            this._container.show();

            if (isReduced) {
                this._container.remove_all_transitions?.();
                this._container.opacity = 255;
            } else {
                this._container.remove_all_transitions?.();
                this._container.ease?.({
                    opacity: 255,
                    duration: 100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            }
        }

        // Schedule automatic fade-out
        const timeoutMs = this.duration;
        this._hideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeoutMs, () => {
            this._hideTimeoutId = 0;
            this._hide(isReduced);
            return GLib.SOURCE_REMOVE;
        });

        Log.debug(`OsdService: showing OSD "${title}" ("${subtitle}") on monitor, duration ${timeoutMs}ms (reduced motion: ${isReduced})`);
    }

    /**
     * Hide the OSD notification.
     *
     * @param {boolean} [isReducedMotion]
     */
    _hide(isReducedMotion) {
        if (this._hideTimeoutId) {
            GLib.Source.remove(this._hideTimeoutId);
            this._hideTimeoutId = 0;
        }

        if (!this._container)
            return;

        const isReduced = isReducedMotion ?? this._isReducedMotion();

        if (isReduced) {
            this._container.remove_all_transitions?.();
            this._container.opacity = 0;
            this._container.hide();
        } else {
            this._container.remove_all_transitions?.();
            this._container.ease?.({
                opacity: 0,
                duration: 200,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._container?.hide();
                },
            });
        }
    }

    /**
     * Immediate programmatic hide without animation.
     */
    hide() {
        this._hide(true);
    }

    /**
     * Synchronously dismantle OSD, cancel all active timers and destroy widgets.
     */
    destroy() {
        Log.debug('OsdService: destroying and disconnecting signals');

        if (this._currentChangedId && this._inputSourceService) {
            try {
                this._inputSourceService.disconnect(this._currentChangedId);
            } catch (e) {
                Log.warn(`OsdService: error disconnecting current-changed signal: ${e.message}`);
            }
            this._currentChangedId = 0;
        }

        if (this._hideTimeoutId) {
            GLib.Source.remove(this._hideTimeoutId);
            this._hideTimeoutId = 0;
        }

        if (this._container) {
            try {
                this._container.destroy();
            } catch (e) {
                Log.warn(`OsdService: error destroying container: ${e.message}`);
            }
            this._container = null;
        }

        this._box = null;
        this._icon = null;
        this._vbox = null;
        this._label = null;
        this._sublabel = null;
        this._monitorConstraint = null;

        this._settings = null;
        this._inputSourceService = null;
        this._windowMemory = null;
        this._enabled = false;
    }
});

export {OsdService as default, OsdService as Osd};
