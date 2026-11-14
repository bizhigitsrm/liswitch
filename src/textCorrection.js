// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Text correction manager for wrong layout typing (F6)

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import * as Log from './log.js';
import {TextTranslator} from './textTranslator.js';

let Main = null;
try {
    Main = await import('resource:///org/gnome/shell/ui/main.js');
} catch {
    Main = null;
}

let Clutter = null;
let St = null;
let Meta = null;
let Shell = null;
try {
    Clutter = (await import('gi://Clutter')).default;
    St = (await import('gi://St')).default;
} catch {
    Clutter = null;
    St = null;
}

try {
    Meta = (await import('gi://Meta')).default;
} catch {
    Meta = null;
}

try {
    Shell = (await import('gi://Shell')).default;
} catch {
    Shell = null;
}

// Standard Linux evdev keycodes
const EVDEV_BACKSPACE = 14;
const EVDEV_LEFTCTRL = 29;
const EVDEV_V = 47;

// Sensitive app and window tokens for password / credential protection
const SENSITIVE_PATTERNS = [
    'password', 'пароль', 'keyring', 'polkit', 'keepass',
    '1password', 'bitwarden', 'auth', 'pin', 'unlock', 'gdm', 'credential',
];

export const TextCorrectionManager = GObject.registerClass({
    GTypeName: 'LiswitchTextCorrectionManager',
}, class TextCorrectionManager extends GObject.Object {
    constructor(settings = null, inputSourceService = null) {
        super();

        this._settings = settings;
        this._inputSourceService = inputSourceService;
        this._translator = new TextTranslator();

        // In-memory buffer strictly limited to 64 characters
        this._buffer = [];
        this._virtualDevice = null;

        // Shift double-click detection
        this._lastShiftPressTime = 0;
        this._shiftPressCount = 0;

        // Signal and timer handles
        this._stageSignalId = 0;
        this._focusSignalId = 0;
        this._inactivityTimerId = 0;
        this._pasteTimeoutId = 0;
        this._hotkeySettingId = 0;
        this._enabledSettingId = 0;
        this._hotkeyRegistered = false;
        this._enabled = false;
    }

    enable() {
        if (this._enabled)
            return;
        this._enabled = true;

        if (this._settings) {
            this._enabledSettingId = this._settings.connect('changed::convert-text-enabled', () => {
                this._syncState();
            });
            this._hotkeySettingId = this._settings.connect('changed::convert-hotkey', () => {
                this._rebindHotkey();
            });
        }

        this._syncState();
        Log.debug('TextCorrectionManager: enabled');
    }

    _syncState() {
        const isEnabled = this._settings?.get_boolean('convert-text-enabled') ?? false;

        if (isEnabled) {
            this._startTracking();
            this._rebindHotkey();
        } else {
            this._stopTracking();
            this._unbindHotkey();
            this.clearBuffer();
        }
    }

    _startTracking() {
        if (this._stageSignalId)
            return;

        // Virtual keyboard device for Backspace and Ctrl+V injection
        try {
            const seat = Clutter.get_default_backend?.()?.get_default_seat?.();
            if (seat?.create_virtual_device)
                this._virtualDevice = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        } catch (e) {
            Log.warn('TextCorrectionManager: failed to create virtual keyboard device:', e.message);
            this._virtualDevice = null;
        }

        // Global stage captured-event filter
        if (typeof global !== 'undefined' && global.stage?.connect) {
            this._stageSignalId = global.stage.connect('captured-event', (_stage, event) => {
                return this._onCapturedEvent(event);
            });
        }

        // Reset buffer when focus window changes
        if (typeof global !== 'undefined' && global.display?.connect) {
            this._focusSignalId = global.display.connect('notify::focus-window', () => {
                this.clearBuffer();
            });
        }

        Log.debug('TextCorrectionManager: input tracking started');
    }

    _stopTracking() {
        if (this._stageSignalId && typeof global !== 'undefined' && global.stage?.disconnect) {
            global.stage.disconnect(this._stageSignalId);
            this._stageSignalId = 0;
        }

        if (this._focusSignalId && typeof global !== 'undefined' && global.display?.disconnect) {
            global.display.disconnect(this._focusSignalId);
            this._focusSignalId = 0;
        }

        if (this._inactivityTimerId) {
            GLib.Source.remove(this._inactivityTimerId);
            this._inactivityTimerId = 0;
        }

        if (this._pasteTimeoutId) {
            GLib.Source.remove(this._pasteTimeoutId);
            this._pasteTimeoutId = 0;
        }

        this._virtualDevice = null;
        Log.debug('TextCorrectionManager: input tracking stopped');
    }

    _rebindHotkey() {
        this._unbindHotkey();

        const isEnabled = this._settings?.get_boolean('convert-text-enabled') ?? false;
        if (!isEnabled || !Main.wm?.addKeybinding || !this._settings)
            return;

        try {
            const flags = Meta?.KeyBindingFlags?.IGNORE_AUTOREPEAT ?? 16;
            const mode = Shell?.ActionMode?.NORMAL ?? 1;
            Main.wm.addKeybinding(
                'convert-hotkey',
                this._settings,
                flags,
                mode,
                () => {
                    this.convertLastWord();
                }
            );
            this._hotkeyRegistered = true;
            Log.debug('TextCorrectionManager: convert-hotkey registered');
        } catch (e) {
            Log.warn('TextCorrectionManager: failed to register convert-hotkey:', e.message);
        }
    }

    _unbindHotkey() {
        if (this._hotkeyRegistered && Main.wm?.removeKeybinding) {
            try {
                Main.wm.removeKeybinding('convert-hotkey');
            } catch {
                // Ignore removal errors
            }
            this._hotkeyRegistered = false;
        }
    }

    _onCapturedEvent(event) {
        const type = event.type();

        // Clear buffer on mouse clicks (cursor moved)
        if (type === Clutter.EventType.BUTTON_PRESS || type === Clutter.EventType.TOUCH_BEGIN) {
            this.clearBuffer();
            return Clutter.EVENT_PROPAGATE;
        }

        if (type === Clutter.EventType.KEY_PRESS) {
            this._resetInactivityTimer();

            const keysym = event.get_key_symbol();

            // Modifiers: Ctrl, Alt, Super/Meta clear the buffer
            if (keysym === Clutter.KEY_Control_L || keysym === Clutter.KEY_Control_R ||
                keysym === Clutter.KEY_Alt_L || keysym === Clutter.KEY_Alt_R ||
                keysym === Clutter.KEY_Super_L || keysym === Clutter.KEY_Super_R ||
                keysym === Clutter.KEY_Meta_L || keysym === Clutter.KEY_Meta_R) {
                this.clearBuffer();
                return Clutter.EVENT_PROPAGATE;
            }

            // Command/Navigation keys clear the buffer
            if (keysym === Clutter.KEY_Escape || keysym === Clutter.KEY_Return ||
                keysym === Clutter.KEY_KP_Enter || keysym === Clutter.KEY_Tab ||
                keysym === Clutter.KEY_ISO_Left_Tab) {
                this.clearBuffer();
                return Clutter.EVENT_PROPAGATE;
            }

            // Backspace removes last character from buffer
            if (keysym === Clutter.KEY_BackSpace) {
                if (this._buffer.length > 0)
                    this._buffer.pop();
                return Clutter.EVENT_PROPAGATE;
            }

            // Left Shift handling (double-click trigger)
            if (keysym === Clutter.KEY_Shift_L) {
                const doubleShiftEnabled = this._settings?.get_boolean('convert-double-shift') ?? true;
                if (doubleShiftEnabled) {
                    const now = GLib.get_monotonic_time();
                    const deltaUs = now - this._lastShiftPressTime;
                    // Double click window: 400ms (400,000 microseconds)
                    if (this._shiftPressCount === 1 && deltaUs < 400000 && deltaUs > 50000) {
                        this._shiftPressCount = 0;
                        this._lastShiftPressTime = 0;
                        Log.debug('TextCorrectionManager: double Left Shift triggered');
                        this.convertLastWord();
                        return Clutter.EVENT_PROPAGATE;
                    }

                    this._shiftPressCount = 1;
                    this._lastShiftPressTime = now;
                }
                return Clutter.EVENT_PROPAGATE;
            }

            // If any other key is pressed, reset Shift double-click tracker
            this._shiftPressCount = 0;

            // Password / sensitive window protection check
            if (this._isPasswordOrSensitiveWindow()) {
                this.clearBuffer();
                return Clutter.EVENT_PROPAGATE;
            }

            // Extract typed Unicode character
            const unicode = Clutter.keysym_to_unicode(keysym);
            if (unicode > 0) {
                const ch = String.fromCodePoint(unicode);
                if (ch === ' ' || ch === '\t' || ch === '\n') {
                    // Space or whitespace completes the previous word
                    this.clearBuffer();
                } else {
                    this.pushChar(ch);
                }
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    /**
     * Append a character into the in-memory keystroke buffer.
     * Capped strictly at 64 characters (oldest removed on overflow).
     *
     * @param {string} ch
     */
    pushChar(ch) {
        if (!ch)
            return;
        this._buffer.push(ch);
        if (this._buffer.length > 64)
            this._buffer.shift();
    }

    _resetInactivityTimer() {
        if (this._inactivityTimerId) {
            GLib.Source.remove(this._inactivityTimerId);
            this._inactivityTimerId = 0;
        }

        // 3 seconds inactivity clears in-memory buffer
        this._inactivityTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
            this.clearBuffer();
            this._inactivityTimerId = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _isPasswordOrSensitiveWindow() {
        const window = typeof global !== 'undefined' ? global.display?.focus_window : null;
        if (!window)
            return false;

        const wmClass = (window.get_wm_class?.() || '').toLowerCase();
        const title = (window.get_title?.() || '').toLowerCase();
        const sandboxed = (window.get_sandboxed_app_id?.() || '').toLowerCase();

        return SENSITIVE_PATTERNS.some(pat =>
            wmClass.includes(pat) || title.includes(pat) || sandboxed.includes(pat)
        );
    }

    /**
     * Clear the in-memory keystroke buffer.
     */
    clearBuffer() {
        this._buffer = [];
        this._shiftPressCount = 0;
        this._lastShiftPressTime = 0;
    }

    /**
     * Convert the most recently typed word in the buffer into the alternate layout.
     *
     * @returns {boolean} True if conversion succeeded, false otherwise
     */
    convertLastWord() {
        if (this._buffer.length === 0) {
            Log.debug('convertLastWord: buffer is empty');
            return false;
        }

        if (this._isPasswordOrSensitiveWindow()) {
            this.clearBuffer();
            Log.debug('convertLastWord: blocked in sensitive window');
            return false;
        }

        const word = this._buffer.join('');
        if (!word || word.trim().length === 0) {
            this.clearBuffer();
            return false;
        }

        if (!this._inputSourceService?.isAvailable) {
            Log.warn('convertLastWord: inputSourceService is unavailable');
            return false;
        }

        const sources = this._inputSourceService.getSources();
        if (sources.length < 2) {
            Log.debug('convertLastWord: fewer than 2 input sources configured');
            return false;
        }

        const currentIndex = this._inputSourceService.getCurrentIndex();
        const currentSource = this._inputSourceService.getCurrentSource();
        const fromLayout = currentSource?.id || sources[0].id;

        // Target layout: switch to the alternate layout
        let targetIndex = (currentIndex + 1) % sources.length;
        const targetSource = sources[targetIndex];
        const toLayout = targetSource?.id || sources[1].id;

        const converted = this._translator.convert(word, fromLayout, toLayout);
        if (!converted || converted === word) {
            Log.debug('convertLastWord: converted word identical to source');
            return false;
        }

        Log.debug(`convertLastWord: converting word length ${word.length} from ${fromLayout} to ${toLayout}`);

        // 1. Erase word with Backspace events via VirtualInputDevice
        if (this._virtualDevice?.notify_key) {
            const timeUs = GLib.get_monotonic_time();
            for (let i = 0; i < word.length; i++) {
                const t = timeUs + (i * 2000);
                this._virtualDevice.notify_key(t, EVDEV_BACKSPACE, Clutter.KeyState.PRESSED);
                this._virtualDevice.notify_key(t + 1000, EVDEV_BACKSPACE, Clutter.KeyState.RELEASED);
            }

            // 2. Insert converted text via Clipboard and Ctrl+V
            try {
                const clipboard = St.Clipboard.get_default();
                clipboard.set_text(St.ClipboardType.CLIPBOARD, converted);

                // Small delay to ensure clipboard sync before Ctrl+V
                if (this._pasteTimeoutId) {
                    GLib.Source.remove(this._pasteTimeoutId);
                    this._pasteTimeoutId = 0;
                }
                this._pasteTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20, () => {
                    this._pasteTimeoutId = 0;
                    if (this._virtualDevice?.notify_key) {
                        const pasteTime = GLib.get_monotonic_time();
                        this._virtualDevice.notify_key(pasteTime, EVDEV_LEFTCTRL, Clutter.KeyState.PRESSED);
                        this._virtualDevice.notify_key(pasteTime + 1000, EVDEV_V, Clutter.KeyState.PRESSED);
                        this._virtualDevice.notify_key(pasteTime + 2000, EVDEV_V, Clutter.KeyState.RELEASED);
                        this._virtualDevice.notify_key(pasteTime + 3000, EVDEV_LEFTCTRL, Clutter.KeyState.RELEASED);
                    }
                    return GLib.SOURCE_REMOVE;
                });
            } catch (e) {
                Log.warn('convertLastWord: clipboard injection error:', e.message);
            }
        }

        // 3. Switch active input source to the target layout
        this._inputSourceService.activate(targetIndex, true);

        // 4. Clear buffer
        this.clearBuffer();
        return true;
    }

    destroy() {
        if (!this._enabled)
            return;
        this._enabled = false;

        Log.debug('TextCorrectionManager: destroying and disconnecting signals');

        if (this._enabledSettingId && this._settings) {
            this._settings.disconnect(this._enabledSettingId);
            this._enabledSettingId = 0;
        }

        if (this._hotkeySettingId && this._settings) {
            this._settings.disconnect(this._hotkeySettingId);
            this._hotkeySettingId = 0;
        }

        this._stopTracking();
        this._unbindHotkey();
        this.clearBuffer();

        if (this._translator) {
            this._translator.clearCache();
            this._translator = null;
        }

        this._settings = null;
        this._inputSourceService = null;
    }
});
