export const getSiteOrigin = () => {
    const configured = import.meta.env.VITE_SITE_URL;
    if (configured) return configured.replace(/\/$/, '');
    if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
    return 'https://www.louvorplay.com.br';
};

export const getAuthRedirectUrl = (path = '') => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${getSiteOrigin()}${cleanPath}`;
};

export const exchangeAuthRedirectFromUrl = async (supabaseClient) => {
    if (typeof window === 'undefined') {
        return { data: null, error: null, handled: false };
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const tokenHash = params.get('token_hash') || params.get('token');
    const type = params.get('type');

    if (code) {
        const { data, error } = await supabaseClient.auth.exchangeCodeForSession(code);
        return { data, error, handled: true };
    }

    if (tokenHash && type) {
        const { data, error } = await supabaseClient.auth.verifyOtp({
            token_hash: tokenHash,
            type
        });
        return { data, error, handled: true };
    }

    return { data: null, error: null, handled: false };
};
