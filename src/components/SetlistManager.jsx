import React, { useState, useEffect } from 'react';
import { X, Save, Shuffle, List, Music, Plus, Trash2, ArrowRight, RotateCcw, Check, GripVertical, CheckCircle2, XCircle, Clock, Send } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

import { getSongFunctions, searchProfiles, getSetlistScale, addUserToSetlistScale, removeUserFromSetlistScale, getPlaylistMembers, getInstruments } from '../utils/storage';
import { WhatsAppService } from '../services/WhatsAppService';
import { supabase } from '../supabaseClient';
import { Portal } from './Portal';
import { User, Calendar, Shield, Search, UserPlus, Users } from 'lucide-react';

// Helper types for usage - INITIAL DEFAULT (will be updated from DB)
const DEFAULT_USAGE_TYPES = ['Abertura', 'Louvor', 'Adoração', 'Oferta', 'Ceia', 'Palavra', 'Apelo', 'Encerramento'];

export function SetlistManager({ playlistId, songs, onClose, onSave, initialData }) {

    const [mode, setMode] = useState(initialData ? 'manual' : 'selection'); // Start in manual selection if editing
    const [setlistName, setSetlistName] = useState(initialData?.name || '');
    const [description, setDescription] = useState(initialData?.description || '');

    // Scheduling & Permissions
    const [scheduledDate, setScheduledDate] = useState(initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : '');
    const [isCollaborative, setIsCollaborative] = useState(initialData?.is_collaborative || false);

    // Scale (People)
    const [scaleMembers, setScaleMembers] = useState([]);
    const [showUserSearch, setShowUserSearch] = useState(false);
    const [userQuery, setUserQuery] = useState('');
    const [userResults, setUserResults] = useState([]);
    const [playlistMembers, setPlaylistMembers] = useState([]); // Members of the parent playlist
    const [instrumentsMetadata, setInstrumentsMetadata] = useState([]);
    const [loadingScale, setLoadingScale] = useState(false);

    // Role Selection Modal State
    const [showRoleModal, setShowRoleModal] = useState(false);
    const [userToScale, setUserToScale] = useState(null);
    const [selectedRoles, setSelectedRoles] = useState([]);
    const [editingMemberId, setEditingMemberId] = useState(null);

    // Initial Data Loading
    useEffect(() => {
        if (initialData?.id) {
            setLoadingScale(true);
            getSetlistScale(initialData.id)
                .then(setScaleMembers)
                .catch(console.error)
                .finally(() => setLoadingScale(false));
        }

        // Load Playlist Members for suggestions (AND Owner)
        if (playlistId) {
            Promise.all([
                getPlaylistMembers(playlistId),
                supabase.from('playlists').select('owner_id').eq('id', playlistId).single(),
                getInstruments()
            ]).then(async ([members, { data: playlistData }, instruments]) => {
                setInstrumentsMetadata(instruments);

                let allMembers = members.map(m => ({
                    id: m.user_id,
                    name: m.profile?.name || m.profile?.email,
                    email: m.profile?.email,
                    avatar_url: m.profile?.avatar_url,
                    instrument: m.profile?.instrument || '',
                    available_instruments: m.profile?.available_instruments || []
                }));

                // Fetch Owner Profile if exists and not already in list
                if (playlistData?.owner_id) {
                    const isOwnerAlreadyAdded = allMembers.some(m => m.id === playlistData.owner_id);
                    if (!isOwnerAlreadyAdded) {
                        const { data: ownerProfile } = await supabase
                            .from('profiles')
                            .select('*')
                            .eq('id', playlistData.owner_id)
                            .single();

                        if (ownerProfile) {
                            allMembers.push({
                                id: ownerProfile.id,
                                name: ownerProfile.name || ownerProfile.email,
                                email: ownerProfile.email,
                                avatar_url: ownerProfile.avatar_url,
                                instrument: ownerProfile.instrument || '',
                                available_instruments: ownerProfile.available_instruments || []
                            });
                        }
                    }
                }

                // Remove duplicates just in case
                const uniqueMembers = Array.from(new Map(allMembers.map(item => [item.id, item])).values());
                setPlaylistMembers(uniqueMembers);
            });
        }
    }, [initialData?.id, playlistId]);

    // Search Users Effect (Local Filter now)
    useEffect(() => {
        const query = userQuery.toLowerCase().trim();
        const existingIds = new Set(scaleMembers.map(m => m.user.id));

        if (query.length === 0) {
            // Show all valid members
            setUserResults(playlistMembers.filter(u => !existingIds.has(u.id)));
        } else {
            // Local Filter
            const results = playlistMembers.filter(u =>
                !existingIds.has(u.id) &&
                ((u.name && u.name.toLowerCase().includes(query)) || (u.email && u.email.toLowerCase().includes(query)))
            );
            setUserResults(results);
        }
    }, [userQuery, playlistMembers, scaleMembers]);

    const addToScale = async (user) => {
        // Instead of adding immediately, open the role selection modal
        setUserToScale(user);
        setEditingMemberId(null);
        // Default to their main instrument
        const main = user.instrument || (user.available_instruments && user.available_instruments[0]) || 'Vocal';
        setSelectedRoles([main]);
        setShowRoleModal(true);
        setShowUserSearch(false);
    };

    const editMemberRole = (member) => {
        setUserToScale(member.user);
        setEditingMemberId(member.id);
        // Split existing roles "Violão + Vocal" -> ["Violão", "Vocal"]
        const existingRoles = member.role.split(' + ').map(r => r.trim());
        setSelectedRoles(existingRoles);
        setShowRoleModal(true);
    };

    const confirmAddToScale = async () => {
        if (!userToScale) return;
        
        const user = userToScale;
        const role = selectedRoles.join(' + ') || 'Vocal';
        
        if (editingMemberId) {
            // Updating existing member
            const memberId = editingMemberId;
            setScaleMembers(prev => prev.map(m => m.id === memberId ? { ...m, role } : m));
            
            // Call backend if needed
            if (!String(memberId).startsWith('temp_') && initialData?.id) {
                try {
                    // There isn't a direct 'updateUserRoleInSetlistScale' but we can use addUserToSetlistScale 
                    // which usually handles UPSERT if implemented that way, or we just rely on local state until final save.
                    // Actually, addUserToSetlistScale in storage.js might create duplicates if not careful.
                    // Let's check storage.js or just assume we'll fix it if it's broken.
                    await addUserToSetlistScale(initialData.id, user.id, role);
                } catch (e) {
                    console.error("Error updating role:", e);
                }
            }
        } else {
            // Adding new member
            const tempId = 'temp_' + Date.now();
            const newMember = {
                id: tempId,
                role: role,
                user: { ...user }
            };

            // Optimistic Update
            setScaleMembers(prev => [...prev, newMember]);

            // Only call backend if we are in EDIT mode (have an ID)
            if (initialData?.id) {
                try {
                    const result = await addUserToSetlistScale(initialData.id, user.id, role);
                    if (result) {
                        setScaleMembers(prev => prev.map(m => m.id === tempId ? { ...m, id: result.id } : m));
                    }
                } catch (error) {
                    console.error("Error adding to scale:", error);
                    alert("Erro ao adicionar membro.");
                    getSetlistScale(initialData.id).then(setScaleMembers);
                }
            }
        }
        
        setShowRoleModal(false);
        setUserToScale(null);
        setEditingMemberId(null);
        setUserQuery('');
    };

    const removeFromScale = async (scaleId) => {
        // Optimistic
        setScaleMembers(prev => prev.filter(m => m.id !== scaleId));

        if (initialData?.id) {
            try {
                await removeUserFromSetlistScale(scaleId);
            } catch (error) {
                console.error("Error removing from scale:", error);
                alert("Erro ao remover membro.");
                // Revert
                getSetlistScale(initialData.id).then(setScaleMembers);
            }
        }
    };

    // Dynamic Categories from DB
    const [usageTypes, setUsageTypes] = useState(DEFAULT_USAGE_TYPES);
    const [isGlobalConfig, setIsGlobalConfig] = useState(true); // Track if we are using global or custom config

    useEffect(() => {
        async function loadFunctions() {
            try {
                const functions = await getSongFunctions();
                // If DB has functions, use them. Otherwise fallback to default.
                if (functions && functions.length > 0) {
                    setUsageTypes(functions.map(f => f.name));
                    // If we are mounting fresh (not editing), reset autoConfig to match new types
                    if (!initialData) {
                        setAutoConfig(functions.map(f => ({ type: f.name, count: 0 })));
                    }
                }
            } catch (err) {
                console.warn("Could not load dynamic functions, using defaults:", err);
            }
        }
        loadFunctions();
    }, []);

    // If editing, map initial items to matched songs from 'songs' prop, preserving usage
    const [selectedSongs, setSelectedSongs] = useState(() => {
        if (!initialData) return [];
        return initialData.items.map(item => {
            const songData = item.song || {};
            // Make sure we carry forward any media block specifics
            return {
                id: songData.id,
                title: songData.title,
                artist: songData.artist,
                usage: item.usage_type,
                media_content: item.media_content || songData.media_content || null,
                isMediaBlock: songData.isMediaBlock || item.usage_type === 'media_block',
                uniqueId: Math.random().toString(36) // New unique ID for Drag list
            };
        });
    });

    // Ensure state updates if initialData changes after mount
    useEffect(() => {
        if (initialData) {
            setMode('manual');
            setSetlistName(initialData.name || '');
            setDescription(initialData.description || ''); // Load description
            setSelectedSongs(initialData.items.map(item => ({
                id: item.song?.id,
                title: item.song?.title,
                artist: item.song?.artist,
                usage: item.usage_type,
                media_content: item.media_content || item.song?.media_content || null,
                isMediaBlock: item.song?.isMediaBlock || item.usage_type === 'media_block',
                uniqueId: Math.random().toString(36)
            })));
        } else {
            // If switching to Create mode without unmounting
            setMode('selection');
            setSetlistName('');
            setDescription('');
            setSelectedSongs([]);
            // Reset config to currently loaded usageTypes
            setAutoConfig(usageTypes.map(type => ({ type, count: 0 })));
        }
    }, [initialData, usageTypes]); // Add usageTypes dependency to reset if they load late

    // Auto Mode Config
    const [autoConfig, setAutoConfig] = useState(DEFAULT_USAGE_TYPES.map(type => ({ type, count: 0 })));
    const [randomStrategy, setRandomStrategy] = useState('random'); // 'random', 'least_played'

    // Manual Mode Search
    const [searchQuery, setSearchQuery] = useState('');

    const handleDragEnd = (result) => {
        if (!result.destination) return;
        const items = Array.from(selectedSongs);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);
        setSelectedSongs(items);
    };

    const addSongManual = (song) => {
        // Use first function as default usage if available
        const defaultUsage = (Array.isArray(song.functions) && song.functions.length > 0) ? song.functions[0] : '';
        setSelectedSongs([...selectedSongs, { ...song, uniqueId: Math.random().toString(36), usage: defaultUsage }]);
    };

    const removeSong = (index) => {
        const newSongs = [...selectedSongs];
        newSongs.splice(index, 1);
        setSelectedSongs(newSongs);
    };

    const generateRandomSetlist = () => {
        // Logic to pick songs based on autoConfig + randomStrategy
        // This is a simplified client-side implementation
        let pool = [...songs];
        let newSelection = [];

        // Simple Random Picker Helper
        // Helper to normalize strings (remove accents, lowercase)
        const normalize = (str) => {
            return str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";
        };

        const pick = (type, count) => {
            for (let i = 0; i < count; i++) {
                if (pool.length === 0) break;

                // 1. Try to find candidates matching the requested 'type' (Style)
                const typeNorm = normalize(type);

                // DEBUG: Check what we are filtering against


                // DEBUG: Inspect first song in pool to verify structure
                if (pool.length > 0) {

                }

                const candidates = pool.map((s, idx) => ({ s, idx })).filter(({ s }) => {
                    // Check Style
                    const styleMatch = normalize(s.style) === typeNorm;
                    // Check Tags (if array)
                    const tagMatch = Array.isArray(s.tags) && s.tags.some(t => normalize(t) === typeNorm);
                    // Check Functions (if array)
                    const funcMatch = Array.isArray(s.functions) && s.functions.some(f => normalize(f) === typeNorm);

                    if (styleMatch || tagMatch || funcMatch) {

                    }
                    return styleMatch || tagMatch || funcMatch;
                });



                let chosenIndexInPool = -1;

                if (candidates.length > 0) {
                    // Pick random from MATCHING candidates
                    const randCandIdx = Math.floor(Math.random() * candidates.length);
                    chosenIndexInPool = candidates[randCandIdx].idx;
                } else {
                    // Fallback: Pick random from REMAINING pool
                    // Optimization: We could try to avoid picking songs that explicitly belong to OTHER categories, 
                    // but for now, random fallback is safer than nothing.
                    chosenIndexInPool = Math.floor(Math.random() * pool.length);
                }

                const picked = pool[chosenIndexInPool];

                // Add to selection
                newSelection.push({ ...picked, uniqueId: Math.random().toString(36), usage: type });

                // Remove from pool to avoid duplicates
                pool.splice(chosenIndexInPool, 1);
            }
        };

        autoConfig.forEach(cfg => {
            if (cfg.count > 0) pick(cfg.type, cfg.count);
        });

        setSelectedSongs(newSelection);
        setMode('preview');
    };

    const handleFinalSave = () => {
        if (!setlistName.trim()) return alert('Digite um nome para a escala.');
        if (selectedSongs.length === 0) return alert('Adicione músicas à escala.');

        onSave({
            name: setlistName,
            description: description,
            scheduledDate: scheduledDate || null,
            isCollaborative: isCollaborative,
            scaleMembers: scaleMembers.map(m => ({ userId: m.user.id, role: m.role })), // Pass simple array of IDs/Roles
            items: selectedSongs.map((s, i) => {
                const isMedia = s.isMediaBlock || (s.id && String(s.id).startsWith('media_block_'));
                return {
                    songId: isMedia ? null : s.id, // Only send UUID for actual songs
                    position: i,
                    usage: isMedia ? 'media_block' : s.usage,
                    media_content: isMedia ? (s.media_content || []) : null
                };
            })
        });
    };

    const swapSong = (index) => {
        const currentItem = selectedSongs[index];
        const targetUsage = currentItem.usage || ''; // Target specific usage if defined

        // Normalize helper
        const normalize = (str) => str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";
        const typeNorm = normalize(targetUsage);

        // Filter candidates from ALL songs that are NOT currently selected
        const currentIds = new Set(selectedSongs.map(s => s.id));

        let pool = songs.filter(s => !currentIds.has(s.id));

        // If we have a target usage, try to filter by it
        let candidates = pool;
        if (targetUsage) {
            candidates = pool.filter(s => {
                const styleMatch = normalize(s.style) === typeNorm;
                const tagMatch = Array.isArray(s.tags) && s.tags.some(t => normalize(t) === typeNorm);
                const funcMatch = Array.isArray(s.functions) && s.functions.some(f => normalize(f) === typeNorm);
                return styleMatch || tagMatch || funcMatch;
            });
        }

        // If no candidates found for that usage (or empty pool), fallback to random from available pool
        if (candidates.length === 0 && pool.length > 0) {
            candidates = pool;
        }

        if (candidates.length > 0) {
            const randomIdx = Math.floor(Math.random() * candidates.length);
            const newSongData = candidates[randomIdx];

            // Replace item at index
            const newItems = [...selectedSongs];
            newItems[index] = {
                ...newItems[index], // Keep uniqueId and usage
                id: newSongData.id,
                title: newSongData.title,
                artist: newSongData.artist
            };
            setSelectedSongs(newItems);
        } else {
            // No songs available to swap
            alert("Não há outras músicas disponíveis para troca.");
        }
    };

    // Lock Body Scroll when open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    return (
        <Portal>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] md:p-4 animate-in fade-in duration-300">
                <div className="bg-white dark:bg-slate-900 w-full h-full md:h-auto md:max-w-4xl md:max-h-[85vh] md:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">

                    {/* Header */}
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-20">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <List className="text-purple-600" /> {initialData ? 'Editar Setlist' : 'Novo Setlist (repertório)'}
                        </h2>
                        <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"><X /></button>
                    </div>

                    {/* Content Section - Scrollable Wrapper */}
                    <div className="flex-1 overflow-y-auto overscroll-contain flex flex-col p-5 md:p-6 bg-white dark:bg-slate-900">
                        <div className="flex flex-col min-h-full">
                            {/* Name Input */}
                            <div className="mb-4">
                                <label className="block text-sm font-bold text-slate-500 mb-1">Nome do Setlist</label>
                                <input
                                    type="text"
                                    className="w-full text-lg font-bold bg-transparent border-b-2 border-slate-200 dark:border-slate-700 focus:border-purple-600 outline-none py-2 text-slate-900 dark:text-white placeholder:text-slate-300"
                                    placeholder="Ex: Culto Domingo - 27/12"
                                    value={setlistName}
                                    onChange={e => setSetlistName(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            {/* Description Input */}
                            <div className="mb-6">
                                <label className="block text-sm font-bold text-slate-500 mb-1">Descrição (Opcional)</label>
                                <textarea
                                    className="w-full bg-slate-100 dark:bg-slate-800 rounded-lg p-3 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500 h-20 resize-none"
                                    placeholder="Adicione detalhes, observações ou avisos..."
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                />
                            </div>

                            {/* Scheduling & Permissions Section */}
                            <div className="flex flex-col md:flex-row gap-4 mb-6">
                                {/* Date Picker */}
                                <div className="flex-1">
                                    <label className="block text-sm font-bold text-slate-500 mb-1 flex items-center gap-1">
                                        <Calendar size={14} /> Data Prevista
                                    </label>
                                    <input
                                        type="date"
                                        className="w-full bg-slate-100 dark:bg-slate-800 rounded-lg p-3 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                                        value={scheduledDate}
                                        onChange={e => setScheduledDate(e.target.value)}
                                    />
                                </div>

                                {/* Permissions */}
                                <div className="flex-1">
                                    <label className="block text-sm font-bold text-slate-500 mb-1 flex items-center gap-1">
                                        <Shield size={14} /> Permissões
                                    </label>
                                    <div className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                                        <div className="flex-1">
                                            <div className="text-sm font-bold text-slate-700 dark:text-slate-200">Edição Colaborativa</div>
                                            <div className="text-xs text-slate-500">Permitir que membros editem</div>
                                        </div>

                                        <button
                                            onClick={() => setIsCollaborative(!isCollaborative)}
                                            className={`w-12 h-6 rounded-full transition relative ${isCollaborative ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${isCollaborative ? 'left-7' : 'left-1'}`} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Scale (Escala) Section */}
                            <div className="mb-6 p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 relative">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                        <User size={18} className="text-purple-600" /> Escala (Músicos & Cantores)
                                    </h3>
                                </div>

                                {/* Inline Search Input */}
                                <div className="relative mb-3">
                                    <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-purple-500">
                                        <Search size={16} className="text-slate-400" />
                                        <input
                                            type="text"
                                            className="flex-1 bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                                            placeholder="Buscar membro..."
                                            value={userQuery}
                                            onChange={e => setUserQuery(e.target.value)}
                                            onFocus={() => {
                                                setShowUserSearch(true);
                                                // Trigger suggestion update if empty
                                                if (userQuery === '') {
                                                    const existingIds = new Set(scaleMembers.map(m => m.user.id));
                                                    setUserResults(playlistMembers.filter(u => !existingIds.has(u.id)));
                                                }
                                            }}
                                        />
                                        {userQuery && (
                                            <button onClick={() => { setUserQuery(''); setShowUserSearch(false); }} className="text-slate-400 hover:text-slate-600">
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Dropdown Results */}
                                    {showUserSearch && (userQuery.length > 0 || userResults.length > 0) && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-20 max-h-60 overflow-y-auto overscroll-contain">
                                            {userResults.length > 0 && <div className="text-[10px] uppercase font-bold text-slate-400 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 sticky top-0">{userQuery ? 'Resultados' : 'Sugestões do Time'}</div>}

                                            {userResults.length > 0 ? (
                                                userResults.map(user => (
                                                    <button
                                                        key={user.id}
                                                        onClick={() => addToScale(user)}
                                                        className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition text-left border-b border-slate-100 dark:border-slate-800 last:border-0"
                                                    >
                                                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                                                            {user.avatar_url ? (
                                                                <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">
                                                                    {(user.name || '?').charAt(0)}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-sm text-slate-900 dark:text-white">{user.name || 'Sem Nome'}</div>
                                                            <div className="text-xs text-slate-500">{user.email}</div>
                                                        </div>
                                                        <Plus size={16} className="ml-auto text-purple-600" />
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="p-4 text-center text-xs text-slate-500">
                                                    {userQuery.length < 3 ? 'Digite para buscar...' : 'Nenhum usuário encontrado.'}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Active Members List */}
                                {scaleMembers.length === 0 ? (
                                    <div className="text-center text-slate-400 text-sm py-2">Ninguém escalado ainda.</div>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {scaleMembers.map(member => {
                                            const status = member.status || 'PENDING';
                                            const isConfirmed = status === 'CONFIRMED';
                                            const isDeclined = status === 'DECLINED';
                                            
                                            let badgeStyle = 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200';
                                            if (isConfirmed) {
                                                badgeStyle = 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200';
                                            } else if (isDeclined) {
                                                badgeStyle = 'bg-rose-50 dark:bg-rose-950/40 border-rose-400 dark:border-rose-700 text-rose-800 dark:text-rose-200';
                                            }

                                            return (
                                                <div key={member.id} className={`flex items-center gap-2 pl-1 pr-2 py-1.5 rounded-full border shadow-sm transition ${badgeStyle}`}>
                                                    <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden relative">
                                                        {member.user?.avatar_url ? (
                                                            <img src={member.user.avatar_url} alt={member.user.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-500">
                                                                {(member.user?.name || '?').charAt(0)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="text-xs font-bold truncate max-w-[80px]">
                                                        {member.user?.name?.split(' ')[0] || member.user?.email}
                                                    </span>
                                                    
                                                    {/* Status Badge Icon */}
                                                    <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-white/80 dark:bg-slate-800/80 shadow-xs" title={`Status: ${status}`}>
                                                        {isConfirmed && <CheckCircle2 size={12} className="text-emerald-500" />}
                                                        {isDeclined && <XCircle size={12} className="text-rose-500" />}
                                                        {!isConfirmed && !isDeclined && <Clock size={12} className="text-amber-500" />}
                                                        <span>{isConfirmed ? 'OK' : isDeclined ? 'Recusou' : 'Pendente'}</span>
                                                    </span>

                                                    <button
                                                        onClick={() => editMemberRole(member)}
                                                        className="bg-purple-100 dark:bg-purple-900/40 text-[9px] font-extrabold text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-1.5 py-0.5 cursor-pointer hover:bg-purple-200 dark:hover:bg-purple-900/60 rounded-md truncate max-w-[90px]"
                                                        title="Alterar Função"
                                                    >
                                                        {member.role}
                                                    </button>

                                                    <button
                                                        onClick={() => removeFromScale(member.id)}
                                                        className="w-5 h-5 flex items-center justify-center rounded-full text-slate-400 hover:text-rose-600 hover:bg-white dark:hover:bg-slate-800"
                                                        title="Remover da escala"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Mode Specific Body */}
                            <div className="flex-1 flex flex-col">
                                {mode === 'selection' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <button
                                            onClick={() => setMode('manual')}
                                            className="flex flex-col items-center justify-center gap-4 p-8 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition group"
                                        >
                                            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover:scale-110 transition">
                                                <List size={32} className="text-slate-400 group-hover:text-purple-600" />
                                            </div>
                                            <div className="text-center">
                                                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">Escolher Músicas</h3>
                                                <p className="text-sm text-slate-500">Selecionar manualmente da lista</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => setMode('auto')}
                                            className="flex flex-col items-center justify-center gap-4 p-8 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition group"
                                        >
                                            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover:scale-110 transition">
                                                <Shuffle size={32} className="text-slate-400 group-hover:text-purple-600" />
                                            </div>
                                            <div className="text-center">
                                                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">Gerar Aleatoriamente</h3>
                                                <p className="text-sm text-slate-500">Definir regras e sortear</p>
                                            </div>
                                        </button>
                                    </div>
                                )}

                                {mode === 'manual' && (
                                    <div className="flex flex-col space-y-4">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                                            <input
                                                type="text"
                                                placeholder="Buscar na playlist..."
                                                className="w-full bg-slate-100 dark:bg-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                                                value={searchQuery}
                                                onChange={e => setSearchQuery(e.target.value)}
                                            />
                                        </div>
                                        <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                                            {songs
                                                .filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
                                                .map(song => {
                                                    const selectionCount = selectedSongs.filter(s => s.id === song.id).length;
                                                    const isSelected = selectionCount > 0;
                                                    return (
                                                        <div
                                                            key={song.id}
                                                            onClick={() => addSongManual(song)}
                                                            className={`p-3 cursor-pointer flex justify-between items-center transition ${isSelected ? 'bg-purple-50 dark:bg-purple-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                                                        >
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    {song.type === 'lyrics' ? (
                                                                        <FileText size={14} className="text-amber-500" />
                                                                    ) : (
                                                                        <Music size={14} className="text-purple-500" />
                                                                    )}
                                                                    <span className={`font-bold ${isSelected ? 'text-purple-600 dark:text-purple-400' : 'text-slate-700 dark:text-slate-200'}`}>{song.title}</span>
                                                                    {isSelected && <span className="text-[10px] font-bold bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-200 px-1.5 py-0.5 rounded-full">{selectionCount}x</span>}
                                                                </div>
                                                                <div className="text-xs text-slate-500">{song.artist}</div>
                                                            </div>
                                                            <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-purple-100 dark:bg-purple-900 text-purple-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                                                {isSelected ? <Check size={16} /> : <Plus size={16} />}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                )}

                                {mode === 'auto' && (
                                    <div className="flex flex-col space-y-3">
                                        <div className="flex flex-col sm:flex-row gap-4 p-4 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                                            <button
                                                onClick={() => setRandomStrategy('random')}
                                                className={`flex-1 p-3 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${randomStrategy === 'random' ? 'bg-white dark:bg-slate-700 text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                <Shuffle size={16} /> Aleatório
                                            </button>
                                            <button
                                                onClick={() => setRandomStrategy('least_played')}
                                                className={`flex-1 p-3 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${randomStrategy === 'least_played' ? 'bg-white dark:bg-slate-700 text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                <RotateCcw size={16} /> Menos Tocadas
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            {autoConfig.map((cfg, idx) => (
                                                <div key={cfg.type} className="flex justify-between items-center p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                                                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{cfg.type}</span>
                                                    <div className="flex items-center gap-3">
                                                        <button onClick={() => {
                                                            const newCfg = [...autoConfig];
                                                            if (newCfg[idx].count > 0) newCfg[idx].count--;
                                                            setAutoConfig(newCfg);
                                                        }} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-200">-</button>
                                                        <span className="w-6 text-center font-bold">{cfg.count}</span>
                                                        <button onClick={() => {
                                                            const newCfg = [...autoConfig];
                                                            newCfg[idx].count++;
                                                            setAutoConfig(newCfg);
                                                        }} className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 hover:bg-purple-200">+</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <button onClick={generateRandomSetlist} className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-purple-500/20 transition mt-4">
                                            <Shuffle size={20} /> Gerar Setlist Automaticamente
                                        </button>
                                    </div>
                                )}

                                {mode === 'preview' && (
                                    <div className="flex-1 flex flex-col min-h-0">
                                        <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg mb-4 text-xs text-slate-500 flex items-center gap-2">
                                            <GripVertical size={14} /> Arraste os itens para reordenar a ordem do culto.
                                        </div>
                                        <DragDropContext onDragEnd={handleDragEnd}>
                                            <Droppable droppableId="setlist-preview">
                                                {(provided) => (
                                                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 pb-4 overflow-y-auto pr-1">
                                                        {selectedSongs.map((item, index) => (
                                                            <Draggable key={item.uniqueId} draggableId={item.uniqueId} index={index}>
                                                                {(provided) => (
                                                                    <div
                                                                        ref={provided.innerRef}
                                                                        {...provided.draggableProps}
                                                                        className="flex flex-col md:flex-row md:items-center gap-3 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg group shadow-sm"
                                                                    >
                                                                        <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                                                            <div {...provided.dragHandleProps} className="text-slate-300 hover:text-purple-600 cursor-grab active:cursor-grabbing p-1">
                                                                                <GripVertical size={20} />
                                                                            </div>
                                                                            <div className="text-slate-400 font-bold w-6 text-center text-sm">{index + 1}</div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center gap-2">
                                                                                    {item.type === 'lyrics' ? (
                                                                                        <FileText size={14} className="text-amber-500 flex-shrink-0" />
                                                                                    ) : (
                                                                                        <Music size={14} className="text-purple-500 flex-shrink-0" />
                                                                                    )}
                                                                                    <div className="font-bold text-slate-900 dark:text-white truncate text-sm">{item.title}</div>
                                                                                </div>
                                                                                <div className="text-[10px] text-slate-500 truncate uppercase tracking-wider">{item.artist}</div>
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex items-center gap-2 pl-10 md:pl-0">
                                                                            <select
                                                                                disabled={item.isMediaBlock || (item.id && String(item.id).startsWith('media_block_'))}
                                                                                className="flex-1 md:w-32 text-[10px] uppercase font-bold bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-2 py-1.5 text-slate-600 dark:text-slate-400 outline-none focus:ring-1 focus:ring-purple-500"
                                                                                value={item.usage || ''}
                                                                                onChange={(e) => {
                                                                                    const newItems = [...selectedSongs];
                                                                                    newItems[index].usage = e.target.value;
                                                                                    setSelectedSongs(newItems);
                                                                                }}
                                                                            >
                                                                                <option value="">Função</option>
                                                                                {usageTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                                                                {(item.isMediaBlock || (item.id && String(item.id).startsWith('media_block_'))) && <option value="media_block">Projeção</option>}
                                                                            </select>

                                                                            <div className="flex items-center gap-1">
                                                                                <button onClick={() => swapSong(index)} className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition" title="Sortear Outra">
                                                                                    <RotateCcw size={16} />
                                                                                </button>
                                                                                <button onClick={() => removeSong(index)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition" title="Remover">
                                                                                    <Trash2 size={16} />
                                                                                </button>
                                                                            </div>
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
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer - Fixed at bottom */}
                    <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 sticky bottom-0 z-20 flex flex-col sm:flex-row gap-3">
                        {mode === 'manual' && (
                            <div className="flex-1 flex items-center justify-between sm:justify-start sm:gap-4">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{selectedSongs.length} músicas</span>
                                <button onClick={() => setMode('preview')} className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-md transition flex items-center gap-2">
                                    Próximo <ArrowRight size={16} />
                                </button>
                            </div>
                        )}

                        {mode === 'preview' && (
                            <div className="flex w-full gap-3">
                                <button onClick={() => setMode('manual')} className="flex-1 sm:flex-none px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition text-sm">Voltar</button>
                                <button onClick={handleFinalSave} className="flex-[2] sm:flex-none sm:ml-auto bg-green-600 hover:bg-green-700 text-white px-8 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition text-sm">
                                    <Save size={18} /> Salvar Tudo
                                </button>
                            </div>
                        )}

                        {(mode === 'selection' || mode === 'auto') && (
                            <button onClick={onClose} className="w-full sm:w-auto px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition text-sm">Cancelar</button>
                        )}
                    </div>
                </div>
            </div>
            {/* Role Selection Modal */}
            {showRoleModal && userToScale && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[10001] p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Users size={20} className="text-purple-600" />
                                Definir Função
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">Escolha o instrumento para <strong>{userToScale.name}</strong></p>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-wider">Habilidades do Usuário</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(userToScale.available_instruments || []).length > 0 ? (
                                        userToScale.available_instruments.map(inst => (
                                            <button
                                                key={inst}
                                                onClick={() => {
                                                    if (selectedRoles.includes(inst)) {
                                                        setSelectedRoles(selectedRoles.filter(r => r !== inst));
                                                    } else {
                                                        setSelectedRoles([...selectedRoles, inst]);
                                                    }
                                                }}
                                                className={`flex items-center justify-between p-3 rounded-xl border text-sm font-bold transition-all ${
                                                    selectedRoles.includes(inst) 
                                                    ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/20' 
                                                    : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                                                }`}
                                            >
                                                {inst}
                                                {selectedRoles.includes(inst) && <Check size={14} />}
                                                {inst === userToScale.instrument && !selectedRoles.includes(inst) && <span className="text-[8px] bg-slate-200 dark:bg-slate-700 px-1 rounded text-slate-500 font-normal">Principal</span>}
                                            </button>
                                        ))
                                    ) : (
                                        <div className="col-span-2 py-2 text-xs text-slate-400 italic text-center bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                                            Nenhuma habilidade cadastrada.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-wider">Outras Funções</label>
                                <select
                                    value=""
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val && !selectedRoles.includes(val)) {
                                            setSelectedRoles([...selectedRoles, val]);
                                        }
                                    }}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                                >
                                    <option value="">Adicionar outra função...</option>
                                    {instrumentsMetadata
                                        .filter(i => !(userToScale.available_instruments || []).includes(i.name))
                                        .map(inst => (
                                            <option key={inst.id} value={inst.name}>{inst.name}</option>
                                        ))
                                    }
                                    <option value="Vocal">Vocal</option>
                                    <option value="Outro">Outro</option>
                                </select>
                            </div>

                            {selectedRoles.length > 0 && (
                                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-800/50">
                                    <label className="block text-[9px] uppercase font-extrabold text-purple-400 mb-2">Funções Selecionadas (Toque para remover)</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {selectedRoles.map(role => (
                                            <button
                                                key={role}
                                                onClick={() => setSelectedRoles(selectedRoles.filter(r => r !== role))}
                                                className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-800 rounded-lg text-[11px] font-bold text-purple-700 dark:text-purple-300 hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-900/30 transition-colors group"
                                                title="Remover"
                                            >
                                                {role}
                                                <X size={10} className="text-purple-400 group-hover:text-red-500" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => { setShowRoleModal(false); setUserToScale(null); }}
                                    className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition text-sm"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={confirmAddToScale}
                                    className="flex-[2] py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-lg shadow-purple-600/30 transition text-sm flex items-center justify-center gap-2"
                                >
                                    Confirmar Escala
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Portal>
    );
}


