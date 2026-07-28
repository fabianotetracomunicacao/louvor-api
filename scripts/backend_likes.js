
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
        .single();

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
 * Check if user likes a song.
 */
export async function getSongLikeStatus(songId) {
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
            song:songs (
                *,
                creator:created_by(email, name)
            )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching likes:", error);
        return [];
    }

    return data.map(item => mapSongFromDb(item.song)).filter(s => s.id);
}

/**
 * Get user's created/edited songs.
 */
export async function getUserEdits() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('songs')
        .select('*, creator:created_by(email, name)')
        .eq('created_by', user.id)
        .order('updated_at', { ascending: false });

    if (error) {
        console.error("Error fetching user edits:", error);
        return [];
    }

    return data.map(mapSongFromDb);
}
