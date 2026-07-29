import React, { useMemo, useState } from 'react';
import {
    BadgeCheck,
    ChevronDown,
    ChevronUp,
    ListMusic,
    Search,
} from 'lucide-react';
import {
    groupCatalogSongs,
    normalizeCatalogTitle,
} from '../utils/cifraclubCatalog';

function getVersionLabel(song) {
    const parts = [song.name];

    if (song.version_verified) parts.push('verificada');
    if (song.version_label) parts.push(song.version_label);
    if (song.version_tone) parts.push(`tom ${song.version_tone}`);

    return parts.join(', ');
}

function VersionMetadata({ song }) {
    return (
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            {song.version_verified && (
                <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
                    <BadgeCheck size={14} aria-hidden="true" />
                    Verificada
                </span>
            )}
            {song.version_label && <span>{song.version_label}</span>}
            {song.version_tone && <span>Tom {song.version_tone}</span>}
        </span>
    );
}

function VersionCheckbox({ song, checked, onChange, compact = false }) {
    return (
        <label className={`flex min-w-0 cursor-pointer items-center gap-3 ${compact ? 'py-2 pl-8 pr-3' : 'py-3 pr-3'}`}>
            <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(song.song_slug)}
                aria-label={getVersionLabel(song)}
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-950"
            />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">
                    {song.name}
                </span>
                <VersionMetadata song={song} />
            </span>
        </label>
    );
}

export function ArtistCatalogSelector({
    artist,
    selectedSlugs,
    onSelectionChange,
    onEnqueue,
    isEnqueueing,
}) {
    const [query, setQuery] = useState('');
    const [expandedGroups, setExpandedGroups] = useState(new Set());
    const groups = useMemo(() => groupCatalogSongs(artist?.songs), [artist?.songs]);
    const normalizedQuery = normalizeCatalogTitle(query);
    const visibleGroups = useMemo(
        () => groups.filter((group) => (
            !normalizedQuery || group.key.includes(normalizedQuery)
        )),
        [groups, normalizedQuery],
    );
    const selection = selectedSlugs instanceof Set ? selectedSlugs : new Set();

    const toggleSong = (slug) => {
        const next = new Set(selection);
        if (next.has(slug)) next.delete(slug);
        else next.add(slug);
        onSelectionChange(next);
    };

    const toggleGroup = (key) => {
        const next = new Set(expandedGroups);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setExpandedGroups(next);
    };

    const selectVisible = () => {
        const next = new Set(selection);
        visibleGroups.forEach((group) => {
            const hasSelectedVersion = group.versions.some((version) => (
                next.has(version.song_slug)
            ));
            if (!hasSelectedVersion) next.add(group.preferred.song_slug);
        });
        onSelectionChange(next);
    };

    return (
        <section
            role="region"
            aria-label={`Selecionar cifras de ${artist.name}`}
            className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                            Cifras de {artist.name}
                        </h2>
                        <p aria-live="polite" className="text-sm text-slate-500 dark:text-slate-400">
                            {selection.size} de {artist.songs.length} selecionadas
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onEnqueue}
                        disabled={selection.size === 0 || isEnqueueing}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <ListMusic size={17} aria-hidden="true" />
                        {isEnqueueing
                            ? 'Adicionando à fila'
                            : `Adicionar ${selection.size} selecionadas à fila`}
                    </button>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="relative min-w-0 flex-1">
                        <Search
                            size={17}
                            aria-hidden="true"
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                            type="search"
                            aria-label="Filtrar cifras"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Buscar título"
                            className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={selectVisible}
                        disabled={visibleGroups.length === 0}
                        className="h-9 px-2 text-sm font-medium text-indigo-700 hover:text-indigo-900 disabled:opacity-50 dark:text-indigo-300 dark:hover:text-indigo-200"
                    >
                        Selecionar visíveis
                    </button>
                    <button
                        type="button"
                        onClick={() => onSelectionChange(new Set())}
                        disabled={selection.size === 0}
                        className="h-9 px-2 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50 dark:text-slate-300 dark:hover:text-white"
                    >
                        Limpar seleção
                    </button>
                </div>
            </div>

            <div
                role="list"
                aria-label="Cifras disponíveis"
                className="max-h-[32rem] overflow-y-auto"
            >
                {visibleGroups.map((group) => {
                    const isExpanded = expandedGroups.has(group.key);
                    const alternatives = group.versions.slice(1);

                    return (
                        <div
                            key={group.key}
                            role="listitem"
                            className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                        >
                            <div className="flex items-center pl-3">
                                <div className="min-w-0 flex-1">
                                    <VersionCheckbox
                                        song={group.preferred}
                                        checked={selection.has(group.preferred.song_slug)}
                                        onChange={toggleSong}
                                    />
                                </div>
                                {alternatives.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(group.key)}
                                        aria-expanded={isExpanded}
                                        aria-label={`${isExpanded ? 'Ocultar' : 'Mostrar'} versões de ${group.title}`}
                                        title={`${isExpanded ? 'Ocultar' : 'Mostrar'} versões de ${group.title}`}
                                        className="mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                                    >
                                        {isExpanded
                                            ? <ChevronUp size={18} aria-hidden="true" />
                                            : <ChevronDown size={18} aria-hidden="true" />}
                                    </button>
                                )}
                            </div>
                            {isExpanded && alternatives.length > 0 && (
                                <div className="border-t border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50">
                                    {alternatives.map((song) => (
                                        <VersionCheckbox
                                            key={song.song_slug}
                                            song={song}
                                            checked={selection.has(song.song_slug)}
                                            onChange={toggleSong}
                                            compact
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
                {visibleGroups.length === 0 && (
                    <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        Nenhuma cifra encontrada.
                    </p>
                )}
            </div>
        </section>
    );
}
