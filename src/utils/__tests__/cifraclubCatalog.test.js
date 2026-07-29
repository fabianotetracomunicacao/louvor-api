import { describe, expect, it } from 'vitest';
import {
    getInitialCatalogSelection,
    groupCatalogSongs,
    normalizeCatalogTitle,
} from '../cifraclubCatalog';

function song(overrides) {
    return {
        name: 'Canção',
        song_slug: 'cancao',
        version_verified: false,
        version_label: null,
        version_tone: null,
        ...overrides,
    };
}

describe('CifraClub catalog grouping', () => {
    it('normalizes accents, case, punctuation and whitespace', () => {
        expect(normalizeCatalogTitle('  Único, Amor! ')).toBe('unico amor');
    });

    it('groups equivalent titles but preserves meaningful parenthetical words', () => {
        const groups = groupCatalogSongs([
            song({ name: 'Único Amor', song_slug: 'unico-amor-a' }),
            song({ name: 'Unico Amor!', song_slug: 'unico-amor-b' }),
            song({ name: 'Único Amor (Reprise)', song_slug: 'unico-amor-reprise' }),
        ]);

        expect(groups).toHaveLength(2);
        expect(groups[0].versions).toHaveLength(2);
        expect(groups[1].versions).toHaveLength(1);
    });

    it('prefers verified, principal and toned versions in that order', () => {
        const groups = groupCatalogSongs([
            song({
                name: 'Único Amor',
                song_slug: 'com-tom',
                version_tone: 'G',
            }),
            song({
                name: 'Unico Amor',
                song_slug: 'principal',
                version_label: 'principal',
            }),
            song({
                name: 'Único, Amor!',
                song_slug: 'verificada',
                version_verified: true,
            }),
        ]);

        expect(groups[0].versions.map((version) => version.song_slug)).toEqual([
            'verificada',
            'principal',
            'com-tom',
        ]);
        expect(groups[0].preferred.song_slug).toBe('verificada');
        expect([...getInitialCatalogSelection(groups)]).toEqual(['verificada']);
    });

    it('uses original order and slug as stable tie breakers', () => {
        const groups = groupCatalogSongs([
            song({ name: 'Mesmo Título', song_slug: 'z-versao' }),
            song({ name: 'Mesmo Titulo', song_slug: 'a-versao' }),
        ]);

        expect(groups[0].preferred.song_slug).toBe('z-versao');
        expect(groups[0].versions.map((version) => version.song_slug)).toEqual([
            'z-versao',
            'a-versao',
        ]);
    });

    it('ignores unusable songs and groups with empty normalized titles', () => {
        const groups = groupCatalogSongs([
            song({ name: '', song_slug: 'sem-nome' }),
            song({ name: 'Válida', song_slug: '' }),
            song({ name: 'Válida', song_slug: 'valida' }),
            null,
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0].preferred.song_slug).toBe('valida');
    });
});
