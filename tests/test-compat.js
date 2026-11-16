// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: Unit tests for GNOME Shell 47–51+ feature-detection compatibility layer

import {
    isReducedMotion,
    getBoxLayoutOrientationProps,
    createBoxLayout,
    getDefaultSeat,
    createVirtualKeyboardDevice,
    getUiGroup,
    createMonitorConstraint,
    addToStatusArea,
    getMenuOrnament,
} from '../src/compat.js';
import {
    assert,
    assertEquals,
    assertDeepEquals,
} from './helpers.js';

function runTests() {
    print('=== Liswitch: Compatibility Layer Unit Tests ===\n');

    // 1. St.ReducedMotion vs enable_animations feature detection
    print('Test 1: isReducedMotion feature detection (GNOME 47–51+)...');
    {
        // GNOME 51+ St.ReducedMotion.REDUCE
        const st51Reduced = {
            ReducedMotion: {NO_PREFERENCE: 0, REDUCE: 1},
            Settings: {get: () => ({reduced_motion: 1, enable_animations: true})},
        };
        assertEquals(isReducedMotion(st51Reduced), true, 'GNOME 51 REDUCE returns true');

        // GNOME 51+ camelCase property variant
        const st51Camel = {
            ReducedMotion: {NO_PREFERENCE: 0, REDUCE: 1},
            Settings: {get: () => ({reducedMotion: 1, enableAnimations: true})},
        };
        assertEquals(isReducedMotion(st51Camel), true, 'GNOME 51 camelCase reducedMotion returns true');

        // GNOME 51+ NO_PREFERENCE with animations enabled
        const st51Normal = {
            ReducedMotion: {NO_PREFERENCE: 0, REDUCE: 1},
            Settings: {get: () => ({reduced_motion: 0, enable_animations: true})},
        };
        assertEquals(isReducedMotion(st51Normal), false, 'GNOME 51 NO_PREFERENCE returns false');

        // GNOME 47–50 (no St.ReducedMotion enum, enable_animations = false)
        const st47Disabled = {
            Settings: {get: () => ({enable_animations: false})},
        };
        assertEquals(isReducedMotion(st47Disabled), true, 'GNOME 47-50 enable_animations=false returns true');

        // GNOME 47–50 animations enabled
        const st47Enabled = {
            Settings: {get: () => ({enable_animations: true})},
        };
        assertEquals(isReducedMotion(st47Enabled), false, 'GNOME 47-50 enable_animations=true returns false');

        // Missing or throwing St module
        assertEquals(isReducedMotion(null), false, 'Null St module returns false safely');
        assertEquals(isReducedMotion({Settings: {get: () => {
            throw new Error('no display');
        }}}), false, 'Throwing St.Settings.get() returns false safely');
        print('  -> PASS');
    }

    // 2. St.BoxLayout orientation vs vertical feature detection
    print('Test 2: St.BoxLayout orientation vs vertical (GNOME 47 vs 48–51+)...');
    {
        const mockClutter = {
            Orientation: {HORIZONTAL: 0, VERTICAL: 1},
        };

        // GNOME 48–51+ St.BoxLayout supporting 'orientation' property
        class ModernBoxLayout {
            constructor(props) {
                this.props = props;
            }

            static find_property(name) {
                return name === 'orientation' ? {name: 'orientation'} : null;
            }
        }

        const vertProps = getBoxLayoutOrientationProps(true, {
            stModule: {BoxLayout: ModernBoxLayout},
            clutterModule: mockClutter,
        });
        assertDeepEquals(vertProps, {orientation: 1}, 'Modern Shell uses Clutter.Orientation.VERTICAL');
        assert(!('vertical' in vertProps), 'Modern Shell must not pass removed vertical property');

        const horizBox = createBoxLayout(
            {style_class: 'osd-window', vertical: false},
            {stModule: {BoxLayout: ModernBoxLayout}, clutterModule: mockClutter}
        );
        assertEquals(horizBox.props.orientation, 0, 'createBoxLayout maps vertical:false to HORIZONTAL');
        assertEquals(horizBox.props.style_class, 'osd-window', 'createBoxLayout preserves extra props');
        assert(!('vertical' in horizBox.props), 'createBoxLayout strips vertical on modern Shell');

        // GNOME 47 St.BoxLayout supporting only 'vertical' property
        class LegacyBoxLayout {
            constructor(props) {
                this.props = props;
            }

            static find_property(name) {
                return name === 'vertical' ? {name: 'vertical'} : null;
            }
        }

        const legacyProps = getBoxLayoutOrientationProps(true, {
            stModule: {BoxLayout: LegacyBoxLayout},
            clutterModule: mockClutter,
        });
        assertDeepEquals(legacyProps, {vertical: true}, 'GNOME 47 falls back to vertical:true');

        const legacyBox = createBoxLayout(
            {vertical: true, style_class: 'vbox'},
            {stModule: {BoxLayout: LegacyBoxLayout}, clutterModule: mockClutter}
        );
        assertEquals(legacyBox.props.vertical, true, 'Legacy createBoxLayout passes vertical:true');
        print('  -> PASS');
    }

    // 3. Clutter.Seat / VirtualInputDevice feature detection
    print('Test 3: getDefaultSeat & createVirtualKeyboardDevice (GNOME 47–51+)...');
    {
        const mockClutter = {
            InputDeviceType: {KEYBOARD_DEVICE: 1},
        };
        const fakeDevice = {notify_key: () => {}};

        // GNOME 51+: global.backend.get_default_seat()
        const seatFromGlobalBackend = {
            create_virtual_device: type => ({type, dev: fakeDevice}),
        };
        const dev1 = createVirtualKeyboardDevice({
            globalObj: {backend: {get_default_seat: () => seatFromGlobalBackend}},
            clutterModule: mockClutter,
        });
        assertEquals(dev1.type, 1, 'Creates virtual keyboard via global.backend');

        // GNOME 51+: global.stage.get_context().get_backend().get_default_seat()
        const seatFromStageContext = {
            create_virtual_device: type => ({type, source: 'stage-context'}),
        };
        const dev2 = createVirtualKeyboardDevice({
            globalObj: {
                stage: {
                    get_context: () => ({
                        get_backend: () => ({
                            get_default_seat: () => seatFromStageContext,
                        }),
                    }),
                },
            },
            clutterModule: mockClutter,
        });
        assertEquals(dev2.source, 'stage-context', 'Falls back to global.stage.get_context().get_backend()');

        // GNOME 47–50: Clutter.get_default_backend().get_default_seat()
        const seatFromLegacyClutter = {
            create_virtual_device: type => ({type, source: 'legacy-clutter'}),
        };
        const dev3 = createVirtualKeyboardDevice({
            globalObj: {},
            clutterModule: {
                ...mockClutter,
                get_default_backend: () => ({
                    get_default_seat: () => seatFromLegacyClutter,
                }),
            },
        });
        assertEquals(dev3.source, 'legacy-clutter', 'Falls back to Clutter.get_default_backend()');

        // Unavailable environment returns null safely
        assertEquals(getDefaultSeat({globalObj: null, clutterModule: null}), null, 'Null env returns null seat');
        assertEquals(createVirtualKeyboardDevice({globalObj: null, clutterModule: null}), null, 'Null env returns null device');
        print('  -> PASS');
    }

    // 4. UI group, MonitorConstraint, status area, and PopupMenu ornament helpers
    print('Test 4: getUiGroup, createMonitorConstraint, addToStatusArea, getMenuOrnament...');
    {
        const uiA = {id: 'uiA'};
        const uiB = {id: 'uiB'};
        assertEquals(getUiGroup({mainModule: {uiGroup: uiA}}), uiA, 'Prefers Main.uiGroup');
        assertEquals(getUiGroup({mainModule: {layoutManager: {uiGroup: uiB}}}), uiB, 'Falls back to Main.layoutManager.uiGroup');
        assertEquals(getUiGroup({layoutManager: {uiGroup: uiB}}), uiB, 'Falls back to layoutManager.uiGroup');

        class FakeMonitorConstraint {
            constructor(opts) {
                this.index = opts.index;
            }
        }
        const constraint = createMonitorConstraint({MonitorConstraint: FakeMonitorConstraint}, 2);
        assertEquals(constraint.index, 2, 'Creates MonitorConstraint with index');
        assertEquals(createMonitorConstraint(null, 0), null, 'Missing Layout module returns null');

        let added = null;
        const panel = {
            addToStatusArea: (role, ind, pos, box) => {
                added = {role, ind, pos, box};
            },
        };
        const indicator = {id: 'ind'};
        const res = addToStatusArea(panel, 'liswitch@local', indicator, 1, 'right');
        assertEquals(res, indicator, 'addToStatusArea returns indicator even when panel method returns void');
        assertEquals(added.role, 'liswitch@local', 'addToStatusArea passes role');
        assertEquals(added.pos, 1, 'addToStatusArea passes position');
        assertEquals(added.box, 'right', 'addToStatusArea passes box');
        assertEquals(addToStatusArea(null, 'r', indicator), null, 'Null panel returns null');

        const popupMod = {Ornament: {DOT: 1, NO_DOT: 4}};
        assertEquals(getMenuOrnament(popupMod, true), 1, 'Active ornament resolves to DOT');
        assertEquals(getMenuOrnament(popupMod, false), 4, 'Inactive ornament resolves to NO_DOT');
        assertEquals(getMenuOrnament({Ornament: {DOT: 1, NONE: 0}}, false), 0, 'Falls back to NONE if NO_DOT absent');
        print('  -> PASS');
    }

    print('\n=== ALL COMPATIBILITY LAYER TESTS PASSED SUCCESSFULLY! ===');
}

runTests();
