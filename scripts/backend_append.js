
// --- DASHBOARD ANALYTICS ---

/**
 * Increment view count for a song.
 * Should be called when opening a song.
 */
export async function incrementSongView(songId) {
    try {
        const { error } = await supabase.rpc('increment_song_view', { song_id: songId });
        if (error) console.error("Error incrementing view:", error);
    } catch (err) {
        console.error("Error calling increment RPC:", err);
    }
}

/**
 * Add to user history (Recently Viewed).
 */
export async function addToHistory(songId) {
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

        if (error) console.error("Error adding to history:", error);
    } catch (err) {
        console.error("Error adding history:", err);
    }
}

/**
 * Get most viewed songs.
 */
export async function getMostViewedSongs(limit = 10) {
    const { data, error } = await supabase
        .from('songs')
        .select('*, creator:created_by(email, name)')
        .order('views', { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Error fetching most viewed:", error);
        return [];
    }
    return data.map(mapSongFromDb);
}

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
            song:songs (
                *,
                creator:created_by(email, name)
            )
        `)
        .eq('user_id', user.id)
        .order('viewed_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Error fetching history:", error);
        return [];
    }

    // Flatten structure
    return data.map(item => ({
        ...mapSongFromDb(item.song),
        viewedAt: item.viewed_at
    })).filter(s => s.id); // Filter out nulls if song deleted
}
