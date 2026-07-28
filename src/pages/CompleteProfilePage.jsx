import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { Shield, Lock, Music, Phone, Loader, ArrowRight } from 'lucide-react';

export function CompleteProfilePage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useNotification();

    const [loading, setLoading] = useState(false);
    const [initializing, setInitializing] = useState(true);
    
    // Form state
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [instrument, setInstrument] = useState('');

    useEffect(() => {
        const checkSession = async () => {
            if (!user) {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    showToast('Faça login primeiro para continuar.', 'warning');
                    navigate('/');
                }
            } else {
                // Fetch profile data to prefill if exists
                const { data, error } = await supabase
                    .from('profiles')
                    .select('phone_number, phone, whatsapp, instrument')
                    .eq('id', user.id)
                    .single();
                    
                if (data && !error) {
                    const savedPhone = data.whatsapp || data.phone || data.phone_number || '';
                    if (savedPhone) setPhone(savedPhone);
                    if (data.instrument) setInstrument(data.instrument);
                }
            }
            setInitializing(false);
        };
        checkSession();
    }, [user, navigate, showToast]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (password.length > 0 && password.length < 6) {
            showToast('A senha precisa ter no mínimo 6 caracteres.', 'warning');
            return;
        }

        if (password !== confirmPassword) {
            showToast('As senhas não conferem.', 'warning');
            return;
        }

        setLoading(true);

        try {
            // 1. Update Auth User Password (if provided)
            if (password) {
                const { error: authError } = await supabase.auth.updateUser({
                    password: password
                });
                if (authError) throw authError;
            }

            // 2. Update Profile additional info - normalize phone for WhatsApp notifications
            const normalizePhone = (raw) => {
                if (!raw) return null;
                let digits = String(raw).replace(/\D/g, '');
                if (!digits) return null;
                if (!digits.startsWith('55')) digits = `55${digits}`;
                // 55 + DDD(2) + 8 digits = 12 → insert 9 before the 8
                if (digits.length === 12) {
                    const ddd = digits.slice(2, 4);
                    const rest = digits.slice(4);
                    digits = `55${ddd}9${rest}`;
                }
                return digits;
            };

            const normalizedPhone = normalizePhone(phone);

            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    phone: normalizedPhone,
                    whatsapp: normalizedPhone,
                    instrument: instrument
                })
                .eq('id', user.id);
                
            if (profileError) throw profileError;

            // 3. Mark church membership as active (so 'Pendente' disappears from church panel)
            await supabase.rpc('activate_my_membership');

            showToast('Cadastro finalizado com sucesso! Bem-vindo(a) ao LouvorPlay.', 'success');
            navigate('/');
            
        } catch (err) {
            console.error('Erro ao completar cadastro:', err);
            showToast(`Erro ao salvar: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    if (initializing) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                <Loader className="animate-spin text-purple-600" size={40} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl max-w-lg w-full p-8 md:p-12 animate-in zoom-in-95 duration-500">
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-3xl mx-auto flex items-center justify-center shadow-lg shadow-purple-500/30 mb-6 transform rotate-3 hover:rotate-6 transition">
                        <Shield className="text-white -rotate-3" size={40} />
                    </div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white">Para Começar...</h1>
                    <p className="text-slate-500 mt-2">Personalize sua senha e complete seus dados básicos para acessar o sistema da sua igreja.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-4">
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-white/5 space-y-4">
                            <h3 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-2">
                                <Lock size={18} className="text-purple-500" />
                                Segurança
                            </h3>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 pl-2">Sua Nova Senha</label>
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="No mínimo 6 caracteres"
                                    className="w-full bg-white dark:bg-slate-800 px-5 py-4 rounded-xl border-none outline-none focus:ring-2 focus:ring-purple-500 font-bold transition shadow-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 pl-2">Repita a Senha</label>
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirme a senha acima"
                                    className="w-full bg-white dark:bg-slate-800 px-5 py-4 rounded-xl border-none outline-none focus:ring-2 focus:ring-purple-500 font-bold transition shadow-sm"
                                />
                            </div>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-white/5 space-y-4">
                            <h3 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-2">
                                <Music size={18} className="text-blue-500" />
                                Perfil Musical (Opcional)
                            </h3>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 pl-2">Seu Instrumento Principal</label>
                                <select
                                    value={instrument}
                                    onChange={(e) => setInstrument(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 px-5 py-4 rounded-xl border-none outline-none focus:ring-2 focus:ring-purple-500 font-bold transition shadow-sm"
                                >
                                    <option value="">Não especificado</option>
                                    <option value="Vocal">Vocal / Cantor</option>
                                    <option value="Violão">Violão</option>
                                    <option value="Guitarra">Guitarra</option>
                                    <option value="Baixo">Baixo</option>
                                    <option value="Teclado">Teclado / Piano</option>
                                    <option value="Bateria">Bateria</option>
                                    <option value="Percussão">Percussão</option>
                                    <option value="Saxofone">Saxofone</option>
                                    <option value="Mesa de Som">Mesa de Som / Técnico</option>
                                    <option value="Outro">Outro</option>
                                </select>
                            </div>
                            
                            <div className="space-y-1 pt-2">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 pl-2 flex items-center gap-1">
                                    <Phone size={12} /> WhatsApp / Telefone
                                </label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="(11) 90000-0000"
                                    className="w-full bg-white dark:bg-slate-800 px-5 py-4 rounded-xl border-none outline-none focus:ring-2 focus:ring-purple-500 font-bold transition shadow-sm"
                                />
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-black text-lg py-5 rounded-2xl shadow-xl shadow-purple-500/30 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-70 disabled:pointer-events-none flex items-center justify-center gap-2 group mt-8"
                    >
                        {loading ? (
                            <Loader size={24} className="animate-spin" />
                        ) : (
                            <>
                                Salvar e Entrar no LouvorPlay
                                <ArrowRight className="group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                    
                    <p className="text-center text-xs text-slate-400 mt-6">
                        Você está logado como: <strong className="text-slate-600 dark:text-slate-300">{user?.email}</strong>
                    </p>
                </form>
            </div>
        </div>
    );
}
