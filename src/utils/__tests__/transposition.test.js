import { describe, it, expect } from 'vitest';
import { transposeChord, transposeSong, getKeyInfo, getScalePreference } from '../transposition';

describe('transposition utility', () => {
    describe('transposeChord', () => {
        it('transposes simple chords upward correctly', () => {
            expect(transposeChord('C', 2)).toBe('D');
            expect(transposeChord('G', 2)).toBe('A');
            expect(transposeChord('Am', 2)).toBe('Bm');
        });

        it('transposes simple chords downward correctly', () => {
            expect(transposeChord('D', -2)).toBe('C');
            expect(transposeChord('A', -2)).toBe('G');
        });

        it('handles slash chords correctly', () => {
            expect(transposeChord('C/G', 2)).toBe('D/A');
            expect(transposeChord('Am7/G', 2)).toBe('Bm7/A');
        });

        it('respects preferFlats flag', () => {
            expect(transposeChord('C', 1, false)).toBe('C#');
            expect(transposeChord('C', 1, true)).toBe('Db');
        });

        it('returns original input for invalid or empty chords', () => {
            expect(transposeChord('', 2)).toBe('');
            expect(transposeChord(null, 2)).toBe(null);
        });
    });

    describe('getKeyInfo', () => {
        it('parses major and minor keys accurately', () => {
            expect(getKeyInfo('C')).toEqual({ index: 0, isMinor: false });
            expect(getKeyInfo('Am')).toEqual({ index: 9, isMinor: true });
            expect(getKeyInfo('F#m')).toEqual({ index: 6, isMinor: true });
        });

        it('returns null for invalid key strings', () => {
            expect(getKeyInfo('')).toBe(null);
            expect(getKeyInfo('X')).toBe(null);
            expect(getKeyInfo(null)).toBe(null);
        });
    });

    describe('getScalePreference', () => {
        it('identifies flat vs sharp preference for major keys', () => {
            expect(getScalePreference(5, false)).toBe('flat'); // F major prefers flat
            expect(getScalePreference(0, false)).toBe('sharp'); // C major
        });
    });

    describe('transposeSong', () => {
        it('transposes chords embedded in bracketed text', () => {
            const input = '[C]Louvai ao [G]Senhor [Am]nos céus';
            const output = transposeSong(input, 2);
            expect(output).toBe('[D]Louvai ao [A]Senhor [Bm]nos céus');
        });
    });
});
