import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { InvitationService } from '../services/InvitationService';
import { Shield, CheckCircle, AlertTriangle, UserPlus, LogIn, Loader } from 'lucide-react';

export function InvitationAcceptPage() {
    const { token } = useParams();
    const { user, login } = useAuth();
    const navigate = useNavigate();
    
    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [invitation, setInvitation] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        loadInvitation();
    }, [token]);

    const loadInvitation = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await InvitationService.getInvitationMetadata(token);
            setInvitation(data);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Erro ao carregar convite.');
        } finally {
            setLoading(false);
        }
    };

    const handleAccept = async () => {
        if (!user) return;
        setAccepting(true);
        try {
            await InvitationService.acceptInvitation(token, user.id, user.email);
            // Refresh page/context logic or just navigate home
            window.location.href = '/'; // Hard reload to refresh all context/RLS
        } catch (err) {
            console.error(err);
            setError('Erro ao aceitar convite: ' + err.message);
            setAccepting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4">
                <Loader className="animate-spin text-purple-600" size={40} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-4">
                    <AlertTriangle className="mx-auto text-rose-500" size={48} />
                    <h2 className="text-2xl font-bold dark:text-white">Ops! Algo deu errado</h2>
                    <p className="text-slate-500 dark:text-slate-400">{error}</p>
                    <button 
                        onClick={() => navigate('/')}
                        className="w-full bg-slate-100 dark:bg-slate-700 py-3 rounded-xl font-bold dark:text-white"
                    >
                        Voltar para o Início
                    </button>
                </div>
            </div>
        );
    }

    const roleMap = {
        'CHURCH_ADMIN': 'Responsável da Igreja',
        'WORSHIP_LEADER': 'Líder de Adoração',
        'WORSHIPPER': 'Adorador'
    };

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
            <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl max-w-md w-full space-y-8 border border-white/10">
                <div className="text-center space-y-2">
                    <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-purple-500/30 mb-4 transform rotate-3">
                        <Shield size={40} className="text-white -rotate-3" />
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Convite Especial!</h1>
                    <p className="text-slate-500 dark:text-slate-400">
                        <span className="font-bold text-purple-500">{invitation.invited_by?.full_name}</span> convidou você para fazer parte da
                    </p>
                    <div className="py-2 px-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl inline-block">
                        <span className="text-xl font-bold text-purple-700 dark:text-purple-300">{invitation.church?.name}</span>
                    </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-4">
                    <div className="flex items-start gap-4">
                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-600">
                            <CheckCircle size={20} />
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-900 dark:text-white">Sua Função</h4>
                            <p className="text-sm text-slate-500">{roleMap[invitation.role] || invitation.role}</p>
                        </div>
                    </div>
                    <p className="text-xs text-slate-400 italic">
                        Ao aceitar, você terá acesso ao repertório, escalas e ferramentas de projeção desta igreja.
                    </p>
                </div>

                {!user ? (
                    <div className="space-y-3">
                        <p className="text-center text-sm font-medium text-slate-600 dark:text-slate-400">
                            Para aceitar o convite, você precisa estar logado.
                        </p>
                        <button
                            onClick={() => navigate(`/login?redirect=/join/${token}`)}
                            className="w-full flex items-center justify-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-4 rounded-2xl font-black transition hover:scale-[1.02] active:scale-95 shadow-xl"
                        >
                            <LogIn size={20} />
                            Fazer Login
                        </button>
                        <button
                            onClick={() => navigate(`/signup?redirect=/join/${token}`)}
                            className="w-full flex items-center justify-center gap-2 bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white py-4 rounded-2xl font-black transition hover:border-purple-500"
                        >
                            <UserPlus size={20} />
                            Criar Nova Conta
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
                            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-500">
                                {user.email.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-500">Logado como:</p>
                                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{user.email}</p>
                            </div>
                        </div>

                        <button
                            onClick={handleAccept}
                            disabled={accepting}
                            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-4 rounded-2xl font-black text-lg transition hover:shadow-2xl hover:shadow-purple-500/40 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {accepting ? <Loader className="animate-spin" size={24} /> : 'Aceitar Convite'}
                        </button>
                        
                        <button
                            onClick={() => navigate('/')}
                            className="w-full text-slate-400 dark:text-slate-500 text-sm font-medium hover:text-slate-600 transition"
                        >
                            Não aceitar agora
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
