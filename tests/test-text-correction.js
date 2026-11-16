// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: TextCorrection and TextTranslator Unit Tests (pure GJS)

import GLib from 'gi://GLib';
import {TextTranslator} from '../src/textTranslator.js';
import {TextCorrectionManager} from '../src/textCorrection.js';
import {
    assert,
    assertEqual,
    createMemorySettings,
    MockInputSourceService,
    MockWindow,
} from './helpers.js';

let Clutter = null;
try {
    Clutter = (await import('gi://Clutter')).default;
} catch {
    Clutter = null;
}

console.log('=== Liswitch: Text Correction Unit Tests ===\n');

const settings = createMemorySettings();

// Test 1: TextTranslator English to Russian
console.log('Test 1: TextTranslator us -> ru conversion ("ghbdtn" -> "привет")...');
{
    const translator = new TextTranslator();
    const result = translator.convert('ghbdtn', 'us', 'ru');
    assertEqual(result, 'привет', 'ghbdtn should convert to привет');
    console.log('  -> PASS');
}

// Test 2: TextTranslator Russian to English
console.log('Test 2: TextTranslator ru -> us conversion ("привет" -> "ghbdtn")...');
{
    const translator = new TextTranslator();
    const result = translator.convert('привет', 'ru', 'us');
    assertEqual(result, 'ghbdtn', 'привет should convert to ghbdtn');
    console.log('  -> PASS');
}

// Test 3: TextTranslator Case and Punctuation preservation
console.log('Test 3: Case and punctuation preservation ("Ghbdtn? vbh!" -> "Привет, мир!")...');
{
    const translator = new TextTranslator();
    const result = translator.convert('Ghbdtn? vbh!', 'us', 'ru');
    assertEqual(result, 'Привет, мир!', 'Physical keys with Shift should convert correctly');
    console.log('  -> PASS');
}

// Test 4: TextTranslator with Kazakh layout
console.log('Test 4: TextTranslator us -> kz conversion...');
{
    const translator = new TextTranslator();
    const result = translator.convert('ghbdtn', 'us', 'kz');
    assertEqual(result, 'привет', 'ghbdtn in kz layout should also convert to привет');
    console.log('  -> PASS');
}

// Test 5: Layout detection heuristic
console.log('Test 5: Source layout guessing heuristic...');
{
    const translator = new TextTranslator();
    assertEqual(translator.guessSourceLayout('ghbdtn', 'us', 'ru'), 'us', 'ghbdtn matches us');
    assertEqual(translator.guessSourceLayout('привет', 'us', 'ru'), 'ru', 'привет matches ru');
    console.log('  -> PASS');
}

// Test 6: TextCorrectionManager buffer operations
console.log('Test 6: In-memory buffer size limit (64 chars) and manual conversion...');
{
    const mockService = new MockInputSourceService();
    settings.set_boolean('convert-text-enabled', true);

    const manager = new TextCorrectionManager(settings, mockService);
    manager.enable();

    // Push 70 characters into buffer via pushChar to test max length 64
    for (let i = 0; i < 70; i++)
        manager.pushChar('a');

    assertEqual(manager._buffer.length, 64, 'Buffer must be capped at 64 characters');

    // Clear buffer
    manager.clearBuffer();
    assertEqual(manager._buffer.length, 0, 'Buffer must be empty after clearBuffer()');

    // Simulate word typed into buffer
    const word = 'ghbdtn';
    for (const ch of word)
        manager.pushChar(ch);

    // Trigger conversion
    const ok = manager.convertLastWord();
    assert(ok, 'convertLastWord should succeed for valid word and 2 layouts');
    assertEqual(mockService.getCurrentIndex(), 1, 'Layout should switch to target layout 1');
    assertEqual(manager._buffer.length, 0, 'Buffer should be cleared after conversion');

    manager.destroy();
    console.log('  -> PASS');
}

// Test 7: 20 cycles of enable/destroy without errors
console.log('Test 7: 20 cycles of enable/destroy to verify clean lifecycle...');
{
    const mockService = new MockInputSourceService();
    for (let i = 0; i < 20; i++) {
        const manager = new TextCorrectionManager(settings, mockService);
        manager.enable();
        manager.destroy();
    }
    console.log('  -> PASS (20 cycles cleanly executed)');
}

// Test 8: Non-contiguous source.index values ([0, 2])
console.log('Test 8: Non-contiguous source indices [0, 2] resolve by position, activate by source.index...');
{
    const sparseSources = [
        {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        {index: 2, id: 'ru', shortName: 'ru', displayName: 'Russian'},
    ];

    // us (index 0) -> ru (index 2)
    const svcA = new MockInputSourceService(sparseSources, 0);
    const mgrA = new TextCorrectionManager(settings, svcA);
    mgrA.enable();
    for (const ch of 'ghbdtn')
        mgrA.pushChar(ch);
    assert(mgrA.convertLastWord(), 'convertLastWord should succeed from index 0');
    assertEqual(svcA.activatedIndices.length, 1, 'activate() must be called exactly once');
    assertEqual(svcA.activatedIndices[0].index, 2, 'Must activate source.index 2 (not array position 1)');
    assertEqual(svcA.getCurrentIndex(), 2, 'Current index should be 2 after conversion');
    mgrA.destroy();

    // ru (index 2) -> us (index 0): wrap-around; old code computed (2+1)%2=1 -> invalid
    const svcB = new MockInputSourceService(sparseSources, 2);
    const mgrB = new TextCorrectionManager(settings, svcB);
    mgrB.enable();
    for (const ch of 'привет')
        mgrB.pushChar(ch);
    assert(mgrB.convertLastWord(), 'convertLastWord should succeed from index 2');
    assertEqual(svcB.activatedIndices[0]?.index, 0, 'Must wrap around to source.index 0');
    mgrB.destroy();

    // Three sources [0, 2, 5], current 2 -> next is 5
    const svcC = new MockInputSourceService([
        {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        {index: 2, id: 'ru', shortName: 'ru', displayName: 'Russian'},
        {index: 5, id: 'us', shortName: 'en', displayName: 'English (US) #2'},
    ], 2);
    const mgrC = new TextCorrectionManager(settings, svcC);
    mgrC.enable();
    for (const ch of 'привет')
        mgrC.pushChar(ch);
    assert(mgrC.convertLastWord(), 'convertLastWord should succeed with 3 sparse sources');
    assertEqual(svcC.activatedIndices[0]?.index, 5, 'From source.index 2 the next must be source.index 5');
    mgrC.destroy();

    console.log('  -> PASS');
}

// Mock key event compatible with the subset of Clutter.Event used by _onCapturedEvent
function makeKeyEvent(keysym, state = 0) {
    return {
        type: () => Clutter.EventType.KEY_PRESS,
        get_key_symbol: () => keysym,
        get_state: () => state,
    };
}

function typeWord(manager, word) {
    for (const ch of word)
        manager._onCapturedEvent(makeKeyEvent(Clutter.unicode_to_keysym(ch.codePointAt(0))));
}

if (!Clutter) {
    console.log('Test 9-10: SKIPPED (Clutter typelib unavailable in this environment)');
} else {
    // Test 9: Navigation keys clear the buffer
    console.log('Test 9: Navigation / Delete keys clear the buffer...');
    {
        const mgr = new TextCorrectionManager(settings, new MockInputSourceService());
        mgr.enable();

        typeWord(mgr, 'abc');
        assertEqual(mgr._buffer.join(''), 'abc', 'Plain key events must fill the buffer');
        mgr.clearBuffer();

        const navKeys = [
            'KEY_Left', 'KEY_Right', 'KEY_Up', 'KEY_Down', 'KEY_Home', 'KEY_End',
            'KEY_Page_Up', 'KEY_Page_Down', 'KEY_Delete', 'KEY_KP_Left', 'KEY_KP_Delete',
        ];
        for (const name of navKeys) {
            typeWord(mgr, 'abc');
            assertEqual(mgr._buffer.length, 3, `Buffer must be filled before ${name}`);
            mgr._onCapturedEvent(makeKeyEvent(Clutter[name]));
            assertEqual(mgr._buffer.length, 0, `${name} must clear the buffer`);
        }

        // Backspace still pops a single character
        typeWord(mgr, 'abc');
        mgr._onCapturedEvent(makeKeyEvent(Clutter.KEY_BackSpace));
        assertEqual(mgr._buffer.join(''), 'ab', 'Backspace must pop exactly one character');

        mgr.destroy();
        console.log('  -> PASS');
    }

    // Test 10: Held Ctrl/Alt/Super/Meta modifiers clear the buffer; Shift does not
    console.log('Test 10: Held modifiers (Ctrl/Alt/Super/Meta) clear the buffer, Shift does not...');
    {
        const mgr = new TextCorrectionManager(settings, new MockInputSourceService());
        mgr.enable();

        const M = Clutter.ModifierType;
        const masks = {
            CONTROL_MASK: M.CONTROL_MASK,
            MOD1_MASK: M.MOD1_MASK,
            SUPER_MASK: M.SUPER_MASK,
            META_MASK: M.META_MASK,
        };
        for (const [name, mask] of Object.entries(masks)) {
            typeWord(mgr, 'abc');
            mgr._onCapturedEvent(makeKeyEvent(Clutter.KEY_a, mask));
            assertEqual(mgr._buffer.length, 0, `Key with ${name} held must clear the buffer`);
        }

        // Ctrl+BackSpace (delete word) must clear, not pop
        typeWord(mgr, 'abc');
        mgr._onCapturedEvent(makeKeyEvent(Clutter.KEY_BackSpace, M.CONTROL_MASK));
        assertEqual(mgr._buffer.length, 0, 'Ctrl+BackSpace must clear the buffer');

        // Shift-only state is regular text input (uppercase)
        mgr.clearBuffer();
        mgr._onCapturedEvent(makeKeyEvent(Clutter.KEY_A, M.SHIFT_MASK));
        mgr._onCapturedEvent(makeKeyEvent(Clutter.KEY_b, M.SHIFT_MASK | M.LOCK_MASK));
        assertEqual(mgr._buffer.join(''), 'Ab', 'Shift/CapsLock state must not clear the buffer');

        mgr.destroy();
        console.log('  -> PASS');
    }
}

// Test 11: Extended sensitive-window heuristics
console.log('Test 11: Sensitive window tokens (login, sign in, vault, ssh, sudo, gpg)...');
{
    const mgr = new TextCorrectionManager(settings, new MockInputSourceService());
    const hadGlobal = 'global' in globalThis;
    const savedGlobal = globalThis.global;
    try {
        const titles = ['Login - Site', 'Please Sign In', 'HashiCorp Vault', 'ssh user@host',
            '[sudo] password for user', 'GPG passphrase'];
        for (const title of titles) {
            globalThis.global = {display: {focus_window: {
                get_wm_class: () => 'org.example.App',
                get_title: () => title,
                get_sandboxed_app_id: () => '',
            }}};
            assert(mgr._isPasswordOrSensitiveWindow(), `"${title}" must be treated as sensitive`);
        }

        globalThis.global = {display: {focus_window: {
            get_wm_class: () => 'org.gnome.TextEditor',
            get_title: () => 'notes.txt',
            get_sandboxed_app_id: () => '',
        }}};
        assert(!mgr._isPasswordOrSensitiveWindow(), 'Regular editor window must not be sensitive');
    } finally {
        if (hadGlobal)
            globalThis.global = savedGlobal;
        else
            delete globalThis.global;
    }
    mgr.destroy();
    console.log('  -> PASS');
}

// Test 12: Fallback behavior when Clutter === null
console.log('Test 12: TextTranslator falls back to FALLBACK_US/FALLBACK_RU/FALLBACK_KZ when Clutter === null...');
{
    const fallbackTranslator = new TextTranslator({clutter: null});

    const usMap = fallbackTranslator.resolveLayout('us');
    const ruMap = fallbackTranslator.resolveLayout('ru');
    const kzMap = fallbackTranslator.resolveLayout('kz');
    assertEqual(usMap.AD01?.[0], 'q', 'FALLBACK_US must resolve AD01 to q when Clutter is null');
    assertEqual(ruMap.AD01?.[0], 'й', 'FALLBACK_RU must resolve AD01 to й even if Uxxxx exists in ru(winkeys)');
    assertEqual(kzMap.AE02?.[0], 'ә', 'FALLBACK_KZ must resolve AE02 to ә when Clutter is null');

    assertEqual(fallbackTranslator.convert('ghbdtn', 'us', 'ru'), 'привет',
        'Fallback us -> ru conversion must work when Clutter is null');
    assertEqual(fallbackTranslator.convert('привет', 'ru', 'us'), 'ghbdtn',
        'Fallback ru -> us conversion must work when Clutter is null');
    assertEqual(fallbackTranslator.convert('23', 'us', 'kz'), 'әі',
        'Fallback us -> kz conversion must work when Clutter is null');
    assertEqual(fallbackTranslator.guessSourceLayout('ghbdtn', 'us', 'ru'), 'us',
        'guessSourceLayout must detect us when Clutter is null');
    assertEqual(fallbackTranslator.guessSourceLayout('привет', 'us', 'ru'), 'ru',
        'guessSourceLayout must detect ru when Clutter is null');
    console.log('  -> PASS');
}

// Test 13: Multiline key <...> blocks and override/replace/augment directives
console.log('Test 13: Multiline XKB key parsing and override/replace/augment merge modes...');
{
    const tmpDir = GLib.build_filenamev([GLib.get_tmp_dir(), `liswitch-xkb-test-${Date.now()}`]);
    GLib.mkdir_with_parents(tmpDir, 0o755);
    try {
        const basePath = GLib.build_filenamev([tmpDir, 'base']);
        const customPath = GLib.build_filenamev([tmpDir, 'custom']);

        GLib.file_set_contents(basePath, [
            'default xkb_symbols "basic" {',
            '    key <AD01> { [ U0071, U0051 ] };',
            '    key <AD02> { [ U0077, U0057 ] };',
            '    key <AD03> { [ U0065, U0045 ] };',
            '};',
        ].join('\n'));

        GLib.file_set_contents(customPath, [
            'default xkb_symbols "basic" {',
            '    include "base(basic)"',
            '    key <AD01> {',
            '        type[Group1] = "FOUR_LEVEL",',
            '        symbols[Group1] = [',
            '            U0439,',
            '            U0419',
            '        ]',
            '    };',
            '    override key <AD02> {',
            '        [ NoSymbol, U0426 ]',
            '    };',
            '    replace key <AD03> { [ U0443 ] };',
            '    augment key <AD01> { [ U0078, U0058, U00A7 ] };',
            '};',
        ].join('\n'));

        const xkbTranslator = new TextTranslator({clutter: null, xkbDir: tmpDir});
        const customMap = xkbTranslator.resolveLayout('custom');

        assertEqual(customMap.AD01[0], 'й', 'Multiline symbols[Group1] level 0 must parse');
        assertEqual(customMap.AD01[1], 'Й', 'Multiline symbols[Group1] level 1 must parse');
        assertEqual(customMap.AD01[2], '§', 'augment must fill missing level 2 without overwriting existing levels');
        assertEqual(customMap.AD02[0], 'w', 'override with NoSymbol must preserve base level 0');
        assertEqual(customMap.AD02[1], 'Ц', 'override must replace level 1');
        assertEqual(customMap.AD03.length, 1, 'replace must replace entire key definition');
        assertEqual(customMap.AD03[0], 'у', 'replace level 0 must match');
    } finally {
        for (const name of ['base', 'custom']) {
            const p = GLib.build_filenamev([tmpDir, name]);
            if (GLib.file_test(p, GLib.FileTest.EXISTS))
                GLib.unlink(p);
        }
        GLib.rmdir(tmpDir);
    }
    console.log('  -> PASS');
}

// Test 14: 3-layout smart target selection (us, ru, kz)
console.log('Test 14: 3-layout smart conversion with us, ru, kz...');
{
    const triSources = [
        {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
        {index: 2, id: 'kz', shortName: 'kz', displayName: 'Kazakh'},
    ];

    // 14a. Active ru(1), typed 'привет': next in ring is kz(2) which yields identical text,
    // so manager must skip kz and convert to us(0) -> 'ghbdtn'.
    {
        const svc = new MockInputSourceService(triSources, 1);
        const mgr = new TextCorrectionManager(settings, svc);
        mgr.enable();
        for (const ch of 'привет')
            mgr.pushChar(ch);
        assert(mgr.convertLastWord(), 'Must convert привет from ru to us when kz is next in ring');
        assertEqual(svc.getCurrentIndex(), 0, 'Must switch to us (index 0), skipping identical kz');
        mgr.destroy();
    }

    // 14b. Active ru(1), typed 'привет,' (ru->kz changes only 1 char ',', ru->us changes all 7):
    // must pick us(0) with maximum changed characters.
    {
        const svc = new MockInputSourceService(triSources, 1);
        const mgr = new TextCorrectionManager(settings, svc);
        mgr.enable();
        for (const ch of 'привет,')
            mgr.pushChar(ch);
        assert(mgr.convertLastWord(), 'Must convert привет, from ru to us');
        assertEqual(svc.getCurrentIndex(), 0, 'Must prefer us (7 changed) over kz (1 changed)');
        mgr.destroy();
    }

    // 14c. Active us(0), typed '23' intending Kazakh 'әі' (us->ru is unchanged '23', us->kz is 'әі'):
    // must skip ru(1) and switch to kz(2).
    {
        const svc = new MockInputSourceService(triSources, 0);
        const mgr = new TextCorrectionManager(settings, svc);
        mgr.enable();
        for (const ch of '23')
            mgr.pushChar(ch);
        assert(mgr.convertLastWord(), 'Must convert 23 from us to kz');
        assertEqual(svc.getCurrentIndex(), 2, 'Must skip ru (unchanged) and pick kz (index 2)');
        mgr.destroy();
    }

    // 14d. Mismatched active us(0) while buffer has 'привет':
    // guessSourceLayout detects 'ru' as source and converts to 'us' (index 0).
    {
        const svc = new MockInputSourceService(triSources, 0);
        const mgr = new TextCorrectionManager(settings, svc);
        mgr.enable();
        for (const ch of 'привет')
            mgr.pushChar(ch);
        assert(mgr.convertLastWord(), 'guessSourceLayout must recover when buffer text is Russian');
        assertEqual(svc.getCurrentIndex(), 0, 'Target layout for Russian word must be us (index 0)');
        mgr.destroy();
    }

    // 14e. Active us(0), typed 'ghbdtn': ru(1) and kz(2) both convert all 6 chars,
    // tie must break in circular order to ru(1).
    {
        const svc = new MockInputSourceService(triSources, 0);
        const mgr = new TextCorrectionManager(settings, svc);
        mgr.enable();
        for (const ch of 'ghbdtn')
            mgr.pushChar(ch);
        assert(mgr.convertLastWord(), 'Must convert ghbdtn from us');
        assertEqual(svc.getCurrentIndex(), 1, 'Tie between ru and kz must pick next in order (ru)');
        mgr.destroy();
    }

    console.log('  -> PASS');
}

// Test 15: Clipboard preservation & restoration and timer cleanup in destroy()
console.log('Test 15: Clipboard preservation/restoration after Ctrl+V and timer cleanup on destroy()...');
{
    const EVDEV_BACKSPACE = 14;
    const EVDEV_LEFTCTRL = 29;
    const EVDEV_V = 47;

    function createMockClipboard(initialText, asyncRead = true) {
        return {
            currentText: initialText,
            history: [],
            get_text(_type, cb) {
                const snapshot = this.currentText;
                if (asyncRead) {
                    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                        cb(this, snapshot);
                        return GLib.SOURCE_REMOVE;
                    });
                } else {
                    cb(this, snapshot);
                }
            },
            set_text(_type, text) {
                this.currentText = text;
                this.history.push(text);
            },
        };
    }

    function createMockVirtualDevice() {
        return {
            events: [],
            notify_key(_timeUs, keycode, state) {
                this.events.push({keycode, state});
            },
        };
    }

    function runLoopFor(ms, stopWhen = null) {
        const loop = new GLib.MainLoop(null, false);
        let checkId = 0;
        let timedOut = false;
        if (stopWhen) {
            checkId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                if (stopWhen()) {
                    checkId = 0;
                    loop.quit();
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            });
        }
        const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            timedOut = true;
            if (checkId) {
                GLib.Source.remove(checkId);
                checkId = 0;
            }
            loop.quit();
            return GLib.SOURCE_REMOVE;
        });
        loop.run();
        if (!timedOut)
            GLib.Source.remove(timeoutId);
    }

    // 15a. Non-empty prior clipboard text is preserved and restored after Ctrl+V
    {
        const svc = new MockInputSourceService();
        const clipboard = createMockClipboard('important-user-data', true);
        const vdev = createMockVirtualDevice();
        const mgr = new TextCorrectionManager(settings, svc, {clipboard, virtualDevice: vdev});
        mgr.enable();

        for (const ch of 'ghbdtn')
            mgr.pushChar(ch);
        assert(mgr.convertLastWord(), 'convertLastWord must succeed');

        runLoopFor(400, () => clipboard.history.length >= 2);

        assertEqual(clipboard.history[0], 'привет', 'Clipboard must first be set to converted text');
        assertEqual(clipboard.history[1], 'important-user-data', 'Prior clipboard text must be restored after Ctrl+V');
        assertEqual(clipboard.currentText, 'important-user-data', 'Final clipboard must equal prior text');

        const backspaces = vdev.events.filter(e => e.keycode === EVDEV_BACKSPACE && e.state === 1);
        const pasteVs = vdev.events.filter(e => e.keycode === EVDEV_V && e.state === 1);
        const ctrls = vdev.events.filter(e => e.keycode === EVDEV_LEFTCTRL && e.state === 1);
        assertEqual(backspaces.length, 6, 'Must emit 6 Backspaces for ghbdtn');
        assertEqual(ctrls.length, 1, 'Must emit 1 LeftCtrl press for Ctrl+V');
        assertEqual(pasteVs.length, 1, 'Must emit 1 V press for Ctrl+V');

        mgr.destroy();
    }

    // 15b. Empty prior clipboard text does not trigger a restore write
    {
        const svc = new MockInputSourceService();
        const clipboard = createMockClipboard('', false);
        const vdev = createMockVirtualDevice();
        const mgr = new TextCorrectionManager(settings, svc, {clipboard, virtualDevice: vdev});
        mgr.enable();

        for (const ch of 'ghbdtn')
            mgr.pushChar(ch);
        assert(mgr.convertLastWord(), 'convertLastWord must succeed with empty clipboard');

        runLoopFor(180);

        assertEqual(clipboard.history.length, 1, 'Must not restore when clipboard was initially empty');
        assertEqual(clipboard.currentText, 'привет', 'Clipboard holds converted text when initially empty');
        assertEqual(mgr._restoreClipboardTimeoutId, 0, 'No restore timer must be created for empty clipboard');

        mgr.destroy();
    }

    // 15c. destroy() cancels pending clipboard/paste/restore timers cleanly
    {
        const svc = new MockInputSourceService();
        const clipboard = createMockClipboard('keep-safe', false);
        const vdev = createMockVirtualDevice();
        const mgr = new TextCorrectionManager(settings, svc, {clipboard, virtualDevice: vdev});
        mgr.enable();

        for (const ch of 'ghbdtn')
            mgr.pushChar(ch);
        assert(mgr.convertLastWord(), 'convertLastWord must succeed');
        assert(mgr._pasteTimeoutId !== 0, 'Paste timer must be scheduled');

        mgr.destroy();
        assertEqual(mgr._pasteTimeoutId, 0, 'destroy() must clear _pasteTimeoutId');
        assertEqual(mgr._restoreClipboardTimeoutId, 0, 'destroy() must clear _restoreClipboardTimeoutId');
        assertEqual(mgr._clipboardReadTimeoutId, 0, 'destroy() must clear _clipboardReadTimeoutId');

        runLoopFor(180);
        const pasteEvents = vdev.events.filter(e => e.keycode === EVDEV_V);
        assertEqual(pasteEvents.length, 0, 'Ctrl+V must not fire after destroy()');
        assertEqual(clipboard.history.length, 1, 'Clipboard restore must not fire after destroy()');
    }

    console.log('  -> PASS');
}

console.log('\n=== ALL TEXT CORRECTION UNIT TESTS PASSED SUCCESSFULLY! ===');
