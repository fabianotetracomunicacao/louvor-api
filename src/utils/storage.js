import { supabase } from '../supabaseClient';
import { WhatsAppService } from '../services/WhatsAppService';

/**
 * Storage service using Supabase.
 * Now COMPLETELY ASYNC.
 */

export const isAbortError = (e) => e && (String(e).includes('AbortError') || e?.message?.includes('AbortError') || e?.details?.includes('AbortError'));

// --- OFFLINE CACHE HELPERS ---
const CACHE_PREFIX = 'lp_cache_';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

function saveToCache(key, data) {
    try {
        const payload = {
            data,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(payload));
    } catch (e) {
        console.warn('[Cache] Save failed (quota?)', e);
    }
}

function getFromCache(key, maxAge = CACHE_EXPIRY) {
    try {
        const item = localStorage.getItem(CACHE_PREFIX + key);
        if (!item) return null;
        const parsed = JSON.parse(item);
        if (Date.now() - parsed.timestamp > maxAge) {
            localStorage.removeItem(CACHE_PREFIX + key);
            return null;
        }
        return parsed.data;
    } catch (e) {
        return null;
    }
}

function removeFromCache(key) {
    try {
        localStorage.removeItem(CACHE_PREFIX + key);
    } catch (e) {
        console.warn('[Cache] Remove failed', e);
    }
}
/**
 * Manually download a setlist and all its songs for offline usage.
 */
export async function downloadSetlistForOffline(setlistId) {
    try {
        // 1. Fetch Setlist with Items
        const setlists = await getSetlists(null); // This is tricky, getSetlists filters by playlist.
        // We need a specific getSetlistById or we reuse getSetlists if we have playlist context.
        // Actually, let's fetch specific setlist.
        const { data: setlist, error } = await supabase
            .from('setlists')
            .select(`
    *,
    items: setlist_items(
        id, position, usage_type,
        song: songs(*)
    ),
        scales: setlist_scales(
            id, role,
            user: profiles(id, name, full_name, avatar_url, email, instrument, available_instruments)
        ),
            creator: profiles!setlists_created_by_profile_fkey(
                id, name, full_name, email
            )
        `)
            .eq('id', setlistId)
            .single();

        if (error) throw error;

        // Normalize
        const normalizedSetlist = {
            ...setlist,
            items: setlist.items?.sort((a, b) => a.position - b.position).map(item => {
                if (item.usage_type === 'media_block') {
                    return {
                        ...item,
                        song: {
                            id: `media_block_${item.id || Date.now()}`,
                            title: 'Conteúdo / Mídia',
                            artist: 'Avisos, Ofertas, Interações',
                            isMediaBlock: true,
                            media_content: item.media_content || []
                        }
                    };
                }
                return {
                    ...item,
                    song: item.song ? mapSongFromDb(item.song) : null
                };
            })
        };

        // 2. Save Setlist
        saveToCache(`setlist_${setlistId}`, normalizedSetlist);

        // 3. Update parent list cache if exists
        const playlistId = setlist.playlist_id;
        const listCacheKey = `setlists_${playlistId}`;
        const cachedListWrapper = localStorage.getItem(CACHE_PREFIX + listCacheKey);

        if (cachedListWrapper) {
            try {
                const wrapper = JSON.parse(cachedListWrapper);
                let list = wrapper.data || [];
                // Update or Add
                const idx = list.findIndex(s => s.id === setlistId);
                if (idx >= 0) {
                    list[idx] = normalizedSetlist;
                } else {
                    list.push(normalizedSetlist);
                    // Re-sort by date? Optional.
                }
                saveToCache(listCacheKey, list);
            } catch (e) {
                console.warn("Failed to update parent list cache", e);
            }
        }

        // 3. Save Chords for each song (if using new DB)
        // We should fetch chords for these songs.
        // For now, let's rely on caching the song content which has chords in text.
        // If we want "super complete" dictionary offline, we need to cache `chords` table? 
        // That allows looking up new chords offline. 
        // Let's stick to setlist data first.

        return true;
    } catch (e) {
        console.error("Download failed:", e);
        return false;
    }
}

/**
 * Manually download an entire Playlist and its contents.
 */
export async function downloadPlaylistForOffline(playlistId) {
    try {
        // 1. Fetch Playlist Details
        const { data: playlist, error } = await supabase
            .from('playlists')
            .select(`
    *,
    owner: profiles(email)
            `)
            .eq('id', playlistId)
            .single();

        if (error) throw error;

        // 1b. Fetch and Cache Full Playlist Items (Songs)
        // This ensures the "Songs" tab works offline
        await getPlaylistWithItems(playlistId);

        // 2. Fetch and Cache Setlist List (Crucial for Offline View)
        // This caches to 'setlists_${playlistId}'
        const setlists = await getSetlists(playlistId);

        if (!setlists || setlists.length === 0) {
            console.log("No setlists to download.");
        } else {
            // 3. Download Each Setlist Details (recursively hits downloadSetlistForOffline)
            // Even though getSetlists gets data, downloadSetlistForOffline ensures 'setlist_${id}' is also cached if opened individually
            for (const s of setlists) {
                await downloadSetlistForOffline(s.id);
            }
        }

        // 3.5. Cache user preferences (global + per song) for instant offline opening
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                // Cache global preferences
                const { data: globalPrefs } = await supabase
                    .from('user_preferences')
                    .select('*')
                    .eq('user_id', user.id)
                    .maybeSingle();
                if (globalPrefs) saveToCache('user_global_prefs_' + user.id, globalPrefs);

                // Collect all unique song IDs from playlist items and setlists
                const fullPlaylist = await getPlaylistWithItems(playlistId);
                const songIds = new Set();
                if (fullPlaylist?.items) {
                    fullPlaylist.items.forEach(i => i.song?.id && songIds.add(i.song.id));
                }
                if (setlists) {
                    setlists.forEach(s => s.items?.forEach(i => i.song?.id && songIds.add(i.song.id)));
                }

                // Fetch and cache prefs for each song in parallel (batches of 5)
                const songIdArr = Array.from(songIds);
                for (let i = 0; i < songIdArr.length; i += 5) {
                    const batch = songIdArr.slice(i, i + 5);
                    await Promise.all(batch.map(async (sid) => {
                        const { data } = await supabase
                            .from('user_song_preferences')
                            .select('*')
                            .eq('user_id', user.id)
                            .eq('song_id', sid);
                        if (data && data[0]) saveToCache(`song_pref_${user.id}_${sid} `, data[0]);
                    }));
                }
            }
        } catch (prefErr) {
            console.warn('Could not cache preferences during playlist download:', prefErr);
        }

        // 4. Force refresh of My Playlists cache
        await getMyPlaylists(true);

        // 5. Mark as "Downloaded" for UI
        saveToCache(`downloaded_playlist_${playlistId} `, { downloadedAt: Date.now() });

        return true;
    } catch (e) {
        console.error("Playlist Download failed", e);
        return false;
    }
}

/**
 * Remove a downloaded playlist from offline cache.
 */
export function removePlaylistFromOffline(playlistId) {
    try {
        // 1. Remove Marker
        localStorage.removeItem('lp_cache_downloaded_playlist_' + playlistId);

        // 2. Remove Full Playlist Cache (Songs view)
        localStorage.removeItem('lp_cache_playlist_full_' + playlistId);

        // 3. Remove Setlists List and Individual Setlists
        const setlistsCacheKey = 'lp_cache_setlists_' + playlistId;
        const cachedSetlists = localStorage.getItem(setlistsCacheKey);

        if (cachedSetlists) {
            try {
                const parsed = JSON.parse(cachedSetlists);
                if (parsed && parsed.data && Array.isArray(parsed.data)) {
                    // Iterate and remove individual setlists
                    parsed.data.forEach(s => {
                        localStorage.removeItem('lp_cache_setlist_' + s.id);
                    });
                }
            } catch (e) {
                console.warn("Error parsing setlists cache for removal logic", e);
            }
            // Remove the list itself
            localStorage.removeItem(setlistsCacheKey);
        }

        console.log(`Playlist ${playlistId} removed from offline cache.`);
        return true;
    } catch (e) {
        console.error("Error removing playlist from offline:", e);
        return false;
    }
}



// --- SONGS ---

/**
 * Get songs with pagination and filters (server-side)
 * @param {object} options - { page, limit, style, songFunction, query }
 * @returns {Promise<{songs: Array, total: number, hasMore: boolean}>}
 */
export async function getSongs(options = {}) {
    try {
        const { page = 1, limit = 50, style, songFunction, query, isOfficial, type } = options;
        const offset = (page - 1) * limit;

        let queryBuilder = supabase
            .from('songs')
            .select('*, creator:created_by(email, name, full_name)', { count: 'exact' })
            .is('deleted_at', null);

        if (style) queryBuilder = queryBuilder.eq('style', style);
        if (songFunction) queryBuilder = queryBuilder.contains('functions', [songFunction]);
        if (isOfficial) queryBuilder = queryBuilder.eq('is_official', true);
        if (type && type !== 'all') queryBuilder = queryBuilder.eq('type', type);

        if (query) {

            queryBuilder = queryBuilder.or(`title.ilike.%${query}%,artist.ilike.%${query}%`);
        }

        const { data, count, error } = await queryBuilder
            .order('title', { ascending: true })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        // Offline: normalize
        const songs = data.map(mapSongFromDb);

        return {
            songs,
            total: count || 0,
            hasMore: (offset + limit) < count
        };
    } catch (e) {
        console.warn("Network error fetching songs:", e);
        // Fallback: Return empty or cached?
        // For 'getSongs' (all songs), caching everything is heavy. 
        // But if we have 'my_playlists', we technically have some songs.
        // For now, just return empty to avoid crash.
        return { songs: [], total: 0, hasMore: false };
    }
}



const songMemoryCache = new Map();

/**
 * Batch fetch multiple songs by IDs with memory caching.
 * @param {string[]} ids 
 * @returns {Promise<Record<string, object>>}
 */
export async function getSongsByIds(ids) {
    if (!ids || ids.length === 0) return {};

    const cleanIds = ids.filter(id => id && !String(id).startsWith('media_block_'));
    const uncachedIds = cleanIds.filter(id => !songMemoryCache.has(id));

    if (uncachedIds.length > 0) {
        try {
            const { data, error } = await supabase
                .from('songs')
                .select('*, creator:created_by(email, name, full_name)')
                .in('id', uncachedIds);

            if (!error && data) {
                data.forEach(s => {
                    const mapped = mapSongFromDb(s);
                    songMemoryCache.set(mapped.id, mapped);
                });
            }
        } catch (e) {
            console.error("Error batch fetching songs:", e);
        }
    }

    const result = {};
    cleanIds.forEach(id => {
        if (songMemoryCache.has(id)) {
            result[id] = songMemoryCache.get(id);
        }
    });

    return result;
}

/**
 * Get a single song by ID.
 * @param {string} id 
 * @returns {Promise<object|null>}
 */
export async function getSongById(id) {
    if (!id || String(id).startsWith('media_block_')) return null;

    if (songMemoryCache.has(id)) {
        return songMemoryCache.get(id);
    }

    const { data, error } = await supabase
        .from('songs')
        .select('*, creator:created_by(email, name, full_name)')
        .eq('id', id)
        .single();

    if (error) {
        console.error("Error fetching song:", error);
        return null;
    }
    const mapped = mapSongFromDb(data);
    songMemoryCache.set(mapped.id, mapped);
    return mapped;
}

/**
 * Get a song by its CifraClub slug.
 * @param {string} slug 
 * @returns {Promise<object|null>}
 */
export async function getSongBySlug(slug) {
    if (!slug) return null;
    const { data, error } = await supabase
        .from('songs')
        .select('*, creator:created_by(email, name, full_name)')
        .eq('cifraclub_slug', slug)
        .is('deleted_at', null)
        .maybeSingle();

    if (error) {
        console.error("Error fetching song by slug:", error);
        return null;
    }
    return data ? mapSongFromDb(data) : null;
}

export async function checkDuplicateSongs(title) {
    const { data, error } = await supabase
        .from('songs')
        .select('id, title, artist')
        .ilike('title', title.trim())
        .is('deleted_at', null);

    if (error) {
        console.error("Error checking duplicate songs:", error);
        return [];
    }
    return data || [];
}

/**
 * Save a song (create or update).
 * @param {object} songData { id, title, content, preferredKey, etc. }
 * @returns {Promise<object>} The saved song
 */
export async function saveSong(songData) {
    // Map internal camelCase to snake_case for DB if needed, 
    // but assuming we match schema or Supabase handles it if we structured the table correctly.
    // Our scaffold schema used snake_case for columns like original_key.

    const hasCifraclubSlug = songData.cifraclub_slug !== undefined || songData.cifraclubSlug !== undefined;
    const cifraclubSlug = songData.cifraclub_slug !== undefined
        ? songData.cifraclub_slug
        : songData.cifraclubSlug;
    const hasOfficial = songData.is_official !== undefined || songData.isOfficial !== undefined;
    const isOfficial = songData.is_official !== undefined
        ? songData.is_official
        : songData.isOfficial;
    const metadataPayload = songData.id
        ? {
            ...(hasCifraclubSlug ? { cifraclub_slug: cifraclubSlug } : {}),
            ...(hasOfficial ? { is_official: isOfficial } : {}),
        }
        : {
            cifraclub_slug: hasCifraclubSlug ? cifraclubSlug : null,
            is_official: hasOfficial ? isOfficial : false,
        };

    const dbPayload = {
        title: songData.title,
        artist: songData.artist,
        content: songData.content,
        ...metadataPayload,
        // created_by: handled below

        original_key: songData.originalKey, // Map to DB column
        font_size: songData.fontSize,       // Map to DB column
        tab_font_size: songData.tabFontSize, // NEW: Independent Tab Font Size
        line_spacing: songData.lineSpacing, // Map to DB column
        style: songData.style, // Usage/Genre
        functions: songData.functions, // Specific liturgical functions
        tags: songData.tags,   // Array of tags
        youtube_links: songData.youtubeLinks, // YouTube Links (Learning Mode)
        duration: songData.duration, // NEW: Duration in seconds
        projection_content: songData.projectionContent, // NEW: Content specifically for projection
        type: songData.type || 'chords', // NEW: chords or lyrics

        // NEW PROJECTION FIELDS
        proj_bg_type: songData.projBgType,
        proj_bg_url: songData.projBgUrl,
        proj_font_size: songData.projFontSize,

        updated_at: new Date().toISOString()
    };






    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        throw new Error("Sessão expirada. Faça login novamente para salvar.");
    }


    if (songData.id) {
        // Update
        const { data, error } = await supabase
            .from('songs')
            .update(dbPayload)
            .eq('id', songData.id)
            .select()
            .maybeSingle();

        if (error) {
            console.error('saveSong UPDATE error:', error);
            throw error;
        }

        if (!data) {
            console.error('saveSong UPDATE: No data returned. ID not found or permission denied.');
            throw new Error("Erro ao salvar: Música não encontrada ou permissão negada.");
        }

        clearAllListCaches();

        const mapped = mapSongFromDb(data);
        // Invalidate memory cache so next getSongById fetches fresh data
        songMemoryCache.delete(String(songData.id));
        return mapped;
    } else {
        // Create
        // Remove undefined ID to let DB generate it
        const { data, error } = await supabase
            .from('songs')
            .insert([{ ...dbPayload, created_by: user.id }])
            .select()
            .single();

        if (error) {
            console.error('saveSong INSERT error:', error);
            throw error;
        }

        return mapSongFromDb(data);
    }
}

function clearAllListCaches() {
    try {
        songMemoryCache.clear();
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(CACHE_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {
        console.warn("[Cache] Failed to clear caches", e);
    }
}

/**
 * Update the projection content for a song, and optionally per-playlist/setlist settings.
 * @param {string} songId 
 * @param {Object} settings
 * @param {string} [playlistItemId] - If provided, bg/font settings are scoped to this item (playlist_items or setlist_items)
 * @param {string} [itemTable] - 'playlist_items' or 'setlist_items' (defaults to 'playlist_items')
 */
export async function saveSongProjectionSettings(songId, settings, playlistItemId = null, itemTable = 'playlist_items') {
    let songData = null;
    // 1. Try to update the main songs table (Global lyrics for this song)
    console.log('[DEBUG] Saving projection content for song:', songId, 'Item ID:', playlistItemId);
    
    // 1. If NO item context is provided, update the main songs table (Global defaults)
    // If an item context IS provided, we skip global update to avoid "fighting" data and unintended global changes.
    let updatedSongs = null;
    let songError = null;

    if (!playlistItemId) {
        console.log('[DEBUG] No item ID, updating global songs table:', songId);
        const { data, error } = await supabase
            .from('songs')
            .update({
                projection_content: settings.projectionContent,
                proj_bg_type: settings.projBgType,
                proj_bg_url: settings.projBgUrl,
                proj_bg_color: settings.projBgColor,
                proj_font_size: settings.projFontSize,
            })
            .eq('id', songId)
            .select();
        updatedSongs = data;
        songError = error;
    } else {
        console.log('[DEBUG] Item ID provided, skipping global songs table update to avoid conflicts.');
    }

    if (songError) {
        console.warn('[DEBUG] Global song update error (RLS?):', songError);
    } else {
        console.log('[DEBUG] Global song update result:', updatedSongs?.length > 0 ? 'Success' : 'No rows affected (matched 0)');
    }

    if (updatedSongs && updatedSongs.length > 0) {
        songData = updatedSongs[0];
    } else {
        // If update failed or returned nothing (RLS), fetch the song normally to return something valid to the UI
        const { data: existingSong } = await supabase.from('songs').select('*').eq('id', songId).single();
        songData = existingSong || { id: songId };
    }

    // NEW: If an ITEM-level update was performed, merge those settings into the returned song object.
    // IMPORTANT: use snake_case keys so mapSongFromDb() picks them up correctly.
    if (playlistItemId && songData) {
        if (settings.projectionContent !== undefined) songData.projection_content = settings.projectionContent;
        if (settings.projBgType    !== undefined)    songData.proj_bg_type     = settings.projBgType;
        if (settings.projBgUrl     !== undefined)    songData.proj_bg_url      = settings.projBgUrl;
        if (settings.projBgColor   !== undefined)    songData.proj_bg_color    = settings.projBgColor;
        if (settings.projFontSize  !== undefined)    songData.proj_font_size   = settings.projFontSize;
    }

    // 2. If an itemId is provided, save visual settings scoped to that item in the correct table
    // Only attempt Supabase update if the itemId looks like a valid UUID (contains dash).
    // Temporary IDs like 'item_0' cannot be updated in DB until they are synced.
    const isTempId = playlistItemId && !playlistItemId.includes('-');
    
    if (playlistItemId && !isTempId) {
        const table = itemTable === 'setlist_items' ? 'setlist_items' : 'playlist_items';
        const itemUpdatePayload = {
            proj_bg_type: settings.projBgType,
            proj_bg_url: settings.projBgUrl,
            proj_bg_color: settings.projBgColor || '#000000',
            proj_font_size: settings.projFontSize
        };

        console.log(`[DEBUG] Attempting update on ${table} for item:`, playlistItemId);

        // Try updating including projection_content
        const { error: fullError } = await supabase
            .from(table)
            .update({ ...itemUpdatePayload, projection_content: settings.projectionContent })
            .eq('id', playlistItemId);

        if (fullError) {
            if (fullError.code === '42703') {
                console.warn(`[DEBUG] projection_content column missing on ${table}. Falling back to visual-only.`);
                const { error: retryError } = await supabase
                    .from(table)
                    .update(itemUpdatePayload)
                    .eq('id', playlistItemId);
                
                if (retryError) {
                    console.error('[DEBUG] Retry update failed:', retryError);
                    throw retryError;
                }
                console.log('[DEBUG] Visual settings saved (lyrics skipped due to missing column)');
            } else {
                console.error(`[DEBUG] Error updating ${table}:`, fullError);
                throw fullError;
            }
        } else {
            console.log(`[DEBUG] Full save successful on ${table} (including lyrics override)`);
        }
    }

    // Since a song was modified, force playlists and setlists to re-fetch to get new projection content
    clearAllListCaches();

    return mapSongFromDb(songData);
}
export async function deleteSong(id) {
    const { error } = await supabase
        .from('songs')
        .update({ deleted_at: new Date().toISOString() }) // Soft Delete
        .eq('id', id);

    if (error) console.error("Error deleting song:", error);
}

/**
 * Copy a song using the RPC function.
 * @param {string} songId 
 * @returns {Promise<string>} New Song ID
 */
export async function copySong(songId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Faça login para copiar a música.");

    // Fetch original song
    const { data: sourceSong, error: fetchErr } = await supabase
        .from('songs')
        .select('*')
        .eq('id', songId)
        .single();

    if (fetchErr || !sourceSong) throw new Error("Música original não encontrada.");

    // Check if user already copied this exact song
    const { data: existingCopy } = await supabase
        .from('songs')
        .select('id')
        .eq('created_by', user.id)
        .eq('original_song_id', songId)
        .maybeSingle();

    if (existingCopy) {
        return existingCopy.id;
    }

    const copyPayload = {
        title: sourceSong.title,
        artist: sourceSong.artist,
        content: sourceSong.content,
        original_key: sourceSong.original_key,
        font_size: sourceSong.font_size,
        tab_font_size: sourceSong.tab_font_size,
        line_spacing: sourceSong.line_spacing,
        style: sourceSong.style,
        functions: sourceSong.functions,
        tags: sourceSong.tags,
        youtube_links: sourceSong.youtube_links,
        duration: sourceSong.duration,
        projection_content: sourceSong.projection_content,
        type: sourceSong.type || 'chords',
        proj_bg_type: sourceSong.proj_bg_type,
        proj_bg_url: sourceSong.proj_bg_url,
        proj_font_size: sourceSong.proj_font_size,
        is_official: false,
        created_by: user.id,
        original_song_id: songId
    };

    const { data: inserted, error: insertErr } = await supabase
        .from('songs')
        .insert([copyPayload])
        .select()
        .single();

    if (insertErr) throw insertErr;

    clearAllListCaches();
    return inserted.id;
}


/**
 * Toggle the Official status of a song (Admin only).
 * @param {string} songId 
 * @returns {Promise<boolean>} New Status
 */
export async function toggleSongOfficial(songId) {
    let newStatus = false;

    try {
        const { data, error } = await supabase
            .rpc('toggle_song_official', { target_song_id: songId });

        if (!error && data !== null && data !== undefined) {
            newStatus = data;
        } else {
            throw error || new Error("RPC returned null");
        }
    } catch (e) {
        // Fallback: Direct table toggle
        const { data: currentSong } = await supabase
            .from('songs')
            .select('is_official')
            .eq('id', songId)
            .single();

        newStatus = !currentSong?.is_official;

        const { error: updateErr } = await supabase
            .from('songs')
            .update({ is_official: newStatus })
            .eq('id', songId);

        if (updateErr) throw updateErr;
    }

    clearAllListCaches();
    return newStatus;
}

// --- TRASH / RECOVERY ---

/**
 * Get all soft-deleted songs (Admin Only).
 * @returns {Promise<Array>}
 */
export async function getDeletedSongs() {
    const { data, error } = await supabase
        .from('songs')
        .select('*, creator:created_by(email, name, full_name)')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

    if (error) {
        console.error("Error fetching deleted songs:", error);
        return [];
    }
    return data.map(mapSongFromDb);
}

/**
 * Restore a soft-deleted song.
 * @param {string} id 
 */
export async function restoreSong(id) {
    const { error } = await supabase
        .from('songs')
        .update({ deleted_at: null })
        .eq('id', id);

    if (error) console.error("Error restoring song:", error);
}

/**
 * Permanently delete a song.
 * @param {string} id 
 */
export async function permanentlyDeleteSong(id) {
    const { error } = await supabase
        .from('songs')
        .delete()
        .eq('id', id);

    if (error) console.error("Error permanently deleting song:", error);
}

// --- PLAYLISTS (RELATIONAL) ---

/**
 * Get all playlists for the current user (or public ones).
 * In a real app, RLS handles the "my playlists" filter, but we might want to be explicit.
 * @returns {Promise<Array>}
 */
export async function getMyPlaylists(forceRefresh = false) {
    let result = [];
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return [];
        const user = session.user;
        const cacheKey = 'my_playlists_' + user.id; // Per-user cache key

        // 0. Check Cache First (if not forced)
        if (!forceRefresh) {
            const cached = getFromCache(cacheKey);
            if (cached) return cached;
        }

        // 1. Fetch Owned Playlists
        const { data: owned, error: ownedError } = await supabase
            .from('playlists')
            .select('*, is_collaborative, owner:profiles(email)')
            .eq('owner_id', user.id)
            .order('name');

        if (ownedError) throw ownedError;

        // 2. Fetch Memberships (IDs and Roles only)
        const { data: memberships, error: memberError } = await supabase
            .from('playlist_members')
            .select('playlist_id, role, status')
            .eq('user_id', user.id);

        if (memberError) throw memberError;

        // We want to fetch details for ALL memberships (active and pending) to show them in the UI
        const allMemberships = memberships; // Alias for clarity

        // 3. Fetch Followed Playlists Details
        let followed = [];
        if (allMemberships && allMemberships.length > 0) {
            const playlistIds = allMemberships.map(m => m.playlist_id);

            const { data: playlists, error: playlistError } = await supabase
                .from('playlists')
                .select('*, is_collaborative, owner:profiles(email)')
                .in('id', playlistIds);

            if (playlistError) {
                console.error("Error fetching followed playlist details:", playlistError);
            } else {
                // Attach roles and status
                followed = playlists.map(p => {
                    const subscription = allMemberships.find(m => m.playlist_id === p.id);
                    return {
                        ...p,
                        role: subscription?.role || 'viewer',
                        membershipStatus: subscription?.status || 'active'
                    };
                });
            }
        }

        // 4. Merge
        const ownedWithRole = (owned || []).map(p => ({ ...p, role: 'owner' }));
        const all = [...ownedWithRole, ...followed];

        // Deduplicate by ID
        const unique = Array.from(new Map(all.map(item => [item.id, item])).values());

        result = unique.sort((a, b) => a.name.localeCompare(b.name));

        // SAVE TO CACHE (per user)
        saveToCache(cacheKey, result);

    } catch (e) {
        console.warn("Network error fetching playlists, trying cache...", e);
        // Try to get session again for the cache key fallback
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const fallbackKey = session?.user ? 'my_playlists_' + session.user.id : 'my_playlists';
            const cached = getFromCache(fallbackKey);
            if (cached) return cached;
        } catch { /* ignore */ }
        return [];
    }

    return result;
}

/**
 * Get a full playlist with its items and songs.
 * @param {string} id 
 */
export async function getPlaylistWithItems(id) {
    try {
        // 1. Get Playlist Metadata
        const { data: playlist, error: plError } = await supabase
            .from('playlists')
            .select('*, is_collaborative, owner:profiles(email)')
            .eq('id', id)
            .single();

        if (plError) throw plError;

        // 2. Get Items with Songs joined
        // Try with projection columns first, fall back to basic query if columns don't exist yet
        let items, itemsError;
        const itemsResponse = await supabase
            .from('playlist_items')
            .select(`
    id,
    position,
    custom_transposition,
    proj_bg_type,
    proj_bg_url,
    proj_bg_color,
    proj_font_size,
    projection_content,
    song: songs(*)
        `)
            .eq('playlist_id', id)
            .order('position');

        if (itemsResponse.error && (itemsResponse.status === 400 || itemsResponse.error?.code === '42703')) {
            // Columns don't exist yet (migration not run) — fallback to basic query
            console.warn('[getPlaylistWithItems] Proj columns not found on playlist_items, using fallback query. Run SQL migration!');
            const fallbackResponse = await supabase
                .from('playlist_items')
                .select(`
    id,
    position,
    custom_transposition,
    song: songs(*)
        `)
                .eq('playlist_id', id)
                .order('position');
            items = fallbackResponse.data;
            itemsError = fallbackResponse.error;
        } else {
            items = itemsResponse.data;
            itemsError = itemsResponse.error;
        }

        if (itemsError) throw itemsError;


        // 3. Map items to friendly structure (preserving original logic)
        const result = {
            ...playlist,
            items: items.map(item => {
                if (item.usage_type === 'media_block') {
                    return {
                        itemId: item.id,
                        position: item.position,
                        usage_type: item.usage_type,
                        media_content: item.media_content || [],
                        song: {
                            id: `media_block_${item.id || Date.now()}`,
                            title: 'Conteúdo / Mídia',
                            artist: 'Avisos, Ofertas, Interações',
                            isMediaBlock: true,
                            media_content: item.media_content || []
                        }
                    };
                }

                const song = mapSongFromDb(item.song);
                if (!song) {
                    console.warn(`[getPlaylistWithItems] Item ${item.id} has no visible song data.RLS blocking ? `);
                } else {
                    // Inject playlist-item specific settings overriding the global song ones if they exist
                    if (item.proj_bg_type && item.proj_bg_type !== 'global') song.projBgType = item.proj_bg_type;
                    if (item.proj_bg_url) song.projBgUrl = item.proj_bg_url;
                    if (item.proj_bg_color) song.projBgColor = item.proj_bg_color;
                    if (item.proj_font_size) song.projFontSize = item.proj_font_size;
                    if (item.projection_content) song.projectionContent = item.projection_content;
                }

                return {
                    id: item.id,
                    itemId: item.id, // Keep both for safety during transition
                    position: item.position,
                    customTransposition: item.custom_transposition,
                    usage_type: item.usage_type,
                    media_content: item.media_content,
                    song: song,
                    createdBy: item.song?.created_by
                };
            })
        };

        // Cache the full result for offline use
        saveToCache(`playlist_full_${id}`, result);
        return result;

    } catch (e) {
        console.warn("Network error fetching playlist, trying cache...", e);

        // 1. Try Full Playlist Cache First
        const fullCached = getFromCache(`playlist_full_${id}`);
        if (fullCached) return fullCached;

        // 2. Fallback: Check 'my_playlists' cache for metadata only
        const cachedList = getFromCache('my_playlists');
        if (cachedList) {
            const cachedPlaylist = cachedList.find(p => p.id === id);
            if (cachedPlaylist) {
                // Return metadata with empty items (better than nothing)
                // This allows the page to load and then fetch Setlists from cache.
                return { ...cachedPlaylist, items: [] };
            }
        }
        return null; // Failed
    }
}

export async function savePlaylistMetadata(playlistData) {
    const dbPayload = {
        name: playlistData.name,
        description: playlistData.description, // Ensure description is saved
        is_public: playlistData.isPublic || false,
        is_collaborative: playlistData.isCollaborative || false,
        scheduled_date: playlistData.scheduledDate || null, // NEW: Scheduled Date
        type: playlistData.type || 'playlist', // NEW: playlist or lyrics_list
        updated_at: new Date().toISOString()
    };

    // Include owner_id if creating and known in context, but RLS usually expects auth.uid()
    // However, for 'insert' we might need to pass it if not default. 
    // Usually Supabase Auth context handles `auth.uid()`, but our table expects `owner_id`.
    // We should pass it if we have it in `playlistData.ownerId`.

    // Get current user if ownerId not provided
    if (!playlistData.ownerId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            throw new Error("Sessão expirada. Faça login novamente para salvar.");
        }
        dbPayload.owner_id = user.id;
    } else {
        dbPayload.owner_id = playlistData.ownerId;
    }

    if (playlistData.id) {
        const { data, error } = await supabase
            .from('playlists')
            .update(dbPayload)
            .eq('id', playlistData.id)
            .select()
            .single();
        if (error) throw error;
        return data;
    } else {
        const { data, error } = await supabase
            .from('playlists')
            .insert([dbPayload])
            .select() // This select triggers the return policy check
            .single();
        if (error) throw error;
        return data;
    }
}

// --- SCALE MANAGEMENT (ESCALA) ---

/**
 * Get the scale (assigned users) for a setlist.
 * @param {string} setlistId 
 */
export async function getSetlistScale(setlistId) {
    const { data, error } = await supabase
        .from('setlist_scales')
        .select(`
            id,
            role,
            status,
            whatsapp_status,
            confirmed_at,
            declined_at,
            decline_reason,
            user: profiles(id, name, full_name, avatar_url, email, phone, whatsapp)
        `)
        .eq('setlist_id', setlistId);

    if (error) {
        console.error("Error fetching setlist scale:", error);
        return [];
    }

    return data.map(item => ({
        id: item.id,
        role: item.role,
        status: item.status || 'PENDING',
        whatsappStatus: item.whatsapp_status || 'NOT_SENT',
        confirmedAt: item.confirmed_at,
        declinedAt: item.declined_at,
        declineReason: item.decline_reason,
        user: item.user
    }));
}

// --- Notifications Helper ---
export async function createNotification(userId, title, message, type = 'info', link = null) {
    const { error } = await supabase
        .from('notifications')
        .insert([{
            user_id: userId,
            title,
            message,
            type,
            link,
            read: false
        }]);

    if (error) {
        console.error('Error creating notification:', error);
    }
}

/**
 * Add a user to the setlist scale.
 * @param {string} setlistId 
 * @param {string} userId 
 * @param {string} role (optional)
 */
export async function addUserToSetlistScale(setlistId, userId, role = null) {
    // 1. Add/Update Scale
    const { data, error } = await supabase
        .from('setlist_scales')
        .upsert({ setlist_id: setlistId, user_id: userId, role, status: 'PENDING' }, { onConflict: 'setlist_id, user_id' })
        .select()
        .single();
    if (error) {
        throw error;
    }

    // 2. Fetch Setlist Details for Notification
    const { data: setlist } = await supabase
        .from('setlists')
        .select('name, title, date, playlist_id')
        .eq('id', setlistId)
        .single();

    if (setlist) {
        let dateStr = 'Data não informada';
        const dVal = setlist.date;
        if (dVal) {
            const d = new Date(dVal);
            dateStr = d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        }

        const setlistTitle = setlist.title || setlist.name || 'Setlist';
        const message = `Você foi escalado para o culto "${setlistTitle}" no dia ${dateStr}${role ? ` como: ${role}` : ''}.`;
        const link = `/escalas`;

        // 3. Create Notification
        await createNotification(userId, 'Nova Escala', message, 'info', link);

        // 4. Trigger Automatic WhatsApp Confirmation (Async)
        try {
            const { data: musicianProfile } = await supabase
                .from('profiles')
                .select('name, full_name, phone, whatsapp')
                .eq('id', userId)
                .single();

            const phone = musicianProfile?.whatsapp || musicianProfile?.phone;
            const musicianName = musicianProfile?.name || musicianProfile?.full_name || 'Músico';

            if (phone) {
                WhatsAppService.sendScaleConfirmation({
                    scaleId: data.id,
                    musicianPhone: phone,
                    musicianName,
                    roleName: role,
                    setlistTitle,
                    setlistDate: setlist.date
                }).catch(err => console.warn('[WhatsApp AutoSend] Error:', err));
            }
        } catch (e) {
            console.warn('[WhatsApp AutoSend] Warning preparing message:', e);
        }
    }

    return data;
}

/**
 * Remove a user from the scale.
 * @param {string} scaleId 
 */
export async function removeUserFromSetlistScale(scaleId) {
    const { error } = await supabase
        .from('setlist_scales')
        .delete()
        .eq('id', scaleId);

    if (error) throw error;
}

/**
 * Get all schedules (scales) for the current user.
 */
export async function getMySchedules() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let { data, error } = await supabase
        .from('setlist_scales')
        .select(`
            id,
            role,
            status,
            whatsapp_status,
            confirmed_at,
            declined_at,
            decline_reason,
            created_at,
            setlist: setlists (
                id,
                name,
                date,
                playlist_id,
                items: setlist_items (
                    id,
                    song_id,
                    custom_transposition,
                    position,
                    song: songs (*)
                )
            )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.warn("[getMySchedules] Detailed query error, falling back to basic query:", error);
        const fallback = await supabase
            .from('setlist_scales')
            .select(`
                id,
                role,
                status,
                whatsapp_status,
                confirmed_at,
                declined_at,
                decline_reason,
                created_at,
                setlist: setlists (
                    id,
                    name,
                    date,
                    playlist_id
                )
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (fallback.error) {
            console.error("Error fetching schedules (fallback):", fallback.error);
            throw fallback.error;
        }
        data = fallback.data;
    }

    if (data) {
        data.forEach(s => {
            if (s.setlist && s.setlist.items) {
                s.setlist.items.sort((a, b) => (a.position || 0) - (b.position || 0));
            }
        });
    }

    return data;
}

// ... existing code ...

export async function addSongToPlaylist(playlistId, songId, position = 0) {
    // 1. Insert Item
    const { data, error } = await supabase
        .from('playlist_items')
        .insert([{
            playlist_id: playlistId,
            song_id: songId,
            position,
            custom_transposition: 0
        }])
        .select()
        .single();
    if (error) throw error;

    // 2. Send Notifications (Async/Fire-and-forget)
    (async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Get Helper Data (Song Title, Playlist Name, Members)
            const [
                { data: song },
                { data: playlist },
                { data: members }
            ] = await Promise.all([
                supabase.from('songs').select('title').eq('id', songId).single(),
                supabase.from('playlists').select('name').eq('id', playlistId).single(),
                supabase.from('playlist_members').select('user_id').eq('playlist_id', playlistId).neq('user_id', user.id).eq('status', 'active')
            ]);

            if (members && members.length > 0 && song && playlist) {
                const notifications = members.map(m => ({
                    user_id: m.user_id,
                    type: 'song_added',
                    title: 'Música adicionada',
                    message: `"${song.title}" foi adicionada à playlist "${playlist.name}".`,
                    data: { playlistId, songId }
                }));

                await supabase.from('notifications').insert(notifications);
            }
        } catch (err) {
            console.error("Error sending song notification:", err);
        }
    })();

    // 3. Update Offline Cache if needed (Background)
    // 3. Update Offline Cache ALWAYS (Auto-cache for seamless offline)
    // We update the full playlist cache so the user can view it offline immediately
    getPlaylistWithItems(playlistId).then(() => {
        console.log("Auto-cached playlist after add:", playlistId);
    }).catch(err => console.warn("Failed to auto-cache playlist:", err));

    // Also update "Downloaded" specific cache if applicable
    if (localStorage.getItem('lp_cache_downloaded_playlist_' + playlistId)) {
        console.log("Updating offline downloaded cache for playlist:", playlistId);
        downloadPlaylistForOffline(playlistId).catch(err => console.error("Error updating offline cache:", err));
    }

    return data;
}

export async function removeSongFromPlaylist(itemId) {
    // 1. Get playlist_id before deleting (so we can update cache)
    const { data: item } = await supabase
        .from('playlist_items')
        .select('playlist_id')
        .eq('id', itemId)
        .single();

    // 2. Delete
    const { error } = await supabase
        .from('playlist_items')
        .delete()
        .eq('id', itemId);
    if (error) throw error;

    // 3. Update Offline Cache ALWAYS
    if (item && item.playlist_id) {
        getPlaylistWithItems(item.playlist_id).then(() => {
            console.log("Auto-cached playlist after remove:", item.playlist_id);
        }).catch(err => console.warn("Failed to auto-cache playlist:", err));

        if (localStorage.getItem('lp_cache_downloaded_playlist_' + item.playlist_id)) {
            console.log("Updating offline cache after removal:", item.playlist_id);
            downloadPlaylistForOffline(item.playlist_id).catch(err => console.error("Error updating offline cache:", err));
        }
    }
}


export async function updatePlaylistItemTransposition(itemId, transposition) {
    const { error } = await supabase
        .from('playlist_items')
        .update({ custom_transposition: transposition })
        .eq('id', itemId);
    if (error) {
        console.error("Error updating transposition:", error);
        return false;
    }
    return true;
}

export async function updateSetlistItemTransposition(itemId, transposition) {
    const { error } = await supabase
        .from('setlist_items')
        .update({ custom_transposition: transposition })
        .eq('id', itemId);
    if (error) {
        console.error("Error updating setlist transposition:", error);
        return false;
    }
    return true;
}

export async function deletePlaylist(id) {
    const { error } = await supabase
        .from('playlists')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

/**
 * Clone a playlist (metadata + items) for the current user.
 * @param {string} originalId - The ID of the playlist to clone
 * @param {string} userId - The ID of the user cloning it
 */
export async function clonePlaylist(originalId, userId) {
    // 1. Get original playlist
    const { data: original, error: plError } = await supabase
        .from('playlists')
        .select('*')
        .eq('id', originalId)
        .single();
    if (plError) throw plError;

    // 2. Create new playlist
    const { data: newPlaylist, error: createError } = await supabase
        .from('playlists')
        .insert([{
            name: `${original.name} (Cópia)`,
            is_public: false, // Default to private when cloning?
            owner_id: userId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }])
        .select()
        .single();
    if (createError) throw createError;

    // 3. Get original items
    const { data: items, error: itemsError } = await supabase
        .from('playlist_items')
        .select('*')
        .eq('playlist_id', originalId);
    if (itemsError) throw itemsError;

    // 4. Insert items into new playlist
    if (items && items.length > 0) {
        const newItems = items.map(item => ({
            playlist_id: newPlaylist.id,
            song_id: item.song_id,
            position: item.position,
            custom_transposition: item.custom_transposition // Preserve transposition? Usually yes.
        }));

        const { error: insertError } = await supabase
            .from('playlist_items')
            .insert(newItems);
        if (insertError) throw insertError;
    }

    return newPlaylist;
}

/**
 * Search for public playlists.
 * @param {string} query 
 */
export async function searchPublicPlaylists(query) {
    if (!query || query.length < 2) return [];

    const { data, error } = await supabase
        .from('playlists')
        .select('*, owner:profiles(email)')
        .eq('is_public', true)
        .ilike('name', `% ${query}% `)
        .limit(20);

    if (error) {
        console.error("Error searching playlists:", error);
        return [];
    }
    return data;
}

/**
 * Follow a playlist (add to My Playlists).
 * @param {string} playlistId 
 */
export async function followPlaylist(playlistId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not logged in");

    const { error } = await supabase
        .from('playlist_members')
        .insert([{
            playlist_id: playlistId,
            user_id: user.id,
            role: 'viewer'
        }]);

    if (error) {
        // Ignore unique constraint error (already following)
        if (error.code === '23505') return;
        throw error;
    }
}

/**
 * Unfollow a playlist.
 * @param {string} playlistId 
 */
export async function unfollowPlaylist(playlistId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
        .from('playlist_members')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('user_id', user.id);

    if (error) throw error;
}

/**
 * Invite a user to a playlist by email.
 * @param {string} playlistId 
 * @param {string} email 
 */
export async function inviteCollaborator(playlistId, email) {
    // 1. Resolve User ID from Email
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', email)
        .single();

    if (profileError || !profile) throw new Error("Usuário não encontrado.");

    // 2. Insert into Playlist Members (Pending)
    const { error: memberError } = await supabase
        .from('playlist_members')
        .insert([{
            playlist_id: playlistId,
            user_id: profile.id,
            role: 'editor',
            status: 'pending' // Pending approval
        }]);

    if (memberError) {
        if (memberError.code === '23505') throw new Error("Usuário já é membro ou está convidado.");
        throw memberError;
    }

    // 3. Create Notification
    // Get Playlist Name first
    const { data: playlist } = await supabase.from('playlists').select('name').eq('id', playlistId).single();
    const playlistName = playlist?.name || 'Playlist';

    const { error: notifError } = await supabase
        .from('notifications')
        .insert([{
            user_id: profile.id,
            type: 'invite',
            title: 'Convite para Playlist',
            message: `Você foi convidado para colaborar na playlist "${playlistName}".`,
            data: { playlistId, playlistName }
        }]);

    if (notifError) console.error("Error sending notification:", notifError);

    return true;
}

/**
 * Respond to a playlist invite
 * @param {string} notificationId 
 * @param {boolean} accept 
 * @param {object} data - { playlistId }
 */
// Helper to respond to invite via Playlist Page (without Notification ID)
export async function respondToPlaylistInvite(playlistId, accepted) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    if (accepted) {
        // Update Status to Active
        const { error } = await supabase
            .from('playlist_members')
            .update({ status: 'active' })
            .eq('playlist_id', playlistId)
            .eq('user_id', user.id);

        if (error) throw error;

        // Try to mark related notification as read/handled
        // This is best-effort
        /* 
        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', user.id)
            .eq('type', 'invite')
            // .contains('data', { playlistId: playlistId }) // JSONB filter might be tricky syntax dependent
        */

    } else {
        // Delete membership
        const { error } = await supabase
            .from('playlist_members')
            .delete()
            .eq('playlist_id', playlistId)
            .eq('user_id', user.id);

        if (error) throw error;
    }
}

export async function respondToInvite(notificationId, accept, data) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not logged in");

    if (!data?.playlistId) {
        console.error("Invalid notification data:", data);
        throw new Error("Dados do convite inválidos.");
    }

    // Delegate to the main handler (same as Playlist Page)
    await respondToPlaylistInvite(data.playlistId, accept);

    // Mark notification as read
    const { error: notifError } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

    if (notifError) console.error("Error updating notification status:", notifError);
}

/**
 * Remove a collaborator (or unfollow if self).
 * Already covered by unfollowPlaylist (which deletes from playlist_members), 
 * but for clarity we can alias it or handle "remove other user" specifically if needed.
 * "unfollowPlaylist" assumes auth.user.id. 
 * We need `removeMember` to remove OTHERS.
 */
export async function removeMember(playlistId, userId) {
    const { error } = await supabase
        .from('playlist_members')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('user_id', userId);

    if (error) throw error;
}


// Update playlist item order
export async function updatePlaylistOrder(items, playlistId) {
    try {
        const updates = items.map((item, index) => ({
            id: item.itemId, // Note: using itemId from frontend model
            position: index,
            playlist_id: playlistId, // Use the explicitly passed ID
            song_id: item.song.id // Ensure required fields are present if needed by RLS or constraints
        }));

        const { error } = await supabase
            .from('playlist_items')
            .upsert(updates, { onConflict: 'id' });

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error updating playlist order:', error);
        return false;
    }
}

// --- HELPERS ---

function mapSongFromDb(dbSong) {
    if (!dbSong) return null;

    let creatorName = null;
    if (dbSong.creator) {
        const rawName = dbSong.creator.full_name || dbSong.creator.name || dbSong.creator.email || '';
        if (rawName.includes('@')) {
            creatorName = rawName;
        } else {
            // Capitalize first letter of each word
            creatorName = rawName.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        }
    }

    const cifraclubSlug = dbSong.cifraclub_slug ?? dbSong.cifraclubSlug ?? null;
    const isOfficial = dbSong.is_official ?? dbSong.isOfficial ?? false;

    return {
        id: dbSong.id,
        title: dbSong.title,
        artist: dbSong.artist,
        content: dbSong.content,
        originalKey: dbSong.original_key,
        fontSize: dbSong.font_size,
        tabFontSize: dbSong.tab_font_size, // Map NEW column
        lineSpacing: dbSong.line_spacing,
        style: dbSong.style, // Genre/Usage
        functions: dbSong.functions || [], // Array
        tags: dbSong.tags || [], // Array
        youtubeLinks: (dbSong.youtube_links || []).map(link => {
            if (typeof link === 'string') return { title: 'Vídeo', url: link, type: 'youtube' };
            if (link && typeof link === 'object' && link.url) return link;
            return null;
        }).filter(Boolean),
        createdBy: dbSong.created_by, // UUID
        creatorName: creatorName, // Derived Name
        creator: dbSong.creator || null, // Ensure RepertoirePage can access creator.name/email
        duration: dbSong.duration,
        cifraclub_slug: cifraclubSlug,
        cifraclubSlug,
        is_official: isOfficial,
        isOfficial,
        projectionContent: dbSong.projection_content,
        type: dbSong.type || 'chords', // NEW: chords or lyrics

        // NEW PROJECTION FIELDS
        projBgType: dbSong.proj_bg_type || 'global',
        projBgUrl: dbSong.proj_bg_url || '',
        projFontSize: dbSong.proj_font_size || 100,

        views: dbSong.views || 0,
    };
}

/**
 * Search profiles (users) by name/email
 * @param {string} query 
 */
export async function searchProfiles(query) {
    if (!query || query.length < 2) return [];

    const { data, error } = await supabase
        .from('profiles')
        .select('id, name, full_name, email, avatar_url, instrument, available_instruments')
        .or(`name.ilike.%${query}%, full_name.ilike.%${query}%, email.ilike.%${query}%`)
        .limit(10);

    if (error) {
        console.error("Error searching profiles:", error);
        return [];
    }
    return data;
}

// --- USER PREFERENCES (MEU TOM) ---

// --- USER PREFERENCES (GLOBAL) ---

/**
 * Get an app setting by key
 */
export async function getAppSetting(key) {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', key)
            .single();

        if (error) {
            // Se a tabela não existir ainda ou der erro, assume false para n quebrar
            if (error.code === '42P01') return null; 
            throw error;
        }
        return data?.value;
    } catch (err) {
        console.error(`Error fetching app setting ${key}:`, err);
        return null;
    }
}

/**
 * Set an app setting by key
 */
export async function setAppSetting(key, value, description = '') {
    try {
        const { error } = await supabase
            .from('app_settings')
            .upsert({ 
                key, 
                value, 
                description,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
        return true;
    } catch (err) {
        console.error(`Error setting app setting ${key}:`, err);
        throw err;
    }
}

// -------------------------------------------------------------
// REALTIME SUBSCRIPTIONS
// -------------------------------------------------------------

export async function getUserPreferences() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const cacheKey = 'user_global_prefs_' + user.id;

        // Return from cache immediately (1 hour TTL)
        const cached = getFromCache(cacheKey, 60 * 60 * 1000);
        if (cached) {
            // Refresh in background (don't await)
            (async () => {
                try {
                    const { data } = await supabase
                        .from('user_preferences')
                        .select('*')
                        .eq('user_id', user.id)
                        .maybeSingle();
                    if (data) saveToCache(cacheKey, data);
                } catch (e) { /* ignore background errors */ }
            })();
            return cached;
        }

        const { data, error } = await supabase
            .from('user_preferences')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) {
            if (!isAbortError(error)) {
                console.error('Error fetching global preferences:', error);
            }
        }
        if (data) saveToCache(cacheKey, data);
        return data;
    } catch (err) {
        if (!isAbortError(err)) {
            console.error('Unexpected error fetching global preferences:', err);
        }
        return null;
    }
}

export function getUserPreferencesSync(userId) {
    if (!userId) return null;
    const cacheKey = 'user_global_prefs_' + userId;
    return getFromCache(cacheKey, 60 * 60 * 1000);
}

// --- USER PREFERENCES (MEU TOM) ---

// (Moved to bottom of file)

// --- METADATA (Styles & Functions) ---

export async function getMusicalStyles() {
    const { data, error } = await supabase
        .from('musical_styles')
        .select('*')
        .order('name');

    if (error) {
        console.error('Error fetching styles:', error);
        return [];
    }
    return data;
}

export async function addMusicalStyle(name) {
    const { data, error } = await supabase
        .from('musical_styles')
        .insert([{ name }])
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteMusicalStyle(id) {
    const { error } = await supabase
        .from('musical_styles')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

export async function getSongFunctions() {
    const { data, error } = await supabase
        .from('song_functions')
        .select('*')
        .order('name');

    if (error) {
        console.error('Error fetching functions:', error);
        return [];
    }
    return data;
}

export async function addSongFunction(name) {
    const { data, error } = await supabase
        .from('song_functions')
        .insert([{ name }])
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteSongFunction(id) {
    const { error } = await supabase
        .from('song_functions')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

// --- INSTRUMENTS & ROLES METADATA ---

export async function getInstruments() {
    const { data, error } = await supabase
        .from('instrument_metadata')
        .select('*')
        .order('name');
    if (error) {
        console.error('Error fetching instruments:', error);
        return [];
    }
    return data || [];
}

export async function addInstrument(name, type = 'instrument', icon = 'music') {
    const { data, error } = await supabase
        .from('instrument_metadata')
        .insert({ name, type, icon })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteInstrument(id) {
    const { error } = await supabase
        .from('instrument_metadata')
        .delete()
        .eq('id', id);
    if (error) throw error;
    return true;
}

// --- SOCIAL FEATURES (COMMENTS & MEMBERS) ---

/**
 * Get all members of a playlist with their profiles.
 */
export async function getPlaylistMembers(playlistId) {
    const { data, error } = await supabase
        .from('playlist_members')
        .select(`
user_id,
    role,
    status,
    profile: profiles(
        email,
        name,
        avatar_url,
        instrument,
        available_instruments
    )
        `)
        .eq('playlist_id', playlistId);

    if (error) {
        console.error('Error fetching members:', error);
        return [];
    }
    return data;
}

/**
 * Get comments for a playlist.
 */
export async function getPlaylistComments(playlistId) {
    const { data, error } = await supabase
        .from('playlist_comments')
        .select(`
id,
    content,
    created_at,
    user_id,
    profile: profiles(
        email
    )
        `)
        .eq('playlist_id', playlistId)
        .order('created_at', { ascending: true }); // Chat order

    if (error) {
        console.error('Error fetching comments:', error);
        return [];
    }
    return data;
}

/**
 * Add a comment.
 */
export async function addComment(playlistId, content) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not logged in');

    const { data, error } = await supabase
        .from('playlist_comments')
        .insert([{
            playlist_id: playlistId,
            user_id: user.id,
            content
        }])
        .select(`
        *,
        profile: profiles(email)
        `)
        .single();

    if (error) throw error;

    // Send Notifications (Async)
    (async () => {
        try {

            // Get Helper Data
            const [
                { data: playlist },
                { data: members }
            ] = await Promise.all([
                supabase.from('playlists').select('name, owner_id').eq('id', playlistId).single(),
                supabase.from('playlist_members').select('user_id').eq('playlist_id', playlistId).neq('user_id', user.id).eq('status', 'active')
            ]);

            const targets = new Set();

            // Add Members
            if (members && members.length > 0) {
                members.forEach(m => targets.add(m.user_id));
            }

            // Add Owner (if not self and not already in members)
            if (playlist?.owner_id && playlist.owner_id !== user.id) {
                targets.add(playlist.owner_id);
            }

            if (targets.size > 0) {
                const notifications = Array.from(targets).map(targetId => ({
                    user_id: targetId,
                    type: 'message',
                    title: 'Novo comentário',
                    message: `Novo comentário na playlist "${playlist.name}".`,
                    data: { playlistId }
                }));

                const { error: notifError } = await supabase.from('notifications').insert(notifications);

                if (notifError) console.error('Error inserting notifications:', notifError);
            }
        } catch (err) {
            console.error("Error sending comment notification:", err);
        }
    })();

    return data;
}

/**
 * Delete a comment.
 */
export async function deleteComment(commentId) {
    const { error } = await supabase
        .from('playlist_comments')
        .delete()
        .eq('id', commentId);
    if (error) throw error;
}

/**
 * Update a playlist item (e.g. custom transposition).
 */
export async function updatePlaylistItem(itemId, updates) {
    const { error } = await supabase
        .from('playlist_items')
        .update({
            custom_transposition: updates.customTransposition
        })
        .eq('id', itemId);

    if (error) throw error;
}

/**
 * Update basic playlist metadata (name, is_public, is_collaborative).
 * This usually relies on the savePlaylistMetadata function, but we can have a specific lightweight one.
 * Actually, let's just reuse savePlaylistMetadata, but verify it supports ID-based update properly.
 * (Yes, lines 286-294 handle update).
 */


// --- DASHBOARD ANALYTICS ---

/**
 * Increment view count for a song.
 * Should be called when opening a song.
 */
export async function incrementSongView(songId) {
    try {
        const { error } = await supabase.rpc('increment_song_view', { song_id: songId });
        if (error && !isAbortError(error)) console.error("Error incrementing view:", error);
    } catch (err) {
        if (!isAbortError(err)) console.error("Error calling increment RPC:", err);
    }
}

/**
 * Add to user history (Recently Viewed).
 */
export async function addToHistory(songId) {
    if (!songId || String(songId).startsWith('media_block_')) return;
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Upsert history (update timestamp if exists)
        // Note: Check conflict target in DB definition (user_id, song_id)
        const { error } = await supabase
            .from('user_history')
            .upsert({
                user_id: user.id,
                song_id: songId,
                viewed_at: new Date().toISOString()
            }, { onConflict: 'user_id, song_id' });

        if (error && !isAbortError(error)) console.error("Error adding to history:", error);
    } catch (err) {
        if (!isAbortError(err)) console.error("Error adding history:", err);
    }
}

/**
 * Log a specific user activity event.
 * @param {string} eventType - 'login', 'projection', etc.
 * @param {string} targetId - Optional ID of the related object (song, etc.)
 * @param {object} metadata - Optional extra data
 */
export async function logActivity(eventType, targetId = null, metadata = {}) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase.from('user_activity_logs').insert([{
            user_id: user.id,
            event_type: eventType,
            target_id: targetId,
            metadata: metadata
        }]);

        if (error && !isAbortError(error)) {
            console.error(`Error logging activity ${eventType}:`, error);
        }
    } catch (err) {
        if (!isAbortError(err)) {
            console.error(`Exception logging activity ${eventType}:`, err);
        }
    }
}

/**
 * Get most viewed songs.
 */
export async function getMostViewedSongs(limit = 10) {
    const { data, error } = await supabase
        .from('songs')
        .select('*, creator:created_by(email, name)')
        .is('deleted_at', null) // Filter Soft Delete
        .order('views', { ascending: false })
        .limit(limit);

    if (error) {
        if (!isAbortError(error)) {
            console.error("Error fetching most viewed:", error);
        }
        return [];
    }
    return data.map(mapSongFromDb);
}

/**
 * Get user's recently viewed songs.
 */
/**
 * Get user's recently viewed songs.
 */
export async function getUserHistory(limit = 10) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('user_history')
        .select(`
viewed_at,
    song: songs(
                *,
        creator: created_by(email, name)
    )
        `)
        .eq('user_id', user.id)
        .order('viewed_at', { ascending: false })
        .limit(limit);

    if (error) {
        if (!isAbortError(error)) {
            console.error("Error fetching history:", error);
        }
        return [];
    }

    // Flatten structure and filter deleted
    return data
        .filter(item => item.song && !item.song.deleted_at) // Filter deleted songs
        .map(item => ({
            ...mapSongFromDb(item.song),
            viewedAt: item.viewed_at
        })).filter(s => s.id);
}

// --- LIKES & EDITS ---

/**
 * Toggle like status for a song.
 * returns { isLiked: boolean }
 */
export async function toggleLike(songId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { isLiked: false };

    // Check if exists
    const { data, error } = await supabase
        .from('user_likes')
        .select('*')
        .eq('user_id', user.id)
        .eq('song_id', songId)
        .maybeSingle();

    if (data) {
        // Unlike
        await supabase.from('user_likes').delete().eq('id', data.id);
        return { isLiked: false };
    } else {
        // Like
        await supabase.from('user_likes').insert({ user_id: user.id, song_id: songId });
        return { isLiked: true };
    }
}

/**
 * Get user preference for a specific song (transposition, etc).
 * @param {string} songId 
 * @param {string} userId - Optional if already logged in context? Better explicit.
 */
export async function getUserSongPreference(songId, userId) {
    if (!songId || String(songId).startsWith('media_block_')) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user && !userId) return null;
    const uid = userId || user.id;

    const cacheKey = `song_pref_${uid}_${songId}`;

    // Return cache immediately
    const cached = getFromCache(cacheKey);
    if (cached) {
        // Background refresh
        (async () => {
            try {
                const { data } = await supabase
                    .from('user_song_preferences')
                    .select('*')
                    .eq('user_id', uid)
                    .eq('song_id', songId);
                if (data && data.length > 0) saveToCache(cacheKey, data[0]);
            } catch (e) { /* ignore */ }
        })();
        return cached;
    }

    const { data, error } = await supabase
        .from('user_song_preferences')
        .select('*')
        .eq('user_id', uid)
        .eq('song_id', songId);

    if (error || !data || data.length === 0) return null;
    const pref = data[0];
    saveToCache(cacheKey, pref);
    return pref;
}

export function getUserSongPreferenceSync(songId, userId) {
    if (!songId || String(songId).startsWith('media_block_')) return null;
    if (!userId) return null;
    const cacheKey = `song_pref_${userId}_${songId}`;
    return getFromCache(cacheKey);
}

// --- CHURCH SONG RECOMMENDATIONS ---

export async function getChurchSongRecommendation(songId, churchId) {
    if (!songId || !churchId) return null;
    
    const { data, error } = await supabase
        .from('church_song_recommendations')
        .select('transposition')
        .eq('song_id', songId)
        .eq('church_id', churchId)
        .maybeSingle();
        
    if (error) {
        console.error("Error fetching church recommendation:", error);
        return null;
    }
    return data;
}

export async function updateChurchSongRecommendation(songId, churchId, transposition) {
    if (!songId || !churchId) return false;
    
    const { error } = await supabase
        .from('church_song_recommendations')
        .upsert({
            song_id: songId,
            church_id: churchId,
            transposition: transposition,
            updated_at: new Date().toISOString()
        }, { onConflict: 'church_id, song_id' });
        
    if (error) {
        console.error("Error updating church recommendation:", error);
        return false;
    }
    return true;
}

const setlistItemTranspCache = new Map();

export async function getSetlistItemTransposition(itemId) {
    if (!itemId) return null;
    if (setlistItemTranspCache.has(itemId)) {
        return setlistItemTranspCache.get(itemId);
    }
    const { data, error } = await supabase
        .from('setlist_items')
        .select('custom_transposition')
        .eq('id', itemId)
        .maybeSingle();
    
    if (error) {
        console.error("Error fetching setlist item transposition:", error);
        return null;
    }
    const val = data?.custom_transposition ?? 0;
    setlistItemTranspCache.set(itemId, val);
    return val;
}

export function getSetlistItemTranspositionSync(itemId) {
    if (!itemId) return null;
    if (setlistItemTranspCache.has(itemId)) {
        return setlistItemTranspCache.get(itemId);
    }
    return null;
}

/**
 * Get user global preferences (like uploaded media).
 */
export async function getUserGlobalPrefs() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const cacheKey = `user_global_prefs_${user.id}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
        // Background refresh
        (async () => {
            try {
                const { data } = await supabase
                    .from('user_preferences')
                    .select('*')
                    .eq('user_id', user.id)
                    .maybeSingle();
                if (data) saveToCache(cacheKey, data);
            } catch (e) { /* ignore */ }
        })();
        return cached;
    }

    const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error || !data) return null;
    saveToCache(cacheKey, data);
    return data;
}

/**
 * Save user global preferences (like uploaded media).
 * @param {object} updates
 */
export async function saveUserGlobalPrefs(updates) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existing } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

    const merged = {
        user_id: user.id,
        updated_at: new Date().toISOString(),
        ...(existing || {}),
        ...updates
    };

    // Provide the full payload to Supabase
    const { error } = await supabase
        .from('user_preferences')
        .upsert(merged, { onConflict: 'user_id' });

    if (error) console.error('Error saving global pref to DB:', error);

    // Always cache the fully merged object including local-only arrays!
    saveToCache(`user_global_prefs_${user.id}`, merged);
}
/**
 * Save user preference for a song.
 * @param {string} songId 
 * @param {object|number} updates - Object with updates or legacy number (transposition)
 */
export async function saveUserSongPreference(songId, updates) {
    if (!songId || String(songId).startsWith('media_block_')) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Legacy support for when it was just (songId, transposition)
    const payload = typeof updates === 'number'
        ? { transposition: updates }
        : updates;

    // Fetch existing directly (not via cache) to ensure fresh merge base
    const { data: existingArr } = await supabase
        .from('user_song_preferences')
        .select('*')
        .eq('user_id', user.id)
        .eq('song_id', songId);
    const existing = (existingArr && existingArr[0]) || {};
    const { id, created_at, ...cleanExisting } = existing;

    const merged = {
        user_id: user.id,
        song_id: songId,
        updated_at: new Date().toISOString(),
        ...cleanExisting,
        ...payload
    };

    const { error } = await supabase
        .from('user_song_preferences')
        .upsert(merged, { onConflict: 'user_id, song_id' });
    if (error) console.error('Error saving song preference:', error);

    // Update localStorage cache immediately so next open is instant (fixed key without trailing space)
    saveToCache(`song_pref_${user.id}_${songId}`, merged);
}



/**
 * Check if user likes a song.
 */
export async function getSongLikeStatus(songId) {
    if (!songId || String(songId).startsWith('media_block_')) return false;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
        .from('user_likes')
        .select('id')
        .eq('user_id', user.id)
        .eq('song_id', songId)
        .maybeSingle();

    return !!data;
}

/**
 * Get user's liked songs.
 */
export async function getLikedSongs() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('user_likes')
        .select(`
song: songs(
                *,
    creator: created_by(email, name)
)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching likes:", error);
        return [];
    }

    return data
        .filter(item => item.song && !item.song.deleted_at) // Filter deleted songs
        .map(item => mapSongFromDb(item.song)).filter(s => s.id);
}

/**
 * Get user's created/edited songs.
 */
export async function getUserEdits() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('songs')
        .select('*, creator:created_by(email, name, full_name)')
        .eq('created_by', user.id)
        .is('deleted_at', null) // Filter Soft Delete
        .order('updated_at', { ascending: false });

    if (error) {
        console.error("Error fetching user edits:", error);
        return [];
    }

    return data.map(mapSongFromDb);
}

/**
 * Search songs by title or artist.
 * @param {string} query 
 */
export async function searchSongs(query) {
    if (!query) return [];

    const { data, error } = await supabase
        .from('songs')
        .select('*, creator:created_by(email, name, full_name)')
        .or(`title.ilike.%${query}%,artist.ilike.%${query}%`)
        .is('deleted_at', null) // Filter Soft Delete
        .order('title');

    if (error) {
        console.error("Error searching songs:", error);
        return [];
    }

    return data.map(mapSongFromDb);
}

/**
 * Get songs by style.
 * @param {string} style 
 */
export async function getSongsByStyle(style) {
    if (!style) return [];

    const { data, error } = await supabase
        .from('songs')
        .select('*, creator:created_by(email, name)')
        .eq('style', style)
        .is('deleted_at', null) // Filter Soft Delete
        .order('title');

    if (error) {
        console.error("Error fetching songs by style:", error);
        return [];
    }

    return data.map(mapSongFromDb);
}

/**
 * Get songs by function (application).
 * @param {string} funcName 
 */
export async function getSongsByFunction(funcName) {
    if (!funcName) return [];

    const { data, error } = await supabase
        .from('songs')
        .select('*, creator:created_by(email, name)')
        .contains('functions', [funcName])
        .is('deleted_at', null)
        .order('title');

    if (error) {
        console.error("Error fetching songs by function:", error);
        return [];
    }

    return data.map(mapSongFromDb);
}

// --- SETLISTS ---

export async function createSetlist(setlistData) {
    // 1. Create Setlist header
    const { data: setlist, error } = await supabase
        .from('setlists')
        .insert({
            playlist_id: setlistData.playlistId,
            name: setlistData.name,
            description: setlistData.description,
            date: setlistData.date || setlistData.scheduledDate || new Date(),
            is_collaborative: setlistData.isCollaborative || false,
            created_by: (await supabase.auth.getUser()).data.user?.id
        })
        .select()
        .single();

    if (error) throw error;

    // 2. Insert Items
    if (setlistData.items && setlistData.items.length > 0) {
        const itemsPayload = setlistData.items.map(item => ({
            setlist_id: setlist.id,
            song_id: item.songId || null,
            position: item.position,
            usage_type: item.usage_type || item.usage || 'song',
            media_content: item.media_content || null
        }));

        const { error: itemsError } = await supabase
            .from('setlist_items')
            .insert(itemsPayload);

        if (itemsError) throw itemsError;
    }

    if (setlistData.playlist_id) {
        removeFromCache(`setlists_${setlistData.playlist_id}`);
        removeFromCache(`playlist_details_${setlistData.playlist_id}`);
    }

    return setlist;
}

export async function getSetlists(playlistId) {
    if (!playlistId) return [];

    let data, error, response;
    try {
        const query = `
    *,
    items: setlist_items(
        id, position, custom_transposition, usage_type, media_content, proj_bg_type, proj_bg_url, proj_bg_color, proj_font_size, projection_content,
        song: songs(*)
    ),
        scales: setlist_scales(
            id, role,
            user: profiles(id, name, full_name, avatar_url, email, instrument, available_instruments)
        ),
            creator: profiles!setlists_created_by_profile_fkey(
                id, name, full_name, email
            )
            `;

        const primaryResponse = await supabase
            .from('setlists')
            .select(query)
            .eq('playlist_id', playlistId)
            .is('deleted_at', null)
            .order('date', { ascending: true });

        if (primaryResponse.error && (primaryResponse.error.code === '42703')) {
            // Fallback if projection columns missing on setlist_items
            console.warn('[getSetlists] Proj columns missing on setlist_items, using fallback.');
            response = await supabase
                .from('setlists')
                .select(`
                    *,
                    items: setlist_items(
                        id, position, custom_transposition, usage_type, media_content,
                        song: songs(*)
                    ),
                    scales: setlist_scales(
                        id, role,
                        user: profiles(id, name, full_name, avatar_url, email, instrument, available_instruments)
                    ),
                    creator: profiles!setlists_created_by_profile_fkey(
                        id, name, full_name, email
                    )
                `)
                .eq('playlist_id', playlistId)
                .is('deleted_at', null)
                .order('date', { ascending: true });
        } else {
            response = primaryResponse;
        }

        data = response.data;
        error = response.error;

        if (error) throw error;
    } catch (err) {
        console.warn("Network error fetching setlists, trying cache...", err);
        const cached = getFromCache(`setlists_${playlistId}`); // Fixed key
        if (cached) return cached;
        return []; // Fail gracefully
    }

    // Process items order and normalize song data
    const result = data.map(s => ({
        ...s,
        items: s.items?.sort((a, b) => a.position - b.position).map(item => {
            if (item.usage_type === 'media_block') {
                return {
                    ...item,
                    song: {
                        id: `media_block_${item.id || Date.now()}`,
                        title: 'Conteúdo / Mídia',
                        artist: 'Avisos, Ofertas, Interações',
                        isMediaBlock: true,
                        media_content: item.media_content || []
                    }
                };
            }
            const song = item.song ? mapSongFromDb(item.song) : null;
            if (song) {
                if (item.proj_bg_type && item.proj_bg_type !== 'global') song.projBgType = item.proj_bg_type;
                if (item.proj_bg_url) song.projBgUrl = item.proj_bg_url;
                if (item.proj_bg_color) song.projBgColor = item.proj_bg_color;
                if (item.proj_font_size) song.projFontSize = item.proj_font_size;
                if (item.projection_content) song.projectionContent = item.projection_content;
            }

            return {
                ...item,
                transposition: item.custom_transposition || 0,
                song
            };
        })
    }));

    // Cache the result for this playlist
    saveToCache(`setlists_${playlistId}`, result); // Fixed key
    return result;
}

export async function deleteSetlist(setlistId) {
    const { error } = await supabase
        .from('setlists')
        .delete()
        .eq('id', setlistId);

    if (error) throw error;
    return true;
}

// Update setlist settings
export async function updateSetlistSettings(setlistId, settings) {
    const { data, error } = await supabase
        .from('setlists')
        .update({
            proj_bg_type: settings.proj_bg_type,
            proj_bg_url: settings.proj_bg_url,
            proj_bg_color: settings.proj_bg_color,
            timer_bg_type: settings.timer_bg_type,
            timer_bg_url: settings.timer_bg_url,
            timer_bg_color: settings.timer_bg_color,
            updated_at: new Date().toISOString()
        })
        .eq('id', setlistId)
        .select()
        .single();

    if (error) {
        console.error("Error updating setlist settings:", error);
        throw error;
    }

    if (data.playlist_id) {
        removeFromCache(`setlists_${data.playlist_id}`);
        removeFromCache(`playlist_details_${data.playlist_id}`);
    }

    return data;
}

export async function updatePlaylistSettings(playlistId, settings) {
    const { data, error } = await supabase
        .from('playlists')
        .update({
            timer_bg_type: settings.timer_bg_type,
            timer_bg_url: settings.timer_bg_url,
            timer_bg_color: settings.timer_bg_color,
            updated_at: new Date().toISOString()
        })
        .eq('id', playlistId)
        .select()
        .single();
    if (error) {
        console.error("Error updating playlist settings:", error);
    } else {
        removeFromCache(`playlist_details_${playlistId}`);
        removeFromCache(`playlists`);
    }
    return { data, error };
}

export async function updateSetlist(setlistId, setlistData) {
    // 1. Update Header
    const { error: headerError } = await supabase
        .from('setlists')
        .update({
            name: setlistData.name,
            description: setlistData.description,
            date: setlistData.date || setlistData.scheduledDate, // Update date if provided
            is_collaborative: setlistData.isCollaborative // Update collaboration status
        })
        .eq('id', setlistId);

    if (headerError) throw headerError;

    // 2. Update Items (Full Replace Strategy for simplicity and order guarantee)
    // First, delete all existing items
    const { error: deleteError } = await supabase
        .from('setlist_items')
        .delete()
        .eq('setlist_id', setlistId);

    if (deleteError) throw deleteError;

    // Second, insert new items
    if (setlistData.items && setlistData.items.length > 0) {
        const itemsPayload = setlistData.items.map(item => ({
            setlist_id: setlistId,
            song_id: item.songId || null,
            position: item.position,
            usage_type: item.usage_type || item.usage || 'song',
            media_content: item.media_content || null
        }));

        const { error: insertError } = await supabase
            .from('setlist_items')
            .insert(itemsPayload);

        if (insertError) throw insertError;
    }

    if (setlistData.playlist_id) {
        removeFromCache(`setlists_${setlistData.playlist_id} `);
        removeFromCache(`playlist_details_${setlistData.playlist_id} `);
    }

    return true;
}

export async function updateSongOriginalKey(songId, newKey, newContent) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // RLS Policies should handle permission checks (only owner/admin can update)
    const updatePayload = { original_key: newKey };
    if (newContent) updatePayload.content = newContent;

    const { error } = await supabase
        .from('songs')
        .update(updatePayload)
        .eq('id', songId);

    if (error) {
        console.error("Error updating original key:", error);
        return false;
    }

    songMemoryCache.delete(String(songId));
    clearAllListCaches();
    return true;
}


/**
 * Duplicate a setlist (Clone).
 */
export async function duplicateSetlist(setlistId, newName = null) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");

    // 1. Get original
    const { data: original, error: fetchError } = await supabase
        .from('setlists')
        .select('*')
        .eq('id', setlistId)
        .single();

    if (fetchError) throw fetchError;

    // 2. Create new
    const { data: newSetlist, error: createError } = await supabase
        .from('setlists')
        .insert({
            playlist_id: original.playlist_id,
            name: newName || `${original.name} (Cópia)`,
            description: original.description,
            date: original.date,
            is_collaborative: original.is_collaborative,
            created_by: user.id
        })
        .select()
        .single();

    if (createError) throw createError;

    // 3. Copy Items
    const { data: items, error: itemsError } = await supabase
        .from('setlist_items')
        .select('*')
        .eq('setlist_id', setlistId);

    if (itemsError) throw itemsError;

    if (items && items.length > 0) {
        const newItems = items.map(item => ({
            setlist_id: newSetlist.id,
            song_id: item.song_id,
            position: item.position,
            usage_type: item.usage_type
        }));

        const { error: insertError } = await supabase
            .from('setlist_items')
            .insert(newItems);

        if (insertError) throw insertError;
    }

    return newSetlist;
}

/**
 * Create a new setlist from a template (another setlist).
 */
export async function createSetlistFromTemplate(templateId, name, date, playlistId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");

    // 1. Get template
    const { data: template, error: fetchError } = await supabase
        .from('setlists')
        .select('*')
        .eq('id', templateId)
        .single();

    if (fetchError) throw fetchError;

    // 2. Create new
    const { data: newSetlist, error: createError } = await supabase
        .from('setlists')
        .insert({
            playlist_id: playlistId,
            name: name,
            description: template.description, // Optional: copy description?
            date: date,
            is_collaborative: false, // Default to false for new
            created_by: user.id
        })
        .select()
        .single();

    if (createError) throw createError;

    // 3. Copy Items
    const { data: items, error: itemsError } = await supabase
        .from('setlist_items')
        .select('*')
        .eq('setlist_id', templateId);

    if (itemsError) throw itemsError;

    if (items && items.length > 0) {
        const newItems = items.map(item => ({
            setlist_id: newSetlist.id,
            song_id: item.song_id,
            position: item.position,
            usage_type: item.usage_type
        }));

        const { error: insertError } = await supabase
            .from('setlist_items')
            .insert(newItems);

        if (insertError) throw insertError;
    }

    return newSetlist;
}

/**
 * Get System Media (Global Backgrounds).
 * @param {string} type 'image' or 'video'
 */
export async function getSystemMedia(type) {
    const cacheKey = `system_media_${type}`;
    const cached = getFromCache(cacheKey);

    if (cached) {
        // Background refresh
        (async () => {
            try {
                const { data } = await supabase
                    .from('system_media')
                    .select('*')
                    .eq('type', type)
                    .order('created_at', { ascending: false });
                if (data && data.length > 0) saveToCache(cacheKey, data);
            } catch (e) { /* ignore */ }
        })();
        return cached;
    }

    const { data, error } = await supabase
        .from('system_media')
        .select('*')
        .eq('type', type)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching system media:", error);
        return [];
    }

    saveToCache(cacheKey, data);
    return data;
}

/**
 * Helper to delete a file from the Hostinger server.
 */
async function deleteFileFromServer(url) {
    if (!url) return;
    try {
        if (url.includes('supabase.co/storage/v1/object/public/media/')) {
            const urlParts = url.split('/media/');
            if (urlParts.length > 1) {
                const filePath = urlParts[1];
                const { error } = await supabase.storage.from('media').remove([filePath]);
                if (error) console.error("Error deleting from supabase:", error);
            }
        }
    } catch (err) {
        console.error("Failed to delete file from server:", err);
    }
}

/**
 * Cleanup any usage of a specific media URL in songs and setlists.
 */
export async function cleanupMediaUsage(url) {
    if (!url) return;
    try {
        // 1. Clear in songs
        await supabase
            .from('songs')
            .update({ proj_bg_type: 'global', proj_bg_url: null })
            .eq('proj_bg_url', url);

        // 2. Clear in setlist items
        await supabase
            .from('setlist_items')
            .update({ proj_bg_type: 'global', proj_bg_url: null })
            .eq('proj_bg_url', url);

        // 3. Clear in playlist items
        await supabase
            .from('playlist_items')
            .update({ proj_bg_type: 'global', proj_bg_url: null })
            .eq('proj_bg_url', url);

        // 4. Clear in user preferences (global defaults)
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            // We update multiple columns in one go if they match the URL
            // Supabase update doesn't support conditional values per column easily in one call for different matches,
            // but we can check and nullify if they match.
            
            // Check current prefs first to see what to nullify
            const { data: prefs } = await supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle();
            if (prefs) {
                const updates = {};
                if (prefs.proj_default_bg_url === url) {
                    updates.proj_default_bg_url = '';
                    updates.proj_default_bg_type = 'color';
                }
                if (prefs.bible_default_bg_url === url) {
                    updates.bible_default_bg_url = '';
                    updates.bible_default_bg_type = 'color';
                }
                if (prefs.timer_default_bg_url === url) {
                    updates.timer_default_bg_url = '';
                    updates.timer_default_bg_type = 'color';
                }
                if (prefs.church_logo_url === url) {
                    updates.church_logo_url = '';
                }

                if (Object.keys(updates).length > 0) {
                    await supabase.from('user_preferences').update(updates).eq('user_id', user.id);
                }
            }
        }
    } catch (err) {
        console.error("Cleanup media usage failed:", err);
    }
}

/**
 * Delete System Media (Admin only).
 * Includes server file deletion and DB cleanup.
 * @param {string} id 
 */
export async function deleteSystemMedia(id) {
    try {
        // 1. Get the URL first
        const { data: media } = await supabase
            .from('system_media')
            .select('url')
            .eq('id', id)
            .single();

        if (media?.url) {
            // 2. Delete from server
            await deleteFileFromServer(media.url);
            // 3. Cleanup usage in songs/setlists
            await cleanupMediaUsage(media.url);
        }

        // 4. Delete the record
        const { error } = await supabase
            .from('system_media')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // Invalidate caches
        removeFromCache('system_media_image');
        removeFromCache('system_media_video');
        return true;
    } catch (err) {
        console.error("Error in deleteSystemMedia:", err);
        throw err;
    }
}

/**
 * Delete User Media.
 * Includes server file deletion and DB cleanup.
 */
export async function deleteUserMedia(mediaId, url, type) {
    try {
        // 1. Delete from server
        await deleteFileFromServer(url);
        
        // 2. Cleanup usage in songs/setlists
        await cleanupMediaUsage(url);

        // 3. Update User Prefs
        const prefs = await getUserGlobalPrefs();
        if (prefs) {
            const field = type === 'image' ? 'uploaded_images' : 'uploaded_videos';
            const currentArray = prefs[field] || [];
            const newArray = currentArray.filter(m => m.id !== mediaId && m.url !== url);
            await saveUserGlobalPrefs({ [field]: newArray });
        }
        return true;
    } catch (err) {
        console.error("Error in deleteUserMedia:", err);
        return false;
    }
}
