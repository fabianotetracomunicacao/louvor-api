import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUser, insert, single, supabase } = vi.hoisted(() => {
    const single = vi.fn();
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const getUser = vi.fn();

    return {
        getUser,
        insert,
        single,
        supabase: {
            auth: { getUser },
            from: vi.fn(() => ({ insert })),
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
});
