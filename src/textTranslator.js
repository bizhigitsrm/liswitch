// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: XKB layout translator for text correction (F6)

import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=4.0';

/**
 * Standard QWERTY / JCUKEN fallback maps for environments
 * where /usr/share/X11/xkb/symbols is inaccessible (e.g. mock test harnesses).
 */
const FALLBACK_US = {
    TLDE: ['`', '~'], AE01: ['1', '!'], AE02: ['2', '@'], AE03: ['3', '#'], AE04: ['4', '$'],
    AE05: ['5', '%'], AE06: ['6', '^'], AE07: ['7', '&'], AE08: ['8', '*'], AE09: ['9', '('],
    AE10: ['0', ')'], AE11: ['-', '_'], AE12: ['=', '+'],
    AD01: ['q', 'Q'], AD02: ['w', 'W'], AD03: ['e', 'E'], AD04: ['r', 'R'], AD05: ['t', 'T'],
    AD06: ['y', 'Y'], AD07: ['u', 'U'], AD08: ['i', 'I'], AD09: ['o', 'O'], AD10: ['p', 'P'],
    AD11: ['[', '{'], AD12: [']', '}'], BKSL: ['\\', '|'],
    AC01: ['a', 'A'], AC02: ['s', 'S'], AC03: ['d', 'D'], AC04: ['f', 'F'], AC05: ['g', 'G'],
    AC06: ['h', 'H'], AC07: ['j', 'J'], AC08: ['k', 'K'], AC09: ['l', 'L'], AC10: [';', ':'],
    AC11: ["'", '"'],
    AB01: ['z', 'Z'], AB02: ['x', 'X'], AB03: ['c', 'C'], AB04: ['v', 'V'], AB05: ['b', 'B'],
    AB06: ['n', 'N'], AB07: ['m', 'M'], AB08: [',', '<'], AB09: ['.', '>'], AB10: ['/', '?'],
    SPCE: [' ', ' '],
};

const FALLBACK_RU = {
    TLDE: ['ё', 'Ё'], AE01: ['1', '!'], AE02: ['2', '"'], AE03: ['3', '№'], AE04: ['4', ';'],
    AE05: ['5', '%'], AE06: ['6', ':'], AE07: ['7', '?'], AE08: ['8', '*'], AE09: ['9', '('],
    AE10: ['0', ')'], AE11: ['-', '_'], AE12: ['=', '+'],
    AD01: ['й', 'Й'], AD02: ['ц', 'Ц'], AD03: ['у', 'У'], AD04: ['к', 'К'], AD05: ['е', 'Е'],
    AD06: ['н', 'Н'], AD07: ['г', 'Г'], AD08: ['ш', 'Ш'], AD09: ['щ', 'Щ'], AD10: ['з', 'З'],
    AD11: ['х', 'Х'], AD12: ['ъ', 'Ъ'], BKSL: ['\\', '/'],
    AC01: ['ф', 'Ф'], AC02: ['ы', 'Ы'], AC03: ['в', 'В'], AC04: ['а', 'А'], AC05: ['п', 'П'],
    AC06: ['р', 'Р'], AC07: ['о', 'О'], AC08: ['л', 'Л'], AC09: ['д', 'Д'], AC10: ['ж', 'Ж'],
    AC11: ['э', 'Э'],
    AB01: ['я', 'Я'], AB02: ['ч', 'Ч'], AB03: ['с', 'С'], AB04: ['м', 'М'], AB05: ['и', 'И'],
    AB06: ['т', 'Т'], AB07: ['ь', 'Ь'], AB08: ['б', 'Б'], AB09: ['ю', 'Ю'], AB10: ['.', ','],
    SPCE: [' ', ' '],
};

/**
 * TextTranslator
 *
 * Dynamically resolves keyboard keymaps from the system's XKB symbols directory
 * (/usr/share/X11/xkb/symbols/) and translates text typed in the wrong layout.
 * Pure ESM module with zero GNOME Shell compositor dependencies.
 */
export class TextTranslator {
    constructor() {
        this._fileCache = new Map();
        this._layoutCache = new Map();
        this._reverseCache = new Map();
    }

    /**
     * Parse an XKB symbols file into named section blocks.
     *
     * @private
     * @param {string} layoutName - XKB layout name (e.g. 'us', 'ru', 'kz')
     * @returns {Object<string, string>} Map of section names to body contents
     */
    _parseXkbFile(layoutName) {
        if (this._fileCache.has(layoutName))
            return this._fileCache.get(layoutName);

        const path = `/usr/share/X11/xkb/symbols/${layoutName}`;
        let content = '';

        try {
            const [ok, bytes] = GLib.file_get_contents(path);
            if (ok && bytes)
                content = new TextDecoder().decode(bytes);
        } catch {
            // File inaccessible, will rely on built-in fallbacks
        }

        const sections = {};
        if (content) {
            const lines = content.split('\n');
            let currentSection = null;
            let sectionLines = [];
            let braceDepth = 0;

            for (const rawLine of lines) {
                const commentIdx = rawLine.indexOf('//');
                const line = commentIdx >= 0 ? rawLine.slice(0, commentIdx) : rawLine;

                if (!currentSection) {
                    const match = line.match(/xkb_symbols\s+"([^"]+)"/);
                    if (match) {
                        currentSection = match[1];
                        sectionLines = [];
                        braceDepth = 0;
                    }
                }

                if (currentSection) {
                    for (let i = 0; i < line.length; i++) {
                        if (line[i] === '{')
                            braceDepth++;
                        else if (line[i] === '}')
                            braceDepth--;
                    }
                    sectionLines.push(line);
                    if (braceDepth === 0 && sectionLines.length > 1) {
                        sections[currentSection] = sectionLines.join('\n');
                        currentSection = null;
                        sectionLines = [];
                    }
                }
            }
        }

        this._fileCache.set(layoutName, sections);
        return sections;
    }

    /**
     * Recursively resolve an XKB layout and its includes into a keycode-to-characters map.
     *
     * @param {string} layoutId - Layout identifier, e.g. 'us', 'ru', 'kz', 'ru+winkeys'
     * @returns {Object<string, Array<string|null>>} Map of XKB key codes to character levels
     */
    resolveLayout(layoutId) {
        if (!layoutId)
            return FALLBACK_US;

        // Clean layout ID: extract layout and variant (e.g. 'ru+winkeys' -> layout='ru', variant='winkeys')
        let layoutName = layoutId;
        let variantName = '';

        if (layoutId.includes('+')) {
            const parts = layoutId.split('+');
            layoutName = parts[0];
            variantName = parts[1] || '';
        }

        const cacheKey = `${layoutName}:${variantName}`;
        if (this._layoutCache.has(cacheKey))
            return this._layoutCache.get(cacheKey);

        const visited = new Set();
        const keyMap = this._resolveSectionRecursive(layoutName, variantName, visited);

        // Fallback for missing keys or empty results
        if (Object.keys(keyMap).length === 0) {
            if (layoutName === 'ru')
                Object.assign(keyMap, FALLBACK_RU);
            else
                Object.assign(keyMap, FALLBACK_US);
        }

        this._layoutCache.set(cacheKey, keyMap);
        return keyMap;
    }

    /**
     * Recursive helper resolving a section and its includes.
     *
     * @private
     */
    _resolveSectionRecursive(layoutName, variantName, visited) {
        const visitKey = `${layoutName}:${variantName}`;
        if (visited.has(visitKey))
            return {};
        visited.add(visitKey);

        const sections = this._parseXkbFile(layoutName);
        let body = sections[variantName];
        if (!body) {
            // Fallback to first available section or default
            const firstKey = Object.keys(sections)[0];
            body = sections[firstKey] || '';
        }

        const keyMap = {};

        // 1. Process includes
        const incRegex = /include\s+"([^"]+)"/g;
        let im;
        while ((im = incRegex.exec(body)) !== null) {
            const target = im[1];
            let incFile = target;
            let incSec = '';
            if (target.includes('(')) {
                const p = target.split('(');
                incFile = p[0];
                incSec = p[1].replace(')', '');
            }
            const incMap = this._resolveSectionRecursive(incFile, incSec, visited);
            Object.assign(keyMap, incMap);
        }

        // 2. Process key definitions: key <XXXX> {[ sym1, sym2 ... ]};
        const keyRegex = /key\s+<([A-Z0-9]+)>\s*\{\s*(?:\[|type[^=]*=\s*[^,]+,\s*symbols[^=]*=\s*\[)\s*([^\]]+)\]/g;
        let km;
        while ((km = keyRegex.exec(body)) !== null) {
            const code = km[1];
            const rawSyms = km[2].split(',').map(s => s.trim().replace(/^\[|\]$/g, ''));
            const chars = rawSyms.map(name => {
                if (!name || name === 'NoSymbol')
                    return null;
                if (name.startsWith('U') && /^[0-9A-Fa-f]{4,6}$/.test(name.slice(1))) {
                    try {
                        return String.fromCodePoint(parseInt(name.slice(1), 16));
                    } catch {
                        return null;
                    }
                }
                try {
                    const kval = Gdk.keyval_from_name(name);
                    if (kval === 0)
                        return null;
                    const u = Gdk.keyval_to_unicode(kval);
                    return u > 0 ? String.fromCodePoint(u) : null;
                } catch {
                    return null;
                }
            });
            keyMap[code] = chars;
        }

        return keyMap;
    }

    /**
     * Build reverse mapping from character to XKB keycode and shift level.
     *
     * @private
     * @param {string} layoutId
     * @returns {Map<string, {code: string, level: number}>}
     */
    _getReverseMap(layoutId) {
        if (this._reverseCache.has(layoutId))
            return this._reverseCache.get(layoutId);

        const keyMap = this.resolveLayout(layoutId);
        const reverse = new Map();

        for (const [code, chars] of Object.entries(keyMap)) {
            chars.forEach((ch, level) => {
                if (ch && !reverse.has(ch))
                    reverse.set(ch, {code, level});
            });
        }

        this._reverseCache.set(layoutId, reverse);
        return reverse;
    }

    /**
     * Convert text typed in fromLayoutId into corresponding characters in toLayoutId.
     *
     * @param {string} text - Input text (e.g. 'ghbdtn')
     * @param {string} fromLayoutId - Source layout ID (e.g. 'us')
     * @param {string} toLayoutId - Target layout ID (e.g. 'ru')
     * @returns {string} Converted text (e.g. 'привет')
     */
    convert(text, fromLayoutId, toLayoutId) {
        if (!text || fromLayoutId === toLayoutId)
            return text;

        const fromReverse = this._getReverseMap(fromLayoutId);
        const toKeyMap = this.resolveLayout(toLayoutId);

        let result = '';
        for (const ch of text) {
            const keyInfo = fromReverse.get(ch);
            if (keyInfo && toKeyMap[keyInfo.code]) {
                const targetChar = toKeyMap[keyInfo.code][keyInfo.level];
                if (targetChar) {
                    result += targetChar;
                    continue;
                }
            }
            result += ch;
        }

        return result;
    }

    /**
     * Guess whether text belongs more closely to layout A or layout B.
     *
     * @param {string} text
     * @param {string} layoutA
     * @param {string} layoutB
     * @returns {string} The layout ID matching more characters in text
     */
    guessSourceLayout(text, layoutA, layoutB) {
        const revA = this._getReverseMap(layoutA);
        const revB = this._getReverseMap(layoutB);

        let scoreA = 0;
        let scoreB = 0;

        for (const ch of text) {
            if (revA.has(ch))
                scoreA++;
            if (revB.has(ch))
                scoreB++;
        }

        return scoreA >= scoreB ? layoutA : layoutB;
    }

    /**
     * Clear all cached keymaps.
     */
    clearCache() {
        this._fileCache.clear();
        this._layoutCache.clear();
        this._reverseCache.clear();
    }
}
