import React, { useState, useEffect } from 'react';
import { Filter, SortAsc, Plus, Trash2, Mic2, FileText, Music, Heart, Search, Eye, Printer, Edit2, BookOpen, PlusCircle, Play, GraduationCap, MoreVertical, X, Copy, BadgeCheck, MonitorUp, Loader2, Globe, CheckCircle2, ExternalLink } from 'lucide-react'; // Try to find a nice icon for Repertoire
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { getLikedSongs, getUserEdits, deleteSong, searchSongs, getSongs, getMusicalStyles, getSongFunctions, toggleLike, copySong, toggleSongOfficial } from '../utils/storage';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { useData } from '../contexts/DataContext';
import { LiquidLoader } from '../components/LiquidLoader';
import { CIFRA_API_URL } from '../utils/cifraApi';

export function RepertoirePage() {
    const { isEditor, user, isAdmin } = useAuth();
    const navigate = useNavigate();
    const { showToast, confirmAction } = useNotification();
    const [searchParams, setSearchParams] = useSearchParams(); // Added setSearchParams
    const query = searchParams.get('q');

    // Tab State is now derived from URL
    const tabParam = searchParams.get('tab');
    const activeTab = tabParam || 'all'; // Default to 'all' if no tab param

    // Note: If 'q' exists, we might want to prioritize 'search' only if tab is not set? 
    // Or we force tab='search' when searching.
    // Let's stick to the existing logic: query -> 'search'.
    // If query exists, effectively activeTab acts as 'search' OR we just show search results.
    // Actually, let's keep it simple: if 'q', we are in search mode.
    // Logic below handles this.

    // const [activeTab, setActiveTab] = useState('likes'); <-- REMOVED
    const [activeMenuId, setActiveMenuId] = useState(null); // For Mobile Action Toggle

    // Use Cached Data
    const { likedSongs, likedSongIds, userEdits, refreshEdits, toggleLike } = useData();
    const [localSongs, setLocalSongs] = useState([]); // For search results

    const handleLikeToggle = async (songId, e) => {
        e.stopPropagation();
        if (!user) return;

        await toggleLike(songId);
    };
    const [allSongs, setAllSongs] = useState([]); // For 'all' tab
    const [filteredAllSongs, setFilteredAllSongs] = useState([]); // Filtered list

    // Filters State
    const [musicalStyles, setMusicalStyles] = useState([]);
    const [songFunctions, setSongFunctions] = useState([]);
    const [filters, setFilters] = useState({
        style: '',
        function: '',
        query: '',
        isOfficial: false,
        type: 'all' // New Filter State: all | chords | lyrics
    });


    const [isSearching, setIsSearching] = useState(false);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [totalSongs, setTotalSongs] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const SONGS_PER_PAGE = 50;

    const [expandedGroups, setExpandedGroups] = useState(new Set());
    const [externalResults, setExternalResults] = useState([]);
    const [isSearchingExternal, setIsSearchingExternal] = useState(false);
    const [externalError, setExternalError] = useState(null);

    const toggleGroup = (groupId) => {
        setExpandedGroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(groupId)) newSet.delete(groupId);
            else newSet.add(groupId);
            return newSet;
        });
    };

    // Debounced External Search Effect
    useEffect(() => {
        if (!filters.query || filters.query.trim().length < 2) {
            setExternalResults([]);
            setExternalError(null);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearchingExternal(true);
            setExternalError(null);

            try {
                const response = await fetch(`${CIFRA_API_URL}/search?q=${encodeURIComponent(filters.query)}`);
                if (!response.ok) throw new Error('Falha ao buscar cifras na internet');
                
                const data = await response.json();
                const results = data.results || [];
                
                // Add slug and check for existing (optional optimization, keeping it simple for now)
                const resultsWithSlug = results.map(res => ({
                    ...res,
                    slug: `${res.artist_slug}/${res.song_slug}`
                }));

                setExternalResults(resultsWithSlug);
            } catch (err) {
                console.warn("External search failed:", err);
                setExternalError("Não foi possível conectar à busca externa.");
            } finally {
                setIsSearchingExternal(false);
            }
        }, 800); // 800ms debounce

        return () => clearTimeout(timer);
    }, [filters.query]);

    const handleImportExternal = async (item) => {
        setIsSearchingExternal(true);
        try {
            const response = await fetch(`${CIFRA_API_URL}/artists/${item.artist_slug}/songs/${item.song_slug}`);
            if (!response.ok) throw new Error('Falha ao obter detalhes da música');
            
            const data = await response.json();
            
            // Format content using parseImporter if available, otherwise raw
            // Since we imported it above, we can use it.
            const rawContent = (data.cifra || []).join('\n');
            // We need to import parseImporter at the top if we use it, but SongSearchModal uses it.
            // Let's check imports in RepertoirePage.
            
            // Navigate to editor with state
            navigate('/editor', { 
                state: { 
                    importData: {
                        title: data.name,
                        artist: data.artist,
                        content: rawContent, // Editor will handle formatting or we can do it here
                        youtubeLinks: (data.youtube_url && (data.youtube_url.includes('http') || data.youtube_url.includes('youtube.com') || data.youtube_url.includes('youtu.be'))) ? [data.youtube_url] : [],
                        cifraclub_slug: item.slug,
                        source: 'cifraclub'
                    }
                } 
            });
        } catch (err) {
            console.error("Import failed:", err);
            showToast("Erro ao importar música. Tente novamente.", "error");
        } finally {
            setIsSearchingExternal(false);
        }
    };

    const checkIsOfficial = (s) => {
        if (!s) return false;
        if (s.isOfficial === true || s.is_official === true) return true;
        if (s.creatorName && (s.creatorName.includes('Oficial') || s.creatorName.includes('LouvorPlay'))) return true;
        if (s.creator && (s.creator.full_name?.includes('Oficial') || s.creator.email?.includes('louvorplay'))) return true;
        return false;
    };

    const groupSongsByTitleAndArtist = (songList) => {
        if (!songList || songList.length === 0) return [];
        const groups = new Map();

        songList.forEach(song => {
            const key = `${song.title?.toLowerCase().trim()}--${song.artist?.toLowerCase().trim()}`;
            const songIsOfficial = checkIsOfficial(song);

            if (!groups.has(key)) {
                groups.set(key, { id: key, main: song, versions: [] });
            } else {
                const group = groups.get(key);
                const mainIsOfficial = checkIsOfficial(group.main);

                if (songIsOfficial && !mainIsOfficial) {
                    group.versions.push(group.main);
                    group.main = song;
                } else {
                    group.versions.push(song);
                }
            }
        });

        // Post-process guarantee: If any group main is not official but contains an official version, swap it!
        groups.forEach((group) => {
            if (!checkIsOfficial(group.main) && group.versions.length > 0) {
                const officialIdx = group.versions.findIndex(checkIsOfficial);
                if (officialIdx !== -1) {
                    const officialSong = group.versions.splice(officialIdx, 1)[0];
                    group.versions.push(group.main);
                    group.main = officialSong;
                }
            }
        });

        return Array.from(groups.values());
    };

    // Determine content based on tab
    const rawSongs = activeTab === 'likes' ? likedSongs :
        activeTab === 'edits' ? userEdits :
            activeTab === 'all' ? filteredAllSongs :
                localSongs;

    const songs = groupSongsByTitleAndArtist(rawSongs);

    const isLoading = false; // Data is now instant from Context (or loading locally for search)

    // Initial Tab Logic is now handled by URL Defaults
    useEffect(() => {
        // If there is a query, ensure we are on 'search' tab? Or just let the render logic handle it.
        if (query && activeTab !== 'search') {
            // setActiveTab('search'); NO, set URL
            setSearchParams({ tab: 'search', q: query });
        } else if (searchParams.get('style') && activeTab !== 'all') {
            // Handle style filter from Home Page
            // setActiveTab('all');
            // setFilters(prev => ({ ...prev, style: searchParams.get('style') }));
            // We need to preserve the style param in filters, handled by initial State? 
            // Logic below handles filters. Here we just ensure Tab is right.
            setSearchParams({ tab: 'all', style: searchParams.get('style') });
        }
    }, [query, searchParams]);

    // Load data for 'all' tab
    useEffect(() => {
        if (activeTab === 'all') {
            loadAllSongsData();
        }
    }, [activeTab]);

    // Server-side filtering - reload data when filters change
    useEffect(() => {
        if (activeTab === 'all') {
            loadAllSongsData(1); // Reset to page 1 when filters change
        }
    }, [filters.style, filters.function, filters.query, filters.isOfficial, filters.type, activeTab]);


    const loadAllSongsData = async (page = 1) => {
        setIsSearching(true);
        try {
            const [songsResult, stylesData, functionsData] = await Promise.all([
                getSongs({
                    page,
                    limit: SONGS_PER_PAGE,
                    style: filters.style || null,
                    songFunction: filters.function || null,
                    query: filters.query || null,
                    isOfficial: filters.isOfficial,
                    type: filters.type
                }),

                getMusicalStyles(),
                getSongFunctions()
            ]);

            setAllSongs(songsResult.songs);
            setFilteredAllSongs(songsResult.songs); // Server already filtered
            setTotalSongs(songsResult.total);
            setHasMore(songsResult.hasMore);
            setCurrentPage(page);
            setMusicalStyles(stylesData);
            setSongFunctions(functionsData);
        } catch (error) {
            console.error("Error loading all songs data:", error);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSearch = async (q) => {
        setIsSearching(true);
        try {
            const results = await searchSongs(q);
            setLocalSongs(results);
        } finally {
            setIsSearching(false);
        }
    };

    // Refresh edits when entering the tab (silent update)
    useEffect(() => {
        if (activeTab === 'edits') {
            refreshEdits();
        }
    }, [activeTab]);

    const handleDelete = async (id, title) => {
        const confirmed = await confirmAction({
            title: 'Excluir Música',
            message: `Tem certeza que deseja excluir a música "${title}"? Esta ação não pode ser desfeita.`,
            confirmText: 'Excluir',
            type: 'danger'
        });

        if (confirmed) {
            try {
                // If the user is deleting, we must ensure they are the owner or admin?
                // RLS handles this, but UI should handle error.
                await deleteSong(id);
                // Update local list
                // This needs to update the correct state based on activeTab
                if (activeTab === 'edits') {
                    // Assuming userEdits is managed by DataContext, refresh it
                    refreshEdits();
                } else if (activeTab === 'all') {
                    setAllSongs(prev => prev.filter(song => song.id !== id));
                } else if (activeTab === 'search') {
                    setLocalSongs(prev => prev.filter(song => song.id !== id));
                }
                showToast('Música excluída com sucesso.', 'success');
            } catch (error) {
                console.error(error);
                showToast('Erro ao excluir música.', 'error');
            }
        }
    };

    const handleCopy = async (songId, title) => {
        const confirmed = await confirmAction({
            title: 'Copiar Música',
            message: `Deseja criar uma cópia pessoal de "${title}"? Você poderá editá-la livremente.`,
            confirmText: 'Copiar',
            type: 'info' // or 'primary' if supported
        });

        if (confirmed) {
            try {
                const newId = await copySong(songId);
                showToast('Música copiada com sucesso!', 'success');
                // Refresh list if needed, or navigate to editor?
                // Requirements say: "become a song he can edit". Maybe navigate to editor?
                // User didn't specify navigation, but it's helpful.
                // Let's just refresh for now or navigate.
                // "virar uma musica que ele pode editar" implies immediate availability.
                // Let's navigate to editor for the new song.
                navigate(`/editor/${newId}`);
            } catch (error) {
                console.error(error);
                if (error.message.includes('already a copy')) {
                    showToast('Esta música já é uma cópia e não pode ser copiada novamente.', 'error');
                } else {
                    showToast('Erro ao copiar música.', 'error');
                }
            }
        }
    };

    const handleToggleOfficial = async (songId, title, currentStatus) => {
        const confirmed = await confirmAction({
            title: currentStatus ? 'Remover Selo Oficial' : 'Oficializar Música',
            message: currentStatus ? `Deseja remover o selo de oficial da música "${title}"?` : `Deseja marcar "${title}" como música Oficial LouvorPlay?`,
            confirmText: currentStatus ? 'Remover' : 'Oficializar',
            type: 'info'
        });

        if (confirmed) {
            try {
                const newStatus = await toggleSongOfficial(songId);
                showToast(`Música "${title}" ${newStatus ? 'revisada e oficializada' : 'não é mais oficial'}!`, 'success');
                // Update local state
                if (activeTab === 'all') {
                    setAllSongs(prev => prev.map(s => s.id === songId ? { ...s, isOfficial: newStatus } : s));
                    setFilteredAllSongs(prev => prev.map(s => s.id === songId ? { ...s, isOfficial: newStatus } : s));
                } else if (activeTab === 'search') {
                    setLocalSongs(prev => prev.map(s => s.id === songId ? { ...s, isOfficial: newStatus } : s));
                }
            } catch (error) {
                console.error(error);
                showToast('Erro ao alterar status oficial.', 'error');
            }
        }
    };

    const handleRowClick = (songId) => {
        // Navigate to SESSION (Player) directly for everyone in Repertoire
        // Unless logic dictates Editors go to Editor? User pattern suggests Player first usually.
        // Let's stick to Player for Repertoire viewing.
        navigate(`/player/${songId}`);
    };

    const canEdit = (song) => {
        if (!user) return false;
        if (isAdmin) return true; // Admins control everything
        // Users can ONLY edit their own songs
        return song.created_by === user.id;
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                    <div className="bg-purple-100 dark:bg-purple-900/20 p-3 rounded-xl text-purple-600 dark:text-purple-400">
                        <Music size={28} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Meu Repertório</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Gerencie suas músicas favoritas e criações</p>
                    </div>
                </div>
                {activeTab === 'edits' && isEditor && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => navigate('/editor?type=lyrics')}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition shadow-lg shadow-blue-500/20"
                        >
                            <FileText size={20} />
                            <span className="hidden sm:inline">Nova Letra</span>
                        </button>
                        <button
                            onClick={() => navigate('/editor')}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition shadow-lg shadow-purple-500/20"
                        >
                            <PlusCircle size={20} />
                            <span className="hidden sm:inline">Nova Música</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
                {activeTab === 'search' && (
                    <button
                        onClick={() => setSearchParams({ tab: 'search' })}
                        className="flex-1 py-1.5 md:py-3 rounded-xl font-bold text-xs md:text-sm transition flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 bg-slate-900 text-white shadow-lg leading-tight text-center"
                    >
                        <Search size={18} />
                        <span className="md:inline">Busca</span>
                    </button>
                )}

                <button
                    onClick={() => setSearchParams({ tab: 'all' })}
                    className={`
                        flex-1 py-1.5 md:py-3 rounded-xl font-bold text-xs md:text-sm transition flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 leading-tight text-center
                        ${activeTab === 'all'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }
                    `}
                >
                    <BookOpen size={18} />
                    <span>Todas</span>
                </button>

                <button
                    onClick={() => setSearchParams({ tab: 'likes' })}
                    className={`
                        flex-1 py-1.5 md:py-3 rounded-xl font-bold text-xs md:text-sm transition flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 leading-tight text-center
                        ${activeTab === 'likes'
                            ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/20'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }
                    `}
                >
                    <Heart size={18} className={activeTab === 'likes' ? 'fill-current' : ''} />
                    <span>Curtidas</span>
                </button>

                {isEditor && (
                    <button
                        onClick={() => setSearchParams({ tab: 'edits' })}
                        className={`
                            flex-1 py-1.5 md:py-3 rounded-xl font-bold text-xs md:text-sm transition flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 leading-tight text-center
                            ${activeTab === 'edits'
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }
                        `}
                    >
                        <FileText size={18} />
                        <span>Edições</span>
                    </button>
                )}
            </div>

            {/* Filters Bar (Only for 'all' tab) */}
            {activeTab === 'all' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in-down">
                    {/* Search Input */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por título, artista ou letra..."
                            value={filters.query}
                            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition text-sm"
                        />
                    </div>

                    {/* Style Dropdown */}
                    <div className="relative">
                        <select
                            value={filters.style}
                            onChange={(e) => setFilters({ ...filters, style: e.target.value })}
                            className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition text-sm appearance-none cursor-pointer"
                        >
                            <option value="">Todos os Estilos</option>
                            {musicalStyles.map(s => (
                                <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                        </select>
                        <Filter className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                    </div>

                    {/* Function Dropdown */}
                    <div className="relative">
                        <select
                            value={filters.function}
                            onChange={(e) => setFilters({ ...filters, function: e.target.value })}
                            className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition text-sm appearance-none cursor-pointer"
                        >
                            <option value="">Todas as Funções</option>
                            {songFunctions.map(f => (
                                <option key={f.id} value={f.name}>{f.name}</option>
                            ))}
                        </select>
                        <Filter className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                    </div>

                    {/* Grouped Toggles for Mobile Aligment */}
                    <div className="col-span-1 md:col-span-1 flex items-center justify-between md:justify-start gap-4 bg-white dark:bg-slate-800 md:bg-transparent p-2 md:p-0 rounded-xl border border-slate-100 dark:border-slate-700 md:border-0">
                        {/* Type Toggle (Segmented Control) */}
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
                            <button
                                onClick={() => setFilters({ ...filters, type: 'all' })}
                                className={`px-2 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${filters.type === 'all' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                Todos
                            </button>
                            <button
                                onClick={() => setFilters({ ...filters, type: 'chords' })}
                                className={`px-2 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${filters.type === 'chords' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                Cifras
                            </button>
                            <button
                                onClick={() => setFilters({ ...filters, type: 'lyrics' })}
                                className={`px-2 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${filters.type === 'lyrics' ? 'bg-white dark:bg-slate-700 shadow text-purple-600 dark:text-purple-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                Letras
                            </button>
                        </div>

                        {/* Official Filter Toggle */}
                        <div className="flex items-center">
                            <label className="flex items-center gap-1.5 cursor-pointer select-none group">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={filters.isOfficial}
                                        onChange={(e) => setFilters({ ...filters, isOfficial: e.target.checked })}
                                    />
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                </div>
                                <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-blue-600 transition flex items-center gap-1 uppercase tracking-tighter">
                                    <BadgeCheck size={14} className={filters.isOfficial ? "text-blue-500" : "text-slate-400 group-hover:text-blue-500"} />
                                    Oficiais
                                </span>
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* Content List */}
            <div className="space-y-1">
                {isLoading ? (
                    <LiquidLoader />
                ) : (
                    <>
                        {/* LOCAL SYSTEM RESULTS */}
                        {(filters.query && songs.length > 0) && (
                            <div className="flex items-center gap-2 mb-4 mt-2 px-2 animate-fade-in">
                                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800"></div>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                                    <CheckCircle2 size={14} className="text-green-500" /> No LouvorPlay
                                </span>
                                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800"></div>
                            </div>
                        )}

                        {songs.length === 0 ? (
                            (!isSearchingExternal && filters.query) ? null : (
                                <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                                    <Music size={48} className="mb-4 opacity-20" />
                                    <p className="font-medium">Nenhuma música encontrada no sistema.</p>
                                    {activeTab === 'likes' && <p className="text-sm">Vá para a Dashboard buscar e curtir músicas!</p>}
                                    {activeTab === 'edits' && (
                                        <button
                                            onClick={() => navigate('/editor')}
                                            className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition flex items-center gap-2"
                                        >
                                            <PlusCircle size={18} /> Criar Primeira Música
                                        </button>
                                    )}
                                </div>
                            )
                        ) : (
                            songs.map((group) => {
                        const { main, versions, id: groupKey } = group;
                        const isExpanded = expandedGroups.has(groupKey);

                        return (
                            <div key={groupKey} className="space-y-1 mb-4">
                                {/* Main Song Row */}
                                <div
                                    className={`group relative border rounded-xl p-4 hover:shadow-lg transition cursor-pointer flex items-center justify-between
                                        ${main.type === 'lyrics'
                                            ? 'bg-amber-50/60 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30 hover:border-amber-400/50'
                                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-purple-500/30'}
                                    `}
                                    onClick={() => handleRowClick(main.id)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`
                                            w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shadow-sm flex-shrink-0
                                            ${activeTab === 'likes'
                                                ? 'bg-gradient-to-br from-pink-500 to-rose-500 text-white'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                            }
                                        `}>
                                            {activeTab === 'likes' ? <Heart size={20} className="fill-white" /> : main.title?.charAt(0).toUpperCase()}
                                        </div>

                                        <div className="text-left flex flex-col gap-0.5 md:block">
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center gap-1.5">
                                                    <h3 className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-purple-600 transition line-clamp-1 leading-tight text-base md:text-xl">{main.title}</h3>
                                                    {main.isOfficial && (
                                                        <BadgeCheck size={18} className="text-blue-500 fill-blue-500/10 flex-shrink-0" aria-label="Música Oficial" />
                                                    )}
                                                </div>
                                                <div className={`p-1 rounded-md ${main.type === 'lyrics' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'}`} title={main.type === 'lyrics' ? "Apenas Letra" : "Cifra com Acordes"}>
                                                    {main.type === 'lyrics' ? <FileText size={14} /> : <Music size={14} />}
                                                </div>
                                            </div>
                                            <div className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium leading-tight md:mt-0">
                                                <span className="block md:inline line-clamp-1 max-w-full">{main.artist}</span>
                                                {main.creator && (
                                                    <span className="block md:inline text-[10px] md:text-xs text-purple-500 font-medium mt-0.5 md:mt-0 md:ml-2">
                                                        <span className="hidden md:inline mr-1">•</span>
                                                        Por: {main.creator?.name || main.creator?.full_name || main.creator?.email?.split('@')[0] || 'Sistema'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 relative">
                                        <div className="flex items-center gap-1 md:gap-2">
                                            {main.type !== 'lyrics' && (
                                                <div className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-xs md:text-sm rounded-xl border border-slate-100 dark:border-slate-700" title={`Tom Original: ${main.originalKey}`}>
                                                    {main.originalKey}
                                                </div>
                                            )}

                                            <Link
                                                to={`/player/${main.id}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-10 h-10 flex items-center justify-center bg-purple-600 text-white rounded-xl shadow-lg shadow-purple-500/20 hover:bg-purple-700 transition transform hover:scale-105"
                                                title="Visualizar"
                                            >
                                                <Play size={20} className="fill-current" />
                                            </Link>

                                            <div className="hidden md:flex items-center gap-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); navigate(`/projector?songId=${main.id}`); }}
                                                    className="w-9 h-9 flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition"
                                                    title="Projetar"
                                                >
                                                    <MonitorUp size={18} strokeWidth={2.5} />
                                                </button>
                                                {main.type !== 'lyrics' && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); navigate(`/player/${main.id}`, { state: { startInLearningMode: true } }); }}
                                                        className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                                                        title="Aprender"
                                                    >
                                                        <GraduationCap size={18} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); navigate(`/player/${main.id}?print=true`); }}
                                                    className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                                                    title="Imprimir"
                                                >
                                                    <Printer size={18} />
                                                </button>
                                                {isEditor && !main.original_song_id && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleCopy(main.id, main.title); }}
                                                        className="w-9 h-9 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-200 dark:hover:bg-blue-900/50 transition"
                                                        title="Copiar para minhas edições"
                                                    >
                                                        <Copy size={18} />
                                                    </button>
                                                )}
                                                {isAdmin && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleToggleOfficial(main.id, main.title, main.isOfficial); }}
                                                        className={`w-9 h-9 flex items-center justify-center rounded-xl transition ${main.isOfficial
                                                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-blue-500'}`}
                                                        title={main.isOfficial ? "Remover Selo Oficial" : "Marcar como Oficial"}
                                                    >
                                                        <BadgeCheck size={18} className={main.isOfficial ? "fill-blue-500/20" : ""} />
                                                    </button>
                                                )}
                                                {(canEdit(main)) && (
                                                    <>
                                                        <Link
                                                            to={`/editor/${main.id}`}
                                                            state={{ song: main }}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                                                            title="Editar"
                                                        >
                                                            <Edit2 size={18} />
                                                        </Link>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(main.id, main.title); }}
                                                            className="w-9 h-9 flex items-center justify-center bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 rounded-xl hover:bg-red-200 dark:hover:bg-red-900/50 transition"
                                                            title="Excluir"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>

                                            <button
                                                onClick={(e) => handleLikeToggle(main.id, e)}
                                                className={`w-9 h-9 flex items-center justify-center rounded-xl transition ${likedSongIds.has(main.id)
                                                    ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-500'
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20'
                                                    }`}
                                                title={likedSongIds.has(main.id) ? "Descurtir" : "Curtir"}
                                            >
                                                <Heart size={18} className={likedSongIds.has(main.id) ? "fill-current" : ""} />
                                            </button>

                                            <button
                                                onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === main.id ? null : main.id); }}
                                                className="md:hidden w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                                            >
                                                {activeMenuId === main.id ? <X size={18} /> : <MoreVertical size={18} />}
                                            </button>
                                        </div>

                                        {activeMenuId === main.id && (
                                            <>
                                                <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); }} />
                                                <div className="absolute right-0 top-full mt-2 bg-white dark:bg-slate-900 shadow-xl rounded-xl p-2 flex flex-col gap-1 z-20 min-w-[160px] border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                                                    <button
                                                        onClick={(e) => handleLikeToggle(main.id, e)}
                                                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition ${likedSongIds.has(main.id)
                                                            ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20'
                                                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                            }`}
                                                    >
                                                        <Heart size={16} className={likedSongIds.has(main.id) ? "fill-current" : ""} />
                                                        {likedSongIds.has(main.id) ? "Descurtir" : "Curtir"}
                                                    </button>
                                                    <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); navigate(`/player/${main.id}`, { state: { startInLearningMode: true } }); setActiveMenuId(null); }}
                                                        className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition"
                                                    >
                                                        <GraduationCap size={16} className="text-purple-600" /> Aprender
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); navigate(`/player/${main.id}?print=true`); setActiveMenuId(null); }}
                                                        className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition"
                                                    >
                                                        <Printer size={16} className="text-blue-500" /> Imprimir
                                                    </button>
                                                    {isEditor && !main.original_song_id && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleCopy(main.id, main.title); setActiveMenuId(null); }}
                                                            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition"
                                                        >
                                                            <Copy size={16} className="text-blue-600" /> Copiar
                                                        </button>
                                                    )}
                                                    {canEdit(main) && (
                                                        <>
                                                            <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); navigate(`/editor/${main.id}`, { state: { song: main } }); setActiveMenuId(null); }}
                                                                className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition"
                                                            >
                                                                <Edit2 size={16} className="text-orange-500" /> Editar
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDelete(main.id, main.title); setActiveMenuId(null); }}
                                                                className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                                                            >
                                                                <Trash2 size={16} /> Excluir
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Versions Indicator & Expandable List */}
                                {versions.length > 0 && (
                                    <div className="pl-12">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleGroup(groupKey); }}
                                            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 py-1"
                                        >
                                            {isExpanded ? 'Ocultar versões' : `+ ${versions.length} ${versions.length === 1 ? 'versão de outro usuário' : 'versões de outros usuários'}`}
                                        </button>

                                        {isExpanded && (
                                            <div className="space-y-1 mt-2 mb-4 border-l-2 border-slate-200 dark:border-slate-800 pl-4 animate-in fade-in slide-in-from-left-2 bg-slate-50/50 dark:bg-slate-900/50 p-2 rounded-r-xl">
                                                {versions.map((v) => (
                                                    <div
                                                        key={v.id}
                                                        onClick={() => handleRowClick(v.id)}
                                                        className={`flex items-center justify-between p-3 rounded-lg border transition cursor-pointer
                                                            ${v.type === 'lyrics' 
                                                                ? 'bg-amber-50/40 dark:bg-amber-900/5 border-amber-100/50 dark:border-amber-900/20 hover:border-amber-300' 
                                                                : 'bg-white dark:bg-slate-800/50 border-slate-100 dark:border-slate-800/50 hover:border-blue-300'}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-1.5 rounded-lg ${v.type === 'lyrics' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                                                                {v.type === 'lyrics' ? <FileText size={14} /> : <Music size={14} />}
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{v.title}</span>
                                                                    {v.type !== 'lyrics' && <span className="text-[10px] font-black text-purple-600 dark:text-purple-400">{v.originalKey}</span>}
                                                                </div>
                                                                <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500">
                                                                    <span className="truncate max-w-[120px]">{v.artist}</span>
                                                                    <span>•</span>
                                                                    <span className="text-purple-500">Por: {v.creator?.name || v.creator?.full_name || v.creator?.email?.split('@')[0] || 'Sistema'}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-1.5">
                                                            {/* Action Icons for version */}
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); navigate(`/projector?songId=${v.id}`); }}
                                                                className="w-7 h-7 flex items-center justify-center text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition"
                                                                title="Projetar"
                                                            >
                                                                <MonitorUp size={14} />
                                                            </button>

                                                            {v.type !== 'lyrics' && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); navigate(`/player/${v.id}`, { state: { startInLearningMode: true } }); }}
                                                                    className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                                                                    title="Aprender"
                                                                >
                                                                    <GraduationCap size={14} />
                                                                </button>
                                                            )}

                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); navigate(`/player/${v.id}?print=true`); }}
                                                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                                                                title="Imprimir"
                                                            >
                                                                <Printer size={14} />
                                                            </button>

                                                            {(canEdit(v)) && (
                                                                <>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); navigate(`/editor/${v.id}`, { state: { song: v } }); }}
                                                                        className="w-7 h-7 flex items-center justify-center text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition"
                                                                        title="Editar"
                                                                    >
                                                                        <Edit2 size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleDelete(v.id, v.title); }}
                                                                        className="w-7 h-7 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                                                                        title="Excluir"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </>
                                                            )}

                                                            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />

                                                            <Link
                                                                to={`/player/${v.id}`}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="w-8 h-8 flex items-center justify-center bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition"
                                                            >
                                                                <Play size={14} fill="currentColor" />
                                                            </Link>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}

                {/* EXTERNAL RESULTS SECTION */}
                {filters.query && (
                    <div className="mt-8 mb-12 animate-fade-in">
                        <div className="flex items-center gap-2 mb-6 px-2">
                            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800"></div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                                <Globe size={14} className="text-blue-500" /> Cifras na Internet (pode levar alguns segundos, aguarde)
                            </span>
                            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800"></div>
                        </div>

                        {isSearchingExternal ? (
                            <div className="flex flex-col items-center py-12 text-slate-400">
                                <Loader2 size={24} className="animate-spin mb-3 text-blue-500" />
                                <p className="text-sm">Buscando cifras online...</p>
                            </div>
                        ) : externalError ? (
                            <div className="text-center py-8 text-slate-400 text-sm italic">
                                {externalError}
                            </div>
                        ) : externalResults.length === 0 ? (
                            <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                                <p className="text-slate-400 text-sm">Nenhum resultado externo para "{filters.query}"</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {externalResults.map((item, idx) => (
                                    <div 
                                        key={idx}
                                        className="group bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/30 hover:shadow-lg transition"
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-500 flex items-center justify-center flex-shrink-0">
                                                <Globe size={20} />
                                            </div>
                                            <div className="overflow-hidden">
                                                <h4 className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition truncate">{item.name}</h4>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.artist}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleImportExternal(item)}
                                            className="ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-blue-600/10"
                                        >
                                            <ExternalLink size={14} />
                                            Importar
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                </>
                )}
            </div>

            {/* Pagination Controls */}
            {activeTab === 'all' && totalSongs > 0 && (
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-6 px-4 py-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="text-sm text-slate-600 dark:text-slate-400 text-center md:text-left">
                        Mostrando {((currentPage - 1) * SONGS_PER_PAGE) + 1} - {Math.min(currentPage * SONGS_PER_PAGE, totalSongs)} de {totalSongs} músicas
                    </div>
                    <div className="flex gap-2 w-full md:w-auto justify-center">
                        <button
                            onClick={() => loadAllSongsData(currentPage - 1)}
                            disabled={currentPage === 1 || isSearching}
                            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            ← Anterior
                        </button>
                        <div className="px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-sm font-bold whitespace-nowrap">
                            Página {currentPage}
                        </div>
                        <button
                            onClick={() => loadAllSongsData(currentPage + 1)}
                            disabled={!hasMore || isSearching}
                            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            Próxima →
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
