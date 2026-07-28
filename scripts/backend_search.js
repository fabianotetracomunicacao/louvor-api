
/**
 * Search songs by title or artist.
 * @param {string} query 
 */
export async function searchSongs(query) {
    if (!query) return [];

    const { data, error } = await supabase
        .from('songs')
        .select('*, creator:created_by(email, name)')
        .or(`title.ilike.%${query}%,artist.ilike.%${query}%`)
        .order('title');

    if (error) {
        console.error("Error searching songs:", error);
        return [];
    }

    return data.map(mapSongFromDb);
}
