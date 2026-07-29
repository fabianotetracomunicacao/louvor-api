import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { exchangeAuthRedirectFromUrl } from '../utils/authRedirect';

export function EmailConfirmationPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
    const [message, setMessage] = useState('');
    const [countdown, setCountdown] = useState(5);

    useEffect(() => {
        const confirmEmail = async () => {
            try {
                const hasAuthParams = searchParams.get('code') || searchParams.get('token_hash') || searchParams.get('token');

                let exchangeError = null;
                if (hasAuthParams) {
                    const result = await exchangeAuthRedirectFromUrl(supabase);
                    exchangeError = result.error;
                    if (exchangeError) {
                        console.warn('Confirmation exchange error:', exchangeError);
                    }
                }

                const { data: { session }, error } = await supabase.auth.getSession();

                if (!hasAuthParams && !session) {
                    setStatus('error');
                    setMessage('Link de confirmação inválido ou expirado.');
                    return;
                }

                if (error || (exchangeError && !session)) {
                    setStatus('error');
                    setMessage('Erro ao confirmar email. Tente novamente.');
                    console.error('Confirmation error:', error || exchangeError);
                    return;
                }

                if (session) {
                    setStatus('success');
                    setMessage('Email confirmado com sucesso! Você já está logado.');
                } else {
                    setStatus('success');
                    setMessage('Email confirmado com sucesso! Você pode fazer login agora.');
                }

            } catch (err) {
                console.error('Unexpected error:', err);
                setStatus('error');
                setMessage('Ocorreu um erro inesperado. Tente fazer login manualmente.');
            }
        };

        confirmEmail();
    }, [searchParams]);

    // Countdown and redirect
    useEffect(() => {
        if (status === 'success' && countdown > 0) {
            const timer = setTimeout(() => {
                setCountdown(countdown - 1);
            }, 1000);
            return () => clearTimeout(timer);
        } else if (status === 'success' && countdown === 0) {
            navigate('/login');
        }
    }, [status, countdown, navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center animate-in fade-in zoom-in duration-500">
                {status === 'loading' && (
                    <>
                        <Loader2 className="w-16 h-16 text-purple-600 mx-auto mb-4 animate-spin" />
                        <h1 className="text-2xl font-bold text-slate-800 mb-2">
                            Confirmando seu email...
                        </h1>
                        <p className="text-slate-600">
                            Aguarde um momento
                        </p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="w-10 h-10 text-green-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800 mb-2">
                            Email Confirmado! ✅
                        </h1>
                        <p className="text-slate-600 mb-6">
                            {message}
                        </p>
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                            <p className="text-sm text-purple-700">
                                Redirecionando para o login em <span className="font-bold text-lg">{countdown}</span> segundos...
                            </p>
                        </div>
                        <button
                            onClick={() => navigate('/login')}
                            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                        >
                            Ir para Login Agora
                        </button>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <XCircle className="w-10 h-10 text-red-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800 mb-2">
                            Erro na Confirmação
                        </h1>
                        <p className="text-slate-600 mb-6">
                            {message}
                        </p>
                        <button
                            onClick={() => navigate('/login')}
                            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                        >
                            Ir para Login
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
