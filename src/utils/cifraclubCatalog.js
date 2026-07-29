export function normalizeCatalogTitle(title) {
    return String(title || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getVersionPriority(song) {
    return [
        song.version_verified === true ? 1 : 0,
        song.version_label?.trim().toLowerCase() === 'principal' ? 1 : 0,
        song.version_tone?.trim() ? 1 : 0,
    ];
}

export function rankCatalogVersions(left, right) {
    const leftPriority = getVersionPriority(left);
    const rightPriority = getVersionPriority(right);

    for (let index = 0; index < leftPriority.length; index += 1) {
        if (leftPriority[index] !== rightPriority[index]) {
            return rightPriority[index] - leftPriority[index];
        }
    }

    if (left.originalIndex !== right.originalIndex) {
        return left.originalIndex - right.originalIndex;
    }

    return left.song_slug.localeCompare(right.song_slug);
}

export function groupCatalogSongs(songs) {
    const groupsByTitle = new Map();

    (Array.isArray(songs) ? songs : []).forEach((song, originalIndex) => {
        if (
            !song
            || typeof song.name !== 'string'
            || typeof song.song_slug !== 'string'
            || !song.song_slug.trim()
        ) {
            return;
        }

        const key = normalizeCatalogTitle(song.name);
        if (!key) return;

        const version = { ...song, originalIndex };
        const group = groupsByTitle.get(key);

        if (group) {
            group.versions.push(version);
            return;
        }

        groupsByTitle.set(key, {
            key,
            title: song.name.trim(),
            versions: [version],
        });
    });

    return [...groupsByTitle.values()].map((group) => {
        const versions = [...group.versions].sort(rankCatalogVersions);
        return {
            ...group,
            preferred: versions[0],
            versions,
        };
    });
}

export function getInitialCatalogSelection(groups) {
    return new Set(
        (Array.isArray(groups) ? groups : [])
            .map((group) => group?.preferred?.song_slug)
            .filter(Boolean),
    );
}
