// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: TextCorrection and TextTranslator Unit Tests (pure GJS)

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {TextTranslator} from '../src/textTranslator.js';
import {TextCorrectionManager} from '../src/textCorrection.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(actual, expected, message) {
    if (actual !== expected)
        throw new Error(`Assertion failed: ${message} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

console.log('=== Liswitch: Text Correction Unit Tests ===\n');

// Mock InputSourceService
const MockInputSourceService = GObject.registerClass({
    GTypeName: 'MockInputSourceServiceCorrection',
    Signals: {
        'sources-changed': {},
        'current-changed': {param_types: [GObject.TYPE_INT]},
    },
}, class MockInputSourceServiceCorrection extends GObject.Object {
    constructor() {
        super();
        this._sources = [
            {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
            {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
        ];
        this._currentIndex = 0;
        this.activatedIndices = [];
    }

    get isAvailable() {
        return true;
    }

    getSources() {
        return this._sources;
    }

    getCurrentIndex() {
        return this._currentIndex;
    }

    getCurrentSource() {
        return this._sources[this._currentIndex] ?? null;
    }

    activate(index, interactive = true) {
        this.activatedIndices.push({index, interactive});
        this._currentIndex = index;
        this.emit('current-changed', index);
        return true;
    }
});

// Setup mock Gio.Settings
const settingsSource = Gio.SettingsSchemaSource.new_from_directory(
    'schemas',
    Gio.SettingsSchemaSource.get_default(),
    false
);
const schema = settingsSource.lookup('org.gnome.shell.extensions.liswitch', false);
const settings = new Gio.Settings({settings_schema: schema});

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

console.log('\n=== ALL TEXT CORRECTION UNIT TESTS PASSED SUCCESSFULLY! ===');
