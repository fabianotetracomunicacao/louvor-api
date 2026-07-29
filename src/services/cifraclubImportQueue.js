import { supabase } from '../supabaseClient';
import { CIFRA_API_URL } from '../utils/cifraApi';

function getApiUrl(path) {
    return `${CIFRA_API_URL}${path}`;
}

async function callRpc(name, params) {
    const { data, error } = await supabase.rpc(name, params);

    if (error) throw error;
    return data;
}

export async function searchArtists(query) {
    if (!query?.trim()) return [];

    const response = await fetch(
        getApiUrl(`/artists/suggest?q=${encodeURIComponent(query.trim())}`),
    );

    if (!response.ok) {
        throw new Error(`Artist search failed with status ${response.status}`);
    }

    const payload = await response.json();
    return payload.artists || [];
}

export async function previewArtistCatalog(artist) {
    const response = await fetch(
        getApiUrl(`/artists/${encodeURIComponent(artist.slug)}/catalog`),
    );

    if (!response.ok) {
        throw new Error(`Artist catalog preview failed with status ${response.status}`);
    }

    const payload = await response.json();
    const canonicalArtist = payload.artist;
    if (
        !canonicalArtist
        || canonicalArtist.slug !== artist.slug
        || !Number.isInteger(payload.total)
        || payload.total < 0
    ) {
        throw new Error('Artist catalog preview returned an invalid total');
    }

    return {
        ...artist,
        id: canonicalArtist.id ?? artist.id,
        name: canonicalArtist.name,
        slug: canonicalArtist.slug,
        total: payload.total,
    };
}

export async function enqueueArtist(artist) {
    if (!Number.isInteger(artist.total) || artist.total < 0) {
        throw new TypeError('Artist catalog total is required before enqueueing');
    }

    return callRpc('enqueue_cifraclub_import', {
        p_artist_name: artist.name,
        p_artist_slug: artist.slug,
        p_estimated_total: artist.total,
    });
}

export async function listImportJobs() {
    const { data, error } = await supabase
        .from('cifraclub_import_jobs')
        .select('*, items:cifraclub_import_items(*)')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

export function cancelImportJob(id) {
    return callRpc('cancel_cifraclub_import', { p_job_id: id });
}

export function retryImportFailures(id) {
    return callRpc('retry_cifraclub_import_failures', { p_job_id: id });
}

export function resumeImportJob(id) {
    return callRpc('resume_cifraclub_import', { p_job_id: id });
}

export function subscribeToImportJobs(callback) {
    const channel = supabase
        .channel(`cifraclub_import_queue_${Date.now()}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'cifraclub_import_jobs' },
            callback,
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'cifraclub_import_items' },
            callback,
        )
        .subscribe();

    let removed = false;
    return () => {
        if (removed) return;
        removed = true;
        return supabase.removeChannel(channel);
    };
}
