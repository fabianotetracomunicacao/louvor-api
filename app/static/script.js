// Estado da aplicação
let currentCifra = null;
let currentTranspose = 0;
let savedSongs = JSON.parse(localStorage.getItem('savedSongs') || '[]');
let currentSearchQuery = '';
let currentSearchPage = 1;
const prefetchedCifras = new Map();

// Notas musicais para transposição
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    renderSavedSongs();
    
    // Enter para buscar
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchSongs();
        }
    });
});

// Função para buscar músicas
async function searchSongs(page = 1) {
    const inputQuery = document.getElementById('searchInput').value.trim();
    const query = page === 1 ? inputQuery : currentSearchQuery;

    if (!query) {
        alert('Por favor, digite o nome de uma música ou artista.');
        return;
    }

    currentSearchQuery = query;
    currentSearchPage = page;
    if (page === 1) {
        prefetchedCifras.clear();
    }

    const resultsDiv = document.getElementById('searchResults');
    const paginationDiv = document.getElementById('searchPagination');
    resultsDiv.innerHTML = '<div class="loading"></div>';
    paginationDiv.innerHTML = '';

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&page=${page}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Erro HTTP ${response.status}`);
        }

        const results = Array.isArray(data.results) ? data.results : [];
        if (!results.length) {
            resultsDiv.innerHTML = '<p class="empty-message">Nenhum resultado encontrado para sua busca.</p>';
            renderPagination(data.pagination);
            return;
        }

        const safeResults = results.filter(result => {
            const artistSlug = normalizeString(result.artist_slug || result.artistSlug || '');
            const songSlug = normalizeString(result.song_slug || result.songSlug || '');
            return Boolean(artistSlug && songSlug);
        });

        if (!safeResults.length) {
            resultsDiv.innerHTML = '<p class="empty-message">Nenhum resultado válido encontrado para esta busca.</p>';
            renderPagination(data.pagination);
            return;
        }

        prefetchTopResults(safeResults.slice(0, 2));

        resultsDiv.innerHTML = safeResults.map(result => {
            const artistSlug = normalizeString(result.artist_slug || result.artistSlug || '');
            const songSlug = normalizeString(result.song_slug || result.songSlug || '');
            const artistParam = encodeURIComponent(artistSlug);
            const songParam = encodeURIComponent(songSlug);

            return `
                <div class="search-result-item" onclick="loadCifraFromSearch('${artistParam}', '${songParam}')">
                    <h3>${escapeHtml(result.name)}</h3>
                    <p>${escapeHtml(result.artist)}</p>
                </div>
            `;
        }).join('');

        renderPagination(data.pagination);

    } catch (error) {
        console.error('Erro na busca:', error);
        resultsDiv.innerHTML = `<p class="empty-message">Erro ao buscar: ${error.message}</p>`;
    }
}

function renderPagination(pagination) {
    const paginationDiv = document.getElementById('searchPagination');

    if (!pagination || !pagination.total_pages || pagination.total_pages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }

    const prevPage = pagination.page - 1;
    const nextPage = pagination.page + 1;

    paginationDiv.innerHTML = `
        <button onclick="goToSearchPage(${prevPage})" ${pagination.has_prev ? '' : 'disabled'}>Anterior</button>
        <span class="page-info">Página ${pagination.page} de ${pagination.total_pages}</span>
        <button onclick="goToSearchPage(${nextPage})" ${pagination.has_next ? '' : 'disabled'}>Próxima</button>
    `;
}

function goToSearchPage(page) {
    if (page < 1 || page === currentSearchPage) {
        return;
    }
    searchSongs(page);
}

function getCifraPromise(artistSlug, songSlug) {
    const key = `${artistSlug}/${songSlug}`;
    if (prefetchedCifras.has(key)) {
        return prefetchedCifras.get(key);
    }

    const requestPromise = fetch(`/artists/${encodeURIComponent(artistSlug)}/songs/${encodeURIComponent(songSlug)}`)
        .then(async response => {
            const data = await response.json();
            if (!response.ok || data.error) {
                throw new Error(data.error || `Erro HTTP ${response.status}`);
            }
            return data;
        })
        .catch(error => {
            prefetchedCifras.delete(key);
            throw error;
        });

    prefetchedCifras.set(key, requestPromise);
    return requestPromise;
}

function prefetchTopResults(results) {
    for (const result of results) {
        const artistSlug = normalizeString(result.artistSlug || result.artist_slug || '');
        const songSlug = normalizeString(result.songSlug || result.song_slug || '');

        if (!artistSlug || !songSlug) {
            continue;
        }
        if (/^\d+$/.test(songSlug)) {
            continue;
        }

        getCifraPromise(artistSlug, songSlug).catch(() => {});
    }
}

function slugToDisplayName(slug) {
    return (slug || '')
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, char => char.toUpperCase());
}

function showLoadingModal(artistSlug, songSlug) {
    document.getElementById('cifraTitle').textContent = slugToDisplayName(songSlug) || 'Carregando...';
    document.getElementById('cifraArtist').textContent = slugToDisplayName(artistSlug) || 'Carregando...';
    document.getElementById('cifraContent').innerHTML = '<div class="loading"></div>';
    document.getElementById('cifraModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

async function loadCifraFromSearch(artistParam, songParam) {
    const artistSlug = normalizeString(decodeURIComponent(artistParam));
    const songSlug = normalizeString(decodeURIComponent(songParam));
    const resultsDiv = document.getElementById('searchResults');

    if (!artistSlug || !songSlug) {
        resultsDiv.innerHTML = '<p class="empty-message">Resultado inválido para carregamento da cifra.</p>';
        return;
    }

    showLoadingModal(artistSlug, songSlug);

    try {
        const data = await getCifraPromise(artistSlug, songSlug);
        openCifra(data);
    } catch (error) {
        console.error('Erro ao carregar cifra:', error);
        document.getElementById('cifraTitle').textContent = 'Erro ao carregar cifra';
        document.getElementById('cifraArtist').textContent = '';
        document.getElementById('cifraContent').innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    }
}

// Normaliza string para URL
function normalizeString(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}

// Abre o modal com a cifra
function openCifra(data) {
    currentCifra = data;
    currentTranspose = 0;

    document.getElementById('cifraTitle').textContent = data.name || 'Música';
    document.getElementById('cifraArtist').textContent = data.artist || 'Artista';
    
    renderCifra();
    
    document.getElementById('cifraModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Renderiza a cifra formatada
function renderCifra() {
    if (!currentCifra || !currentCifra.cifra) {
        document.getElementById('cifraContent').innerHTML = '<p>Cifra não disponível</p>';
        return;
    }

    let cifraText = currentCifra.cifra.join('\n');
    
    // Aplica transposição se necessário
    if (currentTranspose !== 0) {
        cifraText = transposeCifra(cifraText, currentTranspose);
    }

    // Formata com HTML
    const formattedCifra = formatCifra(cifraText);
    document.getElementById('cifraContent').innerHTML = formattedCifra;
}

// Formata a cifra com HTML
function formatCifra(text) {
    const lines = text.split('\n');
    let result = [];

    for (let line of lines) {
        // Seções como [Intro], [Refrão], etc.
        if (line.match(/^\[.+\]/)) {
            result.push(`<span class="section">${escapeHtml(line)}</span>`);
        }
        // Linhas de acordes (contém padrões de acordes)
        else if (line.match(/[A-G][#b]?[0-9]*(\/[A-G][#b]?[0-9]*)?/)) {
            result.push(`<span class="chord-line">${escapeHtml(line)}</span>`);
        }
        // Linhas de tablatura (contém | ou números em sequência)
        else if (line.match(/\|/)) {
            result.push(`<span class="tab-line">${escapeHtml(line)}</span>`);
        }
        // Linhas vazias
        else if (line.trim() === '') {
            result.push('<br>');
        }
        // Texto normal (letra da música)
        else {
            result.push(escapeHtml(line));
        }
    }

    return result.join('\n');
}

// Escapa HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Transposição de acordes
function transposeCifra(text, semitones) {
    const chordRegex = /([A-G])([#b]?)([^\/\s]*)?(\/([A-G])([#b]?))?/g;
    
    return text.replace(chordRegex, (match, root1, acc1, rest1, slashPart, root2, acc2) => {
        let newRoot1 = transposeNote(root1 + acc1, semitones);
        let newRoot2 = root2 ? transposeNote(root2 + acc2, semitones) : '';
        
        if (slashPart) {
            return `${newRoot1}${rest1 || ''}/${newRoot2}`;
        }
        return `${newRoot1}${rest1 || ''}`;
    });
}

// Transpõe uma nota específica
function transposeNote(note, semitones) {
    // Normaliza para sustenido
    let normalizedNote = note;
    for (let [sharp, flat] of Object.entries(FLAT_NOTES)) {
        if (note === flat) {
            normalizedNote = sharp;
            break;
        }
    }

    const index = NOTES.indexOf(normalizedNote);
    if (index === -1) return note;

    let newIndex = (index + semitones) % 12;
    if (newIndex < 0) newIndex += 12;

    return NOTES[newIndex];
}

// Função de transposição
function transpose(semitones) {
    currentTranspose += semitones;
    renderCifra();
}

// Fecha o modal
function closeModal() {
    document.getElementById('cifraModal').classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Salva a música
function saveSong() {
    if (!currentCifra) return;

    const songId = `${currentCifra.artist}-${currentCifra.name}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    // Verifica se já está salva
    const exists = savedSongs.find(s => s.id === songId);
    if (exists) {
        alert('Esta música já está salva na sua lista!');
        return;
    }

    savedSongs.push({
        id: songId,
        name: currentCifra.name,
        artist: currentCifra.artist,
        cifra: currentCifra.cifra,
        youtube_url: currentCifra.youtube_url,
        cifraclub_url: currentCifra.cifraclub_url,
        savedAt: new Date().toISOString()
    });

    localStorage.setItem('savedSongs', JSON.stringify(savedSongs));
    renderSavedSongs();
    alert('Música salva com sucesso!');
}

// Renderiza as músicas salvas
function renderSavedSongs() {
    const container = document.getElementById('savedSongsList');
    
    if (savedSongs.length === 0) {
        container.innerHTML = '<p class="empty-message">Nenhum louvor salvo ainda. Busque uma música acima para começar!</p>';
        return;
    }

    container.innerHTML = savedSongs.map(song => `
        <div class="saved-song-card" onclick="openSavedSong('${song.id}')">
            <button class="delete-btn" onclick="event.stopPropagation(); deleteSong('${song.id}')" title="Remover">✕</button>
            <h3>${escapeHtml(song.name)}</h3>
            <p>${escapeHtml(song.artist)}</p>
        </div>
    `).join('');
}

// Abre uma música salva
function openSavedSong(songId) {
    const song = savedSongs.find(s => s.id === songId);
    if (!song) return;

    currentCifra = {
        name: song.name,
        artist: song.artist,
        cifra: song.cifra,
        youtube_url: song.youtube_url,
        cifraclub_url: song.cifraclub_url
    };
    currentTranspose = 0;

    document.getElementById('cifraTitle').textContent = song.name;
    document.getElementById('cifraArtist').textContent = song.artist;
    
    renderCifra();
    
    document.getElementById('cifraModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Deleta uma música salva
function deleteSong(songId) {
    if (!confirm('Deseja remover esta música da lista?')) return;

    savedSongs = savedSongs.filter(s => s.id !== songId);
    localStorage.setItem('savedSongs', JSON.stringify(savedSongs));
    renderSavedSongs();
}

// Fecha o modal ao clicar fora
document.getElementById('cifraModal').addEventListener('click', (e) => {
    if (e.target.id === 'cifraModal') {
        closeModal();
    }
});

// Fecha o modal com ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
    }
});
