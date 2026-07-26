/**
 * Detects if a token looks like a valid chord.
 * Matches: A-G, optional #/b, optional modifiers (m, 7, maj, dim, etc.), optional bass note (/F#).
 */
function isChord(token) {
    // Added 2|4 to the numbers. Added 'M' which sometimes stands for Major7 or just Major.
    // Added parenthesis coverage ( )\d* to catch (9), (13), etc.
    // Modified slash notation to support numbers (e.g., D7/4) as well as bass notes (e.g., C/E).
    const chordRegex = /^([A-G][#b]?)(m|M|maj|min|dim|aug|sus|add|\+|°|ø|2|4|5|6|7|9|11|13|\(|\))*(\/([A-G][#b]?|[0-9]+))?$/;
    return chordRegex.test(token);
}

/**
 * Removes spaces around slashes to help with chord detection (e.g. "G / B" -> "G/B")
 */
function preCleanSlashes(line) {
    return line.replace(/\s*\/\s*/g, '/');
}

/**
 * Merges separated chord parts that often result from copy-pasting (e.g. "F7 M" -> "F7M", "A m" -> "Am")
 * It iterates through tokens separated by spaces. If combining them creates a valid chord, and they 
 * aren't both valid chords independently, it merges them.
 */
function mergeSeparatedChords(line) {
    let oldLine = "";
    let newLine = line;

    while (oldLine !== newLine) {
        oldLine = newLine;
        const tokens = newLine.split(/(\s+)/); // Keeps spaces in the array
        let mergedTokens = [];
        
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.trim().length > 0 && mergedTokens.length >= 2) {
                const prevSpace = mergedTokens[mergedTokens.length - 1];
                const prevText = mergedTokens[mergedTokens.length - 2];
                
                if (prevText.trim().length > 0 && prevSpace.trim().length === 0) { // meaning the separator was just spaces and prevText is an actual token
                    const combined = prevText + t;
                    if (isChord(combined) && (!isChord(prevText) || !isChord(t))) {
                        mergedTokens.pop(); 
                        mergedTokens.pop(); 
                        mergedTokens.push(combined); 
                        continue;
                    }
                }
            }
            mergedTokens.push(t);
        }
        newLine = mergedTokens.join('');
    }
    return newLine;
}

/**
 * Detects if a whole line is likely a chord line.
 * Criteria: 
 * - Predominantly valid chords.
 * - Allows typical structural markers like [Intro], [Solo], [Refrão] if mixed with chords.
 */
export function isChordLine(line) {
    let trimmed = line.trim();
    if (!trimmed) return false;

    // DE-PARENTHESIZE for detection: If line is wrapped in (), treat as chord line if contents are chords
    const isWrapped = trimmed.startsWith('(') && trimmed.endsWith(')');
    if (isWrapped) {
        trimmed = trimmed.slice(1, -1).trim();
    }

    // Clean up separated chords (e.g. F7 M -> F7M) for accurate detection
    const testLine = mergeSeparatedChords(preCleanSlashes(trimmed));

    // Split by spaces, ignored empty
    const tokens = testLine.split(/\s+/);


    // Check if ALL tokens are chords or known structural tags
    const validTokens = tokens.filter(t => {
        // Allow structural tags in brackets or plain text common indicators
        if (/^\[.*\]$/.test(t)) return true; // [Intro]
        // Allow parenthesized comments often found in chord lines e.g. (2x) (riff)
        if (/^\(.*\)$/.test(t)) return true;
        // Allow keywords like Intro, Solo even without brackets/colon
        if (isSectionHeader(t)) return true;
        return isChord(t);
    });

    // If we have tokens and at least 50% look like chords/tags, treat as chord line.
    // Lowered from 80% to 50% to catch lines like "G D (2x)" where ratio is 0.66
    return validTokens.length / tokens.length >= 0.5;
}

/**
 * Helper to check if a line is just a section header like [Refrão] or [Intro]
 */
export function isSectionHeader(line) {
    const trimmed = line.trim();
    if (!trimmed) return false;

    // Matches [Header] or Header:
    if (/^\[.*\]$/.test(trimmed) || /^[A-Za-z0-9\s]+:$/.test(trimmed)) return true;

    // Matches common keywords exactly (case-insensitive)
    const keywords = /^(Intro|Solo|Refrão|Pré-Refrão|Pre-Refrão|Pre-Chorus|Chorus|Ponte|Bridge|Final|Outro|Parte\s*\d+|Primeira\s+Parte|Segunda\s+Parte|Terceira\s+Parte|Vocal|Instrumental|Interlúdio|Tag)$/i;
    return keywords.test(trimmed);
}

/**
 * Detects if a line looks like a guitar tab (e.g. E|---0---)
 */
export function isTabLine(line) {
    const trimmed = line.trim();
    return /^[A-Ga-g]\|/.test(trimmed) || (trimmed.match(/-/g) || []).length > 2;
}

/**
 * Parses CifraClub-style text (chords above lyrics) into ChordPro-like format [C]Lyrics.
 * @param {string} input Raw text
 * @returns {string} Formatted text
 */
export function parseImporter(input) {
    const lines = input.split('\n');
    const output = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Check if it's already a ChordPro comment {c: ...}
        if (trimmed.startsWith('{c:') || trimmed.startsWith('{comment:')) {
            output.push(line);
            continue;
        }

        // 1. Is this a section header? (Refrão, Intro, etc.)
        if (isSectionHeader(line)) {
            // Already bracketed? [Refrão]
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                const inner = trimmed.slice(1, -1);
                output.push(`{c: ${inner}}`);
            } else {
                // Not bracketed, just text. Wrap it.
                // Remove trailing colon if exists
                const clean = trimmed.replace(/:$/, '');
                output.push(`{c: ${clean}}`);
            }
            continue;
        }

        // 2. Is this a chord line?
        if (isChordLine(line)) {
            let workingLine = mergeSeparatedChords(preCleanSlashes(line));
            
            // If it's a parenthesized chord line, strip the parentheses for cleaner formatting
            const t = line.trim();
            if (t.startsWith('(') && t.endsWith(')')) {
                const start = line.indexOf('(');
                const end = line.lastIndexOf(')');
                workingLine = line.substring(0, start) + ' ' + line.substring(start + 1, end) + ' ' + line.substring(end + 1);
            }

            // Check the NEXT line to decide if we merge or just print brackets
            // Case 1: Next line exists and is NOT a chord line -> MERGE
            const nextLine = (i + 1 < lines.length) ? lines[i + 1] : null;

            // Merge if:
            // 1. Next line exists
            // 2. Next line is NOT a chord line
            // 3. Next line is NOT a section header (don't put chords into [Refrão])
            // 4. Next line is NOT a tab line (don't put chords into tabs)
            // 5. Next line is not empty
            if (nextLine !== null &&
                !isChordLine(nextLine) &&
                !isSectionHeader(nextLine) &&
                !isTabLine(nextLine) &&
                nextLine.trim().length > 0
            ) {
                // Formatting merge
                const merged = mergeChordsAndLyrics(workingLine, nextLine);
                output.push(merged);
                i++; // Skip next line since we consumed it
            } else {
                // Case 2: Standalone chords (Intro, End, or just chords with no lyrics under)
                // Just wrap them in brackets e.g. [A] [B]
                output.push(formatChordsOnlyLine(workingLine));
            }
        } else {
            // Just a lyric line (or empty)
            output.push(line);
        }
    }

    return output.join('\n');
}

/**
 * Converts ChordPro format (chords in brackets) back to Visual format (chords above lyrics).
 * @param {string} input ChordPro text
 * @returns {string} Visual format text
 */
export function exportToVisual(input) {
    const lines = input.split('\n');
    const output = [];

    for (const rawLine of lines) {
        // Pass through tags or empty lines
        if (!rawLine.trim() || rawLine.trim().startsWith('{')) {
            output.push(rawLine);
            continue;
        }

        let line = rawLine;

        // Auto-bracket logic: If line has NO brackets but LOOKS like a chord line (e.g. "Intro: G D")
        // we wrap chords/tokens in brackets so they are parsed as chords/labels instead of lyrics.
        const hasBrackets = /\[.*?\]/.test(line);
        if (!hasBrackets && isChordLine(line)) {
            line = line.replace(/\S+/g, (token) => {
                const clean = token.replace(/[:.,;)]+$/, '');
                // Bracket if it's a chord OR a parenthesized instruction like (2x)
                if (isChord(clean) || isChord(token) || /^\(.*\)$/.test(token)) {
                    return `[${token}]`;
                }
                return token;
            });
        }

        // Segment the line into [Chord]Text chunks
        const segments = [];
        let buffer = '';
        let currentChord = null;
        let isReadingChord = false;

        const flushSegment = () => {
            if (currentChord || buffer) {
                segments.push({ chord: currentChord, text: buffer });
            }
            currentChord = null;
            buffer = '';
        };

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '[' && !isReadingChord) {
                // Start of new chord
                flushSegment(); // Flush previous text/chord pair
                isReadingChord = true;
            } else if (char === ']' && isReadingChord) {
                // End of chord
                currentChord = buffer;
                buffer = '';
                isReadingChord = false;
            } else {
                buffer += char;
            }
        }
        flushSegment(); // Final flush

        if (segments.length === 0) continue;

        // Determine if line has ANY chords
        const hasChords = segments.some(s => s.chord !== null);

        if (!hasChords) {
            output.push(line); // Just text logic
            continue;
        }

        // Build the two lines
        let chordLine = '';
        let lyricLine = '';


        // Pre-process segments to hoist labels or unbracketed chords/text that should be on the chord line
        for (let k = 0; k < segments.length; k++) {
            const s = segments[k];
            // Only if we have NO chord but DO have text in this segment
            if (!s.chord && s.text.trim()) {
                const trimmed = s.text.trim();
                // Remove trailing punctuation for check (e.g. "Intro:" -> "Intro", "C." -> "C")
                const clean = trimmed.replace(/[:.,;)]+$/, '');

                // Condition 1: Label at start of line (Intro:, Solo:, Riff, Ponte, Refrão)
                const isLabel = k === 0 && (trimmed.endsWith(':') || /^(Intro|Solo|Riff|Ponte|Refrão|Chorus)/i.test(trimmed));

                // We NO LONGER hoist loose chords ("E", "A") because they steal letters from the start of lyrics
                // e.g. "E [Em7]le Reinará" -> "E" was hoisted to chord line, leaving "le Reinará"

                if (isLabel) {
                    s.chord = trimmed; // Move text content to chord slot
                    s.text = '';       // Clear text slot so it doesn't duplicate
                }
            }
        }

        for (let j = 0; j < segments.length; j++) {
            const seg = segments[j];
            const chord = seg.chord || '';
            const text = seg.text || '';
            const isLast = j === segments.length - 1;

            // Calculate necessary length for this segment
            // We need enough space for both the chord and the text
            let width = Math.max(chord.length, text.length);

            // Heuristic to prevent squashing chords when text is just internal spacing
            // If the text under the chord is just whitespace/empty, and the chord is wider or equal to it,
            // the whitespace is effectively "hidden" under the chord.
            // To ensure the next chord doesn't start immediately touching this one, we add a buffer space.
            if (chord.length > 0 && text.trim().length === 0) {
                if (chord.length >= text.length) {
                    width += 1;
                }
            }

            // Padding Logic
            // We usually want at least 1 space buffer between segments UNLESS it matches perfectly?
            // Actually, in default monospaced formatting, we don't need extra buffer if the lyrics naturally separate.
            // But if lyrics are short (or empty), chords might run together: [A][B] -> AB.
            // So if text length < chord length, we are "expanding" the lyric space.
            // If chord length < text length, we are "expanding" the chord space.

            // To be safe, if this is NOT the last segment, and the text ends with non-space, 
            // maybe we want to force a space?
            // But usually [Chord]Text [Chord]Text already has the space in "Text ".

            // Let's stick to simple max width padding for now, but ensure we pad correctly.

            let paddedChord = chord.padEnd(width, ' ');
            let paddedLyric = text.padEnd(width, ' ');

            // Append
            chordLine += paddedChord;
            lyricLine += paddedLyric;
        }

        output.push(chordLine.trimEnd());

        // Only push lyric line if it has actual content (not just whitespace from padding)
        if (lyricLine.trim().length > 0) {
            output.push(lyricLine.trimEnd());
        }
    }

    return output.join('\n');
}

/**
 * Merges a chord line into a lyric line based on column positions.
 */
function mergeChordsAndLyrics(chordLine, lyricLine) {
    let result = lyricLine;

    // If the lyric line is just parentheses (common for passing chords), treat as empty
    if (lyricLine.trim().match(/^\(\s*\)$/)) {
        result = '';
    }

    // We need to insert from RIGHT to LEFT to avoid invalidating indices

    // Find chords and their indices
    const chords = [];
    const regex = /\S+/g;
    let match;

    while ((match = regex.exec(chordLine)) !== null) {
        chords.push({
            text: match[0],
            index: match.index
        });
    }

    // Sort descending by index
    chords.sort((a, b) => b.index - a.index);

    // Apply insertions
    chords.forEach(({ text, index }) => {
        // User requested STRICT alignment of first letter.
        // Previously we centered (Math.floor(text.length/2)).
        // Now we use the exact index where the chord starts.
        const adjustedIndex = index;

        // Pad result if index is beyond current length
        if (adjustedIndex > result.length) {
            result = result.padEnd(adjustedIndex, ' ');
        }

        let chordToken = text;
        if (!chordToken.startsWith('[')) {
            chordToken = `[${chordToken}]`;
        }

        const before = result.substring(0, adjustedIndex);
        const after = result.substring(adjustedIndex);
        result = before + chordToken + after;
    });

    return result;
}


function formatChordsOnlyLine(line) {
    // Only wrap tokens that look like chords or structural tags
    return line.replace(/\S+/g, (match) => {
        if (match.startsWith('[')) return match;

        // Remove ANY trailing punctuation from match for check? "Intro:" -> "Intro"
        const clean = match.replace(/[:.,;)]+$/, '');

        // Check if it matches chord logic or is a parenthesized instruction or structural tag
        // Also allow labels ending in ':' (e.g. Intro:, Solo:) to be bracketed so they stay on the chord line
        // Also allow common keywords (Intro, Solo, etc.) to be bracketed
        if (isChord(clean) || isChord(match) || /^\(.*\)$/.test(match) || /^\[.*\]$/.test(match) || match.endsWith(':') || isSectionHeader(match)) {
            return `[${match}]`;
        }

        // Return as plain text if it's just a label like "Intro:"
        return match;
    });
}

