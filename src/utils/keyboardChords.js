// Parses a chord string and generates the constituent piano keys dynamically based on musical intervals
// C3 = 0, C#3 = 1, D3 = 2, D#3 = 3... B3 = 11
// C4 = 12, C#4 = 13... B4 = 23

const NOTES = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};

// Interval definitions (semitones from root)
const INTERVALS = {
    M3: 4,  // Major 3rd
    m3: 3,  // Minor 3rd
    P5: 7,  // Perfect 5th
    d5: 6,  // Diminished 5th
    A5: 8,  // Augmented 5th
    m7: 10, // Minor 7th
    M7: 11, // Major 7th
    M6: 9,  // Major 6th
    M2: 2,  // Major 2nd (sus2)
    P4: 5,  // Perfect 4th (sus4)
    M9: 14, // Major 9th (octave + M2)
    m9: 13, // Minor 9th (octave + m2)
    A9: 15, // Augmented 9th (octave + m3)
    P11: 17, // Perfect 11th (octave + P4)
    A11: 18, // Augmented 11th (octave + d5)
    M13: 21, // Major 13th (octave + M6)
};

export function getKeyboardChord(chordName) {
    if (!chordName) return null;

    // 1. Separate bass note and any slash extensions (e.g., C/E or C7/4/9)
    const parts = chordName.split('/');
    let mainChord = parts[0];
    let bassNote = null;
    let slashExtensions = [];

    // Process all slash parts
    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (/^[A-G]/.test(part)) {
            // It's a true bass note
            bassNote = part;
        } else {
            // It's a numeric extension (e.g., 4, 9, 7)
            slashExtensions.push(part);
        }
    }

    // 2. Extract Root Note (A-G, optional # or b)
    const rootMatch = mainChord.match(/^[A-G][#b]?/);
    if (!rootMatch) return null;

    const rootString = rootMatch[0];
    const rootVal = NOTES[rootString];
    if (rootVal === undefined) return null;

    // 3. Extract the modifier/quality (everything after the root note)
    const modifier = mainChord.slice(rootString.length);

    // 4. Determine base triad intervals
    let intervals = [0]; // Root is always 0
    let hasThird = false;
    let hasFifth = false;

    // Parse Quality (Major, Minor, Diminished, Augmented, Sus)
    if (modifier.includes('dim') || modifier === 'm7b5' || modifier.includes('°')) {
        intervals.push(INTERVALS.m3, INTERVALS.d5); // 0, 3, 6
        hasThird = true; hasFifth = true;
    } else if (modifier.includes('aug') || modifier.includes('+')) {
        intervals.push(INTERVALS.M3, INTERVALS.A5); // 0, 4, 8
        hasThird = true; hasFifth = true;
    } else if (modifier.includes('sus2')) {
        intervals.push(INTERVALS.M2, INTERVALS.P5); // 0, 2, 7
        hasThird = true; hasFifth = true;
    } else if (modifier.includes('sus4') || modifier === 'sus' || modifier.includes('4') || slashExtensions.includes('4')) {
        intervals.push(INTERVALS.P4, INTERVALS.P5); // 0, 5, 7
        hasThird = true; hasFifth = true;
    } else if (modifier.startsWith('m') && !modifier.startsWith('maj') && modifier !== 'm(maj7)') {
        // Minor (m, m7, m9, etc)
        intervals.push(INTERVALS.m3, INTERVALS.P5); // 0, 3, 7
        hasThird = true; hasFifth = true;
    } else {
        // Default to Major
        intervals.push(INTERVALS.M3, INTERVALS.P5); // 0, 4, 7
        hasThird = true; hasFifth = true;
    }

    // 5. Build Extensions (7ths, 9ths, 11ths, 13ths)

    // 7ths
    if (modifier.includes('maj7') || modifier.includes('7M') || modifier === 'M7' || modifier.includes('m(maj7)') || slashExtensions.includes('maj7')) {
        intervals.push(INTERVALS.M7);
    } else if (modifier.includes('7') || slashExtensions.includes('7') || modifier.includes('11') || modifier.includes('13')) {
        // Standard 7, 11, 13 imply a minor 7th (Dominant) unless maj is specified
        if (modifier.includes('dim7') || modifier.includes('°7')) {
            intervals.push(9); // Diminished 7th (enharmonically M6)
        } else if (!modifier.includes('add')) {
            intervals.push(INTERVALS.m7);
        }
    } else if (modifier.includes('6') || slashExtensions.includes('6')) {
        intervals.push(INTERVALS.M6);
    }

    // 9ths
    if ((modifier.includes('9') || slashExtensions.includes('9')) && !modifier.includes('add9') && !modifier.includes('b9') && !modifier.includes('#9')) {
        intervals.push(INTERVALS.M9);
    } else if (modifier.includes('add9')) {
        intervals.push(INTERVALS.M9);
    } else if (modifier.includes('b9')) {
        intervals.push(INTERVALS.m9);
    } else if (modifier.includes('#9')) {
        intervals.push(INTERVALS.A9);
    }

    // 11ths & 13ths (Basic support)
    if (modifier.includes('11') || slashExtensions.includes('11')) intervals.push(INTERVALS.P11);
    if (modifier.includes('13') || slashExtensions.includes('13')) intervals.push(INTERVALS.M13);

    // Specific alterations
    if (modifier.includes('b5') && !modifier.includes('dim')) {
        // Replace P5 (7) with d5 (6)
        intervals = intervals.filter(i => i !== INTERVALS.P5);
        if (!intervals.includes(INTERVALS.d5)) intervals.push(INTERVALS.d5);
    }
    if (modifier.includes('#5') && !modifier.includes('aug')) {
        // Replace P5 (7) with A5 (8)
        intervals = intervals.filter(i => i !== INTERVALS.P5);
        if (!intervals.includes(INTERVALS.A5)) intervals.push(INTERVALS.A5);
    }

    // 6. Calculate actual keys on the 24-key keyboard
    // We try to keep notes within the first 2 octaves.

    let activeKeys = intervals.map(interval => {
        let key = rootVal + interval;
        // If it goes off our 2-octave board (24 keys), wrap it down an octave
        while (key >= 24) {
            key -= 12;
        }
        return key;
    });

    // 7. Handle Bass Note Inversions
    if (bassNote) {
        const bassVal = NOTES[bassNote.match(/^[A-G][#b]?/)[0]];
        if (bassVal !== undefined) {
            // Inversions mean the bass note MUST be the lowest note played.
            // We remap all chord notes to be strictly above the bass note.
            const invertedKeys = [bassVal]; // Start with the bass note

            activeKeys.forEach(key => {
                const normalizedKey = key % 12;
                if (normalizedKey < bassVal) {
                    // Shift it up an octave so it sits above the bass
                    invertedKeys.push(normalizedKey + 12);
                } else if (normalizedKey > bassVal) {
                    // It naturally sits above the bass in the base octave
                    invertedKeys.push(normalizedKey);
                }
                // If normalizedKey === bassVal, we already added it at the bottom.
            });

            activeKeys = invertedKeys;
        }
    }

    // Deduplicate and sort
    activeKeys = [...new Set(activeKeys)].sort((a, b) => a - b);

    // Final sanity check: if somehow empty, return null
    if (activeKeys.length === 0) return null;

    return activeKeys;
}
