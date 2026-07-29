import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    CheckCircle2,
    CirclePause,
    ListMusic,
    RotateCcw,
    Search,
    XCircle,
} from 'lucide-react';
import {
    cancelImportJob,
    enqueueArtist,
    listImportJobs,
    previewArtistCatalog,
    resumeImportJob,
    retryImportFailures,
    searchArtists,
    subscribeToImportJobs,
} from '../services/cifraclubImportQueue';

const STATUS = {
    pending: { label: 'Na fila', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
    discovering: { label: 'Descobrindo', className: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
    processing: { label: 'Importando', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' },
    paused: { label: 'Pausada', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
    completed: { label: 'Concluída', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
    completed_with_errors: { label: 'Concluída com erros', className: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
    cancelled: { label: 'Cancelada', className: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
};

const QUEUE_STATUSES = new Set(['pending', 'discovering', 'processing']);

function getErrorMessage(error, fallback) {
    return error instanceof Error && error.message ? error.message : fallback;
}

function getProgress(job) {
    const completed = getCompletedCount(job);
    const total = job.total_count || job.items?.length || 0;

    if (total === 0) {
        return job.status === 'completed' || job.status === 'completed_with_errors' ? 100 : 0;
    }

    return Math.min(100, Math.round((completed / total) * 100));
}

function getCompletedCount(job) {
    return (job.imported_count || 0) + (job.skipped_count || 0) + (job.failed_count || 0);
}

function isQueuedJob(job) {
    return QUEUE_STATUSES.has(job.status) || isAutomaticallyPaused(job);
}

function getBlockedRetryLimit(job) {
    return Number.isInteger(job.blocked_retry_limit) && job.blocked_retry_limit > 0
        ? job.blocked_retry_limit
        : 3;
}

function isAutomaticallyPaused(job) {
    const blockedCount = job.blocked_count || 0;
    return job.status === 'paused'
        && blockedCount > 0
        && blockedCount < getBlockedRetryLimit(job);
}

function getCreatedAt(job) {
    const timestamp = Date.parse(job.created_at || '');
    return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortJobsForDisplay(jobs) {
    const queuedJobs = jobs.filter(isQueuedJob).sort((left, right) => getCreatedAt(left) - getCreatedAt(right));
    const historicalJobs = jobs.filter((job) => !isQueuedJob(job)).sort((left, right) => getCreatedAt(right) - getCreatedAt(left));

    return [...queuedJobs, ...historicalJobs];
}

function formatNextRunAt(nextRunAt) {
    const date = new Date(nextRunAt);

    if (!nextRunAt || Number.isNaN(date.getTime())) return 'não agendada';

    return date.toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
    });
}

function getLastActivityAt(job) {
    const activityTimes = [
        job.updated_at,
        ...(job.items || []).map((item) => item.updated_at),
    ]
        .map((value) => Date.parse(value || ''))
        .filter((value) => !Number.isNaN(value));

    return activityTimes.length > 0
        ? new Date(Math.max(...activityTimes)).toISOString()
        : null;
}

function getItemErrors(job) {
    return (job.items || [])
        .filter((item) => item.last_error)
        .sort((left, right) => Date.parse(right.updated_at || '') - Date.parse(left.updated_at || ''));
}

function JobStatus({ status }) {
    const config = STATUS[status] || { label: status, className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
    const Icon = status === 'paused'
        ? CirclePause
        : status === 'completed'
            ? CheckCircle2
            : status === 'completed_with_errors' || status === 'cancelled'
                ? XCircle
                : ListMusic;

    return (
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${config.className}`}>
            <Icon size={14} aria-hidden="true" />
            {config.label}
        </span>
    );
}

export function AdminCifraclubImportPage() {
    const [query, setQuery] = useState('');
    const [artists, setArtists] = useState([]);
    const [selectedArtist, setSelectedArtist] = useState(null);
    const [jobs, setJobs] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [previewingSlug, setPreviewingSlug] = useState(null);
    const [isEnqueueing, setIsEnqueueing] = useState(false);
    const [actionJobId, setActionJobId] = useState(null);
    const [searchError, setSearchError] = useState('');
    const [queueError, setQueueError] = useState('');
    const searchRequestId = useRef(0);
    const previewRequestId = useRef(0);
    const refreshRequestId = useRef(0);
    const isMounted = useRef(false);

    const displayedJobs = useMemo(() => sortJobsForDisplay(jobs), [jobs]);

    const activeJob = useMemo(
        () => jobs.find((job) => job.status === 'discovering' || job.status === 'processing'),
        [jobs],
    );

    const refreshJobs = useCallback(async () => {
        const requestId = ++refreshRequestId.current;

        try {
            const nextJobs = await listImportJobs();
            if (!isMounted.current || requestId !== refreshRequestId.current) return;

            setJobs(nextJobs);
            setQueueError('');
        } catch (error) {
            if (!isMounted.current || requestId !== refreshRequestId.current) return;

            setQueueError(getErrorMessage(error, 'Não foi possível atualizar a fila de importação.'));
        }
    }, []);

    useEffect(() => {
        isMounted.current = true;
        void refreshJobs();
        const unsubscribe = subscribeToImportJobs(() => void refreshJobs());
        const pollId = window.setInterval(() => void refreshJobs(), 30_000);

        return () => {
            isMounted.current = false;
            window.clearInterval(pollId);
            unsubscribe?.();
        };
    }, [refreshJobs]);

    const handleQueryChange = (event) => {
        searchRequestId.current += 1;
        previewRequestId.current += 1;
        setQuery(event.target.value);
        setArtists([]);
        setSelectedArtist(null);
        setPreviewingSlug(null);
        setSearchError('');
        setIsSearching(false);
    };

    const handleSearch = async (event) => {
        event.preventDefault();
        const normalizedQuery = query.trim();

        if (!normalizedQuery) return;

        const requestId = ++searchRequestId.current;
        previewRequestId.current += 1;
        setSearchError('');
        setSelectedArtist(null);
        setPreviewingSlug(null);
        setIsSearching(true);

        try {
            const foundArtists = await searchArtists(normalizedQuery);
            if (requestId !== searchRequestId.current) return;

            setArtists(foundArtists);
        } catch (error) {
            if (requestId !== searchRequestId.current) return;

            setArtists([]);
            setSearchError(getErrorMessage(error, 'Não foi possível buscar artistas.'));
        } finally {
            if (requestId === searchRequestId.current) {
                setIsSearching(false);
            }
        }
    };

    const handleSelectArtist = async (artist) => {
        const requestId = ++previewRequestId.current;
        setSelectedArtist(null);
        setPreviewingSlug(artist.slug);
        setSearchError('');

        try {
            const previewedArtist = await previewArtistCatalog(artist);
            if (requestId !== previewRequestId.current) return;

            setSelectedArtist(previewedArtist);
        } catch (error) {
            if (requestId !== previewRequestId.current) return;

            setSearchError(getErrorMessage(error, 'Não foi possível consultar o catálogo do artista.'));
        } finally {
            if (requestId === previewRequestId.current) {
                setPreviewingSlug(null);
            }
        }
    };

    const handleEnqueue = async () => {
        if (!selectedArtist) return;

        setIsEnqueueing(true);
        setQueueError('');

        try {
            await enqueueArtist(selectedArtist);
            setSelectedArtist(null);
            await refreshJobs();
        } catch (error) {
            setQueueError(getErrorMessage(error, 'Não foi possível adicionar o artista à fila.'));
        } finally {
            setIsEnqueueing(false);
        }
    };

    const handleCancel = async (job) => {
        setActionJobId(job.id);
        setQueueError('');

        try {
            await cancelImportJob(job.id);
            await refreshJobs();
        } catch (error) {
            setQueueError(getErrorMessage(error, 'Não foi possível cancelar a importação.'));
        } finally {
            setActionJobId(null);
        }
    };

    const handleRetry = async (job) => {
        setActionJobId(job.id);
        setQueueError('');

        try {
            await retryImportFailures(job.id);
            await refreshJobs();
        } catch (error) {
            setQueueError(getErrorMessage(error, 'Não foi possível tentar a importação novamente.'));
        } finally {
            setActionJobId(null);
        }
    };

    const handleResume = async (job) => {
        setActionJobId(job.id);
        setQueueError('');

        try {
            await resumeImportJob(job.id);
            await refreshJobs();
        } catch (error) {
            setQueueError(getErrorMessage(error, 'Não foi possível retomar a importação.'));
        } finally {
            setActionJobId(null);
        }
    };

    return (
        <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
            <header className="flex flex-col gap-2 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Importar cifras por artista</h1>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Adicione artistas e acompanhe a fila de importação.</p>
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {activeJob ? `Artista em execução: ${activeJob.artist_name}` : 'Nenhuma importação em execução'}
                </p>
            </header>

            <section aria-label="Buscar artista" className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <form role="search" onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                        Artista
                        <input
                            type="search"
                            role="searchbox"
                            aria-label="Buscar artista"
                            value={query}
                            onChange={handleQueryChange}
                            placeholder="Ex.: Fernandinho"
                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        />
                    </label>
                    <button
                        type="submit"
                        disabled={!query.trim()}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Search size={17} aria-hidden="true" />
                        {isSearching ? 'Buscando' : 'Buscar'}
                    </button>
                    <button
                        type="button"
                        onClick={handleEnqueue}
                        disabled={!selectedArtist || isEnqueueing || previewingSlug !== null}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70"
                    >
                        <ListMusic size={17} aria-hidden="true" />
                        {isEnqueueing ? 'Adicionando' : 'Adicionar à fila'}
                    </button>
                </form>

                {searchError && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{searchError}</p>}

                <section aria-label="Resultados de artistas" className="mt-4">
                    {artists.length > 0 && (
                        <div role="listbox" aria-label="Artistas encontrados" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {artists.map((artist) => {
                                const isSelected = selectedArtist?.slug === artist.slug
                                    || previewingSlug === artist.slug;
                                const previewedTotal = selectedArtist?.slug === artist.slug
                                    ? selectedArtist.total
                                    : artist.total;
                                return (
                                    <button
                                        key={artist.slug}
                                        type="button"
                                        role="option"
                                        aria-selected={isSelected}
                                        onClick={() => void handleSelectArtist(artist)}
                                        className={`flex min-h-12 items-center justify-between rounded-md border px-3 py-2 text-left transition ${isSelected
                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-950 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-100'
                                            : 'border-slate-200 text-slate-800 hover:border-slate-300 dark:border-slate-800 dark:text-slate-200 dark:hover:border-slate-700'
                                        }`}
                                    >
                                        <span className="font-medium">{artist.name}</span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                            {previewingSlug === artist.slug
                                                ? 'Consultando catálogo'
                                                : Number.isInteger(previewedTotal)
                                                    ? `${previewedTotal} cifras`
                                                    : 'Ver catálogo'}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>
            </section>

            <section aria-label="Fila de importação" className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
                        <ListMusic size={20} className="text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                        Fila de importação
                    </h2>
                    <span className="text-sm text-slate-500 dark:text-slate-400">{jobs.length} artistas</span>
                </div>

                {queueError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{queueError}</p>}

                {jobs.length === 0 ? (
                    <p className="border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Nenhum artista na fila.</p>
                ) : (
                    <div className="space-y-2">
                        {displayedJobs.map((job, index) => {
                            const progress = getProgress(job);
                            const completedCount = getCompletedCount(job);
                            const isPending = job.status === 'pending';
                            const isQueued = isQueuedJob(job);
                            const isAutoPaused = isAutomaticallyPaused(job);
                            const canRetry = job.status === 'completed_with_errors';
                            const canResume = job.status === 'paused' && !isAutoPaused;
                            const isActing = actionJobId === job.id;
                            const blockedRetryLimit = getBlockedRetryLimit(job);
                            const itemErrors = getItemErrors(job);
                            const lastActivityAt = getLastActivityAt(job);

                            return (
                                <article key={job.id} className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-semibold text-slate-900 dark:text-white">{job.artist_name}</h3>
                                                <JobStatus status={job.status} />
                                                {isQueued && <span className="text-xs text-slate-500 dark:text-slate-400">Ordem {index + 1}</span>}
                                            </div>
                                            {job.last_error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{job.last_error}</p>}
                                            {isAutoPaused && (
                                                <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                                                    Bloqueio {job.blocked_count} de {blockedRetryLimit}. Nova tentativa automática: {formatNextRunAt(job.next_run_at)}
                                                </p>
                                            )}
                                            {canResume && (
                                                <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                                                    {job.blocked_count >= blockedRetryLimit
                                                        ? `Limite de ${blockedRetryLimit} bloqueios atingido. `
                                                        : 'Importação pausada. '}
                                                    Retomada manual necessária.
                                                </p>
                                            )}
                                            {lastActivityAt && (
                                                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                                    Última atividade: {formatNextRunAt(lastActivityAt)}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex shrink-0 items-center gap-2">
                                            {isPending && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleCancel(job)}
                                                    disabled={isActing}
                                                    aria-label={`Cancelar importação de ${job.artist_name}`}
                                                    title={`Cancelar importação de ${job.artist_name}`}
                                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-rose-200 px-2.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
                                                >
                                                    <XCircle size={16} aria-hidden="true" />
                                                    Cancelar
                                                </button>
                                            )}
                                            {canRetry && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRetry(job)}
                                                    disabled={isActing}
                                                    aria-label={`Tentar novamente ${job.artist_name}`}
                                                    title={`Tentar novamente ${job.artist_name}`}
                                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-amber-200 px-2.5 text-sm font-medium text-amber-800 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950/40"
                                                >
                                                    <RotateCcw size={16} aria-hidden="true" />
                                                    Tentar novamente
                                                </button>
                                            )}
                                            {canResume && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleResume(job)}
                                                    disabled={isActing}
                                                    aria-label={`Retomar importação de ${job.artist_name}`}
                                                    title={`Retomar importação de ${job.artist_name}`}
                                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-amber-200 px-2.5 text-sm font-medium text-amber-800 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950/40"
                                                >
                                                    <RotateCcw size={16} aria-hidden="true" />
                                                    Retomar
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                                        <div>
                                            <div className="h-2 overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-800" aria-label={`${progress}% concluído`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                                                <div className="h-full bg-indigo-600 transition-[width]" style={{ width: `${progress}%` }} />
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                                                <span>{job.imported_count || 0} importadas</span>
                                                <span>{job.skipped_count || 0} ignoradas</span>
                                                <span>{job.failed_count || 0} {(job.failed_count || 0) === 1 ? 'falha' : 'falhas'}</span>
                                                <span>{completedCount} de {job.total_count || 0}</span>
                                            </div>
                                        </div>
                                        <span className="text-right text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{progress}%</span>
                                    </div>

                                    {itemErrors.length > 0 && (
                                        <section aria-label={`Erros de ${job.artist_name}`} className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                                            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Erros por música</h4>
                                            <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
                                                {itemErrors.map((item) => (
                                                    <li key={item.id} className="py-2 first:pt-0 last:pb-0">
                                                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                                                            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.song_name}</span>
                                                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                                                {item.attempts || 0} {(item.attempts || 0) === 1 ? 'tentativa' : 'tentativas'}
                                                            </span>
                                                        </div>
                                                        <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{item.last_error}</p>
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </main>
    );
}
