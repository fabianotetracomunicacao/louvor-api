import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Trash2, Library, X, Search, Globe, Lock, Eye, Edit2, Copy, Printer, BookOpen, GripVertical, User, Heart, Users, Mail, UserMinus, ShieldCheck, MessageSquare, Send, ArrowLeft, Settings, PenLine, Check, GraduationCap, Play, MoreVertical, List, ListMusic, Music, Calendar, Download, Monitor, MonitorUp, FileText, Edit3 } from 'lucide-react';
import { useNavigate, useSearchParams, Link, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useNotification } from '../contexts/NotificationContext';
import { LiquidLoader } from '../components/LiquidLoader';
import { supabase } from '../supabaseClient';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
    searchPublicPlaylists,
    followPlaylist,
    unfollowPlaylist,
    inviteCollaborator,
    removeMember,
    savePlaylistMetadata,
    deletePlaylist,
    clonePlaylist,
    getSongs,
    getPlaylistWithItems,
    addSongToPlaylist,
    removeSongFromPlaylist,
    updatePlaylistOrder,
    getPlaylistMembers,
    getPlaylistComments,
    addComment,
    deleteComment,
    respondToPlaylistInvite,
    getSetlists,
    createSetlist,
    deleteSetlist,
    updateSetlist,
    addUserToSetlistScale,
    createSetlistFromTemplate,
    duplicateSetlist,
    downloadSetlistForOffline,
    downloadPlaylistForOffline,
    removePlaylistFromOffline
} from '../utils/storage';
import { SetlistManager } from '../components/SetlistManager';
import { Portal } from '../components/Portal';



export function PlaylistPage() {
    const { user, isEditor, isAdmin } = useAuth();
    const { myPlaylists, refreshPlaylists, isLoadingPlaylists } = useData(); // Use cached data
    const navigate = useNavigate();
    const { showToast, confirmAction } = useNotification();
    const [searchParams, setSearchParams] = useSearchParams();
    const { id: routeId } = useParams();
    const location = useLocation();

    // Priority: Route Param > Search Param
    const playlistId = routeId || searchParams.get('id');

    // UI Mode
    const [activeTab, setActiveTab] = useState('my');

    // Data - Removing local myPlaylists state since we use Context
    const [publicPlaylists, setPublicPlaylists] = useState([]);
    const [selectedPlaylist, setSelectedPlaylist] = useState(null);
    const [loadingError, setLoadingError] = useState(null);

    // Filtered Lists for "Minhas Playlists"
    const [privatePlaylists, setPrivatePlaylists] = useState([]); // Privadas Owned
    const [collabPlaylists, setCollabPlaylists] = useState([]);   // Editor
    const [publicOwnedPlaylists, setPublicOwnedPlaylists] = useState([]); // Publicas Owned + Publicos Followed (Viewer)
    const [lyricsLists, setLyricsLists] = useState([]); // Specialized Lyrics Lists
    // const [pendingInvites, setPendingInvites] = useState([]); // Merged into others
    // Actually user asked for 3 rows:
    // 1. Privadas (Owned Private)
    // 2. Colaborativas (Editor)
    // 3. Públicas (Owned Public + Followed)

    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    // Song Add
    const [isAddingSong, setIsAddingSong] = useState(false);
    const [songSearchQuery, setSongSearchQuery] = useState('');
    const [allSongs, setAllSongs] = useState([]);


    // Social State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [members, setMembers] = useState([]);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [sendingComment, setSendingComment] = useState(false);

    // Invite Modal
    const [isInviting, setIsInviting] = useState(false);
    const [activeMenuId, setActiveMenuId] = useState(null); // Mobile Menu State

    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteLoading, setInviteLoading] = useState(false);

    // Edit Playlist Modal
    const [isEditingPlaylist, setIsEditingPlaylist] = useState(false);
    const [editPlaylistName, setEditPlaylistName] = useState('');
    const [editPlaylistPublic, setEditPlaylistPublic] = useState(false);
    const [editPlaylistCollab, setEditPlaylistCollab] = useState(false);



    // Edit Item Modal (Transposition)
    const [isEditingItem, setIsEditingItem] = useState(false);
    const [editingItemData, setEditingItemData] = useState(null);
    const [editItemTransposition, setEditItemTransposition] = useState(0);

    // Setlist Manager (Atomic State)
    const [setlistManager, setSetlistManager] = useState({ isOpen: false, data: null });

    // Setlist Filters
    const [showMyScalesOnly, setShowMyScalesOnly] = useState(false);
    const [showFutureOnly, setShowFutureOnly] = useState(true);
    const [playlistView, setPlaylistView] = useState('songs'); // 'songs' | 'setlists'
    const [setlists, setSetlists] = useState([]);
    const [cachedSetlists, setCachedSetlists] = useState(new Set());
    const hasTriedPlaylistsRefresh = useRef(false);

    // Effect: Refresh playlists if empty (crucial for offline cache population and visibility)
    useEffect(() => {
        if (myPlaylists.length === 0 && !isLoadingPlaylists && !hasTriedPlaylistsRefresh.current) {
            hasTriedPlaylistsRefresh.current = true;
            refreshPlaylists();
        }
    }, [myPlaylists.length, refreshPlaylists]);

    // Effect: Check for cached setlists whenever list changes
    useEffect(() => {
        const checkCache = () => {
            const cached = new Set();
            setlists.forEach(item => {
                if (localStorage.getItem('lp_cache_setlist_' + item.id)) {
                    cached.add(item.id);
                }
            });
            setCachedSetlists(cached);
        };
        checkCache();
    }, [setlists]);

    // Effect: Block background scroll when modals are open
    useEffect(() => {
        const anyModalOpen = isAddingSong || isInviting || isEditingPlaylist || isEditingItem || setlistManager.isOpen;
        if (anyModalOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isAddingSong, isInviting, isEditingPlaylist, isEditingItem, setlistManager.isOpen]);

    // Chat Auto-Scroll & Notifications
    const messagesEndRef = useRef(null);
    const [lastReadTime, setLastReadTime] = useState('1970-01-01');

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // Load last read time on playlist change
    useEffect(() => {
        if (selectedPlaylist && user) {
            const key = `chat_read_${selectedPlaylist.id}_${user.id}`;
            const stored = localStorage.getItem(key);
            setLastReadTime(stored || '1970-01-01');
        }
    }, [selectedPlaylist?.id, user?.id]);

    // Playlist Offline State
    const [downloadedPlaylists, setDownloadedPlaylists] = useState(new Set());
    const [downloadingPlaylists, setDownloadingPlaylists] = useState(new Set()); // For loading spinner
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    // Network Status Listener
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Check for downloaded playlists
    useEffect(() => {
        const checkDownloads = () => {
            const downloaded = new Set();
            // Check all relevant playlists
            const allToCheck = [...privatePlaylists, ...collabPlaylists, ...publicOwnedPlaylists, ...publicPlaylists];
            allToCheck.forEach(p => {
                if (localStorage.getItem(`lp_cache_downloaded_playlist_${p.id}`)) {
                    downloaded.add(p.id);
                }
            });
            setDownloadedPlaylists(downloaded);
        };
        // Run on relevant list changes
        checkDownloads();
        // Also run on interval? Or just rely on updates.
    }, [privatePlaylists, collabPlaylists, publicOwnedPlaylists, publicPlaylists]);

    const handleDownloadPlaylist = async (e, playlistId) => {
        e.stopPropagation();
        if (downloadingPlaylists.has(playlistId)) return;

        const isDownloaded = downloadedPlaylists.has(playlistId);

        if (isDownloaded) {
            // REMOVE Logic
            if (confirm("Remover esta playlist do acesso offline?")) {
                const success = removePlaylistFromOffline(playlistId);
                if (success) {
                    setDownloadedPlaylists(prev => {
                        const next = new Set(prev);
                        next.delete(playlistId);
                        return next;
                    });
                    showToast("Download removido.", "success");
                } else {
                    showToast("Erro ao remover download.", "error");
                }
            }
        } else {
            // DOWNLOAD Logic
            if (confirm("Baixar TODA a playlist e seus setlists para acesso offline? Isso pode levar alguns segundos.")) {
                setDownloadingPlaylists(prev => new Set(prev).add(playlistId));
                const success = await downloadPlaylistForOffline(playlistId);
                setDownloadingPlaylists(prev => {
                    const next = new Set(prev);
                    next.delete(playlistId);
                    return next;
                });

                if (success) {
                    // Update UI state
                    setDownloadedPlaylists(prev => new Set(prev).add(playlistId));
                    showToast("Playlist baixada com sucesso!", "success");
                } else {
                    alert("Erro ao baixar playlist. Verifique sua conexão.");
                }
            }
        }
    };

    // Mark as read when opening chat or receiving messages while open
    useEffect(() => {
        if (isChatOpen && selectedPlaylist && user) {
            const now = new Date().toISOString();
            setLastReadTime(now);
            localStorage.setItem(`chat_read_${selectedPlaylist.id}_${user.id}`, now);
            scrollToBottom();
        }
    }, [comments, isChatOpen, selectedPlaylist?.id, user?.id]);

    const unreadCount = useMemo(() => {
        if (!selectedPlaylist?.is_collaborative || !comments.length) return 0;
        return comments.filter(c => new Date(c.created_at) > new Date(lastReadTime)).length;
    }, [comments, lastReadTime, selectedPlaylist]);

    useEffect(() => {
        if (selectedPlaylist && playlistView === 'setlists') {
            loadSetlists();
        }
    }, [selectedPlaylist?.id, playlistView]);

    // Auto-open chat or set view if navigated with state or search params
    useEffect(() => {
        if (location.state?.openChat && selectedPlaylist?.is_collaborative) {
            setIsChatOpen(true);
        }

        const tab = searchParams.get('tab');
        const filter = searchParams.get('filter');

        if (tab === 'setlists' || location.state?.view === 'setlists') {
            setPlaylistView('setlists');
        }

        if (filter === 'my-scales') {
            setShowMyScalesOnly(true);
        }
    }, [location.state, selectedPlaylist?.is_collaborative, searchParams]);

    const loadSetlists = async () => {
        if (!selectedPlaylist) return;
        try {
            const data = await getSetlists(selectedPlaylist.id);
            setSetlists(data);
        } catch (e) {
            console.error(e);
        }
    };

    const handleNewSetlist = () => {
        setSetlistManager({ isOpen: true, data: null });
    };

    const handleEditSetlist = (setlist) => {
        setSetlistManager({ isOpen: true, data: setlist });
    };

    const getNavigationContext = (list, type, name, id) => {
        return {
            type,
            id,
            name,
            items: list.map(i => ({
                id: i.song?.id, // Ensure we get the song ID
                title: i.song?.title,
                artist: i.song?.artist,
                content: i.song?.content,
                duration: i.song?.duration,
                originalKey: i.song?.originalKey,
                transposition: i.transposition || i.customTransposition || 0,
                itemId: i.itemId || i.id, // Handle unified ID access if possible
                key: i.transposition || 0 // Deprecated/alias
            })).filter(i => i.id), // Filter out items with missing song data
            total: list.length
        };
    };



    const playPlaylist = (startIndex = 0) => {
        if (!selectedPlaylist.items || selectedPlaylist.items.length === 0) {
            alert("Esta playlist está vazia.");
            return;
        }

        const context = getNavigationContext(selectedPlaylist.items, 'playlist', selectedPlaylist.name, selectedPlaylist.id);
        const item = selectedPlaylist.items[startIndex];

        if (!item || !item.song) {
            alert("Música inválida.");
            console.error("Música inválida no índice:", startIndex);
            return;
        }

        navigate(`/player/${item.song.id}`, {
            state: {
                song: item.song,
                playlistItemId: item.itemId,
                context,
                currentIndex: startIndex,
                initialTransposition: item.customTransposition || 0
            }
        });
    };

    const playSetlist = (setlist) => {
        console.log('Playing setlist:', setlist);
        if (!setlist.items || setlist.items.length === 0) {
            alert("Este setlist está vazio.");
            return;
        }

        const context = {
            ...getNavigationContext(setlist.items, 'setlist', setlist.name, setlist.id),
            playlistId: selectedPlaylist?.id // So PlayerPage can navigate back to setlists tab
        };
        const firstItem = setlist.items[0];

        console.log('First Item:', firstItem);

        // Ensure first item has a song
        if (!firstItem.song) {
            alert(`Erro: O primeiro item do setlist não tem música válida. (Item ID: ${firstItem.id})`);
            console.error("Item sem música:", firstItem);
            return;
        }

        console.log('Navigating to:', firstItem.song.title);

        navigate(`/player/${firstItem.song.id}`, {
            state: {
                song: firstItem.song,
                playlistItemId: firstItem.id, // Use setlist item id as playlistItemId
                context,
                currentIndex: 0,
                initialTransposition: firstItem.transposition || 0
            }
        });
    };

    const handleSaveSetlist = async (setlistData) => {
        try {
            // Extract scaleMembers from the rest of the data
            const { scaleMembers, ...playlistData } = setlistData;

            let finalId = null;

            if (setlistManager.data) {
                // Update existing
                finalId = setlistManager.data.id;
                await updateSetlist(finalId, { ...playlistData });
                alert('Setlist atualizado com sucesso!');
            } else {
                // Create new
                const result = await createSetlist({ ...playlistData, playlistId: selectedPlaylist.id });
                if (result) finalId = result.id; // Usually standard return is object or ID
                alert('Setlist criado com sucesso!');

                // If we have scale members to add for this NEW setlist
                if (finalId && scaleMembers && scaleMembers.length > 0) {
                    for (const member of scaleMembers) {
                        // Default role 'Vocal' if missing
                        await addUserToSetlistScale(finalId, member.userId, member.role || 'Vocal');
                    }
                }
            }

            setSetlistManager({ isOpen: false, data: null });
            loadSetlists(); // Refresh list
        } catch (e) {
            console.error(e);
            alert('Erro ao salvar setlist.');
        }
    };

    const handleDownloadSetlist = async (e, setlistId) => {
        e.stopPropagation();
        if (confirm("Baixar este setlist e suas músicas para acesso offline?")) {
            const success = await downloadSetlistForOffline(setlistId);
            if (success) {
                // alert("Setlist baixado com sucesso! Você poderá acessá-lo mesmo sem internet."); // Removed alert for smoother UX
                setCachedSetlists(prev => new Set(prev).add(setlistId));
                loadSetlists(); // Refresh to ensure cache is consistent
            } else {
                alert("Erro ao baixar setlist. Verifique sua conexão.");
            }
        }
    };

    const handleDeleteSetlist = async (setlistId) => {
        if (!confirm('Tem certeza que deseja apagar este setlist?')) return;
        try {
            // Optimistic update
            const previousList = [...setlists];
            setSetlists(prev => prev.filter(s => s.id !== setlistId));

            await deleteSetlist(setlistId);
        } catch (e) {
            console.error(e);
            alert('Erro ao excluir setlist.');
            loadSetlists(); // Revert
        }
    };


    useEffect(() => {
        const init = async () => {
            // getSongs now returns {songs, total, hasMore}
            const result = await getSongs({ limit: 1000 }); // Get many songs for playlist modal
            setAllSongs(result.songs);
        };
        init();
    }, []);

    // Lazy load playlists on mount if not already loaded
    useEffect(() => {
        if (myPlaylists.length === 0 && !isLoadingPlaylists) {
            refreshPlaylists();
        }
    }, []);

    // Categorize Playlists
    useEffect(() => {
        if (!user || myPlaylists.length === 0) {
            setPrivatePlaylists([]);
            setCollabPlaylists([]);
            setPublicOwnedPlaylists([]);
            setLyricsLists([]);
            return;
        }

        const priv = [];
        const collab = [];
        const pub = [];
        const lyr = [];




        myPlaylists.forEach(p => {
            // Role logic
            const role = p.role || (p.owner_id === user.id ? 'owner' : 'viewer');


            if (p.type === 'lyrics_list') {
                lyr.push(p);
            } else if (role === 'owner') {
                if (p.is_public) {
                    pub.push(p); // Public Owned
                } else if (p.is_collaborative) {
                    collab.push(p); // Owner + Collaborative -> Collab Row
                } else {
                    priv.push(p); // Private Owned
                }
            } else if (role === 'editor') {
                collab.push(p); // Collaborative -> Row 2
            } else {
                pub.push(p); // Viewer/Followed -> Row 3 (Publicas)
            }

        });

        setPrivatePlaylists(priv);
        setCollabPlaylists(collab);
        setPublicOwnedPlaylists(pub);
        setLyricsLists(lyr);
    }, [myPlaylists, user]);


    useEffect(() => {
        if (playlistId) {
            loadPlaylistDetails(playlistId);
        } else {
            setSelectedPlaylist(null);
        }
    }, [playlistId]);

    // Realtime Updates for Collaboration
    useEffect(() => {
        if (!selectedPlaylist?.id) return;

        const channel = supabase
            .channel(`playlist_updates_${selectedPlaylist.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'playlist_items',
                    filter: `playlist_id=eq.${selectedPlaylist.id}`
                },
                (payload) => {
                    loadPlaylistDetails(selectedPlaylist.id);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'playlist_comments',
                    filter: `playlist_id=eq.${selectedPlaylist.id}`
                },
                (payload) => {
                    // Refresh just comments if possible, but loadPlaylistDetails does both for now
                    getPlaylistComments(selectedPlaylist.id).then(setComments);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'playlist_members',
                    filter: `playlist_id=eq.${selectedPlaylist.id}`
                },
                (payload) => {
                    getPlaylistMembers(selectedPlaylist.id).then(setMembers);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [selectedPlaylist?.id]);

    useEffect(() => {
        if (activeTab === 'explore') {
            const delayDebounceFn = setTimeout(() => {
                handleSearchPublic();
            }, 500);
            return () => clearTimeout(delayDebounceFn);
        }
    }, [searchQuery, activeTab]);

    const loadMyPlaylists = async () => {
        // Use context refresher
        if (refreshPlaylists) refreshPlaylists();
    };

    const handleSearchPublic = async () => {
        if (searchQuery.length < 2) {
            setPublicPlaylists([]);
            return;
        }
        setIsSearching(true);
        const results = await searchPublicPlaylists(searchQuery);
        setPublicPlaylists(results);
        setIsSearching(false);
    };

    const loadPlaylistDetails = async (id) => {
        if (!id) return;
        setLoadingError(null);
        const fullPlaylist = await getPlaylistWithItems(id);

        if (!fullPlaylist) {
            setLoadingError("Playlist não encontrada ou indisponível offline.");
            setSelectedPlaylist(null);
            return;
        }

        setSelectedPlaylist(fullPlaylist);

        // Load Social Data
        if (fullPlaylist) {
            try {
                const m = await getPlaylistMembers(id);
                setMembers(m);
                const c = await getPlaylistComments(id);
                setComments(c);
            } catch (e) {
                console.warn("Offline: failed to load social data", e);
            }
        }
    };

    const handleSendComment = async (e) => {
        e.preventDefault();
        if (!newComment.trim()) return;
        setSendingComment(true);
        try {
            await addComment(selectedPlaylist.id, newComment);
            const c = await getPlaylistComments(selectedPlaylist.id);
            setComments(c);
            setNewComment('');
            showToast('Mensagem enviada', 'success');
        } catch (error) {
            console.error(error);
            showToast('Erro ao enviar mensagem.', 'error');
        } finally {
            setSendingComment(false);
        }
    };

    const handleDeleteComment = async (commentId) => {
        const confirmed = await confirmAction({
            title: 'Apagar comentário',
            message: 'Tem certeza que deseja apagar esta mensagem?',
            confirmText: 'Apagar',
            type: 'danger'
        });
        if (!confirmed) return;

        try {
            await deleteComment(commentId);
            const c = await getPlaylistComments(selectedPlaylist.id);
            setComments(c);
            showToast('Comentário apagado.', 'success');
        } catch (error) {
            console.error(error);
            showToast('Erro ao apagar.', 'error');
        }
    };

    // State for Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
    const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [isPrivate, setIsPrivate] = useState(true); // Default to Private
    const [isCollaborative, setIsCollaborative] = useState(false); // Default false
    const [isLyricsList, setIsLyricsList] = useState(false); // NEW: Projeção type

    const handleCreatePlaylist = async () => {
        if (!newPlaylistName.trim()) {
            showToast('O nome é obrigatório.', 'warning');
            return;
        }

        try {
            await savePlaylistMetadata({
                id: modalMode === 'edit' ? selectedPlaylistId : undefined,
                name: newPlaylistName,
                isPublic: !isPrivate, // Invert logic for DB
                isCollaborative: isCollaborative, // NEW
                type: isLyricsList ? 'lyrics_list' : 'playlist', // NEW: Projeção
                ownerId: user.id
            });
            setIsModalOpen(false);
            setNewPlaylistName('');
            loadMyPlaylists(); // Refresh list
            showToast(`Playlist ${modalMode === 'create' ? 'criada' : 'atualizada'} com sucesso!`, 'success');
        } catch (error) {
            console.error("Error creating playlist:", error);
            showToast("Erro ao salvar playlist", 'error');
        }
    };

    const openNewPlaylistModal = () => {
        setModalMode('create');
        setNewPlaylistName('');
        setIsPrivate(true); // Default private
        setIsCollaborative(false); // Default
        setIsLyricsList(false); // Default
        setIsModalOpen(true);
    };

    const openEditPlaylistModal = (playlist) => {
        setModalMode('edit');
        setSelectedPlaylistId(playlist.id);
        setNewPlaylistName(playlist.name);
        setIsPrivate(!playlist.is_public); // Set toggle based on current state
        setIsCollaborative(playlist.is_collaborative || false);
        setIsLyricsList(playlist.type === 'lyrics_list'); // NEW
        setIsModalOpen(true);
    };

    const handleOpenPlaylist = (id) => {
        navigate(`?id=${id}`);
    };

    // (handleCreatePlaylistSubmit was removed previously)

    const handleDeletePlaylist = async (id, e) => {
        e.stopPropagation();
        const confirmed = await confirmAction({
            title: 'Excluir Playlist',
            message: 'Tem certeza que deseja excluir esta playlist? Esta ação não pode ser desfeita.',
            confirmText: 'Excluir',
            type: 'danger'
        });

        if (confirmed) {
            try {
                await deletePlaylist(id);
                if (selectedPlaylist?.id === id) setSelectedPlaylist(null);
                await loadMyPlaylists();
                showToast('Playlist excluída.', 'success');
            } catch (error) {
                console.error(error);
                showToast('Erro ao excluir playlist.', 'error');
            }
        }
    };

    const handleClonePlaylist = async (id, e) => {
        e.stopPropagation();

        const confirmed = await confirmAction({
            title: 'Clonar Playlist',
            message: 'Deseja criar uma cópia desta playlist para você?',
            confirmText: 'Clonar',
            type: 'info'
        });

        if (confirmed) {
            try {
                if (!user) return showToast('Faça login para clonar.', 'warning');
                await clonePlaylist(id, user.id);
                await loadMyPlaylists();
                showToast('Playlist copiada com sucesso!', 'success');
                setActiveTab('my');
            } catch (error) {
                console.error(error);
                showToast('Erro ao clonar playlist.', 'error');
            }
        }
    };

    const handleFollowPlaylist = async (id, e) => {
        e.stopPropagation();
        try {
            await followPlaylist(id);
            await loadMyPlaylists();
            showToast('Adicionada às suas playlists!', 'success');
        } catch (error) {
            console.error(error);
            showToast('Erro ao seguir playlist.', 'error');
        }
    };

    const handleUnfollowPlaylist = async (id, e) => {
        e.stopPropagation();
        const confirmed = await confirmAction({
            title: 'Deixar de Seguir',
            message: 'Remover esta playlist da sua lista?',
            confirmText: 'Remover',
            type: 'danger'
        });

        if (confirmed) {
            try {
                await removeMember(id, user.id);
                await loadMyPlaylists();
                if (selectedPlaylist?.id === id) setSelectedPlaylist(null);
                showToast('Playlist removida.', 'success');
            } catch (error) {
                console.error(error);
                showToast('Erro ao remover playlist.', 'error');
            }
        }
    };

    const handleInviteUser = async (e) => {
        e.preventDefault();
        if (!inviteEmail) return;
        setInviteLoading(true);
        try {
            await inviteCollaborator(selectedPlaylist.id, inviteEmail);
            showToast('Convite enviado com sucesso!', 'success');
            setInviteEmail('');
            // Refresh members
            const m = await getPlaylistMembers(selectedPlaylist.id);
            setMembers(m);
        } catch (error) {
            console.error(error);
            showToast(`Erro ao convidar: ${error.message || 'Verifique o email.'}`, 'error');
        } finally {
            setInviteLoading(false);
        }
    };

    const handleRemoveCollaborator = async (userId) => {
        if (!userId) return;
        const confirmed = await confirmAction({
            title: 'Remover Colaborador',
            message: 'Tem certeza que deseja remover este usuário da playlist?',
            type: 'danger'
        });

        if (confirmed) {
            try {
                await removeMember(selectedPlaylist.id, userId);
                const m = await getPlaylistMembers(selectedPlaylist.id);
                setMembers(m);
                showToast('Colaborador removido.', 'success');
            } catch (error) {
                console.error(error);
                showToast('Erro ao remover colaborador.', 'error');
            }
        }
    };

    const handleAddSongToPlaylist = async (song) => {
        if (!selectedPlaylist || !song || !song.id) return;
        if (selectedPlaylist.items?.some(item => item.song?.id === song.id)) {
            showToast('Música já está na playlist.', 'info');
            return;
        }
        try {
            const nextPosition = selectedPlaylist.items?.length || 0;
            await addSongToPlaylist(selectedPlaylist.id, song.id, nextPosition);
            await loadPlaylistDetails(selectedPlaylist.id);
            // setIsAddingSong(false); // User requested to keep open
            await loadMyPlaylists();
            showToast('Música adicionada!', 'success');
        } catch (error) {
            console.error(error);
            showToast('Erro ao adicionar música.', 'error');
        }
    };

    const handleRemoveSongFromPlaylist = async (itemId) => {
        if (!selectedPlaylist) return;
        
        await confirmAction({
            title: 'Remover da Playlist',
            message: (
                <>
                    Deseja remover esta música da playlist?
                    <span className="text-sm opacity-80 mt-2 block">
                        (Fique tranquilo, ela não será excluída do sistema, apenas desta lista).
                    </span>
                </>
            ),
            confirmText: 'Sim, remover',
            cancelText: 'Cancelar',
            type: 'danger',
            onConfirm: async () => {
                await removeSongFromPlaylist(itemId);
                await loadPlaylistDetails(selectedPlaylist.id);
                showToast('Música removida da playlist.', 'success');
            }
        });
    };

    const onDragEnd = async (result) => {
        if (!result.destination) return;
        const { source, destination } = result;
        if (source.index === destination.index) return;
        const newItems = Array.from(selectedPlaylist.items);
        const [reorderedItem] = newItems.splice(source.index, 1);
        newItems.splice(destination.index, 0, reorderedItem);
        const updatedPlaylist = { ...selectedPlaylist, items: newItems };
        setSelectedPlaylist(updatedPlaylist);
        await updatePlaylistOrder(newItems, selectedPlaylist.id);
    };

    const filteredSongs = allSongs.filter(song =>
        song && song.id &&
        (song.title?.toLowerCase().includes(songSearchQuery.toLowerCase()) ||
            song.artist?.toLowerCase().includes(songSearchQuery.toLowerCase()))
    );

    const isOwner = selectedPlaylist && user?.id === selectedPlaylist.owner_id;

    const handleInviteAction = async (playlistId, accept) => {
        try {
            await respondToPlaylistInvite(playlistId, accept);
            showToast(accept ? "Convite aceito!" : "Convite recusado.", accept ? "success" : "info");
            refreshPlaylists();
        } catch (error) {
            console.error(error);
            showToast("Erro ao processar convite.", "error");
        }
    };

    // Check if user is editor (in list) - logic is imperfect if not loaded, but RLS protects actions.
    const isEditorOrOwner = isOwner || myPlaylists.find(p => p.id === selectedPlaylist?.id)?.role === 'editor';

    // RENDER PLAYLIST CARD HELPER
    const PlaylistCard = ({ playlist, type: initialType }) => {
        const isMyOwned = user?.id === playlist.owner_id;
        // Determine effective type (override if pending)
        const type = playlist.membershipStatus === 'pending' ? 'pending' : initialType;

        // Icons/Colors based on type
        // Privada: Lock, Purple
        // Collab: Users, Blue/Orange
        // Public: Globe, Blue/Green
        // Pending: Mail, Gray

        let icon = <Library size={32} />;
        let bgClass = "bg-slate-100 dark:bg-slate-700 text-slate-400";
        if (type === 'private') {
            bgClass = "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400";
            icon = <Lock size={32} />;
        } else if (type === 'collab') {
            bgClass = "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400";
            icon = <Users size={32} />;
        } else if (type === 'public') {
            bgClass = "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400";
            icon = <Globe size={32} />;
            if (!isMyOwned) icon = <Heart size={32} fill="currentColor" />;
        } else if (type === 'pending') {
            bgClass = "bg-slate-200 dark:bg-slate-700 text-slate-500";
            icon = <Mail size={32} />;
        } else if (type === 'lyrics') {
            bgClass = "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400";
            icon = <FileText size={32} />;
        }


        return (
            <div
                onClick={() => type !== 'pending' && handleOpenPlaylist(playlist.id)}
                className={`bg-white dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center gap-4 text-center aspect-square shadow-sm relative group ${type !== 'pending' ? 'hover:border-slate-400 dark:hover:border-slate-600 cursor-pointer hover:shadow-md' : ''}`}
            >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center transition duration-300 ${bgClass} ${type !== 'pending' ? 'group-hover:scale-110' : ''}`}>
                    {icon}
                </div>
                <div className="w-full">
                    <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200 group-hover:text-purple-600 dark:group-hover:text-white mb-1 transition-colors truncate px-2">{playlist.name}</h3>
                    <div className="flex flex-col gap-1">
                        {type === 'pending' ? (
                            <span className="text-xs text-slate-500 font-bold">Convite Pendente</span>
                        ) : isMyOwned ? (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800 rounded-full px-2 py-0.5 w-fit mx-auto bg-purple-50 dark:bg-purple-900/20">
                                Autor
                            </span>
                        ) : (
                            playlist.owner?.email && (
                                <div className="text-[10px] text-slate-400 truncate px-2">
                                    por {playlist.owner.email.split('@')[0]}
                                </div>
                            )
                        )}
                        {/* Ver Setlists shortcut */}
                        {type !== 'pending' && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/playlist/${playlist.id}`, { state: { view: 'setlists' } });
                                }}
                                className="mt-1 text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 flex items-center justify-center gap-1 transition"
                            >
                                <ListMusic size={11} /> Ver Setlists
                            </button>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                {type === 'pending' ? (
                    <div className="flex gap-2 w-full mt-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); handleInviteAction(playlist.id, true); }}
                            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                        >
                            <Check size={14} /> Aceitar
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleInviteAction(playlist.id, false); }}
                            className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                        >
                            <X size={14} /> Recusar
                        </button>
                    </div>
                ) : (
                    <div className="absolute top-2 right-2 flex gap-1 opacity-100 xl:opacity-0 xl:group-hover:opacity-100 transition-opacity">
                        {/* Download Button */}
                        <button
                            onClick={(e) => handleDownloadPlaylist(e, playlist.id)}
                            className={`p-2 rounded-full shadow-sm transition flex items-center justify-center ${downloadedPlaylists.has(playlist.id)
                                ? "text-green-600 bg-green-100 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-400"
                                : "text-slate-400 hover:text-purple-600 bg-white dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-slate-700"
                                } ${downloadingPlaylists.has(playlist.id) ? "animate-pulse" : ""}`}
                            title={downloadedPlaylists.has(playlist.id) ? "Baixado Offline" : "Baixar Offline"}
                        >
                            {downloadedPlaylists.has(playlist.id) ? <Check size={16} /> : <Download size={16} />}
                        </button>

                        {isMyOwned ? (
                            <button
                                onClick={(e) => handleDeletePlaylist(playlist.id, e)}
                                className="p-2 text-slate-400 hover:text-red-500 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full shadow-sm transition"
                                title="Excluir Playlist"
                            >
                                <Trash2 size={16} />
                            </button>
                        ) : (
                            <button
                                onClick={(e) => handleUnfollowPlaylist(playlist.id, e)}
                                className="p-2 text-slate-400 hover:text-red-500 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full shadow-sm transition"
                                title="Remover da lista"
                            >
                                <UserMinus size={16} />
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    }

    if (selectedPlaylist) {
        return (
            <div className="h-full flex flex-col overflow-hidden">
                <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    {/* Row 1: Back Button + Centered Title */}
                    <div className="relative flex items-center justify-center md:justify-start md:gap-4 w-full md:w-auto">
                        <button
                            onClick={() => navigate(-1)}
                            className="absolute left-0 md:static p-2 -ml-2 md:ml-0 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition"
                            title="Voltar"
                        >
                            <span className="flex items-center gap-1 text-base font-medium">
                                <ArrowLeft size={24} /> <span className="hidden md:inline">Voltar</span>
                            </span>
                        </button>

                        <div className="text-center md:text-left max-w-[70%] md:max-w-none">
                            <h2 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center justify-center md:justify-start gap-2 leading-tight">
                                <span className="truncate">{selectedPlaylist.name}</span>
                                {selectedPlaylist.is_public ? <Globe size={16} className="text-blue-500 shrink-0" /> : (selectedPlaylist.is_collaborative ? <Users size={16} className="text-orange-500 shrink-0" /> : <Lock size={16} className="text-slate-400 shrink-0" />)}
                            </h2>
                            <div className="flex flex-wrap justify-center md:justify-start gap-2 md:gap-4 text-[10px] md:text-xs text-slate-500 mt-1">
                                <span>{selectedPlaylist.is_public ? 'Pública' : (selectedPlaylist.is_collaborative ? 'Colaborativa' : 'Privada')}</span>
                                {selectedPlaylist.owner?.email && (
                                    <span className="flex items-center gap-1 text-slate-400">
                                        <User size={10} /> {isOwner ? 'Você' : `Por: ${selectedPlaylist.owner.email}`}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Row 2: Avatars + Actions */}
                    <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto">
                        {/* Left: Avatars (visible if members exist or desktop) */}
                        <div className="flex -space-x-2 overflow-hidden py-1 pl-1">
                            {members.length > 0 && members.map((m, i) => {
                                const profile = m.profile;
                                const initial = profile?.email ? profile.email[0].toUpperCase() : '?';
                                const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500'];
                                const color = colors[initial.charCodeAt(0) % colors.length];

                                if (profile?.avatar_url) {
                                    return (
                                        <img
                                            key={m.user_id || i}
                                            src={profile.avatar_url}
                                            alt={profile.name || profile.email}
                                            className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 object-cover cursor-help"
                                            title={profile.name || profile.email}
                                        />
                                    );
                                }

                                return (
                                    <div key={m.user_id || i} className={`w-8 h-8 rounded-full ${color} text-white flex items-center justify-center text-xs font-bold ring-2 ring-white dark:ring-slate-900 cursor-help`} title={profile?.email}>
                                        {initial}
                                    </div>
                                );
                            })}
                            {/* Fallback Owner Avatar if not in members */}
                            {/* Fallback Owner Avatar if not in members */}
                            {selectedPlaylist.owner?.email && !members.find(m => m.user_id === selectedPlaylist.owner_id) && (
                                selectedPlaylist.owner.avatar_url ? (
                                    <div className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 bg-slate-200 dark:bg-slate-700 overflow-hidden cursor-help" title={`Dono: ${selectedPlaylist.owner.name || selectedPlaylist.owner.email}`}>
                                        <img
                                            src={selectedPlaylist.owner.avatar_url}
                                            alt={selectedPlaylist.owner.name || 'Owner'}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold ring-2 ring-white dark:ring-slate-900 cursor-help" title={`Dono: ${selectedPlaylist.owner.email}`}>
                                        {(selectedPlaylist.owner.name || selectedPlaylist.owner.email)[0].toUpperCase()}
                                    </div>
                                )
                            )}
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2 ml-auto md:ml-0">
                            {/* Chat Toggle */}
                            {/* Chat Toggle - Only for Collaborative */}
                            {selectedPlaylist.is_collaborative && (
                                <button
                                    onClick={() => setIsChatOpen(!isChatOpen)}
                                    className={`p-2 rounded-lg transition relative ${isChatOpen ? 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                    title="Chat da Playlist"
                                >
                                    <MessageSquare size={22} />
                                    {unreadCount > 0 && (
                                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                                            {unreadCount}
                                        </span>
                                    )}
                                </button>
                            )}

                            {/* Invite Button - Only Owner AND Collaborative */}
                            {isOwner && selectedPlaylist.is_collaborative && (
                                <button
                                    onClick={() => setIsInviting(true)}
                                    className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition"
                                >
                                    <Users size={20} /> <span className="hidden sm:inline">Convites</span>
                                </button>
                            )}



                            {(isOwner || isEditorOrOwner) && (
                                <button
                                    onClick={() => requestAnimationFrame(() => setIsAddingSong(true))}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition shadow-lg shadow-blue-500/20"
                                >
                                    <Plus size={20} /> <span className="">Add Música</span>
                                </button>
                            )}

                            {/* Settings Button */}
                            {isOwner && (
                                <button
                                    onClick={() => {
                                        setEditPlaylistName(selectedPlaylist.name);
                                        setEditPlaylistPublic(selectedPlaylist.is_public);
                                        setEditPlaylistCollab(selectedPlaylist.is_collaborative);
                                        setIsEditingPlaylist(true);
                                    }}
                                    className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                                    title="Configurações da Playlist"
                                >
                                    <Settings size={22} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Content Area + Chat Sidebar */}
                <div className="flex-1 flex gap-4 flex-col min-h-0">

                    {/* Tabs */}
                    <div className="flex gap-6 border-b border-slate-200 dark:border-slate-800 px-2 mt-4">
                        <button
                            onClick={() => setPlaylistView('songs')}
                            className={`pb-3 font-bold text-sm flex items-center gap-2 transition border-b-2 ${playlistView === 'songs' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                        >
                            <Music size={18} /> Todas as Músicas
                        </button>
                        <button
                            onClick={() => setPlaylistView('setlists')}
                            className={`pb-3 font-bold text-sm flex items-center gap-2 transition border-b-2 ${playlistView === 'setlists' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                        >
                            <List size={18} /> Setlists (Repertório)
                        </button>
                    </div>

                    <div className="flex-1 flex flex-row gap-4 min-h-0 overflow-hidden">
                        {/* Playlist Items */}
                        {playlistView === 'songs' ? (
                            <div className="flex-1 pr-2 min-w-0 overflow-y-auto h-full">
                                {(!selectedPlaylist.items || selectedPlaylist.items.length === 0) ? (
                                    <div className="text-center py-10 px-6">
                                        {isOffline && !downloadedPlaylists.has(selectedPlaylist.id) ? (
                                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 max-w-md mx-auto">
                                                <div className="w-12 h-12 bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-3">
                                                    <Globe size={24} />
                                                </div>
                                                <h3 className="text-red-800 dark:text-red-300 font-bold text-lg mb-1">Você está offline</h3>
                                                <p className="text-red-600 dark:text-red-400 text-sm">
                                                    Esta playlist não foi baixada anteriormente. Conecte-se à internet para visualizá-la ou baixá-la.
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-slate-500">Playlist vazia.</p>
                                        )}
                                    </div>
                                ) : (
                                    <DragDropContext onDragEnd={onDragEnd}>
                                        <Droppable droppableId="playlist-items">
                                            {(provided) => (
                                                <div
                                                    {...provided.droppableProps}
                                                    ref={provided.innerRef}
                                                    className="space-y-2 pb-[100px]"
                                                >
                                                    {selectedPlaylist.items.map((item, index) => (
                                                        <Draggable
                                                            key={item.itemId}
                                                            draggableId={item.itemId}
                                                            index={index}
                                                            isDragDisabled={false} // Allow dragging visually, RLS/backend handles logical order
                                                        >
                                                            {(provided, snapshot) => (
                                                                <div
                                                                    ref={provided.innerRef}
                                                                    {...provided.draggableProps}
                                                                    {...provided.dragHandleProps}
                                                                    style={{
                                                                        ...provided.draggableProps.style,
                                                                        opacity: snapshot.isDragging ? 0.8 : 1,
                                                                        left: 'auto', top: 'auto' // Fix positioning if needed
                                                                    }}
                                                                    onClick={() => {
                                                                        if (item.song?.id) {
                                                                            navigate(`/player/${item.song.id}`, {
                                                                                state: { song: item.song, songId: item.song.id, playlistItemId: item.itemId, playlistId: selectedPlaylist.id, initialTransposition: item.customTransposition }
                                                                            });
                                                                        }
                                                                    }}
                                                                    className={`flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl group cursor-pointer border border-slate-100 dark:border-slate-800 hover:border-purple-300 dark:hover:border-slate-600 transition shadow-sm hover:shadow-md ${!item.song ? 'opacity-50' : ''} ${snapshot.isDragging ? 'shadow-xl ring-2 ring-purple-500 z-50' : ''}`}
                                                                >
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="flex items-center justify-center w-6 cursor-grab active:cursor-grabbing text-slate-300 hover:text-purple-500 transition" {...provided.dragHandleProps}>
                                                                            <GripVertical size={22} />
                                                                        </div>
                                                                        <div className="flex items-center justify-center w-8 text-slate-400 dark:text-slate-500 font-bold text-xl">
                                                                            {index + 1}
                                                                        </div>
                                                                        <div>
                                                                            <div className="font-bold text-slate-900 dark:text-white text-lg leading-tight mb-0.5">{item.song?.title || '(Música indisponível)'}</div>
                                                                            <div className="text-xs text-slate-500 dark:text-slate-400 flex gap-2">
                                                                                <span>{item.song?.artist || '-'}</span>
                                                                            </div>
                                                                        </div>
                                                                        {/* 
                                                                        {item.song && item.customTransposition !== 0 && (
                                                                            <span className="ml-2 px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 text-[10px] rounded-full font-bold uppercase tracking-wider">
                                                                                Meu Tom: {item.customTransposition > 0 ? `+${item.customTransposition}` : item.customTransposition}
                                                                            </span>
                                                                        )}
                                                                        */}

                                                                        {/* Mobile Play Button */}
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); playPlaylist(index); }}
                                                                            className="md:hidden ml-auto w-8 h-8 flex items-center justify-center bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 rounded-full hover:bg-green-200 transition shrink-0"
                                                                            title="Tocar"
                                                                        >
                                                                            <Play size={14} className="fill-current" />
                                                                        </button>
                                                                    </div>

                                                                    <div className="relative">
                                                                        {/* Desktop Actions */}
                                                                        <div className="hidden md:flex items-center gap-1 md:gap-2">
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); playPlaylist(index); }}
                                                                                className="w-10 h-10 flex items-center justify-center bg-purple-600 text-white rounded-xl shadow-lg shadow-purple-500/20 hover:bg-purple-700 transition transform hover:scale-105"
                                                                                title="Tocar (Playlist)"
                                                                            >
                                                                                <Play size={20} className="fill-current" />
                                                                            </button>

                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); navigate(`/projector?songId=${item.song?.id}`); }}
                                                                                className="w-9 h-9 flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition"
                                                                                title="Projetar"
                                                                            >
                                                                                <MonitorUp size={18} strokeWidth={2.5} />
                                                                            </button>

                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); navigate(`/player/${item.song?.id}`); }}
                                                                                className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                                                                                title="Aprender"
                                                                            >
                                                                                <GraduationCap size={18} />
                                                                            </button>

                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); navigate(`/player/${item.song?.id}?print=true`); }}
                                                                                className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                                                                                title="Imprimir"
                                                                            >
                                                                                <Printer size={18} />
                                                                            </button>

                                                                            {(isAdmin || (user && item.song?.created_by === user.id)) && (
                                                                                <Link
                                                                                    to={`/editor/${item.song?.id}`}
                                                                                    state={{ song: item.song }}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                                                                                    title="Editar Música"
                                                                                >
                                                                                    <Edit2 size={18} />
                                                                                </Link>
                                                                            )}

                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); handleRemoveSongFromPlaylist(item.itemId); }}
                                                                                className="w-9 h-9 flex items-center justify-center bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 rounded-xl hover:bg-red-200 dark:hover:bg-red-900/50 transition"
                                                                                title="Remover"
                                                                            >
                                                                                <Trash2 size={18} />
                                                                            </button>
                                                                        </div>

                                                                        {/* Mobile Toggle Button */}
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === item.itemId ? null : item.itemId); }}
                                                                            className="md:hidden w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                                                                        >
                                                                            {activeMenuId === item.itemId ? <X size={18} /> : <MoreVertical size={18} />}
                                                                        </button>

                                                                        {/* Mobile Dropdown Menu */}
                                                                        {activeMenuId === item.itemId && (
                                                                            <>
                                                                                <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); }} />
                                                                                <div className="absolute right-0 top-full mt-2 bg-white dark:bg-slate-900 shadow-xl rounded-xl p-2 flex flex-col gap-1 z-20 min-w-[160px] border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            const context = getNavigationContext(filteredItems, 'playlist', selectedPlaylist?.name, selectedPlaylist?.id);
                                                                                            const index = filteredItems.indexOf(item);

                                                                                            navigate(`/player/${item.song?.id}`, {
                                                                                                state: {
                                                                                                    song: item.song,
                                                                                                    playlistItemId: item.itemId,
                                                                                                    context,
                                                                                                    currentIndex: index,
                                                                                                    initialTransposition: item.transposition || 0
                                                                                                }
                                                                                            });
                                                                                            setActiveMenuId(null);
                                                                                        }}
                                                                                        className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition"
                                                                                    >
                                                                                        <GraduationCap size={16} className="text-purple-600" /> Aprender
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); navigate(`/player/${item.song?.id}?print=true`); setActiveMenuId(null); }}
                                                                                        className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition"
                                                                                    >
                                                                                        <Printer size={16} className="text-blue-500" /> Imprimir
                                                                                    </button>
                                                                                    {(isAdmin || (user && item.song?.created_by === user.id)) && (
                                                                                        <button
                                                                                            onClick={(e) => { e.stopPropagation(); navigate(`/editor/${item.song?.id}`, { state: { song: item.song } }); setActiveMenuId(null); }}
                                                                                            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition"
                                                                                        >
                                                                                            <Edit2 size={16} className="text-orange-500" /> Editar
                                                                                        </button>
                                                                                    )}
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); handleRemoveSongFromPlaylist(item.itemId); setActiveMenuId(null); }}
                                                                                        className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                                                                                    >
                                                                                        <Trash2 size={16} /> Remover
                                                                                    </button>
                                                                                </div>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </Draggable>
                                                    ))}
                                                    {provided.placeholder}
                                                </div>
                                            )}
                                        </Droppable>
                                    </DragDropContext>
                                )}
                            </div>
                        ) : (
                            /* Setlists View */
                            <div className="flex-1 pr-2 overflow-y-auto pb-[100px] min-w-0">
                                {/* Only Playlist Owner/Editor can create (or check RLS logic for CREATE) */}
                                {(isOwner || isEditorOrOwner) && (
                                    <button
                                        onClick={handleNewSetlist}
                                        className="w-full py-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl mb-6 text-slate-500 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10 hover:text-purple-600 font-bold flex items-center justify-center gap-2 transition"
                                    >
                                        <Plus size={20} /> Novo Setlist (repertório)
                                    </button>
                                )}

                                {/* Filters */}
                                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                                    <button
                                        onClick={() => setShowMyScalesOnly(!showMyScalesOnly)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition whitespace-nowrap flex items-center gap-2 ${showMyScalesOnly
                                            ? 'bg-purple-600 border-purple-600 text-white'
                                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-purple-300'
                                            }`}
                                    >
                                        <User size={14} /> Somente Minhas Escalas
                                    </button>
                                    <button
                                        onClick={() => setShowFutureOnly(!showFutureOnly)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition whitespace-nowrap flex items-center gap-2 ${showFutureOnly
                                            ? 'bg-blue-600 border-blue-600 text-white'
                                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-blue-300'
                                            }`}
                                    >
                                        <Calendar size={14} /> Próximos Eventos
                                    </button>
                                </div>

                                {setlists.filter(setlist => {
                                    // Filter Logic
                                    let matches = true;

                                    // 1. My Scales Filter
                                    if (showMyScalesOnly) {
                                        const isMember = setlist.scales?.some(s => s.user?.id === user?.id);
                                        const isCreator = setlist.created_by === user?.id; // Optional: include creator? Usually scales focus.
                                        if (!isMember) matches = false;
                                    }

                                    // 2. Future Dates Filter
                                    if (showFutureOnly && matches) {
                                        let setlistDate;
                                        if (setlist.date && setlist.date.includes('T')) {
                                            setlistDate = new Date(setlist.date);
                                        } else if (setlist.date) {
                                            const [y, m, d] = setlist.date.split('T')[0].split('-');
                                            setlistDate = new Date(y, m - 1, d);
                                        } else {
                                            setlistDate = new Date();
                                        }
                                        const today = new Date();
                                        setlistDate.setHours(0, 0, 0, 0);
                                        today.setHours(0, 0, 0, 0); // Reset time to compare dates only
                                        // We want setlists that happen today or in the future
                                        if (setlistDate < today) matches = false;
                                    }

                                    return matches;
                                }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).length === 0 ? (
                                    <div className="text-center py-10">
                                        <p className="text-slate-400 mb-2">Nenhum setlist encontrado.</p>
                                        {(showMyScalesOnly || showFutureOnly) && (
                                            <button
                                                onClick={() => { setShowMyScalesOnly(false); setShowFutureOnly(false); }}
                                                className="text-purple-600 text-sm font-bold hover:underline"
                                            >
                                                Limpar filtros
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {setlists.filter(setlist => {
                                            let matches = true;
                                            if (showMyScalesOnly) {
                                                const isMember = setlist.scales?.some(s => s.user?.id === user?.id);
                                                if (!isMember) matches = false;
                                            }
                                            if (showFutureOnly && matches) {
                                                let setlistDate;
                                                if (setlist.date && setlist.date.includes('T')) {
                                                    setlistDate = new Date(setlist.date);
                                                } else if (setlist.date) {
                                                    const [y, m, d] = setlist.date.split('T')[0].split('-');
                                                    setlistDate = new Date(y, m - 1, d);
                                                } else {
                                                    setlistDate = new Date();
                                                }
                                                const today = new Date();
                                                setlistDate.setHours(0, 0, 0, 0);
                                                today.setHours(0, 0, 0, 0);
                                                if (setlistDate < today) matches = false;
                                            }
                                            return matches;
                                        }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).map(setlist => {
                                            // Frontend Permission Check
                                            const canEdit = (() => {
                                                if (!user) return false;
                                                // 1. Creator (Always allowed)
                                                if (setlist.created_by === user.id) return true;
                                                // 2. Playlist Owner (Always allowed)
                                                if (selectedPlaylist.owner_id === user.id) return true;
                                                // 3. Collaborative (Only if allowed AND member)
                                                if (setlist.is_collaborative) {
                                                    // Check if user is active member
                                                    const member = members.find(m => m.user_id === user.id);
                                                    return member?.status === 'active';
                                                }
                                                return false;
                                            })();

                                            // Delete is stricter: Only Creator or Owner
                                            const canDelete = (() => {
                                                if (!user) return false;
                                                if (setlist.created_by === user.id) return true;
                                                if (selectedPlaylist.owner_id === user.id) return true;
                                                return false;
                                            })();

                                            return (
                                                <div key={setlist.id} className="group bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:shadow-lg transition relative overflow-hidden">
                                                    <div className="flex justify-between items-start mb-0">
                                                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200 truncate pr-8">{setlist.name}</h3>

                                                        {/* Actions Container */}
                                                        <div className="flex gap-1">
                                                            {/* Edit Button - Config Icon */}
                                                            {canEdit && (
                                                                <button
                                                                    onClick={() => handleEditSetlist(setlist)}
                                                                    className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition"
                                                                    title="Editar / Permissões"
                                                                >
                                                                    <Settings size={16} />
                                                                </button>
                                                            )}

                                                            {/* Download Button */}


                                                            {/* Delete Button */}
                                                            {canDelete && (
                                                                <button
                                                                    onClick={() => handleDeleteSetlist(setlist.id)}
                                                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                                                                    title="Excluir"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Author */}
                                                    {setlist.creator && (
                                                        <div className="text-[10px] text-purple-600 font-medium mb-0 pl-0.5 leading-tight">
                                                            Por: {setlist.creator.name || setlist.creator.email?.split('@')[0]}
                                                        </div>
                                                    )}

                                                    {/* Date */}
                                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1 mb-0 pl-0.5">
                                                        Data do culto: {setlist.date ? new Date(setlist.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Sem data definida'}
                                                    </div>

                                                    <div className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-2">
                                                        {setlist.description || "Sem descrição"}
                                                    </div>

                                                    {/* Scale Display */}
                                                    {setlist.scales && setlist.scales.length > 0 && (
                                                        <div className="mb-4 pl-0.5">
                                                            <div className="text-[10px] uppercase font-bold text-slate-400 mb-2">Escala:</div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {setlist.scales.map(member => (
                                                                    <div key={member.id} className={`flex items-center gap-1.5 pr-2 rounded-full border shadow-2xs ${member.status === 'CONFIRMED' ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700/50' : member.status === 'DECLINED' ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-700/50' : 'bg-slate-100 dark:bg-slate-700/50 border-slate-200 dark:border-slate-700/50'}`}>
                                                                        <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0 relative">
                                                                            {member.user?.avatar_url ? (
                                                                                <img src={member.user.avatar_url} alt={member.user.name} className="h-full w-full object-cover" />
                                                                            ) : (
                                                                                <div className="h-full w-full flex items-center justify-center text-[8px] font-bold text-slate-500">
                                                                                    {(member.user?.name || member.user?.email || '?').substring(0, 2).toUpperCase()}
                                                                                </div>
                                                                            )}
                                                                            <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full ring-1 ring-white dark:ring-slate-900 ${member.status === 'CONFIRMED' ? 'bg-emerald-500' : member.status === 'DECLINED' ? 'bg-rose-500' : 'bg-amber-400'}`} title={`Status: ${member.status || 'PENDING'}`} />
                                                                        </div>
                                                                        <div className="text-xs text-slate-700 dark:text-slate-300 max-w-[130px] truncate py-1 flex items-center gap-1">
                                                                            <span className="font-bold">{member.user?.name?.split(' ')[0] || member.user?.email?.split('@')[0]}</span>
                                                                            <span className="text-[9px] bg-white/80 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide">
                                                                                {member.role || member.user?.instrument || 'Vocal'}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Preview Items */}
                                                    <div className="space-y-1 pl-2 border-l-2 border-slate-100 dark:border-slate-700 flex-1 mb-4">
                                                        {setlist.items?.slice(0, 10).map((item, idx) => (
                                                            <div key={item.id} className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                                                <span className="text-xs text-slate-400 font-mono w-4">{idx + 1}</span>
                                                                <span className="truncate flex-1">{item.song?.title || "Música desconhecida"}</span>
                                                                {item.usage_type && <span className="text-[10px] bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-500 shrink-0">{item.usage_type === 'media_block' ? 'Mídia' : item.usage_type}</span>}
                                                            </div>
                                                        ))}
                                                        {((setlist.items?.filter(i => i.usage_type !== 'media_block').length || 0) > 10) && <div className="text-xs text-slate-400 pl-6 italic">+ {(setlist.items?.filter(i => i.usage_type !== 'media_block').length || 0) - 10} músicas...</div>}
                                                        {(!setlist.items || setlist.items.filter(i => i.usage_type !== 'media_block').length === 0) && <div className="text-xs text-slate-400 pl-6 italic">Nenhuma música.</div>}
                                                    </div>

                                                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100 dark:border-slate-700 relative z-10">
                                                        <div className="flex items-center gap-2 w-full justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest pl-1 whitespace-nowrap">
                                                                    {(setlist.items?.filter(i => i.usage_type !== 'media_block').length || 0)} músicas
                                                                </span>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        navigate(`/projector?playlistId=${selectedPlaylist.id}&setlistId=${setlist.id}`);
                                                                    }}
                                                                    className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[10px] font-bold transition shadow-sm"
                                                                    title="Abrir Painel de Projeção"
                                                                >
                                                                    <MonitorUp size={12} className="text-slate-500" /> Projetar
                                                                </button>
                                                            </div>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (!setlist.items || setlist.items.length === 0) {
                                                                        showToast("Adicione músicas primeiro!", "error");
                                                                        return;
                                                                    }
                                                                    const firstItem = setlist.items[0];
                                                                    const contextParam = getNavigationContext(setlist.items, 'setlist', setlist.name, setlist.id);
                                                                    navigate(`/player/${firstItem.song?.id}?autoConnectLive=true`, {
                                                                        state: {
                                                                            song: firstItem.song,
                                                                            playlistItemId: firstItem.itemId,
                                                                            context: contextParam,
                                                                            currentIndex: 0,
                                                                            initialTransposition: firstItem.transposition || 0
                                                                        }
                                                                    });
                                                                }}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/90 border border-indigo-500/30 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow-[0_0_15px_rgba(79,70,229,0.3)] active:scale-95 uppercase tracking-wide"
                                                                title="Entrar no Culto (Sincronizado)"
                                                            >
                                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
                                                                Entrar no Culto
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    playSetlist(setlist);
                                                                }}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition shadow-sm active:scale-95"
                                                                title="Tocar (Modo Individual)"
                                                            >
                                                                <Play size={14} className="fill-current" /> Tocar
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {/* Decorative background icon */}
                                                    <List className="absolute -bottom-4 -right-4 text-slate-50 dark:text-slate-800 w-24 h-24 -z-0 opacity-50 transform rotate-12 group-hover:scale-110 transition duration-500 pointer-events-none" />
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Chat Sidebar */}
                        {/* Mobile Chat Overlay */}
                        {isChatOpen && selectedPlaylist?.is_collaborative && (
                            <div className="md:hidden fixed bottom-nav-safe left-2 right-2 top-auto h-[60vh] z-30 shadow-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col animate-in slide-in-from-bottom duration-200">
                                <div className="p-3 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-700 dark:text-slate-200 flex justify-between items-center">
                                    <span>Comentários</span>
                                    <button onClick={() => setIsChatOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {comments.length === 0 ? (
                                        <p className="text-center text-slate-400 text-sm mt-10">Nenhum comentário.</p>
                                    ) : (
                                        comments.map(c => {
                                            const isMe = user?.id === c.user_id;
                                            return (
                                                <div key={c.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                                    <div className={`text-[10px] mb-1 text-slate-400`}>
                                                        {c.profile?.email?.split('@')[0]} • {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                    <div className={`p-3 rounded-xl text-sm max-w-[90%] relative group ${isMe ? 'bg-purple-100 text-purple-900 rounded-tr-none' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'}`}>
                                                        {c.content}
                                                        {(isMe || isOwner) && (
                                                            <button
                                                                onClick={() => handleDeleteComment(c.id)}
                                                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-100 transition shadow-sm w-5 h-5 flex items-center justify-center"
                                                                title="Excluir"
                                                            >
                                                                &times;
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                                <form onSubmit={handleSendComment} className="p-3 border-t border-slate-200 dark:border-slate-800 flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Digite um comentário..."
                                        className="flex-1 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                                        value={newComment}
                                        onChange={e => setNewComment(e.target.value)}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!newComment.trim() || sendingComment}
                                        className="p-2 bg-purple-600 text-white rounded-lg disabled:opacity-50 hover:bg-purple-700 transition"
                                    >
                                        <Send size={18} />
                                    </button>
                                </form>
                            </div>
                        )}

                        {/* Desktop Chat Sidebar */}
                        {isChatOpen && selectedPlaylist?.is_collaborative && (
                            <div className="hidden md:flex w-80 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-col shrink-0 animate-in slide-in-from-right duration-200 overflow-hidden">
                                <div className="p-3 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-700 dark:text-slate-200 flex justify-between items-center">
                                    <span>Comentários</span>
                                    <button onClick={() => setIsChatOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {comments.length === 0 ? (
                                        <p className="text-center text-slate-400 text-sm mt-10">Nenhum comentário.</p>
                                    ) : (
                                        comments.map(c => {
                                            const isMe = user?.id === c.user_id;
                                            return (
                                                <div key={c.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                                    <div className={`text-[10px] mb-1 text-slate-400`}>
                                                        {c.profile?.email?.split('@')[0]} • {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                    <div className={`p-3 rounded-xl text-sm max-w-[90%] relative group ${isMe ? 'bg-purple-100 text-purple-900 rounded-tr-none' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'}`}>
                                                        {c.content}
                                                        {(isMe || isOwner) && (
                                                            <button
                                                                onClick={() => handleDeleteComment(c.id)}
                                                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-100 xl:opacity-0 xl:group-hover:opacity-100 transition shadow-sm w-5 h-5 flex items-center justify-center"
                                                                title="Excluir"
                                                            >
                                                                &times;
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                                <form onSubmit={handleSendComment} className="p-3 border-t border-slate-200 dark:border-slate-800 flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Digite um comentário..."
                                        className="flex-1 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                                        value={newComment}
                                        onChange={e => setNewComment(e.target.value)}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!newComment.trim() || sendingComment}
                                        className="p-2 bg-purple-600 text-white rounded-lg disabled:opacity-50 hover:bg-purple-700 transition"
                                    >
                                        <Send size={18} />
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>
                </div>

                {/* Adding Song Modal */}
                {
                    isAddingSong && (
                        <Portal>
                            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl">
                                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-4">
                                        <div className="flex justify-between items-center">
                                            <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">Adicionar à Playlist</h3>
                                            <button onClick={() => setIsAddingSong(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition"><X size={20} /></button>
                                        </div>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                                            <input
                                                type="text"
                                                placeholder="Buscar música..."
                                                value={songSearchQuery}
                                                onChange={(e) => setSongSearchQuery(e.target.value)}
                                                className="w-full bg-slate-100 dark:bg-slate-800 pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2">
                                        {filteredSongs.map(song => {
                                            const existingItem = selectedPlaylist.items?.find(item => item.song?.id === song.id);
                                            // console.log('DEBUG ITEM:', existingItem);
                                            const isAlreadyAdded = !!existingItem;
                                            return (
                                                <div
                                                    key={song.id}
                                                    className={`w-full text-left p-3 rounded-xl flex justify-between items-center group transition 
                                                        ${isAlreadyAdded
                                                            ? 'bg-green-50 dark:bg-green-900/10'
                                                            : song.type === 'lyrics'
                                                                ? 'bg-amber-50/60 dark:bg-amber-900/10 hover:bg-amber-100 border border-transparent hover:border-amber-300 dark:hover:border-amber-700 cursor-pointer'
                                                                : 'hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                                                        }`}
                                                    onClick={() => !isAlreadyAdded && handleAddSongToPlaylist(song)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-2 rounded-lg ${song.type === 'lyrics' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'}`}>
                                                            {song.type === 'lyrics' ? <FileText size={16} /> : <Music size={16} />}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className={`block font-bold leading-tight ${isAlreadyAdded ? 'text-green-700 dark:text-green-500' : 'text-slate-800 dark:text-slate-200'}`}>{song.title}</span>
                                                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                                                {song.artist}
                                                                {song.creator && <span className="text-purple-500 ml-1">• Editor: {song.creator.name || song.creator.email?.split('@')[0]}</span>}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {isAlreadyAdded ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-300 px-2 py-1 rounded-full flex items-center gap-1">
                                                                <Check size={12} /> Adicionada
                                                            </span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleRemoveSongFromPlaylist(existingItem.itemId);
                                                                }}
                                                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                                                                title="Remover da Playlist"
                                                            >
                                                                <Trash2 size={18} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <Plus size={16} className="text-slate-400 group-hover:text-blue-500" />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </Portal>
                    )
                }

                {/* Invite User Modal */}
                {
                    isInviting && (
                        <Portal>
                            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-sm p-6 shadow-2xl relative">
                                    <button
                                        onClick={() => setIsInviting(false)}
                                        className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white transition"
                                    >
                                        <X size={20} />
                                    </button>
                                    <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2 pr-8"><Users className="text-purple-600" /> Convidar Colaborador</h3>
                                    <p className="text-sm text-slate-500 mb-4">Insira o e-mail do usuário para conceder permissão de <strong>edição</strong> nesta playlist.</p>
                                    <form onSubmit={handleInviteUser} className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">E-mail do Usuário</label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                                                <input
                                                    type="email"
                                                    className="w-full bg-slate-100 dark:bg-slate-800 pl-10 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                    placeholder="usuario@exemplo.com"
                                                    value={inviteEmail}
                                                    onChange={e => setInviteEmail(e.target.value)}
                                                    autoFocus
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className="flex gap-3 pt-2">
                                            <button type="button" onClick={() => setIsInviting(false)} className="flex-1 py-3 text-slate-500 hover:bg-slate-100 rounded-lg font-bold">Cancelar</button>
                                            <button type="submit" disabled={inviteLoading} className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold disabled:opacity-50">
                                                {inviteLoading ? 'Enviando...' : 'Convidar'}
                                            </button>
                                        </div>
                                    </form>

                                    <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-4">
                                        <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-2">Membros ({members.length})</h4>
                                        <div className="max-h-40 overflow-y-auto space-y-2">
                                            {members.map(member => {
                                                const isMe = user?.id === member.user_id;
                                                const isOwnerMember = selectedPlaylist.owner_id === member.user_id;
                                                return (
                                                    <div key={member.user_id} className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-2 rounded-lg text-sm">
                                                        <div className="flex items-center gap-2 overflow-hidden">
                                                            <div className="w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-[10px] font-bold">
                                                                {member.profile?.email?.[0].toUpperCase() || '?'}
                                                            </div>
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="truncate text-slate-700 dark:text-slate-200" title={member.profile?.email}>
                                                                    {member.profile?.email || 'Usuário'}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400">
                                                                    {isOwnerMember ? 'Dono' : member.status === 'pending' ? 'Pendente' : 'Editor'}
                                                                    {isMe && ' (Você)'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {!isOwnerMember && isOwner && (
                                                            <button
                                                                onClick={() => handleRemoveCollaborator(member.user_id)}
                                                                className="text-slate-400 hover:text-red-500 p-1"
                                                                title="Remover"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Portal>
                    )
                }


                {/* Edit Playlist Modal */}
                {
                    isEditingPlaylist && (
                        <Portal>
                            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-sm max-h-[90vh] overflow-y-auto shadow-2xl">
                                    <div className="p-6">
                                        <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2"><Settings className="text-purple-600" /> Configurações</h3>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Nome da Playlist</label>
                                                <input
                                                    type="text"
                                                    className="w-full bg-slate-100 dark:bg-slate-800 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                    value={editPlaylistName}
                                                    onChange={e => setEditPlaylistName(e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Tipo de Playlist</label>
                                                <div className="flex flex-col gap-2">
                                                    {/* Opção 1: Privada */}
                                                    <div
                                                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${(!editPlaylistPublic && !editPlaylistCollab) ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-500 ring-1 ring-purple-500' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
                                                        onClick={() => { setEditPlaylistPublic(false); setEditPlaylistCollab(false); }}
                                                    >
                                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${(!editPlaylistPublic && !editPlaylistCollab) ? 'border-purple-600' : 'border-slate-400'}`}>
                                                            {(!editPlaylistPublic && !editPlaylistCollab) && <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />}
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 font-bold text-sm text-slate-800 dark:text-slate-200">
                                                                <Lock size={16} /> Privada
                                                            </div>
                                                            <div className="text-xs text-slate-500">Apenas você pode ver e editar.</div>
                                                        </div>
                                                    </div>

                                                    {/* Opção 2: Colaborativa */}
                                                    <div
                                                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${(!editPlaylistPublic && editPlaylistCollab) ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-500 ring-1 ring-purple-500' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
                                                        onClick={() => { setEditPlaylistPublic(false); setEditPlaylistCollab(true); }}
                                                    >
                                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${(!editPlaylistPublic && editPlaylistCollab) ? 'border-purple-600' : 'border-slate-400'}`}>
                                                            {(!editPlaylistPublic && editPlaylistCollab) && <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />}
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 font-bold text-sm text-slate-800 dark:text-slate-200">
                                                                <Users size={16} className="text-orange-500" /> Colaborativa
                                                            </div>
                                                            <div className="text-xs text-slate-500">Privada, mas permite convidar editores.</div>
                                                        </div>
                                                    </div>

                                                    {/* Opção 3: Pública */}
                                                    <div
                                                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${(editPlaylistPublic) ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-500 ring-1 ring-purple-500' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
                                                        onClick={() => { setEditPlaylistPublic(true); setEditPlaylistCollab(false); }}
                                                    >
                                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${(editPlaylistPublic) ? 'border-purple-600' : 'border-slate-400'}`}>
                                                            {(editPlaylistPublic) && <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />}
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 font-bold text-sm text-slate-800 dark:text-slate-200">
                                                                <Globe size={16} className="text-blue-500" /> Pública
                                                            </div>
                                                            <div className="text-xs text-slate-500">Visível para todos. Não permite colaboração.</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex gap-3 pt-2">
                                                <button onClick={() => setIsEditingPlaylist(false)} className="flex-1 py-3 text-slate-500 hover:bg-slate-100 rounded-lg font-bold">Cancelar</button>
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            await savePlaylistMetadata({
                                                                id: selectedPlaylist.id,
                                                                name: editPlaylistName,
                                                                isPublic: editPlaylistPublic,
                                                                isCollaborative: editPlaylistCollab,
                                                                ownerId: selectedPlaylist.owner_id // Preserve owner
                                                            });
                                                            await loadPlaylistDetails(selectedPlaylist.id);
                                                            await loadMyPlaylists(); // Refresh list
                                                            setIsEditingPlaylist(false);
                                                        } catch (e) {
                                                            console.error(e);
                                                            alert('Erro ao salvar.');
                                                        }
                                                    }}
                                                    className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold"
                                                >
                                                    Salvar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Portal>
                    )
                }

                {/* Edit Item Modal (Transposition) */}
                {
                    isEditingItem && editingItemData && (
                        <Portal>
                            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-sm p-6 shadow-2xl">
                                    <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">Editar: {editingItemData.song?.title}</h3>
                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Transposição (Meu Tom)</label>
                                            <div className="flex items-center gap-4">
                                                <button onClick={() => setEditItemTransposition(p => p - 1)} className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg font-bold hover:bg-slate-200">-</button>
                                                <span className="flex-1 text-center font-bold text-2xl">{editItemTransposition > 0 ? `+${editItemTransposition}` : editItemTransposition}</span>
                                                <button onClick={() => setEditItemTransposition(p => p + 1)} className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg font-bold hover:bg-slate-200">+</button>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-2 text-center">Isso afetará apenas esta entrada na playlist.</p>
                                        </div>
                                        <div className="flex gap-3 pt-2">
                                            <button onClick={() => setIsEditingItem(false)} className="flex-1 py-3 text-slate-500 hover:bg-slate-100 rounded-lg font-bold">Cancelar</button>
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await updatePlaylistItem(editingItemData.itemId, { customTransposition: editItemTransposition });
                                                        await loadPlaylistDetails(selectedPlaylist.id);
                                                        setIsEditingItem(false);
                                                    } catch (e) {
                                                        console.error(e);
                                                        alert('Erro ao atualizar item.');
                                                    }
                                                }}
                                                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold"
                                            >
                                                Salvar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Portal>
                    )
                }

                {/* Setlist Manager Modal - Correctly Placed in Detail View */}
                {
                    setlistManager.isOpen && (
                        <SetlistManager
                            key={setlistManager.data ? setlistManager.data.id : 'new'}
                            playlistId={selectedPlaylist.id}
                            songs={selectedPlaylist?.items?.map(item => item.song).filter(s => !!s) || []}
                            initialData={setlistManager.data}
                            onClose={() => setSetlistManager({ isOpen: false, data: null })}
                            onSave={handleSaveSetlist}
                        />
                    )
                }

            </div >
        );
    }

    if (playlistId && !selectedPlaylist) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
                {loadingError ? (
                    <>
                        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mb-2">
                            <Globe size={32} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">Não foi possível carregar a playlist</h3>
                        <p className="text-slate-500 dark:text-slate-400 max-w-md">
                            {loadingError}
                        </p>
                        <button
                            onClick={() => navigate('/playlists')}
                            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg font-bold text-slate-700 dark:text-slate-300 mt-4 hover:bg-slate-300 transition"
                        >
                            Voltar para Playlists
                        </button>
                    </>
                ) : (
                    <LiquidLoader fullScreen={true} />
                )}
            </div>
        );
    }

    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                    <div className="bg-purple-100 dark:bg-purple-900/20 p-3 rounded-xl text-purple-600 dark:text-purple-400">
                        <Library size={28} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Playlists</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Crie e edite suas playlists e compartilhe com seus irmãos :)</p>
                    </div>
                </div>
                <button
                    onClick={openNewPlaylistModal}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg hover:shadow-purple-500/20 transition"
                >
                    <Plus size={18} /> Nova Playlist
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800">
                <button onClick={() => setActiveTab('my')} className={`pb-3 px-4 text-sm font-bold border-b-2 transition ${activeTab === 'my' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500'}`}>Minhas Playlists</button>
                <button onClick={() => setActiveTab('explore')} className={`pb-3 px-4 text-sm font-bold border-b-2 transition ${activeTab === 'explore' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500'}`}>Explorar Públicas</button>
            </div>

            {/* Search (Explore Only) */}
            {activeTab === 'explore' && (
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={20} />
                    <input type="text" placeholder="Buscar playlists públicas..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white dark:bg-slate-800 pl-10 pr-4 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm" />
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === 'my' ? (
                    <div className="space-y-8 pb-10">
                        {/* Loading Indicator */}
                        {isLoadingPlaylists && myPlaylists.length === 0 ? (
                            <LiquidLoader />
                        ) : (
                            <>
                                {/* 1. Playlists Privadas (Owner & Private) */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-2">
                                        <Lock size={16} className="text-purple-500" /> Playlists Privadas
                                    </h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                                        {privatePlaylists.length > 0 ? privatePlaylists.map(p => <PlaylistCard key={p.id} playlist={p} type="private" />) : <p className="text-slate-400 italic text-sm col-span-full">Nenhuma playlist privada.</p>}
                                    </div>
                                </div>

                                {/* 2. Playlists Colaborativas (Editor) */}
                                <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                                    <h3 className="text-sm font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-2">
                                        <Users size={16} className="text-orange-500" /> Colaborativas
                                    </h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                                        {collabPlaylists.length > 0 ? collabPlaylists.map(p => <PlaylistCard key={p.id} playlist={p} type="collab" />) : <p className="text-slate-400 italic text-sm col-span-full">Nenhuma playlist colaborativa.</p>}
                                    </div>
                                </div>

                                {/* 3. Playlists Públicas (Owned Public + Followed) */}
                                <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                                    <h3 className="text-sm font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-2">
                                        <Globe size={16} className="text-blue-500" /> Públicas & Salvas
                                    </h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                                        {publicOwnedPlaylists.length > 0 ? publicOwnedPlaylists.map(p => <PlaylistCard key={p.id} playlist={p} type="public" />) : <p className="text-slate-400 italic text-sm col-span-full">Nenhuma playlist pública ou salva.</p>}
                                    </div>
                                </div>

                                {/* 4. Listas de Projeção / Minhas Letras - Highlighted and Last */}
                                <div className="space-y-3 pt-6 pb-6 px-4 -mx-4 mt-6 bg-amber-50/50 dark:bg-amber-900/10 border-t border-b border-amber-100 dark:border-amber-900/30">
                                    <h3 className="text-sm font-bold uppercase text-amber-600 dark:text-amber-400 tracking-wider flex items-center gap-2">
                                        <FileText size={16} /> Minhas Letras (Projeção)
                                    </h3>

                                    <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                                        {lyricsLists.length > 0 ? lyricsLists.map(p => <PlaylistCard key={p.id} playlist={p} type="lyrics" />) : (
                                            <div className="col-span-full py-8 border-2 border-dashed border-amber-200 dark:border-amber-800 rounded-xl text-center text-amber-500/60 text-sm italic">
                                                Nenhuma lista de projeção de letras.
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </>
                        )}
                    </div>
                ) : (
                    /* Explore Tab Content */
                    <div className="space-y-4">
                        {isSearching ? <div className="text-center py-10 text-slate-500">Buscando...</div> : publicPlaylists.length === 0 ? <p className="text-center py-10 text-slate-400">Digite para buscar...</p> : (
                            <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                                {publicPlaylists.map((playlist) => {
                                    const isAlreadyMy = myPlaylists.some(p => p.id === playlist.id);
                                    return (
                                        <div key={playlist.id} className="bg-white dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 flex flex-col items-center justify-center gap-4 text-center aspect-square shadow-sm">
                                            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400"><Globe size={32} /></div>
                                            <div className="w-full"><h3 className="font-bold text-lg text-slate-800 dark:text-slate-200 truncate px-2">{playlist.name}</h3></div>
                                            {isAlreadyMy ? <span className="text-xs font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full">Salvo</span> : <button onClick={(e) => handleFollowPlaylist(playlist.id, e)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2"><Heart size={14} /> Seguir</button>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Create Playlist Modal (Same as before) - Reduced for brevity in this full overwrite, assuming standard implementation */}
            {/* Create/Edit Playlist Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-sm p-6 shadow-2xl">
                        <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">
                            {modalMode === 'create' ? 'Nova Playlist' : 'Editar Playlist'}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    Nome da Playlist
                                </label>
                                <input
                                    type="text"
                                    autoFocus
                                    className="w-full bg-slate-100 dark:bg-slate-700 border-none rounded-lg p-3 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
                                    value={newPlaylistName}
                                    onChange={(e) => setNewPlaylistName(e.target.value)}
                                    placeholder="Ex: Culto de Domingo"
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                                />
                            </div>

                            {/* Visibility/Type Selector */}
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                    Tipo de Playlist
                                </label>
                                <div className="grid grid-cols-1 gap-2">
                                    {/* 1. Privada */}
                                    <button
                                        onClick={() => { setIsPrivate(true); setIsCollaborative(false); setIsLyricsList(false); }}
                                        className={`flex items-center gap-3 p-3 rounded-lg border text-left transition ${isPrivate && !isCollaborative && !isLyricsList ? 'bg-purple-50 border-purple-500 ring-1 ring-purple-500 dark:bg-purple-900/20' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100'}`}
                                    >
                                        <div className={`p-2 rounded-full ${isPrivate && !isCollaborative ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'}`}>
                                            <Lock size={18} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm text-slate-900 dark:text-white">Privada</div>
                                            <div className="text-xs text-slate-500">Apenas você pode ver e editar</div>
                                        </div>
                                    </button>

                                    {/* 2. Colaborativa */}
                                    <button
                                        onClick={() => { setIsPrivate(true); setIsCollaborative(true); setIsLyricsList(false); }}
                                        className={`flex items-center gap-3 p-3 rounded-lg border text-left transition ${isCollaborative ? 'bg-orange-50 border-orange-500 ring-1 ring-orange-500 dark:bg-orange-900/20' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100'}`}
                                    >
                                        <div className={`p-2 rounded-full ${isCollaborative ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'}`}>
                                            <Users size={18} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm text-slate-900 dark:text-white">Colaborativa</div>
                                            <div className="text-xs text-slate-500">Privada para o grupo de editores</div>
                                        </div>
                                    </button>

                                    {/* 3. Pública */}
                                    <button
                                        onClick={() => { setIsPrivate(false); setIsCollaborative(false); setIsLyricsList(false); }}
                                        className={`flex items-center gap-3 p-3 rounded-lg border text-left transition ${(!isPrivate && !isCollaborative && !isLyricsList) ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 dark:bg-blue-900/20' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100'}`}
                                    >
                                        <div className={`p-2 rounded-full ${(!isPrivate && !isCollaborative && !isLyricsList) ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'}`}>
                                            <Globe size={18} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm text-slate-900 dark:text-white">Pública</div>
                                            <div className="text-xs text-slate-500">Visível para todos os usuários</div>
                                        </div>
                                    </button>

                                    {/* 4. Projeção (Lyrics List) */}
                                    <button
                                        onClick={() => { setIsPrivate(true); setIsCollaborative(false); setIsLyricsList(true); }}
                                        className={`flex items-center gap-3 p-3 rounded-lg border text-left transition ${isLyricsList ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-500 dark:bg-amber-900/20' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100'}`}
                                    >
                                        <div className={`p-2 rounded-full ${isLyricsList ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'}`}>
                                            <Monitor size={18} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm text-slate-900 dark:text-white">Projeção</div>
                                            <div className="text-xs text-slate-500">Lista focada em letras para projetar</div>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition font-bold"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreatePlaylist}
                                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold transition shadow-lg shadow-purple-600/20"
                                >
                                    {modalMode === 'create' ? 'Criar' : 'Salvar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}


        </div>
    );
}
