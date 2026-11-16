// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Layout indicator button for GNOME Shell top panel

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Compat from './compat.js';
import * as Log from './log.js';

let PanelMenu = null;
let PopupMenu = null;
let Main = null;
let _ = s => s;

try {
    PanelMenu = await import('resource:///org/gnome/shell/ui/panelMenu.js');
    PopupMenu = await import('resource:///org/gnome/shell/ui/popupMenu.js');
    Main = await import('resource:///org/gnome/shell/ui/main.js');
    const extModule = await import('resource:///org/gnome/shell/extensions/extension.js');
    if (extModule?.gettext)
        _ = extModule.gettext;
} catch {
    // In standalone / pure GJS test environment, mocks can be injected or used
}

// Check whether we are executing inside the GNOME Shell compositor environment
const isInsideShell = typeof global !== 'undefined' && Boolean(global.stage);

// Fallback base class if PanelMenu.Button is unavailable (e.g. standalone GJS testing)
const BaseButton = (isInsideShell && PanelMenu?.Button) ? PanelMenu.Button : GObject.Object;

class MockLabel {
    constructor(params = {}) {
        this.style_class = params.style_class ?? '';
        this.text = '';
        this.accessible_name = '';
    }

    set_text(text) {
        this.text = text;
    }
}

/**
 * Format layout text for the panel indicator label.
 *
 * @param {object|null} source - Input source object ({id, shortName, displayName})
 * @param {string} [format='short'] - Format ('short', 'lowercase', 'full')
 * @returns {string} Formatted label text
 */
export function formatLayoutLabel(source, format = 'short') {
    if (!source)
        return '--';

    const shortName = source.shortName || (source.id ? source.id.slice(0, 2) : '--');

    switch (format) {
    case 'lowercase':
        return shortName.toLowerCase();
    case 'full':
        return source.displayName || shortName.toUpperCase();
    case 'short':
    default:
        return shortName.toUpperCase();
    }
}

/**
 * Return accessible label for screen readers.
 *
 * @param {object|null} source - Input source object
 * @returns {string} Accessible description
 */
export function getAccessibleLayoutLabel(source) {
    if (!source)
        return _('Keyboard layout: none configured');

    const name = source.displayName || source.shortName || source.id || '';
    if (typeof _('Keyboard layout: %s').format === 'function')
        return _('Keyboard layout: %s').format(name);

    return `Keyboard layout: ${name}`;
}

export const INDICATOR_POSITIONS = ['system', 'left', 'center', 'right'];

/**
 * Resolve top panel box name and insertion index for the indicator.
 *
 * @param {string} positionSetting - One of 'system', 'left', 'center', 'right'
 * @param {object|null} [panel=null] - GNOME Shell Main.panel (or mock)
 * @returns {{box: 'left'|'center'|'right', position: number}}
 */
export function resolveIndicatorPlacement(positionSetting, panel = null) {
    switch (positionSetting) {
    case 'left': {
        const count = panel?._leftBox?.get_children?.()?.length;
        return {
            box: 'left',
            position: typeof count === 'number' ? count : -1,
        };
    }
    case 'center': {
        const count = panel?._centerBox?.get_children?.()?.length;
        return {
            box: 'center',
            position: typeof count === 'number' ? count : -1,
        };
    }
    case 'right':
        return {
            box: 'right',
            position: 0,
        };
    case 'system':
    default: {
        let position = 0;
        const kbdContainer = panel?.statusArea?.keyboard?.container;
        if (kbdContainer) {
            const children =
                kbdContainer.get_parent?.()?.get_children?.() ??
                panel._rightBox?.get_children?.() ??
                [];
            const idx = children.indexOf(kbdContainer);
            if (idx >= 0)
                position = idx;
        }
        return {
            box: 'right',
            position,
        };
    }
    }
}

/**
 * Indicator
 *
 * Top panel status area button displaying the active keyboard layout
 * with a popup menu for layout selection and preferences access.
 */
export const Indicator = GObject.registerClass({
    GTypeName: 'LiswitchIndicator',
    Signals: {
        'destroy': {},
    },
}, class Indicator extends BaseButton {
    _init(settings, inputSourceService, openPreferences = null, options = {}) {
        if (isInsideShell && PanelMenu?.Button) {
            super._init(0.5, _('Keyboard Layout Indicator'), false);
        } else {
            super._init();
            this.menu = {
                removeAll: () => {},
                addMenuItem: () => {},
                close: () => {},
            };
        }

        this._settings = settings;
        this._inputSourceService = inputSourceService;
        this._openPreferences = openPreferences;
        this._panelOverride = options.panel ?? null;
        this._isDestroyed = false;
        this._lastScrollTime = 0;
        this._systemIndicatorWasHidden = false;

        this._serviceSignals = [];
        this._settingsSignals = [];
        this._menuItems = new Map();

        // St/Clutter actor setup
        if (typeof this.add_style_class_name === 'function')
            this.add_style_class_name('liswitch-indicator');

        if (Atk?.Role?.MENU)
            this.accessible_role = Atk.Role.MENU;

        if (isInsideShell && St?.Label) {
            this._label = new St.Label({
                style_class: 'liswitch-indicator-label',
                y_align: Clutter?.ActorAlign?.CENTER ?? 0,
            });
        } else {
            this._label = new MockLabel({
                style_class: 'liswitch-indicator-label',
            });
        }

        if (typeof this.add_child === 'function')
            this.add_child(this._label);

        // Connect to InputSourceService signals
        if (this._inputSourceService) {
            const currentId = this._inputSourceService.connect('current-changed', () => {
                this._updateLabel();
                this._updateActiveMenuItem();
            });
            const sourcesId = this._inputSourceService.connect('sources-changed', () => {
                this._updateLabel();
                this._rebuildMenu();
                this._syncSystemIndicator();
            });
            this._serviceSignals.push(
                {obj: this._inputSourceService, id: currentId},
                {obj: this._inputSourceService, id: sourcesId}
            );
        }

        // Connect to GSettings changes
        if (this._settings) {
            const formatId = this._settings.connect('changed::indicator-format', () => {
                this._updateLabel();
            });
            const hideSystemId = this._settings.connect('changed::hide-system-indicator', () => {
                this._syncSystemIndicator();
            });
            this._settingsSignals.push(
                {obj: this._settings, id: formatId},
                {obj: this._settings, id: hideSystemId}
            );
        }

        // Initial sync of label, menu, and system indicator
        this._updateLabel();
        this._rebuildMenu();
        this._syncSystemIndicator();

        if (isInsideShell && typeof this.connect === 'function') {
            this.connect('destroy', this._onDestroy.bind(this));
            this.connect('scroll-event', (_actor, event) => this.handleScroll(event));
        }
    }

    /**
     * Update the visual label and accessibility properties.
     */
    _updateLabel() {
        if (!this._label)
            return;

        const currentSource = this._inputSourceService?.getCurrentSource() ?? null;
        const format = this._settings?.get_string('indicator-format') ?? 'short';

        const text = formatLayoutLabel(currentSource, format);
        if (typeof this._label.set_text === 'function')
            this._label.set_text(text);
        else
            this._label.text = text;

        const a11yName = getAccessibleLayoutLabel(currentSource);
        this.accessible_name = a11yName;
        this._label.accessible_name = a11yName;

        Log.debug(`Indicator: label updated to "${text}" (format: ${format})`);
    }

    /**
     * Rebuild all popup menu items based on currently configured input sources.
     */
    _rebuildMenu() {
        if (!this.menu || typeof this.menu.removeAll !== 'function')
            return;

        this.menu.removeAll();
        this._menuItems.clear();

        const sources = this._inputSourceService?.getSources() ?? [];
        const currentIndex = this._inputSourceService?.getCurrentIndex() ?? -1;

        if (sources.length === 0) {
            if (PopupMenu?.PopupMenuItem) {
                const emptyItem = new PopupMenu.PopupMenuItem(_('No layouts configured'));
                emptyItem.sensitive = false;
                this.menu.addMenuItem(emptyItem);
            }
        } else {
            for (const source of sources) {
                let item;
                if (PopupMenu?.PopupMenuItem) {
                    item = new PopupMenu.PopupMenuItem(source.displayName);
                    item.setOrnament(Compat.getMenuOrnament(PopupMenu, source.index === currentIndex));

                    item.connect('activate', () => {
                        Log.debug(`Indicator: menu item activated for source ${source.index} (${source.displayName})`);
                        this._inputSourceService?.activate(source.index, true);
                    });
                    this.menu.addMenuItem(item);
                } else {
                    item = {index: source.index, ornament: source.index === currentIndex ? 1 : 4};
                }

                this._menuItems.set(source.index, item);
            }
        }

        // Separator before Settings
        if (PopupMenu?.PopupSeparatorMenuItem)
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Preferences item
        if (PopupMenu?.PopupMenuItem) {
            const settingsItem = new PopupMenu.PopupMenuItem(_('Settings…'));
            settingsItem.connect('activate', () => {
                Log.debug('Indicator: opening preferences from menu');
                if (typeof this._openPreferences === 'function')
                    this._openPreferences();
            });
            this.menu.addMenuItem(settingsItem);
        }

        Log.debug(`Indicator: menu rebuilt with ${sources.length} layouts`);
    }

    /**
     * Update the active dot ornament on menu items without rebuilding the whole menu.
     */
    _updateActiveMenuItem() {
        const currentIndex = this._inputSourceService?.getCurrentIndex() ?? -1;

        for (const [index, item] of this._menuItems) {
            if (typeof item.setOrnament === 'function' && PopupMenu?.Ornament) {
                item.setOrnament(Compat.getMenuOrnament(PopupMenu, index === currentIndex));
            } else if (item) {
                item.ornament = index === currentIndex ? 1 : 4;
            }
        }
    }

    /**
     * Synchronize standard system keyboard indicator visibility according to user preferences.
     */
    _syncSystemIndicator() {
        const panel = this._panelOverride ?? Main?.panel;
        if (!this._settings || !panel?.statusArea)
            return;

        const shouldHide = this._settings.get_boolean('hide-system-indicator');
        const systemIndicator = panel.statusArea['keyboard'];
        if (!systemIndicator)
            return;

        if (shouldHide) {
            systemIndicator.hide();
            this._systemIndicatorWasHidden = true;
            Log.debug('Indicator: system keyboard indicator hidden');
        } else if (this._systemIndicatorWasHidden) {
            systemIndicator.show();
            this._systemIndicatorWasHidden = false;
            Log.debug('Indicator: system keyboard indicator restored');
        }
    }

    /**
     * Restore system indicator if it was hidden by this instance.
     */
    _restoreSystemIndicator() {
        const panel = this._panelOverride ?? Main?.panel;
        if (this._systemIndicatorWasHidden && panel?.statusArea?.keyboard) {
            try {
                panel.statusArea['keyboard'].show();
                this._systemIndicatorWasHidden = false;
                Log.debug('Indicator: restored system keyboard indicator upon indicator destruction');
            } catch (e) {
                Log.warn('Indicator: failed to restore system indicator:', e.message);
            }
        }
    }

    /**
     * Handle mouse wheel / touchpad scroll events.
     *
     * @param {Clutter.Event} event - Scroll event
     * @returns {number} Clutter.EVENT_STOP or Clutter.EVENT_PROPAGATE
     */
    handleScroll(event) {
        if (!this._settings || !this._settings.get_boolean('scroll-switch'))
            return Clutter?.EVENT_PROPAGATE ?? 0;

        if (!this._inputSourceService || typeof event.get_scroll_direction !== 'function')
            return Clutter?.EVENT_PROPAGATE ?? 0;

        const direction = event.get_scroll_direction();

        if (direction === Clutter.ScrollDirection.UP || direction === Clutter.ScrollDirection.LEFT) {
            Log.debug('Indicator: scroll up/left -> switching to previous layout');
            this._inputSourceService.previous();
            return Clutter.EVENT_STOP;
        }

        if (direction === Clutter.ScrollDirection.DOWN || direction === Clutter.ScrollDirection.RIGHT) {
            Log.debug('Indicator: scroll down/right -> switching to next layout');
            this._inputSourceService.next();
            return Clutter.EVENT_STOP;
        }

        if (direction === Clutter.ScrollDirection.SMOOTH && typeof event.get_scroll_delta === 'function') {
            const [, dy] = event.get_scroll_delta();
            const now = Date.now();
            if (now - this._lastScrollTime < 150)
                return Clutter.EVENT_STOP;

            if (dy < -0.2) {
                this._lastScrollTime = now;
                Log.debug(`Indicator: smooth scroll up (dy=${dy}) -> previous layout`);
                this._inputSourceService.previous();
                return Clutter.EVENT_STOP;
            } else if (dy > 0.2) {
                this._lastScrollTime = now;
                Log.debug(`Indicator: smooth scroll down (dy=${dy}) -> next layout`);
                this._inputSourceService.next();
                return Clutter.EVENT_STOP;
            }
        }

        return Clutter?.EVENT_PROPAGATE ?? 0;
    }


    /**
     * Internal destroy listener for lifecycle cleanup.
     */
    _onDestroy() {
        if (this._isDestroyed)
            return;
        this._isDestroyed = true;

        Log.debug('Indicator: destroying indicator and disconnecting signals');

        // Disconnect InputSourceService signals
        for (const {obj, id} of this._serviceSignals) {
            try {
                obj.disconnect(id);
            } catch {
                // Ignore disconnected signals
            }
        }
        this._serviceSignals = [];

        // Disconnect GSettings signals
        for (const {obj, id} of this._settingsSignals) {
            try {
                obj.disconnect(id);
            } catch {
                // Ignore disconnected signals
            }
        }
        this._settingsSignals = [];

        // Restore system indicator if previously hidden
        this._restoreSystemIndicator();

        if (this._menuItems)
            this._menuItems.clear();

        this._inputSourceService = null;
        this._settings = null;
        this._openPreferences = null;
        this._panelOverride = null;
        this._label = null;
    }

    /**
     * Public synchronous destruction method.
     */
    destroy() {
        this._onDestroy();
        if (typeof super.destroy === 'function')
            super.destroy();
        else
            this.emit('destroy');
    }

    /**
     * Label widget getter (useful for testing and inspection).
     */
    get label() {
        return this._label;
    }

    /**
     * Menu items map getter.
     */
    get menuItems() {
        return this._menuItems;
    }
});
