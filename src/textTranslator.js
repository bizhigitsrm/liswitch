// SPDX-License-Identifier: GPL-2.0-or-later
// Liswitch: XKB layout translator for text correction (F6)

import GLib from 'gi://GLib';

let Clutter = null;
try {
    Clutter = (await import('gi://Clutter')).default;
} catch {
    Clutter = null;
}

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

const FALLBACK_KZ = {
    ...FALLBACK_RU,
    TLDE: ['(', ')', 'ё', 'Ё'],
    AE01: ['"', '!'],
    AE02: ['ә', 'Ә'],
    AE03: ['і', 'І'],
    AE04: ['ң', 'Ң'],
    AE05: ['ғ', 'Ғ'],
    AE06: [',', ';'],
    AE07: ['.', ':'],
    AE08: ['ү', 'Ү'],
    AE09: ['ұ', 'Ұ'],
    AE10: ['қ', 'Қ'],
    AE11: ['ө', 'Ө'],
    AE12: ['һ', 'Һ'],
    AB10: ['№', '?'],
};

/**
 * TextTranslator
 *
 * Dynamically resolves keyboard keymaps from the system's XKB symbols directory
 * (/usr/share/X11/xkb/symbols/) and translates text typed in the wrong layout.
 * Pure ESM module with zero GNOME Shell compositor dependencies.
 */
export class TextTranslator {
    /**
     * @param {object} [options] - Optional overrides for testing
     * @param {object|null} [options.clutter] - Clutter GI module override (e.g. null to test fallback)
     * @param {string} [options.xkbDir] - Custom XKB symbols directory path
     */
    constructor(options = {}) {
        this._clutter = 'clutter' in options ? options.clutter : Clutter;
        this._xkbDir = options.xkbDir ?? '/usr/share/X11/xkb/symbols';
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

        const path = `${this._xkbDir}/${layoutName}`;
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
            let seenOpenBrace = false;

            for (const rawLine of lines) {
                const commentIdx = rawLine.indexOf('//');
                const line = commentIdx >= 0 ? rawLine.slice(0, commentIdx) : rawLine;

                if (!currentSection) {
                    const match = line.match(/xkb_symbols\s+"([^"]+)"/);
                    if (match) {
                        currentSection = match[1];
                        sectionLines = [];
                        braceDepth = 0;
                        seenOpenBrace = false;
                    }
                }

                if (currentSection) {
                    for (let i = 0; i < line.length; i++) {
                        if (line[i] === '{') {
                            braceDepth++;
                            seenOpenBrace = true;
                        } else if (line[i] === '}') {
                            braceDepth--;
                        }
                    }
                    sectionLines.push(line);
                    if (seenOpenBrace && braceDepth === 0) {
                        sections[currentSection] = sectionLines.join('\n');
                        currentSection = null;
                        sectionLines = [];
                        seenOpenBrace = false;
                    }
                }
            }
        }

        this._fileCache.set(layoutName, sections);
        return sections;
    }

    /**
     * Verify that a resolved XKB keyMap contains real (non-null) symbols.
     * Guards against Clutter === null or empty symbol tables where keys exist
     * only as [null, null] (or with only rare level-3/4 Uxxxx symbols).
     *
     * @private
     * @param {Object<string, Array<string|null>>} keyMap
     * @returns {boolean}
     */
    _hasUsableSymbols(keyMap) {
        const entries = Object.values(keyMap);
        if (entries.length === 0)
            return false;

        let primaryResolvedCount = 0;
        let anyResolved = false;

        for (const chars of entries) {
            if (!Array.isArray(chars))
                continue;
            if (chars.some(ch => ch !== null && ch !== undefined))
                anyResolved = true;
            if (chars[0] != null || chars[1] != null)
                primaryResolvedCount++;
        }

        if (!anyResolved || primaryResolvedCount === 0)
            return false;

        // Full layouts define dozens of keys; if Clutter is unavailable and only
        // 1-2 Uxxxx keys resolved at level 0/1 out of many, fall back cleanly.
        if (entries.length > 5 && primaryResolvedCount < Math.min(5, entries.length))
            return false;

        return true;
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
        let keyMap = this._resolveSectionRecursive(layoutName, variantName, visited);

        // Fallback when XKB parsing produced no usable symbols (e.g. Clutter === null)
        if (!this._hasUsableSymbols(keyMap)) {
            if (layoutName === 'ru')
                keyMap = {...FALLBACK_RU};
            else if (layoutName === 'kz')
                keyMap = {...FALLBACK_KZ};
            else
                keyMap = {...FALLBACK_US};
        }

        this._layoutCache.set(cacheKey, keyMap);
        return keyMap;
    }

    /**
     * Extract the Group1 symbol list string from inside a `key <CODE> { ... };` block.
     *
     * @private
     * @param {string} blockBody
     * @returns {string|null}
     */
    _extractGroup1RawSymbols(blockBody) {
        const group1Match = blockBody.match(/\bsymbols\s*(?:\[\s*Group1\s*\])?\s*=\s*\[([^\]]*)\]/i);
        if (group1Match)
            return group1Match[1];

        // Strip key=value properties (type[Group1]="...", actions[Group1]=[...], symbols[Group2]=[...], etc.)
        const stripped = blockBody.replace(
            /\b[a-zA-Z_][a-zA-Z0-9_]*\s*(?:\[[^\]]*\])?\s*=\s*(?:"[^"]*"|\[[^\]]*\]|[^,;\n}]+)/g,
            ''
        );
        const bareMatch = stripped.match(/\[([^\]]*)\]/);
        return bareMatch ? bareMatch[1] : null;
    }

    /**
     * Resolve a comma-separated XKB keysym list into parsed level descriptors.
     *
     * @private
     * @param {string} rawList
     * @returns {Array<{char: string|null, isNoSymbol: boolean, isVoid: boolean}>}
     */
    _resolveKeyTokens(rawList) {
        const rawSyms = rawList.split(',').map(s => s.trim().replace(/^\[|\]$/g, ''));
        return rawSyms.map(name => {
            if (!name || name === 'NoSymbol')
                return {char: null, isNoSymbol: true, isVoid: false};
            if (name === 'VoidSymbol')
                return {char: null, isNoSymbol: false, isVoid: true};

            if (name.startsWith('U') && /^[0-9A-Fa-f]{4,6}$/.test(name.slice(1))) {
                try {
                    return {
                        char: String.fromCodePoint(parseInt(name.slice(1), 16)),
                        isNoSymbol: false,
                        isVoid: false,
                    };
                } catch {
                    return {char: null, isNoSymbol: false, isVoid: false};
                }
            }

            try {
                if (this._clutter) {
                    const sym = this._clutter[`KEY_${name}`];
                    if (sym !== undefined && typeof this._clutter.keysym_to_unicode === 'function') {
                        const u = this._clutter.keysym_to_unicode(sym);
                        if (u > 0) {
                            return {
                                char: String.fromCodePoint(u),
                                isNoSymbol: false,
                                isVoid: false,
                            };
                        }
                    }
                }
            } catch {
                // Ignore unknown keysym lookup errors
            }
            return {char: null, isNoSymbol: false, isVoid: false};
        });
    }

    /**
     * Merge parsed key levels into an existing level array respecting XKB merge mode.
     *
     * @private
     * @param {Array<string|null>|undefined} existing
     * @param {Array<{char: string|null, isNoSymbol: boolean, isVoid: boolean}>} parsed
     * @param {string} mode - 'override' | 'replace' | 'augment'
     * @returns {Array<string|null>}
     */
    _mergeKeyLevels(existing, parsed, mode) {
        if (mode === 'replace' || !existing)
            return parsed.map(item => item.char);

        if (parsed.length === 0)
            return existing.slice();

        const len = Math.max(existing.length, parsed.length);
        const merged = [];

        for (let i = 0; i < len; i++) {
            const prev = i < existing.length ? existing[i] : null;
            const next = i < parsed.length ? parsed[i] : null;

            if (!next) {
                merged.push(prev);
            } else if (mode === 'augment') {
                merged.push(prev !== null ? prev : next.char);
            } else if (next.isVoid) {
                merged.push(null);
            } else if (next.isNoSymbol) {
                merged.push(prev);
            } else {
                merged.push(next.char);
            }
        }

        return merged;
    }

    /**
     * Merge an included keyMap into target keyMap respecting the include directive.
     *
     * @private
     * @param {Object<string, Array<string|null>>} keyMap
     * @param {Object<string, Array<string|null>>} incMap
     * @param {string} directive - 'include' | 'override' | 'augment' | 'replace'
     */
    _mergeIncludedKeyMap(keyMap, incMap, directive) {
        const mode = directive === 'include' ? 'override' : directive;
        for (const [code, incChars] of Object.entries(incMap)) {
            const parsed = incChars.map(ch => ({
                char: ch,
                isNoSymbol: ch === null,
                isVoid: false,
            }));
            keyMap[code] = this._mergeKeyLevels(keyMap[code], parsed, mode);
        }
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

        const keyMap = {};
        try {
            const sections = this._parseXkbFile(layoutName);
            let body = sections[variantName];
            if (!body) {
                // Fallback to first available section or default
                const firstKey = Object.keys(sections)[0];
                body = sections[firstKey] || '';
            }

            // Strip C-style block comments if present
            const cleanBody = body.replace(/\/\*[\s\S]*?\*\//g, '');

            // Process includes and single/multiline key definitions in XKB order
            const stmtRegex = /\b(?:(include|override|augment|replace)\s+"([^"]+)"|(?:(override|replace|augment)\s+)?key\s+<([A-Za-z0-9_]+)>\s*\{([^}]*)\}\s*;?)/g;
            let m;
            while ((m = stmtRegex.exec(cleanBody)) !== null) {
                if (m[1]) {
                    const directive = m[1];
                    const target = m[2];
                    let incFile = target;
                    let incSec = '';
                    if (target.includes('(')) {
                        const p = target.split('(');
                        incFile = p[0];
                        incSec = p[1].replace(')', '');
                    }
                    const incMap = this._resolveSectionRecursive(incFile, incSec, visited);
                    this._mergeIncludedKeyMap(keyMap, incMap, directive);
                } else {
                    const mode = m[3] || 'override';
                    const code = m[4];
                    const blockBody = m[5];
                    const rawList = this._extractGroup1RawSymbols(blockBody);
                    if (rawList === null)
                        continue;

                    const parsed = this._resolveKeyTokens(rawList);
                    keyMap[code] = this._mergeKeyLevels(keyMap[code], parsed, mode);
                }
            }
        } finally {
            visited.delete(visitKey);
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
