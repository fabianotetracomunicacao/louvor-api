// Utility to compare strings (Levenshtein / Jaccard)

// Normalize text: remove punctuation, lowercase, extra spaces
export const normalizeText = (text) => {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, "") // remove accents
        .replace(/\[.*?\]/g, "") // remove [music], [sound] etc
        .replace(/\(.*?\)/g, "") // remove (vocals) etc
        .replace(/[.,/#!$%^&*;:{}=\-_`~]/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
};

// Calculate Levenshtein Distance
export const levenshteinDistance = (a, b) => {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

// Calculate Similarity (0 to 1)
export const calculateSimilarity = (str1, str2) => {
    const s1 = normalizeText(str1);
    const s2 = normalizeText(str2);
    if (!s1 || !s2) return 0;

    // Optimization: If strings are very different lengths, don't bother
    if (Math.abs(s1.length - s2.length) > 50) return 0.1;

    const distance = levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    return 1 - distance / maxLength;
};

// Check if the END of the transcript matches the START of the target block
// This is crucial because "Transcript" grows indefinitely.
export const checkMatch = (transcript, targetBlockText) => {
    const tNormalized = normalizeText(transcript);
    const bNormalized = normalizeText(targetBlockText);

    if (tNormalized.length < bNormalized.length * 0.5) return 0; // Optimization

    // Try multiple windows at the end of the transcript to find best alignment
    // This allows for some buffer (noise) at the end or start without penalizing too much
    // if we accidentally capture a bit of the previous word.

    const lengthsToTry = [
        bNormalized.length,
        bNormalized.length + 5,
        bNormalized.length + 10,
        bNormalized.length + 20
    ];

    let maxSimilarity = 0;

    for (let len of lengthsToTry) {
        if (len > tNormalized.length) len = tNormalized.length;

        const relevantTranscript = tNormalized.slice(-len);
        // We compare the extracted suffix against the target.
        // Note: calculateSimilarity handles length difference somewhat, 
        // but closest length usually wins.
        const sim = calculateSimilarity(relevantTranscript, bNormalized);

        if (sim > maxSimilarity) {
            maxSimilarity = sim;
        }
    }

    return maxSimilarity;
};
