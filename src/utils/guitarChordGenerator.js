// Dynamic Human-Ergonomic Guitar Chord Voicing Generator for LouvorPlay
// Generates physically playable, musically accurate guitar chord diagrams dynamically for ANY chord.

const NOTES = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};

const STRING_OPEN_NOTES = [4, 9, 2, 7, 11, 4]; // E2, A2, D3, G3, B3, E4

/**
 * Calculates required pitch classes (0..11) for a given chord name.
 */
function getChordPitchClasses(chordName) {
    if (!chordName) return null;

    const parts = chordName.split('/');
    const mainChord = parts[0];
    let bassNote = parts.length > 1 ? parts[parts.length - 1] : null;
    if (bassNote && !/^[A-G][#b]?/.test(bassNote)) bassNote = null;

    const rootMatch = mainChord.match(/^[A-G][#b]?/);
    if (!rootMatch) return null;

    const rootStr = rootMatch[0];
    const rootVal = NOTES[rootStr];
    if (rootVal === undefined) return null;

    const modifier = mainChord.slice(rootStr.length);

    let third = (rootVal + 4) % 12; // Default Major 3rd
    let fifth = (rootVal + 7) % 12; // Default Perfect 5th
    let seventh = null;
    let extra = null;

    if (modifier.includes('dim') || modifier.includes('°')) {
        third = (rootVal + 3) % 12;
        fifth = (rootVal + 6) % 12;
        seventh = (rootVal + 9) % 12;
    } else if (modifier.includes('aug') || modifier.includes('+')) {
        third = (rootVal + 4) % 12;
        fifth = (rootVal + 8) % 12;
    } else if (modifier.includes('sus2')) {
        third = (rootVal + 2) % 12;
    } else if (modifier.includes('sus4') || modifier === 'sus' || modifier.includes('4')) {
        third = (rootVal + 5) % 12;
    } else if (modifier.startsWith('m') && !modifier.startsWith('maj')) {
        third = (rootVal + 3) % 12;
    }

    if (modifier.includes('maj7') || modifier.includes('7M') || modifier === 'M7') {
        seventh = (rootVal + 11) % 12;
    } else if (modifier.includes('7') || modifier.includes('9') || modifier.includes('11') || modifier.includes('13')) {
        seventh = (rootVal + 10) % 12;
    } else if (modifier.includes('6')) {
        seventh = (rootVal + 9) % 12;
    }

    if (modifier.includes('add9') || modifier.includes('9')) {
        extra = (rootVal + 2) % 12;
    }

    const pitchClasses = new Set([rootVal, third, fifth]);
    if (seventh !== null) pitchClasses.add(seventh);
    if (extra !== null) pitchClasses.add(extra);

    const bassVal = bassNote && NOTES[bassNote] !== undefined ? NOTES[bassNote] : rootVal;
    if (bassVal !== undefined) pitchClasses.add(bassVal);

    return {
        rootVal,
        thirdVal: third,
        seventhVal: seventh,
        bassVal,
        allPitches: Array.from(pitchClasses)
    };
}

/**
 * Dynamically generates 1-4 human-ergonomic guitar chord positions for any chord name.
 */
export function generateGuitarChordVoicings(chordName) {
    const chordInfo = getChordPitchClasses(chordName);
    if (!chordInfo) return null;

    const { rootVal, thirdVal, seventhVal, bassVal, allPitches } = chordInfo;

    const candidates = [];

    // Search window frets across the guitar neck
    for (let startFret = 1; startFret <= 10; startFret++) {
        const windowFrets = [startFret, startFret + 1, startFret + 2, startFret + 3];

        const stringOptions = [];

        for (let s = 0; s < 6; s++) {
            const opts = [];
            // Option: muted
            opts.push(-1);
            // Option: open string
            if (allPitches.includes(STRING_OPEN_NOTES[s])) {
                opts.push(0);
            }
            // Options: frets inside the 4-fret window
            for (const f of windowFrets) {
                const pitch = (STRING_OPEN_NOTES[s] + f) % 12;
                if (allPitches.includes(pitch)) {
                    opts.push(f);
                }
            }
            stringOptions.push(opts);
        }

        function searchStrings(stringIdx, currentFrets) {
            if (stringIdx === 6) {
                const fretted = currentFrets.filter(f => f > 0);
                if (fretted.length === 0) return;

                const minF = Math.min(...fretted);
                const maxF = Math.max(...fretted);
                if (maxF - minF > 3) return; // Beyond human hand reach

                // Find lowest sounding string
                const lowestStringIdx = currentFrets.findIndex(f => f !== -1);
                if (lowestStringIdx === -1) return;

                const lowestFret = currentFrets[lowestStringIdx];
                const lowestPitch = (STRING_OPEN_NOTES[lowestStringIdx] + Math.max(0, lowestFret)) % 12;

                // Bass Note Rule: lowest note MUST be the requested bass note
                if (lowestPitch !== bassVal) return;

                // Check pitch coverage: must contain root note and third/sus
                const soundingPitches = new Set();
                currentFrets.forEach((f, s) => {
                    if (f !== -1) {
                        soundingPitches.add((STRING_OPEN_NOTES[s] + Math.max(0, f)) % 12);
                    }
                });

                if (!soundingPitches.has(rootVal)) return;
                if (thirdVal !== null && !soundingPitches.has(thirdVal)) return;

                // Ergonomic finger limit: <= 4 fretted notes unless barre
                const nonMinFretted = fretted.filter(f => f > minF);
                if (nonMinFretted.length > 3) return;

                // Candidate valid! Calculate barres if any
                const minFretStrings = [];
                currentFrets.forEach((f, s) => {
                    if (f === minF) minFretStrings.push(s);
                });

                const barres = minFretStrings.length >= 2 ? [{ fret: minF, from: Math.min(...minFretStrings), to: Math.max(...minFretStrings) }] : [];

                candidates.push({
                    rawFrets: [...currentFrets],
                    minFret: minF,
                    maxFret: maxF,
                    barres,
                    soundingCount: currentFrets.filter(f => f !== -1).length
                });

                return;
            }

            for (const opt of stringOptions[stringIdx]) {
                searchStrings(stringIdx + 1, [...currentFrets, opt]);
            }
        }

        searchStrings(0, []);
        if (candidates.length >= 8) break;
    }

    if (candidates.length === 0) return null;

    // Deduplicate candidates based on string fret strings
    const uniqueMap = new Map();
    candidates.forEach(cand => {
        const key = cand.rawFrets.join(',');
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, cand);
        }
    });

    const uniqueCandidates = Array.from(uniqueMap.values());

    // Sort by playability (lower frets first, 4-5 sounding strings preferred)
    uniqueCandidates.sort((a, b) => {
        if (a.minFret !== b.minFret) return a.minFret - b.minFret;
        return b.soundingCount - a.soundingCount;
    });

    // Format top positions for ChordDiagram component
    const positions = uniqueCandidates.slice(0, 4).map(cand => {
        const hasOpen = cand.rawFrets.some(f => f === 0);
        let baseFret = 1;
        let finalFrets = [...cand.rawFrets];
        let finalBarres = [];

        if (!hasOpen && cand.minFret > 1) {
            baseFret = cand.minFret;
            finalFrets = cand.rawFrets.map(f => (f > 0 ? f - cand.minFret + 1 : f));
            if (cand.barres.length > 0) {
                finalBarres = [{
                    fret: 1,
                    from: cand.barres[0].from,
                    to: cand.barres[0].to
                }];
            }
        } else {
            finalBarres = cand.barres.map(b => ({
                fret: b.fret,
                from: b.from,
                to: b.to
            }));
        }

        return {
            frets: finalFrets,
            barres: finalBarres,
            baseFret
        };
    });

    return {
        name: chordName,
        positions
    };
}
