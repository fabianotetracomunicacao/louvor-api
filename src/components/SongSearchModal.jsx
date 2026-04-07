import React, { useState, useEffect } from 'react';
import { 
    Search, Music, User, Globe, Plus, Loader2, X, 
    CheckCircle2, Info, AlertTriangle, ExternalLink, ArrowRight 
} from 'lucide-react';
import { Portal } from './Portal';
import { supabase } from '../supabaseClient';
import { getSongBySlug } from '../utils/storage';
import { parseImporter } from '../utils/importer';

const API_URL = import.meta.env.VITE_CIFRA_API_URL || 'http://localhost:3000';

export function SongSearchModal({ isOpen, onClose, onImport }) {
    const [query, setQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [localResults, setLocalResults] = useState([]);
    const [externalResults, setExternalResults] = useState([]);
    const [error, setError] = useState(null);

    // Search logic
    // Debounced Search Effect
    useEffect(() => {
        if (!query.trim()) {
            setLocalResults([]);
            setExternalResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearching(true);
            setError(null);

            try {
                // 1. Search Local (Supabase)
                const { data: local, error: localErr } = await supabase
                    .from('songs')
                    .select('*')
                    .or(`title.ilike.%${query}%,artist.ilike.%${query}%`)
                    .is('deleted_at', null)
                    .limit(5);
                
                if (localErr) console.error("Local search error:", localErr);
                else setLocalResults(local || []);

                // 2. Search External (lp-api)
                try {
                    const searchBoxQuery = `${query} gospel louvor worship`;
                    const response = await fetch(`${API_URL}/search?q=${encodeURIComponent(searchBoxQuery)}`);
                    if (!response.ok) throw new Error('Falha ao buscar a cifra na internet');
                    const data = await response.json();
                    
                    const results = data.results || [];
                    const resultsWithStatus = await Promise.all(results.map(async (res) => {
                        const slug = `${res.artist_slug}/${res.song_slug}`;
                        const existing = await getSongBySlug(slug);
                        return { ...res, slug, existingId: existing?.id };
                    }));

                    setExternalResults(resultsWithStatus);
                } catch (extErr) {
                    console.warn("External search failed:", extErr);
                    setError("Não foi possível conectar à API de busca externa.");
                }
            } catch (err) {
                console.error("Search failed:", err);
                setError("Ocorreu um erro ao realizar a busca.");
            } finally {
                setIsSearching(false);
            }
        }, 600); // 600ms delay for modal search

        return () => clearTimeout(timer);
    }, [query]);

    const handleSearch = (e) => {
        if (e) e.preventDefault();
    };

    const handleSelectExternal = async (item) => {
        if (item.existingId) {
            // Already in system, just use it
            onImport({ id: item.existingId });
            onClose();
            return;
        }

        setIsSearching(true); // Re-use loading state
        try {
            // Fetch dots/chords from API
            const response = await fetch(`${API_URL}/artists/${item.artist_slug}/songs/${item.song_slug}`);
            if (!response.ok) throw new Error('Falha ao obter detalhes da música');
            const data = await response.json();

            // Format content using parseImporter
            const rawContent = (data.cifra || []).join('\n');
            const formattedContent = parseImporter(rawContent);

            const youtube_url = data.youtube_url;
            const isValidUrl = youtube_url && (youtube_url.includes('http') || youtube_url.includes('youtube.com') || youtube_url.includes('youtu.be'));

            // Return data to editor
            onImport({
                title: data.name,
                artist: data.artist,
                content: formattedContent,
                youtubeLinks: isValidUrl ? [youtube_url] : [],
                cifraclub_slug: item.slug,
                is_official: false,
                source: 'cifraclub'
            });
            onClose();
        } catch (err) {
            console.error("Import failed:", err);
            setError("Erro ao importar música. Tente novamente.");
        } finally {
            setIsSearching(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Portal>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                    {/* Header */}
                    <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                                <Search size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900 dark:text-white">Buscar Música</h3>
                                <p className="text-xs text-slate-500">Busque no sistema ou na internet</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition">
                            <X size={20} className="text-slate-500" />
                        </button>
                    </div>

                    {/* Search Bar */}
                    <div className="p-4 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
                        <form onSubmit={handleSearch} className="relative">
                            <input
                                autoFocus
                                type="text"
                                placeholder="Nome da música ou artista..."
                                className="w-full bg-slate-100 dark:bg-slate-900 border-2 border-transparent focus:border-purple-500 outline-none rounded-xl py-3 pl-12 pr-3 text-slate-900 dark:text-white transition shadow-inner"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                <Search size={20} />
                            </div>
                        </form>
                    </div>

                    {/* Results Area */}
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {error && (
                            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-700 dark:text-red-400 text-sm">
                                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                                <p>{error}</p>
                            </div>
                        )}

                        {/* Local Results */}
                        {localResults.length > 0 && (
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-3 px-2">
                                    <CheckCircle2 size={14} className="text-green-500" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">No seu Sistema</span>
                                </div>
                                <div className="space-y-2">
                                    {localResults.map(song => (
                                        <button
                                            key={song.id}
                                            onClick={() => { onImport({ id: song.id }); onClose(); }}
                                            className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 hover:bg-purple-50 dark:hover:bg-purple-900/20 border border-slate-100 dark:border-slate-800 rounded-xl transition group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                                                    <Music size={16} className="text-slate-400" />
                                                </div>
                                                <div className="text-left">
                                                    <div className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1">{song.title}</div>
                                                    <div className="text-xs text-slate-500 line-clamp-1">
                                                        {song.artist} {song.creatorName && ` • Por: ${song.creatorName}`}
                                                    </div>
                                                </div>
                                            </div>
                                            <ArrowRight size={16} className="text-slate-300 group-hover:text-purple-500 transition" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* External Results */}
                        <div>
                            <div className="flex items-center gap-2 mb-3 px-2">
                                <Globe size={14} className="text-blue-500" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Resultados da internet</span>
                            </div>
                            
                            {!isSearching && externalResults.length === 0 && query && (
                                <div className="text-center py-8">
                                    <p className="text-sm text-slate-400">Nenhum resultado externo encontrado.</p>
                                </div>
                            )}

                            <div className="space-y-2">
                                {externalResults.map(item => (
                                    <button
                                        key={item.slug}
                                        onClick={() => handleSelectExternal(item)}
                                        className="w-full flex items-center justify-between p-3 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-slate-100 dark:border-slate-700 rounded-xl transition group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded-lg">
                                                <Music size={16} className="text-blue-400" />
                                            </div>
                                            <div className="text-left">
                                                <div className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1">{item.name}</div>
                                                <div className="text-xs text-slate-500 line-clamp-1">{item.artist}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {item.existingId ? (
                                                <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded font-bold uppercase tracking-tighter">No Sistema</span>
                                            ) : (
                                                <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-md opacity-0 group-hover:opacity-100 transition">
                                                    <Plus size={14} />
                                                </div>
                                            )}
                                        </div>
                                    </button>
                               States: [item.slug] => handleSelectExternal(item)
                                ))}
                            </div>
                        </div>

                        {!query && !isSearching && (
                            <div className="text-center py-12 flex flex-col items-center">
                                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-full mb-4">
                                    <Info size={32} className="text-slate-300" />
                                </div>
                                <p className="text-sm text-slate-500 max-w-xs">
                                    Digite o nome de uma música ou artista para começar a busca híbrida.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 flex justify-center">
                        <p className="text-[10px] text-slate-400 flex items-center gap-1">
                            Powered by lp-api <Globe size={10} /> Scraper
                        </p>
                    </div>
                </div>
            </div>
        </Portal>
    );
}
