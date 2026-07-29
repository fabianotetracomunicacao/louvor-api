import React, { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Home, Music, Mic, Settings, User, Sun, Moon, Shield, Search, X, MonitorUp, Maximize, Minimize, BadgeCheck, Calendar, Library, GraduationCap, Church, CreditCard, DollarSign, Globe, Play, SquarePen, Loader2, Info, Activity, ListMusic } from 'lucide-react';
import { searchSongs, getSongBySlug } from '../utils/storage';
import { parseImporter } from '../utils/importer';
import { useAuth } from '../contexts/AuthContext';
import { Portal } from './Portal';
import { useNavigate, useLocation } from 'react-router-dom';

import { NotificationBell } from './NotificationBell';
import { OfflineIndicator } from './OfflineIndicator';
import { useNotification } from '../contexts/NotificationContext';

export function MainLayout() {
    const {
        user, userProfile, logout, isSuperAdmin, isChurchAdmin, isWorshipLeader,
        churchRole, activeChurch, memberships, changeActiveChurch
    } = useAuth();
    const { showToast } = useNotification();
    const navigate = useNavigate();
    const location = useLocation();
    const isPlayerPage = location.pathname.startsWith('/player');
    const isPlaylistDetailPage = location.pathname.startsWith('/playlist/') && location.pathname !== '/playlists';
    const isEditorPage = location.pathname.startsWith('/editor') || location.pathname === '/new';
    const isProjectorControlPage = location.pathname === '/projector';

    // Theme State
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('theme') || 'dark';
        }
        return 'dark';
    });

    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(t => t === 'dark' ? 'light' : 'dark');
    };

    // Fullscreen State
    const [isFullscreen, setIsFullscreen] = useState(false);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
            setIsFullscreen(true);
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                setIsFullscreen(false);
            }
        }
    };

    // Sync fullscreen state with browser events (e.g. ESC key)
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const handleUserClick = () => {
        if (user) {
            navigate('/profile');
        } else {
            navigate('/login');
        }
    };

    // Search Modal State
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isChurchSwitcherOpen, setIsChurchSwitcherOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [externalResults, setExternalResults] = useState([]);
    const [isSearchingExternal, setIsSearchingExternal] = useState(false);
    const [searchError, setSearchError] = useState(null);

    const API_URL = import.meta.env.VITE_CIFRA_API_URL || 'http://localhost:3000';

    // Debounced Search Effect
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.trim().length > 1) {
                // Search Local
                searchSongs(searchQuery).then(results => {
                    setSearchResults(results || []);
                });
                // Search External
                searchExternal(searchQuery);
            } else {
                setSearchResults([]);
                setExternalResults([]);
                setIsSearchingExternal(false);
            }
        }, 500); // 500ms delay

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleQuickSearch = (query) => {
        setSearchQuery(query);
        setSearchError(null);
    };

    const searchExternal = async (query) => {
        setIsSearchingExternal(true);
        try {
            const response = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error();
            const data = await response.json();

            // Map results to include unique slug for keys
            const mappedResults = (data.results || []).map(item => ({
                ...item,
                slug: `${item.artist_slug}/${item.song_slug}`
            }));

            setExternalResults(mappedResults);
        } catch (err) {
            console.warn("External search failed in MainLayout:", err);
            setExternalResults([]);
        } finally {
            setIsSearchingExternal(false);
        }
    };

    const handleSongSelect = (id) => {
        navigate(`/player/${id}`);
        closeSearch();
    };

    const closeSearch = () => {
        setIsSearchOpen(false);
        setSearchQuery('');
        setSearchResults([]);
        setExternalResults([]);
        setSearchError(null);
    };

    const handleExternalAction = async (item, action) => {
        setIsSearchingExternal(true);
        setSearchError(null);
        try {
            const slug = `${item.artist_slug}/${item.song_slug}`;
            const existing = await getSongBySlug(slug);

            if (existing) {
                if (action === 'edit') navigate(`/editor/${existing.id}`);
                else navigate(`/player/${existing.id}`);
                closeSearch();
                return;
            }

            const response = await fetch(`${API_URL}/artists/${item.artist_slug}/songs/${item.song_slug}`);
            if (!response.ok) throw new Error('Falha ao obter detalhes');
            const data = await response.json();

            const rawContent = (data.cifra || []).join('\n');
            const formattedContent = parseImporter(rawContent);

            const songData = {
                title: data.name,
                artist: data.artist,
                content: formattedContent,
                youtubeLinks: data.youtube_url ? [data.youtube_url] : [],
                cifraclub_slug: slug,
                is_official: false,
                source: 'cifraclub'
            };

            if (action === 'edit') {
                navigate('/editor', { state: { importData: songData } });
            } else {
                navigate('/player/internet', { state: { song: songData } });
            }
            closeSearch();
        } catch (err) {
            console.error("External action failed:", err);
            setSearchError("Erro ao carregar música da internet.");
        } finally {
            setIsSearchingExternal(false);
        }
    };

    return (
        <div className="flex flex-col h-[100dvh] bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors duration-300">
            {/* Quick Search Modal */}
            {isSearchOpen && (
                <Portal>
                    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
                        <div
                            className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                                <Search className="text-slate-400" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="O que vamos tocar?"
                                    className="flex-1 bg-transparent border-none outline-none text-lg font-medium placeholder:text-slate-400"
                                    value={searchQuery}
                                    onChange={(e) => handleQuickSearch(e.target.value)}
                                />
                                <button onClick={() => setIsSearchOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="max-h-[65vh] overflow-y-auto custom-scrollbar">
                                {searchError && (
                                    <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 m-2 rounded-xl">
                                        <Info size={14} />
                                        <span>{searchError}</span>
                                    </div>
                                )}

                                {searchResults.length > 0 && (
                                    <div className="p-2 pt-4">
                                        <div className="flex items-center gap-2 mb-2 px-2">
                                            <Music size={12} className="text-purple-500" />
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">No seu Sistema</span>
                                        </div>
                                        <div className="space-y-1">
                                            {searchResults.map(song => (
                                                <div
                                                    key={song.id}
                                                    onClick={() => handleSongSelect(song.id)}
                                                    className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer rounded-xl flex items-center gap-3 transition"
                                                >
                                                    <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600">
                                                        <Music size={18} />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">{song.title}</h4>
                                                            {song.isOfficial && (
                                                                <BadgeCheck size={14} className="text-blue-500 fill-blue-500/10 flex-shrink-0" />
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 line-clamp-1">
                                                            {song.artist} {song.creatorName && ` • Por: ${song.creatorName}`}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {externalResults.length > 0 && (
                                    <div className="p-2 border-t border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center justify-between mb-2 px-2 mt-2">
                                            <div className="flex items-center gap-2">
                                                <Globe size={12} className="text-blue-500" />
                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cifra na internet (pode levar alguns segundos, aguarde)</span>
                                            </div>
                                            {isSearchingExternal && <Loader2 size={12} className="animate-spin text-slate-400" />}
                                        </div>
                                        <div className="space-y-1">
                                            {externalResults.map(item => (
                                                <div
                                                    key={item.slug}
                                                    className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl flex items-center gap-3 transition group"
                                                >
                                                    <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                                                        <Globe size={18} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">{item.name}</h4>
                                                        <p className="text-[10px] text-slate-500 line-clamp-1">{item.artist}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                                                        <button
                                                            disabled={isSearchingExternal}
                                                            onClick={() => handleExternalAction(item, 'play')}
                                                            className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-lg hover:bg-emerald-200"
                                                            title="Tocar Agora"
                                                        >
                                                            <Play size={16} />
                                                        </button>
                                                        <button
                                                            disabled={isSearchingExternal}
                                                            onClick={() => handleExternalAction(item, 'edit')}
                                                            className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg hover:bg-blue-200"
                                                            title="Importar e Editar"
                                                        >
                                                            <SquarePen size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {searchResults.length === 0 && externalResults.length === 0 && searchQuery.length > 1 && !isSearchingExternal && (
                                    <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
                                        <Search size={32} className="opacity-20" />
                                        <p className="text-sm">Nenhum resultado encontrado</p>
                                    </div>
                                )}

                                {searchQuery.length <= 1 && (
                                    <div className="p-12 text-center text-slate-500 text-xs">
                                        Digite o nome da música ou artista...
                                    </div>
                                )}

                                {isSearchingExternal && externalResults.length === 0 && (
                                    <div className="p-12 flex flex-col items-center gap-3 text-slate-400">
                                        <Loader2 size={32} className="animate-spin opacity-20" />
                                        <p className="text-xs font-medium">Buscando na internet...</p>
                                        <span className="text-[10px] opacity-70 mt-1">(Isso pode levar alguns segundos)</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* Backdrop click to close */}
                        <div className="absolute inset-0 -z-10" onClick={() => setIsSearchOpen(false)} />
                    </div>
                </Portal>
            )}

            {/* Church Switcher Modal */}
            {isChurchSwitcherOpen && (
                <Portal>
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden animate-in zoom-in-95">
                            <div className="p-8 space-y-6">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900 dark:text-white">Trocar de Igreja</h3>
                                        <p className="text-xs text-slate-500">Selecione qual igreja deseja gerenciar agora.</p>
                                    </div>
                                    <button onClick={() => setIsChurchSwitcherOpen(false)} className="p-2 text-slate-400">
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {memberships.map(m => (
                                        <button
                                            key={m.church_id}
                                            onClick={async () => {
                                                await changeActiveChurch(m.church_id);
                                                setIsChurchSwitcherOpen(false);
                                            }}
                                            className={`w-full p-4 rounded-2xl border-2 text-left transition ${activeChurch?.id === m.church_id
                                                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                                                    : 'border-slate-100 dark:border-slate-800 hover:border-slate-200'
                                                }`}
                                        >
                                            <p className={`font-bold ${activeChurch?.id === m.church_id ? 'text-purple-600 dark:text-purple-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                                {m.church?.name}
                                            </p>
                                            <p className="text-[10px] font-black uppercase text-slate-400">
                                                {m.role === 'CHURCH_ADMIN' ? 'Responsável' : m.role === 'WORSHIP_LEADER' ? 'Líder' : 'Adorador'}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}

            {/* Header */}
            {!isPlayerPage && (
                <header className="px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur sticky top-0 z-[100] print:hidden">
                    <div className="flex items-center justify-between">
                        <div 
                            className="flex items-center gap-2 cursor-pointer transition hover:opacity-80"
                            onClick={() => navigate('/dashboard')}
                        >
                            <img src="/logo_official.png" alt="LouvorPlay" className="h-8 object-contain" />
                        </div>
                        <div className="flex gap-2 items-center">
                            <button
                                onClick={toggleFullscreen}
                                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition text-slate-500 dark:text-slate-400 hidden sm:block"
                                title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
                            >
                                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                            </button>

                            <NotificationBell />

                            <button
                                onClick={toggleTheme}
                                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition text-slate-500 dark:text-slate-400 mr-2"
                                title={theme === 'dark' ? "Modo Claro" : "Modo Escuro"}
                            >
                                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                            </button>

                            {/* Admin Links */}
                            {(isChurchAdmin || isSuperAdmin) && (
                                <NavLink
                                    to="/admin/church"
                                    className={({ isActive }) => `p-2 rounded-full transition ${isActive ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                                    title="Painel Igreja"
                                >
                                    <Shield size={20} />
                                </NavLink>
                            )}

                            {isSuperAdmin && (
                                <>
                                    <NavLink
                                        to="/admin/diagnostics"
                                        className={({ isActive }) => `p-2 rounded-full transition ${isActive ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                                        title="Painel de Diagnósticos & Testes"
                                    >
                                        <Activity size={20} />
                                    </NavLink>
                                    <NavLink
                                        to="/admin/churches"
                                        className={({ isActive }) => `p-2 rounded-full transition ${isActive ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                                        title="Gerenciar Igrejas"
                                    >
                                        <Church size={20} />
                                    </NavLink>
                                    <NavLink
                                        to="/admin/cifraclub-imports"
                                        className={({ isActive }) => `p-2 rounded-full transition ${isActive ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                                        title="Importar cifras"
                                        aria-label="Importar cifras"
                                    >
                                        <ListMusic size={20} />
                                    </NavLink>
                                    <NavLink
                                        to="/admin/users"
                                        className={({ isActive }) => `p-2 rounded-full transition ${isActive ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                                        title="Gerenciar Usuários"
                                    >
                                        <User size={20} />
                                    </NavLink>
                                    <NavLink
                                        to="/admin/plans"
                                        className={({ isActive }) => `p-2 rounded-full transition ${isActive ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                                        title="Gerenciar Planos"
                                    >
                                        <CreditCard size={20} />
                                    </NavLink>
                                    <NavLink
                                        to="/admin/financials"
                                        className={({ isActive }) => `p-2 rounded-full transition ${isActive ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                                        title="Painel Financeiro"
                                    >
                                        <DollarSign size={20} />
                                    </NavLink>
                                </>
                            )}

                            {activeChurch && (
                                <div className="hidden md:flex flex-col items-end -space-y-1 mr-2 px-3 border-r border-slate-200 dark:border-slate-800">
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => navigate('/admin/church')}
                                            className="text-[10px] font-black uppercase tracking-widest text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 transition flex items-center gap-1"
                                            title="Gerenciar Igreja"
                                        >
                                            <Shield size={10} />
                                            {activeChurch.name}
                                        </button>
                                        {memberships.length > 1 && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsChurchSwitcherOpen(true);
                                                }}
                                                className="text-[10px] text-slate-400 hover:text-purple-600 transition"
                                                title="Trocar de Igreja"
                                            >
                                                {'▼'}
                                            </button>
                                        )}
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600 uppercase">
                                        {isSuperAdmin ? 'Super Admin' :
                                            isChurchAdmin ? 'Responsável' :
                                                isWorshipLeader ? 'Líder de Adoração' :
                                                    'Adorador'}
                                    </span>
                                </div>
                            )}

                            <button
                                onClick={handleUserClick}
                                className="flex items-center gap-2 pl-2 pr-1 py-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition group"
                            >
                                {userProfile ? (
                                    <>
                                        <div className="hidden sm:block text-right mr-1">
                                            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-none">
                                                {(userProfile.full_name || userProfile.name || '').split(' ')[0]}
                                            </p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5 leading-none">
                                                {isSuperAdmin ? 'Super Admin' : isChurchAdmin ? 'Responsável' : isWorshipLeader ? 'Líder de Adoração' : 'Adorador'}
                                            </p>
                                        </div>
                                        <div className="w-9 h-9 rounded-full bg-purple-600 p-0.5 shadow-lg shadow-purple-600/20">
                                            {userProfile.avatar_url ? (
                                                <img src={userProfile.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center text-white font-bold text-sm">
                                                    {(userProfile.full_name || userProfile.name || 'U').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                                        <User size={20} />
                                    </div>
                                )}
                            </button>
                        </div>
                    </div>
                </header>
            )}

            {/* Main Content Area */}
            {/* Fix: If isPlayerPage OR isPlaylistDetailPage OR isEditorPage, remove overflow-y-auto so page can handle its own scroll */}
            <main className={`flex-1 ${(isPlayerPage || isPlaylistDetailPage || isEditorPage || isProjectorControlPage) ? 'overflow-hidden' : 'overflow-y-auto'} p-4 ${(isPlayerPage || isEditorPage || isProjectorControlPage) ? 'p-0' : ''} print:p-0 print:overflow-visible`} style={(!isPlayerPage && !isProjectorControlPage && !isEditorPage) ? { paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' } : {}}>
                <Outlet context={{ theme, toggleTheme }} />
                <OfflineIndicator />
            </main>

            {/* Bottom Navigation (Mobile First) */}
            {!isPlayerPage && !isEditorPage && (
                <nav className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-800/95 backdrop-blur border-t border-slate-200 dark:border-slate-700 px-6 py-3 print:hidden z-20 safe-area-bottom">
                    <div className="flex items-center justify-between max-w-md mx-auto">
                        <NavLink
                            to="/dashboard"
                            className={({ isActive }) => `flex flex-col items-center gap-1 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}
                        >
                            <Home size={24} />
                            <span className="text-xs">Início</span>
                        </NavLink>

                        <NavLink
                            to="/repertoire"
                            className={({ isActive }) => `flex flex-col items-center gap-1 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}
                        >
                            <Music size={24} />
                            <span className="text-xs">Músicas</span>
                        </NavLink>

                        <NavLink
                            to="/playlists"
                            className={({ isActive }) => `flex flex-col items-center gap-1 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}
                        >
                            <Library size={24} />
                            <span className="text-xs">Playlists</span>
                        </NavLink>


                        <button
                            onClick={() => setIsSearchOpen(true)}
                            className="flex flex-col items-center gap-1 -mt-8 outline-none group"
                        >
                            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 rounded-full shadow-lg border-4 border-slate-100 dark:border-slate-900 group-hover:scale-105 transition transform duration-200">
                                <Mic size={28} className="text-white" />
                            </div>
                            <span className="text-xs text-slate-400 group-hover:text-purple-500 transition">Tocar</span>
                        </button>

                        <NavLink
                            to="/escalas"
                            className={({ isActive }) => `flex flex-col items-center gap-1 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}
                        >
                            <Calendar size={24} />
                            <span className="text-xs">Escalas</span>
                        </NavLink>

                        <NavLink
                            to="/projector"
                            className={({ isActive }) => `flex flex-col items-center gap-1 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}
                        >
                            <MonitorUp size={24} />
                            <span className="text-xs">Projetar</span>
                        </NavLink>

                        <button
                            onClick={() => showToast('Módulo de treinamento disponível em breve!', 'info')}
                            className="flex flex-col items-center gap-1 text-slate-400 hover:text-purple-500 transition"
                        >
                            <GraduationCap size={24} />
                            <span className="text-xs">Aprender</span>
                        </button>

                    </div>
                    <div className="text-[10px] text-center text-slate-300 dark:text-slate-600 mt-2 font-medium">
                        © {new Date().getFullYear()} LouvorPlay | Produzido por Ide!
                    </div>
                </nav>
            )}
        </div>
    );
}
