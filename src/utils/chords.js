import { supabase } from '../supabaseClient';
import guitarDb from '@tombatossals/chords-db/lib/guitar.json';

// In-memory cache for fetched chords
const chordCache = {};

// Manual overrides for specific local needs if necessary
export const CHORD_DATA = {
    // ... we can migrate the old manuals here if they are better than the DB
};

/*
    Key Map matching chords-db library structure:
    Sharps are written as 'Xsharp'.
    Flats are written as 'Xb' (except Eb which is Eb? Wait, JSON key is 'Eb').
    Let's stick to the Keys array from the library:
    ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"]
    
    BUT the object keys in `chords` are:
    C, Csharp, D, Eb, E, F, Fsharp, G, Ab, A, Bb, B.
*/
const KEY_MAP = {
    'C': 'C',
    'C#': 'Csharp', 'Db': 'Csharp',
    'D': 'D',
    'D#': 'Eb', 'Eb': 'Eb',
    'E': 'E',
    'F': 'F',
    'F#': 'Fsharp', 'Gb': 'Fsharp',
    'G': 'G',
    'G#': 'Ab', 'Ab': 'Ab',
    'A': 'A',
    'A#': 'Bb', 'Bb': 'Bb',
    'B': 'B'
};

const SUFFIX_MAP = {
    '': 'major',
    'm': 'minor',
    'min': 'minor',
    '-': 'minor',
    'M': 'major',
    'maj': 'major',
    '7': '7',
    'm7': 'm7',
    'min7': 'm7',
    '-7': 'm7',
    'maj7': 'maj7',
    'M7': 'maj7',
    '7+': 'maj7',
    '7M': 'maj7',
    '+': 'aug',
    'aug': 'aug',
    'dim': 'dim',
    '°': 'dim',
    'sus': 'sus4',
    'sus4': 'sus4',
    'sus2': 'sus2',
    'add9': 'add9',
    '9': '9',
    '6': '6',
    'm6': 'm6',
    '6/9': '69',
    '69': '69',
    // PT-BR common aliases
    '7/4': '7sus4',
    '7(4)': '7sus4',
    '/4': 'sus4',
    '(4)': 'sus4',
    '/9': 'add9',
    '(9)': 'add9',
    'm7/9': 'm9',
    'm7(9)': 'm9',
    '7/9': '9',
    '7(9)': '9'
};

function normalizeRoot(root) {
    return KEY_MAP[root];
}

function normalizeSuffix(suffix) {
    // 1. Check exact match in map
    if (SUFFIX_MAP[suffix]) return SUFFIX_MAP[suffix];

    // 2. Handle compound PT-BR extensions like /4/7 or /9/4
    // Extract everything after the first slash that isn't a bass note
    let baseSuffix = suffix;
    let extensions = [];

    if (suffix.includes('/')) {
        const parts = suffix.split('/');
        baseSuffix = parts[0];
        for (let i = 1; i < parts.length; i++) {
            if (/^[A-G]/.test(parts[i])) {
                // If there's a real bass note, keep it at the end
                extensions.push('/' + parts[i]);
            } else {
                // It's a numeric extension
                extensions.push(parts[i]);
            }
        }
    }

    // Reconstruct a standard suffix if we found numeric extensions
    if (extensions.length > 0 && !extensions[0].startsWith('/')) {
        // e.g. base=9, extensions=[4, 7] -> 9sus4, etc.
        // We'll join them to form something like "9sus4" or "7sus4"
        const nums = [baseSuffix.match(/\d+/)?.[0], ...extensions.filter(e => !e.startsWith('/'))].filter(Boolean);

        let newSuffix = baseSuffix.replace(/\d+/, ''); // remove numbers from base
        if (newSuffix === 'm') newSuffix = 'm'; // keep minor
        else if (newSuffix === 'M' || newSuffix === 'maj') newSuffix = 'maj';
        else newSuffix = '';

        if (nums.includes('7') || nums.includes('9') || nums.includes('11') || nums.includes('13')) {
            if (nums.includes('13')) newSuffix += '13';
            else if (nums.includes('11')) newSuffix += '11';
            else if (nums.includes('9')) newSuffix += '9';
            else newSuffix += '7';
        }

        if (nums.includes('4')) newSuffix += 'sus4';
        if (nums.includes('2')) newSuffix += 'sus2';
        if (nums.includes('6')) newSuffix += '6';

        // Add back bass note if it existed
        const bass = extensions.find(e => e.startsWith('/'));
        if (bass) newSuffix += bass;

        // Clean up common issues
        if (newSuffix.startsWith("maj7") && baseSuffix.includes("m")) newSuffix = newSuffix.replace("maj7", "m(maj7)");

        // Try mapping the newly constructed suffix
        if (SUFFIX_MAP[newSuffix]) return SUFFIX_MAP[newSuffix];
        return newSuffix;
    }

    // 3. Try replacing common simple PT-BR patterns dynamically if not exact match
    let normalized = suffix
        .replace(/\/4/g, 'sus4')
        .replace(/\(4\)/g, 'sus4')
        .replace(/\/9/g, 'add9')
        .replace(/\(9\)/g, 'add9')
        .replace(/\+/g, 'aug')
        .replace(/°/g, 'dim');

    return SUFFIX_MAP[normalized] || normalized;
}

/**
 * Async fetch chord from Supabase DB (or cache/manual overrides)
 */
export async function fetchChordData(chordName) {
    if (!chordName) return null;

    // 1. Check local cache
    if (chordCache[chordName]) return chordCache[chordName];

    // 2. Check manual overrides (sync)
    if (CHORD_DATA[chordName]) {
        chordCache[chordName] = CHORD_DATA[chordName];
        return CHORD_DATA[chordName];
    }

    // 3. Parse Root/Suffix
    const match = chordName.match(/^([A-G][#b]?)(.*)$/);
    if (!match) return null;

    const rawRoot = match[1];
    const rawSuffix = match[2];

    const dbKey = normalizeRoot(rawRoot);
    if (!dbKey) return null;

    // 4. Try Database Query
    // We try specific suffix first, then normalize.
    let positions = null;

    const tryDbLookup = async (key, suffix) => {
        const { data, error } = await supabase
            .from('chords')
            .select('*')
            .eq('key', key)
            .eq('suffix', suffix)
            .maybeSingle();

        if (error) console.error("Error fetching chord:", error);
        return data;
    };

    // Strategy A: Slash Chords? 
    // Wait, DB stores by Key + Suffix. 
    // Suffix in DB includes the slash part if we normalized it that way? 
    // The library uses "suffix": "m/F#" for example.

    // Let's normalize suffix for lookup
    let lookupSuffix = normalizeSuffix(rawSuffix);

    // Basic normalized lookup
    let dbChord = await tryDbLookup(dbKey, lookupSuffix);

    // If not found, try raw suffix?
    if (!dbChord && rawSuffix !== lookupSuffix) {
        dbChord = await tryDbLookup(dbKey, rawSuffix);
    }

    // Slash Chord specific handling (if not found yet)
    // E.g. D/F# -> root=D, suffix=/F# -> normalizeSuffix("/F#") might be "/F#"
    // If DB has "major/F#" we might miss it if we query "/F#".
    // Wait, the library suffixes are like "major", "minor", "7", etc. 
    // AND "major/E", "minor/G"...
    // My previous logic handled slash chords by checking if suffix contained slash.

    if (!dbChord) {
        // Try constructing slash suffix logic again
        const slashMatch = rawSuffix.match(/^(.*?)\/([A-G][#b]?)$/);
        if (slashMatch) {
            const qual = slashMatch[1];
            const bass = slashMatch[2];

            let slashQual = null;
            if (['m', 'min', 'minor', '-'].includes(qual)) slashQual = 'm';
            else if (['', 'maj', 'M'].includes(qual)) slashQual = 'major'; // DB uses 'major' usually? check json.
            // library uses "suffix": "major" for plain major.
            // slash chords in library: "C/E" -> suffix "major/E"? No, usually just "/E" for major?
            // Actually library keys are separate.
            // Let's rely on what we inserted.
            // If I inserted from library, I inserted whatever suffix was there.
            // My previous code:
            /*
            if (['m', 'min', 'minor', '-'].includes(qual)) slashQual = 'm';
            else if (['', 'maj', 'M'].includes(qual)) slashQual = '';
             const searchSuffix = slashQual ? `${slashQual}/${bass}` : `/${bass}`;
            */
            // Let's try explicit variations:
            if (slashQual === 'major') {
                // Try "major/X" or "/X"
                dbChord = await tryDbLookup(dbKey, `major/${bass}`);
                if (!dbChord) dbChord = await tryDbLookup(dbKey, `/${bass}`);
            } else if (slashQual === 'm') {
                dbChord = await tryDbLookup(dbKey, `minor/${bass}`);
                if (!dbChord) dbChord = await tryDbLookup(dbKey, `m/${bass}`);
            }
        }
    }

    // Fallback to local guitarDb if DB fails (Safety net)
    if (!dbChord && guitarDb.chords[dbKey]) {
        // Use the syncing logic's find
        const entry = guitarDb.chords[dbKey].find(c => c.suffix === lookupSuffix);
        if (entry) {
            const result = {
                name: chordName,
                positions: entry.positions.map(pos => ({
                    frets: pos.frets,
                    barres: pos.barres,
                    capo: pos.capo,
                    baseFret: pos.baseFret || 1,
                    fingers: pos.fingers
                }))
            };
            chordCache[chordName] = result;
            return result;
        }
    }


    if (dbChord) {
        const result = {
            name: chordName,
            positions: dbChord.positions // JSONB handles structure
        };
        chordCache[chordName] = result;
        return result;
    }

    // Fallback 1: Slash chords (e.g. Ab/C -> Ab)
    if (chordName.includes('/')) {
        const slashIndex = chordName.indexOf('/');
        const baseChordName = chordName.slice(0, slashIndex);
        if (baseChordName && baseChordName !== chordName) {
            const baseData = await fetchChordData(baseChordName);
            if (baseData) {
                const result = {
                    ...baseData,
                    name: chordName
                };
                chordCache[chordName] = result;
                return result;
            }
        }
    }

    // Fallback 2: Complex extensions to basic root chord (e.g. Ab9 -> Ab, Abm7 -> Abm)
    if (rawSuffix && rawSuffix !== 'm' && rawSuffix !== 'minor' && rawSuffix !== 'major') {
        const baseType = (rawSuffix.startsWith('m') && !rawSuffix.startsWith('maj')) ? 'm' : '';
        const rootChordName = rawRoot + baseType;
        if (rootChordName !== chordName) {
            const rootData = await fetchChordData(rootChordName);
            if (rootData) {
                const result = {
                    ...rootData,
                    name: chordName
                };
                chordCache[chordName] = result;
                return result;
            }
        }
    }

    return null;
}

/**
 * Synchronous (Legacy) getChordData
 * Uses local cache or local DB. Returns null if async fetch is needed and not cached.
 * Used for initial renders or if we want to stick to sync where possible.
 */
export function getChordData(chordName) {
    if (!chordName) return null;
    if (chordCache[chordName]) return chordCache[chordName];

    const match = chordName.match(/^([A-G][#b]?)(.*)$/);
    if (!match) return null;

    const rawRoot = match[1];
    const rawSuffix = match[2];
    const dbKey = normalizeRoot(rawRoot);

    if (guitarDb.chords[dbKey]) {
        // Quick attempt
        let lookupSuffix = normalizeSuffix(rawSuffix);
        let entry = guitarDb.chords[dbKey].find(c => c.suffix === lookupSuffix);

        if (!entry) {
            // Slash check
            const slashMatch = rawSuffix.match(/^(.*?)\/([A-G][#b]?)$/);
            if (slashMatch) {
                const bass = slashMatch[2];
                entry = guitarDb.chords[dbKey].find(c => c.suffix === `/${bass}` || c.suffix === `major/${bass}` || c.suffix === `minor/${bass}` || c.suffix === `m/${bass}`);
            }
        }

        if (entry) {
            const result = {
                name: chordName,
                positions: entry.positions.map(pos => ({
                    frets: pos.frets,
                    barres: pos.barres,
                    capo: pos.capo,
                    baseFret: pos.baseFret || 1,
                    fingers: pos.fingers
                }))
            };
            chordCache[chordName] = result;
            return result;
        }
    }

    // Fallback 1 for getChordData: Slash chords (e.g. Ab/C -> Ab)
    if (chordName.includes('/')) {
        const slashIndex = chordName.indexOf('/');
        const baseChordName = chordName.slice(0, slashIndex);
        if (baseChordName && baseChordName !== chordName) {
            const baseData = getChordData(baseChordName);
            if (baseData) {
                const result = {
                    ...baseData,
                    name: chordName
                };
                chordCache[chordName] = result;
                return result;
            }
        }
    }

    // Fallback 2 for getChordData: Complex extensions (e.g. Ab9 -> Ab, Abm7 -> Abm)
    if (rawSuffix && rawSuffix !== 'm' && rawSuffix !== 'minor' && rawSuffix !== 'major') {
        const baseType = (rawSuffix.startsWith('m') && !rawSuffix.startsWith('maj')) ? 'm' : '';
        const rootChordName = rawRoot + baseType;
        if (rootChordName !== chordName) {
            const rootData = getChordData(rootChordName);
            if (rootData) {
                const result = {
                    ...rootData,
                    name: chordName
                };
                chordCache[chordName] = result;
                return result;
            }
        }
    }

    return null;
}
