import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Music, ArrowRight, User, List, ChevronRight, Play, MonitorUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getMySchedules } from '../utils/storage';
import { useNotification } from '../contexts/NotificationContext';
import { LiquidLoader } from '../components/LiquidLoader';

export function SchedulesPage() {
    const [schedules, setSchedules] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();
    const { showToast } = useNotification();

    useEffect(() => {
        const loadSchedules = async () => {
            try {
                const data = await getMySchedules();
                setSchedules(data);
            } catch (error) {
                console.error("Error loading schedules:", error);
            } finally {
                setIsLoading(false);
            }
        };
        loadSchedules();
    }, []);

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Data não definida';
        const d = new Date(dateStr);
        return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    };

    const isFuture = (dateStr) => {
        if (!dateStr) return true;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const d = new Date(dateStr);
        return d >= today;
    };

    const handlePlayScale = (e, item) => {
        e.stopPropagation();
        const setlist = item.setlist;
        if (!setlist || !setlist.items || setlist.items.length === 0) {
            showToast('Esta escala não possui músicas cadastradas no momento.', 'info');
            return;
        }

        const firstItem = setlist.items[0];
        const firstSongId = firstItem.song?.id || firstItem.song_id;

        if (!firstSongId) {
            showToast('Não foi possível carregar a primeira música da escala.', 'warning');
            return;
        }

        navigate(`/player/${firstSongId}`, {
            state: {
                context: {
                    type: 'setlist',
                    id: setlist.id,
                    title: setlist.name,
                    items: setlist.items.map(si => ({
                        id: si.song?.id || si.song_id,
                        playlistItemId: si.id,
                        title: si.song?.title,
                        artist: si.song?.artist,
                        tone: si.custom_transposition || 0,
                        song: si.song
                    }))
                },
                song: firstItem.song,
                playlistItemId: firstItem.id,
                currentIndex: 0,
                initialTransposition: firstItem.custom_transposition || 0
            }
        });
    };

    const handleProjectScale = (e, item) => {
        e.stopPropagation();
        const setlist = item.setlist;
        if (!setlist || !setlist.items || setlist.items.length === 0) {
            showToast('Esta escala não possui músicas cadastradas para projetar.', 'info');
            return;
        }

        const firstItem = setlist.items[0];
        const firstSongId = firstItem.song?.id || firstItem.song_id;

        if (!firstSongId) {
            showToast('Não foi possível carregar as músicas da escala.', 'warning');
            return;
        }

        navigate(`/projector?songId=${firstSongId}`);
    };

    if (isLoading) {
        return <LiquidLoader fullScreen={true} />;
    }

    const RenderScaleItem = ({ item }) => (
        <div
            key={item.id}
            onClick={() => navigate(`/playlist/${item.setlist.playlist_id}?tab=setlists&filter=my-scales`)}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:shadow-md transition cursor-pointer group"
        >
            <div className="flex gap-4 items-start">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${isFuture(item.setlist.date) ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
                    <Calendar size={24} />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 dark:text-white truncate group-hover:text-purple-600 transition">
                        {item.setlist.name}
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Clock size={14} />
                            {formatDate(item.setlist.date)}
                        </div>
                        <div className="flex items-start gap-1 text-xs text-slate-500">
                            <User size={14} className="mt-0.5" />
                            <div className="flex flex-wrap gap-1">
                                {(item.role || 'Músico').split(' + ').map((role, idx) => (
                                    <span key={idx} className="bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-800 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                                        {role}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 self-center shrink-0">
                    <button
                        onClick={(e) => handlePlayScale(e, item)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold text-xs shadow-md shadow-purple-500/20 transition"
                        title="Tocar esta escala"
                    >
                        <Play size={14} fill="currentColor" />
                        <span>Tocar</span>
                    </button>
                    <button
                        onClick={(e) => handleProjectScale(e, item)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg font-bold text-xs transition"
                        title="Projetar músicas da escala"
                    >
                        <MonitorUp size={14} />
                        <span>Projetar</span>
                    </button>
                    <ChevronRight size={20} className="text-slate-300 group-hover:text-purple-500 transition" />
                </div>
            </div>
        </div>
    );

    const upcoming = schedules.filter(s => isFuture(s.setlist?.date));
    const past = schedules.filter(s => !isFuture(s.setlist?.date));

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-500">
            <header className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-purple-200 dark:shadow-none">
                    <Calendar size={24} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Minhas Escalas</h1>
                    <p className="text-sm text-slate-500">Visualize onde você está escalado para tocar</p>
                </div>
            </header>

            {schedules.length === 0 ? (
                <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                        <Calendar size={32} />
                    </div>
                    <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200">Nenhuma escala encontrada</h2>
                    <p className="text-sm text-slate-500 max-w-xs mx-auto mt-2">Você ainda não foi adicionado a nenhuma escala ministerial.</p>
                </div>
            ) : (
                <>
                    {upcoming.length > 0 && (
                        <section className="space-y-4">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 px-1">Próximas Escalas</h2>
                            <div className="grid gap-3">
                                {upcoming.map(item => <RenderScaleItem key={item.id} item={item} />)}
                            </div>
                        </section>
                    )}

                    {past.length > 0 && (
                        <section className="space-y-4">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 px-1">Histórico</h2>
                            <div className="grid gap-3 opacity-70">
                                {past.map(item => <RenderScaleItem key={item.id} item={item} />)}
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}
