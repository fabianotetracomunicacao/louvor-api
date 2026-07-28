import React, { useState, useRef, useEffect } from 'react';
import { Bell, Check, X, Music, MessageSquare, UserPlus, Trash2 } from 'lucide-react';
import { useNotification } from '../contexts/NotificationContext';
import { useData } from '../contexts/DataContext';
import { respondToInvite } from '../utils/storage';
import { useNavigate } from 'react-router-dom';

export function NotificationBell() {
    const { notifications, unreadCount, markAsRead, markAllAsRead, showToast, fetchNotifications } = useNotification();
    const { refreshPlaylists } = useData();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const navigate = useNavigate();

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleAction = async (notification, accept) => {
        if (notification.type !== 'invite') return;

        try {
            await respondToInvite(notification.id, accept, notification.data);
            showToast(accept ? "Convite aceito!" : "Convite recusado.", accept ? "success" : "info");

            // Refresh data
            await fetchNotifications();
            if (accept) {
                await refreshPlaylists();
                // Backup refresh for safety (latency)
                setTimeout(() => refreshPlaylists(), 1000);
            }
        } catch (error) {
            console.error("Error responding to invite:", error);
            showToast("Erro ao processar convite.", "error");
        }
    };

    const handleNotificationClick = (notification) => {
        // 1. Mark as read
        if (!notification.is_read) {
            markAsRead(notification.id);
        }

        // 2. Close dropdown
        setIsOpen(false);

        // 3. Navigation Logic
        const { type, data, link } = notification;

        if (link) {
            navigate(link);
        } else if (type === 'new_setlist' && data?.playlistId) {
            navigate(`/playlist/${data.playlistId}`, { state: { view: 'setlists' } });
        } else if (data?.playlistId) {
            // Navigate to playlist for invites, comments, new songs
            // Pass 'openChat' state if it's a message
            const state = type === 'message' || type === 'playlist_comment' ? { openChat: true } : {};
            navigate(`/playlist/${data.playlistId}`, { state });
        } else if (data?.songId && (type === 'share_song' || type === 'song_share')) {
            // Share song
            navigate(`/player/${data.songId}`);
        }

    };

    const getIcon = (type) => {
        switch (type) {
            case 'invite': return <UserPlus size={18} className="text-blue-500" />;
            case 'song_added': return <Music size={18} className="text-purple-500" />;
            case 'message': return <MessageSquare size={18} className="text-green-500" />;
            default: return <Bell size={18} className="text-slate-500" />;
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition text-slate-600 dark:text-slate-300"
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white dark:border-slate-800">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="fixed top-16 right-2 left-2 z-[200] sm:absolute sm:right-0 sm:left-auto sm:top-full sm:mt-2 w-auto sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                        <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Notificações</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllAsRead}
                                className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                            >
                                Marcar todas como lidas
                            </button>
                        )}
                    </div>

                    <div className="max-h-[70vh] overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 text-sm">
                                <Bell size={32} className="mx-auto mb-2 opacity-20" />
                                Nenhuma notificação.
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {notifications.map(notification => (
                                    <div
                                        key={notification.id}
                                        onClick={() => handleNotificationClick(notification)}
                                        className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition relative group cursor-pointer ${!notification.is_read ? 'bg-purple-50/50 dark:bg-purple-900/10' : ''}`}
                                    >
                                        <div className="flex gap-3 relative z-10 pointer-events-none">
                                            <div className="mt-1 flex-shrink-0">
                                                {getIcon(notification.type)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                                    {notification.title}
                                                </p>
                                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                                                    {notification.message}
                                                </p>
                                                <p className="text-[10px] text-slate-400 mt-1">
                                                    {new Date(notification.created_at).toLocaleString()}
                                                </p>

                                                {/* Action Buttons for Pending Invites */}
                                                {notification.type === 'invite' && !notification.is_read && (
                                                    <div className="flex gap-2 mt-3 pointer-events-auto">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleAction(notification, true); }}
                                                            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1 transition"
                                                        >
                                                            <Check size={14} /> Aceitar
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleAction(notification, false); }}
                                                            className="flex-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1 transition"
                                                        >
                                                            <X size={14} /> Recusar
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            {!notification.is_read && (
                                                <div className="absolute top-4 right-4 w-2 h-2 bg-purple-500 rounded-full"></div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
