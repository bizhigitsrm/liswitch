// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Feature-detection compatibility layer for GNOME Shell 47–51+

let Clutter = null;
let St = null;

try {
    Clutter = (await import('gi://Clutter')).default;
} catch {
    Clutter = null;
}

try {
    St = (await import('gi://St')).default;
} catch {
    St = null;
}

/**
 * Detect whether system accessibility settings request reduced motion or
 * disabled animations (supports GNOME 51+ St.ReducedMotion and GNOME 47–50
 * St.Settings.enable_animations).
 *
 * @param {object|null} [stModule=St] - St GI module override for testing
 * @returns {boolean}
 */
export function isReducedMotion(stModule = St) {
    try {
        const stSettings = stModule?.Settings?.get?.();
        if (!stSettings)
            return false;

        const reduceValue = stModule?.ReducedMotion?.REDUCE;
        if (reduceValue !== undefined) {
            const reducedMotion = stSettings.reduced_motion ?? stSettings.reducedMotion;
            if (reducedMotion === reduceValue)
                return true;
        }

        const enableAnimations = stSettings.enable_animations ?? stSettings.enableAnimations;
        if (enableAnimations === false)
            return true;
    } catch {
        return false;
    }

    return false;
}

/**
 * Resolve St.BoxLayout orientation properties using feature detection:
 * - GNOME 48–51+: `orientation` (`Clutter.Orientation.VERTICAL | HORIZONTAL`)
 * - GNOME 47: legacy `vertical` boolean (`vertical` was deprecated in 48 and removed in 51)
 *
 * @param {boolean} [vertical=false] - Whether box layout is vertical
 * @param {object} [deps]
 * @param {object|null} [deps.stModule=St]
 * @param {object|null} [deps.clutterModule=Clutter]
 * @returns {{orientation: number}|{vertical: boolean}}
 */
export function getBoxLayoutOrientationProps(vertical = false, {stModule = St, clutterModule = Clutter} = {}) {
    const BoxLayout = stModule?.BoxLayout;
    const supportsOrientation =
        (typeof BoxLayout?.find_property === 'function' && Boolean(BoxLayout.find_property('orientation'))) ||
        Boolean(BoxLayout?.prototype && 'orientation' in BoxLayout.prototype);

    if (supportsOrientation && clutterModule?.Orientation) {
        return {
            orientation: vertical
                ? clutterModule.Orientation.VERTICAL
                : clutterModule.Orientation.HORIZONTAL,
        };
    }

    return {vertical: Boolean(vertical)};
}

/**
 * Construct an St.BoxLayout with cross-version orientation compatibility.
 *
 * @param {object} [params={}] - St.BoxLayout constructor params (may include `vertical`)
 * @param {object} [deps]
 * @param {object|null} [deps.stModule=St]
 * @param {object|null} [deps.clutterModule=Clutter]
 * @returns {St.BoxLayout}
 */
export function createBoxLayout(params = {}, {stModule = St, clutterModule = Clutter} = {}) {
    const {vertical = false, ...rest} = params;
    const orientationProps = getBoxLayoutOrientationProps(vertical, {stModule, clutterModule});
    return new stModule.BoxLayout({
        ...rest,
        ...orientationProps,
    });
}

/**
 * Resolve the default Clutter.Seat across GNOME Shell 47–51+:
 * - GNOME 50/51+: `global.backend.get_default_seat()` / `global.stage.get_context().get_backend()`
 *   (Clutter.get_default_backend() was removed in GNOME 51)
 * - GNOME 47–50: `Clutter.get_default_backend().get_default_seat()` fallback
 *
 * @param {object} [deps]
 * @param {object|null} [deps.globalObj]
 * @param {object|null} [deps.clutterModule=Clutter]
 * @returns {object|null}
 */
export function getDefaultSeat({globalObj = globalThis.global, clutterModule = Clutter} = {}) {
    const getters = [
        () => globalObj?.backend?.get_default_seat?.(),
        () => globalObj?.stage?.get_context?.()?.get_backend?.()?.get_default_seat?.(),
        () => globalObj?.stage?.context?.get_backend?.()?.get_default_seat?.(),
        () => clutterModule?.get_default_backend?.()?.get_default_seat?.(),
    ];

    for (const getSeat of getters) {
        try {
            const seat = getSeat();
            if (seat)
                return seat;
        } catch {
            // Probe next available seat accessor
        }
    }

    return null;
}

/**
 * Create a virtual keyboard input device via feature-detected Clutter.Seat.
 *
 * @param {object} [deps]
 * @param {object|null} [deps.globalObj]
 * @param {object|null} [deps.clutterModule=Clutter]
 * @returns {object|null}
 */
export function createVirtualKeyboardDevice({globalObj = globalThis.global, clutterModule = Clutter} = {}) {
    const seat = getDefaultSeat({globalObj, clutterModule});
    if (!seat || typeof seat.create_virtual_device !== 'function')
        return null;

    const deviceType = clutterModule?.InputDeviceType?.KEYBOARD_DEVICE;
    if (deviceType === undefined)
        return null;

    return seat.create_virtual_device(deviceType);
}

/**
 * Resolve the Shell UI group container for mounting overlay widgets.
 *
 * @param {object} [deps]
 * @param {object|null} [deps.mainModule=null]
 * @param {object|null} [deps.layoutManager=null]
 * @returns {object|null}
 */
export function getUiGroup({mainModule = null, layoutManager = null} = {}) {
    return mainModule?.uiGroup ?? mainModule?.layoutManager?.uiGroup ?? layoutManager?.uiGroup ?? null;
}

/**
 * Create a Layout.MonitorConstraint when available.
 *
 * @param {object|null} [layoutModule=null]
 * @param {number} [index=0]
 * @returns {object|null}
 */
export function createMonitorConstraint(layoutModule = null, index = 0) {
    if (typeof layoutModule?.MonitorConstraint !== 'function')
        return null;
    return new layoutModule.MonitorConstraint({index});
}

/**
 * Register a PanelMenu.Button indicator on Main.panel status area safely.
 *
 * @param {object|null} panel
 * @param {string} role
 * @param {object} indicator
 * @param {number} [position=0]
 * @param {'left'|'center'|'right'} [box='right']
 * @returns {object|null}
 */
export function addToStatusArea(panel, role, indicator, position = 0, box = 'right') {
    if (!panel || typeof panel.addToStatusArea !== 'function')
        return null;
    const result = panel.addToStatusArea(role, indicator, position, box);
    return result ?? indicator;
}

/**
 * Resolve PopupMenu.Ornament enum value with safe fallback.
 *
 * @param {object|null} popupMenuModule
 * @param {boolean} active
 * @returns {number}
 */
export function getMenuOrnament(popupMenuModule, active) {
    const ornament = popupMenuModule?.Ornament;
    if (active)
        return ornament?.DOT ?? 1;
    return ornament?.NO_DOT ?? ornament?.NONE ?? 4;
}
