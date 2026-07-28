import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUser, insert, maybeSingle, single, update, supabase } = vi.hoisted(() => {
    const single = vi.fn();
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const maybeSingle = vi.fn();
    const updateSelect = vi.fn(() => ({ maybeSingle }));
    const eq = vi.fn(() => ({ select: updateSelect }));
    const update = vi.fn(() => ({ eq }));
    const getUser = vi.fn();

    return {
        getUser,
        insert,
        maybeSingle,
        single,
        update,
        supabase: {
            auth: { getUser },
            from: vi.fn(() => ({ insert, update })),
        },
    };
});

vi.mock('../../supabaseClient', () => ({ supabase }));
vi.mock('../../services/WhatsAppService', () => ({ WhatsAppService: {} }));

import { saveSong } from '../storage';

describe('saveSong Cifra Club metadata', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
        single.mockResolvedValue({
            data: { id: 'song-1', title: 'Galileu', artist: 'Fernandinho', content: '[G]Galileu' },
            error: null,
        });
    });

    it('includes snake_case Cifra Club metadata in a manual save', async () => {
        await saveSong({
            title: 'Galileu',
            artist: 'Fernandinho',
            content: '[G]Galileu',
            cifraclub_slug: 'fernandinho/galileu',
            is_official: true,
        });

        expect(insert).toHaveBeenCalledWith([
            expect.objectContaining({
                title: 'Galileu',
                artist: 'Fernandinho',
                content: '[G]Galileu',
                cifraclub_slug: 'fernandinho/galileu',
                is_official: true,
                created_by: 'user-1',
            }),
        ]);
    });

    it('maps camelCase Cifra Club metadata to the database payload', async () => {
        await saveSong({
            title: 'Galileu',
            artist: 'Fernandinho',
            content: '[G]Galileu',
            cifraclubSlug: 'fernandinho/galileu',
            isOfficial: true,
        });

        expect(insert).toHaveBeenCalledWith([
            expect.objectContaining({
                cifraclub_slug: 'fernandinho/galileu',
                is_official: true,
            }),
        ]);
    });

    it('keeps metadata out of updates when the editor did not provide it', async () => {
        maybeSingle.mockResolvedValue({
            data: {
                id: 'song-1',
                title: 'Galileu',
                artist: 'Fernandinho',
                content: '[G]Galileu',
                cifraclub_slug: 'fernandinho/galileu',
                is_official: true,
            },
            error: null,
        });

        await saveSong({
            id: 'song-1',
            title: 'Galileu',
            artist: 'Fernandinho',
            content: '[G]Galileu',
        });

        const payload = update.mock.calls[0][0];
        expect(payload).not.toHaveProperty('cifraclub_slug');
        expect(payload).not.toHaveProperty('is_official');
    });

    it('keeps explicit false official metadata in an update payload', async () => {
        maybeSingle.mockResolvedValue({
            data: { id: 'song-1', title: 'Galileu', artist: 'Fernandinho', content: '[G]Galileu' },
            error: null,
        });

        await saveSong({
            id: 'song-1',
            title: 'Galileu',
            artist: 'Fernandinho',
            content: '[G]Galileu',
            cifraclubSlug: 'fernandinho/galileu',
            isOfficial: false,
        });

        expect(update).toHaveBeenCalledWith(expect.objectContaining({
            cifraclub_slug: 'fernandinho/galileu',
            is_official: false,
        }));
    });

    it('uses metadata defaults when creating a manual song without them', async () => {
        await saveSong({
            title: 'Galileu',
            artist: 'Fernandinho',
            content: '[G]Galileu',
        });

        expect(insert).toHaveBeenCalledWith([
            expect.objectContaining({
                cifraclub_slug: null,
                is_official: false,
            }),
        ]);
    });

    it('returns Cifra Club metadata with both editor naming conventions', async () => {
        maybeSingle.mockResolvedValue({
            data: {
                id: 'song-1',
                title: 'Galileu',
                artist: 'Fernandinho',
                content: '[G]Galileu',
                cifraclub_slug: 'fernandinho/galileu',
                is_official: true,
            },
            error: null,
        });

        const song = await saveSong({
            id: 'song-1',
            title: 'Galileu',
            artist: 'Fernandinho',
            content: '[G]Galileu',
        });

        expect(song).toMatchObject({
            cifraclub_slug: 'fernandinho/galileu',
            cifraclubSlug: 'fernandinho/galileu',
            is_official: true,
            isOfficial: true,
        });
    });
});
