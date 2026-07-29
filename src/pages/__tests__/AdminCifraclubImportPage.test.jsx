import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queue = vi.hoisted(() => ({
    searchArtists: vi.fn(),
    enqueueArtist: vi.fn(),
    listImportJobs: vi.fn(),
    cancelImportJob: vi.fn(),
    retryImportFailures: vi.fn(),
    subscribeToImportJobs: vi.fn(),
}));

vi.mock('../../services/cifraclubImportQueue', () => queue);

import { AdminCifraclubImportPage } from '../AdminCifraclubImportPage';

const jobs = [
    {
        id: 'job-completed',
        artist_name: 'Aline Barros',
        status: 'completed',
        total_count: 5,
        imported_count: 5,
        skipped_count: 0,
        failed_count: 0,
        created_at: '2026-07-28T17:00:00.000Z',
    },
    {
        id: 'job-errors',
        artist_name: 'Diante do Trono',
        status: 'completed_with_errors',
        total_count: 6,
        imported_count: 4,
        skipped_count: 0,
        failed_count: 2,
        last_error: 'Cifra indisponível',
        created_at: '2026-07-28T16:00:00.000Z',
    },
    {
        id: 'job-pending',
        artist_name: 'Gabriel Guedes',
        status: 'pending',
        total_count: 8,
        imported_count: 0,
        skipped_count: 0,
        failed_count: 0,
        created_at: '2026-07-28T11:00:00.000Z',
    },
    {
        id: 'job-paused',
        artist_name: 'Gabriela Rocha',
        status: 'paused',
        total_count: 20,
        imported_count: 4,
        skipped_count: 0,
        failed_count: 0,
        last_error: 'Aguardando nova tentativa do provedor',
        next_run_at: '2026-07-30T14:45:00.000Z',
        created_at: '2026-07-28T10:00:00.000Z',
    },
    {
        id: 'job-processing',
        artist_name: 'Fernandinho',
        status: 'processing',
        total_count: 10,
        imported_count: 5,
        skipped_count: 2,
        failed_count: 1,
        created_at: '2026-07-28T09:00:00.000Z',
    },
];

function deferred() {
    let resolve;
    const promise = new Promise((resolvePromise) => {
        resolve = resolvePromise;
    });

    return { promise, resolve };
}

describe('AdminCifraclubImportPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        queue.listImportJobs.mockResolvedValue(jobs);
        queue.searchArtists.mockResolvedValue([
            { name: 'Fernandinho', slug: 'fernandinho', total: 154 },
        ]);
        queue.enqueueArtist.mockResolvedValue({ id: 'new-job' });
        queue.cancelImportJob.mockResolvedValue({ id: 'job-pending', status: 'cancelled' });
        queue.retryImportFailures.mockResolvedValue({ id: 'job-errors', status: 'pending' });
        queue.subscribeToImportJobs.mockReturnValue(vi.fn());
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('requires selecting an artist before enqueueing while search remains available during a queue', async () => {
        render(<AdminCifraclubImportPage />);

        const searchbox = screen.getByRole('searchbox', { name: /buscar artista/i });
        const addButton = screen.getByRole('button', { name: /adicionar à fila/i });

        expect(addButton).toBeDisabled();

        fireEvent.change(searchbox, { target: { value: 'Fernandinho' } });
        fireEvent.submit(screen.getByRole('search'));

        const artist = await screen.findByRole('option', { name: /fernandinho/i });
        fireEvent.click(artist);
        fireEvent.click(addButton);

        await waitFor(() => {
            expect(queue.enqueueArtist).toHaveBeenCalledWith({
                name: 'Fernandinho',
                slug: 'fernandinho',
                total: 154,
            });
        });
        expect(searchbox).toBeEnabled();
    });

    it('shows progress, paused jobs, queue order, and job errors', async () => {
        render(<AdminCifraclubImportPage />);

        expect(await screen.findByText('Artista em execução: Fernandinho')).toBeInTheDocument();
        const processingJob = screen.getByRole('heading', { name: 'Fernandinho' }).closest('article');
        expect(within(processingJob).getByText('80%')).toBeInTheDocument();
        expect(within(processingJob).getByText('5 importadas')).toBeInTheDocument();
        expect(within(processingJob).getByText('2 ignoradas')).toBeInTheDocument();
        expect(within(processingJob).getByText('1 falha')).toBeInTheDocument();
        expect(within(processingJob).getByText('Ordem 1')).toBeInTheDocument();
        expect(screen.getByText('Pausada')).toBeInTheDocument();
        expect(screen.getByText('Cifra indisponível')).toBeInTheDocument();
        const pausedJob = screen.getByRole('heading', { name: 'Gabriela Rocha' }).closest('article');
        expect(within(pausedJob).getByText('4 de 20')).toBeInTheDocument();
        expect(within(pausedJob).getByText(/Próxima tentativa: 30\/07\/2026/)).toBeInTheDocument();
        expect(within(pausedJob).queryByText(/^Ordem/)).not.toBeInTheDocument();
    });

    it('keeps the latest artist results when earlier searches resolve last', async () => {
        const firstSearch = deferred();
        const secondSearch = deferred();
        queue.searchArtists.mockImplementation((artistQuery) => (
            artistQuery === 'Fernandinho' ? firstSearch.promise : secondSearch.promise
        ));

        render(<AdminCifraclubImportPage />);

        const searchbox = screen.getByRole('searchbox', { name: /buscar artista/i });
        const searchForm = screen.getByRole('search');
        fireEvent.change(searchbox, { target: { value: 'Fernandinho' } });
        await act(async () => {
            await Promise.resolve();
        });
        fireEvent.submit(searchForm);
        await waitFor(() => expect(queue.searchArtists).toHaveBeenCalledTimes(1));
        fireEvent.change(searchbox, { target: { value: 'Oficina G3' } });
        await act(async () => {
            await Promise.resolve();
        });
        fireEvent.submit(searchForm);
        await waitFor(() => expect(queue.searchArtists).toHaveBeenCalledTimes(2));
        expect(queue.searchArtists).toHaveBeenNthCalledWith(1, 'Fernandinho');
        expect(queue.searchArtists).toHaveBeenNthCalledWith(2, 'Oficina G3');

        await act(async () => {
            secondSearch.resolve([{ name: 'Oficina G3', slug: 'oficina-g3', total: 80 }]);
        });
        expect(await screen.findByRole('option', { name: /oficina g3/i })).toBeInTheDocument();

        await act(async () => {
            firstSearch.resolve([{ name: 'Fernandinho', slug: 'fernandinho', total: 154 }]);
        });
        expect(screen.getByRole('option', { name: /oficina g3/i })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: /fernandinho/i })).not.toBeInTheDocument();
    });

    it('keeps the newest queue snapshot when an older realtime refresh resolves later', async () => {
        const staleRefresh = deferred();
        const freshRefresh = deferred();
        let onRealtimeChange;
        queue.listImportJobs
            .mockResolvedValueOnce([{ ...jobs[4], artist_name: 'Estado inicial' }])
            .mockReturnValueOnce(staleRefresh.promise)
            .mockReturnValueOnce(freshRefresh.promise);
        queue.subscribeToImportJobs.mockImplementation((callback) => {
            onRealtimeChange = callback;
            return vi.fn();
        });

        render(<AdminCifraclubImportPage />);
        expect(await screen.findByRole('heading', { name: 'Estado inicial' })).toBeInTheDocument();

        act(() => onRealtimeChange());
        act(() => onRealtimeChange());

        await act(async () => {
            freshRefresh.resolve([{ ...jobs[4], artist_name: 'Estado recente', status: 'completed' }]);
        });
        expect(await screen.findByRole('heading', { name: 'Estado recente' })).toBeInTheDocument();

        await act(async () => {
            staleRefresh.resolve([{ ...jobs[4], artist_name: 'Estado antigo', status: 'pending' }]);
        });
        expect(screen.getByRole('heading', { name: 'Estado recente' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Estado antigo' })).not.toBeInTheDocument();
    });

    it('shows queued jobs in FIFO order before reverse-chronological history', async () => {
        render(<AdminCifraclubImportPage />);

        await screen.findByRole('heading', { name: 'Fernandinho' });
        expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
            'Fernandinho',
            'Gabriel Guedes',
            'Aline Barros',
            'Diante do Trono',
            'Gabriela Rocha',
        ]);
    });

    it('allows cancelling only pending jobs and retrying only completed jobs with errors', async () => {
        render(<AdminCifraclubImportPage />);

        const cancelButton = await screen.findByRole('button', {
            name: 'Cancelar importação de Gabriel Guedes',
        });
        fireEvent.click(cancelButton);

        await waitFor(() => {
            expect(queue.cancelImportJob).toHaveBeenCalledWith('job-pending');
        });
        expect(screen.queryByRole('button', {
            name: 'Cancelar importação de Fernandinho',
        })).not.toBeInTheDocument();

        const retryButton = screen.getByRole('button', {
            name: 'Tentar novamente Diante do Trono',
        });
        fireEvent.click(retryButton);

        await waitFor(() => {
            expect(queue.retryImportFailures).toHaveBeenCalledWith('job-errors');
        });
        expect(screen.queryByRole('button', {
            name: 'Tentar novamente Aline Barros',
        })).not.toBeInTheDocument();
    });

    it('cleans up realtime subscription and polling when unmounted', async () => {
        vi.useFakeTimers();
        const unsubscribe = vi.fn();
        queue.subscribeToImportJobs.mockReturnValue(unsubscribe);
        queue.listImportJobs.mockResolvedValue([]);

        const { unmount } = render(<AdminCifraclubImportPage />);

        await act(async () => {
            await Promise.resolve();
        });
        expect(queue.listImportJobs).toHaveBeenCalledTimes(1);

        unmount();
        expect(unsubscribe).toHaveBeenCalledOnce();

        await act(async () => {
            vi.advanceTimersByTime(30_000);
        });
        expect(queue.listImportJobs).toHaveBeenCalledTimes(1);
    });
});
