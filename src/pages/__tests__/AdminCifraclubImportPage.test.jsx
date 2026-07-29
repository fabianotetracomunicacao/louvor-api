import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queue = vi.hoisted(() => ({
    searchArtists: vi.fn(),
    previewArtistCatalog: vi.fn(),
    enqueueArtist: vi.fn(),
    enqueueArtistSelection: vi.fn(),
    listImportJobs: vi.fn(),
    cancelImportJob: vi.fn(),
    resumeImportJob: vi.fn(),
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
        updated_at: '2026-07-28T17:05:00.000Z',
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
        updated_at: '2026-07-28T16:10:00.000Z',
        items: [
            {
                id: 'item-failed',
                song_name: 'Preciso de Ti',
                status: 'failed',
                attempts: 3,
                last_error: 'Resposta inválida do provedor',
                updated_at: '2026-07-28T16:12:00.000Z',
            },
        ],
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
        updated_at: '2026-07-28T11:00:00.000Z',
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
        updated_at: '2026-07-28T10:30:00.000Z',
        blocked_count: 1,
        blocked_retry_limit: 3,
        items: [
            {
                id: 'item-blocked',
                song_name: 'Me Atraiu',
                status: 'pending',
                attempts: 2,
                last_error: 'HTTP 429 do provedor',
                updated_at: '2026-07-28T10:30:00.000Z',
            },
        ],
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
        updated_at: '2026-07-28T12:00:00.000Z',
    },
    {
        id: 'job-paused-limit',
        artist_name: 'Voz da Verdade',
        status: 'paused',
        total_count: 12,
        imported_count: 2,
        skipped_count: 0,
        failed_count: 0,
        blocked_count: 3,
        blocked_retry_limit: 3,
        last_error: 'Limite de bloqueios atingido',
        next_run_at: '2026-07-31T14:45:00.000Z',
        created_at: '2026-07-28T08:00:00.000Z',
        updated_at: '2026-07-28T13:00:00.000Z',
    },
];

const catalogSongs = [
    {
        name: 'Grande é o Senhor',
        song_slug: 'grande-e-o-senhor-principal',
        version_label: 'principal',
        version_tone: 'G',
        version_verified: false,
    },
    {
        name: 'Grande E O Senhor',
        song_slug: 'grande-e-o-senhor-verificada',
        version_label: 'simplificada',
        version_tone: 'A',
        version_verified: true,
    },
    {
        name: 'Único',
        song_slug: 'unico',
        version_label: 'principal',
        version_tone: 'C',
        version_verified: false,
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
            { id: 10, name: 'Fernandinho', slug: 'fernandinho' },
        ]);
        queue.previewArtistCatalog.mockResolvedValue({
            id: 10,
            name: 'Fernandinho',
            slug: 'fernandinho',
            total: catalogSongs.length,
            songs: catalogSongs,
        });
        queue.enqueueArtist.mockResolvedValue({ id: 'new-job' });
        queue.enqueueArtistSelection.mockResolvedValue({ id: 'new-job' });
        queue.cancelImportJob.mockResolvedValue({ id: 'job-pending', status: 'cancelled' });
        queue.resumeImportJob.mockResolvedValue({ id: 'job-paused-limit', status: 'processing' });
        queue.retryImportFailures.mockResolvedValue({ id: 'job-errors', status: 'pending' });
        queue.subscribeToImportJobs.mockReturnValue(vi.fn());
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows the catalog selector and enqueues only the initially preferred versions', async () => {
        render(<AdminCifraclubImportPage />);

        const searchbox = screen.getByRole('searchbox', { name: /buscar artista/i });
        expect(screen.queryByRole('button', { name: /adicionar .* à fila/i })).not.toBeInTheDocument();

        fireEvent.change(searchbox, { target: { value: 'Fernandinho' } });
        fireEvent.submit(screen.getByRole('search'));

        const artist = await screen.findByRole('option', { name: /fernandinho/i });
        fireEvent.click(artist);
        expect(queue.previewArtistCatalog).toHaveBeenCalledWith({
            id: 10,
            name: 'Fernandinho',
            slug: 'fernandinho',
        });
        expect(await screen.findByRole('region', {
            name: 'Selecionar cifras de Fernandinho',
        })).toBeInTheDocument();
        expect(screen.getByText('2 de 3 selecionadas')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {
            name: 'Adicionar 2 selecionadas à fila',
        }));

        await waitFor(() => {
            expect(queue.enqueueArtistSelection).toHaveBeenCalledWith(
                {
                    name: 'Fernandinho',
                    slug: 'fernandinho',
                    total: 3,
                    id: 10,
                    songs: catalogSongs,
                },
                [catalogSongs[1], catalogSongs[2]],
            );
        });
        expect(searchbox).toBeEnabled();
    });

    it('preserves the current catalog selection when enqueueing fails', async () => {
        queue.enqueueArtistSelection.mockRejectedValue(new Error('Fila indisponível'));
        render(<AdminCifraclubImportPage />);

        const searchbox = screen.getByRole('searchbox', { name: /buscar artista/i });
        fireEvent.change(searchbox, { target: { value: 'Fernandinho' } });
        fireEvent.submit(screen.getByRole('search'));
        fireEvent.click(await screen.findByRole('option', { name: /fernandinho/i }));

        await screen.findByText('2 de 3 selecionadas');
        fireEvent.click(screen.getByRole('button', {
            name: 'Mostrar versões de Grande é o Senhor',
        }));
        fireEvent.click(screen.getByRole('checkbox', {
            name: /Grande é o Senhor.*principal.*tom G/i,
        }));
        fireEvent.click(screen.getByRole('button', {
            name: 'Adicionar 3 selecionadas à fila',
        }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Fila indisponível');
        expect(screen.getByText('3 de 3 selecionadas')).toBeInTheDocument();
    });

    it('keeps the newest catalog when an earlier preview resolves last', async () => {
        const fernandinhoPreview = deferred();
        const oficinaPreview = deferred();
        queue.searchArtists.mockResolvedValue([
            { id: 10, name: 'Fernandinho', slug: 'fernandinho' },
            { id: 11, name: 'Oficina G3', slug: 'oficina-g3' },
        ]);
        queue.previewArtistCatalog.mockImplementation((artist) => (
            artist.slug === 'fernandinho'
                ? fernandinhoPreview.promise
                : oficinaPreview.promise
        ));

        render(<AdminCifraclubImportPage />);
        const searchbox = screen.getByRole('searchbox', { name: /buscar artista/i });
        fireEvent.change(searchbox, { target: { value: 'gospel' } });
        fireEvent.submit(screen.getByRole('search'));

        fireEvent.click(await screen.findByRole('option', { name: /fernandinho/i }));
        fireEvent.click(screen.getByRole('option', { name: /oficina g3/i }));

        await act(async () => {
            oficinaPreview.resolve({
                id: 11,
                name: 'Oficina G3',
                slug: 'oficina-g3',
                total: 1,
                songs: [{ name: 'Resposta', song_slug: 'resposta' }],
            });
        });
        expect(await screen.findByRole('region', {
            name: 'Selecionar cifras de Oficina G3',
        })).toBeInTheDocument();

        await act(async () => {
            fernandinhoPreview.resolve({
                id: 10,
                name: 'Fernandinho',
                slug: 'fernandinho',
                total: 1,
                songs: [{ name: 'Galileu', song_slug: 'galileu' }],
            });
        });
        expect(screen.getByRole('region', {
            name: 'Selecionar cifras de Oficina G3',
        })).toBeInTheDocument();
        expect(screen.queryByRole('region', {
            name: 'Selecionar cifras de Fernandinho',
        })).not.toBeInTheDocument();
    });

    it('shows progress, automatic and manual pauses, item errors, attempts, and last activity', async () => {
        render(<AdminCifraclubImportPage />);

        expect(await screen.findByText('Artista em execução: Fernandinho')).toBeInTheDocument();
        const processingJob = screen.getByRole('heading', { name: 'Fernandinho' }).closest('article');
        expect(within(processingJob).getByText('80%')).toBeInTheDocument();
        expect(within(processingJob).getByText('5 importadas')).toBeInTheDocument();
        expect(within(processingJob).getByText('2 ignoradas')).toBeInTheDocument();
        expect(within(processingJob).getByText('1 falha')).toBeInTheDocument();
        expect(within(processingJob).getByText('Ordem 1')).toBeInTheDocument();
        expect(screen.getAllByText('Pausada')).toHaveLength(2);
        expect(screen.getByText('Cifra indisponível')).toBeInTheDocument();
        const pausedJob = screen.getByRole('heading', { name: 'Gabriela Rocha' }).closest('article');
        expect(within(pausedJob).getByText('4 de 20')).toBeInTheDocument();
        expect(within(pausedJob).getByText(/Nova tentativa automática: 30\/07\/2026/)).toBeInTheDocument();
        expect(within(pausedJob).getByText('Me Atraiu')).toBeInTheDocument();
        expect(within(pausedJob).getByText('2 tentativas')).toBeInTheDocument();
        expect(within(pausedJob).getByText('HTTP 429 do provedor')).toBeInTheDocument();
        expect(within(pausedJob).getByText('Ordem 2')).toBeInTheDocument();

        const failedJob = screen.getByRole('heading', { name: 'Diante do Trono' }).closest('article');
        expect(within(failedJob).getByText('Preciso de Ti')).toBeInTheDocument();
        expect(within(failedJob).getByText('3 tentativas')).toBeInTheDocument();
        expect(within(failedJob).getByText('Resposta inválida do provedor')).toBeInTheDocument();
        expect(within(failedJob).getByText(/Última atividade: 28\/07\/2026/)).toBeInTheDocument();

        const manuallyPausedJob = screen.getByRole('heading', { name: 'Voz da Verdade' }).closest('article');
        expect(within(manuallyPausedJob).getByText(/Retomada manual necessária/)).toBeInTheDocument();
        expect(within(manuallyPausedJob).queryByText(/Nova tentativa automática/)).not.toBeInTheDocument();
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
            secondSearch.resolve([{ id: 11, name: 'Oficina G3', slug: 'oficina-g3' }]);
        });
        expect(await screen.findByRole('option', { name: /oficina g3/i })).toBeInTheDocument();

        await act(async () => {
            firstSearch.resolve([{ id: 10, name: 'Fernandinho', slug: 'fernandinho' }]);
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
            'Gabriela Rocha',
            'Gabriel Guedes',
            'Aline Barros',
            'Diante do Trono',
            'Voz da Verdade',
        ]);
    });

    it('allows cancelling pending jobs, retrying failures, and resuming a hard pause', async () => {
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

        const resumeButton = screen.getByRole('button', {
            name: 'Retomar importação de Voz da Verdade',
        });
        fireEvent.click(resumeButton);

        await waitFor(() => {
            expect(queue.resumeImportJob).toHaveBeenCalledWith('job-paused-limit');
        });
        expect(screen.queryByRole('button', {
            name: 'Retomar importação de Gabriela Rocha',
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
