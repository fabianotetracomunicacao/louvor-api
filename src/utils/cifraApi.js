const DEFAULT_CIFRA_API_URL = 'https://louvor-api-yt4e.onrender.com/api';

export function normalizeCifraApiBase(url) {
    const baseUrl = (url || DEFAULT_CIFRA_API_URL).replace(/\/+$/, '');
    return baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
}

export const CIFRA_API_URL = normalizeCifraApiBase(
    import.meta.env.VITE_CIFRA_API_URL,
);
