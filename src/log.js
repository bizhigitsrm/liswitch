// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Unified logging helper for GNOME Shell 51

let _settings = null;
let _prefix = '[liswitch]';
let _debugOverride = null;

/**
 * Initialize the logger with extension settings and prefix.
 *
 * @param {Gio.Settings|null} settings - Gio.Settings instance with 'debug' key
 * @param {string} prefix - Log prefix, e.g. '[liswitch@local]'
 */
export function initLogger(settings = null, prefix = '[liswitch]') {
    _settings = settings;
    _prefix = prefix;
    _debugOverride = null;
}

/**
 * Reset logger state and nullify settings reference on extension disable.
 */
export function resetLogger() {
    _settings = null;
    _debugOverride = null;
}

/**
 * Override debug flag for testing environments.
 *
 * @param {boolean|null} enabled - true/false to override, or null to clear override
 */
export function setDebugOverride(enabled) {
    _debugOverride = enabled;
}

/**
 * Check if debug logging is currently enabled.
 *
 * @returns {boolean}
 */
export function isDebugEnabled() {
    if (_debugOverride !== null)
        return _debugOverride;

    try {
        return _settings?.get_boolean('debug') ?? false;
    } catch {
        return false;
    }
}

/**
 * Write a debug message to console.log only if debug logging is enabled.
 *
 * @param {...any} args
 */
export function debug(...args) {
    if (isDebugEnabled())
        console.log(`${_prefix} [DEBUG]`, ...args);
}

/**
 * Write an informational message to console.log.
 *
 * @param {...any} args
 */
export function info(...args) {
    console.log(`${_prefix} [INFO]`, ...args);
}

/**
 * Write a warning message to console.warn.
 *
 * @param {...any} args
 */
export function warn(...args) {
    console.warn(`${_prefix} [WARN]`, ...args);
}

/**
 * Write an error message to console.error.
 *
 * @param {...any} args
 */
export function error(...args) {
    console.error(`${_prefix} [ERROR]`, ...args);
}
