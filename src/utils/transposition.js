/**
 * Utility functions for transposing chords.
 */

export const ALL_KEYS = [
    'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
    'Cm', 'C#m', 'Dbm', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm', 'F#m', 'Gbm', 'Gm', 'G#m', 'Abm', 'Am', 'A#m', 'Bbm', 'Bm'
];

const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * Normalizes a note to its standard representation (e.g., 'Cb' -> 'B', 'B#' -> 'C')
 * This is a simplified normalizer.
 */
function normalizeNote(note) {
    if (note === 'Cb') return 'B';
    if (note === 'B#') return 'C';
    if (note === 'E#') return 'F';
    if (note === 'Fb') return 'E';
    return note;
}

export function getScalePreference(rootIndex, isMinor) {
    if (isMinor) {
        return [0, 2, 3, 5, 7, 10].includes(rootIndex) ? 'flat' : 'sharp';
    } else {
        return [1, 3, 5, 6, 8, 10].includes(rootIndex) ? 'flat' : 'sharp';
    }
}

export function getKeyInfo(keyString) {
    if (!keyString) return null;
    const match = keyString.match(/^([A-G])([#b]?)(m?)/);
    if (!match) return null;

    let root = match[1];
    let accidental = match[2];
    let isMinor = match[3] === 'm';

    let fullRoot = normalizeNote(root + accidental);
    let index = NOTES_SHARP.indexOf(fullRoot);
    if (index === -1) index = NOTES_FLAT.indexOf(fullRoot);
    if (index === -1) return null;

    return { index, isMinor };
}

/**
 * Transposes a single chord by a number of semitones.
 * @param {string} chord The chord string (e.g., "Am7/G")
 * @param {number} semitones Number of semitones to shift (can be negative)
 * @param {boolean} preferFlats Whether to output using flat accidentals instead of sharps
 * @returns {string} The transposed chord
 */
export function transposeChord(chord, semitones, preferFlats = false) {
    if (!chord) return chord;
    const shift = parseInt(semitones, 10);
    if (isNaN(shift) || shift === 0) return chord;

    // Handle slash chords (e.g., C/G)
    if (chord.includes('/')) {
        const parts = chord.split('/');
        return transposeChord(parts[0], shift, preferFlats) + '/' + transposeChord(parts[1], shift, preferFlats);
    }

    // Regex to match root note (A-G, optionally # or b)
    // Matches: [Root][#|b]?[EverythingElse]
    const match = chord.match(/^([A-G])([#b]?)(.*)$/);
    if (!match) return chord;

    let root = match[1];
    let accidental = match[2];
    let suffix = match[3];

    let fullRoot = normalizeNote(root + accidental);

    // Determine which scale to use based on current root
    // For simplicity, we default to Sharp scale unless it's a known Flat key, 
    // but here we'll just try to locate in both and see which fits.

    let index = NOTES_SHARP.indexOf(fullRoot);
    if (index === -1) index = NOTES_FLAT.indexOf(fullRoot);
    if (index === -1) return chord; // Unknown note

    // Calculate new index
    // Add 120 to avoid negative modulo issues
    let newIndex = (index + shift + 120) % 12;

    const scale = preferFlats ? NOTES_FLAT : NOTES_SHARP;
    return scale[newIndex] + suffix;
}

export function getTransposedNote(note, semitones, forcePreferFlats = null) {
    if (!note) return '?';
    const shift = parseInt(semitones, 10);
    if (isNaN(shift) || shift === 0) return note;

    // 1. Separate Root from Suffix (e.g. "Am" -> "A" + "m")
    const match = note.match(/^([A-G])([#b]?)(.*)$/);
    if (!match) return note;

    let root = match[1];
    let accidental = match[2];
    let suffix = match[3];

    let fullRoot = normalizeNote(root + accidental);

    if (!NOTES_SHARP.includes(fullRoot) && !NOTES_FLAT.includes(fullRoot)) return note;

    let index = NOTES_SHARP.indexOf(fullRoot);
    if (index === -1) index = NOTES_FLAT.indexOf(fullRoot);
    if (index === -1) return note;

    let newIndex = (index + shift + 120) % 12;

    let preferFlats = forcePreferFlats;
    if (preferFlats === null) {
        const isMinor = suffix.startsWith('m') && !suffix.startsWith('maj');
        preferFlats = getScalePreference(newIndex, isMinor) === 'flat';
    }

    const scale = preferFlats ? NOTES_FLAT : NOTES_SHARP;
    return scale[newIndex] + suffix; // Append suffix back (e.g. "Cm")
}

/**
 * Transposes a ChordPro text content.
 * @param {string} content The full text content with [Chords]
 * @param {number} semitones Number of semitones to shift
 * @returns {string} Transposed content
 */
export function transposeSong(content, semitones) {
    const shift = parseInt(semitones, 10);
    if (isNaN(shift) || shift === 0) return content;

    const originalKey = detectKeyFromContent(content);
    let preferFlats = false;

    if (originalKey) {
        const keyInfo = getKeyInfo(originalKey);
        if (keyInfo !== null) {
            const targetIndex = (keyInfo.index + shift + 120) % 12;
            preferFlats = getScalePreference(targetIndex, keyInfo.isMinor) === 'flat';
        }
    }

    // Replace all occurrences of [Chord]
    return content.replace(/\[(.*?)\]/g, (match, chord) => {
        return `[${transposeChord(chord, shift, preferFlats)}]`;
    });
}
/**
 * Analyzes a string content (ChordPro) and attempts to detect the original key.
 * Higher importance is given to the first chords identified.
 * @param {string} content - Full text of the song with chords in [Bracket] format.
 * @returns {string|null} - Detected key (e.g., 'G', 'Am', 'C#') or null if no chords found.
 */
export function detectKeyFromContent(content) {
    if (!content) return null;

    // Split text into lines to identify chord lines vs lyric lines
    const lines = content.split('\n');
    const weights = {};
    let chordsFound = [];

    // Helper to check if a token looks like a valid music chord
    const isChord = (token) => {
        // Matches A-G, optional #/b, followed by common chord suffixes or slash chords/suspensions
        // We are slightly restrictive here to avoid matching single letters in lyrics
        return /^[A-G][#b]?(m|M|maj|min|dim|aug|sus|add|\+|°|ø|2|4|5|6|7|9|11|13|d)*(\/([A-G][#b]?|[0-9]+))?$/.test(token);
    };

    // Analyze lines
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // 1. Check for Bracketed chords (ChordPro)
        const bracketedMatches = trimmed.match(/\[([A-G][#b]?m?)[^\]]*\]/g);
        if (bracketedMatches) {
            bracketedMatches.forEach(m => {
                const inner = m.match(/\[([A-G][#b]?m?)/);
                if (inner) chordsFound.push(inner[1]);
            });
            continue;
        }

        // 2. Check for naked chords in Visual format
        const tokens = trimmed.split(/\s+/).filter(t => t.length > 0);
        const chordsInLine = tokens.filter(isChord);
        
        // IMPORTANT: A line is only considered a "Chord Line" if it has high chord density
        // This prevents capturing the letter "A" or "E" from regular sentences.
        // If more than 40% of tokens are chords, it's likely a chord line.
        if (chordsInLine.length > 0 && (chordsInLine.length / tokens.length >= 0.4 || tokens.length <= 3)) {
            chordsInLine.forEach(c => {
                // Extract base note + m (e.g. C#m7 -> C#m)
                const baseMatch = c.match(/^([A-G][#b]?m?)/);
                if (baseMatch) chordsFound.push(baseMatch[0]);
            });
        }
        
        // Stop scanning after a reasonable amount of chords to keep it fast
        if (chordsFound.length >= 30) break;
    }

    if (chordsFound.length === 0) return null;

    // Musical Weighting
    // We analyze the first few chords as they usually define the key (Tonic)
    const scanLimit = Math.min(chordsFound.length, 15);
    for (let i = 0; i < scanLimit; i++) {
        const chord = chordsFound[i];
        // The first chord of the song is a HUGE indicator of the key (Weight: 5)
        const weight = (i === 0) ? 5 : 1;
        weights[chord] = (weights[chord] || 0) + weight;
    }

    // Sort by total weight descending
    const sortedResult = Object.entries(weights).sort((a, b) => b[1] - a[1]);
    
    return sortedResult.length > 0 ? sortedResult[0][0] : null;
}
