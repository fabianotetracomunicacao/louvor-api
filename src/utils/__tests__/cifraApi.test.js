import { describe, expect, it } from 'vitest';
import { normalizeCifraApiBase } from '../cifraApi';

describe('Cifra API URL', () => {
    it('adds the API prefix when the configured URL is the service root', () => {
        expect(normalizeCifraApiBase('https://louvor-api-yt4e.onrender.com')).toBe(
            'https://louvor-api-yt4e.onrender.com/api',
        );
    });

    it('keeps an existing API prefix without duplicating it', () => {
        expect(normalizeCifraApiBase('https://louvor-api-yt4e.onrender.com/api/')).toBe(
            'https://louvor-api-yt4e.onrender.com/api',
        );
    });
});
