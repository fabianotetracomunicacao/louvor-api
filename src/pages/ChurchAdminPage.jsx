import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { InvitationService } from '../services/InvitationService';
import { useNotification } from '../contexts/NotificationContext';
import { 
    Users, UserPlus, Mail, Shield, AlertCircle, 
    CheckCircle, XCircle, Clock, Trash2, Settings, 
    Activity, ArrowUpRight, Plus, RefreshCw, Loader, CreditCard,
    Copy, Link as LinkIcon, Send
} from 'lucide-react';

export function ChurchAdminPage() {
    const { activeChurch, user: currentUser, isChurchAdmin, isSuperAdmin, subscriptionStatus } = useAuth();
    const { showToast, confirmAction } = useNotification();
    
    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState([]);
    const [invitations, setInvitations] = useState([]);
    const [capacity, setCapacity] = useState({
        leader: { occupied: 0, limit: 0 },
        worshiper: { occupied: 0, limit: 0 }
    });

    // Form & Resend State
    const [isInviting, setIsInviting] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('WORSHIPPER');
    const [sendingInvite, setSendingInvite] = useState(false);
    const [resendingId, setResendingId] = useState(null);

    useEffect(() => {
        if (activeChurch) {
            loadAll();
        }
    }, [activeChurch]);

    const loadAll = () => {
        setLoading(true);
        Promise.all([
            loadMembers(),
            loadInvitations(),
            updateCapacityState()
        ]).finally(() => setLoading(false));
    };

    const loadMembers = async () => {
        const { data, error } = await supabase
            .from('church_user_memberships')
            .select(`
                id,
                role,
                status,
                created_at,
                user_id,
                profile: profiles(*)
            `)
            .eq('church_id', activeChurch.id)
            .eq('status', 'active');

        if (error) {
            console.error('Error loading members:', error);
            showToast('Erro ao carregar membros.', 'error');
        } else {
            setMembers(data || []);
        }
    };

    const loadInvitations = async () => {
        try {
            const data = await InvitationService.listInvitations(activeChurch.id);
            setInvitations(data || []);
        } catch (err) {
            console.error('Error loading invitations:', err);
        }
    };

    const updateCapacityState = async () => {
        const [leaderCap, worshiperCap] = await Promise.all([
            InvitationService.checkCapacity(activeChurch.id, 'WORSHIP_LEADER'),
            InvitationService.checkCapacity(activeChurch.id, 'WORSHIPPER')
        ]);

        setCapacity({
            leader: { occupied: leaderCap.totalOccupied, limit: leaderCap.limit },
            worshiper: { occupied: worshiperCap.totalOccupied, limit: worshiperCap.limit }
        });
    };

    const handleCopyInviteLink = (token) => {
        const link = `${window.location.origin}/join/${token}`;
        navigator.clipboard.writeText(link);
        showToast('Link do convite copiado para a área de transferência!', 'success');
    };

    const handleResendInvite = async (invitationId) => {
        setResendingId(invitationId);
        try {
            await InvitationService.resendInvitation(invitationId);
            showToast('E-mail de convite reenviado com sucesso!', 'success');
        } catch (err) {
            if (err.isRateLimit) {
                showToast('Limite de e-mails atingido (429). Link do convite copiado!', 'info');
                if (err.invitationLink) {
                    navigator.clipboard.writeText(err.invitationLink).catch(() => {});
                }
            } else {
                showToast(err.message, 'error');
            }
        } finally {
            setResendingId(null);
        }
    };

    const handleSendInvite = async (e) => {
        e.preventDefault();
        setSendingInvite(true);
        try {
            await InvitationService.createInvitation(
                inviteEmail,
                inviteRole,
                activeChurch.id,
                currentUser.id
            );
            showToast('Convite enviado com sucesso!', 'success');
            setInviteEmail('');
            setIsInviting(false);
            loadInvitations();
            updateCapacityState();
        } catch (err) {
            if (err.isRateLimit) {
                showToast('Convite criado! Copie o link do convite na lista ao lado.', 'info');
                if (err.invitationLink) {
                    navigator.clipboard.writeText(err.invitationLink).catch(() => {});
                }
                setInviteEmail('');
                setIsInviting(false);
                loadInvitations();
                updateCapacityState();
            } else {
                showToast(err.message, 'error');
            }
        } finally {
            setSendingInvite(false);
        }
    };

    const handleCancelInvite = async (id) => {
        const confirmed = await confirmAction({
            title: 'Cancelar Convite',
            message: 'Deseja realmente cancelar este convite? A vaga será liberada.',
            confirmText: 'Cancelar Convite',
            type: 'danger'
        });
        if (!confirmed) return;

        try {
            await InvitationService.cancelInvitation(id);
            showToast('Convite cancelado.');
            loadInvitations();
            updateCapacityState();
        } catch (err) {
            showToast('Erro ao cancelar convite.', 'error');
        }
    };

    const handleRemoveMember = async (membershipId, userName) => {
        const confirmed = await confirmAction({
            title: 'Remover Membro',
            message: `Deseja remover ${userName} desta igreja? Esta ação revogará o acesso imediato.`,
            confirmText: 'Remover',
            type: 'danger'
        });
        if (!confirmed) return;

        const { error } = await supabase
            .from('church_user_memberships')
            .delete()
            .eq('id', membershipId);

        if (error) {
            showToast('Erro ao remover membro.', 'error');
        } else {
            showToast('Membro removido.');
            loadMembers();
            updateCapacityState();
        }
    };

    const roleLabels = {
        'CHURCH_ADMIN': 'Responsável',
        'WORSHIP_LEADER': 'Líder de Adoração',
        'WORSHIPPER': 'Adorador'
    };

    const CapacityCard = ({ title, occupied, limit, icon: Icon, color }) => {
        const percent = Math.min((occupied / limit) * 100, 100);
        const isFull = occupied >= limit;

        return (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700/50 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                    <div className={`p-3 rounded-2xl ${color} bg-opacity-10 text-${color.split('-')[1]}-600`}>
                        <Icon size={24} />
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</p>
                        <p className="text-2xl font-black text-slate-900 dark:text-white">
                            {occupied} <span className="text-slate-300 dark:text-slate-600">/ {limit}</span>
                        </p>
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-1000 ${isFull ? 'bg-rose-500' : color.replace('text-', 'bg-')}`}
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                    <p className={`text-[10px] font-bold uppercase tracking-wide ${isFull ? 'text-rose-500' : 'text-slate-500'}`}>
                        {isFull ? 'Limite Atingido' : `${limit - occupied} Vagas Disponíveis`}
                    </p>
                </div>
            </div>
        );
    };

    if (!isChurchAdmin && !isSuperAdmin) return (
        <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center space-y-4">
                <Shield size={48} className="mx-auto text-slate-200" />
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Acesso Negado</h2>
                <p className="text-slate-500">Você não tem permissão para gerenciar esta igreja.</p>
            </div>
        </div>
    );

    if (!activeChurch) return (
        <div className="p-8 text-center text-slate-500">
            Você não está vinculado a nenhuma igreja no momento.
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-purple-600 rounded-2xl shadow-lg shadow-purple-600/30">
                            <Shield className="text-white" size={28} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Gestão da Igreja</h1>
                            <p className="text-slate-500 dark:text-slate-400 font-medium">{activeChurch.name}</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button 
                        onClick={loadAll}
                        className="p-4 bg-white dark:bg-slate-800 text-slate-500 rounded-2xl border border-slate-100 dark:border-slate-700 hover:rotate-180 transition-transform duration-500"
                    >
                        <RefreshCw size={20} />
                    </button>
                    <button 
                        onClick={() => setIsInviting(true)}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-purple-500/20 active:scale-95 transition"
                    >
                        <UserPlus size={20} />
                        Convidar Equipe
                    </button>
                </div>
            </div>

            {/* Capacity Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <CapacityCard 
                    title="Líderes de Adoração" 
                    occupied={capacity.leader.occupied} 
                    limit={capacity.leader.limit} 
                    icon={Activity} 
                    color="bg-blue-500" 
                />
                <CapacityCard 
                    title="Adoradores" 
                    occupied={capacity.worshiper.occupied} 
                    limit={capacity.worshiper.limit} 
                    icon={Users} 
                    color="bg-emerald-500" 
                />
            </div>

            {/* Financial Overview (Only for Church Admin) */}
            {isChurchAdmin && (
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-900 dark:to-black rounded-[2.5rem] p-8 shadow-2xl border border-white/10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <CreditCard size={120} className="text-white" />
                    </div>
                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="space-y-2">
                            <h3 className="text-xl font-black text-white flex items-center gap-2">
                                <CreditCard className="text-purple-400" /> Gestão Financeira
                            </h3>
                            <p className="text-slate-400">Gerencie a assinatura e os pagamentos da sua igreja.</p>
                            
                            <div className="flex items-center gap-3 mt-4">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                    subscriptionStatus === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' :
                                    subscriptionStatus === 'OVERDUE' ? 'bg-rose-500/20 text-rose-400' :
                                    'bg-amber-500/20 text-amber-400'
                                }`}>
                                    Status: {subscriptionStatus === 'ACTIVE' ? 'Ativo' : subscriptionStatus === 'OVERDUE' ? 'Atrasado' : 'Pendente'}
                                </span>
                            </div>
                        </div>
                        
                        <button 
                            onClick={() => window.open('https://sandbox.asaas.com', '_blank')}
                            className="w-full md:w-auto bg-white text-slate-900 px-8 py-4 rounded-2xl font-black transition hover:bg-purple-100 flex items-center justify-center gap-2 shadow-xl shadow-black/20"
                        >
                            Acessar Portal de Pagamento <ArrowUpRight size={20} />
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Members List */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                            <Users size={20} className="text-purple-500" />
                            Equipe Ativa
                        </h3>
                        <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full uppercase">
                            {members.length} membros
                        </span>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-white/5 overflow-hidden shadow-sm">
                        <div className="divide-y divide-slate-50 dark:divide-white/5">
                            {members.length === 0 ? (
                                <div className="p-12 text-center space-y-3">
                                    <Users size={48} className="mx-auto text-slate-200" />
                                    <p className="text-slate-400 font-medium">Nenhum membro ativo encontrado.</p>
                                </div>
                            ) : members.map(m => (
                                <div key={m.id} className="p-6 flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center text-slate-500 font-black">
                                            {m.profile?.avatar_url ? (
                                                <img src={m.profile.avatar_url} className="w-full h-full rounded-2xl object-cover" />
                                            ) : (m.profile?.full_name?.charAt(0) || '?')}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900 dark:text-white">{m.profile?.full_name || 'Usuário sem nome'}</p>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                                                    m.role === 'CHURCH_ADMIN' ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' :
                                                    m.role === 'WORSHIP_LEADER' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                                                    'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                }`}>
                                                    {roleLabels[m.role]}
                                                </span>
                                                <span className="text-xs text-slate-400">{m.profile?.email}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {m.user_id !== currentUser.id && (
                                        <button 
                                            onClick={() => handleRemoveMember(m.id, m.profile?.full_name)}
                                            className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition"
                                            title="Remover Membro"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Invitations Sidebar */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                            <Mail size={20} className="text-pink-500" />
                            Convites
                        </h3>
                    </div>

                    <div className="bg-gradient-to-b from-white to-slate-50 dark:from-slate-800/50 dark:to-slate-900/50 rounded-[2rem] border border-slate-100 dark:border-white/5 p-6 space-y-6 shadow-sm">
                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {invitations.filter(i => i.status === 'pending').length === 0 ? (
                                <div className="text-center py-8 space-y-2">
                                    <Clock size={32} className="mx-auto text-slate-300" />
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Nenhum Convite Pendente</p>
                                </div>
                            ) : invitations.filter(i => i.status === 'pending').map(invite => (
                                <div key={invite.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-white/5 shadow-sm space-y-3 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-1">
                                        <button 
                                            onClick={() => handleCancelInvite(invite.id)}
                                            className="p-2 text-slate-300 hover:text-rose-500 transition"
                                            title="Cancelar"
                                        >
                                            <XCircle size={16} />
                                        </button>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate pr-6">{invite.email}</p>
                                        <p className="text-[10px] font-black uppercase text-purple-500 italic">{roleLabels[invite.role]}</p>
                                    </div>
                                    <div className="flex items-center justify-between pt-2 border-t border-slate-50 dark:border-white/5 gap-2">
                                        <button 
                                            onClick={() => handleCopyInviteLink(invite.token)}
                                            className="text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-purple-600 uppercase tracking-tighter flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg transition hover:scale-105"
                                            title="Copiar Link do Convite"
                                        >
                                            <Copy size={11} /> Copiar Link
                                        </button>
                                        <button 
                                            onClick={() => handleResendInvite(invite.id)}
                                            disabled={resendingId === invite.id}
                                            className="text-[10px] font-bold text-purple-600 hover:text-purple-700 uppercase tracking-tighter flex items-center gap-1 bg-purple-50 dark:bg-purple-900/30 px-2.5 py-1 rounded-lg transition hover:scale-105 disabled:opacity-50"
                                            title="Reenviar E-mail de Convite"
                                        >
                                            {resendingId === invite.id ? <Loader size={11} className="animate-spin" /> : <Send size={11} />}
                                            Reenviar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Recent History Toggle/Section can go here */}
                    </div>
                </div>
            </div>

            {/* Invite Modal */}
            {isInviting && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-8 space-y-6">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">Convidar para o Time</h3>
                                    <p className="text-sm text-slate-500">Mande um convite para expandir sua equipe.</p>
                                </div>
                                <button onClick={() => setIsInviting(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition text-slate-400">
                                    <XCircle size={24} />
                                </button>
                            </div>

                            <form onSubmit={handleSendInvite} className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Email do Convidado</label>
                                    <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl border border-transparent focus-within:border-purple-500 focus-within:bg-white dark:focus-within:bg-slate-800 transition-all">
                                        <Mail className="text-slate-400" size={20} />
                                        <input 
                                            required
                                            type="email" 
                                            placeholder="exemplo@email.com"
                                            value={inviteEmail}
                                            onChange={e => setInviteEmail(e.target.value)}
                                            className="bg-transparent outline-none w-full text-slate-900 dark:text-white font-bold"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Função Ministerial</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button 
                                            type="button"
                                            onClick={() => setInviteRole('WORSHIPPER')}
                                            className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${inviteRole === 'WORSHIPPER' ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20' : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:border-slate-200'}`}
                                        >
                                            <Users size={20} className={inviteRole === 'WORSHIPPER' ? 'text-purple-600' : 'text-slate-400'} />
                                            <span className={`text-xs font-black uppercase ${inviteRole === 'WORSHIPPER' ? 'text-purple-600' : 'text-slate-500'}`}>Adorador</span>
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setInviteRole('WORSHIP_LEADER')}
                                            className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${inviteRole === 'WORSHIP_LEADER' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:border-slate-200'}`}
                                        >
                                            <Activity size={20} className={inviteRole === 'WORSHIP_LEADER' ? 'text-blue-600' : 'text-slate-400'} />
                                            <span className={`text-xs font-black uppercase ${inviteRole === 'WORSHIP_LEADER' ? 'text-blue-600' : 'text-slate-500'}`}>Líder</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="pt-4">
                                    <button 
                                        disabled={sendingInvite}
                                        type="submit"
                                        className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-4 rounded-2xl font-black text-lg transition hover:bg-purple-600 dark:hover:bg-purple-100 hover:text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {sendingInvite ? <Loader className="animate-spin" /> : <Plus />}
                                        Enviar Convite
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
