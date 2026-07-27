import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { useSearchParams, useOutletContext, useNavigate, useLocation, useParams } from 'react-router-dom';
import {
    Settings2, X, Music, Play, Pause, Minus, Plus, Type, AlignJustify,
    ArrowLeft, ArrowRight, Printer, FileText, ScrollText, Check, Save, Sun, Moon, ArrowDown, Heart, GraduationCap, PlayCircle, Wand2, BadgeCheck, Info, ListPlus
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { useVideoPlayer } from '../contexts/VideoPlayerContext';
import { Portal } from '../components/Portal';

import { getSongById, getSongsByIds, updatePlaylistItemTransposition, updateSetlistItemTransposition, getUserSongPreference, getUserSongPreferenceSync, saveUserSongPreference, incrementSongView, addToHistory, getSongLikeStatus, toggleLike, getUserPreferences, getUserPreferencesSync, updateSongOriginalKey, getSetlistItemTransposition, getSetlistItemTranspositionSync } from '../utils/storage';
import { useLiveSession } from '../contexts/LiveSessionContext';

import { transposeSong, getTransposedNote, detectKeyFromContent } from '../utils/transposition';
import { ChordProRenderer } from '../components/ChordRenderer';
import { PaginatedChordRenderer } from '../components/PaginatedChordRenderer';
import { useData } from '../contexts/DataContext';
import AddToPlaylistModal from '../components/AddToPlaylistModal';

export function PlayerPage() {
    const navigate = useNavigate();
    const { user, isAdmin, isEditor, activeChurch } = useAuth(); // Import useAuth to check login status
    const { showToast } = useNotification();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const { id: paramId } = useParams();
    const songId = paramId || searchParams.get('id') || location.state?.song?.id;

    // Context from Playlist
    // Context from Playlist
    const playlistItemId = location.state?.playlistItemId;
    const playlistId = location.state?.playlistId; // Get playlistId
    const initialTransposition = location.state?.initialTransposition; // undefined if not from specific context

    // Navigation Context (Playlist/Setlist)
    const context = location.state?.context;
    const currentIndex = location.state?.currentIndex ?? -1;
    const nextItem = context && currentIndex >= 0 && currentIndex < context.items.length - 1
        ? context.items[currentIndex + 1]
        : null;
    const previousItem = context && currentIndex > 0 ? context.items[currentIndex - 1] : null;

    const [song, setSong] = useState(location.state?.song || null);
    const [prevSongId, setPrevSongId] = useState(songId);

    // Live Session Hook & Data
    const {
        isLiveEnabled,
        connectToSession,
        disconnectFromSession,
        isLeader,
        onlineUsers,
        claimLeadership,
        broadcastScroll,
        broadcastSongChange,
        remoteScrollPercent,
        remoteSongIndex,
        broadcastPlayState,
        remoteIsPlaying,
        broadcastFullSync,
        broadcastLineFocus
    } = useLiveSession();

    // Auto-connect to live session if param is present
    useEffect(() => {
        if (searchParams.get('autoConnectLive') === 'true' && context && context.type === 'setlist' && !isLiveEnabled) {
            connectToSession(context.id);
            // Remove the param so we don't accidentally reconnect later. But location isn't easily mutable without navigating.
            // A simple boolean ref check ensures we only do it once.
        }
    }, [searchParams, context, isLiveEnabled, connectToSession]);

    // Handle Auto-navigation if a sync event tells us to change song
    useEffect(() => {
        if (isLiveEnabled && !isLeader && remoteSongIndex !== null && context && context.type === 'setlist') {
            if (remoteSongIndex >= 0 && remoteSongIndex < context.items.length && remoteSongIndex !== currentIndex) {
                const targetItem = context.items[remoteSongIndex];
                navigate(`/player/${targetItem.id}`, {
                    state: {
                        song: targetItem,
                        playlistItemId: targetItem.itemId,
                        context,
                        currentIndex: remoteSongIndex,
                        initialTransposition: targetItem.transposition || 0
                    },
                    replace: true
                });
            }
        }
    }, [remoteSongIndex, isLiveEnabled, isLeader, context, currentIndex, navigate]);

    // Notify room when leader changes song naturally
    useEffect(() => {
        if (isLiveEnabled && isLeader && currentIndex !== -1) {
            broadcastSongChange(currentIndex);
        }
    }, [currentIndex, isLiveEnabled, isLeader, broadcastSongChange]);

    // State Declarations
    const [transposition, setTransposition] = useState(initialTransposition !== undefined ? initialTransposition : 0);
    const [savedTransposition, setSavedTransposition] = useState(initialTransposition); // "Meu Tom"
    const [churchTransposition, setChurchTransposition] = useState(0); // "Igreja"
    const [activeTab, setActiveTab] = useState('original'); // 'original', 'church', 'personal'

    // User Defaults
    const [fontSize, setFontSize] = useState(16);
    const [tabFontSize, setTabFontSize] = useState(0); // 0 = Auto calculated
    const [lineSpacing, setLineSpacing] = useState(0.8);
    const [letterSpacing, setLetterSpacing] = useState(0); // Default 0px
    const [menuOpen, setMenuOpen] = useState(true);
    const { theme, toggleTheme } = useOutletContext(); // Get theme context
    const scrollRef = React.useRef(null);
    const [viewMode, setViewMode] = useState(searchParams.get('print') === 'true' ? 'pages' : 'scroll'); // Default based on URL param
    const [scrollSpeed, setScrollSpeed] = useState(5); // Default speed 5

    const [isPlaying, setIsPlaying] = useState(false);

    // Setlist Navigation Modal
    const [showNextSongModal, setShowNextSongModal] = useState(false);
    const [showAddToPlaylistModal, setShowAddToPlaylistModal] = useState(false);
    const showNextSongModalRef = useRef(false);
    useEffect(() => { showNextSongModalRef.current = showNextSongModal; }, [showNextSongModal]);

    const navRefs = useRef({ nextItem, navigate, context, currentIndex });
    useEffect(() => {
        navRefs.current = { nextItem, navigate, context, currentIndex };
    }, [nextItem, navigate, context, currentIndex]);

    // Broadcast isPlaying when changed by leader
    useEffect(() => {
        if (isLiveEnabled && isLeader) {
            broadcastPlayState(isPlaying);
        }
    }, [isPlaying, isLiveEnabled, isLeader, broadcastPlayState]);

    // Receive isPlaying when follower
    useEffect(() => {
        if (isLiveEnabled && !isLeader && remoteIsPlaying !== null) {
            setIsPlaying(remoteIsPlaying);
        }
    }, [remoteIsPlaying, isLiveEnabled, isLeader]);

    // Handle full sync requests from new joiners
    useEffect(() => {
        if (!isLiveEnabled || !isLeader || currentIndex === -1) return;

        const handleSyncRequest = (e) => {
            // e.detail.requesterId is available if needed
            let percent = 0;
            if (scrollRef.current) {
                const el = scrollRef.current;
                const scrollableDistance = el.scrollHeight - el.clientHeight;
                if (scrollableDistance > 0) {
                    percent = el.scrollTop / scrollableDistance;
                }
            }
            // Broadcast the full current state (index, scroll, and isPlaying)
            broadcastFullSync(currentIndex, percent, isPlaying);
        };

        window.addEventListener('live_sync_requested', handleSyncRequest);
        return () => window.removeEventListener('live_sync_requested', handleSyncRequest);
    }, [isLiveEnabled, isLeader, currentIndex, isPlaying, broadcastFullSync]);

    // Cleanup session on unmount is tricky because navigating between songs unmounts and remounts PlayerPage.
    // Instead of disconnecting on unmount, we handle explicit disconnection via the "Sair" button
    // OR when the user clicks "Voltar" to leave the player entirely.

    const [columnCount, setColumnCount] = useState(1); // 1 or 2 columns
    const [isAutoSpeedActive, setIsAutoSpeedActive] = useState(false); // Toggle for Magic Speed Calculation

    // Print Settings (Ephemeral)
    const [printFontSize, setPrintFontSize] = useState(12); // Always start at 12 for print

    // Global Data Context (for Syncing Likes and Player Preferences)
    const { toggleLike, likedSongIds, currentPlayerPreferences, isMobile, isTablet } = useData();
    const isLiked = songId ? likedSongIds.has(songId) : false;

    // Video Player Context
    const { openPlayer, closePlayer, isOpen: isVideoPlayerOpen } = useVideoPlayer();
    const [isLearningModalOpen, setIsLearningModalOpen] = useState(false);

    // Print Settings (Ephemeral)

    const handleToggleLike = async () => {
        if (songId === 'internet' || !songId) {
            showToast('Importe esta música para poder curtir!', 'info');
            return;
        }
        if (!user) {
            showToast('Faça login para curtir', 'error');
            return;
        }
        await toggleLike(songId);
        const wasLiked = likedSongIds.has(songId);
        showToast(wasLiked ? 'Música descurtida' : 'Música adicionada aos favoritos!', 'success');
    };

    // We remove the local 'isLiked' state since we use the global one now.
    // const [isLiked, setIsLiked] = useState(false);  <-- REMOVED



    // Display Mode: 'full' (Default), 'no_tabs' (Hide Tabs), 'only_tabs' (Only Tabs)
    const [displayMode, setDisplayMode] = useState('full');
    const [isReady, setIsReady] = useState(false); // New loading state

    // Synchronously sync song state & visual preferences during render on songId change
    if (songId !== prevSongId) {
        setPrevSongId(songId);
        const incomingSong = location.state?.song?.content ? location.state.song : (location.state?.song?.song?.content ? location.state.song.song : null);
        const targetSong = incomingSong || song;
        if (incomingSong) {
            setSong(incomingSong);
        }

        // Synchronously calculate and set all visual preferences from cache
        const globalPrefs = getUserPreferencesSync(user?.id);
        const songPrefs = getUserSongPreferenceSync(songId, user?.id);
        const liveSetlistTransp = getSetlistItemTranspositionSync(playlistItemId);

        const defaultMode = globalPrefs?.default_tone_mode || 'original';
        const personalTransp = (songPrefs?.transposition !== undefined && songPrefs?.transposition !== null) ? songPrefs.transposition : 0;
        const churchTransp = liveSetlistTransp !== null 
            ? liveSetlistTransp 
            : (initialTransposition !== undefined ? initialTransposition : 0);

        const songFontSize = isMobile ? songPrefs?.mobile_font_size : (isTablet ? songPrefs?.tablet_font_size : songPrefs?.desktop_font_size);
        const songTabFontSize = isMobile ? songPrefs?.mobile_tab_font_size : (isTablet ? songPrefs?.tablet_tab_font_size : songPrefs?.desktop_tab_font_size);
        const songLineSpacing = isMobile ? songPrefs?.mobile_line_spacing : (isTablet ? songPrefs?.tablet_line_spacing : songPrefs?.desktop_line_spacing);
        const songScrollSpeed = isMobile ? songPrefs?.mobile_scroll_speed : (isTablet ? songPrefs?.tablet_scroll_speed : songPrefs?.desktop_scroll_speed);
        const songLetterSpacing = isMobile ? songPrefs?.mobile_letter_spacing : (isTablet ? songPrefs?.tablet_letter_spacing : songPrefs?.desktop_letter_spacing);

        const finalFontSize = songFontSize || targetSong?.fontSize || currentPlayerPreferences?.fontSize || globalPrefs?.default_font_size || (isTablet ? 20 : 16);
        const finalTabFontSize = songTabFontSize || targetSong?.tabFontSize || (isTablet ? 14 : 0);
        const finalLineSpacing = songLineSpacing || targetSong?.lineSpacing || currentPlayerPreferences?.lineSpacing || globalPrefs?.default_line_spacing || 0.8;
        const finalScrollSpeed = songScrollSpeed || targetSong?.scrollSpeed || currentPlayerPreferences?.scrollSpeed || globalPrefs?.default_scroll_speed || (isTablet ? 12 : 5);
        const finalLetterSpacing = songLetterSpacing || targetSong?.letterSpacing || currentPlayerPreferences?.letterSpacing || globalPrefs?.default_letter_spacing || 0;
        const finalDisplayMode = songPrefs?.display_mode || globalPrefs?.default_display_mode || 'full';
        const finalIsAutoSpeed = songPrefs?.is_auto_speed ?? globalPrefs?.default_magic_speed_enabled ?? false;

        let targetTransp = 0;
        let targetTab = 'original';
        if (playlistItemId && context?.type === 'setlist') {
            targetTab = 'church';
            targetTransp = churchTransp;
        } else if (defaultMode === 'personal' || defaultMode === 'my_key') {
            targetTab = 'personal';
            targetTransp = personalTransp;
        } else if (defaultMode === 'church') {
            targetTab = 'church';
            targetTransp = churchTransp;
        } else {
            targetTab = 'original';
            targetTransp = 0;
        }

        setFontSize(finalFontSize);
        setTabFontSize(finalTabFontSize);
        setLineSpacing(finalLineSpacing);
        setScrollSpeed(finalScrollSpeed);
        setLetterSpacing(finalLetterSpacing);
        setDisplayMode(finalDisplayMode);
        setIsAutoSpeedActive(finalIsAutoSpeed);
        setSavedTransposition(personalTransp);
        setChurchTransposition(churchTransp);
        setActiveTab(targetTab);
        setTransposition(targetTransp);
    }

    const scrollAccumulator = React.useRef(0); // For handling sub-pixel scrolling

    // Tablet Detection moved to Preference Load logic to prevent State oscillation

    // Auto Scroll Logic (Time-Based / Delta Time / Interaction Safe)
    const isUserInteracting = useRef(false);
    const lastBroadcastTime = useRef(0);

    // Keyboard hold-state refs (avoids re-renders)
    const isHoldingRight = useRef(false);
    const isHoldingLeft = useRef(false);
    const keyHoldTimeout = useRef(null);
    const scrollSpeedRef = useRef(scrollSpeed);
    const isPlayingRef = useRef(isPlaying);
    // Dedicated lock for smooth scroll animations — independent of isUserInteracting
    // This prevents the auto-scroll interval from cancelling native smooth animations
    const isSmoothScrolling = useRef(false);
    const smoothScrollLockTimer = useRef(null);

    // Keep refs in sync with state
    useEffect(() => { scrollSpeedRef.current = scrollSpeed; }, [scrollSpeed]);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

    // Touch Handlers (Must be defined before return)
    const handleTouchStart = () => { isUserInteracting.current = true; };
    const handleTouchEnd = () => {
        setTimeout(() => { isUserInteracting.current = false; }, 10);
    };

    // Scroll Sync Listener (Leader emits)
    const handleScroll = () => {
        if (!isLiveEnabled || !isLeader || !scrollRef.current) return;

        const now = Date.now();
        // Throttle to 250ms to allow smooth scroll animation on receivers
        if (now - lastBroadcastTime.current < 250) return;

        const el = scrollRef.current;
        // Calculate percentage: scrollTop / (totalHeight - viewHeight)
        const scrollableDistance = el.scrollHeight - el.clientHeight;
        if (scrollableDistance > 0) {
            const percent = el.scrollTop / scrollableDistance;
            broadcastScroll(percent);
            lastBroadcastTime.current = now;
        }

        // --- PROJECTOR MODE LOGIC (Center-Screen Tracking) ---
        if (typeof broadcastLineFocus === 'function') {
            const rect = el.getBoundingClientRect();
            // Calculate center of the scrollable viewport
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            try {
                // Find element at center of the screen
                const centerEl = document.elementFromPoint(centerX, centerY);
                if (centerEl) {
                    const lineNode = centerEl.closest('[data-line-index]');
                    if (lineNode) {
                        const lineIndex = parseInt(lineNode.getAttribute('data-line-index'), 10);
                        // Prevent flooding the network with identical values
                        if (window.__lastBroadcastedFocusLine !== lineIndex) {
                            broadcastLineFocus(lineIndex);
                            window.__lastBroadcastedFocusLine = lineIndex;
                        }
                    }
                }
            } catch (e) {
                // elementFromPoint can throw occasionally if outside document
            }
        }
    };

    // Scroll Sync Receiver (Follower reads)
    useEffect(() => {
        if (isLiveEnabled && !isLeader && remoteScrollPercent !== null && scrollRef.current) {
            const el = scrollRef.current;
            const scrollableDistance = el.scrollHeight - el.clientHeight;
            if (scrollableDistance > 0) {
                // Ignore programmatic scrolls from touching logic
                isUserInteracting.current = true;
                el.scrollTo({
                    top: remoteScrollPercent * scrollableDistance,
                    behavior: 'smooth'
                });
                setTimeout(() => { isUserInteracting.current = false; }, 300); // Wait longer for smooth scroll to finish
            }
        }
    }, [remoteScrollPercent, isLiveEnabled, isLeader]);

    // Screen Wake Lock
    useEffect(() => {
        let wakeLock = null;

        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator) {
                    wakeLock = await navigator.wakeLock.request('screen');
                }
            } catch (err) {
                console.error('Wake Lock error:', err);
            }
        };

        const handleVisibilityChange = async () => {
            if (wakeLock !== null && document.visibilityState === 'visible') {
                await requestWakeLock();
            }
        };

        requestWakeLock();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (wakeLock !== null) {
                wakeLock.release().catch(console.error);
                wakeLock = null;
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    useEffect(() => {
        let intervalId;

        if (isPlaying && scrollSpeed > 0) {
            intervalId = setInterval(() => {
                // Skip if user is touching/scrolling manually
                if (isUserInteracting.current) return;
                // Skip if a smooth scroll animation is in progress (would cancel it)
                if (isSmoothScrolling.current) return;
                // Skip if left arrow is held (pause auto-scroll)
                if (isHoldingLeft.current) return;

                if (scrollRef.current) {
                    const el = scrollRef.current;

                    // Stop if reached bottom — allow 1px buffer
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 1) {
                        setIsPlaying(false);
                        return;
                    }

                    // Sub-pixel scrolling accumulator
                    // Speed 1: ~0.015px/tick, Speed 20: ~0.3px/tick, Speed 100: ~1.5px/tick
                    // If right arrow is held, double the effective speed
                    const effectiveSpeed = isHoldingRight.current ? scrollSpeedRef.current * 2 : scrollSpeedRef.current;
                    const pixelsPerTick = 0.015 * effectiveSpeed;
                    scrollAccumulator.current += pixelsPerTick;

                    if (scrollAccumulator.current >= 1) {
                        const pixelsToScroll = Math.floor(scrollAccumulator.current);
                        el.scrollTop += pixelsToScroll;
                        scrollAccumulator.current -= pixelsToScroll;
                    }
                }
            }, 16); // ~60fps
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [isPlaying, scrollSpeed]);

    // Keyboard Arrow Key Controls
    useEffect(() => {
        // How long smooth scroll animation takes — interval is blocked this entire time.
        const SMOOTH_LOCK_MS = 500;
        // Fallback hold timeout (fires if OS key-repeat is slow or disabled).
        const HOLD_DELAY_MS = 300;

        // Blocks the auto-scroll interval for SMOOTH_LOCK_MS so native smooth scroll
        // can animate without being cancelled by direct scrollTop mutations.
        const lockSmooth = () => {
            isSmoothScrolling.current = true;
            clearTimeout(smoothScrollLockTimer.current);
            smoothScrollLockTimer.current = setTimeout(() => {
                isSmoothScrolling.current = false;
            }, SMOOTH_LOCK_MS);
        };

        // Activate hold mode immediately and cancel the smooth lock
        // so the auto-scroll interval can run in hold mode right away.
        const activateHoldRight = () => {
            if (isHoldingRight.current) return; // Already active
            isHoldingRight.current = true;
            // Release the smooth lock — we're in hold mode now, interval should run
            isSmoothScrolling.current = false;
            clearTimeout(smoothScrollLockTimer.current);
        };

        const activateHoldLeft = () => {
            if (isHoldingLeft.current) return; // Already active
            isHoldingLeft.current = true;
            // Release smooth lock — hold-left pauses via isHoldingLeft check in interval
            isSmoothScrolling.current = false;
            clearTimeout(smoothScrollLockTimer.current);
        };

        const handleKeyDown = (e) => {
            if (!scrollRef.current || !song) return;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

            if (e.key === 'ArrowRight') {
                e.preventDefault();

                if (showNextSongModalRef.current) {
                    if (!e.repeat) {
                        const { nextItem, navigate, context, currentIndex } = navRefs.current;
                        if (nextItem) {
                            navigate(`/player/${nextItem.id}`, {
                                state: {
                                    song: nextItem,
                                    playlistItemId: nextItem.itemId,
                                    context,
                                    currentIndex: currentIndex + 1,
                                    initialTransposition: nextItem.transposition
                                },
                                replace: true
                            });
                        }
                        setShowNextSongModal(false);
                    }
                    return;
                }

                if (!e.repeat) {
                    // ── FIRST PRESS: single-click scroll ────────────────────────
                    const el = scrollRef.current;
                    const { nextItem } = navRefs.current;

                    // If at the bottom and there's a next song, open the modal instead of scrolling
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 5 && nextItem) {
                        setShowNextSongModal(true);
                        return;
                    }

                    // Start autoscroll if it was stopped
                    if (!isPlayingRef.current) {
                        setIsPlaying(true);
                        return; // Só dá o play, não pula os 6%
                    }

                    const scrollAmount = (el.scrollHeight - el.clientHeight) * 0.06;
                    lockSmooth();
                    el.scrollBy({ top: scrollAmount, behavior: 'smooth' });

                    // Fallback hold timer (for keyboards with slow/disabled key-repeat)
                    keyHoldTimeout.current = setTimeout(activateHoldRight, HOLD_DELAY_MS);
                } else {
                    // ── KEY REPEAT = user is physically holding the key ─────────
                    // e.repeat=true is the native OS signal for "key held".
                    // Activate hold mode immediately — no timer needed.
                    activateHoldRight();
                }
            }

            if (e.key === 'ArrowLeft') {
                e.preventDefault();

                if (showNextSongModalRef.current) {
                    if (!e.repeat) {
                        setShowNextSongModal(false);
                    }
                    return;
                }

                if (!e.repeat) {
                    // ── FIRST PRESS: single-click scroll UP ─────────────────────
                    const el = scrollRef.current;
                    const scrollAmount = (el.scrollHeight - el.clientHeight) * 0.06;
                    lockSmooth();
                    el.scrollBy({ top: -scrollAmount, behavior: 'smooth' });

                    keyHoldTimeout.current = setTimeout(activateHoldLeft, HOLD_DELAY_MS);
                } else {
                    // ── KEY REPEAT = holding left = pause ───────────────────────
                    activateHoldLeft();
                }
            }
        };

        const handleKeyUp = (e) => {
            if (e.key === 'ArrowRight') {
                clearTimeout(keyHoldTimeout.current);
                isHoldingRight.current = false;
                // Do NOT touch isSmoothScrolling — its timer manages itself
            }
            if (e.key === 'ArrowLeft') {
                clearTimeout(keyHoldTimeout.current);
                isHoldingLeft.current = false;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            clearTimeout(keyHoldTimeout.current);
            clearTimeout(smoothScrollLockTimer.current);
            isHoldingRight.current = false;
            isHoldingLeft.current = false;
            isSmoothScrolling.current = false;
        };
    }, [song]); // Re-register when song changes

    // Magic Speed Calculation Helper
    const calculateMagicSpeed = () => {
        if (scrollRef.current && song) {
            const el = scrollRef.current;
            const totalHeight = el.scrollHeight;
            const viewHeight = el.clientHeight;

            // To reach the end of the song when it hits the center of the screen, 
            // the scrollable distance we care about is the total height minus half the view height.
            // If the song is shorter than a screen, this might be negative, so we cap at 0.
            const targetScrollDistance = Math.max(0, totalHeight - viewHeight / 2);

            const effectiveDuration = song.duration > 0 ? song.duration : 300; // Default 5:00

            if (targetScrollDistance > 0) {
                // For a 60fps tick (16ms) where we add (0.015 * speed) pixels:
                // Speed = (Pixels/Second) / (60 * 0.015) 
                // Speed = (Pixels/Second) / 0.9
                const pixelsPerSecond = targetScrollDistance / effectiveDuration;
                const idealSpeed = pixelsPerSecond / 0.9;

                // Only update if significantly different to avoid jitters
                if (Math.abs(idealSpeed - scrollSpeed) > 0.01) {
                    setScrollSpeed(idealSpeed);
                }
            }
        }
    };

    // Real-time Magic Speed Update
    useEffect(() => {
        if (isAutoSpeedActive) {
            // Use setTimeout to ensure DOM has fully painted before calculating height
            const timer = setTimeout(() => {
                calculateMagicSpeed();
            }, 150);
            return () => clearTimeout(timer);
        }
    }, [fontSize, lineSpacing, columnCount, isAutoSpeedActive, song?.duration, song?.id, isReady, displayMode, letterSpacing]); // Recalc when visuals change


    // Analytics: Track View
    useEffect(() => {
        if (song?.id && songId !== 'internet') {
            // Fire and forget - don't await to avoid blocking UI
            incrementSongView(song.id);
            addToHistory(song.id);
        }
    }, [song?.id, songId]);

    // Auto-open Learning Modal if requested via navigation state
    useEffect(() => {
        if (location.state?.startInLearningMode) {
            // Check if we waited for song to load (song is not null)
            if (song) {
                setIsLearningModalOpen(true);
            }
        }

        // Cleanup: Close player when leaving the page to avoid persistence bugs
        return () => {
            closePlayer();
        };
    }, [song, location.state]);

    // 1b. Background Pre-fetching for Setlists/Playlists (Full Song Content & Preferences)
    useEffect(() => {
        const context = location.state?.context;
        if (!context || !context.items || context.items.length <= 1 || !user) return;

        const prefetchSongsAndPreferences = async () => {
            try {
                const songIds = context.items.map(item => item.id).filter(id => id && id !== songId);
                if (songIds.length === 0) return;

                console.log(`[Pre-fetch] Batch loading ${songIds.length} songs & preferences for user ${user.id}...`);

                // 1. Batch load full song objects (chords & lyrics text)
                const songsMap = await getSongsByIds(songIds);

                // 2. Populate in-memory context items with loaded song data
                context.items.forEach(item => {
                    if (item.id && songsMap[item.id]) {
                        const cachedSong = songsMap[item.id];
                        item.song = cachedSong;
                        item.content = cachedSong.content;
                        item.artist = item.artist || cachedSong.artist;
                        item.originalKey = item.originalKey || cachedSong.originalKey;
                    }
                });

                // 3. Batch load preferences and transpositions for all songs in background
                await Promise.all(context.items.map(async (item) => {
                    const sid = item.id || item.song_id;
                    if (sid) await getUserSongPreference(sid, user.id);
                    const pit = item.playlistItemId || item.id;
                    if (pit) await getSetlistItemTransposition(pit);
                }));

                console.log(`[Pre-fetch] Completed background load for all songs in setlist/playlist.`);
            } catch (err) {
                console.warn("[Pre-fetch] Error during background load:", err);
            }
        };

        const timeoutId = setTimeout(prefetchSongsAndPreferences, 100);
        return () => clearTimeout(timeoutId);
    }, [location.state?.context?.id, user?.id]);

    // Scroll Reset on Song Change (Reset BEFORE browser paint to prevent upward scrolling animation)
    useLayoutEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [songId]);

    // 2. Unified Load Song & Preferences Logic
    // This orchestrator ensures everything (song data + user prefs) is ready
    // BEFORE setting isReady(true) to avoid visual flickers or "jumps" in tone.
    useEffect(() => {
        const loadSongAndPrefs = async () => {
            if (!songId) {
                setIsReady(true);
                return;
            }

            if (songId === 'internet') {
                if (location.state?.song) {
                    const s = { ...location.state.song };
                    // Automatically detect key if missing or explicitly marked as unknown
                    if (!s.originalKey || s.originalKey === '?') {
                        s.originalKey = detectKeyFromContent(s.content) || 'C';
                    }
                    setSong(s);
                }
                setIsReady(true);
                return;
            }

            // Only reset isReady to false if song data is not already cached in memory
            const hasInMemorySong = !!(location.state?.song?.content || location.state?.song?.song?.content);
            if (!hasInMemorySong) {
                setIsReady(false);
            }
            try {
                // Phase 1: Get Song Data
                let currentSongData = null;
                // Check if we have COMPLETE song data in state (including content)
                if (location.state?.song?.content) {
                    currentSongData = location.state.song;
                } else if (location.state?.song?.song?.content) {
                    currentSongData = location.state.song.song;
                } else {
                    currentSongData = await getSongById(songId);
                }

                if (!currentSongData) throw new Error("Música não encontrada");

                // Automatically detect key if missing or explicitly marked as unknown
                if (currentSongData && (!currentSongData.originalKey || currentSongData.originalKey === '?')) {
                    currentSongData.originalKey = detectKeyFromContent(currentSongData.content) || 'C';
                }

                // Phase 2: Fetch Preferences (Check Synchronous Cache First for Instant 0ms Load!)
                const globalPrefs = getUserPreferencesSync(user?.id) || await getUserPreferences();
                const songPrefs = getUserSongPreferenceSync(songId, user?.id) || (songId === 'internet' ? null : await getUserSongPreference(songId, user?.id));
                const liveSetlistTransp = getSetlistItemTranspositionSync(playlistItemId) ?? ((playlistItemId && context?.type === 'setlist') ? await getSetlistItemTransposition(playlistItemId) : null);

                const defaultMode = globalPrefs?.default_tone_mode || 'original';
                const personalTransp = (songPrefs?.transposition !== undefined && songPrefs?.transposition !== null) ? songPrefs.transposition : 0;
                
                // Priority for "Repertório" Tone: Live Database Value (High) > Setlist Context (Mid)
                const churchTransp = liveSetlistTransp !== null 
                    ? liveSetlistTransp 
                    : (initialTransposition !== undefined ? initialTransposition : 0);

                // Phase 3: Sync Visual Preferences
                const songFontSize = (isMobile ? songPrefs?.mobile_font_size : (isTablet ? songPrefs?.tablet_font_size : songPrefs?.desktop_font_size)) || songPrefs?.font_size;
                const songTabFontSize = isMobile ? songPrefs?.mobile_tab_font_size : (isTablet ? songPrefs?.tablet_tab_font_size : songPrefs?.desktop_tab_font_size);
                const songLineSpacing = isMobile ? songPrefs?.mobile_line_spacing : (isTablet ? songPrefs?.tablet_line_spacing : songPrefs?.desktop_line_spacing);
                const songScrollSpeed = isMobile ? songPrefs?.mobile_scroll_speed : (isTablet ? songPrefs?.tablet_scroll_speed : songPrefs?.desktop_scroll_speed);
                const songLetterSpacing = isMobile ? songPrefs?.mobile_letter_spacing : (isTablet ? songPrefs?.tablet_letter_spacing : songPrefs?.desktop_letter_spacing);

                // Priority: Song-Specific Prefs > Song-Specific Defaults (from editor) > Global Defaults
                const finalFontSize = songFontSize || currentSongData?.fontSize || currentPlayerPreferences?.fontSize || globalPrefs?.default_font_size || (isTablet ? 20 : 16);
                const finalTabFontSize = songTabFontSize || currentSongData?.tabFontSize || (isTablet ? 14 : 0);
                const finalLineSpacing = songLineSpacing || currentSongData?.lineSpacing || currentPlayerPreferences?.lineSpacing || globalPrefs?.default_line_spacing || 0.8;
                const finalScrollSpeed = songScrollSpeed || currentPlayerPreferences?.scrollSpeed || globalPrefs?.default_scroll_speed || (isTablet ? 12 : 5);
                const finalLetterSpacing = songLetterSpacing || currentPlayerPreferences?.letterSpacing || globalPrefs?.default_letter_spacing || 0;
                const finalDisplayMode = songPrefs?.display_mode || globalPrefs?.default_display_mode || 'full';
                const finalIsAutoSpeed = songPrefs?.is_auto_speed ?? globalPrefs?.default_magic_speed_enabled ?? false;

                // Phase 4: Sync Keys & Final Transposition
                let targetTransp = 0;
                if (playlistItemId && context?.type === 'setlist') {
                    setActiveTab('church');
                    targetTransp = churchTransp;
                } else if (defaultMode === 'personal' || defaultMode === 'my_key') {
                    setActiveTab('personal');
                    targetTransp = personalTransp;
                } else if (defaultMode === 'church') {
                    setActiveTab('church');
                    targetTransp = churchTransp;
                } else {
                    setActiveTab('original');
                    targetTransp = 0;
                }

                // Batch ALL state updates together BEFORE setting isReady = true
                setSong(currentSongData);
                setFontSize(finalFontSize);
                setTabFontSize(finalTabFontSize);
                setLineSpacing(finalLineSpacing);
                setScrollSpeed(finalScrollSpeed);
                setLetterSpacing(finalLetterSpacing);
                setDisplayMode(finalDisplayMode);
                setIsAutoSpeedActive(finalIsAutoSpeed);
                setSavedTransposition(personalTransp);
                setChurchTransposition(churchTransp);
                setTransposition(targetTransp);

                // Mark ready NOW — song + user tone + font size are rendered TOGETHER instantly!
                setIsReady(true);

            } catch (err) {
                const errMsg = err?.message || err?.details || String(err) || '';
                if (!errMsg.includes('AbortError')) {
                    console.error("Error in Unified Load:", err);
                }
                setIsReady(true);
            }
        };

        loadSongAndPrefs();
    }, [songId, playlistItemId, initialTransposition, user?.id, location.state]);

    // 3. Autosave Visual Preferences (Debounced & Device Specific)
    useEffect(() => {
        if (!songId || songId === 'internet' || !isReady) return; // Wait for load before autosaving!

        const timeoutId = setTimeout(() => {
            const payload = {
                display_mode: displayMode, // Shared
                is_auto_speed: isAutoSpeedActive // Shared Magic Speed Toggle
            };

            // Dynamic columns based on device
            if (isMobile) {
                payload.mobile_font_size = Math.round(fontSize);
                payload.mobile_tab_font_size = Math.round(tabFontSize);
                payload.mobile_line_spacing = lineSpacing;
                payload.mobile_scroll_speed = scrollSpeed;
                payload.mobile_letter_spacing = letterSpacing;
            } else if (isTablet) {
                payload.tablet_font_size = Math.round(fontSize);
                payload.tablet_tab_font_size = Math.round(tabFontSize);
                payload.tablet_line_spacing = lineSpacing;
                payload.tablet_scroll_speed = scrollSpeed;
                payload.tablet_letter_spacing = letterSpacing;
            } else {
                payload.desktop_font_size = Math.round(fontSize);
                payload.desktop_tab_font_size = Math.round(tabFontSize);
                payload.desktop_line_spacing = lineSpacing;
                payload.desktop_scroll_speed = scrollSpeed;
                payload.desktop_letter_spacing = letterSpacing;
            }
            payload.font_size = Math.round(fontSize);

            saveUserSongPreference(songId, payload);
        }, 1000); // 1s debounce

        return () => clearTimeout(timeoutId);
    }, [fontSize, tabFontSize, lineSpacing, scrollSpeed, letterSpacing, displayMode, isAutoSpeedActive, songId, playlistItemId, isMobile]);



    const handleTranspositionChange = async (newVal, shouldSave = false) => {
        setTransposition(newVal);

        // If in playlist, always valid to save if manual Save button clicked
        // For tabs (Church/Personal), we wait for explicit save
        if (playlistItemId && shouldSave) {
            await updatePlaylistItemTransposition(playlistItemId, newVal);
        }
    };

    // Explicit Save Button Helper
    const handleManualSave = async () => {
        if (activeTab === 'church') {
            // Permission check: Only Editors and Admins can save repertoire tone
            if (!isAdmin && !isEditor) {
                showToast("Apenas editores podem salvar o tom no repertório.", "error");
                return;
            }

            let savedToPlaylistOrSetlist = false;

            // Save specific for this event/repertoire
            if (playlistItemId) {
                if (context?.type === 'setlist') {
                    const success = await updateSetlistItemTransposition(playlistItemId, transposition);
                    if (success) savedToPlaylistOrSetlist = true;
                } else {
                    // It's a Repertoire
                    const success = await updatePlaylistItemTransposition(playlistItemId, transposition);
                    if (success) savedToPlaylistOrSetlist = true;
                }
            }

            // Show appropriate Toast
            if (savedToPlaylistOrSetlist) {
                showToast(`Tom ${context?.type === 'setlist' ? 'da Escala' : 'do Repertório'} salvo!`, "success");
            } else {
                showToast("Erro ao salvar tom.", "error");
            }
            
            if (savedToPlaylistOrSetlist) {
                setChurchTransposition(transposition);
            }
        } else if (activeTab === 'original') {
            // Save Original Key (Owner Only)
            const newKey = getTransposedNote(song.originalKey, transposition);
            const newContent = transposeSong(song.content, transposition);
            
            if (songId === 'internet') {
                showToast("Importe a música para alterar o tom original!", "info");
                return;
            }
            const success = await updateSongOriginalKey(songId, newKey, newContent);

            if (success) {
                showToast("Tom original atualizado!", "success");
                setSong(s => ({ ...s, originalKey: newKey, content: newContent }));
                setTransposition(0);
            } else {
                showToast("Você não tem permissão para alterar o original.", "error");
            }
        } else {
            // Personal / Default (Meu Tom)
            await saveUserSongPreference(songId, { transposition: transposition });
            setSavedTransposition(transposition);
            showToast("Meu Tom salvo!", "success");
        }
    };

    const isSaveDisabled = () => {
        // If in playlist, we act as if we are saving the "Preset" AND the "Playlist Item"
        // So we enable if CURRENT Transposition != Saved Preset OR != Playlist Value?
        // Actually, let's simpler: Enable if Current != Saved Value of the Tab.
        // The playlist update is a side effect.

        if (activeTab === 'church') return churchTransposition === transposition;
        if (activeTab === 'personal') return savedTransposition === transposition;
        if (activeTab === 'original') return transposition === 0;
        return true;
    };

    const toggleStartKeyMode = () => {
        const newMode = startKeyMode === 'original' ? 'my_key' : 'original';
        setStartKeyMode(newMode);
        localStorage.setItem('tetracom_start_key', newMode);
    };


    if (!song) {
        return <div className="p-8 text-center text-slate-500">Carregando...</div>;
    }

    const transposedContent = transposeSong(song.content, transposition);
    const absoluteKey = getTransposedNote(song.originalKey, transposition);

    const handlePrint = () => {
        // Force Paginated Mode before printing
        if (viewMode !== 'pages') {
            setViewMode('pages');
            // Give react a split second to render pages? 
            setTimeout(() => window.print(), 100);
        } else {
            window.print();
        }
    };

    return (
        <div
            ref={scrollRef}
            onScroll={handleScroll}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onMouseDown={handleTouchStart} // Also pause for mouse click/drag
            onMouseUp={handleTouchEnd}
            className="h-full bg-slate-900 text-slate-900 relative flex flex-col items-center py-2 md:py-8 overflow-y-auto print:p-0 print:bg-white print:overflow-visible print:items-start"
        >
            {/* Print Styles & Animations */}
            {/* Print Styles & Animations */}
            <style>
                {`
@media print {
    @page {
        margin: 0mm;
        size: A4;
        /* Hides default browser headers/footers in generic browsers */
    }
    html, body {
        background-color: white !important;
        margin: 0 !important;
        padding: 0 !important;
        height: 100%;
        color: black;
    }
    /* Hide everything by default, only show printable */
    body > *:not(#root) {
        display: none !important;
    }
    
    /* Specific overrides for containers */
    #root, .print-content {
        display: block !important;
        width: 100% !important;
        height: auto !important;
        background-color: transparent !important;
        overflow: visible !important;
    }

    /* Print Specific Resets - More targeted than * */
    .bg-slate-900, .dark .bg-slate-900 {
        background-color: white !important;
        color: black !important;
    }
    .text-slate-900, .dark .text-slate-100 {
        color: black !important;
    }
    
    /* Preserve Chord Colors */
    .text-yellow-600, .dark .text-yellow-600 {
        color: #d97706 !important; /* Force visible chord color (amber-600) */
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }

    .no-print, button, .fixed, .absolute:not(.relative *) {
        /* Hide UI elements but preserve absolute positioned content inside relative containers (like chords) */
        /* wait, .absolute:not(...) is risky. Better explicit hides. */
    }
    .no-print, button.fixed, .fixed.bottom-6, .fixed.top-4 {
        display: none !important;
    }
    /* Hide floating menu and header actions */
    .fixed.z-50 {
        display: none !important;
    }

    /* Ensure pages are visible and overflow correctly */
    .active-page {
        display: block !important;
        overflow: visible !important; /* Critical for chords near edges */
        box-shadow: none !important;
        border: none !important;
        margin: 0 !important;
        page-break-after: always;
        break-after: page;
        width: 210mm !important;
        height: 297mm !important;
    }
    
    /* Hide previous/next/back buttons inside the page if they exist (they shouldn't in paginated view but safe to add) */
    button {
        display: none !important;
    }
}
@keyframes fadeInSlide {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}
.song-animate {
    animation: fadeInSlide 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}
`}
            </style>

            {/* Header Actions (Fixed Top Left) */}
            <div className="fixed top-4 left-4 z-50 flex gap-2 print:hidden pt-safe">
                <button
                    onClick={() => {
                        if (isLiveEnabled) disconnectFromSession();
                        // If came from a setlist, go back to the playlist's setlists tab
                        if (context?.type === 'setlist') {
                            navigate(`/playlist/${context.playlistId || ''}`, {
                                state: { view: 'setlists' }
                            });
                        } else {
                            navigate(-1);
                        }
                    }}
                    className="p-3 bg-slate-800/80 backdrop-blur-sm text-white rounded-full hover:bg-slate-700 transition shadow-lg"
                    title="Voltar"
                >
                    <ArrowLeft size={24} />
                </button>

                <button
                    onClick={handleToggleLike}
                    className={`p-3 bg-slate-800/80 backdrop-blur-sm rounded-full hover:bg-slate-700 transition shadow-lg ${isLiked ? 'text-red-500' : 'text-slate-400'}`}
                    title={isLiked ? "Descurtir" : "Curtir"}
                >
                    <Heart size={24} className={isLiked ? 'fill-current' : ''} />
                </button>

                <button
                    onClick={() => setShowAddToPlaylistModal(true)}
                    className="ml-2 p-3 bg-slate-800/80 backdrop-blur-sm rounded-full hover:bg-slate-700 transition shadow-lg text-slate-400 hover:text-white"
                    title="Adicionar a um Repertório"
                >
                    <ListPlus size={24} />
                </button>

                {song?.youtubeLinks?.length > 0 && (
                    <button
                        onClick={() => setIsLearningModalOpen(true)}
                        className={`ml-2 p-3 bg-red-600 text-white rounded-full hover:bg-red-700 transition shadow-lg ${isVideoPlayerOpen ? 'animate-pulse' : ''}`}
                        title="Aprender (Vídeos)"
                    >
                        <GraduationCap size={24} />
                    </button>
                )}
            </div>

            {/* Live Session Status / Controls (Only for Setlists) */}
            {context && context.type === 'setlist' && (
                <div className="fixed top-4 right-4 z-50 flex gap-2 print:hidden pt-safe">
                    {!isLiveEnabled ? (
                        <button
                            onClick={() => connectToSession(context.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600/90 backdrop-blur-sm text-white rounded-full hover:bg-indigo-500 transition shadow-lg text-xs font-bold uppercase tracking-wide"
                        >
                            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                            Modo Culto
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 bg-slate-800/90 backdrop-blur-sm rounded-full p-1 pr-4 shadow-lg border border-slate-700">
                            <button
                                onClick={disconnectFromSession}
                                className="p-2 bg-red-500/20 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition"
                                title="Sair do Modo Culto"
                            >
                                <X size={16} />
                            </button>
                            <div className="flex flex-col">
                                <span className="text-[10px] uppercase font-bold text-slate-400 leading-none">
                                    {isLeader ? 'Você controla' : 'Seguindo'}
                                </span>
                                <span className="text-xs font-bold text-white flex items-center gap-1 leading-none mt-1">
                                    <span className={`w-1.5 h-1.5 rounded-full ${isLeader ? 'bg-green-500' : 'bg-indigo-500'} animate-pulse`}></span>
                                    {onlineUsers.length} online
                                </span>
                            </div>
                            {!isLeader && (
                                <button
                                    onClick={claimLeadership}
                                    className="ml-2 text-[10px] uppercase font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded transition"
                                >
                                    Assumir
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Content Area */}
            {
                viewMode === 'scroll' ? (
                    // SCROLL MODE (Infinite A4 Width)
                    <div className="w-full h-fit flex flex-col items-center pb-[150px]">
                        {/* Focus Mode Spacer - Pushes content down when playing */}
                        <div
                            className="w-full transition-all duration-500 ease-in-out print:hidden flex-shrink-0"
                            style={{ height: isPlaying ? '35vh' : '0px' }}
                        />

                        <div
                            key={song.id} // Forces re-mount animation on song change
                            className="bg-white dark:bg-slate-900 w-full max-w-[210mm] min-h-[297mm] shadow-2xl relative transition-transform duration-300 print:hidden song-animate overflow-hidden"
                            style={{ fontSize: `${fontSize}pt` }} // Fix space in pt unit
                        >
                            {/* Internet Warning Banner */}
                            {(songId === 'internet' || song.source === 'cifraclub') && (
                                <div className="w-full py-2 px-4 bg-red-500/10 dark:bg-red-500/20 backdrop-blur-sm border-b border-red-500/20 flex items-center justify-center gap-2 mb-4 animate-in slide-in-from-top duration-500">
                                    <Info size={14} className="text-red-500 flex-shrink-0" />
                                    <span className="text-[10px] md:text-xs font-bold text-red-600 dark:text-red-400 leading-tight">
                                        Cifras direto da internet podem conter erros pois não passaram pela revisão criteriosa do LouvorPlay.
                                    </span>
                                </div>
                            )}

                            <div className="px-5 pt-4 pb-4 md:px-[20mm] md:pt-[10mm] md:pb-[20mm]">
                            {previousItem && (
                                <button
                                    onClick={() => {
                                        if (previousItem) {
                                            navigate(`/player/${previousItem.id}`, {
                                                state: {
                                                    song: previousItem,
                                                    playlistItemId: previousItem.itemId,
                                                    context,
                                                    currentIndex: currentIndex - 1,
                                                    initialTransposition: previousItem.transposition || 0
                                                },
                                                replace: true
                                            });
                                        }
                                    }}
                                    className="w-full mb-4 py-2 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-700/50 rounded-lg flex items-center justify-center gap-2 group transition-all text-slate-400 hover:text-purple-600 dark:hover:text-purple-400"
                                >
                                    <ArrowDown size={14} className="rotate-180" />
                                    <span className="text-xs font-medium uppercase tracking-wider">Voltar para: <strong>{previousItem.title}</strong></span>
                                </button>
                            )}
                            <Header
                                song={song}
                                currentKey={absoluteKey}
                                isPlaylist={!!playlistItemId}
                                context={context}
                                currentIndex={currentIndex}
                            />

                            <div className={`transition-opacity duration-500 ${isReady ? 'opacity-100' : 'opacity-0 min-h-[50vh]'}`}>
                                {isReady ? (
                                    <ChordProRenderer
                                        content={transposedContent}
                                        fontSize={fontSize}
                                        tabFontSize={tabFontSize}
                                        lineSpacing={lineSpacing}
                                        letterSpacing={letterSpacing}
                                        displayMode={displayMode}
                                    />
                                ) : (
                                    <div className="flex justify-center items-center h-40">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                                    </div>
                                )}
                            </div>

                            {/* Next Song Button */}
                            {nextItem && (
                                <button
                                    onClick={() => {
                                        navigate(`/player/${nextItem.id}`, {
                                            state: {
                                                song: nextItem, // Pass full item which now includes content/artist
                                                playlistItemId: nextItem.itemId,
                                                context,
                                                currentIndex: currentIndex + 1,
                                                initialTransposition: nextItem.transposition || 0
                                            },
                                            replace: true
                                        });
                                    }}
                                    className="mt-12 w-full py-6 bg-slate-100 dark:bg-slate-800 hover:bg-purple-100 dark:hover:bg-purple-900/30 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-purple-500 rounded-2xl flex flex-col items-center justify-center gap-2 group transition-all"
                                >
                                    <span className="text-xs uppercase font-bold text-slate-500 group-hover:text-purple-600 tracking-wider">Próxima Música</span>
                                    <div className="text-xl font-bold text-slate-800 dark:text-slate-200 group-hover:text-purple-700 dark:group-hover:text-purple-400">
                                        {nextItem.title}
                                        <span className="ml-2 text-sm font-normal opacity-60">
                                            ({nextItem.transposition !== 0 ? getTransposedNote(nextItem.originalKey, nextItem.transposition) : nextItem.originalKey})
                                        </span>
                                    </div>
                                    <ArrowDown size={20} className="text-slate-400 group-hover:text-purple-500 animate-bounce mt-1" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                ) : (
                    // PAGINATED MODE (Real A4 Pages)
                    // The Renderer generates the A4 divs itself
                    <div className={`flex flex-col gap-8 print:gap-0 w-full items-center print:items-start print-content transition-opacity duration-500 ${isReady ? 'opacity-100' : 'opacity-0'}`}>
                        {isReady ? (
                            <PaginatedChordRenderer
                                content={transposedContent}
                                fontSize={printFontSize}
                                tabFontSize={tabFontSize}
                                lineSpacing={lineSpacing}
                                letterSpacing={letterSpacing}
                                title={song.title}
                                artist={song.artist}
                                transposition={absoluteKey}
                                originalKey={song.originalKey}
                                isPlaylist={!!playlistItemId}
                                columnCount={columnCount}
                                displayMode={displayMode}
                                isInternet={songId === 'internet' || song.source === 'cifraclub'}
                            />
                        ) : (
                            <div className="flex justify-center items-center h-40">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                            </div>
                        )}
                    </div>
                )
            }


            {/* Floating Menu Trigger */}
            <div className="fixed bottom-6 right-6 z-50 print:hidden flex flex-col items-end gap-4">

                {/* Menu Panel */}
                {menuOpen && (
                    <div className="bg-slate-800/90 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-slate-700 w-72 animate-in slide-in-from-bottom-5 fade-in duration-200 mb-2 max-h-[70vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-2">
                            <div className="flex items-center gap-3">
                                <h3 className="font-bold flex items-center gap-2">
                                    <Settings2 size={18} /> Ajustes
                                </h3>
                                
                                {/* Header Theme Toggle */}
                                <div className="flex items-center bg-slate-900/50 p-1 rounded-full border border-slate-700/50">
                                    <button
                                        onClick={() => theme === 'dark' && toggleTheme()}
                                        className={`p-1.5 rounded-full transition-all duration-200 ${theme === 'light' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                                        title="Modo Claro"
                                    >
                                        <Sun size={14} />
                                    </button>
                                    <button
                                        onClick={() => theme === 'light' && toggleTheme()}
                                        className={`p-1.5 rounded-full transition-all duration-200 ${theme === 'dark' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                                        title="Modo Escuro"
                                    >
                                        <Moon size={14} />
                                    </button>
                                </div>
                            </div>
                            <button onClick={() => setMenuOpen(false)} className="hover:text-red-400 p-1">
                                <X size={20} />
                            </button>
                        </div>


                        {/* View Mode Switcher */}
                        <div className="mb-6 bg-slate-900/50 p-1 rounded-lg flex">
                            <button
                                onClick={() => { setViewMode('scroll'); setIsPlaying(false); }}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-bold transition ${viewMode === 'scroll' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                            >
                                <ScrollText size={14} /> Tocar
                            </button>
                            <button
                                onClick={() => { setViewMode('pages'); setIsPlaying(false); }}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-bold transition ${viewMode === 'pages' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                            >
                                <FileText size={14} /> Imprimir
                            </button>
                        </div>

                        {/* Display Mode Control (Tabs) */}
                        <div className="mb-6">
                            <label className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-2 block">
                                Visualização
                            </label>
                            <div className="bg-slate-900/50 p-1 rounded-lg flex">
                                <button
                                    onClick={() => setDisplayMode('full')}
                                    className={`flex-1 py-1.5 rounded text-[10px] uppercase font-bold transition ${displayMode === 'full' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    Completo
                                </button>
                                <button
                                    onClick={() => setDisplayMode('no_tabs')}
                                    className={`flex-1 py-1.5 rounded text-[10px] uppercase font-bold transition ${displayMode === 'no_tabs' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    S/ Tabs
                                </button>
                                {song.type !== 'lyrics' && (
                                    <button
                                        onClick={() => setDisplayMode('only_tabs')}
                                        className={`flex-1 py-1.5 rounded text-[10px] uppercase font-bold transition ${displayMode === 'only_tabs' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        Só Tabs
                                    </button>
                                )}

                            </div>
                        </div>



                        {/* Actions (Print Mode Only) */}
                        {viewMode === 'pages' && (
                            <div className="mb-6">
                                <button
                                    onClick={handlePrint}
                                    className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 py-2 rounded-lg font-bold transition mb-3"
                                >
                                    <Printer size={16} /> Imprimir Agora
                                </button>

                                {/* 2 Columns Toggle */}
                                <label className="flex items-center gap-3 p-2 bg-slate-900/50 rounded-lg cursor-pointer hover:bg-slate-900/70 transition">
                                    <input
                                        type="checkbox"
                                        checked={columnCount === 2}
                                        onChange={(e) => setColumnCount(e.target.checked ? 2 : 1)}
                                        className="w-5 h-5 rounded border-gray-600 text-purple-600 focus:ring-purple-500 bg-slate-800"
                                    />
                                    <span className="text-sm font-semibold text-slate-300">Duas Colunas</span>
                                </label>
                            </div>
                        )}

                        {/* Auto Scroll Controls (Scroll Mode Only) */}
                        {viewMode === 'scroll' && (
                            <div className="mb-6">
                                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-2 block flex items-center gap-2">
                                    <ArrowDown size={14} /> Rolagem Automática
                                </label>
                                <div className="flex flex-col gap-3">
                                    {/* Play/Pause Button */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setIsPlaying(!isPlaying)}
                                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-bold transition shadow-lg ${isPlaying ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                                        >
                                            {isPlaying ? (
                                                <>
                                                    <div className="w-3 h-3 bg-white rounded-sm" /> Parar
                                                </>
                                            ) : (
                                                <>
                                                    <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-white border-b-[6px] border-b-transparent ml-1" /> Tocar
                                                </>
                                            )}
                                        </button>

                                        {/* Magic Speed Toggle - Always visible due to default 5:00 */}
                                        <button
                                            onClick={() => {
                                                const newState = !isAutoSpeedActive;
                                                setIsAutoSpeedActive(newState);

                                                if (newState) {
                                                    // Immediate calculation attempt
                                                    calculateMagicSpeed();
                                                    showToast("Velocidade Mágica Ativada!", "success");
                                                } else {
                                                    showToast("Velocidade Mágica Desativada", "info");
                                                }
                                            }}
                                            className={`w-12 flex items-center justify-center rounded-lg transition ${isAutoSpeedActive ? 'bg-purple-600 text-white shadow-lg ring-2 ring-purple-400' : 'bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600'}`}
                                            title={`Velocidade Mágica (${Math.floor((song?.duration || 300) / 60)}:${String((song?.duration || 300) % 60).padStart(2, '0')})`}
                                        >
                                            <Wand2 size={20} className={isAutoSpeedActive ? "animate-pulse" : ""} />
                                        </button>
                                    </div>

                                    {/* Speed Controls */}
                                    <div className={`flex items-center justify-between bg-slate-900/50 rounded-lg p-1 transition-opacity ${song?.duration > 0 ? '' : ''}`}>
                                        <button
                                            onClick={() => {
                                                setScrollSpeed(s => Math.max(0, Math.ceil(s) - 1));
                                                setIsAutoSpeedActive(false); // Disable magic mode on manual override
                                            }}
                                            className={`w-10 h-10 flex items-center justify-center rounded-lg transition active:scale-95 disabled:opacity-50 ${isAutoSpeedActive ? 'bg-slate-800 text-slate-600' : 'bg-slate-700 hover:bg-slate-600'}`}
                                            disabled={scrollSpeed <= 0}
                                        >
                                            <Minus size={18} />
                                        </button>
                                        <div className="text-center w-14">
                                            <span className={`font-mono font-bold text-lg block leading-none ${scrollSpeed > 0 ? 'text-green-400' : 'text-slate-500'}`}>
                                                {Number(scrollSpeed).toFixed(2).replace(/\.?0+$/, '')}
                                            </span>
                                            <span className="text-[10px] text-slate-500 block leading-none">
                                                velocidade
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setScrollSpeed(s => Math.min(100, Math.floor(s) + 1));
                                                setIsAutoSpeedActive(false); // Disable magic mode on manual override
                                            }}
                                            className={`w-10 h-10 flex items-center justify-center rounded-lg transition active:scale-95 ${isAutoSpeedActive ? 'bg-slate-800 text-slate-600' : 'bg-slate-700 hover:bg-slate-600'}`}
                                        >
                                            <Plus size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Transposition */}
                        {song.type !== 'lyrics' && (
                            <div className="mb-6">
                                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-2 block flex items-center gap-2">
                                    <Music size={12} /> Transposição {playlistItemId && <span className="text-purple-400 text-[10px] ml-1">(Playlist Ativa)</span>}
                                </label>

                                {/* Key Presets - HIDE FOR INTERNET SONGS */}
                                {!(songId === 'internet' || song.source === 'cifraclub') && (
                                    <div className="flex gap-1 mb-2 bg-slate-900/50 p-1 rounded-lg">
                                        <button
                                            onClick={() => { setActiveTab('original'); setTransposition(0); }}
                                            className={`flex-1 py-1.5 px-2 rounded text-[10px] font-bold transition ${activeTab === 'original' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            Original ({song.originalKey})
                                        </button>
                                        {playlistItemId && (
                                            <button
                                                onClick={() => { setActiveTab('church'); setTransposition(churchTransposition); }}
                                                className={`flex-1 py-1.5 px-2 rounded flex flex-col items-center justify-center transition ${activeTab === 'church' ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-slate-300 bg-slate-800/40'}`}
                                            >
                                                <span className="text-[9px] font-bold leading-tight uppercase">
                                                    {context?.type === 'setlist' ? 'Setlist' : 'Repertório'}
                                                </span>
                                                <div className="font-bold mt-0.5">
                                                    {getTransposedNote(song.originalKey, churchTransposition)}
                                                </div>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { setActiveTab('personal'); setTransposition(savedTransposition); }}
                                            className={`flex-1 py-1.5 px-2 rounded text-[10px] font-bold transition ${activeTab === 'personal' ? 'bg-green-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            Meu Tom ({getTransposedNote(song.originalKey, savedTransposition)})
                                        </button>
                                    </div>
                                )}

                                <div className="flex items-center gap-3 mb-6">
                                    {/* Transposition Controls Row */}
                                    <div className="flex-1 flex items-center justify-between bg-slate-900/50 rounded-lg p-1.5 border border-slate-700/30">
                                        <button
                                            onClick={() => {
                                                const newVal = transposition === 0 ? 11 : transposition - 1;
                                                handleTranspositionChange(newVal, false);
                                            }}
                                            className="w-9 h-9 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded-md transition active:scale-95"
                                        >
                                            <Minus size={18} />
                                        </button>
                                        
                                        <div className="text-center px-4">
                                            <span className="font-mono font-bold text-lg text-yellow-400 block leading-none">
                                                {absoluteKey}
                                            </span>
                                            <span className="text-[10px] text-slate-500 block leading-none mt-1">
                                                {transposition > 0 ? `+${transposition}` : transposition === 0 ? 'Original' : transposition}
                                            </span>
                                        </div>

                                        <button
                                            onClick={() => {
                                                const newVal = transposition === 11 ? 0 : transposition + 1;
                                                handleTranspositionChange(newVal, false);
                                            }}
                                            className="w-9 h-9 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded-md transition active:scale-95"
                                        >
                                            <Plus size={18} />
                                        </button>
                                    </div>

                                    {/* Compact Manual Save Icon - HIDE FOR INTERNET SONGS */}
                                    {!(songId === 'internet' || song.source === 'cifraclub') && (
                                        <button
                                            onClick={handleManualSave}
                                            disabled={isSaveDisabled()}
                                            title={isSaveDisabled() ? "Salvo" :
                                                activeTab === 'original' ? "Atualizar Tom Original" :
                                                    `Salvar ${activeTab === 'church' ? 'Igreja' : 'Meu Tom'}`
                                            }
                                            className={`
                                                w-12 h-12 flex items-center justify-center rounded-lg transition-all duration-300
                                                ${isSaveDisabled()
                                                    ? 'text-slate-600 bg-slate-800/50 cursor-default'
                                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg active:scale-95'
                                                }
                                            `}
                                        >
                                            {isSaveDisabled() ? <Check size={20} /> : <Save size={20} />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}


                        {/* 1. Font Size */}
                        <div className="mb-5">
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider flex items-center gap-2">
                                    <Type size={12} /> Tamanho (pt)
                                </label>
                                <span className="font-mono text-xs text-purple-400 font-bold">
                                    {viewMode === 'pages' ? printFontSize : fontSize}pt
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (viewMode === 'pages') setPrintFontSize(prev => Math.max(8, prev - 1));
                                        else setFontSize(prev => Math.max(8, prev - 1));
                                    }}
                                    className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 border border-slate-700 flex items-center justify-center font-bold text-sm shrink-0 transition"
                                    title="Diminuir tamanho"
                                >
                                    <Minus size={14} />
                                </button>
                                <input
                                    type="range"
                                    min="8"
                                    max="48"
                                    step="1"
                                    value={viewMode === 'pages' ? printFontSize : fontSize}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        if (viewMode === 'pages') setPrintFontSize(val);
                                        else setFontSize(val);
                                    }}
                                    className="flex-1 accent-purple-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (viewMode === 'pages') setPrintFontSize(prev => Math.min(48, prev + 1));
                                        else setFontSize(prev => Math.min(48, prev + 1));
                                    }}
                                    className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 border border-slate-700 flex items-center justify-center font-bold text-sm shrink-0 transition"
                                    title="Aumentar tamanho"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>

                        {/* 2. Line Spacing */}
                        <div className="mb-5">
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider flex items-center gap-2">
                                    <AlignJustify size={12} /> Espaçamento
                                </label>
                                <span className="font-mono text-xs text-purple-400 font-bold">
                                    {lineSpacing.toFixed(1)}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setLineSpacing(prev => Math.max(0.5, parseFloat((prev - 0.1).toFixed(1))))}
                                    className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 border border-slate-700 flex items-center justify-center font-bold text-sm shrink-0 transition"
                                    title="Diminuir espaçamento"
                                >
                                    <Minus size={14} />
                                </button>
                                <input
                                    type="range"
                                    min="0.5"
                                    max="3.0"
                                    step="0.1"
                                    value={lineSpacing}
                                    onChange={(e) => setLineSpacing(parseFloat(e.target.value))}
                                    className="flex-1 accent-purple-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                />
                                <button
                                    type="button"
                                    onClick={() => setLineSpacing(prev => Math.min(3.0, parseFloat((prev + 0.1).toFixed(1))))}
                                    className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 border border-slate-700 flex items-center justify-center font-bold text-sm shrink-0 transition"
                                    title="Aumentar espaçamento"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>

                        {/* 3. Letter Spacing */}
                        <div className="mb-5">
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="text-xs text-slate-400 uppercase font-bold tracking-wider flex items-center gap-2">
                                    <AlignJustify size={12} /> Espaçamento Letras
                                </label>
                                <span className="font-mono text-xs text-purple-400 font-bold">
                                    {letterSpacing}px
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setLetterSpacing(prev => Math.max(-2, prev - 0.5))}
                                    className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 border border-slate-700 flex items-center justify-center font-bold text-sm shrink-0 transition"
                                    title="Diminuir espaçamento de letras"
                                >
                                    <Minus size={14} />
                                </button>
                                <input
                                    type="range"
                                    min="-2"
                                    max="4"
                                    step="0.5"
                                    value={letterSpacing}
                                    onChange={(e) => setLetterSpacing(parseFloat(e.target.value))}
                                    className="flex-1 accent-purple-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                />
                                <button
                                    type="button"
                                    onClick={() => setLetterSpacing(prev => Math.min(4, prev + 0.5))}
                                    className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 border border-slate-700 flex items-center justify-center font-bold text-sm shrink-0 transition"
                                    title="Aumentar espaçamento de letras"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>

                        {/* 4. Tab Font Size (Only visible smoothly when displayMode !== 'no_tabs') */}
                        <div className={`
                            transition-all duration-300 ease-in-out transform origin-top overflow-hidden
                            ${displayMode !== 'no_tabs' 
                                ? 'opacity-100 max-h-36 scale-y-100 mt-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20' 
                                : 'opacity-0 max-h-0 scale-y-95 mt-0 p-0 border-0 pointer-events-none'
                            }
                        `}>
                            <div className="flex items-center justify-between mb-1.5 gap-2">
                                <label className="text-xs text-amber-400/90 uppercase font-bold tracking-wider flex items-center gap-2 whitespace-nowrap" title="0 = Automático (70% do texto)">
                                    <Type size={12} className="italic" /> Tam. Tablatura
                                </label>
                                <span className="font-mono text-xs text-amber-400 font-bold whitespace-nowrap">
                                    {tabFontSize ? `${tabFontSize}pt` : 'Auto'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setTabFontSize(prev => Math.max(0, (prev || 0) - 1))}
                                    className="w-7 h-7 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-sm shrink-0 transition"
                                    title="Diminuir tamanho da tablatura"
                                >
                                    <Minus size={14} />
                                </button>
                                <input
                                    type="range"
                                    min="0"
                                    max="32"
                                    step="1"
                                    value={tabFontSize || 0}
                                    onChange={(e) => setTabFontSize(parseFloat(e.target.value))}
                                    className="flex-1 accent-amber-400 h-2 bg-slate-700/80 rounded-lg appearance-none cursor-pointer"
                                />
                                <button
                                    type="button"
                                    onClick={() => setTabFontSize(prev => Math.min(32, (prev || 0) + 1))}
                                    className="w-7 h-7 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-sm shrink-0 transition"
                                    title="Aumentar tamanho da tablatura"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>

                    </div>
                )}

                {/* Play/Pause FAB (Visible when menu is closed) */}
                {!menuOpen && (
                    <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className={`
                            w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300
                            ${isPlaying ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}
                        `}
                    >
                        {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
                    </button>
                )}


                {/* Main FAB */}
                <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className={`
                        w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300
                        ${menuOpen ? 'bg-slate-700 rotate-90 text-slate-400' : 'bg-slate-800 hover:bg-slate-700 text-white'}
                    `}
                >
                    {menuOpen ? <X size={24} /> : <Settings2 size={24} />}
                </button>

            </div>


            {/* Learning Modal */}
            {
                isLearningModalOpen && (
                    <LearningModal
                        links={song.youtubeLinks}
                        onClose={() => setIsLearningModalOpen(false)}
                        onSelect={(link) => {
                            openPlayer(link.url, link.title);
                            setIsLearningModalOpen(false);
                        }}
                        canEdit={isAdmin || (user && user.id === song.created_by)}
                    />
                )
            }

            {/* Next Song Modal Overlay */}
            {showNextSongModal && (
                <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in py-10">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl flex flex-col overflow-hidden text-center p-6 border border-slate-200 dark:border-slate-800 animate-in zoom-in-95">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                            Fim da música
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 mb-6 font-medium">
                            Deseja ir para a próxima música?
                        </p>
                        
                        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden p-1 shadow-inner gap-1">
                             <button
                                 onClick={() => setShowNextSongModal(false)}
                                 className="flex-1 py-3 px-2 font-bold rounded-lg transition-colors text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm flex items-center justify-center gap-2 text-sm"
                             >
                                 <ArrowLeft size={16} /> Cancelar 
                             </button>
                             <button
                                 onClick={() => {
                                      const { nextItem, navigate, context, currentIndex } = navRefs.current;
                                      if (nextItem) {
                                          navigate(`/player/${nextItem.id}`, {
                                              state: { song: nextItem, playlistItemId: nextItem.itemId, context, currentIndex: currentIndex + 1, initialTransposition: nextItem.transposition },
                                              replace: true
                                          });
                                      }
                                      setShowNextSongModal(false);
                                 }}
                                 className="flex-1 py-3 px-2 font-bold rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700 shadow-sm flex items-center justify-center gap-2 text-sm"
                             >
                                 Próxima <ArrowRight size={16} />
                             </button>
                        </div>
                    </div>
                </div>
            )}
            {showAddToPlaylistModal && (
                <AddToPlaylistModal
                    songId={song?.id}
                    onClose={() => setShowAddToPlaylistModal(false)}
                />
            )}
        </div >
    );
}

function Header({ song, currentKey, isPlaylist, context, currentIndex }) {
    return (
        <div className="flex justify-between items-start mb-2 md:mb-6 border-b border-slate-900 dark:border-slate-700 pb-1 md:pb-2 break-inside-avoid">
            {/* Left Side: Title & Artist */}
            <div>
                {/* Context Info */}
                {context && (
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full mb-1 inline-block">
                            {context.type === 'setlist' ? 'Setlist' : 'Playlist'}
                        </span>
                        <div className="text-xs text-slate-500 font-medium truncate max-w-[200px]">
                            {context.name} • {currentIndex + 1}/{context.items.length}
                        </div>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <h1 className="text-xl md:text-3xl font-bold uppercase tracking-tight leading-none text-slate-900 dark:text-slate-100">{song.title}</h1>
                    {song.isOfficial && (
                        <BadgeCheck size={24} className="text-blue-500 fill-blue-500/10 flex-shrink-0" aria-label="Música Oficial" />
                    )}
                </div>
                <p className="text-sm md:text-lg text-slate-600 dark:text-slate-400 font-semibold mt-0.5 md:mt-1">{song.artist}</p>
            </div>

            {/* Right Side: Logo & Keys */}
            <div className="flex flex-col items-end gap-1 md:gap-2">
                {/* Logo */}
                <img src="/logo_official.png" alt="LouvorPlay" className="h-6 md:h-10 object-contain select-none opacity-80 dark:opacity-60" />

                {/* Keys */}
                <div className="flex flex-col items-end gap-0.5 md:gap-1">
                    <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
                        Original: <strong className="text-slate-600 dark:text-slate-400 normal-case">{song.originalKey}</strong>
                    </div>
                    <div className="text-xs md:text-sm font-mono text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 px-1.5 md:px-2 py-0.5 rounded bg-slate-50 dark:bg-slate-800 shadow-sm">
                        {isPlaylist ? "Meu: " : "Tom: "} <strong className="text-black dark:text-white">{currentKey}</strong>
                    </div>
                </div>
            </div>
        </div>
    );
}

function LearningModal({ links, onClose, onSelect, canEdit }) {
    const navigate = useNavigate();
    const { id } = useParams(); // Get song ID to navigate to editor

    return (
        <Portal>
            <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <GraduationCap className="text-red-600" size={24} />
                            Aprender
                        </h3>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="p-4 pb-safe flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
                        {links && links.length > 0 ? (
                            links.map((link, i) => (
                                <button
                                    key={i}
                                    onClick={() => {
                                        if (link.type === 'file') {
                                            window.open(link.url, '_blank');
                                        } else {
                                            onSelect(link);
                                        }
                                    }}
                                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition group text-left border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                                >
                                    <div className={`
                                    w-10 h-10 rounded-full flex items-center justify-center shrink-0 group-hover:scale-110 transition
                                    ${link.type === 'file' ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-600' : 'bg-red-100 dark:bg-red-900/20 text-red-600'}
                                `}>
                                        {link.type === 'file' ? <FileText size={20} /> : <PlayCircle size={20} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">{link.title || `Item ${i + 1}`}</h4>
                                        <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
                                            <span className="uppercase text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                                {link.type === 'file' ? 'ARQUIVO' : 'VÍDEO'}
                                            </span>
                                            <span className="truncate">{link.url}</span>
                                        </div>
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="text-center py-6 text-slate-500">
                                <GraduationCap size={48} className="mx-auto mb-2 opacity-20" />
                                {canEdit ? (
                                    <>
                                        <p className="mb-4">Nenhum vídeo cadastrado para esta música.</p>
                                        <button
                                            onClick={() => navigate(`/editor/${id}`)}
                                            className="px-4 py-2 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition"
                                        >
                                            Adicionar Vídeos
                                        </button>
                                    </>
                                ) : (
                                    <p className="mb-4">Sem vídeos e arquivos disponíveis por enquanto.</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Portal>
    );
}
