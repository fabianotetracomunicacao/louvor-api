import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { User, Lock, ArrowRight, Loader, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { AsaasService } from '../services/AsaasService';

export function LoginPage({ defaultMode }) {
    const { login, signup, resetPassword } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const modeParam = searchParams.get('mode');
    const redirectUrl = searchParams.get('redirect') || '/dashboard';

    const [isLogin, setIsLogin] = useState(defaultMode !== 'signup' && modeParam !== 'signup');
    const [isForgot, setIsForgot] = useState(false);
    const [loading, setLoading] = useState(false);
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [church, setChurch] = useState('');
    const [favoriteStyle, setFavoriteStyle] = useState('');
    const [city, setCity] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const { user, loading: authLoading } = useAuth();

    // Auto-redirect if already logged in
    React.useEffect(() => {
        if (!authLoading && user) {
            navigate(redirectUrl, { replace: true });
        }
    }, [user, authLoading, navigate, redirectUrl]);

    // Auth State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');
        setLoading(true);

        try {
            if (isForgot) {
                await resetPassword(email);
                setSuccessMessage('✅ Link de recuperação enviado! Verifique seu e-mail.');
                setIsForgot(false);
                setIsLogin(true);
            } else if (isLogin) {
                await login(email, password);
                navigate(redirectUrl, { replace: true });
            } else {
                // 1. Fetch default individual plan First
                const { data: plans } = await supabase
                    .from('plans')
                    .select('id')
                    .eq('type', 'individual')
                    .eq('active', true)
                    .order('price', { ascending: true })
                    .limit(1);
                    
                const defaultPlanId = plans?.[0]?.id;

                // 2. Create User
                const signUpObj = {
                    full_name: fullName,
                    phone,
                    church,
                    favorite_style: favoriteStyle,
                    city,
                    birth_date: birthDate
                };
                
                // We pass signup data, Supabase creates the user
                const signUpRes = await signup(email, password, signUpObj);
                
                // 3. Generate Asaas Subscription if Plan Exists
                if (defaultPlanId && signUpRes?.user?.id) {
                    try {
                        await AsaasService.createSubscription(
                            defaultPlanId,
                            'individual',
                            null,
                            {
                                name: fullName,
                                email: email,
                                cpfCnpj: null
                            }
                        );
                    } catch (subErr) {
                        console.error('Failed to create Asaas subscription during signup:', subErr);
                    }
                }

                // Try auto-login
                if (signUpRes?.session) {
                    navigate(redirectUrl, { replace: true });
                    return;
                }

                try {
                    await login(email, password);
                    navigate(redirectUrl, { replace: true });
                    return;
                } catch (autoLoginErr) {
                    console.info('[Signup] Auto-login paused, email confirmation needed:', autoLoginErr);
                }

                // Switch to Login Mode with informative message
                setIsLogin(true);
                setSuccessMessage('✅ Conta criada com sucesso! Enviamos um e-mail de ativação. Por favor, confirme seu e-mail e faça login.');

                // Clear extra fields
                setFullName('');
                setPhone('');
                setChurch('');
                setFavoriteStyle('');
                setCity('');
                setBirthDate('');
            }
        } catch (err) {
            console.error(err);
            let msg = err.message;
            if (msg.includes('Invalid login credentials')) {
                msg = 'E-mail ou senha incorretos.';
            } else if (msg.includes('Email not confirmed')) {
                msg = 'E-mail não confirmado. Verifique a mensagem de confirmação na sua caixa de entrada.';
            } else if (msg.includes('User already registered')) {
                msg = 'Usuário já cadastrado no sistema. Faça login para continuar.';
            }
            setError(msg || 'Erro ao processar solicitação');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Image - Full Screen */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
                {/* Mobile/Tablet - Vertical Image */}
                <img
                    src="/worship-mobile.png"
                    alt="Worship"
                    className="md:hidden w-full h-full object-cover object-center"
                    style={{ zIndex: 1 }}
                />
                {/* Desktop - Horizontal Image */}
                <img
                    src="/worship-desktop.png"
                    alt="Worship"
                    className="hidden md:block w-full h-full object-cover object-center"
                    style={{ zIndex: 1 }}
                />
            </div>

            {/* Logo - Above Login Card */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 -mt-64 md:-mt-72">
                <img src="/logo_official.png" alt="LouvorPlay" className="h-16 md:h-20 object-contain drop-shadow-2xl" />
            </div>

            {/* Login Card */}
            <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-8 rounded-2xl shadow-2xl w-full max-w-md my-8 relative z-10 mt-24">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                        {isForgot ? 'Recuperar Senha' : isLogin ? 'Bem-vindo de volta' : 'Crie sua conta'}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">
                        {isForgot ? 'Digite seu e-mail para receber um link de recuperação' : isLogin ? 'Entre para acessar suas cifras' : 'Junte-se à comunidade LouvorPlay'}
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-100 border border-red-200 text-red-700 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                {successMessage && (
                    <div className="mb-6 p-4 bg-green-100 border border-green-200 text-green-700 rounded-lg text-sm">
                        {successMessage}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
                    {/* Extra Fields for Signup */}
                    {!isLogin && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Nome Completo</label>
                                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white px-4 py-2 rounded-lg" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Data Nasc.</label>
                                    <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white px-4 py-2 rounded-lg" required />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Telefone</label>
                                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white px-4 py-2 rounded-lg" placeholder="(00) 00000-0000" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Cidade</label>
                                    <input type="text" value={city} onChange={e => setCity(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white px-4 py-2 rounded-lg" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Igreja</label>
                                    <input type="text" value={church} onChange={e => setChurch(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white px-4 py-2 rounded-lg" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Estilo Musical Favorito</label>
                                <select value={favoriteStyle} onChange={e => setFavoriteStyle(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white px-4 py-2 rounded-lg">
                                    <option value="">Selecione...</option>
                                    <option value="Worship">Worship</option>
                                    <option value="Hinos Tradicionais">Hinos Tradicionais</option>
                                    <option value="Rock Cristão">Rock Cristão</option>
                                    <option value="Pop">Pop</option>
                                    <option value="Gospel">Gospel</option>
                                    <option value="Sertanejo">Sertanejo</option>
                                    <option value="Outro">Outro</option>
                                </select>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Email</label>
                        <div className="relative">
                            <User className="absolute left-3 top-3 text-slate-400" size={20} />
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                                placeholder="seu@email.com"
                                required
                            />
                        </div>
                    </div>

                    {!isForgot && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-xs font-bold uppercase text-slate-500">Senha</label>
                                {isLogin && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsForgot(true);
                                            setError('');
                                            setSuccessMessage('');
                                        }}
                                        className="text-xs text-purple-600 hover:text-purple-700 font-semibold"
                                    >
                                        Esqueci minha senha
                                    </button>
                                )}
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 text-slate-400" size={20} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white pl-10 pr-10 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                                    placeholder="••••••••"
                                    required={!isForgot}
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
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader className="animate-spin" /> : (
                            <>
                                {isForgot ? 'Enviar Link' : isLogin ? 'Entrar' : 'Cadastrar'} <ArrowRight size={20} />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 text-center space-y-4">
                    <button
                        onClick={() => {
                            if (isForgot) {
                                setIsForgot(false);
                                setIsLogin(true);
                            } else {
                                setIsLogin(!isLogin);
                            }
                            setError('');
                            setSuccessMessage('');
                        }}
                        className="text-sm text-slate-500 hover:text-purple-500 transition font-medium block w-full"
                    >
                        {isForgot ? 'Voltar para o Login' : isLogin ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entre aqui'}
                    </button>
                </div>
            </div>
        </div>
    );
}
