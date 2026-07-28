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
        id: 'job-processing',
        artist_name: 'Fernandinho',
        status: 'processing',
        total_count: 10,
        imported_count: 5,
        skipped_count: 2,
        failed_count: 1,
    },
    {
        id: 'job-paused',
        artist_name: 'Gabriela Rocha',
        status: 'paused',
        total_count: 20,
        imported_count: 4,
        skipped_count: 0,
        failed_count: 0,
    },
    {
        id: 'job-pending',
        artist_name: 'Gabriel Guedes',
        status: 'pending',
        total_count: 8,
        imported_count: 0,
        skipped_count: 0,
        failed_count: 0,
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
    },
    {
        id: 'job-completed',
        artist_name: 'Aline Barros',
        status: 'completed',
        total_count: 5,
        imported_count: 5,
        skipped_count: 0,
        failed_count: 0,
    },
];

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
        expect(screen.getByText('Pausada')).toBeInTheDocument();
        expect(screen.getByText('Cifra indisponível')).toBeInTheDocument();
        expect(screen.getByText('Ordem 1')).toBeInTheDocument();
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
