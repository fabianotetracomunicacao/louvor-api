import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, ArrowRight, Loader, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { exchangeAuthRedirectFromUrl } from '../utils/authRedirect';

export function UpdatePasswordPage() {
    const { updatePassword } = useAuth();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    // Ensure session is active (Supabase handles recovery session automatically if clicking from email)
    useEffect(() => {
        const checkSession = async () => {
            const exchange = await exchangeAuthRedirectFromUrl(supabase);
            if (exchange.error) {
                console.warn('Password recovery exchange error:', exchange.error);
            }
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                // If no session, it might be an invalid or expired link
                // We'll let the user try anyway, but updatePassword will fail if session is missing
            }
        };
        checkSession();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (password !== confirmPassword) {
            setError('As senhas não coincidem.');
            return;
        }

        if (password.length < 6) {
            setError('A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        setLoading(true);

        try {
            await updatePassword(password);
            setSuccess(true);
            setTimeout(() => {
                navigate('/login');
            }, 3000);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Erro ao atualizar senha. O link pode ter expirado.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
                <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
                    <img src="/worship-desktop.png" alt="Worship" className="w-full h-full object-cover object-center opacity-50" />
                </div>
                
                <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-8 rounded-2xl shadow-2xl w-full max-w-md relative z-10 text-center">
                    <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Senha Atualizada!</h2>
                    <p className="text-slate-600 dark:text-slate-400 mb-6">
                        Sua senha foi alterada com sucesso. Você será redirecionado para a página de login em instantes.
                    </p>
                    <button 
                        onClick={() => navigate('/login')}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg transition"
                    >
                        Ir para Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
            <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
                <img src="/worship-desktop.png" alt="Worship" className="w-full h-full object-cover object-center opacity-50" />
            </div>

            <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-8 rounded-2xl shadow-2xl w-full max-w-md relative z-10">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Nova Senha</h1>
                    <p className="text-slate-500 dark:text-slate-400">
                        Digite sua nova senha abaixo.
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-100 border border-red-200 text-red-700 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Nova Senha</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 text-slate-400" size={20} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white pl-10 pr-10 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                                placeholder="••••••••"
                                required
                                minLength={6}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                            >
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Confirmar Nova Senha</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 text-slate-400" size={20} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                className="w-full bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white pl-10 pr-10 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                                placeholder="••••••••"
                                required
                                minLength={6}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader className="animate-spin" /> : (
                            <>
                                Atualizar Senha <ArrowRight size={20} />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
