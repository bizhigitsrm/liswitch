// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Text correction manager for wrong layout typing (F6)

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import * as Compat from './compat.js';
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
    'login', 'sign in', 'sign-in', 'signin', 'vault', 'ssh', 'sudo', 'gpg',
];

// Cursor navigation / editing keys without a Unicode value. Pressing any of
// them moves the caret away from the end of the tracked word, so the buffer
// must be dropped. Built lazily because Clutter is absent in standalone tests.
const NAVIGATION_KEY_NAMES = [
    'KEY_Left', 'KEY_Right', 'KEY_Up', 'KEY_Down',
    'KEY_Home', 'KEY_End', 'KEY_Page_Up', 'KEY_Page_Down',
    'KEY_Delete', 'KEY_Insert',
    'KEY_KP_Left', 'KEY_KP_Right', 'KEY_KP_Up', 'KEY_KP_Down',
    'KEY_KP_Home', 'KEY_KP_End', 'KEY_KP_Page_Up', 'KEY_KP_Page_Down',
    'KEY_KP_Delete', 'KEY_KP_Insert',
];

let _navigationKeysyms = null;

function _getNavigationKeysyms() {
    if (_navigationKeysyms)
        return _navigationKeysyms;
    _navigationKeysyms = new Set();
    if (Clutter) {
        for (const name of NAVIGATION_KEY_NAMES) {
            const keysym = Clutter[name];
            if (typeof keysym === 'number')
                _navigationKeysyms.add(keysym);
        }
    }
    return _navigationKeysyms;
}

function _getBufferResetModifierMask() {
    const M = Clutter?.ModifierType;
    if (!M)
        return 0;
    return (M.CONTROL_MASK ?? 0) | (M.MOD1_MASK ?? 0) |
        (M.SUPER_MASK ?? 0) | (M.META_MASK ?? 0);
}

function _countChangedChars(sourceText, convertedText) {
    const srcChars = Array.from(sourceText);
    const dstChars = Array.from(convertedText);
    const len = Math.min(srcChars.length, dstChars.length);
    let changed = Math.abs(srcChars.length - dstChars.length);
    for (let i = 0; i < len; i++) {
        if (srcChars[i] !== dstChars[i])
            changed++;
    }
    return changed;
}

export const TextCorrectionManager = GObject.registerClass({
    GTypeName: 'LiswitchTextCorrectionManager',
}, class TextCorrectionManager extends GObject.Object {
    constructor(settings = null, inputSourceService = null, options = {}) {
        super();

        this._settings = settings;
        this._inputSourceService = inputSourceService;
        this._translator = options.translator ?? new TextTranslator();
        this._clipboardOverride = options.clipboard ?? null;
        this._virtualDeviceOverride = options.virtualDevice ?? null;
        this._displayOverride = options.display ?? null;

        // In-memory buffer strictly limited to 64 characters
        this._buffer = [];
        this._virtualDevice = this._virtualDeviceOverride;

        // Shift double-click detection
        this._lastShiftPressTime = 0;
        this._shiftPressCount = 0;

        // Signal and timer handles
        this._stageSignalId = 0;
        this._focusSignalId = 0;
        this._inactivityTimerId = 0;
        this._clipboardReadTimeoutId = 0;
        this._pasteTimeoutId = 0;
        this._restoreClipboardTimeoutId = 0;
        this._operationId = 0;
        this._hotkeySettingId = 0;
        this._enabledSettingId = 0;
        this._hotkeyRegistered = false;
        this._enabled = false;
        this._destroyed = false;
    }

    enable() {
        if (this._enabled)
            return;
        this._enabled = true;
        this._destroyed = false;

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
        if (this._virtualDeviceOverride) {
            this._virtualDevice = this._virtualDeviceOverride;
        } else {
            try {
                this._virtualDevice = Compat.createVirtualKeyboardDevice({
                    clutterModule: Clutter,
                });
            } catch (e) {
                Log.warn('TextCorrectionManager: failed to create virtual keyboard device:', e.message);
                this._virtualDevice = null;
            }
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

    _clearPasteTimers() {
        if (this._clipboardReadTimeoutId) {
            GLib.Source.remove(this._clipboardReadTimeoutId);
            this._clipboardReadTimeoutId = 0;
        }

        if (this._pasteTimeoutId) {
            GLib.Source.remove(this._pasteTimeoutId);
            this._pasteTimeoutId = 0;
        }

        if (this._restoreClipboardTimeoutId) {
            GLib.Source.remove(this._restoreClipboardTimeoutId);
            this._restoreClipboardTimeoutId = 0;
        }
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

        this._operationId++;
        this._clearPasteTimers();

        this._virtualDevice = null;
        Log.debug('TextCorrectionManager: input tracking stopped');
    }

    _rebindHotkey() {
        this._unbindHotkey();

        const isEnabled = this._settings?.get_boolean('convert-text-enabled') ?? false;
        if (!isEnabled || !Main?.wm?.addKeybinding || !this._settings)
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
        if (this._hotkeyRegistered && Main?.wm?.removeKeybinding) {
            try {
                Main.wm.removeKeybinding('convert-hotkey');
            } catch {
                // Ignore removal errors
            }
            this._hotkeyRegistered = false;
        }
    }

    _onCapturedEvent(event) {
        // Clutter is only absent in standalone environments where no stage exists
        if (!Clutter)
            return false;

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

            // Any key pressed while Ctrl/Alt/Super/Meta is held is a shortcut
            // (Ctrl+A, Ctrl+Backspace, Alt+Left, ...), not text input: the
            // editor state can no longer be mirrored, so drop the buffer.
            const modifierMask = _getBufferResetModifierMask();
            const state = typeof event.get_state === 'function' ? event.get_state() : 0;
            if (modifierMask && (state & modifierMask) !== 0) {
                this.clearBuffer();
                return Clutter.EVENT_PROPAGATE;
            }

            // Command keys clear the buffer
            if (keysym === Clutter.KEY_Escape || keysym === Clutter.KEY_Return ||
                keysym === Clutter.KEY_KP_Enter || keysym === Clutter.KEY_Tab ||
                keysym === Clutter.KEY_ISO_Left_Tab) {
                this.clearBuffer();
                return Clutter.EVENT_PROPAGATE;
            }

            // Cursor navigation / Delete keys move the caret: clear the buffer
            if (_getNavigationKeysyms().has(keysym)) {
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

    _getFocusWindow() {
        const display = this._displayOverride ??
            (typeof global !== 'undefined' ? global.display : null);
        return display?.focus_window ?? null;
    }

    _isPasswordOrSensitiveWindow() {
        const window = this._getFocusWindow();
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
     * Resolve the best (fromLayout -> toLayout) conversion pair for `word`.
     * When 3 or more layouts are configured, uses TextTranslator.guessSourceLayout()
     * and chooses a target layout that produces a non-zero conversion (maximizing
     * changed characters, breaking ties in circular order after fromPos).
     *
     * @private
     * @param {string} word
     * @param {Array<object>} sources
     * @param {number} currentPos
     * @param {object} activeSource
     * @returns {{fromLayout: string, targetSource: object, converted: string}|null}
     */
    _resolveConversionPair(word, sources, currentPos, activeSource) {
        let bestFromPos = currentPos >= 0 ? currentPos : 0;
        let fromSource = activeSource ?? sources[bestFromPos];

        if (sources.length >= 3) {
            for (let offset = 1; offset < sources.length; offset++) {
                const idx = (bestFromPos + offset) % sources.length;
                const cand = sources[idx];
                if (!cand?.id || cand.id === fromSource.id)
                    continue;
                if (this._translator.guessSourceLayout(word, fromSource.id, cand.id) === cand.id) {
                    fromSource = cand;
                    bestFromPos = idx;
                }
            }
        }

        const fromLayout = fromSource.id;
        let targetSource = null;
        let converted = null;
        let bestChangedCount = 0;

        for (let offset = 1; offset < sources.length; offset++) {
            const cand = sources[(bestFromPos + offset) % sources.length];
            if (!cand?.id || cand.id === fromLayout)
                continue;

            const candidateConverted = this._translator.convert(word, fromLayout, cand.id);
            if (!candidateConverted || candidateConverted === word)
                continue;

            const changedCount = _countChangedChars(word, candidateConverted);
            if (changedCount > bestChangedCount) {
                bestChangedCount = changedCount;
                targetSource = cand;
                converted = candidateConverted;
            }
        }

        if (!targetSource || !converted)
            return null;

        return {fromLayout, targetSource, converted};
    }

    /**
     * Emit Ctrl+<key> or Ctrl+Shift+<key> through the virtual keyboard device.
     *
     * @private
     */
    _emitShortcut(virtualDevice, keycode) {
        if (this._destroyed || !virtualDevice?.notify_key)
            return;

        const pressedState = Clutter?.KeyState?.PRESSED ?? 1;
        const releasedState = Clutter?.KeyState?.RELEASED ?? 0;
        let t = GLib.get_monotonic_time();
        const step = 1000;

        virtualDevice.notify_key(t, EVDEV_LEFTCTRL, pressedState);
        t += step;
        virtualDevice.notify_key(t, keycode, pressedState);
        t += step;
        virtualDevice.notify_key(t, keycode, releasedState);
        t += step;
        virtualDevice.notify_key(t, EVDEV_LEFTCTRL, releasedState);
    }

    /**
     * Read clipboard text asynchronously with a timeout guard and operation ID check.
     *
     * @private
     */
    _readClipboardText(clipboard, opId, callback) {
        const clipboardType = St?.ClipboardType?.CLIPBOARD ?? 1;
        if (typeof clipboard.get_text !== 'function') {
            callback(null);
            return;
        }

        let handled = false;
        const finish = text => {
            if (handled || this._destroyed || opId !== this._operationId)
                return;
            handled = true;
            if (this._clipboardReadTimeoutId) {
                GLib.Source.remove(this._clipboardReadTimeoutId);
                this._clipboardReadTimeoutId = 0;
            }
            callback(text);
        };

        try {
            clipboard.get_text(clipboardType, (_cb, text) => {
                finish(text);
            });
        } catch (e) {
            Log.warn('TextCorrectionManager: clipboard read error:', e.message);
            finish(null);
        }

        if (!handled && !this._destroyed && opId === this._operationId) {
            this._clipboardReadTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                this._clipboardReadTimeoutId = 0;
                finish(null);
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    /**
     * Schedule restoration of previous non-empty clipboard contents.
     *
     * @private
     */
    _scheduleClipboardRestore(clipboard, previousText, opId) {
        if (typeof previousText !== 'string' || previousText.length === 0)
            return;

        const clipboardType = St?.ClipboardType?.CLIPBOARD ?? 1;
        this._restoreClipboardTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._restoreClipboardTimeoutId = 0;
            if (!this._destroyed && opId === this._operationId) {
                try {
                    clipboard.set_text(clipboardType, previousText);
                } catch (e) {
                    Log.warn('TextCorrectionManager: clipboard restore error:', e.message);
                }
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Emit Backspaces (if charCount > 0), paste converted text via Clipboard + Ctrl+V
     * (or Ctrl+Shift+V in terminal windows), and restore previous clipboard text if any.
     *
     * @private
     */
    _injectReplacement(clipboard, virtualDevice, charCount, converted, previousText, opId = this._operationId) {
        if (this._destroyed || opId !== this._operationId || !virtualDevice?.notify_key)
            return;

        const pressedState = Clutter?.KeyState?.PRESSED ?? 1;
        const releasedState = Clutter?.KeyState?.RELEASED ?? 0;
        const clipboardType = St?.ClipboardType?.CLIPBOARD ?? 1;

        try {
            if (charCount > 0) {
                const timeUs = GLib.get_monotonic_time();
                for (let i = 0; i < charCount; i++) {
                    const t = timeUs + (i * 2000);
                    virtualDevice.notify_key(t, EVDEV_BACKSPACE, pressedState);
                    virtualDevice.notify_key(t + 1000, EVDEV_BACKSPACE, releasedState);
                }
            }

            clipboard.set_text(clipboardType, converted);

            // Small delay to ensure clipboard sync before Ctrl+V
            this._clearPasteTimers();
            this._pasteTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20, () => {
                this._pasteTimeoutId = 0;
                if (this._destroyed || opId !== this._operationId)
                    return GLib.SOURCE_REMOVE;

                const dev = this._virtualDevice ?? virtualDevice;
                if (dev?.notify_key)
                    this._emitShortcut(dev, EVDEV_V);

                this._scheduleClipboardRestore(clipboard, previousText, opId);
                return GLib.SOURCE_REMOVE;
            });
        } catch (e) {
            Log.warn('TextCorrectionManager: clipboard injection error:', e.message);
        }
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

        // source.index is not guaranteed to match the array position
        // (e.g. indices [0, 2]), so resolve the position explicitly.
        const currentPos = sources.findIndex(s => s.index === currentIndex);
        const fromPos = currentPos >= 0 ? currentPos : 0;
        const currentSource = this._inputSourceService.getCurrentSource() ?? sources[fromPos];

        const pair = this._resolveConversionPair(word, sources, fromPos, currentSource);
        if (!pair) {
            Log.debug('convertLastWord: converted word identical to source');
            return false;
        }

        const {fromLayout, targetSource, converted} = pair;
        const toLayout = targetSource.id;

        Log.debug(`convertLastWord: converting word length ${word.length} from ${fromLayout} to ${toLayout}`);

        // 1 & 2. Erase word and insert converted text via Clipboard + Ctrl+V, preserving prior clipboard text
        const virtualDevice = this._virtualDevice ?? this._virtualDeviceOverride;
        const clipboard = this._clipboardOverride ?? St?.Clipboard?.get_default?.() ?? null;

        if (virtualDevice?.notify_key && clipboard) {
            this._clearPasteTimers();
            const opId = ++this._operationId;
            this._readClipboardText(clipboard, opId, previousText => {
                this._injectReplacement(clipboard, virtualDevice, word.length, converted, previousText, opId);
            });
        }

        // 3. Switch active input source to the target layout
        this._inputSourceService.activate(targetSource.index, true);

        // 4. Clear buffer
        this.clearBuffer();
        return true;
    }

    destroy() {
        this._destroyed = true;
        this._operationId++;
        this._clearPasteTimers();

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

        this._clipboardOverride = null;
        this._virtualDeviceOverride = null;
        this._displayOverride = null;
        this._settings = null;
        this._inputSourceService = null;
    }
});
