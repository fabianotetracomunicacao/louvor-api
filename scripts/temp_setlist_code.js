
// --- SETLISTS ---

export async function createSetlist(setlistData) {
    // 1. Create Setlist header
    const { data: setlist, error } = await supabase
        .from('setlists')
        .insert({
            playlist_id: setlistData.playlistId,
            name: setlistData.name,
            date: setlistData.date || new Date(),
            created_by: (await supabase.auth.getUser()).data.user?.id
        })
        .select()
        .single();

    if (error) throw error;

    // 2. Insert Items
    if (setlistData.items && setlistData.items.length > 0) {
        const itemsPayload = setlistData.items.map(item => ({
            setlist_id: setlist.id,
            song_id: item.songId,
            position: item.position,
            usage_type: item.usage
        }));

        const { error: itemsError } = await supabase
            .from('setlist_items')
            .insert(itemsPayload);

        if (itemsError) throw itemsError;
    }

    return setlist;
}

export async function getSetlists(playlistId) {
    const { data, error } = await supabase
        .from('setlists')
        .select(`
            *,
            items:setlist_items(
                id, position, usage_type,
                song:songs(id, title, artist)
            )
        `)
        .eq('playlist_id', playlistId)
        .order('created_at', { ascending: false });

    if (error) throw error;

    // Process items order
    return data.map(s => ({
        ...s,
        items: s.items?.sort((a, b) => a.position - b.position)
    }));
}
