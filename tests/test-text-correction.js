// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: TextCorrection and TextTranslator Unit Tests (pure GJS)

import {TextTranslator} from '../src/textTranslator.js';
import {TextCorrectionManager} from '../src/textCorrection.js';
import {
    assert,
    assertEqual,
    createMemorySettings,
    MockInputSourceService,
} from './helpers.js';

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

console.log('\n=== ALL TEXT CORRECTION UNIT TESTS PASSED SUCCESSFULLY! ===');
