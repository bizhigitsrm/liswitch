// SPDX-License-Identifier: GPL-2.0-or-later
// Pure GJS unit test for InputSourceService (no Shell required)
// Run with: gjs -m tests/test-input-source-service.js

import system from 'system';
import {InputSourceService} from '../src/inputSourceService.js';
import * as Log from '../src/log.js';

class MockInputSource {
    constructor(manager, type, id, displayName, shortName, index) {
        this._manager = manager;
        this.type = type;
        this.id = id;
        this.displayName = displayName;
        this.shortName = shortName;
        this.index = index;
    }

    activate(interactive = true) {
        this._manager.activateInputSource(this, interactive);
    }
}

class MockInputSourceManager {
    constructor() {
        this._listeners = new Map();
        this._nextListenerId = 1;

        this._inputSources = {};
        this._currentSource = null;

        this._initDefaultSources();
    }

    _initDefaultSources() {
        const specs = [
            {type: 'xkb', id: 'us', displayName: 'English (US)', shortName: 'en', index: 0},
            {type: 'xkb', id: 'ru', displayName: 'Russian', shortName: 'ru', index: 1},
            {type: 'xkb', id: 'kz', displayName: 'Kazakh', shortName: 'kk', index: 2},
        ];

        this._inputSources = {};
        for (const s of specs) {
            this._inputSources[s.index] = new MockInputSource(
                this, s.type, s.id, s.displayName, s.shortName, s.index
            );
        }
        this._currentSource = this._inputSources[0];
    }

    get inputSources() {
        return this._inputSources;
    }

    get currentSource() {
        return this._currentSource;
    }

    activateInputSource(source, interactive = true) {
        const oldSource = this._currentSource;
        this._currentSource = source;
        this.emit('current-source-changed', oldSource);
    }

    setSources(sourcesList) {
        this._inputSources = {};
        for (let i = 0; i < sourcesList.length; i++) {
            const s = sourcesList[i];
            this._inputSources[s.index] = new MockInputSource(
                this, s.type, s.id, s.displayName, s.shortName, s.index
            );
        }
        if (sourcesList.length === 0)
            this._currentSource = null;
        else if (!this._currentSource || !this._inputSources[this._currentSource.index])
            this._currentSource = this._inputSources[sourcesList[0].index];

        this.emit('sources-changed');
    }

    connect(signal, callback) {
        const id = this._nextListenerId++;
        if (!this._listeners.has(signal))
            this._listeners.set(signal, new Map());
        this._listeners.get(signal).set(id, callback);
        return id;
    }

    disconnect(id) {
        for (const map of this._listeners.values()) {
            if (map.delete(id))
                return;
        }
    }

    emit(signal, ...args) {
        const map = this._listeners.get(signal);
        if (!map)
            return;
        for (const callback of map.values())
            callback(this, ...args);
    }

    getListenerCount(signal) {
        return this._listeners.get(signal)?.size ?? 0;
    }
}

// Test runner assertion helper
function assert(condition, message) {
    if (!condition)
        throw new Error(`Assertion failed: ${message}`);
}

function assertEquals(actual, expected, message) {
    if (actual !== expected)
        throw new Error(`Assertion failed: ${message} (expected: ${expected}, got: ${actual})`);
}

function assertDeepEquals(actual, expected, message) {
    const actStr = JSON.stringify(actual);
    const expStr = JSON.stringify(expected);
    if (actStr !== expStr)
        throw new Error(`Assertion failed: ${message}\nExpected: ${expStr}\nGot:      ${actStr}`);
}

async function runTests() {
    console.log('=== Liswitch: InputSourceService Unit Tests ===\n');

    const mockManager = new MockInputSourceManager();
    const service = new InputSourceService(null);

    // -------------------------------------------------------------------------
    console.log('Test 1: Initialization & enable() with mock manager...');
    service.enable({manager: mockManager});

    assert(service.isAvailable, 'Service should be available');
    assertEquals(service.state, 'available', 'Service state should be "available"');
    assertEquals(service.getCurrentIndex(), 0, 'Current index should be 0');

    const sources = service.getSources();
    assertEquals(sources.length, 3, 'Should have 3 configured sources');
    assertDeepEquals(sources, [
        {index: 0, id: 'us', shortName: 'en', displayName: 'English (US)'},
        {index: 1, id: 'ru', shortName: 'ru', displayName: 'Russian'},
        {index: 2, id: 'kz', shortName: 'kk', displayName: 'Kazakh'},
    ], 'Source items must match expected structure');
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    console.log('Test 2: activate(index) with valid index...');
    let lastCurrentChangedIndex = null;
    const currentChangedId = service.connect('current-changed', (_emitter, idx) => {
        lastCurrentChangedIndex = idx;
    });

    const activated1 = service.activate(1);
    assert(activated1, 'activate(1) should return true');
    assertEquals(service.getCurrentIndex(), 1, 'Current index should be 1');
    assertEquals(lastCurrentChangedIndex, 1, 'current-changed signal should receive index 1');

    const activated2 = service.activate(2);
    assert(activated2, 'activate(2) should return true');
    assertEquals(service.getCurrentIndex(), 2, 'Current index should be 2');
    assertEquals(lastCurrentChangedIndex, 2, 'current-changed signal should receive index 2');
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    console.log('Test 3: next() and previous() cyclic layout switching...');
    // Currently at index 2 (last) -> next() should wrap to index 0
    service.next();
    assertEquals(service.getCurrentIndex(), 0, 'next() from index 2 should wrap to index 0');
    assertEquals(lastCurrentChangedIndex, 0, 'current-changed signal should receive 0');

    // At index 0 -> next() should go to index 1
    service.next();
    assertEquals(service.getCurrentIndex(), 1, 'next() from index 0 should go to index 1');

    // At index 1 -> previous() should go to index 0
    service.previous();
    assertEquals(service.getCurrentIndex(), 0, 'previous() from index 1 should go to index 0');

    // At index 0 -> previous() should wrap to index 2
    service.previous();
    assertEquals(service.getCurrentIndex(), 2, 'previous() from index 0 should wrap to index 2');
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    console.log('Test 4: activate(index) with invalid indices (safe no-op and debug logging)...');
    Log.setDebugOverride(true);

    const negResult = service.activate(-1);
    assert(!negResult, 'activate(-1) should return false');
    assertEquals(service.getCurrentIndex(), 2, 'Current index must not change on invalid index');

    const outOfBounds = service.activate(99);
    assert(!outOfBounds, 'activate(99) should return false');
    assertEquals(service.getCurrentIndex(), 2, 'Current index must not change on out-of-bounds index');

    const notNumber = service.activate('invalid');
    assert(!notNumber, 'activate("invalid") should return false');
    assertEquals(service.getCurrentIndex(), 2, 'Current index must not change on non-number');

    Log.setDebugOverride(null);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    console.log('Test 5: Dynamic sources-changed signal and empty sources handling...');
    let sourcesChangedCount = 0;
    const sourcesChangedId = service.connect('sources-changed', () => {
        sourcesChangedCount++;
    });

    // Add 4th source
    mockManager.setSources([
        {type: 'xkb', id: 'us', displayName: 'English (US)', shortName: 'en', index: 0},
        {type: 'xkb', id: 'ru', displayName: 'Russian', shortName: 'ru', index: 1},
        {type: 'xkb', id: 'kz', displayName: 'Kazakh', shortName: 'kk', index: 2},
        {type: 'xkb', id: 'de', displayName: 'German', shortName: 'de', index: 3},
    ]);

    assertEquals(sourcesChangedCount, 1, 'sources-changed handler should have been called once');
    assertEquals(service.getSources().length, 4, 'Service sources count should be 4');

    // Set sources to empty (0 sources)
    mockManager.setSources([]);
    assertEquals(sourcesChangedCount, 2, 'sources-changed handler should have been called twice');
    assert(!service.isAvailable, 'Service should become unavailable when sources list is empty');
    assertEquals(service.state, 'unavailable', 'Service state should be "unavailable"');
    assertEquals(service.getSources().length, 0, 'getSources() should return []');
    assertEquals(service.getCurrentIndex(), -1, 'getCurrentIndex() should return -1 when empty');

    // Commands in unavailable state must be safe no-ops
    assert(!service.activate(0), 'activate(0) while unavailable should return false');
    assert(!service.next(), 'next() while unavailable should return false');
    assert(!service.previous(), 'previous() while unavailable should return false');

    // Restore sources
    mockManager.setSources([
        {type: 'xkb', id: 'us', displayName: 'English (US)', shortName: 'en', index: 0},
        {type: 'xkb', id: 'ru', displayName: 'Russian', shortName: 'ru', index: 1},
    ]);
    assert(service.isAvailable, 'Service should become available again');
    assertEquals(service.getSources().length, 2, 'Service sources count should be 2');

    service.disconnect(sourcesChangedId);
    service.disconnect(currentChangedId);
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    console.log('Test 6: 20 cycles of enable/destroy (disable) to verify leak-free signal cleanup...');
    for (let cycle = 1; cycle <= 20; cycle++) {
        service.destroy();
        assertEquals(mockManager.getListenerCount('sources-changed'), 0,
            `Cycle ${cycle}: sources-changed listeners must be 0 after destroy()`);
        assertEquals(mockManager.getListenerCount('current-source-changed'), 0,
            `Cycle ${cycle}: current-source-changed listeners must be 0 after destroy()`);
        assert(!service.isAvailable, `Cycle ${cycle}: service must be unavailable after destroy()`);

        service.enable({manager: mockManager});
        assertEquals(mockManager.getListenerCount('sources-changed'), 1,
            `Cycle ${cycle}: sources-changed listeners must be exactly 1 after enable()`);
        assertEquals(mockManager.getListenerCount('current-source-changed'), 1,
            `Cycle ${cycle}: current-source-changed listeners must be exactly 1 after enable()`);
        assert(service.isAvailable, `Cycle ${cycle}: service must be available after enable()`);
    }

    // Verify functionality after 20 cycles:
    let postCyclesSignalFired = 0;
    const postCycleId = service.connect('current-changed', () => {
        postCyclesSignalFired++;
    });

    service.activate(1);
    assertEquals(postCyclesSignalFired, 1, 'current-changed should fire exactly once after 20 cycles');
    service.disconnect(postCycleId);
    service.destroy();

    assertEquals(mockManager.getListenerCount('sources-changed'), 0,
        'Final destroy: sources-changed listeners must be 0');
    assertEquals(mockManager.getListenerCount('current-source-changed'), 0,
        'Final destroy: current-source-changed listeners must be 0');
    console.log('  -> PASS (20 cycles cleanly executed, no listener leaks or duplication)');

    // -------------------------------------------------------------------------
    console.log('Test 7: FallbackBackend (null manager, GSettings fallback)...');
    const fallbackService = new InputSourceService(null);
    fallbackService.enable({manager: null});

    // In this environment, org.gnome.desktop.input-sources is available
    if (fallbackService.isAvailable) {
        console.log(`  Fallback detected ${fallbackService.getSources().length} sources from GSettings`);
        const initialIdx = fallbackService.getCurrentIndex();
        assert(initialIdx >= 0, 'Fallback currentIndex should be >= 0');
        const fbSources = fallbackService.getSources();
        assert(fbSources.length > 0, 'Fallback should have at least 1 source');
    } else {
        console.log('  Fallback correctly set isAvailable=false when GSettings sources are empty or unavailable');
        assertEquals(fallbackService.getCurrentIndex(), -1, 'Unavailable fallback returns -1');
        assertEquals(fallbackService.getSources().length, 0, 'Unavailable fallback returns []');
    }
    fallbackService.destroy();
    assert(!fallbackService.isAvailable, 'Fallback service unavailable after destroy()');
    console.log('  -> PASS');

    // -------------------------------------------------------------------------
    console.log('\n=== ALL UNIT TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
    console.error('\n[FATAL ERROR IN TESTS]:', err);
    system.exit(1);
});
