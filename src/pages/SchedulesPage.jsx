import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, ChevronRight, Play, MonitorUp, CheckCircle2, XCircle, AlertCircle, Check, X, Loader2, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getMySchedules } from '../utils/storage';
import { WhatsAppService } from '../services/WhatsAppService';
import { useNotification } from '../contexts/NotificationContext';
import { LiquidLoader } from '../components/LiquidLoader';

export function SchedulesPage() {
    const [schedules, setSchedules] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState(null);
    const [declineModalItem, setDeclineModalItem] = useState(null);
    const [declineReason, setDeclineReason] = useState('');
    const [isSubmittingDecline, setIsSubmittingDecline] = useState(false);

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

    const parseLocalDate = (dateStr) => {
        if (!dateStr) return null;
        const raw = String(dateStr);
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        const d = match
            ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
            : new Date(raw);
        return Number.isNaN(d.getTime()) ? null : d;
    };

    const formatDate = (dateStr, timeStr) => {
        const d = parseLocalDate(dateStr);
        if (!d) return 'Data não definida';
        const dateText = d.toLocaleDateString('pt-BR');
        const timeMatch = timeStr ? String(timeStr).match(/^(\d{2}):(\d{2})/) : null;
        return timeMatch ? `${dateText} às ${timeMatch[1]}:${timeMatch[2]}` : dateText;
    };

    const isFuture = (dateStr) => {
        if (!dateStr) return true;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const d = parseLocalDate(dateStr);
        if (!d) return true;
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

    const handleConfirmPresence = async (e, item) => {
        e.stopPropagation();
        setUpdatingId(item.id);
        try {
            await WhatsAppService.updateScaleStatus(item.id, 'CONFIRMED');
            setSchedules(prev => prev.map(s => s.id === item.id ? {
                ...s,
                status: 'CONFIRMED',
                confirmed_at: new Date().toISOString()
            } : s));
            showToast('Sua presença foi confirmada com sucesso! 🙌', 'success');
        } catch (error) {
            console.error("Erro ao confirmar presença:", error);
            showToast('Erro ao confirmar presença. Tente novamente.', 'error');
        } finally {
            setUpdatingId(null);
        }
    };

    const handleOpenDeclineModal = (e, item) => {
        e.stopPropagation();
        setDeclineModalItem(item);
        setDeclineReason('');
    };

    const handleConfirmDecline = async () => {
        if (!declineModalItem) return;
        setIsSubmittingDecline(true);
        try {
            await WhatsAppService.updateScaleStatus(declineModalItem.id, 'DECLINED', declineReason);
            setSchedules(prev => prev.map(s => s.id === declineModalItem.id ? {
                ...s,
                status: 'DECLINED',
                declined_at: new Date().toISOString(),
                decline_reason: declineReason
            } : s));
            showToast('Ausência/Recusa informada com sucesso.', 'info');
            setDeclineModalItem(null);
            setDeclineReason('');
        } catch (error) {
            console.error("Erro ao recusar escala:", error);
            showToast('Erro ao recusar presença. Tente novamente.', 'error');
        } finally {
            setIsSubmittingDecline(false);
        }
    };

    if (isLoading) {
        return <LiquidLoader fullScreen={true} />;
    }

    const RenderScaleItem = ({ item }) => {
        const status = item.status || 'PENDING';
        const isConfirmed = status === 'CONFIRMED';
        const isDeclined = status === 'DECLINED';
        const isPending = !isConfirmed && !isDeclined;

        return (
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
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-slate-900 dark:text-white truncate group-hover:text-purple-600 transition">
                                {item.setlist.name}
                            </h3>
                            {isConfirmed && (
                                <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                                    <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                                    <span>Confirmado</span>
                                </span>
                            )}
                            {isDeclined && (
                                <span className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 px-2.5 py-0.5 rounded-full text-xs font-semibold" title={item.decline_reason ? `Motivo: ${item.decline_reason}` : undefined}>
                                    <XCircle size={13} className="text-rose-600 dark:text-rose-400 shrink-0" />
                                    <span>Recusado</span>
                                </span>
                            )}
                            {isPending && (
                                <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                                    <AlertCircle size={13} className="text-amber-500 shrink-0" />
                                    <span>Aguardando Confirmação</span>
                                </span>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                            <div className="flex items-center gap-1 text-xs text-slate-500">
                                <Clock size={14} />
                                {formatDate(item.setlist.date, item.setlist.service_time)}
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
                    <ChevronRight size={20} className="text-slate-300 group-hover:text-purple-500 transition shrink-0 self-center" />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                    <div className="flex items-center gap-2">
                        {updatingId === item.id ? (
                            <span className="text-xs text-slate-400 flex items-center gap-1.5 px-3 py-1.5">
                                <Loader2 size={14} className="animate-spin" /> Atualizando...
                            </span>
                        ) : (
                            <>
                                {!isConfirmed && (
                                    <button
                                        onClick={(e) => handleConfirmPresence(e, item)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-xs transition"
                                        title="Confirmar presença nesta escala"
                                    >
                                        <Check size={14} />
                                        <span>Confirmar Presença</span>
                                    </button>
                                )}
                                {!isDeclined && (
                                    <button
                                        onClick={(e) => handleOpenDeclineModal(e, item)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-rose-50 dark:bg-slate-700 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-600 rounded-lg font-bold text-xs transition"
                                        title="Recusar ou cancelar presença nesta escala"
                                    >
                                        <X size={14} />
                                        <span>{isConfirmed ? 'Cancelar' : 'Recusar'}</span>
                                    </button>
                                )}
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={(e) => handlePlayScale(e, item)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold text-xs shadow-md shadow-purple-500/20 transition"
                            title="Tocar esta escala"
                        >
                            <Play size={13} fill="currentColor" />
                            <span>Tocar</span>
                        </button>
                        <button
                            onClick={(e) => handleProjectScale(e, item)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg font-bold text-xs transition"
                            title="Projetar músicas da escala"
                        >
                            <MonitorUp size={13} />
                            <span>Projetar</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    };

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
                    <p className="text-sm text-slate-500">Visualize onde você está escalado para tocar e confirme sua presença</p>
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
                            <div className="grid gap-3 opacity-80">
                                {past.map(item => <RenderScaleItem key={item.id} item={item} />)}
                            </div>
                        </section>
                    )}
                </>
            )}

            {/* Modal de Motivo de Ausência/Recusa */}
            {declineModalItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-lg">
                                <XCircle size={22} />
                                <span>Informar Ausência</span>
                            </div>
                            <button
                                onClick={() => setDeclineModalItem(null)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            Você está alterando sua presença na escala <strong>{declineModalItem.setlist?.name}</strong> ({formatDate(declineModalItem.setlist?.date)}).
                        </p>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                <MessageSquare size={13} />
                                <span>Motivo (Opcional)</span>
                            </label>
                            <textarea
                                rows={3}
                                value={declineReason}
                                onChange={(e) => setDeclineReason(e.target.value)}
                                placeholder="Ex.: Viagem, compromisso de trabalho..."
                                className="w-full text-sm p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500 focus:outline-none resize-none"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={() => setDeclineModalItem(null)}
                                disabled={isSubmittingDecline}
                                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl font-semibold text-sm transition"
                            >
                                Voltar
                            </button>
                            <button
                                onClick={handleConfirmDecline}
                                disabled={isSubmittingDecline}
                                className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-sm shadow-md shadow-rose-500/20 transition disabled:opacity-50"
                            >
                                {isSubmittingDecline ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                                <span>Confirmar Ausência</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
