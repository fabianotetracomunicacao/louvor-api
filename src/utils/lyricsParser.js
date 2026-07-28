/**
 * Utility to extract clean lyrics from ChordPro/Text content.
 * It strips chords, formatting markers, and tab blocks, returning an array of clean lyric lines.
 */
export function extractLyrics(content) {
    if (!content) return [];

    const lines = content.split('\n');
    const cleanLines = [];

    let isTabBlock = false;

    lines.forEach((line, originalIndex) => {
        const trimmed = line.trim();

        // 1. Skip Tab Blocks
        if (trimmed === '{sot}' || trimmed === '{start_of_tab}') {
            isTabBlock = true;
            return;
        }
        if (trimmed === '{eot}' || trimmed === '{end_of_tab}') {
            isTabBlock = false;
            return;
        }
        if (isTabBlock) return;

        // 2. Skip Implicit Tabs (e.g. e|---)
        const isImplicitTab = /^[A-Ga-g]\|/.test(trimmed) && (trimmed.match(/-/g) || []).length > 2;
        if (isImplicitTab) return;

        // 3. Keep Headers/Tags like [Verso 1] or {tag: Verso} but make them clean
        // The display logic might want to use section headers.
        // Wait, standard ChordPro tags like {tag: ...} or {endtag} are wrappers.
        if (trimmed.match(/^\{tag:\s*(.*?)\}$/i)) {
            const label = trimmed.match(/^\{tag:\s*(.*?)\}$/i)[1];
            cleanLines.push(`[${label}]`); // Convert `{tag: X}` to `[X]` for consistency
            return;
        }
        if (trimmed === '{endtag}') return;

        // 4. Strip out inline chords [G], [Am7]
        // But wait! [Section] or [Refrão] are often used as section markers in apps, not just chords.
        // Chords usually don't have spaces, tags usually do (e.g. [Verso 1]) or they have specific words.
        // In LouvorPlay, chords are strictly recognized if they are exactly clicked/rendered.
        // Let's strip standard bracketed items that look like chords.
        // Actually, the current renderer strips ANY bracketed item `[.*?\]` and treats it as a chord to color it blue.
        // Wait, if users write [Refrão], does it get colored blue as a chord? Yes, `part.startsWith('[')` colors it unless they use `{tag: Refrão}`.
        // Let's emulate the exact logic: remove ALL `[...]`. Wait, if they use `[Refrão]`, it disappears!
        // If we want [Refrão] to appear in the projector (just as a label, or not at all), usually projector lyrics don't show the word "Refrão".
        // Let's just strip all `[...]`.

        // Remove chords [...]
        let cleanText = line.replace(/\[.*?\]/g, '');

        // Remove comments {c: ...} or {comment: ...}
        cleanText = cleanText.replace(/\{(?:c|comment):\s*.*?\}/gi, '');

        // Remove bold asterisks
        cleanText = cleanText.replace(/\*/g, '');

        cleanText = cleanText.trim();

        // If the line still has text, keep it.
        // To preserve paragraph breaks (empty lines), we need to be careful.
        // Consecutive empty lines in projector shouldn't be spammed.
        // Let's just push everything. If it's empty, it will be an empty string. 
        // We'll filter out consecutive empty lines later.
        cleanLines.push({ text: cleanText, originalIndex });
    });

    // 5. Cleanup: Remove consecutive empty lines and trim start/end empty lines
    const compactedLines = [];
    for (let i = 0; i < cleanLines.length; i++) {
        const item = cleanLines[i];
        if (item.text === '') {
            // Don't add an empty line if the previous was also empty, or if we are at the very beginning
            if (compactedLines.length > 0 && compactedLines[compactedLines.length - 1].text !== '') {
                compactedLines.push(item);
            }
        } else {
            compactedLines.push(item);
        }
    }

    // Remove trailing empty line if exists
    if (compactedLines.length > 0 && compactedLines[compactedLines.length - 1].text === '') {
        compactedLines.pop();
    }

    // Map to objects with IDs for React rendering
    return compactedLines.map((item, index) => ({
        id: `lyric_line_${item.originalIndex}`,
        index,
        originalIndex: item.originalIndex,
        text: item.text
    }));
}

/**
 * Extract slides for projection.
 * Prioritizes `song.projectionContent` if it exists, otherwise falls back to `song.content`.
 * Removes chords, empty lines, and separates by tags/double spaces.
 * @param {object|string} songOrContent - The song object or raw content string.
 * @returns {Array<{id: string, lines: Array<string>, type: string, fullText: string}>}
 */
export function extractSlides(songOrContent) {
    let contentToParse = '';

    // Check if it's a song object with projectionContent
    if (typeof songOrContent === 'object' && songOrContent !== null) {
        contentToParse = songOrContent.projectionContent || songOrContent.content || '';
    } else if (typeof songOrContent === 'string') {
        contentToParse = songOrContent;
    }

    if (!contentToParse) return [];

    // Helper to detect if a line is just plain-text chords (e.g. "F7M  Dm7  Am  G/E")
    const isChordLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        
        // A chord token starts with A-G, optionally followed by # or b,
        // then any combination of letters, numbers, /, (, ), + or - characters
        // that are typical in chord notations (Dm7, F7M, G/E, A7/4, Bbmaj7, etc.)
        const chordTokenRegex = /^[A-G][#b]?[a-zA-Z0-9/()+-]*$/;
        
        const tokens = trimmed.split(/\s+/).filter(t => t.length > 0);
        if (tokens.length === 0) return false;
        let chordCount = 0;
        
        for (const token of tokens) {
            if (chordTokenRegex.test(token)) {
                chordCount++;
            }
        }
        
        // If 60% or more of the words look like chords, treat the line as a chord line
        return (chordCount / tokens.length) >= 0.6;
    };

    let textWithoutChords = '';

    // Remove chords (anything in brackets like [G], [Am7], etc.)
    // We want to KEEP section headers like [Verse 1] or [Refrão], which usually take the entire line
    const linesRaw = contentToParse.split('\n');
    const processedLines = linesRaw.map(line => {
        const trimmed = line.trim();
        // If the whole line is a bracketed tag like [Refrão] and it's longer than a typical chord
        if (trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed.length > 5) {
            return trimmed; // Keep it as a section header
        }
        // Otherwise, strip out all bracketed chords [G] [Am7] from the line
        let clean = line.replace(/\[.*?\]/g, '');
        // If the resulting line is a plain-text chord line, return empty so it gets filtered out
        if (isChordLine(clean)) {
            return '';
        }
        return clean;
    });

    textWithoutChords = processedLines.join('\n');
    const lines = textWithoutChords.split('\n');
    const slides = [];

    let currentSlideLines = [];
    let currentSlideType = 'Slide';
    let emptyLineCount = 0;
    let isTabBlock = false;

    // Helper to push current slide and reset
    const pushCurrentSlide = (forceType = null) => {
        if (currentSlideLines.length > 0) {
            slides.push({
                id: `slide_${slides.length}`,
                type: currentSlideType,
                lines: [...currentSlideLines]
            });
            currentSlideLines = [];
        }
        if (forceType) currentSlideType = forceType;
    };

    lines.forEach((line) => {
        let trimmed = line.trim();

        // 1. Skip Tab Blocks
        if (trimmed === '{sot}' || trimmed === '{start_of_tab}') {
            isTabBlock = true;
            return;
        }
        if (trimmed === '{eot}' || trimmed === '{end_of_tab}') {
            isTabBlock = false;
            return;
        }
        if (isTabBlock) return;

        // 2. Skip Implicit Tabs (e.g. e|---)
        const isImplicitTab = /^[A-Ga-g]\|/.test(trimmed) && (trimmed.match(/-/g) || []).length > 2;
        if (isImplicitTab) return;

        // 3. Handle Tags / Section Headers
        let isSectionHeader = false;
        let sectionName = '';

        // Match {tag: Name}
        const tagMatch = trimmed.match(/^\{tag:\s*(.*?)\}$/i);
        if (tagMatch) {
            isSectionHeader = true;
            sectionName = tagMatch[1];
        } else if (trimmed === '{endtag}') {
            return;
        } else if (trimmed.match(/^\{(.*?)\}$/) || trimmed.match(/^\[(.*?)\]$/)) {
            // Match exactly {Name} or [Name] taking up the whole line
            const isBrace = trimmed.startsWith('{');
            let inside = trimmed.slice(1, -1).trim();
            
            // CLEANUP: If it's a ChordPro comment {c: Name}, strip the 'c:' or 'comment:'
            const commentMatch = inside.match(/^(?:c|comment):\s*(.*)/i);
            if (commentMatch) {
                inside = commentMatch[1].trim();
            }

            // If it uses braces {}, it's ALWAYS a section header (User's new choice)
            // If it uses brackets [], we use our length heuristic to avoid chords
            if (isBrace || inside.length > 3 || inside.includes(' ')) {
                isSectionHeader = true;
                sectionName = inside;
            }
        }

        if (isSectionHeader) {
            pushCurrentSlide(sectionName);
            emptyLineCount = 0;
            return;
        }

        // 4. Strip chords and markup
        let cleanText = line.replace(/\[.*?\]/g, ''); // Remove chords
        cleanText = cleanText.replace(/\{(?:c|comment):\s*.*?\}/gi, ''); // Remove comments
        cleanText = cleanText.replace(/\*/g, ''); // Remove bold
        
        // Skip plain-text chord lines
        if (isChordLine(cleanText)) return;
        
        cleanText = cleanText.trim();

        // 5. Build Slides
        if (cleanText === '') {
            emptyLineCount++;
            // A single empty line = break slide (changed from 2 to prevent massive blocks)
            if (emptyLineCount >= 1) {
                pushCurrentSlide(); 
                currentSlideType = 'Continuation'; 
            }
        } else {
            emptyLineCount = 0;
            
            // Auto pagination: If a slide is getting too long (e.g. > 6 lines), break it anyway
            if (currentSlideLines.length >= 6) {
                pushCurrentSlide();
                currentSlideType = 'Continuation';
            }
            
            currentSlideLines.push(cleanText);
        }
    });

    // Push the final slide if remains
    pushCurrentSlide();

    // Final cleanup: remove any completely empty slides (shouldn't happen but just in case)
    return slides.filter(slide => slide.lines.length > 0);
}
