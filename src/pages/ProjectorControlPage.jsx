import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyPlaylists, getPlaylistWithItems, getSetlists, updateSetlist, saveSongProjectionSettings, updateSetlistSettings, updatePlaylistSettings, getSongById, logActivity } from '../utils/storage';
import { supabase } from '../supabaseClient';
import { extractSlides } from '../utils/lyricsParser';
import { 
    Zap, Play, Pause, ChevronLeft, ChevronRight, Search, Plus, Trash2, Edit3, Save, X, Settings, 
    MonitorPlay, MonitorUp, Share2, Type, Clock, AlertTriangle, BookOpen, Layers, MousePointer2, 
    Volume2, VolumeX, Maximize2, Minimize2, Video, Square, RefreshCcw, Wifi, WifiOff, ListMusic,
    Copy, ExternalLink, Image as ImageIcon, ImagePlus, GripVertical, FileText, RotateCcw, Megaphone,
    Calendar
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import ProjectionEditorModal from '../components/ProjectionEditorModal';
import ImageBackgroundModal from '../components/ImageBackgroundModal';
import VideoBackgroundModal from '../components/VideoBackgroundModal';
import BibleSearch from '../components/BibleSearch';

export default function ProjectorControlPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const songIdParam = searchParams.get('songId');
    const playlistIdParam = searchParams.get('playlistId');
    const setlistIdParam = searchParams.get('setlistId');

    // State
    const [playlists, setPlaylists] = useState([]);
    const [selectedPlaylist, setSelectedPlaylist] = useState(null);
    const [isSetlistModalOpen, setIsSetlistModalOpen] = useState(false);
    const [modalPlaylist, setModalPlaylist] = useState(null);
    const [playlistSetlists, setPlaylistSetlists] = useState({}); // Cache setlists per playlist
    const [selectedSetlist, setSelectedSetlist] = useState(null); // When a setlist is exactly chosen
    const [isQRZoomed, setIsQRZoomed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingSetlists, setLoadingSetlists] = useState(false);
    const [showPastSetlists, setShowPastSetlists] = useState(false);

    // Preview State (What is seen in middle panel)
    const [activeSongIndex, setActiveSongIndex] = useState(0);
    const [slides, setSlides] = useState([]);

    const [localFontSize, setLocalFontSize] = useState(100);
    const [slidePreviewSize, setSlidePreviewSize] = useState(() => {
        try { return parseInt(localStorage.getItem('slidePreviewSize') || '220'); } catch { return 220; }
    });

    // Live Playback State (What is really on the projector)
    const [liveSongIndex, setLiveSongIndex] = useState(0);
    const [liveSlideIndex, setLiveSlideIndex] = useState(-1); // -1 = Blank/Logo
    const [liveSlides, setLiveSlides] = useState([]);

    // Custom Projection Editor State
    const [editingSong, setEditingSong] = useState(null);
    const [editingSongIndex, setEditingSongIndex] = useState(null);

    // Media & Display State
    const [bgColor, setBgColor] = useState('#000000');
    const [bgType, setBgType] = useState('color'); // 'color', 'image', 'video'
    const [bgUrl, setBgUrl] = useState('');
    const [globalDefaults, setGlobalDefaults] = useState({ type: 'color', url: '', color: '#000000' });
    const [textColor, setTextColor] = useState('#FFFFFF');
    const [textShadow, setTextShadow] = useState(true);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
    const [mediaModalTargetIndex, setMediaModalTargetIndex] = useState(null); // null = global bg, number = specific media slide index
    const [timerMinutes, setTimerMinutes] = useState(5);
    const [timerText, setTimerText] = useState('O Culto Vai Começar em:');
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [isBibleModalOpen, setIsBibleModalOpen] = useState(false);
    const [bibleBGPrefs, setBibleBGPrefs] = useState({ type: 'color', url: '', color: '#000000' });
    const [timerDefaultBG, setTimerDefaultBG] = useState({ type: 'color', url: '', color: '#000000' });
    const [timerEndDate, setTimerEndDate] = useState(null);
    const [churchLogoUrl, setChurchLogoUrl] = useState('');
    const [videoStatus, setVideoStatus] = useState({ currentTime: 0, duration: 0, paused: true, url: '' });
    const [alertText, setAlertText] = useState('');
    const [isAlertActive, setIsAlertActive] = useState(false);
    const [isUpdatingAlert, setIsUpdatingAlert] = useState(false);
    const [alertBgColor, setAlertBgColor] = useState('#000000');
    const [alertTextColor, setAlertTextColor] = useState('#FFFFFF');
    const [alertFontSize, setAlertFontSize] = useState(100);
    const [copyToast, setCopyToast] = useState(false);

    // Derived State
    const currentSong = selectedPlaylist?.items?.[activeSongIndex]?.song;

    // Sync local font size when active song changes
    useEffect(() => {
        if (currentSong && !currentSong.isMediaBlock) {
            setLocalFontSize(currentSong.projFontSize || 100);
        }
    }, [currentSong]);

    // Determined effective state for the Control Panel UI highlighting (Song specific override OR Global)
    const effectiveBgType = (currentSong && currentSong.projBgType && currentSong.projBgType !== 'media' && currentSong.projBgType !== 'global') 
        ? currentSong.projBgType 
        : bgType;
    
    const effectiveBgUrl = (currentSong && currentSong.projBgType && currentSong.projBgType !== 'global') 
        ? currentSong.projBgUrl 
        : bgUrl;

    const effectiveBgColor = (currentSong && currentSong.projBgType && currentSong.projBgType !== 'global') 
        ? currentSong.projBgColor || '#000000' 
        : bgColor;

    // Display State Connection
    const channel = useRef(null);
    const remoteChannel = useRef(null);
    const isRemoteSubscribed = useRef(false);
    const [isRemoteModalOpen, setIsRemoteModalOpen] = useState(false);

    useEffect(() => {
        channel.current = new BroadcastChannel('projector_sync');
        channel.current.onmessage = (e) => {
            if (e.data.type === 'VIDEO_STATUS') {
                setVideoStatus(e.data);
            }
        };
        return () => channel.current?.close();
    }, []);


    const syncToDisplay = useCallback((payload = {}, mergeCurrentParams = true, specificLiveSongIndex = null) => {
        if (!channel.current) return;
        
        // Safety check to avoid "Channel is closed" error
        let fullPayload = { ...payload };

        // Always send full state so the display knows what to do
        if (mergeCurrentParams) {
            // Determine active song settings if there's a live song
            let activeProjBgType = bgType;
            let activeProjBgUrl = bgUrl;
            let activeProjBgColor = bgColor;
            let activeProjFontSize = 100; // default
            let activeSongId = 'none';

            const targetIndex = specificLiveSongIndex !== null ? specificLiveSongIndex : liveSongIndex;

            if (targetIndex >= 0 && selectedPlaylist?.items) {
                const liveSong = selectedPlaylist.items[targetIndex]?.song;
                if (liveSong && payload.slide?.type !== 'verse') {
                    activeSongId = liveSong.id;
                    if (liveSong.projBgType && liveSong.projBgType !== 'global') {
                        activeProjBgType = liveSong.projBgType;
                        activeProjBgUrl = liveSong.projBgUrl;
                        activeProjBgColor = liveSong.projBgColor || '#000000';
                    }
                    if (liveSong.projFontSize) {
                        activeProjFontSize = liveSong.projFontSize;
                    }
                }
            }
            const previewIndex = activeSongIndex;
            const liveSong = (targetIndex >= 0 && selectedPlaylist?.items) ? selectedPlaylist.items[targetIndex]?.song : null;
            
            // Default to live song info
            let currentSongTitle = liveSong?.title || 'LouvorPlay';
            let currentAllSlides = (liveSlides || []).map(s => ({
                text: s.text || s.lines?.join('\n') || '',
                type: s.type || 'Slide'
            }));

            // Improved isPreview detection: 
            // It's a preview ONLY if:
            // 1. Explicitly requested in payload.isPreview
            // 2. OR it's a SELECT_PLAYLIST_ITEM action.
            // 3. OR the current active (preview) song is different from live AND we don't have an explicit slide change in payload.
            // BUT, if we are clearing the screen or showing logo, it's ALWAYS live.
            let isPreview = false;
            if (payload.isPreview !== undefined) {
                isPreview = payload.isPreview;
            } else if (payload.type === 'CLEAR_SLIDE' || payload.type === 'SHOW_LOGO' || payload.action === 'START_TIMER' || payload.action === 'STOP_TIMER') {
                isPreview = false;
            } else if (payload.slide !== undefined) {
                isPreview = false;
            } else if (activeSongIndex !== liveSongIndex) {
                // If indices differ and no slide is specified, we assume it's a preview sync
                isPreview = true;
            }

            // If it's a preview update, use the preview song's info
            if (isPreview && selectedPlaylist?.items?.[previewIndex]) {
                const previewSong = selectedPlaylist.items[previewIndex].song;
                currentSongTitle = previewSong?.title || 'LouvorPlay';
                let rawSlides = [];
                if (previewSong?.isMediaBlock) {
                    rawSlides = (previewSong.media_content || []).map((m, i) => ({ id: `media_${i}`, type: m.type || 'Mídia', url: m.url, isEmptySlot: !m.url }));
                } else if (previewSong) {
                    rawSlides = extractSlides(previewSong);
                }
                currentAllSlides = rawSlides.map(s => ({
                    text: s.text || s.lines?.join('\n') || (s.type === 'video' ? '[Vídeo]' : s.type === 'image' ? '[Imagem]' : ''),
                    type: s.type || 'Slide'
                }));
            }

            const effTimerTypeCalc = selectedSetlist && selectedSetlist.timer_bg_type && selectedSetlist.timer_bg_type !== 'global' ? selectedSetlist.timer_bg_type : selectedPlaylist && selectedPlaylist.timer_bg_type && selectedPlaylist.timer_bg_type !== 'global' ? selectedPlaylist.timer_bg_type : 'global';
            const effTimerUrlCalc = selectedSetlist && selectedSetlist.timer_bg_type && selectedSetlist.timer_bg_type !== 'global' ? selectedSetlist.timer_bg_url : selectedPlaylist && selectedPlaylist.timer_bg_type && selectedPlaylist.timer_bg_type !== 'global' ? selectedPlaylist.timer_bg_url : '';
            const effTimerColorCalc = selectedSetlist && selectedSetlist.timer_bg_type && selectedSetlist.timer_bg_type !== 'global' ? selectedSetlist.timer_bg_color : selectedPlaylist && selectedPlaylist.timer_bg_type && selectedPlaylist.timer_bg_type !== 'global' ? selectedPlaylist.timer_bg_color : '';
            const finalTimerType = effTimerTypeCalc === 'global' ? timerDefaultBG.type : effTimerTypeCalc;
            const finalTimerUrl = effTimerTypeCalc === 'global' ? timerDefaultBG.url : effTimerUrlCalc;
            const finalTimerColor = effTimerTypeCalc === 'global' ? timerDefaultBG.color : effTimerColorCalc;

            fullPayload = {
                type: 'SYNC_STATE',
                songId: activeSongId,
                slide: payload.slide !== undefined ? payload.slide : (liveSlideIndex >= 0 ? liveSlides[liveSlideIndex] : null),

                // Prioritize explicit payload overrides, then active song modifiers, then global layout
                bgType: payload.bgType !== undefined ? payload.bgType : activeProjBgType,
                bgUrl: payload.bgUrl !== undefined ? payload.bgUrl : activeProjBgUrl,
                projFontSize: payload.projFontSize !== undefined ? payload.projFontSize : activeProjFontSize,

                bgColor: payload.bgColor !== undefined ? payload.bgColor : activeProjBgColor,
                textColor: payload.textColor !== undefined ? payload.textColor : textColor,
                textShadow: payload.textShadow !== undefined ? payload.textShadow : textShadow,
                timerMinutes: payload.timerMinutes !== undefined ? payload.timerMinutes : timerMinutes,
                timerText: payload.timerText !== undefined ? payload.timerText : timerText,
                timerBgType: payload.timerBgType !== undefined ? payload.timerBgType : finalTimerType,
                timerBgUrl: payload.timerBgUrl !== undefined ? payload.timerBgUrl : finalTimerUrl,
                timerBgColor: payload.timerBgColor !== undefined ? payload.timerBgColor : finalTimerColor,
                churchLogoUrl: payload.churchLogoUrl !== undefined ? payload.churchLogoUrl : churchLogoUrl,
                isTimerRunning: payload.isTimerRunning !== undefined ? payload.isTimerRunning : isTimerRunning,
                timerEndDate: payload.timerEndDate !== undefined ? payload.timerEndDate : timerEndDate,
                action: payload.action, // 'START_TIMER', 'STOP_TIMER', etc
                alertText: payload.alertText !== undefined ? payload.alertText : alertText,
                isAlertActive: payload.isAlertActive !== undefined ? payload.isAlertActive : isAlertActive,
                alertBgColor: payload.alertBgColor !== undefined ? payload.alertBgColor : alertBgColor,
                alertTextColor: payload.alertTextColor !== undefined ? payload.alertTextColor : alertTextColor,
                alertFontSize: payload.alertFontSize !== undefined ? payload.alertFontSize : alertFontSize,

                // New fields for Remote Control Menu
                liveSongIndex: targetIndex,
                liveSlideIndex: payload.slide !== undefined ? (payload.type === 'CLEAR_SLIDE' ? -1 : liveSlideIndex) : liveSlideIndex,
                activeSongIndex,
                isPreview,
                songTitle: currentSongTitle,
                allSlides: currentAllSlides,
                playlistItems: selectedPlaylist?.items?.map(item => ({
                    id: item.id,
                    song: {
                        id: item.song?.id,
                        title: item.song?.title,
                        artist: item.song?.artist,
                        isMediaBlock: item.song?.isMediaBlock
                    }
                })) || []
            };
        }

        try {
            channel.current.postMessage(fullPayload);
        } catch (err) {
            console.warn('BroadcastChannel postMessage failed (channel might be closed):', err);
        }
        
        // Broadcast to Supabase Realtime for Remote Devices
        if (remoteChannel.current && isRemoteSubscribed.current) {
            remoteChannel.current.send({
                type: 'broadcast',
                event: 'state_update',
                payload: {
                    ...fullPayload,
                    // slideText is a convenience field for simple displays (phone preview)
                    slideText: fullPayload.slide?.text || fullPayload.slide?.lines?.join('\n') || (liveSlideIndex === -1 ? 'Tela Limpa' : '')
                }
            }).catch(err => {
                console.warn('Failed to send Supabase Realtime broadcast:', err);
            });
        }

        localStorage.setItem('projector_current_state', JSON.stringify({
            ...fullPayload,
            timestamp: Date.now()
        }));
    }, [liveSlideIndex, liveSlides, liveSongIndex, activeSongIndex, selectedPlaylist, selectedSetlist, bgType, bgUrl, bgColor, textColor, textShadow, timerMinutes, timerText, isTimerRunning, timerEndDate, churchLogoUrl, timerDefaultBG, isAlertActive, alertText, alertBgColor, alertTextColor, alertFontSize]);

    const handleProjectVerse = (versePayload) => {
        // Determine backdrop for Bible
        let verseBgType = bibleBGPrefs.type || 'color';
        let verseBgUrl = bibleBGPrefs.url || '';
        let verseBgColor = bibleBGPrefs.color || '#000000';

        syncToDisplay({
            type: 'SYNC_STATE',
            slide: {
                ...versePayload,
                id: `verse_${Date.now()}`
            },
            bgType: verseBgType,
            bgUrl: verseBgUrl,
            bgColor: verseBgColor
        });
    };

    // Automatic synchronization when critical display state changes.
    // We track liveSlides with a ref to avoid re-triggering on every render since
    // arrays always create a new reference (which would cause an infinite loop).
    const liveSlidesRef = useRef(liveSlides);
    useEffect(() => {
        liveSlidesRef.current = liveSlides;
    }, [liveSlides]);

    useEffect(() => {
        syncToDisplay();
    }, [
        isAlertActive, alertText, alertBgColor, alertTextColor, alertFontSize, 
        isTimerRunning, timerText, timerMinutes, churchLogoUrl, 
        bgType, bgUrl, bgColor, textColor, textShadow,
        selectedPlaylist, liveSongIndex, liveSlideIndex, activeSongIndex
        // liveSlides intentionally excluded — tracked via liveSlidesRef to avoid loop
    ]);

    const formatTime = (seconds) => {
        if (!seconds || isNaN(seconds)) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleVideoAction = (action, time = null) => {
        const payload = {
            type: 'VIDEO_ACTION',
            action,
            time
        };
        
        // Local Broadcast
        if (channel.current) {
            channel.current.postMessage(payload);
        }

        // Remote Broadcast (Supabase Realtime)
        if (remoteChannel.current && isRemoteSubscribed.current) {
            remoteChannel.current.send({
                type: 'broadcast',
                event: 'state_update',
                payload
            }).catch(err => console.warn('Failed to send video action remote:', err));
        }
    };

    const handleLiveSlideChange = useCallback((index, forcedLiveSlides = null, forcedLiveSongIndex = null, extraPayload = {}) => {
        const currentLiveSlides = forcedLiveSlides || liveSlides;
        if (index < -1 || index >= currentLiveSlides.length) return;

        setLiveSlideIndex(index);

        // Track projection activity if starting a new song
        if (index === 0 && selectedPlaylist?.items?.[liveSongIndex]?.song?.id) {
            logActivity('projection', selectedPlaylist.items[liveSongIndex].song.id);
        }

        // If the live song is changing as part of this slide change, we need to temporarily evaluate
        // its background properties while building the sync payload 
        const effectiveLiveSongIndex = forcedLiveSongIndex !== null ? forcedLiveSongIndex : liveSongIndex;

        if (index === -1) {
            syncToDisplay({ type: 'CLEAR_SLIDE', slide: null, ...extraPayload }, true, effectiveLiveSongIndex);
        } else {
            syncToDisplay({
                type: 'SYNC_STATE', // Changed to SYNC_STATE to force full re-evaluation
                slide: currentLiveSlides[index],
                ...extraPayload
            }, true, effectiveLiveSongIndex);
        }
    }, [liveSlides, liveSongIndex, selectedPlaylist, syncToDisplay]);

    const handleStartTimer = useCallback(() => {
        const newEndDate = Date.now() + timerMinutes * 60 * 1000;
        setTimerEndDate(newEndDate);
        setIsTimerRunning(true);
        const effTimerType = selectedSetlist && selectedSetlist.timer_bg_type && selectedSetlist.timer_bg_type !== 'global' ? selectedSetlist.timer_bg_type : selectedPlaylist && selectedPlaylist.timer_bg_type && selectedPlaylist.timer_bg_type !== 'global' ? selectedPlaylist.timer_bg_type : 'global';
        const effTimerUrl = selectedSetlist && selectedSetlist.timer_bg_type && selectedSetlist.timer_bg_type !== 'global' ? selectedSetlist.timer_bg_url : selectedPlaylist && selectedPlaylist.timer_bg_type && selectedPlaylist.timer_bg_type !== 'global' ? selectedPlaylist.timer_bg_url : '';
        const effTimerColor = selectedSetlist && selectedSetlist.timer_bg_type && selectedSetlist.timer_bg_type !== 'global' ? selectedSetlist.timer_bg_color : selectedPlaylist && selectedPlaylist.timer_bg_type && selectedPlaylist.timer_bg_type !== 'global' ? selectedPlaylist.timer_bg_color : '';

        const finalType = effTimerType === 'global' ? timerDefaultBG.type : effTimerType;
        const finalUrl = effTimerType === 'global' ? timerDefaultBG.url : effTimerUrl;
        const finalColor = effTimerType === 'global' ? timerDefaultBG.color : effTimerColor;

        const timerPayload = {
            isTimerRunning: true,
            timerMinutes: timerMinutes,
            timerText: timerText,
            timerEndDate: newEndDate,
            action: 'START_TIMER',
            timerBgType: finalType,
            timerBgUrl: finalUrl,
            timerBgColor: finalColor,
            churchLogoUrl: churchLogoUrl
        };
        handleLiveSlideChange(-1, null, null, timerPayload);
    }, [timerMinutes, timerText, timerDefaultBG, churchLogoUrl, handleLiveSlideChange, selectedSetlist, selectedPlaylist]);

    const handleStopTimer = useCallback(() => {
        setIsTimerRunning(false);
        setTimerEndDate(null);
        const timerPayload = {
            isTimerRunning: false,
            action: 'STOP_TIMER',
            timerMinutes,
            timerText,
            timerEndDate: null,
            timerBgType: timerDefaultBG.type,
            timerBgColor: timerDefaultBG.color,
            churchLogoUrl: churchLogoUrl
        };
        syncToDisplay(timerPayload);
    }, [timerMinutes, timerText, timerDefaultBG, churchLogoUrl, syncToDisplay, selectedSetlist, selectedPlaylist]);

    const handleRemoteCommand = useCallback((action, payload = {}) => {
        // Support both (action, payload) and (payload) signatures
        if (typeof action === 'object' && action.action) {
            payload = action;
            action = payload.action;
        }
        
        switch (action) {
            case 'NEXT_SLIDE':
                setLiveSlideIndex(prev => {
                    const max = liveSlidesRef.current?.length || 0;
                    if (prev + 1 < max) return prev + 1;
                    return prev;
                });
                break;
            case 'PREV_SLIDE':
                setLiveSlideIndex(prev => {
                    if (prev > 0) return prev - 1;
                    return prev;
                });
                break;
            case 'SELECT_PLAYLIST_ITEM': {
                const itemIndex = payload.index;
                if (selectedPlaylist?.items?.[itemIndex]) {
                    const song = selectedPlaylist.items[itemIndex].song;
                    
                    let parsedSlides = [];
                    if (song.isMediaBlock) {
                        parsedSlides = (song.media_content || []).map((m, i) => ({ id: `media_${i}`, type: m.type || 'Mídia', url: m.url, isEmptySlot: !m.url }));
                        if (parsedSlides.length === 0) parsedSlides.push({ id: 'media_empty_start', isEmptySlot: true });
                    } else {
                        parsedSlides = extractSlides(song);
                    }
                    
                    // ONLY update preview state, NOT live state
                    setActiveSongIndex(itemIndex);
                    setSlides(parsedSlides);

                    // Note: syncToDisplay will be triggered by setActiveSongIndex change in useEffect
                }
                break;
            }
            case 'SELECT_SLIDE': {
                const targetSlideIndex = payload.index;
                const targetSongIndex = payload.songIndex !== undefined ? payload.songIndex : activeSongIndex;

                // Check if we need to switch the "Live" song
                if (targetSongIndex !== liveSongIndex) {
                    const song = selectedPlaylist?.items?.[targetSongIndex]?.song;
                    if (song) {
                        let targetSlides = [];
                        if (song.isMediaBlock) {
                            targetSlides = (song.media_content || []).map((m, i) => ({ id: `media_${i}`, type: m.type || 'Mídia', url: m.url, isEmptySlot: !m.url }));
                        } else {
                            targetSlides = extractSlides(song);
                        }
                        setLiveSlides(targetSlides);
                        setLiveSongIndex(targetSongIndex);
                        setLiveSlideIndex(targetSlideIndex);
                    }
                } else {
                    setLiveSlideIndex(targetSlideIndex);
                }
                break;
            }
            case 'CLEAR_SLIDE':
                handleLiveSlideChange(-1);
                break;
            case 'SHOW_LOGO':
                handleLiveSlideChange(-1);
                break;
            case 'PLAY_MEDIA':
                channel.current.postMessage({ type: 'MEDIA_COMMAND', action: 'play' });
                channel.current.postMessage({ type: 'VIDEO_ACTION', action: 'PLAY' }); // Added redundancy
                break;
            case 'PAUSE_MEDIA':
                channel.current.postMessage({ type: 'MEDIA_COMMAND', action: 'pause' });
                channel.current.postMessage({ type: 'VIDEO_ACTION', action: 'PAUSE' }); // Added redundancy
                break;
            case 'SHOW_BIBLE':
                setIsBibleModalOpen(true);
                break;
            case 'PROJECT_VERSE':
                handleProjectVerse(payload.verse);
                break;
            case 'ACTIVATE_ALERT':
                setIsAlertActive(prev => !prev);
                break;
            case 'TOGGLE_TIMER':
                if (isTimerRunning) {
                    handleStopTimer();
                } else {
                    handleStartTimer();
                }
                break;
            case 'REQUEST_SYNC':
                syncToDisplay();
                break;
            default:
        }
    }, [liveSlideIndex, liveSlides, isTimerRunning, handleLiveSlideChange, handleStopTimer, handleStartTimer, selectedPlaylist, handleProjectVerse, syncToDisplay]);

    // Ref to handle remote commands without stale closures - Defined AFTER handler to avoid initialization error
    const remoteHandlerRef = useRef(null);
    useEffect(() => {
        remoteHandlerRef.current = handleRemoteCommand;
    }, [handleRemoteCommand]);

    // Live Session Channel (Supabase Realtime)
    useEffect(() => {
        if (!user?.id) return;

        const remote = supabase.channel(`projector_remote_${user.id}`, {
            config: {
                broadcast: { ack: true }
            }
        });

        remote.on('broadcast', { event: 'remote_command' }, ({ payload }) => {
            if (remoteHandlerRef.current) {
                // Extract action and pass the full payload as data
                remoteHandlerRef.current(payload.action, payload);
            }
        });

        remote.subscribe((status) => {
            console.log('Supabase Realtime subscription status:', status);
            if (status === 'SUBSCRIBED') {
                isRemoteSubscribed.current = true;
                // Proactively send state to any waiting remote devices
                setTimeout(() => {
                    if (isRemoteSubscribed.current) syncToDisplay();
                }, 500);
            } else {
                isRemoteSubscribed.current = false;
            }
        });
        remoteChannel.current = remote;

        return () => {
            isRemoteSubscribed.current = false;
            supabase.removeChannel(remote);
        };
    }, [user?.id]); // Stabilized: only depend on user.id

    // Load user playlists or single song
    useEffect(() => {
        async function fetchData() {
            setLoading(true);

            // Always fetch playlists for the sidebar
            const data = await getMyPlaylists();
            setPlaylists(data);

            let currentGlobalDefaults = { type: 'color', url: '', color: '#000000' };

            // Load user projection defaults and apply as baseline
            try {
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (authUser) {
                    const { data: prefData } = await supabase
                        .from('user_preferences')
                        .select('proj_default_bg_color, proj_default_bg_type, proj_default_bg_url, proj_default_text_color, proj_default_text_shadow, proj_default_font_size, bible_default_bg_color, bible_default_bg_type, bible_default_bg_url, timer_default_bg_color, timer_default_bg_type, timer_default_bg_url, church_logo_url, alert_default_bg_color, alert_default_text_color, alert_default_font_size')
                        .eq('user_id', authUser.id)
                        .maybeSingle();

                    if (prefData) {
                        const pBgType = prefData.proj_default_bg_type || 'color';
                        const pBgUrl = prefData.proj_default_bg_url || '';
                        const pBgColor = prefData.proj_default_bg_color || '#000000';
                        currentGlobalDefaults = { type: pBgType, url: pBgUrl, color: pBgColor };
                        setGlobalDefaults(currentGlobalDefaults);
                        
                        setBgType(pBgType);
                        setBgUrl(pBgUrl);
                        setBgColor(pBgColor);
                        
                        setTextColor(prefData.proj_default_text_color || '#FFFFFF');
                        setTextShadow(prefData.proj_default_text_shadow !== false);
                        setLocalFontSize(prefData.proj_default_font_size || 100);

                        // Bible specific defaults
                        setBibleBGPrefs({
                            type: prefData.bible_default_bg_type || 'color',
                            url: prefData.bible_default_bg_url || '',
                            color: prefData.bible_default_bg_color || '#000000'
                        });

                        // Timer specific defaults
                        setTimerDefaultBG({
                            type: prefData.timer_default_bg_type || 'color',
                            url: prefData.timer_default_bg_url || '',
                            color: prefData.timer_default_bg_color || '#000000'
                        });

                        // Church Logo
                        setChurchLogoUrl(prefData.church_logo_url || '');

                        // Alert Defaults
                        setAlertBgColor(prefData.alert_default_bg_color || '#000000');
                        setAlertTextColor(prefData.alert_default_text_color || '#FFFFFF');
                        setAlertFontSize(prefData.alert_default_font_size || 100);
                    }
                }
            } catch (e) {
                console.warn('Could not load user projection defaults:', e);
            }

            // If there's a songId param, we load a "Virtual Playlist" for just that song
            if (songIdParam) {
                try {
                    const song = await getSongById(songIdParam);
                    if (song) {
                        const virtualPlaylist = {
                            id: 'single_song_mode',
                            name: `Projeção: ${song.title}`,
                            items: [{
                                id: 'item_0',
                                position: 0,
                                song: song
                            }]
                        };
                        setSelectedPlaylist(virtualPlaylist);
                        if (virtualPlaylist.items.length > 0) {
                            parseSlidesForSong(virtualPlaylist.items[0].song, true, 0);
                        }
                    }
                } catch (error) {
                    console.error("Failed to load song for projection", error);
                }
            } else if (playlistIdParam && setlistIdParam) {
                try {
                    const fetchedSetlists = await getSetlists(playlistIdParam);
                    const targetSetlist = fetchedSetlists.find(s => s.id === setlistIdParam);
                    const targetPlaylist = data.find(p => p.id === playlistIdParam);

                    if (targetSetlist && targetPlaylist) {
                        setSelectedPlaylist({
                            ...targetPlaylist,
                            name: `${targetPlaylist.name} - ${targetSetlist.name}`,
                            items: targetSetlist.items || []
                        });
                        setSelectedSetlist(targetSetlist);
                        
                        // Smart fallback for initial load: Only override if setlist has a non-default background
                        const hasExplicitBG = targetSetlist.proj_bg_type && targetSetlist.proj_bg_type !== 'global' &&
                                           (targetSetlist.proj_bg_type !== 'color' || (targetSetlist.proj_bg_color && targetSetlist.proj_bg_color !== '#000000') || targetSetlist.proj_bg_url);

                        if (hasExplicitBG) {
                            setBgType(targetSetlist.proj_bg_type);
                            setBgUrl(targetSetlist.proj_bg_url || '');
                            setBgColor(targetSetlist.proj_bg_color || '#000000');
                        } else {
                            // Reset to global defaults if setlist has no custom background
                            setBgType(currentGlobalDefaults.type);
                            setBgUrl(currentGlobalDefaults.url || '');
                            setBgColor(currentGlobalDefaults.color || '#000000');
                        }

                        if (targetSetlist.items?.length > 0) {
                            parseSlidesForSong(targetSetlist.items[0].song, true, 0);
                        }
                    }
                } catch (e) {
                    console.error("Failed to load setlist for projection", e);
                }
            }

            setLoading(false);
            
            // Critical: Sync to mobile immediately after loading finishes
            setTimeout(() => {
                console.log('Auto-syncing after initial load');
                syncToDisplay();
            }, 1000);
        }
        fetchData();
    }, [songIdParam, playlistIdParam, setlistIdParam]);

    // Open Modal to see Setlists
    const handleOpenSetlistModal = async (e, playlist) => {
        e.stopPropagation(); // prevent playlist selection
        setModalPlaylist(playlist);
        setIsSetlistModalOpen(true);
        setShowPastSetlists(false); // Default hide past lists

        // Fetch setlists if not cached
        if (!playlistSetlists[playlist.id]) {
            setLoadingSetlists(true);
            const fetchedSetlists = await getSetlists(playlist.id);
            setPlaylistSetlists(prev => ({ ...prev, [playlist.id]: fetchedSetlists }));
            setLoadingSetlists(false);
        }
    };

    // Select the Full Playlist completely
    const handleSelectFullPlaylist = async (playlistId) => {
        setLoading(true);
        const fullPlaylist = await getPlaylistWithItems(playlistId);
        setSelectedPlaylist(fullPlaylist);
        setSelectedSetlist(null);
        setActiveSongIndex(0);
        setLiveSongIndex(0);
        setLiveSlideIndex(-1);

        // Parse slides for the first song
        if (fullPlaylist?.items?.length > 0) {
            parseSlidesForSong(fullPlaylist.items[0].song, true, 0);
        }

        // Reset to global background defaults
        setBgType(globalDefaults.type);
        setBgUrl(globalDefaults.url || '');
        setBgColor(globalDefaults.color || '#000000');

        setLoading(false);
    };

    // Select a specific Setlist
    const handleSelectSetlist = (setlist, playlist) => {
        // We wrap the setlist to look act like a playlist data so the UI continues working
        setSelectedPlaylist({
            ...playlist,
            name: `${playlist.name} - ${setlist.name}`,
            items: setlist.items || []
        });
        setSelectedSetlist(setlist);
        setActiveSongIndex(0);
        setLiveSongIndex(0);
        setLiveSlideIndex(-1);

        // Smart fallback logic: Only override global defaults if the setlist has an explicit non-default background
        const hasExplicitBG = setlist.proj_bg_type && 
                           (setlist.proj_bg_type !== 'color' || (setlist.proj_bg_color && setlist.proj_bg_color !== '#000000') || setlist.proj_bg_url);

        if (hasExplicitBG) {
            setBgType(setlist.proj_bg_type);
            setBgUrl(setlist.proj_bg_url || '');
            setBgColor(setlist.proj_bg_color || '#000000');
        } else {
            // Fallback to global user preferences
            setBgType(globalDefaults.type);
            setBgUrl(globalDefaults.url);
            setBgColor(globalDefaults.color);
        }

        if (setlist.items?.length > 0) {
            parseSlidesForSong(setlist.items[0].song, true, 0);
        }
    };

    // Update Global Background and Save to Setlist
    const handleUpdateGlobalBackground = async (type, url, color = '#000000') => {
        // If we have an active song selected, we should probably update THAT song's appearance
        // instead of the whole setlist/global setting, to meet user's "individual" expectation.
        if (currentSong && !currentSong.isMediaBlock) {
            handleUpdateActiveSongAppearance({ projBgType: type, projBgUrl: url, projBgColor: color });
            return;
        }

        setBgType(type);
        setBgUrl(url);
        setBgColor(color);

        if (selectedSetlist) {
            const updated = { ...selectedSetlist, proj_bg_type: type, proj_bg_url: url, proj_bg_color: color };
            setSelectedSetlist(updated);

            setPlaylistSetlists(prev => {
                const list = (prev[selectedSetlist.playlist_id] || []).map(s =>
                    s.id === selectedSetlist.id ? updated : s
                );
                return { ...prev, [selectedSetlist.playlist_id]: list };
            });            try {
                await updateSetlistSettings(selectedSetlist.id, {
                    proj_bg_type: type,
                    proj_bg_url: url,
                    proj_bg_color: color
                });
            } catch (err) {
                console.error("Failed to persist setlist background", err);
            }
        } else {
            // Update global preferences in database
            setGlobalDefaults({ type, url, color });
            try {
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (authUser) {
                    await supabase
                        .from('user_preferences')
                        .upsert({
                            user_id: authUser.id,
                            proj_default_bg_type: type,
                            proj_default_bg_url: url,
                            proj_default_bg_color: color,
                            updated_at: new Date()
                        });
                }
            } catch (err) {
                console.error("Failed to persist global background pref", err);
            }
        }
    };

    // Parse song into slides
    const parseSlidesForSong = (song, forceLive = false, targetPreviewIndex = activeSongIndex) => {
        if (!song) {
            setSlides([]);
            if (forceLive || targetPreviewIndex === liveSongIndex) setLiveSlides([]);
            return;
        }

        let parsedSlides = [];
        // If it's a fake Media Block
        if (song.isMediaBlock) {
            let mediaSlides = (song.media_content || []).map((m, i) => ({
                id: `media_${i}`,
                type: m.type || 'Mídia',
                url: m.url,
                isEmptySlot: !m.url
            }));

            if (mediaSlides.length === 0) {
                mediaSlides.push({ id: 'media_empty_start', isEmptySlot: true });
            }

            parsedSlides = mediaSlides;
        } else if (song.content || song.projectionContent) {
            // Past the whole song object so it can prioritize `projectionContent`
            parsedSlides = extractSlides(song);
        }

        setSlides(parsedSlides);

        // Update live slides if editing the current live song or if forced
        if (forceLive || targetPreviewIndex === liveSongIndex) {
            setLiveSlides(parsedSlides);
        }
    };

    // Handle Saving from Editor Modal
    const handleSaveProjection = (updatedSong, editedIndex = activeSongIndex) => {
        // 1. Update only the specific item that was edited in local state
        const newItems = [...selectedPlaylist.items];
        if (newItems[editedIndex]) {
            newItems[editedIndex] = { ...newItems[editedIndex], song: updatedSong };
        }
        setSelectedPlaylist({ ...selectedPlaylist, items: newItems });

        // 2. Compute new slides immediately (synchronous) from the updated song
        const freshSlides = extractSlides(updatedSong);

        // 3. Update slide display state for the control panel
        const isEditingActiveSong = activeSongIndex === editedIndex;
        const isEditingLiveSong  = liveSongIndex === editedIndex;

        if (isEditingActiveSong) {
            setSlides(freshSlides);
        }

        // 4. If the edited song is the currently LIVE song, push updated slides
        //    directly to the BroadcastChannel NOW — before React re-renders.
        //    This avoids the stale-closure problem where syncToDisplay() would
        //    still carry the OLD liveSlides from its memoized capture.
        if (isEditingLiveSong) {
            setLiveSlides(freshSlides);

            // Build a fresh sync payload with the new slides embedded directly
            const freshAllSlides = freshSlides.map(s => ({
                text: s.text || s.lines?.join('\n') || '',
                type: s.type || 'Slide'
            }));

            // The current live slide object — re-computed from fresh slides
            const freshCurrentSlide = liveSlideIndex >= 0 ? freshSlides[liveSlideIndex] : null;

            // Determine song background settings
            let activeProjBgType = bgType;
            let activeProjBgUrl  = bgUrl;
            let activeProjBgColor = bgColor;
            let activeProjFontSize = updatedSong.projFontSize || 100;

            if (updatedSong.projBgType && updatedSong.projBgType !== 'global') {
                activeProjBgType  = updatedSong.projBgType;
                activeProjBgUrl   = updatedSong.projBgUrl || '';
                activeProjBgColor = updatedSong.projBgColor || '#000000';
            }

            const freshPayload = {
                type: 'SYNC_STATE',
                songId: updatedSong.id,
                slide: freshCurrentSlide,
                bgType: activeProjBgType,
                bgUrl: activeProjBgUrl,
                bgColor: activeProjBgColor,
                projFontSize: activeProjFontSize,
                textColor,
                textShadow,
                timerMinutes,
                timerText,
                isTimerRunning,
                timerEndDate,
                churchLogoUrl,
                isAlertActive,
                alertText,
                alertBgColor,
                alertTextColor,
                alertFontSize,
                liveSongIndex,
                liveSlideIndex,
                activeSongIndex,
                isPreview: false,
                songTitle: updatedSong.title || 'LouvorPlay',
                allSlides: freshAllSlides,
                playlistItems: newItems.map(item => ({
                    id: item.id,
                    song: {
                        id: item.song?.id,
                        title: item.song?.title,
                        artist: item.song?.artist,
                        isMediaBlock: item.song?.isMediaBlock
                    }
                }))
            };

            // Post directly to BroadcastChannel — bypasses stale closure
            try {
                if (channel.current) channel.current.postMessage(freshPayload);
            } catch (e) {
                console.warn('[handleSaveProjection] BroadcastChannel error:', e);
            }

            // Also persist to localStorage so ProjectorPage hydrates on reload
            localStorage.setItem('projector_current_state', JSON.stringify({
                ...freshPayload,
                timestamp: Date.now()
            }));
        }

        // 5. Also update selectedSetlist cache if we're in setlist mode
        if (selectedSetlist) {
            setSelectedSetlist({ ...selectedSetlist, items: newItems });
            setPlaylistSetlists(prev => {
                const updatedList = (prev[selectedSetlist.playlist_id] || []).map(s =>
                    s.id === selectedSetlist.id ? { ...s, items: newItems } : s
                );
                return { ...prev, [selectedSetlist.playlist_id]: updatedList };
            });
        }
    };

    // Update local and DB active song appearance settings quickly
    const handleUpdateTimerAppearance = async (updates) => {
        if (selectedSetlist) {
            const updatedSetlist = { ...selectedSetlist, ...updates };
            setSelectedSetlist(updatedSetlist);
            
            // Update local cache
            setPlaylistSetlists(prev => {
                const list = (prev[selectedSetlist.playlist_id] || []).map(s =>
                    s.id === selectedSetlist.id ? updatedSetlist : s
                );
                return { ...prev, [selectedSetlist.playlist_id]: list };
            });

            try {
                await updateSetlistSettings(selectedSetlist.id, updatedSetlist);
            } catch (err) {
                console.error("Failed to update setlist timer settings", err);
            }
        } else if (selectedPlaylist && selectedPlaylist.id) {
            const updatedPlaylist = { ...selectedPlaylist, ...updates };
            setSelectedPlaylist(updatedPlaylist);
            try {
                await updatePlaylistSettings(selectedPlaylist.id, updatedPlaylist);
            } catch (err) {
                console.error("Failed to update playlist timer settings", err);
            }
        }
    };

    const handleUpdateActiveSongAppearance = async (updates) => {
        if (!currentSong || currentSong.isMediaBlock) return;

        let updatedSong = { ...currentSong, ...updates };

        // Auto-clear bgUrl if switching to global
        if (updates.projBgType === 'global') {
            updatedSong.projBgUrl = '';
            setMediaModalTargetIndex(null);
        }

        // Update local list
        const newItems = selectedPlaylist.items.map((item, idx) => {
            if (idx === activeSongIndex) {
                return { ...item, song: updatedSong };
            }
            return item;
        });

        setSelectedPlaylist({ ...selectedPlaylist, items: newItems });

        if (activeSongIndex === liveSongIndex) {
            // Need to sync actively to screen
            const payload = {};
            if (updates.projFontSize !== undefined) payload.projFontSize = updates.projFontSize;
            if (updates.projBgType !== undefined) payload.bgType = updatedSong.projBgType;
            if (updates.projBgUrl !== undefined) payload.bgUrl = updatedSong.projBgUrl;

            // if we just switched to global, tell display to use global vars natively
            if (updates.projBgType === 'global') {
                payload.bgType = bgType; // global bgType
                payload.bgUrl = bgUrl;   // global bgUrl
            }

            if (Object.keys(payload).length > 0) {
                syncToDisplay(payload);
            }
        }

        // Keep selectedSetlist in sync
        if (selectedSetlist) {
            setSelectedSetlist({ ...selectedSetlist, items: newItems });
            setPlaylistSetlists(prev => {
                const updatedList = (prev[selectedSetlist.playlist_id] || []).map(s =>
                    s.id === selectedSetlist.id ? { ...s, items: newItems } : s
                );
                return { ...prev, [selectedSetlist.playlist_id]: updatedList };
            });
        }

        // Save to DB
        try {
            const currentItem = selectedPlaylist.items[activeSongIndex];
            await saveSongProjectionSettings(updatedSong.id, {
                projectionContent: updatedSong.projectionContent,
                projBgType: updatedSong.projBgType || 'global',
                projBgUrl: updatedSong.projBgUrl || '',
                projBgColor: updatedSong.projBgColor || '#000000',
                projFontSize: updatedSong.projFontSize || 100
            }, currentItem?.id, selectedSetlist ? 'setlist_items' : 'playlist_items');
        } catch (e) {
            console.error("Failed to save quick appearance settings", e);
        }
    };

    const handleAddMediaBlock = async () => {
        const customTitle = window.prompt("Digite o nome deste bloco de mídia (ex: Avisos, Ofertas...)", "Conteúdo / Mídia");
        if (!customTitle) return; // User cancelled

        const uuid1 = crypto.randomUUID();
        const fakeSong = {
            id: `media_block_${uuid1}`,
            title: customTitle,
            artist: 'Avisos, Ofertas, Interações',
            isMediaBlock: true,
            media_content: []
        };

        const newItem = {
            id: `temp_${crypto.randomUUID()}`,
            song: fakeSong,
            usage: 'media_block',
            position: selectedPlaylist.items.length
        };

        const newItems = [...selectedPlaylist.items, newItem];
        setSelectedPlaylist({ ...selectedPlaylist, items: newItems });

        // Auto select the newly added media block
        handleSongChange(newItems.length - 1);

        // Auto-save if it's a setlist
        if (selectedSetlist) {
            try {

                const updatedSetlist = {
                    ...selectedSetlist,
                    items: newItems.map((i, idx) => ({
                        songId: i.song?.isMediaBlock ? null : i.song?.id,
                        position: idx,
                        usage_type: i.usage_type || i.usage || 'song',
                        media_content: i.song?.media_content || null
                    }))
                };

                await updateSetlist(selectedSetlist.id, updatedSetlist);

                // Keep local cache fresh
                setSelectedSetlist({ ...selectedSetlist, items: newItems });
                setPlaylistSetlists(prev => {
                    const list = (prev[selectedSetlist.playlist_id] || []).map(s =>
                        s.id === selectedSetlist.id ? { ...s, items: newItems } : s
                    );
                    return { ...prev, [selectedSetlist.playlist_id]: list };
                });
            } catch (error) {
                console.error("Falha ao salvar bloco de mídia:", error);
                alert("O bloco foi adicionado visualmente, mas houve um erro ao salvá-lo no banco.");
            }
        }
    };

    const handleDeleteMediaBlock = async (indexToDelete) => {
        if (!window.confirm("Certeza que deseja remover este bloco da setlist?")) return;

        const newItems = selectedPlaylist.items.filter((_, idx) => idx !== indexToDelete);
        setSelectedPlaylist({ ...selectedPlaylist, items: newItems });

        if (activeSongIndex === indexToDelete) {
            handleSongChange(-1);
        } else if (activeSongIndex > indexToDelete) {
            setActiveSongIndex(activeSongIndex - 1);
        }

        // Auto-save if it's a setlist
        if (selectedSetlist) {
            try {
                const updatedSetlist = {
                    ...selectedSetlist,
                    items: newItems.map((i, idx) => ({
                        songId: i.song?.isMediaBlock ? null : i.song?.id,
                        position: idx,
                        usage_type: i.usage_type || i.usage || 'song',
                        media_content: i.song?.media_content || null
                    }))
                };

                await updateSetlist(selectedSetlist.id, updatedSetlist);

                // Keep local cache fresh
                setSelectedSetlist({ ...selectedSetlist, items: newItems });
                setPlaylistSetlists(prev => {
                    const list = (prev[selectedSetlist.playlist_id] || []).map(s =>
                        s.id === selectedSetlist.id ? { ...s, items: newItems } : s
                    );
                    return { ...prev, [selectedSetlist.playlist_id]: list };
                });
            } catch (error) {
                console.error("Falha ao remover bloco de mídia:", error);
                alert("O bloco foi removido visualmente, mas houve um erro ao salvá-lo.");
            }
        }
    };


    const handleSlideClick = (index) => {
        setLiveSongIndex(activeSongIndex);
        setLiveSlides(slides);
        handleLiveSlideChange(index, slides, activeSongIndex);
    };

    const handleBlankSlideClick = () => {
        setLiveSongIndex(activeSongIndex);
        setLiveSlides(slides);
        handleLiveSlideChange(-1, slides, activeSongIndex);
    };


    const handleUpdateMediaSlide = async (index, type, url) => {
        if (!currentSong?.isMediaBlock) return;

        const currentItems = [...selectedPlaylist.items];
        const activeItem = currentItems[activeSongIndex];

        let newMediaContent = [...(activeItem.song.media_content || [])];
        newMediaContent[index] = { type, url };

        // Save locally
        activeItem.song.media_content = newMediaContent;
        setSelectedPlaylist({ ...selectedPlaylist, items: currentItems });
        parseSlidesForSong(activeItem.song);

        // Auto-save DB
        if (selectedSetlist) {
            try {
                const updatedSetlist = {
                    ...selectedSetlist,
                    items: currentItems.map((i, idx) => ({
                        songId: i.song?.isMediaBlock ? null : i.song?.id,
                        position: idx,
                        usage_type: i.usage_type || i.usage || 'song',
                        media_content: i.song?.media_content || null
                    }))
                };
                await updateSetlist(selectedSetlist.id, updatedSetlist);

                // Keep local cache fresh
                setSelectedSetlist({ ...selectedSetlist, items: currentItems });
                setPlaylistSetlists(prev => {
                    const list = (prev[selectedSetlist.playlist_id] || []).map(s =>
                        s.id === selectedSetlist.id ? { ...s, items: currentItems } : s
                    );
                    return { ...prev, [selectedSetlist.playlist_id]: list };
                });
            } catch (error) {
                console.error("Falha ao atualizar slide de mídia:", error);
            }
        }
    };

    const handleAddEmptyMediaSlide = () => {
        if (!currentSong?.isMediaBlock) return;
        const currentItems = [...selectedPlaylist.items];
        const activeItem = currentItems[activeSongIndex];

        let newMediaContent = [...(activeItem.song.media_content || [])];
        newMediaContent.push({ type: null, url: null });

        activeItem.song.media_content = newMediaContent;
        setSelectedPlaylist({ ...selectedPlaylist, items: currentItems });
        parseSlidesForSong(activeItem.song);
    };

    const handleDeleteMediaSlide = async (e, indexToRemove) => {
        e.stopPropagation();
        if (!currentSong?.isMediaBlock) return;

        const currentItems = [...selectedPlaylist.items];
        const activeItem = currentItems[activeSongIndex];

        let newMediaContent = [...(activeItem.song.media_content || [])];
        newMediaContent = newMediaContent.filter((_, idx) => idx !== indexToRemove);

        activeItem.song.media_content = newMediaContent;
        setSelectedPlaylist({ ...selectedPlaylist, items: currentItems });
        parseSlidesForSong(activeItem.song);

        // Auto-save DB
        if (selectedSetlist) {
            const updatedSetlist = {
                ...selectedSetlist,
                items: currentItems.map((i, idx) => ({
                    songId: i.song?.isMediaBlock ? null : i.song?.id,
                    position: idx,
                    usage_type: i.usage_type || i.usage || 'song',
                    media_content: i.song?.media_content || null
                }))
            };

            updateSetlist(selectedSetlist.id, updatedSetlist).then(() => {
                // Keep local cache fresh
                setSelectedSetlist({ ...selectedSetlist, items: currentItems });
                setPlaylistSetlists(prev => {
                    const list = (prev[selectedSetlist.playlist_id] || []).map(s =>
                        s.id === selectedSetlist.id ? { ...s, items: currentItems } : s
                    );
                    return { ...prev, [selectedSetlist.playlist_id]: list };
                });
            }).catch(console.error);
        }
    };

    // Sync to Display Window

    // Update Media when it changes globally, BUT ONLY IF we are not currently showing a song with a specific override
    // Otherwise, we log it but don't force it to display until they switch to a normal song.
    useEffect(() => {
        let isOverridden = false;
        if (liveSongIndex >= 0 && selectedPlaylist?.items) {
            const liveSong = selectedPlaylist.items[liveSongIndex]?.song;
            if (liveSong && liveSong.projBgType && liveSong.projBgType !== 'global') {
                isOverridden = true;
            }
        }

        if (!isOverridden) {
            syncToDisplay({ bgType, bgUrl, bgColor, textColor, textShadow });
        }
    }, [bgType, bgUrl, bgColor, textColor, textShadow, syncToDisplay, liveSongIndex, selectedPlaylist, selectedSetlist, isTimerRunning, timerEndDate, timerText, timerMinutes, churchLogoUrl, bibleBGPrefs, timerDefaultBG]);

    // Change Preview Song (Does not change live projector!)
    const handleSongChange = useCallback((index) => {
        if (!selectedPlaylist?.items || index < 0 || index >= selectedPlaylist.items.length) return;

        setActiveSongIndex(index);

        const song = selectedPlaylist.items[index]?.song;
        if (song) {
            parseSlidesForSong(song, false, index);
        } else {
            setSlides([]);
        }
    }, [selectedPlaylist, parseSlidesForSong]);

    // Keyboard Navigation (Controls Live Projection)
    useEffect(() => {
        // Automatically reset to global defaults if no playlist is selected (returning to home/list)
        if (!selectedPlaylist && globalDefaults.type) {
            setBgType(globalDefaults.type);
            setBgUrl(globalDefaults.url || '');
            setBgColor(globalDefaults.color || '#000000');
        }

        const handleKeyDown = (e) => {
            if (isBibleModalOpen) return; // Don't conflict with bible navigation
            
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                handleLiveSlideChange(liveSlideIndex + 1);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                handleLiveSlideChange(liveSlideIndex - 1);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [liveSlideIndex, liveSlides, isBibleModalOpen]);

    // Open Display Window
    const openDisplayWindow = () => {
        window.open('/projector-display', 'ProjectorDisplay', 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');
    };

    if (loading && !selectedPlaylist) {
        return <div className="p-8 text-center text-slate-500">Carregando painel de controle...</div>;
    }

    // LIST PLAYLISTS VIEW
    if (!selectedPlaylist) {
        return (
            <div className="max-w-4xl mx-auto p-4 sm:p-6 pb-24">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold dark:text-white flex items-center gap-3">
                            <MonitorUp className="text-purple-500" size={32} />
                            Painel de Projeção
                        </h1>
                        <p className="text-slate-500 mt-2">Selecione uma playlist para projetar as letras no telão.</p>
                    </div>
                    <button
                        onClick={openDisplayWindow}
                        className="bg-slate-900 dark:bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-800 transition"
                    >
                        <MonitorUp size={18} />
                        Abrir Telão
                    </button>
                </div>

                <div className="space-y-8">
                    {/* SECTION: Standard Playlists */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                <ListMusic size={16} />
                                Projetar de uma playlist
                            </h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {playlists.filter(p => !p.type || p.type === 'playlist').map(playlist => (
                                <div key={playlist.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden transition group hover:border-purple-500 flex flex-col">
                                    <div
                                        onClick={() => handleSelectFullPlaylist(playlist.id)}
                                        className="p-6 cursor-pointer flex-1"
                                    >
                                        <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 text-purple-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-600 group-hover:text-white transition">
                                            <ListMusic size={24} />
                                        </div>
                                        <h3 className="text-lg font-bold dark:text-white mb-1 line-clamp-1">{playlist.name}</h3>
                                        {playlist.description ? (
                                            <p className="text-sm text-slate-500 line-clamp-2">{playlist.description}</p>
                                        ) : null}
                                    </div>

                                    <div className="px-6 pb-6 pt-2">
                                        <button
                                            onClick={(e) => handleOpenSetlistModal(e, playlist)}
                                            className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 text-sm font-bold flex items-center gap-1 transition-colors"
                                        >
                                            <Calendar size={16} />
                                            <span>Ver cultos</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {playlists.filter(p => !p.type || p.type === 'playlist').length === 0 && (
                                <div className="col-span-full p-12 text-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                                    <p className="text-slate-500">Nenhuma playlist encontrada.</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* SECTION: Minhas Letras (Lyrics Lists) */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                    <Edit3 size={16} />
                                    Minhas Letras
                                </h2>
                                <p className="text-xs text-slate-500 mt-1">Apenas letras sem cifras</p>
                            </div>
                            <button
                                onClick={async () => {
                                    const name = prompt("Nome da Lista de Projeção:");
                                    if (name) {
                                        try {
                                            const { savePlaylistMetadata, getMyPlaylists } = await import('../utils/storage');
                                            await savePlaylistMetadata({ name, type: 'lyrics_list' });
                                            // Refresh playlists
                                            const data = await getMyPlaylists();
                                            setPlaylists(data);
                                        } catch (e) {
                                            console.error(e);
                                            alert("Erro ao criar lista.");
                                        }
                                    }
                                }}
                                className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-200 transition flex items-center gap-2"
                            >
                                <Plus size={16} />
                                Nova Lista
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {playlists.filter(p => p.type === 'lyrics_list').map(playlist => (
                                <div key={playlist.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden transition group hover:border-blue-500 flex flex-col">
                                    <div
                                        onClick={() => handleSelectFullPlaylist(playlist.id)}
                                        className="p-6 cursor-pointer flex-1"
                                    >
                                        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition">
                                            <FileText size={24} />
                                        </div>
                                        <h3 className="text-lg font-bold dark:text-white mb-1 line-clamp-1">{playlist.name}</h3>
                                        <p className="text-slate-500 text-sm line-clamp-2">{playlist.description || 'Lista de Projeção'}</p>
                                    </div>
                                    <div className="px-6 pb-6 pt-2 flex items-center justify-between">
                                        <button
                                            onClick={(e) => handleOpenSetlistModal(e, playlist)}
                                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-bold flex items-center gap-1 transition-colors"
                                        >
                                            <Calendar size={16} />
                                            <span>Minhas Listas</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {playlists.filter(p => p.type === 'lyrics_list').length === 0 && (
                                <div className="col-span-full py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col items-center justify-center text-slate-400 italic">
                                    <FileText size={48} className="mb-4 opacity-10" />
                                    Nenhuma lista de projeção criada ainda.
                                </div>
                            )}
                        </div>
                    </section>
                </div>


                {/* MODAL SETLISTS */}
                {isSetlistModalOpen && modalPlaylist && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                                    <Calendar className="text-purple-500" size={20} />
                                    Cultos: {modalPlaylist.name}
                                </h3>
                                <button onClick={() => setIsSetlistModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition p-1">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Filtro de Exibição</span>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-600 bg-white dark:bg-slate-900"
                                        checked={showPastSetlists}
                                        onChange={(e) => setShowPastSetlists(e.target.checked)}
                                    />
                                    <span className="text-sm text-slate-600 dark:text-slate-400">Ver cultos passados</span>
                                </label>
                            </div>

                            <div className="p-4 overflow-y-auto max-h-[50vh]">
                                {loadingSetlists ? (
                                    <div className="text-center p-8 text-slate-500">Buscando cultos...</div>
                                ) : (() => {
                                    const allSets = playlistSetlists[modalPlaylist.id] || [];
                                    const now = new Date();
                                    now.setHours(0, 0, 0, 0); // compare just dates
                                    const filteredSets = showPastSetlists
                                        ? allSets
                                        : allSets.filter(s => new Date(s.date) >= now);

                                    if (filteredSets.length === 0) {
                                        return (
                                            <div className="text-center p-8 text-slate-500 italic flex flex-col items-center gap-2">
                                                <Calendar size={32} className="text-slate-300 dark:text-slate-600 mb-2" />
                                                Nenhum culto ativo encontrado.
                                                {!showPastSetlists && allSets.length > 0 && (
                                                    <span className="text-xs mt-2 block">Existem cultos passados. Marque a caixa acima para vê-los.</span>
                                                )}
                                            </div>
                                        );
                                    }

                                    return (
                                        <div className="space-y-2">
                                            {filteredSets.map(setlist => {
                                                const dateStr = setlist.date ? new Date(setlist.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Sem data';
                                                return (
                                                    <button
                                                        key={setlist.id}
                                                        onClick={() => {
                                                            setIsSetlistModalOpen(false);
                                                            handleSelectSetlist(setlist, modalPlaylist);
                                                        }}
                                                        className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-purple-500 dark:hover:border-purple-400 bg-white dark:bg-slate-800 transition flex items-center justify-between group"
                                                    >
                                                        <div>
                                                            <div className="font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition line-clamp-1">{setlist.name}</div>
                                                            <div className="text-xs text-slate-500 mt-1">{setlist.items?.length || 0} músicas</div>
                                                        </div>
                                                        <div className="text-xs font-semibold px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg whitespace-nowrap ml-4 flex-shrink-0">
                                                            {dateStr}
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    const handleDragEnd = async (result) => {
        if (!result.destination) return;
        const sourceIndex = result.source.index;
        const destinationIndex = result.destination.index;
        if (sourceIndex === destinationIndex) return;

        const currentItems = Array.from(selectedPlaylist.items);
        const [movedItem] = currentItems.splice(sourceIndex, 1);
        currentItems.splice(destinationIndex, 0, movedItem);

        // Adjust active index so the currently selected item stays selected
        let newActiveIndex = activeSongIndex;
        if (activeSongIndex === sourceIndex) {
            newActiveIndex = destinationIndex;
        } else if (activeSongIndex > sourceIndex && activeSongIndex <= destinationIndex) {
            newActiveIndex--;
        } else if (activeSongIndex < sourceIndex && activeSongIndex >= destinationIndex) {
            newActiveIndex++;
        }

        // Adjust live index so the currently live item stays live
        let newLiveIndex = liveSongIndex;
        if (liveSongIndex === sourceIndex) {
            newLiveIndex = destinationIndex;
        } else if (liveSongIndex > sourceIndex && liveSongIndex <= destinationIndex) {
            newLiveIndex--;
        } else if (liveSongIndex < sourceIndex && liveSongIndex >= destinationIndex) {
            newLiveIndex++;
        }

        setSelectedPlaylist({ ...selectedPlaylist, items: currentItems });
        setActiveSongIndex(newActiveIndex);
        setLiveSongIndex(newLiveIndex);

        if (selectedSetlist) {
            try {
                const updatedSetlist = {
                    ...selectedSetlist,
                    items: currentItems.map((i, idx) => ({
                        songId: i.song?.isMediaBlock ? null : i.song?.id,
                        position: idx,
                        usage_type: i.usage_type || i.usage || 'song',
                        media_content: i.song?.media_content || null
                    }))
                };

                await updateSetlist(selectedSetlist.id, updatedSetlist);

                // Keep local cache fresh
                setSelectedSetlist({ ...selectedSetlist, items: currentItems });
                setPlaylistSetlists(prev => {
                    const list = (prev[selectedSetlist.playlist_id] || []).map(s =>
                        s.id === selectedSetlist.id ? { ...s, items: currentItems } : s
                    );
                    return { ...prev, [selectedSetlist.playlist_id]: list };
                });
            } catch (error) {
                console.error("Falha ao reordenar blocos:", error);
            }
        }
    };

    // CONTROL PANEL VIEW

    return (
        <div className="flex h-screen bg-slate-100 dark:bg-slate-900 overflow-hidden">
            {/* LEFT SIDEBAR: Playlist Items */}
            <div className="w-80 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col flex-shrink-0">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <button
                        onClick={() => setSelectedPlaylist(null)}
                        className="text-slate-500 hover:text-slate-900 dark:hover:text-white transition flex items-center gap-1 text-sm font-medium"
                    >
                        <ChevronLeft size={16} />
                        Voltar
                    </button>
                    <button
                        onClick={openDisplayWindow}
                        title="Abrir janela do telão"
                        className="text-purple-600 bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg hover:bg-purple-200 transition"
                    >
                        <MonitorUp size={20} />
                    </button>
                    
                    {/* Inline QR Code for Remote Connection - Bigger Zoom Grow to Right */}
                    <div className="flex items-center gap-2 relative">
                        {/* QR Code trigger */}
                        <div className="relative group">
                            <div 
                                onClick={() => setIsQRZoomed(true)}
                                className="bg-white p-1 rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 hover:border-purple-500 transition-all cursor-pointer"
                            >
                                <img 
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(`${window.location.origin}/remote/${user?.id}`)}`}
                                    alt="Remote QR Small"
                                    className="w-8 h-8"
                                />
                            </div>
                            <div className="hidden group-hover:block absolute top-full left-0 mt-2 p-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl text-[10px] text-white font-bold whitespace-nowrap pointer-events-none z-[60]">
                                CLIQUE PARA AMPLIAR
                            </div>
                        </div>

                        {/* FULL SCREEN QR ZOOM OVERLAY */}
                        {isQRZoomed && (
                            <div 
                                className="fixed inset-0 z-[9999] bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in duration-300 pointer-events-auto"
                                onClick={() => setIsQRZoomed(false)}
                            >
                                <div 
                                    className="bg-white p-6 rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,0.5)] relative animate-in zoom-in duration-300 max-w-[90vw] max-h-[90vh] flex items-center justify-center"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <img 
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(`${window.location.origin}/remote/${user?.id}`)}`}
                                        alt="Remote QR Large"
                                        className="w-64 h-64 md:w-[400px] md:h-[400px] object-contain"
                                    />
                                    <button 
                                        onClick={() => setIsQRZoomed(false)}
                                        className="absolute -top-3 -right-3 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow-lg border-4 border-white transition-colors"
                                    >
                                        <X size={24} />
                                    </button>
                                </div>
                                <div className="mt-12 text-center animate-in slide-in-from-bottom-4 duration-500 delay-200">
                                    <h3 className="text-white font-black text-2xl md:text-3xl uppercase tracking-[0.2em] mb-4">
                                        Controle Remoto
                                    </h3>
                                    <p className="text-white/60 text-base md:text-lg max-w-md mx-auto leading-relaxed">
                                        Escaneie o código acima com a câmera do seu celular para controlar os slides de qualquer lugar.
                                    </p>
                                    <button 
                                        onClick={() => setIsQRZoomed(false)}
                                        className="mt-8 px-8 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full transition-all text-sm font-bold uppercase tracking-wider"
                                    >
                                        Fechar Zoom
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Copy Button with its own toast */}
                        <div className="relative">
                            <button
                                onClick={() => {
                                    const url = `${window.location.origin}/remote/${user?.id}`;
                                    navigator.clipboard.writeText(url);
                                    setCopyToast(true);
                                    setTimeout(() => setCopyToast(false), 2000);
                                }}
                                title="Copiar link do controle remoto"
                                className="bg-white dark:bg-slate-700 p-1.5 rounded-lg shadow-md border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 transition"
                            >
                                <Copy size={16} className="text-slate-600 dark:text-slate-300" />
                            </button>
                            {copyToast && (
                                <div className="absolute top-full right-0 mt-2 p-2 bg-green-600 border border-green-500 rounded-lg shadow-xl text-[10px] text-white font-bold whitespace-nowrap z-[60] animate-in fade-in slide-in-from-top-1">
                                    LINK COPIADO!
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <h2 className="font-bold text-lg dark:text-white line-clamp-1">
                        {selectedSetlist ? selectedSetlist.name : selectedPlaylist.name}
                    </h2>
                    <p className="text-xs text-slate-500">
                        {selectedPlaylist.items.length} músicas {selectedSetlist ? '(Culto)' : '(Avulsas)'}
                    </p>
                </div>
                <div className="flex-1 overflow-y-auto pb-[350px]">
                    <DragDropContext onDragEnd={handleDragEnd}>
                        <Droppable droppableId="setlist-items">
                            {(provided) => (
                                <div
                                    {...provided.droppableProps}
                                    ref={provided.innerRef}
                                >
                                    {selectedPlaylist.items.map((item, idx) => {
                                        const isMedia = item.song?.isMediaBlock || item.usage_type === 'media_block';
                                        const isPreview = activeSongIndex === idx;
                                        const isLive = liveSongIndex === idx;

                                        return (
                                            <Draggable
                                                key={item.id || `temp_${idx}`}
                                                draggableId={String(item.id || idx)}
                                                index={idx}
                                                isDragDisabled={!isMedia}
                                            >
                                                {(provided) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        onClick={() => handleSongChange(idx)}
                                                        className={`p-4 border-b border-slate-100 dark:border-slate-700/50 cursor-pointer transition flex items-center gap-3 group relative
                                                        ${isPreview
                                                                ? (isMedia ? 'bg-amber-100 dark:bg-amber-900/40 border-l-4 border-l-amber-500' : 'bg-purple-50 dark:bg-purple-900/20 border-l-4 border-l-purple-600')
                                                                : (isMedia ? 'bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/30 border-l-4 border-l-transparent' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 border-l-4 border-l-transparent')
                                                            }
                                                        ${isLive ? 'ring-2 ring-red-500 shadow-sm z-10' : ''}
                                                        `}
                                                    >
                                                        <div
                                                            {...provided.dragHandleProps}
                                                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                                                            ${isPreview
                                                                    ? (isMedia ? 'bg-amber-500 text-white cursor-grab active:cursor-grabbing' : 'bg-purple-600 text-white')
                                                                    : (isMedia ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 cursor-grab active:cursor-grabbing' : 'bg-slate-200 dark:bg-slate-700 text-slate-500')}
                                                            ${isLive && !isPreview ? 'bg-red-500 text-white' : ''}
                                                        `}>
                                                            {isMedia ? <GripVertical size={14} className="opacity-70" /> : (idx + 1)}
                                                        </div>

                                                        {/* Individual Background Preview Thumbnail */}
                                                        <div className="w-10 h-8 rounded bg-black flex-shrink-0 overflow-hidden border border-slate-200 dark:border-slate-700 relative hidden sm:block">
                                                            {(item.song?.projBgType === 'image' || (item.song?.projBgType === 'global' && bgType === 'image')) && (item.song?.projBgUrl || bgUrl) ? (
                                                                 <img
                                                                    src={item.song?.projBgType === 'image' ? item.song.projBgUrl : bgUrl}
                                                                    className="w-full h-full object-cover"
                                                                    alt=""
                                                                    onError={(e) => {
                                                                        e.target.onerror = null;
                                                                        e.target.src = 'https://placehold.co/100x60/000000/000000?text=';
                                                                    }}
                                                                />
                                                            ) : (item.song?.projBgType === 'video' || (item.song?.projBgType === 'global' && bgType === 'video')) && (item.song?.projBgUrl || bgUrl) ? (
                                                                <div className="w-full h-full bg-slate-900 flex items-center justify-center"><Video size={10} className="text-white opacity-40" /></div>
                                                            ) : (
                                                                <div className="w-full h-full" style={{ backgroundColor: item.song?.projBgType === 'global' ? bgColor : (item.song?.projBgColor || '#000000') }} />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 overflow-hidden">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className={`font-bold text-sm truncate 
                                                                ${isPreview
                                                                        ? (isMedia ? 'text-amber-700 dark:text-amber-400' : 'text-purple-700 dark:text-purple-400')
                                                                        : 'text-slate-900 dark:text-white'}
                                                                ${isLive && !isPreview ? 'text-red-600 dark:text-red-400' : ''}
                                                                `}>
                                                                    {item.song?.title || 'Música desconhecida'}
                                                                </h4>
                                                                {isLive && (
                                                                    <span className="text-[9px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded shadow-sm shrink-0 animate-pulse">
                                                                        Live
                                                                     </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-slate-500 truncate">{item.song?.artist}</p>
                                                        </div>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (item.song?.isMediaBlock) {
                                                                    handleDeleteMediaBlock(idx);
                                                                } else {
                                                                    setEditingSong(item.song);
                                                                    setEditingSongIndex(idx);
                                                                }
                                                            }}
                                                            className={`p-2 transition rounded-lg opacity-0 group-hover:opacity-100 shrink-0
                                                            ${isPreview
                                                                    ? (isMedia ? 'text-amber-600 hover:bg-amber-200 dark:text-amber-400 dark:hover:bg-amber-800' : 'text-purple-600 hover:bg-purple-200 dark:text-purple-400 dark:hover:bg-purple-800')
                                                                    : (isMedia ? 'text-amber-400 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30' : 'text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-200 dark:hover:bg-slate-700')}`
                                                            }
                                                            title={item.song?.isMediaBlock ? "Remover bloco de mídia" : "Editar formato de projeção desta música"}
                                                        >
                                                            {item.song?.isMediaBlock ? <Trash2 size={18} /> : <Edit3 size={18} />}
                                                        </button>
                                                    </div>
                                                )}
                                            </Draggable>
                                        )
                                    })}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext>

                    <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                        <button
                            onClick={handleAddMediaBlock}
                            className="w-full py-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:text-purple-600 hover:border-purple-500 dark:hover:text-purple-400 font-bold transition flex items-center justify-center gap-2 bg-slate-50 dark:bg-slate-800/50 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                        >
                            <ImagePlus size={18} />
                            Adicionar Mídia / Aviso
                        </button>
                        <button
                            onClick={() => setIsBibleModalOpen(true)}
                            className="w-full mt-3 py-3 rounded-xl border border-purple-200 dark:border-purple-900/30 text-purple-600 dark:text-purple-400 font-bold transition flex items-center justify-center gap-2 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40"
                        >
                            <BookOpen size={18} />
                            Pesquisar Bíblia / Versículo
                        </button>
                    </div>
                </div>
            </div>

            {/* MAIN AREA: Slide Grid & Controls */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative pb-[350px] sm:pb-[250px]">
                {/* Top Bar: Song Info & Media Tools */}
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between shadow-sm z-10">
                    <div>
                        <h2 className="text-xl font-bold dark:text-white">{currentSong?.title}</h2>
                        <p className="text-xs text-slate-500">{currentSong?.artist} • Use as SETAS para controlar</p>
                    </div>

                    {/* Media Tools */}
                    <div className="flex items-center gap-4 bg-slate-100 dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700 flex-wrap">
                        {/* Styling Tools */}
                        <div className="flex items-center gap-3 pr-4 border-r border-slate-300 dark:border-slate-700">
                            {/* Bg Color Picker */}
                            <div className="flex items-center gap-1" title="Cor de Fundo (se não houver mídia)">
                                <div className="w-5 h-5 rounded-full overflow-hidden border border-slate-300 relative cursor-pointer">
                                    <input
                                        type="color"
                                        value={bgColor}
                                        onChange={(e) => handleUpdateGlobalBackground('color', '', e.target.value)}
                                        className="absolute -top-2 -left-2 w-10 h-10 cursor-pointer"
                                    />
                                </div>
                            </div>
                            {/* Text Color Picker */}
                            <div className="flex items-center gap-1" title="Cor do Texto">
                                <strong className="text-slate-400 font-serif text-sm">A</strong>
                                <div className="w-5 h-5 rounded-full overflow-hidden border border-slate-300 relative cursor-pointer">
                                    <input
                                        type="color"
                                        value={textColor}
                                        onChange={(e) => setTextColor(e.target.value)}
                                        className="absolute -top-2 -left-2 w-10 h-10 cursor-pointer"
                                    />
                                </div>
                            </div>
                            {/* Text Shadow Toggle */}
                            <button
                                onClick={() => setTextShadow(!textShadow)}
                                className={`px-2 py-1 rounded text-xs font-bold transition border ${textShadow ? 'bg-purple-600 text-white border-purple-600' : 'bg-transparent text-slate-500 border-slate-300 dark:border-slate-600'}`}
                                title="Sombra no Texto"
                            >
                                Sombra
                            </button>
                        </div>

                        {/* Background Media */}
                        <div className="flex items-center gap-2 pr-4 border-r border-slate-300 dark:border-slate-700">
                            <button
                                onClick={() => { setMediaModalTargetIndex(null); setIsImageModalOpen(true); }}
                                className={`p-2 rounded-lg transition ${effectiveBgType === 'image' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' : 'text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                                title="Fundo de Imagem (Global/Song)"
                            >
                                <ImageIcon size={20} />
                            </button>
                            {/* Bg Video Choose */}
                            <button
                                onClick={() => { setMediaModalTargetIndex(null); setIsVideoModalOpen(true); }}
                                className={`p-2 rounded-lg transition border-r border-slate-300 dark:border-slate-700 pr-4 ${effectiveBgType === 'video' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' : 'text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                                title="Fundo de Vídeo (Global/Song)"
                            >
                                <Video size={18} />
                            </button>
                            <button
                                onClick={() => handleUpdateGlobalBackground('color', '', '#000000')}
                                className={`p-2 rounded-lg transition ${effectiveBgType === 'color' && effectiveBgColor === '#000000' && !effectiveBgUrl ? 'bg-black text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                                title="Limpar Mídia (Fundo Preto)"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex items-center gap-3 pl-2 border-l border-slate-300 dark:border-slate-700 ml-2">
                            <Clock size={16} className="text-slate-400 shrink-0" />
                            
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                                <input
                                    type="text"
                                    value={timerText}
                                    onChange={(e) => setTimerText(e.target.value)}
                                    placeholder="Texto (ex: O culto começa em:)"
                                    className="bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs w-40 outline-none focus:ring-1 focus:ring-purple-500"
                                    disabled={isTimerRunning}
                                />
                                <div className="flex items-center gap-1">
                                    <input
                                        type="number"
                                        min="1"
                                        max="120"
                                        value={timerMinutes}
                                        onChange={(e) => setTimerMinutes(Number(e.target.value))}
                                        className="w-12 bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded px-1 py-1 text-sm font-bold text-center outline-none focus:ring-1 focus:ring-purple-500"
                                        disabled={isTimerRunning}
                                    />
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">min</span>
                                </div>
                            </div>
                            
                            <button
                                onClick={isTimerRunning ? handleStopTimer : handleStartTimer}
                                className={`text-xs px-4 py-2 rounded-lg font-bold transition whitespace-nowrap ${isTimerRunning ? 'bg-red-100 text-red-600 hover:bg-red-200 ring-2 ring-red-500/20' : 'bg-green-600 text-white hover:bg-green-700 shadow-sm'}`}
                            >
                                {isTimerRunning ? 'PARAR TIMER' : 'INICIAR TIMER'}
                            </button>

                            {/* Timer Background Options */}
                            <div className="flex items-center gap-1 border-l border-slate-300 dark:border-slate-700 pl-2 ml-1">
                                <button
                                    onClick={() => handleUpdateTimerAppearance({ timer_bg_type: 'global' })}
                                    className={`p-1.5 rounded-md transition ${(!selectedSetlist?.timer_bg_type && !selectedPlaylist?.timer_bg_type) || (selectedSetlist?.timer_bg_type === 'global' || selectedPlaylist?.timer_bg_type === 'global') ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                                    title="Usar Fundo Global"
                                >
                                    <span className="text-[9px] font-bold uppercase tracking-tighter">Global</span>
                                </button>
                                <button
                                    onClick={() => { setMediaModalTargetIndex('timer_bg_image'); setIsImageModalOpen(true); }}
                                    className={`p-1.5 rounded-md transition ${((selectedSetlist && selectedSetlist.timer_bg_type === 'image') || (!selectedSetlist && selectedPlaylist && selectedPlaylist.timer_bg_type === 'image')) ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                                    title="Imagem do Timer"
                                >
                                    <ImageIcon size={14} />
                                </button>
                                <button
                                    onClick={() => { setMediaModalTargetIndex('timer_bg_video'); setIsVideoModalOpen(true); }}
                                    className={`p-1.5 rounded-md transition ${((selectedSetlist && selectedSetlist.timer_bg_type === 'video') || (!selectedSetlist && selectedPlaylist && selectedPlaylist.timer_bg_type === 'video')) ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                                    title="Vídeo do Timer"
                                >
                                    <Video size={14} />
                                </button>
                            </div>

                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-100 dark:bg-slate-900 pb-24">

                    {/* Song Specific Settings Bar */}
                    {currentSong && !currentSong.isMediaBlock && selectedPlaylist?.items?.length > 0 && (
                        <div className="mb-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 overflow-hidden">
                            <div className="flex items-center gap-4 flex-wrap">
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Fundo Desta Música:</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleUpdateActiveSongAppearance({ projBgType: 'global' })}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${currentSong.projBgType === 'global' || !currentSong.projBgType ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 border border-transparent'}`}
                                    >Global</button>
                                    <button
                                        onClick={() => { setMediaModalTargetIndex('song_bg_image'); setIsImageModalOpen(true); }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${currentSong.projBgType === 'image' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 border border-transparent'}`}
                                    ><ImageIcon size={14} /> Imagem</button>
                                    <button
                                        onClick={() => { setMediaModalTargetIndex('song_bg_video'); setIsVideoModalOpen(true); }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${currentSong.projBgType === 'video' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 border border-transparent'}`}
                                    ><Video size={14} /> Vídeo</button>
                                </div>

                                {(currentSong.projBgType === 'image' || currentSong.projBgType === 'video') && currentSong.projBgUrl && (
                                    <div className="h-8 w-14 rounded bg-black overflow-hidden border border-slate-300 dark:border-slate-600 relative shrink-0">
                                        {currentSong.projBgType === 'image' ?
                                            <img 
                                                src={currentSong.projBgUrl} 
                                                className="w-full h-full object-cover" 
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = 'https://placehold.co/100x60/1e293b/ffffff?text=Erro';
                                                }}
                                            /> :
                                            <video 
                                                src={currentSong.projBgUrl} 
                                                className="w-full h-full object-cover" 
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    // Hide or show error icon
                                                    e.target.style.display = 'none';
                                                }}
                                            />
                                        }
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-6 flex-wrap w-full xl:w-auto">
                                {/* Font size */}
                                <div className="flex items-center gap-3 min-w-[200px] flex-1 max-w-xs">
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">Tamanho Letra:</span>
                                    <input
                                        type="range" min="50" max="150" step="5"
                                        value={localFontSize}
                                        onChange={e => setLocalFontSize(parseInt(e.target.value))}
                                        onMouseUp={e => handleUpdateActiveSongAppearance({ projFontSize: parseInt(e.target.value) })}
                                        onTouchEnd={e => handleUpdateActiveSongAppearance({ projFontSize: parseInt(e.target.value) })}
                                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        style={{ accentColor: '#9333ea' }}
                                    />
                                    <span className="text-xs font-bold bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-600 dark:text-slate-300 whitespace-nowrap w-[48px] text-center">{localFontSize}%</span>
                                </div>
                                {/* Slide preview size */}
                                <div className="flex items-center gap-3 min-w-[200px] flex-1 max-w-xs">
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">Tam. Slides:</span>
                                    <input
                                        type="range" min="140" max="360" step="20"
                                        value={slidePreviewSize}
                                        onChange={e => {
                                            const v = parseInt(e.target.value);
                                            setSlidePreviewSize(v);
                                            try { localStorage.setItem('slidePreviewSize', String(v)); } catch (_err) { /* ignore */ }
                                        }}
                                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        style={{ accentColor: '#9333ea' }}
                                    />
                                    <span className="text-xs font-bold bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-600 dark:text-slate-300 whitespace-nowrap w-[48px] text-center">{slidePreviewSize}px</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Blank Slide Button */}
                    <div className="mb-6 flex gap-4">
                        <button
                            onClick={handleBlankSlideClick}
                            className={`flex-1 py-4 px-6 rounded-xl border-2 transition font-bold text-lg
                                ${(liveSlideIndex === -1 && liveSongIndex === activeSongIndex)
                                    ? 'bg-black text-white border-black shadow-lg scale-[1.02]'
                                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                                }
                            `}
                        >
                            Tela Limpa / Logo (Atalho: Seta P/ Cima no inicio)
                        </button>
                    </div>

                    {/* Slides Grid — cards always 16:9, auto-wrap based on slidePreviewSize */}
                    <div
                        className="pb-24"
                        style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(auto-fill, minmax(${slidePreviewSize}px, 1fr))`,
                            gap: '16px'
                        }}
                    >
                        {slides.map((slide, idx) => {
                            const isSongLive = activeSongIndex === liveSongIndex;
                            const isSlideLive = isSongLive && liveSlideIndex === idx;

                            return (
                                <div
                                    key={slide.id}
                                    onClick={(e) => {
                                        // Don't trigger slide change if clicking video controls
                                        if (e.target.closest('.video-controls-container')) return;
                                        handleSlideClick(idx);
                                    }}
                                    className={`relative flex flex-col rounded-xl border-2 cursor-pointer transition-all duration-200 overflow-hidden
                                        ${isSlideLive
                                            ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)] scale-[1.02] bg-white dark:bg-slate-800 ring-2 ring-red-500'
                                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-purple-400 opacity-80 hover:opacity-100'
                                        }
                                    `}
                                    style={{ aspectRatio: '16 / 9' }}
                                >
                                    {/* Slide Header (Tag) */}
                                    <div className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider
                                        ${isSlideLive ? 'bg-red-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}
                                    `}>
                                        {(() => {
                                            if (slide.type === 'Continuation' || slide.type === 'Slide') {
                                                return `SLIDE ${idx + 1}`;
                                            } else if (slide.type) {
                                                return slide.type.toUpperCase();
                                            } else {
                                                return `SLIDE ${idx + 1}`;
                                            }
                                        })()}
                                    </div>

                                    <div className="p-3 flex-1 flex flex-col justify-center items-center overflow-hidden w-full">
                                        {slide.isEmptySlot ? (
                                            <div className="flex flex-col items-center justify-center text-slate-400 gap-3 h-full w-full">
                                                <span className="text-xs font-bold text-center">Adicionar Mídia</span>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setMediaModalTargetIndex(idx); setIsImageModalOpen(true); }}
                                                        className="p-2 hover:bg-purple-100 hover:text-purple-600 dark:hover:bg-purple-900/40 rounded-lg border border-slate-300 dark:border-slate-600 transition"
                                                    >
                                                        <ImageIcon size={18} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setMediaModalTargetIndex(idx); setIsVideoModalOpen(true); }}
                                                        className="p-2 hover:bg-purple-100 hover:text-purple-600 dark:hover:bg-purple-900/40 rounded-lg border border-slate-300 dark:border-slate-600 transition"
                                                    >
                                                        <Video size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            currentSong?.isMediaBlock ? (
                                                <div className="w-full h-full flex flex-col items-center justify-center">
                                                    {slide.type === 'image' && (
                                                        <img 
                                                            src={slide.url} 
                                                            alt="Slide preview" 
                                                            className="max-h-[100px] object-contain rounded-lg shadow-sm mb-2" 
                                                            onError={(e) => {
                                                                e.target.onerror = null;
                                                                e.target.src = 'https://placehold.co/200x120/1e293b/ffffff?text=Arquivo+não+encontrado';
                                                            }}
                                                        />
                                                    )}
                                                    {slide.type === 'video' && (
                                                        <div className="bg-slate-200 dark:bg-slate-800 w-full h-[100px] rounded-lg flex flex-col items-center justify-center mb-2 relative group-controls">
                                                            <Video size={32} className="text-slate-400" />
                                                            
                                                            {/* Video Controls Overlay (Only when LIVE) */}
                                                            {isSlideLive && (
                                                                <div className="absolute inset-0 bg-black/60 flex flex-col justify-end p-2 opacity-100 transition-opacity z-20 video-controls-container">
                                                                    <div className="flex items-center justify-center gap-4 mb-2">
                                                                        <button 
                                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleVideoAction('RESTART'); }}
                                                                            className="p-1.5 bg-white/20 hover:bg-white/40 rounded-full text-white transition pointer-events-auto"
                                                                            title="Reiniciar"
                                                                        >
                                                                            <RotateCcw size={14} />
                                                                        </button>
                                                                        <button 
                                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleVideoAction(videoStatus.paused ? 'PLAY' : 'PAUSE'); }}
                                                                            className="p-2 bg-white text-black rounded-full hover:scale-110 transition pointer-events-auto"
                                                                        >
                                                                            {videoStatus.paused ? <Play size={16} fill="black" /> : <Pause size={16} fill="black" />}
                                                                        </button>
                                                                    </div>
                                                                    
                                                                    {/* Progress Bar */}
                                                                    <div className="w-full flex flex-col gap-1 pointer-events-auto">
                                                                        <input 
                                                                            type="range"
                                                                            min="0"
                                                                            max={videoStatus.duration || 100}
                                                                            value={videoStatus.currentTime || 0}
                                                                            onInput={(e) => { e.stopPropagation(); handleVideoAction('SEEK', parseFloat(e.target.value)); }}
                                                                            onChange={(e) => { e.stopPropagation(); handleVideoAction('SEEK', parseFloat(e.target.value)); }}
                                                                            className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-red-500"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        />
                                                                        <div className="flex justify-between text-[8px] text-white/70 font-mono">
                                                                            <span>{formatTime(videoStatus.currentTime)}</span>
                                                                            <span>{formatTime(videoStatus.duration)}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    {slide.url && (
                                                        <button onClick={(e) => handleDeleteMediaSlide(e, idx)} className="text-red-500 hover:text-red-700 text-xs flex items-center gap-1 font-bold z-10 p-1 bg-white/50 backdrop-blur rounded absolute top-2 right-2">
                                                            <Trash2 size={12} /> Excluir
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                slide.lines?.map((line, lidx) => (
                                                    <p key={lidx} className={`text-sm text-center font-medium ${isSlideLive ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                                                        {line}
                                                    </p>
                                                ))
                                            )
                                        )}
                                    </div>

                                    {/* Active Indicator Overlay */}
                                    {isSlideLive && (
                                        <div className="absolute inset-0 bg-red-500/5 pointer-events-none" />
                                    )}
                                </div>
                            )
                        })}

                        {/* Add More Media Slides Button */}
                        {currentSong?.isMediaBlock && (
                            <button
                                onClick={handleAddEmptyMediaSlide}
                                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 hover:border-purple-400 hover:bg-purple-50 dark:border-slate-700 dark:hover:border-purple-500 dark:hover:bg-purple-900/20 text-slate-400 hover:text-purple-600 cursor-pointer transition"
                                style={{ aspectRatio: '16 / 9' }}
                            >
                                <Plus size={32} className="mb-2" />
                                <span className="font-bold">Novo Slide</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Persistent Alert Message Bar - FULL WIDTH FIXED ABOVE NAVIGATION */}
                <div className="fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] left-0 right-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 p-4 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
                    <div className="w-full flex flex-col md:flex-row items-center gap-4 px-6 text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-3 flex-1 w-full">
                            <div className={`p-2 rounded-xl ${isAlertActive ? 'bg-orange-500 text-white animate-pulse' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
                                <Megaphone size={20} />
                            </div>
                            <div className="flex-1">
                                <div className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest mb-1">Letreiro (Barra Rolante no Telão)</div>
                                <input 
                                    type="text"
                                    placeholder="Digite o alerta aqui... (ex: Proprietário do veículo ABC-123...)"
                                    value={alertText}
                                    onChange={(e) => setAlertText(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-slate-700 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 transition-all font-medium"
                                />
                            </div>
                        </div>


                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <button
                                onClick={() => {
                                    const newActive = !isAlertActive;
                                    setIsAlertActive(newActive);
                                    syncToDisplay({ isAlertActive: newActive, alertText });
                                }}
                                className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2
                                    ${isAlertActive 
                                        ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30' 
                                        : 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/30'
                                    }
                                `}
                            >
                                {isAlertActive ? (
                                    <>
                                        <X size={18} />
                                        DESATIVAR
                                    </>
                                ) : (
                                    <>
                                        <Megaphone size={18} />
                                        ATIVAR ALERTA
                                    </>
                                )}
                            </button>
                            {isAlertActive && (
                                <button 
                                    onClick={() => {
                                        setIsUpdatingAlert(true);
                                        syncToDisplay({ isAlertActive: true, alertText });
                                        setTimeout(() => setIsUpdatingAlert(false), 800);
                                    }}
                                    disabled={isUpdatingAlert}
                                    className={`p-3 rounded-xl font-bold transition-all shadow-lg ${isUpdatingAlert ? 'bg-green-500 text-white shadow-green-500/30' : 'bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/30'}`}
                                    title="Atualizar texto do alerta"
                                >
                                    <RotateCcw size={18} className={isUpdatingAlert ? 'animate-spin' : ''} />
                                </button>
                            )}
                        </div>

                        {/* Real-time Alert Font Size Selector */}
                        <div className="flex items-center gap-3 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 w-full md:w-auto">
                            <span className="text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">Tamanho Fonte</span>
                            <input
                                type="range"
                                min="50"
                                max="250"
                                step="5"
                                value={alertFontSize}
                                onChange={(e) => {
                                    const newSize = parseInt(e.target.value);
                                    setAlertFontSize(newSize);
                                    if (isAlertActive) {
                                        syncToDisplay({ 
                                            alertFontSize: newSize,
                                            alertText,
                                            isAlertActive: true
                                        });
                                    }
                                }}
                                className="w-24 md:w-40 accent-orange-500 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                            />
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 w-12 text-center">{alertFontSize}%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* MODALS */}
            {/* Projection Editor Modal */}
            {editingSong && (
                <ProjectionEditorModal
                    song={editingSong}
                    onClose={() => { setEditingSong(null); setEditingSongIndex(null); }}
                    onSave={(updatedSong) => handleSaveProjection(updatedSong, editingSongIndex)}
                    playlistItemId={selectedPlaylist?.items?.[editingSongIndex]?.id || null}
                    itemTable={selectedSetlist ? 'setlist_items' : 'playlist_items'}
                />
            )}
            {/* Media Modals */}
            <ImageBackgroundModal
                isOpen={isImageModalOpen}
                onClose={() => { setIsImageModalOpen(false); setMediaModalTargetIndex(null); }}
                currentUrl={mediaModalTargetIndex === 'timer_bg_image' ? (selectedSetlist ? selectedSetlist.timer_bg_url : selectedPlaylist?.timer_bg_url) : mediaModalTargetIndex !== null ? (typeof mediaModalTargetIndex === 'string' ? currentSong?.projBgUrl : slides[mediaModalTargetIndex]?.url) : (bgType === 'image' ? bgUrl : '')}
                onSelect={(url) => {
                    if (mediaModalTargetIndex === 'timer_bg_image') {
                        handleUpdateTimerAppearance({ timer_bg_type: 'image', timer_bg_url: url });
                        setIsImageModalOpen(false);
                        setMediaModalTargetIndex(null);
                    } else if (mediaModalTargetIndex === 'song_bg_image') {
                        handleUpdateActiveSongAppearance({ projBgType: 'image', projBgUrl: url });
                        setIsImageModalOpen(false);
                        setMediaModalTargetIndex(null);
                    } else if (mediaModalTargetIndex !== null) {
                        handleUpdateMediaSlide(mediaModalTargetIndex, 'image', url);
                    } else {
                        handleUpdateGlobalBackground('image', url);
                    }
                }}
            />

            <VideoBackgroundModal
                isOpen={isVideoModalOpen}
                onClose={() => { setIsVideoModalOpen(false); setMediaModalTargetIndex(null); }}
                currentUrl={mediaModalTargetIndex === 'timer_bg_video' ? (selectedSetlist ? selectedSetlist.timer_bg_url : selectedPlaylist?.timer_bg_url) : mediaModalTargetIndex !== null ? (typeof mediaModalTargetIndex === 'string' ? currentSong?.projBgUrl : slides[mediaModalTargetIndex]?.url) : (bgType === 'video' ? bgUrl : '')}
                onSelect={(url) => {
                    if (mediaModalTargetIndex === 'timer_bg_video') {
                        handleUpdateTimerAppearance({ timer_bg_type: 'video', timer_bg_url: url });
                        setIsVideoModalOpen(false);
                        setMediaModalTargetIndex(null);
                    } else if (mediaModalTargetIndex === 'song_bg_video') {
                        handleUpdateActiveSongAppearance({ projBgType: 'video', projBgUrl: url });
                        setIsVideoModalOpen(false);
                        setMediaModalTargetIndex(null);
                    } else if (mediaModalTargetIndex !== null) {
                        handleUpdateMediaSlide(mediaModalTargetIndex, 'video', url);
                    } else {
                        handleUpdateGlobalBackground('video', url);
                    }
                }}
            />



            {/* Remote Control Pairing Modal */}
            {isRemoteModalOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-purple-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-purple-500/30">
                                <MonitorUp size={32} className="text-purple-500" />
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">Controle pelo Celular</h2>
                            <p className="text-slate-400 text-sm mb-6">Escaneie o código abaixo para controlar a projeção de qualquer lugar da igreja.</p>
                            <div className="flex flex-col items-center gap-4 mb-6">
                                <div className="bg-white p-4 rounded-2xl inline-block shadow-xl">
                                    <img 
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}/remote/${user?.id}`)}`}
                                        alt="QR Code de Conexão"
                                        className="w-48 h-48"
                                    />
                                </div>
                                <button
                                    onClick={() => {
                                        const url = `${window.location.origin}/remote/${user?.id}`;
                                        navigator.clipboard.writeText(url);
                                        setCopyToast(true);
                                        setTimeout(() => setCopyToast(false), 2000);
                                    }}
                                    className="relative flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 rounded-xl transition text-sm font-medium"
                                >
                                    <Copy size={16} />
                                    Copiar Link de Controle
                                    {copyToast && (
                                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-lg animate-in fade-in slide-in-from-bottom-2 whitespace-nowrap shadow-lg">
                                            Link Copiado!
                                        </div>
                                    )}
                                </button>
                            </div>
                            <div className="space-y-3">
                                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Status da Sessão</div>
                                <div className="flex items-center justify-center gap-2 text-green-400 text-sm font-bold">
                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                    LISTA PARA CONEXÃO
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-4 bg-slate-800/50 flex justify-center">
                            <button 
                                onClick={() => setIsRemoteModalOpen(false)}
                                className="px-8 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bible Verse Modal */}
            {isBibleModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-4xl h-[80vh]">
                        <BibleSearch 
                            onClose={() => setIsBibleModalOpen(false)} 
                            onProjectVerse={handleProjectVerse}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
