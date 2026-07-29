import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({
    supabase: {
        rpc: vi.fn(),
        from: vi.fn(),
        channel: vi.fn(),
        removeChannel: vi.fn(),
    },
}));

vi.mock('../../supabaseClient', () => ({ supabase }));

import {
    cancelImportJob,
    enqueueArtist,
    listImportJobs,
    previewArtistCatalog,
    resumeImportJob,
    retryImportFailures,
    searchArtists,
    subscribeToImportJobs,
} from '../cifraclubImportQueue';

describe('cifraclub import queue client', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn());
    });

    it('searches artist suggestions through the configured Cifra API', async () => {
        fetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({
                artists: [{ id: 10, name: 'Oficina G3', slug: 'oficina-g3' }],
            }),
        });

        const artists = await searchArtists('Oficina G3');

        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/artists/suggest?q=Oficina%20G3'),
        );
        expect(artists).toEqual([{ id: 10, name: 'Oficina G3', slug: 'oficina-g3' }]);
    });

    it('previews the exact selected catalog before enqueueing', async () => {
        fetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({
                artist: { id: 10, name: 'Oficina G3', slug: 'oficina-g3' },
                songs: [{ song_slug: 'resposta' }, { song_slug: 'ele-vive' }],
                total: 2,
            }),
        });

        const artist = await previewArtistCatalog({
            id: 10,
            name: 'Oficina G3',
            slug: 'oficina-g3',
        });

        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/artists/oficina-g3/catalog'),
        );
        expect(artist).toEqual({
            id: 10,
            name: 'Oficina G3',
            slug: 'oficina-g3',
            total: 2,
        });
    });

    it('sends the selected artist to the enqueue RPC', async () => {
        supabase.rpc.mockResolvedValue({ data: { id: 'job-1' }, error: null });

        await enqueueArtist({ name: 'Oficina G3', slug: 'oficina-g3', total: 80 });

        expect(supabase.rpc).toHaveBeenCalledWith('enqueue_cifraclub_import', {
            p_artist_name: 'Oficina G3',
            p_artist_slug: 'oficina-g3',
            p_estimated_total: 80,
        });
    });

    it('rejects enqueueing a suggestion whose catalog total was not previewed', async () => {
        await expect(enqueueArtist({
            id: 10,
            name: 'Oficina G3',
            slug: 'oficina-g3',
        })).rejects.toThrow(/total/i);

        expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('lists jobs with their import items in newest-first order', async () => {
        const order = vi.fn().mockResolvedValue({ data: [{ id: 'job-1' }], error: null });
        const select = vi.fn().mockReturnValue({ order });
        supabase.from.mockReturnValue({ select });

        await expect(listImportJobs()).resolves.toEqual([{ id: 'job-1' }]);

        expect(supabase.from).toHaveBeenCalledWith('cifraclub_import_jobs');
        expect(select).toHaveBeenCalledWith('*, items:cifraclub_import_items(*)');
        expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('cancels a job through the cancellation RPC', async () => {
        supabase.rpc.mockResolvedValue({ data: { id: 'job-1', status: 'cancelled' }, error: null });

        await cancelImportJob('job-1');

        expect(supabase.rpc).toHaveBeenCalledWith('cancel_cifraclub_import', { p_job_id: 'job-1' });
    });

    it('retries failed job items through the retry RPC', async () => {
        supabase.rpc.mockResolvedValue({ data: { id: 'job-1' }, error: null });

        await retryImportFailures('job-1');

        expect(supabase.rpc).toHaveBeenCalledWith('retry_cifraclub_import_failures', { p_job_id: 'job-1' });
    });

    it('resumes a manually paused job through the protected RPC', async () => {
        supabase.rpc.mockResolvedValue({ data: { id: 'job-1', status: 'processing' }, error: null });

        await resumeImportJob('job-1');

        expect(supabase.rpc).toHaveBeenCalledWith('resume_cifraclub_import', { p_job_id: 'job-1' });
    });

    it('subscribes to job and item changes and removes the channel on cleanup', () => {
        const callback = vi.fn();
        const channel = {
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn().mockReturnThis(),
        };
        supabase.channel.mockReturnValue(channel);

        const unsubscribe = subscribeToImportJobs(callback);
        const jobChange = channel.on.mock.calls[0][2];
        const itemChange = channel.on.mock.calls[1][2];

        jobChange({ eventType: 'UPDATE', new: { id: 'job-1' } });
        itemChange({ eventType: 'INSERT', new: { id: 'item-1' } });
        unsubscribe();

        expect(channel.on).toHaveBeenNthCalledWith(
            1,
            'postgres_changes',
            { event: '*', schema: 'public', table: 'cifraclub_import_jobs' },
            expect.any(Function),
        );
        expect(channel.on).toHaveBeenNthCalledWith(
            2,
            'postgres_changes',
            { event: '*', schema: 'public', table: 'cifraclub_import_items' },
            expect.any(Function),
        );
        expect(callback).toHaveBeenCalledTimes(2);
        expect(channel.subscribe).toHaveBeenCalledOnce();
        expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
    });
});
