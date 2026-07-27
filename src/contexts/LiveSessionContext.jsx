import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const LiveSessionContext = createContext();

export function useLiveSession() {
    return useContext(LiveSessionContext);
}

export const LiveSessionProvider = ({ children }) => {
    // Session State
    const [isLiveEnabled, setIsLiveEnabled] = useState(false);
    const [currentSetlistId, setCurrentSetlistId] = useState(null);
    const [channel, setChannel] = useState(null);
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const location = useLocation();

    // Realtime Data
    const [leaderId, setLeaderId] = useState(null);
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [currentUserId, setCurrentUserId] = useState(null);

    // Incoming Sync Data
    const [remoteScrollPercent, setRemoteScrollPercent] = useState(null);
    const [remoteSongIndex, setRemoteSongIndex] = useState(null);
    const [remoteIsPlaying, setRemoteIsPlaying] = useState(null);
    const [remoteLineFocus, setRemoteLineFocus] = useState(null);

    // Refs to avoid dependency cycles in callbacks
    const isLiveRef = useRef(isLiveEnabled);
    const leaderIdRef = useRef(leaderId);
    const currentUserIdRef = useRef(currentUserId);
    const viewerOnlyRef = useRef(false);

    // Keep refs updated
    useEffect(() => { isLiveRef.current = isLiveEnabled; }, [isLiveEnabled]);
    useEffect(() => { leaderIdRef.current = leaderId; }, [leaderId]);
    useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);

    // Initialize current user (supports anonymous viewers like a church projector)
    useEffect(() => {
        const fetchUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setCurrentUserId(user.id);
            } else {
                // Generate a random ID for anonymous viewers
                const fallbackId = 'anon-' + Math.random().toString(36).substring(2, 15);
                setCurrentUserId(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : fallbackId);
            }
        };
        fetchUser();
    }, []);

    // Helper: Determine if I am the leader
    const isLeader = leaderId === currentUserId && currentUserId !== null;

    // Connect to a specific setlist room
    // NOTE: channel is in dependency array intentionally — this causes PlayerPage's
    // useEffect to re-run after connecting, but PlayerPage guards with !isLiveEnabled
    // so it will NOT reconnect. The key effect is that when currentUserId loads async,
    // the function reference changes and PlayerPage retries, succeeding this time.
    const connectToSession = useCallback(async (setlistId, options = {}) => {
        viewerOnlyRef.current = !!options.viewerOnly;

        if (!currentUserId) return; // Guard: wait for userId to be ready

        // Clean up any existing channel
        if (channel) {
            await supabase.removeChannel(channel);
        }

        setConnectionStatus('connecting');
        setCurrentSetlistId(setlistId);
        setIsLiveEnabled(true);
        setRemoteScrollPercent(null);
        setRemoteSongIndex(null);
        setRemoteIsPlaying(null);
        setRemoteLineFocus(null);
        setLeaderId(null);

        const roomName = `room_setlist_${setlistId}`;
        const newChannel = supabase.channel(roomName, {
            config: {
                presence: { key: currentUserId },
                broadcast: { ack: false }
            }
        });

        // 1. Presence sync — who is in the room
        newChannel.on('presence', { event: 'sync' }, () => {
            const state = newChannel.presenceState();
            const users = [];
            let foundLeader = null;

            for (const key in state) {
                users.push({ id: key, ...state[key][0] });
                if (state[key][0]?.isLeader) {
                    foundLeader = key;
                }
            }

            users.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            setOnlineUsers(users);

            if (!foundLeader && users.length > 0) {
                // Auto-assign leadership: oldest non-viewerOnly user becomes leader
                const eligible = users.filter(u => !u.viewerOnly);
                if (eligible.length > 0 && eligible[0].id === currentUserId && !viewerOnlyRef.current) {
                    newChannel.track({ isLeader: true, viewerOnly: false, timestamp: eligible[0].timestamp || Date.now() });
                    setLeaderId(currentUserId);
                }
            } else if (foundLeader) {
                setLeaderId(foundLeader);
            }
        });

        // 2. Broadcast events — scroll, song change, play state
        newChannel.on('broadcast', { event: 'sync_state' }, (payload) => {
            const { type, data, senderId } = payload.payload;

            // Ignore own broadcasts
            if (senderId === currentUserIdRef.current) return;

            if (type === 'scroll_update' && senderId === leaderIdRef.current) {
                setRemoteScrollPercent(data.percent);
            } else if (type === 'song_change' && senderId === leaderIdRef.current) {
                setRemoteSongIndex(data.index);
            } else if (type === 'play_state' && senderId === leaderIdRef.current) {
                setRemoteIsPlaying(data.isPlaying);
            } else if (type === 'section_change' && senderId === leaderIdRef.current) {
                setRemoteLineFocus(data.focusLineIndex);
            } else if (type === 'claim_leader') {
                setLeaderId(senderId);
                if (leaderIdRef.current === currentUserIdRef.current) {
                    newChannel.track({ isLeader: false, viewerOnly: viewerOnlyRef.current, timestamp: Date.now() });
                }
            } else if (type === 'request_full_sync' && leaderIdRef.current === currentUserIdRef.current) {
                window.dispatchEvent(new CustomEvent('live_sync_requested', { detail: { requesterId: senderId } }));
            } else if (type === 'full_sync' && senderId === leaderIdRef.current) {
                setRemoteSongIndex(data.index);
                setRemoteScrollPercent(data.percent);
                setRemoteIsPlaying(data.isPlaying);
                if (data.focusLineIndex !== undefined) {
                    setRemoteLineFocus(data.focusLineIndex);
                }
            }
        });

        // 3. Subscribe and track presence
        newChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                setConnectionStatus('connected');
                await newChannel.track({
                    isLeader: false,
                    viewerOnly: viewerOnlyRef.current,
                    timestamp: Date.now()
                });
                // Ask leader for full state
                await newChannel.send({
                    type: 'broadcast',
                    event: 'sync_state',
                    payload: { type: 'request_full_sync', senderId: currentUserId }
                });
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                setConnectionStatus('error');
            }
        });

        setChannel(newChannel);
    }, [currentUserId, channel]); // Both needed: userId for closure, channel for cleanup


    const disconnectFromSession = useCallback(async () => {
        setIsLiveEnabled(false);
        setCurrentSetlistId(null);
        setRemoteScrollPercent(null);
        setRemoteSongIndex(null);
        setRemoteIsPlaying(null);
        setRemoteLineFocus(null);

        if (channel) {
            await supabase.removeChannel(channel);
            setChannel(null);
        }
        setConnectionStatus('disconnected');
    }, [channel]);

    // Disconnect when leaving player/projector routes
    useEffect(() => {
        if (isLiveRef.current &&
            !location.pathname.startsWith('/player') &&
            !location.pathname.startsWith('/projector') &&
            !location.pathname.startsWith('/projetor')) {
            disconnectFromSession();
        }
    }, [location.pathname, disconnectFromSession]);

    // Claim Leadership
    const claimLeadership = useCallback(async () => {
        if (!channel || !currentUserId || viewerOnlyRef.current) return;

        setLeaderId(currentUserId);
        await channel.track({ isLeader: true, viewerOnly: false, timestamp: Date.now() });
        await channel.send({
            type: 'broadcast',
            event: 'sync_state',
            payload: { type: 'claim_leader', senderId: currentUserId }
        });
    }, [channel, currentUserId]);

    // Broadcast helpers (only runs if I am the leader)
    const broadcastScroll = useCallback(async (percent) => {
        if (!channel || leaderIdRef.current !== currentUserIdRef.current) return;
        await channel.send({
            type: 'broadcast', event: 'sync_state',
            payload: { type: 'scroll_update', senderId: currentUserIdRef.current, data: { percent } }
        });
    }, [channel]);

    const broadcastSongChange = useCallback(async (index) => {
        if (!channel || leaderIdRef.current !== currentUserIdRef.current) return;
        await channel.send({
            type: 'broadcast', event: 'sync_state',
            payload: { type: 'song_change', senderId: currentUserIdRef.current, data: { index } }
        });
    }, [channel]);

    const broadcastPlayState = useCallback(async (isPlaying) => {
        if (!channel || leaderIdRef.current !== currentUserIdRef.current) return;
        await channel.send({
            type: 'broadcast', event: 'sync_state',
            payload: { type: 'play_state', senderId: currentUserIdRef.current, data: { isPlaying } }
        });
    }, [channel]);

    const broadcastLineFocus = useCallback(async (focusLineIndex) => {
        if (!channel || leaderIdRef.current !== currentUserIdRef.current) return;
        await channel.send({
            type: 'broadcast', event: 'sync_state',
            payload: { type: 'section_change', senderId: currentUserIdRef.current, data: { focusLineIndex } }
        });
    }, [channel]);

    const broadcastFullSync = useCallback(async (index, percent, isPlaying) => {
        if (!channel || leaderIdRef.current !== currentUserIdRef.current) return;
        await channel.send({
            type: 'broadcast', event: 'sync_state',
            payload: { type: 'full_sync', senderId: currentUserIdRef.current, data: { index, percent, isPlaying, focusLineIndex: 0 } }
        });
    }, [channel]);


    const value = {
        isLiveEnabled,
        currentSetlistId,
        connectionStatus,
        isLeader,
        leaderId,
        currentUserId,
        onlineUsers,
        remoteScrollPercent,
        remoteSongIndex,
        remoteIsPlaying,
        remoteLineFocus,
        connectToSession,
        disconnectFromSession,
        claimLeadership,
        broadcastScroll,
        broadcastSongChange,
        broadcastPlayState,
        broadcastLineFocus,
        broadcastFullSync
    };

    return (
        <LiveSessionContext.Provider value={value}>
            {children}
        </LiveSessionContext.Provider>
    );
};
